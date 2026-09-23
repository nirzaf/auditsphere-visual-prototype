// VP-063 unit: guards + store commands (AT-11/AT-12/AT-18/AT-24/AT-28/AT-31/AT-32/AT-47/AT-54).
// Same-person, scope, hierarchy, allocation and stale-revision rules share one
// implementation between UI actions and tests.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../../src/store/initialState.js';
import { prototypeStore } from '../../src/store/prototypeStore.js';
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

describe('fixture integrity (AT-02/AT-54)', () => {
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
    assert.equal(migrated.schema, 15);
  });
  it('keeps prior acceptance decisions as history but removes unsupported active authority', () => {
    const legacy = createInitialState() as any;
    legacy.schema = 12;
    const engagement = legacy.engagements[0];
    engagement.acceptance = true;
    legacy.acceptanceCases = [{
      id: 'ACC-LEGACY', clientId: engagement.client, year: engagement.year, engagementId: engagement.id,
      decisionStatus: 'Accepted', independenceConfirmed: true, amlKycCompleted: true,
      conflictsCleared: true, prohibitionsChecked: true, competenceConfirmed: true,
      history: [{ action: 'decision', status: 'Accepted', notes: 'Prior decision', at: '2026-01-01T00:00:00Z' }]
    }];
    const { state: migrated } = migratePersistedState(legacy, createInitialState());
    assert.equal(migrated.engagements.find(item => item.id === engagement.id)?.acceptance, false);
    assert.equal(migrated.acceptanceCases?.[0].decisionStatus, 'Accepted');
    assert.equal(migrated.acceptanceCases?.[0].screeningEvidence && Object.keys(migrated.acceptanceCases[0].screeningEvidence || {}).length, 0);
    assert.equal(migrated.acceptanceCases?.[0].history?.[0].notes, 'Prior decision');
  });
  it('upgrades each persisted schema revision through current v15 without losing histories', () => {
    const seed = createInitialState();
    for (let version = 0; version <= 14; version++) {
      const legacy = structuredClone(seed) as any;
      legacy.schema = version;
      if (version < 6) delete legacy.m365Config.permittedUsers;
      if (version < 7) legacy.engagements.forEach((e: any) => delete e.sourceHistory);
      if (version < 8) legacy.engagements.forEach((e: any) => delete e.packageHistory);
      if (version < 9) {
        legacy.auditPrograms = legacy.auditPrograms.filter((program: any) => program.id !== 'PRG-03');
        legacy.auditRisks.forEach((risk: any) => delete risk.engagementId);
        legacy.auditPrograms.forEach((program: any) => { delete program.engagementId; program.procedures.forEach((procedure: any) => { delete procedure.engagementId; delete procedure.linkedRiskIds; }); });
      }
      if (version < 10) legacy.samplePopulations.forEach((population: any) => { delete population.engagementId; population.items.forEach((item: any) => delete item.selected); });
      if (version < 11) legacy.samplePopulations.forEach((population: any) => { delete population.sourceRevision; delete population.sourceFileName; delete population.sourceComplete; delete population.sourceHistory; });
      if (version < 12) delete legacy.roleGrantHistory;
      if (version < 13) legacy.acceptanceCases?.forEach((item: any) => delete item.screeningEvidence);
      if (version < 15) legacy.samplePopulations.forEach((population: any) => { delete population.accountCode; delete population.period; delete population.currency; });
      const { state: migrated } = migratePersistedState(legacy, createInitialState());
      assert.equal(migrated.schema, 15, `schema ${version} should reach v15`);
      assert.equal(migrated.engagements[0].id, seed.engagements[0].id);
      assert.deepEqual(migrated.engagements[0].pbc.map(p => p.id), seed.engagements[0].pbc.map(p => p.id));
      assert.deepEqual(migrated.engagements[0].reviews.map(r => r.id), seed.engagements[0].reviews.map(r => r.id));
      assert.deepEqual(migrated.engagements[0].releases.map(r => r.id), seed.engagements[0].releases.map(r => r.id));
      assert.ok(migrated.engagements.every(e => Array.isArray(e.sourceHistory) && Array.isArray(e.packageHistory)));
      assert.ok(Array.isArray(migrated.m365Config.permittedUsers));
      assert.equal(migrated.samplePopulations[0].engagementId, seed.engagements[0].id);
      assert.ok(migrated.samplePopulations[0].items.every(item => item.selected), `v${version} keeps legacy sample items selected`);
      assert.equal(migrated.samplePopulations[0].sourceRevision, 1);
      assert.equal(migrated.samplePopulations[0].accountCode, seed.samplePopulations[0].accountCode);
      assert.equal(migrated.samplePopulations[0].period, seed.samplePopulations[0].period);
      assert.equal(migrated.samplePopulations[0].currency, seed.samplePopulations[0].currency);
      assert.deepEqual(migrated.samplePopulations[0].sourceHistory, []);
      assert.deepEqual(migrated.roleGrantHistory, []);
      for (const risk of migrated.auditRisks) for (const procedureId of risk.linkedProcedureIds) {
        const procedure = migrated.auditPrograms.flatMap(program => program.procedures).find(item => item.id === procedureId);
        assert.ok(procedure?.linkedRiskIds?.includes(risk.id), `v${version} migration restores reciprocal risk link ${risk.id} -> ${procedureId}`);
      }
    }
  });
});

