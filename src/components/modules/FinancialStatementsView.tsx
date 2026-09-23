// Module 24: Financial Statements Generation & Export (VP-040, VP-041)
import React, { useState } from 'react';
import { RouteKey, TrialBalanceRow } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';
import { applyReportingAdjustments, calculateBalanceSheet, calculateIncomeStatement, formatCurrency } from '../../services/calculations';
import { exportService } from '../../services/exportService';

interface FinancialStatementsViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const FinancialStatementsView: React.FC<FinancialStatementsViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const [statementType, setStatementType] = useState<'bs' | 'is' | 'equity' | 'cashflow'>('bs');

  const selectedEng = state.engagements.find(e => e.id === state.selectedEngagement) || state.engagements[0];
  const client = state.clients.find(c => c.id === selectedEng?.client);

  if (!selectedEng) {
    return (
      <div className="panel panel-pad text-center" style={{ padding: '60px 20px' }}>
        <Icon name="file" size="xl" className="text-muted mb16" />
        <h3>No Active Engagement Selected</h3>
        <p className="sub max-w-md mx-auto mt8">
          Select or create an engagement to generate and review financial statements.
        </p>
        <button className="btn primary sm mt16" onClick={() => onNavigate('engagements')}>
          Go to Engagements
        </button>
      </div>
    );
  }

  const adjustmentResult = applyReportingAdjustments(selectedEng.rows, state.adjustmentJournals.filter(j => j.engagementId === selectedEng.id));
  const mappingHistory = (state.accountMappingRevisions || []).filter(item => item.engagementId === selectedEng.id);
  const currentMapping = [...mappingHistory].sort((a, b) => b.revision - a.revision)[0];
  const mappedAccounts = currentMapping?.mappings || [];
  const unmappedRows = currentMapping ? selectedEng.rows.filter(row => !mappedAccounts.some(mapping => mapping.accountCode === row.code)) : [];
  const mappingReady = !currentMapping || (currentMapping.status === 'Approved' && !unmappedRows.length);
  const mapRow = (row: TrialBalanceRow): TrialBalanceRow[] => {
    const targets = mappedAccounts.find(mapping => mapping.accountCode === row.code)?.targets || [];
    let allocatedCents = 0;
    return targets.map((target, index) => {
      const cents = index === targets.length - 1 ? Math.round(row.balance * 100) - allocatedCents : Math.round(row.balance * 100 * target.percentage / 100);
      allocatedCents += cents;
      return {
        ...row,
        code: `${row.code} → ${target.statementLine}`,
        name: target.statementLine,
        type: ['Cash and cash equivalents', 'Trade receivables', 'Other current assets', 'Property and equipment'].includes(target.statementLine) ? 'asset' : ['Trade payables', 'Borrowings'].includes(target.statementLine) ? 'liability' : target.statementLine === 'Share capital and reserves' ? 'equity' : target.statementLine === 'Revenue' ? 'revenue' : 'expense',
        balance: cents / 100,
        mappedStatementLine: target.statementLine
      };
    });
  };
  const statementRows: TrialBalanceRow[] = currentMapping?.status === 'Approved' && !unmappedRows.length
    ? adjustmentResult.rows.flatMap(mapRow)
    : adjustmentResult.rows;
  const bs = calculateBalanceSheet(statementRows);
  const is = calculateIncomeStatement(statementRows);

  const handleExportXLSX = () => {
    const data = [
      { LineItem: 'Assets', Amount: bs.totalAssets },
      ...bs.assets.map((a: TrialBalanceRow) => ({ LineItem: `  ${a.name} · Source ${a.code.split(' → ')[0]} · Mapping ${a.mappedStatementLine || 'legacy'}`, Amount: a.balance })),
      { LineItem: 'Liabilities', Amount: bs.totalLiabilities },
      ...bs.liabilities.map((l: TrialBalanceRow) => ({ LineItem: `  ${l.name} · Source ${l.code.split(' → ')[0]} · Mapping ${l.mappedStatementLine || 'legacy'}`, Amount: Math.abs(l.balance) })),
      { LineItem: 'Equity', Amount: bs.totalEquity },
      ...bs.equity.map((e: TrialBalanceRow) => ({ LineItem: `  ${e.name} · Source ${e.code.split(' → ')[0]} · Mapping ${e.mappedStatementLine || 'legacy'}`, Amount: Math.abs(e.balance) })),
      { LineItem: '  Current-period profit / (loss)', Amount: bs.currentPeriodResult },
      { LineItem: 'Revenue', Amount: is.revenue },
      ...statementRows.filter(row => row.type === 'revenue').map(row => ({ LineItem: `  ${row.name} · Source ${row.code.split(' → ')[0]} · Mapping ${row.mappedStatementLine || 'legacy'}`, Amount: Math.abs(row.balance) })),
      { LineItem: 'Cost of Sales', Amount: is.costOfSales },
      ...statementRows.filter(row => row.type === 'expense' && (row.name.toLowerCase().includes('cost of sales') || row.name.toLowerCase().includes('cost of goods'))).map(row => ({ LineItem: `  ${row.name} · Source ${row.code.split(' → ')[0]} · Mapping ${row.mappedStatementLine || 'legacy'}`, Amount: Math.abs(row.balance) })),
      { LineItem: 'Gross Profit', Amount: is.grossProfit },
      { LineItem: 'Operating Expenses', Amount: is.operatingExpenses },
      ...statementRows.filter(row => row.type === 'expense' && !row.name.toLowerCase().includes('cost of sales') && !row.name.toLowerCase().includes('cost of goods')).map(row => ({ LineItem: `  ${row.name} · Source ${row.code.split(' → ')[0]} · Mapping ${row.mappedStatementLine || 'legacy'}`, Amount: Math.abs(row.balance) })),
      { LineItem: 'Net Profit', Amount: is.netProfit }
    ];

    exportService.exportXLSX(
      `Financial_Statements_${client?.code || 'CL001'}_FY2026`,
      'Financial Statements',
      data
    );
  };

  const handleExportPDF = () => {
    const lines = [
      `Entity: ${client?.name || 'Example Trading Entity'}`,
      `Reporting Period: ${selectedEng.period}`,
      `Currency: QAR`,
      '',
      `BALANCE SHEET`,
      `Total Assets: ${formatCurrency(bs.totalAssets)}`,
      `Total Liabilities: ${formatCurrency(bs.totalLiabilities)}`,
      `Total Equity: ${formatCurrency(bs.totalEquity)}`,
      `Balance Sheet Equation Check: ${bs.isBalanced ? 'BALANCED' : 'IMBALANCE DETECTED'}`,
      '',
      `INCOME STATEMENT`,
      ...statementRows.filter(row => ['revenue', 'expense'].includes(row.type)).map(row => `${row.mappedStatementLine || row.type} · Source ${row.code.split(' → ')[0]}: ${formatCurrency(row.balance)}`),
      `Revenue: ${formatCurrency(is.revenue)}`,
      `Cost of Sales: ${formatCurrency(is.costOfSales)}`,
      `Gross Profit: ${formatCurrency(is.grossProfit)}`,
      `Operating Expenses: ${formatCurrency(is.operatingExpenses)}`,
      `Net Profit for the Year: ${formatCurrency(is.netProfit)}`
    ];

    exportService.exportPDF(
      `Financial_Report_${client?.code || 'CL001'}_FY2026`,
      `Audited Financial Statements - FY ${selectedEng.year}`,
      lines
    );
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Financial Statements</h1>
          <p>Multi-statement drill-down, balance verification, and genuine demonstration document exports.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn sm ghost" disabled={!mappingReady} onClick={handleExportXLSX}>
            <Icon name="download" /> Export XLSX
          </button>
          <button className="btn primary sm" disabled={!mappingReady} onClick={handleExportPDF}>
            <Icon name="download" /> Export PDF
          </button>
        </div>
      </div>

      {!mappingReady && <div role="alert" className="badge danger" style={{ display: 'block', padding: 12 }}>Statement generation is blocked until the latest mapping revision is independently approved and covers all trial balance accounts. Unmapped: {unmappedRows.map(row => row.code).join(', ') || 'none'}.</div>}

      {adjustmentResult.unapplied.length > 0 && <div role="status" className="badge danger" style={{ display: 'block', padding: 12 }}>
        Some management-accepted adjustments were excluded because their source reflection or account mapping needs review: {adjustmentResult.unapplied.map(item => `${item.journalId}: ${item.reason}`).join(' ')}
      </div>}
      <div className="caption">Accepted, unreflected adjustments included: {adjustmentResult.applied.join(', ') || 'None'}. Reflected or unapproved journals are excluded.</div>

      {/* Statement Select Tabs */}
      <div className="tabs">
        <button className={`tab-btn ${statementType === 'bs' ? 'active' : ''}`} onClick={() => setStatementType('bs')}>
          Statement of Financial Position (Balance Sheet)
        </button>
        <button className={`tab-btn ${statementType === 'is' ? 'active' : ''}`} onClick={() => setStatementType('is')}>
          Statement of Comprehensive Income (P&L)
        </button>
        <button className={`tab-btn ${statementType === 'equity' ? 'active' : ''}`} onClick={() => setStatementType('equity')}>
          Statement of Changes in Equity
        </button>
        <button className={`tab-btn ${statementType === 'cashflow' ? 'active' : ''}`} onClick={() => setStatementType('cashflow')}>
          Statement of Cash Flows
        </button>
      </div>

      {/* 1: Balance Sheet */}
      {statementType === 'bs' && (
        <div className="stack" style={{ gap: 16 }}>
          <div className="panel panel-pad" style={{ background: bs.isBalanced ? '#f0fdf4' : '#fef2f2' }}>
            <div className="between">
              <div>
                <b>{bs.isBalanced ? 'Balance Sheet Equation Balanced: Assets = Liabilities + Equity' : 'Balance Sheet Discrepancy Detected!'}</b>
                <p className="sub" style={{ fontSize: 13, marginTop: 4 }}>
                  Assets: {formatCurrency(bs.totalAssets)} · Liabilities + Equity: {formatCurrency(bs.totalLiabilities + bs.totalEquity)} · Difference: {formatCurrency(bs.difference)}
                </p>
              </div>
              <span className={`badge ${bs.isBalanced ? 'green' : 'amber'}`}>
                {bs.isBalanced ? 'Balanced' : 'Imbalance'}
              </span>
            </div>
          </div>

          <div className="panel">
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Line Item / Account Classification</th>
                    <th>Account Code</th>
                    <th style={{ textAlign: 'right' }}>Amount (QAR)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ background: '#f8fafc' }}><td colSpan={3}><b>ASSETS</b></td></tr>
                  {bs.assets.map((a: TrialBalanceRow) => (
                    <tr key={a.code}>
                      <td style={{ paddingLeft: 24 }}>{a.name} <span className="caption">· Source {a.code.split(' → ')[0]} · Mapping {a.mappedStatementLine || 'legacy'}</span></td>
                      <td><span className="mono">{a.code}</span></td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(a.balance)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={2}><b>Total Assets</b></td>
                    <td style={{ textAlign: 'right' }}><b>{formatCurrency(bs.totalAssets)}</b></td>
                  </tr>

                  <tr style={{ background: '#f8fafc' }}><td colSpan={3}><b>LIABILITIES</b></td></tr>
                  {bs.liabilities.map((l: TrialBalanceRow) => (
                    <tr key={l.code}>
                      <td style={{ paddingLeft: 24 }}>{l.name} <span className="caption">· Source {l.code.split(' → ')[0]} · Mapping {l.mappedStatementLine || 'legacy'}</span></td>
                      <td><span className="mono">{l.code}</span></td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(Math.abs(l.balance))}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={2}><b>Total Liabilities</b></td>
                    <td style={{ textAlign: 'right' }}><b>{formatCurrency(bs.totalLiabilities)}</b></td>
                  </tr>

                  <tr style={{ background: '#f8fafc' }}><td colSpan={3}><b>EQUITY</b></td></tr>
                  {bs.equity.map((e: TrialBalanceRow) => (
                    <tr key={e.code}>
                      <td style={{ paddingLeft: 24 }}>{e.name} <span className="caption">· Source {e.code.split(' → ')[0]} · Mapping {e.mappedStatementLine || 'legacy'}</span></td>
                      <td><span className="mono">{e.code}</span></td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(Math.abs(e.balance))}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ paddingLeft: 24 }}>Current-period profit / (loss)</td>
                    <td>—</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(bs.currentPeriodResult)}</td>
                  </tr>
                  <tr>
                    <td colSpan={2}><b>Total Equity</b></td>
                    <td style={{ textAlign: 'right' }}><b>{formatCurrency(bs.totalEquity)}</b></td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}><b>Total Liabilities and Equity</b></td>
                    <td style={{ textAlign: 'right' }}><b>{formatCurrency(bs.totalLiabilities + bs.totalEquity)}</b></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2: Income Statement */}
      {statementType === 'is' && (
        <div className="panel">
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Operating Category</th>
                  <th style={{ textAlign: 'right' }}>Amount (QAR)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><b>Revenue from Contracts with Customers</b></td>
                  <td style={{ textAlign: 'right' }}><b>{formatCurrency(is.revenue)}</b></td>
                </tr>
                <tr>
                  <td style={{ paddingLeft: 24 }}>Cost of Sales</td>
                  <td style={{ textAlign: 'right' }}>({formatCurrency(is.costOfSales)})</td>
                </tr>
                <tr style={{ background: '#f8fafc' }}>
                  <td><b>Gross Profit</b></td>
                  <td style={{ textAlign: 'right' }}><b>{formatCurrency(is.grossProfit)}</b></td>
                </tr>
                <tr>
                  <td style={{ paddingLeft: 24 }}>General & Administrative Expenses</td>
                  <td style={{ textAlign: 'right' }}>({formatCurrency(is.operatingExpenses)})</td>
                </tr>
                <tr style={{ background: '#f8fafc' }}>
                  <td><b>Operating Profit (EBIT)</b></td>
                  <td style={{ textAlign: 'right' }}><b>{formatCurrency(is.netProfit)}</b></td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td><b>Net Profit for the Year Attributable to Owners</b></td>
                  <td style={{ textAlign: 'right' }}><b>{formatCurrency(is.netProfit)}</b></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* 3: Statement of Changes in Equity */}
      {statementType === 'equity' && (
        <div className="panel panel-pad">
          <h3>Statement of Changes in Equity</h3>
          <div className="tablewrap mt12">
            <table>
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Share Capital</th>
                  <th>Retained Earnings</th>
                  <th>Total Equity</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Opening Balance at 01 January 2026</td>
                  <td>{formatCurrency(500000)}</td>
                  <td>{formatCurrency(100000)}</td>
                  <td>{formatCurrency(600000)}</td>
                </tr>
                <tr>
                  <td>Profit for the Year</td>
                  <td>—</td>
                  <td>{formatCurrency(is.netProfit)}</td>
                  <td>{formatCurrency(is.netProfit)}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td><b>Closing Balance at 31 December 2026</b></td>
                  <td><b>{formatCurrency(500000)}</b></td>
                  <td><b>{formatCurrency(100000 + is.netProfit)}</b></td>
                  <td><b>{formatCurrency(600000 + is.netProfit)}</b></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* 4: Statement of Cash Flows */}
      {statementType === 'cashflow' && (
        <div className="panel panel-pad">
          <h3>Statement of Cash Flows (Indirect Method)</h3>
          <div className="tablewrap mt12">
            <table>
              <thead>
                <tr>
                  <th>Cash Flow Activity</th>
                  <th style={{ textAlign: 'right' }}>Amount (QAR)</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Operating Profit Before Working Capital Changes</td><td style={{ textAlign: 'right' }}>{formatCurrency(is.netProfit)}</td></tr>
                <tr><td style={{ paddingLeft: 24 }}>Depreciation of Property and Equipment</td><td style={{ textAlign: 'right' }}>{formatCurrency(45000)}</td></tr>
                <tr><td style={{ paddingLeft: 24 }}>Net change in trade receivables and payables</td><td style={{ textAlign: 'right' }}>({formatCurrency(20000)})</td></tr>
                <tr style={{ background: '#f8fafc' }}><td><b>Net Cash Generated from Operating Activities</b></td><td style={{ textAlign: 'right' }}><b>{formatCurrency(is.netProfit + 25000)}</b></td></tr>
                <tr><td>Purchase of Property, Plant and Equipment</td><td style={{ textAlign: 'right' }}>({formatCurrency(50000)})</td></tr>
                <tr style={{ background: '#f8fafc' }}><td><b>Net Cash Used in Investing Activities</b></td><td style={{ textAlign: 'right' }}><b>({formatCurrency(50000)})</b></td></tr>
              </tbody>
              <tfoot>
                <tr><td><b>Net Increase in Cash and Cash Equivalents</b></td><td style={{ textAlign: 'right' }}><b>{formatCurrency(is.netProfit - 25000)}</b></td></tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
