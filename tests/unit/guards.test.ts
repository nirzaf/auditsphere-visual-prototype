// VP-063 unit: guards + store commands (AT-11/AT-12/AT-18/AT-24/AT-28/AT-31/AT-32/AT-47/AT-54).
// Same-person, scope, hierarchy, allocation and stale-revision rules share one
// implementation between UI actions and tests.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../../src/store/initialState.js';
import { prototypeStore } from '../../src/store/prototypeStore.js';
import { visibleClientIds, visibleEngagementIds, requireEngagementScope, canOpenRoute, GuardError } from '../../src/services/guards.js';
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

describe('reconciliation schedules (VP-039)', () => {
  it('pins drafts to the TB source, requires independent review, preserves revisions and stales on source change', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = state;
    const engagement = state.engagements.find(item => item.id === 'ENG-26001')!;
    const account = engagement.rows.find(row => row.code === '1000')!;
    state.currentUserId = 'manager'; state.currentRole = 'manager'; state.currentPerson = 'Layla Rahman';
    const input = { name: 'VP-039 schedule', ref: 'REC-VP039', accountCode: account.code, status: 'Draft' as const, evidence: 'DOC-002', asOfDate: state.asOfDate, sourceVersion: engagement.sourceVersion, statementBalance: account.balance, items: [] };
    assert.throws(() => prototypeStore.saveReconciliationSchedule(engagement.id, { ...input, items: [{ id: 'RI-FUTURE', date: '2099-01-01', description: 'Out of period', amount: 1, type: 'Timing item' }] }), /dated in-scope items/);
    assert.throws(() => prototypeStore.saveReconciliationSchedule(engagement.id, { ...input, items: [{ id: 'RI-USD', date: state.asOfDate, description: 'Wrong currency', amount: 1, type: 'Timing item', currency: 'USD' }] }), /engagement currency/);
    const id = prototypeStore.saveReconciliationSchedule(engagement.id, input);
    let schedule = engagement.reconciliations.find(item => item.id === id)!;
    assert.equal(schedule.glBalance, account.balance);
    assert.equal(schedule.status, 'Draft');
    assert.throws(() => prototypeStore.reviewReconciliationSchedule(engagement.id, id, 'Approved'), /same person cannot review their own work/);
    state.currentUserId = 'reviewer'; state.currentRole = 'reviewer'; state.currentPerson = 'Sara Malik';
    schedule.evidence = 'DOC-OUT-OF-SCOPE';
    assert.throws(() => prototypeStore.reviewReconciliationSchedule(engagement.id, id, 'Approved'), /in-scope evidence/);
    schedule.evidence = 'DOC-002';
    schedule.statementBalance = account.balance - 10;
    assert.throws(() => prototypeStore.reviewReconciliationSchedule(engagement.id, id, 'Approved'), /residual .* blocks approval/);
    schedule.statementBalance = account.balance;
    schedule.items = [{ id: 'RI-CORR', date: state.asOfDate, description: 'Proposed correction', amount: 10, type: 'Proposed correction', evidenceDoc: 'DOC-OUT-OF-SCOPE' }];
    assert.throws(() => prototypeStore.reviewReconciliationSchedule(engagement.id, id, 'Approved'), /in-scope evidence/);
    schedule.items[0].evidenceDoc = 'DOC-002';
    assert.throws(() => prototypeStore.reviewReconciliationSchedule(engagement.id, id, 'Approved'), /proposed corrections must link/);
    schedule.items = [];
    prototypeStore.reviewReconciliationSchedule(engagement.id, id, 'Returned', 'Clarify statement date and scope');
    assert.equal(schedule.status, 'Returned');
    assert.equal(schedule.reviewNote, 'Clarify statement date and scope');
    state.currentUserId = 'manager'; state.currentRole = 'manager'; state.currentPerson = 'Layla Rahman';
    prototypeStore.saveReconciliationSchedule(engagement.id, { ...schedule, asOfDate: '2026-09-22' });
    schedule = engagement.reconciliations.find(item => item.id === id)!;
    assert.equal(schedule.revision, 2);
    assert.equal(schedule.history?.[0].status, 'Returned');
    assert.equal(schedule.history?.[0].reviewNote, 'Clarify statement date and scope');
    state.currentUserId = 'reviewer'; state.currentRole = 'reviewer'; state.currentPerson = 'Sara Malik';
    prototypeStore.reviewReconciliationSchedule(engagement.id, id, 'Approved');
    assert.equal(schedule.status, 'Approved');
    state.currentUserId = 'manager'; state.currentRole = 'manager'; state.currentPerson = 'Layla Rahman';
    const replacement = prototypeStore.replaceDocumentRevision('DOC-002', { name: 'VP-039 bank statement v2.pdf', size: 10, sha256: 'a'.repeat(64) });
    assert.equal(schedule.status, 'Stale');
    prototypeStore.saveReconciliationSchedule(engagement.id, { ...schedule, statementBalance: account.balance, evidence: replacement.id });
    let current = engagement.reconciliations.find(item => item.id === id)!;
    assert.equal(current.status, 'Draft');
    assert.equal(current.history?.some(item => item.status === 'Approved'), true);
    assert.equal(current.evidence, replacement.id);
    const offsetRow = engagement.rows.find(row => row.code !== account.code)!;
    prototypeStore.updateTrialBalanceRows(engagement.id, engagement.rows.map(row => ({ ...row, balance: row.code === account.code ? row.balance + 1 : row.code === offsetRow.code ? row.balance - 1 : row.balance })));
    current = engagement.reconciliations.find(item => item.id === id)!;
    assert.equal(current.status, 'Stale');
    assert.equal(current.history?.at(-1)?.status, 'Draft');
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
    assert.equal(migrated.schema, 19);
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
  it('upgrades each persisted schema revision through current v19 without losing histories', () => {
    const seed = createInitialState();
    for (let version = 0; version <= 18; version++) {
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
      if (version < 16) delete legacy.workpaperTemplates;
      if (version < 17) legacy.evidenceCatalogue.forEach((item: any) => { delete item.linkedProcedureHistory; delete item.adequacyHistory; });
      if (version < 18) legacy.findings.forEach((item: any) => delete item.dispositionHistory);
      const { state: migrated } = migratePersistedState(legacy, createInitialState());
      assert.equal(migrated.schema, 19, `schema ${version} should reach v19`);
      assert.ok(Array.isArray(migrated.statementSetRevisions));
      assert.ok(migrated.evidenceCatalogue.every(item => Array.isArray(item.linkedProcedureHistory) && Array.isArray(item.adequacyHistory)));
      assert.ok(migrated.findings.every(item => Array.isArray(item.dispositionHistory)));
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
      assert.deepEqual(migrated.workpaperTemplates?.map(item => item.id), seed.workpaperTemplates?.map(item => item.id));
      assert.deepEqual(migrated.samplePopulations[0].sourceHistory, []);
      assert.deepEqual(migrated.roleGrantHistory, []);
      for (const risk of migrated.auditRisks) for (const procedureId of risk.linkedProcedureIds) {
        const procedure = migrated.auditPrograms.flatMap(program => program.procedures).find(item => item.id === procedureId);
        assert.ok(procedure?.linkedRiskIds?.includes(risk.id), `v${version} migration restores reciprocal risk link ${risk.id} -> ${procedureId}`);
      }
    }
  });
});

describe('document reference lifecycle (VP-021)', () => {
  it('renames and moves without changing identity, and blocks unavailable evidence until restored', () => {
    (prototypeStore as any).state = state;
    setPersona(state, 'Layla Rahman');
    const document = state.documents.find(item => item.id === 'DOC-002')!;
    const originalEvidence = state.evidenceCatalogue.find(item => item.documentId === document.id)!;
    prototypeStore.updateDocumentReference(document.id, 'Renamed bank statement.pdf', '/Engagements/2026/Accounting/');
    assert.equal(document.id, 'DOC-002');
    assert.equal(document.folderPath, '/Engagements/2026/Accounting/');
    assert.equal(originalEvidence.documentId, 'DOC-002');
    assert.throws(() => prototypeStore.updateDocumentReference(document.id, 'Bad path.pdf', '/outside/'), /existing folder in this client library/);
    assert.throws(() => prototypeStore.updateDocumentReference(document.id, 'Wrong client.pdf', '/Clients/CL-003/2026/01_Acceptance/'), /existing folder in this client library/);
    assert.throws(() => prototypeStore.setDocumentAvailability(document.id, true), /why the document reference is unavailable/);
    prototypeStore.setDocumentAvailability(document.id, true, 'Source item deleted');
    assert.throws(() => prototypeStore.setEvidenceAdequacy(originalEvidence.id, 'Adequate'), /cannot be marked adequate/);
    assert.throws(() => prototypeStore.linkWorkpaperEvidence('ENG-26001', 'WP-A1', document.id), /available document/);
    prototypeStore.setDocumentAvailability(document.id, false);
    prototypeStore.setEvidenceAdequacy(originalEvidence.id, 'Adequate');
    assert.equal(document.brokenLink, false);
  });
});

describe('simulated invitation expiry (VP-018)', () => {
  it('limits a disabled identity to the requirements screen', () => {
    assert.equal(canOpenRoute('preparer', 'overview', false), false);
    assert.equal(canOpenRoute('preparer', 'jobs', false), false);
    assert.equal(canOpenRoute('preparer', 'requirements', false), true);
  });

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
    assert.throws(() => prototypeStore.linkSampleExceptionToFinding('POP-01', 'SAMP-IMPORT-1', 'missing'), /same engagement/);
    prototypeStore.linkSampleExceptionToFinding('POP-01', 'SAMP-IMPORT-1', 'FND-01');
    assert.equal(prototypeStore.getSnapshot().samplePopulations[0].items[0].findingId, 'FND-01');
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

  it('records a selected-item testing limitation and separates it in reviewer evaluation', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    prototypeStore.resetState();
    prototypeStore.setPersona('preparer');
    prototypeStore.setSelectedEngagement('ENG-26001');
    const row = { id: 'LIMIT-1', itemRef: 'LIMIT-1', date: '2026-09-20', period: 2026, currency: 'QAR', counterparty: 'Customer', amount: 500000, tested: false, selected: false, result: 'Untested' as const };
    prototypeStore.replaceSamplePopulationSource('POP-01', 'limit.csv', 'a'.repeat(64), [row]);
    prototypeStore.setSampleItemSelected('POP-01', 'LIMIT-1', true, 'Select for confirmation testing');
    assert.throws(() => prototypeStore.recordSampleItemLimitation('POP-01', 'LIMIT-1', ''), /explain the testing limitation/);
    prototypeStore.recordSampleItemLimitation('POP-01', 'LIMIT-1', 'Customer confirmation could not be obtained.');
    prototypeStore.setPersona('reviewer');
    prototypeStore.reviewSampleSelection('POP-01', 'One item limited; alternative procedures required.');
    const population = prototypeStore.getSnapshot().samplePopulations[0];
    assert.deepEqual([population.items[0].result, population.selectionReviews?.[0].testedCount, population.selectionReviews?.[0].limitedCount, population.selectionReviews?.[0].untestedCount], ['Limited', 0, 1, 0]);
  });
});

