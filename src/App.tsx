// AuditSphere Main Application Component
// Subscribes to prototypeStore and renders modern UI Shell with all 39 functional modules

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RouteKey } from './types';
import { prototypeStore } from './store/prototypeStore';
import { canOpenRoute, isClientRole } from './services/guards';
import { Shell } from './components/layout/Shell';

// Practice & CRM Modules
import { DashboardView } from './components/modules/DashboardView';
import { ClientsView } from './components/modules/ClientsView';
import { ClientDetailView } from './components/modules/ClientDetailView';
import { LeadsPipelineView } from './components/modules/LeadsPipelineView';
import { ProposalsView } from './components/modules/ProposalsView';
import { EngagementsView } from './components/modules/EngagementsView';

// Work & Collaboration Modules
import { JobsTasksView } from './components/modules/JobsTasksView';
import { JobTemplatesView } from './components/modules/JobTemplatesView';
import { DocumentsLibraryView } from './components/modules/DocumentsLibraryView';
import { CommunicationsView } from './components/modules/CommunicationsView';

// Economics & Billing Modules
import { TimeTrackingView } from './components/modules/TimeTrackingView';
import { BudgetsView } from './components/modules/BudgetsView';
import { BillingInvoicingView } from './components/modules/BillingInvoicingView';
import { ReceivablesView } from './components/modules/ReceivablesView';

// Accounting Workbench & Reporting
import { AccountingWorkbenchView } from './components/modules/AccountingWorkbenchView';
import { FinancialStatementsView } from './components/modules/FinancialStatementsView';
import { FinancialPackagesView } from './components/modules/FinancialPackagesView';
import { ConsolidationView } from './components/modules/ConsolidationView';

// Audit & Assurance Modules
import { AuditAcceptanceView } from './components/modules/AuditAcceptanceView';
import { AuditPlanningView } from './components/modules/AuditPlanningView';
import { AuditRisksProgramsView } from './components/modules/AuditRisksProgramsView';
import { SamplingView } from './components/modules/SamplingView';
import { WorkpapersView } from './components/modules/WorkpapersView';
import { EvidenceCatalogueView } from './components/modules/EvidenceCatalogueView';
import { FindingsView } from './components/modules/FindingsView';
import { ReviewDeskView } from './components/modules/ReviewDeskView';
import { ApprovalsEQRView } from './components/modules/ApprovalsEQRView';
import { ReleaseCompletionView } from './components/modules/ReleaseCompletionView';
import { RecordsArchiveView } from './components/modules/RecordsArchiveView';

// Client Services, Admin & Specifications
import { ClientPortalView } from './components/modules/ClientPortalView';
import { ReportingCentreView } from './components/modules/ReportingCentreView';
import { AdministrationView } from './components/modules/AdministrationView';
import { M365SetupView } from './components/modules/M365SetupView';
import { RequirementsView } from './components/modules/RequirementsView';
import { UnsavedFormGuard } from './services/unsavedFormGuard';

