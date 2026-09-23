import * as XLSX from 'xlsx';
import type { SamplePopulationRow } from '../types';

export const POPULATION_FILE_LIMIT = 10 * 1024 * 1024;
const ROW_LIMIT = 20000;

export function parsePopulation(bytes: ArrayBuffer, fileName: string) {
  const errors: string[] = [];
  if (bytes.byteLength > POPULATION_FILE_LIMIT) return { rows: [] as SamplePopulationRow[], errors: ['File exceeds the 10 MB population import limit.'] };
  const ext = fileName.toLowerCase();
  if (!ext.endsWith('.csv') && !ext.endsWith('.xlsx')) return { rows: [] as SamplePopulationRow[], errors: ['Choose a CSV file or a genuine XLSX workbook.'] };
  let workbook: XLSX.WorkBook;
  try { workbook = XLSX.read(bytes, { type: 'array', cellDates: true }); }
  catch { return { rows: [] as SamplePopulationRow[], errors: ['File could not be read as CSV/XLSX.'] }; }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return { rows: [] as SamplePopulationRow[], errors: ['Workbook has no worksheet.'] };
  if (Object.entries(sheet).some(([key, cell]) => /^[A-Z]+\d+$/.test(key) && typeof cell === 'object' && cell !== null && 'f' in cell)) {
    return { rows: [] as SamplePopulationRow[], errors: ['Formula cells are not accepted in population imports. Paste calculated values, then retry.'] };
  }
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true });
  if (grid.length < 2) return { rows: [] as SamplePopulationRow[], errors: ['Import needs a header row and at least one population item.'] };
  if (grid.length - 1 > ROW_LIMIT) return { rows: [] as SamplePopulationRow[], errors: [`Population exceeds ${ROW_LIMIT} rows.`] };
  const headers = grid[0].map(value => String(value).trim().toLowerCase().replace(/[\s_-]/g, ''));
  const index = (names: string[]) => headers.findIndex(header => names.includes(header));
  const columns = { ref: index(['itemref', 'reference', 'transactionid', 'id']), date: index(['date', 'transactiondate']), counterparty: index(['counterparty', 'customer', 'vendor', 'entity']), amount: index(['amount', 'value', 'recordedamount']), description: index(['description', 'memo', 'details']), period: index(['period', 'fiscalyear', 'year']), currency: index(['currency', 'ccy']) };
  for (const [name, column] of Object.entries(columns).slice(0, 4)) if (column < 0) errors.push(`Required column missing: ${name}.`);
  if (errors.length) return { rows: [] as SamplePopulationRow[], errors };

  const rows: SamplePopulationRow[] = [];
  const refs = new Set<string>();
  const isoDate = (value: unknown) => {
    if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10);
    const text = String(value ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
    const parsed = new Date(`${text}T00:00:00Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === text ? text : '';
  };
  grid.slice(1).forEach((cells, offset) => {
    const ref = String(cells[columns.ref] ?? '').trim();
    if (!ref && cells.every(value => String(value ?? '').trim() === '')) return;
    const date = isoDate(cells[columns.date]);
    const counterparty = String(cells[columns.counterparty] ?? '').trim();
    const rawAmount = String(cells[columns.amount] ?? '').trim();
    const amount = Number(rawAmount.replace(/,/g, ''));
    const rawPeriod = columns.period < 0 ? '' : String(cells[columns.period] ?? '').trim();
    const periodMatch = rawPeriod.match(/(?:FY\s*)?(\d{4})/i);
    const period = periodMatch ? Number(periodMatch[1]) : undefined;
    const rawCurrency = columns.currency < 0 ? '' : String(cells[columns.currency] ?? '').trim().toUpperCase();
    const rowNumber = offset + 2;
    if (!ref || refs.has(ref)) { errors.push(`Row ${rowNumber}: item reference is missing or duplicated.`); return; }
    if (!date || !counterparty || !rawAmount || !Number.isFinite(amount)) { errors.push(`Row ${rowNumber}: date, counterparty, and numeric amount are required.`); return; }
    if ((rawPeriod && !period) || (rawCurrency && !/^[A-Z]{3}$/.test(rawCurrency))) { errors.push(`Row ${rowNumber}: period must contain a four-digit year and currency must be a three-letter code.`); return; }
    refs.add(ref);
    rows.push({ id: `SAMP-IMPORT-${offset + 1}`, itemRef: ref, date, period, currency: rawCurrency || undefined, counterparty, amount, description: String(cells[columns.description] ?? '').trim() || undefined, tested: false, selected: false, result: 'Untested' });
  });
  return { rows: errors.length ? [] : rows, errors };
}
