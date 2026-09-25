// Lifecycle-completion guards (MOD-06/14/22/29/30/34/39).
// Covers the closure of audit-identified lifecycle dead-ends: adjustment
// "Reporting included" reachability from a live session, reasoned invoice
// returns, firm-settings prospective save, reasoned fieldwork returns,
// risk creation, and reasoned template retirement.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../../src/store/initialState.js';
import { prototypeStore } from '../../src/store/prototypeStore.js';
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
