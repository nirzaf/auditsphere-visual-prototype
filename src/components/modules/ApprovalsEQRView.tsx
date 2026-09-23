// Module 36: Multi-Stage Sign-offs & Engagement Quality Review (EQR) (VP-056)
import React, { useState } from 'react';
import { RouteKey } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';

interface ApprovalsEQRViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const ApprovalsEQRView: React.FC<ApprovalsEQRViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const selectedEng = state.engagements.find(e => e.id === state.selectedEngagement) || state.engagements[0];
  const approvals = selectedEng.approvals;

  const [eqrConcerns, setEqrConcerns] = useState<Array<{ id: string; text: string; resolved: boolean }>>([
    { id: 'EQR-01', text: 'Confirm management representation letter has been signed by both CEO and CFO.', resolved: true }
  ]);
  const [newConcern, setNewConcern] = useState('');

  const handleRecordSignOff = (roleKey: 'manager' | 'client' | 'partner' | 'eqr') => {
    // Check if EQR has unresolved concerns
    if (roleKey === 'eqr' && eqrConcerns.some(c => !c.resolved)) {
      alert('Cannot complete EQR sign-off: Unresolved EQR concerns remain.');
      return;
    }

    prototypeStore.recordApproval(selectedEng.id, roleKey, 'Independent stage sign-off recorded in prototype.');
  };

  const handleAddConcern = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newConcern.trim()) return;

    setEqrConcerns(prev => [
      ...prev,
      { id: `EQR-0${prev.length + 1}`, text: newConcern, resolved: false }
    ]);
    setNewConcern('');
  };

  const handleToggleConcern = (id: string) => {
    setEqrConcerns(prev => prev.map(c => c.id === id ? { ...c, resolved: !c.resolved } : c));
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Sign-offs & Engagement Quality Review</h1>
          <p>Formal multi-stage sign-off gates, generational validity protection, and independent EQR concurrence.</p>
        </div>
        <button className="btn primary sm" onClick={() => onNavigate('delivery')}>
          <Icon name="archive" /> Proceed to Release Desk
        </button>
      </div>

      <div className="panel panel-pad">
        <div className="between">
          <div>
            <span className="eyebrow">STAGE SIGN-OFF GATES · {selectedEng.id}</span>
            <h2>Sign-off Register (Generation {selectedEng.generation})</h2>
            <p className="sub">Any source file modification automatically stales approvals for prior generations.</p>
          </div>
          <span className="badge teal">ISA 220 Quality Management</span>
        </div>

        {/* 4 Sign-off Gate Cards */}
        <div className="grid2 mt20">
          {/* Gate 1: Manager */}
          <div className="borderbox" style={{ padding: 16 }}>
            <div className="between">
              <b>1. Engagement Manager Sign-off</b>
              <span className={`badge ${approvals.manager ? 'green' : 'amber'}`}>
                {approvals.manager ? 'Signed Off' : 'Pending'}
              </span>
            </div>
            <p className="sub mt8">
              Verification of audit file consistency, clearance of associate queries, and completeness of sampling.
            </p>
            {approvals.manager ? (
              <div className="cell-sub mt12" style={{ color: 'var(--teal-dark)' }}>
                Signed by {approvals.manager.by} on {new Date(approvals.manager.at).toLocaleString('en-GB')}
              </div>
            ) : (
              <button
                className="btn primary sm mt12"
                onClick={() => handleRecordSignOff('manager')}
              >
                Sign Off as Manager ({selectedEng.manager})
              </button>
            )}
          </div>

          {/* Gate 2: Client Rep */}
          <div className="borderbox" style={{ padding: 16 }}>
            <div className="between">
              <b>2. Management Representation Sign-off</b>
              <span className={`badge ${approvals.client ? 'green' : 'amber'}`}>
                {approvals.client ? 'Signed Off' : 'Pending'}
              </span>
            </div>
            <p className="sub mt8">
              Formal receipt of signed management representation letter acknowledging responsibility for books and records.
            </p>
            {approvals.client ? (
              <div className="cell-sub mt12" style={{ color: 'var(--teal-dark)' }}>
                Signed by {approvals.client.by} on {new Date(approvals.client.at).toLocaleString('en-GB')}
              </div>
            ) : (
              <button
                className="btn primary sm mt12"
                onClick={() => handleRecordSignOff('client')}
              >
                Record Client Representation Receipt
              </button>
            )}
          </div>

          {/* Gate 3: Partner */}
          <div className="borderbox" style={{ padding: 16 }}>
            <div className="between">
              <b>3. Lead Audit Partner Approval</b>
              <span className={`badge ${approvals.partner ? 'green' : 'amber'}`}>
                {approvals.partner ? 'Approved' : 'Pending'}
              </span>
            </div>
            <p className="sub mt8">
              Sole professional authority to issue audit opinion and release financial statements to stakeholders.
            </p>
            {approvals.partner ? (
              <div className="cell-sub mt12" style={{ color: 'var(--teal-dark)' }}>
                Approved by {approvals.partner.by} on {new Date(approvals.partner.at).toLocaleString('en-GB')}
              </div>
            ) : (
              <button
                className="btn primary sm mt12"
                onClick={() => handleRecordSignOff('partner')}
              >
                Approve as Lead Partner ({selectedEng.partner})
              </button>
            )}
          </div>

          {/* Gate 4: EQR */}
          <div className="borderbox" style={{ padding: 16 }}>
            <div className="between">
              <b>4. Engagement Quality Reviewer (EQR)</b>
              <span className={`badge ${approvals.eqr ? 'green' : 'amber'}`}>
                {approvals.eqr ? 'Concurred' : 'Pending'}
              </span>
            </div>
            <p className="sub mt8">
              Objective evaluation of significant judgments and conclusions made by the engagement team (ISQM 2).
            </p>
            {approvals.eqr ? (
              <div className="cell-sub mt12" style={{ color: 'var(--teal-dark)' }}>
                Concurred by {approvals.eqr.by} on {new Date(approvals.eqr.at).toLocaleString('en-GB')}
              </div>
            ) : (
              <button
                className="btn primary sm mt12"
                onClick={() => handleRecordSignOff('eqr')}
              >
                Sign Off as EQR (Fatima Al-Kuwari)
              </button>
            )}
          </div>
        </div>
      </div>

      {/* EQR Concerns Register */}
      <div className="panel panel-pad">
        <div className="between">
          <div>
            <h3>EQR Matters & Concerns Register</h3>
            <p className="sub">All EQR matters must be marked resolved before the EQR gate can be signed off.</p>
          </div>
        </div>

        <div className="stack mt16" style={{ gap: 8 }}>
          {eqrConcerns.map(c => (
            <div key={c.id} className="between borderbox" style={{ padding: 12 }}>
              <div className="row" style={{ gap: 10 }}>
                <input
                  type="checkbox"
                  checked={c.resolved}
                  onChange={() => handleToggleConcern(c.id)}
                />
                <div>
                  <b style={{ textDecoration: c.resolved ? 'line-through' : 'none' }}>{c.text}</b>
                  <div className="cell-sub">{c.id}</div>
                </div>
              </div>
              <span className={`badge ${c.resolved ? 'green' : 'amber'}`}>
                {c.resolved ? 'Resolved' : 'Open Matter'}
              </span>
            </div>
          ))}
        </div>

        <form onSubmit={handleAddConcern} className="row mt16" style={{ gap: 10 }}>
          <input
            type="text"
            className="input"
            style={{ flex: 1 }}
            placeholder="Raise new EQR quality matter or disclosure inquiry..."
            value={newConcern}
            onChange={e => setNewConcern(e.target.value)}
          />
          <button type="submit" className="btn sm primary">Raise EQR Query</button>
        </form>
      </div>
    </div>
  );
};
