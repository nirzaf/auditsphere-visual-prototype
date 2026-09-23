// Module 02: Client Portfolio & CRM (VP-006, VP-007, VP-008)
import React, { useState } from 'react';
import { ClientRecord, RouteKey } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';

interface ClientsViewProps {
  onNavigate: (route: RouteKey) => void;
  onSelectClientDetail: (clientId: string) => void;
}

export const ClientsView: React.FC<ClientsViewProps> = ({ onNavigate, onSelectClientDetail }) => {
  const state = prototypeStore.getSnapshot();
  const [filterText, setFilterText] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // New client form state
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('Trading & distribution');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [jurisdiction, setJurisdiction] = useState('State of Qatar');
  const [risk, setRisk] = useState<'Low' | 'Moderate' | 'High'>('Moderate');

  const filteredClients = state.clients.filter(c => {
    const q = filterText.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.industry.toLowerCase().includes(q) || c.code.toLowerCase().includes(q);
  });

  const handleAddClient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newId = `CL-00${state.clients.length + 1}`;
    const newCode = name.slice(0, 4).toUpperCase();
    const newClient: ClientRecord = {
      id: newId,
      code: newCode,
      name,
      initials: name.slice(0, 2).toUpperCase(),
      industry,
      contact: contact || 'Primary Contact',
      email,
      jurisdiction,
      status: 'Active',
      risk,
      revenue: 500000,
      relationshipOwner: state.currentPerson
    };

    prototypeStore.addClient(newClient);
    setShowAddModal(false);
    setName('');
    setContact('');
    setEmail('');
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Client Portfolio</h1>
          <p>Separate legal relationships, entities, and multi-service engagement scopes.</p>
        </div>
        <button className="btn primary sm" onClick={() => setShowAddModal(true)}>
          <Icon name="plus" />
          Add Client Profile
        </button>
      </div>

      <div className="toolbar">
        <div className="input-search" style={{ flex: 1, maxWidth: 400 }}>
          <Icon name="search" />
          <input
            type="text"
            className="input"
            placeholder="Filter clients by name, code or industry..."
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
          />
        </div>
        <span className="tag gray">{filteredClients.length} clients registered</span>
      </div>

      <div className="grid3">
        {filteredClients.map(client => {
          const clientEngs = state.engagements.filter(e => e.client === client.id);
          const clientContacts = state.contacts.filter(c => c.clientId === client.id);

          return (
            <div key={client.id} className="client-card">
              <div className="between">
                <div className="row" style={{ gap: 10 }}>
                  <div className="firmavatar" style={{ background: 'var(--teal-light)', color: 'var(--teal)' }}>
                    {client.initials}
                  </div>
                  <div>
                    <h3>{client.name}</h3>
                    <div className="cell-sub">{client.industry}</div>
                  </div>
                </div>
                <span className={`badge ${client.status === 'Active' ? 'green' : 'gray'}`}>
                  {client.status}
                </span>
              </div>

              <div className="row mt12" style={{ gap: 8 }}>
                <span className="caption">{client.id} ({client.code})</span>
                <span className={`badge ${client.risk === 'Low' ? 'green' : 'amber'}`}>
                  {client.risk} Risk
                </span>
              </div>

              <div className="clientstats mt12">
                <div>
                  <small>Active Engagements</small>
                  <b>{clientEngs.length}</b>
                </div>
                <div>
                  <small>Primary Contact</small>
                  <span className="small">{client.contact}</span>
                </div>
              </div>

              <div className="between mt20">
                <button
                  className="btn sm ghost"
                  onClick={() => onSelectClientDetail(client.id)}
                >
                  Client 360 Workspace
                </button>
                <button
                  className="btn sm"
                  onClick={() => {
                    if (clientEngs.length > 0) {
                      prototypeStore.setSelectedEngagement(clientEngs[0].id);
                      onNavigate('engagements');
                    }
                  }}
                >
                  <Icon name="arrow" />
                  Open Work
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Client Modal */}
      {showAddModal && (
        <div className="modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Create Synthetic Client Profile</h2>
              <button className="icon-btn" onClick={() => setShowAddModal(false)}>✕</button>
            </div>
            <form onSubmit={handleAddClient}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div>
                  <label className="caption">Legal Entity Name</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Al-Doha Logistics W.L.L."
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="grid2">
                  <div>
                    <label className="caption">Industry Sector</label>
                    <input
                      type="text"
                      className="input"
                      value={industry}
                      onChange={e => setIndustry(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="caption">Jurisdiction</label>
                    <input
                      type="text"
                      className="input"
                      value={jurisdiction}
                      onChange={e => setJurisdiction(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid2">
                  <div>
                    <label className="caption">Primary Contact Person</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="e.g. Tariq Al-Kuwari"
                      value={contact}
                      onChange={e => setContact(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="caption">Contact Email</label>
                    <input
                      type="email"
                      className="input"
                      placeholder="tariq@client.demo"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="caption">Risk Classification</label>
                  <select
                    className="input"
                    value={risk}
                    onChange={e => setRisk(e.target.value as any)}
                  >
                    <option value="Low">Low Risk</option>
                    <option value="Moderate">Moderate Risk</option>
                    <option value="High">High Risk</option>
                  </select>
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn primary sm">
                  Create Client
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
