// AuditSphere Visual Prototype — Shared Types & Domain Models
// Covers all 39 functional modules (VP-001 through VP-064)

export type RoleKey =
  | 'relationship'
  | 'onboarding'
  | 'compliance'
  | 'partner'
  | 'manager'
  | 'preparer'
  | 'reviewer'
  | 'eqr'
  | 'client_admin'
  | 'client_finance'
  | 'client'
  | 'billing'
  | 'records'
  | 'admin';

export interface UserPersona {
  id: string;
  /** Stable natural-person key shared by a person's role personas. */
  personId?: string;
  name: string;
  initials: string;
  role: RoleKey;
  label: string;
  group: 'Commercial' | 'Professional' | 'Client' | 'Operations';
  email: string;
  status: 'Active' | 'Inactive';
  demoClients?: string[];
}

export type RouteKey =
  | 'overview'
  | 'clients'
  | 'client-detail'
  | 'acquisition'
  | 'proposals'
  | 'engagements'
  | 'jobs'
  | 'job-templates'
  | 'documents'
  | 'communications'
  | 'my-time'
  | 'budgets'
  | 'billing'
  | 'receivables'
  | 'accounting-setup'
  | 'trial-balance'
  | 'gl-transactions'
  | 'account-mappings'
  | 'adjustments'
  | 'reconciliations'
  | 'financial-statements'
  | 'financial-packages'
  | 'consolidation'
  | 'onboarding'
  | 'audit-planning'
  | 'audit-risks'
  | 'audit-fieldwork'
  | 'sampling'
  | 'audit'
  | 'evidence'
  | 'findings'
  | 'reviews'
  | 'approvals'
  | 'quality'
  | 'delivery'
  | 'records'
  | 'reports'
  | 'search'
  | 'administration'
  | 'm365-setup'
  | 'portal'
  | 'services'
  | 'role-guide'
  | 'requirements';

// Module 02: Clients & CRM
export interface ClientContact {
  id: string;
  clientId: string;
  name: string;
  email: string;
  phone?: string;
  title?: string;
  isPrimary: boolean;
  active: boolean;
  portalAccessRequested?: boolean;
}

export interface ClientRelationshipGroup {
  id: string;
  name: string;
  description: string;
  clientIds: string[];
}

export interface CustomFieldDefinition {
  id: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'choice';
  options?: string[];
}

export interface ClientRecord {
  id: string;
  code: string;
  name: string;
  tradingName?: string;
  initials: string;
  color?: string;
  industry: string;
  contact: string;
  email?: string;
  phone?: string;
  jurisdiction: string;
  registrationNumber?: string;
  status: 'Prospect' | 'Active' | 'Suspended' | 'Archived';
  risk: 'Low' | 'Moderate' | 'High';
  revenue: number; // QAR
  relationshipOwner: string;
  partner?: string;
  manager?: string;
  notes?: string;
  customFields?: Record<string, string | number>;
  relationshipGroupId?: string;
}

// Module 03: Leads & Opportunities
export interface LeadOpportunity {
  id: string;
  name: string;
  contact: string;
  email?: string;
  service: string;
  value: number; // QAR minor units / currency
  currency: string;
  stage: 'Inquiry' | 'Discovery' | 'Evaluation' | 'Proposal' | 'Won' | 'Lost';
  source?: string;
  owner: string;
  targetDate?: string;
  notes?: string;
  lostReason?: string;
  convertedClientId?: string;
  convertedOpportunityId?: string;
  accepted: boolean;
  terms: boolean;
}

// Module 04: Proposals & Services
export interface ProposalItem {
  id: string;
  serviceName: string;
  description: string;
  scope: string;
  exclusions?: string;
  deliverables: string;
  clientResponsibilities?: string;
  feeModel: 'Fixed' | 'Time & Materials' | 'Retainer';
  amount: number; // QAR
}

