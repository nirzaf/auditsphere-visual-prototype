// Module 24: Financial Statements Generation & Export (VP-040, VP-041)
import React, { useState } from 'react';
import { RouteKey, TrialBalanceRow } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';
import { calculateBalanceSheet, calculateIncomeStatement, formatCurrency } from '../../services/calculations';
import { exportService } from '../../services/exportService';

interface FinancialStatementsViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const FinancialStatementsView: React.FC<FinancialStatementsViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const [statementType, setStatementType] = useState<'bs' | 'is' | 'equity' | 'cashflow'>('bs');

  const selectedEng = state.engagements.find(e => e.id === state.selectedEngagement) || state.engagements[0];
  const client = state.clients.find(c => c.id === selectedEng?.client);

  const bs = calculateBalanceSheet(selectedEng.rows);
  const is = calculateIncomeStatement(selectedEng.rows);

  const handleExportXLSX = () => {
    const data = [
      { LineItem: 'Assets', Amount: bs.totalAssets },
      ...bs.assets.map((a: TrialBalanceRow) => ({ LineItem: `  ${a.name} (${a.code})`, Amount: a.balance })),
      { LineItem: 'Liabilities', Amount: bs.totalLiabilities },
      ...bs.liabilities.map((l: TrialBalanceRow) => ({ LineItem: `  ${l.name} (${l.code})`, Amount: Math.abs(l.balance) })),
      { LineItem: 'Equity', Amount: bs.totalEquity },
      ...bs.equity.map((e: TrialBalanceRow) => ({ LineItem: `  ${e.name} (${e.code})`, Amount: Math.abs(e.balance) })),
      { LineItem: 'Revenue', Amount: is.revenue },
      { LineItem: 'Cost of Sales', Amount: is.costOfSales },
      { LineItem: 'Gross Profit', Amount: is.grossProfit },
      { LineItem: 'Operating Expenses', Amount: is.operatingExpenses },
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
          <button className="btn sm ghost" onClick={handleExportXLSX}>
            <Icon name="download" /> Export XLSX
          </button>
          <button className="btn primary sm" onClick={handleExportPDF}>
            <Icon name="download" /> Export PDF
          </button>
        </div>
      </div>

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
                      <td style={{ paddingLeft: 24 }}>{a.name}</td>
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
                      <td style={{ paddingLeft: 24 }}>{l.name}</td>
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
                      <td style={{ paddingLeft: 24 }}>{e.name}</td>
                      <td><span className="mono">{e.code}</span></td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(Math.abs(e.balance))}</td>
                    </tr>
                  ))}
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
