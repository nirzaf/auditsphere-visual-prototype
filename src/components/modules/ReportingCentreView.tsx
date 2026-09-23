// Module 16: Practice Reporting Centre & Business Intelligence (VP-060)
import React, { useState } from 'react';
import { RouteKey } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';
import { formatCurrency } from '../../services/calculations';
import { exportService } from '../../services/exportService';

interface ReportingCentreViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const ReportingCentreView: React.FC<ReportingCentreViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const [selectedReport, setSelectedReport] = useState<string>('wip');

  const handleExportCSV = (reportName: string) => {
    let rows: string[][] = [];
    if (reportName === 'wip') {
      rows = [
        ['Client Name', 'Engagement Service', 'Total WIP Hours', 'Recorded WIP Value (QAR)', 'Billed Fees', 'Unbilled Balance'],
        ['Example Trading Entity', 'Statutory Financial Audit', '290 hrs', '385,000', '200,000', '185,000'],
        ['Northstar Services LLC', 'IFRS Advisory & Review', '110 hrs', '125,000', '125,000', '0']
      ];
    } else {
      rows = [
        ['Staff Member', 'Grade', 'Billable Hours', 'Non-Billable Hours', 'Target Utilization %', 'Actual Utilization %'],
        ['Daniel James', 'Partner', '45', '120', '50%', '52%'],
        ['Layla Rahman', 'Manager', '95', '60', '75%', '81%'],
        ['Adam Khan', 'Senior', '140', '25', '85%', '89%']
      ];
    }
    exportService.exportCSV(reportName, rows);
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Practice Reporting Centre</h1>
          <p>Practice intelligence, WIP analysis, staff recovery realization, and demonstration report exports.</p>
        </div>
        <button className="btn primary sm" onClick={() => handleExportCSV(selectedReport)}>
          <Icon name="download" /> Export Active Report (CSV)
        </button>
      </div>

      <div className="tabs">
        <button className={`tab-btn ${selectedReport === 'wip' ? 'active' : ''}`} onClick={() => setSelectedReport('wip')}>
          Work In Progress (WIP) & Billing Realization
        </button>
        <button className={`tab-btn ${selectedReport === 'utilization' ? 'active' : ''}`} onClick={() => setSelectedReport('utilization')}>
          Staff Chargeability & Utilization
        </button>
        <button className={`tab-btn ${selectedReport === 'compliance' ? 'active' : ''}`} onClick={() => setSelectedReport('compliance')}>
          Statutory Deadlines & Compliance Calendar
        </button>
      </div>

      <div className="panel panel-pad" style={{ background: '#fffbeb', borderLeft: '4px solid #d97706' }}>
        <b>Prototype note — computed vs illustrative figures.</b>
        <p className="sub mt4">
          The WIP and utilization tables below are static illustrative fixtures, not values computed
          from demo records; the CSV export mirrors the displayed fixture rows exactly. Live computed
          reporting from budgets, approved time, invoices, receipts and aging is demonstrated in the
          Budgets and Receivables views. Filtered operational reports with drill-downs and scoped
          exports (VP-060) remain a documented limitation — see docs/prototype/remaining-limitations.md.
        </p>
      </div>

      {selectedReport === 'wip' && (
        <div className="stack" style={{ gap: 16 }}>
          <div className="metric-grid">
            <div className="metric">
              <span className="metric-label">Unbilled WIP Total</span>
              <div className="metric-val">{formatCurrency(185000)}</div>
              <span className="metric-sub">Pending milestone billing</span>
            </div>
            <div className="metric blue">
              <span className="metric-label">Total Incurred Fees</span>
              <div className="metric-val">{formatCurrency(510000)}</div>
              <span className="metric-sub">Across 2 active audit mandates</span>
            </div>
            <div className="metric green">
              <span className="metric-label">Billed Collections</span>
              <div className="metric-val">{formatCurrency(325000)}</div>
              <span className="metric-sub">Invoiced to clients</span>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Engagement WIP Breakdown</h3>
            </div>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Client Entity</th>
                    <th>Engagement Service</th>
                    <th>WIP Hours</th>
                    <th>WIP Value</th>
                    <th>Billed to Date</th>
                    <th>Unbilled Balance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><b>Example Trading Entity</b></td>
                    <td>Statutory Financial Audit FY 2026</td>
                    <td>290 hrs</td>
                    <td>{formatCurrency(385000)}</td>
                    <td>{formatCurrency(200000)}</td>
                    <td><b>{formatCurrency(185000)}</b></td>
                  </tr>
                  <tr>
                    <td><b>Northstar Services LLC</b></td>
                    <td>IFRS Advisory & Review</td>
                    <td>110 hrs</td>
                    <td>{formatCurrency(125000)}</td>
                    <td>{formatCurrency(125000)}</td>
                    <td><b>{formatCurrency(0)}</b></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {selectedReport === 'utilization' && (
        <div className="panel">
          <div className="panel-head">
            <h3>Staff Member Productivity & Chargeability</h3>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Staff Member</th>
                  <th>Role Grade</th>
                  <th>Billable Hours</th>
                  <th>Target Utilization</th>
                  <th>Actual Utilization</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><b>Daniel James</b></td>
                  <td>Lead Partner</td>
                  <td>45 hrs</td>
                  <td>50%</td>
                  <td><b>52%</b></td>
                  <td><span className="badge green">On Target</span></td>
                </tr>
                <tr>
                  <td><b>Layla Rahman</b></td>
                  <td>Audit Manager</td>
                  <td>95 hrs</td>
                  <td>75%</td>
                  <td><b>81%</b></td>
                  <td><span className="badge green">Exceeding Target</span></td>
                </tr>
                <tr>
                  <td><b>Adam Khan</b></td>
                  <td>Audit Senior</td>
                  <td>140 hrs</td>
                  <td>85%</td>
                  <td><b>89%</b></td>
                  <td><span className="badge green">Exceeding Target</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedReport === 'compliance' && (
        <div className="panel panel-pad">
          <h3>Statutory Filing Calendar (State of Qatar)</h3>
          <div className="stack mt12" style={{ gap: 8 }}>
            <div className="between borderbox" style={{ padding: 12 }}>
              <div>
                <b>Example Trading Entity - Ministry of Commerce and Industry (MOCI) Annual Filing</b>
                <div className="cell-sub">Statutory audited accounts due within 4 months of financial year end</div>
              </div>
              <span className="badge amber">Due 30 Apr 2027</span>
            </div>
            <div className="between borderbox" style={{ padding: 12 }}>
              <div>
                <b>General Tax Authority (GTA) Corporate Tax Return Submission</b>
                <div className="cell-sub">Mandatory filing via Dhareeba tax portal with audited accounts</div>
              </div>
              <span className="badge amber">Due 30 Apr 2027</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