export interface ProposalRecord {
  id: string;
  leadId?: string;
  clientId?: string;
  title: string;
  revision: number;
  preparedBy: string;
  preparedAt: string;
  currency: string;
  totalAmount: number;
  items: ProposalItem[];
  terms: string;
  state:
    | 'Draft'
    | 'Internal review'
    | 'Approved to send'
    | 'Presented'
    | 'Accepted'
    | 'Declined'
    | 'Withdrawn'
    | 'Superseded';
  commercialReview?: {
    reviewedBy: string;
    reviewedAt: string;
    approved: boolean;
    notes?: string;
  };
  clientResponse?: {
    responseType: 'Accepted' | 'Declined' | 'Withdrawn';
    contact: string;
    date: string;
    method: 'Email' | 'Meeting' | 'Letter';
    notes: string;
    evidenceRef?: string;
  };
}

// Module 04 / Engagements
export interface EngagementRecord {
  id: string;
  client: string;
  service: string;
  stage: string;
  year: number;
  mode: string;
  period: string;
  due: string;
  manager: string;
  partner: string;
  team: string[];
  agreedFee: number;
  currency: string;
  proposalId?: string;
  acceptance: boolean;
  terms: boolean;
  planning: boolean;
  sourceAccepted: boolean;
  mappingApproved: boolean;
  generation: number;
  packageRevision: number;
  builtGeneration: number;
  sourceVersion: number;
  eqrRequired: boolean;
  opinion: string;
  candidate?: null | {
    generation: number;
    preparedAt: string;
    preparedBy: string;
    preparedByUserId?: string;
    manifest: string[];
    sourceVersion: number;
    packageRevision: number;
  };
  releases: Array<{
    id: string;
    version: number;
    generation: number;
    releasedAt: string;
    releasedBy: string;
    delivered: boolean;
    dispatchNote?: string;
    recipients?: string[];
    isAmended?: boolean;
    predecessorId?: string;
    manifest: Array<{ id: string; name: string; type: string; sha?: string; sourceId?: string; sourceRevision?: number }>;
  }>;
  archive?: null | {
    archivedAt: string;
    archivedBy: string;
    releaseId: string;
    manifest: string[];
    retentionUntil?: string;
    onApplicationHold?: boolean;
    holdReason?: string;
  };
  approvals: {
    manager: null | { by: string; byUserId?: string; at: string; generation: number; notes?: string };
    client: null | { by: string; byUserId?: string; at: string; generation: number; notes?: string };
    partner: null | { by: string; byUserId?: string; at: string; generation: number; notes?: string };
    eqr: null | { by: string; byUserId?: string; at: string; generation: number; notes?: string };
  };
  approvalHistory?: Array<{ role: 'manager' | 'client' | 'partner' | 'eqr'; by: string; byUserId: string; at: string; generation: number; notes?: string }>;
  eqrConcerns?: Array<{
    id: string;
    text: string;
    resolved: boolean;
    raisedBy: string;
    raisedAt: string;
    response?: string;
    responseBy?: string;
    responseUserId?: string;
    responseAt?: string;
    reviewedBy?: string;
    reviewedAt?: string;
    resolvedAt?: string;
    resolvedBy?: string;
    resolvedUserId?: string;
  }>;
  rows: TrialBalanceRow[];
  adjustment: number;
  journalState: 'Draft' | 'Submitted' | 'Applied' | 'Rejected';
  sourceReflection: boolean;
  supplements: boolean;
  reconciliations: ReconciliationSchedule[];
  workpapers: WorkpaperItem[];
  reviews: ReviewNoteItem[];
  pbc: PbcRequestItem[];
  annual: { confirmed: string[]; decision: string | null; nextId: string | null };
  questionnaire: { answers: Record<number, boolean>; status: string };
  events: Array<{ text: string; ref: string; time: string; type: string }>;
}

// Module 05: Jobs & Tasks
export interface JobTaskItem {
  id: string;
  jobId: string;
  title: string;
  description?: string;
  assignee: string;
  status: 'Not started' | 'In progress' | 'Blocked' | 'Completed' | 'Cancelled';
  blockedReason?: string;
  parentTaskId?: string; // One level of nesting only
  dueDate?: string;
  order: number;
  completedAt?: string;
  reassignmentHistory?: Array<{ from: string; to: string; date: string; reason: string }>;
}

