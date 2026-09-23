// Module 06: Job Template Authoring & Instantiation (VP-015)
// Reusable template authoring, lifecycle gates (Draft -> Published -> Retired), and instantiation.

import React, { useState } from 'react';
import { RouteKey, JobTemplateItem } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';

interface JobTemplatesViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const JobTemplatesView: React.FC<JobTemplatesViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(state.jobTemplates[0]?.id || '');
  const [showInstantiateModal, setShowInstantiateModal] = useState(false);
  const [showNewTemplateModal, setShowNewTemplateModal] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Instantiation form
  const [targetEngId, setTargetEngId] = useState(state.selectedEngagement);
  const [jobTitle, setJobTitle] = useState('');
  const [dueDate, setDueDate] = useState('2026-10-15');
  const [owner, setOwner] = useState('Layla Rahman');

  // New Template form
  const [newTplName, setNewTplName] = useState('');
  const [newTplService, setNewTplService] = useState('External Statutory Audit');
  const [newTplDescription, setNewTplDescription] = useState('');
  const [newTplDefaultJobTitle, setNewTplDefaultJobTitle] = useState('');
  const [newTplTasksText, setNewTplTasksText] = useState('Planning & Risk Assessment\nSubstantive Fieldwork Procedures\nReporting & Final Deliverables');

  const triggerNotice = (type: 'success' | 'error', text: string) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 6000);
  };

  const templates = state.jobTemplates;
  const selectedTemplate = templates.find(t => t.id === selectedTemplateId) || templates[0];

  const handleInstantiate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplate) return;

    try {
      prototypeStore.applyJobTemplate(
        selectedTemplate.id,
        targetEngId,
        jobTitle || selectedTemplate.defaultJobTitle,
        dueDate,
        owner
      );
      setShowInstantiateModal(false);
      onNavigate('jobs');
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  const handlePublishTemplate = (tplId: string) => {
    try {
      prototypeStore.publishJobTemplate(tplId);
      triggerNotice('success', 'Template published successfully. It is now eligible for job instantiation.');
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  const handleRetireTemplate = (tplId: string) => {
    try {
      prototypeStore.retireJobTemplate(tplId);
      triggerNotice('success', 'Template retired. Existing jobs remain unaffected, but new instantiation is blocked.');
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  const handleCreateTemplateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTplName.trim()) return;

    const taskLines = newTplTasksText
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    const newTemplateId = `TPL-00${templates.length + 1}`;
    const newTemplate: JobTemplateItem = {
      id: newTemplateId,
      name: newTplName.trim(),
      service: newTplService,
      description: newTplDescription.trim() || 'Custom practice workflow template.',
      defaultJobTitle: newTplDefaultJobTitle.trim() || newTplName.trim(),
      status: 'Draft',
      revision: 1,
      tasks: taskLines.map(t => ({
        title: t,
        roleSuggestion: 'Engagement Associate',
        subtasks: ['Review prior documentation', 'Perform detailed substantive test', 'Assemble working paper evidence']
      }))
    };

    try {
      prototypeStore.addJobTemplate(newTemplate);
      setSelectedTemplateId(newTemplateId);
      setShowNewTemplateModal(false);
      setNewTplName('');
      setNewTplDescription('');
      setNewTplDefaultJobTitle('');
      triggerNotice('success', `Draft template "${newTemplate.name}" authored (${newTemplate.id}). Publish it when ready.`);
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Job Delivery Templates</h1>
          <p>Reusable workflow structures with defined phases and substantive subtasks.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn primary sm" onClick={() => setShowNewTemplateModal(true)}>
            <Icon name="plus" /> Author New Template
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

      <div className="grid-main">
        {/* Template List */}
        <div className="stack" style={{ gap: 16 }}>
          <div className="panel">
            <div className="panel-head">
              <h3>Available Job Templates ({templates.length})</h3>
            </div>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Template Name</th>
                    <th>Service</th>
                    <th>Status</th>
                    <th>Phases</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map(tpl => (
                    <tr
                      key={tpl.id}
                      className={tpl.id === selectedTemplate?.id ? 'selected-row' : ''}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedTemplateId(tpl.id)}
                    >
                      <td>
                        <b>{tpl.name}</b>
                        <div className="cell-sub">{tpl.id} · Rev {tpl.revision}</div>
                      </td>
                      <td>{tpl.service}</td>
                      <td>
                        <span
                          className={`badge ${
                            tpl.status === 'Published'
                              ? 'green'
                              : tpl.status === 'Retired'
                              ? 'red'
                              : 'amber'
                          }`}
                        >
                          {tpl.status}
                        </span>
                      </td>
                      <td>{tpl.tasks.length} phases</td>
                      <td>
                        <button
                          className="btn sm"
                          disabled={tpl.status !== 'Published'}
                          title={tpl.status !== 'Published' ? 'Only Published templates can be instantiated' : 'Instantiate job'}
                          onClick={e => {
                            e.stopPropagation();
                            if (tpl.status !== 'Published') {
                              triggerNotice('error', 'Only Published templates can be instantiated (VP-015).');
                              return;
                            }
                            setSelectedTemplateId(tpl.id);
                            setJobTitle(tpl.defaultJobTitle);
                            setShowInstantiateModal(true);
                          }}
                        >
                          Use Template
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Selected Template Details */}
        {selectedTemplate && (
          <div className="stack" style={{ gap: 16 }}>
            <div className="panel panel-pad">
              <div className="between">
                <div>
                  <span className="eyebrow">TEMPLATE STRUCTURE · {selectedTemplate.id}</span>
                  <h2>{selectedTemplate.name}</h2>
                  <p className="sub">{selectedTemplate.description}</p>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  {selectedTemplate.status === 'Draft' && (
                    <button
                      className="btn sm primary"
                      onClick={() => handlePublishTemplate(selectedTemplate.id)}
                    >
                      Publish Template
                    </button>
                  )}
                  {selectedTemplate.status === 'Published' && (
                    <>
                      <button
                        className="btn primary sm"
                        onClick={() => {
                          setJobTitle(selectedTemplate.defaultJobTitle);
                          setShowInstantiateModal(true);
                        }}
                      >
                        <Icon name="plus" /> Create Job from Template
                      </button>
                      <button
                        className="btn sm ghost"
                        onClick={() => handleRetireTemplate(selectedTemplate.id)}
                      >
                        Retire Template
                      </button>
                    </>
                  )}
                  {selectedTemplate.status === 'Retired' && (
                    <span className="tag red">Retired — No new jobs</span>
                  )}
                </div>
              </div>

              {selectedTemplate.status !== 'Published' && (
                <div className="borderbox mt12" style={{ background: '#fffbeb', padding: 10, borderColor: '#fde68a' }}>
                  <span className="caption" style={{ color: '#92400e' }}>
                    <strong>Governance notice:</strong> This template is currently in '{selectedTemplate.status}' status. Only published templates can be instantiated to create engagement jobs.
                  </span>
                </div>
              )}

              <h4 className="mt20">Predefined Tasks &amp; Subtasks</h4>
              <div className="stack mt12" style={{ gap: 10 }}>
                {selectedTemplate.tasks.map((task, idx) => (
                  <div key={idx} className="borderbox" style={{ padding: 12 }}>
                    <b>{task.title}</b>
                    <span className="cell-sub" style={{ marginLeft: 8 }}>
                      (Suggested: {task.roleSuggestion})
                    </span>
                    {task.subtasks && task.subtasks.length > 0 && (
                      <ul style={{ margin: '8px 0 0 20px', fontSize: 13, color: '#4a6265' }}>
                        {task.subtasks.map((sub, sIdx) => (
                          <li key={sIdx}>{sub}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Instantiate Modal */}
      {showInstantiateModal && selectedTemplate && (
        <div className="modal-backdrop" onClick={() => setShowInstantiateModal(false)}>
          <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Create Job from "{selectedTemplate.name}"</h2>
              <button className="icon-btn" onClick={() => setShowInstantiateModal(false)}>✕</button>
            </div>
            <form onSubmit={handleInstantiate}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div>
                  <label className="caption">Target Engagement</label>
                  <select
                    className="input"
                    value={targetEngId}
                    onChange={e => setTargetEngId(e.target.value)}
                  >
                    {state.engagements.map(eng => {
                      const c = state.clients.find(x => x.id === eng.client);
                      return (
                        <option key={eng.id} value={eng.id}>
                          {c?.name} · {eng.id} ({eng.service})
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div>
                  <label className="caption">Job Title</label>
                  <input
                    type="text"
                    className="input"
                    value={jobTitle}
                    onChange={e => setJobTitle(e.target.value)}
                    required
                  />
                </div>
                <div className="grid2">
                  <div>
                    <label className="caption">Target Delivery Date</label>
                    <input
                      type="date"
                      className="input"
                      value={dueDate}
                      onChange={e => setDueDate(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="caption">Accountable Owner</label>
                    <select
                      className="input"
                      value={owner}
                      onChange={e => setOwner(e.target.value)}
                    >
                      {state.users.map(u => (
                        <option key={u.id} value={u.name}>{u.name} ({u.label})</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={() => setShowInstantiateModal(false)}>Cancel</button>
                <button type="submit" className="btn primary sm">Instantiate Job</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Author New Template Modal */}
      {showNewTemplateModal && (
        <div className="modal-backdrop" onClick={() => setShowNewTemplateModal(false)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Author New Job Template</h2>
              <button className="icon-btn" onClick={() => setShowNewTemplateModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateTemplateSubmit}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div>
                  <label className="caption">Template Name</label>
                  <input
                    type="text"
                    className="input"
                    value={newTplName}
                    onChange={e => setNewTplName(e.target.value)}
                    placeholder="e.g. Statutory Audit — Mid-tier Manufacturing"
                    required
                  />
                </div>
                <div className="grid2">
                  <div>
                    <label className="caption">Practice Service Line</label>
                    <select
                      className="input"
                      value={newTplService}
                      onChange={e => setNewTplService(e.target.value)}
                    >
                      <option value="External Statutory Audit">External Statutory Audit</option>
                      <option value="Internal Audit Review">Internal Audit Review</option>
                      <option value="Accounting & Financial Statement Compilation">Accounting Compilation</option>
                      <option value="Agreed-Upon Procedures (AUP)">Agreed-Upon Procedures (AUP)</option>
                    </select>
                  </div>
                  <div>
                    <label className="caption">Default Job Title</label>
                    <input
                      type="text"
                      className="input"
                      value={newTplDefaultJobTitle}
                      onChange={e => setNewTplDefaultJobTitle(e.target.value)}
                      placeholder="e.g. FY2026 Financial Audit"
                    />
                  </div>
                </div>
                <div>
                  <label className="caption">Template Description</label>
                  <textarea
                    className="input"
                    rows={2}
                    value={newTplDescription}
                    onChange={e => setNewTplDescription(e.target.value)}
                    placeholder="Describe the methodology, standard phases, and applicability..."
                  />
                </div>
                <div>
                  <label className="caption">Standard Phases (One per line)</label>
                  <textarea
                    className="input mono"
                    rows={4}
                    value={newTplTasksText}
                    onChange={e => setNewTplTasksText(e.target.value)}
                    placeholder="Phase 1&#10;Phase 2&#10;Phase 3"
                    required
                  />
                  <span className="caption" style={{ color: 'var(--muted)', display: 'block', marginTop: 4 }}>
                    New templates are saved in Draft status and must be published prior to job instantiation.
                  </span>
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={() => setShowNewTemplateModal(false)}>Cancel</button>
                <button type="submit" className="btn primary sm">Create Draft Template</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
