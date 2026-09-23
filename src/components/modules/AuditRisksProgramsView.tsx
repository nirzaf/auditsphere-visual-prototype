// Modules 29 & 30: Audit Risk Register & Fieldwork Audit Programs (VP-049, VP-050)
import React, { useState } from 'react';
import { RouteKey, AuditProgramItem, AuditProcedureItem } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';

interface AuditRisksProgramsViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const AuditRisksProgramsView: React.FC<AuditRisksProgramsViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const [activeTab, setActiveTab] = useState<'risks' | 'programs'>('programs');
  const [selectedProgramId, setSelectedProgramId] = useState<string>('PRG-CASH');

  const selectedEng = state.engagements.find(e => e.id === state.selectedEngagement) || state.engagements[0];

  // Synthetic risks
  const risks = [
    { id: 'RSK-01', title: 'Improper revenue recognition near period-end (Cutoff)', level: 'Assertion', accounts: '4000 - Sales', assertions: 'Cutoff, Accuracy', inherent: 'High', control: 'Moderate', plannedResponse: 'Sample delivery notes 10 days before and after 31 Dec.' },
    { id: 'RSK-02', title: 'Unrecorded liabilities and year-end accruals', level: 'Assertion', accounts: '2000 - Trade payables', assertions: 'Completeness', inherent: 'Moderate', control: 'Low', plannedResponse: 'Search for unrecorded liabilities post year-end payments.' },
    { id: 'RSK-03', title: 'Overstatement of trade receivables collectibility', level: 'Assertion', accounts: '1100 - Receivables', assertions: 'Valuation, Existence', inherent: 'High', control: 'Moderate', plannedResponse: 'Direct circularization and subsequent cash collections testing.' }
  ];

  // Audit programs
  const [programs, setPrograms] = useState<AuditProgramItem[]>([
    {
      id: 'PRG-CASH',
      title: 'Audit Program: Cash and Bank Balances',
      area: 'Cash and Liquid Assets',
      leadWorkpaperRef: 'WP-A1',
      procedures: [
        { id: 'PROC-CASH-01', stepNumber: 1, text: 'Obtain direct independent bank confirmation letters for all active accounts.', assertion: 'Existence, Rights', method: 'External confirmation', status: 'Completed', sampleSize: 3 },
        { id: 'PROC-CASH-02', stepNumber: 2, text: 'Inspect year-end bank reconciliation schedules and verify timing clearing items in Jan 2027 statements.', assertion: 'Accuracy, Completeness', method: 'Inspection', status: 'Completed' },
        { id: 'PROC-CASH-03', stepNumber: 3, text: 'Perform cash count for petty cash funds and reconcile to general ledger.', assertion: 'Existence', method: 'Observation', status: 'Completed' }
      ]
    },
    {
      id: 'PRG-AR',
      title: 'Audit Program: Trade Receivables & Cutoff',
      area: 'Trade Receivables',
      leadWorkpaperRef: 'WP-B1',
      procedures: [
        { id: 'PROC-AR-01', stepNumber: 1, text: 'Select sample of customer balances from aged trial balance and send positive circularization requests.', assertion: 'Existence, Rights', method: 'External confirmation', status: 'Completed', sampleSize: 12 },
        { id: 'PROC-AR-02', stepNumber: 2, text: 'Inspect subsequent cash collections received post year-end for unconfirmed balances.', assertion: 'Valuation, Existence', method: 'Reperformance', status: 'In progress', sampleSize: 5 },
        { id: 'PROC-AR-03', stepNumber: 3, text: 'Evaluate allowance for expected credit losses (ECL) under IFRS 9 for historical defaults.', assertion: 'Valuation', method: 'Analytical review', status: 'Not started' }
      ]
    },
    {
      id: 'PRG-FA',
      title: 'Audit Program: Property, Plant & Equipment',
      area: 'Fixed Assets',
      leadWorkpaperRef: 'WP-C1',
      procedures: [
        { id: 'PROC-FA-01', stepNumber: 1, text: 'Vouch additions over materiality threshold to original purchase invoices and title deeds.', assertion: 'Existence, Valuation', method: 'Inspection', status: 'Completed', sampleSize: 8 },
        { id: 'PROC-FA-02', stepNumber: 2, text: 'Recalculate depreciation charges across all asset categories against approved firm rates.', assertion: 'Accuracy, Valuation', method: 'Reperformance', status: 'Exception noted', workpaperRef: 'WP-C1' }
      ]
    }
  ]);

  const activeProgram = programs.find(p => p.id === selectedProgramId) || programs[0];

  const handleUpdateProcedureStatus = (procId: string, status: AuditProcedureItem['status']) => {
    setPrograms(prev => prev.map(prg => {
      if (prg.id === activeProgram.id) {
        return {
          ...prg,
          procedures: prg.procedures.map(p => p.id === procId ? { ...p, status } : p)
        };
      }
      return prg;
    }));
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Audit Risks & Substantive Programs</h1>
          <p>ISA 315 identified risks, financial statement assertions, and substantive testing execution.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn sm ghost" onClick={() => onNavigate('sampling')}>
            <Icon name="checkboard" /> Sampling Desk
          </button>
          <button className="btn primary sm" onClick={() => onNavigate('audit')}>
            <Icon name="checkboard" /> Workpaper Workspace
          </button>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab-btn ${activeTab === 'programs' ? 'active' : ''}`} onClick={() => setActiveTab('programs')}>
          Substantive Audit Programs ({programs.length})
        </button>
        <button className={`tab-btn ${activeTab === 'risks' ? 'active' : ''}`} onClick={() => setActiveTab('risks')}>
          Identified Risk Register ({risks.length})
        </button>
      </div>

      {/* Programs Tab */}
      {activeTab === 'programs' && (
        <div className="grid-main">
          {/* Left: Program List */}
          <div className="stack" style={{ gap: 16 }}>
            <div className="panel">
              <div className="panel-head">
                <h3>Audit Program Areas</h3>
              </div>
              <div className="stack panel-pad" style={{ gap: 8 }}>
                {programs.map(prg => (
                  <button
                    key={prg.id}
                    className={`navitem ${prg.id === activeProgram.id ? 'active' : ''}`}
                    onClick={() => setSelectedProgramId(prg.id)}
                    style={{ textAlign: 'left', width: '100%' }}
                  >
                    <Icon name="folder" />
                    <span>{prg.title}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Procedures Table */}
          <div className="stack" style={{ gap: 16 }}>
            <div className="panel panel-pad">
              <div className="between">
                <div>
                  <span className="eyebrow">{activeProgram.area.toUpperCase()} · LEAD WP: {activeProgram.leadWorkpaperRef}</span>
                  <h2>{activeProgram.title}</h2>
                  <p className="sub">{activeProgram.procedures.length} substantive procedures defined</p>
                </div>
                <button
                  className="btn sm"
                  onClick={() => onNavigate('audit')}
                >
                  Open Lead Workpaper ({activeProgram.leadWorkpaperRef})
                </button>
              </div>

              <div className="tablewrap mt16">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Substantive Procedure Description</th>
                      <th>Assertion</th>
                      <th>Method</th>
                      <th>Fieldwork Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeProgram.procedures.map(p => (
                      <tr key={p.id}>
                        <td><b>{p.stepNumber}</b></td>
                        <td>
                          <b>{p.text}</b>
                          {p.sampleSize && <div className="cell-sub">Sample size tested: {p.sampleSize} items</div>}
                        </td>
                        <td><span className="tag gray">{p.assertion}</span></td>
                        <td>{p.method}</td>
                        <td>
                          <select
                            className="input sm"
                            value={p.status}
                            onChange={e => handleUpdateProcedureStatus(p.id, e.target.value as any)}
                          >
                            <option value="Not started">Not started</option>
                            <option value="In progress">In progress</option>
                            <option value="Completed">Completed</option>
                            <option value="Exception noted">Exception noted</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Risks Tab */}
      {activeTab === 'risks' && (
        <div className="panel">
          <div className="panel-head">
            <h3>ISA 315 Assessed Risks of Material Misstatement</h3>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Risk ID & Description</th>
                  <th>Level</th>
                  <th>Accounts Affected</th>
                  <th>Relevant Assertions</th>
                  <th>Inherent Risk</th>
                  <th>Audit Strategy & Response</th>
                </tr>
              </thead>
              <tbody>
                {risks.map(r => (
                  <tr key={r.id}>
                    <td><b>{r.title}</b><div className="cell-sub">{r.id}</div></td>
                    <td><span className="tag gray">{r.level}</span></td>
                    <td><b>{r.accounts}</b></td>
                    <td>{r.assertions}</td>
                    <td>
                      <span className={`badge ${r.inherent === 'High' ? 'amber' : 'green'}`}>
                        {r.inherent}
                      </span>
                    </td>
                    <td>{r.plannedResponse}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
