// AuditSphere Layout Shell
// Sidebar, Topbar, Scenario Switcher, Search Modal, and Notifications

import React, { useState } from 'react';
import { RouteKey, RoleKey } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { SCENARIO_DEFINITIONS, ScenarioName } from '../../store/scenarios';
import { Icon } from '../common/Icons';

interface ShellProps {
  currentRoute: RouteKey;
  onRouteChange: (route: RouteKey) => void;
  children: React.ReactNode;
}

export const Shell: React.FC<ShellProps> = ({ currentRoute, onRouteChange, children }) => {
  const state = prototypeStore.getSnapshot();
  const [showScenarioModal, setShowScenarioModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: number; text: string; type?: string }>>([]);

  const selectedEng = state.engagements.find(e => e.id === state.selectedEngagement) || state.engagements[0];
  const selectedClient = state.clients.find(c => c.id === selectedEng?.client);
  const currentPersona = state.users.find(u => u.role === state.currentRole) || state.users[0];

  const triggerToast = (text: string, type = '') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  };

  const navGroups: Array<[string, Array<{ key: RouteKey; label: string; icon: string; count?: number }>]> = [
    [
      'PRACTICE',
      [
        { key: 'overview', label: 'Practice Overview', icon: 'grid' },
        { key: 'clients', label: 'Client Portfolio', icon: 'users', count: state.clients.length },
        { key: 'acquisition', label: 'Acquisition & Pipeline', icon: 'target', count: state.leads.filter(l => l.stage !== 'Won').length },
        { key: 'proposals', label: 'Proposals & Terms', icon: 'receipt' },
        { key: 'engagements', label: 'Engagements', icon: 'brief', count: state.engagements.length },
        { key: 'onboarding', label: 'Acceptance & KYC', icon: 'shield' }
      ]
    ],
    [
      'WORK & COLLABORATION',
      [
        { key: 'jobs', label: 'Jobs & Tasks', icon: 'checkboard', count: state.jobs.length },
        { key: 'job-templates', label: 'Job Templates', icon: 'layers' },
        { key: 'communications', label: 'Team & Client Comms', icon: 'message' },
        { key: 'documents', label: 'Documents & SharePoint', icon: 'folder', count: state.documents.length }
      ]
    ],
    [
      'ECONOMICS & BILLING',
      [
        { key: 'my-time', label: 'Time Tracking', icon: 'clock' },
        { key: 'budgets', label: 'Budgets & Variances', icon: 'calculator' },
        { key: 'billing', label: 'Billing & Invoices', icon: 'receipt', count: state.invoices.filter(i => i.status === 'Issued').length },
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
        { key: 'audit', label: 'Audit Workpapers', icon: 'checkboard', count: selectedEng?.workpapers.length },
        { key: 'evidence', label: 'Evidence Catalogue', icon: 'folder' },
        { key: 'findings', label: 'Findings & Differences', icon: 'target', count: state.findings.length },
        { key: 'reviews', label: 'Review Desk', icon: 'message', count: selectedEng?.reviews.filter(r => r.status !== 'Cleared').length },
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

  const handleRoleChange = (role: RoleKey) => {
    prototypeStore.setRole(role);
    triggerToast(`Switched active role to ${prototypeStore.getSnapshot().currentPerson} (${role})`);
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

  // Global search filtering
  const searchResults = searchQuery.trim()
    ? [
        ...state.clients
          .filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
          .map(c => ({ title: c.name, sub: `Client · ${c.id} · ${c.industry}`, route: 'clients' as RouteKey })),
        ...state.engagements
          .filter(e => e.service.toLowerCase().includes(searchQuery.toLowerCase()) || e.id.toLowerCase().includes(searchQuery.toLowerCase()))
          .map(e => ({ title: `${e.id} · ${e.service}`, sub: `Engagement · FY ${e.year}`, route: 'engagements' as RouteKey })),
        ...state.jobs
          .filter(j => j.title.toLowerCase().includes(searchQuery.toLowerCase()))
          .map(j => ({ title: j.title, sub: `Job · ${j.id}`, route: 'jobs' as RouteKey })),
        ...state.documents
          .filter(d => d.name.toLowerCase().includes(searchQuery.toLowerCase()))
          .map(d => ({ title: d.name, sub: `Document · v${d.version}`, route: 'documents' as RouteKey })),
        ...state.invoices
          .filter(i => i.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()))
          .map(i => ({ title: i.invoiceNumber, sub: `Invoice · ${i.amount} ${i.currency}`, route: 'billing' as RouteKey }))
      ]
    : [];

  return (
    <div id="app-root">
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
              onClick={() => setShowSearchModal(true)}
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
                <label htmlFor="role-select">SIMULATED ROLE</label>
                <select
                  id="role-select"
                  value={state.currentRole}
                  onChange={e => handleRoleChange(e.target.value as RoleKey)}
                >
                  {state.users.map(u => (
                    <option key={u.id} value={u.role}>
                      {u.label} ({u.name})
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
              value={state.selectedEngagement}
              onChange={e => handleEngagementChange(e.target.value)}
              aria-label="Selected engagement"
            >
              {state.engagements.map(eng => {
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
              {searchResults.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 10px', color: '#798e91' }}>
                  {searchQuery ? 'No matching records found in demo state.' : 'Type a query to search all practice records.'}
                </div>
              ) : (
                <div className="stack" style={{ gap: 8 }}>
                  {searchResults.map((item, idx) => (
                    <button
                      key={idx}
                      className="borderbox"
                      style={{ textAlign: 'left', width: '100%', cursor: 'pointer', padding: 10 }}
                      onClick={() => {
                        onRouteChange(item.route);
                        setShowSearchModal(false);
                      }}
                    >
                      <b>{item.title}</b>
                      <div className="cell-sub">{item.sub}</div>
                    </button>
                  ))}
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
