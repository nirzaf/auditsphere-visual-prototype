// Lifecycle-completion guards (MOD-06/14/22/29/30/34/39).
// Covers the closure of audit-identified lifecycle dead-ends: adjustment
// "Reporting included" reachability from a live session, reasoned invoice
// returns, firm-settings prospective save, reasoned fieldwork returns,
// risk creation, and reasoned template retirement.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../../src/store/initialState.js';
import { prototypeStore } from '../../src/store/prototypeStore.js';
import { migratePersistedState } from '../../src/services/migrations.js';
import type { PrototypeState } from '../../src/types/index.js';

let state: PrototypeState;

function setPersona(state: PrototypeState, name: string) {
  const matches = state.users.filter(u => u.name === name);
  const user = matches.find(u => u.id === state.currentUserId) || matches.find(u => u.role === state.currentRole) || matches[0];
  state.currentUserId = user?.id || '';
  state.currentPerson = name;
  if (user) state.currentRole = user.role;
}

beforeEach(() => {
  state = createInitialState();
  (prototypeStore as any).state = state;
});

describe('adjustment reporting inclusion chain (MOD-22/MOD-34)', () => {
  it('technical-review rejection requires and records a bounded rationale', () => {
    setPersona(state, 'Adam Khan');
    prototypeStore.addAdjustmentJournal({
      id: 'AJ-REJECT-NOTE', engagementId: 'ENG-26001', title: 'Rejection reason fixture', status: 'Draft',
      preparedBy: 'Adam Khan', reflectionStatus: 'Not reflected', reflectedInClientBooks: false,
      lines: [
        { accountCode: '5000', accountName: 'Operating expenses', type: 'debit', amount: 90, debit: 90, credit: 0 },
        { accountCode: '1500', accountName: 'Property, plant and equipment', type: 'credit', amount: 90, debit: 0, credit: 90 }
      ]
    });
    setPersona(state, 'Layla Rahman');
    assert.throws(() => prototypeStore.reviewAdjustmentJournal('AJ-REJECT-NOTE', false), /requires a bounded technical-review rationale/);
    assert.throws(() => prototypeStore.reviewAdjustmentJournal('AJ-REJECT-NOTE', false, 'x'.repeat(501)), /requires a bounded technical-review rationale/);
    prototypeStore.reviewAdjustmentJournal('AJ-REJECT-NOTE', false, 'Support schedule does not tie to the asset register.');
    const rejected = state.adjustmentJournals.find(j => j.id === 'AJ-REJECT-NOTE')!;
    assert.equal(rejected.status, 'Rejected');
    assert.equal(rejected.reviewNote, 'Support schedule does not tie to the asset register.');
    assert.equal(rejected.reviewedBy, 'Layla Rahman');
  });

  it('reporting inclusion requires management acceptance and current reflected-TB evidence', () => {
    setPersona(state, 'Adam Khan');
    prototypeStore.addAdjustmentJournal({
      id: 'AJ-INCLUDE', engagementId: 'ENG-26001', title: 'Reporting inclusion fixture', status: 'Draft',
      preparedBy: 'Adam Khan', reflectionStatus: 'Not reflected', reflectedInClientBooks: false,
      lines: [
        { accountCode: '5000', accountName: 'Operating expenses', type: 'debit', amount: 120, debit: 120, credit: 0 },
        { accountCode: '1500', accountName: 'Property, plant and equipment', type: 'credit', amount: 120, debit: 0, credit: 120 }
      ]
    });
    setPersona(state, 'Layla Rahman');
    assert.throws(() => prototypeStore.markAdjustmentJournalReportingIncluded('AJ-INCLUDE'), /management-accepted/);
    prototypeStore.reviewAdjustmentJournal('AJ-INCLUDE', true);
    assert.throws(() => prototypeStore.markAdjustmentJournalReportingIncluded('AJ-INCLUDE'), /management-accepted/);
    setPersona(state, 'Omar Nasser');
    prototypeStore.recordAdjustmentManagementDecision('AJ-INCLUDE', true);
    setPersona(state, 'Layla Rahman');
    assert.throws(() => prototypeStore.markAdjustmentJournalReportingIncluded('AJ-INCLUDE'), /reflected in the current trial balance/);
    assert.throws(() => prototypeStore.updateAdjustmentJournal({ ...state.adjustmentJournals.find(j => j.id === 'AJ-INCLUDE')!, reflectionStatus: 'Reflected in TB', reflectedInClientBooks: true, reflectionSourceVersion: 1 }), /requires an evidence reference/);
    prototypeStore.updateAdjustmentJournal({ ...state.adjustmentJournals.find(j => j.id === 'AJ-INCLUDE')!, reflectionStatus: 'Reflected in TB', reflectedInClientBooks: true, reflectionSourceVersion: 1, reflectionEvidenceRef: 'TB-IMPORT-REV-1' });
    prototypeStore.markAdjustmentJournalReportingIncluded('AJ-INCLUDE');
    const included = state.adjustmentJournals.find(j => j.id === 'AJ-INCLUDE')!;
    assert.equal(included.status, 'Reporting included');
    assert.equal(included.reportingIncludedBy, 'Layla Rahman');
    assert.ok(included.reportingIncludedAt);
  });

  it('a linked finding is then dispositionable as Corrected in TB from a live session', () => {
    const journal = state.adjustmentJournals.find(j => j.id === 'AJ-01')!;
    assert.equal(journal.status, 'Management accepted', 'seeded fixture is management-accepted');
    setPersona(state, 'Layla Rahman');
    prototypeStore.updateAdjustmentJournal({ ...journal, reflectionStatus: 'Reflected in TB', reflectedInClientBooks: true, reflectionSourceVersion: 1, reflectionEvidenceRef: 'TB-IMPORT-REV-1' });
    prototypeStore.markAdjustmentJournalReportingIncluded('AJ-01');
    assert.equal(state.adjustmentJournals.find(j => j.id === 'AJ-01')!.status, 'Reporting included');
    setPersona(state, 'Adam Khan');
    const findingId = prototypeStore.addFinding({ engagementId: 'ENG-26001', category: 'Monetary misstatement', severity: 'Minor', title: 'Live corrected-in-TB chain', condition: 'Journal AJ-01 posts the correction.', recommendation: 'Accept the posted correction.', affectedAccount: '1500', assertion: 'Valuation', amount: 25, currency: 'QAR', linkedJournalId: journal.id });
    setPersona(state, 'Layla Rahman');
    prototypeStore.setFindingDisposition(findingId, 'Corrected in TB', 'Journal AJ-01 is reflected at the current source revision.');
    assert.equal(state.findings.find(f => f.id === findingId)?.disposition, 'Corrected in TB');
  });
});

