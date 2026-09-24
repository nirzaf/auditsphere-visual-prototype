// Module 05: Jobs & Tasks Management (VP-013, VP-014)
// Delivery containers with strictly 1 level of subtasks, leaf-task progress, reassignment governance, and job creation.

import React, { useState } from 'react';
import { RouteKey, JobRecord, JobTaskItem, CommentItem } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';
import { visibleEngagementIds, isClientRole, canOpenRoute } from '../../services/guards';

interface JobsTasksViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const JobsTasksView: React.FC<JobsTasksViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const allowedEngagementIds = visibleEngagementIds(state);
  const scopedEngagements = state.engagements.filter(e => allowedEngagementIds === 'ALL' || allowedEngagementIds.includes(e.id));
  const scopedClients = state.clients.filter(c => scopedEngagements.some(e => e.client === c.id));
  const scopedJobs = state.jobs.filter(job => allowedEngagementIds === 'ALL' || allowedEngagementIds.includes(job.engagementId));
  const scopedJobIds = new Set(scopedJobs.map(job => job.id));
  const [selectedJobId, setSelectedJobId] = useState<string>(() => scopedJobs.find(job => job.engagementId === state.selectedEngagement)?.id || scopedJobs[0]?.id || '');
  const [showAddJobModal, setShowAddJobModal] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [taskToReassign, setTaskToReassign] = useState<JobTaskItem | null>(null);
  const [newAssignee, setNewAssignee] = useState('Adam Khan');
  const [reassignReason, setReassignReason] = useState('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New task form state
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [noteMentions, setNoteMentions] = useState<string[]>([]);
  const [parentTaskIdForSubtask, setParentTaskIdForSubtask] = useState<string | undefined>(undefined);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('Adam Khan');

  // New job form state
  const [newJobTitle, setNewJobTitle] = useState('');
  const [newJobClientId, setNewJobClientId] = useState(scopedClients[0]?.id || '');
  const [newJobEngId, setNewJobEngId] = useState(scopedEngagements.find(e => e.id === state.selectedEngagement)?.id || scopedEngagements[0]?.id || '');
  const [newJobOwner, setNewJobOwner] = useState(state.currentPerson || 'Adam Khan');
  const [newJobDueDate, setNewJobDueDate] = useState('2026-10-31');
  const [newJobDescription, setNewJobDescription] = useState('');

  const triggerNotice = (type: 'success' | 'error', text: string) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 6000);
  };

  const selectedJob = scopedJobs.find(j => j.id === selectedJobId) || scopedJobs[0];
  const client = scopedClients.find(c => c.id === selectedJob?.clientId);

  // Filter tasks for selected job
  const jobTasks = state.jobTasks.filter(t => scopedJobIds.has(t.jobId) && t.jobId === selectedJob?.id);
  const parentTasks = jobTasks.filter(t => !t.parentTaskId);
  const jobComments = state.comments.filter(comment => comment.subjectType === 'job' && comment.subjectId === selectedJob?.id && comment.visibility === 'internal');
  const mentionableUsers = state.users.filter(user => { const visible = visibleEngagementIds(state, user.id); return user.status === 'Active' && !isClientRole(user.role) && canOpenRoute(user.role, 'jobs') && selectedJob && (visible === 'ALL' || visible.includes(selectedJob.engagementId)); });

  const handleAddInternalNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJob) return;
    if (editingCommentId) {
      try { prototypeStore.editComment(editingCommentId, noteText); setShowNoteModal(false); setEditingCommentId(null); setNoteText(''); triggerNotice('success', 'Internal note updated.'); }
      catch (error: any) { triggerNotice('error', error.message); }
      return;
    }
    const comment: CommentItem = { id: `CMT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, subjectType: 'job', subjectId: selectedJob.id, author: state.currentPerson, authorRole: state.currentRole, createdAt: new Date().toISOString(), text: noteText.trim(), visibility: 'internal', mentions: noteMentions };
    try { prototypeStore.addComment(comment); setShowNoteModal(false); setNoteText(''); setNoteMentions([]); triggerNotice('success', `Internal note saved${noteMentions.length ? `; ${noteMentions.length} local mention${noteMentions.length === 1 ? '' : 's'} recorded` : ''}.`); }
    catch (error: any) { triggerNotice('error', error.message); }
  };

  // Compute leaf task progress
  const leafTasks = jobTasks.filter(t => {
    return !jobTasks.some(sub => sub.parentTaskId === t.id);
  });
  const completedLeafTasks = leafTasks.filter(t => t.status === 'Completed').length;
  const progressPercent = leafTasks.length ? Math.round((completedLeafTasks / leafTasks.length) * 100) : 0;

  const handleReassignSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskToReassign || !reassignReason.trim()) return;
    try {
      prototypeStore.reassignTask(taskToReassign.id, newAssignee, reassignReason);
      setShowReassignModal(false);
      setTaskToReassign(null);
      setReassignReason('');
      triggerNotice('success', `Task reassigned to ${newAssignee}.`);
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  const handleAddTaskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim() || !selectedJob) return;

    const newTaskId = `TSK-${selectedJob.id}-${Date.now().toString().slice(-4)}`;
    const newTask: JobTaskItem = {
      id: newTaskId,
      jobId: selectedJob.id,
      title: taskTitle.trim(),
      assignee: taskAssignee,
      status: 'Not started',
      order: jobTasks.length + 1,
      parentTaskId: parentTaskIdForSubtask
    };

    try {
      prototypeStore.addTask(newTask);
      setShowAddTaskModal(false);
      setTaskTitle('');
      setParentTaskIdForSubtask(undefined);
      triggerNotice('success', `Task "${newTask.title}" created.`);
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  const handleAddJobSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newJobTitle.trim()) return;

    const newJobId = `JOB-260${state.jobs.length + 1}`;
    const newJob: JobRecord = {
      id: newJobId,
      clientId: newJobClientId,
      engagementId: newJobEngId,
      title: newJobTitle.trim(),
      description: newJobDescription.trim(),
      owner: newJobOwner,
      startDate: new Date().toISOString().split('T')[0],
      dueDate: newJobDueDate,
      status: 'Not started',
      createdAt: new Date().toISOString()
    };

    try {
      prototypeStore.addJob(newJob);
      prototypeStore.addTask({
        id: `TSK-${newJobId}-1`,
        jobId: newJobId,
        title: 'Initial Scoping & Team Briefing',
        assignee: newJobOwner,
        status: 'Not started',
        order: 1
      });
      setSelectedJobId(newJobId);
      setShowAddJobModal(false);
      setNewJobTitle('');
      setNewJobDescription('');
      triggerNotice('success', `Job "${newJob.title}" scheduled (${newJob.id}).`);
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  const handleUpdateTaskStatus = (task: JobTaskItem, completed: boolean) => {
    try {
      prototypeStore.updateTask({
        ...task,
        status: completed ? 'Completed' : 'In progress'
      });
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Jobs & Task Delivery Containers</h1>
          <p>Organize engagement deliverables into tracked jobs with exactly one level of subtasks.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn sm ghost" onClick={() => onNavigate('job-templates')}>
            <Icon name="layers" /> Job Templates
          </button>
          <button className="btn primary sm" onClick={() => setShowAddJobModal(true)}>
            <Icon name="plus" /> New Job
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

      {scopedJobs.length === 0 ? (
        <div className="panel panel-pad text-center" style={{ padding: '60px 20px' }}>
          <Icon name="checkboard" size="xl" className="text-muted mb16" />
          <h3>No Jobs Registered</h3>
          <p className="sub max-w-md mx-auto mt8">
            Create a custom job or instantiate a standard delivery template to begin tracking engagement deliverables.
          </p>
          <div className="row mt16" style={{ justifyContent: 'center', gap: 10 }}>
            <button className="btn primary sm" onClick={() => setShowAddJobModal(true)}>
              <Icon name="plus" /> Create New Job
            </button>
            <button className="btn ghost sm" onClick={() => onNavigate('job-templates')}>
              Browse Templates
            </button>
          </div>
        </div>
      ) : (
        <div className="grid-main">
          {/* Left: Jobs List */}
          <div className="stack" style={{ gap: 16 }}>
            <div className="panel">
              <div className="panel-head">
                <h3>Practice Jobs Register ({scopedJobs.length})</h3>
              </div>
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>Job Title</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scopedJobs.map(job => (
                      <tr
                        key={job.id}
                        className={job.id === selectedJob?.id ? 'selected-row' : ''}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelectedJobId(job.id)}
                      >
                        <td>
                          <b>{job.title}</b>
                          <div className="cell-sub">{job.id} · {job.owner}</div>
                        </td>
                        <td>
                          <span className={`badge ${job.status === 'Completed' ? 'green' : 'amber'}`}>
                            {job.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right: Selected Job Workspace */}
          {selectedJob && (
            <div className="stack" style={{ gap: 16 }}>
              <div className="panel panel-pad">
                <div className="between">
                  <div>
                    <span className="eyebrow">JOB WORKSPACE · {selectedJob.id}</span>
                    <h2>{selectedJob.title}</h2>
                    <p className="sub">{client?.name || selectedJob.clientId} · Due: {selectedJob.dueDate} · Owner: {selectedJob.owner}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className="caption">Leaf Task Progress</span>
                    <div className="progress mt8" style={{ width: 140 }}>
                      <i style={{ width: `${progressPercent}%` }} />
                    </div>
                    <span className="caption">{completedLeafTasks} of {leafTasks.length} leaf tasks ({progressPercent}%)</span>
                  </div>
                </div>

                {/* Task Tree */}
                <div className="between mt20">
                  <h4>Ordered Substantive Tasks</h4>
                  <button
                    className="btn sm primary"
                    onClick={() => {
                      setParentTaskIdForSubtask(undefined);
                      setShowAddTaskModal(true);
                    }}
                  >
                    <Icon name="plus" /> Add Main Task
                  </button>
                </div>

                <div className="stack mt12" style={{ gap: 10 }}>
                  {parentTasks.length === 0 ? (
                    <p className="sub">No tasks defined for this job yet.</p>
                  ) : (
                    parentTasks.map(parent => {
                      const subtasks = jobTasks.filter(t => t.parentTaskId === parent.id);
                      return (
                        <div key={parent.id} className="borderbox" style={{ padding: 12 }}>
                          <div className="between">
                            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                              <input
                                type="checkbox"
                                checked={parent.status === 'Completed'}
                                onChange={e => handleUpdateTaskStatus(parent, e.target.checked)}
                              />
                              <div>
                                <b style={{ textDecoration: parent.status === 'Completed' ? 'line-through' : 'none' }}>
                                  {parent.title}
                                </b>
                                <div className="cell-sub">
                                  Assigned: {parent.assignee} · Status: {parent.status}
                                </div>
                              </div>
                            </div>
                            <div className="row" style={{ gap: 6 }}>
                              <button
                                className="btn sm ghost"
                                onClick={() => {
                                  setTaskToReassign(parent);
                                  setShowReassignModal(true);
                                }}
                              >
                                Reassign
                              </button>
                              <button
                                className="btn sm ghost"
                                onClick={() => {
                                  setParentTaskIdForSubtask(parent.id);
                                  setShowAddTaskModal(true);
                                }}
                              >
                                + Subtask
                              </button>
                            </div>
                          </div>

                          {/* Exactly One Level of Subtasks */}
                          {subtasks.length > 0 && (
                            <div className="stack mt12" style={{ gap: 6, paddingLeft: 24, borderLeft: '2px solid var(--border)' }}>
                              {subtasks.map(sub => (
                                <div key={sub.id} className="between" style={{ padding: '6px 0' }}>
                                  <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                                    <input
                                      type="checkbox"
                                      checked={sub.status === 'Completed'}
                                      onChange={e => handleUpdateTaskStatus(sub, e.target.checked)}
                                    />
                                    <div>
                                      <span style={{ fontSize: 13, textDecoration: sub.status === 'Completed' ? 'line-through' : 'none' }}>
                                        {sub.title}
                                      </span>
                                      <div className="cell-sub">{sub.assignee}</div>
                                    </div>
                                  </div>
                                  <button
                                    className="btn sm ghost"
                                    onClick={() => {
                                      setTaskToReassign(sub);
                                      setShowReassignModal(true);
                                    }}
                                  >
                                    Reassign
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="divider mt20" />
                <div className="between"><div><h4>Internal Job Notes</h4><p className="caption">Visible to authorized staff only · mentions create local notices only</p></div><button className="btn sm ghost" onClick={() => setShowNoteModal(true)}>Add Internal Note</button></div>
                {jobComments.length === 0 ? <p className="sub mt8">No internal notes on this job.</p> : <div className="stack mt12">{jobComments.map(comment => <div className="borderbox" style={{ padding: 12 }} key={comment.id}><div className="between"><p style={{ whiteSpace: 'pre-wrap' }}>{comment.text}</p>{comment.author === state.currentPerson && <button className="btn sm ghost" onClick={() => { setNoteText(comment.text); setEditingCommentId(comment.id); setShowNoteModal(true); }}>Edit</button>}</div><div className="cell-sub mt8">{comment.author} · {new Date(comment.createdAt).toLocaleString()}{comment.edited ? ` · Edited by ${comment.editedBy} at ${new Date(comment.editedAt!).toLocaleString()}` : ''} · {comment.mentions?.map(id => mentionableUsers.find(user => user.id === id)?.name || id).join(', ')}</div></div>)}</div>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* New Job Modal */}
      {showAddJobModal && (
        <div className="modal-backdrop" onClick={() => setShowAddJobModal(false)}>
          <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Schedule New Job</h2>
              <button className="icon-btn" onClick={() => setShowAddJobModal(false)}>✕</button>
            </div>
            <form onSubmit={handleAddJobSubmit}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div>
                  <label className="caption">Job Title</label>
                  <input
                    type="text"
                    className="input"
                    value={newJobTitle}
                    onChange={e => setNewJobTitle(e.target.value)}
                    placeholder="e.g. Interim Inventory Testing & Count Verification"
                    required
                  />
                </div>
                <div className="grid2">
                  <div>
                    <label className="caption">Target Client</label>
                    <select
                      className="input"
                      value={newJobClientId}
                      onChange={e => {
                        setNewJobClientId(e.target.value);
                        const firstEng = scopedEngagements.find(en => en.client === e.target.value);
                        if (firstEng) setNewJobEngId(firstEng.id);
                      }}
                    >
                      {scopedClients.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="caption">Target Engagement</label>
                    <select
                      className="input"
                      value={newJobEngId}
                      onChange={e => setNewJobEngId(e.target.value)}
                    >
                      {scopedEngagements
                        .filter(en => !newJobClientId || en.client === newJobClientId)
                        .map(en => (
                          <option key={en.id} value={en.id}>{en.id} ({en.service})</option>
                        ))}
                    </select>
                  </div>
                </div>
                <div className="grid2">
                  <div>
                    <label className="caption">Due Date</label>
                    <input
                      type="date"
                      className="input"
                      value={newJobDueDate}
                      onChange={e => setNewJobDueDate(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="caption">Job Owner</label>
                    <select
                      className="input"
                      value={newJobOwner}
                      onChange={e => setNewJobOwner(e.target.value)}
                    >
                      {state.users.map(u => (
                        <option key={u.id} value={u.name}>{u.name} ({u.label})</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="caption">Description &amp; Deliverable Scope</label>
                  <textarea
                    className="input"
                    rows={2}
                    value={newJobDescription}
                    onChange={e => setNewJobDescription(e.target.value)}
                    placeholder="Define substantive testing scope, required artifacts, and timeline..."
                  />
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={() => setShowAddJobModal(false)}>Cancel</button>
                <button type="submit" className="btn primary sm">Create Job</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reassign Modal */}
      {showReassignModal && taskToReassign && (
        <div className="modal-backdrop" onClick={() => setShowReassignModal(false)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Reassign Task: {taskToReassign.title}</h2>
              <button className="icon-btn" onClick={() => setShowReassignModal(false)}>✕</button>
            </div>
            <form onSubmit={handleReassignSubmit}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div>
                  <label className="caption">Current Assignee</label>
                  <div><b>{taskToReassign.assignee}</b></div>
                </div>
                <div>
                  <label className="caption">New Qualified Assignee</label>
                  <select
                    className="input"
                    value={newAssignee}
                    onChange={e => setNewAssignee(e.target.value)}
                  >
                    {state.users.map(u => (
                      <option key={u.id} value={u.name}>{u.name} ({u.label})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="caption">Reassignment Reason (Mandatory Governance)</label>
                  <textarea
                    className="input"
                    rows={3}
                    placeholder="Document capacity, scheduling or qualification rationale..."
                    value={reassignReason}
                    onChange={e => setReassignReason(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={() => setShowReassignModal(false)}>Cancel</button>
                <button type="submit" className="btn primary sm">Confirm Reassignment</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Task Modal */}
      {showAddTaskModal && (
        <div className="modal-backdrop" onClick={() => setShowAddTaskModal(false)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>{parentTaskIdForSubtask ? 'Add Subtask (1 Level)' : 'Add Main Task'}</h2>
              <button className="icon-btn" onClick={() => setShowAddTaskModal(false)}>✕</button>
            </div>
            <form onSubmit={handleAddTaskSubmit}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div>
                  <label className="caption">Task Description</label>
                  <input
                    type="text"
                    className="input"
                    value={taskTitle}
                    onChange={e => setTaskTitle(e.target.value)}
                    placeholder="e.g. Inspect purchase orders over QAR 25,000"
                    required
                  />
                </div>
                <div>
                  <label className="caption">Assignee</label>
                  <select
                    className="input"
                    value={taskAssignee}
                    onChange={e => setTaskAssignee(e.target.value)}
                  >
                    {state.users.map(u => (
                      <option key={u.id} value={u.name}>{u.name} ({u.label})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={() => setShowAddTaskModal(false)}>Cancel</button>
                <button type="submit" className="btn primary sm">Create Task</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showNoteModal && selectedJob && <div className="modal-backdrop" onClick={() => { setShowNoteModal(false); setEditingCommentId(null); }}><form className="modal" style={{ maxWidth: 500 }} onSubmit={handleAddInternalNote} onClick={e => e.stopPropagation()}><div className="modal-head"><h2>{editingCommentId ? 'Edit Internal Job Note' : 'Add Internal Job Note'}</h2><button type="button" className="icon-btn" onClick={() => { setShowNoteModal(false); setEditingCommentId(null); }}>✕</button></div><div className="modal-body stack" style={{ gap: 12 }}><label className="caption">Note (5,000 characters maximum)<textarea className="input" rows={4} maxLength={5000} required value={noteText} onChange={e => setNoteText(e.target.value)} /></label>{!editingCommentId && <><label className="caption">Mention authorized colleagues<select className="input" multiple value={noteMentions} onChange={e => setNoteMentions(Array.from(e.target.selectedOptions, option => option.value))}>{mentionableUsers.filter(user => user.id !== state.currentUserId).map(user => <option key={user.id} value={user.id}>{user.name} · {user.label}</option>)}</select></label><p className="caption">Mentions are local notices only. They do not grant access or send email.</p></>}</div><div className="modal-foot"><button type="button" className="btn ghost sm" onClick={() => { setShowNoteModal(false); setEditingCommentId(null); }}>Cancel</button><button className="btn primary sm" type="submit">{editingCommentId ? 'Save Note Changes' : 'Save Internal Note'}</button></div></form></div>}
    </div>
  );
};
