// Modules 20–23: Accounting Workbench (VP-034 through VP-039)
// 5 Tabs: Trial Balance, General Ledger, Mappings, Adjustments, Reconciliations

import React, { useState } from 'react';
import { RouteKey, TrialBalanceRow, AdjustmentJournalItem, ReconciliationSchedule, ClientAccountingProfile } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';
import { calculateTrialBalanceTotals, verifyGLCompleteness, calculateReconciliationVariance, formatCurrency } from '../../services/calculations';
import { TBImportWizard } from './TBImportWizard';
import { GL_FILE_BYTES_LIMIT, parseGLWorkbook, ParsedGLSource } from '../../services/glImport';
import { exportService } from '../../services/exportService';

const AccountingSetup: React.FC<{ clientId: string; engagementId: string; profile?: ClientAccountingProfile }> = ({ clientId, engagementId, profile }) => {
  const seed: ClientAccountingProfile = profile || { legalEntityName: '', reportingBasis: 'Not selected', baseCurrency: 'QAR', accounts: [], periodBooks: [], dimensions: [], revision: 0, chartRevision: 0, history: [] };
  const [draft, setDraft] = useState(structuredClone(seed));
  const [periodId, setPeriodId] = useState(seed.periodBooks.find(book => book.ownerEngagementId === engagementId)?.id || '');
  const [notice, setNotice] = useState('');
  const set = (key: keyof ClientAccountingProfile, value: any) => setDraft(current => ({ ...current, [key]: value }));
  const updateAccount = (index: number, field: string, value: any) => set('accounts', draft.accounts.map((account, i) => i === index ? { ...account, [field]: value } : account));
  const updateBook = (index: number, field: string, value: any) => set('periodBooks', draft.periodBooks.map((book, i) => i === index ? { ...book, [field]: value } : book));
  const save = (event: React.FormEvent) => { event.preventDefault(); try { const revision = prototypeStore.saveAccountingProfile(clientId, draft, engagementId, periodId); setNotice(`Accounting setup saved as Rev ${revision}. Dependent mappings and approvals may need review.`); } catch (error) { setNotice(error instanceof Error ? error.message : 'Setup could not be saved.'); } };
  return <form className="panel panel-pad stack" onSubmit={save}>
    <div className="between"><div><h3>Client accounting context</h3><p className="sub">Profile Rev {seed.revision} · Chart Rev {seed.chartRevision} · Changes are versioned.</p></div><button className="btn primary sm" type="submit">Save Accounting Setup</button></div>
    {notice && <p role="status" className="tag blue">{notice}</p>}
    <div className="grid grid-3"><label>Legal entity<input required value={draft.legalEntityName} onChange={e => set('legalEntityName', e.target.value)} /></label><label>Reporting basis<select value={draft.reportingBasis} onChange={e => set('reportingBasis', e.target.value)}><option>Not selected</option><option>IFRS</option><option>Local GAAP</option><option>Other</option></select></label><label>Base currency<input required maxLength={3} value={draft.baseCurrency} onChange={e => set('baseCurrency', e.target.value.toUpperCase())} /></label></div>
    <section><div className="between"><h3>Periods and books</h3><button className="btn sm" type="button" onClick={() => { const id = `PB-${crypto.randomUUID()}`; set('periodBooks', [...draft.periodBooks, { id, name: `FY${new Date().getFullYear()}`, bookName: 'General ledger', startDate: `${new Date().getFullYear()}-01-01`, endDate: `${new Date().getFullYear()}-12-31`, ownerEngagementId: engagementId, status: 'Open' }]); setPeriodId(id); }}>Add period/book</button></div>
      {draft.periodBooks.map((book, i) => <div className="row" key={book.id}><input aria-label="Period name" value={book.name} onChange={e => updateBook(i, 'name', e.target.value)} /><input aria-label="Book name" value={book.bookName} onChange={e => updateBook(i, 'bookName', e.target.value)} /><input aria-label="Period start" type="date" value={book.startDate} onChange={e => updateBook(i, 'startDate', e.target.value)} /><input aria-label="Period end" type="date" value={book.endDate} onChange={e => updateBook(i, 'endDate', e.target.value)} /><select aria-label="Import period book" value={periodId} onChange={e => setPeriodId(e.target.value)}><option value="">Select book</option><option value={book.id}>{book.name} · {book.bookName}</option></select><select aria-label="Period status" value={book.status} onChange={e => updateBook(i, 'status', e.target.value)}><option>Open</option><option>Closed</option></select></div>)}
    </section>
    <section><div className="between"><h3>Chart of accounts</h3><button className="btn sm" type="button" onClick={() => set('accounts', [...draft.accounts, { code: '', name: '', type: 'asset', posting: true, active: true }])}>Add account</button></div><div className="tablewrap"><table><thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Parent</th><th>Posting</th><th>Active</th></tr></thead><tbody>{draft.accounts.map((account, i) => <tr key={`${account.code}-${i}`}><td><input aria-label="Account code" value={account.code} onChange={e => updateAccount(i, 'code', e.target.value)} /></td><td><input aria-label="Account name" value={account.name} onChange={e => updateAccount(i, 'name', e.target.value)} /></td><td><select aria-label="Account type" value={account.type} onChange={e => updateAccount(i, 'type', e.target.value)}>{['asset','liability','equity','revenue','expense'].map(type => <option key={type}>{type}</option>)}</select></td><td><select aria-label="Account parent" value={account.parentCode || ''} onChange={e => updateAccount(i, 'parentCode', e.target.value || undefined)}><option value="">None</option>{draft.accounts.filter(item => item.code !== account.code).map(item => <option key={item.code} value={item.code}>{item.code} · {item.name}</option>)}</select></td><td><input aria-label="Posting account" type="checkbox" checked={account.posting} onChange={e => updateAccount(i, 'posting', e.target.checked)} /></td><td><input aria-label="Active account" type="checkbox" checked={account.active} onChange={e => updateAccount(i, 'active', e.target.checked)} /></td></tr>)}</tbody></table></div></section>
    <section><h3>Dimensions</h3>{(['Department','Cost centre','Project'] as const).map(name => { const dimension = draft.dimensions.find(item => item.name === name); return <label key={name} className="block">{name}<input aria-label={`${name} values`} value={dimension?.values.join(', ') || ''} placeholder="Optional values, comma separated" onChange={e => { const dimensions = draft.dimensions.filter(item => item.name !== name); if (e.target.value.trim()) dimensions.push({ id: name.toLowerCase().replace(' ', '-'), name, values: e.target.value.split(',').map(value => value.trim()).filter(Boolean), active: true }); set('dimensions', dimensions); }} /></label>; })}</section>
    {seed.history.length > 0 && <details><summary>Previous revisions ({seed.history.length})</summary>{seed.history.map(history => <p key={`${history.revision}-${history.savedAt}`}>Rev {history.revision} · Chart Rev {history.chartRevision} · {history.savedAt}</p>)}</details>}
  </form>;
};