export const App: React.FC = () => {
  const [currentRoute, setCurrentRoute] = useState<RouteKey>('overview');
  const [selectedClientId, setSelectedClientId] = useState<string>('CLI-001');
  const [searchTargetId, setSearchTargetId] = useState<string | undefined>();
  const [, setTick] = useState(0);
  const unsavedForm = useRef<UnsavedFormGuard | null>(null);
  const [pendingTransition, setPendingTransition] = useState<{ run: () => void; label: string } | null>(null);

  const registerUnsavedForm = useCallback((guard: UnsavedFormGuard | null) => { unsavedForm.current = guard; }, []);
  const requestContextChange = useCallback((run: () => void) => {
    const guard = unsavedForm.current;
    if (guard?.isDirty()) setPendingTransition({ run, label: guard.label });
    else run();
  }, []);
  const resolveTransition = (choice: 'save' | 'discard') => {
    const pending = pendingTransition;
    const guard = unsavedForm.current;
    if (!pending || !guard) return;
    if (choice === 'save' && !guard.save()) return;
    if (choice === 'discard') guard.discard();
    unsavedForm.current = null;
    setPendingTransition(null);
    pending.run();
  };

  // Subscribe to store updates
  useEffect(() => {
    const unsubscribe = prototypeStore.subscribe(() => {
      setTick(t => t + 1);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    let activeDialog: HTMLElement | null = null;
    let returnFocus: HTMLElement | null = null;
    let dialogSequence = 0;
    const focusable = (dialog: HTMLElement) => [...dialog.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
    )].filter(element => element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0);
    const syncDialogs = () => {
      const dialogs = [...document.querySelectorAll<HTMLElement>('.modal-backdrop .modal')];
      dialogs.forEach(dialog => {
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        if (!dialog.hasAttribute('aria-label') && !dialog.hasAttribute('aria-labelledby')) {
          const title = dialog.querySelector<HTMLElement>('h1,h2,h3');
          if (title) {
            title.id ||= `dialog-title-${++dialogSequence}`;
            dialog.setAttribute('aria-labelledby', title.id);
          }
        }
        if (!dialog.hasAttribute('tabindex')) dialog.tabIndex = -1;
      });
      const next = dialogs.at(-1) || null;
      if (next === activeDialog) return;
      const previous = activeDialog;
      activeDialog = next;
      if (next) {
        if (!previous) returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        (focusable(next)[0] || next).focus();
      } else {
        const target = returnFocus;
        returnFocus = null;
        if (target?.isConnected) target.focus();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!activeDialog) return;
      if (event.key === 'Escape') {
        const backdrop = activeDialog.closest<HTMLElement>('.modal-backdrop');
        if (!backdrop) return;
        event.preventDefault();
        event.stopPropagation();
        backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      } else if (event.key === 'Tab') {
        const items = focusable(activeDialog);
        if (!items.length) { event.preventDefault(); activeDialog.focus(); return; }
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && (document.activeElement === first || !activeDialog.contains(document.activeElement))) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !activeDialog.contains(document.activeElement))) {
          event.preventDefault(); first.focus();
        }
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (activeDialog && event.target instanceof Node && !activeDialog.contains(event.target)) (focusable(activeDialog)[0] || activeDialog).focus();
    };
    const observer = new MutationObserver(syncDialogs);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('focusin', onFocus, true);
    syncDialogs();
    return () => {
      observer.disconnect();
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('focusin', onFocus, true);
    };
  }, []);

  const state = prototypeStore.getSnapshot();
  const isClient = isClientRole(state.currentRole);
  const activeIdentity = state.users.find(user => user.id === state.currentUserId)?.status === 'Active';
  const navigate = (route: RouteKey, targetId?: string) => {
    requestContextChange(() => {
      const current = prototypeStore.getSnapshot();
      const active = current.users.find(user => user.id === current.currentUserId)?.status === 'Active';
      setSearchTargetId(targetId);
      setCurrentRoute(canOpenRoute(current.currentRole, route, active) ? route : active && isClientRole(current.currentRole) ? 'portal' : active ? 'overview' : 'requirements');
    });
  };
  const effectiveRoute: RouteKey = !activeIdentity
    ? 'requirements'
    : isClient
    ? currentRoute === 'requirements' ? 'requirements' : 'portal'
    : canOpenRoute(state.currentRole, currentRoute, activeIdentity) ? currentRoute : 'overview';

  const renderModule = () => {
    switch (effectiveRoute) {
      // Practice & CRM
      case 'overview':
        return <DashboardView onNavigate={navigate} />;
      case 'clients':
        return (
          <ClientsView
            onNavigate={navigate}
            onSelectClientDetail={(cid) => {
              setSelectedClientId(cid);
              navigate('client-detail');
            }}
          />
        );
      case 'client-detail':
        return (
          <ClientDetailView
            key={`${selectedClientId}:${searchTargetId || ''}`}
            clientId={selectedClientId}
            searchTargetId={searchTargetId}
            onBack={() => setCurrentRoute('clients')}
            onNavigate={navigate}
          />
        );
      case 'acquisition':
      case 'crm' as any:
        return <LeadsPipelineView onNavigate={navigate} />;
      case 'proposals':
        return <ProposalsView onNavigate={navigate} />;
      case 'engagements':
        return <EngagementsView onNavigate={navigate} />;
      case 'onboarding':
      case 'audit-acceptance' as any:
        return <AuditAcceptanceView key={state.selectedEngagement} onNavigate={navigate} />;

      // Work & Collaboration
      case 'jobs':
        return <JobsTasksView key={`${state.selectedEngagement}:${searchTargetId || ''}`} searchTargetId={searchTargetId} onNavigate={navigate} />;
      case 'job-templates':
        return <JobTemplatesView onNavigate={navigate} />;
      case 'documents':
        return <DocumentsLibraryView key={`${state.selectedEngagement}:${searchTargetId || ''}`} searchTargetId={searchTargetId} onNavigate={navigate} />;
      case 'communications':
        return <CommunicationsView onNavigate={navigate} />;

      // Economics & Billing
      case 'my-time':
      case 'time-tracking' as any:
        return <TimeTrackingView onNavigate={navigate} />;
      case 'budgets':
        return <BudgetsView onNavigate={navigate} />;
      case 'billing':
        return <BillingInvoicingView onNavigate={navigate} />;
      case 'receivables':
        return <ReceivablesView onNavigate={navigate} />;

      // Accounting Workbench
      case 'accounting-setup':
      case 'trial-balance':
      case 'gl-transactions':
      case 'account-mappings':
      case 'adjustments':
      case 'reconciliations':
        return <AccountingWorkbenchView onNavigate={navigate} />;
      case 'financial-statements':
        return <FinancialStatementsView onNavigate={navigate} />;
      case 'financial-packages':
      case 'packages' as any:
        return <FinancialPackagesView key={state.selectedEngagement} onNavigate={navigate} />;
      case 'consolidation':
        return <ConsolidationView onNavigate={navigate} />;

      // Audit & Assurance
      case 'audit-planning':
        return <AuditPlanningView onNavigate={navigate} />;
      case 'audit-risks':
      case 'audit-fieldwork':
        return <AuditRisksProgramsView onNavigate={navigate} />;
      case 'sampling':
        return <SamplingView onNavigate={navigate} />;
      case 'audit':
        return <WorkpapersView key={`${state.selectedEngagement}:${searchTargetId || ''}`} searchTargetId={searchTargetId} onNavigate={navigate} />;
      case 'evidence':
        return <EvidenceCatalogueView onNavigate={navigate} />;
      case 'findings':
        return <FindingsView key={`${state.selectedEngagement}:${searchTargetId || ''}`} searchTargetId={searchTargetId} onNavigate={navigate} />;
      case 'reviews':
        return <ReviewDeskView onNavigate={navigate} />;
      case 'approvals':
      case 'quality':
        return <ApprovalsEQRView onNavigate={navigate} />;
      case 'delivery':
        return <ReleaseCompletionView onNavigate={navigate} />;
      case 'records':
        return <RecordsArchiveView onNavigate={navigate} />;

      // Client Services & Admin
      case 'portal':
      case 'client-portal' as any:
        return <ClientPortalView onNavigate={navigate} />;
      case 'reports':
      case 'reporting-centre' as any:
        return <ReportingCentreView onNavigate={navigate} />;
      case 'administration':
      case 'services':
        return <AdministrationView onNavigate={navigate} />;
      case 'm365-setup':
        return <M365SetupView onNavigate={navigate} onRegisterUnsavedForm={registerUnsavedForm} onBeforeContextChange={requestContextChange} />;
      case 'requirements':
      case 'role-guide':
        return <RequirementsView onNavigate={navigate} />;

      default:
        return <DashboardView onNavigate={navigate} />;
    }
  };

  return (
    <Shell currentRoute={effectiveRoute} onRouteChange={navigate} onSelectClient={setSelectedClientId} onBeforeContextChange={requestContextChange}>
      {renderModule()}
      {pendingTransition && <div className="modal-backdrop" onClick={() => setPendingTransition(null)}><section className="modal" style={{ maxWidth: 480 }} onClick={event => event.stopPropagation()}>
        <div className="modal-head"><h2>Unsaved changes</h2><button type="button" className="icon-btn" aria-label="Cancel navigation" onClick={() => setPendingTransition(null)}>✕</button></div>
        <div className="modal-body"><p>{pendingTransition.label} has unsaved changes. Save them before leaving, discard them, or stay here.</p></div>
        <div className="modal-foot"><button type="button" className="btn ghost sm" onClick={() => resolveTransition('discard')}>Discard and continue</button><button type="button" className="btn sm" onClick={() => setPendingTransition(null)}>Stay</button><button type="button" className="btn primary sm" onClick={() => resolveTransition('save')}>Save and continue</button></div>
      </section></div>}
    </Shell>
  );
};
export default App;
