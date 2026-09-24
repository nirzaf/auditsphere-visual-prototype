// Module 24: Financial Statements Generation & Export (VP-040, VP-041)
import React, { useState } from 'react';
import { CashFlowScheduleRevision, RouteKey, TrialBalanceRow } from '../../types';
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
  const [comparativeEngagementId, setComparativeEngagementId] = useState('');
  const [, refreshRevisionHistory] = useState(0);
  const [revisionError, setRevisionError] = useState('');
  const [cashFlowError, setCashFlowError] = useState('');
  const latestCashFlow = state.engagements.find(e => e.id === state.selectedEngagement)?.cashFlowScheduleHistory?.at(-1);
  const [cashFlowDraft, setCashFlowDraft] = useState(() => ({
    openingCash: latestCashFlow?.openingCash ?? 0,
    closingCash: latestCashFlow?.closingCash ?? 0,
    movements: latestCashFlow?.movements.map(item => ({ ...item })) ?? [{ id: crypto.randomUUID(), description: '', category: 'Operating' as const, amount: 0, evidenceRef: '' }]
  }));

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

  const adjustmentResult = applyReportingAdjustments(selectedEng.rows, state.adjustmentJournals.filter(j => j.engagementId === selectedEng.id), selectedEng.sourceVersion);
  const mappingHistory = (state.accountMappingRevisions || []).filter(item => item.engagementId === selectedEng.id);
  const currentMapping = [...mappingHistory].sort((a, b) => b.revision - a.revision)[0];
  const mappedAccounts = currentMapping?.mappings || [];
  const unmappedRows = selectedEng.rows.filter(row => !mappedAccounts.some(mapping => mapping.accountCode === row.code));
  const mappingReady = Boolean(currentMapping?.status === 'Approved' && !unmappedRows.length);
  const cashFlowHistory = (selectedEng.cashFlowScheduleHistory || []).slice().sort((a, b) => b.revision - a.revision);
  const currentCashFlowRevision = cashFlowHistory[0];
  const cashFlowCurrent = Boolean(currentCashFlowRevision && currentCashFlowRevision.sourceVersion === selectedEng.sourceVersion && currentCashFlowRevision.mappingRevision === currentMapping?.revision && mappingReady);
  const updateCashFlowMovement = (id: string, changes: Partial<CashFlowScheduleRevision['movements'][number]>) => setCashFlowDraft(current => ({ ...current, movements: current.movements.map(item => item.id === id ? { ...item, ...changes } : item) }));
  const saveCashFlow = () => {
    try {
      setCashFlowError('');
      prototypeStore.saveCashFlowSchedule({ engagementId: selectedEng.id, sourceVersion: selectedEng.sourceVersion, mappingRevision: currentMapping!.revision, ...structuredClone(cashFlowDraft) });
      const saved = prototypeStore.getSnapshot().engagements.find(item => item.id === selectedEng.id)?.cashFlowScheduleHistory?.at(-1);
      if (saved) setCashFlowDraft({ openingCash: saved.openingCash, closingCash: saved.closingCash, movements: saved.movements.map(item => ({ ...item })) });
      refreshRevisionHistory(value => value + 1);
    } catch (error) { setCashFlowError(error instanceof Error ? error.message : String(error)); }
  };
  const reviewCashFlow = () => {
    try { setCashFlowError(''); prototypeStore.reviewCashFlowSchedule(selectedEng.id, currentCashFlowRevision!.revision); refreshRevisionHistory(value => value + 1); }
    catch (error) { setCashFlowError(error instanceof Error ? error.message : String(error)); }
  };
  const mapRows = (rows: TrialBalanceRow[], mappings: typeof mappedAccounts): TrialBalanceRow[] => rows.flatMap(row => {
    const targets = mappings.find(mapping => mapping.accountCode === row.code)?.targets || [];
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
  });
  const statementRows: TrialBalanceRow[] = mappingReady
    ? mapRows(adjustmentResult.rows, mappedAccounts)
    : adjustmentResult.rows;
  const bs = calculateBalanceSheet(statementRows);
  const is = calculateIncomeStatement(statementRows);
  const priorPeriods = state.engagements.filter(eng => eng.client === selectedEng.client && eng.currency === selectedEng.currency && eng.year < selectedEng.year).sort((a, b) => b.year - a.year);
  const comparativeEngagement = priorPeriods.find(eng => eng.id === comparativeEngagementId) || priorPeriods[0];
  const priorMapping = comparativeEngagement && [...(state.accountMappingRevisions || []).filter(item => item.engagementId === comparativeEngagement.id)].sort((a, b) => b.revision - a.revision)[0];
  const priorUnmapped = comparativeEngagement?.rows.filter(row => !priorMapping?.mappings.some(mapping => mapping.accountCode === row.code)) || [];
  const priorMappingReady = Boolean(priorMapping?.status === 'Approved' && priorUnmapped.length === 0);
  const priorAdjustmentResult = comparativeEngagement && applyReportingAdjustments(comparativeEngagement.rows, state.adjustmentJournals.filter(j => j.engagementId === comparativeEngagement.id), comparativeEngagement.sourceVersion);
  const priorRows = comparativeEngagement && priorMappingReady && priorAdjustmentResult ? mapRows(priorAdjustmentResult.rows, priorMapping!.mappings) : [];
  const priorBalanceSheet = priorRows.length ? calculateBalanceSheet(priorRows) : null;
  const priorIncomeStatement = priorRows.length ? calculateIncomeStatement(priorRows) : null;
  const comparativeReady = Boolean(mappingReady && priorBalanceSheet && priorIncomeStatement && comparativeEngagement);
  const comparisonAmount = (row: TrialBalanceRow) => row.type === 'asset' ? row.balance : Math.abs(row.balance);
  const comparisonLineRows = [...new Set(statementRows.map(row => row.mappedStatementLine).filter((line): line is string => Boolean(line)))].sort().map(line => {
    const currentRows = statementRows.filter(row => row.mappedStatementLine === line);
    const priorLineRows = priorRows.filter(row => row.mappedStatementLine === line);
    return {
      line,
      current: currentRows.reduce((sum, row) => sum + comparisonAmount(row), 0),
      prior: priorLineRows.reduce((sum, row) => sum + comparisonAmount(row), 0),
      currentSources: currentRows.map(row => row.code.split(' → ')[0]).join(', '),
      priorSources: priorLineRows.map(row => row.code.split(' → ')[0]).join(', ')
    };
  });
  const statementHistory = (state.statementSetRevisions || []).filter(item => item.engagementId === selectedEng.id).sort((a, b) => b.revision - a.revision);
  const latestStatementRevision = statementHistory[0];
  const currentStatementTotals = { assets: bs.totalAssets, liabilities: bs.totalLiabilities, equity: bs.totalEquity, revenue: is.revenue, netProfit: is.netProfit };
  const comparativeStatementTotals = comparativeReady && priorBalanceSheet && priorIncomeStatement ? { assets: priorBalanceSheet.totalAssets, liabilities: priorBalanceSheet.totalLiabilities, equity: priorBalanceSheet.totalEquity, revenue: priorIncomeStatement.revenue, netProfit: priorIncomeStatement.netProfit } : undefined;
  const revisionCurrent = Boolean(latestStatementRevision && latestStatementRevision.sourceVersion === selectedEng.sourceVersion && latestStatementRevision.mappingRevision === currentMapping?.revision && latestStatementRevision.comparativeEngagementId === (comparativeReady ? comparativeEngagement?.id : undefined) && latestStatementRevision.comparativeSourceVersion === (comparativeReady ? comparativeEngagement?.sourceVersion : undefined) && latestStatementRevision.comparativeMappingRevision === (comparativeReady ? priorMapping?.revision : undefined));
  const saveStatementRevision = () => {
    try {
      setRevisionError('');
      prototypeStore.saveStatementSetRevision({ engagementId: selectedEng.id, sourceVersion: selectedEng.sourceVersion, mappingRevision: currentMapping!.revision, comparativeEngagementId: comparativeReady ? comparativeEngagement!.id : undefined, comparativeSourceVersion: comparativeReady ? comparativeEngagement!.sourceVersion : undefined, comparativeMappingRevision: comparativeReady ? priorMapping!.revision : undefined, layoutVersion: 1, totals: currentStatementTotals, comparativeTotals: comparativeStatementTotals, lines: comparisonLineRows.map(row => ({ line: row.line, current: row.current, comparative: comparativeReady ? row.prior : undefined, currentSources: row.currentSources.split(', ').filter(Boolean), comparativeSources: comparativeReady ? row.priorSources.split(', ').filter(Boolean) : [] })) });
      refreshRevisionHistory(value => value + 1);
    } catch (error) { setRevisionError(error instanceof Error ? error.message : String(error)); }
  };
  const reviewStatementRevision = () => {
    try { setRevisionError(''); prototypeStore.reviewStatementSetRevision(selectedEng.id, latestStatementRevision!.revision); refreshRevisionHistory(value => value + 1); }
    catch (error) { setRevisionError(error instanceof Error ? error.message : String(error)); refreshRevisionHistory(value => value + 1); }
  };

  const handleExportXLSX = () => {
    const priorAmount = (value?: number) => comparativeReady ? value ?? 0 : 'Unavailable';
    const currentColumn = `Current FY${selectedEng.year} (${selectedEng.currency})`;
    const priorColumn = `Comparative FY${comparativeEngagement?.year ?? 'unavailable'} (${selectedEng.currency})`;
    const pairedRow = (line: string, current: number, prior?: number, currentSources = '', priorSources = '') => ({
      LineItem: line,
      [currentColumn]: current,
      [priorColumn]: priorAmount(prior),
      'Current source accounts': currentSources,
      'Comparative source accounts': comparativeReady ? priorSources : 'Unavailable'
    });
    const data = [
      pairedRow('Total assets', bs.totalAssets, priorBalanceSheet?.totalAssets),
      pairedRow('Total liabilities', bs.totalLiabilities, priorBalanceSheet?.totalLiabilities),
      pairedRow('Total equity', bs.totalEquity, priorBalanceSheet?.totalEquity),
      pairedRow('Current-period result', bs.currentPeriodResult, priorBalanceSheet?.currentPeriodResult),
      ...comparisonLineRows.map(row => pairedRow(row.line, row.current, row.prior, row.currentSources, row.priorSources)),
      pairedRow('Revenue', is.revenue, priorIncomeStatement?.revenue),
      pairedRow('Cost of sales', is.costOfSales, priorIncomeStatement?.costOfSales),
      pairedRow('Gross profit', is.grossProfit, priorIncomeStatement?.grossProfit),
      pairedRow('Operating expenses', is.operatingExpenses, priorIncomeStatement?.operatingExpenses),
      pairedRow('Net profit', is.netProfit, priorIncomeStatement?.netProfit)
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
      `Net Profit for the Year: ${formatCurrency(is.netProfit)}`,
      '',
      comparativeReady ? `COMPARATIVE DETAIL · FY ${comparativeEngagement!.year}` : 'COMPARATIVE PERIOD UNAVAILABLE',
      ...(comparativeReady ? comparisonLineRows.map(row => `${row.line}: current ${formatCurrency(row.current)} [${row.currentSources}] · prior ${formatCurrency(row.prior)} [${row.priorSources}]`) : ['No comparative figures are substituted.'])
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

      <section className="panel panel-pad" aria-label="Statement revision review">
        <div className="between"><div><h3>Statement Set Revisions</h3><p className="sub">Save this mapped statement set, then have an independent reviewer approve the saved revision.</p></div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn sm ghost" disabled={!mappingReady} onClick={saveStatementRevision}>Save statement revision</button>
            {latestStatementRevision?.status === 'Draft' && revisionCurrent && <button className="btn sm primary" onClick={reviewStatementRevision}>Review statement revision v{latestStatementRevision.revision}</button>}
          </div>
        </div>
        {revisionError && <p role="alert" className="badge danger mt12">{revisionError}</p>}
        {latestStatementRevision && <p role="status" className="mt12">Latest: v{latestStatementRevision.revision} · {revisionCurrent ? latestStatementRevision.status : 'Stale'} · prepared by {latestStatementRevision.preparedByUserId}{latestStatementRevision.reviewedByUserId ? ` · reviewed by ${latestStatementRevision.reviewedByUserId}` : ''}</p>}
        <div className="caption mt8">{statementHistory.length ? statementHistory.map(item => `v${item.revision} ${item.status} · ${new Date(item.preparedAt).toLocaleString()}`).join(' | ') : 'No statement revisions saved.'}</div>
      </section>

      <section className="panel panel-pad" aria-label="Comparative period summary">
        <div className="between"><div><h3>Comparative Period</h3><p className="sub">Choose an earlier source period for this client and currency. Missing or unmapped periods remain unavailable.</p></div>
          <select className="input" aria-label="Comparative period" value={comparativeEngagement?.id || ''} onChange={e => { prototypeStore.staleStatementRevisionsForComparativeChange(selectedEng.id, e.target.value); setComparativeEngagementId(e.target.value); }} style={{ maxWidth: 320 }}>
            {priorPeriods.length ? priorPeriods.map(eng => <option key={eng.id} value={eng.id}>{eng.year} · {eng.period}</option>) : <option value="">No prior period</option>}
          </select>
        </div>
        {!mappingReady ? <p role="status" className="badge amber mt12">Current period unavailable until its mapping is independently approved.</p>
          : !comparativeEngagement ? <p role="status" className="badge amber mt12">Comparative period unavailable; no earlier source period exists for this client and currency.</p>
          : !priorMappingReady ? <p role="status" className="badge amber mt12">Comparative period unavailable; {comparativeEngagement.year} accounts lack a complete independently approved mapping. No zero amounts are substituted.</p>
          : priorBalanceSheet && priorIncomeStatement && <div className="tablewrap mt12"><table><thead><tr><th>Statement total</th><th>{selectedEng.year} current ({selectedEng.currency})</th><th>{comparativeEngagement.year} comparative ({selectedEng.currency})</th></tr></thead><tbody>
            {[["Total assets", bs.totalAssets, priorBalanceSheet.totalAssets], ["Total liabilities", bs.totalLiabilities, priorBalanceSheet.totalLiabilities], ["Total equity", bs.totalEquity, priorBalanceSheet.totalEquity], ["Revenue", is.revenue, priorIncomeStatement.revenue], ["Net profit", is.netProfit, priorIncomeStatement.netProfit]].map(([label, current, prior]) => <tr key={String(label)}><td>{label}</td><td>{formatCurrency(Number(current))}</td><td>{formatCurrency(Number(prior))}</td></tr>)}
          </tbody></table></div>}
      </section>

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
        <section className="panel panel-pad" aria-label="Statement of Changes in Equity">
          <h3>Statement of Changes in Equity</h3>
          <p role="status" className="badge amber mt12" style={{ display: 'block', padding: 12 }}>
            Statement of Changes in Equity is unavailable: the current account mapping combines share capital and reserves, and no reviewed equity movement schedule is recorded. No equity figures are substituted.
          </p>
        </section>
      )}

      {/* 4: Statement of Cash Flows */}
      {statementType === 'cashflow' && (
        <section className="panel panel-pad" aria-label="Statement of Cash Flows">
          <div className="between"><div><h3>Statement of Cash Flows</h3><p className="sub">Enter supported movements from scoped evidence. Non-cash items are disclosed separately and excluded from the cash reconciliation.</p></div>
            <div className="row" style={{ gap: 8 }}>
              {currentCashFlowRevision?.status === 'Draft' && cashFlowCurrent && <button className="btn sm primary" onClick={reviewCashFlow}>Review schedule v{currentCashFlowRevision.revision}</button>}
              <button className="btn sm ghost" disabled={!mappingReady} onClick={saveCashFlow}>Save movement revision</button>
            </div>
          </div>
          {!mappingReady && <div role="status" className="badge amber mt12" style={{ display: 'block', padding: 12 }}>An approved complete account mapping is required before preparing cash flows.</div>}
          {cashFlowError && <p role="alert" className="badge danger mt12">{cashFlowError}</p>}
          {currentCashFlowRevision && <p role="status" className="mt12">Latest schedule v{currentCashFlowRevision.revision} · {cashFlowCurrent ? currentCashFlowRevision.status : 'Stale'} · prepared by {currentCashFlowRevision.preparedByUserId}{currentCashFlowRevision.reviewedByUserId ? ` · reviewed by ${currentCashFlowRevision.reviewedByUserId}` : ''}</p>}
          <div className="grid2 mt12">
            <label className="caption">Opening cash ({selectedEng.currency})<input className="input mt4" type="number" step="0.01" min="0" aria-label="Opening cash" value={cashFlowDraft.openingCash} onChange={event => setCashFlowDraft(current => ({ ...current, openingCash: Number(event.target.value) }))} /></label>
            <label className="caption">Closing cash ({selectedEng.currency})<input className="input mt4" type="number" step="0.01" min="0" aria-label="Closing cash" value={cashFlowDraft.closingCash} onChange={event => setCashFlowDraft(current => ({ ...current, closingCash: Number(event.target.value) }))} /></label>
          </div>
          <div className="tablewrap mt12"><table><thead><tr><th>Movement</th><th>Classification</th><th>Amount ({selectedEng.currency})</th><th>Evidence document ID</th><th></th></tr></thead><tbody>
            {cashFlowDraft.movements.map(item => <tr key={item.id}>
              <td><input className="input" aria-label={`Movement description ${item.id}`} value={item.description} onChange={event => updateCashFlowMovement(item.id, { description: event.target.value })} /></td>
              <td><select className="input" aria-label={`Movement category ${item.id}`} value={item.category} onChange={event => updateCashFlowMovement(item.id, { category: event.target.value as CashFlowScheduleRevision['movements'][number]['category'] })}>{['Operating', 'Investing', 'Financing', 'Equity contribution', 'Equity distribution', 'Non-cash'].map(category => <option key={category}>{category}</option>)}</select></td>
              <td><input className="input" aria-label={`Movement amount ${item.id}`} type="number" step="0.01" value={item.amount} onChange={event => updateCashFlowMovement(item.id, { amount: Number(event.target.value) })} /></td>
              <td><input className="input" aria-label={`Movement evidence ${item.id}`} value={item.evidenceRef} onChange={event => updateCashFlowMovement(item.id, { evidenceRef: event.target.value })} /></td>
              <td><button className="btn sm ghost" aria-label={`Remove movement ${item.id}`} onClick={() => setCashFlowDraft(current => ({ ...current, movements: current.movements.filter(movement => movement.id !== item.id) }))}>Remove</button></td>
            </tr>)}
          </tbody></table></div>
          <button className="btn sm ghost mt8" onClick={() => setCashFlowDraft(current => ({ ...current, movements: [...current.movements, { id: crypto.randomUUID(), description: '', category: 'Operating', amount: 0, evidenceRef: '' }] }))}>Add movement</button>
          <div className="grid3 mt12">
            <div className="borderbox panel-pad"><span className="caption">Cash movement (non-cash excluded)</span><b className="block mt4">{formatCurrency(cashFlowDraft.movements.filter(item => item.category !== 'Non-cash').reduce((sum, item) => sum + item.amount, 0))}</b></div>
            <div className="borderbox panel-pad"><span className="caption">Calculated closing cash</span><b className="block mt4">{formatCurrency(cashFlowDraft.openingCash + cashFlowDraft.movements.filter(item => item.category !== 'Non-cash').reduce((sum, item) => sum + item.amount, 0))}</b></div>
            <div className="borderbox panel-pad"><span className="caption">Approved mapped TB cash</span><b className="block mt4">{formatCurrency(mappedAccounts.flatMap(mapping => mapping.targets.filter(target => target.statementLine === 'Cash and cash equivalents').map(target => (selectedEng.rows.find(row => row.code === mapping.accountCode)?.balance || 0) * target.percentage / 100)).reduce((sum, amount) => sum + amount, 0))}</b></div>
          </div>
          {cashFlowHistory.length > 0 && <div className="caption mt12">History: {cashFlowHistory.map(item => `v${item.revision} ${item.status} · ${new Date(item.preparedAt).toLocaleString()}`).join(' | ')}</div>}
        </section>
      )}
    </div>
  );
};
