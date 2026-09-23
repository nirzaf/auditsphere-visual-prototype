// Module 13: Engagement Budgets & Variances (VP-029)
// Actuals are computed ONLY from approved time entries (§5.5). Submitted-but-
// unapproved time is shown separately; missing cost rates render as unknown,
// never zero. No budget for the engagement yields an honest empty state.
import React from 'react';
import { RouteKey } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { formatCurrency, formatMinutesToHours } from '../../services/calculations';
import { Icon } from '../common/Icons';

interface BudgetsViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const BudgetsView: React.FC<BudgetsViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const selectedEng = state.engagements.find(e => e.id === state.selectedEngagement) || state.engagements[0];
  const client = state.clients.find(c => c.id === selectedEng?.client);

  if (!selectedEng) {
    return (
      <div className="panel panel-pad text-center" style={{ padding: '60px 20px' }}>
        <Icon name="calculator" size="lg" className="text-muted mb16" />
        <h3>No Active Engagement Selected</h3>
        <p className="sub max-w-md mx-auto mt8">
          Select or create an engagement to analyze engagement budgets and staff cost variances.
        </p>
        <button className="btn primary sm mt16" onClick={() => onNavigate('engagements')}>
          Go to Engagements
        </button>
      </div>
    );
  }

  const rawBudget = state.budgets.find(b => b.engagementId === selectedEng?.id);
  const currency = rawBudget?.currency || 'QAR';

  const approvedEntries = state.times.filter(
    t => t.engagementId === selectedEng?.id && t.status === 'Approved'
  );
  const submittedEntries = state.times.filter(
    t => t.engagementId === selectedEng?.id && t.status === 'Submitted'
  );

  interface LineActual { plannedMinutes: number; billingRate: number; costRate?: number; actualMinutes: number; actualValue: number; actualCost: number | null; }
  const budgetLines = rawBudget?.lines || [];
  const lineActuals: Array<{ label: string } & LineActual> = budgetLines.map((l, idx: number) => {
    const label = l.roleOrActivity || `Line ${idx + 1}`;
    const plannedMinutes = l.plannedMinutes ?? 0;
    const billingRate = l.billingRatePerHour ?? 200;
    const costRate = l.costRatePerHour;
    const mine = approvedEntries.filter(t =>
      t.activity.toLowerCase() === String(l.roleOrActivity || '').toLowerCase());
    // Entries whose activity matches no line are attributed once to the first line,
    // mirroring the shared budget-analysis rule; engagement totals never double count.
    const attributed = (idx === 0)
      ? [...mine, ...approvedEntries.filter(t => !budgetLines.some(x =>
          t.activity.toLowerCase() === String(x.roleOrActivity || '').toLowerCase()))]
      : mine;
    const actualMinutes = attributed.reduce((s, t) => s + t.durationMinutes, 0);
    const billableMinutes = attributed.filter(t => t.billable).reduce((s, t) => s + t.durationMinutes, 0);
    return {
      label,
      plannedMinutes,
      billingRate,
      costRate,
      actualMinutes,
      actualValue: Math.round((billableMinutes / 60) * billingRate),
      actualCost: costRate === undefined || costRate === null
        ? null
        : Math.round((actualMinutes / 60) * costRate)
    };
  });

  const totalPlannedMinutes = lineActuals.reduce((s, l) => s + l.plannedMinutes, 0);
  const totalActualMinutes = lineActuals.reduce((s, l) => s + l.actualMinutes, 0);
  const totalPlannedBilling = lineActuals.reduce((s, l) => s + Math.round((l.plannedMinutes / 60) * l.billingRate), 0);
  const totalActualBilling = lineActuals.reduce((s, l) => s + l.actualValue, 0);
  const hasUnknownCost = lineActuals.some(l => l.actualCost === null && l.actualMinutes > 0);
  const totalActualCost = lineActuals.reduce((s, l) => s + (l.actualCost || 0), 0);
  const varianceMinutes = totalActualMinutes - totalPlannedMinutes;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Engagement Budgets & Variances</h1>
          <p>Track planned versus actual hours, staff cost rates, and billing realization margins.</p>
        </div>
      </div>

      <div className="panel panel-pad">
        <div className="between">
          <div>
            <span className="eyebrow">ACTIVE BUDGET · {rawBudget?.id || 'none'} · v{rawBudget?.version || '—'}</span>
            <h2>{client?.name} · {selectedEng?.service}</h2>
            <p className="sub">Reporting Period: FY {selectedEng?.year || 2026} · Actuals from approved time only</p>
          </div>
          <span className="badge green">Variance: {varianceMinutes >= 0 ? '+' : ''}{varianceMinutes} min</span>
        </div>

        {!rawBudget || lineActuals.length === 0 ? (
          <div className="borderbox mt16" style={{ padding: 16 }}>
            <b>No budget versions exist for this engagement.</b>
            <p className="sub mt4">Honest empty state — no illustrative figures are shown. Budget authoring (a versioned editor with distinct billing and cost rates) is a documented limitation; see the prototype note below.</p>
          </div>
        ) : (
        <>
        {/* Metric Grid */}
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
              Delivery Cost: {hasUnknownCost ? 'Unknown — a cost rate is missing (not zero)' : formatCurrency(totalActualCost, currency)}
            </span>
          </div>
          <div className="metric green">
            <span className="metric-label">Billable Value (approved)</span>
            <div className="metric-val">{formatCurrency(totalActualBilling, currency)}</div>
            <span className="metric-sub">
              Variance: {varianceMinutes >= 0 ? '+' : ''}{varianceMinutes} min (positive = over budget)
              {submittedEntries.length > 0 && ` · ${submittedEntries.reduce((s, t) => s + t.durationMinutes, 0)} min submitted but unapproved, excluded`}
            </span>
          </div>
        </div>
        </>
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
                <th>Billing Rate</th>
                <th>Cost Rate</th>
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
                    <td><b>{formatCurrency(l.actualValue, currency)}</b></td>
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
                <td><b>{formatCurrency(totalActualBilling, currency)}</b></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      )}

      <div className="panel panel-pad" style={{ background: '#fffbeb', borderLeft: '4px solid #d97706' }}>
        <b>Prototype note — budget authoring.</b>
        <p className="sub mt4">
          This view compares versioned budgets against approved time only. Creating new budget versions,
          editing rates (which must version, never rewrite history), and engagement-level aggregation
          without double counting are supported by the store but have no editor UI yet; seeded version
          BDG-26001 is the demonstration source. No capacity optimizer, roster, scheduling or
          recurring-budget behaviour exists or is planned for the prototype.
        </p>
      </div>
    </div>
  );
};
