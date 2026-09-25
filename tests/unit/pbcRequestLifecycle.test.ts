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
  });

  it('edits title, due date and recipient with a recorded reason and an internal thread entry', () => {
    prototypeStore.addPbcRequest('ENG-26001', { id: 'PBC-TEST-01', title: 'Year-end bank statements', category: 'Bank evidence', status: 'Draft', due: '2026-09-30', owner: 'client@example.test', contributor: 'Rami Nasser', version: 1, engagementId: 'ENG-26001' });
    prototypeStore.updatePbcRequest('ENG-26001', 'PBC-TEST-01', { title: 'Year-end bank statements and reconciliations', due: '2026-10-05', owner: 'finance@example.test' }, 'Client asked to widen the scope and extend the date.');
    const updated = prototypeStore.getSnapshot().engagements.find(e => e.id === 'ENG-26001')!.pbc.find(r => r.id === 'PBC-TEST-01')!;
    assert.equal(updated.title, 'Year-end bank statements and reconciliations');
    assert.equal(updated.due, '2026-10-05');
    assert.equal(updated.owner, 'finance@example.test');
    const entry = updated.thread!.at(-1)!;
    assert.ok(entry.text.includes('Request edited') && entry.text.includes('Client asked to widen the scope'));
    assert.equal(entry.clientVisible, false, 'edit notes are internal');
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

  it('requires an in-scope staff role to edit or cancel', () => {
    prototypeStore.addPbcRequest('ENG-26001', { id: 'PBC-TEST-04', title: 'Fixed asset register', category: 'Accounting', status: 'Draft', due: '2026-09-30', owner: 'client@example.test', contributor: 'Rami Nasser', version: 1, engagementId: 'ENG-26001' });
    prototypeStore.setPersona('client_finance');
    assert.throws(() => prototypeStore.updatePbcRequest('ENG-26001', 'PBC-TEST-04', { due: '2026-10-01' }, 'client edit'), /cannot edit/i);
    assert.throws(() => prototypeStore.cancelPbcRequest('ENG-26001', 'PBC-TEST-04', 'client cancel'), /cannot cancel/i);
  });
});
