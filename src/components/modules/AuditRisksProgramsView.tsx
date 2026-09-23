// Modules 29 & 30: Audit Risk Register & Fieldwork Audit Programs (VP-049, VP-050)
import React, { useState } from 'react';
import { RouteKey, AuditProcedureItem } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';

interface AuditRisksProgramsViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const AuditRisksProgramsView: React.FC<AuditRisksProgramsViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const [activeTab, setActiveTab] = useState<'risks' | 'programs'>('programs');
  const [selectedProgramId, setSelectedProgramId] = useState<string>('PRG-01');
  const [notice, setNotice] = useState<string | null>(null);
  const [editingProcedureId, setEditingProcedureId] = useState<string | null>(null);
  const [workPerformed, setWorkPerformed] = useState('');
  const [conclusion, setConclusion] = useState('');
  const [evidenceLimitation, setEvidenceLimitation] = useState('');

  const selectedEng = state.engagements.find(e => e.id === state.selectedEngagement) || state.engagements[0];

  if (!selectedEng) {
    return (
      <div className="panel panel-pad text-center" style={{ padding: '60px 20px' }}>
        <Icon name="shield" size="xl" className="text-muted mb16" />
        <h3>No Active Engagement Selected</h3>
        <p className="sub max-w-md mx-auto mt8">
          Select or create an engagement to define audit risks and tailor substantive audit programs.
        </p>
        <button className="btn primary sm mt16" onClick={() => onNavigate('engagements')}>
          Go to Engagements
        </button>
      </div>
    );
  }

  // Synthetic risks
  const risks = [
    { id: 'RSK-01', title: 'Improper revenue recognition near period-end (Cutoff)', level: 'Assertion', accounts: '4000 - Sales', assertions: 'Cutoff, Accuracy', inherent: 'High', control: 'Moderate', plannedResponse: 'Sample delivery notes 10 days before and after 31 Dec.' },
    { id: 'RSK-02', title: 'Unrecorded liabilities and year-end accruals', level: 'Assertion', accounts: '2000 - Trade payables', assertions: 'Completeness', inherent: 'Moderate', control: 'Low', plannedResponse: 'Search for unrecorded liabilities post year-end payments.' },
    { id: 'RSK-03', title: 'Overstatement of trade receivables collectibility', level: 'Assertion', accounts: '1100 - Receivables', assertions: 'Valuation, Existence', inherent: 'High', control: 'Moderate', plannedResponse: 'Direct circularization and subsequent cash collections testing.' }
  ];

  const programs = state.auditPrograms.filter(program => program.engagementId === selectedEng.id || (!program.engagementId && selectedEng.id === state.engagements[0]?.id));
  const activeProgram = programs.find(program => program.id === selectedProgramId) || programs[0];

  const handleUpdateProcedureStatus = (procId: string, status: AuditProcedureItem['status']) => {
    try {
      prototypeStore.updateAuditProcedureStatus(selectedEng.id, procId, status);
      setNotice(`Procedure ${procId} saved as ${status}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Procedure status could not be saved.');
    }
  };

  const handleSaveExecution = (procId: string) => {
    try {
      prototypeStore.updateAuditProcedureExecution(selectedEng.id, procId, workPerformed, conclusion, evidenceLimitation);
      setEditingProcedureId(null);
      setNotice(`Fieldwork for ${procId} saved.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Fieldwork could not be saved.');
    }
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

      {notice && <div role="status" className="panel panel-pad">{notice}</div>}

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
                    className={`navitem ${prg.id === activeProgram?.id ? 'active' : ''}`}
                    onClick={() => setSelectedProgramId(prg.id)}
                    style={{ textAlign: 'left', width: '100%' }}
                  >
                    <Icon name="folder" />
                    <span>{prg.title || prg.area}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Procedures Table */}
          <div className="stack" style={{ gap: 16 }}>
            {!activeProgram ? <div className="panel panel-pad">No audit programs are assigned to this engagement.</div> : <div className="panel panel-pad">
              <div className="between">
                <div>
                  <span className="eyebrow">{activeProgram.area.toUpperCase()} · LEAD WP: {activeProgram.leadWorkpaperRef}</span>
                  <h2>{activeProgram.title || activeProgram.area}</h2>
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
                      <th>Ref</th>
                      <th>Substantive Procedure Description</th>
                      <th>Work performed</th>
                      <th>Conclusion</th>
                      <th>Assertion</th>
                      <th>Method</th>
                      <th>Fieldwork Status</th>
                      <th>Sign-off</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeProgram.procedures.map(p => (
                      <tr key={p.id}>
                        <td><b>{p.ref || p.stepNumber}</b><div className="cell-sub mono">{p.id}</div></td>
                        <td>
                          <b>{p.title || p.text}</b>
                          {p.instructions && <div className="cell-sub">{p.instructions}</div>}
                          {p.sampleSize && <div className="cell-sub">Sample size tested: {p.sampleSize} items</div>}
                        </td>
                        <td>
                          {editingProcedureId === p.id ? <div className="stack">
                            <textarea className="input" aria-label={`Work performed for ${p.id}`} value={workPerformed} onChange={e => setWorkPerformed(e.target.value)} placeholder="Describe procedures performed and results" />
                            <input className="input" aria-label={`Evidence limitation for ${p.id}`} value={evidenceLimitation} onChange={e => setEvidenceLimitation(e.target.value)} placeholder="Evidence limitation, if no linked adequate evidence" />
                            <button className="btn sm primary" onClick={() => handleSaveExecution(p.id)}>Save fieldwork</button>
                          </div> : <>
                            {p.workPerformed || 'Not recorded'}{p.hasExceptions && <div className="badge amber mt4">Exception recorded</div>}
                            <button className="btn sm ghost mt4" onClick={() => { setEditingProcedureId(p.id); setWorkPerformed(p.workPerformed || ''); setConclusion(p.conclusion || ''); setEvidenceLimitation(p.evidenceLimitation || ''); }}>Record fieldwork</button>
                          </>}
                        </td>
                        <td>{editingProcedureId === p.id ? <input className="input" aria-label={`Conclusion for ${p.id}`} value={conclusion} onChange={e => setConclusion(e.target.value)} placeholder="Conclusion" /> : p.conclusion || 'Pending'}</td>
                        <td><span className="tag gray">{p.assertion || '—'}</span></td>
                        <td>{p.method || '—'}</td>
                        <td>
                          <select
                            className="input sm"
                            value={p.status}
                            onChange={e => handleUpdateProcedureStatus(p.id, e.target.value as any)}
                          >
                            <option value="Not started">Not started</option>
                            <option value="In progress">In progress</option>
                            <option value="Submitted">Submitted</option>
                            <option value="Exceptions noted">Exceptions noted</option>
                            <option value="Cleared">Cleared</option>
                          </select>
                        </td>
                        <td>{p.reviewedByUserId ? `Reviewed by ${state.users.find(user => user.id === p.reviewedByUserId)?.name || p.reviewedByUserId}` : p.preparedByUserId ? `Prepared by ${state.users.find(user => user.id === p.preparedByUserId)?.name || p.preparedByUserId}` : 'No sign-off'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>}
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