export interface JobRecord {
  id: string;
  clientId: string;
  engagementId: string;
  title: string;
  description?: string;
  owner: string;
  startDate?: string;
  dueDate: string;
  budgetHours?: number;
  status: 'Not started' | 'In progress' | 'Blocked' | 'Completed' | 'Cancelled';
  blockedReason?: string;
  fromTemplateId?: string;
  createdAt: string;
}

// Module 06: Job Templates
export interface JobTemplateItem {
  id: string;
  name: string;
  service: string;
  description: string;
  defaultJobTitle: string;
  status: 'Draft' | 'Published' | 'Retired';
  revision: number;
  tasks: Array<{
    title: string;
    description?: string;
    roleSuggestion?: string;
    subtasks?: string[];
  }>;
}

// Module 07: Contextual Collaboration
export interface CommentItem {
  id: string;
  subjectType: 'client' | 'engagement' | 'job' | 'task';
  subjectId: string;
  author: string;
  authorRole: string;
  createdAt: string;
  text: string;
  visibility: 'internal' | 'client';
  mentions?: string[];
  edited?: boolean;
}

// Module 09: PBC
export interface PbcRequestItem {
  id: string;
  title: string;
  description?: string;
  category: string;
  status: 'Draft' | 'Requested' | 'Received' | 'Under review' | 'Accepted' | 'Needs clarification' | 'Cancelled';
  due: string;
  owner: string;
  file?: string;
  responseDocId?: string;
  version: number;
  contributor?: string;
  requestedBy?: string;
  requestedAt?: string;
  requestLink?: string;
  clarificationNote?: string;
  sharedFiles?: Array<{
    id: string;
    name: string;
    version: number;
    size: number;
    sha: string | null;
    uploadedBy: string;
    uploadedAt: string;
    source: string;
  }>;
  thread?: Array<{
    id: string;
    kind: 'request' | 'response' | 'clarification' | 'email' | 'file';
    author: string;
    role: string;
    text: string;
    time: string;
    file?: string;
    version?: number;
    clientVisible?: boolean;
  }>;
  email?: {
    status: string;
    to: string;
    subject: string;
    link: string;
  };
}

// Module 10 & 18: Documents & SharePoint
export interface DocumentItem {
  id: string;
  clientId: string;
  engagementId?: string;
  name: string;
  folderPath: string; // e.g. /Engagements/2026/Audit/
  version: number;
  size: number;
  sha?: string;
  classification: 'Client provided' | 'Working paper' | 'Deliverable' | 'Correspondence';
  visibility: 'Internal' | 'Client shared';
  spSiteId?: string;
  spDriveId?: string;
  spItemId?: string;
  source: 'SharePoint' | 'OneDrive Import' | 'Local In-Session';
  linkedJobId?: string;
  linkedPbcId?: string;
  linkedWorkpaperId?: string;
  uploadedBy: string;
  uploadedAt: string;
  brokenLink?: boolean;
}

// Module 11: Communications
export interface CommunicationItem {
  id: string;
  clientId: string;
  engagementId?: string;
  direction: 'Outbound' | 'Inbound';
  channel: 'Email' | 'Phone' | 'Meeting' | 'Portal message';
  participants: string;
  summary: string;
  body?: string;
  author: string;
  date: string;
  visibility: 'Internal' | 'Client visible';
  status?: 'Simulated accepted' | 'Simulated failed' | 'Outcome unknown' | 'Recorded manually';
  relatedRequestId?: string;
}

export interface EmailTemplateItem {
  id: string;
  name: string;
  subject: string;
  body: string;
  placeholders: string[]; // e.g. ['{client_name}', '{request_title}', '{due_date}']
}

// Module 12: Time Tracking
export interface TimeEntryItem {
  id: string;
  person: string;
  clientId: string;
  engagementId: string;
  jobId?: string;
  taskId?: string;
  taskTitle: string;
  date: string;
  durationMinutes: number; // Integer minutes
  /** Rates pinned when this time entry was approved; missing means unknown. */
  budgetVersion?: number;
  billingRatePerHour?: number;
  costRatePerHour?: number;
  currency?: string;
  billable: boolean;
  activity: string;
  narrative?: string;
  status: 'Draft' | 'Submitted' | 'Approved' | 'Returned' | 'Superseded';
  reviewedBy?: string;
  reviewedAt?: string;
  returnReason?: string;
  correctionRevision?: number;
  billedInvoiceId?: string;
}

