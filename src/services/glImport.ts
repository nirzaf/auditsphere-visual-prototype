import * as XLSX from 'xlsx';
import { GLTransactionItem } from '../types';

export const GL_ROW_LIMIT = 5000;
export const GL_FILE_BYTES_LIMIT = 5 * 1024 * 1024;
export type GLImportColumn = 'journal' | 'line' | 'date' | 'account' | 'name' | 'debit' | 'credit' | 'currency' | 'description' | 'opening' | 'serviceDate' | 'department' | 'costCentre' | 'project';
export const GL_IMPORT_COLUMNS: Array<{ key: GLImportColumn; label: string; required: boolean }> = [
  { key: 'journal', label: 'Journal ID', required: true }, { key: 'line', label: 'Line ID', required: true },
  { key: 'date', label: 'Date', required: true }, { key: 'account', label: 'Account Code', required: true },
  { key: 'name', label: 'Account Name', required: true }, { key: 'debit', label: 'Debit', required: true },
  { key: 'credit', label: 'Credit', required: true }, { key: 'currency', label: 'Currency', required: true },
  { key: 'description', label: 'Description', required: true }, { key: 'opening', label: 'Opening Balance', required: false },
  { key: 'department', label: 'Department dimension', required: false }, { key: 'costCentre', label: 'Cost centre dimension', required: false },
  { key: 'project', label: 'Project dimension', required: false }, { key: 'serviceDate', label: 'Service date', required: false }
];

export interface ParsedGLSource {
  transactions: GLTransactionItem[];
  openingBalances: Record<string, number>;
  hasOpeningBalances: boolean;
  errors: string[];
  format: 'CSV' | 'XLSX';
  headers?: string[];
  columnIndexes?: Partial<Record<GLImportColumn, number>>;
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

export function parseGLWorkbook(fileName: string, bytes: ArrayBuffer, expectedCurrency: string, startDate: string, endDate: string, overrides: Partial<Record<GLImportColumn, number>> = {}): ParsedGLSource {
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
  const rawHeaders = grid[0].map(value => String(value ?? '').trim());
  const headers = rawHeaders.map(value => value.toLowerCase().replace(/[ _-]+/g, ''));
  const column = (field: GLImportColumn, ...names: string[]) => Object.hasOwn(overrides, field) ? overrides[field]! : headers.findIndex(header => names.includes(header));
  const cols = { journal: column('journal', 'journalid', 'journal'), line: column('line', 'lineid', 'line'), date: column('date', 'date', 'transactiondate'), account: column('account', 'accountcode', 'account'), name: column('name', 'accountname', 'accountdescription'), debit: column('debit', 'debit'), credit: column('credit', 'credit'), currency: column('currency', 'currency'), description: column('description', 'description', 'narration'), opening: column('opening', 'openingbalance', 'opening'), serviceDate: column('serviceDate', 'servicedate', 'serviceperioddate'), department: column('department', 'department', 'departmentdimension'), costCentre: column('costCentre', 'costcentre', 'costcenter', 'costcentredimension', 'costcenterdimension'), project: column('project', 'project', 'projectdimension') };
  const columnIndexes = { ...cols };
  const required: Array<[keyof typeof cols, string]> = [['journal','journal ID'],['line','line ID'],['date','date'],['account','account code'],['name','account name'],['debit','debit'],['credit','credit'],['currency','currency'],['description','description']];
  for (const [field, label] of required) if (cols[field] < 0) errors.push(`Missing required column: ${label}.`);
  if (errors.length) return { transactions: [], openingBalances: {}, hasOpeningBalances: cols.opening >= 0, errors, format, headers: rawHeaders, columnIndexes };

  const transactions: GLTransactionItem[] = [];
  const openings: Record<string, number> = {};
  const journalLines = new Map<string, { debit: number; credit: number; currency: string; date: string }>();
  const lineKeys = new Set<string>();
  for (let i = 1; i < grid.length; i++) {
    const row = grid[i];
    if (!row.some(value => String(value ?? '').trim())) continue;
    const journalId = cell(row, cols.journal), lineId = cell(row, cols.line), date = dateCell(row[cols.date]), accountCode = cell(row, cols.account), accountName = cell(row, cols.name), currency = cell(row, cols.currency).toUpperCase(), description = cell(row, cols.description);
    const serviceDateValue = cols.serviceDate >= 0 ? cell(row, cols.serviceDate) : '';
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
    if (serviceDateValue && !validDate(dateCell(row[cols.serviceDate]))) { fail('service date must be a valid date in YYYY-MM-DD format.'); continue; }
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
    const dimensions: Record<string, string> = {};
    for (const [field, dimensionName] of [['department', 'Department'], ['costCentre', 'Cost centre'], ['project', 'Project']] as const) {
      if (cols[field] >= 0 && cell(row, cols[field])) dimensions[dimensionName] = cell(row, cols[field]);
    }
    transactions.push({ id: `GL-${journalId}-${lineId}`, journalId, lineId, date, serviceDate: serviceDateValue ? dateCell(row[cols.serviceDate]) : undefined, accountCode, accountName, debit, credit, currency, description, dimensionDept: dimensions.Department, dimensions: Object.keys(dimensions).length ? dimensions : undefined });
  }
  for (const [journalId, totals] of journalLines) if (Math.abs(totals.debit - totals.credit) > 0.005) errors.push(`Journal ${journalId} is unbalanced: debit ${totals.debit.toFixed(2)}, credit ${totals.credit.toFixed(2)}.`);
  if (!transactions.length && !errors.length) errors.push('No transaction rows were found.');
  const selectedColumns = Object.values(cols).filter(index => index >= 0);
  if (new Set(selectedColumns).size !== selectedColumns.length) errors.push('Each mapped field must use a different source column.');
  return { transactions, openingBalances: openings, hasOpeningBalances: cols.opening >= 0, errors, format, headers: rawHeaders, columnIndexes };
}
