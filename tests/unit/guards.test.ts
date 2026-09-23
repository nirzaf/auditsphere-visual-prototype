// VP-063 unit: guards + store commands (AT-11/12/18/24/28/31/32/47/54).
// Same-person, scope, hierarchy, allocation and stale-revision rules share one
// implementation between UI actions and tests.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../../src/store/initialState.js';
import { visibleClientIds, visibleEngagementIds, GuardError } from '../../src/services/guards.js';
import { validateFixtures, migratePersistedState } from '../../src/services/migrations.js';
import type { PrototypeState } from '../../src/types/index.js';
import { seedPackageDefinition } from './packageFixture.js';

let state: PrototypeState;
beforeEach(() => { state = createInitialState(); });

function setPersona(state: PrototypeState, name: string) {
  const matches = state.users.filter(u => u.name === name);
  const user = matches.find(u => u.id === state.currentUserId) || matches.find(u => u.role === state.currentRole) || matches[0];
  state.currentUserId = user?.id || '';
  state.currentPerson = name;
  if (user) state.currentRole = user.role;
}
function addAmiraManagerPersona(state: PrototypeState) {
  const user = state.users.find(u => u.id === 'relationship')!;
  state.users.push({ ...user, id: 'amira-manager', role: 'manager', label: 'Engagement manager' });
  state.roleGrants.push({ userId: 'amira-manager', role: 'manager', scopeKind: 'Global' });
  state.currentUserId = 'amira-manager';
  state.currentPerson = user.name;
  state.currentRole = 'manager';
}

describe('scope guards (AT-18)', () => {
  it('global manager sees all; narrow group user sees one engagement only', () => {
    setPersona(state, 'Layla Rahman');
    assert.equal(visibleEngagementIds(state), 'ALL');
    setPersona(state, 'Mona Khalil');
    const engs = visibleEngagementIds(state);
    assert.deepEqual(engs, ['ENG-26001']);
    const clients = visibleClientIds(state, 'group-user');
    assert.deepEqual(clients, ['CL-001']);
  });

  it('sibling engagement ENG-26003 is hidden from the narrow ENG-26001 grant', () => {
    setPersona(state, 'Mona Khalil');
    const engs = visibleEngagementIds(state) as string[];
    assert.equal(engs.includes('ENG-26003'), false);
  });

  it('client identity with two grants sees both entities', () => {
    const clients = visibleClientIds(state, 'client_admin');
    assert.deepEqual([...(clients as string[])].sort(), ['CL-001', 'CL-003']);
  });
});

describe('fixture integrity (AT-02/54)', () => {
  it('seed fixtures pass integrity with no broken references', () => {
    const issues = validateFixtures(state);
    assert.deepEqual(issues, []);
  });

  it('rejects inline binary payloads in persisted state', () => {
    (state as any).notes = 'data:image/png;base64,iVBORw0KGgo=';
    const issues = validateFixtures(state);
    assert.equal(issues.some(i => i.code === 'PERSISTENCE_BINARY'), true);
  });

  it('migrates legacy payloads deterministically and preserves history', () => {
    const legacy = { schema: 2, engagements: state.engagements, asOfDate: '2026-09-23' };
    const { state: migrated, migratedFrom, warnings } = migratePersistedState(legacy, createInitialState());
    assert.equal(migratedFrom, 2);
    assert.equal(migrated.engagements.length > 0, true);
    assert.equal(warnings.length > 0, true);
    assert.equal(migrated.schema, 8);
  });
  it('upgrades each persisted schema revision through current v8 without losing histories', () => {
    const seed = createInitialState();
    for (let version = 0; version <= 8; version++) {
      const legacy = structuredClone(seed) as any;
      legacy.schema = version;
      if (version < 6) delete legacy.m365Config.permittedUsers;
      if (version < 7) legacy.engagements.forEach((e: any) => delete e.sourceHistory);
      if (version < 8) legacy.engagements.forEach((e: any) => delete e.packageHistory);
      const { state: migrated } = migratePersistedState(legacy, createInitialState());
      assert.equal(migrated.schema, 8, `schema ${version} should reach v8`);
      assert.equal(migrated.engagements[0].id, seed.engagements[0].id);
      assert.deepEqual(migrated.engagements[0].pbc.map(p => p.id), seed.engagements[0].pbc.map(p => p.id));
      assert.deepEqual(migrated.engagements[0].reviews.map(r => r.id), seed.engagements[0].reviews.map(r => r.id));
      assert.deepEqual(migrated.engagements[0].releases.map(r => r.id), seed.engagements[0].releases.map(r => r.id));
      assert.ok(migrated.engagements.every(e => Array.isArray(e.sourceHistory) && Array.isArray(e.packageHistory)));
      assert.ok(Array.isArray(migrated.m365Config.permittedUsers));
    }
  });
});