// Module 13: Budgets
export interface BudgetRecord {
  id: string;
  engagementId: string;
  jobId?: string;
  version: number;
  currency: string;
  status: 'Draft' | 'Approved';
  history?: Array<{ version: number; savedAt: string; savedBy: string; lines: BudgetRecord['lines'] }>;
  lines: Array<{
    id: string;
    roleOrActivity: string;
    staffName?: string;
    plannedMinutes: number;
    billingRatePerHour: number; // QAR
    costRatePerHour?: number; // QAR (optional internal rate)
  }>;
}

// Module 14: Billing & Invoicing
export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number; // rounded
  sourceType: 'Fixed service' | 'Time entry' | 'Ad hoc';
  sourceId?: string;
}

export interface InvoiceRecord {
  id: string;
  clientId: string;
  eng: string;
  engagementId?: string;
  invoiceNumber: string;
  description: string;
  amount: number; // QAR integer minor units (or cash units)
  paid: number;
  currency: string;
  status: 'Draft' | 'In review' | 'Approved' | 'Issued' | 'Paid' | 'Cancelled';
  due: string;
  issueDate?: string;
  preparedBy: string;
  lines: InvoiceLineItem[];
  commercialApproval?: {
    by: string;
    at?: string;
    basis?: string;
  };
  creditsApplied?: number;
}

export interface CreditNoteRecord {
  id: string;
  invoiceId: string;
  clientId: string;
  creditNumber: string;
  amount: number;
  currency?: string;
  reason: string;
  status: 'Draft' | 'Approved' | 'Issued';
  issueDate: string;
  date?: string;
  preparedBy: string;
  reviewedBy?: string;
  issuedBy?: string;
}

// Module 15: Receivables & Offline Receipts
export interface ReceiptRecord {
  id: string;
  clientId: string;
  receiptNumber: string;
  amount: number;
  currency: string;
  date: string;
  reference?: string;
  method: 'Bank transfer' | 'Cash' | 'Cheque' | 'Other';
  externalRef: string;
  notes?: string;
  allocatedAmount: number;
  allocations: Array<{
    invoiceId: string;
    amount: number;
    allocatedAt: string;
    date?: string;
    reversed?: boolean;
    reversalReason?: string;
    reversalDate?: string;
  }>;
}

// Module 20-25: Accounting
export interface TrialBalanceRow {
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  balance: number; // QAR
  dimensionDept?: string;
  mappedStatementLine?: string;
  mappedNoteRef?: string;
}

export interface GLTransactionItem {
  id: string;
  journalId: string;
  lineId: string;
  date: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  currency: string;
  description: string;
  reference?: string;
  dimensionDept?: string;
}

export interface AdjustmentJournalItem {
  id: string;
  engagementId: string;
  title: string;
  status: 'Draft' | 'Technical review' | 'Management accepted' | 'Reporting included' | 'Rejected';
  state?: string;
  preparedBy: string;
  reviewedBy?: string;
  managementAcceptedBy?: string;
  reflectionStatus: 'Not reflected' | 'Reflected in TB' | 'Partially reflected' | 'Unknown';
  reflectedInClientBooks?: boolean;
  rationale?: string;
  evidenceRef?: string;
  lines: Array<{
    accountCode: string;
    accountName: string;
    type: 'debit' | 'credit';
    amount: number;
    debit?: number;
    credit?: number;
  }>;
}

export interface ReconciliationSchedule {
  id?: string;
  title?: string;
  name: string;
  ref: string;
  accountCode?: string;
  sourceBalance?: number;
  supportingBalance?: number;
  glBalance?: number;
  statementBalance?: number;
  status: 'Cleared' | 'In progress' | 'Differences noted';
  evidence: string;
  items?: Array<{
    id: string;
    date: string;
    description: string;
    amount: number;
    type: 'Timing item' | 'Proposed correction';
    evidenceDoc?: string;
    clearedDate?: string;
  }>;
}

