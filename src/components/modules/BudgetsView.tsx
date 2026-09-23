// Module 13: Engagement Budgets & Variances (VP-029)
// Actuals are computed ONLY from approved time entries (§5.5). Submitted-but-
// unapproved time is shown separately; missing cost rates render as unknown,
// never zero. Supports authoring new budget versions, editing rates, and practice aggregation.
import React, { useState } from 'react';
import { RouteKey, BudgetRecord } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { formatCurrency, formatMinutesToHours } from '../../services/calculations';
import { visibleEngagementIds } from '../../services/guards';
import { Icon } from '../common/Icons';

interface BudgetsViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const BudgetsView: React.FC<BudgetsViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const [activeTab, setActiveTab] = useState<'single' | 'aggregation'>('single');
  const [showAuthorModal, setShowAuthorModal] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const allowedEngagementIds = visibleEngagementIds(state);
  const scopedEngagements = state.engagements.filter(e => allowedEngagementIds === 'ALL' || allowedEngagementIds.includes(e.id));
  const selectedEng = scopedEngagements.find(e => e.id === state.selectedEngagement) || (scopedEngagements.length === 1 ? scopedEngagements[0] : undefined);
  const client = state.clients.find(c => c.id === selectedEng?.client);

  const rawBudget = state.budgets.find(b => b.engagementId === selectedEng?.id);
  const currency = rawBudget?.currency || selectedEng?.currency || 'QAR';

  // Authoring state
  const [editLines, setEditLines] = useState<Array<{ roleOrActivity: string; plannedHours: number; billingRatePerHour: number; costRatePerHour: number | '' }>>([
    { roleOrActivity: 'Planning & Risk Assessment', plannedHours: 15, billingRatePerHour: 350, costRatePerHour: 120 },
    { roleOrActivity: 'Substantive Fieldwork', plannedHours: 40, billingRatePerHour: 250, costRatePerHour: 90 },
    { roleOrActivity: 'Senior Review & Clearance', plannedHours: 12, billingRatePerHour: 450, costRatePerHour: 180 },
    { roleOrActivity: 'Partner Final Review', plannedHours: 6, billingRatePerHour: 600, costRatePerHour: 250 }
  ]);

  const triggerNotice = (type: 'success' | 'error', text: string) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 6000);
  };

  const handleOpenAuthorModal = () => {
    setEditLines(rawBudget?.lines.map(l => ({
        roleOrActivity: l.roleOrActivity,
        plannedHours: l.plannedMinutes / 60,
        billingRatePerHour: l.billingRatePerHour,
        costRatePerHour: l.costRatePerHour ?? ''
      })) || [{ roleOrActivity: '', plannedHours: 0, billingRatePerHour: 0, costRatePerHour: '' }]);
    setShowAuthorModal(true);
  };

  const handleAddLine = () => {
    setEditLines(prev => [...prev, { roleOrActivity: 'New Activity', plannedHours: 10, billingRatePerHour: 250, costRatePerHour: 100 }]);
  };

  const handleRemoveLine = (index: number) => {
    setEditLines(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveBudgetVersion = () => {
    if (!selectedEng) return;
    try {
      const nextVersion = (rawBudget?.version || 0) + 1;
      const newBudgetLines = editLines.map((l, idx) => ({
        id: `BL-${nextVersion}-${idx + 1}`,
        roleOrActivity: l.roleOrActivity.trim(),
        plannedMinutes: Math.round(l.plannedHours * 60),
        billingRatePerHour: l.billingRatePerHour,
        costRatePerHour: l.costRatePerHour === '' ? undefined : l.costRatePerHour
      }));

      const newBudget: BudgetRecord = {
        id: rawBudget?.id || `BDG-${selectedEng.id}`,
        engagementId: selectedEng.id,
        version: nextVersion,
        currency,
        status: 'Approved',
        lines: newBudgetLines
      };

      prototypeStore.updateBudget(newBudget);
      setShowAuthorModal(false);
      triggerNotice('success', `Budget Version ${nextVersion} saved successfully with ${newBudgetLines.length} rate-bound activities.`);
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  if (!selectedEng) {
    return (
      <div className="panel panel-pad text-center" style={{ padding: '60px 20px' }}>
        <Icon name="calculator" size="lg" className="text-muted mb16" />
        <h3>No Active Engagement Selected</h3>
        <p className="sub max-w-md mx-auto mt8">
          Select one of your permitted engagements to view or author a budget.
        </p>
        <button className="btn primary sm mt16" onClick={() => onNavigate('engagements')}>
          Go to Engagements
        </button>
      </div>
    );
  }

  const approvedEntries = state.times.filter(
    t => t.engagementId === selectedEng?.id && t.status === 'Approved'
  );
  const submittedEntries = state.times.filter(
    t => t.engagementId === selectedEng?.id && t.status === 'Submitted'
  );

  interface LineActual { plannedMinutes: number; billingRate: number; costRate?: number; actualMinutes: number; actualValue: number | null; actualCost: number | null; }
  const budgetLines = rawBudget?.lines || [];
  const lineActuals: Array<{ label: string } & LineActual> = budgetLines.map((l, idx: number) => {
    const label = l.roleOrActivity || `Line ${idx + 1}`;
    const plannedMinutes = l.plannedMinutes ?? 0;
    const billingRate = l.billingRatePerHour;
    const costRate = l.costRatePerHour;
    const mine = approvedEntries.filter(t =>
      t.activity.toLowerCase() === String(l.roleOrActivity || '').toLowerCase());
    const actualMinutes = mine.reduce((s, t) => s + t.durationMinutes, 0);
    const billableEntries = mine.filter(t => t.billable);
    const actualValue = billableEntries.some(t => t.billingRatePerHour === undefined || !Number.isFinite(t.billingRatePerHour))
      ? null
      : Math.round(billableEntries.reduce((s, t) => s + (t.durationMinutes / 60) * t.billingRatePerHour!, 0) * 100) / 100;
    return {
      label,
      plannedMinutes,
      billingRate,
      costRate,
      actualMinutes,
      actualValue,
      actualCost: mine.some(t => t.costRatePerHour === undefined || !Number.isFinite(t.costRatePerHour))
        ? null
        : Math.round(mine.reduce((s, t) => s + (t.durationMinutes / 60) * t.costRatePerHour!, 0) * 100) / 100
    };
  });

  const totalPlannedMinutes = lineActuals.reduce((s, l) => s + l.plannedMinutes, 0);
  const totalActualMinutes = approvedEntries.reduce((s, t) => s + t.durationMinutes, 0);
  const unmatchedEntries = approvedEntries.filter(t => !budgetLines.some(l => l.roleOrActivity.trim().toLowerCase() === t.activity.trim().toLowerCase()));
  const totalPlannedBilling = Math.round(lineActuals.reduce((s, l) => s + (l.plannedMinutes / 60) * l.billingRate, 0) * 100) / 100;
  const totalActualBilling = approvedEntries.some(t => t.billable && (t.billingRatePerHour === undefined || !Number.isFinite(t.billingRatePerHour)))
    ? null
    : Math.round(approvedEntries.filter(t => t.billable).reduce((s, t) => s + (t.durationMinutes / 60) * t.billingRatePerHour!, 0) * 100) / 100;
  const hasUnknownCost = approvedEntries.some(t => t.costRatePerHour === undefined || !Number.isFinite(t.costRatePerHour));
  const totalActualCost = Math.round(approvedEntries.reduce((s, t) => s + (t.durationMinutes / 60) * (t.costRatePerHour || 0), 0) * 100) / 100;
  const varianceMinutes = totalActualMinutes - totalPlannedMinutes;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Engagement Budgets & Variances</h1>
          <p>Track planned versus actual hours, staff cost rates, and billing realization margins.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn primary sm" onClick={handleOpenAuthorModal}>
            <Icon name="plus" /> Author New Budget Version
          </button>
        </div>
      </div>

      {unmatchedEntries.length > 0 && (
        <div role="status" className="panel panel-pad" style={{ background: '#fffbeb', color: '#92400e' }}>
          {unmatchedEntries.reduce((s, t) => s + t.durationMinutes, 0)} approved minutes do not match a current budget activity. Their saved rate snapshots remain in totals, but they do not appear under a current budget line.
        </div>
      )}

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
        <button
          className={`tab-btn ${activeTab === 'single' ? 'active' : ''}`}
          onClick={() => setActiveTab('single')}
        >
          Selected Engagement ({selectedEng.id})
        </button>
        <button
          className={`tab-btn ${activeTab === 'aggregation' ? 'active' : ''}`}
          onClick={() => setActiveTab('aggregation')}
        >
          Practice-Wide Budget Aggregation ({scopedEngagements.length})
        </button>
      </div>

      {activeTab === 'single' ? (
        <>
          <div className="panel panel-pad">
            <div className="between">
              <div>
                <span className="eyebrow">ACTIVE BUDGET · {rawBudget?.id || 'New Draft'} · v{rawBudget?.version || '1'}</span>
                <h2>{client?.name} · {selectedEng?.service}</h2>
                <p className="sub">Reporting Period: FY {selectedEng?.year || 2026} · Actuals from approved time only</p>
              </div>
              <span className={`badge ${varianceMinutes > 0 ? 'amber' : 'green'}`}>
                Variance: {varianceMinutes >= 0 ? '+' : ''}{varianceMinutes} min
              </span>
            </div>

            {!rawBudget || lineActuals.length === 0 ? (
              <div className="borderbox mt16 text-center" style={{ padding: 24 }}>
                <b>No budget lines configured for this engagement.</b>
                <p className="sub mt4">Use the authoring button above to establish planned hours and staff rates.</p>
                <button className="btn primary sm mt12" onClick={handleOpenAuthorModal}>
                  Create Initial Budget Version
                </button>
              </div>
            ) : (
              <div className="metric-grid mt16">
                <div className="metric">
                  <span className="metric-label">Planned Hours</span>
                  <div className="metric-val">{formatMinutesToHours(totalPlannedMinutes)}</div>
                  <span className="metric-sub">Fee Estimate: {formatCurrency(totalPlannedBilling, currency)}</span>
                </div>
                <div className="metric blue">
                  <span className="metric-label">Actual Approved Hours</span>
                  <div className="metric-val">{formatMinutesToHours(totalActualMinutes)}</div>
                  <span className="metric-sub">
                    Delivery Cost: {hasUnknownCost ? 'Unknown (missing rate)' : formatCurrency(totalActualCost, currency)}
                  </span>
                </div>
                <div className="metric green">
                  <span className="metric-label">Billable Value (approved)</span>
                  <div className="metric-val">{totalActualBilling === null ? 'Unknown (unmapped activity)' : formatCurrency(totalActualBilling, currency)}</div>
                  <span className="metric-sub">
                    Variance: {varianceMinutes >= 0 ? '+' : ''}{varianceMinutes} min
                    {submittedEntries.length > 0 && ` · ${submittedEntries.reduce((s, t) => s + t.durationMinutes, 0)} min pending`}
                  </span>
                </div>
              </div>
            )}
          </div>

          {rawBudget && lineActuals.length > 0 && (
            <div className="panel">
              <div className="panel-head">
                <h3>Budget vs Actual by Role / Activity</h3>
                <span className="caption">Approved time entries only</span>
              </div>
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>Role / Activity</th>
                      <th>Current Billing Rate</th>
                      <th>Current Cost Rate</th>
                      <th>Planned</th>
                      <th>Actual (approved)</th>
                      <th>Variance</th>
                      <th>Actual Cost</th>
                      <th>Billable Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineActuals.map((l, i) => {
                      const varMin = l.actualMinutes - l.plannedMinutes;
                      return (
                        <tr key={i}>
                          <td><b>{l.label}</b></td>
                          <td>{formatCurrency(l.billingRate, currency)} / hr</td>
                          <td>{l.costRate === undefined || l.costRate === null ? 'Unknown' : `${formatCurrency(l.costRate, currency)} / hr`}</td>
                          <td>{formatMinutesToHours(l.plannedMinutes)}</td>
                          <td><b>{formatMinutesToHours(l.actualMinutes)}</b></td>
                          <td>
                            <span className={`badge ${varMin > 0 ? 'amber' : 'green'}`}>
                              {varMin > 0 ? `+${varMin} min` : `${varMin} min`}
                            </span>
                          </td>
                          <td>{l.actualCost === null ? 'Unknown' : formatCurrency(l.actualCost, currency)}</td>
                          <td><b>{l.actualValue === null ? 'Unknown' : formatCurrency(l.actualValue, currency)}</b></td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td><b>Practice Totals</b></td>
                      <td>—</td>
                      <td>—</td>
                      <td><b>{formatMinutesToHours(totalPlannedMinutes)}</b></td>
                      <td><b>{formatMinutesToHours(totalActualMinutes)}</b></td>
                      <td>
                        <span className={`badge ${varianceMinutes > 0 ? 'amber' : 'green'}`}>
                          {varianceMinutes} min
                        </span>
                      </td>
                      <td><b>{hasUnknownCost ? 'Unknown' : formatCurrency(totalActualCost, currency)}</b></td>
                      <td><b>{totalActualBilling === null ? 'Unknown' : formatCurrency(totalActualBilling, currency)}</b></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
          {rawBudget?.history && rawBudget.history.length > 0 && (
            <details className="panel panel-pad">
              <summary><b>Prior budget revisions ({rawBudget.history.length})</b></summary>
              <div className="tablewrap mt12">
                <table>
                  <thead><tr><th>Revision</th><th>Activities</th><th>Saved By</th><th>Saved At</th></tr></thead>
                  <tbody>{rawBudget.history.map(v => (
                    <tr key={v.version}><td>v{v.version}</td><td>{v.lines.length}</td><td>{v.savedBy}</td><td>{new Date(v.savedAt).toLocaleString('en-GB')}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </details>
          )}
        </>
      ) : (
        /* Practice-Wide Aggregation Table */
        <div className="panel">
          <div className="panel-head">
            <h3>Practice-Wide Engagement Budget Aggregation</h3>
            <span className="caption">Aggregated from approved time without double counting</span>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Engagement</th>
                  <th>Client</th>
                  <th>Service</th>
                  <th>Budget Version</th>
                  <th>Agreed Fee</th>
                  <th>Approved Hours</th>
                  <th>Billable Value</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {scopedEngagements.map(eng => {
                  const cl = state.clients.find(c => c.id === eng.client);
                  const bdg = state.budgets.find(b => b.engagementId === eng.id);
                  const approvedTimes = state.times.filter(t => t.engagementId === eng.id && t.status === 'Approved');
                  const actualMins = approvedTimes.reduce((s, t) => s + t.durationMinutes, 0);
                  const values = approvedTimes.filter(t => t.billable).map(t => {
                    const line = bdg?.lines.find(l => l.roleOrActivity.trim().toLowerCase() === t.activity.trim().toLowerCase());
                    return line ? (t.durationMinutes / 60) * line.billingRatePerHour : null;
                  });
                  const billableVal = values.some(v => v === null) ? null : Math.round((values as number[]).reduce((s, value) => s + value, 0) * 100) / 100;

                  return (
                    <tr key={eng.id}>
                      <td><span className="mono">{eng.id}</span></td>
                      <td><b>{cl?.name || eng.client}</b></td>
                      <td>{eng.service}</td>
                      <td><span className="badge gray">v{bdg?.version || 1}</span></td>
                      <td><b>{formatCurrency(eng.agreedFee, eng.currency)}</b></td>
                      <td>{formatMinutesToHours(actualMins)}</td>
                      <td><b>{billableVal === null ? 'Unknown (unmapped activity)' : formatCurrency(billableVal, eng.currency)}</b></td>
                      <td>
                        <button
                          className="btn sm"
                          onClick={() => {
                            prototypeStore.setSelectedEngagement(eng.id);
                            setActiveTab('single');
                          }}
                        >
                          Drill Down
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Authoring & Rate Editing Modal */}
      {showAuthorModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: 700 }}>
            <div className="between">
              <h3>Author Budget Version (v{(rawBudget?.version || 0) + 1})</h3>
              <button className="btn sm ghost" onClick={() => setShowAuthorModal(false)}>✕</button>
            </div>
            <p className="sub mt4">
              Configure planned hours, billing realization rates, and staff delivery cost rates for {client?.name} ({selectedEng.id}).
            </p>

            <div className="stack mt16" style={{ gap: 12 }}>
              {editLines.map((line, idx) => (
                <div key={idx} className="borderbox" style={{ padding: 12 }}>
                  <div className="between">
                    <span className="eyebrow">ACTIVITY {idx + 1}</span>
                    {editLines.length > 1 && (
                      <button className="btn sm ghost text-danger" onClick={() => handleRemoveLine(idx)}>Remove</button>
                    )}
                  </div>
                  <div className="grid4 mt8" style={{ gap: 8 }}>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label className="caption">Role / Activity</label>
                      <input
                        type="text"
                        className="input"
                        value={line.roleOrActivity}
                        onChange={e => {
                          const val = e.target.value;
                          setEditLines(prev => prev.map((item, i) => i === idx ? { ...item, roleOrActivity: val } : item));
                        }}
                      />
                    </div>
                    <div>
                      <label className="caption">Planned Hours</label>
                      <input
                        type="number"
                        className="input"
                        value={line.plannedHours}
                        onChange={e => {
                          const val = Number(e.target.value);
                          setEditLines(prev => prev.map((item, i) => i === idx ? { ...item, plannedHours: val } : item));
                        }}
                      />
                    </div>
                    <div>
                      <label className="caption">Billing Rate (/hr)</label>
                      <input
                        type="number"
                        className="input"
                        value={line.billingRatePerHour}
                        onChange={e => {
                          const val = Number(e.target.value);
                          setEditLines(prev => prev.map((item, i) => i === idx ? { ...item, billingRatePerHour: val } : item));
                        }}
                      />
                    </div>
                  </div>
                  <div className="mt8" style={{ maxWidth: 220 }}>
                    <label className="caption">Cost Rate (/hr)</label>
                    <input
                      type="number"
                      className="input"
                      value={line.costRatePerHour}
                    onChange={e => {
                        const val = e.target.value === '' ? '' : Number(e.target.value);
                        setEditLines(prev => prev.map((item, i) => i === idx ? { ...item, costRatePerHour: val } : item));
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <button className="btn sm ghost mt12" onClick={handleAddLine}>
              <Icon name="plus" /> Add Activity Line
            </button>

            <div className="row mt20" style={{ gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn sm ghost" onClick={() => setShowAuthorModal(false)}>Cancel</button>
              <button className="btn primary sm" onClick={handleSaveBudgetVersion}>
                Save Version {(rawBudget?.version || 0) + 1}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