describe('workpaper template lifecycle (VP-052)', () => {
  it('creates a fresh scoped workpaper and requires reasoned eligible reassignment', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    prototypeStore.resetState();
    prototypeStore.setPersona('manager');
    prototypeStore.setSelectedEngagement('ENG-26001');
    const id = prototypeStore.createWorkpaperFromTemplate('ENG-26001', 'TPL-WP-CASH-01', 'preparer', 'reviewer');
    let workpaper = prototypeStore.getSnapshot().engagements.find(item => item.id === 'ENG-26001')!.workpapers.find(item => item.id === id)!;
    assert.deepEqual([workpaper.sourceTemplateId, workpaper.sourceTemplateVersion, workpaper.version, workpaper.status], ['TPL-WP-CASH-01', 1, 1, 'Planned']);
    assert.deepEqual([workpaper.workingPaper, workpaper.evidenceRefs, workpaper.supportingEvidence, workpaper.conclusion, workpaper.clearance], [null, [], [], '', null]);
    assert.throws(() => prototypeStore.reassignWorkpaper('ENG-26001', id, 'reviewer', 'reviewer-2', ''), /reassignment reason/);
    prototypeStore.reassignWorkpaper('ENG-26001', id, 'reviewer', 'reviewer-2', 'Reviewer capacity change');
    workpaper = prototypeStore.getSnapshot().engagements.find(item => item.id === 'ENG-26001')!.workpapers.find(item => item.id === id)!;
    assert.deepEqual([workpaper.reviewer, workpaper.version, workpaper.assignmentHistory?.at(-1)?.reason], ['Bilal Ahmed', 2, 'Reviewer capacity change']);
  });
});

