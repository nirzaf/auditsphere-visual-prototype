// Module 35: Review Desk & Clearance Workflow (VP-055)
import React, { useState } from 'react';
import { RouteKey, ReviewNoteItem } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';
import { visibleEngagementIds } from '../../services/guards';

interface ReviewDeskViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const ReviewDeskView: React.FC<ReviewDeskViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const selectedEng = state.engagements.find(e => e.id === state.selectedEngagement) || state.engagements[0];

  if (!selectedEng) {
    return (
      <div className="panel panel-pad text-center" style={{ padding: '60px 20px' }}>
        <Icon name="message" size="xl" className="text-muted mb16" />
        <h3>No Active Engagement Selected</h3>
        <p className="sub max-w-md mx-auto mt8">
          Select or create an engagement to inspect reviewer notes and query resolution.
        </p>
        <button className="btn primary sm mt16" onClick={() => onNavigate('engagements')}>
          Go to Engagements
        </button>
      </div>
    );
  }

  const reviews = selectedEng.reviews;

  const [selectedNote, setSelectedNote] = useState<ReviewNoteItem | null>(null);
  const [selectedNoteEngagementId, setSelectedNoteEngagementId] = useState(selectedEng.id);
  const [queueFilter, setQueueFilter] = useState<'engagement' | 'assigned' | 'scoped'>('engagement');
  const [showRaiseModal, setShowRaiseModal] = useState(false);
  const [showRespondModal, setShowRespondModal] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New review point form
  const [targetWp, setTargetWp] = useState('WP-A1');
  const [assignee, setAssignee] = useState('Adam Khan');
  const [queryText, setQueryText] = useState('');

  // Response form
  const [responseText, setResponseText] = useState('');
  const [evidenceDoc, setEvidenceDoc] = useState(state.documents.find(document => document.engagementId === selectedEng?.id)?.id || '');

  const handleRaiseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryText.trim()) return;

    const newNote: ReviewNoteItem = {
      id: `RN-0${reviews.length + 1}`,
      wp: targetWp,
      title: queryText.slice(0, 40),
      body: queryText,
      author: state.currentPerson,
      raisedBy: state.currentPerson,
      assigned: assignee,
      due: '2026-10-15',
      response: '',
      severity: 'Medium',
      version: 1,
      text: queryText,
      status: 'Open',
      history: [
        {
          actor: state.currentPerson,
          action: 'Raised review query',
          time: 'Today · 10:00',
          text: queryText
        }
      ]
    };

    prototypeStore.addReviewNote(selectedEng.id, newNote);
    setShowRaiseModal(false);
    setQueryText('');
  };

  const handleRespondSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNote || !responseText.trim()) return;

    prototypeStore.respondReviewNote(selectedNoteEngagementId, selectedNote.id, responseText, evidenceDoc);
    setShowRespondModal(false);
    setSelectedNote(null);
    setResponseText('');
  };

  const handleClearNote = (engagementId: string, noteId: string) => {
    try {
      prototypeStore.clearReviewNote(engagementId, noteId);
      setNotice({ type: 'success', text: `Review note ${noteId} cleared successfully.` });
      setTimeout(() => setNotice(null), 4000);
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message });
      setTimeout(() => setNotice(null), 6000);
    }
  };

  const allowedEngagementIds = visibleEngagementIds(state);
  const queueRows = state.engagements
    .filter(engagement => allowedEngagementIds === 'ALL' || allowedEngagementIds.includes(engagement.id))
    .flatMap(engagement => engagement.reviews.map(note => ({ engagementId: engagement.id, note })))
    .filter(row => queueFilter === 'scoped' || queueFilter === 'assigned' && (row.note.assignee || row.note.assigned) === state.currentPerson || queueFilter === 'engagement' && row.engagementId === selectedEng.id);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Engagement Review Desk</h1>
          <p>Multi-tiered review queries, evidentiary responses, and independent sign-off gates.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn primary sm" onClick={() => setShowRaiseModal(true)}>
            <Icon name="plus" /> Raise Review Note
          </button>
        </div>
      </div>

      {notice && (
        <div className={`badge ${notice.type === 'error' ? 'danger' : 'success'}`} style={{ padding: '8px 12px', display: 'block', fontSize: 13 }}>
          {notice.text}
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <div className="between" style={{ flexWrap: 'wrap', gap: 12 }}>
            <h3>Review Queue ({queueRows.length})</h3>
            <label className="caption">Queue scope
              <select aria-label="Review queue scope" className="input" value={queueFilter} onChange={e => setQueueFilter(e.target.value as typeof queueFilter)}>
                <option value="engagement">Selected engagement</option>
                <option value="assigned">Assigned to me</option>
                <option value="scoped">All permitted engagements</option>
              </select>
            </label>
          </div>
          <span className="caption">Only notes in your granted engagement scope appear. Responders cannot clear their own query.</span>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Note ID</th>
                <th>Workpaper</th>
                <th>Author</th>
                <th>Assignee</th>
                <th>Review Query</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {queueRows.map(({ engagementId, note: r }) => (
                <tr key={`${engagementId}:${r.id}`}>
                  <td><b>{r.id}</b></td>
                  <td><span className="mono">{engagementId} · {r.wp}</span></td>
                  <td>{r.author}</td>
                  <td><b>{r.assignee}</b></td>
                  <td>
                    <b>{r.text}</b>
                    {r.response && (
                      <div className="cell-sub" style={{ color: 'var(--teal-dark)', marginTop: 4 }}>
                        <strong>{r.status === 'Reopened' ? 'Prior response:' : 'Response:'}</strong> {r.response}
                        {r.responseEvidence && <span> (Evidence: {r.responseEvidence})</span>}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${r.status === 'Cleared' ? 'green' : r.status === 'Responded' ? 'blue' : 'amber'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      {['Open', 'Reopened'].includes(r.status) && (
                        <button
                          className="btn sm"
                          onClick={() => {
                            setSelectedNote(r);
                            setSelectedNoteEngagementId(engagementId);
                            setShowRespondModal(true);
                          }}
                        >
                          Respond
                        </button>
                      )}
                      {r.status === 'Responded' && (
                        <button
                          className="btn sm primary"
                          onClick={() => handleClearNote(engagementId, r.id)}
                        >
                          Clear Note
                        </button>
                      )}
                      {r.status === 'Cleared' && (
                        <span className="caption">Cleared</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Raise Modal */}
      {showRaiseModal && (
        <div className="modal-backdrop" onClick={() => setShowRaiseModal(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Raise Review Point</h2>
              <button className="icon-btn" onClick={() => setShowRaiseModal(false)}>✕</button>
            </div>
            <form onSubmit={handleRaiseSubmit}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div className="grid2">
                  <div>
                    <label className="caption">Target Workpaper</label>
                    <select
                      className="input"
                      value={targetWp}
                      onChange={e => setTargetWp(e.target.value)}
                    >
                      {selectedEng.workpapers.map(w => (
                        <option key={w.id} value={w.id}>{w.id} - {w.title}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="caption">Assigned Preparer</label>
                    <select
                      className="input"
                      value={assignee}
                      onChange={e => setAssignee(e.target.value)}
                    >
                      {state.users.map(u => (
                        <option key={u.id} value={u.name}>{u.name} ({u.label})</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="caption">Review Query Description</label>
                  <textarea
                    className="input"
                    rows={4}
                    placeholder="Specify evidence gap, calculation ambiguity, or required disclosure clarification..."
                    value={queryText}
                    onChange={e => setQueryText(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={() => setShowRaiseModal(false)}>Cancel</button>
                <button type="submit" className="btn primary sm">Raise Query</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Respond Modal */}
      {showRespondModal && selectedNote && (
        <div className="modal-backdrop" onClick={() => setShowRespondModal(false)}>
          <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Respond to {selectedNote.id} ({selectedNote.wp})</h2>
              <button className="icon-btn" onClick={() => setShowRespondModal(false)}>✕</button>
            </div>
            <form onSubmit={handleRespondSubmit}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div className="borderbox" style={{ background: '#f8fafc', padding: 12 }}>
                  <span className="caption">Query Raised by {selectedNote.author}:</span>
                  <div style={{ marginTop: 4, fontWeight: 500 }}>{selectedNote.text}</div>
                </div>
                <div>
                  <label className="caption">Fieldwork Response & Correction Details</label>
                  <textarea
                    className="input"
                    rows={4}
                    placeholder="Describe testing performed, corrective journal proposed, or schedule revised..."
                    value={responseText}
                    onChange={e => setResponseText(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="caption">Linked Supporting Evidence Document</label>
                  <input
                    type="text"
                    className="input"
                    value={evidenceDoc}
                    onChange={e => setEvidenceDoc(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={() => setShowRespondModal(false)}>Cancel</button>
                <button type="submit" className="btn primary sm">Submit Response</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
