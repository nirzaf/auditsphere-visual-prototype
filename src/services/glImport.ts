import * as XLSX from 'xlsx';
import { GLTransactionItem } from '../types';

export const GL_ROW_LIMIT = 5000;
export const GL_FILE_BYTES_LIMIT = 5 * 1024 * 1024;

export interface ParsedGLSource {
  transactions: GLTransactionItem[];
  openingBalances: Record<string, number>;
  hasOpeningBalances: boolean;
  errors: string[];
  format: 'CSV' | 'XLSX';
}

const isXlsx = (bytes: ArrayBuffer) => new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength)).join(',') === '80,75,3,4';
const cell = (row: unknown[], index: number) => String(row[index] ?? '').trim();
const dateCell = (value: unknown) => {
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    return date ? `${String(date.y).padStart(4, '0')}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}` : '';
  }
  return String(value ?? '').trim();
};
const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
const amount = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value ?? '').trim().replace(/,/g, '');
  if (!text || text.startsWith('=')) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) && Math.abs(parsed * 100 - Math.round(parsed * 100)) < 1e-7 ? parsed : null;
};

export function parseGLWorkbook(fileName: string, bytes: ArrayBuffer, expectedCurrency: string, startDate: string, endDate: string): ParsedGLSource {
  const errors: string[] = [];
  const extension = fileName.toLowerCase().split('.').at(-1);
  const format = extension === 'xlsx' ? 'XLSX' : 'CSV';
  let grid: unknown[][];
  if (bytes.byteLength > GL_FILE_BYTES_LIMIT) return { transactions: [], openingBalances: {}, hasOpeningBalances: false, errors: [`File exceeds ${GL_FILE_BYTES_LIMIT / 1024 / 1024} MB.`], format };
  if (extension === 'xlsx') {
    if (!isXlsx(bytes)) return { transactions: [], openingBalances: {}, hasOpeningBalances: false, errors: ['A CSV or text file renamed to .xlsx is rejected.'], format };
    try {
      const book = XLSX.read(bytes, { type: 'array', cellDates: false });
      const sheet = book.Sheets[book.SheetNames[0]];
      if (!sheet) return { transactions: [], openingBalances: {}, hasOpeningBalances: false, errors: ['Workbook has no worksheet.'], format };
      grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true });
    } catch { return { transactions: [], openingBalances: {}, hasOpeningBalances: false, errors: ['Workbook could not be parsed.'], format }; }
  } else if (extension === 'csv') {
    const workbook = XLSX.read(new TextDecoder().decode(bytes), { type: 'string', raw: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    grid = sheet ? XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true }) : [];
  } else return { transactions: [], openingBalances: {}, hasOpeningBalances: false, errors: ['Choose a CSV or genuine XLSX file.'], format };

  if (grid.length < 2) return { transactions: [], openingBalances: {}, hasOpeningBalances: false, errors: ['Include a header row and at least one transaction.'], format };
  if (grid.length - 1 > GL_ROW_LIMIT) return { transactions: [], openingBalances: {}, hasOpeningBalances: false, errors: [`Row limit exceeded (${GL_ROW_LIMIT}).`], format };
  const headers = grid[0].map(value => String(value ?? '').trim().toLowerCase().replace(/[ _-]+/g, ''));
  const column = (...names: string[]) => headers.findIndex(header => names.includes(header));
  const cols = { journal: column('journalid', 'journal'), line: column('lineid', 'line'), date: column('date', 'transactiondate'), account: column('accountcode', 'account'), name: column('accountname', 'accountdescription'), debit: column('debit'), credit: column('credit'), currency: column('currency'), description: column('description', 'narration'), opening: column('openingbalance', 'opening') };
  const required: Array<[keyof typeof cols, string]> = [['journal','journal ID'],['line','line ID'],['date','date'],['account','account code'],['name','account name'],['debit','debit'],['credit','credit'],['currency','currency'],['description','description']];
  for (const [field, label] of required) if (cols[field] < 0) errors.push(`Missing required column: ${label}.`);
  if (errors.length) return { transactions: [], openingBalances: {}, hasOpeningBalances: cols.opening >= 0, errors, format };

  const transactions: GLTransactionItem[] = [];
  const openings: Record<string, number> = {};
  const journalLines = new Map<string, { debit: number; credit: number; currency: string; date: string }>();
  const lineKeys = new Set<string>();
  for (let i = 1; i < grid.length; i++) {
    const row = grid[i];
    if (!row.some(value => String(value ?? '').trim())) continue;
    const journalId = cell(row, cols.journal), lineId = cell(row, cols.line), date = dateCell(row[cols.date]), accountCode = cell(row, cols.account), accountName = cell(row, cols.name), currency = cell(row, cols.currency).toUpperCase(), description = cell(row, cols.description);
    const debit = amount(row[cols.debit]), credit = amount(row[cols.credit]);
    const fail = (reason: string) => errors.push(`Row ${i + 1}: ${reason}`);
    if (!journalId && !lineId && !date && cols.opening >= 0 && cell(row, cols.opening)) {
      const opening = amount(row[cols.opening]);
      if (!accountCode || !accountName || opening === null) { fail('opening-only rows require an account code, account name, and numeric opening balance.'); continue; }
      if (Object.hasOwn(openings, accountCode)) { fail(`duplicate opening balance for account ${accountCode}.`); continue; }
      openings[accountCode] = opening;
      continue;
    }
    if (!journalId || !lineId || !accountCode || !accountName || !description) { fail('journal, line, account, name, and description are required.'); continue; }
    if (!validDate(date)) { fail('date must be a valid date in YYYY-MM-DD format.'); continue; }
    if (date < startDate || date > endDate) { fail(`date ${date} is outside the selected period ${startDate} to ${endDate}.`); continue; }
    if (currency !== expectedCurrency.toUpperCase()) { fail(`currency ${currency} does not match ${expectedCurrency}.`); continue; }
    if (debit === null || credit === null || debit < 0 || credit < 0 || debit > 0 && credit > 0 || debit === 0 && credit === 0) { fail('enter a non-negative debit or credit, but not both and not neither.'); continue; }
    const key = `${journalId}\u0000${lineId}`;
    if (lineKeys.has(key)) { fail(`duplicate journal/line key ${journalId}/${lineId}.`); continue; }
    lineKeys.add(key);
    const journal = journalLines.get(journalId) || { debit: 0, credit: 0, currency, date };
    if (journal.currency !== currency || journal.date !== date) { fail(`journal ${journalId} mixes dates or currencies.`); continue; }
    journal.debit += debit; journal.credit += credit; journalLines.set(journalId, journal);
    if (cols.opening >= 0 && cell(row, cols.opening)) {
      const opening = amount(row[cols.opening]);
      if (opening === null) { fail('opening balance is not numeric.'); continue; }
      if (Object.hasOwn(openings, accountCode) && openings[accountCode] !== opening) { fail(`opening balance for ${accountCode} is inconsistent across rows.`); continue; }
      openings[accountCode] = opening;
    }
    transactions.push({ id: `GL-${journalId}-${lineId}`, journalId, lineId, date, accountCode, accountName, debit, credit, currency, description });
  }
  for (const [journalId, totals] of journalLines) if (Math.abs(totals.debit - totals.credit) > 0.005) errors.push(`Journal ${journalId} is unbalanced: debit ${totals.debit.toFixed(2)}, credit ${totals.credit.toFixed(2)}.`);
  if (!transactions.length && !errors.length) errors.push('No transaction rows were found.');
  return { transactions, openingBalances: openings, hasOpeningBalances: cols.opening >= 0, errors, format };
}