describe('invoice reasoned return and rework (MOD-14)', () => {
  it('returns a draft with a recorded reviewer note and clears it on approval or revision', () => {
    setPersona(state, 'Layla Rahman');
    assert.throws(() => prototypeStore.reviewInvoice('INV-26003', false), /requires a bounded review note/);
    assert.throws(() => prototypeStore.reviewInvoice('INV-26003', false, 'x'.repeat(501)), /requires a bounded review note/);
    prototypeStore.reviewInvoice('INV-26003', false, 'Retainer period does not match the signed proposal.');
    let draft = state.invoices.find(i => i.id === 'INV-26003')!;
    assert.equal(draft.status, 'Draft');
    assert.equal(draft.reviewNote, 'Retainer period does not match the signed proposal.');
    assert.equal(draft.commercialApproval, undefined, 'a returned draft carries no approval');
    assert.ok(state.events.some(event => event.text.includes('returned for changes')), 'return is logged with its reason');
    setPersona(state, 'Leila Hassan');
    prototypeStore.reviseInvoiceDraft('INV-26003', {
      description: 'Annual compilation retainer (revised period)',
      due: draft.due,
      amount: draft.amount,
      lines: draft.lines,
      reason: 'Period corrected per signed proposal.'
    });
    draft = state.invoices.find(i => i.id === 'INV-26003')!;
    assert.equal(draft.revision, 2);
    assert.equal(draft.reviewNote, undefined, 'rework addresses the recorded return note');
    setPersona(state, 'Daniel James');
    prototypeStore.reviewInvoice('INV-26003', true);
    const approved = state.invoices.find(i => i.id === 'INV-26003')!;
    assert.equal(approved.status, 'Approved');
    assert.equal(approved.reviewNote, undefined);
    assert.equal(approved.commercialApproval?.by, 'Daniel James');
  });
});

