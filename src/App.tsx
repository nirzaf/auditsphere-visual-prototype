// AuditSphere Main Application Component
// Subscribes to prototypeStore and renders modern UI Shell with all 39 functional modules

import React, { useState, useEffect } from 'react';
import { RouteKey } from './types';
import { prototypeStore } from './store/prototypeStore';
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

  const renderModule = () => {
    switch (currentRoute) {
      // Practice & CRM
      case 'overview':
        return <DashboardView onNavigate={setCurrentRoute} />;
      case 'clients':
        return (
          <ClientsView
            onNavigate={setCurrentRoute}
            onSelectClientDetail={(cid) => {
              setSelectedClientId(cid);
              setCurrentRoute('client-detail');
            }}
          />
        );
      case 'client-detail':
        return (
          <ClientDetailView
            clientId={selectedClientId}
            onBack={() => setCurrentRoute('clients')}
            onNavigate={setCurrentRoute}
          />
        );
      case 'acquisition':
      case 'crm' as any:
        return <LeadsPipelineView onNavigate={setCurrentRoute} />;
      case 'proposals':
        return <ProposalsView onNavigate={setCurrentRoute} />;
      case 'engagements':
        return <EngagementsView onNavigate={setCurrentRoute} />;
      case 'onboarding':
      case 'audit-acceptance' as any:
        return <AuditAcceptanceView onNavigate={setCurrentRoute} />;

      // Work & Collaboration
      case 'jobs':
        return <JobsTasksView onNavigate={setCurrentRoute} />;
      case 'job-templates':
        return <JobTemplatesView onNavigate={setCurrentRoute} />;
      case 'documents':
        return <DocumentsLibraryView onNavigate={setCurrentRoute} />;
      case 'communications':
        return <CommunicationsView onNavigate={setCurrentRoute} />;

      // Economics & Billing
      case 'my-time':
      case 'time-tracking' as any:
        return <TimeTrackingView onNavigate={setCurrentRoute} />;
      case 'budgets':
        return <BudgetsView onNavigate={setCurrentRoute} />;
      case 'billing':
        return <BillingInvoicingView onNavigate={setCurrentRoute} />;
      case 'receivables':
        return <ReceivablesView onNavigate={setCurrentRoute} />;

      // Accounting Workbench
      case 'accounting-setup':
      case 'trial-balance':
      case 'gl-transactions':
      case 'account-mappings':
      case 'adjustments':
      case 'reconciliations':
        return <AccountingWorkbenchView onNavigate={setCurrentRoute} />;
      case 'financial-statements':
        return <FinancialStatementsView onNavigate={setCurrentRoute} />;
      case 'financial-packages':
      case 'packages' as any:
        return <FinancialPackagesView onNavigate={setCurrentRoute} />;
      case 'consolidation':
        return <ConsolidationView onNavigate={setCurrentRoute} />;

      // Audit & Assurance
      case 'audit-planning':
        return <AuditPlanningView onNavigate={setCurrentRoute} />;
      case 'audit-risks':
      case 'audit-fieldwork':
        return <AuditRisksProgramsView onNavigate={setCurrentRoute} />;
      case 'sampling':
        return <SamplingView onNavigate={setCurrentRoute} />;
      case 'audit':
        return <WorkpapersView onNavigate={setCurrentRoute} />;
      case 'evidence':
        return <EvidenceCatalogueView onNavigate={setCurrentRoute} />;
      case 'findings':
        return <FindingsView onNavigate={setCurrentRoute} />;
      case 'reviews':
        return <ReviewDeskView onNavigate={setCurrentRoute} />;
      case 'approvals':
      case 'quality':
        return <ApprovalsEQRView onNavigate={setCurrentRoute} />;
      case 'delivery':
        return <ReleaseCompletionView onNavigate={setCurrentRoute} />;
      case 'records':
        return <RecordsArchiveView onNavigate={setCurrentRoute} />;

      // Client Services & Admin
      case 'portal':
      case 'client-portal' as any:
        return <ClientPortalView onNavigate={setCurrentRoute} />;
      case 'reports':
      case 'reporting-centre' as any:
        return <ReportingCentreView onNavigate={setCurrentRoute} />;
      case 'administration':
      case 'services':
        return <AdministrationView onNavigate={setCurrentRoute} />;
      case 'm365-setup':
        return <M365SetupView onNavigate={setCurrentRoute} />;
      case 'requirements':
      case 'role-guide':
        return <RequirementsView onNavigate={setCurrentRoute} />;

      default:
        return <DashboardView onNavigate={setCurrentRoute} />;
    }
  };

  return (
    <Shell currentRoute={currentRoute} onRouteChange={setCurrentRoute}>
      {renderModule()}
    </Shell>
  );
};
export default App;
