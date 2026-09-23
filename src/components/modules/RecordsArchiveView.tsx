// Module 38: Logical Records Archive & Legal Holds (VP-059)
// Note: Purely logical application archive; NO Microsoft Purview compliance claims.

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
  const client = state.clients.find(c => c.id === selectedEng?.client);

  const [holdReason, setHoldReason] = useState('Pending tax authority audit inquiry on FY 2026 VAT declaration.');
  const [retentionYear, setRetentionYear] = useState('2036-12-31');

  const archive = selectedEng.archive;

  const handleArchiveEngagement = () => {
    if (selectedEng.releases.length === 0) {
      alert('Cannot archive: Must issue at least one official release deliverable first.');
      return;
    }

    prototypeStore.archiveEngagement(
      selectedEng.id,
      selectedEng.releases[0].id,
      retentionYear,
      false
    );
    alert('Engagement successfully archived in logical practice records repository.');
  };

  const handleToggleHold = () => {
    if (!archive) return;
    const nextHold = !archive.onApplicationHold;
    prototypeStore.archiveEngagement(
      selectedEng.id,
      archive.releaseId,
      archive.retentionUntil,
      nextHold,
      nextHold ? holdReason : undefined
    );
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Logical Practice Records Archive</h1>
          <p>Read-only file repository, statutory 10-year retention schedules, and application legal holds.</p>
        </div>
      </div>

      {/* Disclaimers & Governance */}
      <div className="panel panel-pad" style={{ background: '#f8fafc' }}>
        <b>Logical Practice Repository Architecture Notice:</b>
        <p className="sub mt4">
          This system provides an application-level immutable audit archive. It maintains checksum manifests, retention dates, and application legal holds without claiming external compliance with Microsoft Purview.
        </p>
      </div>

      <div className="panel panel-pad">
        <div className="between">
          <div>
            <span className="eyebrow">ARCHIVE STATUS · {selectedEng.id}</span>
            <h2>{client?.name} · FY {selectedEng.year}</h2>
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
              <div className="borderbox" style={{ background: '#fef2f2', padding: 12 }}>
                <b style={{ color: '#991b1b' }}>Application Hold Justification:</b>
                <p className="sub mt4" style={{ color: '#7f1d1d' }}>{archive.holdReason}</p>
              </div>
            )}

            <div className="row" style={{ gap: 10 }}>
              <button
                className={`btn sm ${archive.onApplicationHold ? 'primary' : 'ghost'}`}
                onClick={handleToggleHold}
              >
                {archive.onApplicationHold ? 'Lift Application Hold' : 'Enact Application Legal Hold'}
              </button>
            </div>

            <h4>Locked Archive Deliverable Manifest</h4>
            <div className="stack" style={{ gap: 8 }}>
              {archive.manifest.map(item => (
                <div key={item} className="between borderbox" style={{ padding: 12 }}>
                  <div className="row" style={{ gap: 10 }}>
                    <Icon name="file" />
                    <div>
                      <b>{item}</b>
                      <div className="cell-sub">SHA-256 Verified · Immutable Archive Copy</div>
                    </div>
                  </div>
                  <span className="tag green">Locked</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="borderbox mt20" style={{ padding: 16 }}>
            <h4>Archive Engagement File</h4>
            <p className="sub mt8">
              Archiving locks all working papers and trial balances into a read-only statutory record.
            </p>
            <div className="mt12">
              <label className="caption">Statutory Retention Until (Qatar 10-Year Statutory Period)</label>
              <input
                type="date"
                className="input"
                style={{ maxWidth: 240 }}
                value={retentionYear}
                onChange={e => setRetentionYear(e.target.value)}
              />
            </div>
            <button
              className="btn primary sm mt16"
              onClick={handleArchiveEngagement}
            >
              Archive Engagement File
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