describe('firm settings prospective save (MOD-39)', () => {
  it('rejects non-admins and atomically rejects invalid patches', () => {
    setPersona(state, 'Layla Rahman');
    assert.throws(() => prototypeStore.updateFirmSettings({ firmName: 'X' }), /Only administrators/);
    setPersona(state, 'Khalid Al-Nuaimi');
    assert.throws(() => prototypeStore.updateFirmSettings({ firmName: '   ' }), /Firm name/);
    assert.throws(() => prototypeStore.updateFirmSettings({ currency: 'Qatari Riyal' }), /three-letter ISO/);
    assert.throws(() => prototypeStore.updateFirmSettings({ invoiceNextNumber: 0 }), /positive whole number/);
    assert.throws(() => prototypeStore.updateFirmSettings({ paymentTermsDays: 400 }), /between 0 and 365/);
    assert.throws(() => prototypeStore.updateFirmSettings({ jurisdiction: '' }), /Jurisdiction/);
    const before = structuredClone(state.firmSettings);
    assert.throws(() => prototypeStore.updateFirmSettings({ currency: 'EURO' }), /three-letter ISO/);
    assert.deepEqual(state.firmSettings, before, 'invalid patch does not partially apply');
  });

  it('saves a valid patch prospectively with a logged reason', () => {
    setPersona(state, 'Khalid Al-Nuaimi');
    prototypeStore.updateFirmSettings({ firmLegalName: 'STE Audit & Accounting L.L.C.', jurisdiction: 'State of Qatar', paymentTermsDays: 45 }, 'Legal-name refresh');
    assert.equal(state.firmSettings.firmLegalName, 'STE Audit & Accounting L.L.C.');
    assert.equal(state.firmSettings.paymentTermsDays, 45);
    assert.equal(state.firmSettings.firmName, 'STE Audit & Accounting', 'untouched fields are preserved');
    assert.ok(state.events.some(event => event.ref === 'FIRM' && event.text.includes('Legal-name refresh')), 'change is logged with its reason');
  });
});

