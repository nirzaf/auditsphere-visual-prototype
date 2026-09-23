// Module 37: Final Release Completion, Gates & Delivery (VP-057, VP-058)
import React, { useState } from 'react';
import { RouteKey } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';

interface ReleaseCompletionViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const ReleaseCompletionView: React.FC<ReleaseCompletionViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const selectedEng = state.engagements.find(e => e.id === state.selectedEngagement) || state.engagements[0];
  const client = state.clients.find(c => c.id === selectedEng?.client);

  const [dispatchNote, setDispatchNote] = useState('Official audit report and audited financial statements dispatched to Board of Directors.');
  const [amendReason, setAmendReason] = useState('');
  const [showAmendModal, setShowAmendModal] = useState(false);

  // Gates evaluation
  const allWpCleared = selectedEng.workpapers.every(w => w.status === 'Cleared');
  const noOpenReviews = selectedEng.reviews.every(r => r.status === 'Cleared');
  const allSignOffsDone = Boolean(
    selectedEng.approvals.manager &&
    selectedEng.approvals.client &&
    selectedEng.approvals.partner &&
    (!selectedEng.eqrRequired || selectedEng.approvals.eqr)
  );

  const gatesPass = allWpCleared && noOpenReviews && allSignOffsDone;

  const handleFreezeCandidate = () => {
    if (!gatesPass) {
      alert('Cannot freeze release candidate: One or more release gates remain unfulfilled.');
      return;
    }
    prototypeStore.prepareReleaseCandidate(selectedEng.id);
  };

  const handleIssueRelease = () => {
    if (!selectedEng.candidate) {
      alert('Must freeze release candidate first before issuing delivery.');
      return;
    }
    prototypeStore.issueRelease(selectedEng.id, dispatchNote);
    alert('Release published successfully.');
  };

  const handleAmendSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amendReason.trim()) return;

    // Increment package revision and stale candidate
    selectedEng.packageRevision++;
    selectedEng.generation++;
    selectedEng.candidate = null;
    selectedEng.approvals.partner = null;
    prototypeStore.logEvent(`Release re-opened for amendment: ${amendReason}`, selectedEng.id);
    setShowAmendModal(false);
    setAmendReason('');
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Release & Final Completion Desk</h1>
          <p>Rigorous pre-release verification gates, exact generation freezing, artifact dispatch, and reissue lineage.</p>
        </div>
        <button className="btn sm ghost" onClick={() => onNavigate('records')}>
          <Icon name="archive" /> Logical Records Archive
        </button>
      </div>

      {/* Gates Checklist */}
      <div className="panel panel-pad">
        <div className="between">
          <div>
            <span className="eyebrow">PRE-RELEASE VERIFICATION GATES · {selectedEng.id}</span>
            <h2>Deliverable Readiness Evaluation</h2>
            <p className="sub">Every prerequisite gate must be satisfied before candidate generation is permitted.</p>
          </div>
          <span className={`badge ${gatesPass ? 'green' : 'amber'}`}>
            {gatesPass ? 'All Gates Cleared' : 'Gates Incomplete'}
          </span>
        </div>

        <div className="stack mt20" style={{ gap: 10 }}>
          <div className="between borderbox" style={{ padding: 12 }}>
            <div className="row" style={{ gap: 10 }}>
              <Icon name={allWpCleared ? 'checkcircle' : 'target'} className={allWpCleared ? 'text-green' : 'text-amber'} />
              <div>
                <b>1. All Audit Workpapers Cleared</b>
                <div className="cell-sub">{selectedEng.workpapers.filter(w => w.status === 'Cleared').length} of {selectedEng.workpapers.length} cleared</div>
              </div>
            </div>
            <button className="btn sm ghost" onClick={() => onNavigate('audit')}>Inspect Workpapers</button>
          </div>

          <div className="between borderbox" style={{ padding: 12 }}>
            <div className="row" style={{ gap: 10 }}>
              <Icon name={noOpenReviews ? 'checkcircle' : 'message'} className={noOpenReviews ? 'text-green' : 'text-amber'} />
              <div>
                <b>2. Review Desk Queries Cleared</b>
                <div className="cell-sub">{selectedEng.reviews.filter(r => r.status === 'Cleared').length} of {selectedEng.reviews.length} review points cleared</div>
              </div>
            </div>
            <button className="btn sm ghost" onClick={() => onNavigate('reviews')}>Inspect Desk</button>
          </div>

          <div className="between borderbox" style={{ padding: 12 }}>
            <div className="row" style={{ gap: 10 }}>
              <Icon name={allSignOffsDone ? 'checkcircle' : 'shield'} className={allSignOffsDone ? 'text-green' : 'text-amber'} />
              <div>
                <b>3. Multi-Stage Sign-off Approvals Recorded</b>
                <div className="cell-sub">
                  Manager: {selectedEng.approvals.manager ? '✓' : '✗'} · Client Rep: {selectedEng.approvals.client ? '✓' : '✗'} · Partner: {selectedEng.approvals.partner ? '✓' : '✗'} · EQR: {selectedEng.approvals.eqr ? '✓' : '✗'}
                </div>
              </div>
            </div>
            <button className="btn sm ghost" onClick={() => onNavigate('approvals')}>Inspect Approvals</button>
          </div>
        </div>

        {/* Release Actions */}
        <div className="row mt20" style={{ gap: 10 }}>
          {!selectedEng.candidate ? (
            <button
              className={`btn ${gatesPass ? 'primary' : 'ghost'} sm`}
              onClick={handleFreezeCandidate}
              disabled={!gatesPass}
            >
              Freeze Release Candidate (Generation {selectedEng.generation})
            </button>
          ) : (
            <div className="stack" style={{ width: '100%', gap: 12 }}>
              <div className="borderbox" style={{ background: '#f0fdf4', padding: 16 }}>
                <div className="between">
                  <b>Release Candidate Frozen (Generation {selectedEng.candidate.generation})</b>
                  <span className="mono">Ready for Dispatch</span>
                </div>
                <div className="cell-sub mt8">
                  Prepared by {selectedEng.candidate.preparedBy} on {new Date(selectedEng.candidate.preparedAt).toLocaleString('en-GB')}
                </div>
                <div className="mt12">
                  <label className="caption">Dispatch Memo & Distribution Record</label>
                  <textarea
                    className="input"
                    rows={2}
                    value={dispatchNote}
                    onChange={e => setDispatchNote(e.target.value)}
                  />
                </div>
                <div className="row mt12" style={{ gap: 10 }}>
                  <button className="btn primary sm" onClick={handleIssueRelease}>
                    Publish Official Release Deliverable
                  </button>
                  <button className="btn ghost sm" onClick={() => setShowAmendModal(true)}>
                    Re-open for Amendment
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dispatched Releases History */}
      <div className="panel">
        <div className="panel-head">
          <h3>Published Releases ({selectedEng.releases.length})</h3>
          <span className="caption">Cryptographic Delivery Manifest</span>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Release ID</th>
                <th>Version</th>
                <th>Generation</th>
                <th>Date Dispatched</th>
                <th>Signatory</th>
                <th>Recipients</th>
                <th>Dispatch Memo</th>
              </tr>
            </thead>
            <tbody>
              {selectedEng.releases.map(rel => (
                <tr key={rel.id}>
                  <td><b>{rel.id}</b></td>
                  <td>v{rel.version}</td>
                  <td>Gen {rel.generation}</td>
                  <td>{new Date(rel.releasedAt).toLocaleDateString('en-GB')}</td>
                  <td>{rel.releasedBy}</td>
                  <td>{(rel.recipients || []).join(', ')}</td>
                  <td>{rel.dispatchNote}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Amend Modal */}
      {showAmendModal && (
        <div className="modal-backdrop" onClick={() => setShowAmendModal(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Re-open Package for Amendment</h2>
              <button className="icon-btn" onClick={() => setShowAmendModal(false)}>✕</button>
            </div>
            <form onSubmit={handleAmendSubmit}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <p className="sub">
                  Re-opening a release increments the revision lineage and invalidates signing partner approval until re-evaluated.
                </p>
                <div>
                  <label className="caption">Amendment Reason (Required Governance Record)</label>
                  <textarea
                    className="input"
                    rows={3}
                    placeholder="Specify the subsequent event, client adjustment, or note disclosure requirement..."
                    value={amendReason}
                    onChange={e => setAmendReason(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={() => setShowAmendModal(false)}>Cancel</button>
                <button type="submit" className="btn primary sm">Confirm Amendment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
