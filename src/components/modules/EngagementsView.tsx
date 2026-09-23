// Module 04: Engagements Workspace & Lifecycle Handoff (VP-012)
import React, { useState } from 'react';
import { RouteKey, EngagementRecord } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';
import { formatCurrency } from '../../services/calculations';

interface EngagementsViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const EngagementsView: React.FC<EngagementsViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const [showNewEngModal, setShowNewEngModal] = useState(false);
  const [showScopeModal, setShowScopeModal] = useState(false);

  // New engagement form
  const [clientId, setClientId] = useState(state.clients[0]?.id || '');
  const [service, setService] = useState('External audit');
  const [year, setYear] = useState(2026);
  const [manager, setManager] = useState('Layla Rahman');
  const [partner, setPartner] = useState('Daniel James');
  const [fee, setFee] = useState(500000);

  const selectedEng = state.engagements.find(e => e.id === state.selectedEngagement) || state.engagements[0];
  const client = state.clients.find(c => c.id === selectedEng?.client);

  const steps = ['Acceptance', 'Planning', 'Production', 'Review', 'Release', 'Archive'];
  const currentStepIndex = selectedEng?.archive
    ? 5
    : selectedEng?.releases.length
    ? 4
    : selectedEng?.stage === 'Review'
    ? 3
    : 2;

  const handleCreateEngagement = (e: React.FormEvent) => {
    e.preventDefault();
    const newId = `ENG-2600${state.engagements.length + 1}`;
    const newEng: EngagementRecord = {
      id: newId,
      client: clientId,
      service,
      stage: 'Planning',
      year,
      mode: service === 'External audit' ? 'External books' : 'Client accounting records',
      period: `01 Jan – 31 Dec ${year}`,
      due: `${year}-10-31`,
      manager,
      partner,
      team: [manager, partner, 'Adam Khan', 'Sara Malik'],
      agreedFee: fee,
      currency: 'QAR',
      acceptance: true,
      terms: true,
      planning: true,
      sourceAccepted: false,
      mappingApproved: false,
      generation: 1,
      packageRevision: 1,
      builtGeneration: 1,
      sourceVersion: 1,
      eqrRequired: service === 'External audit',
      opinion: 'Standard unmodified',
      releases: [],
      approvals: { manager: null, client: null, partner: null, eqr: null },
      rows: [
        { code: '1000', name: 'Cash and bank balances', type: 'asset', balance: 500000 },
        { code: '1100', name: 'Trade receivables', type: 'asset', balance: 300000 },
        { code: '2000', name: 'Trade payables', type: 'liability', balance: -200000 },
        { code: '3000', name: 'Share capital', type: 'equity', balance: -600000 }
      ],
      adjustment: 0,
      journalState: 'Applied',
      sourceReflection: true,
      supplements: true,
      reconciliations: [],
      workpapers: [],
      reviews: [],
      pbc: [],
      annual: { confirmed: [], decision: null, nextId: null },
      questionnaire: { answers: { 0: true, 1: true, 2: true, 3: true }, status: 'Completed' },
      events: []
    };

    prototypeStore.addEngagement(newEng);
    setShowNewEngModal(false);
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Engagements</h1>
          <p>One legal scope, one reporting period, one accountable team.</p>
        </div>
        <button className="btn primary sm" onClick={() => setShowNewEngModal(true)}>
          <Icon name="plus" /> New Engagement
        </button>
      </div>

      {/* Selected Engagement Card */}
      {selectedEng && (
        <div className="panel panel-pad">
          <div className="between">
            <div>
              <span className="eyebrow">SELECTED ENGAGEMENT · {selectedEng.id}</span>
              <h2 className="mt8">{client?.name}</h2>
              <p className="sub">{selectedEng.service} · {selectedEng.period} · {selectedEng.mode}</p>
            </div>
            <span className="badge purple">{selectedEng.stage}</span>
          </div>

          {/* Lifecycle Bar */}
          <div className="lifecyclebar mt16">
            {steps.map((st, i) => (
              <div
                key={st}
                className={`life-step ${i < currentStepIndex ? 'done' : i === currentStepIndex ? 'current' : ''}`}
              >
                <em>{i < currentStepIndex ? <Icon name="check" size="sm" /> : i + 1}</em>
                {st}
              </div>
            ))}
          </div>

          <div className="info-grid mt16">
            <div><label>Engagement Manager</label><span>{selectedEng.manager}</span></div>
            <div><label>Professional Signatory</label><span>{selectedEng.partner}</span></div>
            <div><label>Management Contact</label><span>{client?.contact}</span></div>
            <div><label>Effective Terms</label><span className="badge green">Recorded</span></div>
            <div><label>Professional Acceptance</label><span className="badge green">Cleared</span></div>
            <div><label>Agreed Fee</label><span>{formatCurrency(selectedEng.agreedFee, selectedEng.currency)}</span></div>
          </div>

          <div className="row mt20 wrap" style={{ gap: 10 }}>
            <button className="btn sm" onClick={() => onNavigate('accounting-setup')}>
              <Icon name="calculator" /> Accounting Workbench
            </button>
            <button className="btn sm" onClick={() => onNavigate('audit')}>
              <Icon name="checkboard" /> Audit Workpapers
            </button>
            <button className="btn sm" onClick={() => onNavigate('delivery')}>
              <Icon name="archive" /> Release Gates
            </button>
            <button className="btn sm ghost" onClick={() => setShowScopeModal(true)}>
              <Icon name="layers" /> View Scope & Duties
            </button>
          </div>
        </div>
      )}

      {/* All Engagements Table */}
      <div className="panel">
        <div className="panel-head">
          <h3>Engagement Portfolio ({state.engagements.length})</h3>
          <span className="caption">Multi-entity Practice Delivery</span>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Engagement ID</th>
                <th>Service</th>
                <th>Period</th>
                <th>Stage</th>
                <th>Signatories</th>
                <th>Fee</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {state.engagements.map(eng => {
                const c = state.clients.find(x => x.id === eng.client);
                return (
                  <tr key={eng.id}>
                    <td><b>{c?.name}</b></td>
                    <td><span className="mono">{eng.id}</span></td>
                    <td>{eng.service}</td>
                    <td>{eng.period}</td>
                    <td><span className="badge teal">{eng.stage}</span></td>
                    <td>
                      <div className="cell-sub">Mgr: {eng.manager}</div>
                      <div className="cell-sub">Ptnr: {eng.partner}</div>
                    </td>
                    <td>{formatCurrency(eng.agreedFee, eng.currency)}</td>
                    <td>
                      <button
                        className="btn sm"
                        onClick={() => prototypeStore.setSelectedEngagement(eng.id)}
                      >
                        Select
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Scope Modal */}
      {showScopeModal && selectedEng && (
        <div className="modal-backdrop" onClick={() => setShowScopeModal(false)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Service Scope: {selectedEng.service}</h2>
              <button className="icon-btn" onClick={() => setShowScopeModal(false)}>✕</button>
            </div>
            <div className="modal-body stack" style={{ gap: 12 }}>
              <div className="borderbox" style={{ padding: 12 }}>
                <h4>Engagement Mandate</h4>
                <p className="sub mt8">
                  Governed by International Standards on Auditing (ISA) and the regulatory framework of {client?.jurisdiction}. Includes independent audit of financial position, comprehensive substantive testing, and management letter issuance.
                </p>
              </div>
              <div className="borderbox" style={{ padding: 12 }}>
                <h4>Governance & Approvals</h4>
                <p className="sub mt8">
                  Strict separation of duties: Preparer (Adam Khan) performs fieldwork, Senior Reviewer (Sara Malik) evaluates sufficiency, Manager (Layla Rahman) reviews file consistency, and Partner (Daniel James) retains sole release authorization.
                </p>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn sm ghost" onClick={() => setShowScopeModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Engagement Modal */}
      {showNewEngModal && (
        <div className="modal-backdrop" onClick={() => setShowNewEngModal(false)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Launch New Engagement</h2>
              <button className="icon-btn" onClick={() => setShowNewEngModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateEngagement}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div>
                  <label className="caption">Client Entity</label>
                  <select
                    className="input"
                    value={clientId}
                    onChange={e => setClientId(e.target.value)}
                  >
                    {state.clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.id})</option>
                    ))}
                  </select>
                </div>
                <div className="grid2">
                  <div>
                    <label className="caption">Service</label>
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
                    <label className="caption">Reporting Year</label>
                    <input
                      type="number"
                      className="input"
                      value={year}
                      onChange={e => setYear(Number(e.target.value))}
                    />
                  </div>
                </div>
                <div className="grid2">
                  <div>
                    <label className="caption">Engagement Manager</label>
                    <input
                      type="text"
                      className="input"
                      value={manager}
                      onChange={e => setManager(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="caption">Signing Partner</label>
                    <input
                      type="text"
                      className="input"
                      value={partner}
                      onChange={e => setPartner(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="caption">Agreed Professional Fee (QAR)</label>
                  <input
                    type="number"
                    className="input"
                    value={fee}
                    onChange={e => setFee(Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={() => setShowNewEngModal(false)}>Cancel</button>
                <button type="submit" className="btn primary sm">Create Engagement</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