describe('fieldwork reasoned return (MOD-30)', () => {
  it('requires a reason to return submitted or cleared fieldwork and records it', () => {
    setPersona(state, 'Layla Rahman');
    assert.throws(() => prototypeStore.updateAuditProcedureStatus('ENG-26001', 'PRC-01', 'In progress'), /requires a bounded reason/);
    assert.throws(() => prototypeStore.updateAuditProcedureStatus('ENG-26001', 'PRC-01', 'In progress', 'x'.repeat(501)), /requires a bounded reason/);
    prototypeStore.updateAuditProcedureStatus('ENG-26001', 'PRC-01', 'In progress', 'Confirmation letter lacks the authorized signatory.');
    const returned = state.auditPrograms.find(p => p.id === 'PRG-01')!.procedures.find(p => p.id === 'PRC-01')!;
    assert.equal(returned.status, 'In progress');
    assert.equal(returned.returnReason, 'Confirmation letter lacks the authorized signatory.');
    assert.equal(returned.returnedByUserId, state.currentUserId);
    assert.ok(returned.returnedAt);
    assert.equal(returned.reviewedByUserId, undefined, 'return clears the prior review');
  });

  it('supports the rework cycle back to an independent clearance', () => {
    setPersona(state, 'Layla Rahman');
    prototypeStore.updateAuditProcedureStatus('ENG-26001', 'PRC-01', 'In progress', 'Signatory evidence required.');
    setPersona(state, 'Adam Khan');
    prototypeStore.updateAuditProcedureExecution('ENG-26001', 'PRC-01', 'Re-obtained confirmation with the authorized signatory.', 'Satisfactory', '');
    prototypeStore.updateAuditProcedureStatus('ENG-26001', 'PRC-01', 'Submitted');
    const submitted = state.auditPrograms.find(p => p.id === 'PRG-01')!.procedures.find(p => p.id === 'PRC-01')!;
    assert.equal(submitted.status, 'Submitted');
    assert.equal(submitted.returnReason, 'Signatory evidence required.', 'the preparer can still see why the work was returned');
    setPersona(state, 'Layla Rahman');
    prototypeStore.updateAuditProcedureStatus('ENG-26001', 'PRC-01', 'Cleared');
    const cleared = state.auditPrograms.find(p => p.id === 'PRG-01')!.procedures.find(p => p.id === 'PRC-01')!;
    assert.equal(cleared.status, 'Cleared');
    assert.equal(cleared.returnReason, undefined, 'clearance resolves the return');
    assert.equal(cleared.reviewedByUserId, state.currentUserId);
  });
});

describe('risk creation (MOD-29)', () => {
  it('validates fields, scope, and owner before creating reciprocal links', () => {
    setPersona(state, 'Adam Khan');
    assert.throws(() => prototypeStore.createAuditRisk('ENG-26001', { title: '', area: 'Revenue', assertions: ['Occurrence'], description: 'd', rationale: 'r', response: 'p', owner: 'Adam Khan', rating: 'Medium' }), /required/);
    assert.throws(() => prototypeStore.createAuditRisk('ENG-26001', { title: 'T', area: 'Revenue', assertions: [], description: 'd', rationale: 'r', response: 'p', owner: 'Adam Khan', rating: 'Medium' }), /at least one unique assertion/);
    assert.throws(() => prototypeStore.createAuditRisk('ENG-26001', { title: 'T', area: 'Revenue', assertions: ['Occurrence'], description: 'd', rationale: 'r', response: 'p', owner: 'Adam Khan', rating: 'Medium', linkedProcedureIds: ['PRC-OTHER'] }), /must both belong to the selected engagement/);
    const id = prototypeStore.createAuditRisk('ENG-26001', { title: 'Revenue cut-off', area: 'Revenue', assertions: ['Cut-off'], description: 'Sales around year end may be recorded in the wrong period.', rationale: 'High year-end volume.', response: 'Test five days of shipping documents either side of year end.', owner: 'Adam Khan', rating: 'Significant', linkedProcedureIds: ['PRC-02'] });
    const created = state.auditRisks.find(r => r.id === id)!;
    assert.equal(created.engagementId, 'ENG-26001');
    assert.deepEqual(created.linkedProcedureIds, ['PRC-02']);
    const linked = state.auditPrograms.find(p => p.id === 'PRG-01')!.procedures.find(p => p.id === 'PRC-02')!;
    assert.ok(linked.linkedRiskIds?.includes(id), 'reciprocal procedure link is created');
    assert.ok(state.events.some(event => event.ref === id));
  });
});

