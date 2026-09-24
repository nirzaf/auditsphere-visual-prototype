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
