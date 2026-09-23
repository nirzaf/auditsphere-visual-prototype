// Module 39: Firm Settings & Persona Directory (VP-019, VP-062)
// Simulated identity directory, explicit scoped grants, grant authoring & revocation, and 14-role RBAC catalogue.

import React, { useState } from 'react';
import { RoleKey, RouteKey, UserPersona } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';

interface AdministrationViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const AdministrationView: React.FC<AdministrationViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const [activeTab, setActiveTab] = useState<'users' | 'identities' | 'grants' | 'history' | 'firm' | 'permissions'>('users');
  const [selectedUser, setSelectedUser] = useState<UserPersona | null>(null);
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [grantScopeKind, setGrantScopeKind] = useState<'Global' | 'Client' | 'Engagement'>('Client');
  const [grantClientId, setGrantClientId] = useState(state.clients[0]?.id || 'CL-001');
  const [grantEngagementId, setGrantEngagementId] = useState(state.engagements[0]?.id || 'ENG-26001');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [identityName, setIdentityName] = useState('');
  const [identityEmail, setIdentityEmail] = useState('');
  const [identityRole, setIdentityRole] = useState<RoleKey>('preparer');
  const [inviteScope, setInviteScope] = useState<'Global' | 'Client' | 'Engagement'>('Client');
  const [inviteScopeId, setInviteScopeId] = useState(state.clients[0]?.id || 'CL-001');

  const triggerNotice = (type: 'success' | 'error', text: string) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 6000);
  };

  const handleResetApp = () => {
    if (confirm('Reset prototype to factory initial state? All in-memory changes will be reset to default synthetic data.')) {
      prototypeStore.resetState();
      window.location.reload();
    }
  };

  const handleGrantAccess = () => {
    if (!selectedUser) return;
    try {
      const scopeId = grantScopeKind === 'Client' ? grantClientId : grantScopeKind === 'Engagement' ? grantEngagementId : undefined;
      prototypeStore.grantAccess(selectedUser.id, selectedUser.role, grantScopeKind, scopeId, 'Approved scoped access request');
      setShowGrantModal(false);
      triggerNotice('success', `Granted ${grantScopeKind} scope to ${selectedUser.name} as ${selectedUser.role}.`);
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  const handleRevokeAccess = (grant: typeof state.roleGrants[0]) => {
    try {
      const reason = window.prompt('Reason for revoking this access grant:');
      if (reason === null) return;
      prototypeStore.revokeAccess(grant.userId, grant.role, grant.scopeId, reason);
      triggerNotice('success', 'Access grant revoked. User authority narrowed or zeroed if last grant removed.');
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  const userGrants = (u: UserPersona) => state.roleGrants.filter(g => g.userId === u.id);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Practice Administration &amp; Access Control</h1>
          <p>Firm settings, simulated persona directory, explicit scope grant authoring, and revocation lifecycle.</p>
        </div>
        <button className="btn sm ghost" onClick={handleResetApp} style={{ color: '#ef4444' }}>
          Reset All Data to Factory Defaults
        </button>
      </div>

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
        <button className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
          Practice Personas ({state.users.length})
        </button>
        <button className={`tab-btn ${activeTab === 'identities' ? 'active' : ''}`} onClick={() => setActiveTab('identities')}>
          Identity Lifecycle ({state.simulatedInvitations?.length || 0} invitations)
        </button>
        <button className={`tab-btn ${activeTab === 'grants' ? 'active' : ''}`} onClick={() => setActiveTab('grants')}>
          Active Access Grants ({state.roleGrants.length})
        </button>
        <button className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
          Access History ({state.roleGrantHistory.length})
        </button>
        <button className={`tab-btn ${activeTab === 'firm' ? 'active' : ''}`} onClick={() => setActiveTab('firm')}>
          Firm Legal Details &amp; Branding
        </button>
        <button className={`tab-btn ${activeTab === 'permissions' ? 'active' : ''}`} onClick={() => setActiveTab('permissions')}>
          Role-Based Access Control (RBAC)
        </button>
      </div>

      {activeTab === 'identities' && <div className="stack" style={{ gap: 16 }}>
        <div className="panel panel-pad">
          <div className="between"><div><h3>Local demo identities</h3><p className="sub">Simulated directory records only. Creating or inviting an identity never creates a scope grant.</p></div><span className="badge blue">No live account or message</span></div>
          <form className="grid4 mt12" onSubmit={e => { e.preventDefault(); try { prototypeStore.createDemoIdentity({ name: identityName, email: identityEmail, role: identityRole, label: identityRole }); setIdentityName(''); setIdentityEmail(''); triggerNotice('success', 'Simulated identity created without access grants.'); } catch (err: any) { triggerNotice('error', err.message); } }}>
            <input className="input" aria-label="Demo identity name" placeholder="Full name" value={identityName} onChange={e => setIdentityName(e.target.value)} required />
            <input className="input" type="email" aria-label="Demo identity email" placeholder="name@example.demo" value={identityEmail} onChange={e => setIdentityEmail(e.target.value)} required />
            <select className="input" aria-label="Demo identity role" value={identityRole} onChange={e => setIdentityRole(e.target.value as RoleKey)}>{(['relationship','onboarding','compliance','partner','manager','preparer','reviewer','eqr','client_admin','client_finance','client','billing','records','admin'] as RoleKey[]).map(role => <option key={role} value={role}>{role}</option>)}</select>
            <button className="btn primary" type="submit">Add local identity</button>
          </form>
          <div className="tablewrap mt12"><table><thead><tr><th>Identity</th><th>Role</th><th>Status</th><th>Explicit access grants</th><th>Lifecycle action</th></tr></thead><tbody>{state.users.map(user => <tr key={user.id}><td>{user.name}<div className="caption">{user.email} · ID {user.id}</div></td><td>{user.label}</td><td>{user.status}</td><td>{userGrants(user).length || 'None'}</td><td>{user.id !== state.currentUserId && <button className="btn sm ghost" onClick={() => { const next = user.status === 'Active' ? 'Disabled' : 'Active'; const reason = next === 'Disabled' ? window.prompt(`Reason for disabling ${user.name}:`) : `Reactivated by ${state.currentPerson}`; if (reason !== null) try { prototypeStore.setUserStatus(user.id, next, reason); } catch (err: any) { triggerNotice('error', err.message); } }}>{user.status === 'Active' ? 'Disable' : 'Reactivate'}</button>}</td></tr>)}</tbody></table></div>
        </div>
        <div className="panel panel-pad">
          <h3>Simulated invitations</h3><p className="sub">Pending, expired, accepted and revoked states are local fixtures. No invitation is sent externally.</p>
          <form className="grid4 mt12" onSubmit={e => { e.preventDefault(); try { const scopeId = inviteScope === 'Global' ? undefined : inviteScope === 'Client' ? (state.clients.some(c => c.id === inviteScopeId) ? inviteScopeId : state.clients[0]?.id) : inviteScopeId; prototypeStore.sendSimulatedInvitation({ email: identityEmail, name: identityName, role: identityRole, scopeKind: inviteScope, scopeId }); triggerNotice('success', 'Simulated invitation recorded locally; no message was sent.'); } catch (err: any) { triggerNotice('error', err.message); } }}>
            <input className="input" aria-label="Invitation name" placeholder="Recipient name" value={identityName} onChange={e => setIdentityName(e.target.value)} required />
            <input className="input" type="email" aria-label="Invitation email" placeholder="name@example.demo" value={identityEmail} onChange={e => setIdentityEmail(e.target.value)} required />
            <select className="input" aria-label="Invitation scope" value={inviteScope} onChange={e => setInviteScope(e.target.value as typeof inviteScope)}><option>Client</option><option>Engagement</option><option>Global</option></select>
            {inviteScope === 'Client' ? <select className="input" aria-label="Invitation scope identifier" value={inviteScopeId} onChange={e => setInviteScopeId(e.target.value)}>{state.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select> : inviteScope === 'Engagement' ? <select className="input" aria-label="Invitation scope identifier" value={inviteScopeId} onChange={e => setInviteScopeId(e.target.value)}>{state.engagements.map(e => <option key={e.id} value={e.id}>{e.id}</option>)}</select> : <select className="input" aria-label="Invitation role" value={identityRole} onChange={e => setIdentityRole(e.target.value as RoleKey)}>{(['relationship','onboarding','compliance','partner','manager','preparer','reviewer','eqr','client_admin','client_finance','client','billing','records','admin'] as RoleKey[]).map(role => <option key={role}>{role}</option>)}</select>}
            <button className="btn primary" type="submit">Record simulated invite</button>
          </form>
          <div className="tablewrap mt12"><table><thead><tr><th>Recipient</th><th>Role / Scope</th><th>Status</th><th>Expiry</th><th>Actions</th></tr></thead><tbody>{(state.simulatedInvitations || []).map(invite => { const expired = invite.status === 'Pending' && Date.parse(invite.expiresAt) <= Date.now(); const status = expired ? 'Expired' : invite.status; return <tr key={invite.id}><td>{invite.name}<div className="caption">{invite.email} · {invite.id}</div></td><td>{invite.role} · {invite.scopeKind}{invite.scopeId ? ` ${invite.scopeId}` : ''}</td><td>{status}</td><td>{new Date(invite.expiresAt).toLocaleDateString()}</td><td className="row">{invite.status === 'Pending' && !expired && <button className="btn sm ghost" onClick={() => { const reason = window.prompt('Reason for revoking this simulated invitation:'); if (reason) try { prototypeStore.revokeSimulatedInvitation(invite.id, reason); } catch (err: any) { triggerNotice('error', err.message); } }}>Revoke</button>}{invite.status !== 'Accepted' && <button className="btn sm ghost" onClick={() => { try { prototypeStore.resendSimulatedInvitation(invite.id); } catch (err: any) { triggerNotice('error', err.message); } }}>Renew 7 days</button>}{invite.status === 'Pending' && !expired && <button className="btn sm" onClick={() => { try { prototypeStore.acceptSimulatedInvitation(invite.id); triggerNotice('success', 'Simulated recipient accepted; this created no access grant.'); } catch (err: any) { triggerNotice('error', err.message); } }}>Simulate acceptance</button>}</td></tr>; })}</tbody></table></div>
          <details className="mt12"><summary className="caption">Identity lifecycle history ({state.identityStatusHistory?.length || 0})</summary><div className="tablewrap"><table><thead><tr><th>Time</th><th>Action</th><th>Identity</th><th>Actor</th><th>Reason</th></tr></thead><tbody>{(state.identityStatusHistory || []).map(event => <tr key={event.id}><td>{event.timestamp}</td><td>{event.action}</td><td>{event.userName} · {event.role}</td><td>{event.actor}</td><td>{event.reason || '—'}</td></tr>)}</tbody></table></div></details>
        </div>
      </div>}

      {/* Users Directory */}
      {activeTab === 'users' && (
        <div className="panel">
          <div className="panel-head between">
            <div>
              <h3>Registered Practice Personas</h3>
              <span className="caption">Click any persona to view assigned scoped grants and manage access</span>
            </div>
            <span className="badge blue">Simulated Identities (No live SSO)</span>
          </div>

          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Persona Name</th>
                  <th>Practice Role</th>
                  <th>Email Account</th>
                  <th>Status</th>
                  <th>Explicit Grants</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {state.users.map(u => {
                  const grants = userGrants(u);
                  return (
                    <tr
                      key={u.id}
                      style={{
                        background: u.id === state.currentUserId ? '#f0fdf4' : 'inherit',
                        cursor: 'pointer'
                      }}
                      onClick={() => setSelectedUser(u)}
                    >
                      <td>
                        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                          <div className="firmavatar sm">{u.name.split(' ').map(n => n[0]).join('')}</div>
                          <div>
                            <b>{u.name}</b>
                            {u.id === state.currentUserId && <span className="tag green" style={{ marginLeft: 6 }}>Active Persona</span>}
                          </div>
                        </div>
                      </td>
                      <td>{u.label}</td>
                      <td><span className="mono">{u.email}</span></td>
                      <td>
                        <span className={`badge ${u.status === 'Active' ? 'green' : 'red'}`}>
                          {u.status}
                        </span>
                      </td>
                      <td>
                        <b>{grants.length} grants</b>
                        {grants.length > 0 && <span className="cell-sub"> ({grants.map(g => g.scopeKind).join(', ')})</span>}
                      </td>
                      <td>
                        <div className="row" style={{ gap: 6 }} onClick={e => e.stopPropagation()}>
                          <button
                            className="btn sm"
                            onClick={() => {
                              setSelectedUser(u);
                              setShowGrantModal(true);
                            }}
                          >
                            + Grant Scope
                          </button>
                          {u.id !== state.currentUserId && (
                            <button
                              className="btn sm ghost"
                              onClick={() => {
                                prototypeStore.setPersona(u.id);
                                triggerNotice('success', `Switched active session persona to ${u.name} (${u.role}).`);
                              }}
                            >
                              Switch Persona
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Grants Register */}
      {activeTab === 'grants' && (
        <div className="panel">
          <div className="panel-head between">
            <div>
              <h3>Explicit Access Grants Register</h3>
              <span className="caption">Revoking a person's last grant strictly zeros their access (no role fallback)</span>
            </div>
            <span className="caption">Total active grants: {state.roleGrants.length}</span>
          </div>

          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Granted Person</th>
                  <th>Assigned Role</th>
                  <th>Scope Kind</th>
                  <th>Bound Entity / Context</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {state.roleGrants.map((g, idx) => (
                  <tr key={idx}>
                    <td><b>{g.userId}</b></td>
                    <td><span className="tag gray">{g.role}</span></td>
                    <td>
                      <span className={`badge ${g.scopeKind === 'Global' ? 'purple' : g.scopeKind === 'Client' ? 'blue' : 'teal'}`}>
                        {g.scopeKind}
                      </span>
                    </td>
                    <td>
                      {g.scopeKind === 'Global' && <span>Firm-wide unrestricted practice</span>}
                      {g.scopeKind === 'Client' && <b>Client: {g.scopeId}</b>}
                      {g.scopeKind === 'Engagement' && <b>Engagement: {g.scopeId}</b>}
                    </td>
                    <td>
                      <button
                        className="btn sm ghost text-danger"
                        onClick={() => handleRevokeAccess(g)}
                      >
                        Revoke Grant
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="panel">
          <div className="panel-head"><h3>Immutable Access Grant History</h3><span className="caption">New grants append here; revocation never erases its grant event.</span></div>
          <div className="tablewrap"><table><thead><tr><th>Time</th><th>Action</th><th>Person</th><th>Role</th><th>Scope</th><th>Actor</th><th>Reason</th></tr></thead><tbody>
            {[...state.roleGrantHistory].reverse().map(event => <tr key={event.id}>
              <td>{event.at}</td><td><span className={`badge ${event.action === 'Granted' ? 'green' : 'amber'}`}>{event.action}</span></td>
              <td>{state.users.find(user => user.id === event.userId)?.name || event.userId}</td><td>{event.role}</td>
              <td>{event.scopeKind}{event.scopeId ? ` · ${event.scopeId}` : ''}</td>
              <td>{state.users.find(user => user.id === event.actorUserId)?.name || event.actorUserId}</td><td>{event.reason || '—'}</td>
            </tr>)}
          </tbody></table></div>
          {state.roleGrantHistory.length === 0 && <p className="sub panel-pad">No access changes have been recorded in this browser state.</p>}
        </div>
      )}

      {/* Firm Legal Details */}
      {activeTab === 'firm' && (
        <div className="panel panel-pad">
          <h3>Firm Statutory Profile</h3>
          <div className="grid2 mt16" style={{ gap: 16 }}>
            <div>
              <label className="caption">Firm Trading Name</label>
              <input type="text" className="input" defaultValue="Al-Nuaimi & Partners Certified Public Accountants" />
            </div>
            <div>
              <label className="caption">Statutory Registration Number</label>
              <input type="text" className="input" defaultValue="CPA-QA-2018-0042" />
            </div>
            <div>
              <label className="caption">Licensed Jurisdiction</label>
              <input type="text" className="input" defaultValue="State of Qatar · QFMA & Ministry of Commerce" />
            </div>
            <div>
              <label className="caption">Reporting Currency</label>
              <input type="text" className="input" defaultValue="Qatari Riyal (QAR)" />
            </div>
          </div>
        </div>
      )}

      {/* RBAC Catalogue */}
      {activeTab === 'permissions' && (
        <div className="panel panel-pad">
          <h3>The 14 Prototype Application Roles</h3>
          <p className="sub mt4">Explicit separation of duties catalogue enforced across all business commands.</p>
          <div className="grid2 mt16" style={{ gap: 12 }}>
            {[
              { role: 'manager', label: 'Engagement Manager', scope: 'Assigned engagements; prepares candidates, review notes, and TB adjustments.' },
              { role: 'partner', label: 'Engagement Partner', scope: 'Final statutory sign-off, release authorization, and proposal approvals.' },
              { role: 'preparer', label: 'Audit Preparer', scope: 'Drafts workpapers, uploads client evidence, logs substantive testing.' },
              { role: 'reviewer', label: 'Senior Reviewer', scope: 'Clears working papers, raises review notes, verifies checklists.' },
              { role: 'eqr', label: 'Engagement Quality Reviewer', scope: 'Independent quality concurrence and EQR concern logging.' },
              { role: 'billing', label: 'Billing Officer', scope: 'Drafts invoices, applies credit notes, and manages offline receipts.' },
              { role: 'admin', label: 'System Administrator', scope: 'Firm settings, persona management, and explicit scope grant authoring.' },
              { role: 'client', label: 'Management Approver', scope: 'Formal approval of financial packages and representation letters.' },
              { role: 'client_admin', label: 'Client Administrator', scope: 'Client organization user management (not management accounts).' },
              { role: 'client_finance', label: 'Client Contributor', scope: 'Uploads PBC evidence and views published billing invoices.' }
            ].map((r, i) => (
              <div key={i} className="borderbox" style={{ padding: 12 }}>
                <div className="between">
                  <b>{r.label}</b>
                  <span className="mono tag gray">{r.role}</span>
                </div>
                <div className="cell-sub mt4">{r.scope}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* User Detail Drawer */}
      {selectedUser && (
        <div className="modal-overlay" onClick={() => setSelectedUser(null)}>
          <div className="modal-card" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
            <div className="between">
              <h3>User Detail: {selectedUser.name}</h3>
              <button className="btn sm ghost" onClick={() => setSelectedUser(null)}>✕</button>
            </div>

            <div className="info-grid mt16">
              <div><label>Practice Role</label><span>{selectedUser.label}</span></div>
              <div><label>Role Code</label><span className="mono">{selectedUser.role}</span></div>
              <div><label>Email</label><span className="mono">{selectedUser.email}</span></div>
              <div><label>Account Status</label><span className={`badge ${selectedUser.status === 'Active' ? 'green' : 'red'}`}>{selectedUser.status}</span></div>
            </div>

            <div className="divider mt16" />

            <div className="between mt16">
              <h4>Assigned Explicit Scope Grants ({userGrants(selectedUser).length})</h4>
              <button
                className="btn sm primary"
                onClick={() => setShowGrantModal(true)}
              >
                + New Grant
              </button>
            </div>

            {userGrants(selectedUser).length === 0 ? (
              <div className="borderbox mt12 text-center" style={{ padding: 16 }}>
                <b>No active grants assigned.</b>
                <p className="sub mt4">Under the least-privilege contract, this identity has zero access authority.</p>
              </div>
            ) : (
              <div className="stack mt12" style={{ gap: 8 }}>
                {userGrants(selectedUser).map((g, idx) => (
                  <div key={idx} className="between borderbox" style={{ padding: 10 }}>
                    <div>
                      <span className={`badge ${g.scopeKind === 'Global' ? 'purple' : g.scopeKind === 'Client' ? 'blue' : 'teal'}`}>
                        {g.scopeKind}
                      </span>
                      <span style={{ marginLeft: 8 }}>
                        {g.scopeKind === 'Global' && 'Unrestricted firm access'}
                        {g.scopeKind === 'Client' && `Client: ${g.scopeId}`}
                        {g.scopeKind === 'Engagement' && `Engagement: ${g.scopeId}`}
                      </span>
                    </div>
                    <button
                      className="btn sm ghost text-danger"
                      onClick={() => handleRevokeAccess(g)}
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Grant Creation Modal */}
      {showGrantModal && selectedUser && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: 500 }}>
            <div className="between">
              <h3>Grant Access Scope</h3>
              <button className="btn sm ghost" onClick={() => setShowGrantModal(false)}>✕</button>
            </div>
            <p className="sub mt4">Author explicit scope grant for {selectedUser.name}.</p>

            <div className="stack mt16" style={{ gap: 12 }}>
              <div>
                <label className="caption">Scope Kind</label>
                <select
                  className="input"
                  value={grantScopeKind}
                  onChange={e => setGrantScopeKind(e.target.value as any)}
                >
                  <option value="Client">Client Scope (Restricted to one client)</option>
                  <option value="Engagement">Engagement Scope (Restricted to one engagement)</option>
                  <option value="Global">Global Scope (Practice-wide)</option>
                </select>
              </div>

              {grantScopeKind === 'Client' && (
                <div>
                  <label className="caption">Target Client</label>
                  <select
                    className="input"
                    value={grantClientId}
                    onChange={e => setGrantClientId(e.target.value)}
                  >
                    {state.clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.id})</option>
                    ))}
                  </select>
                </div>
              )}

              {grantScopeKind === 'Engagement' && (
                <div>
                  <label className="caption">Target Engagement</label>
                  <select
                    className="input"
                    value={grantEngagementId}
                    onChange={e => setGrantEngagementId(e.target.value)}
                  >
                    {state.engagements.map(eng => (
                      <option key={eng.id} value={eng.id}>{eng.id} · {eng.client} · {eng.service}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="caption">Requested persona role</label>
                <input className="input" value={selectedUser.role} readOnly />
              </div>
            </div>

            <div className="row mt20" style={{ gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn sm ghost" onClick={() => setShowGrantModal(false)}>Cancel</button>
              <button className="btn primary sm" onClick={handleGrantAccess}>
                Record approved grant
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