describe('reasoned template retirement (MOD-06)', () => {
  it('requires a bounded reason and leaves prior revisions and jobs unchanged', () => {
    setPersona(state, 'Layla Rahman');
    const tpl = state.jobTemplates.find(t => t.status === 'Published')!;
    assert.throws(() => prototypeStore.retireJobTemplate(tpl.id), /requires a bounded reason/);
    const jobsBefore = state.jobs.length;
    prototypeStore.retireJobTemplate(tpl.id, 'Standard process replaced by the FY2027 methodology.');
    assert.equal(tpl.status, 'Retired');
    assert.equal(state.jobs.length, jobsBefore);
    assert.ok(state.events.some(event => event.ref === tpl.id && event.text.includes('replaced by')));
  });
});

describe('firm settings prospective consumption (VP-062)', () => {
  it('consumes the configured invoice and credit numbers prospectively and advances the counter once', () => {
    setPersona(state, 'Layla Rahman');
    const source = structuredClone(state.invoices.find(i => i.id === 'INV-26003')!);
    const nextNumber = `${state.firmSettings.invoiceNumberPrefix}${state.firmSettings.invoiceNextNumber}`;
    prototypeStore.addInvoice({ ...source, id: 'INV-NUMBERING', invoiceNumber: nextNumber, status: 'Draft', paid: 0, amount: 5000, lines: [{ id: 'L1', description: 'Ad hoc advisory line', quantity: 1, rate: 5000, amount: 5000, sourceType: 'Ad hoc' }] });
    assert.equal(state.firmSettings.invoiceNextNumber, 5, 'consuming the configured next number advances it');
    assert.throws(() => prototypeStore.addInvoice({ ...source, id: 'INV-DUP', invoiceNumber: nextNumber, status: 'Draft', paid: 0, amount: 10, lines: [{ id: 'L2', description: 'Ad hoc advisory line', quantity: 1, rate: 10, amount: 10, sourceType: 'Ad hoc' }] }), /must be unique/, 'a duplicate number is rejected instead of colliding');
    const credit = structuredClone(state.creditNotes[0] || { invoiceId: 'INV-26002', clientId: 'CL-002', amount: 100, currency: 'QAR', reason: 'Numbering fixture', status: 'Draft', issueDate: state.asOfDate, date: state.asOfDate, preparedBy: 'Layla Rahman' });
    credit.id = 'CN-NUMBERING';
    credit.creditNumber = `${state.firmSettings.creditNumberPrefix}${state.firmSettings.creditNextNumber}`;
    prototypeStore.addCreditNote(credit);
    assert.equal(state.firmSettings.creditNextNumber, 3, 'credit counter advances prospectively');
  });

  it('an explicit non-configured number leaves the counter unchanged', () => {
    setPersona(state, 'Leila Hassan');
    const source = structuredClone(state.invoices.find(i => i.id === 'INV-26003')!);
    prototypeStore.addInvoice({ ...source, id: 'INV-EXPLICIT', invoiceNumber: 'INV-CUSTOM-9001', status: 'Draft', paid: 0, amount: 10, lines: [{ id: 'L3', description: 'Ad hoc advisory line', quantity: 1, rate: 10, amount: 10, sourceType: 'Ad hoc' }] });
    assert.equal(state.firmSettings.invoiceNextNumber, 4, 'counter does not advance for an explicit custom number');
  });

  it('numbering and default changes never rewrite issued invoices, credits or template-derived jobs', () => {
    setPersona(state, 'Khalid Al-Nuaimi');
    const issuedBefore = structuredClone(state.invoices.filter(i => i.status === 'Issued' || i.status === 'Paid'));
    const jobsBefore = structuredClone(state.jobs);
    prototypeStore.updateFirmSettings({ invoiceNumberPrefix: 'BILL-', invoiceNextNumber: 100, creditNumberPrefix: 'CR-', paymentTermsDays: 14 }, 'Renumbering policy');
    assert.deepEqual(state.invoices.filter(i => i.status === 'Issued' || i.status === 'Paid').map(i => [i.invoiceNumber, i.amount, i.due]), issuedBefore.map(i => [i.invoiceNumber, i.amount, i.due]), 'settings changes are prospective only');
    assert.deepEqual(state.jobs, jobsBefore, 'template-derived jobs are untouched');
  });

  it('system-admin identity alone cannot approve budgets, publish templates or approve mappings (VP-062-AC03)', () => {
    setPersona(state, 'Khalid Al-Nuaimi');
    assert.throws(() => prototypeStore.updateBudget(structuredClone(state.budgets.find(b => b.engagementId === 'ENG-26001')!)), /cannot/);
    assert.throws(() => prototypeStore.publishJobTemplate(state.jobTemplates[0]!.id), /cannot/);
    assert.throws(() => prototypeStore.approveAccountMappings('ENG-26001', 1), /cannot/);
  });

  it('invalid timezone and logo references are rejected atomically; valid ones save (VP-062-AC04)', () => {
    setPersona(state, 'Khalid Al-Nuaimi');
    assert.throws(() => prototypeStore.updateFirmSettings({ timezone: '' }), /Timezone/);
    assert.throws(() => prototypeStore.updateFirmSettings({ timezone: 'x'.repeat(33) }), /Timezone/);
    assert.throws(() => prototypeStore.updateFirmSettings({ logoRef: 'x'.repeat(81) }), /logo reference/);
    const before = structuredClone(state.firmSettings);
    assert.throws(() => prototypeStore.updateFirmSettings({ logoRef: 'x'.repeat(81) }), /logo reference/);
    assert.deepEqual(state.firmSettings, before, 'invalid logo patch does not partially apply');
    prototypeStore.updateFirmSettings({ logoRef: 'brand/firm-logo-2026' }, 'Brand refresh');
    assert.equal(state.firmSettings.logoRef, 'brand/firm-logo-2026');
    prototypeStore.updateFirmSettings({ logoRef: undefined }, 'Remove logo reference');
    assert.equal(state.firmSettings.logoRef, undefined);
  });
});

