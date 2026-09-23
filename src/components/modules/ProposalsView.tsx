// Module 04: Proposals, Terms & Commercial Review (VP-010, VP-011)
import React, { useState } from 'react';
import { RouteKey, ProposalRecord } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';
import { formatCurrency } from '../../services/calculations';

interface ProposalsViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const ProposalsView: React.FC<ProposalsViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const [selectedProposal, setSelectedProposal] = useState<ProposalRecord | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showResponseModal, setShowResponseModal] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Review state
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewApproved, setReviewApproved] = useState(true);

  // Response state
  const [responseType, setResponseType] = useState<'Accepted' | 'Declined' | 'Withdrawn'>('Accepted');
  const [responseContact, setResponseContact] = useState('');
  const [responseNotes, setResponseNotes] = useState('');

  const proposals = state.proposals;

  const handleCommercialReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProposal) return;

    try {
      prototypeStore.reviewProposal(selectedProposal.id, reviewApproved, reviewNotes);
      setShowReviewModal(false);
      setSelectedProposal(null);
      setNotice({ type: 'success', text: `Proposal ${selectedProposal.title} commercial review recorded.` });
      setTimeout(() => setNotice(null), 4000);
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message });
      setTimeout(() => setNotice(null), 6000);
    }
  };

  const handleRecordResponse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProposal) return;

    prototypeStore.recordProposalResponse(selectedProposal.id, {
      responseType,
      contact: responseContact || 'Management Signatory',
      date: new Date().toISOString().split('T')[0],
      method: 'Email',
      notes: responseNotes || 'Client confirmed acceptance of scope and proposed terms.'
    });

    setShowResponseModal(false);
    setSelectedProposal(null);
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Proposals & Engagement Terms</h1>
          <p>Standardized service deliverables, independent commercial review, and client acceptance recording.</p>
        </div>
      </div>

      {notice && (
        <div className={`badge ${notice.type === 'error' ? 'danger' : 'success'}`} style={{ padding: '8px 12px', display: 'block', fontSize: 13 }}>
          {notice.text}
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <h3>Commercial Proposals Register</h3>
          <span className="caption">Revisions & Governance</span>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Proposal Title</th>
                <th>Revision</th>
                <th>Total Fee</th>
                <th>Prepared By</th>
                <th>Commercial Review</th>
                <th>Client Response</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {proposals.map(p => (
                <tr key={p.id}>
                  <td>
                    <b>{p.title}</b>
                    <div className="cell-sub">{p.id} · Currency: {p.currency}</div>
                  </td>
                  <td>v{p.revision}</td>
                  <td><b>{formatCurrency(p.totalAmount, p.currency)}</b></td>
                  <td>{p.preparedBy}</td>
                  <td>
                    {p.commercialReview ? (
                      <span className={`badge ${p.commercialReview.approved ? 'green' : 'amber'}`}>
                        {p.commercialReview.approved ? 'Approved' : 'Returned'} by {p.commercialReview.reviewedBy}
                      </span>
                    ) : (
                      <span className="badge gray">Pending Review</span>
                    )}
                  </td>
                  <td>
                    {p.clientResponse ? (
                      <span className="badge teal">
                        {p.clientResponse.responseType} ({p.clientResponse.contact})
                      </span>
                    ) : (
                      <span className="caption">Awaiting response</span>
                    )}
                  </td>
                  <td>
                    <span className="badge blue">{p.state}</span>
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <button
                        className="btn sm"
                        onClick={() => setSelectedProposal(p)}
                      >
                        Preview
                      </button>
                      {p.state === 'Draft' && (
                        <button
                          className="btn sm ghost"
                          onClick={() => {
                            setSelectedProposal(p);
                            setShowReviewModal(true);
                          }}
                        >
                          Review
                        </button>
                      )}
                      {p.state === 'Approved to send' && (
                        <button
                          className="btn sm ghost"
                          onClick={() => {
                            setSelectedProposal(p);
                            setShowResponseModal(true);
                          }}
                        >
                          Record Client Response
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Proposal Preview Modal */}
      {selectedProposal && !showReviewModal && !showResponseModal && (
        <div className="modal-backdrop" onClick={() => setSelectedProposal(null)}>
          <div className="modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Proposal Preview: {selectedProposal.title}</h2>
              <button className="icon-btn" onClick={() => setSelectedProposal(null)}>✕</button>
            </div>
            <div className="modal-body stack" style={{ gap: 16 }}>
              <div className="info-grid">
                <div><label>Revision</label><span>Rev {selectedProposal.revision}</span></div>
                <div><label>Prepared By</label><span>{selectedProposal.preparedBy}</span></div>
                <div><label>Date</label><span>{selectedProposal.preparedAt}</span></div>
                <div><label>Total Fee</label><span>{formatCurrency(selectedProposal.totalAmount, selectedProposal.currency)}</span></div>
              </div>

              <h4>Scope & Deliverables</h4>
              <div className="stack" style={{ gap: 10 }}>
                {selectedProposal.items.map(item => (
                  <div key={item.id} className="borderbox" style={{ padding: 12 }}>
                    <div className="between">
                      <b>{item.serviceName}</b>
                      <span className="mono">{formatCurrency(item.amount, selectedProposal.currency)}</span>
                    </div>
                    <p className="sub mt8">{item.description}</p>
                    <div className="cell-sub mt8">
                      <strong>Deliverables:</strong> {item.deliverables}
                    </div>
                  </div>
                ))}
              </div>

              <h4>Standard Terms</h4>
              <p className="sub" style={{ fontSize: 12 }}>{selectedProposal.terms}</p>
            </div>
            <div className="modal-foot">
              <button className="btn sm ghost" onClick={() => setSelectedProposal(null)}>Close</button>
              {selectedProposal.state === 'Draft' && (
                <button className="btn primary sm" onClick={() => setShowReviewModal(true)}>
                  Independent Commercial Review
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Commercial Review Modal */}
      {showReviewModal && selectedProposal && (
        <div className="modal-backdrop" onClick={() => setShowReviewModal(false)}>
          <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Independent Commercial Review</h2>
              <button className="icon-btn" onClick={() => setShowReviewModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCommercialReview}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <p className="sub">
                  An independent reviewer must inspect fee consistency, terms, and billing schedule prior to client presentation.
                </p>
                <div>
                  <label className="caption">Review Decision</label>
                  <select
                    className="input"
                    value={reviewApproved ? 'approve' : 'return'}
                    onChange={e => setReviewApproved(e.target.value === 'approve')}
                  >
                    <option value="approve">Approve Proposal for Client Presentation</option>
                    <option value="return">Return for Amendments</option>
                  </select>
                </div>
                <div>
                  <label className="caption">Review Comments / Notes</label>
                  <textarea
                    className="input"
                    rows={3}
                    placeholder="Document review considerations..."
                    value={reviewNotes}
                    onChange={e => setReviewNotes(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={() => setShowReviewModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn primary sm">
                  Record Review Decision
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Client Response Modal */}
      {showResponseModal && selectedProposal && (
        <div className="modal-backdrop" onClick={() => setShowResponseModal(false)}>
          <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Record Client Acceptance Response</h2>
              <button className="icon-btn" onClick={() => setShowResponseModal(false)}>✕</button>
            </div>
            <form onSubmit={handleRecordResponse}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div>
                  <label className="caption">Client Response Type</label>
                  <select
                    className="input"
                    value={responseType}
                    onChange={e => setResponseType(e.target.value as any)}
                  >
                    <option value="Accepted">Accepted by Client</option>
                    <option value="Declined">Declined</option>
                    <option value="Withdrawn">Withdrawn</option>
                  </select>
                </div>
                <div>
                  <label className="caption">Client Authorized Signatory</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Omar Nasser (CFO)"
                    value={responseContact}
                    onChange={e => setResponseContact(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="caption">Acceptance Notes & Evidence Reference</label>
                  <textarea
                    className="input"
                    rows={3}
                    placeholder="Record confirmation date, email reference or signed letter..."
                    value={responseNotes}
                    onChange={e => setResponseNotes(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={() => setShowResponseModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn primary sm">
                  Record Response
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
