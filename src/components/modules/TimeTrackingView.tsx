// Module 12: Staff Time Tracking & Review (VP-028)
import React, { useState } from 'react';
import { RouteKey, TimeEntryItem } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';
import { formatMinutesToHours } from '../../services/calculations';

interface TimeTrackingViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const TimeTrackingView: React.FC<TimeTrackingViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [entryToReturn, setEntryToReturn] = useState<TimeEntryItem | null>(null);
  const [returnReason, setReturnReason] = useState('');

  // New time entry form
  const [person, setPerson] = useState(state.currentPerson);
  const [taskTitle, setTaskTitle] = useState('Substantive testing of cash and bank');
  const [minutes, setMinutes] = useState(120);
  const [activity, setActivity] = useState('Audit fieldwork');
  const [narrative, setNarrative] = useState('');
  const [billable, setBillable] = useState(true);

  const times = state.times;

  const handleAddTime = (e: React.FormEvent) => {
    e.preventDefault();

    const newEntry: TimeEntryItem = {
      id: `TIME-00${times.length + 1}`,
      person,
      clientId: state.engagements[0]?.client || 'CL-001',
      engagementId: state.selectedEngagement,
      taskTitle,
      date: new Date().toISOString().split('T')[0],
      durationMinutes: minutes,
      billable,
      activity,
      narrative,
      status: 'Submitted'
    };

    prototypeStore.addTimeEntry(newEntry);
    setShowAddModal(false);
    setNarrative('');
  };

  const handleApprove = (entry: TimeEntryItem) => {
    try {
      prototypeStore.reviewTimeEntry(entry.id, 'Approved');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleReturnSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!entryToReturn || !returnReason.trim()) return;

    prototypeStore.reviewTimeEntry(entryToReturn.id, 'Returned', returnReason);
    setShowReturnModal(false);
    setEntryToReturn(null);
    setReturnReason('');
  };

  const totalMinutes = times.reduce((s, t) => s + t.durationMinutes, 0);
  const approvedMinutes = times.reduce((s, t) => s + (t.status === 'Approved' ? t.durationMinutes : 0), 0);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Time Tracking & Attendance</h1>
          <p>Record minute-level activity, enforce separation of duties, and manage timesheet approval.</p>
        </div>
        <button className="btn primary sm" onClick={() => setShowAddModal(true)}>
          <Icon name="plus" /> Record Time Entry
        </button>
      </div>

      <div className="metric-grid">
        <div className="metric">
          <span className="metric-label">Total Time Recorded</span>
          <div className="metric-val">{totalMinutes} min</div>
          <span className="metric-sub">{formatMinutesToHours(totalMinutes)}</span>
        </div>
        <div className="metric green">
          <span className="metric-label">Approved Time</span>
          <div className="metric-val">{approvedMinutes} min</div>
          <span className="metric-sub">{formatMinutesToHours(approvedMinutes)}</span>
        </div>
        <div className="metric amber">
          <span className="metric-label">Pending Review</span>
          <div className="metric-val">{times.filter(t => t.status === 'Submitted').length}</div>
          <span className="metric-sub">Awaiting manager sign-off</span>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Practice Timesheet Register ({times.length})</h3>
          <span className="caption">Separation of duties: Reviewer cannot approve own entries</span>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Staff Person</th>
                <th>Task / Narrative</th>
                <th>Activity</th>
                <th>Duration</th>
                <th>Billable</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {times.map(t => (
                <tr key={t.id}>
                  <td>{t.date}</td>
                  <td><b>{t.person}</b></td>
                  <td>
                    <b>{t.taskTitle}</b>
                    {t.narrative && <div className="cell-sub">{t.narrative}</div>}
                    {t.returnReason && <div className="cell-sub" style={{ color: 'red' }}>Returned: {t.returnReason}</div>}
                  </td>
                  <td>{t.activity}</td>
                  <td>
                    <b>{t.durationMinutes} min</b>
                    <div className="cell-sub">{formatMinutesToHours(t.durationMinutes)}</div>
                  </td>
                  <td>
                    <span className={`tag ${t.billable ? 'blue' : 'gray'}`}>
                      {t.billable ? 'Billable' : 'Non-billable'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${t.status === 'Approved' ? 'green' : t.status === 'Returned' ? 'red' : 'amber'}`}>
                      {t.status}
                    </span>
                  </td>
                  <td>
                    {t.status === 'Submitted' && (
                      <div className="row" style={{ gap: 6 }}>
                        <button
                          className="btn sm"
                          onClick={() => handleApprove(t)}
                        >
                          Approve
                        </button>
                        <button
                          className="btn sm ghost"
                          onClick={() => {
                            setEntryToReturn(t);
                            setShowReturnModal(true);
                          }}
                        >
                          Return
                        </button>
                      </div>
                    )}
                    {t.status === 'Approved' && (
                      <span className="caption">By {t.reviewedBy}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Time Modal */}
      {showAddModal && (
        <div className="modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Record Time Entry</h2>
              <button className="icon-btn" onClick={() => setShowAddModal(false)}>✕</button>
            </div>
            <form onSubmit={handleAddTime}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div className="grid2">
                  <div>
                    <label className="caption">Staff Member</label>
                    <select
                      className="input"
                      value={person}
                      onChange={e => setPerson(e.target.value)}
                    >
                      {state.users.map(u => (
                        <option key={u.id} value={u.name}>{u.name} ({u.label})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="caption">Duration (Minutes)</label>
                    <input
                      type="number"
                      step={15}
                      className="input"
                      value={minutes}
                      onChange={e => setMinutes(Number(e.target.value))}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="caption">Activity Type</label>
                  <select
                    className="input"
                    value={activity}
                    onChange={e => setActivity(e.target.value)}
                  >
                    <option value="Audit fieldwork">Audit fieldwork</option>
                    <option value="Quality review">Quality review</option>
                    <option value="Management">Management & Supervision</option>
                    <option value="Client liaison">Client liaison</option>
                  </select>
                </div>
                <div>
                  <label className="caption">Task Title</label>
                  <input
                    type="text"
                    className="input"
                    value={taskTitle}
                    onChange={e => setTaskTitle(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="caption">Work Narrative & Findings</label>
                  <textarea
                    className="input"
                    rows={3}
                    placeholder="Describe specific testing performed, workpaper references, or queries raised..."
                    value={narrative}
                    onChange={e => setNarrative(e.target.value)}
                  />
                </div>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={billable}
                    onChange={e => setBillable(e.target.checked)}
                  />
                  <span>Billable client time</span>
                </label>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn primary sm">Submit Time Entry</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Return Time Modal */}
      {showReturnModal && entryToReturn && (
        <div className="modal-backdrop" onClick={() => setShowReturnModal(false)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Return Time Entry</h2>
              <button className="icon-btn" onClick={() => setShowReturnModal(false)}>✕</button>
            </div>
            <form onSubmit={handleReturnSubmit}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div>
                  <label className="caption">Entry</label>
                  <div><b>{entryToReturn.person}: {entryToReturn.taskTitle} ({entryToReturn.durationMinutes} min)</b></div>
                </div>
                <div>
                  <label className="caption">Reason for Return (Required)</label>
                  <textarea
                    className="input"
                    rows={3}
                    placeholder="Specify why this entry needs correction or clarification..."
                    value={returnReason}
                    onChange={e => setReturnReason(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={() => setShowReturnModal(false)}>Cancel</button>
                <button type="submit" className="btn primary sm">Return Entry</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
