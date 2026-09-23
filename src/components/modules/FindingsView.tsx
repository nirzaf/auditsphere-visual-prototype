// Module 34: Audit Findings & Misstatements Register (VP-054)
import React, { useState } from 'react';
import { RouteKey, AuditFindingItem } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';
import { formatCurrency } from '../../services/calculations';

interface FindingsViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const FindingsView: React.FC<FindingsViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const [findings, setFindings] = useState<AuditFindingItem[]>(state.findings);
  const [showAddModal, setShowAddModal] = useState(false);

  // New finding form
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<AuditFindingItem['category']>('Monetary misstatement');
  const [severity, setSeverity] = useState<AuditFindingItem['severity']>('Material');
  const [accounts, setAccounts] = useState('1200 - Property, Plant & Equipment');
  const [grossAmount, setGrossAmount] = useState(28000);
  const [condition, setCondition] = useState('');
  const [recommendation, setRecommendation] = useState('');

  const totalMonetaryMisstatements = findings.reduce(
    (sum, f) => sum + (f.category === 'Monetary misstatement' ? (f.grossMisstatement || 0) : 0),
    0
  );

  const handleAddFinding = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newFnd: AuditFindingItem = {
      id: `FND-0${findings.length + 1}`,
      engagementId: state.selectedEngagement,
      title,
      category,
      severity,
      financialStatementLine: accounts,
      grossMisstatement: category === 'Monetary misstatement' ? grossAmount : undefined,
      netMisstatement: category === 'Monetary misstatement' ? grossAmount : undefined,
      condition,
      recommendation,
      disposition: 'Proposed for correction'
    };

    const updated = [newFnd, ...findings];
    setFindings(updated);
    state.findings = updated;
    prototypeStore.logEvent(`Audit finding raised: ${title}`, newFnd.id);
    setShowAddModal(false);
  };

  const handleToggleDisposition = (id: string) => {
    setFindings(prev => prev.map(f => {
      if (f.id === id) {
        const nextDisp = f.disposition === 'Corrected by client' ? 'Uncorrected waived' : 'Corrected by client';
        return { ...f, disposition: nextDisp };
      }
      return f;
    }));
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Audit Findings & Unadjusted Differences</h1>
          <p>ISA 450 evaluation of misstatements, control deficiencies, and management correction tracking.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn sm ghost" onClick={() => onNavigate('accounting-setup')}>
            <Icon name="calculator" /> Propose Journal
          </button>
          <button className="btn primary sm" onClick={() => setShowAddModal(true)}>
            <Icon name="plus" /> Raise Finding
          </button>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric">
          <span className="metric-label">Identified Findings</span>
          <div className="metric-val">{findings.length}</div>
          <span className="metric-sub">Across all audit substantive areas</span>
        </div>
        <div className="metric amber">
          <span className="metric-label">Accumulated Monetary Errors</span>
          <div className="metric-val">{formatCurrency(totalMonetaryMisstatements)}</div>
          <span className="metric-sub">Compared to PM: {formatCurrency(30000)}</span>
        </div>
        <div className="metric purple">
          <span className="metric-label">Control Deficiencies</span>
          <div className="metric-val">{findings.filter(f => f.category === 'Internal control deficiency' || (f.category as any) === 'Control deficiency').length}</div>
          <span className="metric-sub">ISA 265 management letter items</span>
        </div>
      </div>

      <div className="stack" style={{ gap: 16 }}>
        {findings.map(f => (
          <div key={f.id} className="panel panel-pad">
            <div className="between">
              <div className="row" style={{ gap: 10 }}>
                <span className={`badge ${f.severity === 'Material' ? 'red' : f.severity === 'Significant' ? 'amber' : 'blue'}`}>
                  {f.severity}
                </span>
                <div>
                  <h3>{f.title}</h3>
                  <div className="cell-sub">{f.id} · Category: {f.category} · Account: {f.financialStatementLine}</div>
                </div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <span className={`badge ${f.disposition === 'Corrected by client' ? 'green' : 'amber'}`}>
                  {f.disposition}
                </span>
                <button
                  className="btn sm ghost"
                  onClick={() => handleToggleDisposition(f.id)}
                >
                  Change Status
                </button>
              </div>
            </div>

            {f.grossMisstatement && (
              <div className="row mt12" style={{ gap: 20 }}>
                <div><span className="caption">Gross Misstatement:</span> <b>{formatCurrency(f.grossMisstatement)}</b></div>
                <div><span className="caption">Net Unadjusted:</span> <b>{formatCurrency(f.netMisstatement || 0)}</b></div>
              </div>
            )}

            <div className="borderbox mt12" style={{ padding: 12 }}>
              <b>Condition & Cause:</b>
              <p className="sub mt4">{f.condition}</p>
              <b className="mt12" style={{ display: 'block' }}>Auditor Recommendation:</b>
              <p className="sub mt4">{f.recommendation}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Add Finding Modal */}
      {showAddModal && (
        <div className="modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Raise Audit Finding</h2>
              <button className="icon-btn" onClick={() => setShowAddModal(false)}>✕</button>
            </div>
            <form onSubmit={handleAddFinding}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div>
                  <label className="caption">Finding Title</label>
                  <input
                    type="text"
                    className="input"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. Unreconciled inventory cutoff discrepancy"
                    required
                  />
                </div>
                <div className="grid2">
                  <div>
                    <label className="caption">Category</label>
                    <select
                      className="input"
                      value={category}
                      onChange={e => setCategory(e.target.value as any)}
                    >
                      <option value="Monetary misstatement">Monetary misstatement</option>
                      <option value="Control deficiency">Control deficiency</option>
                      <option value="Disclosure omission">Disclosure omission</option>
                    </select>
                  </div>
                  <div>
                    <label className="caption">Severity</label>
                    <select
                      className="input"
                      value={severity}
                      onChange={e => setSeverity(e.target.value as any)}
                    >
                      <option value="Material">Material</option>
                      <option value="Significant">Significant Deficiency</option>
                      <option value="Trivial">Trivial</option>
                    </select>
                  </div>
                </div>
                {category === 'Monetary misstatement' && (
                  <div>
                    <label className="caption">Gross Misstatement (QAR)</label>
                    <input
                      type="number"
                      className="input"
                      value={grossAmount}
                      onChange={e => setGrossAmount(Number(e.target.value))}
                    />
                  </div>
                )}
                <div>
                  <label className="caption">Financial Statement Line</label>
                  <input
                    type="text"
                    className="input"
                    value={accounts}
                    onChange={e => setAccounts(e.target.value)}
                  />
                </div>
                <div>
                  <label className="caption">Condition & Cause</label>
                  <textarea
                    className="input"
                    rows={2}
                    value={condition}
                    onChange={e => setCondition(e.target.value)}
                  />
                </div>
                <div>
                  <label className="caption">Auditor Recommendation</label>
                  <textarea
                    className="input"
                    rows={2}
                    value={recommendation}
                    onChange={e => setRecommendation(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn primary sm">Record Finding</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
