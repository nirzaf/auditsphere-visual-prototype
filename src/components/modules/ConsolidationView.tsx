// Module 26: Multi-Entity Consolidation & Eliminations (VP-043 through VP-046)
import React, { useState } from 'react';
import { RouteKey, TrialBalanceRow } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { visibleEngagementIds } from '../../services/guards';
import { Icon } from '../common/Icons';
import { calculateConsolidatedBalanceSheet, formatCurrency } from '../../services/calculations';

interface ConsolidationViewProps {
  onNavigate: (route: RouteKey) => void;
}

const FxRateEditor: React.FC<{ group: NonNullable<ReturnType<typeof prototypeStore.getSnapshot>['consolidationGroups'][number]> }> = ({ group }) => {
  const currencies = [...new Set(group.components.map(component => component.currency).filter(currency => currency !== (group.presentationCurrency || group.currency)))];
  const [currency, setCurrency] = useState(currencies[0] || '');
  const [rate, setRate] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('2026-09-23');
  const [notice, setNotice] = useState('');
  return <div className="panel panel-pad">
    <h3>Versioned closing rates</h3>
    <p className="sub">The supported synthetic profile translates every balance-sheet line at the entered closing rate. Average and historical translation methods are unsupported and produce no result.</p>
    {currencies.length === 0 ? <p className="caption">All components use the presentation currency; no foreign rate is required.</p> : <form className="grid4 mt12" onSubmit={event => {
      event.preventDefault();
      try {
        prototypeStore.updateConsolidationFxRate(group.id, currency, Number(rate), effectiveDate);
        setNotice(`${currency} closing rate v${group.fxRateHistory?.[currency]?.length || 1} saved.`);
        setRate('');
      } catch (error: any) { setNotice(error.message); }
    }}>
      <label className="caption">Component currency<select className="input mt4" aria-label="FX component currency" value={currency} onChange={event => setCurrency(event.target.value)}>{currencies.map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="caption">Closing rate to {group.presentationCurrency || group.currency}<input className="input mt4" aria-label="FX closing rate" type="number" min="0" step="any" required value={rate} onChange={event => setRate(event.target.value)} /></label>
      <label className="caption">Effective date<input className="input mt4" aria-label="FX effective date" type="date" required value={effectiveDate} onChange={event => setEffectiveDate(event.target.value)} /></label>
      <div className="row" style={{ alignItems: 'end' }}><button className="btn primary sm" type="submit">Save closing rate</button></div>
      {notice && <p role="status" className="caption" style={{ gridColumn: '1 / -1' }}>{notice}</p>}
    </form>}
    {currencies.map(value => <div className="borderbox panel-pad mt8" key={value}>
      <b>{value} → {group.presentationCurrency || group.currency}: {group.fxRates[value] ?? 'Missing rate'}</b>
      {(group.fxRateHistory?.[value] || []).map(item => <div className="caption" key={item.revision}>v{item.revision} · Closing · {item.effectiveDate} · {item.rate} · {item.changedBy}</div>)}
    </div>)}
  </div>;
};

type ConsolidationGroup = NonNullable<ReturnType<typeof prototypeStore.getSnapshot>['consolidationGroups'][number]>;

const PerimeterEditor: React.FC<{ group: ConsolidationGroup }> = ({ group }) => {
  const snapshot = prototypeStore.getSnapshot();
  const periodYear = Number(group.period.match(/\d{4}/)?.[0]);
  const subComp = group.components.find(c => c.role === 'Subsidiary');
  const visible = visibleEngagementIds(snapshot);
  const candidates = snapshot.engagements.filter(e =>
    e.year === periodYear &&
    (visible === 'ALL' || visible.includes(e.id)) &&
    (e.lifecycleStatus || 'Active') === 'Active'
  );
  const [dates, setDates] = useState<Record<string, string>>(() => Object.fromEntries(group.components.map(c => [c.componentId, c.effectiveDate || ''])));
  const [subsidiaryId, setSubsidiaryId] = useState(subComp?.componentId || '');
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState('');
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const next = structuredClone(group);
      for (const component of next.components) {
        const value = (dates[component.componentId] ?? '').trim();
        if (value) component.effectiveDate = value;
        else delete component.effectiveDate;
      }
      if (subsidiaryId !== subComp?.componentId) {
        const engagement = snapshot.engagements.find(e => e.id === subsidiaryId);
        if (!engagement) throw new Error(`Engagement "${subsidiaryId}" is not available as a subsidiary component.`);
        const clientName = snapshot.clients.find(c => c.id === engagement.client)?.name || engagement.client;
        const target = next.components.find(c => c.role === 'Subsidiary');
        if (!target) throw new Error('This group has no Subsidiary slot to replace.');
        target.componentId = engagement.id;
        target.legalEntityName = `${clientName} (Subsidiary)`;
        target.currency = engagement.currency;
        target.functionalCurrency = engagement.currency;
        delete target.effectiveDate;
        target.packageRevisionPinned = engagement.packageRevision;
        target.packageRows = structuredClone(engagement.rows);
        target.status = 'Ready';
      }
      prototypeStore.updateConsolidationGroup(next, { reason });
      const saved = prototypeStore.getSnapshot().consolidationGroups.find(g => g.id === group.id);
      setNotice(`Perimeter revision ${saved?.perimeterRevision || 'updated'} saved; prior perimeter retained in history.`);
    } catch (error: any) { setNotice(error.message); }
  };
  const revert = (revision: number) => {
    try {
      prototypeStore.revertConsolidationPerimeter(group.id, revision, reason);
      const saved = prototypeStore.getSnapshot().consolidationGroups.find(g => g.id === group.id);
      setNotice(`Perimeter reverted; now at revision ${saved?.perimeterRevision}.`);
    } catch (error: any) { setNotice(error.message); }
  };
  return <div className="panel panel-pad mt16">
    <h3>Edit group perimeter</h3>
    <p className="sub">Current perimeter revision {group.perimeterRevision || 1}. The Parent slot is fixed for the supported profile; the Subsidiary slot accepts a same-period permitted engagement and re-pins its exact current package. Duplicate, wrong-period and out-of-scope selections are rejected with the recorded perimeter left unchanged. Replacing the component set returns approved eliminations to draft for re-review.</p>
    <form className="mt12" onSubmit={save}>
      <div className="grid2">
        {group.components.map(component => <label className="caption" key={component.componentId}>Effective date — {component.role} ({component.componentId})<input className="input mt4" aria-label={`Effective date for ${component.role} component`} placeholder="YYYY-MM-DD" value={dates[component.componentId] ?? ''} onChange={event => setDates({ ...dates, [component.componentId]: event.target.value })} /></label>)}
      </div>
      <div className="grid2 mt8">
        <label className="caption">Subsidiary component engagement<select className="input mt4" aria-label="Subsidiary component engagement" value={subsidiaryId} onChange={event => setSubsidiaryId(event.target.value)}>{candidates.map(e => <option key={e.id} value={e.id}>{e.id} · {snapshot.clients.find(c => c.id === e.client)?.name || e.client} · FY {e.year}</option>)}</select></label>
        <label className="caption">Reason for perimeter change or revert<input className="input mt4" aria-label="Reason for perimeter change" placeholder="e.g. Correct subsidiary to the in-scope 2026 engagement" value={reason} onChange={event => setReason(event.target.value)} /></label>
      </div>
      <div className="row mt12"><button className="btn primary sm" type="submit">Save perimeter revision</button></div>
      {notice && <p role="status" className="caption mt8">{notice}</p>}
    </form>
    {(group.perimeterHistory || []).length > 0 && <div className="mt16">
      <h4>Perimeter history</h4>
      {[...(group.perimeterHistory || [])].reverse().map(entry => <div className="borderbox panel-pad mt8" key={entry.revision}>
        <div className="between"><b>Revision {entry.revision}</b><span className="caption">{entry.changedBy} · {entry.changedAt}</span></div>
        <div className="caption mt4">{entry.reason} · Components: {entry.components.map(c => `${c.role} ${c.componentId}${c.effectiveDate ? ` from ${c.effectiveDate}` : ''}`).join('; ')}</div>
        <div className="row mt8"><button className="btn sm" type="button" aria-label={`Revert to perimeter revision ${entry.revision}`} disabled={entry.revision === group.perimeterRevision} onClick={() => revert(entry.revision)}>Revert to revision {entry.revision}</button></div>
      </div>)}
    </div>}
  </div>;
};

