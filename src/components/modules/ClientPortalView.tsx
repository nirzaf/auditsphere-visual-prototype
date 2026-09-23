// Module 08: Client Experience Portal (VP-025)
// 7 Subviews: Home, Engagement Status, Requests (PBC), Shared Docs, Messages, Packages, Invoices (no payment button)
// Strictly browser-only prototype: no online payments, no external mail delivery, local deterministic document registry.

import React, { useState } from 'react';
import { RouteKey, PbcRequestItem } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { visibleClientIds, visibleEngagementIds } from '../../services/guards';
import { Icon } from '../common/Icons';
import { formatCurrency } from '../../services/calculations';
import { exportService } from '../../services/exportService';

interface ClientPortalViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const ClientPortalView: React.FC<ClientPortalViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const [activeSub, setActiveSub] = useState<'home' | 'status' | 'pbc' | 'docs' | 'messages' | 'packages' | 'invoices'>('home');
  const [notice, setNotice] = useState<string | null>(null);
  const [uploadPbcModal, setUploadPbcModal] = useState<PbcRequestItem | null>(null);
  const [uploadFileName, setUploadFileName] = useState('');

  // Client resolution supporting multi-entity grants (VP-025)
  const allowedClientIds = visibleClientIds(state);
  const availableClients = allowedClientIds === 'ALL'
    ? state.clients
    : state.clients.filter(c => (allowedClientIds as string[]).includes(c.id));

  const [selectedClientId, setSelectedClientId] = useState<string>(
    availableClients[0]?.id || ''
  );

  const client = availableClients.find(c => c.id === selectedClientId) || availableClients[0] || null;
  const allowedEngIds = visibleEngagementIds(state);
  const eng = client
    ? (state.engagements.find(e => e.client === client.id && (allowedEngIds === 'ALL' || (allowedEngIds as string[]).includes(e.id))) || null)
    : null;

  // Strictly filter by client grant and exclude unissued/drafts from client visibility (VP-025, VP-033)
  const invoices = client ? state.invoices.filter(i => i.clientId === client.id && (i.status === 'Issued' || i.status === 'Paid')) : [];
  const pbc = eng?.pbc || [];
  const sharedDocs = client ? state.documents.filter(d => d.visibility === 'Client shared' && d.clientId === client.id) : [];
  const messages = client ? state.communications.filter(c => c.visibility === 'Client visible' && c.clientId === client.id) : [];

  const triggerNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 5000);
  };

  const handleDownloadInvoice = (inv: typeof invoices[0]) => {
    exportService.exportPDF(
      `${inv.invoiceNumber}_Client_Copy`,
      `Tax Invoice: ${inv.invoiceNumber}`,
      [
        `Customer: ${client?.name}`,
        `Service: ${eng?.service || 'Statutory Audit'}`,
        `Amount Billed: ${formatCurrency(inv.amount, inv.currency)}`,
        `Amount Paid: ${formatCurrency(inv.paid, inv.currency)}`,
        `Due Date: ${inv.due}`,
        `Status: ${inv.status}`
      ]
    );
    triggerNotice(`Downloaded invoice ${inv.invoiceNumber} PDF.`);
  };

  const handleDownloadSharedDoc = (docName: string, version: number) => {
    exportService.exportPDF(
      `${docName}_v${version}`,
      `Client Document Preview: ${docName}`,
      [
        `Document: ${docName}`,
        `Version: v${version}`,
        `Client: ${client?.name}`,
        `Verification Status: Authentic record`,
        `Archive Reference: SharePoint Canonical / Client Shared`
      ]
    );
    triggerNotice(`Downloaded authentic preview for ${docName}.`);
  };

  const handleDownloadPackage = (relId: string, gen: number) => {
    exportService.exportPDF(
      `Deliverable_${relId}_Gen${gen}`,
      `Audited Financial Report Package - ${client?.name}`,
      [
        `Release Reference: ${relId}`,
        `Generation: Gen ${gen}`,
        `Client Entity: ${client?.name}`,
        `Service: ${eng?.service}`,
        `Lead Audit Partner: ${eng?.partner}`
      ]
    );
    triggerNotice(`Downloaded official release deliverable ${relId}.`);
  };

  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadPbcModal || !uploadFileName.trim() || !eng) return;

    try {
      prototypeStore.uploadPbcResponse(eng.id, uploadPbcModal.id, {
        name: uploadFileName.trim(),
        size: 52000
      });
      triggerNotice(`Successfully uploaded "${uploadFileName.trim()}" for request "${uploadPbcModal.title}". Status updated to Received.`);
      setUploadPbcModal(null);
      setUploadFileName('');
    } catch (err: any) {
      triggerNotice(`Upload error: ${err.message}`);
    }
  };

  if (!client) {
    return (
      <div className="panel panel-pad text-center" style={{ padding: '60px 20px' }}>
        <Icon name="globe" size="xl" className="text-muted mb16" />
        <h3>Client Portal Unavailable</h3>
        <p className="sub max-w-md mx-auto mt8">
          No client entity is currently mapped or permitted for your active identity.
        </p>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      {/* Portal Top Bar */}
      <div className="panel panel-pad" style={{ background: '#0e2f38', color: '#fff' }}>
        <div className="between">
          <div className="row" style={{ gap: 12, alignItems: 'center' }}>
            <div className="firmavatar" style={{ background: '#00c7a2', color: '#092128' }}>
              {client.initials || 'ET'}
            </div>
            <div>
              <span className="caption" style={{ color: '#00c7a2' }}>CLIENT SECURE PORTAL</span>
              <h2 style={{ color: '#fff', margin: 0 }}>{client.name}</h2>
              <div className="cell-sub" style={{ color: '#90a8ab' }}>
                Logged in as: {state.currentPerson} ({state.currentRole})
              </div>
            </div>
          </div>

          <div className="row" style={{ gap: 10, alignItems: 'center' }}>
            {availableClients.length > 1 && (
              <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                <span className="caption" style={{ color: '#90a8ab' }}>Switch Entity:</span>
                <select
                  className="input sm"
                  style={{ background: '#193f49', color: '#fff', borderColor: '#2e5661' }}
                  value={selectedClientId}
                  onChange={e => setSelectedClientId(e.target.value)}
                >
                  {availableClients.map(c => (
                    <option key={c.id} value={c.id} style={{ color: '#000' }}>
                      {c.name} ({c.code || c.id})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button className="btn sm ghost" style={{ color: '#fff', borderColor: '#406368' }} onClick={() => onNavigate('overview')}>
              Exit Portal Preview
            </button>
          </div>
        </div>

        {/* Notice Banner */}
        {notice && (
          <div className="mt12" style={{ background: '#00c7a220', border: '1px solid #00c7a2', padding: '8px 14px', borderRadius: 4, color: '#00c7a2' }}>
            {notice}
          </div>
        )}

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
              <div className="metric-val" style={{ fontSize: 20 }}>{eng?.stage || 'Fieldwork'}</div>
              <span className="metric-sub">Target Clearance: {eng?.due || '31 Oct 2026'}</span>
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
              {messages.length === 0 ? (
                <p className="sub">No correspondence posted yet.</p>
              ) : (
                messages.slice(0, 3).map(m => (
                  <div key={m.id} className="borderbox" style={{ padding: 12 }}>
                    <div className="between">
                      <b>{m.summary}</b>
                      <span className="caption">{new Date(m.date).toLocaleDateString('en-GB')}</span>
                    </div>
                    <p className="sub mt4" style={{ fontSize: 13 }}>{m.body}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Subview 2: Status */}
      {activeSub === 'status' && (
        <div className="panel panel-pad">
          <h3>FY {eng?.year || 2026} Statutory Audit Progress</h3>
          <p className="sub" style={{ marginBottom: 16 }}>
            Engagement Team: {eng?.manager || 'Engagement Manager'} (Manager), {eng?.partner || 'Lead Partner'} (Lead Audit Partner).
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
                {pbc.length === 0 ? (
                  <tr><td colSpan={5} className="text-center sub" style={{ padding: 20 }}>No information requests active.</td></tr>
                ) : (
                  pbc.map(p => (
                    <tr key={p.id}>
                      <td>
                        <b>{p.title}</b>
                        <div className="cell-sub">{p.id}</div>
                        {p.sharedFiles && p.sharedFiles.length > 0 && (
                          <div className="cell-sub text-teal mt4">
                            Latest file: {p.sharedFiles[p.sharedFiles.length - 1].name}
                          </div>
                        )}
                      </td>
                      <td>{p.category}</td>
                      <td>{p.due}</td>
                      <td>
                        <span className={`badge ${p.status === 'Accepted' ? 'green' : p.status === 'Received' ? 'blue' : 'amber'}`}>
                          {p.status}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn sm"
                          onClick={() => {
                            setUploadPbcModal(p);
                            setUploadFileName(`${p.title.replace(/[^a-zA-Z0-9]/g, '_')}_Schedule.xlsx`);
                          }}
                        >
                          <Icon name="plus" size="sm" /> Upload Document
                        </button>
                      </td>
                    </tr>
                  ))
                )}
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
                {sharedDocs.length === 0 ? (
                  <tr><td colSpan={4} className="text-center sub" style={{ padding: 20 }}>No shared documents available for this entity.</td></tr>
                ) : (
                  sharedDocs.map(d => (
                    <tr key={d.id}>
                      <td><b>{d.name}</b></td>
                      <td>v{d.version}</td>
                      <td>{new Date(d.uploadedAt).toLocaleDateString('en-GB')}</td>
                      <td>
                        <button className="btn sm" onClick={() => handleDownloadSharedDoc(d.name, d.version)}>
                          <Icon name="download" size="sm" /> Download
                        </button>
                      </td>
                    </tr>
                  ))
                )}
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
            {messages.length === 0 ? (
              <p className="sub">No correspondence records available.</p>
            ) : (
              messages.map(m => (
                <div key={m.id} className="borderbox" style={{ padding: 12 }}>
                  <div className="between">
                    <b>{m.summary}</b>
                    <span className="caption">{new Date(m.date).toLocaleDateString('en-GB')}</span>
                  </div>
                  <p className="sub mt8" style={{ whiteSpace: 'pre-line' }}>{m.body}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Subview 6: Packages */}
      {activeSub === 'packages' && (
        <div className="panel panel-pad">
          <h3>Published Statutory Deliverables</h3>
          {!eng || eng.releases.length === 0 ? (
            <p className="sub">No official audit packages published yet for FY {eng?.year || 2026}. Work is currently in fieldwork review.</p>
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              {eng.releases.map(rel => (
                <div key={rel.id} className="between borderbox" style={{ padding: 12 }}>
                  <div>
                    <b>Audited Financial Report Package ({rel.id})</b>
                    <div className="cell-sub">
                      Released on {new Date(rel.releasedAt).toLocaleDateString('en-GB')} by {rel.releasedBy} · Gen {rel.generation}
                    </div>
                  </div>
                  <button className="btn primary sm" onClick={() => handleDownloadPackage(rel.id, rel.generation)}>
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
              <p className="sub">View and download invoices. Payments are settled offline via bank wire (settlement is offline; online payment is excluded).</p>
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
                {invoices.length === 0 ? (
                  <tr><td colSpan={7} className="text-center sub" style={{ padding: 20 }}>No issued invoices for this entity.</td></tr>
                ) : (
                  invoices.map(inv => (
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Upload PBC Modal */}
      {uploadPbcModal && (
        <div className="modal-backdrop" onClick={() => setUploadPbcModal(null)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Upload Evidence Schedule</h2>
              <button className="icon-btn" onClick={() => setUploadPbcModal(null)}>✕</button>
            </div>
            <form onSubmit={handleUploadSubmit}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div>
                  <label className="caption">Information Request</label>
                  <div style={{ fontWeight: 600 }}>{uploadPbcModal.title}</div>
                  <div className="cell-sub">{uploadPbcModal.category} · Due {uploadPbcModal.due}</div>
                </div>
                <div>
                  <label className="caption">File Name / Schedule Attachment</label>
                  <input
                    type="text"
                    className="input"
                    value={uploadFileName}
                    onChange={e => setUploadFileName(e.target.value)}
                    placeholder="e.g. Bank_Reconciliations_Dec2026.xlsx"
                    required
                  />
                  <span className="caption" style={{ color: 'var(--muted)', display: 'block', marginTop: 4 }}>
                    Simulates secure upload directly to canonical SharePoint client folder.
                  </span>
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={() => setUploadPbcModal(null)}>Cancel</button>
                <button type="submit" className="btn primary sm">Confirm Upload</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
