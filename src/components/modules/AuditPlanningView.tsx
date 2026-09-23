// Module 28: Audit Planning & Materiality (VP-048)
// ISA 320 quantitative materiality thresholds, versioned audit plan persistence,
// team section allocations, timing milestones, and independent plan review.

import React, { useState } from 'react';
import { RouteKey, AuditPlanRecord } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';
import { calculateMateriality, formatCurrency } from '../../services/calculations';

interface AuditPlanningViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const AuditPlanningView: React.FC<AuditPlanningViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const selectedEng = state.engagements.find(e => e.id === state.selectedEngagement) || state.engagements[0];
  const client = state.clients.find(c => c.id === selectedEng?.client);

  const [activeTab, setActiveTab] = useState<'materiality' | 'team' | 'milestones' | 'history'>('materiality');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Existing plan if any
  const existingPlan = (state.auditPlans || []).filter(p => p.engagementId === selectedEng?.id).sort((a, b) => b.version - a.version)[0];
  const planHistory = (state.auditPlans || []).filter(p => p.engagementId === selectedEng?.id).sort((a, b) => b.version - a.version);

  const [benchmarkType, setBenchmarkType] = useState<'profit' | 'revenue' | 'assets' | 'equity'>(
    (existingPlan?.benchmark as any) || 'revenue'
  );
  const [benchmarkValue, setBenchmarkValue] = useState<number>(
    existingPlan?.benchmarkValue || client?.revenue || 2000000
  );
  const [percentage, setPercentage] = useState<number>(
    existingPlan?.materialityRate || 1.5
  );
  const [scopeNotes, setScopeNotes] = useState(
    existingPlan?.rationales?.[0] || 'Standard external audit scope focused on revenue cutoff, bank confirmations, inventory valuation, and intercompany balances.'
  );

  const [teamAllocations, setTeamAllocations] = useState(
    existingPlan?.teamAllocations || [
      { person: 'Adam Khan', role: 'Audit Senior', scheduledStart: '2026-10-01', scheduledEnd: '2026-11-15' },
      { person: 'Sara Malik', role: 'Senior Reviewer', scheduledStart: '2026-10-15', scheduledEnd: '2026-11-30' },
      { person: 'Layla Rahman', role: 'Engagement Manager', scheduledStart: '2026-10-01', scheduledEnd: '2026-12-15' },
      { person: 'Daniel James', role: 'Lead Signing Partner', scheduledStart: '2026-11-15', scheduledEnd: '2026-12-31' }
    ]
  );

  const [milestones, setMilestones] = useState(
    existingPlan?.timingMilestones || [
      { phase: 'Planning & Risk Assessment', targetDate: '2026-10-15', status: 'Completed' as const },
      { phase: 'Interim Controls Testing', targetDate: '2026-10-31', status: 'In progress' as const },
      { phase: 'Year-End Substantive Fieldwork', targetDate: '2026-11-30', status: 'Planned' as const },
      { phase: 'Final Tie-off & Deliverable Release', targetDate: '2026-12-15', status: 'Planned' as const }
    ]
  );

  const [reviewNotes, setReviewNotes] = useState('Benchmark and 75% performance haircut approved in line with ISA 320.');

  const triggerNotice = (type: 'success' | 'error', text: string) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 6000);
  };

  if (!selectedEng) {
    return (
      <div className="panel panel-pad text-center" style={{ padding: '60px 20px' }}>
        <Icon name="target" size="xl" className="text-muted mb16" />
        <h3>No Active Engagement Selected</h3>
        <p className="sub max-w-md mx-auto mt8">
          Select or create an engagement to calculate materiality and establish audit strategy.
        </p>
        <button className="btn primary sm mt16" onClick={() => onNavigate('engagements')}>
          Go to Engagements
        </button>
      </div>
    );
  }

  const materiality = calculateMateriality(benchmarkValue, percentage);

  const handleSavePlan = () => {
    try {
      const nextVersion = (existingPlan?.version || 0) + 1;
      const plan: AuditPlanRecord = {
        id: `PLAN-${selectedEng.id}-V${nextVersion}`,
        engagementId: selectedEng.id,
        version: nextVersion,
        status: 'Under review',
        benchmark: benchmarkType,
        benchmarkValue,
        materialityRate: percentage,
        overallMateriality: materiality.overallMateriality,
        performanceMateriality: materiality.performanceMateriality,
        clearlyTrivialThreshold: materiality.clearlyTrivialThreshold,
        rationales: [scopeNotes],
        teamAllocations,
        timingMilestones: milestones,
        significantAreas: ['Revenue & Receivables', 'Cash & Bank Confirmations', 'Fixed Assets & Depreciation'],
        preparedBy: state.currentPerson,
        preparedAt: new Date().toISOString()
      };

      prototypeStore.saveAuditPlan(plan);
      triggerNotice('success', `Audit Plan Version ${nextVersion} saved and submitted for independent review.`);
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  const handleReviewPlan = (approved: boolean) => {
    if (!existingPlan) return;
    try {
      prototypeStore.reviewAuditPlan(existingPlan.id, approved, reviewNotes);
      triggerNotice('success', `Audit Plan ${approved ? 'approved' : 'returned'} by ${state.currentPerson}. Engagement planning gate cleared.`);
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Audit Planning & Materiality Determination</h1>
          <p>ISA 320 quantitative materiality thresholds, team allocations, timing milestones, and independent plan review.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn sm ghost" onClick={() => onNavigate('audit-risks')}>
            <Icon name="shield" /> Audit Risk Register
          </button>
              <button className="btn primary sm" onClick={handleSavePlan} disabled={!['manager', 'preparer', 'partner'].includes(state.currentRole)}>
            <Icon name="check" /> Save Version {(existingPlan?.version || 0) + 1}
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

      <div className="tabs">
        <button className={`tab-btn ${activeTab === 'materiality' ? 'active' : ''}`} onClick={() => setActiveTab('materiality')}>
          Materiality Strategy (ISA 320)
        </button>
        <button className={`tab-btn ${activeTab === 'team' ? 'active' : ''}`} onClick={() => setActiveTab('team')}>
          Team &amp; Section Allocations
        </button>
        <button className={`tab-btn ${activeTab === 'milestones' ? 'active' : ''}`} onClick={() => setActiveTab('milestones')}>
          Timing &amp; Milestones ({milestones.length})
        </button>
        <button className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
          Plan Versions &amp; Review ({existingPlan ? `v${existingPlan.version}` : 'Draft'})
        </button>
      </div>

      {/* Tab 1: Materiality */}
      {activeTab === 'materiality' && (
        <div className="panel panel-pad">
          <div className="between">
            <div>
              <span className="eyebrow">ISA 320 QUANTITATIVE BENCHMARK</span>
              <h2>{client?.name} · Materiality Strategy</h2>
              <p className="sub">Engagement: {selectedEng.id} · Currency: {selectedEng.currency} · Status: {existingPlan?.status || 'Draft'}</p>
            </div>
            <span className={`badge ${existingPlan?.status === 'Approved' ? 'green' : 'amber'}`}>
              {existingPlan?.status || 'Draft Plan'}
            </span>
          </div>

          <div className="grid3 mt20">
            <div>
              <label className="caption">Financial Benchmark Basis</label>
              <select
                className="input"
                value={benchmarkType}
                onChange={e => setBenchmarkType(e.target.value as any)}
              >
                <option value="revenue">Annual Gross Revenue (0.5% – 2%)</option>
                <option value="profit">Profit Before Tax (5% – 10%)</option>
                <option value="assets">Total Balance Sheet Assets (1% – 2%)</option>
                <option value="equity">Net Equity (2% – 5%)</option>
              </select>
            </div>
            <div>
              <label className="caption">Benchmark Value (QAR)</label>
              <input
                type="number"
                className="input"
                value={benchmarkValue}
                onChange={e => setBenchmarkValue(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="caption">Applied Benchmark Rate (%)</label>
              <input
                type="number"
                step={0.1}
                className="input"
                value={percentage}
                onChange={e => setPercentage(Number(e.target.value))}
              />
            </div>
          </div>

          {/* Calculated Thresholds */}
          <div className="metric-grid mt20">
            <div className="metric purple">
              <span className="metric-label">Overall Planning Materiality (PM)</span>
              <div className="metric-val">{formatCurrency(materiality.overallMateriality)}</div>
              <span className="metric-sub">{percentage}% of {formatCurrency(benchmarkValue)}</span>
            </div>

            <div className="metric blue">
              <span className="metric-label">Performance Materiality (Haircut 75%)</span>
              <div className="metric-val">{formatCurrency(materiality.performanceMateriality)}</div>
              <span className="metric-sub">Substantive testing threshold</span>
            </div>

            <div className="metric amber">
              <span className="metric-label">Clearly Trivial Threshold (5%)</span>
              <div className="metric-val">{formatCurrency(materiality.clearlyTrivialThreshold)}</div>
              <span className="metric-sub">Differences below this are not accumulated</span>
            </div>
          </div>

          <div className="mt20">
            <label className="caption">Planning Strategy Memo &amp; Scope Rationales</label>
            <textarea
              className="input"
              rows={3}
              value={scopeNotes}
              onChange={e => setScopeNotes(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Tab 2: Team Allocations */}
      {activeTab === 'team' && (
        <div className="panel">
          <div className="panel-head">
            <h3>Staff Resourcing &amp; Section Allocations</h3>
            <span className="caption">Target start and completion windows</span>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Team Member</th>
                  <th>Assigned Audit Role</th>
                  <th>Scheduled Start</th>
                  <th>Scheduled End</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {teamAllocations.map((alloc, idx) => (
                  <tr key={idx}>
                    <td><b>{alloc.person}</b></td>
                    <td>{alloc.role}</td>
                    <td>{alloc.scheduledStart}</td>
                    <td>{alloc.scheduledEnd}</td>
                    <td><span className="badge green">Assigned</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Milestones */}
      {activeTab === 'milestones' && (
        <div className="panel">
          <div className="panel-head">
            <h3>Engagement Timing &amp; Milestones</h3>
            <span className="caption">Deadlines mapped to deliverable commitments</span>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Phase / Milestone</th>
                  <th>Target Completion Date</th>
                  <th>Milestone Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {milestones.map((m, idx) => (
                  <tr key={idx}>
                    <td><b>{m.phase}</b></td>
                    <td>{m.targetDate}</td>
                    <td>
                      <span className={`badge ${m.status === 'Completed' ? 'green' : m.status === 'In progress' ? 'blue' : 'gray'}`}>
                        {m.status}
                      </span>
                    </td>
                    <td>
                      {m.status !== 'Completed' && (
                        <button
                          className="btn sm"
                          onClick={() => {
                            setMilestones(prev => prev.map((item, i) => i === idx ? { ...item, status: 'Completed' } : item));
                            triggerNotice('success', `Milestone "${m.phase}" marked as Completed.`);
                          }}
                        >
                          Mark Completed
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Version History & Independent Review */}
      {activeTab === 'history' && (
        <div className="stack" style={{ gap: 16 }}>
          <div className="panel panel-pad">
            <h3>Independent Plan Review</h3>
            <p className="sub mt4">
              Audit strategy and materiality thresholds require a recorded review by someone other than the preparer.
            </p>

            <div className="borderbox mt16" style={{ padding: 16, background: '#f8fafc' }}>
              <div className="info-grid">
                <div><label>Plan ID</label><span className="mono">{existingPlan?.id || `PLAN-${selectedEng.id}`}</span></div>
                <div><label>Current Revision</label><b>v{existingPlan?.version || 1}</b></div>
                <div><label>Prepared By</label><span>{existingPlan?.preparedBy || state.currentPerson}</span></div>
                <div><label>Approval Status</label><b>{existingPlan?.status || 'Draft'}</b></div>
              </div>

              {existingPlan?.reviewedBy && (
                <div className="mt12">
                  <span className="badge green">Reviewed by {existingPlan.reviewedBy} on {new Date(existingPlan.reviewedAt || '').toLocaleDateString()}</span>
                  <div className="cell-sub mt4">Notes: {existingPlan.reviewNotes || 'Approved without exception.'}</div>
                </div>
              )}

              <div className="mt16">
                <label className="caption">Review Notes &amp; Sign-off Basis</label>
                <textarea
                  className="input"
                  rows={2}
                  value={reviewNotes}
                  onChange={e => setReviewNotes(e.target.value)}
                />
              </div>

              <div className="row mt12" style={{ gap: 10 }}>
                <button
                  className="btn primary sm"
                  onClick={() => handleReviewPlan(true)}
                  disabled={!existingPlan || existingPlan.status !== 'Under review' || !['manager', 'reviewer', 'partner'].includes(state.currentRole)}
                >
                  Approve Audit Plan Strategy
                </button>
                <button
                  className="btn sm ghost"
                  onClick={() => handleReviewPlan(false)}
                  disabled={!existingPlan || existingPlan.status !== 'Under review' || !['manager', 'reviewer', 'partner'].includes(state.currentRole)}
                >
                  Return for Rework
                </button>
              </div>
            </div>
          </div>
          <div className="panel">
            <div className="panel-head"><h3>Saved Plan Revisions ({planHistory.length})</h3><span className="caption">Older revisions remain visible; only the latest approved revision clears planning.</span></div>
            <div className="tablewrap"><table><thead><tr><th>Version</th><th>Status</th><th>Prepared By</th><th>Reviewed By</th><th>Review Notes</th></tr></thead><tbody>
              {planHistory.map(plan => <tr key={plan.id}><td><b>v{plan.version}</b></td><td>{plan.status}</td><td>{plan.preparedBy || 'Unknown'}</td><td>{plan.reviewedBy || '—'}</td><td>{plan.reviewNotes || '—'}</td></tr>)}
            </tbody></table></div>
          </div>
        </div>
      )}
    </div>
  );
};
