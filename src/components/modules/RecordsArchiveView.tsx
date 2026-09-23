// Module 38: Logical Practice Records Repository & Archive (VP-059, VP-060)
// Read-only repository, statutory retention schedules, and application legal holds without Purview claims.

import React, { useState } from 'react';
import { RouteKey } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';

interface RecordsArchiveViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const RecordsArchiveView: React.FC<RecordsArchiveViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const selectedEng = state.engagements.find(e => e.id === state.selectedEngagement) || state.engagements[0];

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

  const client = state.clients.find(c => c.id === selectedEng.client);

  const [holdReason, setHoldReason] = useState('Pending tax authority audit inquiry on FY 2026 VAT declaration.');
  const [retentionYear, setRetentionYear] = useState('2036-12-31');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const triggerNotice = (type: 'success' | 'error', text: string) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 6000);
  };

  const archive = selectedEng.archive;

  const handleArchiveEngagement = () => {
    if (selectedEng.releases.length === 0) {
      triggerNotice('error', 'Cannot archive: Must issue at least one official release deliverable first.');
      return;
    }

    try {
      prototypeStore.archiveEngagement(
        selectedEng.id,
        selectedEng.releases[0].id,
        retentionYear,
        false
      );
      triggerNotice('success', 'Engagement successfully archived in logical practice records repository.');
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  const handleToggleHold = () => {
    if (!archive) return;
    const nextHold = !archive.onApplicationHold;
    try {
      prototypeStore.archiveEngagement(
        selectedEng.id,
        archive.releaseId,
        archive.retentionUntil,
        nextHold,
        nextHold ? holdReason : undefined
      );
      triggerNotice('success', `Application legal hold ${nextHold ? 'enforced' : 'released'}.`);
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Logical Practice Records Archive</h1>
          <p>Read-only file repository, statutory 10-year retention schedules, and application legal holds.</p>
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
        <b>Logical Practice Repository Architecture Notice (VP-059, hard exclusion):</b>
        <p className="sub mt4">
          This system provides an application-level immutable audit archive. It maintains checksum manifests, retention dates, and application legal holds without claiming external compliance with Microsoft Purview (no purview integration).
        </p>
      </div>

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
                onClick={handleToggleHold}
              >
                {archive.onApplicationHold ? 'Lift Application Legal Hold' : 'Place Application Legal Hold'}
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
              onClick={handleArchiveEngagement}
            >
              Seal &amp; Archive Engagement
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
