// Module 31: Substantive Sampling & Population Testing (VP-051)
import React, { useState } from 'react';
import { RouteKey } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';
import { formatCurrency } from '../../services/calculations';
import { visibleEngagementIds } from '../../services/guards';
import { parsePopulation, POPULATION_FILE_LIMIT } from '../../services/populationImport';

interface SamplingViewProps { onNavigate: (route: RouteKey) => void }

export const SamplingView: React.FC<SamplingViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const visible = visibleEngagementIds(state);
  const populations = state.samplePopulations.filter(item => item.engagementId &&
    (visible === 'ALL' || visible.includes(item.engagementId)));
  const [populationId, setPopulationId] = useState(populations[0]?.id || '');
  const population = populations.find(item => item.id === populationId) || populations[0];
  const [revision, refresh] = useState(0);
  const [notice, setNotice] = useState('');
  void revision;
  const run = (action: () => void) => {
    try { action(); refresh(value => value + 1); setNotice('Saved.'); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not save sampling changes.'); }
  };
  const importSource = async (file?: File) => {
    if (!file || !population) return;
    try {
      if (file.size > POPULATION_FILE_LIMIT) throw new Error('File exceeds the 10 MB population import limit.');
      const bytes = await file.arrayBuffer();
      const parsed = parsePopulation(bytes, file.name);
      if (parsed.errors.length) throw new Error(parsed.errors.join(' '));
      const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
      prototypeStore.replaceSamplePopulationSource(population.id, file.name, sha, parsed.rows);
      refresh(value => value + 1);
      setNotice(`Imported ${parsed.rows.length} population rows as source revision ${(population.sourceRevision || 1) + 1}; the predecessor and its testing remain in history.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Population import failed.'); }
  };
  const selected = population?.items.filter(item => item.selected).length || 0;
  const selectedValue = population?.items.filter(item => item.selected).reduce((sum, item) => sum + item.amount, 0) || 0;
  const tested = population?.items.filter(item => item.selected && item.tested).length || 0;
  const exceptions = population?.items.filter(item => item.selected && item.result === 'Exception noted').length || 0;
  const difference = population?.items.filter(item => item.selected).reduce((sum, item) => sum + (item.difference || 0), 0) || 0;

  return <div className="stack" style={{ gap: 20 }}>
    <div className="pagehead"><div><h1>Substantive Sampling &amp; Population Testing</h1><p>Choose population items, retain their test results, and track exceptions.</p></div>
      <div className="row" style={{ gap: 10 }}><button className="btn sm ghost" onClick={() => onNavigate('findings')}><Icon name="target" /> View Audit Findings ({state.findings.length})</button><button className="btn primary sm" onClick={() => onNavigate('audit')}><Icon name="checkboard" /> Workpapers</button></div>
    </div>
    {notice && <div role="status" className="panel panel-pad">{notice}</div>}
    {population ? <>
      {populations.length > 1 && <label className="caption">Population<select className="input" value={population.id} onChange={event => setPopulationId(event.target.value)}>{populations.map(item => <option key={item.id} value={item.id}>{item.name || item.description}</option>)}</select></label>}
      <div className="panel panel-pad">
        <span className="eyebrow">POPULATION · {population.id}</span><h2>{population.name || population.description}</h2>
        <p className="sub">Engagement: {population.engagementId} · Account: {population.accountCode || '—'} · {population.methodology || 'Manual selection from the recorded population items.'}</p>
        <div className="borderbox mt12" style={{ padding: 12 }}>
          <b>Source revision {population.sourceRevision || 1}: {population.sourceFileName || 'Legacy population'}</b>
          <p className="caption mt4">{population.sourceComplete ? `SHA-256 ${population.sourceSha256}` : 'Seeded excerpt only; import the complete source population before relying on totals.'}</p>
          <label className="btn sm mt8">Import or replace CSV/XLSX source<input aria-label="Import population source CSV or XLSX" type="file" accept=".csv,.xlsx" hidden onChange={event => { void importSource(event.target.files?.[0]); event.currentTarget.value = ''; }} /></label>
          {(population.sourceHistory || []).length > 0 && <details className="mt8"><summary>Previous source revisions ({population.sourceHistory!.length})</summary><ul>{population.sourceHistory!.map(item => <li key={item.revision}>v{item.revision} · {item.fileName} · {item.totalPopulationCount} rows · {item.sha256 || 'seeded legacy source'} · {item.importedAt}</li>)}</ul></details>}
        </div>
        {(() => {
          const eng = state.engagements.find(e => e.id === population.engagementId);
          const tbRow = eng?.rows.find(r => r.code === population.accountCode);
          const frameValue = tbRow ? tbRow.balance : population.totalPopulationValue;
          const frameDiff = Math.abs(frameValue - population.totalPopulationValue);
          const isReconciled = frameDiff < 0.01;
          return (
            <div className="panel panel-pad mt12" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div className="between">
                <div>
                  <span className="caption">General Ledger Sampling Frame Tie-Out</span>
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    Account: <b>{population.accountCode || '1100'} {tbRow ? `(${tbRow.name})` : ''}</b> · GL Balance: <b>{formatCurrency(frameValue)}</b> · Population Total: <b>{formatCurrency(population.totalPopulationValue)}</b> · Variance: <b>{formatCurrency(frameDiff)}</b>
                  </div>
                </div>
                <span className={`badge ${isReconciled ? 'green' : 'amber'}`}>
                  {isReconciled ? 'Reconciled to GL Frame' : `Variance ${formatCurrency(frameDiff)}`}
                </span>
              </div>
            </div>
          );
        })()}
        <div className="metric-grid mt16">
          <div className="metric"><span className="metric-label">Population</span><div className="metric-val">{population.totalPopulationCount}</div><span className="metric-sub">{formatCurrency(population.totalPopulationValue)}</span></div>
          <div className="metric blue"><span className="metric-label">Selected</span><div className="metric-val">{selected}</div><span className="metric-sub">{formatCurrency(selectedValue)} · {population.totalPopulationValue ? Math.round(selectedValue / population.totalPopulationValue * 100) : 0}% of value</span></div>
          <div className="metric"><span className="metric-label">Tested</span><div className="metric-val">{tested}/{selected}</div><span className="metric-sub">Selected items with recorded tests</span></div>
          <div className="metric amber"><span className="metric-label">Exceptions</span><div className="metric-val">{exceptions}</div><span className="metric-sub">Net recorded difference: {formatCurrency(difference)}</span></div>
        </div>
      </div>
      <div className="panel"><div className="panel-head between"><h3>Population items and test results</h3><span className="caption">Selection and fieldwork are saved in this engagement</span></div>
        <div className="tablewrap"><table><thead><tr><th>Select</th><th>Reference / counterparty</th><th>Recorded</th><th>Audited amount</th><th>Difference</th><th>Result</th><th>Testing notes</th><th>Action</th></tr></thead><tbody>
          {population.items.map(item => <tr key={item.id} data-sample-item={item.id}>
            <td><input aria-label={`Select ${item.itemRef}`} type="checkbox" checked={Boolean(item.selected)} disabled={!population.sourceComplete} onChange={event => run(() => prototypeStore.setSampleItemSelected(population.id, item.id, event.target.checked))} /></td>
            <td><b>{item.itemRef}</b><div className="cell-sub">{item.date} · {item.counterparty}</div></td>
            <td>{formatCurrency(item.recordedAmount ?? item.amount)}</td>
            <td><input className="input" data-audited-amount type="number" min="0" step="0.01" defaultValue={item.auditedAmount ?? item.recordedAmount ?? item.amount} disabled={!population.sourceComplete || !item.selected} /></td>
            <td>{item.difference ? formatCurrency(item.difference) : '—'}</td>
            <td><span className={`badge ${item.result === 'Satisfactory' ? 'green' : item.result === 'Exception noted' ? 'amber' : 'gray'}`}>{item.selected ? item.result : 'Not selected'}</span></td>
            <td><textarea className="input" data-test-notes rows={2} defaultValue={item.notes || ''} disabled={!population.sourceComplete || !item.selected} placeholder="Evidence inspected and conclusion" /></td>
            <td><button className="btn sm" disabled={!population.sourceComplete || !item.selected} onClick={event => { const row = (event.currentTarget as HTMLButtonElement).closest('tr'); const amount = Number(row?.querySelector<HTMLInputElement>('[data-audited-amount]')?.value); const notes = row?.querySelector<HTMLTextAreaElement>('[data-test-notes]')?.value || ''; run(() => prototypeStore.recordSampleItemTest(population.id, item.id, amount, notes)); }}>Record test</button>{item.findingId && <button className="btn sm ghost mt4" onClick={() => onNavigate('findings')}>Finding {item.findingId}</button>}</td>
          </tr>)}
        </tbody></table></div>
      </div>
    </> : <div className="panel panel-pad"><h3>No scoped population</h3><p className="sub">Create or assign a population to the selected engagement before sampling.</p></div>}
  </div>;
};
