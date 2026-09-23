// Module 32: Comprehensive 6-Tab Workpaper Workspace (VP-052)
// 6 Tabs: Overview, Guidelines, Template/Data, Working Paper Upload/Preview, Supporting Evidence, Clearance & History
// Pure browser prototype: local version incrementing, separation of duties, dynamic template parsing, no alerts.

import React, { useState } from 'react';
import { RouteKey } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';

interface WorkpapersViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const WorkpapersView: React.FC<WorkpapersViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const selectedEng = state.engagements.find(e => e.id === state.selectedEngagement) || state.engagements[0];

  if (!selectedEng) {
    return (
      <div className="panel panel-pad text-center" style={{ padding: '60px 20px' }}>
        <Icon name="checkboard" size="xl" className="text-muted mb16" />
        <h3>No Active Engagement Selected</h3>
        <p className="sub max-w-md mx-auto mt8">
          Select or create an engagement to access the audit workpapers workspace.
        </p>
        <button className="btn primary sm mt16" onClick={() => onNavigate('engagements')}>
          Go to Engagements
        </button>
      </div>
    );
  }

  const workpapers = selectedEng.workpapers || [];
  const [selectedWpId, setSelectedWpId] = useState<string>(workpapers[0]?.id || 'WP-A1');
  const [activeTab, setActiveTab] = useState<
    'overview' | 'guidelines' | 'template' | 'preview' | 'evidence' | 'clearance'
  >('overview');

  const [clearanceNotes, setClearanceNotes] = useState('Satisfactory completion of all testing procedures and evidence tie-out.');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [newRevisionFile, setNewRevisionFile] = useState('');

  const wp = workpapers.find(w => w.id === selectedWpId) || workpapers[0];

  const triggerNotice = (type: 'success' | 'error', text: string) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 6000);
  };

  const handleClearWorkpaper = () => {
    try {
      prototypeStore.clearWorkpaper(selectedEng.id, wp.id, clearanceNotes);
      triggerNotice('success', `Workpaper ${wp.id} successfully cleared by ${prototypeStore.getSnapshot().currentPerson}.`);
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  const handleToggleApplicability = () => {
    const updated = !wp.applicable;
    prototypeStore.updateWorkpaper(selectedEng.id, wp.id, {
      applicable: updated,
      status: updated ? 'In progress' : 'Not applicable'
    });
    triggerNotice('success', `Workpaper ${wp.id} marked as ${updated ? 'applicable' : 'not applicable'}.`);
  };

  const handleUploadRevisionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRevisionFile.trim()) return;

    try {
      prototypeStore.replaceWorkpaperRevision(selectedEng.id, wp.id, {
        name: newRevisionFile.trim(),
        size: 58000
      });
      triggerNotice('success', `Replacement revision uploaded. Version is now v${wp.version + 1}; status reset to In progress.`);
      setShowUploadModal(false);
      setNewRevisionFile('');
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  // Parse CSV template data if present
  const csvData = React.useMemo(() => {
    if (!wp?.template?.csv) return null;
    const lines = wp.template.csv.split('\n').filter(l => l.trim().length > 0);
    if (lines.length === 0) return null;
    const headers = lines[0].split(',').map(h => h.trim());
    const rows = lines.slice(1).map(line => line.split(',').map(c => c.trim()));
    return { headers, rows };
  }, [wp?.template?.csv]);

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

      {notice && (
        <div
          className="panel panel-pad"
          style={{
            background: notice.type === 'success' ? '#f0fdf4' : '#fef2f2',
            borderColor: notice.type === 'success' ? '#86efac' : '#fca5a5',
            color: notice.type === 'success' ? '#166534' : '#991b1b',
            padding: '10px 16px'
          }}
        >
          <b>{notice.type === 'success' ? '✓ ' : '⚠ '}</b>
          {notice.text}
        </div>
      )}

      <div className="grid-main">
        {/* Left: Workpapers List */}
        <div className="stack" style={{ gap: 16 }}>
          <div className="panel">
            <div className="panel-head">
              <h3>Engagement Workpapers ({workpapers.length})</h3>
              <span className="caption">Gen {selectedEng.generation}</span>
            </div>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Lead Schedule</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {workpapers.map(w => (
                    <tr
                      key={w.id}
                      className={w.id === wp?.id ? 'selected-row' : ''}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedWpId(w.id)}
                    >
                      <td>
                        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                          <span className="mono bold">{w.id}</span>
                          <b>{w.title}</b>
                        </div>
                        <div className="cell-sub">{w.assertion} · Rev v{w.version}</div>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            w.status === 'Cleared'
                              ? 'green'
                              : w.status === 'Not applicable'
                              ? 'gray'
                              : w.status === 'Changes required'
                              ? 'red'
                              : 'amber'
                          }`}
                        >
                          {w.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right: Active Workpaper Tabs */}
        {wp && (
          <div className="stack" style={{ gap: 16 }}>
            <div className="panel panel-pad">
              <div className="between">
                <div>
                  <span className="eyebrow">{wp.id} · {wp.assertion.toUpperCase()}</span>
                  <h2>{wp.title}</h2>
                  <div className="cell-sub mt4">
                    Assigned Preparer: <b>{wp.preparer}</b> · Reviewer: <b>{wp.reviewer}</b>
                  </div>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button
                    className={`btn sm ${wp.applicable ? 'ghost' : 'primary'}`}
                    onClick={handleToggleApplicability}
                  >
                    {wp.applicable ? 'Mark N/A' : 'Mark Applicable'}
                  </button>
                  <span
                    className={`badge ${
                      wp.status === 'Cleared'
                        ? 'green'
                        : wp.status === 'Not applicable'
                        ? 'gray'
                        : 'amber'
                    }`}
                  >
                    {wp.status}
                  </span>
                </div>
              </div>

              {/* 6 Tabs */}
              <div className="tabs mt20">
                {[
                  { key: 'overview', label: '1. Objective & Scope' },
                  { key: 'guidelines', label: '2. Testing Guidelines' },
                  { key: 'template', label: '3. Lead Schedule Data' },
                  { key: 'preview', label: '4. Artifact & Revision' },
                  { key: 'evidence', label: '5. Pinned Evidence' },
                  { key: 'clearance', label: '6. Clearance & History' }
                ].map(t => (
                  <button
                    key={t.key}
                    className={`tab-btn ${activeTab === t.key ? 'active' : ''}`}
                    onClick={() => setActiveTab(t.key as any)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab 1: Objective */}
            {activeTab === 'overview' && (
              <div className="panel panel-pad">
                <h4>Audit Objective</h4>
                <p className="sub mt8">{wp.objective}</p>
                <h4 className="mt16">Testing Scope</h4>
                <p className="sub mt8">{wp.scope || 'Full population testing and substantive analytical review.'}</p>
                <h4 className="mt16">Key Audit Risk</h4>
                <p className="sub mt8">{wp.risk || 'Risk of material misstatement due to management override or valuation errors.'}</p>
                <h4 className="mt16">Auditor Conclusion</h4>
                <p className="sub mt8">{wp.conclusion || 'Substantive testing completed with no unresolved material misstatements.'}</p>
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
                  {wp.guidelines && wp.guidelines.length > 0 ? (
                    wp.guidelines.map((g, idx) => (
                      <div key={idx} className="borderbox" style={{ padding: 12 }}>
                        <div className="between">
                          <b>{g.title}</b>
                          {g.mandatory && <span className="badge amber">Mandatory ISA</span>}
                        </div>
                        <p className="sub mt4">{g.desc}</p>
                      </div>
                    ))
                  ) : (
                    <>
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
                        <p className="sub mt4">Inspect transactions occurring in the post-balance-sheet window to verify completeness and identify any subsequent adjusting events.</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Tab 3: Template / Data */}
            {activeTab === 'template' && (
              <div className="panel panel-pad">
                <div className="between">
                  <div>
                    <h3>Embedded Tabular Schedule / Template Data</h3>
                    <p className="sub">
                      {wp.template?.name || 'Lead Schedule'} · Ref: {wp.template?.ref || wp.id}
                    </p>
                  </div>
                  {wp.template?.instructions && (
                    <span className="caption text-muted">{wp.template.instructions}</span>
                  )}
                </div>

                <div className="tablewrap mt16">
                  {csvData ? (
                    <table>
                      <thead>
                        <tr>
                          {csvData.headers.map((h, i) => (
                            <th key={i}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {csvData.rows.map((row, rI) => (
                          <tr key={rI}>
                            {row.map((cell, cI) => (
                              <td key={cI} className={cI === 0 ? 'mono bold' : ''}>
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Account Code</th>
                          <th>Account Description</th>
                          <th>Per Trial Balance</th>
                          <th>Mapped Line</th>
                          <th>Audit Difference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedEng.rows.map(row => (
                          <tr key={row.code}>
                            <td><span className="mono bold">{row.code}</span></td>
                            <td><b>{row.name}</b></td>
                            <td>{Math.abs(row.balance).toLocaleString('en-GB')} QAR</td>
                            <td>{row.mappedStatementLine}</td>
                            <td><span className="badge green">0.00</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* Tab 4: Working Paper Upload / Preview */}
            {activeTab === 'preview' && (
              <div className="panel panel-pad">
                <div className="between">
                  <div>
                    <h3>Working Paper Artifact Preview</h3>
                    <p className="sub">
                      {wp.workingPaper?.name || wp.documentName || `${wp.id}_Fieldwork.xlsx`} · Version {wp.version}
                    </p>
                  </div>
                  <button
                    className="btn sm primary"
                    onClick={() => {
                      setNewRevisionFile(`${wp.id}_Revision_v${wp.version + 1}.xlsx`);
                      setShowUploadModal(true);
                    }}
                  >
                    <Icon name="plus" size="sm" /> Upload Replacement Revision
                  </button>
                </div>
                <div className="borderbox mt16" style={{ background: '#f8fafc', padding: 20, minHeight: 140 }}>
                  <div className="between">
                    <b>{wp.workingPaper?.name || wp.documentName || `${wp.id}_Fieldwork.xlsx`}</b>
                    <span className="mono">
                      SHA: {wp.workingPaper?.sha?.slice(0, 16) || '9988aabbcc112233'}...
                    </span>
                  </div>
                  <p className="sub mt12" style={{ fontFamily: 'monospace', fontSize: 13 }}>
                    === AUDIT WORKING PAPER ARCHIVE ===<br />
                    Lead Schedule: {wp.id}<br />
                    Objective: {wp.objective}<br />
                    Testing procedures executed by {wp.preparer}.<br />
                    Artifact revision v{wp.version} registered in SharePoint canonical engagement hierarchy.<br />
                    Clearance State: {wp.status}
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
                  {(wp.evidenceRefs && wp.evidenceRefs.length > 0) ? (
                    wp.evidenceRefs.map(ref => (
                      <div key={ref} className="between borderbox" style={{ padding: 12 }}>
                        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                          <Icon name="file" />
                          <div>
                            <b>{ref}</b>
                            <div className="cell-sub">SharePoint Document Service · Verified Checksum</div>
                          </div>
                        </div>
                        <span className="badge green">Adequate</span>
                      </div>
                    ))
                  ) : (
                    <div className="cell-sub text-muted">No external evidence attachments pinned yet.</div>
                  )}
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
                      {prototypeStore.getSnapshot().currentPerson === wp.preparer && (
                        <span className="tag red sm" style={{ marginLeft: 8 }}>
                          Preparer (cannot sign off own workpaper)
                        </span>
                      )}
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
                  {wp.clearanceHistory && wp.clearanceHistory.length > 0 ? (
                    wp.clearanceHistory.map((h, i) => (
                      <div key={i} className="cell-sub borderbox" style={{ padding: 8 }}>
                        Cleared by {h.clearedBy} on {new Date(h.clearedAt).toLocaleString('en-GB')} (Workpaper v{h.version}, Source v{h.sourceVersion})
                      </div>
                    ))
                  ) : (
                    <span className="caption">No prior clearance records.</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Replacement Revision Modal */}
      {showUploadModal && wp && (
        <div className="modal-backdrop" onClick={() => setShowUploadModal(false)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Upload Replacement Workpaper Revision</h2>
              <button className="icon-btn" onClick={() => setShowUploadModal(false)}>✕</button>
            </div>
            <form onSubmit={handleUploadRevisionSubmit}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div>
                  <label className="caption">Target Workpaper</label>
                  <div><b>{wp.id} · {wp.title}</b> (Current v{wp.version})</div>
                </div>
                <div>
                  <label className="caption">Replacement File Name</label>
                  <input
                    type="text"
                    className="input"
                    value={newRevisionFile}
                    onChange={e => setNewRevisionFile(e.target.value)}
                    required
                  />
                  <span className="caption" style={{ color: 'var(--muted)', display: 'block', marginTop: 4 }}>
                    Uploading a new revision invalidates prior clearances and transitions the workpaper to 'In progress'.
                  </span>
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={() => setShowUploadModal(false)}>Cancel</button>
                <button type="submit" className="btn primary sm">Upload Revision v{wp.version + 1}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
