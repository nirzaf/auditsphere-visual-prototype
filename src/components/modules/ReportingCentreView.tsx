// Module 16: Practice Reporting Centre & Business Intelligence (VP-060)
// Computed operational practice metrics, live WIP calculation from approved time & invoices,
// staff chargeability utilization, interactive filters, drill-down modals, and scoped CSV exports.

import React, { useState } from 'react';
import { RouteKey, EngagementRecord, TimeEntryItem } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';
import { formatCurrency, formatMinutesToHours } from '../../services/calculations';
import { exportService } from '../../services/exportService';

interface ReportingCentreViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const ReportingCentreView: React.FC<ReportingCentreViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const [selectedReport, setSelectedReport] = useState<'wip' | 'utilization' | 'compliance'>('wip');
  const [clientFilter, setClientFilter] = useState<string>('ALL');
  const [drillDownEng, setDrillDownEng] = useState<EngagementRecord | null>(null);

  // Filtered engagements
  const filteredEngs = state.engagements.filter(
    e => clientFilter === 'ALL' || e.client === clientFilter
  );

  // Compute live WIP rows from demo records
  const wipRows = filteredEngs.map(eng => {
    const cl = state.clients.find(c => c.id === eng.client);
    const approvedTimes = state.times.filter(t => t.engagementId === eng.id && t.status === 'Approved');
    const totalMinutes = approvedTimes.reduce((sum, t) => sum + t.durationMinutes, 0);
    const billableMinutes = approvedTimes.filter(t => t.billable).reduce((sum, t) => sum + t.durationMinutes, 0);

    // Compute fee value (using budget lines or standard rate 350 QAR/hr)
    const bdg = state.budgets.find(b => b.engagementId === eng.id);
    const recordedWipValue = approvedTimes.reduce((sum, t) => {
      const line = bdg?.lines.find(l => l.roleOrActivity.toLowerCase() === t.activity.toLowerCase());
      const rate = line?.billingRatePerHour || 350;
      return sum + Math.round((t.durationMinutes / 60) * rate);
    }, 0);

    // Invoices issued for this client
    const clientInvoices = state.invoices.filter(i => i.clientId === eng.client && i.status !== 'Draft');
    const billedAmount = clientInvoices.reduce((sum, i) => sum + i.amount, 0);
    const unbilledWip = Math.max(0, recordedWipValue - billedAmount);

    return {
      eng,
      clientName: cl?.name || eng.client,
      service: eng.service,
      approvedTimes,
      totalHours: formatMinutesToHours(totalMinutes),
      recordedWipValue,
      billedAmount,
      unbilledWip
    };
  });

  const totalWipValue = wipRows.reduce((sum, r) => sum + r.recordedWipValue, 0);
  const totalBilled = wipRows.reduce((sum, r) => sum + r.billedAmount, 0);
  const totalUnbilled = wipRows.reduce((sum, r) => sum + r.unbilledWip, 0);

  // Compute live staff utilization from state.times
  const usersWithTimes = state.users.filter(u => u.group === 'Professional');
  const utilizationRows = usersWithTimes.map(user => {
    const userTimes = state.times.filter(t => t.person === user.name && t.status === 'Approved');
    const billableMinutes = userTimes.filter(t => t.billable).reduce((sum, t) => sum + t.durationMinutes, 0);
    const nonBillableMinutes = userTimes.filter(t => !t.billable).reduce((sum, t) => sum + t.durationMinutes, 0);
    const totalUserMinutes = billableMinutes + nonBillableMinutes;
    const billableHours = Math.round(billableMinutes / 60);
    const nonBillableHours = Math.round(nonBillableMinutes / 60);
    const targetPct = user.role === 'partner' ? 50 : user.role === 'manager' ? 75 : 85;
    const actualPct = totalUserMinutes > 0 ? Math.round((billableMinutes / totalUserMinutes) * 100) : 0;

    return {
      name: user.name,
      role: user.label,
      billableHours,
      nonBillableHours,
      targetPct,
      actualPct
    };
  });

  const handleExportCSV = () => {
    if (selectedReport === 'wip') {
      const headers = ['Client Name', 'Engagement Service', 'Total WIP Hours', 'Recorded WIP Value (QAR)', 'Billed Fees (QAR)', 'Unbilled WIP (QAR)'];
      const dataRows = wipRows.map(r => [
        r.clientName,
        r.service,
        r.totalHours,
        String(r.recordedWipValue),
        String(r.billedAmount),
        String(r.unbilledWip)
      ]);
      exportService.exportCSV('WIP_Billing_Realization_Report', [headers, ...dataRows]);
    } else if (selectedReport === 'utilization') {
      const headers = ['Staff Member', 'Practice Role', 'Billable Hours', 'Non-Billable Hours', 'Target Utilization %', 'Actual Utilization %'];
      const dataRows = utilizationRows.map(u => [
        u.name,
        u.role,
        String(u.billableHours),
        String(u.nonBillableHours),
        `${u.targetPct}%`,
        `${u.actualPct}%`
      ]);
      exportService.exportCSV('Staff_Chargeability_Utilization_Report', [headers, ...dataRows]);
    } else {
      const headers = ['Engagement ID', 'Client Name', 'Service', 'Statutory Year', 'Filing Due Date', 'Audit Stage', 'Signing Partner'];
      const dataRows = filteredEngs.map(e => {
        const cl = state.clients.find(c => c.id === e.client);
        return [e.id, cl?.name || e.client, e.service, String(e.year), e.due, e.stage, e.partner];
      });
      exportService.exportCSV('Statutory_Compliance_Calendar_Report', [headers, ...dataRows]);
    }
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Practice Reporting Centre</h1>
          <p>Computed practice intelligence, WIP tracking, staff realization, and filtered operational exports.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn primary sm" onClick={handleExportCSV}>
            <Icon name="download" /> Export Active Report (CSV)
          </button>
        </div>
      </div>

      <div className="between">
        <div className="tabs" style={{ marginBottom: 0 }}>
          <button className={`tab-btn ${selectedReport === 'wip' ? 'active' : ''}`} onClick={() => setSelectedReport('wip')}>
            Work In Progress (WIP) &amp; Billing Realization
          </button>
          <button className={`tab-btn ${selectedReport === 'utilization' ? 'active' : ''}`} onClick={() => setSelectedReport('utilization')}>
            Staff Chargeability &amp; Utilization
          </button>
          <button className={`tab-btn ${selectedReport === 'compliance' ? 'active' : ''}`} onClick={() => setSelectedReport('compliance')}>
            Statutory Deadlines &amp; Compliance Calendar
          </button>
        </div>

        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <label className="caption">Filter Client:</label>
          <select
            className="input sm"
            value={clientFilter}
            onChange={e => setClientFilter(e.target.value)}
            style={{ width: 180 }}
          >
            <option value="ALL">All Clients ({state.clients.length})</option>
            {state.clients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* REPORT 1: WIP Breakdown */}
      {selectedReport === 'wip' && (
        <div className="stack" style={{ gap: 16 }}>
          <div className="metric-grid">
            <div className="metric">
              <span className="metric-label">Unbilled WIP Total</span>
              <div className="metric-val">{formatCurrency(totalUnbilled)}</div>
              <span className="metric-sub">From approved timesheets</span>
            </div>
            <div className="metric blue">
              <span className="metric-label">Total Incurred Fees</span>
              <div className="metric-val">{formatCurrency(totalWipValue)}</div>
              <span className="metric-sub">Across {filteredEngs.length} mandate(s)</span>
            </div>
            <div className="metric green">
              <span className="metric-label">Billed Collections</span>
              <div className="metric-val">{formatCurrency(totalBilled)}</div>
              <span className="metric-sub">Issued tax invoices</span>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head between">
              <div>
                <h3>Computed Engagement WIP Breakdown</h3>
                <span className="caption">Calculated from approved time entries and issued invoices</span>
              </div>
              <span className="caption">Count: {wipRows.length} mandates</span>
            </div>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Client Entity</th>
                    <th>Engagement Service</th>
                    <th>Approved Hours</th>
                    <th>Recorded WIP Value</th>
                    <th>Billed Fees</th>
                    <th>Unbilled Balance</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {wipRows.map((r, idx) => (
                    <tr key={idx}>
                      <td><b>{r.clientName}</b></td>
                      <td>{r.service}</td>
                      <td>{r.totalHours}</td>
                      <td><b>{formatCurrency(r.recordedWipValue)}</b></td>
                      <td>{formatCurrency(r.billedAmount)}</td>
                      <td>
                        <span className={`badge ${r.unbilledWip > 0 ? 'amber' : 'green'}`}>
                          {formatCurrency(r.unbilledWip)}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn sm ghost"
                          onClick={() => setDrillDownEng(r.eng)}
                        >
                          Drill Down ({r.approvedTimes.length} entries)
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td><b>Filtered Totals</b></td>
                    <td>—</td>
                    <td>—</td>
                    <td><b>{formatCurrency(totalWipValue)}</b></td>
                    <td><b>{formatCurrency(totalBilled)}</b></td>
                    <td><b>{formatCurrency(totalUnbilled)}</b></td>
                    <td>—</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* REPORT 2: Staff Chargeability */}
      {selectedReport === 'utilization' && (
        <div className="panel">
          <div className="panel-head between">
            <div>
              <h3>Staff Chargeability &amp; Productivity Analysis</h3>
              <span className="caption">Computed live from approved timesheet entries grouped by persona</span>
            </div>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Staff Member</th>
                  <th>Practice Role</th>
                  <th>Billable Hours</th>
                  <th>Non-Billable Hours</th>
                  <th>Target Utilization</th>
                  <th>Actual Utilization</th>
                  <th>Performance Variance</th>
                </tr>
              </thead>
              <tbody>
                {utilizationRows.map((u, idx) => {
                  const varPct = u.actualPct - u.targetPct;
                  return (
                    <tr key={idx}>
                      <td><b>{u.name}</b></td>
                      <td>{u.role}</td>
                      <td><b>{u.billableHours} hrs</b></td>
                      <td>{u.nonBillableHours} hrs</td>
                      <td>{u.targetPct}%</td>
                      <td><b>{u.actualPct}%</b></td>
                      <td>
                        <span className={`badge ${varPct >= 0 ? 'green' : 'amber'}`}>
                          {varPct >= 0 ? `+${varPct}%` : `${varPct}%`}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* REPORT 3: Statutory Compliance Calendar */}
      {selectedReport === 'compliance' && (
        <div className="panel">
          <div className="panel-head between">
            <div>
              <h3>Mandatory Statutory Filing &amp; Compliance Calendar</h3>
              <span className="caption">Statutory audit filing deadlines across active practice engagements</span>
            </div>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Engagement</th>
                  <th>Client Entity</th>
                  <th>Service</th>
                  <th>FY Period</th>
                  <th>Filing Due Date</th>
                  <th>Engagement Stage</th>
                  <th>Signing Partner</th>
                </tr>
              </thead>
              <tbody>
                {filteredEngs.map(e => {
                  const cl = state.clients.find(c => c.id === e.client);
                  return (
                    <tr key={e.id}>
                      <td><span className="mono">{e.id}</span></td>
                      <td><b>{cl?.name || e.client}</b></td>
                      <td>{e.service}</td>
                      <td>FY {e.year}</td>
                      <td><b>{e.due}</b></td>
                      <td><span className="badge blue">{e.stage}</span></td>
                      <td>{e.partner}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Drill Down Modal */}
      {drillDownEng && (
        <div className="modal-overlay" onClick={() => setDrillDownEng(null)}>
          <div className="modal-card" style={{ maxWidth: 700 }} onClick={e => e.stopPropagation()}>
            <div className="between">
              <h3>WIP Time Drill-Down: {drillDownEng.id}</h3>
              <button className="btn sm ghost" onClick={() => setDrillDownEng(null)}>✕</button>
            </div>
            <p className="sub mt4">
              Approved timesheet entries contributing to engagement WIP.
            </p>

            <div className="tablewrap mt16">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Team Member</th>
                    <th>Activity</th>
                    <th>Duration</th>
                    <th>Billable</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {state.times
                    .filter(t => t.engagementId === drillDownEng.id && t.status === 'Approved')
                    .map(t => (
                      <tr key={t.id}>
                        <td>{t.date}</td>
                        <td><b>{t.person}</b></td>
                        <td>{t.activity}</td>
                        <td>{formatMinutesToHours(t.durationMinutes)}</td>
                        <td>{t.billable ? 'Yes' : 'No'}</td>
                        <td><span className="badge green">{t.status}</span></td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div className="row mt20" style={{ justifyContent: 'flex-end' }}>
              <button className="btn sm" onClick={() => setDrillDownEng(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