// Module 26: Consolidation
export interface ConsolidationGroupRecord {
  id: string;
  name: string;
  period: string;
  currency: string;
  presentationCurrency?: string;
  manager: string;
  status: 'Draft' | 'In progress' | 'Reviewed' | 'Approved';
  components: Array<{
    componentId: string;
    clientId?: string;
    legalEntityName: string;
    currency: string;
    functionalCurrency?: string;
    role?: string;
    ownershipPercent: number;
    ownershipPct?: number;
    packageRevisionPinned?: number;
    pinnedPackageRev?: number;
    packageRows?: TrialBalanceRow[];
    status: 'Ready' | 'Pending' | 'Stale';
  }>;
  fxRates: Record<string, number>; // Currency -> Rate to Group currency
  eliminations: Array<{
    id: string;
    title: string;
    counterpartyA: string;
    counterpartyB: string;
    amount: number;
    currency: string;
    status: 'Draft' | 'Approved';
    explanation: string;
    description?: string;
    debitAccount?: string;
    creditAccount?: string;
    lines: Array<{ account: string; type: 'debit' | 'credit'; amount: number }>;
  }>;
}

// Module 27-36: Audit
export interface AuditRiskItem {
  id: string;
  title: string;
  area: string;
  assertions: string[];
  description: string;
  rationale: string;
  response: string;
  owner: string;
  rating: 'Low' | 'Medium' | 'Significant';
  linkedProcedureIds: string[];
}

export interface AuditProcedureItem {
  id: string;
  ref?: string;
  title?: string;
  instructions?: string;
  assignee?: string;
  requiredEvidence?: string;
  status: 'Not started' | 'In progress' | 'Submitted' | 'Cleared' | 'Exceptions noted' | 'Completed' | 'Exception noted';
  stepNumber?: number;
  text?: string;
  sampleSize?: number;
  assertion?: string;
  method?: string;
  workPerformed?: string;
  conclusion?: string;
  hasExceptions?: boolean;
  linkedWorkpaperId?: string;
  linkedFindingId?: string;
  workpaperRef?: string;
}

export interface AuditProgramItem {
  id: string;
  area: string;
  objective?: string;
  title?: string;
  leadWorkpaperRef?: string;
  procedures: AuditProcedureItem[];
}

export interface SamplePopulationItem {
  id: string;
  area: string;
  name?: string;
  accountCode?: string;
  methodology?: string;
  description: string;
  totalPopulationCount: number;
  totalPopulationValue: number;
  selectedCount: number;
  selectedValue: number;
  items: Array<{
    id: string;
    itemRef: string;
    identifier?: string;
    date: string;
    counterparty: string;
    amount: number;
    recordedAmount?: number;
    auditedAmount?: number;
    difference?: number;
    description?: string;
    findingId?: string;
    tested: boolean;
    result: 'Satisfactory' | 'Exception noted' | 'Untested' | 'Exception';
    notes?: string;
    evidenceDoc?: string;
  }>;
}

export type SamplePopulationRecord = SamplePopulationItem;

export interface EvidenceItem {
  id: string;
  name?: string;
  title?: string;
  documentId: string;
  provider?: string;
  sha?: string;
  version: number;
  adequacyStatus: 'Adequate' | 'Pending verification' | 'Deficient' | 'Inadequate';
  receivedDate: string;
  owner?: string;
  linkedProcedures: string[];
}

