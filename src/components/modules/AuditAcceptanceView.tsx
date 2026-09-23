// Module 27: Acceptance, Continuance & KYC Questionnaire (VP-047)
// Engagement onboarding, independence evaluation, partner sign-off, and canonical workspace preparation.

import React, { useState } from 'react';
import { RouteKey } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';

interface AuditAcceptanceViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const AuditAcceptanceView: React.FC<AuditAcceptanceViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const selectedEng = state.engagements.find(e => e.id === state.selectedEngagement) || state.engagements[0];

  if (!selectedEng) {
    return (
      <div className="panel panel-pad text-center" style={{ padding: '60px 20px' }}>
        <Icon name="shield" size="xl" className="text-muted mb16" />
        <h3>No Active Engagement Selected</h3>
        <p className="sub max-w-md mx-auto mt8">
          Select or create an engagement to perform client acceptance and KYC procedures.
        </p>
        <button className="btn primary sm mt16" onClick={() => onNavigate('engagements')}>
          Go to Engagements
        </button>
      </div>
    );
  }

  const client = state.clients.find(c => c.id === selectedEng.client);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [questions, setQuestions] = useState([
    { id: 0, text: 'Are all beneficial owners identified and verified against sanctions and PEP lists?', answered: true, notes: 'Passport copy and CR verified.' },
    { id: 1, text: 'Is the firm independent of the entity in accordance with IESBA and local statutory code?', answered: true, notes: 'Independence declarations collected.' },
    { id: 2, text: 'Does the firm have the necessary industry competence, resources, and time to perform the audit?', answered: true, notes: 'Engagement team staffed with qualified accountants.' },
    { id: 3, text: 'Were prior year audited financial statements and predecessor auditor communications reviewed?', answered: true, notes: 'Professional clearance letter on file.' }
  ]);

  const [partnerDecision, setPartnerDecision] = useState<'Accepted' | 'Declined'>('Accepted');
  const [partnerRationale, setPartnerRationale] = useState('Satisfactory governance, low risk profile, full independence maintained.');

  const allCompleted = questions.every(q => q.answered);

  const triggerNotice = (type: 'success' | 'error', text: string) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 6000);
  };

  const handlePartnerAcceptance = () => {
    try {
      if (client) {
        prototypeStore.prepareClientWorkspace(client.id, selectedEng.year);
      }
      prototypeStore.logEvent(`Acceptance & KYC confirmed by ${selectedEng.partner} (${partnerDecision})`, selectedEng.id);
      triggerNotice('success', `Engagement acceptance status recorded. Canonical SharePoint workspace prepared for ${client?.name || selectedEng.client}.`);
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Client Acceptance &amp; Continuance (KYC)</h1>
          <p>Annual continuance evaluation, independence verification, and partner acceptance record.</p>
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

      <div className="panel panel-pad">
        <div className="between">
          <div>
            <span className="eyebrow">ANNUAL ACCEPTANCE &amp; CONTINUANCE</span>
            <h2>{client?.name || selectedEng.client} · FY {selectedEng.year}</h2>
            <p className="sub">{selectedEng.service} · Jurisdiction: {client?.jurisdiction || 'State of Qatar'}</p>
          </div>
          <span className={`badge ${allCompleted ? 'green' : 'amber'}`}>
            {allCompleted ? 'Questionnaire Completed' : 'Pending Verification'}
          </span>
        </div>

        <h3 className="mt20">Professional Mandate Questionnaire</h3>
        <div className="stack mt12" style={{ gap: 10 }}>
          {questions.map(q => (
            <div key={q.id} className="borderbox" style={{ padding: 14 }}>
              <div className="between">
                <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={q.answered}
                    onChange={e => {
                      setQuestions(prev => prev.map(item => item.id === q.id ? { ...item, answered: e.target.checked } : item));
                    }}
                  />
                  <b>{q.text}</b>
                </div>
                <span className={`badge ${q.answered ? 'green' : 'gray'}`}>
                  {q.answered ? 'Verified' : 'Pending'}
                </span>
              </div>
              <div className="cell-sub mt8" style={{ paddingLeft: 26 }}>
                <strong>Evidence on file:</strong> {q.notes}
              </div>
            </div>
          ))}
        </div>

        <div className="borderbox mt20" style={{ background: '#f8fafc', padding: 16 }}>
          <h4>Lead Engagement Partner Acceptance Decision</h4>
          <p className="sub mt8">
            Sole authority retained by licensed signing partner ({selectedEng.partner}).
          </p>

          <div className="grid2 mt12">
            <div>
              <label className="caption">Acceptance Decision</label>
              <select
                className="input"
                value={partnerDecision}
                onChange={e => setPartnerDecision(e.target.value as any)}
              >
                <option value="Accepted">Accept / Continue Professional Relationship</option>
                <option value="Declined">Decline Mandate</option>
              </select>
            </div>
            <div>
              <label className="caption">Signing Partner</label>
              <div><b>{selectedEng.partner} (FCA)</b></div>
            </div>
          </div>

          <div className="mt12">
            <label className="caption">Mandate Rationale</label>
            <textarea
              className="input"
              rows={2}
              value={partnerRationale}
              onChange={e => setPartnerRationale(e.target.value)}
            />
          </div>

          <button
            className="btn primary sm mt12"
            onClick={handlePartnerAcceptance}
          >
            Record Partner Acceptance Sign-off
          </button>
        </div>
      </div>

      <div className="panel panel-pad" style={{ background: '#fffbeb', borderLeft: '4px solid #d97706' }}>
        <b>Prototype note — evaluation depth and continuance (VP-047)</b>
        <p className="sub mt4">
          Recording partner acceptance triggers the creation of canonical SharePoint client folders
          (01_Acceptance, 02_Planning, 03_Fieldwork, 04_Deliverables, 05_Correspondence) in the local store.
          No live screening APIs or cloud identity systems are contacted.
        </p>
      </div>
    </div>
  );
};
