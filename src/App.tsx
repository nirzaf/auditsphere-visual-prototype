// AuditSphere Main Application Component
// Subscribes to prototypeStore and renders modern UI Shell with all 39 functional modules

import React, { useState, useEffect } from 'react';
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

export const App: React.FC = () => {
  const [currentRoute, setCurrentRoute] = useState<RouteKey>('overview');
  const [selectedClientId, setSelectedClientId] = useState<string>('CLI-001');
  const [, setTick] = useState(0);

  // Subscribe to store updates
  useEffect(() => {
    const unsubscribe = prototypeStore.subscribe(() => {
      setTick(t => t + 1);
    });
    return unsubscribe;
  }, []);

  const state = prototypeStore.getSnapshot();
  const isClient = isClientRole(state.currentRole);
  const navigate = (route: RouteKey) => {
    const role = prototypeStore.getSnapshot().currentRole;
    setCurrentRoute(canOpenRoute(role, route) ? route : isClientRole(role) ? 'portal' : 'overview');
  };
  const effectiveRoute: RouteKey = isClient
    ? currentRoute === 'requirements' ? 'requirements' : 'portal'
    : canOpenRoute(state.currentRole, currentRoute) ? currentRoute : 'overview';

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
            clientId={selectedClientId}
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
        return <AuditAcceptanceView onNavigate={navigate} />;

      // Work & Collaboration
      case 'jobs':
        return <JobsTasksView onNavigate={navigate} />;
      case 'job-templates':
        return <JobTemplatesView onNavigate={navigate} />;
      case 'documents':
        return <DocumentsLibraryView onNavigate={navigate} />;
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
        return <FinancialPackagesView onNavigate={navigate} />;
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
        return <WorkpapersView onNavigate={navigate} />;
      case 'evidence':
        return <EvidenceCatalogueView onNavigate={navigate} />;
      case 'findings':
        return <FindingsView onNavigate={navigate} />;
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
        return <M365SetupView onNavigate={navigate} />;
      case 'requirements':
      case 'role-guide':
        return <RequirementsView onNavigate={navigate} />;

      default:
        return <DashboardView onNavigate={navigate} />;
    }
  };

  return (
    <Shell currentRoute={effectiveRoute} onRouteChange={navigate}>
      {renderModule()}
    </Shell>
  );
};
export default App;