describe('trial-balance replacement stales journal reflection (VP-038-E01/E02)', () => {
  it('a new TB source revision blocks reporting inclusion until the reflection is re-confirmed', () => {
    setPersona(state, 'Layla Rahman');
    // AJ-01 is seeded management-accepted; reflect it at source v1 and include it in reporting.
    const journal = state.adjustmentJournals.find(j => j.id === 'AJ-01')!;
    prototypeStore.updateAdjustmentJournal({ ...journal, reflectionStatus: 'Reflected in TB', reflectedInClientBooks: true, reflectionSourceVersion: 1, reflectionEvidenceRef: 'TB-IMPORT-REV-1' });
    prototypeStore.markAdjustmentJournalReportingIncluded('AJ-01');
    assert.equal(state.adjustmentJournals.find(j => j.id === 'AJ-01')!.status, 'Reporting included');
    // Replace the trial balance with a rebalanced row set: sourceVersion advances.
    setPersona(state, 'Adam Khan');
    const rows = structuredClone(state.engagements.find(e => e.id === 'ENG-26001')!.rows);
    rows[0].balance += 100;
    rows[1].balance -= 100;
    prototypeStore.updateTrialBalanceRows('ENG-26001', rows);
    assert.equal(state.engagements.find(e => e.id === 'ENG-26001')!.sourceVersion, 2);
    // The included journal is now stale: its reflection pins v1 while the source is v2.
    const stale = state.adjustmentJournals.find(j => j.id === 'AJ-01')!;
    assert.equal(stale.reflectionSourceVersion, 1);
    assert.notEqual(stale.reflectionSourceVersion, state.engagements.find(e => e.id === 'ENG-26001')!.sourceVersion, 'the reflection pins its original source revision');
    setPersona(state, 'Layla Rahman');
    assert.throws(() => prototypeStore.updateAdjustmentJournal({ ...stale, reflectionStatus: 'Reflected in TB', reflectedInClientBooks: true, reflectionSourceVersion: 1, reflectionEvidenceRef: 'TB-IMPORT-REV-1' }), /current trial-balance source revision/, 'a stale reflection decision cannot be re-asserted against the old source version');
  });
});