export interface WorkpaperItem {
  id: string;
  title: string;
  objective: string;
  assertion: string;
  risk: string;
  version: number;
  status: 'Planned' | 'In progress' | 'Submitted' | 'Changes required' | 'Cleared' | 'Not applicable';
  applicable: boolean;
  section?: string;
  scope?: string;
  documentName?: string;
  evidenceRefs?: string[];
  preparer: string;
  reviewer: string;
  conclusion: string;
  notApplicableRationale?: string;
  guidelines: Array<{ title: string; desc: string; mandatory?: boolean }>;
  template: { name: string; ref: string; version: string; format: string; instructions: string; csv: string };
  workingPaper: null | {
    file: string;
    name: string;
    size: number;
    sha?: string;
    version: number;
    uploadedAt: string;
    uploadedBy: string;
    local: boolean;
  };
  supportingEvidence: Array<{
    id: string;
    pbcId?: string;
    title: string;
    file: string;
    sha?: string;
    source: string;
    status: string;
    linkedAt: string;
  }>;
  clearance: null | {
    clearedBy: string;
    clearedAt: string;
    sourceVersion: number;
    generation: number;
    version: number;
    notes: string;
  };
  clearanceHistory: Array<{
    clearedBy: string;
    clearedAt: string;
    sourceVersion: number;
    generation: number;
    version: number;
    notes: string;
  }>;
}

export interface FindingItem {
  id: string;
  engagementId: string;
  type?: 'Monetary misstatement' | 'Internal control deficiency' | 'Disclosure omission';
  category?: 'Monetary misstatement' | 'Internal control deficiency' | 'Disclosure omission';
  title: string;
  description?: string;
  severity?: 'Material' | 'Significant' | 'Minor' | 'Trivial';
  financialStatementLine?: string;
  affectedAccount?: string;
  assertion?: string;
  amount?: number; // QAR
  grossMisstatement?: number;
  netMisstatement?: number;
  condition?: string;
  recommendation?: string;
  currency?: string;
  disposition: 'Uncorrected' | 'Management agreed' | 'Corrected in TB' | 'Waived as immaterial' | 'Proposed for correction' | 'Corrected by client' | 'Uncorrected waived';
  proposedCorrection?: string;
  managementResponse?: string;
  owner?: string;
  linkedProcedureId?: string;
  linkedWorkpaperId?: string;
  linkedJournalId?: string;
}

export type AuditFindingItem = FindingItem;

export interface ReviewNoteItem {
  id: string;
  wp: string;
  title: string;
  body: string;
  author?: string;
  text?: string;
  severity: 'High' | 'Medium' | 'Low';
  status: 'Open' | 'Responded' | 'Cleared' | 'Reopened';
  raisedBy: string;
  assigned: string;
  assignee?: string;
  due: string;
  response: string;
  responseEvidence?: string;
  version: number;
  history: Array<{ actor: string; action: string; time: string; text?: string }>;
}

// Module 18: Microsoft 365 Setup Simulation
export interface M365SimulationConfig {
  tenantName: string;
  tenantId: string;
  permittedUserGroups: string[];
  sharePointSite: string;
  sharePointLibrary: string;
  folderRoot: string;
  mailSenderAccount: string;
  oneDriveEnabled: boolean;
  lastSimulatedVerification?: string;
  configRevision?: number;
  verificationResults?: Partial<Record<'identity' | 'sharepoint' | 'mail' | 'onedrive', {
    outcome: string;
    testedAt: string;
    configRevision: number;
    resourceId: string;
  }>>;
  status: 'Not configured' | 'Simulated verified' | 'Simulated error' | 'Disconnected';
  simulatedErrorMessage?: string;
  liveConnected: false; // Must strictly always be false!
}

// Module 39: Firm Administration
export interface FirmSettings {
  firmName: string;
  firmLegalName: string;
  jurisdiction: string;
  currency: string;
  invoiceNumberPrefix: string;
  invoiceNextNumber: number;
  creditNumberPrefix: string;
  creditNextNumber: number;
  paymentTermsDays: number;
  locale: string;
}

export interface AcceptanceCaseRecord {
  id: string;
  clientId: string;
  year: number;
  service: string;
  riskRating: 'Low' | 'Medium' | 'High' | 'Prohibited';
  independenceConfirmed: boolean;
  amlKycCompleted: boolean;
  conflictsCleared: boolean;
  prohibitionsChecked: boolean;
  competenceConfirmed: boolean;
  conditions: string[];
  recommendationBy: string;
  recommendationDate: string;
  recommendationNotes: string;
  decisionBy?: string;
  decisionDate?: string;
  decisionStatus: 'Pending' | 'Accepted' | 'Declined';
  decisionNotes?: string;
  recommendationByUserId?: string;
  decisionByUserId?: string;
  history?: Array<{ action: 'recommendation' | 'decision'; by: string; byUserId: string; at: string; notes: string; status: 'Pending' | 'Accepted' | 'Declined' }>;
}

