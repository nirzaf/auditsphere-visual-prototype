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
  const [showNewModal, setShowNewModal] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Review state
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewApproved, setReviewApproved] = useState(true);

  // Response state
  const [responseType, setResponseType] = useState<'Accepted' | 'Declined' | 'Withdrawn'>('Accepted');
  const [responseContact, setResponseContact] = useState('');
  const [responseNotes, setResponseNotes] = useState('');
  const [proposalTitle, setProposalTitle] = useState('');
  const [proposalLead, setProposalLead] = useState('');
  const [proposalScope, setProposalScope] = useState('');
  const [proposalExclusions, setProposalExclusions] = useState('');
  const [proposalDeliverables, setProposalDeliverables] = useState('');
  const [proposalResponsibilities, setProposalResponsibilities] = useState('');
  const [proposalTerms, setProposalTerms] = useState('Payment due within 30 days of invoice.');
  const [proposalAmount, setProposalAmount] = useState(0);
  const [proposalCurrency, setProposalCurrency] = useState('QAR');

  const proposals = state.proposals;

  const createProposal = (e: React.FormEvent) => {
    e.preventDefault();
    const lead = state.leads.find(item => item.id === proposalLead);
    const id = `PROP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    try {
      const editing = selectedProposal?.state === 'Draft' ? selectedProposal : undefined;
      const prop: ProposalRecord = { id: editing?.id || id, leadId: editing?.leadId || lead?.id, clientId: editing?.clientId || lead?.convertedClientId, title: proposalTitle.trim(), revision: editing?.revision || 1, predecessorId: editing?.predecessorId, preparedBy: editing?.preparedBy || state.currentPerson, preparedAt: editing?.preparedAt || new Date().toISOString().slice(0, 10), currency: proposalCurrency, totalAmount: proposalAmount, items: [{ id: `${editing?.id || id}-1`, serviceName: lead?.service || editing?.items[0]?.serviceName || 'Professional services', description: proposalScope, scope: proposalScope, exclusions: proposalExclusions, deliverables: proposalDeliverables, clientResponsibilities: proposalResponsibilities, feeModel: 'Fixed', amount: proposalAmount }], terms: proposalTerms, state: 'Draft' };
      editing ? prototypeStore.updateProposal(prop) : prototypeStore.addProposal(prop);
      setShowNewModal(false); setSelectedProposal(prototypeStore.getSnapshot().proposals.find(item => item.id === prop.id) || null); setNotice({ type: 'success', text: editing ? 'Proposal draft updated.' : 'Proposal draft created.' });
    } catch (error: any) { setNotice({ type: 'error', text: error.message }); }
  };

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
        <button className="btn primary sm" onClick={() => { setSelectedProposal(null); setProposalTitle(''); setProposalLead(''); setProposalScope(''); setProposalExclusions(''); setProposalDeliverables(''); setProposalResponsibilities(''); setProposalAmount(0); setProposalTerms('Payment due within 30 days of invoice.'); setShowNewModal(true); }}><Icon name="plus" /> New Proposal</button>
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
                            try { prototypeStore.presentProposal(p.id); } catch (error: any) { setNotice({ type: 'error', text: error.message }); }
                          }}
                        >
                          Mark Presented
                        </button>
                      )}
                      {['Draft', 'Approved to send', 'Presented', 'Declined', 'Withdrawn'].includes(p.state) && <button className="btn sm ghost" onClick={() => { try { const next = prototypeStore.createProposalRevision(p.id); setSelectedProposal(next); } catch (error: any) { setNotice({ type: 'error', text: error.message }); } }}>New Revision</button>}
                      {p.state === 'Presented' && <button className="btn sm ghost" onClick={() => { setSelectedProposal(p); setShowResponseModal(true); }}>Record Client Response</button>}
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
              {selectedProposal.state === 'Draft' && <><button className="btn sm ghost" onClick={() => { setProposalTitle(selectedProposal.title); setProposalLead(selectedProposal.leadId || ''); setProposalScope(selectedProposal.items[0]?.scope || ''); setProposalExclusions(selectedProposal.items[0]?.exclusions || ''); setProposalDeliverables(selectedProposal.items[0]?.deliverables || ''); setProposalResponsibilities(selectedProposal.items[0]?.clientResponsibilities || ''); setProposalAmount(selectedProposal.totalAmount); setProposalCurrency(selectedProposal.currency); setProposalTerms(selectedProposal.terms); setShowNewModal(true); }}>Edit Draft</button><button className="btn sm ghost" onClick={() => { try { const revised = prototypeStore.createProposalRevision(selectedProposal.id); setSelectedProposal(revised); setProposalTitle(revised.title); setProposalLead(revised.leadId || ''); setProposalScope(revised.items[0]?.scope || ''); setProposalExclusions(revised.items[0]?.exclusions || ''); setProposalDeliverables(revised.items[0]?.deliverables || ''); setProposalResponsibilities(revised.items[0]?.clientResponsibilities || ''); setProposalAmount(revised.totalAmount); setProposalCurrency(revised.currency); setProposalTerms(revised.terms); setShowNewModal(true); } catch (error: any) { setNotice({ type: 'error', text: error.message }); } }}>Create Revision</button></>}
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

      {showNewModal && <div className="modal-backdrop" onClick={() => setShowNewModal(false)}><form className="modal" style={{ maxWidth: 600 }} onSubmit={createProposal} onClick={e => e.stopPropagation()}><div className="modal-head"><h2>Draft Proposal</h2><button type="button" className="icon-btn" onClick={() => setShowNewModal(false)}>✕</button></div><div className="modal-body stack" style={{ gap: 12 }}>
        <label className="caption">Title<input className="input" required value={proposalTitle} onChange={e => setProposalTitle(e.target.value)} /></label>
        <label className="caption">Opportunity (optional)<select className="input" value={proposalLead} onChange={e => setProposalLead(e.target.value)}><option value="">Unlinked</option>{state.leads.filter(l => l.stage !== 'Lost').map(l => <option key={l.id} value={l.id}>{l.name} · {l.id}</option>)}</select></label>
        <label className="caption">Scope<textarea className="input" required rows={3} value={proposalScope} onChange={e => setProposalScope(e.target.value)} /></label>
        <label className="caption">Exclusions<textarea className="input" required rows={2} value={proposalExclusions} onChange={e => setProposalExclusions(e.target.value)} /></label>
        <label className="caption">Deliverables<textarea className="input" required rows={2} value={proposalDeliverables} onChange={e => setProposalDeliverables(e.target.value)} /></label>
        <label className="caption">Client responsibilities<textarea className="input" required rows={2} value={proposalResponsibilities} onChange={e => setProposalResponsibilities(e.target.value)} /></label>
        <div className="grid2"><label className="caption">Fixed fee<input className="input" type="number" min="0" step="0.01" required value={proposalAmount} onChange={e => setProposalAmount(Number(e.target.value))} /></label><label className="caption">Currency<select className="input" value={proposalCurrency} onChange={e => setProposalCurrency(e.target.value)}><option>QAR</option><option>USD</option><option>EUR</option><option>GBP</option></select></label></div>
        <label className="caption">Terms<textarea className="input" required rows={2} value={proposalTerms} onChange={e => setProposalTerms(e.target.value)} /></label>
      </div><div className="modal-foot"><button type="button" className="btn ghost sm" onClick={() => setShowNewModal(false)}>Cancel</button><button className="btn primary sm" type="submit">Create Draft</button></div></form></div>}
    </div>
  );
};