describe('client rules (AT-05)', () => {
  it('duplicate normalized client codes are rejected', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Amira Qasim');
    assert.throws(
      () => prototypeStore.addClient({ id: 'CL-X', code: 'exp-trad', name: 'Dup', initials: 'D', industry: 'x', contact: 'c', jurisdiction: 'Q', status: 'Active', risk: 'Low', revenue: 1, relationshipOwner: 'Amira Qasim' }),
      /Duplicate client code/
    );
  });
});

describe('task hierarchy (AT-11)', () => {
  it('rejects second nesting levels and cross-job parents', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Layla Rahman');
    assert.throws(
      () => prototypeStore.addTask({ id: 'T-DEEP', jobId: 'JOB-2601', parentTaskId: 'TSK-103-1', title: 'Too deep', assignee: 'Adam Khan', status: 'Not started', order: 9 }),
      /one level/
    );
    assert.throws(
      () => prototypeStore.addTask({ id: 'T-XJOB', jobId: 'JOB-2602', parentTaskId: 'TSK-101', title: 'Cross job', assignee: 'Adam Khan', status: 'Not started', order: 9 }),
      /Cross-job/
    );
  });

  it('blocks completing a parent with unfinished children', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Layla Rahman');
    const parent = (prototypeStore as any).state.jobTasks.find((t: any) => t.id === 'TSK-103');
    assert.throws(
      () => prototypeStore.updateTask({ ...parent, status: 'Completed' }),
      /unfinished/
    );
  });
});

describe('separation of duties (AT-24/31/47)', () => {
  it('a person cannot approve their own proposal, time, workpaper or review point', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const { GuardError: GE } = await import('../../src/services/guards.js');
    (prototypeStore as any).state = createInitialState();
    // Proposal prepared by Amira → Amira cannot approve even as manager label.
    setPersona((prototypeStore as any).state, 'Amira Qasim');
    assert.throws(() => prototypeStore.reviewProposal('PROP-001', true), (e: any) => e instanceof GE || /Separation of duties/.test(e.message));
    // Own time entry.
    setPersona((prototypeStore as any).state, 'Adam Khan');
    (prototypeStore as any).state.times.find((t: any) => t.id === 'TIME-01').status = 'Submitted';
    assert.throws(() => prototypeStore.reviewTimeEntry('TIME-01', 'Approved'), /own time/);
  });

  it('GuardError carries machine-readable codes', () => {
    const e = new GuardError('SELF_APPROVAL', 'x');
    assert.equal(e.code, 'SELF_APPROVAL');
  });
});

describe('time correction lifecycle (AT-28)', () => {
  it('returns, resubmits, approves and corrects time without overwriting prior revisions', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    const storeState = (prototypeStore as any).state;
    setPersona(storeState, 'Adam Khan');
    const entry = storeState.times.find((t: any) => t.id === 'TIME-01');
    entry.status = 'Submitted';
    setPersona(storeState, 'Layla Rahman');
    prototypeStore.reviewTimeEntry(entry.id, 'Returned', 'Correct task detail');
    setPersona(storeState, 'Adam Khan');
    prototypeStore.resubmitReturnedTime(entry.id, { taskTitle: entry.taskTitle, durationMinutes: 75, activity: entry.activity, narrative: 'Corrected detail', billable: entry.billable });
    const firstRevision = storeState.times.find((t: any) => t.supersedesId === entry.id);
    assert.equal(entry.status, 'Superseded');
    assert.equal(firstRevision.status, 'Submitted');
    assert.equal(firstRevision.durationMinutes, 75);
    setPersona(storeState, 'Layla Rahman');
    prototypeStore.reviewTimeEntry(firstRevision.id, 'Approved');
    prototypeStore.correctApprovedTime(firstRevision.id, 60, 'Timer rounding correction');
    const correction = storeState.times.find((t: any) => t.supersedesId === firstRevision.id);
    assert.equal(firstRevision.status, 'Superseded');
    assert.equal(correction.status, 'Submitted');
    assert.equal(correction.durationMinutes, 60);
    prototypeStore.reviewTimeEntry(correction.id, 'Approved');
    assert.equal(correction.status, 'Approved');
    assert.equal(storeState.times.filter((t: any) => t.status === 'Approved' && (t.id === correction.id || t.supersedesId)).reduce((sum: number, t: any) => sum + t.durationMinutes, 0), 60);
  });
});