export interface AuditPlanRecord {
  id: string;
  engagementId: string;
  version: number;
  status: 'Draft' | 'Under review' | 'Approved' | 'Superseded';
  benchmark: string;
  benchmarkValue: number;
  materialityRate: number;
  overallMateriality: number;
  performanceMateriality: number;
  clearlyTrivialThreshold: number;
  rationales: string[];
  teamAllocations: Array<{ person: string; role: string; scheduledStart: string; scheduledEnd: string }>;
  timingMilestones: Array<{ phase: string; targetDate: string; status: 'Planned' | 'In progress' | 'Completed' }>;
  significantAreas: string[];
  preparedBy?: string;
  preparedByUserId?: string;
  preparedAt?: string;
  reviewedBy?: string;
  reviewedByUserId?: string;
  reviewedAt?: string;
  reviewNotes?: string;
}

export interface ArchiveRecord {
  id: string;
  engagementId: string;
  releaseId: string;
  clientName: string;
  service: string;
  year: number;
  archivedAt: string;
  archivedBy: string;
  retentionUntil: string;
  onHold: boolean;
  onApplicationHold?: boolean;
  holdReason?: string;
  handoverRequested?: boolean;
  handoverRequester?: string;
  handoverNotes?: string;
  manifestCount: number;
  manifest?: string[];
}

// Whole Prototype State
export interface PrototypeState {
  schema: number;
  asOfDate: string;
  selectedEngagement: string;
  currentRole: RoleKey;
  currentUserId: string;
  currentPerson: string;
  users: UserPersona[];
  clients: ClientRecord[];
  contacts: ClientContact[];
  relationshipGroups: ClientRelationshipGroup[];
  customFields: CustomFieldDefinition[];
  leads: LeadOpportunity[];
  proposals: ProposalRecord[];
  engagements: EngagementRecord[];
  jobs: JobRecord[];
  jobTasks: JobTaskItem[];
  jobTemplates: JobTemplateItem[];
  comments: CommentItem[];
  documents: DocumentItem[];
  communications: CommunicationItem[];
  emailTemplates: EmailTemplateItem[];
  times: TimeEntryItem[];
  budgets: BudgetRecord[];
  invoices: InvoiceRecord[];
  creditNotes: CreditNoteRecord[];
  receipts: ReceiptRecord[];
  glTransactions: GLTransactionItem[];
  adjustmentJournals: AdjustmentJournalItem[];
  consolidationGroups: ConsolidationGroupRecord[];
  auditRisks: AuditRiskItem[];
  auditPrograms: AuditProgramItem[];
  samplePopulations: SamplePopulationItem[];
  evidenceCatalogue: Array<{
    id: string;
    title: string;
    documentId: string;
    version: number;
    adequacyStatus: 'Adequate' | 'Pending verification' | 'Deficient';
    receivedDate: string;
    owner: string;
    linkedProcedures: string[];
  }>;
  findings: FindingItem[];
  m365Config: M365SimulationConfig;
  firmSettings: FirmSettings;
  events: Array<{ text: string; ref: string; time: string; type: string }>;
  roleGrants: Array<{
    userId: string;
    role: RoleKey;
    scopeKind: 'Global' | 'Client' | 'Engagement';
    scopeId?: string;
    effectiveFrom?: string;
    expiresAt?: string;
    grantedAt?: string;
    grantedBy?: string;
    reason?: string;
  }>;
  folders?: Array<{
    path: string;
    label: string;
    clientId?: string;
    engagementId?: string;
  }>;
  acceptanceCases?: AcceptanceCaseRecord[];
  auditPlans?: AuditPlanRecord[];
  archives?: ArchiveRecord[];
}
