import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { createInitialState } from '../../src/store/initialState.js';
import { prototypeStore } from '../../src/store/prototypeStore.js';
import { parseGLWorkbook } from '../../src/services/glImport.js';
import { validateFixtures } from '../../src/services/migrations.js';
import type { PrototypeState } from '../../src/types/index.js';

let state: PrototypeState;
beforeEach(() => { state = createInitialState(); (prototypeStore as any).state = state; (prototypeStore as any).isSessionOnly = false; (prototypeStore as any).notify = () => undefined; });
const headers = 'Journal ID,Line ID,Date,Account Code,Account Name,Debit,Credit,Currency,Description,Opening Balance';
const bytes = (text: string) => new TextEncoder().encode(text).buffer;
const valid = `${headers}\nJ1,L1,2026-01-15,1000,Cash,10,0,QAR,Receipt,100\nJ1,L2,2026-01-15,2000,Payable,0,10,QAR,Receipt,-100`;

describe('VP-036 GL source intake', () => {
  it('parses period-bounded, balanced journals and explicit opening balances', () => {
    const result = parseGLWorkbook('gl.csv', bytes(valid), 'QAR', '2026-01-01', '2026-12-31');
    assert.deepEqual(result.errors, []);
    assert.equal(result.transactions.length, 2);
    assert.deepEqual(result.openingBalances, { '1000': 100, '2000': -100 });
    assert.equal(result.hasOpeningBalances, true);
  });

  it('supports an explicit source-column map for nonstandard headers', () => {
    const custom = `Entry Reference,Line No,Posting Date,GL Code,GL Name,Dr,Cr,ISO Currency,Memo,Prior Close\nJ1,L1,2026-01-15,1000,Cash,10,0,QAR,Receipt,100\nJ1,L2,2026-01-15,2000,Payable,0,10,QAR,Receipt,-100`;
    const automatic = parseGLWorkbook('custom.csv', bytes(custom), 'QAR', '2026-01-01', '2026-12-31');
    assert.ok(automatic.errors.some(error => error.includes('Missing required column: journal ID')));
    const mapped = parseGLWorkbook('custom.csv', bytes(custom), 'QAR', '2026-01-01', '2026-12-31', { journal: 0, line: 1, date: 2, account: 3, name: 4, debit: 5, credit: 6, currency: 7, description: 8, opening: 9 });
    assert.deepEqual(mapped.errors, []);
    assert.equal(mapped.transactions[0].journalId, 'J1');
    assert.equal(mapped.openingBalances['1000'], 100);
    assert.ok(parseGLWorkbook('custom.csv', bytes(custom), 'QAR', '2026-01-01', '2026-12-31', { journal: 0, line: 0, date: 2, account: 3, name: 4, debit: 5, credit: 6, currency: 7, description: 8 }).errors.some(error => error.includes('different source column')));
  });

  it('maps optional service dates and configured accounting dimensions from CSV/XLSX source columns', () => {
    const extendedHeaders = 'Journal ID,Line ID,Date,Service Date,Account Code,Account Name,Debit,Credit,Currency,Description,Department,Cost Centre,Project';
    const extended = `${extendedHeaders}\nJ1,L1,2026-01-15,2025-12-31,1000,Cash,10,0,QAR,Receipt,Audit,CC-01,Project A\nJ1,L2,2026-01-15,2025-12-31,2000,Payable,0,10,QAR,Receipt,Audit,CC-01,Project A`;
    const parsed = parseGLWorkbook('extended.csv', bytes(extended), 'QAR', '2026-01-01', '2026-12-31');
    assert.deepEqual(parsed.errors, []);
    assert.equal(parsed.transactions[0].serviceDate, '2025-12-31', 'service date is retained separately from posting date');
    assert.deepEqual(parsed.transactions[0].dimensions, { Department: 'Audit', 'Cost centre': 'CC-01', Project: 'Project A' });
    assert.equal(parsed.transactions[0].dimensionDept, 'Audit', 'department remains available to the legacy department projection');

    const malformed = extended.replace('2025-12-31', 'not-a-date');
    assert.ok(parseGLWorkbook('extended.csv', bytes(malformed), 'QAR', '2026-01-01', '2026-12-31').errors.some(error => error.includes('service date')));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([extendedHeaders.split(','), ['J1','L1','2026-01-15','2025-12-31','1000','Cash',10,0,'QAR','Receipt','Audit','CC-01','Project A'], ['J1','L2','2026-01-15','2025-12-31','2000','Payable',0,10,'QAR','Receipt','Audit','CC-01','Project A']]), 'GL');
    const xlsx = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    assert.deepEqual(parseGLWorkbook('extended.xlsx', xlsx, 'QAR', '2026-01-01', '2026-12-31').transactions[0].dimensions, parsed.transactions[0].dimensions);
  });

  it('accepts an explicit opening-only row and a genuine XLSX workbook', () => {
    const withOpeningOnly = `${headers}\nJ1,L1,2026-01-15,1000,Cash,10,0,QAR,Receipt,100\nJ1,L2,2026-01-15,2000,Payable,0,10,QAR,Receipt,-100\n,,,3000,Capital,,,,,500`;
    const openingResult = parseGLWorkbook('gl.csv', bytes(withOpeningOnly), 'QAR', '2026-01-01', '2026-12-31');
    assert.deepEqual(openingResult.errors, []);
    assert.equal(openingResult.openingBalances['3000'], 500);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers.split(','), ['J1','L1','2026-01-15','1000','Cash',10,0,'QAR','Receipt',100], ['J1','L2','2026-01-15','2000','Payable',0,10,'QAR','Receipt',-100]]), 'GL');
    const xlsx = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const xlsxResult = parseGLWorkbook('gl.xlsx', xlsx, 'QAR', '2026-01-01', '2026-12-31');
    assert.deepEqual(xlsxResult.errors, []);
    assert.equal(xlsxResult.transactions.length, 2);
  });

  it('rejects unbalanced journals, wrong-period/currency rows, duplicate keys and impossible dates', () => {
    const bad = `${headers}\nJ1,L1,2026-01-15,1000,Cash,10,0,QAR,Receipt,100\nJ1,L2,2026-01-15,2000,Payable,0,8,QAR,Receipt,-100\nJ1,L2,2026-01-15,2000,Payable,0,1,QAR,Receipt,-100\nJ2,L1,2027-01-01,1000,Cash,10,0,QAR,Future,100\nJ3,L1,2026-02-30,1000,Cash,10,0,QAR,Invalid,100\nJ4,L1,2026-04-01,1000,Cash,10,0,USD,Wrong currency,100`;
    const result = parseGLWorkbook('gl.csv', bytes(bad), 'QAR', '2026-01-01', '2026-12-31');
    assert.ok(result.errors.some(error => error.includes('unbalanced')));
    assert.ok(result.errors.some(error => error.includes('duplicate journal/line')));
    assert.ok(result.errors.some(error => error.includes('outside the selected period')));
    assert.ok(result.errors.some(error => error.includes('valid date')));
    assert.ok(result.errors.some(error => error.includes('currency USD')));
  });

  it('exposes an incomplete journal batch and blocks importing it with otherwise balanced journals', () => {
    const partial = `${valid}\nJ2,L1,2026-01-15,1000,Cash,5,0,QAR,Incomplete batch,100`;
    const parsed = parseGLWorkbook('partial.csv', bytes(partial), 'QAR', '2026-01-01', '2026-12-31');
    assert.equal(parsed.transactions.length, 3, 'valid rows remain inspectable in preview');
    assert.ok(parsed.errors.some(error => error.includes('Journal J2 is unbalanced')));
    const engagement = state.engagements.find(item => item.id === 'ENG-26001')!;
    const preparer = state.users.find(user => user.role === 'preparer')!;
    state.currentRole = 'preparer'; state.currentUserId = preparer.id; state.currentPerson = preparer.name;
    assert.throws(() => prototypeStore.importGeneralLedgerSource(engagement.id, { fileName: 'partial.csv', format: 'CSV', sha256: 'c'.repeat(64), openingBalances: parsed.openingBalances, transactions: parsed.transactions }), /not balanced/);
    assert.equal(engagement.glSourceHistory?.length || 0, 0, 'an incomplete batch cannot be partially committed');
  });

  it('rejects GL movements and opening balances outside the active posting chart atomically', () => {
    const engagement = state.engagements.find(item => item.id === 'ENG-26001')!;
    const preparer = state.users.find(user => user.role === 'preparer')!;
    state.currentRole = 'preparer'; state.currentUserId = preparer.id; state.currentPerson = preparer.name;
    const parsed = parseGLWorkbook('gl.csv', bytes(valid), 'QAR', '2026-01-01', '2026-12-31');
    assert.throws(() => prototypeStore.importGeneralLedgerSource(engagement.id, { fileName: 'unknown-account.csv', format: 'CSV', sha256: 'd'.repeat(64), openingBalances: parsed.openingBalances, transactions: [{ ...parsed.transactions[0], accountCode: '9999' }, ...parsed.transactions.slice(1)] }), /active posting accounts/);
    assert.throws(() => prototypeStore.importGeneralLedgerSource(engagement.id, { fileName: 'unknown-opening.csv', format: 'CSV', sha256: 'e'.repeat(64), openingBalances: { ...parsed.openingBalances, '9999': 1 }, transactions: parsed.transactions }), /opening balances must reference active posting accounts/);
    assert.equal(engagement.glSourceHistory?.length || 0, 0, 'unknown chart codes do not create any GL revision');
  });

  it('validates imported dimensions against the active accounting setup before creating a revision', () => {
    const engagement = state.engagements.find(item => item.id === 'ENG-26001')!;
    const client = state.clients.find(item => item.id === engagement.client)!;
    const preparer = state.users.find(user => user.role === 'preparer')!;
    state.currentRole = 'preparer'; state.currentUserId = preparer.id; state.currentPerson = preparer.name;
    client.accountingProfile!.dimensions = [{ id: 'department', name: 'Department', values: ['Audit', 'Tax'], active: true }];
    const source = 'Journal ID,Line ID,Date,Account Code,Account Name,Debit,Credit,Currency,Description,Opening Balance,Department,Service Date\nJ1,L1,2026-09-23,1000,Cash,10,0,QAR,Receipt,100,Audit,2026-09-20\nJ1,L2,2026-09-23,2000,Payable,0,10,QAR,Receipt,-100,Audit,2026-09-20';
    const parsed = parseGLWorkbook('dimensioned.csv', bytes(source), 'QAR', '2026-01-01', '2026-12-31');
    assert.deepEqual(parsed.errors, []);
    const revision = prototypeStore.importGeneralLedgerSource(engagement.id, { fileName: 'dimensioned.csv', format: 'CSV', sha256: 'f'.repeat(64), openingBalances: parsed.openingBalances, transactions: parsed.transactions });
    assert.equal(revision, 1);
    const saved = prototypeStore.getSnapshot().engagements.find(item => item.id === engagement.id)!.glSourceHistory![0].transactions[0];
    assert.equal(saved.serviceDate, '2026-09-20');
    assert.equal(saved.dimensions?.Department, 'Audit');

    assert.throws(() => prototypeStore.importGeneralLedgerSource(engagement.id, {
      fileName: 'invalid-dimension.csv', format: 'CSV', sha256: 'e'.repeat(64), openingBalances: parsed.openingBalances,
      transactions: parsed.transactions.map(line => ({ ...line, dimensions: { Department: 'Unconfigured' }, dimensionDept: 'Unconfigured' }))
    }), /configured dimensions/);
    assert.equal(prototypeStore.getSnapshot().engagements.find(item => item.id === engagement.id)!.glSourceHistory!.length, 1, 'invalid dimensions do not create or partially append a source revision');
  });

  it('commits engagement-bound immutable revisions and invalidates dependent approvals', () => {
    const engagement = state.engagements.find(item => item.id === 'ENG-26001')!;
    const priorGeneration = engagement.generation;
    const priorRows = structuredClone(engagement.rows);
    const reconciliationIds = engagement.reconciliations.map(item => item.id).filter((id): id is string => Boolean(id));
    state.currentRole = 'preparer'; state.currentUserId = state.users.find(user => user.role === 'preparer')!.id; state.currentPerson = state.users.find(user => user.id === state.currentUserId)!.name;
    engagement.approvals.manager = { by: 'Manager', byUserId: 'manager', at: '2026-09-20', generation: engagement.generation };
    const parsed = parseGLWorkbook('gl.csv', bytes(valid), 'QAR', '2026-01-01', '2026-12-31');
    assert.throws(() => prototypeStore.importGeneralLedgerSource(engagement.id, { fileName: 'bad.csv', format: 'CSV', sha256: 'a'.repeat(64), openingBalances: parsed.openingBalances, transactions: [{ ...parsed.transactions[0], debit: 101 }, ...parsed.transactions.slice(1)] }), /not balanced/);
    assert.equal(prototypeStore.getSnapshot().engagements.find(item => item.id === engagement.id)?.glSourceHistory?.length || 0, 0, 'rejected source does not partially mutate history');
    const revision = prototypeStore.importGeneralLedgerSource(engagement.id, { fileName: 'gl.csv', format: 'CSV', sha256: 'a'.repeat(64), openingBalances: parsed.openingBalances, transactions: parsed.transactions, columnMapping: { journal: '1: Journal ID' } });
    assert.equal(revision, 1);
    const saved = prototypeStore.getSnapshot().engagements.find(item => item.id === engagement.id)!;
    assert.equal(saved.glSourceHistory?.[0].transactions[0].engagementId, engagement.id);
    assert.equal(saved.glSourceHistory?.[0].sha256, 'a'.repeat(64));
    assert.deepEqual(saved.glSourceHistory?.[0].columnMapping, { journal: '1: Journal ID' });
    assert.equal(saved.approvals.manager, null);
    assert.equal(saved.generation, priorGeneration + 1);
    assert.deepEqual(saved.rows, priorRows, 'GL import never rewrites the accepted trial balance');
    assert.ok(reconciliationIds.every(id => saved.reconciliations.find(item => item.id === id)?.status === 'Stale'));
    assert.deepEqual(validateFixtures(prototypeStore.getSnapshot()).filter(issue => issue.code.startsWith('GL_SOURCE')), []);
    const before = structuredClone(saved.glSourceHistory?.[0]);
    prototypeStore.importGeneralLedgerSource(engagement.id, { fileName: 'gl-v2.csv', format: 'CSV', sha256: 'b'.repeat(64), openingBalances: parsed.openingBalances, transactions: parsed.transactions });
    const next = prototypeStore.getSnapshot().engagements.find(item => item.id === engagement.id)!;
    assert.equal(next.glSourceHistory?.length, 2);
    assert.equal(next.glSourceHistory?.[1].predecessorRevision, 1);
    assert.deepEqual(next.glSourceHistory?.[0], before);
  });
});