describe('evidence adequacy (AT-20/46)', () => {
  it('persists attributable adequacy and requires rationale for deficiency', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Sara Malik');
    assert.throws(
      () => prototypeStore.setEvidenceAdequacy('EVD-01', 'Deficient', ''),
      /rationale/
    );
    prototypeStore.setEvidenceAdequacy('EVD-01', 'Deficient', 'Bank confirmation missing signature page');
    const ev = (prototypeStore as any).state.evidenceCatalogue.find((e: any) => e.id === 'EVD-01');
    assert.equal(ev.adequacyStatus, 'Deficient');
    prototypeStore.setEvidenceAdequacy('EVD-01', 'Adequate');
    assert.equal(
      (prototypeStore as any).state.evidenceCatalogue.find((e: any) => e.id === 'EVD-01').adequacyStatus,
      'Adequate'
    );
  });
});

describe('money guards (AT-30/31/32)', () => {
  it('rejects over-allocation and cross-client allocation atomically', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Leila Hassan');
    assert.throws(() => prototypeStore.allocateReceipt('RCPT-02', 'INV-26002', 999999), /unallocated/);
    assert.throws(() => prototypeStore.allocateReceipt('RCPT-02', 'INV-26003', 10), /Cross-client/);
  });

  it('credits cannot exceed the remaining creditable amount', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Leila Hassan');
    assert.throws(
      () => prototypeStore.addCreditNote({ id: 'C-X', invoiceId: 'INV-26002', clientId: 'CL-001', creditNumber: 'CRN-X', amount: 999999, reason: 'too big', status: 'Issued', issueDate: '2026-09-23', preparedBy: 'Leila Hassan' }),
      /remaining creditable/
    );
  });

  // Isolated Acceptance Reproductions (EX13 - EX18)
  it('EX13: Proposal prevents self approval', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    // PROP-001 preparedBy: 'Amira Qasim'
    addAmiraManagerPersona((prototypeStore as any).state);
    assert.throws(
      () => prototypeStore.reviewProposal('PROP-001', true),
      /commercially approve/
    );
  });

  it('EX14: Client contributor cannot record partner decision', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Rami Nasser');
    (prototypeStore as any).state.currentRole = 'client_finance';
    assert.throws(
      () => prototypeStore.recordApproval('ENG-26001', 'partner'),
      /Only a partner/
    );
  });

  it('EX15: Allocation rejects wrong client/currency/draft invoice', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Leila Hassan');
    (prototypeStore as any).state.currentRole = 'billing';
    // Create draft invoice with same client as RCPT-02
    const rcpt = (prototypeStore as any).state.receipts.find((r: any) => r.id === 'RCPT-02');
    const draftInv = {
      id: 'INV-DRAFT-X', clientId: rcpt.clientId, invoiceNumber: 'INV-DRAFT', amount: 500, paid: 0, currency: 'QAR', status: 'Draft', due: '2026-10-01', lines: []
    };
    (prototypeStore as any).state.invoices.push(draftInv);
    assert.throws(
      () => prototypeStore.allocateReceipt('RCPT-02', draftInv.id, 100),
      /Only issued invoices/
    );
    // Cross client
    assert.throws(
      () => prototypeStore.allocateReceipt('RCPT-02', 'INV-26003', 10),
      /Cross-client/
    );
  });

  it('EX16: Allocation rejects negative amount', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Leila Hassan');
    (prototypeStore as any).state.currentRole = 'billing';
    assert.throws(
      () => prototypeStore.allocateReceipt('RCPT-02', 'INV-26002', -100),
      /positive/
    );
  });

  it('EX17: Allocation rejects amount above invoice outstanding', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Leila Hassan');
    (prototypeStore as any).state.currentRole = 'billing';
    // INV-26002 amount is 85000 QAR
    assert.throws(
      () => prototypeStore.allocateReceipt('RCPT-02', 'INV-26002', 90000),
      /exceeds/
    );
  });

  it('EX18 positive control: rejects exceeding receipt funds', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Leila Hassan');
    (prototypeStore as any).state.currentRole = 'billing';
    const rcpt = (prototypeStore as any).state.receipts.find((r: any) => r.id === 'RCPT-02');
    const unallocated = rcpt.amount - (rcpt.allocatedAmount || 0);
    assert.throws(
      () => prototypeStore.allocateReceipt('RCPT-02', 'INV-26002', unallocated + 1000),
      /exceeds available unallocated/
    );
  });
});