export const ConsolidationView: React.FC<ConsolidationViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const [activeTab, setActiveTab] = useState<'perimeter' | 'grid' | 'eliminations' | 'fx'>('grid');

  const group = state.consolidationGroups[0];
  if (!group) return <div className="panel panel-pad"><h3>No consolidation group is configured.</h3><p className="sub">Create a group and select its component packages before reviewing an output.</p></div>;

  const parentComp = group.components.find(c => c.role === 'Parent');
  const subComp = group.components.find(c => c !== parentComp && c.role);
  const parentEng = parentComp && state.engagements.find(e => e.id === parentComp.componentId);
  const subEng = subComp && state.engagements.find(e => e.id === subComp.componentId);
  const groupCurrency = group.presentationCurrency || group.currency;
  const fxRate = (component: NonNullable<typeof parentComp>) => component.currency === groupCurrency ? 1 : group.fxRates[component.currency];
  const missingRoles = (['Parent', 'Subsidiary'] as const).filter(role => !group.components.some(component => component.role === role));
  const supportedProfile = group.components.length === 2 && missingRoles.length === 0 && group.components.every(component => component.ownershipPercent === 100);
  if (!supportedProfile) return <div role="alert" className="panel panel-pad text-center" style={{ padding: '60px 20px' }}>
    <h3>Unsupported Consolidation Profile</h3>
    <p className="sub max-w-md mx-auto mt8">
      {missingRoles.length
        ? `The group perimeter is incomplete (missing ${missingRoles.join(' and ')}); add the required component before calculating consolidated balances.`
        : 'This prototype calculates only one Parent and one 100% owned Subsidiary. Other ownership methods produce no result.'}
    </p>
  </div>;
  const missingPackage = !parentComp?.packageRows?.length || !subComp?.packageRows?.length || !parentEng || !subEng || !parentComp.packageRevisionPinned || !subComp.packageRevisionPinned;
  const missingRate = !missingPackage && (!Number.isFinite(fxRate(parentComp!)) || fxRate(parentComp!) <= 0 || !Number.isFinite(fxRate(subComp!)) || fxRate(subComp!) <= 0);

  if (missingPackage || missingRate) {
    const missingComponent = group.components.find(c => !state.engagements.some(e => e.id === c.componentId) || !c.packageRows?.length)?.componentId;
    return (
      <div className="panel panel-pad text-center" style={{ padding: '60px 20px' }}>
        <Icon name="layers" size="xl" className="text-muted mb16" />
        <h3>{missingPackage ? 'Pinned Component Package Required' : 'Currency Rate Required'}</h3>
        <p className="sub max-w-md mx-auto mt8">
          {missingPackage
            ? missingRoles.length
              ? `The group perimeter is incomplete (missing ${missingRoles.join(' and ')}); add the required component before calculating consolidated balances.`
              : `Component ${missingComponent || '(unspecified)'} has no exact engagement and reporting-package snapshot.`
            : `No valid rate is configured to translate each component into ${groupCurrency}.`}
          {' '}Live engagement balances are never substituted for missing pinned data.
        </p>
        {missingRate && <div className="max-w-md mx-auto mt16"><FxRateEditor group={group} /></div>}
        {missingPackage && <button className="btn primary sm mt16" onClick={() => onNavigate('engagements')}>Go to Engagements</button>}
      </div>
    );
  }

  const translate = (rows: TrialBalanceRow[], rate: number) => rows.map(row => ({ ...row, balance: Math.round(row.balance * rate * 100) / 100 }));
  const approvedEliminations = group.eliminations.filter(e => e.status === 'Approved');
  const consolidated = calculateConsolidatedBalanceSheet(
    translate(parentComp!.packageRows!, fxRate(parentComp!)),
    translate(subComp!.packageRows!, fxRate(subComp!)),
    approvedEliminations
  );
  const parentClient = state.clients.find(c => c.id === parentEng!.client);
  const subClient = state.clients.find(c => c.id === subEng!.client);
  const lastPerimeterChange = (group.perimeterHistory || [])[(group.perimeterHistory || []).length - 1];
  const availableAccounts = new Set([...parentComp!.packageRows!, ...subComp!.packageRows!].flatMap(row => [row.code, row.name.toLowerCase()]));
  const unmatchedEliminationLines = approvedEliminations.flatMap(e => e.lines.filter(line => !availableAccounts.has(line.account) && !availableAccounts.has(line.account.trim().toLowerCase())).map(line => `${e.id}: ${line.account}`));

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Group Consolidation Workbench</h1>
          <p>Wholly owned Parent + Subsidiary profile · calculation from pinned component snapshots and approved manual eliminations.</p>
        </div>
      </div>

      <div className="panel panel-pad">
        <div className="between">
          <div>
            <span className="eyebrow">CONSOLIDATION GROUP · {group.id}</span>
            <h2>{group.name}</h2>
            <p className="sub">Presentation Currency: {groupCurrency} · Components: {group.components.length} · Period: {group.period}</p>
          </div>
          <span className="badge amber">Local calculation · not independently reviewed</span>
        </div>

        <div className="tabs mt16">
          <button className={`tab-btn ${activeTab === 'grid' ? 'active' : ''}`} onClick={() => setActiveTab('grid')}>
            Consolidated Balance Sheet Grid
          </button>
          <button className={`tab-btn ${activeTab === 'perimeter' ? 'active' : ''}`} onClick={() => setActiveTab('perimeter')}>
            Group Perimeter & Pinned Packages ({group.components.length})
          </button>
          <button className={`tab-btn ${activeTab === 'eliminations' ? 'active' : ''}`} onClick={() => setActiveTab('eliminations')}>
            Intercompany Eliminations ({group.eliminations.length})
          </button>
          <button className={`tab-btn ${activeTab === 'fx' ? 'active' : ''}`} onClick={() => setActiveTab('fx')}>
            Currency Translation (FX)
          </button>
        </div>
      </div>

      {/* Grid Tab */}
      {activeTab === 'grid' && (
        <div className="stack" style={{ gap: 16 }}>
          {unmatchedEliminationLines.length > 0 && <div role="alert" className="panel panel-pad" style={{ background: '#fffbeb', color: '#92400e' }}>
            <b>Some approved elimination accounts do not match the pinned packages.</b>
            <div className="sub mt4">These lines were excluded from the calculation: {unmatchedEliminationLines.join('; ')}</div>
          </div>}
          <div className="panel panel-pad" style={{ background: consolidated.isBalanced ? '#f0fdf4' : '#fef2f2' }}>
            <div className="between">
              <div>
                <b>{consolidated.isBalanced ? 'Consolidated Balance Sheet Equation Satisfied (Net Zero)' : 'Consolidated Balance Discrepancy'}</b>
                <p className="sub" style={{ fontSize: 13, marginTop: 4 }}>
                  Consolidated Assets: {formatCurrency(consolidated.totalAssets)} · Consolidated Liabilities + Equity: {formatCurrency(consolidated.totalLiabilities + consolidated.totalEquity)}
                </p>
              </div>
              <span className={`badge ${consolidated.isBalanced ? 'green' : 'amber'}`}>
                {consolidated.isBalanced ? 'Balanced' : 'Imbalance'}
              </span>
            </div>
          </div>

          <div className="panel">
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Classification / Line Item</th>
                    <th style={{ textAlign: 'right' }}>{parentClient?.name || parentEng!.id} (v{parentComp!.packageRevisionPinned})</th>
                    <th style={{ textAlign: 'right' }}>{subClient?.name || subEng!.id} (v{subComp!.packageRevisionPinned})</th>
                    <th style={{ textAlign: 'right' }}>Eliminations</th>
                    <th style={{ textAlign: 'right' }}>Consolidated Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ background: '#f8fafc' }}><td colSpan={5}><b>ASSETS</b></td></tr>
                  {consolidated.lines.filter((l: any) => l.category === 'asset').map((l: any) => (
                    <tr key={l.code}>
                      <td>{l.name} ({l.code})</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(l.parentBalance)}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(l.subsidiaryBalance)}</td>
                      <td style={{ textAlign: 'right' }}>
                        {l.eliminationDebit !== 0 || l.eliminationCredit !== 0 ? (
                          <span style={{ color: 'red' }}>({formatCurrency(l.eliminationCredit - l.eliminationDebit)})</span>
                        ) : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}><b>{formatCurrency(l.consolidatedBalance)}</b></td>
                    </tr>
                  ))}
                  <tr>
                    <td><b>Total Assets</b></td>
                    <td style={{ textAlign: 'right' }}><b>{formatCurrency(consolidated.parentAssets)}</b></td>
                    <td style={{ textAlign: 'right' }}><b>{formatCurrency(consolidated.subsidiaryAssets)}</b></td>
                    <td style={{ textAlign: 'right' }}>({formatCurrency(consolidated.totalEliminations)})</td>
                    <td style={{ textAlign: 'right' }}><b>{formatCurrency(consolidated.totalAssets)}</b></td>
                  </tr>

                  <tr style={{ background: '#f8fafc' }}><td colSpan={5}><b>LIABILITIES</b></td></tr>
                  {consolidated.lines.filter((l: any) => l.category === 'liability').map((l: any) => (
                    <tr key={l.code}>
                      <td>{l.name} ({l.code})</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(Math.abs(l.parentBalance))}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(Math.abs(l.subsidiaryBalance))}</td>
                      <td style={{ textAlign: 'right' }}>
                        {l.eliminationDebit !== 0 ? <span style={{ color: 'red' }}>({formatCurrency(l.eliminationDebit)})</span> : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}><b>{formatCurrency(Math.abs(l.consolidatedBalance))}</b></td>
                    </tr>
                  ))}
                  <tr>
                    <td><b>Total Liabilities</b></td>
                    <td style={{ textAlign: 'right' }}><b>{formatCurrency(consolidated.parentLiabilities)}</b></td>
                    <td style={{ textAlign: 'right' }}><b>{formatCurrency(consolidated.subsidiaryLiabilities)}</b></td>
                    <td style={{ textAlign: 'right' }}>({formatCurrency(consolidated.totalEliminations)})</td>
                    <td style={{ textAlign: 'right' }}><b>{formatCurrency(consolidated.totalLiabilities)}</b></td>
                  </tr>

                  <tr style={{ background: '#f8fafc' }}><td colSpan={5}><b>EQUITY</b></td></tr>
                  {consolidated.lines.filter((l: any) => l.category === 'equity').map((l: any) => (
                    <tr key={l.code}>
                      <td>{l.name} ({l.code})</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(Math.abs(l.parentBalance))}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(Math.abs(l.subsidiaryBalance))}</td>
                      <td style={{ textAlign: 'right' }}>—</td>
                      <td style={{ textAlign: 'right' }}><b>{formatCurrency(Math.abs(l.consolidatedBalance))}</b></td>
                    </tr>
                  ))}
                  <tr>
                    <td><b>Total Equity</b></td>
                    <td style={{ textAlign: 'right' }}><b>{formatCurrency(consolidated.parentEquity)}</b></td>
                    <td style={{ textAlign: 'right' }}><b>{formatCurrency(consolidated.subsidiaryEquity)}</b></td>
                    <td style={{ textAlign: 'right' }}>—</td>
                    <td style={{ textAlign: 'right' }}><b>{formatCurrency(consolidated.totalEquity)}</b></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Perimeter Tab */}
      {activeTab === 'perimeter' && (
        <div className="stack" style={{ gap: 0 }}>
        <div className="panel">
          <div className="panel-head">
            <h3>Group Entity Perimeter</h3>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Client Entity</th>
                  <th>Role</th>
                  <th>Ownership %</th>
                  <th>Effective Date</th>
                  <th>Functional Currency</th>
                  <th>Pinned Reporting Package</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {group.components.map((c: any) => {
                  const componentEngagement = state.engagements.find(e => e.id === c.componentId);
                  const clientRecord = state.clients.find(x => x.id === componentEngagement?.client);
                  return (
                    <tr key={c.componentId || c.clientId}>
                      <td><b>{clientRecord?.name || c.legalEntityName || c.componentId}</b></td>
                      <td><span className="tag gray">{c.role || 'Component'}</span></td>
                      <td>{c.ownershipPercent ?? c.ownershipPct ?? 100}%</td>
                      <td>{c.effectiveDate || '—'}</td>
                      <td>{c.functionalCurrency || c.currency}</td>
                      <td><b>Package Rev {c.pinnedPackageRev ?? c.packageRevisionPinned ?? 1}</b></td>
                      <td><span className={`badge ${c.packageRows ? 'green' : 'red'}`}>{c.packageRows ? 'Pinned snapshot' : 'Missing snapshot'}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <PerimeterEditor key={`${group.id}-rev-${group.perimeterRevision || 1}`} group={group} />
        {lastPerimeterChange && <p role="status" className="caption">Perimeter revision {group.perimeterRevision} saved — {lastPerimeterChange.reason} by {lastPerimeterChange.changedBy}.</p>}
        </div>
      )}

      {/* Eliminations Tab */}
      {activeTab === 'eliminations' && (
        <div className="panel panel-pad">
          <h3>Intercompany Elimination Entries</h3>
          <div className="stack mt12" style={{ gap: 10 }}>
            {group.eliminations.map((e: any) => (
              <div key={e.id} className="borderbox" style={{ padding: 12 }}>
                <div className="between">
                  <b>{e.description || e.title}</b>
                  <b style={{ color: 'var(--teal-dark)' }}>{formatCurrency(e.amount)}</b>
                </div>
                <div className="cell-sub mt8">
                  Debit: {e.debitAccount || e.counterpartyA} · Credit: {e.creditAccount || e.counterpartyB} · Status: {e.status}
                </div>
                {e.status === 'Draft' && (e.reviewHistory || []).length > 0 && <div className="caption mt4" style={{ color: '#92400e' }}>
                  Re-review required: {e.reviewHistory[e.reviewHistory.length - 1].note} Prior approval and journal lines are preserved in history.
                </div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FX Tab */}
      {activeTab === 'fx' && (
        <div className="stack" style={{ gap: 12 }}>
          <FxRateEditor group={group} />
          {group.components.map(component => <div key={component.componentId} className="borderbox panel-pad">
            <div className="between"><span>{component.componentId} · {component.currency} to {groupCurrency}</span><b>{fxRate(component)} ×</b></div>
            <div className="cell-sub">Pinned package revision {component.packageRevisionPinned} · translation source: local group rate table · profile: closing rate for all balance-sheet lines</div>
          </div>)}
        </div>
      )}
    </div>
  );
};