interface AccountingWorkbenchViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const AccountingWorkbenchView: React.FC<AccountingWorkbenchViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const [activeTab, setActiveTab] = useState<'tb' | 'gl' | 'mappings' | 'adjustments' | 'reconciliations' | 'setup'>('tb');
  const [mappingTargets, setMappingTargets] = useState<Record<string, string>>({});
  const [recDraft, setRecDraft] = useState<ReconciliationSchedule | null>(null);
  const [recNotice, setRecNotice] = useState('');
  const [glFileName, setGLFileName] = useState('');
  const [glBytes, setGLBytes] = useState<ArrayBuffer | null>(null);
  const [glPreview, setGLPreview] = useState<ParsedGLSource | null>(null);
  const [glNotice, setGLNotice] = useState('');
  const [glAccountFilter, setGLAccountFilter] = useState('');
  const [glJournalFilter, setGLJournalFilter] = useState('');

  const selectedEng = state.engagements.find(e => e.id === state.selectedEngagement) || state.engagements[0];
  const client = state.clients.find(c => c.id === selectedEng?.client);

  if (!selectedEng) {
    return (
      <div className="panel panel-pad text-center" style={{ padding: '60px 20px' }}>
        <Icon name="calculator" size="xl" className="text-muted mb16" />
        <h3>No Active Engagement Selected</h3>
        <p className="sub max-w-md mx-auto mt8">
          Select or create an engagement to work with trial balances, GL transactions, adjustments, and reconciliations.
        </p>
        <button className="btn primary sm mt16" onClick={() => onNavigate('engagements')}>
          Go to Engagements
        </button>
      </div>
    );
  }

  // TB State
  const [editRowCode, setEditRowCode] = useState<string | null>(null);
  const [editBalance, setEditBalance] = useState<number>(0);
  const [splitModalAccount, setSplitModalAccount] = useState<{
    code: string;
    name: string;
    balance: number;
    targets: { statementLine: string; percentage: number }[];
  } | null>(null);

  // Adjustment form state
  const [showAddAdjModal, setShowAddAdjModal] = useState(false);
  const [adjTitle, setAdjTitle] = useState('Accrued audit fees and advisory expenses');
  const [adjDebitAccount, setAdjDebitAccount] = useState('5100');
  const [adjCreditAccount, setAdjCreditAccount] = useState('2100');
  const [adjAmount, setAdjAmount] = useState(35000);
  const [adjRationale, setAdjRationale] = useState('Record unbilled professional audit and consulting fees.');

  const tbTotals = calculateTrialBalanceTotals(selectedEng.rows);
  const glSource = selectedEng.glSourceHistory?.at(-1);
  const glTransactions = glSource?.transactions || state.glTransactions.filter(line => line.engagementId === selectedEng.id);
  const glVerify = verifyGLCompleteness(glTransactions, selectedEng.rows, glSource?.openingBalances);
  const visibleGLTransactions = glTransactions.filter(line => (!glAccountFilter || line.accountCode.toLowerCase().includes(glAccountFilter.toLowerCase())) && (!glJournalFilter || line.journalId.toLowerCase().includes(glJournalFilter.toLowerCase())));
  const safeCSVText = (value: string) => /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  const mappingHistory = (state.accountMappingRevisions || []).filter(item => item.engagementId === selectedEng.id);
  const activeMapping = [...mappingHistory].sort((a, b) => b.revision - a.revision)[0];
  const activeMappings = activeMapping?.mappings || [];
  const statementLines = ['Cash and cash equivalents', 'Trade receivables', 'Other current assets', 'Property and equipment', 'Trade payables', 'Borrowings', 'Share capital and reserves', 'Revenue', 'Cost of sales', 'Operating expenses', 'Finance costs', 'Income tax'];

  const handleSaveTBRow = (code: string) => {
    const updatedRows = selectedEng.rows.map(r => r.code === code ? { ...r, balance: editBalance } : r);
    prototypeStore.updateTrialBalanceRows(selectedEng.id, updatedRows);
    setEditRowCode(null);
  };

  const handleAddAdjustment = (e: React.FormEvent) => {
    e.preventDefault();

    const newAdj: AdjustmentJournalItem = {
      id: `AJ-2600${state.adjustmentJournals.length + 1}`,
      engagementId: selectedEng.id,
      title: adjTitle,
      status: 'Draft',
      reflectionStatus: 'Not reflected',
      lines: [
        { accountCode: adjDebitAccount, accountName: selectedEng.rows.find(r => r.code === adjDebitAccount)?.name || 'Expense', type: 'debit', amount: adjAmount, debit: adjAmount, credit: 0 },
        { accountCode: adjCreditAccount, accountName: selectedEng.rows.find(r => r.code === adjCreditAccount)?.name || 'Accruals', type: 'credit', amount: adjAmount, debit: 0, credit: adjAmount }
      ],
      reflectedInClientBooks: false,
      preparedBy: state.currentPerson,
      rationale: adjRationale
    };

    prototypeStore.addAdjustmentJournal(newAdj);
    setShowAddAdjModal(false);
  };

  const handleToggleReflected = (adj: AdjustmentJournalItem) => {
    prototypeStore.updateAdjustmentJournal({
      ...adj,
      reflectedInClientBooks: !adj.reflectedInClientBooks,
      reflectionStatus: !adj.reflectedInClientBooks ? 'Reflected in TB' : 'Not reflected'
    });
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Accounting Workbench</h1>
          <p>Deterministic trial balance verification, complete GL tie-out, adjustments, and reconciliation schedules.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <span className="tag blue">Source v{selectedEng.sourceVersion}</span>
          <button className="btn primary sm" onClick={() => onNavigate('financial-statements')}>
            <Icon name="file" /> Generate Financial Statements
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab-btn ${activeTab === 'tb' ? 'active' : ''}`} onClick={() => setActiveTab('tb')}>
          Trial Balance & Intake
        </button>
        <button className={`tab-btn ${activeTab === 'gl' ? 'active' : ''}`} onClick={() => setActiveTab('gl')}>
          General Ledger & Completeness
          {!glVerify.isComplete && <span className="tag amber" style={{ marginLeft: 6 }}>Mismatch</span>}
        </button>
        <button className={`tab-btn ${activeTab === 'mappings' ? 'active' : ''}`} onClick={() => setActiveTab('mappings')}>
          Statement Mappings
        </button>
        <button className={`tab-btn ${activeTab === 'adjustments' ? 'active' : ''}`} onClick={() => setActiveTab('adjustments')}>
          Adjustments ({state.adjustmentJournals.length})
        </button>
        <button className={`tab-btn ${activeTab === 'reconciliations' ? 'active' : ''}`} onClick={() => setActiveTab('reconciliations')}>
          Reconciliations ({selectedEng.reconciliations.length})
        </button>
        <button className={`tab-btn ${activeTab === 'setup' ? 'active' : ''}`} onClick={() => setActiveTab('setup')}>Accounting Setup</button>
      </div>

      {activeTab === 'setup' && <AccountingSetup key={`${client?.id}-${selectedEng.id}`} clientId={selectedEng.client} engagementId={selectedEng.id} profile={client?.accountingProfile} />}

      {/* Tab 1: Trial Balance */}
      {activeTab === 'tb' && (
        <div className="stack" style={{ gap: 16 }}>
          <TBImportWizard engagementId={selectedEng.id} onCommitted={() => undefined} />
          {/* Status banner */}
          <div className="panel panel-pad" style={{ background: tbTotals.isBalanced ? '#f0fdf4' : '#fef2f2' }}>
            <div className="between">
              <div>
                <b>{tbTotals.isBalanced ? 'Trial Balance is Balanced (Net Zero)' : 'Trial Balance Imbalance Detected!'}</b>
                <p className="sub" style={{ fontSize: 13, marginTop: 4 }}>
                  Debits: {formatCurrency(tbTotals.totalDebits)} · Credits: {formatCurrency(tbTotals.totalCredits)} · Net Difference: {formatCurrency(tbTotals.netDifference)}
                </p>
              </div>
              <span className={`badge ${tbTotals.isBalanced ? 'green' : 'amber'}`}>
                {tbTotals.isBalanced ? 'Balanced' : 'Imbalance'}
              </span>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Trial Balance Accounts ({selectedEng.rows.length})</h3>
              <span className="caption">Click balance to edit in-memory</span>
            </div>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Account Code</th>
                    <th>Account Name</th>
                    <th>Classification</th>
                    <th>Debit (QAR)</th>
                    <th>Credit (QAR)</th>
                    <th>Net Balance</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedEng.rows.map(row => (
                    <tr key={row.code}>
                      <td><span className="mono">{row.code}</span></td>
                      <td><b>{row.name}</b></td>
                      <td><span className="tag gray">{row.type}</span></td>
                      <td>{row.balance > 0 ? formatCurrency(row.balance) : '—'}</td>
                      <td>{row.balance < 0 ? formatCurrency(Math.abs(row.balance)) : '—'}</td>
                      <td>
                        {editRowCode === row.code ? (
                          <input
                            type="number"
                            className="input sm"
                            style={{ width: 120 }}
                            value={editBalance}
                            onChange={e => setEditBalance(Number(e.target.value))}
                          />
                        ) : (
                          <b>{formatCurrency(row.balance)}</b>
                        )}
                      </td>
                      <td>
                        {editRowCode === row.code ? (
                          <div className="row" style={{ gap: 4 }}>
                            <button className="btn sm primary" onClick={() => handleSaveTBRow(row.code)}>Save</button>
                            <button className="btn sm ghost" onClick={() => setEditRowCode(null)}>Cancel</button>
                          </div>
                        ) : (
                          <button
                            className="btn sm ghost"
                            onClick={() => {
                              setEditRowCode(row.code);
                              setEditBalance(row.balance);
                            }}
                          >
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}><b>Total Practice Trial Balance</b></td>
                    <td><b>{formatCurrency(tbTotals.totalDebits)}</b></td>
                    <td><b>{formatCurrency(tbTotals.totalCredits)}</b></td>
                    <td><b>{formatCurrency(tbTotals.netDifference)}</b></td>
                    <td>—</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: General Ledger Completeness */}
      {activeTab === 'gl' && (
        <div className="stack" style={{ gap: 16 }}>
          <div className="panel panel-pad">
            <div className="between"><div><h3>Import engagement GL source</h3><p className="sub">CSV or genuine XLSX · {selectedEng.currency} · selected accounting period only · maximum 5,000 lines / 5 MB</p></div><span className="tag blue">Source revisions: {selectedEng.glSourceHistory?.length || 0}</span></div>
            <p className="caption mt8">Required headers: Journal ID, Line ID, Date, Account Code, Account Name, Debit, Credit, Currency, Description. Optional Opening Balance supplies an explicit prior closing balance per account.</p>
            <div className="row mt12" style={{ gap: 10 }}>
              <input aria-label="General ledger source file" type="file" accept=".csv,.xlsx" onChange={async event => {
                const file = event.target.files?.[0]; setGLPreview(null); setGLNotice(''); setGLBytes(null); setGLFileName('');
                if (!file) return;
                if (file.size > GL_FILE_BYTES_LIMIT) { setGLNotice('File exceeds 5 MB; nothing was imported.'); return; }
                const bytes = await file.arrayBuffer(); setGLBytes(bytes); setGLFileName(file.name);
                const profile = state.clients.find(item => item.id === selectedEng.client)?.accountingProfile;
                const book = profile?.periodBooks.find(item => item.id === selectedEng.accountingPeriodBookId);
                if (!book) { setGLNotice('Select a current accounting period book before previewing GL files.'); return; }
                setGLPreview(parseGLWorkbook(file.name, bytes, selectedEng.currency, book.startDate, book.endDate));
              }} />
              <button className="btn sm" disabled={!glBytes || !glPreview || glPreview.errors.length > 0} onClick={async () => {
                if (!glBytes || !glPreview || !globalThis.crypto?.subtle) { setGLNotice('This browser cannot verify the source SHA-256; nothing was imported.'); return; }
                const digest = await crypto.subtle.digest('SHA-256', glBytes);
                const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
                try {
                  const revision = prototypeStore.importGeneralLedgerSource(selectedEng.id, { fileName: glFileName, format: glPreview.format, sha256, openingBalances: glPreview.openingBalances, transactions: glPreview.transactions });
                  setGLNotice(`GL source revision ${revision} saved with ${glPreview.transactions.length} lines. Prior revisions and dependent review history remain retained.`); setGLPreview(null); setGLBytes(null);
                } catch (error) { setGLNotice(error instanceof Error ? error.message : 'GL source was not imported.'); }
              }}>Import new revision</button>
              <button className="btn sm ghost" disabled={!visibleGLTransactions.length} onClick={() => exportService.exportCSV(`GL_${selectedEng.id}_v${glSource?.revision || 0}.csv`, [['Journal ID','Line ID','Date','Account Code','Account Name','Debit','Credit','Currency','Description'], ...visibleGLTransactions.map(line => [line.journalId,line.lineId,safeCSVText(line.date),safeCSVText(line.accountCode),safeCSVText(line.accountName),String(line.debit),String(line.credit),safeCSVText(line.currency),safeCSVText(line.description)])])}>Export filtered CSV</button>
            </div>
            {glNotice && <p role="status" className="mt8">{glNotice}</p>}
            {glPreview && <div className="borderbox mt12 panel-pad"><b>Preview: {glFileName}</b><p>{glPreview.transactions.length} lines · {Object.keys(glPreview.openingBalances).length} explicit opening balances · {glPreview.errors.length} validation errors</p>{glPreview.errors.map(error => <p className="text-danger" key={error}>{error}</p>)}{!glPreview.errors.length && <p className="caption">Journal balance, date/currency consistency, and period checks passed. Unmatched account codes remain visible in completeness results.</p>}</div>}
          </div>
          <div className="panel panel-pad">
            <div className="between">
              <div>
                <h3>General Ledger Completeness Verification</h3>
                <p className="sub">
                  Ensures all underlying GL transactions sum exactly to the Trial Balance line figures.
                </p>
              </div>
              <span className={`badge ${glVerify.isComplete ? 'green' : 'amber'}`}>
                {glVerify.isComplete ? 'GL Fully Reconciled to TB' : `${glVerify.discrepancies.length} Open completeness items`}
              </span>
            </div>
            {glVerify.discrepancies.length > 0 && (
              <div className="borderbox mt12" style={{ background: '#fffbeb', padding: 12 }}>
                <b>Discrepancies found:</b>
                {glVerify.discrepancies.map(d => (
                  <div key={d.accountCode} className="cell-sub" style={{ color: '#b45309' }}>
                    Account {d.accountCode} ({d.accountName}){d.missingOpening ? ' · opening balance missing' : ''}{d.unmatchedAccount ? ' · not in closing TB' : ''}: Calculated close = {d.missingOpening ? 'Unknown' : formatCurrency(d.calculatedClosing, selectedEng.currency)}, TB close = {formatCurrency(d.tbBalance, selectedEng.currency)}, Residual = {d.missingOpening ? 'Unknown' : formatCurrency(d.residual, selectedEng.currency)}
                  </div>
                ))}
              </div>
            )}
            <div className="tablewrap mt12"><table><thead><tr><th>Account</th><th>Opening</th><th>GL movement</th><th>Calculated close</th><th>TB close</th><th>Residual</th><th>Source journals</th><th>Status</th></tr></thead><tbody>
              {glVerify.checks.map(check => <tr key={check.accountCode}><td><span className="mono">{check.accountCode}</span> · {check.accountName}</td><td>{check.missingOpening ? 'Unknown' : formatCurrency(check.openingBalance, selectedEng.currency)}</td><td>{formatCurrency(check.netMovement, selectedEng.currency)}</td><td>{check.missingOpening ? 'Unknown' : formatCurrency(check.calculatedClosing, selectedEng.currency)}</td><td>{formatCurrency(check.tbBalance, selectedEng.currency)}</td><td>{check.missingOpening ? 'Unknown' : formatCurrency(check.residual, selectedEng.currency)}</td><td>{[...new Set(glTransactions.filter(line => line.accountCode === check.accountCode).map(line => line.journalId))].join(', ') || '—'}</td><td>{check.isComplete ? 'Reconciled' : check.missingOpening ? 'Missing opening' : check.unmatchedAccount ? 'Unmatched account' : 'Residual'}</td></tr>)}
            </tbody></table></div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>GL Detailed Transactions ({visibleGLTransactions.length}) · {glSource ? `Source v${glSource.revision}` : 'No imported engagement source'}</h3>
            </div>
            <div className="row panel-pad" style={{ gap: 8 }}><input className="input" aria-label="Filter GL account" placeholder="Filter account code" value={glAccountFilter} onChange={event => setGLAccountFilter(event.target.value)} /><input className="input" aria-label="Filter GL journal" placeholder="Filter journal ID" value={glJournalFilter} onChange={event => setGLJournalFilter(event.target.value)} /></div>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Account</th>
                    <th>Reference</th>
                    <th>Description</th>
                    <th>Debit (QAR)</th>
                    <th>Credit (QAR)</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleGLTransactions.map(tx => (
                    <tr key={tx.id}>
                      <td>{tx.date}</td>
                      <td><span className="mono">{tx.accountCode}</span></td>
                      <td><span className="mono">{tx.reference}</span></td>
                      <td>{tx.description}</td>
                      <td>{tx.debit > 0 ? formatCurrency(tx.debit) : '—'}</td>
                      <td>{tx.credit > 0 ? formatCurrency(tx.credit) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Account Mappings (VP-037) */}
      {activeTab === 'mappings' && (
        <div className="stack" style={{ gap: 16 }}>
          <div className="panel panel-pad">
            <div className="between">
              <div>
                <h3>Account Mapping Revision {activeMapping?.revision ?? '1 (Seeded baseline)'}</h3>
                <p className="sub">
                  Chart version: Trial Balance v{selectedEng.sourceVersion} · Status: <span className={`badge ${activeMapping?.status === 'Approved' ? 'green' : 'amber'}`}>{activeMapping?.status || 'Draft'}</span>
                  {activeMapping?.preparedBy && ` · Prepared by: ${activeMapping.preparedBy}`}
                  {activeMapping?.reviewedBy && ` · Independently approved by: ${state.users.find(u => u.id === activeMapping.reviewedBy)?.name || activeMapping.reviewedBy}`}
                </p>
              </div>
              <div className="row" style={{ gap: 8 }}>
                {activeMapping?.status === 'Draft' && ['reviewer', 'partner'].includes(state.currentRole) && (
                  <button className="btn sm primary" onClick={() => {
                    try {
                      prototypeStore.approveAccountMappings(selectedEng.id, activeMapping.revision);
                    } catch (err: any) {
                      alert(err.message);
                    }
                  }}>
                    Approve Revision v{activeMapping.revision}
                  </button>
                )}
                <button className="btn sm primary" onClick={() => {
                  try {
                    const mappings = selectedEng.rows.flatMap(row => {
                      const prior = activeMappings.find(item => item.accountCode === row.code);
                      const target = mappingTargets[row.code];
                      if (Object.hasOwn(mappingTargets, row.code)) {
                        return target ? [{ accountCode: row.code, targets: [{ statementLine: target, percentage: 100 }] }] : [];
                      }
                      return prior ? [{ accountCode: row.code, targets: prior.targets }] : [];
                    });
                    prototypeStore.saveAccountMappings(selectedEng.id, mappings);
                  } catch (err: any) {
                    alert(err.message);
                  }
                }}>
                  Save New Revision
                </button>
              </div>
            </div>
            <p className="caption mt8">
              Unmapped accounts: {selectedEng.rows.filter(row => !activeMappings.some(item => item.accountCode === row.code)).length} · Unmapped net balance: {formatCurrency(selectedEng.rows.filter(row => !activeMappings.some(item => item.accountCode === row.code)).reduce((sum, row) => sum + row.balance, 0))}. Any mapping edit saves a fresh draft revision and marks financial packages stale until independently approved.
            </p>
          </div>

          {/* Unmapped Accounts Queue */}
          {selectedEng.rows.filter(row => !activeMappings.some(item => item.accountCode === row.code)).length > 0 && (
            <div className="panel panel-pad" style={{ background: '#fffbeb', borderColor: '#fef3c7' }}>
              <div className="between">
                <div>
                  <h4 style={{ color: '#92400e' }}>⚠ Unmapped Accounts Queue ({selectedEng.rows.filter(row => !activeMappings.some(item => item.accountCode === row.code)).length})</h4>
                  <p className="caption" style={{ color: '#b45309' }}>
                    Financial statements and package validation require 100% of trial balance accounts to have approved mappings. Map these accounts below or assign targets.
                  </p>
                </div>
              </div>
              <div className="tablewrap mt12">
                <table>
                  <thead>
                    <tr>
                      <th>Account Code</th>
                      <th>Account Name</th>
                      <th>Type</th>
                      <th>Balance (QAR)</th>
                      <th>Quick Target Assignment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedEng.rows.filter(row => !activeMappings.some(item => item.accountCode === row.code)).map(r => (
                      <tr key={r.code}>
                        <td><span className="mono">{r.code}</span></td>
                        <td><b>{r.name}</b></td>
                        <td><span className="tag gray">{r.type}</span></td>
                        <td>{formatCurrency(r.balance)}</td>
                        <td>
                          <select
                            className="input"
                            aria-label={`Statement line for unmapped account ${r.code}`}
                            value={mappingTargets[r.code] || ''}
                            onChange={e => setMappingTargets({ ...mappingTargets, [r.code]: e.target.value })}
                          >
                            <option value="">Choose Statement Line...</option>
                            {statementLines.map(line => <option key={line} value={line}>{line}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Statement Line Mappings Table */}
          <div className="panel">
            <div className="panel-head between">
              <div>
                <h3>Trial Balance to Statement Line Allocations</h3>
                <span className="caption">Direct 100% mappings and proportional split allocations</span>
              </div>
              <span className="caption">Total Accounts: {selectedEng.rows.length}</span>
            </div>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Account Code</th>
                    <th>Account Name</th>
                    <th>Statement Line / Note</th>
                    <th>Allocation Breakdown</th>
                    <th>Balance</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedEng.rows.map(r => {
                    const targets = activeMappings.find(item => item.accountCode === r.code)?.targets || [];
                    const target = mappingTargets[r.code] ?? targets[0]?.statementLine ?? '';
                    const isSplit = targets.length > 1;
                    return (
                      <tr key={r.code}>
                        <td><span className="mono">{r.code}</span></td>
                        <td><b>{r.name}</b></td>
                        <td>
                          {isSplit ? (
                            <span className="tag blue">Split Allocation ({targets.length} targets)</span>
                          ) : (
                            <select
                              className="input"
                              aria-label={`Statement line for account ${r.code}`}
                              value={target}
                              onChange={e => setMappingTargets({ ...mappingTargets, [r.code]: e.target.value })}
                            >
                              <option value="">Unmapped</option>
                              {statementLines.map(line => <option key={line} value={line}>{line}</option>)}
                            </select>
                          )}
                        </td>
                        <td>
                          {targets.length ? (
                            <div className="stack" style={{ gap: 2 }}>
                              {targets.map((t, idx) => (
                                <span key={idx} className="cell-sub">
                                  {t.statementLine} ({t.percentage}% = {formatCurrency(r.balance * t.percentage / 100)})
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="tag amber">Unmapped</span>
                          )}
                        </td>
                        <td>{formatCurrency(r.balance)}</td>
                        <td>
                          <button
                            className="btn sm ghost"
                            onClick={() => {
                              const existingTargets = targets.length ? structuredClone(targets) : [{ statementLine: 'Operating expenses', percentage: 100 }];
                              setSplitModalAccount({
                                code: r.code,
                                name: r.name,
                                balance: r.balance,
                                targets: existingTargets.length > 1 ? existingTargets : [
                                  { statementLine: existingTargets[0]?.statementLine || 'Operating expenses', percentage: 50 },
                                  { statementLine: 'Other current assets', percentage: 50 }
                                ]
                              });
                            }}
                          >
                            {isSplit ? 'Edit Split' : 'Define Split'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Revision History */}
          {mappingHistory.length > 0 && (
            <div className="panel panel-pad">
              <h4>Mapping Revision History</h4>
              <ul className="mt8" style={{ fontSize: 13, lineHeight: '1.8' }}>
                {mappingHistory.map(rev => (
                  <li key={rev.revision}>
                    <b>Revision {rev.revision}</b> — Status: <span className={`badge ${rev.status === 'Approved' ? 'green' : 'amber'}`}>{rev.status}</span>
                    {rev.preparedBy && ` · Prepared by: ${rev.preparedBy}`}
                    {rev.reviewedBy && ` · Approved by: ${rev.reviewedBy}`}
                    {` · Mapped Accounts: ${rev.mappings.length}/${selectedEng.rows.length}`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Split Allocation Modal */}
          {splitModalAccount && (
            <div className="modal-backdrop">
              <div className="modal-content" style={{ maxWidth: 640 }}>
                <div className="between mb16">
                  <h3>Split Account Allocation: {splitModalAccount.code}</h3>
                  <button className="btn sm ghost" onClick={() => setSplitModalAccount(null)}>✕</button>
                </div>
                <p className="sub mb12">
                  Account: <b>{splitModalAccount.name}</b> · Balance: <b>{formatCurrency(splitModalAccount.balance)}</b>
                </p>
                <div className="stack" style={{ gap: 8 }}>
                  {splitModalAccount.targets.map((target, idx) => (
                    <div key={idx} className="row" style={{ gap: 8, alignItems: 'center' }}>
                      <select
                        className="input"
                        style={{ flex: 2 }}
                        value={target.statementLine}
                        onChange={e => {
                          const updated = [...splitModalAccount.targets];
                          updated[idx].statementLine = e.target.value;
                          setSplitModalAccount({ ...splitModalAccount, targets: updated });
                        }}
                      >
                        {statementLines.map(line => <option key={line} value={line}>{line}</option>)}
                      </select>
                      <input
                        type="number"
                        className="input"
                        style={{ width: 90 }}
                        min="1"
                        max="100"
                        value={target.percentage}
                        onChange={e => {
                          const updated = [...splitModalAccount.targets];
                          updated[idx].percentage = Number(e.target.value);
                          setSplitModalAccount({ ...splitModalAccount, targets: updated });
                        }}
                      />
                      <span>% ({formatCurrency(splitModalAccount.balance * target.percentage / 100)})</span>
                      {splitModalAccount.targets.length > 1 && (
                        <button
                          className="btn sm ghost text-danger"
                          onClick={() => {
                            const updated = splitModalAccount.targets.filter((_, i) => i !== idx);
                            setSplitModalAccount({ ...splitModalAccount, targets: updated });
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    className="btn sm ghost mt4"
                    onClick={() => {
                      setSplitModalAccount({
                        ...splitModalAccount,
                        targets: [...splitModalAccount.targets, { statementLine: 'Other current assets', percentage: 0 }]
                      });
                    }}
                  >
                    + Add Allocation Target Line
                  </button>
                </div>

                <div className="panel panel-pad mt16" style={{ background: '#f8fafc' }}>
                  <div className="between">
                    <b>Total Allocation:</b>
                    <b style={{ color: splitModalAccount.targets.reduce((sum, t) => sum + t.percentage, 0) === 100 ? '#16a34a' : '#dc2626' }}>
                      {splitModalAccount.targets.reduce((sum, t) => sum + t.percentage, 0)}%
                      {splitModalAccount.targets.reduce((sum, t) => sum + t.percentage, 0) === 100 ? ' (Conserved 100%)' : ' (Must total exactly 100%)'}
                    </b>
                  </div>
                </div>

                <div className="row mt16" style={{ justifyContent: 'flex-end', gap: 8 }}>
                  <button className="btn sm ghost" onClick={() => setSplitModalAccount(null)}>Cancel</button>
                  <button
                    className="btn sm primary"
                    disabled={splitModalAccount.targets.reduce((sum, t) => sum + t.percentage, 0) !== 100}
                    onClick={() => {
                      try {
                        const newMappings = selectedEng.rows.map(row => {
                          if (row.code === splitModalAccount.code) {
                            return { accountCode: row.code, targets: structuredClone(splitModalAccount.targets) };
                          }
                          const existing = activeMappings.find(m => m.accountCode === row.code);
                          return existing || { accountCode: row.code, targets: [{ statementLine: 'Operating expenses', percentage: 100 }] };
                        });
                        prototypeStore.saveAccountMappings(selectedEng.id, newMappings);
                        setSplitModalAccount(null);
                      } catch (err: any) {
                        alert(err.message);
                      }
                    }}
                  >
                    Save Split Allocation
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}


      {/* Tab 4: Adjustments */}
      {activeTab === 'adjustments' && (
        <div className="stack" style={{ gap: 16 }}>
          <div className="panel panel-pad">
            <div className="between">
              <div>
                <h3>Proposed Audit Adjustments & Corrections</h3>
                <p className="sub">
                  Proposed correcting journals. State tracks whether the client reflected the adjustment in their source ledger.
                </p>
              </div>
              <button className="btn primary sm" onClick={() => setShowAddAdjModal(true)}>
                <Icon name="plus" /> Propose Adjustment Journal
              </button>
            </div>
          </div>

          <div className="stack" style={{ gap: 12 }}>
            {state.adjustmentJournals.map(adj => (
              <div key={adj.id} className="panel panel-pad">
                <div className="between">
                  <div>
                    <b>{adj.title}</b>
                    <div className="cell-sub">{adj.id} · Proposed by {adj.preparedBy}</div>
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    <span className={`badge ${adj.status === 'Management accepted' ? 'green' : adj.status === 'Rejected' ? 'red' : 'amber'}`}>
                      {adj.status}
                    </span>
                    {adj.status === 'Draft' && ['manager', 'reviewer', 'partner'].includes(state.currentRole) && adj.preparedBy !== state.currentPerson && <button className="btn sm ghost" onClick={() => prototypeStore.reviewAdjustmentJournal(adj.id, true)}>Complete Technical Review</button>}
                    {['Management accepted', 'Reporting included'].includes(adj.status) && <button className="btn sm ghost" onClick={() => handleToggleReflected(adj)}>{adj.reflectedInClientBooks ? 'Mark Not Reflected' : 'Mark Reflected in TB'}</button>}
                  </div>
                </div>
                <div className="caption mt4">Source reflection: {adj.reflectionStatus} · Prepared by {adj.preparedBy}{adj.reviewedBy ? ` · Technical review by ${adj.reviewedBy}` : ''}{adj.managementAcceptedBy ? ` · Accepted by ${adj.managementAcceptedBy}` : ''}</div>
                {adj.managementDecisionNote && <div className="caption mt4">Management decision note: {adj.managementDecisionNote}</div>}

                <div className="tablewrap mt12">
                  <table>
                    <thead>
                      <tr>
                        <th>Account Code</th>
                        <th>Account Name</th>
                        <th>Debit (QAR)</th>
                        <th>Credit (QAR)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adj.lines.map((l, i) => (
                        <tr key={i}>
                          <td><span className="mono">{l.accountCode}</span></td>
                          <td>{l.accountName}</td>
                          <td>{(l.debit || 0) > 0 ? formatCurrency(l.debit || 0) : '—'}</td>
                          <td>{(l.credit || 0) > 0 ? formatCurrency(l.credit || 0) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {adj.rationale && (
                  <div className="cell-sub mt8">
                    <strong>Rationale:</strong> {adj.rationale}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 5: Reconciliations */}
      {activeTab === 'reconciliations' && (
        <div className="stack" style={{ gap: 16 }}>
          <div className="between"><div><h3>Manual reconciliation schedules</h3><p className="sub">Sign convention: statement balance + signed timing items = trial-balance account balance. Proposed corrections never clear the residual.</p></div><button className="btn primary sm" onClick={() => setRecDraft({ name: '', ref: '', accountCode: selectedEng.rows[0]?.code, status: 'Draft', evidence: '', asOfDate: state.asOfDate, sourceVersion: selectedEng.sourceVersion, currency: selectedEng.currency, statementBalance: 0, items: [] })}>New Schedule</button></div>
          {recNotice && <div role="status" className="panel panel-pad">{recNotice}</div>}
          {recDraft && <form className="panel panel-pad stack" onSubmit={event => { event.preventDefault(); try { prototypeStore.saveReconciliationSchedule(selectedEng.id, recDraft); setRecDraft(null); setRecNotice('Schedule saved as a new draft revision.'); } catch (error) { setRecNotice(error instanceof Error ? error.message : String(error)); } }}>
            <h3>{recDraft.id ? `Edit ${recDraft.ref}` : 'Create reconciliation schedule'}</h3>
            <div className="grid2"><label>Schedule name<input aria-label="Reconciliation name" className="input" required value={recDraft.name} onChange={event => setRecDraft({ ...recDraft, name: event.target.value })} /></label><label>Trial balance account<select aria-label="Reconciliation account" className="input" value={recDraft.accountCode || ''} onChange={event => setRecDraft({ ...recDraft, accountCode: event.target.value })}>{selectedEng.rows.map(row => <option key={row.code} value={row.code}>{row.code} · {row.name}</option>)}</select></label></div>
            <div className="grid2"><label>As-of date<input aria-label="Reconciliation as-of date" className="input" type="date" required value={recDraft.asOfDate || ''} onChange={event => setRecDraft({ ...recDraft, asOfDate: event.target.value })} /></label><label>Supporting statement balance ({selectedEng.currency})<input aria-label="Reconciliation statement balance" className="input" type="number" step="0.01" required value={recDraft.statementBalance ?? recDraft.supportingBalance ?? ''} onChange={event => setRecDraft({ ...recDraft, statementBalance: Number(event.target.value) })} /></label></div>
            <label>Schedule evidence reference<input aria-label="Reconciliation evidence" className="input" required value={recDraft.evidence} onChange={event => setRecDraft({ ...recDraft, evidence: event.target.value })} /></label>
            <div className="between"><h4>Reconciling items</h4><button type="button" className="btn sm" onClick={() => setRecDraft({ ...recDraft, items: [...(recDraft.items || []), { id: `RI-${crypto.randomUUID()}`, date: recDraft.asOfDate || state.asOfDate, description: '', amount: 0, type: 'Timing item' }] })}>Add item</button></div>
            {(recDraft.items || []).map((item, index) => <fieldset className="borderbox grid2" key={item.id}><legend>Item {index + 1}</legend><label>Description<input aria-label={`Reconciliation item description ${index + 1}`} className="input" value={item.description} onChange={event => setRecDraft({ ...recDraft, items: recDraft.items!.map((value, i) => i === index ? { ...value, description: event.target.value } : value) })} required /></label><label>Date<input aria-label={`Reconciliation item date ${index + 1}`} className="input" type="date" value={item.date} onChange={event => setRecDraft({ ...recDraft, items: recDraft.items!.map((value, i) => i === index ? { ...value, date: event.target.value } : value) })} required /></label><label>Signed amount ({selectedEng.currency})<input aria-label={`Reconciliation item amount ${index + 1}`} className="input" type="number" step="0.01" value={item.amount} onChange={event => setRecDraft({ ...recDraft, items: recDraft.items!.map((value, i) => i === index ? { ...value, amount: Number(event.target.value) } : value) })} required /></label><label>Item type<select aria-label={`Reconciliation item type ${index + 1}`} className="input" value={item.type} onChange={event => setRecDraft({ ...recDraft, items: recDraft.items!.map((value, i) => i === index ? { ...value, type: event.target.value as 'Timing item' | 'Proposed correction' } : value) })}><option>Timing item</option><option>Proposed correction</option></select></label><label>Evidence document ID<input aria-label={`Reconciliation item evidence ${index + 1}`} className="input" value={item.evidenceDoc || ''} onChange={event => setRecDraft({ ...recDraft, items: recDraft.items!.map((value, i) => i === index ? { ...value, evidenceDoc: event.target.value } : value) })} /></label>{item.type === 'Proposed correction' && <label>Linked adjustment journal ID<input aria-label={`Reconciliation item journal ${index + 1}`} className="input" value={item.journalId || ''} onChange={event => setRecDraft({ ...recDraft, items: recDraft.items!.map((value, i) => i === index ? { ...value, journalId: event.target.value } : value) })} /></label>}<button type="button" className="btn sm ghost" onClick={() => setRecDraft({ ...recDraft, items: recDraft.items!.filter((_, i) => i !== index) })}>Remove item</button></fieldset>)}
            <div className="row"><button className="btn primary sm" type="submit">Save Reconciliation Draft</button><button className="btn ghost sm" type="button" onClick={() => setRecDraft(null)}>Cancel</button></div>
          </form>}
          {(selectedEng.reconciliations || []).map((rec: any) => {
            const variance = calculateReconciliationVariance(rec);
            return (
              <div key={rec.id || rec.ref} className="panel panel-pad">
                <div className="between">
                  <div>
                    <h3>{rec.title || rec.name}</h3>
                    <div className="cell-sub">Reconciliation Ref: {rec.id || rec.ref} · Account: {rec.accountCode || 'N/A'} · {rec.currency || selectedEng.currency} · As of {rec.asOfDate || selectedEng.period} · Source v{rec.sourceVersion ?? selectedEng.sourceVersion}</div>
                  </div>
                  <div className="stack"><span className={`badge ${rec.status === 'Approved' || rec.status === 'Cleared' ? 'green' : rec.status === 'Stale' ? 'red' : 'amber'}`}>{rec.status}</span><span className={`badge ${variance.isReconciled ? 'green' : 'amber'}`}>{variance.isReconciled ? 'Reconciled (Residual 0.00)' : `Unexplained Diff: ${formatCurrency(variance.unexplainedDifference)}`}</span></div>
                </div>

                <div className="info-grid mt16">
                  <div><label>General Ledger Balance</label><b>{formatCurrency(rec.glBalance || rec.sourceBalance || 0)}</b></div>
                  <div><label>External Statement Balance</label><b>{formatCurrency(rec.statementBalance || rec.supportingBalance || 0)}</b></div>
                  <div><label>Total Timing Adjustments</label><span>{formatCurrency(variance.timingSum)}</span></div>
                  <div><label>Unexplained Variance</label><b>{formatCurrency(variance.unexplainedDifference)}</b></div>
                </div>

                <h4 className="mt16">Timing / Reconciling Items</h4>
                <div className="tablewrap mt8">
                  <table>
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th>Type</th>
                        <th>Amount (QAR)</th>
                        <th>Evidence / Journal</th>
                        <th>Clearance Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(rec.items || []).map((item: any) => (
                        <tr key={item.id}>
                          <td>{item.description}</td>
                          <td>{item.type}</td>
                          <td><b>{formatCurrency(item.amount)}</b></td>
                          <td>{item.evidenceDoc || 'Missing evidence'}{item.type === 'Proposed correction' && ` · ${item.journalId || 'No journal linked'}`}</td>
                          <td>{item.clearedDate || 'Outstanding'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="row mt12">{!['Approved', 'Stale'].includes(rec.status) && <button className="btn sm" onClick={() => setRecDraft({ ...rec, name: rec.name, asOfDate: rec.asOfDate || state.asOfDate, statementBalance: rec.statementBalance ?? rec.supportingBalance ?? 0, glBalance: rec.glBalance ?? rec.sourceBalance, sourceVersion: rec.sourceVersion ?? selectedEng.sourceVersion, items: structuredClone(rec.items || []) })}>Edit schedule</button>}{['Draft', 'Returned'].includes(rec.status) && <button className="btn sm primary" onClick={() => { try { prototypeStore.reviewReconciliationSchedule(selectedEng.id, rec.id, 'Approved'); setRecNotice('Independent approval recorded.'); } catch (error) { setRecNotice(error instanceof Error ? error.message : String(error)); } }}>Approve schedule</button>}{['Draft', 'Returned'].includes(rec.status) && <button className="btn sm ghost" onClick={() => { const reason = window.prompt('Reason for returning this reconciliation:'); if (reason?.trim()) try { prototypeStore.reviewReconciliationSchedule(selectedEng.id, rec.id, 'Returned', reason); } catch (error) { setRecNotice(error instanceof Error ? error.message : String(error)); } }}>Return for rework</button>}</div>
                {rec.reviewedByUserId && <p className="caption">Reviewed by {state.users.find(user => user.id === rec.reviewedByUserId)?.name || rec.reviewedByUserId} · {rec.reviewedAt}{rec.reviewNote ? ` · ${rec.reviewNote}` : ''}</p>}
                {rec.history?.length > 0 && <details><summary>Prior reconciliation revisions ({rec.history.length})</summary>{rec.history.map((version: any) => <div className="caption" key={`${version.revision}-${version.savedAt}`}>v{version.revision} · {version.status} · TB v{version.sourceVersion} · saved by {state.users.find(user => user.id === version.savedByUserId)?.name || version.savedByUserId}{version.reviewedByUserId ? ` · reviewed by ${state.users.find(user => user.id === version.reviewedByUserId)?.name || version.reviewedByUserId}` : ''}{version.reviewNote ? ` · review note: ${version.reviewNote}` : ''}</div>)}</details>}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Adjustment Modal */}
      {showAddAdjModal && (
        <div className="modal-backdrop" onClick={() => setShowAddAdjModal(false)}>
          <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Propose Correcting Adjustment Journal</h2>
              <button className="icon-btn" onClick={() => setShowAddAdjModal(false)}>✕</button>
            </div>
            <form onSubmit={handleAddAdjustment}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div>
                  <label className="caption">Journal Title</label>
                  <input
                    type="text"
                    className="input"
                    value={adjTitle}
                    onChange={e => setAdjTitle(e.target.value)}
                    required
                  />
                </div>
                <div className="grid2">
                  <div>
                    <label className="caption">Debit Account</label>
                    <select
                      className="input"
                      value={adjDebitAccount}
                      onChange={e => setAdjDebitAccount(e.target.value)}
                    >
                      {selectedEng.rows.map(r => (
                        <option key={r.code} value={r.code}>{r.code} - {r.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="caption">Credit Account</label>
                    <select
                      className="input"
                      value={adjCreditAccount}
                      onChange={e => setAdjCreditAccount(e.target.value)}
                    >
                      {selectedEng.rows.map(r => (
                        <option key={r.code} value={r.code}>{r.code} - {r.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="caption">Adjustment Amount (QAR)</label>
                  <input
                    type="number"
                    className="input"
                    value={adjAmount}
                    onChange={e => setAdjAmount(Number(e.target.value))}
                    required
                  />
                </div>
                <div>
                  <label className="caption">Audit Rationale</label>
                  <textarea
                    className="input"
                    rows={3}
                    value={adjRationale}
                    onChange={e => setAdjRationale(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={() => setShowAddAdjModal(false)}>Cancel</button>
                <button type="submit" className="btn primary sm">Propose Journal</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