describe('prototype workflow guards & lifecycle (F03, F04, F05, F06, F13)', () => {
  it('EQR sign-off blocked when unresolved EQR concerns exist (VP-056 / F03)', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Dr. Tariq Al-Sayed');
    (prototypeStore as any).state.currentRole = 'eqr';

    const eng = (prototypeStore as any).state.engagements[0];
    eng.eqrConcerns = [
      { id: 'EQR-99', text: 'Unresolved going concern inquiry', resolved: false, raisedBy: 'Layla Rahman', raisedAt: new Date().toISOString() }
    ];

    assert.throws(
      () => prototypeStore.recordApproval(eng.id, 'eqr', 'Signoff attempt'),
      /Unresolved EQR concerns/
    );

    // An independent manager responds; the EQR then reviews the response.
    const manager = (prototypeStore as any).state.users.find((u: any) => u.role === 'manager' && u.name !== 'Layla Rahman');
    assert.ok(manager);
    (prototypeStore as any).state.currentUserId = manager.id;
    (prototypeStore as any).state.currentPerson = manager.name;
    (prototypeStore as any).state.currentRole = manager.role;
    prototypeStore.respondEqrConcern(eng.id, 'EQR-99', 'Reviewed against the updated going concern forecast.');
    setPersona((prototypeStore as any).state, 'Dr. Tariq Al-Sayed');
    prototypeStore.toggleEqrConcern(eng.id, 'EQR-99');
    assert.strictEqual(eng.eqrConcerns[0].resolved, true);
    prototypeStore.recordApproval(eng.id, 'eqr', 'Cleared after resolution');
    assert.ok(eng.approvals.eqr);
  });

  it('acceptance recommendation stays pending until the assigned independent partner decides', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const current = createInitialState();
    (prototypeStore as any).state = current;
    const eng = current.engagements[0];
    eng.acceptance = false;
    setPersona(current, 'Hana Ali');
    prototypeStore.saveAcceptanceCase({
      id: `ACC-${eng.client}-${eng.year}`, clientId: eng.client, year: eng.year, service: eng.service,
      riskRating: 'Low', independenceConfirmed: true, amlKycCompleted: true, conflictsCleared: true,
      prohibitionsChecked: true, competenceConfirmed: true, conditions: [], recommendationBy: '',
      recommendationDate: '', recommendationNotes: 'Checks reviewed; recommend acceptance.', decisionStatus: 'Accepted'
    });
    assert.equal(prototypeStore.getSnapshot().acceptanceCases?.[0].decisionStatus, 'Pending');
    setPersona(current, 'Daniel James');
    prototypeStore.decideAcceptanceCase(`ACC-${eng.client}-${eng.year}`, 'Accepted', 'Accepted after independent review.');
    assert.equal(eng.acceptance, true);
    assert.deepEqual(prototypeStore.getSnapshot().acceptanceCases?.[0].history?.map(item => item.action), ['recommendation', 'decision']);
  });

  it('audit plans retain revisions and require a different reviewer', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const current = createInitialState();
    (prototypeStore as any).state = current;
    const eng = current.engagements[0];
    const plan = (version: number) => ({
      id: `PLAN-${eng.id}-V${version}`, engagementId: eng.id, version, status: 'Under review' as const,
      benchmark: 'revenue', benchmarkValue: 2_000_000, materialityRate: 1.5, overallMateriality: 30_000,
      performanceMateriality: 22_500, clearlyTrivialThreshold: 1_500, rationales: ['Revenue is the selected benchmark.'],
      teamAllocations: [], timingMilestones: [], significantAreas: []
    });
    setPersona(current, 'Layla Rahman');
    prototypeStore.saveAuditPlan(plan(1));
    assert.equal(eng.planning, false);
    assert.throws(() => prototypeStore.reviewAuditPlan(`PLAN-${eng.id}-V1`, true, 'Reviewed.'), /same person/);
    setPersona(current, 'Sara Malik');
    prototypeStore.reviewAuditPlan(`PLAN-${eng.id}-V1`, true, 'Reviewed and approved.');
    assert.equal(eng.planning, true);
    setPersona(current, 'Layla Rahman');
    prototypeStore.saveAuditPlan(plan(2));
    assert.deepEqual(prototypeStore.getSnapshot().auditPlans?.map(p => p.status), ['Superseded', 'Under review']);
    assert.equal(eng.planning, false);
  });

  it('Job template lifecycle: draft templates cannot be instantiated; publishing allows (VP-015 / F06)', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Layla Rahman');
    (prototypeStore as any).state.currentRole = 'manager';

    const draftTpl = {
      id: 'TPL-TEST-DRAFT',
      name: 'Unpublished Draft Template',
      service: 'Statutory Audit',
      description: 'Test template',
      defaultJobTitle: 'Test Job',
      status: 'Draft' as const,
      revision: 1,
      tasks: [{ title: 'Phase 1', subtasks: ['Subtask 1'] }]
    };

    prototypeStore.addJobTemplate(draftTpl);

    assert.throws(
      () => prototypeStore.applyJobTemplate(draftTpl.id, 'ENG-26001', 'Test Job', '2026-10-31', 'Layla Rahman'),
      /Only Published templates/
    );

    // Publish template
    prototypeStore.publishJobTemplate(draftTpl.id);
    const beforeCount = (prototypeStore as any).state.jobs.length;
    prototypeStore.applyJobTemplate(draftTpl.id, 'ENG-26001', 'Test Job', '2026-10-31', 'Layla Rahman');
    assert.strictEqual((prototypeStore as any).state.jobs.length, beforeCount + 1);

    // Retire template
    prototypeStore.retireJobTemplate(draftTpl.id);
    assert.throws(
      () => prototypeStore.applyJobTemplate(draftTpl.id, 'ENG-26001', 'Another Job', '2026-10-31', 'Layla Rahman'),
      /Only Published templates/
    );
  });

  it('Workpaper version replacement invalidates clearance and resets status (VP-050 / F05)', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    const eng = (prototypeStore as any).state.engagements[0];
    const wp = eng.workpapers[0];

    // Mark cleared
    wp.status = 'Cleared';
    wp.clearance = {
      clearedBy: 'Sara Malik',
      clearedAt: new Date().toISOString(),
      sourceVersion: 1,
      generation: 1,
      version: wp.version,
      notes: 'Initial clearance'
    };

    setPersona((prototypeStore as any).state, 'Adam Khan');
    (prototypeStore as any).state.currentRole = 'preparer';

    const oldVersion = wp.version;
    prototypeStore.replaceWorkpaperRevision(eng.id, wp.id, {
      name: `${wp.id}_Revision2.xlsx`, size: 10, sha256: 'a'.repeat(64)
    });

    assert.strictEqual(wp.version, oldVersion + 1);
    assert.strictEqual(wp.status, 'In progress');
    assert.strictEqual(wp.clearance, null);
    assert.ok(wp.clearanceHistory.length > 0);
  });

  it('PBC response upload sets status to Received (not Accepted) and registers document (VP-023 / F05)', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Omar Nasser');
    (prototypeStore as any).state.currentRole = 'client';

    const eng = (prototypeStore as any).state.engagements[0];
    const req = eng.pbc[0];

    prototypeStore.uploadPbcResponse(eng.id, req.id, { name: 'Bank_Statement_Q4.pdf', size: 102400 });

    assert.strictEqual(req.status, 'Received');
    assert.notStrictEqual(req.status, 'Accepted');

    const uploadedDoc = (prototypeStore as any).state.documents.find((d: any) => d.linkedPbcId === req.id);
    assert.ok(uploadedDoc);
    assert.strictEqual(uploadedDoc.visibility, 'Client shared');

    setPersona((prototypeStore as any).state, 'Layla Rahman');
    (prototypeStore as any).state.currentRole = 'manager';
    assert.throws(() => prototypeStore.requestPbcClarification(eng.id, req.id, '  '), /Clarification details are required/);
    prototypeStore.requestPbcClarification(eng.id, req.id, 'Please provide a signed final statement.');
    assert.strictEqual(req.status, 'Needs clarification');
    setPersona((prototypeStore as any).state, 'Omar Nasser');
    (prototypeStore as any).state.currentRole = 'client';
    prototypeStore.uploadPbcResponse(eng.id, req.id, { name: 'Bank_Statement_Q4_v2.pdf', size: 2048 });
    assert.strictEqual(req.status, 'Received');
    setPersona((prototypeStore as any).state, 'Layla Rahman');
    (prototypeStore as any).state.currentRole = 'manager';
    prototypeStore.acceptPbcResponse(eng.id, req.id);
    assert.strictEqual(req.status, 'Accepted');
    assert.deepEqual(req.sharedFiles?.map((file: any) => file.version), [1, 2]);
    assert.ok(req.thread?.some((message: any) => message.kind === 'clarification' && message.clientVisible));
  });

  it('Re-open release for amendment preserves predecessor and lineage (VP-058 / F04)', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Daniel James');
    (prototypeStore as any).state.currentRole = 'partner';

    const eng = (prototypeStore as any).state.engagements[0];
    // Ensure all workpapers cleared, review points closed, approvals present for generation
    eng.workpapers.forEach((w: any) => {
      w.status = 'Cleared';
      w.clearance = { clearedBy: 'Sara Malik', clearedAt: '2026-09-21T09:00:00Z', sourceVersion: eng.sourceVersion, generation: eng.generation, version: w.version, notes: 'Independent review completed.' };
    });
    if (eng.reviews) eng.reviews.forEach((r: any) => { r.status = 'Cleared'; });
    if (eng.eqrConcerns) eng.eqrConcerns.forEach((c: any) => { c.resolved = true; });
    eng.approvals = {
      manager: { by: 'Layla Rahman', at: '2026-09-21T10:00:00Z', generation: eng.generation },
      client: { by: 'Omar Nasser', at: '2026-09-21T11:00:00Z', generation: eng.generation },
      partner: { by: 'Daniel James', at: '2026-09-21T12:00:00Z', generation: eng.generation },
      eqr: eng.eqrRequired ? { by: 'Dr. Tariq Al-Sayed', at: '2026-09-21T13:00:00Z', generation: eng.generation } : null
    };

    // Issue initial release
    seedPackageDefinition(eng);
    prototypeStore.prepareReleaseCandidate(eng.id);
    prototypeStore.issueRelease(eng.id, 'First local release record', ['board@example.demo']);
    const firstRelId = eng.releases[0].id;

    // Reopen for amendment
    prototypeStore.reopenReleaseForAmendment(eng.id, 'Subsequent adjusting event: litigation settlement');
    assert.strictEqual(eng.releases[0].isAmended, undefined);
    assert.strictEqual(eng.candidate, null);
    assert.strictEqual(eng.approvals.partner, null);

    // Unapproved reissue must be blocked because approvals were invalidated for the new generation!
    assert.throws(
      () => prototypeStore.prepareReleaseCandidate(eng.id),
      /missing or invalid for generation/
    );

    // Record renewed approvals for new generation
    eng.approvals = {
      manager: { by: 'Layla Rahman', at: '2026-09-22T10:00:00Z', generation: eng.generation },
      client: { by: 'Omar Nasser', at: '2026-09-22T11:00:00Z', generation: eng.generation },
      partner: { by: 'Daniel James', at: '2026-09-22T12:00:00Z', generation: eng.generation },
      eqr: eng.eqrRequired ? { by: 'Dr. Tariq Al-Sayed', at: '2026-09-22T13:00:00Z', generation: eng.generation } : null
    };

    // Freeze and issue second release
    seedPackageDefinition(eng);
    prototypeStore.prepareReleaseCandidate(eng.id);
    prototypeStore.issueRelease(eng.id, 'Second local release record', ['board@example.demo']);
    assert.strictEqual(eng.releases.length, 2);
    assert.strictEqual(eng.releases[1].predecessorId, firstRelId);
  });

  it('Canonical SharePoint client folders created idempotently (VP-017 / F13)', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Daniel James');
    (prototypeStore as any).state.currentRole = 'partner';

    const beforeFolderCount = (prototypeStore as any).state.folders.length;
    prototypeStore.prepareClientWorkspace('CL-001', 2026);
    // Calling a second time should be idempotent (no duplicates)
    prototypeStore.prepareClientWorkspace('CL-001', 2026);

    const clientFolders = (prototypeStore as any).state.folders.filter((f: any) => f.clientId === 'CL-001');
    assert.ok(clientFolders.some((f: any) => f.path.includes('01_Acceptance')));
    assert.ok(clientFolders.some((f: any) => f.path.includes('02_Planning')));
    assert.ok(clientFolders.some((f: any) => f.path.includes('03_Fieldwork')));
    assert.ok(clientFolders.some((f: any) => f.path.includes('04_Deliverables')));
    assert.ok(clientFolders.some((f: any) => f.path.includes('05_Correspondence')));
  });

  it('creates an idempotent fresh next-period continuance draft without prior work (VP-047)', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    const state = (prototypeStore as any).state;
    setPersona(state, 'Layla Rahman');
    state.currentRole = 'manager';
    const prior = state.engagements[0];
    const partner = state.users.find((u: any) => u.name === prior.partner && u.role === 'partner');
    state.acceptanceCases = [{
      id: 'ACC-CONT', clientId: prior.client, year: prior.year, service: prior.service,
      riskRating: 'Low', independenceConfirmed: true, amlKycCompleted: true,
      conflictsCleared: true, prohibitionsChecked: true, competenceConfirmed: true,
      conditions: [], recommendationBy: 'Layla Rahman', recommendationDate: '2026-09-20',
      recommendationNotes: 'Prior year continuance review.', decisionBy: prior.partner,
      decisionByUserId: partner.id, decisionDate: '2026-09-21', decisionStatus: 'Accepted'
    }];
    assert.throws(() => prototypeStore.createContinuanceDraft(prior.id, ''), /Record current-period changes/);
    const draft = prototypeStore.createContinuanceDraft(prior.id, 'Ownership changed; new ERP deployed.');
    assert.equal(draft.year, prior.year + 1);
    assert.equal(draft.continuanceFromEngagementId, prior.id);
    assert.equal(draft.continuanceNotes, 'Ownership changed; new ERP deployed.');
    assert.equal(draft.acceptance, false);
    assert.equal(draft.terms, false);
    assert.equal(draft.rows.length, 0);
    assert.equal(draft.workpapers.length, 0);
    assert.equal(draft.reviews.length, 0);
    assert.equal(draft.releases.length, 0);
    assert.deepEqual(draft.approvals, { manager: null, client: null, partner: null, eqr: null });
    assert.equal(prototypeStore.createContinuanceDraft(prior.id, 'Changed text ignored on retry.').id, draft.id);
    assert.equal(state.engagements.filter((e: any) => e.continuanceFromEngagementId === prior.id).length, 1);
    assert.equal(state.acceptanceCases[0].continuedToEngagementId, draft.id);
  });

  it('retains immutable trial-balance source snapshots with import metadata (VP-035)', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    const state = (prototypeStore as any).state;
    setPersona(state, 'Layla Rahman');
    const engagement = state.engagements[0];
    const original = structuredClone(engagement.rows);
    const replacement = structuredClone(original);
    replacement[0].balance += 125;
    prototypeStore.updateTrialBalanceRows(engagement.id, replacement, {
      fileName: 'replacement.csv', format: 'CSV', sha256: 'a'.repeat(64),
      mapping: { code: 0, name: 1, debit: 2, credit: 3, signed: 2, convention: 'signed-net' }
    });
    assert.deepEqual(engagement.sourceHistory[0].rows, original);
    assert.equal(engagement.sourceHistory[1].version, 2);
    assert.equal(engagement.sourceHistory[1].predecessorVersion, 1);
    assert.equal(engagement.sourceHistory[1].sha256, 'a'.repeat(64));
    assert.equal(engagement.sourceHistory[1].fileName, 'replacement.csv');
    engagement.rows[0].balance = -999;
    assert.deepEqual(engagement.sourceHistory[1].rows, replacement);
  });
});
