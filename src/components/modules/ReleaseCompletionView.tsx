// Module 37: Final Release Completion, Gates & Delivery (VP-057, VP-058)
// Rigorous pre-release verification gates, exact generation freezing, artifact dispatch, and reissue lineage.

import React, { useState } from 'react';
import { RouteKey } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';

interface ReleaseCompletionViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const ReleaseCompletionView: React.FC<ReleaseCompletionViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const [dispatchNote, setDispatchNote] = useState('');
  const [recipientText, setRecipientText] = useState('');
  const [amendReason, setAmendReason] = useState('');
  const [showAmendModal, setShowAmendModal] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const selectedEng = state.engagements.find(e => e.id === state.selectedEngagement) || state.engagements[0];

  const triggerNotice = (type: 'success' | 'error', text: string) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 6000);
  };

  if (!selectedEng) {
    return (
      <div className="panel panel-pad text-center" style={{ padding: '60px 20px' }}>
        <Icon name="archive" size="lg" className="text-muted mb16" />
        <h3>No Active Engagement Selected</h3>
        <p className="sub max-w-md mx-auto mt8">
          Select or create an engagement to access the release and final completion desk.
        </p>
        <button className="btn primary sm mt16" onClick={() => onNavigate('engagements')}>
          Go to Engagements
        </button>
      </div>
    );
  }

  const client = state.clients.find(c => c.id === selectedEng.client);

  // Comprehensive 4-part release gate checklist (VP-057)
  const allWpCleared = selectedEng.workpapers.every(w => !w.applicable || w.status === 'Cleared' || w.status === 'Not applicable');
  const noOpenReviews = selectedEng.reviews.every(r => r.status === 'Cleared');

  // Gate 3: Findings resolution (no unresolved material misstatements)
  const openMaterialFindings = state.findings.filter(
    f => f.engagementId === selectedEng.id &&
      !['Corrected in TB', 'Corrected by client', 'Waived as immaterial', 'Uncorrected waived'].includes(f.disposition) &&
      (f.severity === 'Material' || f.category === 'Monetary misstatement')
  );
  const noMaterialFindings = openMaterialFindings.length === 0;

  // Gate 4: Multi-stage sign-offs recorded and valid for current generation
  const approvalsValid = Boolean(
    selectedEng.approvals.manager?.generation === selectedEng.generation &&
    selectedEng.approvals.client?.generation === selectedEng.generation &&
    selectedEng.approvals.partner?.generation === selectedEng.generation &&
    (!selectedEng.eqrRequired || selectedEng.approvals.eqr?.generation === selectedEng.generation)
  );

  const gatesPass = allWpCleared && noOpenReviews && noMaterialFindings && approvalsValid;

  const handleFreezeCandidate = () => {
    if (!gatesPass) {
      triggerNotice('error', 'Cannot freeze release candidate: One or more release gates remain unfulfilled.');
      return;
    }
    try {
      prototypeStore.prepareReleaseCandidate(selectedEng.id);
      triggerNotice('success', `Release candidate frozen for Generation ${selectedEng.generation}.`);
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  const handleIssueRelease = () => {
    if (!selectedEng.candidate) {
      triggerNotice('error', 'Must freeze release candidate first before issuing delivery.');
      return;
    }
    try {
      prototypeStore.issueRelease(selectedEng.id, dispatchNote, recipientText.split(/[;,\n]/));
      triggerNotice('success', 'Local release record created. No files were delivered and no cryptographic hashes are claimed.');
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  const handleAmendSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amendReason.trim()) return;

    try {
      prototypeStore.reopenReleaseForAmendment(selectedEng.id, amendReason.trim());
      setShowAmendModal(false);
      setAmendReason('');
      triggerNotice('success', `Release re-opened for amendment. Partner clearance invalidated for Generation ${selectedEng.generation + 1}.`);
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Release &amp; Final Completion Desk</h1>
          <p>Rigorous pre-release verification gates, exact generation freezing, artifact dispatch, and reissue lineage.</p>
        </div>
        <button className="btn sm ghost" onClick={() => onNavigate('records')}>
          <Icon name="archive" /> Logical Records Archive
        </button>
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

      {/* Gates Checklist */}
      <div className="panel panel-pad">
        <div className="between">
          <div>
            <span className="eyebrow">PRE-RELEASE VERIFICATION GATES · {selectedEng.id}</span>
            <h2>Deliverable Readiness Evaluation (Generation {selectedEng.generation})</h2>
            <p className="sub">Every prerequisite gate must be satisfied before candidate generation is permitted.</p>
          </div>
          <span className={`badge ${gatesPass ? 'green' : 'amber'}`}>
            {gatesPass ? 'All Gates Cleared' : 'Gates Incomplete'}
          </span>
        </div>

        <div className="stack mt20" style={{ gap: 10 }}>
          {/* Gate 1: Workpapers */}
          <div className="between borderbox" style={{ padding: 12 }}>
            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
              <Icon name={allWpCleared ? 'checkcircle' : 'target'} className={allWpCleared ? 'text-green' : 'text-amber'} />
              <div>
                <b>1. All Audit Workpapers Cleared</b>
                <div className="cell-sub">
                  {selectedEng.workpapers.filter(w => w.status === 'Cleared' || w.status === 'Not applicable').length} of {selectedEng.workpapers.length} cleared / N/A
                </div>
              </div>
            </div>
            <button className="btn sm ghost" onClick={() => onNavigate('audit')}>Inspect Workpapers</button>
          </div>

          {/* Gate 2: Review Desk */}
          <div className="between borderbox" style={{ padding: 12 }}>
            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
              <Icon name={noOpenReviews ? 'checkcircle' : 'message'} className={noOpenReviews ? 'text-green' : 'text-amber'} />
              <div>
                <b>2. Review Desk Queries Cleared</b>
                <div className="cell-sub">
                  {selectedEng.reviews.filter(r => r.status === 'Cleared').length} of {selectedEng.reviews.length} review points cleared
                </div>
              </div>
            </div>
            <button className="btn sm ghost" onClick={() => onNavigate('reviews')}>Inspect Desk</button>
          </div>

          {/* Gate 3: Material Findings */}
          <div className="between borderbox" style={{ padding: 12 }}>
            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
              <Icon name={noMaterialFindings ? 'checkcircle' : 'shield'} className={noMaterialFindings ? 'text-green' : 'text-amber'} />
              <div>
                <b>3. No Unresolved Material Misstatements</b>
                <div className="cell-sub">
                  {openMaterialFindings.length === 0
                    ? 'All audit findings resolved or classified as trivial'
                    : `${openMaterialFindings.length} unresolved material finding(s) pending resolution`}
                </div>
              </div>
            </div>
            <button className="btn sm ghost" onClick={() => onNavigate('findings')}>Inspect Findings</button>
          </div>

          {/* Gate 4: Multi-stage approvals */}
          <div className="between borderbox" style={{ padding: 12 }}>
            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
              <Icon name={approvalsValid ? 'checkcircle' : 'shield'} className={approvalsValid ? 'text-green' : 'text-amber'} />
              <div>
                <b>4. Multi-Stage Sign-offs Valid for Generation {selectedEng.generation}</b>
                <div className="cell-sub">
                  Manager: {selectedEng.approvals.manager?.generation === selectedEng.generation ? '✓' : '✗'} ·
                  Client Rep: {selectedEng.approvals.client?.generation === selectedEng.generation ? '✓' : '✗'} ·
                  Partner: {selectedEng.approvals.partner?.generation === selectedEng.generation ? '✓' : '✗'} ·
                  EQR: {!selectedEng.eqrRequired ? 'N/A' : selectedEng.approvals.eqr?.generation === selectedEng.generation ? '✓' : '✗'}
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
              <span className="mono">Metadata candidate · Generation {selectedEng.candidate.generation}</span>
                </div>
                <div className="cell-sub mt8">
                  Prepared by {selectedEng.candidate.preparedBy} on {new Date(selectedEng.candidate.preparedAt).toLocaleString('en-GB')}
                </div>
                <div className="mt12">
                  <label className="caption">Local release note</label>
                  <textarea
                    className="input"
                    rows={2}
                    value={dispatchNote}
                    onChange={e => setDispatchNote(e.target.value)}
                  />
                </div>
                <div className="mt8">
                  <label className="caption">Recipient metadata (comma separated)</label>
                  <input className="input" value={recipientText} onChange={e => setRecipientText(e.target.value)} placeholder="Enter intended recipients" />
                </div>
                <p className="caption mt8">This records a local release event and revision references. It does not store deliverable bytes, calculate cryptographic hashes, or send anything.</p>
                <div className="row mt12" style={{ gap: 10 }}>
                  <button className="btn primary sm" onClick={handleIssueRelease} disabled={state.currentRole !== 'partner'}>
                    Record Local Release
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
          <h3>Release Records ({selectedEng.releases.length})</h3>
          <span className="caption">Local metadata manifest and revision lineage · no delivery or cryptographic hash claim</span>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Release ID</th>
                <th>Version</th>
                <th>Gen</th>
                <th>Predecessor</th>
                <th>Status</th>
                <th>Recorded At</th>
                <th>Recorded By</th>
                <th>Recipients</th>
                <th>Local Note</th>
              </tr>
            </thead>
            <tbody>
              {selectedEng.releases.length === 0 ? (
                <tr><td colSpan={9} className="text-center sub" style={{ padding: 20 }}>No local release records exist for this engagement.</td></tr>
              ) : (
                selectedEng.releases.map(rel => (
                  <tr key={rel.id}>
                    <td><b>{rel.id}</b></td>
                    <td>v{rel.version}</td>
                    <td>Gen {rel.generation}</td>
                    <td><span className="mono">{rel.predecessorId || 'Initial Release'}</span></td>
                    <td>
                      <span className={`badge ${selectedEng.releases.some(next => next.predecessorId === rel.id) ? 'amber' : 'green'}`}>
                        {selectedEng.releases.some(next => next.predecessorId === rel.id) ? 'Superseded' : 'Recorded locally · not delivered'}
                      </span>
                    </td>
                    <td>{new Date(rel.releasedAt).toLocaleDateString('en-GB')}</td>
                    <td>{rel.releasedBy}</td>
                    <td>{(rel.recipients || []).join(', ')}</td>
                    <td>{rel.dispatchNote}</td>
                  </tr>
                ))
              )}
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
                  Re-opening a release preserves the prior record, increments the generation, and requires fresh approvals. It does not alter the predecessor record.
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
