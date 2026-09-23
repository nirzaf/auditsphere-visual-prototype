// Module 26: Multi-Entity Consolidation & Eliminations (VP-043 through VP-046)
import React, { useState } from 'react';
import { RouteKey, TrialBalanceRow } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';
import { calculateConsolidatedBalanceSheet, formatCurrency } from '../../services/calculations';

interface ConsolidationViewProps {
  onNavigate: (route: RouteKey) => void;
}

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
  const missingPackage = !parentComp?.packageRows?.length || !subComp?.packageRows?.length || !parentEng || !subEng || !parentComp.packageRevisionPinned || !subComp.packageRevisionPinned;
  const missingRate = !missingPackage && (!Number.isFinite(fxRate(parentComp!)) || fxRate(parentComp!) <= 0 || !Number.isFinite(fxRate(subComp!)) || fxRate(subComp!) <= 0);

  if (missingPackage || missingRate) {
    const missingComponent = group.components.find(c => !state.engagements.some(e => e.id === c.componentId) || !c.packageRows?.length)?.componentId;
    const missingClient = !parentEng ? parentComp?.clientId : subComp?.clientId;
    return (
      <div className="panel panel-pad text-center" style={{ padding: '60px 20px' }}>
        <Icon name="layers" size="xl" className="text-muted mb16" />
        <h3>{missingPackage ? 'Pinned Component Package Required' : 'Currency Rate Required'}</h3>
        <p className="sub max-w-md mx-auto mt8">
          {missingPackage
            ? `Component ${missingComponent || '(unspecified)'} has no exact engagement and reporting-package snapshot.`
            : `No valid rate is configured to translate each component into ${groupCurrency}.`}
          {' '}Live engagement balances are never substituted for missing pinned data.
        </p>
        <button className="btn primary sm mt16" onClick={() => onNavigate('engagements')}>
          Go to Engagements
        </button>
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
  const availableAccounts = new Set([...parentComp!.packageRows!, ...subComp!.packageRows!].flatMap(row => [row.code, row.name.toLowerCase()]));
  const unmatchedEliminationLines = approvedEliminations.flatMap(e => e.lines.filter(line => !availableAccounts.has(line.account) && !availableAccounts.has(line.account.trim().toLowerCase())).map(line => `${e.id}: ${line.account}`));

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Group Consolidation Workbench</h1>
          <p>Calculation from the stored component snapshots and approved manual eliminations shown below.</p>
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
                  Debit: {e.debitAccount || e.counterpartyA} · Credit: {e.creditAccount || e.counterpartyB}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FX Tab */}
      {activeTab === 'fx' && (
        <div className="panel panel-pad">
          <h3>Currency Translation Rates</h3>
          <p className="sub" style={{ marginBottom: 12 }}>Stored group rates translate the pinned component snapshots into {groupCurrency}; rates are not fetched externally.</p>
          <div className="stack" style={{ gap: 8 }}>
            {group.components.map(component => <div key={component.componentId} className="borderbox" style={{ padding: 12 }}>
              <div className="between"><span>{component.componentId} · {component.currency} to {groupCurrency}</span><b>{fxRate(component)} ×</b></div>
              <div className="cell-sub">Pinned package revision {component.packageRevisionPinned} · translation source: local group rate table</div>
            </div>)}
          </div>
        </div>
      )}
    </div>
  );
};