describe('grant approval-evidence and compatible-role combinations (VP-019-E01)', () => {
  it('professional and management-approver grants require distinct approval evidence across roles', () => {
    setPersona(state, 'Khalid Al-Nuaimi');
    for (const [userId, role] of [['preparer-2', 'preparer'], ['reviewer-2', 'reviewer'], ['eqr-2', 'eqr'], ['client-northstar', 'client']] as Array<[string, RoleKey]>) {
      // These personas hold seeded grants; revocation returns them to the applicant pool.
      const isClient = role === 'client';
      prototypeStore.revokeAccess(userId, role, isClient ? 'CL-002' : undefined, 'evidence-matrix re-grant rehearsal');
      const scopeKind = isClient ? 'Client' as const : 'Global' as const;
      const scopeId = isClient ? 'CL-002' : undefined;
      assert.throws(() => prototypeStore.grantAccess(userId, role, scopeKind, scopeId, 'evidence matrix check', { requestRef: `REQ-${userId}` }), /approval-evidence reference/, `${role} grant without evidence is rejected`);
      assert.throws(() => prototypeStore.grantAccess(userId, role, scopeKind, scopeId, 'evidence matrix check', { requestRef: 'REQ-X', approvalEvidenceRef: 'REQ-X' }), /separate reference from the access request/, `${role} grant reusing the request reference as evidence is rejected`);
      prototypeStore.grantAccess(userId, role, scopeKind, scopeId, 'evidence matrix check', { requestRef: `REQ-${userId}`, approvalEvidenceRef: `EVD-${userId}` });
      const history = state.roleGrantHistory.filter(entry => entry.userId === userId);
      assert.ok(history.length >= 2, `${role} grant and revocation both record history entries`);
    }
  });

  it('granting a role that does not match the persona is rejected; revocation restores re-grantability', () => {
    setPersona(state, 'Khalid Al-Nuaimi');
    assert.throws(() => prototypeStore.grantAccess('preparer-2', 'reviewer', 'Global', undefined, 'role mismatch check', { requestRef: 'REQ-M', approvalEvidenceRef: 'EVD-M' }), /assigned role/, 'a persona cannot be granted a different role');
    assert.throws(() => prototypeStore.grantAccess('preparer-2', 'reviewer', 'Client', 'CL-002', 'role mismatch check', { requestRef: 'REQ-M', approvalEvidenceRef: 'EVD-M' }), /assigned role/, 'the mismatch rule holds for every scope kind');
  });
});

describe('firm settings migration backfill (VP-004)', () => {
  it('backfills settings fields added in newer schemas while preserving saved values', () => {
    const legacy = createInitialState() as any;
    legacy.firmSettings = { firmName: 'Legacy Saved Firm', firmLegalName: 'Legacy Saved Firm LLC', jurisdiction: 'State of Qatar', currency: 'QAR', invoiceNumberPrefix: 'INV-OLD-', invoiceNextNumber: 9, creditNumberPrefix: 'CRN-OLD-', creditNextNumber: 3, paymentTermsDays: 21, locale: 'en-GB' };
    delete legacy.firmSettings.timezone;
    delete legacy.firmSettings.logoRef;
    const { state: migrated } = migratePersistedState(legacy, createInitialState());
    assert.equal(migrated.firmSettings.firmName, 'Legacy Saved Firm', 'saved values survive the backfill');
    assert.equal(migrated.firmSettings.invoiceNextNumber, 9);
    assert.equal(migrated.firmSettings.timezone, 'UTC+03:00 (Asia/Qatar)', 'new required settings fields are backfilled from the fresh seed');
    assert.equal(migrated.firmSettings.logoRef, undefined);
  });
});
