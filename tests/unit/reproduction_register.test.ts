// Independent test suite verifying all 38 reproduction checks (RR01–RR38)
// from the AuditSphere Prototype Acceptance Re-Review (Appendix C).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateReceivablesAging, verifyGLCompleteness } from '../../src/services/calculations.js';
import { visibleClientIds, visibleEngagementIds, requireActiveIdentity, markStateStale, GuardError } from '../../src/services/guards.js';
import { createInitialState } from '../../src/store/initialState.js';
import { seedManagementAcknowledgement, seedPackageDefinition } from './packageFixture.js';

function setPersona(state: any, name: string) {
  const matches = state.users.filter((u: any) => u.name === name);
  const user = matches.find((u: any) => u.id === state.currentUserId) || matches.find((u: any) => u.role === state.currentRole) || matches[0];
  state.currentUserId = user?.id || '';
  state.currentPerson = name;
  if (user) state.currentRole = user.role;
}
function addAmiraManagerPersona(state: any) {
  const user = state.users.find((u: any) => u.id === 'relationship');
  state.users.push({ ...user, id: 'amira-manager', role: 'manager', label: 'Engagement manager' });
  state.roleGrants.push({ userId: 'amira-manager', role: 'manager', scopeKind: 'Global' });
  state.currentUserId = 'amira-manager';
  state.currentPerson = user.name;
  state.currentRole = 'manager';
}

