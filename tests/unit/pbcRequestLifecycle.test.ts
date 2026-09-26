// VP-023 unit: PBC request edit/reassignment/cancellation lifecycle.
// Edits and cancellation retain identity, attribution and prior submissions;
// cancellation is terminal and never deletes shared files or history.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../../src/store/initialState.js';
import { prototypeStore } from '../../src/store/prototypeStore.js';

describe('PBC request lifecycle (VP-023)', () => {
  beforeEach(() => {
    prototypeStore.importStateJSON(JSON.stringify(createInitialState()));
    prototypeStore.setPersona('manager');
    prototypeStore.setSelectedEngagement('ENG-26001');
  });

  it('edits title, due date and recipient with a recorded reason and an internal thread entry', () => {
    prototypeStore.addPbcRequest('ENG-26001', { id: 'PBC-TEST-01', title: 'Year-end bank statements', category: 'Bank evidence', status: 'Draft', due: '2026-09-30', owner: 'client@example.test', contributor: 'Rami Nasser', version: 1, engagementId: 'ENG-26001' });
    prototypeStore.updatePbcRequest('ENG-26001', 'PBC-TEST-01', { title: 'Year-end bank statements and reconciliations', due: '2026-10-05', owner: 'Rami Nasser' }, 'Client asked to widen the scope and extend the date.');
    const updated = prototypeStore.getSnapshot().engagements.find(e => e.id === 'ENG-26001')!.pbc.find(r => r.id === 'PBC-TEST-01')!;
    assert.equal(updated.title, 'Year-end bank statements and reconciliations');
    assert.equal(updated.due, '2026-10-05');
    assert.equal(updated.owner, 'Rami Nasser');
    const entry = updated.thread!.at(-1)!;
    assert.ok(entry.text.includes('Request edited') && entry.text.includes('Client asked to widen the scope'));
    assert.equal(entry.clientVisible, false, 'edit notes are internal');
  });

  it('rejects a recipient who is inactive or assigned to another client', () => {
    prototypeStore.addPbcRequest('ENG-26001', { id: 'PBC-TEST-05', title: 'Restricted recipient test', category: 'Bank evidence', status: 'Draft', due: '2026-09-30', owner: 'client@example.test', contributor: 'Rami Nasser', version: 1, engagementId: 'ENG-26001' });
    assert.throws(() => prototypeStore.updatePbcRequest('ENG-26001', 'PBC-TEST-05', { owner: 'Aisha Saleh' }, 'Try another client contact'), /active contact assigned to this client/i);
    assert.throws(() => prototypeStore.updatePbcRequest('ENG-26001', 'PBC-TEST-05', { owner: 'Former Contact' }, 'Try an inactive recipient'), /active contact assigned to this client/i);
  });

  it('rejects presentation when required request context is missing', () => {
    const state = createInitialState();
    state.currentRole = 'manager'; state.currentUserId = 'manager'; state.currentPerson = 'Layla Rahman'; state.selectedEngagement = 'ENG-26001';
    state.engagements.find(engagement => engagement.id === 'ENG-26001')!.pbc.unshift({ id: 'PBC-TEST-06', title: 'Context check', category: 'Bank evidence', status: 'Draft', due: '2026-09-30', owner: '', contributor: 'Rami Nasser', version: 1 });
    prototypeStore.importStateJSON(JSON.stringify(state));
    assert.throws(() => prototypeStore.presentPbcRequest('ENG-26001', 'PBC-TEST-06'), /title, owner, and client recipient are required before presentation/i);
  });

  it('rejects edits without a reason, no-op edits, and edits to cancelled requests', () => {
    prototypeStore.addPbcRequest('ENG-26001', { id: 'PBC-TEST-02', title: 'Loan confirmations', category: 'Bank evidence', status: 'Draft', due: '2026-09-30', owner: 'client@example.test', contributor: 'Rami Nasser', version: 1, engagementId: 'ENG-26001' });
    assert.throws(() => prototypeStore.updatePbcRequest('ENG-26001', 'PBC-TEST-02', { due: '2026-10-01' }, '   '), /reason is required/i);
    assert.throws(() => prototypeStore.updatePbcRequest('ENG-26001', 'PBC-TEST-02', { title: 'Loan confirmations' }, 'no field changed'), /No changes/i);
    assert.throws(() => prototypeStore.updatePbcRequest('ENG-26001', 'PBC-TEST-02', { due: 'not-a-date' }, 'bad date'), /valid due date/i);
    prototypeStore.cancelPbcRequest('ENG-26001', 'PBC-TEST-02', 'Duplicate of an existing request.');
    assert.throws(() => prototypeStore.updatePbcRequest('ENG-26001', 'PBC-TEST-02', { due: '2026-10-01' }, 'late edit'), /cancelled/i);
  });

  it('cancels with a reason, retains shared files and history, and refuses double cancellation', () => {
    prototypeStore.addPbcRequest('ENG-26001', { id: 'PBC-TEST-03', title: 'Inventory listing', category: 'Operations', status: 'Draft', due: '2026-09-30', owner: 'finance@example.test', contributor: 'Rami Nasser', version: 1, engagementId: 'ENG-26001' });
    prototypeStore.presentPbcRequest('ENG-26001', 'PBC-TEST-03');
    prototypeStore.setPersona('client_finance');
    prototypeStore.uploadPbcResponse('ENG-26001', 'PBC-TEST-03', { name: 'inventory.csv', size: 120, sha256: 'a'.repeat(64), type: 'text/csv' });
    prototypeStore.setPersona('manager');
    prototypeStore.cancelPbcRequest('ENG-26001', 'PBC-TEST-03', 'Duplicate of an existing request.');
    const cancelled = prototypeStore.getSnapshot().engagements.find(e => e.id === 'ENG-26001')!.pbc.find(r => r.id === 'PBC-TEST-03')!;
    assert.equal(cancelled.status, 'Cancelled');
    assert.equal(cancelled.sharedFiles!.length, 1, 'shared files are retained');
    assert.ok(cancelled.thread!.some(t => t.text.includes('Request cancelled')));
    assert.throws(() => prototypeStore.cancelPbcRequest('ENG-26001', 'PBC-TEST-03', 'again'), /already cancelled/i);
  });

  it('links a post-acceptance PBC replacement to the prior document and reopens dependent review', () => {
    prototypeStore.addPbcRequest('ENG-26001', { id: 'PBC-TEST-07', title: 'Signed bank statement', category: 'Bank evidence', status: 'Draft', due: '2026-09-30', owner: 'Rami Nasser', contributor: 'Rami Nasser', version: 1, engagementId: 'ENG-26001' });
    prototypeStore.presentPbcRequest('ENG-26001', 'PBC-TEST-07');
    prototypeStore.setPersona('client_finance');
    prototypeStore.uploadPbcResponse('ENG-26001', 'PBC-TEST-07', { id: 'DOC-PBC-FIRST', name: 'bank-statement-v1.pdf', size: 120, sha256: 'a'.repeat(64), type: 'application/pdf' });

    prototypeStore.setPersona('manager');
    const state = (prototypeStore as any).state;
    const request = state.engagements.find((engagement: any) => engagement.id === 'ENG-26001').pbc.find((item: any) => item.id === 'PBC-TEST-07');
    const procedure = state.auditPrograms.flatMap((program: any) => program.procedures).find((item: any) => item.id === 'PRC-01');
    const workpaper = state.engagements.find((engagement: any) => engagement.id === 'ENG-26001').workpapers.find((item: any) => item.id === 'WP-A1');
    state.evidenceCatalogue.push({ id: 'EVD-PBC-TEST', title: 'Signed bank statement', documentId: 'DOC-PBC-FIRST', version: 1, sha: 'a'.repeat(64), adequacyStatus: 'Adequate', receivedDate: '2026-09-26', owner: 'Rami Nasser', linkedProcedures: [] });
    prototypeStore.linkEvidenceProcedure('EVD-PBC-TEST', 'PRC-01');
    procedure.status = 'Cleared';
    procedure.reviewedByUserId = state.currentUserId;
    procedure.reviewedAt = '2026-09-26T09:00:00.000Z';
    workpaper.evidenceRefs = ['DOC-PBC-FIRST'];
    workpaper.status = 'Submitted';
    workpaper.submittedBy = 'Adam Khan';
    workpaper.submittedVersion = workpaper.version;

    prototypeStore.acceptPbcResponse('ENG-26001', 'PBC-TEST-07');
    prototypeStore.requestPbcClarification('ENG-26001', 'PBC-TEST-07', 'Please provide the signed final page.');
    prototypeStore.setPersona('client_finance');
    prototypeStore.uploadPbcResponse('ENG-26001', 'PBC-TEST-07', { id: 'DOC-PBC-SECOND', name: 'bank-statement-v2.pdf', size: 140, sha256: 'b'.repeat(64), type: 'application/pdf' });

    const replacement = state.documents.find((document: any) => document.id === 'DOC-PBC-SECOND');
    const replacementEvidence = state.evidenceCatalogue.find((item: any) => item.documentId === replacement.id);
    assert.equal(replacement.supersedesDocumentId, 'DOC-PBC-FIRST');
    assert.equal(replacement.version, 2);
    assert.equal(request.status, 'Received', 'replacement is received but needs a new independent acceptance');
    assert.equal(request.acceptanceHistory.at(-1).version, 1, 'the prior acceptance remains in history');
    assert.equal(replacementEvidence.adequacyStatus, 'Pending verification');
    assert.equal(procedure.evidenceReassessmentRequired, true);
    assert.equal(procedure.status, 'In progress');
    assert.equal(workpaper.status, 'Changes required');
    assert.equal(workpaper.clearance, null);
  });

  it('requires an in-scope staff role to edit or cancel', () => {
    prototypeStore.addPbcRequest('ENG-26001', { id: 'PBC-TEST-04', title: 'Fixed asset register', category: 'Accounting', status: 'Draft', due: '2026-09-30', owner: 'client@example.test', contributor: 'Rami Nasser', version: 1, engagementId: 'ENG-26001' });
    prototypeStore.setPersona('client_finance');
    assert.throws(() => prototypeStore.updatePbcRequest('ENG-26001', 'PBC-TEST-04', { due: '2026-10-01' }, 'client edit'), /cannot edit/i);
    assert.throws(() => prototypeStore.cancelPbcRequest('ENG-26001', 'PBC-TEST-04', 'client cancel'), /cannot cancel/i);
  });
});