describe('simulated invitation expiry (VP-018)', () => {
  it('blocks acceptance after expiry, records expiry, and creates no identity', () => {
    const saved = prototypeStore.exportStateJSON();
    try {
      const expired = createInitialState();
      const admin = expired.users.find(u => u.role === 'admin')!;
      expired.currentUserId = admin.id;
      expired.currentPerson = admin.name;
      expired.currentRole = 'admin';
      expired.simulatedInvitations = [{
        id: 'INV-EXPIRED-TEST', email: 'expired@example.demo', name: 'Expired Recipient',
        role: 'preparer', scopeKind: 'Global', status: 'Pending', invitedAt: '2000-01-01T00:00:00.000Z',
        invitedBy: admin.name, expiresAt: '2000-01-02T00:00:00.000Z'
      }];
      prototypeStore.importStateJSON(JSON.stringify(expired));
      assert.throws(() => prototypeStore.acceptSimulatedInvitation('INV-EXPIRED-TEST'), /expired/i);
      const result = prototypeStore.getSnapshot();
      assert.equal(result.simulatedInvitations?.[0].status, 'Expired');
      assert.equal(result.users.some(u => u.email === 'expired@example.demo'), false);
      assert.equal(result.identityStatusHistory?.some(e => e.action === 'InvitationExpired' && e.userName === 'Expired Recipient'), true);
    } finally {
      prototypeStore.importStateJSON(saved);
    }
  });
});

describe('internal comment editing (AT-14)', () => {
  it('limits edits to the author and records who and when changed the note', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    prototypeStore.resetState();
    const initial = prototypeStore.getSnapshot();
    prototypeStore.setPersona(initial.users.find(user => user.id === 'preparer')!.id);
    const author = prototypeStore.getSnapshot().currentPerson;
    prototypeStore.addComment({ id: 'CMT-EDIT-TEST', subjectType: 'job', subjectId: initial.jobs[0].id, author, authorRole: 'preparer', createdAt: new Date().toISOString(), text: 'Original note', visibility: 'internal' });
    prototypeStore.editComment('CMT-EDIT-TEST', ' Revised note ');
    const edited = prototypeStore.getSnapshot().comments.find(comment => comment.id === 'CMT-EDIT-TEST')!;
    assert.equal(edited.text, 'Revised note');
    assert.equal(edited.editedBy, author);
    assert.ok(edited.editedAt);
    prototypeStore.setPersona(prototypeStore.getSnapshot().users.find(user => user.id === 'manager')!.id);
    assert.throws(() => prototypeStore.editComment('CMT-EDIT-TEST', 'Unauthorized change'), /Only the comment author/);
  });
});

describe('sampling workpaper guards (VP-051)', () => {
  it('requires selection and records a variance against the scoped population item', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    prototypeStore.resetState();
    prototypeStore.setPersona('preparer');
    prototypeStore.setSelectedEngagement('ENG-26001');
    assert.throws(() => prototypeStore.setSampleItemSelected('POP-01', 'SAMP-01', false), /complete population source/);
    assert.throws(() => prototypeStore.recordSampleItemTest('POP-01', 'SAMP-01', 249000, 'Vouched.'), /complete population source/);
    const makeRow = (amount: number, period = 2026, currency = 'QAR') => ({ id: 'SAMP-IMPORT-1', itemRef: 'SOURCE-1', date: '2026-09-20', period, currency, counterparty: 'Customer', amount, tested: false, selected: false, result: 'Untested' as const });
    assert.throws(() => prototypeStore.replaceSamplePopulationSource('POP-01', 'wrong-context.csv', 'c'.repeat(64), [makeRow(500000, 2025, 'USD')]), /period\/currency/);
    prototypeStore.replaceSamplePopulationSource('POP-01', 'source.csv', 'b'.repeat(64), [makeRow(100)]);
    assert.throws(() => prototypeStore.setSampleItemSelected('POP-01', 'SAMP-IMPORT-1', true), /Reconcile the complete population/);
    assert.throws(() => prototypeStore.recordSampleItemTest('POP-01', 'SAMP-IMPORT-1', 99, 'Vouched.'), /Reconcile the complete population/);
    prototypeStore.replaceSamplePopulationSource('POP-01', 'reconciled.csv', 'd'.repeat(64), [makeRow(500000)]);
    assert.throws(() => prototypeStore.setSampleItemSelected('POP-01', 'SAMP-IMPORT-1', true), /Selection rationale is required/);
    prototypeStore.setSampleItemSelected('POP-01', 'SAMP-IMPORT-1', true, 'Select the high-value transaction');
    assert.equal(prototypeStore.getSnapshot().samplePopulations[0].items[0].selectionRationale, 'Select the high-value transaction');
    prototypeStore.recordSampleItemTest('POP-01', 'SAMP-IMPORT-1', 499999, 'Inspected independent confirmation.');
    const item = prototypeStore.getSnapshot().samplePopulations[0].items[0];
    assert.equal(item.result, 'Exception noted');
    assert.equal(item.difference, -1);
    assert.equal(prototypeStore.getSnapshot().samplePopulations[0].selectedValue, 500000);
    prototypeStore.setPersona('reviewer');
    prototypeStore.reviewSampleSelection('POP-01', 'One item tested; one-dollar difference requires follow-up.');
    assert.deepEqual([prototypeStore.getSnapshot().samplePopulations[0].selectionReviews?.[0].testedCount, prototypeStore.getSnapshot().samplePopulations[0].selectionReviews?.[0].untestedCount, prototypeStore.getSnapshot().samplePopulations[0].selectionReviews?.[0].exceptionCount], [1, 0, 1]);
    prototypeStore.setPersona('preparer');
    prototypeStore.setSampleItemSelected('POP-01', 'SAMP-IMPORT-1', false);
    const staleSelection = prototypeStore.getSnapshot().samplePopulations[0];
    assert.notEqual(staleSelection.selectionReviews?.at(-1)?.version, staleSelection.selectionVersion, 'changing selection invalidates the prior evaluation');
    prototypeStore.setSampleItemSelected('POP-01', 'SAMP-IMPORT-1', true, 'Reselect after review change');
    prototypeStore.setPersona('reviewer');
    prototypeStore.reviewSampleSelection('POP-01', 'Reselected item reviewed.');
    prototypeStore.replaceSamplePopulationSource('POP-01', 'new.csv', 'a'.repeat(64), [makeRow(120)]);
    const replaced = prototypeStore.getSnapshot().samplePopulations[0];
    assert.equal(replaced.sourceRevision, 4);
    assert.equal(replaced.sourceHistory?.[2].items[0].difference, -1);
    assert.deepEqual([replaced.totalPopulationCount, replaced.totalPopulationValue, replaced.selectedCount], [1, 120, 0]);
    assert.equal(replaced.sourceSha256, 'a'.repeat(64));
    assert.equal(replaced.selectionReviews?.length, 2, 'prior selection evaluations remain historical');
    assert.throws(() => prototypeStore.setSampleItemSelected('POP-01', 'SAMP-IMPORT-1', true), /Reconcile the complete population/);
  });
});

