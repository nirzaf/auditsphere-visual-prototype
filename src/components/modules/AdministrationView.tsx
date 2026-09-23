// Module 39: Firm Settings & Persona Directory (VP-019, VP-062)
import React, { useState } from 'react';
import { RouteKey } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';

interface AdministrationViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const AdministrationView: React.FC<AdministrationViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const [activeTab, setActiveTab] = useState<'firm' | 'users' | 'permissions'>('users');

  const handleResetApp = () => {
    if (confirm('Reset prototype to factory initial state? All in-memory changes will be reset to default synthetic data.')) {
      prototypeStore.resetState();
      window.location.reload();
    }
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Practice Administration & User Management</h1>
          <p>Firm statutory registration, 14-role persona directory, and RBAC permission definitions.</p>
        </div>
        <button className="btn sm ghost" onClick={handleResetApp} style={{ color: '#ef4444' }}>
          Reset All Data to Factory Defaults
        </button>
      </div>

      <div className="tabs">
        <button className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
          14 Prototype Personas ({state.users.length})
        </button>
        <button className={`tab-btn ${activeTab === 'firm' ? 'active' : ''}`} onClick={() => setActiveTab('firm')}>
          Firm Legal Details & Branding
        </button>
        <button className={`tab-btn ${activeTab === 'permissions' ? 'active' : ''}`} onClick={() => setActiveTab('permissions')}>
          Role-Based Access Control (RBAC)
        </button>
      </div>

      {/* Users Directory */}
      {activeTab === 'users' && (
        <div className="panel">
          <div className="panel-head">
            <h3>Registered Practice Personas</h3>
            <span className="caption">Switch personas anytime from top navigation bar</span>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Persona Name</th>
                  <th>Practice Role</th>
                  <th>Email Account</th>
                  <th>Role Code</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {state.users.map(u => (
                  <tr key={u.id} style={{ background: u.name === state.currentPerson ? '#f0fdf4' : 'inherit' }}>
                    <td>
                      <div className="row" style={{ gap: 10 }}>
                        <div className="firmavatar sm">{u.name.split(' ').map(n => n[0]).join('')}</div>
                        <div>
                          <b>{u.name}</b>
                          {u.name === state.currentPerson && <span className="tag green" style={{ marginLeft: 6 }}>Active Persona</span>}
                        </div>
                      </div>
                    </td>
                    <td>{u.label}</td>
                    <td><span className="mono">{u.email}</span></td>
                    <td><span className="tag gray">{u.role}</span></td>
                    <td>
                      {u.name !== state.currentPerson && (
                        <button
                          className="btn sm"
                          onClick={() => {
                            prototypeStore.setRole(u.role);
                            prototypeStore.setPerson(u.name);
                          }}
                        >
                          Switch to Persona
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

      {/* Firm Legal */}
      {activeTab === 'firm' && (
        <div className="panel panel-pad">
          <h3>Practice Corporate Identity</h3>
          <div className="info-grid mt16">
            <div><label>Firm Legal Name</label><b>{state.firmSettings?.firmLegalName || state.firmSettings?.firmName || 'AuditSphere Practice LLC'}</b></div>
            <div><label>Jurisdiction of Practice</label><span>State of Qatar (QFC & State Regulations)</span></div>
            <div><label>Professional Body Registration</label><span>Ministry of Commerce and Industry (MOCI) Reg #9842</span></div>
            <div><label>Default Currency</label><span>Qatari Riyal (QAR)</span></div>
            <div><label>Audit Methodology Framework</label><span>International Standards on Auditing (ISA / ISQM)</span></div>
            <div><label>Accounting Framework</label><span>IFRS / IFRS for SMEs</span></div>
          </div>
        </div>
      )}

      {/* RBAC Matrix */}
      {activeTab === 'permissions' && (
        <div className="panel panel-pad">
          <h3>Role-Based Access Control Matrix (14 Roles)</h3>
          <p className="sub mb16">Permissions govern read, write, clearance, and approval access across all practice modules.</p>
          <div className="stack" style={{ gap: 8 }}>
            {[
              { role: 'partner', title: 'Audit Partner', desc: 'Full authority, sole authority to issue audit opinions and accept mandates.' },
              { role: 'manager', title: 'Audit Manager', desc: 'Engagement management, workpaper review, timesheet approval, staff supervision.' },
              { role: 'senior', title: 'Audit Senior', desc: 'Substantive fieldwork, sampling execution, drafting workpapers, review queries.' },
              { role: 'associate', title: 'Audit Associate', desc: 'Junior fieldwork, vouching test procedures, drafting basic workpapers.' },
              { role: 'eqr', title: 'Engagement Quality Reviewer', desc: 'Independent objective quality review, concurrent sign-off.' },
              { role: 'tax_manager', title: 'Tax & Compliance Manager', desc: 'Tax provision testing, statutory compliance calendar oversight.' },
              { role: 'client_exec', title: 'Client Managing Director', desc: 'Executive portal access, commercial proposals, representation sign-off.' },
              { role: 'client_finance', title: 'Client CFO / Finance Team', desc: 'Client portal, document uploads (PBC), invoice review.' },
              { role: 'billing_specialist', title: 'Billing & AR Clerk', desc: 'Invoice drafting, payment receipts allocation, aging ledger.' }
            ].map(r => (
              <div key={r.role} className="borderbox" style={{ padding: 12 }}>
                <div className="between">
                  <b>{r.title} ({r.role})</b>
                  <span className="tag blue">Configured in permissions.json</span>
                </div>
                <p className="sub mt4" style={{ fontSize: 13 }}>{r.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
