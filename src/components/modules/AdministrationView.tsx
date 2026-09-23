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
          <p>Firm settings, simulated-identity directory, scoped grants, and the 14-role permission model.</p>
        </div>
        <button className="btn sm ghost" onClick={handleResetApp} style={{ color: '#ef4444' }}>
          Reset All Data to Factory Defaults
        </button>
      </div>

      <div className="tabs">
        <button className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
          Practice Personas ({state.users.length})
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
          <div className="panel panel-pad" style={{ background: '#fffbeb', borderLeft: '4px solid #d97706', margin: 12 }}>
            <b>Prototype note — identity lifecycle.</b>
            <p className="sub mt4">
              This directory lists simulated identities (header always labels them simulated, never
              live-authenticated). Per-user detail tabs (role grants, client/engagement assignments,
              access history), pending-invitation tracking, and revocation flows live in the store
              grants but have no dedicated detail UI here yet; use the scoped shell, search and
              command guards to demonstrate least-privilege behaviour.
            </p>
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
          <h3>Role-Based Access Control Matrix (14 agreed roles)</h3>
          <p className="sub mb16">Permissions govern read, write, clearance, and approval access across all practice modules. Extra demo people may share a role (e.g. two preparers) so reassignment can be demonstrated; separation of duties always applies by person name, never by role label. System administration alone grants no professional approval and no client financial-data access.</p>
          <div className="stack" style={{ gap: 8 }}>
            {[
              { role: 'relationship', title: 'Relationship owner', desc: 'Commercial pipeline, proposals, client profiles. Cannot grant professional acceptance.' },
              { role: 'onboarding', title: 'Onboarding coordinator', desc: 'Collects acceptance facts and missing items. Cannot decide acceptance.' },
              { role: 'compliance', title: 'Compliance officer', desc: 'Independent compliance recommendation with rationale. No auto-acceptance.' },
              { role: 'partner', title: 'Partner', desc: 'Engagement acceptance decisions, partner approvals, report release. Cannot also act as EQR on the same engagement.' },
              { role: 'manager', title: 'Manager', desc: 'Engagements, jobs, budgets, manager approvals, release preparation.' },
              { role: 'preparer', title: 'Preparer', desc: 'Fieldwork, workpapers, journals, evidence. Cannot clear their own work.' },
              { role: 'reviewer', title: 'Senior reviewer', desc: 'Independent review, review points, clearance of the exact submitted revision.' },
              { role: 'eqr', title: 'Engagement quality reviewer', desc: 'Per-engagement EQR eligibility and concern handling. Independent of partner.' },
              { role: 'client_admin', title: 'Client administrator', desc: 'Nominates contacts, views explicitly shared records. No staff access, no management authority.' },
              { role: 'client_finance', title: 'Client finance contributor', desc: 'Supplies PBC evidence within assigned scopes. Cannot approve reports.' },
              { role: 'client', title: 'Management approver', desc: 'Records management acknowledgement of presented packages. No signature capture.' },
              { role: 'billing', title: 'Billing officer', desc: 'Drafts, receipts, allocations. No client TB/GL access, no self-review.' },
              { role: 'records', title: 'Records administrator', desc: 'Logical archive index, retention metadata, application holds. No provider retention.' },
              { role: 'admin', title: 'System administrator', desc: 'Simulated setup, grants on approved request, settings. No professional authority.' }
            ].map(r => (
              <div key={r.role} className="borderbox" style={{ padding: 12 }}>
                <div className="between">
                  <b>{r.title} ({r.role})</b>
                  <span className="tag blue">{state.users.filter(u => u.role === (r.role as any)).length} demo personae</span>
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
