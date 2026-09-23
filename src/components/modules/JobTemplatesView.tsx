// Module 06: Job Template Authoring & Instantiation (VP-015)
import React, { useState } from 'react';
import { RouteKey, JobTemplateItem } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';

interface JobTemplatesViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const JobTemplatesView: React.FC<JobTemplatesViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const [selectedTemplate, setSelectedTemplate] = useState<JobTemplateItem | null>(null);
  const [showInstantiateModal, setShowInstantiateModal] = useState(false);

  // Instantiation form
  const [targetEngId, setTargetEngId] = useState(state.selectedEngagement);
  const [jobTitle, setJobTitle] = useState('');
  const [dueDate, setDueDate] = useState('2026-10-15');
  const [owner, setOwner] = useState('Layla Rahman');

  const templates = state.jobTemplates;

  const handleInstantiate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplate) return;

    prototypeStore.applyJobTemplate(
      selectedTemplate.id,
      targetEngId,
      jobTitle || selectedTemplate.defaultJobTitle,
      dueDate,
      owner
    );

    setShowInstantiateModal(false);
    onNavigate('jobs');
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Job Delivery Templates</h1>
          <p>Reusable workflow structures with defined phases and substantive subtasks.</p>
        </div>
      </div>

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
                    <th>Tasks</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map(tpl => (
                    <tr
                      key={tpl.id}
                      className={tpl.id === selectedTemplate?.id ? 'selected-row' : ''}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedTemplate(tpl)}
                    >
                      <td>
                        <b>{tpl.name}</b>
                        <div className="cell-sub">{tpl.id} · Rev {tpl.revision}</div>
                      </td>
                      <td>{tpl.service}</td>
                      <td>
                        <span className={`badge ${tpl.status === 'Published' ? 'green' : 'gray'}`}>
                          {tpl.status}
                        </span>
                      </td>
                      <td>{tpl.tasks.length} main phases</td>
                      <td>
                        <button
                          className="btn sm"
                          onClick={e => {
                            e.stopPropagation();
                            setSelectedTemplate(tpl);
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
                <button
                  className="btn primary sm"
                  onClick={() => {
                    setJobTitle(selectedTemplate.defaultJobTitle);
                    setShowInstantiateModal(true);
                  }}
                >
                  <Icon name="plus" /> Create Job from Template
                </button>
              </div>

              <h4 className="mt20">Predefined Tasks & Subtasks</h4>
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
                    <input
                      type="text"
                      className="input"
                      value={owner}
                      onChange={e => setOwner(e.target.value)}
                      required
                    />
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
    </div>
  );
};