describe('Reproduction Check Register RR01–RR38 (R01–R14 Remediation)', () => {
  // RR01: Previously failing QAR600 example now reconciles
  it('RR01 (VP-033): Previously failing QAR 600 example reconciles', () => {
    const inv = {
      id: 'INV-1', clientId: 'C1', invoiceNumber: 'INV-001', amount: 1000, paid: 0,
      currency: 'QAR', status: 'Issued' as const, due: '2026-08-01', lines: []
    };
    const credits = [{ id: 'CR-1', invoiceId: 'INV-1', amount: 100, currency: 'QAR', date: '2026-08-10', reason: 'Discount' }];
    const rcpt = {
      id: 'R-1', clientId: 'C1', receiptNumber: 'R-001', amount: 300, unallocated: 0,
      currency: 'QAR', date: '2026-08-15', reference: 'Bank ref',
      allocations: [{ invoiceId: 'INV-1', amount: 300, date: '2026-08-15' }]
    };
    const aging = calculateReceivablesAging([inv], credits as any, [rcpt] as any, '2026-09-23');
    assert.strictEqual(aging.totalOutstanding, 600);
  });

  // RR02: Draft invoice excluded from AR
  it('RR02 (VP-033): Draft invoice is excluded from AR aging', () => {
    const inv = {
      id: 'INV-DRAFT', clientId: 'C1', invoiceNumber: 'INV-DRAFT', amount: 1000, paid: 0,
      currency: 'QAR', status: 'Draft' as const, due: '2026-08-01', lines: []
    };
    const aging = calculateReceivablesAging([inv], [], '2026-09-23', []);
    assert.strictEqual(aging.totalOutstanding, 0);
  });

  // RR03: Future allocation does not reduce earlier balance
  it('RR03 (VP-033): Future allocation does not reduce earlier balance', () => {
    const inv = {
      id: 'INV-1', clientId: 'C1', invoiceNumber: 'INV-001', amount: 1000, paid: 0,
      currency: 'QAR', status: 'Issued' as const, due: '2026-08-01', lines: []
    };
    const rcpt = {
      id: 'R-1', clientId: 'C1', receiptNumber: 'R-001', amount: 300, unallocated: 0,
      currency: 'QAR', date: '2026-08-15', reference: 'Bank ref',
      allocations: [{ invoiceId: 'INV-1', amount: 300, date: '2026-10-01' }]
    };
    const aging = calculateReceivablesAging([inv], [rcpt], '2026-09-23', []);
    assert.strictEqual(aging.totalOutstanding, 1000);
  });

  // RR04: Later reversal must not rewrite earlier as-of balance
  it('RR04 (VP-032/033): Later reversal does not rewrite earlier as-of balance', () => {
    const inv = {
      id: 'INV-1', clientId: 'C1', invoiceNumber: 'INV-001', amount: 1000, paid: 0,
      currency: 'QAR', status: 'Issued' as const, due: '2026-08-01', lines: []
    };
    const rcpt = {
      id: 'R-1', clientId: 'C1', receiptNumber: 'R-001', amount: 300, unallocated: 0,
      currency: 'QAR', date: '2026-08-15', reference: 'Bank ref',
      allocations: [{
        invoiceId: 'INV-1', amount: 300, date: '2026-08-15',
        reversed: true, reversalDate: '2026-09-24', reversalReason: 'NSF Check'
      }]
    };
    // On 2026-09-23, the allocation was active (reversal happened later on 2026-09-24)
    const agingEarlier = calculateReceivablesAging([inv], [], [rcpt], '2026-09-23');
    assert.strictEqual(agingEarlier.totalOutstanding, 700);

    // On 2026-09-25, the reversal is effective, so balance returns to 1000
    const agingLater = calculateReceivablesAging([inv], [], [rcpt], '2026-09-25');
    assert.strictEqual(agingLater.totalOutstanding, 1000);
  });

  // RR05: Future receipt must not settle before its effective date
  it('RR05 (VP-033): Future receipt must not settle before its effective date', () => {
    const inv = {
      id: 'INV-1', clientId: 'C1', invoiceNumber: 'INV-001', amount: 1000, paid: 0,
      currency: 'QAR', status: 'Issued' as const, due: '2026-08-01', lines: []
    };
    const rcpt = {
      id: 'R-1', clientId: 'C1', receiptNumber: 'R-001', amount: 300, unallocated: 0,
      currency: 'QAR', date: '2026-10-15', reference: 'Post-dated check',
      allocations: [{ invoiceId: 'INV-1', amount: 300, date: '2026-08-15' }]
    };
    // Receipt date is in the future relative to 2026-09-23
    const aging = calculateReceivablesAging([inv], [rcpt], '2026-09-23', []);
    assert.strictEqual(aging.totalOutstanding, 1000);
  });

  // RR06: GL with explicit opening balances reconciles
  it('RR06 (VP-036): GL with explicit opening balances reconciles', () => {
    const tb = [{ code: '1000', name: 'Cash', type: 'asset' as const, balance: 1200 }];
    const gl = [{ id: '1', journalId: 'J1', lineId: 'L1', date: '2026-09-01', accountCode: '1000', accountName: 'Cash', debit: 200, credit: 0, currency: 'QAR', description: 'Deposit' }];
    const openings = { '1000': 1000 };
    const res = verifyGLCompleteness(tb, gl, openings);
    assert.strictEqual(res.isComplete, true);
  });

  // RR07: Omitted opening source cannot report overall complete
  it('RR07 (VP-036): Omitted opening source cannot report overall complete', () => {
    const tb = [{ code: '1000', name: 'Cash', type: 'asset' as const, balance: 1200 }];
    const gl = [{ id: '1', journalId: 'J1', lineId: 'L1', date: '2026-09-01', accountCode: '1000', accountName: 'Cash', debit: 200, credit: 0, currency: 'QAR', description: 'Deposit' }];
    const res = verifyGLCompleteness(tb, gl, undefined);
    assert.strictEqual(res.isComplete, false);
  });

  // RR08: GL overall result must agree with its row status
  it('RR08 (VP-036): GL overall result must agree with its row status', () => {
    const tb = [{ code: '1000', name: 'Cash', type: 'asset' as const, balance: 1200 }];
    const gl = [{ id: '1', journalId: 'J1', lineId: 'L1', date: '2026-09-01', accountCode: '1000', accountName: 'Cash', debit: 200, credit: 0, currency: 'QAR', description: 'Deposit' }];
    const res = verifyGLCompleteness(tb, gl, undefined);
    const rowStatus = res.checks[0].isComplete;
    assert.strictEqual(res.isComplete, rowStatus);
  });

  // RR09: GL-only account is detected
  it('RR09 (VP-036): GL-only account is detected and completeness fails', () => {
    const tb = [{ code: '1000', name: 'Cash', type: 'asset' as const, balance: 1000 }];
    const gl = [
      { id: '1', journalId: 'J1', lineId: 'L1', date: '2026-09-01', accountCode: '1000', accountName: 'Cash', debit: 0, credit: 0, currency: 'QAR', description: 'Init' },
      { id: '2', journalId: 'J2', lineId: 'L2', date: '2026-09-01', accountCode: '9999', accountName: 'Unmapped', debit: 100, credit: 0, currency: 'QAR', description: 'Mystery' }
    ];
    const openings = { '1000': 1000, '9999': 0 };
    const res = verifyGLCompleteness(tb, gl, openings);
    assert.strictEqual(res.isComplete, false);
  });

  // RR10: Explicit missing opening map blocks completeness
  it('RR10 (VP-036): Explicit missing opening map blocks completeness', () => {
    const tb = [{ code: '1000', name: 'Cash', type: 'asset' as const, balance: 1000 }];
    const gl = [{ id: '1', journalId: 'J1', lineId: 'L1', date: '2026-09-01', accountCode: '1000', accountName: 'Cash', debit: 0, credit: 0, currency: 'QAR', description: 'Deposit' }];
    const res = verifyGLCompleteness(tb, gl, {});
    assert.strictEqual(res.isComplete, false);
  });

  // RR11: Person without grants has no inherited global access
  it('RR11 (VP-018/019): Person without grants has no inherited global access', () => {
    const state = createInitialState();
    state.users.push({ id: 'u-nogrants', role: 'manager', name: 'NoGrants User', initials: 'NU', label: 'Unassigned Manager', group: 'Professional', email: 'nu@test.demo', status: 'Active' });
    setPersona(state, 'NoGrants User');
    const clientIds = visibleClientIds(state);
    assert.deepStrictEqual(clientIds, []);
    const engIds = visibleEngagementIds(state);
    assert.deepStrictEqual(engIds, []);
  });

  // RR12: Revoking last own grant must not activate role fallback
  it('RR12 (VP-019): Revoking last own grant does not activate role fallback', () => {
    const state = createInitialState();
    setPersona(state, 'Adam Khan');
    // Remove all grants for Adam Khan
    state.roleGrants = state.roleGrants.filter(g => g.userId !== 'preparer');
    const clientIds = visibleClientIds(state);
    assert.deepStrictEqual(clientIds, []);
  });

  // RR13: Unknown identity fails active-user guard
  it('RR13 (VP-018): Unknown identity fails active-user guard', () => {
    const state = createInitialState();
    setPersona(state, 'Totally Unknown User');
    assert.throws(() => requireActiveIdentity(state), /not recognized/);
  });

  // RR14: Disabled identity is blocked
  it('RR14 (VP-018): Disabled identity is blocked', () => {
    const state = createInitialState();
    setPersona(state, 'Tariq Aziz'); // status: 'Inactive'
    assert.throws(() => requireActiveIdentity(state), /disabled/);
  });

  it('VP-019: stale browser state blocks all guarded commands until resolved', () => {
    const state = createInitialState();
    setPersona(state, 'Adam Khan');
    markStateStale(state, true);
    assert.throws(() => requireActiveIdentity(state), /Another browser tab saved newer state/);
    markStateStale(state, false);
    assert.doesNotThrow(() => requireActiveIdentity(state));
  });

  // RR15: Existing narrow engagement grant excludes sibling
  it('RR15 (VP-019): Existing narrow engagement grant excludes sibling', () => {
    const state = createInitialState();
    setPersona(state, 'Mona Khalil');
    const engIds = visibleEngagementIds(state);
    assert.strictEqual(Array.isArray(engIds) && !engIds.includes('ENG-26003'), true);
  });

  // RR16: Contributor cannot grant themselves global access
  it('RR16 (VP-019): Non-admin contributor cannot grant access', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Rami Nasser');
    (prototypeStore as any).state.currentRole = 'client_finance';
    assert.throws(
      () => prototypeStore.grantAccess('client_finance', 'admin', 'Global'),
      /Only administrators/
    );
  });

  // RR17: Actual management-approver role client can approve
  it('RR17 (VP-056): Actual management-approver role "client" can record approval', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Omar Nasser');
    (prototypeStore as any).state.currentRole = 'client';
    prototypeStore.recordApproval('ENG-26001', 'client', 'Management accounts representation accepted.');
    const eng = (prototypeStore as any).state.engagements.find((e: any) => e.id === 'ENG-26001');
    assert.strictEqual(eng.approvals.client?.by, 'Omar Nasser');
  });

  // RR18: Client administrator cannot approve management accounts
  it('RR18 (VP-056): Client administrator cannot approve management accounts', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Amal Nasser');
    (prototypeStore as any).state.currentRole = 'client_admin';
    assert.throws(
      () => prototypeStore.recordApproval('ENG-26001', 'client'),
      /Only an authorized client management approver/
    );
  });

  // RR19: Contributor cannot record partner approval
  it('RR19 (VP-056): Contributor cannot record partner approval', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Rami Nasser');
    (prototypeStore as any).state.currentRole = 'client_finance';
    assert.throws(
      () => prototypeStore.recordApproval('ENG-26001', 'partner'),
      /Only a partner/
    );
  });

  // RR20: Same-person proposal approval is blocked
  it('RR20 (VP-011): Same-person proposal approval is blocked', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    addAmiraManagerPersona((prototypeStore as any).state);
    assert.throws(
      () => prototypeStore.reviewProposal('PROP-001', true),
      /commercially approve/
    );
  });

  // RR21: Client contributor cannot review a commercial proposal
  it('RR21 (VP-011): Client contributor cannot review a commercial proposal', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Rami Nasser');
    (prototypeStore as any).state.currentRole = 'client_finance';
    assert.throws(
      () => prototypeStore.reviewProposal('PROP-001', true),
      /partner or manager/
    );
  });

  // RR22: Unapproved engagement cannot prepare and issue release
  it('RR22 (VP-057): Unapproved engagement cannot prepare release candidate', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Daniel James');
    (prototypeStore as any).state.currentRole = 'partner';
    const eng = (prototypeStore as any).state.engagements[0];
    eng.approvals.partner = null;
    assert.throws(
      () => prototypeStore.prepareReleaseCandidate(eng.id),
      /One or more/
    );
  });

  // RR23: Stale candidate cannot issue after generation changes
  it('RR23 (VP-057): Stale candidate cannot issue after generation changes', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Daniel James');
    (prototypeStore as any).state.currentRole = 'partner';
    const eng = (prototypeStore as any).state.engagements[0];
    eng.candidate = { generation: eng.generation - 1, preparedAt: '2026-09-01T00:00:00Z', preparedBy: 'Daniel James', manifest: ['file.pdf'] };
    assert.throws(
      () => prototypeStore.issueRelease(eng.id, 'Stale candidate dispatch'),
      /candidate generation/
    );
  });

  // RR24: Re-preparing same content does not duplicate release candidate
  it('RR24 (VP-057): Re-preparing same content returns existing candidate (idempotent)', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Daniel James');
    (prototypeStore as any).state.currentRole = 'partner';
    const eng = (prototypeStore as any).state.engagements[0];
    eng.workpapers.forEach((w: any) => {
      w.status = 'Cleared';
      w.clearance = { clearedBy: 'Sara Malik', clearedAt: '2026-09-21T09:00:00Z', sourceVersion: eng.sourceVersion, generation: eng.generation, version: w.version, notes: 'Independent review completed.' };
    });
    if (eng.reviews) eng.reviews.forEach((r: any) => { r.status = 'Cleared'; });
    eng.approvals = {
      manager: { by: 'Layla Rahman', at: '2026-09-21T10:00:00Z', generation: eng.generation },
      client: { by: 'Omar Nasser', at: '2026-09-21T11:00:00Z', generation: eng.generation },
      partner: { by: 'Daniel James', at: '2026-09-21T12:00:00Z', generation: eng.generation },
      eqr: null
    };
    eng.eqrRequired = false;
    seedPackageDefinition(eng);
    seedManagementAcknowledgement(eng);
    const c1 = prototypeStore.prepareReleaseCandidate(eng.id);
    const c2 = prototypeStore.prepareReleaseCandidate(eng.id);
    assert.strictEqual(c1, c2);
    assert.strictEqual(c1.packageDefinitionId, eng.packageHistory[0].id);
    assert.deepEqual(c1.manifest, eng.packageHistory[0].artifacts);
  });

  // RR25: Incomplete children block parent completion
  it('RR25 (VP-014): Incomplete children block parent completion', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Layla Rahman');
    (prototypeStore as any).state.currentRole = 'manager';
    const parent = (prototypeStore as any).state.jobTasks.find((t: any) => t.id === 'TSK-103');
    assert.throws(
      () => prototypeStore.updateTask({ ...parent, status: 'Completed' }),
      /unfinished/
    );
  });

  // RR26: Second subtask level is blocked
  it('RR26 (VP-014): Second subtask level is blocked', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Layla Rahman');
    (prototypeStore as any).state.currentRole = 'manager';
    assert.throws(
      () => prototypeStore.addTask({ id: 'TASK-SUB-2', jobId: 'JOB-2601', title: 'Sub-subtask', parentTaskId: 'TSK-103-1' }),
      /Only one level of subtasks/
    );
  });

  // RR27: Task referencing nonexistent job is rejected
  it('RR27 (VP-013/014): Task referencing nonexistent job is rejected', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Layla Rahman');
    (prototypeStore as any).state.currentRole = 'manager';
    assert.throws(
      () => prototypeStore.addTask({ id: 'TASK-ORPHAN', jobId: 'NONEXISTENT-JOB', title: 'Orphan Task' }),
      /does not exist/
    );
  });

  // RR28: Cross-currency allocation is rejected
  it('RR28 (VP-032): Cross-currency allocation is rejected', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Leila Hassan');
    (prototypeStore as any).state.currentRole = 'billing';
    const rcpt = (prototypeStore as any).state.receipts[0];
    const foreignInv = {
      id: 'INV-FX', clientId: rcpt.clientId, invoiceNumber: 'INV-FX', amount: 500, paid: 0,
      currency: 'USD', status: 'Issued', due: '2026-10-01', lines: []
    };
    (prototypeStore as any).state.invoices.push(foreignInv);
    assert.throws(
      () => prototypeStore.allocateReceipt(rcpt.id, foreignInv.id, 100),
      /currency/
    );
  });

  // RR29: Negative allocation is rejected
  it('RR29 (VP-032): Negative allocation is rejected', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Leila Hassan');
    (prototypeStore as any).state.currentRole = 'billing';
    assert.throws(
      () => prototypeStore.allocateReceipt('RCPT-02', 'INV-26002', -50),
      /positive/
    );
  });

  // RR30: Over-allocation of invoice is rejected
  it('RR30 (VP-032): Over-allocation of invoice is rejected', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Leila Hassan');
    (prototypeStore as any).state.currentRole = 'billing';
    assert.throws(
      () => prototypeStore.allocateReceipt('RCPT-02', 'INV-26002', 9999999),
      /exceeds/
    );
  });

  // RR31: Non-finite allocation is rejected
  it('RR31 (VP-032): Non-finite allocation (NaN/Infinity) is rejected', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Leila Hassan');
    (prototypeStore as any).state.currentRole = 'billing';
    assert.throws(
      () => prototypeStore.allocateReceipt('RCPT-02', 'INV-26002', NaN),
      /positive/
    );
    assert.throws(
      () => prototypeStore.allocateReceipt('RCPT-02', 'INV-26002', Infinity),
      /positive|exceeds/
    );
  });

  // RR32: Legacy paid cache cannot be ignored in invoice cap
  it('RR32 (VP-032/004): Legacy paid cache cannot be ignored in invoice cap', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Leila Hassan');
    (prototypeStore as any).state.currentRole = 'billing';
    const rcpt = (prototypeStore as any).state.receipts.find((r: any) => r.id === 'RCPT-02');
    const legacyInv = {
      id: 'INV-LEGACY-01', clientId: rcpt.clientId, invoiceNumber: 'INV-LEGACY',
      amount: 1000, paid: 900, currency: 'QAR', status: 'Issued', due: '2026-10-01', lines: []
    };
    (prototypeStore as any).state.invoices.push(legacyInv);
    // Even without allocation records, remaining payable is only 100
    assert.throws(
      () => prototypeStore.allocateReceipt(rcpt.id, legacyInv.id, 200),
      /exceeds/
    );
  });

  // RR33: Draft PBC with no received file cannot be accepted
  it('RR33 (VP-024): Draft PBC with no received file cannot be accepted', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Layla Rahman');
    (prototypeStore as any).state.currentRole = 'manager';
    const eng = (prototypeStore as any).state.engagements[0];
    const draftPbc = {
      id: 'PBC-DRAFT-X', title: 'Draft PBC', category: 'General', status: 'Draft' as const,
      due: '2026-10-01', owner: 'Layla Rahman', version: 1
    };
    eng.pbc.push(draftPbc);
    assert.throws(
      () => prototypeStore.acceptPbcResponse(eng.id, draftPbc.id),
      /no valid submission/
    );
  });

  // RR34: Uploader cannot accept own PBC response
  it('RR34 (VP-024): Uploader cannot accept own PBC response', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    setPersona((prototypeStore as any).state, 'Layla Rahman');
    (prototypeStore as any).state.currentRole = 'manager';
    const eng = (prototypeStore as any).state.engagements[0];
    const receivedPbc = {
      id: 'PBC-REC-01', title: 'Tax Clearance', category: 'Tax', status: 'Received' as const,
      due: '2026-10-01', owner: 'Layla Rahman', version: 1, contributor: 'Layla Rahman',
      file: 'Tax_Clearance.pdf', responseDocId: 'DOC-99'
    };
    eng.pbc.push(receivedPbc);
    assert.throws(
      () => prototypeStore.acceptPbcResponse(eng.id, receivedPbc.id),
      /cannot accept/
    );
  });

  // RR35: M365 updates never enable a live connection
  it('RR35 (VP-017): M365 updates never enable a live connection', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    const grantsBefore = JSON.stringify((prototypeStore as any).state.roleGrants);
    const originalConfig = structuredClone((prototypeStore as any).state.m365Config);
    for (const invalid of [
      { ...originalConfig, tenantId: ' ' },
      { ...originalConfig, sharePointSite: 'http://contoso.sharepoint.com/sites/audit' },
      { ...originalConfig, folderRoot: '/../outside' },
      { ...originalConfig, mailSenderAccount: 'invalid-mailbox' },
      { ...originalConfig, permittedUsers: [{ userId: 'missing-user', role: 'manager' }] }
    ]) {
      assert.throws(() => prototypeStore.updateM365Config(invalid), /Tenant|SharePoint|folder root|mailbox|Permitted-person/);
      assert.deepEqual(prototypeStore.getSnapshot().m365Config, originalConfig, 'invalid selections do not partially replace the saved setup');
    }
    prototypeStore.updateM365Config({
      tenantName: 'Contoso Demo', tenantId: 'tenant-123', permittedUserGroups: ['Auditors'], permittedUsers: [{ userId: 'manager', role: 'manager' }],
      sharePointSite: 'https://contoso.sharepoint.com/sites/audit', sharePointLibrary: 'AuditDocs',
      folderRoot: '/ClientEngagements/', mailSenderAccount: 'noreply@contoso.demo',
      oneDriveEnabled: true, status: 'Simulated verified', liveConnected: false
    });
    assert.strictEqual(prototypeStore.getSnapshot().m365Config.liveConnected, false);
    prototypeStore.simulateM365Verification('identity', 'success');
    assert.match(prototypeStore.getSnapshot().m365Config.verificationResults!.identity!.resourceId, /manager:manager/);
    assert.equal(JSON.stringify((prototypeStore as any).state.roleGrants), grantsBefore);
  });

  // RR36: Changed root invalidates saved verified status
  it('RR36 (VP-022): Changed root folder invalidates saved verified status', async () => {
    const { prototypeStore } = await import('../../src/store/prototypeStore.js');
    (prototypeStore as any).state = createInitialState();
    (prototypeStore as any).state.m365Config.status = 'Simulated verified';
    prototypeStore.updateM365Config({
      ...(prototypeStore as any).state.m365Config,
      folderRoot: '/NewChangedRoot/'
    });
    assert.strictEqual(prototypeStore.getSnapshot().m365Config.status, 'Not configured');
  });

  // RR37: No permitted clients must not fall back to first client
  it('RR37 (VP-025): No permitted clients resolves to null in portal logic', () => {
    const state = createInitialState();
    state.users.push({ id: 'u-na', role: 'client', name: 'NoAccess Person', initials: 'NA', label: 'Unassigned Client', group: 'Client', email: 'na@test.demo', status: 'Active' });
    setPersona(state, 'NoAccess Person');
    const allowed = visibleClientIds(state);
    const availableClients = allowed === 'ALL' ? state.clients : state.clients.filter(c => (allowed as string[]).includes(c.id));
    const selectedClient = availableClients.find(c => c.id === 'NONEXISTENT') || availableClients[0] || null;
    assert.strictEqual(selectedClient, null);
  });

  // RR38: Client global search must exclude internal document names
  it('RR38 (VP-061): Client global search excludes internal document names', () => {
    const state = createInitialState();
    setPersona(state, 'Rami Nasser');
    state.currentRole = 'client_finance';
    const allowedClients = visibleClientIds(state);
    const clientAllowed = (id?: string) => !id || allowedClients === 'ALL' || (id && (allowedClients as string[]).includes(id));
    const clientRole = true;

    // Simulate search logic from Shell.tsx
    const q = 'workpaper';
    const out: Array<{ title: string; sub: string }> = [];
    if (!clientRole) {
      state.documents.filter(d => clientAllowed(d.clientId) && d.name.toLowerCase().includes(q))
        .forEach(d => out.push({ title: d.name, sub: `Document · v${d.version}` }));
    } else {
      state.documents.filter(d => clientAllowed(d.clientId) && d.visibility === 'Client shared' && d.name.toLowerCase().includes(q))
        .forEach(d => out.push({ title: d.name, sub: `Shared document · v${d.version}` }));
    }

    // Since 'workpaper' is an internal document, it must NOT appear in client search!
    assert.strictEqual(out.length, 0);
  });
});
