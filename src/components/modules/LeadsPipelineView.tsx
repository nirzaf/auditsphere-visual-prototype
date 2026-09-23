// Module 03: Leads & Opportunities Pipeline (VP-009)
import React, { useState } from 'react';
import { RouteKey, LeadOpportunity } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';
import { formatCurrency } from '../../services/calculations';

interface LeadsPipelineViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const LeadsPipelineView: React.FC<LeadsPipelineViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState<LeadOpportunity | null>(null);

  // New lead form
  const [leadName, setLeadName] = useState('');
  const [contact, setContact] = useState('');
  const [service, setService] = useState('External audit');
  const [value, setValue] = useState(1000000);
  const [stage, setStage] = useState<LeadOpportunity['stage']>('Inquiry');

  const stages: Array<LeadOpportunity['stage']> = ['Inquiry', 'Discovery', 'Evaluation', 'Proposal', 'Won', 'Lost'];

  const handleAddLead = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadName.trim()) return;

    const newLead: LeadOpportunity = {
      id: `LD-00${state.leads.length + 1}`,
      name: leadName,
      contact: contact || 'Contact Person',
      service,
      value,
      currency: 'QAR',
      stage,
      owner: state.currentPerson,
      accepted: false,
      terms: false
    };

    prototypeStore.addLead(newLead);
    setShowAddModal(false);
    setLeadName('');
    setContact('');
  };

  const handleConvert = (leadId: string) => {
    prototypeStore.convertLead(leadId);
    setSelectedLead(null);
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Acquisition & Commercial Pipeline</h1>
          <p>Qualify commercial opportunities without confusing inquiry with professional acceptance.</p>
        </div>
        <button className="btn primary sm" onClick={() => setShowAddModal(true)}>
          <Icon name="plus" /> New Inquiry
        </button>
      </div>

      {/* Metrics */}
      <div className="metric-grid">
        <div className="metric">
          <span className="metric-label">Open Opportunities</span>
          <div className="metric-val">{state.leads.filter(l => l.stage !== 'Won' && l.stage !== 'Lost').length}</div>
          <span className="metric-sub">Commercial prospect pipeline</span>
        </div>
        <div className="metric purple">
          <span className="metric-label">Proposed Fees Pipeline</span>
          <div className="metric-val">
            {formatCurrency(state.leads.filter(l => l.stage !== 'Won' && l.stage !== 'Lost').reduce((s, l) => s + l.value, 0))}
          </div>
          <span className="metric-sub">Commercial value, unbilled</span>
        </div>
        <div className="metric blue">
          <span className="metric-label">Converted / Won</span>
          <div className="metric-val">{state.leads.filter(l => l.stage === 'Won').length}</div>
          <span className="metric-sub">Ready for engagement onboarding</span>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="kanban">
        {stages.filter(s => s !== 'Lost').map((col, idx) => {
          const colLeads = state.leads.filter(l => l.stage === col);
          return (
            <div key={col} className="kanban-col">
              <div className="kanban-title">
                <span>{col}</span>
                <span className="tag gray">{colLeads.length}</span>
              </div>
              {colLeads.map(l => (
                <div
                  key={l.id}
                  className="lead-card"
                  onClick={() => setSelectedLead(l)}
                  style={{ cursor: 'pointer' }}
                >
                  <span className={`badge ${idx % 2 ? 'purple' : 'teal'}`}>{l.service}</span>
                  <h3 className="mt8">{l.name}</h3>
                  <p className="cell-sub">{l.contact} · {l.id}</p>
                  <div className="value mt8">{formatCurrency(l.value, l.currency)}</div>
                  <div className="between mt12">
                    <span className="caption">{l.accepted ? 'Accepted' : 'Pending'}</span>
                    <button
                      className="btn sm ghost"
                      onClick={e => {
                        e.stopPropagation();
                        setSelectedLead(l);
                      }}
                    >
                      Details
                    </button>
                  </div>
                </div>
              ))}
              <button className="kanban-add" onClick={() => { setStage(col); setShowAddModal(true); }}>
                + Add opportunity
              </button>
            </div>
          );
        })}
      </div>

      {/* Lead Detail & Conversion Modal */}
      {selectedLead && (
        <div className="modal-backdrop" onClick={() => setSelectedLead(null)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Opportunity Details: {selectedLead.name}</h2>
              <button className="icon-btn" onClick={() => setSelectedLead(null)}>✕</button>
            </div>
            <div className="modal-body stack" style={{ gap: 12 }}>
              <div className="info-grid">
                <div><label>ID</label><span>{selectedLead.id}</span></div>
                <div><label>Service</label><span>{selectedLead.service}</span></div>
                <div><label>Pipeline Value</label><span>{formatCurrency(selectedLead.value, selectedLead.currency)}</span></div>
                <div><label>Current Stage</label><span>{selectedLead.stage}</span></div>
                <div><label>Primary Contact</label><span>{selectedLead.contact}</span></div>
                <div><label>Commercial Owner</label><span>{selectedLead.owner}</span></div>
              </div>

              <div className="divider" />

              <div className="borderbox" style={{ padding: 12 }}>
                <h4>Commercial Conversion Gate</h4>
                <p className="sub mt8">
                  Converting an inquiry creates a draft client and transfers to the acceptance and terms workflow. A proposal does not constitute professional engagement authorization.
                </p>
                {selectedLead.stage !== 'Won' ? (
                  <button
                    className="btn primary sm mt12"
                    onClick={() => handleConvert(selectedLead.id)}
                  >
                    Convert Opportunity to Client Entity
                  </button>
                ) : (
                  <span className="tag green mt12">Converted to Client Record</span>
                )}
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn sm ghost" onClick={() => setSelectedLead(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* New Opportunity Modal */}
      {showAddModal && (
        <div className="modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Register Commercial Inquiry</h2>
              <button className="icon-btn" onClick={() => setShowAddModal(false)}>✕</button>
            </div>
            <form onSubmit={handleAddLead}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div>
                  <label className="caption">Prospective Client Name</label>
                  <input
                    type="text"
                    className="input"
                    value={leadName}
                    onChange={e => setLeadName(e.target.value)}
                    placeholder="e.g. Oryx Petroleum W.L.L."
                    required
                  />
                </div>
                <div>
                  <label className="caption">Primary Contact</label>
                  <input
                    type="text"
                    className="input"
                    value={contact}
                    onChange={e => setContact(e.target.value)}
                    placeholder="e.g. Mansour Al-Hajri"
                  />
                </div>
                <div className="grid2">
                  <div>
                    <label className="caption">Service Requested</label>
                    <select
                      className="input"
                      value={service}
                      onChange={e => setService(e.target.value)}
                    >
                      <option value="External audit">External audit</option>
                      <option value="Annual accounts">Annual accounts</option>
                      <option value="Internal audit">Internal audit</option>
                    </select>
                  </div>
                  <div>
                    <label className="caption">Estimated Fee (QAR)</label>
                    <input
                      type="number"
                      className="input"
                      value={value}
                      onChange={e => setValue(Number(e.target.value))}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn primary sm">Register Inquiry</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
