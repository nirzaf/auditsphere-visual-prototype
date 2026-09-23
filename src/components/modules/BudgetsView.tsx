// Module 13: Engagement Budgets & Variances (VP-029, VP-030)
import React from 'react';
import { RouteKey } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';
import { formatCurrency } from '../../services/calculations';

interface BudgetsViewProps {
  onNavigate: (route: RouteKey) => void;
}

interface NormalizedBudgetLine {
  role: string;
  plannedHours: number;
  actualHours: number;
  billingRate: number;
  costRate: number;
}

export const BudgetsView: React.FC<BudgetsViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const selectedEng = state.engagements.find(e => e.id === state.selectedEngagement) || state.engagements[0];
  const client = state.clients.find(c => c.id === selectedEng?.client);

  const rawBudget = state.budgets.find(b => b.engagementId === selectedEng?.id);
  const currency = rawBudget?.currency || 'QAR';

  const defaultLines: NormalizedBudgetLine[] = [
    { role: 'Partner', plannedHours: 40, actualHours: 25, billingRate: 1500, costRate: 600 },
    { role: 'Manager', plannedHours: 80, actualHours: 65, billingRate: 900, costRate: 350 },
    { role: 'Senior', plannedHours: 120, actualHours: 110, billingRate: 600, costRate: 220 },
    { role: 'Associate', plannedHours: 80, actualHours: 90, billingRate: 400, costRate: 140 }
  ];

  const budgetLines: NormalizedBudgetLine[] = rawBudget && rawBudget.lines.length > 0
    ? rawBudget.lines.map((l: any, idx: number) => ({
        role: l.roleOrActivity || l.role || `Role ${idx + 1}`,
        plannedHours: l.plannedHours ?? (l.plannedMinutes ? l.plannedMinutes / 60 : 40),
        actualHours: l.actualHours ?? 30,
        billingRate: l.billingRate ?? l.billingRatePerHour ?? 500,
        costRate: l.costRate ?? l.costRatePerHour ?? 200
      }))
    : defaultLines;

  const totalPlannedHours = budgetLines.reduce((s, l) => s + l.plannedHours, 0);
  const totalActualHours = budgetLines.reduce((s, l) => s + l.actualHours, 0);
  const totalPlannedBilling = budgetLines.reduce((s, l) => s + (l.plannedHours * l.billingRate), 0);
  const totalActualBilling = budgetLines.reduce((s, l) => s + (l.actualHours * l.billingRate), 0);
  const totalActualCost = budgetLines.reduce((s, l) => s + (l.actualHours * l.costRate), 0);
  const recoveryMargin = totalActualBilling > 0 ? Math.round(((totalActualBilling - totalActualCost) / totalActualBilling) * 100) : 0;

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
            <span className="eyebrow">ACTIVE BUDGET · {rawBudget?.id || 'BGT-2026-001'}</span>
            <h2>{client?.name} · {selectedEng?.service}</h2>
            <p className="sub">Reporting Period: FY {selectedEng?.year || 2026}</p>
          </div>
          <span className="badge green">Realization: {recoveryMargin}%</span>
        </div>

        {/* Metric Grid */}
        <div className="metric-grid mt16">
          <div className="metric">
            <span className="metric-label">Planned Hours</span>
            <div className="metric-val">{totalPlannedHours} hrs</div>
            <span className="metric-sub">Fee Estimate: {formatCurrency(totalPlannedBilling, currency)}</span>
          </div>
          <div className="metric blue">
            <span className="metric-label">Actual Hours Incurred</span>
            <div className="metric-val">{totalActualHours} hrs</div>
            <span className="metric-sub">Delivery Cost: {formatCurrency(totalActualCost, currency)}</span>
          </div>
          <div className="metric green">
            <span className="metric-label">Realized Value (WIP)</span>
            <div className="metric-val">{formatCurrency(totalActualBilling, currency)}</div>
            <span className="metric-sub">Recovery Margin: {recoveryMargin}%</span>
          </div>
        </div>
      </div>

      {/* Staff Grade Breakdown */}
      <div className="panel">
        <div className="panel-head">
          <h3>Budget vs Actual by Staff Grade</h3>
          <span className="caption">Real-time timesheet synchronization</span>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Staff Grade</th>
                <th>Billing Rate</th>
                <th>Cost Rate</th>
                <th>Planned Hrs</th>
                <th>Actual Hrs</th>
                <th>Hour Variance</th>
                <th>Actual Cost</th>
                <th>Realized Value</th>
              </tr>
            </thead>
            <tbody>
              {budgetLines.map((l, i) => {
                const varHrs = l.actualHours - l.plannedHours;
                return (
                  <tr key={i}>
                    <td><b>{l.role}</b></td>
                    <td>{formatCurrency(l.billingRate, currency)} / hr</td>
                    <td>{formatCurrency(l.costRate, currency)} / hr</td>
                    <td>{l.plannedHours}</td>
                    <td><b>{l.actualHours}</b></td>
                    <td>
                      <span className={`badge ${varHrs > 0 ? 'amber' : 'green'}`}>
                        {varHrs > 0 ? `+${varHrs} hrs` : `${varHrs} hrs`}
                      </span>
                    </td>
                    <td>{formatCurrency(l.actualHours * l.costRate, currency)}</td>
                    <td><b>{formatCurrency(l.actualHours * l.billingRate, currency)}</b></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td><b>Practice Totals</b></td>
                <td>—</td>
                <td>—</td>
                <td><b>{totalPlannedHours} hrs</b></td>
                <td><b>{totalActualHours} hrs</b></td>
                <td>
                  <span className={`badge ${totalActualHours > totalPlannedHours ? 'amber' : 'green'}`}>
                    {totalActualHours - totalPlannedHours} hrs
                  </span>
                </td>
                <td><b>{formatCurrency(totalActualCost, currency)}</b></td>
                <td><b>{formatCurrency(totalActualBilling, currency)}</b></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};