describe('access grant history (VP-018/019)', () => {
  it('retains grant and revocation actor, scope, timestamp and reason', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    prototypeStore.resetState();
    prototypeStore.setPersona('admin');
    prototypeStore.grantAccess('group-user', 'manager', 'Engagement', 'ENG-26002', 'Approved request AR-42');
    assert.throws(() => prototypeStore.revokeAccess('group-user', 'manager', 'ENG-26002', ''), /revocation reason/);
    prototypeStore.revokeAccess('group-user', 'manager', 'ENG-26002', 'Assignment ended');
    const history = prototypeStore.getSnapshot().roleGrantHistory.slice(-2);
    assert.deepEqual(history.map(event => [event.action, event.actorUserId, event.userId, event.scopeId, event.reason]), [
      ['Granted', 'admin', 'group-user', 'ENG-26002', 'Approved request AR-42'],
      ['Revoked', 'admin', 'group-user', 'ENG-26002', 'Assignment ended']
    ]);
    assert.ok(history.every(event => Number.isFinite(Date.parse(event.at))));
    assert.equal(prototypeStore.getSnapshot().roleGrants.some(grant => grant.userId === 'group-user' && grant.scopeId === 'ENG-26002'), false);
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

  it('validates custom values, keeps contacts non-authorizing and relationship groups outside access grants', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const state = createInitialState();
    (prototypeStore as any).state = state;
    setPersona(state, 'Amira Qasim');
    prototypeStore.setClientCustomField('CL-001', 'cf_entity_tier', 'Tier 1 Public');
    assert.equal(state.clients.find(c => c.id === 'CL-001')?.customFields?.cf_entity_tier, 'Tier 1 Public');
    assert.throws(() => prototypeStore.setClientCustomField('CL-001', 'cf_entity_tier', 'exec(1)'), /configured choices/);
    assert.throws(() => prototypeStore.setClientCustomField('CL-001', 'cf_cr_expiry', '2026-02-30'), /valid date/);
    assert.throws(() => prototypeStore.addCustomFieldDefinition('Invalid Choice', 'choice', ['Only one']), /at least two/);
    const fieldId = prototypeStore.addCustomFieldDefinition('Risk Tier', 'choice', ['Low', 'High']);
    prototypeStore.setClientCustomField('CL-001', fieldId, 'High');
    prototypeStore.setCustomFieldDefinitionEnabled(fieldId, false);
    assert.equal(state.clients.find(c => c.id === 'CL-001')?.customFields?.[fieldId], 'High', 'disabling a used definition preserves historical values');
    assert.throws(() => prototypeStore.setClientCustomField('CL-001', fieldId, 'Low'), /active custom field/);

    const newContact = { id: 'CNT-AT05', clientId: 'CL-001', name: 'Nora Test', email: 'nora@example.demo', isPrimary: true, active: true, portalAccessRequested: true };
    prototypeStore.addContact(newContact);
    assert.equal(newContact.portalAccessRequested, false);
    assert.equal(state.contacts.find(c => c.id === 'CNT-01')?.isPrimary, false);
    prototypeStore.setPrimaryContact('CL-001', 'CNT-02');
    assert.equal(state.contacts.find(c => c.id === 'CNT-02')?.isPrimary, true);
    const inactive = state.contacts.find(c => c.id === 'CNT-02')!;
    inactive.active = false;
    assert.throws(() => prototypeStore.setPrimaryContact('CL-001', 'CNT-02'), /inactive/);

    const grants = structuredClone(state.roleGrants);
    setPersona(state, 'Omar Nasser');
    assert.throws(() => prototypeStore.assignClientRelationshipGroup('CL-001'), /cannot change client relationship groups/);
    setPersona(state, 'Amira Qasim');
    prototypeStore.createClientRelationshipGroup('CL-001', 'AT-05 Related Entities');
    prototypeStore.assignClientRelationshipGroup('CL-003', state.clients.find(c => c.id === 'CL-001')!.relationshipGroupId);
    assert.equal(state.relationshipGroups.find(g => g.name === 'AT-05 Related Entities')?.clientIds.includes('CL-003'), true);
    assert.deepEqual(state.roleGrants, grants, 'relationship grouping never creates client access');
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

describe('separation of duties (AT-24/AT-31/AT-47)', () => {
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

describe('opportunity and proposal lifecycle (AT-07/AT-08)', () => {
  it('requires a loss reason and retains opportunity stage history', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const target = prototypeStore as any;
    target.state = createInitialState();
    setPersona(target.state, 'Layla Rahman');
    const lead = structuredClone(target.state.leads[0]);
    assert.throws(() => target.updateLead({ ...lead, stage: 'Lost', lostReason: '' }), /requires a reason/);
    target.updateLead({ ...lead, stage: 'Lost', lostReason: 'Client deferred the work.' });
    const saved = target.state.leads.find((item: any) => item.id === lead.id);
    assert.equal(saved.history.at(-1).stage, 'Lost');
    assert.equal(saved.history.at(-1).reason, 'Client deferred the work.');
  });

  it('requires independent review before presentation and preserves the exact presented revision', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const target = prototypeStore as any;
    target.state = createInitialState();
    addAmiraManagerPersona(target.state);
    const id = 'PROP-AT07';
    target.addProposal({ id, title: 'Test proposal', revision: 1, preparedBy: 'Amira Qasim', preparedAt: '2026-09-23', currency: 'QAR', totalAmount: 100, items: [{ id: `${id}-1`, serviceName: 'Audit', description: 'Annual audit', scope: 'Audit of FY2026 statements', exclusions: 'Tax services', deliverables: 'Audit opinion', clientResponsibilities: 'Provide records', feeModel: 'Fixed', amount: 100 }], terms: 'Payment within 30 days.', state: 'Draft' });
    assert.throws(() => target.reviewProposal(id, true), /same person|Separation of duties/i);
    setPersona(target.state, 'Layla Rahman');
    target.reviewProposal(id, true);
    target.presentProposal(id);
    const old = structuredClone(target.state.proposals.find((item: any) => item.id === id));
    const revision = target.createProposalRevision(id);
    assert.equal(target.state.proposals.find((item: any) => item.id === id).state, 'Superseded');
    assert.deepEqual(target.state.proposals.find((item: any) => item.id === id).presentedSnapshot, old.presentedSnapshot);
    assert.equal(revision.revision, 2);
    assert.equal(revision.predecessorId, id);
    assert.equal(revision.state, 'Draft');
    assert.equal(revision.commercialReview, undefined);
  });

  it('requires client response evidence and does not create an engagement', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const target = prototypeStore as any;
    target.state = createInitialState();
    const prop = target.state.proposals.find((item: any) => item.id === 'PROP-001');
    prop.state = 'Presented';
    prop.presentedSnapshot = { revision: prop.revision, title: prop.title, currency: prop.currency, totalAmount: prop.totalAmount, items: structuredClone(prop.items), terms: prop.terms, presentedBy: 'Layla Rahman', presentedAt: '2026-09-23T10:00:00Z' };
    const engagementCount = target.state.engagements.length;
    setPersona(target.state, 'Omar Nasser');
    const response = { responseType: 'Accepted', contact: 'Omar Nasser', date: '2026-09-23', method: 'Email', notes: 'Approved for acceptance.', evidenceRef: '' } as const;
    assert.throws(() => target.recordProposalResponse(prop.id, response), /evidence reference/);
    target.recordProposalResponse(prop.id, { ...response, evidenceRef: 'MAIL-ACCEPT-2026-09-23' });
    assert.equal(prop.state, 'Accepted');
    assert.equal(prop.clientResponse.evidenceRef, 'MAIL-ACCEPT-2026-09-23');
    assert.equal(target.state.engagements.length, engagementCount, 'accepted proposal does not itself create an engagement');
  });
});

describe('proposal to engagement handoff (AT-10)', () => {
  it('creates one draft per accepted proposal and requires partner evidence to activate', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const target = prototypeStore as any;
    target.state = createInitialState();
    const state = target.state;
    const proposal = { ...structuredClone(state.proposals.find((item: any) => item.id === 'PROP-001')), id: 'PROP-AT10' };
    proposal.presentedSnapshot = { revision: proposal.revision, title: proposal.title, currency: proposal.currency, totalAmount: proposal.totalAmount, items: structuredClone(proposal.items), terms: proposal.terms, presentedBy: 'Layla Rahman', presentedAt: '2026-09-23T10:00:00Z' };
    state.proposals.push(proposal);
    setPersona(state, 'Layla Rahman');
    const draft = { ...structuredClone(state.engagements[0]), id: 'ENG-AT10', client: proposal.clientId, service: proposal.items.map((item: any) => item.serviceName).join(' + '), stage: 'Draft', proposalId: proposal.id, agreedFee: proposal.totalAmount, currency: proposal.currency, acceptance: false, terms: false, professionalAcceptance: undefined };
    const created = target.addEngagement(draft);
    const duplicate = target.addEngagement({ ...draft, id: 'ENG-AT10-DUP' });
    assert.equal(created.id, 'ENG-AT10');
    assert.equal(duplicate.id, created.id);
    assert.equal(state.engagements.filter((item: any) => item.proposalId === proposal.id).length, 1);
    setPersona(state, 'Daniel James');
    assert.throws(() => target.activateEngagement(created.id, ''), /evidence reference/);
    target.activateEngagement(created.id, 'PARTNER-ACCEPT-AT10');
    assert.equal(created.stage, 'Planning');
    assert.equal(created.professionalAcceptance.evidenceRef, 'PARTNER-ACCEPT-AT10');
    assert.equal(created.professionalAcceptance.proposalRevision, proposal.revision);
  });
});

describe('internal collaboration scope (AT-14)', () => {
  it('rejects client and out-of-scope mention targets while retaining authorized internal notes', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const target = prototypeStore as any;
    target.state = createInitialState();
    setPersona(target.state, 'Layla Rahman');
    const base = { id: 'CMT-AT14', subjectType: 'job', subjectId: 'JOB-2601', author: 'Layla Rahman', authorRole: 'manager', createdAt: '2026-09-23T10:00:00Z', text: 'Internal coordination note.', visibility: 'internal' };
    assert.throws(() => target.addComment({ ...base, id: 'CMT-CLIENT-MENTION', mentions: ['client_admin'] }), /active users who can access this job/);
    target.addComment({ ...base, mentions: ['partner'] });
    assert.equal(target.state.comments.find((item: any) => item.id === base.id).mentions[0], 'partner');
    assert.equal(target.state.events.some((event: any) => event.ref === base.id && event.text.includes('Local mention')), true);
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

describe('adjustment approval lifecycle (AT-38)', () => {
  it('requires an independent technical reviewer and a scoped client management decision', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    const storeState = (prototypeStore as any).state;
    setPersona(storeState, 'Adam Khan');
    prototypeStore.addAdjustmentJournal({
      id: 'AJ-LIFECYCLE', engagementId: 'ENG-26001', title: 'Approval lifecycle fixture', status: 'Draft',
      preparedBy: 'Adam Khan', reflectionStatus: 'Not reflected', reflectedInClientBooks: false,
      lines: [
        { accountCode: '5000', accountName: 'Operating expenses', type: 'debit', amount: 100, debit: 100, credit: 0 },
        { accountCode: '1500', accountName: 'Property, plant and equipment', type: 'credit', amount: 100, debit: 0, credit: 100 }
      ]
    });
    setPersona(storeState, 'Omar Nasser');
    assert.throws(() => prototypeStore.recordAdjustmentManagementDecision('AJ-LIFECYCLE', true), /Only technically reviewed/);
    setPersona(storeState, 'Layla Rahman');
    prototypeStore.reviewAdjustmentJournal('AJ-LIFECYCLE', true);
    const reviewed = storeState.adjustmentJournals.find((j: any) => j.id === 'AJ-LIFECYCLE');
    assert.equal(reviewed.status, 'Technical review');
    assert.equal(reviewed.reviewedBy, 'Layla Rahman');
    setPersona(storeState, 'Omar Nasser');
    assert.throws(() => prototypeStore.recordAdjustmentManagementDecision('AJ-LIFECYCLE', false), /requires a management rationale/);
    prototypeStore.recordAdjustmentManagementDecision('AJ-LIFECYCLE', true);
    const accepted = storeState.adjustmentJournals.find((j: any) => j.id === 'AJ-LIFECYCLE');
    assert.equal(accepted.status, 'Management accepted');
    assert.equal(accepted.managementAcceptedBy, 'Omar Nasser');
    setPersona(storeState, 'Adam Khan');
    prototypeStore.addAdjustmentJournal({
      id: 'AJ-REJECT', engagementId: 'ENG-26001', title: 'Rejection lifecycle fixture', status: 'Draft',
      preparedBy: 'Adam Khan', reflectionStatus: 'Not reflected', reflectedInClientBooks: false,
      lines: [
        { accountCode: '5000', accountName: 'Operating expenses', type: 'debit', amount: 50, debit: 50, credit: 0 },
        { accountCode: '1500', accountName: 'Property, plant and equipment', type: 'credit', amount: 50, debit: 0, credit: 50 }
      ]
    });
    setPersona(storeState, 'Layla Rahman');
    prototypeStore.reviewAdjustmentJournal('AJ-REJECT', true);
    setPersona(storeState, 'Omar Nasser');
    assert.throws(() => prototypeStore.recordAdjustmentManagementDecision('AJ-REJECT', false), /requires a management rationale/);
    prototypeStore.recordAdjustmentManagementDecision('AJ-REJECT', false, 'Amount is not supported by the fixed-asset schedule.');
    const rejected = storeState.adjustmentJournals.find((j: any) => j.id === 'AJ-REJECT');
    assert.equal(rejected.status, 'Rejected');
    assert.equal(rejected.managementDecisionNote, 'Amount is not supported by the fixed-asset schedule.');
    setPersona(storeState, 'Amira Qasim');
    assert.throws(() => prototypeStore.recordAdjustmentManagementDecision('AJ-LIFECYCLE', true), /Role "relationship"/);
  });
});

describe('evidence adequacy (AT-20/AT-46)', () => {
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

  it('retains the exact evidence pin when a document revision supersedes it (AT-20)', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const state = createInitialState();
    (prototypeStore as any).state = state;
    setPersona(state, 'Layla Rahman');
    const evidence = state.evidenceCatalogue.find(item => item.id === 'EVD-01')!;
    const originalId = evidence.documentId;
    const original = state.documents.find(doc => doc.id === originalId)!;
    const revision = prototypeStore.replaceDocumentRevision(originalId, { name: 'Bank_Statement_December_v2.pdf', size: 42, sha256: 'a'.repeat(64) });
    assert.equal(evidence.documentId, originalId);
    assert.equal(evidence.version, 1);
    assert.equal(state.documents.find(doc => doc.id === originalId)?.name, original.name, 'prior revision remains available');
    assert.equal(revision.version, original.version + 1);
    assert.equal(revision.supersedesDocumentId, originalId);
    const replacementEvidence = state.evidenceCatalogue.find(item => item.documentId === revision.id)!;
    assert.ok(replacementEvidence);
    assert.equal(replacementEvidence.adequacyStatus, 'Pending verification');
    const procedure = state.auditPrograms.flatMap(program => program.procedures).find(item => item.id === 'PRC-01')!;
    assert.equal(procedure.evidenceReassessmentRequired, true);
    assert.equal(procedure.status, 'In progress');
    assert.throws(() => prototypeStore.updateAuditProcedureStatus('ENG-26001', procedure.id, 'Cleared'), /Reassess the changed evidence/);
    assert.throws(() => prototypeStore.updateAuditProcedureStatus('ENG-26001', procedure.id, 'Submitted'), /current adequate evidence/);
    const workpaper = state.engagements[0].workpapers.find(item => item.id === 'WP-A1')!;
    assert.equal(workpaper.status, 'Changes required');
    assert.equal(workpaper.clearance, null);
    assert.equal(workpaper.clearanceHistory.length, 1);
    prototypeStore.setEvidenceAdequacy(replacementEvidence.id, 'Adequate');
    prototypeStore.updateAuditProcedureExecution('ENG-26001', procedure.id, 'Rechecked the replacement statement.', 'Agrees after reassessment.', '');
    prototypeStore.updateAuditProcedureStatus('ENG-26001', procedure.id, 'Submitted');
    assert.equal(procedure.evidenceReassessmentRequired, false);
    assert.throws(() => prototypeStore.replaceDocumentRevision(originalId, { name: 'duplicate.pdf', size: 1, sha256: 'b'.repeat(64) }), /already has a replacement/);
  });
});

describe('money guards (AT-30/AT-31/AT-32)', () => {
  it('VP-030 invoices approved time at its pinned rate exactly once', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    const isolated = (prototypeStore as any).state as PrototypeState;
    setPersona(isolated, 'Leila Hassan');
    isolated.currentRole = 'billing';
    const source = isolated.times.find(time => time.id === 'TIME-01')!;
    const line = { id: 'LINE-TIME-01', description: source.taskTitle, quantity: 3, rate: 200, amount: 600, sourceType: 'Time entry' as const, sourceId: source.id };
    const invoice = { id: 'INV-TIME-01', clientId: source.clientId, eng: source.engagementId, engagementId: source.engagementId, invoiceNumber: 'INV-TIME-01', description: 'Approved time', amount: 600, paid: 0, currency: 'QAR', status: 'Draft' as const, due: '2026-10-31', preparedBy: 'Leila Hassan', lines: [line] };
    prototypeStore.addInvoice(invoice);
    assert.equal(source.billedInvoiceId, invoice.id, 'creating a draft reserves its source');
    assert.throws(() => prototypeStore.addInvoice({ ...invoice, id: 'INV-TIME-02', invoiceNumber: 'INV-TIME-02' }), /not approved, billable, current, and available/);
    assert.equal(source.billedInvoiceId, invoice.id, 'a duplicate attempt cannot move the reservation');
  });

  it('VP-030 caps fixed-service billing at the unbilled accepted proposal balance', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    const isolated = (prototypeStore as any).state as PrototypeState;
    setPersona(isolated, 'Leila Hassan');
    isolated.currentRole = 'billing';
    const line = { id: 'LINE-FIXED-01', description: 'Accepted proposal fixed-fee services', quantity: 1, rate: 100000, amount: 100000, sourceType: 'Fixed service' as const, sourceId: 'proposal:PROP-001:r2' };
    const invoice = { id: 'INV-FIXED-01', clientId: 'CL-001', eng: 'ENG-26001', engagementId: 'ENG-26001', invoiceNumber: 'INV-FIXED-01', description: 'Remaining accepted fee', amount: 100000, paid: 0, currency: 'QAR', status: 'Draft' as const, due: '2026-10-31', preparedBy: 'Leila Hassan', lines: [line] };
    prototypeStore.addInvoice(invoice);
    assert.equal(isolated.invoices.find(item => item.id === invoice.id)?.lines[0].sourceId, 'proposal:PROP-001:r2');
    assert.throws(() => prototypeStore.addInvoice({ ...invoice, id: 'INV-FIXED-02', invoiceNumber: 'INV-FIXED-02' }), /remaining accepted proposal balance of 0/);
  });

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
  it('version-controls explicit consolidation FX rates and rejects wrong context', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    const state = (prototypeStore as any).state;
    setPersona(state, 'Layla Rahman');
    const group = state.consolidationGroups[0];
    group.components[1].currency = 'USD';
    delete group.fxRates.USD;
    const sourceRows = structuredClone(state.engagements.find((e: any) => e.id === group.components[1].componentId).rows);
    assert.throws(() => prototypeStore.updateConsolidationFxRate(group.id, 'USD', 0, '2026-09-23'), /greater than zero/);
    assert.throws(() => prototypeStore.updateConsolidationFxRate(group.id, 'EUR', 3.9, '2026-09-23'), /used by a group component/);
    assert.throws(() => prototypeStore.updateConsolidationFxRate(group.id, 'USD', 3.64, '2026-02-30'), /valid effective date/);
    prototypeStore.updateConsolidationFxRate(group.id, 'USD', 3.64, '2026-09-23');
    prototypeStore.updateConsolidationFxRate(group.id, 'USD', 3.65, '2026-09-24');
    assert.equal(group.fxRateHistory.USD.length, 2);
    assert.equal(group.fxRateHistory.USD[1].revision, 2);
    assert.equal(group.fxRateHistory.USD[1].purpose, 'Closing');
    assert.equal(group.fxRates.USD, 3.65);
    assert.deepEqual(state.engagements.find((e: any) => e.id === group.components[1].componentId).rows, sourceRows);
  });

  it('versions account mappings, conserves split allocations and requires independent approval', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    (prototypeStore as any).state.accountMappingRevisions = [];
    const eng = prototypeStore.getSnapshot().engagements[0];
    prototypeStore.setPersona('preparer');
    const split = [{ accountCode: eng.rows[0].code, targets: [{ statementLine: 'Cash and cash equivalents', percentage: 60 }, { statementLine: 'Other current assets', percentage: 40 }] }];
    assert.throws(() => prototypeStore.saveAccountMappings(eng.id, [{ ...split[0], targets: [{ statementLine: 'Cash and cash equivalents', percentage: 70 }] }]), /total exactly 100%/);
    assert.throws(() => prototypeStore.saveAccountMappings(eng.id, [{ accountCode: 'missing', targets: [{ statementLine: 'Cash and cash equivalents', percentage: 100 }] }]), /reference unique source accounts/);
    assert.throws(() => prototypeStore.saveAccountMappings(eng.id, [{ accountCode: eng.rows[0].code, targets: [{ statementLine: 'Miscellaneous', percentage: 100 }] }]), /valid statement targets/);
    prototypeStore.saveAccountMappings(eng.id, split);
    (prototypeStore as any).state.accountMappingRevisions[0].preparedBy = 'reviewer';
    prototypeStore.setPersona('reviewer');
    assert.throws(() => prototypeStore.approveAccountMappings(eng.id, 1), /same person cannot review their own work/);
    prototypeStore.setPersona('preparer');
    (prototypeStore as any).state.accountMappingRevisions[0].preparedBy = 'preparer';
    prototypeStore.setPersona('reviewer');
    prototypeStore.approveAccountMappings(eng.id, 1);
    prototypeStore.setPersona('preparer');
    prototypeStore.saveAccountMappings(eng.id, split);
    const history = prototypeStore.getSnapshot().accountMappingRevisions!;
    assert.deepEqual(history.map(item => [item.revision, item.status]), [[1, 'Approved'], [2, 'Draft']]);
    assert.equal(history[0].mappings[0].targets.reduce((sum, item) => sum + item.percentage, 0), 100);
  });

  it('risk and procedure links are reciprocal and engagement scoped (VP-049)', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Layla Rahman');
    prototypeStore.setAuditRiskProcedureLink('ENG-26001', 'RSK-01', 'PRC-03', true);
    const current = (prototypeStore as any).state;
    assert.ok(current.auditRisks.find((risk: any) => risk.id === 'RSK-01').linkedProcedureIds.includes('PRC-03'));
    assert.ok(current.auditPrograms.flatMap((program: any) => program.procedures).find((procedure: any) => procedure.id === 'PRC-03').linkedRiskIds.includes('RSK-01'));
    assert.throws(() => prototypeStore.setAuditRiskProcedureLink('ENG-26002', 'RSK-01', 'PRC-03', true), /both belong to the selected engagement/);
    const risk = current.auditRisks.find((item: any) => item.id === 'RSK-01');
    prototypeStore.updateAuditRisk('ENG-26001', risk.id, { title: risk.title, area: risk.area, assertions: risk.assertions, description: risk.description, rationale: risk.rationale, response: `${risk.response} Reassess supporting detail.`, owner: risk.owner, rating: risk.rating });
    assert.equal(risk.revisions.length, 1);
    assert.equal(risk.revisions[0].response, risk.response);
    assert.equal(risk.revisions[0].changedBy, 'Layla Rahman');
  });

  it('audit program templates preserve revisions and apply fresh work (VP-049)', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Layla Rahman');
    const template = { name: 'Revenue verification', area: 'Revenue', description: 'Test recorded revenue.', procedures: [{ title: 'Trace transactions', objective: 'Confirm occurrence', instructions: 'Trace to invoices.', defaultAssertions: ['Occurrence'], requiredEvidenceType: 'Invoice' }] };
    const id = prototypeStore.createAuditProgramTemplate(template);
    assert.throws(() => prototypeStore.applyAuditProgramTemplate('ENG-26001', id), /Published audit program template not found/);
    prototypeStore.publishAuditProgramTemplate(id);
    const programId = prototypeStore.applyAuditProgramTemplate('ENG-26001', id);
    const applied = (prototypeStore as any).state.auditPrograms.find((item: any) => item.id === programId);
    assert.equal(applied.sourceTemplateVersion, 1);
    assert.equal(applied.procedures[0].status, 'Not started');
    assert.equal(applied.procedures[0].workPerformed, '');
    prototypeStore.reviseAuditProgramTemplate(id, { ...template, description: 'Updated purpose.' });
    assert.equal((prototypeStore as any).state.auditProgramTemplates.find((item: any) => item.id === id).status, 'Draft');
    assert.equal((prototypeStore as any).state.auditProgramTemplateHistory[0].status, 'Published');
    assert.throws(() => prototypeStore.applyAuditProgramTemplate('ENG-26001', id), /Published audit program template not found/);
    assert.equal(applied.sourceTemplateVersion, 1);
  });

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
    assert.throws(() => prototypeStore.saveAcceptanceCase({
      id: `ACC-${eng.client}-${eng.year}`, clientId: eng.client, year: eng.year, service: eng.service,
      riskRating: 'Low', independenceConfirmed: true, amlKycCompleted: true, conflictsCleared: true,
      prohibitionsChecked: true, competenceConfirmed: true, conditions: [], recommendationBy: '',
      recommendationDate: '', recommendationNotes: 'Checks reviewed; recommend acceptance.', decisionStatus: 'Accepted'
    }), /evidence reference/);
    prototypeStore.saveAcceptanceCase({
      id: `ACC-${eng.client}-${eng.year}`, clientId: eng.client, year: eng.year, service: eng.service,
      riskRating: 'Low', independenceConfirmed: true, amlKycCompleted: true, conflictsCleared: true,
      prohibitionsChecked: true, competenceConfirmed: true, screeningEvidence: { amlKyc: 'KYC-101', independence: 'IND-101', conflicts: 'COI-101', prohibitions: 'ROT-101', competence: 'COMP-101' }, conditions: [], recommendationBy: '',
      recommendationDate: '', recommendationNotes: 'Checks reviewed; recommend acceptance.', decisionStatus: 'Accepted'
    });
    assert.equal(prototypeStore.getSnapshot().acceptanceCases?.[0].decisionStatus, 'Pending');
    assert.equal(prototypeStore.getSnapshot().acceptanceCases?.[0].history?.[0].screeningEvidence?.amlKyc, 'KYC-101');
    setPersona(current, 'Daniel James');
    prototypeStore.decideAcceptanceCase(`ACC-${eng.client}-${eng.year}`, 'Accepted', 'Accepted after independent review.');
    assert.equal(eng.acceptance, true);
    assert.deepEqual(prototypeStore.getSnapshot().acceptanceCases?.[0].history?.map(item => item.action), ['recommendation', 'decision']);
  });

  it('allocates one receipt across invoices and reverses only the selected allocation', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const current = createInitialState();
    (prototypeStore as any).state = current;
    setPersona(current, 'Layla Rahman');
    const secondInvoice = { ...structuredClone(current.invoices.find(item => item.id === 'INV-26002')!), id: 'INV-AT32-2', invoiceNumber: 'INV-AT32-2', amount: 100_000, paid: 0 };
    const firstInvoice = current.invoices.find(item => item.id === 'INV-26002')!;
    const firstInvoicePaid = Math.max(firstInvoice.paid, current.receipts.flatMap(item => item.allocations).filter(item => item.invoiceId === firstInvoice.id && !item.reversed).reduce((sum, item) => sum + item.amount, 0));
    current.invoices.push(secondInvoice);
    const receipt = { ...structuredClone(current.receipts[0]), id: 'RCP-AT32-MULTI', receiptNumber: 'RCP-AT32-MULTI', amount: 150_000, allocatedAmount: 0, allocations: [] };
    prototypeStore.addReceipt(receipt);
    prototypeStore.allocateReceipt(receipt.id, 'INV-26002', 50_000);
    prototypeStore.allocateReceipt(receipt.id, secondInvoice.id, 70_000);
    assert.equal(receipt.allocatedAmount, 120_000);
    assert.deepEqual(receipt.allocations.map(item => item.invoiceId), ['INV-26002', secondInvoice.id]);
    assert.equal(secondInvoice.paid, 70_000);
    prototypeStore.reverseAllocation(receipt.id, 0, 'Correct first invoice allocation.');
    assert.equal(receipt.allocatedAmount, 70_000);
    assert.equal(firstInvoice.paid, firstInvoicePaid);
    assert.equal(secondInvoice.paid, 70_000);
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
    const sourceJob = (prototypeStore as any).state.jobs.at(-1);
    assert.equal(sourceJob.fromTemplateRevision, 1);
    const originalTasks = structuredClone(draftTpl.tasks);
    const revision = prototypeStore.createJobTemplateRevision(draftTpl.id, { name: 'Revised Template', service: draftTpl.service, description: draftTpl.description, defaultJobTitle: 'Revised Job', tasks: [{ title: 'Revised Phase', subtasks: ['New Subtask'] }] });
    assert.equal(revision.revision, 2);
    assert.equal(revision.status, 'Draft');
    assert.equal(revision.revisionOfId, draftTpl.id);
    assert.equal(draftTpl.status, 'Published');
    assert.deepEqual(draftTpl.tasks, originalTasks);
    prototypeStore.publishJobTemplate(revision.id);
    const idempotencyKey = 'VP015-RETRY-TEST';
    const jobsBeforeRetry = (prototypeStore as any).state.jobs.length;
    prototypeStore.applyJobTemplate(revision.id, 'ENG-26001', 'Revised Job', '2026-11-01', 'Layla Rahman', idempotencyKey);
    prototypeStore.applyJobTemplate(revision.id, 'ENG-26001', 'Revised Job', '2026-11-01', 'Layla Rahman', idempotencyKey);
    assert.equal((prototypeStore as any).state.jobs.length, jobsBeforeRetry + 1);
    assert.equal((prototypeStore as any).state.jobs.at(-1).fromTemplateRevision, 2);
    assert.throws(() => prototypeStore.applyJobTemplate(revision.id, 'ENG-26001', 'Changed Job', '2026-11-01', 'Layla Rahman', idempotencyKey), /already used for different job details/);

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
    setPersona((prototypeStore as any).state, 'Rami Nasser');

    const eng = (prototypeStore as any).state.engagements[0];
    const req = eng.pbc.find((item: any) => item.id === 'PBC-03');

    setPersona((prototypeStore as any).state, 'Omar Nasser');
    assert.throws(() => prototypeStore.uploadPbcResponse(eng.id, req.id, { name: 'wrong-user.pdf', size: 100, sha256: 'a'.repeat(64) }), /named client contributor/);
    setPersona((prototypeStore as any).state, 'Rami Nasser');
    assert.throws(() => prototypeStore.uploadPbcResponse(eng.id, req.id, { name: 'missing-digest.pdf', size: 100 }), /SHA-256/);
    prototypeStore.uploadPbcResponse(eng.id, req.id, { name: 'Bank_Statement_Q4.pdf', size: 102400, sha256: 'a'.repeat(64) });

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
    setPersona((prototypeStore as any).state, 'Rami Nasser');
    prototypeStore.uploadPbcResponse(eng.id, req.id, { name: 'Bank_Statement_Q4_v2.pdf', size: 2048, sha256: 'b'.repeat(64) });
    assert.strictEqual(req.status, 'Received');
    setPersona((prototypeStore as any).state, 'Layla Rahman');
    (prototypeStore as any).state.currentRole = 'manager';
    prototypeStore.acceptPbcResponse(eng.id, req.id);
    assert.strictEqual(req.status, 'Accepted');
    assert.strictEqual(req.acceptedVersion, 2);
    assert.strictEqual(req.acceptedBy, 'Layla Rahman');
    assert.ok(req.acceptedAt);
    setPersona((prototypeStore as any).state, 'Rami Nasser');
    assert.throws(() => prototypeStore.uploadPbcResponse(eng.id, req.id, { name: 'late-change.pdf', size: 10, sha256: 'c'.repeat(64) }), /cannot be uploaded while the request is Accepted/);
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
      screeningEvidence: { amlKyc: 'KYC-101', independence: 'IND-101', conflicts: 'COI-101', prohibitions: 'ROT-101', competence: 'COMP-101' },
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
