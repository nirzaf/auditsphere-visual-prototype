// Module 05: Jobs & Tasks Management (VP-013, VP-014)
import React, { useState } from 'react';
import { RouteKey, JobRecord, JobTaskItem } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';

interface JobsTasksViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const JobsTasksView: React.FC<JobsTasksViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const [selectedJobId, setSelectedJobId] = useState<string>(state.jobs[0]?.id || '');
  const [showAddJobModal, setShowAddJobModal] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [taskToReassign, setTaskToReassign] = useState<JobTaskItem | null>(null);
  const [newAssignee, setNewAssignee] = useState('Adam Khan');
  const [reassignReason, setReassignReason] = useState('');

  // New task form state
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [parentTaskIdForSubtask, setParentTaskIdForSubtask] = useState<string | undefined>(undefined);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('Adam Khan');

  const selectedJob = state.jobs.find(j => j.id === selectedJobId) || state.jobs[0];
  const client = state.clients.find(c => c.id === selectedJob?.clientId);

  // Filter tasks for selected job
  const jobTasks = state.jobTasks.filter(t => t.jobId === selectedJob?.id);
  const parentTasks = jobTasks.filter(t => !t.parentTaskId);

  // Compute leaf task progress
  const leafTasks = jobTasks.filter(t => {
    // A task is a leaf if no other task has it as parentTaskId
    return !jobTasks.some(sub => sub.parentTaskId === t.id);
  });
  const completedLeafTasks = leafTasks.filter(t => t.status === 'Completed').length;
  const progressPercent = leafTasks.length ? Math.round((completedLeafTasks / leafTasks.length) * 100) : 0;

  const handleReassignSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskToReassign || !reassignReason.trim()) return;
    prototypeStore.reassignTask(taskToReassign.id, newAssignee, reassignReason);
    setShowReassignModal(false);
    setTaskToReassign(null);
    setReassignReason('');
  };

  const handleAddTaskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim() || !selectedJob) return;

    const newTaskId = `TSK-${selectedJob.id}-${Date.now().toString().slice(-4)}`;
    const newTask: JobTaskItem = {
      id: newTaskId,
      jobId: selectedJob.id,
      title: taskTitle,
      assignee: taskAssignee,
      status: 'Not started',
      order: jobTasks.length + 1,
      parentTaskId: parentTaskIdForSubtask
    };

    prototypeStore.addTask(newTask);
    setShowAddTaskModal(false);
    setTaskTitle('');
    setParentTaskIdForSubtask(undefined);
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

      <div className="grid-main">
        {/* Left: Jobs List */}
        <div className="stack" style={{ gap: 16 }}>
          <div className="panel">
            <div className="panel-head">
              <h3>Practice Jobs Register ({state.jobs.length})</h3>
            </div>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Job Title</th>
                    <th>Status</th>
                    <th>Due</th>
                  </tr>
                </thead>
                <tbody>
                  {state.jobs.map(job => (
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
                        <span className={`badge ${job.status === 'Completed' ? 'green' : 'blue'}`}>
                          {job.status}
                        </span>
                      </td>
                      <td>{job.dueDate}</td>
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
                  <p className="sub">{client?.name} · Due: {selectedJob.dueDate} · Owner: {selectedJob.owner}</p>
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
                {parentTasks.map(parent => {
                  const subtasks = jobTasks.filter(t => t.parentTaskId === parent.id);
                  return (
                    <div key={parent.id} className="borderbox" style={{ padding: 12 }}>
                      <div className="between">
                        <div className="row" style={{ gap: 10 }}>
                          <input
                            type="checkbox"
                            checked={parent.status === 'Completed'}
                            onChange={e => {
                              prototypeStore.updateTask({
                                ...parent,
                                status: e.target.checked ? 'Completed' : 'In progress'
                              });
                            }}
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
                              <div className="row" style={{ gap: 8 }}>
                                <input
                                  type="checkbox"
                                  checked={sub.status === 'Completed'}
                                  onChange={e => {
                                    prototypeStore.updateTask({
                                      ...sub,
                                      status: e.target.checked ? 'Completed' : 'In progress'
                                    });
                                  }}
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
                })}
              </div>
            </div>
          </div>
        )}
      </div>

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
    </div>
  );
};
