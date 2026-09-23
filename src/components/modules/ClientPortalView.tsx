// Module 08: Client Experience Portal (VP-025)
// 7 Subviews: Home, Engagement Status, Requests (PBC), Shared Docs, Messages, Packages, Invoices (no payment button)

import React, { useState } from 'react';
import { RouteKey } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';
import { formatCurrency } from '../../services/calculations';
import { exportService } from '../../services/exportService';

interface ClientPortalViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const ClientPortalView: React.FC<ClientPortalViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const [activeSub, setActiveSub] = useState<'home' | 'status' | 'pbc' | 'docs' | 'messages' | 'packages' | 'invoices'>('home');

  const client = state.clients[0];
  const eng = state.engagements[0];
  const invoices = state.invoices.filter(i => i.clientId === client?.id);
  const pbc = eng?.pbc || [];
  const sharedDocs = state.documents.filter(d => d.visibility === 'Client shared');
  const messages = state.communications.filter(c => c.visibility === 'Client visible');

  const handleDownloadInvoice = (inv: typeof invoices[0]) => {
    exportService.exportPDF(
      `${inv.invoiceNumber}_Client_Copy`,
      `Tax Invoice: ${inv.invoiceNumber}`,
      [
        `Customer: ${client.name}`,
        `Service: ${eng.service}`,
        `Amount Billed: ${formatCurrency(inv.amount, inv.currency)}`,
        `Amount Paid: ${formatCurrency(inv.paid, inv.currency)}`,
        `Due Date: ${inv.due}`,
        `Status: ${inv.status}`
      ]
    );
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      {/* Portal Top Bar */}
      <div className="panel panel-pad" style={{ background: '#0e2f38', color: '#fff' }}>
        <div className="between">
          <div className="row" style={{ gap: 12 }}>
            <div className="firmavatar" style={{ background: '#00c7a2', color: '#092128' }}>
              {client?.initials || 'ET'}
            </div>
            <div>
              <span className="caption" style={{ color: '#00c7a2' }}>CLIENT SECURE PORTAL</span>
              <h2 style={{ color: '#fff', margin: 0 }}>{client?.name || 'Example Trading Entity'}</h2>
              <div className="cell-sub" style={{ color: '#90a8ab' }}>Logged in as: Omar Nasser (Chief Financial Officer)</div>
            </div>
          </div>
          <button className="btn sm ghost" style={{ color: '#fff', borderColor: '#406368' }} onClick={() => onNavigate('overview')}>
            Exit Portal Preview
          </button>
        </div>

        {/* Portal Navigation Tabs */}
        <div className="tabs mt20" style={{ borderBottomColor: '#20454d' }}>
          {[
            { key: 'home', label: 'Home Dashboard' },
            { key: 'status', label: 'Audit Engagement Status' },
            { key: 'pbc', label: `Information Requests (${pbc.filter(p => p.status !== 'Accepted').length})` },
            { key: 'docs', label: 'Shared Documents' },
            { key: 'messages', label: 'Messages & Mail' },
            { key: 'packages', label: 'Published Reports' },
            { key: 'invoices', label: 'Fee Invoices' }
          ].map(t => (
            <button
              key={t.key}
              className={`tab-btn ${activeSub === t.key ? 'active' : ''}`}
              style={{ color: activeSub === t.key ? '#00c7a2' : '#90a8ab' }}
              onClick={() => setActiveSub(t.key as any)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Subview 1: Home */}
      {activeSub === 'home' && (
        <div className="stack" style={{ gap: 16 }}>
          <div className="metric-grid">
            <div className="metric">
              <span className="metric-label">Current Phase</span>
              <div className="metric-val" style={{ fontSize: 20 }}>{eng?.stage}</div>
              <span className="metric-sub">Target Clearance: {eng?.due}</span>
            </div>
            <div className="metric blue">
              <span className="metric-label">Pending Client Requests</span>
              <div className="metric-val">{pbc.filter(p => p.status !== 'Accepted').length}</div>
              <span className="metric-sub">Action required from finance team</span>
            </div>
            <div className="metric green">
              <span className="metric-label">Outstanding Invoices</span>
              <div className="metric-val">{invoices.filter(i => i.paid < i.amount).length}</div>
              <span className="metric-sub">Standard 30-day payment terms</span>
            </div>
          </div>

          <div className="panel panel-pad">
            <h3>Recent Communications from Audit Team</h3>
            <div className="stack mt12" style={{ gap: 8 }}>
              {messages.slice(0, 3).map(m => (
                <div key={m.id} className="borderbox" style={{ padding: 12 }}>
                  <div className="between">
                    <b>{m.summary}</b>
                    <span className="caption">{new Date(m.date).toLocaleDateString('en-GB')}</span>
                  </div>
                  <p className="sub mt4" style={{ fontSize: 13 }}>{m.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Subview 2: Status */}
      {activeSub === 'status' && (
        <div className="panel panel-pad">
          <h3>FY {eng?.year} Statutory Audit Progress</h3>
          <p className="sub" style={{ marginBottom: 16 }}>
            Engagement Team: {eng?.manager} (Manager), {eng?.partner} (Lead Audit Partner).
          </p>
          <div className="lifecyclebar mt16">
            {['Planning', 'Fieldwork', 'Review Desk', 'Partner Clearance', 'Released'].map((st, i) => (
              <div key={st} className={`life-step ${i <= 2 ? 'done' : i === 3 ? 'current' : ''}`}>
                <em>{i + 1}</em>
                {st}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Subview 3: PBC Requests */}
      {activeSub === 'pbc' && (
        <div className="panel">
          <div className="panel-head">
            <h3>Information Requests (PBC Schedule)</h3>
            <span className="caption">Upload evidence schedules requested by audit team</span>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Request Title</th>
                  <th>Category</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>File Upload</th>
                </tr>
              </thead>
              <tbody>
                {pbc.map(p => (
                  <tr key={p.id}>
                    <td><b>{p.title}</b><div className="cell-sub">{p.id}</div></td>
                    <td>{p.category}</td>
                    <td>{p.due}</td>
                    <td>
                      <span className={`badge ${p.status === 'Accepted' ? 'green' : 'amber'}`}>
                        {p.status}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn sm"
                        onClick={() => alert(`Simulated upload for ${p.title}. File registered.`)}
                      >
                        Upload Document
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subview 4: Shared Docs */}
      {activeSub === 'docs' && (
        <div className="panel">
          <div className="panel-head">
            <h3>Shared Engagement Documents</h3>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>Version</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {sharedDocs.map(d => (
                  <tr key={d.id}>
                    <td><b>{d.name}</b></td>
                    <td>v{d.version}</td>
                    <td>{new Date(d.uploadedAt).toLocaleDateString('en-GB')}</td>
                    <td>
                      <button className="btn sm" onClick={() => alert('Opening simulated SharePoint file preview.')}>
                        Download
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subview 5: Messages */}
      {activeSub === 'messages' && (
        <div className="panel panel-pad">
          <h3>Correspondence with STE Audit Practice</h3>
          <div className="stack mt12" style={{ gap: 10 }}>
            {messages.map(m => (
              <div key={m.id} className="borderbox" style={{ padding: 12 }}>
                <div className="between">
                  <b>{m.summary}</b>
                  <span className="caption">{new Date(m.date).toLocaleDateString('en-GB')}</span>
                </div>
                <p className="sub mt8" style={{ whiteSpace: 'pre-line' }}>{m.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Subview 6: Packages */}
      {activeSub === 'packages' && (
        <div className="panel panel-pad">
          <h3>Published Statutory Deliverables</h3>
          {eng?.releases.length === 0 ? (
            <p className="sub">No official audit packages published yet for FY {eng?.year}. Work is currently in fieldwork review.</p>
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              {eng.releases.map(rel => (
                <div key={rel.id} className="between borderbox" style={{ padding: 12 }}>
                  <div>
                    <b>Audited Financial Report Package (Release {rel.id})</b>
                    <div className="cell-sub">Released on {new Date(rel.releasedAt).toLocaleDateString('en-GB')} by {rel.releasedBy}</div>
                  </div>
                  <button className="btn primary sm" onClick={() => alert('Simulated report download.')}>
                    <Icon name="download" /> Download Report Package
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Subview 7: Invoices */}
      {activeSub === 'invoices' && (
        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>Professional Fee Invoices</h3>
              <p className="sub">View and download invoices. Payments are settled offline via bank wire.</p>
            </div>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Paid</th>
                  <th>Status</th>
                  <th>Due Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id}>
                    <td><b>{inv.invoiceNumber}</b></td>
                    <td>{inv.description}</td>
                    <td><b>{formatCurrency(inv.amount, inv.currency)}</b></td>
                    <td>{formatCurrency(inv.paid, inv.currency)}</td>
                    <td>
                      <span className={`badge ${inv.status === 'Paid' ? 'green' : 'amber'}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td>{inv.due}</td>
                    <td>
                      <button className="btn sm" onClick={() => handleDownloadInvoice(inv)}>
                        <Icon name="download" size="sm" /> Download Invoice PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
