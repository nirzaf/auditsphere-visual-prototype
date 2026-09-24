// AuditSphere Layout Shell
// Sidebar, Topbar, Scenario Switcher, Search Modal, and Notifications

import React, { useState } from 'react';
import { RouteKey, RoleKey } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { canOpenRoute, visibleClientIds, visibleEngagementIds, isClientRole } from '../../services/guards';
import { SCENARIO_DEFINITIONS, ScenarioName } from '../../store/scenarios';
import { Icon } from '../common/Icons';

interface ShellProps {
  currentRoute: RouteKey;
  onRouteChange: (route: RouteKey, targetId?: string) => void;
  onSelectClient: (clientId: string) => void;
  children: React.ReactNode;
}

export const Shell: React.FC<ShellProps> = ({ currentRoute, onRouteChange, onSelectClient, children }) => {
  const state = prototypeStore.getSnapshot();
  const [showScenarioModal, setShowScenarioModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchRecordType, setSearchRecordType] = useState('all');
  const [searchContext, setSearchContext] = useState('all');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: number; text: string; type?: string }>>([]);
  const activeIdentity = state.users.find(user => user.id === state.currentUserId)?.status === 'Active';

  const allowedClientIds = visibleClientIds(state);
  const allowedEngagementIds = visibleEngagementIds(state);
  const scopedClients = state.clients.filter(c => allowedClientIds === 'ALL' || allowedClientIds.includes(c.id));
  const scopedEngagements = state.engagements.filter(e => allowedEngagementIds === 'ALL' || allowedEngagementIds.includes(e.id));
  const selectedEng = scopedEngagements.find(e => e.id === state.selectedEngagement) || scopedEngagements[0];
  const selectedClient = state.clients.find(c => c.id === selectedEng?.client);
  const currentPersona = state.users.find(u => u.id === state.currentUserId) || state.users[0];

  const triggerToast = (text: string, type = '') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  };

  const clientMode = isClientRole(state.currentRole);

  const staffNavGroups: Array<[string, Array<{ key: RouteKey; label: string; icon: string; count?: number }>]> = [
    [
      'PRACTICE',
      [
        { key: 'overview', label: 'Practice Overview', icon: 'grid' },
        { key: 'clients', label: 'Client Portfolio', icon: 'users', count: scopedClients.length },
        { key: 'acquisition', label: 'Acquisition & Pipeline', icon: 'target', count: state.leads.filter(l => l.stage !== 'Won').length },
        { key: 'proposals', label: 'Proposals & Terms', icon: 'receipt' },
        { key: 'engagements', label: 'Engagements', icon: 'brief', count: scopedEngagements.length },
        { key: 'onboarding', label: 'Acceptance & KYC', icon: 'shield' }
      ]
    ],
    [
      'WORK & COLLABORATION',
      [
        { key: 'jobs', label: 'Jobs & Tasks', icon: 'checkboard', count: state.jobs.filter(j => allowedEngagementIds === 'ALL' || allowedEngagementIds.includes(j.engagementId)).length },
        { key: 'job-templates', label: 'Job Templates', icon: 'layers' },
        { key: 'communications', label: 'Team & Client Comms', icon: 'message' },
        { key: 'documents', label: 'Documents & SharePoint', icon: 'folder', count: state.documents.filter(d => d.clientId && (allowedClientIds === 'ALL' || allowedClientIds.includes(d.clientId))).length }
      ]
    ],
    [
      'ECONOMICS & BILLING',
      [
        { key: 'my-time', label: 'Time Tracking', icon: 'clock' },
        { key: 'budgets', label: 'Budgets & Variances', icon: 'calculator' },
        { key: 'billing', label: 'Billing & Invoices', icon: 'receipt', count: state.invoices.filter(i => i.status === 'Issued' && (allowedClientIds === 'ALL' || allowedClientIds.includes(i.clientId))).length },
        { key: 'receivables', label: 'Receivables & Receipts', icon: 'receipt' }
      ]
    ],
    [
      'ACCOUNTING WORKBENCH',
      [
        { key: 'accounting-setup', label: 'Accounting Workbench', icon: 'calculator' },
        { key: 'financial-statements', label: 'Financial Statements', icon: 'file' },
        { key: 'financial-packages', label: 'Financial Packages', icon: 'archive' },
        { key: 'consolidation', label: 'Group Consolidation', icon: 'layers' }
      ]
    ],
    [
      'AUDIT & ASSURANCE',
      [
        { key: 'audit-planning', label: 'Audit Planning & Materiality', icon: 'target' },
        { key: 'audit-risks', label: 'Risks & Audit Programs', icon: 'shield' },
        { key: 'sampling', label: 'Sampling & Populations', icon: 'checkboard' },
        { key: 'audit', label: 'Audit Workpapers', icon: 'checkboard', count: selectedEng?.workpapers?.length },
        { key: 'evidence', label: 'Evidence Catalogue', icon: 'folder' },
        { key: 'findings', label: 'Findings & Differences', icon: 'target', count: state.findings.filter(f => allowedEngagementIds === 'ALL' || allowedEngagementIds.includes(f.engagementId)).length },
        { key: 'reviews', label: 'Review Desk', icon: 'message', count: selectedEng?.reviews?.filter(r => r.status !== 'Cleared').length },
        { key: 'approvals', label: 'Sign-offs & EQR', icon: 'shield' },
        { key: 'delivery', label: 'Release & Completion', icon: 'archive' },
        { key: 'records', label: 'Records & Archive', icon: 'archive' }
      ]
    ],
    [
      'CLIENT SERVICES & ADMIN',
      [
        { key: 'portal', label: 'Client Portal Preview', icon: 'globe' },
        { key: 'reports', label: 'Report Centre', icon: 'calculator' },
        { key: 'administration', label: 'Firm Administration', icon: 'settings' },
        { key: 'm365-setup', label: 'Microsoft 365 Setup', icon: 'settings' },
        { key: 'requirements', label: 'Requirements & PRD', icon: 'book' }
      ]
    ]
  ];

  const clientNavGroups: Array<[string, Array<{ key: RouteKey; label: string; icon: string; count?: number }>]> = [
    [
      'CLIENT SECURE PORTAL',
      [
        { key: 'portal', label: 'Client Experience Portal', icon: 'globe' },
        { key: 'requirements', label: 'Specifications & PRD', icon: 'book' }
      ]
    ]
  ];

  const navGroups = (clientMode ? clientNavGroups : staffNavGroups)
    .map(([name, items]) => [name, items.filter(item => canOpenRoute(state.currentRole, item.key, activeIdentity))] as [string, typeof items])
    .filter(([, items]) => items.length > 0);

  const handleRoleChange = (userId: string) => {
    prototypeStore.setPersona(userId);
    const snap = prototypeStore.getSnapshot();
    if (isClientRole(snap.currentRole)) {
      onRouteChange('portal');
    }
    triggerToast(`Switched simulated identity to ${snap.currentPerson} (${snap.currentRole})`);
  };

  const handleEngagementChange = (engId: string) => {
    prototypeStore.setSelectedEngagement(engId);
    triggerToast(`Switched active engagement to ${engId}`);
  };

  const handleSelectScenario = (scenId: ScenarioName) => {
    prototypeStore.loadScenario(scenId);
    setShowScenarioModal(false);
    triggerToast(`Loaded scenario preset: ${scenId}`, 'success');
  };

  // Global search filtering — VP-061: deterministic local metadata search, scoped by
  // grants. Unauthorized records contribute no title, snippet, count or ordering.
  // Historical requirements text is NOT indexed here (separate Requirements view).
  const searchResults = (() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const matches = (...values: Array<string | undefined>) => values.some(value => value?.toLowerCase().includes(q));
    const allowedClients = visibleClientIds(state);
    const allowedEngs = visibleEngagementIds(state);
    const clientAllowed = (id?: string) =>
      allowedClients === 'ALL' || (!!id && allowedClients.includes(id));
    const engAllowed = (id?: string) =>
      allowedEngs === 'ALL' || (!!id && allowedEngs.includes(id));
    const clientRole = isClientRole(state.currentRole);
    const out: Array<{ title: string; sub: string; route: RouteKey; objectId: string; clientId?: string; engagementId?: string }> = [];
    state.clients.filter(c => clientAllowed(c.id) && matches(c.name, c.id))
      .forEach(c => out.push({ title: c.name, sub: `Client · ${c.id} · ${c.industry}`, route: 'client-detail', objectId: c.id, clientId: c.id }));
    state.contacts.filter(c => clientAllowed(c.clientId) && matches(c.name, c.id))
      .forEach(c => out.push({ title: c.name, sub: `Contact · ${c.clientId}`, route: 'client-detail', objectId: c.id, clientId: c.clientId }));
    state.engagements.filter(e => engAllowed(e.id) && matches(e.service, e.id))
      .forEach(e => out.push({ title: `${e.id} · ${e.service}`, sub: `Engagement · FY ${e.year}`, route: 'engagements', objectId: e.id, clientId: e.client, engagementId: e.id }));
    state.jobs.filter(j => engAllowed(j.engagementId) && matches(j.title, j.id))
      .forEach(j => out.push({ title: j.title, sub: `Job · ${j.id}`, route: 'jobs', objectId: j.id, clientId: j.clientId, engagementId: j.engagementId }));
    if (!clientRole) {
      state.documents.filter(d => clientAllowed(d.clientId) && engAllowed(d.engagementId) && matches(d.name, d.id))
        .forEach(d => out.push({ title: d.name, sub: `Document · v${d.version}`, route: 'documents', objectId: d.id, clientId: d.clientId, engagementId: d.engagementId }));
      state.jobTasks.filter(t => {
        const job = state.jobs.find(j => j.id === t.jobId);
        return job && engAllowed(job.engagementId) && matches(t.title, t.id);
      }).forEach(t => { const j = state.jobs.find(x => x.id === t.jobId)!; out.push({ title: t.title, sub: `Task · ${t.id}`, route: 'jobs', objectId: t.id, clientId: j.clientId, engagementId: j.engagementId }); });
      state.invoices.filter(i => clientAllowed(i.clientId) && matches(i.invoiceNumber, i.id))
        .forEach(i => out.push({ title: i.invoiceNumber, sub: `Invoice · ${i.amount} ${i.currency}`, route: 'billing', objectId: i.id, clientId: i.clientId, engagementId: i.engagementId || i.eng }));
      state.communications.filter(c => clientAllowed(c.clientId) && matches(c.summary, c.participants, c.id))
        .forEach(c => out.push({ title: c.summary, sub: `Communication · ${c.channel}`, route: 'communications', objectId: c.id, clientId: c.clientId, engagementId: c.engagementId }));
      state.findings.filter(f => {
        const eng = state.engagements.find(e => e.id === f.engagementId);
        return eng && engAllowed(eng.id) && matches(f.title, f.id);
      }).forEach(f => out.push({ title: f.title, sub: `Finding · ${f.id}`, route: 'findings', objectId: f.id, engagementId: f.engagementId }));
      state.engagements.filter(e => engAllowed(e.id)).forEach(e => {
        e.workpapers.filter(w => matches(w.title, w.id))
          .forEach(w => out.push({ title: w.title, sub: `Workpaper · ${w.id}`, route: 'audit', objectId: w.id, clientId: e.client, engagementId: e.id }));
        e.pbc.filter(p => matches(p.title, p.id))
          .forEach(p => out.push({ title: p.title, sub: `PBC · ${p.id}`, route: 'portal', objectId: p.id, clientId: e.client, engagementId: e.id }));
      });
    } else {
      // Client projection: only explicitly shared documents/packages surface.
      state.documents.filter(d => clientAllowed(d.clientId) && engAllowed(d.engagementId) && d.visibility === 'Client shared' && matches(d.name, d.id))
        .forEach(d => out.push({ title: d.name, sub: `Shared document · v${d.version}`, route: 'portal', objectId: d.id, clientId: d.clientId, engagementId: d.engagementId }));
    }
    return out;
  })();
  const searchTypes = [...new Set(searchResults.map(item => item.sub.split(' · ')[0]))].sort();
  const filteredSearchResults = searchResults.filter(item => {
    const kind = item.sub.split(' · ')[0];
    if (searchRecordType !== 'all' && kind !== searchRecordType) return false;
    if (searchContext.startsWith('client:') && item.clientId !== searchContext.slice(7)) return false;
    if (searchContext.startsWith('engagement:') && item.engagementId !== searchContext.slice(11)) return false;
    return true;
  }).slice(0, 30);

  return (
    <div id="app-root">
      {(prototypeStore.getLoadError() || prototypeStore.isSessionOnlyMode()) && (
        <div role="status" className="panel panel-pad" style={{ background: '#fff7ed', color: '#9a3412', margin: 12 }}>
          {prototypeStore.getLoadError() || 'Browser storage is unavailable; changes last only for this session.'}
        </div>
      )}
      {prototypeStore.hasStorageConflict() && (
        <div role="alert" className="panel panel-pad" style={{ background: '#fef2f2', color: '#991b1b', margin: 12 }}>
          <b>Another tab saved newer demo data.</b> This tab will not overwrite it until you resolve the conflict.
          <div className="row mt8" style={{ gap: 8 }}>
            <button className="btn sm primary" onClick={() => {
              try { prototypeStore.resolveStorageConflict('reload'); window.location.reload(); }
              catch (e) { triggerToast(e instanceof Error ? e.message : 'Reload failed', 'error'); }
            }}>Reload newer state</button>
            <button className="btn sm ghost" onClick={() => {
              try { prototypeStore.resolveStorageConflict('keep-local'); }
              catch (e) { triggerToast(e instanceof Error ? e.message : 'Could not preserve the other tab state', 'error'); }
            }}>Keep this tab and replace newer state</button>
          </div>
        </div>
      )}
      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div
          className="mobile-overlay"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Main Sidebar */}
      <aside className={`sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="brandmark">
            <Icon name="layers" />
          </div>
          <div className="brandname">
            Audit<span>Sphere</span>
          </div>
        </div>

        <div className="workspaceselect">
          <span className="firmavatar">STE</span>
          <span>
            <b>STE Audit & Accounting</b>
            <div style={{ fontSize: '9px', color: '#789598', marginTop: '1px' }}>
              Practice Workspace · Doha, Qatar
            </div>
          </span>
        </div>

        <nav className="side-scroll" aria-label="Main navigation">
          {navGroups.map(([groupName, items]) => (
            <React.Fragment key={groupName}>
              <div className="nav-label">{groupName}</div>
              {items.map(item => (
                <button
                  key={item.key}
                  className={`navitem ${currentRoute === item.key ? 'active' : ''}`}
                  onClick={() => {
                    onRouteChange(item.key);
                    setMobileMenuOpen(false);
                  }}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                  {item.count !== undefined && item.count > 0 && (
                    <span className="count">{item.count}</span>
                  )}
                </button>
              ))}
            </React.Fragment>
          ))}
        </nav>

        <div className="side-footer">
          <div className="side-demo">
            <strong>
              <span className="demo-dot" style={{ display: 'inline-block', marginRight: '6px' }} />
              Interactive Prototype
            </strong>
            <br />
            Synthetic records. No live external integrations. Changes saved in this browser.
          </div>
          <button
            className="navitem"
            onClick={() => {
              prototypeStore.resetState();
              triggerToast('Demo state reset to initial baseline.');
            }}
          >
            <Icon name="refresh" />
            <span>Reset Demo State</span>
          </button>
        </div>
      </aside>

      {/* Main Shell Content */}
      <div className="shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-btn mobile-menu"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Open Navigation"
            >
              <Icon name="menu" />
            </button>
            <div className="crumb">
              Workspace &nbsp;/&nbsp; <b>{currentRoute.toUpperCase().replace('-', ' ')}</b>
            </div>
            <button
              className="search-trigger"
              onClick={() => { setSearchRecordType('all'); setSearchContext('all'); setShowSearchModal(true); }}
            >
              <Icon name="search" />
              <span>Search clients, jobs, workpapers, invoices…</span>
              <kbd>/</kbd>
            </button>
          </div>

          <div className="topbar-right">
            <span className="demo-pill">
              <span className="demo-dot" />
              LOCAL DEMO
            </span>
            <button
              className="btn sm tour-header"
              onClick={() => setShowScenarioModal(true)}
            >
              <Icon name="layers" />
              Explore Scenarios
            </button>
            <div className="persona">
              <div className="firmavatar" style={{ width: 28, height: 28, fontSize: 11 }}>
                {currentPersona.initials}
              </div>
              <div>
                <label htmlFor="role-select">SIMULATED IDENTITY (NOT LIVE AUTH)</label>
                <select
                  id="role-select"
                  value={state.currentUserId}
                  onChange={e => handleRoleChange(e.target.value)}
                >
                  {state.users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.label} — {u.name}{u.status !== 'Active' ? ' (disabled)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </header>

        {/* Global Context Bar */}
        <div className="contextbar">
          <div className="context-item">
            <label>Client / Engagement</label>
            <select
              value={selectedEng?.id || ''}
              onChange={e => handleEngagementChange(e.target.value)}
              aria-label="Selected engagement"
              disabled={!scopedEngagements.length}
            >
              {!scopedEngagements.length && <option value="">No permitted engagement</option>}
              {scopedEngagements.map(eng => {
                const c = state.clients.find(x => x.id === eng.client);
                return (
                  <option key={eng.id} value={eng.id}>
                    {c?.name || 'Client'} · FY {eng.year} ({eng.service})
                  </option>
                );
              })}
            </select>
          </div>
          <div className="context-item">
            <label>Service</label>
            <span>{selectedEng?.service || 'External audit'}</span>
          </div>
          <div className="context-item">
            <label>Period</label>
            <span>FY {selectedEng?.year || 2026}</span>
          </div>
          <div className="context-item">
            <label>Mode / Currency</label>
            <span>{selectedEng?.mode || 'External books'} · QAR</span>
          </div>
          <div className="context-item">
            <label>Package Rev</label>
            <span className="mono">v{selectedEng?.packageRevision || 3}</span>
            <span className="tag green" style={{ marginLeft: 6 }}>Current</span>
          </div>
        </div>

        {/* Main Content Area */}
        <main className="main" id="main" tabIndex={-1}>
          {children}
        </main>
      </div>

      {/* Scenario Chooser Modal */}
      {showScenarioModal && (
        <div className="modal-backdrop" onClick={() => setShowScenarioModal(false)}>
          <div className="modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Select Demo Scenario Preset</h2>
              <button className="icon-btn" onClick={() => setShowScenarioModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p className="sub" style={{ marginBottom: 16 }}>
                Switch between fully-realized synthetic scenarios to demonstrate different phases of the practice, accounting, audit, and consolidation lifecycles.
              </p>
              <div className="stack" style={{ gap: 10 }}>
                {SCENARIO_DEFINITIONS.map(scen => (
                  <div
                    key={scen.id}
                    className="borderbox"
                    style={{ cursor: 'pointer', padding: '14px', borderRadius: 6 }}
                    onClick={() => handleSelectScenario(scen.id)}
                  >
                    <div className="between">
                      <b style={{ color: 'var(--teal-dark)' }}>{scen.title}</b>
                      <span className="tag blue">Load Preset</span>
                    </div>
                    <p className="sub" style={{ marginTop: 6, fontSize: 12 }}>{scen.description}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn ghost sm" onClick={() => setShowScenarioModal(false)}>Cancel</button>
              <button
                className="btn sm"
                onClick={() => {
                  prototypeStore.resetState();
                  setShowScenarioModal(false);
                  triggerToast('Reset to default initial baseline');
                }}
              >
                Reset Default
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Search Modal */}
      {showSearchModal && (
        <div className="modal-backdrop" onClick={() => setShowSearchModal(false)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div className="row" style={{ flex: 1, gap: 10 }}>
                <Icon name="search" />
                <input
                  type="text"
                  className="input"
                  style={{ flex: 1 }}
                  placeholder="Type to search clients, engagements, jobs, documents..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  autoFocus
                />
              </div>
              <button className="icon-btn" onClick={() => setShowSearchModal(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ maxHeight: 380, overflowY: 'auto' }}>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <label className="caption" htmlFor="global-search-type">Record type</label>
                <select id="global-search-type" className="input sm" value={searchRecordType} onChange={e => setSearchRecordType(e.target.value)}>
                  <option value="all">All types</option>
                  {searchTypes.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
                <label className="caption" htmlFor="global-search-context">Context</label>
                <select id="global-search-context" className="input sm" value={searchContext} onChange={e => setSearchContext(e.target.value)}>
                  <option value="all">All permitted contexts</option>
                  {scopedClients.map(client => <option key={`client:${client.id}`} value={`client:${client.id}`}>Client · {client.name}</option>)}
                  {scopedEngagements.map(engagement => <option key={`engagement:${engagement.id}`} value={`engagement:${engagement.id}`}>Engagement · {engagement.id}</option>)}
                </select>
              </div>
              {filteredSearchResults.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 10px', color: '#798e91' }}>
                  {searchQuery ? 'No matching records found in demo state.' : 'Type a query to search all practice records.'}
                </div>
              ) : (
                <div className="stack" style={{ gap: 8 }}>
                  {filteredSearchResults.map((item, idx) => {
                    const kind = item.sub.split(' · ')[0];
                    return <React.Fragment key={`${kind}:${item.objectId}`}>
                      {idx === 0 || filteredSearchResults[idx - 1].sub.split(' · ')[0] !== kind ? <h4 className="eyebrow">{kind}</h4> : null}
                      <button
                        className="borderbox"
                        style={{ textAlign: 'left', width: '100%', cursor: 'pointer', padding: 10 }}
                        onClick={() => {
                          if (item.clientId) onSelectClient(item.clientId);
                          if (item.engagementId) prototypeStore.setSelectedEngagement(item.engagementId);
                          onRouteChange(item.route, item.objectId);
                          setShowSearchModal(false);
                        }}
                      >
                        <b>{item.title}</b>
                        <div className="cell-sub">{item.sub}</div>
                      </button>
                    </React.Fragment>;
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification Container */}
      <div id="toasts">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type || ''}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
};
