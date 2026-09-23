// Module 38: Logical Practice Records Repository & Archive (VP-059, VP-060)
// Cross-engagement archive register, statutory 10-year retention schedules,
// handover request workflows, and application legal holds without Purview claims.

import React, { useState } from 'react';
import { RouteKey, ArchiveRecord } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';

interface RecordsArchiveViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const RecordsArchiveView: React.FC<RecordsArchiveViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const selectedEng = state.engagements.find(e => e.id === state.selectedEngagement) || state.engagements[0];
  const client = state.clients.find(c => c.id === selectedEng?.client);

  const [activeTab, setActiveTab] = useState<'single' | 'register'>('single');
  const [holdReason, setHoldReason] = useState('Pending tax authority audit inquiry on FY 2026 VAT declaration.');
  const [retentionYear, setRetentionYear] = useState('2036-12-31');
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [handoverTargetEng, setHandoverTargetEng] = useState<string>(selectedEng?.id || '');
  const [handoverReason, setHandoverReason] = useState('Successor auditor inspection requested under ISA 510.');
  const [handoverRequester, setHandoverRequester] = useState('KPMG Qatar (Successor Audit Firm)');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const triggerNotice = (type: 'success' | 'error', text: string) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 6000);
  };

  if (!selectedEng) {
    return (
      <div className="panel panel-pad text-center" style={{ padding: '60px 20px' }}>
        <Icon name="archive" size="xl" className="text-muted mb16" />
        <h3>No Active Engagement Selected</h3>
        <p className="sub max-w-md mx-auto mt8">
          Select or create an engagement to view archival status and manage retention holds.
        </p>
        <button className="btn primary sm mt16" onClick={() => onNavigate('engagements')}>
          Go to Engagements
        </button>
      </div>
    );
  }

  const archive = selectedEng.archive;

  const handleArchiveEngagement = (engId = selectedEng.id) => {
    const targetEng = state.engagements.find(e => e.id === engId);
    if (!targetEng) return;
    if (targetEng.releases.length === 0) {
      triggerNotice('error', 'Cannot archive: Must issue at least one official release deliverable first.');
      return;
    }

    try {
      prototypeStore.archiveEngagement(
        targetEng.id,
        targetEng.releases[0].id,
        retentionYear,
        false
      );
      triggerNotice('success', `Engagement ${targetEng.id} successfully sealed into immutable logical practice archive.`);
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  const handleToggleHold = (engId = selectedEng.id) => {
    const targetEng = state.engagements.find(e => e.id === engId);
    const arch = targetEng?.archive;
    if (!arch) return;
    const nextHold = !arch.onApplicationHold;
    try {
      prototypeStore.archiveEngagement(
        targetEng.id,
        arch.releaseId,
        arch.retentionUntil,
        nextHold,
        nextHold ? holdReason : undefined
      );
      triggerNotice('success', `Application legal hold ${nextHold ? 'enforced' : 'released'} for ${targetEng.id}.`);
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  const handleProcessHandover = () => {
    try {
      const eng = state.engagements.find(e => e.id === handoverTargetEng);
      if (!eng || !eng.archive) {
        triggerNotice('error', 'Target engagement must be archived before processing handover request.');
        return;
      }
      prototypeStore.logEvent(`Handover inspection packet authorized for ${handoverRequester}: ${handoverReason}`, eng.id);
      setShowHandoverModal(false);
      triggerNotice('success', `Handover inspection manifest issued to ${handoverRequester}. Authorization logged.`);
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Logical Practice Records Archive</h1>
          <p>Cross-engagement archive register, statutory 10-year retention schedules, and handover workflows.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button
            className="btn sm"
            onClick={() => {
              setHandoverTargetEng(selectedEng.id);
              setShowHandoverModal(true);
            }}
          >
            <Icon name="share" /> Process Handover Request
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

      {/* Disclaimers & Governance */}
      <div className="panel panel-pad" style={{ background: '#f8fafc' }}>
        <b>Logical Practice Repository Architecture Notice (VP-059):</b>
        <p className="sub mt4">
          This system provides an application-level immutable audit archive. It maintains checksum manifests, retention dates, and application legal holds without claiming external compliance with Microsoft Purview (no purview integration).
        </p>
      </div>

      <div className="tabs">
        <button
          className={`tab-btn ${activeTab === 'single' ? 'active' : ''}`}
          onClick={() => setActiveTab('single')}
        >
          Selected Engagement ({selectedEng.id})
        </button>
        <button
          className={`tab-btn ${activeTab === 'register' ? 'active' : ''}`}
          onClick={() => setActiveTab('register')}
        >
          Cross-Engagement Archive Register ({state.engagements.length})
        </button>
      </div>

      {activeTab === 'single' ? (
        <div className="panel panel-pad">
          <div className="between">
            <div>
              <span className="eyebrow">ARCHIVE STATUS · {selectedEng.id}</span>
              <h2>{client?.name || selectedEng.client} · FY {selectedEng.year}</h2>
              <p className="sub">Engagement Service: {selectedEng.service}</p>
            </div>
            <span className={`badge ${archive ? 'green' : 'amber'}`}>
              {archive ? 'Archived Record' : 'Active Engagement'}
            </span>
          </div>

          {archive ? (
            <div className="stack mt20" style={{ gap: 16 }}>
              <div className="info-grid">
                <div><label>Archived Date</label><span>{new Date(archive.archivedAt).toLocaleDateString('en-GB')}</span></div>
                <div><label>Archived By</label><span>{archive.archivedBy}</span></div>
                <div><label>Linked Release</label><b>{archive.releaseId}</b></div>
                <div><label>Statutory Retention Until</label><b>{archive.retentionUntil || '2036-12-31'}</b></div>
                <div>
                  <label>Application Legal Hold</label>
                  <span className={`badge ${archive.onApplicationHold ? 'red' : 'green'}`}>
                    {archive.onApplicationHold ? 'Active Hold Enforced' : 'No Holds'}
                  </span>
                </div>
              </div>

              {archive.onApplicationHold && (
                <div className="borderbox" style={{ background: '#fef2f2', borderColor: '#fca5a5', padding: 12 }}>
                  <b style={{ color: '#b91c1c' }}>Hold Notice &amp; Rationale:</b>
                  <p className="sub mt4" style={{ color: '#991b1b' }}>{archive.holdReason}</p>
                </div>
              )}

              <div className="row mt8" style={{ gap: 10 }}>
                <button
                  className={`btn sm ${archive.onApplicationHold ? 'ghost' : 'danger'}`}
                  onClick={() => handleToggleHold(selectedEng.id)}
                >
                  {archive.onApplicationHold ? 'Lift Application Legal Hold' : 'Place Application Legal Hold'}
                </button>
                <button
                  className="btn sm"
                  onClick={() => {
                    setHandoverTargetEng(selectedEng.id);
                    setShowHandoverModal(true);
                  }}
                >
                  Process Successor Handover
                </button>
              </div>
            </div>
          ) : (
            <div className="borderbox mt20" style={{ padding: 16, background: '#f8fafc' }}>
              <h4>Archive Engagement File</h4>
              <p className="sub mt8">
                Seal all engagement workpapers, reviews, and release deliverables into an immutable logical archive record.
              </p>

              <div className="grid2 mt16">
                <div>
                  <label className="caption">Statutory Retention Date (10 Years)</label>
                  <input
                    type="date"
                    className="input"
                    value={retentionYear}
                    onChange={e => setRetentionYear(e.target.value)}
                  />
                </div>
                <div>
                  <label className="caption">Target Release Candidate</label>
                  <div><b>{selectedEng.releases[0]?.id || 'No releases issued yet'}</b></div>
                </div>
              </div>

              <button
                className="btn primary sm mt16"
                onClick={() => handleArchiveEngagement(selectedEng.id)}
              >
                Seal &amp; Archive Engagement
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Cross-Engagement Register */
        <div className="panel">
          <div className="panel-head between">
            <div>
              <h3>Practice-Wide Records &amp; Archive Register</h3>
              <span className="caption">Master statutory retention index across all client engagements</span>
            </div>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Engagement</th>
                  <th>Client</th>
                  <th>FY</th>
                  <th>Service</th>
                  <th>Archive State</th>
                  <th>Retention Until</th>
                  <th>Legal Hold</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {state.engagements.map(eng => {
                  const cl = state.clients.find(c => c.id === eng.client);
                  const arch = eng.archive;
                  return (
                    <tr key={eng.id}>
                      <td><span className="mono">{eng.id}</span></td>
                      <td><b>{cl?.name || eng.client}</b></td>
                      <td>{eng.year}</td>
                      <td>{eng.service}</td>
                      <td>
                        <span className={`badge ${arch ? 'green' : 'gray'}`}>
                          {arch ? 'Archived' : 'Active'}
                        </span>
                      </td>
                      <td>{arch?.retentionUntil || '—'}</td>
                      <td>
                        {arch?.onApplicationHold ? (
                          <span className="badge red">Hold Enforced</span>
                        ) : arch ? (
                          <span className="badge green">None</span>
                        ) : '—'}
                      </td>
                      <td>
                        <div className="row" style={{ gap: 6 }}>
                          {arch ? (
                            <>
                              <button
                                className="btn sm ghost"
                                onClick={() => handleToggleHold(eng.id)}
                              >
                                {arch.onApplicationHold ? 'Lift Hold' : 'Place Hold'}
                              </button>
                              <button
                                className="btn sm"
                                onClick={() => {
                                  setHandoverTargetEng(eng.id);
                                  setShowHandoverModal(true);
                                }}
                              >
                                Handover
                              </button>
                            </>
                          ) : (
                            <button
                              className="btn sm primary"
                              onClick={() => handleArchiveEngagement(eng.id)}
                            >
                              Seal Archive
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Handover Request Modal */}
      {showHandoverModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: 540 }}>
            <div className="between">
              <h3>Process Handover Inspection Request</h3>
              <button className="btn sm ghost" onClick={() => setShowHandoverModal(false)}>✕</button>
            </div>
            <p className="sub mt4">
              Authorize inspection access to archived workpapers for successor auditors or regulatory inspectors under ISA 510.
            </p>

            <div className="stack mt16" style={{ gap: 12 }}>
              <div>
                <label className="caption">Target Archived Engagement</label>
                <select
                  className="input"
                  value={handoverTargetEng}
                  onChange={e => setHandoverTargetEng(e.target.value)}
                >
                  {state.engagements.map(e => (
                    <option key={e.id} value={e.id}>{e.id} · {e.client} · FY {e.year}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="caption">Requesting Body / Successor Auditor</label>
                <input
                  type="text"
                  className="input"
                  value={handoverRequester}
                  onChange={e => setHandoverRequester(e.target.value)}
                />
              </div>

              <div>
                <label className="caption">Mandate Handover Justification</label>
                <textarea
                  className="input"
                  rows={2}
                  value={handoverReason}
                  onChange={e => setHandoverReason(e.target.value)}
                />
              </div>
            </div>

            <div className="row mt20" style={{ gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn sm ghost" onClick={() => setShowHandoverModal(false)}>Cancel</button>
              <button className="btn primary sm" onClick={handleProcessHandover}>
                Authorize Handover Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
