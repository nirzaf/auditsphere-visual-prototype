// Module 18: Microsoft 365 Integration Configuration & Simulator (VP-017, VP-022)
// NOTE: Explicitly maintains liveConnected: false for client-side synthetic prototype.

import React, { useState } from 'react';
import { RouteKey } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';

interface M365SetupViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const M365SetupView: React.FC<M365SetupViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const config = state.m365Config;

  const [tenantId, setTenantId] = useState(config.tenantId);
  const [tenantName, setTenantName] = useState(config.tenantName);
  const [siteUrl, setSiteUrl] = useState(config.sharePointSite);
  const [mailSender, setMailSender] = useState(config.mailSenderAccount);
  const [testResult, setTestResult] = useState<string | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    prototypeStore.updateM365Config({
      ...config,
      tenantId,
      tenantName,
      sharePointSite: siteUrl,
      mailSenderAccount: mailSender
    });
    alert('M365 configuration saved locally in prototype storage.');
  };

  const handleTestConnection = () => {
    setTestResult('Connecting to synthetic Microsoft Graph API...');
    setTimeout(() => {
      setTestResult('Simulation Successful: Microsoft Graph endpoint responsive (Synthetic Mode: 200 OK).');
    }, 400);
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Microsoft 365 Architecture & Settings</h1>
          <p>Synthetic tenant configuration, simulated SharePoint site URLs, and Exchange mail parameters.</p>
        </div>
      </div>

      {/* Synthetic Mode Banner */}
      <div className="panel panel-pad" style={{ background: '#f8fafc', borderLeft: '4px solid var(--teal)' }}>
        <div className="between">
          <div>
            <b>Synthetic Prototype Environment (Offline Mode)</b>
            <p className="sub mt4">
              Live external Microsoft Graph API connectivity is disabled (<code>liveConnected: false</code>). All Exchange mail delivery and SharePoint storage operations run within the local synthetic browser harness.
            </p>
          </div>
          <span className="badge teal">Synthetic Active</span>
        </div>
      </div>

      <div className="panel panel-pad">
        <form onSubmit={handleSave} className="stack" style={{ gap: 16 }}>
          <h3>Integration Parameters</h3>

          <div className="grid2">
            <div>
              <label className="caption">Azure Active Directory Tenant ID</label>
              <input
                type="text"
                className="input mono"
                value={tenantId}
                onChange={e => setTenantId(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="caption">Tenant Domain Name</label>
              <input
                type="text"
                className="input mono"
                value={tenantName}
                onChange={e => setTenantName(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className="caption">SharePoint Online Root Site URL</label>
            <input
              type="text"
              className="input mono"
              value={siteUrl}
              onChange={e => setSiteUrl(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="caption">Exchange Online Outbound Sender Mailbox</label>
            <input
              type="email"
              className="input"
              value={mailSender}
              onChange={e => setMailSender(e.target.value)}
              required
            />
          </div>

          <div className="row mt12" style={{ gap: 10 }}>
            <button type="submit" className="btn primary sm">
              Save Configuration
            </button>
            <button type="button" className="btn sm ghost" onClick={handleTestConnection}>
              Test Graph API Simulation
            </button>
          </div>

          {testResult && (
            <div className="borderbox mt8" style={{ background: '#f0fdf4', padding: 12 }}>
              <span className="mono" style={{ color: 'var(--teal-dark)', fontSize: 13 }}>{testResult}</span>
            </div>
          )}
        </form>
      </div>

      <div className="panel panel-pad">
        <h3>Simulated Microsoft 365 Services Health</h3>
        <div className="grid3 mt12">
          <div className="borderbox" style={{ padding: 12 }}>
            <div className="between">
              <b>SharePoint Online</b>
              <span className="badge green">Healthy</span>
            </div>
            <div className="cell-sub mt8">Document libraries & version tree active</div>
          </div>
          <div className="borderbox" style={{ padding: 12 }}>
            <div className="between">
              <b>Exchange Online</b>
              <span className="badge green">Healthy</span>
            </div>
            <div className="cell-sub mt8">Synthetic SMTP dispatcher ready</div>
          </div>
          <div className="borderbox" style={{ padding: 12 }}>
            <div className="between">
              <b>Microsoft Graph</b>
              <span className="badge green">Healthy</span>
            </div>
            <div className="cell-sub mt8">User directory lookup synchronized</div>
          </div>
        </div>
      </div>
    </div>
  );
};
