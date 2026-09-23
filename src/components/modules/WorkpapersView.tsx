// Module 32: Comprehensive 6-Tab Workpaper Workspace (VP-052)
// 6 Tabs: Overview, Guidelines, Template/Data, Working Paper Upload/Preview, Supporting Evidence, Clearance & History

import React, { useState } from 'react';
import { RouteKey, WorkpaperItem } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';

interface WorkpapersViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const WorkpapersView: React.FC<WorkpapersViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const selectedEng = state.engagements.find(e => e.id === state.selectedEngagement) || state.engagements[0];
  const workpapers = selectedEng.workpapers;

  const [selectedWpId, setSelectedWpId] = useState<string>(workpapers[0]?.id || 'WP-A1');
  const [activeTab, setActiveTab] = useState<
    'overview' | 'guidelines' | 'template' | 'preview' | 'evidence' | 'clearance'
  >('overview');

  const [clearanceNotes, setClearanceNotes] = useState('Satisfactory completion of all testing procedures and evidence tie-out.');

  const wp = workpapers.find(w => w.id === selectedWpId) || workpapers[0];

  const handleClearWorkpaper = () => {
    try {
      prototypeStore.clearWorkpaper(selectedEng.id, wp.id, clearanceNotes);
      alert(`Workpaper ${wp.id} successfully cleared by ${prototypeStore.getSnapshot().currentPerson}.`);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleToggleApplicability = () => {
    const updated = !wp.applicable;
    prototypeStore.updateWorkpaper(selectedEng.id, wp.id, {
      applicable: updated,
      status: updated ? 'In progress' : 'Not applicable'
    });
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Audit Workpaper Workspace</h1>
          <p>Structured 6-tab audit documentation, substantive schedules, and independent reviewer clearance.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn sm ghost" onClick={() => onNavigate('reviews')}>
            <Icon name="message" /> Review Desk ({selectedEng.reviews.filter(r => r.status !== 'Cleared').length})
          </button>
          <button className="btn primary sm" onClick={() => onNavigate('delivery')}>
            <Icon name="shield" /> Release Gates
          </button>
        </div>
      </div>

      <div className="grid-main">
        {/* Left: Workpaper Index */}
        <div className="stack" style={{ gap: 16 }}>
          <div className="panel">
            <div className="panel-head">
              <h3>Engagement Workpapers ({workpapers.length})</h3>
            </div>
            <div className="stack panel-pad" style={{ gap: 6 }}>
              {workpapers.map(w => (
                <button
                  key={w.id}
                  className={`navitem ${w.id === wp.id ? 'active' : ''}`}
                  onClick={() => setSelectedWpId(w.id)}
                  style={{ textAlign: 'left', width: '100%', fontSize: 13 }}
                >
                  <div className="between" style={{ width: '100%' }}>
                    <div>
                      <b>{w.id}</b>
                      <div className="cell-sub">{w.title}</div>
                    </div>
                    <span className={`badge ${w.status === 'Cleared' ? 'green' : w.status === 'Changes required' ? 'red' : 'amber'}`}>
                      {w.status}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Selected Workpaper 6-Tab Workspace */}
        {wp && (
          <div className="stack" style={{ gap: 16 }}>
            <div className="panel panel-pad">
              <div className="between">
                <div>
                  <span className="eyebrow">AUDIT WORKPAPER · {wp.id}</span>
                  <h2>{wp.title}</h2>
                  <p className="sub">{wp.section} · Preparer: {wp.preparer} · Reviewer: {wp.reviewer}</p>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button
                    className={`btn sm ${wp.applicable ? 'ghost' : 'primary'}`}
                    onClick={handleToggleApplicability}
                  >
                    {wp.applicable ? 'Mark Not Applicable' : 'Mark Applicable'}
                  </button>
                  <span className={`badge ${wp.status === 'Cleared' ? 'green' : wp.status === 'Changes required' ? 'red' : 'amber'}`}>
                    {wp.status}
                  </span>
                </div>
              </div>

              {/* 6 Tabs */}
              <div className="tabs mt16">
                <button className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
                  1. Overview
                </button>
                <button className={`tab-btn ${activeTab === 'guidelines' ? 'active' : ''}`} onClick={() => setActiveTab('guidelines')}>
                  2. Guidelines
                </button>
                <button className={`tab-btn ${activeTab === 'template' ? 'active' : ''}`} onClick={() => setActiveTab('template')}>
                  3. Template / Data
                </button>
                <button className={`tab-btn ${activeTab === 'preview' ? 'active' : ''}`} onClick={() => setActiveTab('preview')}>
                  4. Working Paper Upload / Preview
                </button>
                <button className={`tab-btn ${activeTab === 'evidence' ? 'active' : ''}`} onClick={() => setActiveTab('evidence')}>
                  5. Supporting Evidence ({(wp.evidenceRefs || []).length})
                </button>
                <button className={`tab-btn ${activeTab === 'clearance' ? 'active' : ''}`} onClick={() => setActiveTab('clearance')}>
                  6. Clearance & History
                </button>
              </div>
            </div>

            {/* Tab 1: Overview */}
            {activeTab === 'overview' && (
              <div className="panel panel-pad">
                <h3>Workpaper Overview</h3>
                <div className="info-grid mt12">
                  <div><label>Workpaper Reference</label><b>{wp.id}</b></div>
                  <div><label>Section Area</label><span>{wp.section}</span></div>
                  <div><label>Fieldwork Preparer</label><span>{wp.preparer}</span></div>
                  <div><label>Independent Reviewer</label><span>{wp.reviewer}</span></div>
                  <div><label>Working Paper Version</label><span className="mono">v{wp.version}</span></div>
                  <div><label>Applicability</label><span className="badge green">{wp.applicable ? 'In Scope' : 'Not Applicable'}</span></div>
                </div>
                <div className="divider" />
                <h4>Audit Objective</h4>
                <p className="sub mt8">{wp.objective}</p>
                <h4 className="mt16">Testing Scope</h4>
                <p className="sub mt8">{wp.scope}</p>
              </div>
            )}

            {/* Tab 2: Guidelines */}
            {activeTab === 'guidelines' && (
              <div className="panel panel-pad">
                <h3>Standard Audit Methodology Guidelines</h3>
                <p className="sub" style={{ marginBottom: 12 }}>
                  ISA testing directives applicable to {wp.title}.
                </p>
                <div className="stack" style={{ gap: 10 }}>
                  <div className="borderbox" style={{ padding: 12 }}>
                    <b>1. Assertion Verification</b>
                    <p className="sub mt4">Verify that all material balances exist, are rights of the entity, and are completely recorded at accurate cutoff valuation.</p>
                  </div>
                  <div className="borderbox" style={{ padding: 12 }}>
                    <b>2. Independent Confirmation</b>
                    <p className="sub mt4">Obtain external confirmation letters from registered financial institutions and key third-party counterparties.</p>
                  </div>
                  <div className="borderbox" style={{ padding: 12 }}>
                    <b>3. Cutoff & Subsequent Events</b>
                    <p className="sub mt4">Inspect transactions occurring in the 15-day post-balance-sheet window to verify completeness and identify any subsequent adjusting events.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: Template / Data */}
            {activeTab === 'template' && (
              <div className="panel panel-pad">
                <h3>Embedded Tabular Schedule / Template Data</h3>
                <p className="sub" style={{ marginBottom: 16 }}>
                  Underlying lead schedule and trial balance account tie-out.
                </p>
                <div className="tablewrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Account Code</th>
                        <th>Account Description</th>
                        <th>Per Trial Balance</th>
                        <th>Per Audit Fieldwork</th>
                        <th>Difference</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><span className="mono">1000</span></td>
                        <td><b>Cash and bank balances (QNB Operating)</b></td>
                        <td>500,000 QAR</td>
                        <td>500,000 QAR</td>
                        <td><span className="badge green">0.00</span></td>
                      </tr>
                      <tr>
                        <td><span className="mono">1010</span></td>
                        <td><b>Petty cash imprest fund</b></td>
                        <td>15,000 QAR</td>
                        <td>15,000 QAR</td>
                        <td><span className="badge green">0.00</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tab 4: Working Paper Upload / Preview */}
            {activeTab === 'preview' && (
              <div className="panel panel-pad">
                <div className="between">
                  <div>
                    <h3>Working Paper Artifact Preview</h3>
                    <p className="sub">{wp.documentName} · Version {wp.version}</p>
                  </div>
                  <button className="btn sm" onClick={() => alert('Simulated workpaper version incremented.')}>
                    Upload Replacement Revision
                  </button>
                </div>
                <div className="borderbox mt16" style={{ background: '#f8fafc', padding: 20, minHeight: 140 }}>
                  <div className="between">
                    <b>{wp.documentName}</b>
                    <span className="mono">SHA: 9988aabbcc...</span>
                  </div>
                  <p className="sub mt12" style={{ fontFamily: 'monospace', fontSize: 13 }}>
                    === AUDIT WORKING PAPER ARCHIVE ===<br />
                    Lead Schedule: {wp.id}<br />
                    Testing procedures executed by {wp.preparer}.<br />
                    All bank reconciliations inspected, unpresented cheques cleared in January bank statements.<br />
                    Independent bank confirmations received directly from Qatar National Bank (QNB).
                  </p>
                </div>
              </div>
            )}

            {/* Tab 5: Supporting Evidence */}
            {activeTab === 'evidence' && (
              <div className="panel panel-pad">
                <h3>Version-Pinned Supporting Evidence Documents</h3>
                <p className="sub" style={{ marginBottom: 16 }}>
                  Direct evidence links registered in SharePoint and pinned to this workpaper.
                </p>
                <div className="stack" style={{ gap: 8 }}>
                  {(wp.evidenceRefs || []).map(ref => (
                    <div key={ref} className="between borderbox" style={{ padding: 12 }}>
                      <div className="row" style={{ gap: 10 }}>
                        <Icon name="file" />
                        <div>
                          <b>{ref}</b>
                          <div className="cell-sub">SharePoint Document Service · Verified Checksum</div>
                        </div>
                      </div>
                      <span className="tag green">Adequate</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tab 6: Clearance & History */}
            {activeTab === 'clearance' && (
              <div className="panel panel-pad">
                <div className="between">
                  <div>
                    <h3>Independent Clearance Gate & Sign-off</h3>
                    <p className="sub">
                      Separation of duties: Preparer ({wp.preparer}) cannot clear their own workpaper.
                    </p>
                  </div>
                  <span className={`badge ${wp.status === 'Cleared' ? 'green' : 'amber'}`}>
                    {wp.status}
                  </span>
                </div>

                {wp.clearance ? (
                  <div className="borderbox mt16" style={{ background: '#f0fdf4', padding: 16 }}>
                    <div className="between">
                      <b style={{ color: 'var(--teal-dark)' }}>Cleared by {wp.clearance.clearedBy}</b>
                      <span>{new Date(wp.clearance.clearedAt).toLocaleString('en-GB')}</span>
                    </div>
                    <p className="sub mt8">Source Version: v{wp.clearance.sourceVersion} · Generation: {wp.clearance.generation}</p>
                    <p className="sub mt4"><strong>Clearance Notes:</strong> {wp.clearance.notes}</p>
                  </div>
                ) : (
                  <div className="borderbox mt16" style={{ padding: 16 }}>
                    <h4>Clear Workpaper as Independent Reviewer</h4>
                    <p className="sub mt8">
                      Logged in persona: <b>{prototypeStore.getSnapshot().currentPerson}</b>
                    </p>
                    <div className="mt12">
                      <label className="caption">Clearance Review Memo</label>
                      <textarea
                        className="input"
                        rows={3}
                        value={clearanceNotes}
                        onChange={e => setClearanceNotes(e.target.value)}
                      />
                    </div>
                    <button
                      className="btn primary sm mt12"
                      onClick={handleClearWorkpaper}
                    >
                      Sign & Clear Workpaper
                    </button>
                  </div>
                )}

                <h4 className="mt20">Clearance History & Revisions</h4>
                <div className="stack mt8" style={{ gap: 6 }}>
                  {wp.clearanceHistory.length === 0 ? (
                    <span className="caption">No prior clearance records.</span>
                  ) : (
                    wp.clearanceHistory.map((h, i) => (
                      <div key={i} className="cell-sub borderbox" style={{ padding: 8 }}>
                        Cleared by {h.clearedBy} on {new Date(h.clearedAt).toLocaleString('en-GB')} (Workpaper v{h.version}, Source v{h.sourceVersion})
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
