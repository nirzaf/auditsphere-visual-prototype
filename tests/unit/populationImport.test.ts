import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parsePopulation } from '../../src/services/populationImport.js';

describe('substantive population source import (VP-051)', () => {
  it('parses quoted CSV rows and validates required fields and unique references', () => {
    const bytes = new TextEncoder().encode('itemRef,date,counterparty,amount,description\nA-1,2026-09-01,"Al, Doha Trading",125.50,invoice').buffer as ArrayBuffer;
    const result = parsePopulation(bytes, 'population.csv');
    assert.deepEqual(result.errors, []);
    assert.equal(result.rows[0].counterparty, 'Al, Doha Trading');
    assert.equal(result.rows[0].amount, 125.5);
    assert.equal(result.rows[0].selected, false);
    const duplicate = parsePopulation(new TextEncoder().encode('reference,date,vendor,value\nA,2026-09-01,V,1\nA,2026-09-02,V,2').buffer as ArrayBuffer, 'population.csv');
    assert.match(duplicate.errors.join(' '), /duplicated/);
  });

  it('reads a genuine XLSX population and rejects formula cells', () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['reference', 'date', 'customer', 'value'], ['INV-1', '2026-09-01', 'Client', 80]]), 'Population');
    const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    assert.equal(parsePopulation(bytes, 'population.xlsx').rows[0].amount, 80);
    const formulaSheet = XLSX.utils.aoa_to_sheet([['reference', 'date', 'customer', 'value'], ['INV-2', '2026-09-01', 'Client', 0]]);
    formulaSheet.D2 = { t: 'n', f: '40+40', v: 80 };
    const formulaWorkbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(formulaWorkbook, formulaSheet, 'Population');
    const formulaBytes = XLSX.write(formulaWorkbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    assert.match(parsePopulation(formulaBytes, 'population.xlsx').errors.join(' '), /Formula cells/);
  });
});
