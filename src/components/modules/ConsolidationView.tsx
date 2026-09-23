// Module 26: Multi-Entity Consolidation & Eliminations (VP-043 through VP-046)
import React, { useState } from 'react';
import { RouteKey, ConsolidationGroupRecord } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';
import { calculateConsolidatedBalanceSheet, formatCurrency } from '../../services/calculations';

interface ConsolidationViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const ConsolidationView: React.FC<ConsolidationViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const [activeTab, setActiveTab] = useState<'perimeter' | 'grid' | 'eliminations' | 'fx'>('grid');

  const group = state.consolidationGroups[0] || {
    id: 'GRP-01',
    name: 'Example Group Holdings',
    parentClientId: 'CL-001',
    presentationCurrency: 'QAR',
    components: [
      { clientId: 'CL-001', role: 'Parent', ownershipPct: 100, functionalCurrency: 'QAR', pinnedPackageRev: 3 },
      { clientId: 'CL-002', role: 'Associate', ownershipPct: 80, functionalCurrency: 'QAR', pinnedPackageRev: 1 }
    ],
    eliminations: [
      { id: 'ELIM-01', debitAccount: 'Trade payables (Intercompany)', creditAccount: 'Trade receivables (Intercompany)', amount: 50000, description: 'Eliminate intercompany trading balance between CL-001 and CL-002' }
    ]
  };

  const parentEng = state.engagements[0];
  const subEng = state.engagements[1] || {
    ...parentEng,
    id: 'ENG-26002',
    client: 'CL-002',
    rows: [
      { code: '1000', name: 'Cash and bank balances', type: 'asset', balance: 350000 },
      { code: '1100', name: 'Trade receivables', type: 'asset', balance: 250000 },
      { code: '2000', name: 'Trade payables', type: 'liability', balance: -150000 },
      { code: '3000', name: 'Share capital', type: 'equity', balance: -450000 }
    ]
  };

  const consolidated = calculateConsolidatedBalanceSheet(
    parentEng.rows,
    subEng.rows,
    group.eliminations
  );

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Group Consolidation Workbench</h1>
          <p>Group entity perimeter, version-pinned component packages, intercompany eliminations, and consolidated reporting.</p>
        </div>
      </div>

      <div className="panel panel-pad">
        <div className="between">
          <div>
            <span className="eyebrow">CONSOLIDATION GROUP · {group.id}</span>
            <h2>{group.name}</h2>
            <p className="sub">Presentation Currency: {group.presentationCurrency} · Components: {group.components.length}</p>
          </div>
          <span className="badge teal">Consolidated</span>
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
                    <th style={{ textAlign: 'right' }}>Parent (CL-001)</th>
                    <th style={{ textAlign: 'right' }}>Subsidiary (CL-002)</th>
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
                  const clientRecord = state.clients.find(x => x.id === (c.clientId || c.componentId));
                  return (
                    <tr key={c.componentId || c.clientId}>
                      <td><b>{clientRecord?.name || c.legalEntityName || c.componentId}</b></td>
                      <td><span className="tag gray">{c.role || 'Component'}</span></td>
                      <td>{c.ownershipPercent ?? c.ownershipPct ?? 100}%</td>
                      <td>{c.functionalCurrency || c.currency}</td>
                      <td><b>Package Rev {c.pinnedPackageRev ?? c.packageRevisionPinned ?? 1}</b></td>
                      <td><span className="badge green">Pinned</span></td>
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
          <p className="sub" style={{ marginBottom: 12 }}>All components currently operate in native presentation currency (QAR).</p>
          <div className="borderbox" style={{ padding: 12 }}>
            <div className="between">
              <span>QAR / QAR (Base Parity)</span>
              <b>1.0000</b>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