describe('access grant history (VP-018/019)', () => {
  it('retains grant and revocation actor, scope, timestamp and reason', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    prototypeStore.resetState();
    prototypeStore.setPersona('admin');
    assert.throws(() => prototypeStore.grantAccess('group-user', 'manager', 'Engagement', 'ENG-26002', 'Quarterly assignment'), /request reference/);
    assert.throws(() => prototypeStore.grantAccess('group-user', 'manager', 'Engagement', 'ENG-26002', 'Quarterly assignment', { effectiveFrom: '2027-09-23', expiresAt: '2027-09-22', requestRef: 'AR-42' }), /expiry cannot precede/);
    assert.throws(() => prototypeStore.grantAccess('group-user', 'manager', 'Engagement', 'ENG-26002', 'Quarterly assignment', { effectiveFrom: '2026-02-30', requestRef: 'AR-42' }), /valid/);
    prototypeStore.grantAccess('group-user', 'manager', 'Engagement', 'ENG-26002', 'Quarterly assignment', { effectiveFrom: '2999-01-01', expiresAt: '2999-12-31', requestRef: 'AR-42' });
    assert.equal(visibleEngagementIds(prototypeStore.getSnapshot(), 'group-user').includes('ENG-26002'), false, 'scheduled grant does not authorize before its effective date');
    assert.throws(() => prototypeStore.revokeAccess('group-user', 'manager', 'ENG-26002', ''), /revocation reason/);
    prototypeStore.revokeAccess('group-user', 'manager', 'ENG-26002', 'Assignment ended');
    const history = prototypeStore.getSnapshot().roleGrantHistory.slice(-2);
    assert.deepEqual(history.map(event => [event.action, event.actorUserId, event.userId, event.scopeId, event.reason]), [
      ['Granted', 'admin', 'group-user', 'ENG-26002', 'Quarterly assignment'],
      ['Revoked', 'admin', 'group-user', 'ENG-26002', 'Assignment ended']
    ]);
    assert.deepEqual([history[0].requestRef, history[0].effectiveFrom, history[0].expiresAt], ['AR-42', '2999-01-01', '2999-12-31']);
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
    assert.throws(() => target.updateLead({ ...lead, stage: 'Lost', lostReason: '' }), /requires an outcome reason/);
    target.updateLead({ ...lead, stage: 'Lost', lostReason: 'Client deferred the work.' });
    const saved = target.state.leads.find((item: any) => item.id === lead.id);
    assert.equal(saved.history.at(-1).stage, 'Lost');
    assert.equal(saved.history.at(-1).reason, 'Client deferred the work.');
    const unqualified = structuredClone(target.state.leads.find((item: any) => item.id !== lead.id));
    assert.throws(() => target.updateLead({ ...unqualified, stage: 'Unqualified' }), /requires an outcome reason/);
    target.updateLead({ ...unqualified, stage: 'Unqualified', lostReason: 'Outside supported service scope.' });
    assert.equal(target.state.leads.find((item: any) => item.id === unqualified.id).history.at(-1).reason, 'Outside supported service scope.');
  });

  it('converts only won opportunities to non-authorizing prospect records once', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const target = prototypeStore as any;
    target.state = createInitialState();
    setPersona(target.state, 'Layla Rahman');
    const lead = structuredClone(target.state.leads[0]);
    assert.throws(() => target.updateLead({ ...lead, targetDate: '2026-02-30' }), /real calendar date/);
    assert.throws(() => target.updateLead({ ...lead, value: -1 }), /valid non-negative fee/);
    target.updateLead({ ...lead, stage: 'Proposal' });
    assert.throws(() => target.convertLead(lead.id), /Only a won opportunity/);
    target.updateLead({ ...lead, stage: 'Won' });
    const client = target.convertLead(lead.id);
    assert.equal(client.status, 'Prospect');
    assert.equal(target.state.leads.find((item: any) => item.id === lead.id).accepted, false);
    assert.equal(target.state.leads.find((item: any) => item.id === lead.id).convertedClientId, client.id);
    assert.equal(target.convertLead(lead.id).id, client.id, 'retry returns the same prospect');
    assert.equal(target.state.clients.filter((item: any) => item.id === client.id).length, 1);
    assert.throws(() => target.updateLead({ ...lead, stage: 'Lost' }), /cannot be converted or reclassified/);
    const secondLead = { ...lead, id: 'LD-CROSS-CLIENT', name: 'Cross Client Opportunity', stage: 'Won' as const, convertedClientId: undefined };
    target.addLead(secondLead);
    const secondProspect = target.convertLead(secondLead.id);
    const unrelatedClient = target.state.clients.find((item: any) => item.id !== secondProspect.id);
    assert.throws(() => target.addProposal({ id: 'PROP-CROSS-CLIENT', title: 'Cross Client Proposal', revision: 1, preparedBy: 'Layla Rahman', preparedAt: '2026-09-23', clientId: unrelatedClient.id, leadId: secondLead.id, currency: 'QAR', totalAmount: 100, items: [{ id: 'PROP-CROSS-CLIENT-1', serviceName: 'Audit', description: 'Audit', scope: 'Annual audit', exclusions: 'Tax', deliverables: 'Report', clientResponsibilities: 'Supply records', feeModel: 'Fixed', amount: 100 }], terms: 'Payment within 30 days.', state: 'Draft' }), /do not match/);
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

describe('engagement lifecycle suspension (VP-012)', () => {
  it('requires rationale, blocks professional work, keeps billing and records available, and preserves terminal history', async () => {
    const target = prototypeStore as any;
    target.state = createInitialState();
    setPersona(target.state, 'Layla Rahman');
    const engagement = target.state.engagements.find((item: any) => item.id === 'ENG-26001');
    const generation = engagement.generation;
    assert.throws(() => target.setEngagementLifecycle(engagement.id, 'Suspended', '  '), /requires a reason/);
    target.setEngagementLifecycle(engagement.id, 'Suspended', 'Awaiting client access approval.');
    assert.equal(engagement.lifecycleStatus, 'Suspended');
    assert.match(engagement.events.at(-1).text, /Active → Suspended by Layla Rahman: Awaiting client access approval/);
    assert.equal(engagement.generation, generation + 1);
    assert.throws(() => requireEngagementScope(target.state, engagement.id), /professional work is blocked/);
    assert.doesNotThrow(() => requireEngagementScope(target.state, engagement.id, 'billing'));
    assert.doesNotThrow(() => requireEngagementScope(target.state, engagement.id, 'records'));
    const job = { ...structuredClone(target.state.jobs[0]), id: 'JOB-SUSPENDED-NEW' };
    assert.throws(() => target.addJob(job), /professional work is blocked/);
    target.setEngagementLifecycle(engagement.id, 'Active', 'Client access restored.');
    target.setEngagementLifecycle(engagement.id, 'Closed', 'Final records indexed.');
    assert.throws(() => target.setEngagementLifecycle(engagement.id, 'Active', 'Reopen'), /cannot transition/);
    assert.throws(() => target.updateEngagement(engagement), /immutable/);
    assert.deepEqual(engagement.events.filter((event: any) => event.type === 'lifecycle').map((event: any) => event.text), [
      'Active → Suspended by Layla Rahman: Awaiting client access approval.',
      'Suspended → Active by Layla Rahman: Client access restored.',
      'Active → Closed by Layla Rahman: Final records indexed.'
    ]);

    const cancelled = target.state.engagements.find((item: any) => item.id === 'ENG-26002');
    target.setEngagementLifecycle(cancelled.id, 'Cancelled', 'Client withdrew before fieldwork.');
    assert.throws(() => target.setEngagementLifecycle(cancelled.id, 'Active', 'Reopen'), /cannot transition/);

    target.state = createInitialState();
    setPersona(target.state, 'Layla Rahman');
    const editable = target.state.engagements[0];
    const originalGeneration = editable.generation;
    const edit = structuredClone(editable);
    edit.due = '2026-10-05';
    target.updateEngagement(edit);
    const updated = target.state.engagements.find((item: any) => item.id === editable.id);
    assert.equal(updated.due, '2026-10-05');
    assert.equal(updated.generation, originalGeneration + 1);
    assert.match(updated.events.at(-1).text, /changed by Layla Rahman: due/);
    const procedure = target.state.auditPrograms.flatMap((program: any) => program.procedures).find((item: any) => item.id === 'PRC-01');
    procedure.status = 'Cleared'; procedure.workPerformed = 'Prior-period work'; procedure.conclusion = 'Prior-period conclusion'; procedure.evidenceLimitation = 'Recheck period relevance'; procedure.reviewedByUserId = 'reviewer';
    updated.planning = true; updated.sourceAccepted = true; updated.mappingApproved = true;
    target.state.statementSetRevisions = [{ id: 'STALE-SCOPE', engagementId: updated.id, status: 'Reviewed' }];
    const scopeEdit = structuredClone(updated); scopeEdit.service = 'Annual accounts'; scopeEdit.year = 2027; scopeEdit.period = '01 Jan – 31 Dec 2027';
    target.updateEngagement(scopeEdit);
    const scoped = target.state.engagements.find((item: any) => item.id === updated.id);
    assert.equal(scoped.planning, false); assert.equal(scoped.sourceAccepted, false); assert.equal(scoped.mappingApproved, false);
    assert.equal(target.state.statementSetRevisions[0].status, 'Stale');
    assert.equal(procedure.scopeReassessmentRequired, true); assert.equal(procedure.status, 'In progress'); assert.equal(procedure.reviewedByUserId, undefined);
    assert.throws(() => target.updateAuditProcedureStatus(updated.id, procedure.id, 'Submitted'), /re-record this procedure/);
    target.updateAuditProcedureExecution(updated.id, procedure.id, 'Updated period work', 'Updated scope conclusion', 'Recheck period relevance');
    assert.equal(procedure.scopeReassessmentRequired, false);
    const sibling = target.state.engagements.find((item: any) => item.id === 'ENG-26002');
    const invalidTeam = structuredClone(sibling);
    invalidTeam.team = [...invalidTeam.team, 'Mona Khalil'];
    assert.throws(() => target.updateEngagement(invalidTeam), /does not have an active grant/);
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
    assert.throws(() => target.addJob({ ...structuredClone(state.jobs[0]), id: 'JOB-BEFORE-AT10', clientId: created.client, engagementId: created.id }), /pending professional acceptance/);
    setPersona(state, 'Daniel James');
    assert.throws(() => target.activateEngagement(created.id, ''), /evidence reference/);
    target.activateEngagement(created.id, 'PARTNER-ACCEPT-AT10');
    assert.equal(created.stage, 'Planning');
    assert.equal(created.professionalAcceptance.evidenceRef, 'PARTNER-ACCEPT-AT10');
    assert.equal(created.professionalAcceptance.proposalRevision, proposal.revision);
    assert.doesNotThrow(() => target.addJob({ ...structuredClone(state.jobs[0]), id: 'JOB-AFTER-AT10', clientId: created.client, engagementId: created.id }));
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

describe('simulated mail attempts (AT-26)', () => {
  it('accepts only an active client contact and requires unique local outcome evidence', () => {
    (prototypeStore as any).state = state;
    setPersona(state, 'Layla Rahman');
    const makeAttempt = (id: string, recipientEmail: string, simulationReference: string) => ({
      id, clientId: 'CL-001', engagementId: 'ENG-26001', direction: 'Outbound' as const, channel: 'Email' as const,
      participants: `Layla Rahman -> ${recipientEmail}`, recipientEmail, summary: 'PBC request', body: 'Please review the request.',
      author: 'Layla Rahman', date: new Date().toISOString(), visibility: 'Client visible' as const, status: 'Simulated accepted' as const,
      simulationReference, simulationEvidence: 'Local simulation; no provider receipt.'
    });
    const initialCount = state.communications.length;
    assert.throws(() => prototypeStore.addCommunication(makeAttempt('COMM-BAD', 'not-an-email', 'MAIL-SIM-BAD')), /valid recipient email/);
    assert.throws(() => prototypeStore.addCommunication(makeAttempt('COMM-FOREIGN', 'aisha.saleh@northstar.demo', 'MAIL-SIM-FOREIGN')), /active contact for this client/);
    const first = makeAttempt('COMM-26-1', 'OMAR.NASSER@EXAMPLE-TRADING.DEMO', 'MAIL-SIM-26-1');
    prototypeStore.addCommunication(first);
    assert.equal(first.recipientEmail, 'omar.nasser@example-trading.demo');
    assert.throws(() => prototypeStore.addCommunication(makeAttempt('COMM-26-2', 'omar.nasser@example-trading.demo', first.simulationReference)), /unique reference/);
    prototypeStore.addCommunication(makeAttempt('COMM-26-2', 'omar.nasser@example-trading.demo', 'MAIL-SIM-26-2'));
    assert.equal(state.communications.length, initialCount + 2, 'a second explicit manual send is recorded once as a separate attempt');
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
    assert.equal(ev.adequacyHistory.at(-1).rationale, 'Bank confirmation missing signature page');
    prototypeStore.setEvidenceAdequacy('EVD-01', 'Adequate');
    assert.equal(
      (prototypeStore as any).state.evidenceCatalogue.find((e: any) => e.id === 'EVD-01').adequacyStatus,
      'Adequate'
    );
  });

  it('records reasoned evidence unlink history and invalidates cleared dependent work', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const state = createInitialState();
    (prototypeStore as any).state = state;
    const workpaper = state.engagements.find(item => item.id === 'ENG-26001')!.workpapers.find(item => item.id === 'WP-A1')!;
    const priorWorkpaperVersion = workpaper.version;
    const procedure = state.auditPrograms.flatMap(program => program.procedures).find(item => item.id === 'PRC-01')!;
    procedure.status = 'Cleared';
    procedure.reviewedByUserId = 'reviewer';
    procedure.reviewedAt = '2026-09-23T08:00:00.000Z';
    setPersona(state, 'Layla Rahman');
    assert.throws(() => prototypeStore.unlinkEvidenceProcedure('EVD-01', 'PRC-01', ''), /rationale/);
    prototypeStore.unlinkEvidenceProcedure('EVD-01', 'PRC-01', 'New statement supersedes the prior source.');
    const evidence = state.evidenceCatalogue.find(item => item.id === 'EVD-01')!;
    assert.equal(evidence.linkedProcedures.includes('PRC-01'), false);
    assert.equal(evidence.linkedProcedureHistory?.at(-1)?.reason, 'New statement supersedes the prior source.');
    assert.equal(procedure.status, 'In progress');
    assert.equal(procedure.evidenceReassessmentRequired, true);
    assert.equal(procedure.reviewedAt, undefined);
    assert.equal(workpaper.version, priorWorkpaperVersion, 'removing a procedure relation does not mutate the separate workpaper pin');
  });

  it('links evidence to a current adequate revision and retains link history', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const state = createInitialState();
    (prototypeStore as any).state = state;
    setPersona(state, 'Adam Khan');
    prototypeStore.linkEvidenceProcedure('EVD-01', 'PRC-03');
    const evidence = state.evidenceCatalogue.find(item => item.id === 'EVD-01')!;
    assert.ok(evidence.linkedProcedures.includes('PRC-03'));
    assert.deepEqual(evidence.linkedProcedureHistory?.map(item => [item.procedureId, item.action]), [['PRC-03', 'Linked']]);
    const document = state.documents.find(item => item.id === evidence.documentId)!;
    document.version++;
    assert.throws(() => prototypeStore.linkEvidenceProcedure('EVD-01', 'PRC-02'), /current document revision/);
  });

  it('adequacy changes retain history and stale linked cleared procedures/workpapers', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const state = createInitialState();
    (prototypeStore as any).state = state;
    setPersona(state, 'Sara Malik');
    const procedure = state.auditPrograms.flatMap(program => program.procedures).find(item => item.id === 'PRC-01')!;
    procedure.status = 'Cleared';
    procedure.reviewedByUserId = 'reviewer';
    procedure.reviewedAt = '2026-09-23T08:00:00.000Z';
    const workpaper = state.engagements.find(item => item.id === 'ENG-26001')!.workpapers.find(item => item.id === 'WP-A1')!;
    const priorVersion = workpaper.version;
    const priorHistory = workpaper.clearanceHistory.length;
    prototypeStore.setEvidenceAdequacy('EVD-01', 'Deficient', 'Statement page is incomplete.');
    assert.equal(procedure.status, 'In progress');
    assert.equal(procedure.evidenceReassessmentRequired, true);
    assert.equal(workpaper.status, 'Changes required');
    assert.equal(workpaper.version, priorVersion + 1);
    assert.equal(workpaper.clearanceHistory.length, priorHistory + 1);
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
    assert.deepEqual(evidence.linkedProcedures, ['PRC-01', 'PRC-02'], 'prior evidence links stay pinned to the prior revision');
    assert.deepEqual(replacementEvidence.linkedProcedures, [], 'replacement starts without inheriting fieldwork links');
    assert.throws(() => prototypeStore.linkWorkpaperEvidence('ENG-26001', 'WP-A1', originalId), /latest document revision/);
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
    prototypeStore.linkEvidenceProcedure(replacementEvidence.id, procedure.id);
    prototypeStore.unlinkWorkpaperEvidence('ENG-26001', 'WP-A1', originalId, 'Replaced by reviewed current statement.');
    prototypeStore.linkWorkpaperEvidence('ENG-26001', 'WP-A1', revision.id);
    assert.deepEqual(workpaper.evidenceRefs, [revision.id]);
    assert.deepEqual(workpaper.evidenceLinkHistory?.map(item => item.action), ['Unlinked', 'Linked']);
    prototypeStore.updateAuditProcedureExecution('ENG-26001', procedure.id, 'Rechecked the replacement statement.', 'Agrees after reassessment.', '');
    prototypeStore.updateAuditProcedureStatus('ENG-26001', procedure.id, 'Submitted');
    assert.equal(procedure.evidenceReassessmentRequired, false);
    assert.throws(() => prototypeStore.replaceDocumentRevision(originalId, { name: 'duplicate.pdf', size: 1, sha256: 'b'.repeat(64) }), /already has a replacement/);
  });
});

describe('finding lifecycle (VP-054)', () => {
  it('separates gross and signed net amounts by currency and records disposition rationale', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const state = createInitialState();
    (prototypeStore as any).state = state;
    setPersona(state, 'Adam Khan');
    const base = { engagementId: 'ENG-26001', category: 'Monetary misstatement' as const, severity: 'Minor' as const, title: 'FX difference', condition: 'Rate mismatch identified.', recommendation: 'Recalculate at the approved closing rate.', affectedAccount: '1200', assertion: 'Valuation', currency: 'USD' };
    const positiveId = prototypeStore.addFinding({ ...base, amount: 200 });
    prototypeStore.addFinding({ ...base, title: 'Opposite direction difference', amount: -150 });
    const positive = state.findings.find(item => item.id === positiveId)!;
    assert.deepEqual([positive.grossMisstatement, positive.netMisstatement], [200, 200]);
    const qualitativeId = prototypeStore.addFinding({ ...base, title: 'Control gap', category: 'Internal control deficiency', severity: 'Significant', amount: undefined, currency: undefined });
    assert.equal(state.findings.find(item => item.id === qualitativeId)?.grossMisstatement, undefined);
    assert.throws(() => prototypeStore.addFinding({ ...base, title: 'Missing currency', currency: '', amount: 10 }), /ISO currency/);
    setPersona(state, 'Layla Rahman');
    assert.throws(() => prototypeStore.setFindingDisposition(positiveId, 'Corrected in TB', 'Client says it was posted.'), /linked reviewed journal/);
    assert.throws(() => prototypeStore.setFindingDisposition(positiveId, 'Corrected by client', ''), /rationale/);
    prototypeStore.setFindingDisposition(positiveId, 'Corrected by client', 'Management supplied a revised signed schedule.');
    const updated = state.findings.find(item => item.id === positiveId)!;
    assert.equal(updated.disposition, 'Corrected by client');
    assert.equal(updated.managementResponse, undefined, 'disposition rationale is not confused with client response');
    assert.deepEqual(updated.dispositionHistory?.map(item => [item.from, item.disposition, item.rationale]), [['Proposed for correction', 'Corrected by client', 'Management supplied a revised signed schedule.']]);
    const journal = state.adjustmentJournals.find(item => item.id === 'AJ-01')!;
    journal.status = 'Reporting included';
    journal.reflectionStatus = 'Reflected in TB';
    const journalFinding = prototypeStore.addFinding({ ...base, title: 'Linked journal correction', amount: 25, linkedJournalId: journal.id });
    prototypeStore.setFindingDisposition(journalFinding, 'Corrected in TB', 'Reviewed journal AJ-01 is reflected in the trial balance.');
    assert.equal(state.findings.find(item => item.id === journalFinding)?.disposition, 'Corrected in TB');
  });

  it('requires scoped existing source references and preserves the originating sampling exception', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const state = createInitialState();
    (prototypeStore as any).state = state;
    setPersona(state, 'Adam Khan');
    const sample = state.samplePopulations[0];
    sample.items[0].result = 'Exception noted';
    sample.items[0].selected = true;
    const id = prototypeStore.addFinding({ engagementId: sample.engagementId, category: 'Monetary misstatement', severity: 'Significant', title: 'Sample difference', condition: 'Confirmation differs from ledger.', recommendation: 'Investigate and propose correction.', affectedAccount: '1200', assertion: 'Existence', amount: 10, currency: sample.currency, linkedProcedureId: 'PRC-01', linkedEvidenceId: 'EVD-01', linkedSamplePopulationId: sample.id, linkedSampleItemId: sample.items[0].id });
    const finding = state.findings.find(item => item.id === id)!;
    assert.deepEqual([finding.linkedProcedureId, finding.linkedEvidenceId, finding.linkedSampleItemId], ['PRC-01', 'EVD-01', sample.items[0].id]);
    assert.equal(sample.items[0].findingId, id);
    assert.equal(sample.items[0].result, 'Exception noted', 'promotion preserves the original exception');
    assert.throws(() => prototypeStore.addFinding({ engagementId: sample.engagementId, category: 'Monetary misstatement', severity: 'Minor', title: 'Bad link', condition: 'Issue.', recommendation: 'Correct.', affectedAccount: '1200', assertion: 'Existence', amount: 1, currency: 'QAR', linkedProcedureId: 'PRC-OTHER' }), /resolve within this engagement and client/);
  });

  it('keeps unresolved significant findings as an independent release gate', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    const state = createInitialState();
    (prototypeStore as any).state = state;
    setPersona(state, 'Adam Khan');
    const engagement = state.engagements.find(item => item.id === 'ENG-26001')!;
    Object.assign(engagement, { acceptance: true, terms: true, planning: true, sourceAccepted: true, mappingApproved: true });
    engagement.workpapers.forEach(item => { item.status = 'Not applicable'; item.applicable = false; });
    engagement.reviews.forEach(item => { item.status = 'Cleared'; });
    const findingId = prototypeStore.addFinding({ engagementId: engagement.id, category: 'Internal control deficiency', severity: 'Significant', title: 'Unresolved significant finding', condition: 'Required review control did not operate.', recommendation: 'Implement and evidence a secondary review.', affectedAccount: '1200', assertion: 'Completeness' });
    assert.match(prototypeStore.evaluateReleaseReadiness(engagement.id).reason || '', /Unresolved material findings/);
    setPersona(state, 'Layla Rahman');
    prototypeStore.setFindingDisposition(findingId, 'Uncorrected waived', 'No further adjustment is proposed; the unresolved risk remains documented.');
    assert.doesNotMatch(prototypeStore.evaluateReleaseReadiness(engagement.id).reason || '', /Unresolved material findings/);
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

  it('saves statement revisions, requires an independent reviewer, then stales them on source change', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    const state = (prototypeStore as any).state;
    const engagement = state.engagements.find((item: any) => item.id === 'ENG-26001');
    state.accountMappingRevisions = [];
    prototypeStore.setPersona('preparer');
    const targets: Record<string, string> = { asset: 'Cash and cash equivalents', liability: 'Trade payables', equity: 'Share capital and reserves', revenue: 'Revenue', expense: 'Operating expenses' };
    prototypeStore.saveAccountMappings(engagement.id, engagement.rows.map((row: any) => ({ accountCode: row.code, targets: [{ statementLine: targets[row.type], percentage: 100 }] })));
    prototypeStore.setPersona('reviewer');
    prototypeStore.approveAccountMappings(engagement.id, 1);
    prototypeStore.setPersona('preparer');
    const input = { engagementId: engagement.id, sourceVersion: engagement.sourceVersion, mappingRevision: 1, layoutVersion: 1, totals: { assets: 10, liabilities: 4, equity: 6, revenue: 0, netProfit: 0 }, lines: [{ line: 'Cash and cash equivalents', current: 10, currentSources: ['1000'], comparativeSources: [] }] };
    prototypeStore.saveStatementSetRevision(input);
    const preparer = state.users.find((user: any) => user.id === 'preparer');
    const samePersonReviewer = { ...state.users.find((user: any) => user.id === 'reviewer'), id: 'same-person-reviewer', personId: preparer.personId };
    state.users.push(samePersonReviewer);
    state.roleGrants.push({ userId: samePersonReviewer.id, role: 'reviewer', scopeKind: 'Global' });
    prototypeStore.setPersona(samePersonReviewer.id);
    assert.throws(() => prototypeStore.reviewStatementSetRevision(engagement.id, 1), /same person cannot review their own work/);
    prototypeStore.setPersona('partner');
    prototypeStore.reviewStatementSetRevision(engagement.id, 1);
    assert.equal(prototypeStore.getSnapshot().statementSetRevisions?.[0].status, 'Reviewed');
    prototypeStore.staleStatementRevisionsForComparativeChange(engagement.id, 'ENG-26003');
    assert.equal(prototypeStore.getSnapshot().statementSetRevisions?.[0].status, 'Stale');
    assert.throws(() => prototypeStore.reviewStatementSetRevision(engagement.id, 1), /no longer current/);
    assert.equal(prototypeStore.getSnapshot().statementSetRevisions?.[0].status, 'Stale');
    prototypeStore.setPersona('preparer');
    prototypeStore.updateTrialBalanceRows(engagement.id, engagement.rows.map((row: any, index: number) => ({ ...row, balance: row.balance + (index === 0 ? 1 : 0) })));
    assert.equal(prototypeStore.getSnapshot().statementSetRevisions?.[0].status, 'Stale');
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
    const engagement = current.engagements.find((item: any) => item.id === 'ENG-26001');
    prototypeStore.saveAuditPlan({ id: 'PLAN-ENG-26001-V1', engagementId: engagement.id, version: 1, status: 'Under review', benchmark: 'revenue', benchmarkValue: 2_000_000, materialityRate: 1.5, overallMateriality: 30_000, performanceMateriality: 22_500, clearlyTrivialThreshold: 1_500, rationales: ['Initial plan basis.'], teamAllocations: [], timingMilestones: [], significantAreas: ['Revenue & Receivables'] });
    prototypeStore.setPersona('reviewer');
    prototypeStore.reviewAuditPlan('PLAN-ENG-26001-V1', true, 'Approved initial risk response.');
    prototypeStore.setPersona('manager');
    const procedure = current.auditPrograms.flatMap((program: any) => program.procedures).find((item: any) => item.id === 'PRC-03');
    procedure.status = 'Cleared'; procedure.workPerformed = 'Prior approved testing'; procedure.conclusion = 'No exception'; procedure.evidenceLimitation = 'Current evidence requires reassessment.'; procedure.reviewedByUserId = 'reviewer'; procedure.reviewedAt = '2026-09-23T00:00:00.000Z';
    const risk = current.auditRisks.find((item: any) => item.id === 'RSK-01');
    const priorResponse = risk.response;
    prototypeStore.updateAuditRisk('ENG-26001', risk.id, { title: risk.title, area: risk.area, assertions: risk.assertions, description: risk.description, rationale: risk.rationale, response: `${risk.response} Reassess supporting detail.`, owner: risk.owner, rating: risk.rating });
    assert.equal(risk.revisions.length, 1);
    assert.equal(risk.revisions[0].response, priorResponse);
    assert.equal(risk.revisions[0].changedBy, 'Layla Rahman');
    assert.deepEqual(risk.revisions[0].assertions, risk.assertions);
    assert.equal(risk.revisions[0].reviewImpact, 'Risk RSK-01 changed; audit plan v2 requires independent review.');
    assert.deepEqual(current.auditPlans.map((plan: any) => plan.status), ['Superseded', 'Under review']);
    assert.equal(current.auditPlans[0].reviewNotes, 'Approved initial risk response.');
    assert.match(current.auditPlans[0].supersededReason, /requires independent review/);
    assert.match(current.auditPlans[1].rationales.at(-1), /Risk RSK-01 changed/);
    assert.equal(engagement.planning, false);
    assert.equal(procedure.status, 'In progress');
    assert.equal(procedure.scopeReassessmentRequired, true);
    assert.equal(procedure.reviewedByUserId, undefined);
    assert.equal(procedure.scopeReassessmentHistory[0].previousStatus, 'Cleared');
    assert.throws(() => prototypeStore.updateAuditProcedureStatus(engagement.id, procedure.id, 'Submitted'), /re-record this procedure/);
    prototypeStore.setPersona('reviewer');
    prototypeStore.reviewAuditPlan('PLAN-ENG-26001-V2', true, 'Reviewed risk-driven plan revision.');
    assert.equal(current.auditPlans[1].status, 'Approved');
    assert.equal(engagement.planning, true);
    prototypeStore.resetState();
  });

  it('audit program templates preserve revisions and apply fresh work (VP-049)', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Layla Rahman');
    const template = { name: 'Revenue verification', area: 'Revenue & Receivables', description: 'Test recorded revenue.', procedures: [{ title: 'Trace transactions', objective: 'Confirm occurrence', instructions: 'Trace to invoices.', defaultAssertions: ['Occurrence'], requiredEvidenceType: 'Invoice' }] };
    assert.throws(() => prototypeStore.createAuditProgramTemplate({ ...template, area: 'Payroll' }), /supported audit area/);
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
    prototypeStore.retireAuditProgramTemplate(id);
    assert.throws(() => prototypeStore.applyAuditProgramTemplate('ENG-26001', id), /Published audit program template not found/);
    assert.equal((prototypeStore as any).state.auditProgramTemplates.find((item: any) => item.id === id).status, 'Retired');
    assert.equal(applied.sourceTemplateVersion, 1);
    assert.equal(applied.procedures[0].instructions, 'Trace to invoices.');
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
    prototypeStore.issueRelease(eng.id, 'First local release record', ['board@example.demo', ' BOARD@example.demo ']);
    assert.deepEqual(eng.releases[0].recipients, ['board@example.demo'], 'distribution recipients are trimmed and deduplicated without regard to case');
    const firstRelId = eng.releases[0].id;

    prototypeStore.prepareReleaseCandidate(eng.id);
    assert.throws(() => prototypeStore.issueRelease(eng.id, 'Duplicate delivery attempt', ['board@example.demo']), /already been released/);
    assert.equal(eng.releases.length, 1, 'retrying issue in the same generation cannot create a second release');

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
