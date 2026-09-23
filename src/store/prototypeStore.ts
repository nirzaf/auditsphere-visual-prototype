// AuditSphere Single Typed Store & Command Boundary
// VP-002, VP-004, VP-019, VP-056: Single state, guarded actions, reactive subscriptions

import { PrototypeState, RoleKey, ClientRecord, EngagementRecord, JobRecord, JobTaskItem, JobTemplateItem, TimeEntryItem, InvoiceRecord, ReceiptRecord, CreditNoteRecord, PbcRequestItem, WorkpaperItem, ReviewNoteItem, AdjustmentJournalItem, ConsolidationGroupRecord, DocumentItem, CommunicationItem } from '../types';
import { createInitialState } from './initialState';
import { ScenarioName, loadScenarioState } from './scenarios';
import { CURRENT_SCHEMA, migratePersistedState, validateFixtures } from '../services/migrations';
import { requireActiveIdentity, requireIndependentActor, requireEngagementScope, requireClientScope, GuardError } from '../services/guards';

const STORAGE_KEY = 'ste-auditsphere-role-portals-v2';
const STORAGE_BACKUP_KEY = 'ste-auditsphere-role-portals-v2.backup';

class PrototypeStore {
  private state: PrototypeState;
  private listeners: Set<() => void> = new Set();
  private isSessionOnly = false;
  private loadError: string | null = null;
  private storageConflict = false;

  constructor() {
    this.state = this.loadInitialState();
    // VP-004: one active editing tab. A storage event from another tab surfaces
    // reload/conflict guidance instead of silently overwriting.
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY) {
          this.storageConflict = true;
          this.listeners.forEach(fn => fn());
        }
      });
    }
  }

  public hasStorageConflict(): boolean { return this.storageConflict; }
  public dismissStorageConflict(): void { this.storageConflict = false; this.notify(); }
  public isSessionOnlyMode(): boolean { return this.isSessionOnly; }
  public getLoadError(): string | null { return this.loadError; }

  private loadInitialState(): PrototypeState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(raw);
        } catch {
          this.loadError = 'Saved demo state could not be parsed. Recovery: keep the preserved payload, reset, or import a validated file. Nothing was silently deleted.';
          try { localStorage.setItem(STORAGE_BACKUP_KEY, raw); } catch { /* quota */ }
          return createInitialState();
        }
        const schema = (parsed as { schema?: unknown }).schema;
        if (typeof schema === 'number' && schema > CURRENT_SCHEMA) {
          this.loadError = `Saved demo state uses schema v${schema}, newer than supported v${CURRENT_SCHEMA}. Recovery: export/preserve the payload, then reset or import a compatible file.`;
          try { localStorage.setItem(STORAGE_BACKUP_KEY, raw); } catch { /* quota */ }
          return createInitialState();
        }
        if (parsed && typeof schema === 'number' && Array.isArray((parsed as { engagements?: unknown }).engagements)) {
          try { localStorage.setItem(STORAGE_BACKUP_KEY, raw); } catch { /* quota */ }
          const { state } = migratePersistedState(parsed, createInitialState());
          return state;
        }
        this.loadError = 'Saved demo state was ambiguous or incomplete. Recovery: the prior payload was preserved; reset or import a validated file.';
        try { localStorage.setItem(STORAGE_BACKUP_KEY, raw); } catch { /* quota */ }
      }
    } catch (e) {
      console.warn('Storage read error, starting with default session state', e);
      this.isSessionOnly = true;
    }
    return createInitialState();
  }

  private persist() {
    if (this.isSessionOnly) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn('Storage quota exceeded, switching to session-only mode', e);
      this.isSessionOnly = true;
    }
  }

  private notify() {
    this.persist();
    this.listeners.forEach(fn => fn());
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  public getSnapshot = (): PrototypeState => {
    return this.state;
  };

  public logEvent(text: string, ref: string, type = 'checkcircle') {
    const time = 'Today · ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    this.state.events.unshift({ text, ref, time, type });
    if (this.state.events.length > 50) this.state.events.pop();
  }

  // --- Persona & Scope Actions ---
  public setRole(role: RoleKey) {
    this.state.currentRole = role;
    const persona = this.state.users.find(u => u.role === role);
    if (persona) {
      this.state.currentPerson = persona.name;
    }
    this.notify();
  }

  public setPerson(name: string) {
    const user = this.state.users.find(u => u.name === name);
    if (user) {
      this.state.currentPerson = user.name;
      this.state.currentRole = user.role;
    } else {
      this.state.currentPerson = name;
    }
    this.notify();
  }

  /** Switch to an exact persona (supports two people sharing one role). */
  public setPersona(personName: string) {
    this.setPerson(personName);
  }

  public setSelectedEngagement(id: string) {
    this.state.selectedEngagement = id;
    this.notify();
  }

  // --- Client Actions (VP-006, VP-007) ---
  public addClient(client: ClientRecord) {
    requireActiveIdentity(this.state);
    if (!client.name || !client.name.trim()) {
      throw new GuardError('INVALID_STATE', 'Client legal name is required.');
    }
    if (!client.code || !client.code.trim()) {
      throw new GuardError('INVALID_STATE', 'Client code is required.');
    }
    const normalized = client.code.trim().toUpperCase();
    if (this.state.clients.some(c => c.code.trim().toUpperCase() === normalized)) {
      throw new GuardError('INVALID_STATE', `Duplicate client code "${client.code}". Review the similar-name warning instead of merging distinct legal entities.`);
    }
    this.state.clients.push(client);
    this.logEvent(`New client profile created: ${client.name}`, client.id);
    this.notify();
  }

  public updateClient(client: ClientRecord) {
    requireActiveIdentity(this.state);
    if (!client.name || !client.name.trim()) {
      throw new GuardError('INVALID_STATE', 'Client legal name is required.');
    }
    const normalized = client.code.trim().toUpperCase();
    if (this.state.clients.some(c => c.id !== client.id && c.code.trim().toUpperCase() === normalized)) {
      throw new GuardError('INVALID_STATE', `Duplicate client code "${client.code}".`);
    }
    const index = this.state.clients.findIndex(c => c.id === client.id);
    if (index >= 0) {
      this.state.clients[index] = client;
      this.logEvent(`Client profile updated: ${client.name}`, client.id);
      this.notify();
    }
  }

  /** Contacts never create portal logins, management authority or staff roles (VP-007). */
  public addContact(contact: PrototypeState['contacts'][0]) {
    requireActiveIdentity(this.state);
    requireClientScope(this.state, contact.clientId);
    if (!contact.name || !contact.name.trim()) {
      throw new GuardError('INVALID_STATE', 'Contact full name is required.');
    }
    this.state.contacts.push(contact);
    this.logEvent(`Contact added: ${contact.name} (${contact.clientId})`, contact.id);
    this.notify();
  }

  public setPrimaryContact(clientId: string, contactId: string) {
    requireActiveIdentity(this.state);
    const contact = this.state.contacts.find(c => c.id === contactId && c.clientId === clientId);
    if (!contact) throw new GuardError('INVALID_STATE', 'Contact not found in this client.');
    if (!contact.active) throw new GuardError('INVALID_STATE', 'An inactive contact cannot be primary.');
    this.state.contacts.forEach(c => {
      if (c.clientId === clientId) c.isPrimary = c.id === contactId;
    });
    this.notify();
  }

  /** Explicit scoped grants (VP-019). Admin alone never grants professional authority. */
  public grantAccess(userName: string, role: RoleKey, scopeKind: 'Global' | 'Client' | 'Engagement', scopeId?: string, reason = '') {
    requireActiveIdentity(this.state);
    if ((scopeKind === 'Client' || scopeKind === 'Engagement') && !scopeId) {
      throw new GuardError('INVALID_STATE', 'Scoped grants require a scope ID.');
    }
    this.state.roleGrants.push({ userId: userName, role, scopeKind, scopeId });
    this.logEvent(`Access granted: ${userName} → ${role} (${scopeKind}${scopeId ? ':' + scopeId : ''})${reason ? ' — ' + reason : ''}`, scopeId || userName);
    this.notify();
  }

  public revokeAccess(userName: string, role: RoleKey, scopeId?: string) {
    requireActiveIdentity(this.state);
    const idx = this.state.roleGrants.findIndex(g => g.userId === userName && g.role === role && (g.scopeId || undefined) === (scopeId || undefined));
    if (idx >= 0) {
      this.state.roleGrants.splice(idx, 1);
      this.logEvent(`Access revoked: ${userName} → ${role}${scopeId ? ' (' + scopeId + ')' : ''}`, scopeId || userName);
      this.notify();
    }
  }

  // --- Leads & Pipeline Actions (VP-009) ---
  public addLead(lead: PrototypeState['leads'][0]) {
    this.state.leads.push(lead);
    this.logEvent(`New opportunity registered: ${lead.name}`, lead.id);
    this.notify();
  }

  public updateLead(lead: PrototypeState['leads'][0]) {
    const index = this.state.leads.findIndex(l => l.id === lead.id);
    if (index >= 0) {
      this.state.leads[index] = lead;
      this.notify();
    }
  }

  public convertLead(leadId: string, clientId?: string) {
    const lead = this.state.leads.find(l => l.id === leadId);
    if (!lead) return;
    lead.stage = 'Won';
    lead.accepted = true;

    // Check or create client
    let client = this.state.clients.find(c => c.id === clientId);
    if (!client) {
      const newClientId = `CL-00${this.state.clients.length + 1}`;
      client = {
        id: newClientId,
        code: lead.name.slice(0, 4).toUpperCase(),
        name: lead.name,
        initials: lead.name.slice(0, 2).toUpperCase(),
        industry: 'Commercial Client',
        contact: lead.contact,
        email: lead.email,
        jurisdiction: 'State of Qatar',
        status: 'Active',
        risk: 'Low',
        revenue: lead.value,
        relationshipOwner: lead.owner
      };
      this.state.clients.push(client);
    }
    lead.convertedClientId = client.id;
    this.logEvent(`Opportunity ${lead.name} converted to client ${client.name}`, client.id);
    this.notify();
  }

  // --- Proposal Actions (VP-010, VP-011) ---
  public addProposal(prop: PrototypeState['proposals'][0]) {
    this.state.proposals.push(prop);
    this.logEvent(`Proposal ${prop.title} drafted (Rev ${prop.revision})`, prop.id);
    this.notify();
  }

  public reviewProposal(propId: string, approved: boolean, notes?: string) {
    requireActiveIdentity(this.state);
    const prop = this.state.proposals.find(p => p.id === propId);
    if (!prop) return;
    // Same-person commercial approval denied even under another role label (VP-011).
    requireIndependentActor(prop.preparedBy, this.state.currentPerson, 'commercially approve this proposal');
    prop.commercialReview = {
      reviewedBy: this.state.currentPerson,
      reviewedAt: new Date().toISOString(),
      approved,
      notes
    };
    prop.state = approved ? 'Approved to send' : 'Draft';
    this.logEvent(`Proposal ${prop.id} ${approved ? 'approved' : 'returned'} by ${this.state.currentPerson}`, prop.id);
    this.notify();
  }

  public recordProposalResponse(propId: string, response: PrototypeState['proposals'][0]['clientResponse']) {
    const prop = this.state.proposals.find(p => p.id === propId);
    if (!prop || !response) return;
    prop.clientResponse = response;
    prop.state = response.responseType === 'Accepted' ? 'Accepted' : 'Declined';
    this.logEvent(`Proposal ${prop.id} client response: ${response.responseType} by ${response.contact}`, prop.id);
    this.notify();
  }

  // --- Engagement Actions (VP-012) ---
  public addEngagement(eng: EngagementRecord) {
    this.state.engagements.push(eng);
    this.state.selectedEngagement = eng.id;
    this.logEvent(`New engagement created: ${eng.service} FY${eng.year}`, eng.id);
    this.notify();
  }

  public updateEngagement(eng: EngagementRecord) {
    const index = this.state.engagements.findIndex(e => e.id === eng.id);
    if (index >= 0) {
      this.state.engagements[index] = eng;
      this.notify();
    }
  }

  // --- Jobs & Tasks (VP-013, VP-014, VP-015) ---
  public addJob(job: JobRecord) {
    this.state.jobs.push(job);
    this.logEvent(`New job scheduled: ${job.title}`, job.id);
    this.notify();
  }

  public updateJob(job: JobRecord) {
    const index = this.state.jobs.findIndex(j => j.id === job.id);
    if (index >= 0) {
      this.state.jobs[index] = job;
      this.notify();
    }
  }

  public addTask(task: JobTaskItem) {
    requireActiveIdentity(this.state);
    this.assertTaskHierarchy(task);
    this.state.jobTasks.push(task);
    this.notify();
  }

  public updateTask(task: JobTaskItem) {
    requireActiveIdentity(this.state);
    this.assertTaskHierarchy(task, task.id);
    const index = this.state.jobTasks.findIndex(t => t.id === task.id);
    if (index >= 0) {
      // Completing a parent with unfinished required children is blocked (VP-014).
      if (task.status === 'Completed' && !task.parentTaskId) {
        const children = this.state.jobTasks.filter(t => t.parentTaskId === task.id && t.status !== 'Cancelled');
        if (children.some(c => c.status !== 'Completed')) {
          throw new GuardError('INVALID_STATE', 'Parent task cannot complete while required subtasks are unfinished.');
        }
      }
      if (task.status === 'Blocked' && !task.blockedReason) {
        throw new GuardError('INVALID_STATE', 'Blocked status requires a reason.');
      }
      this.state.jobTasks[index] = task;
      this.notify();
    }
  }

  private assertTaskHierarchy(task: JobTaskItem, selfId?: string) {
    if (!task.title || !task.title.trim()) {
      throw new GuardError('INVALID_STATE', 'Task title is required.');
    }
    if (task.parentTaskId) {
      if (task.parentTaskId === (selfId || task.id)) {
        throw new GuardError('INVALID_STATE', 'A task cannot be its own parent (cycle rejected).');
      }
      const parent = this.state.jobTasks.find(t => t.id === task.parentTaskId);
      if (!parent) throw new GuardError('INVALID_STATE', 'Parent task not found in this job.');
      if (parent.jobId !== task.jobId) throw new GuardError('INVALID_STATE', 'Cross-job parents are rejected.');
      if (parent.parentTaskId) throw new GuardError('INVALID_STATE', 'Only one level of subtasks is supported (VP-014).');
    }
  }

  public reassignTask(taskId: string, newAssignee: string, reason: string) {
    const task = this.state.jobTasks.find(t => t.id === taskId);
    if (!task) return;
    if (!task.reassignmentHistory) task.reassignmentHistory = [];
    task.reassignmentHistory.push({
      from: task.assignee,
      to: newAssignee,
      date: new Date().toISOString(),
      reason
    });
    task.assignee = newAssignee;
    this.logEvent(`Task "${task.title}" reassigned to ${newAssignee}: ${reason}`, task.id);
    this.notify();
  }

  public addJobTemplate(template: JobTemplateItem) {
    requireActiveIdentity(this.state);
    if (!template.name || !template.name.trim()) throw new GuardError('INVALID_STATE', 'Template name is required.');
    this.state.jobTemplates.push(template);
    this.logEvent(`Job template created: ${template.name}`, template.id);
    this.notify();
  }

  public publishJobTemplate(templateId: string) {
    requireActiveIdentity(this.state);
    const tpl = this.state.jobTemplates.find(t => t.id === templateId);
    if (!tpl) throw new GuardError('INVALID_STATE', 'Template not found.');
    tpl.status = 'Published';
    this.logEvent(`Job template published: ${tpl.name}`, tpl.id);
    this.notify();
  }

  public retireJobTemplate(templateId: string) {
    requireActiveIdentity(this.state);
    const tpl = this.state.jobTemplates.find(t => t.id === templateId);
    if (!tpl) throw new GuardError('INVALID_STATE', 'Template not found.');
    tpl.status = 'Retired';
    this.logEvent(`Job template retired: ${tpl.name}`, tpl.id);
    this.notify();
  }

  public applyJobTemplate(templateId: string, engagementId: string, jobTitle: string, dueDate: string, owner: string) {
    const tpl = this.state.jobTemplates.find(t => t.id === templateId);
    if (!tpl) return;
    if (tpl.status !== 'Published') {
      throw new GuardError('INVALID_STATE', 'Only Published templates can be applied to create jobs (VP-015).');
    }
    const eng = this.state.engagements.find(e => e.id === engagementId) || this.state.engagements[0];
    const newJobId = `JOB-260${this.state.jobs.length + 1}`;

    const newJob: JobRecord = {
      id: newJobId,
      clientId: eng.client,
      engagementId: eng.id,
      title: jobTitle || tpl.defaultJobTitle,
      description: tpl.description,
      owner,
      startDate: new Date().toISOString().split('T')[0],
      dueDate,
      status: 'Not started',
      fromTemplateId: tpl.id,
      createdAt: new Date().toISOString()
    };
    this.state.jobs.push(newJob);

    // Copy tasks and subtasks
    tpl.tasks.forEach((t, i) => {
      const parentTaskId = `TSK-${newJobId}-${i + 1}`;
      this.state.jobTasks.push({
        id: parentTaskId,
        jobId: newJobId,
        title: t.title,
        assignee: owner,
        status: 'Not started',
        order: i + 1
      });

      if (t.subtasks && t.subtasks.length > 0) {
        t.subtasks.forEach((sub, subI) => {
          this.state.jobTasks.push({
            id: `${parentTaskId}-${subI + 1}`,
            jobId: newJobId,
            parentTaskId,
            title: sub,
            assignee: owner,
            status: 'Not started',
            order: subI + 1
          });
        });
      }
    });

    this.logEvent(`Job created from template "${tpl.name}": ${newJob.title}`, newJob.id);
    this.notify();
  }

  // --- Comments & Collaboration (VP-016) ---
  public addComment(comment: PrototypeState['comments'][0]) {
    this.state.comments.push(comment);
    this.notify();
  }

  // --- Document Management & SharePoint (VP-020, VP-021) ---
  public addDocument(doc: DocumentItem) {
    this.state.documents.push(doc);
    this.logEvent(`Document registered in library: ${doc.name} (v${doc.version})`, doc.id);
    this.notify();
  }

  // --- Communications (VP-026, VP-027) ---
  public addCommunication(comm: CommunicationItem) {
    this.state.communications.unshift(comm);
    this.logEvent(`Communication logged: ${comm.channel} (${comm.direction}) - ${comm.summary}`, comm.id);
    this.notify();
  }

  // --- Time Tracking (VP-028) ---
  public addTimeEntry(entry: TimeEntryItem) {
    this.state.times.unshift(entry);
    this.logEvent(`Time entry recorded by ${entry.person} (${entry.durationMinutes} min)`, entry.id);
    this.notify();
  }

  public reviewTimeEntry(entryId: string, status: 'Approved' | 'Returned', returnReason?: string) {
    const entry = this.state.times.find(t => t.id === entryId);
    if (!entry) return;
    // Enforce separation of duties: cannot approve own time!
    if (status === 'Approved' && entry.person === this.state.currentPerson) {
      throw new Error('Self-approval error: An individual cannot approve their own time entry.');
    }
    entry.status = status;
    entry.reviewedBy = this.state.currentPerson;
    entry.reviewedAt = new Date().toISOString();
    if (returnReason) entry.returnReason = returnReason;
    this.logEvent(`Time entry ${entry.id} ${status.toLowerCase()} by ${this.state.currentPerson}`, entry.id);
    this.notify();
  }

  // --- Budgets (VP-029) ---
  public updateBudget(budget: PrototypeState['budgets'][0]) {
    const index = this.state.budgets.findIndex(b => b.id === budget.id);
    if (index >= 0) {
      this.state.budgets[index] = budget;
    } else {
      this.state.budgets.push(budget);
    }
    this.logEvent(`Engagement budget ${budget.id} saved`, budget.id);
    this.notify();
  }

  // --- Invoicing & Billing (VP-030, VP-031) ---
  public addInvoice(inv: InvoiceRecord) {
    this.state.invoices.push(inv);
    this.logEvent(`Invoice draft created: ${inv.invoiceNumber}`, inv.id);
    this.notify();
  }

  public reviewInvoice(invId: string, approved: boolean) {
    const inv = this.state.invoices.find(i => i.id === invId);
    if (!inv) return;
    if (approved && inv.preparedBy === this.state.currentPerson) {
      throw new Error('Separation of duties: Preparer cannot approve their own invoice.');
    }
    inv.status = approved ? 'Approved' : 'Draft';
    inv.commercialApproval = {
      by: this.state.currentPerson,
      at: new Date().toISOString(),
      basis: 'Independent commercial fee review'
    };
    this.logEvent(`Invoice ${inv.invoiceNumber} ${approved ? 'approved' : 'returned'}`, inv.id);
    this.notify();
  }

  public issueInvoice(invId: string) {
    const inv = this.state.invoices.find(i => i.id === invId);
    if (!inv || inv.status !== 'Approved') return;
    inv.status = 'Issued';
    inv.issueDate = new Date().toISOString().split('T')[0];
    this.logEvent(`Invoice issued in demo: ${inv.invoiceNumber} (${inv.amount} ${inv.currency})`, inv.id);
    this.notify();
  }

  public addCreditNote(credit: CreditNoteRecord) {
    requireActiveIdentity(this.state);
    const inv = this.state.invoices.find(i => i.id === credit.invoiceId);
    if (!inv) throw new GuardError('INVALID_STATE', 'Credit note must link to an existing invoice.');
    if (inv.clientId !== credit.clientId) throw new GuardError('FORBIDDEN_SCOPE', 'Cross-client credits are rejected.');
    if (credit.amount <= 0) throw new GuardError('INVALID_STATE', 'Credit amount must be positive.');
    const issuedCredits = this.state.creditNotes
      .filter(c => c.invoiceId === credit.invoiceId && c.status === 'Issued')
      .reduce((s, c) => s + c.amount, 0);
    const remaining = inv.amount - issuedCredits;
    if (credit.amount > remaining) {
      throw new GuardError('INVALID_STATE', `Credit ${credit.amount} exceeds remaining creditable amount ${remaining}.`);
    }
    this.state.creditNotes.push(credit);
    if (credit.status === 'Issued') {
      inv.creditsApplied = (inv.creditsApplied || 0) + credit.amount;
    }
    this.logEvent(`Credit note issued: ${credit.creditNumber} (${credit.amount} QAR)`, credit.id);
    this.notify();
  }

  // --- Offline Receipts & Allocations (VP-032) ---
  public addReceipt(receipt: ReceiptRecord) {
    requireActiveIdentity(this.state);
    if (receipt.amount <= 0) throw new GuardError('INVALID_STATE', 'Receipt amount must be positive.');
    if (!receipt.clientId) throw new GuardError('INVALID_STATE', 'Receipt requires a client billing account.');
    this.state.receipts.unshift(receipt);
    this.logEvent(`Offline receipt recorded: ${receipt.receiptNumber} (${receipt.amount} ${receipt.currency})`, receipt.id);
    this.notify();
  }

  public allocateReceipt(receiptId: string, invoiceId: string, amount: number) {
    requireActiveIdentity(this.state);
    const receipt = this.state.receipts.find(r => r.id === receiptId);
    const invoice = this.state.invoices.find(i => i.id === invoiceId);
    if (!receipt || !invoice) return;
    if (receipt.clientId !== invoice.clientId) {
      throw new GuardError('FORBIDDEN_SCOPE', 'Cross-client allocation is rejected.');
    }
    if (receipt.currency !== invoice.currency) {
      throw new GuardError('INVALID_STATE', 'Cross-currency allocation is rejected.');
    }
    if (invoice.status !== 'Issued' && invoice.status !== 'Paid') {
      throw new GuardError('INVALID_STATE', 'Only issued invoices can receive allocations (draft/cancelled excluded).');
    }
    if (amount <= 0) {
      throw new GuardError('INVALID_STATE', 'Allocation amount must be positive.');
    }

    const unallocated = receipt.amount - (receipt.allocatedAmount || 0);
    if (amount > unallocated) {
      throw new GuardError('INVALID_STATE', `Allocation amount ${amount} exceeds available unallocated receipt balance ${unallocated}.`);
    }

    // Invoice net remaining outstanding balance
    const issuedCredits = this.state.creditNotes
      .filter(c => c.invoiceId === invoice.id && c.status === 'Issued')
      .reduce((s, c) => s + c.amount, 0);

    let totalAllocated = 0;
    this.state.receipts.forEach(r => {
      (r.allocations || []).forEach(a => {
        if (a.invoiceId === invoice.id && !a.reversed) {
          totalAllocated += a.amount;
        }
      });
    });

    const remainingInvoice = Math.max(0, invoice.amount - issuedCredits - totalAllocated);
    if (amount > remainingInvoice) {
      throw new GuardError('INVALID_STATE', `Allocation ${amount} exceeds remaining invoice balance ${remainingInvoice}.`);
    }

    receipt.allocatedAmount = (receipt.allocatedAmount || 0) + amount;
    receipt.allocations.push({
      invoiceId,
      amount,
      allocatedAt: new Date().toISOString()
    });

    invoice.paid += amount;
    if (invoice.paid >= invoice.amount - issuedCredits) {
      invoice.status = 'Paid';
    }

    this.logEvent(`Receipt ${receipt.receiptNumber} allocated ${amount} QAR to invoice ${invoice.invoiceNumber}`, receipt.id);
    this.notify();
  }

  public reverseAllocation(receiptId: string, allocationIndex: number, reason: string) {
    const receipt = this.state.receipts.find(r => r.id === receiptId);
    if (!receipt || !receipt.allocations[allocationIndex]) return;

    const alloc = receipt.allocations[allocationIndex];
    if (alloc.reversed) return;

    alloc.reversed = true;
    alloc.reversalReason = reason;
    receipt.allocatedAmount = Math.max(0, receipt.allocatedAmount - alloc.amount);

    const invoice = this.state.invoices.find(i => i.id === alloc.invoiceId);
    if (invoice) {
      invoice.paid = Math.max(0, invoice.paid - alloc.amount);
      if (invoice.status === 'Paid' && invoice.paid < invoice.amount) {
        invoice.status = 'Issued';
      }
    }

    this.logEvent(`Allocation reversed on ${receipt.receiptNumber}: ${reason}`, receipt.id);
    this.notify();
  }

  // --- Accounting & TB (VP-035, VP-036, VP-038) ---
  public updateTrialBalanceRows(engId: string, rows: PrototypeState['engagements'][0]['rows']) {
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) return;
    eng.rows = rows;
    eng.sourceVersion++;
    eng.generation++;
    eng.candidate = null; // Stales current release candidate!
    this.logEvent(`Trial balance updated for ${eng.id} (Source v${eng.sourceVersion})`, eng.id);
    this.notify();
  }

  public addAdjustmentJournal(journal: AdjustmentJournalItem) {
    this.state.adjustmentJournals.unshift(journal);
    this.logEvent(`Adjustment journal proposed: ${journal.title}`, journal.id);
    this.notify();
  }

  public updateAdjustmentJournal(journal: AdjustmentJournalItem) {
    const index = this.state.adjustmentJournals.findIndex(j => j.id === journal.id);
    if (index >= 0) {
      this.state.adjustmentJournals[index] = journal;
      this.notify();
    }
  }

  // --- Consolidation (VP-043–VP-046) ---
  public updateConsolidationGroup(group: ConsolidationGroupRecord) {
    const index = this.state.consolidationGroups.findIndex(g => g.id === group.id);
    if (index >= 0) {
      this.state.consolidationGroups[index] = group;
    } else {
      this.state.consolidationGroups.push(group);
    }
    this.logEvent(`Consolidation group updated: ${group.name}`, group.id);
    this.notify();
  }

  // --- Audit Workpapers, Procedures, Reviews (VP-050, VP-052, VP-055, VP-056) ---
  public updateWorkpaper(engId: string, wpId: string, updates: Partial<WorkpaperItem>) {
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) return;
    const wp = eng.workpapers.find(w => w.id === wpId);
    if (!wp) return;
    Object.assign(wp, updates);
    this.notify();
  }

  public clearWorkpaper(engId: string, wpId: string, notes: string) {
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) return;
    const wp = eng.workpapers.find(w => w.id === wpId);
    if (!wp) return;

    // Check separation of duties: preparer cannot clear own workpaper!
    if (wp.preparer === this.state.currentPerson) {
      throw new Error('Separation of duties: Preparer cannot independently clear their own working paper.');
    }

    wp.status = 'Cleared';
    wp.clearance = {
      clearedBy: this.state.currentPerson,
      clearedAt: new Date().toISOString(),
      sourceVersion: eng.sourceVersion,
      generation: eng.generation,
      version: wp.version,
      notes
    };
    wp.clearanceHistory.push({ ...wp.clearance });
    this.logEvent(`Workpaper ${wp.id} cleared by ${this.state.currentPerson}`, wp.id);
    this.notify();
  }

  public addReviewNote(engId: string, note: ReviewNoteItem) {
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) return;
    eng.reviews.unshift(note);
    eng.candidate = null;
    this.logEvent(`Review note ${note.id} raised on ${note.wp}`, note.id);
    this.notify();
  }

  public respondReviewNote(engId: string, noteId: string, response: string, evidenceDoc?: string) {
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) return;
    const note = eng.reviews.find(r => r.id === noteId);
    if (!note) return;
    note.response = response;
    note.responseEvidence = evidenceDoc;
    note.status = 'Responded';
    note.history.push({
      actor: this.state.currentPerson,
      action: 'Responded to query',
      time: new Date().toLocaleTimeString('en-GB'),
      text: response
    });
    this.logEvent(`Response provided for review note ${note.id}`, note.id);
    this.notify();
  }

  public clearReviewNote(engId: string, noteId: string) {
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) return;
    const note = eng.reviews.find(r => r.id === noteId);
    if (!note) return;

    // Responder cannot clear their own query!
    const lastResponder = note.history.filter(h => h.action.includes('Responded')).at(-1)?.actor;
    if (lastResponder === this.state.currentPerson) {
      throw new Error('Separation of duties: Responder cannot clear their own review point.');
    }

    note.status = 'Cleared';
    note.history.push({
      actor: this.state.currentPerson,
      action: 'Cleared review point',
      time: new Date().toLocaleTimeString('en-GB')
    });
    this.logEvent(`Review note ${note.id} cleared by ${this.state.currentPerson}`, note.id);
    this.notify();
  }

  public recordApproval(engId: string, roleKey: 'manager' | 'client' | 'partner' | 'eqr', notes = '') {
    requireActiveIdentity(this.state);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) return;

    // Role authority checks (VP-019, VP-056 / EX14)
    const role = this.state.currentRole;
    if (roleKey === 'partner' && role !== 'partner') {
      throw new GuardError('FORBIDDEN_SCOPE', 'Only a partner can record partner clearance.');
    }
    if (roleKey === 'eqr' && role !== 'eqr') {
      throw new GuardError('FORBIDDEN_SCOPE', 'Only an Engagement Quality Reviewer can record EQR concurrence.');
    }
    if (roleKey === 'manager' && !['manager', 'senior_reviewer', 'partner'].includes(role)) {
      throw new GuardError('FORBIDDEN_SCOPE', 'Only an engagement manager or senior reviewer can record manager clearance.');
    }
    if (roleKey === 'client' && !['client_approver', 'client_admin', 'management_approver'].includes(role)) {
      throw new GuardError('FORBIDDEN_SCOPE', 'Only an authorized client management approver can record representation sign-off.');
    }

    requireEngagementScope(this.state, engId);

    // EQR check: unresolved concerns block EQR sign-off (VP-056 / F03)
    if (roleKey === 'eqr' && eng.eqrConcerns?.some(c => !c.resolved)) {
      throw new GuardError('INVALID_STATE', 'Cannot complete EQR sign-off: Unresolved EQR concerns remain.');
    }

    // Partner cannot also complete EQR for the same engagement (VP-056), scoped
    // per engagement — never a global shared object.
    if (roleKey === 'eqr' && eng.approvals.partner?.by === this.state.currentPerson) {
      throw new GuardError('SELF_APPROVAL', 'A partner cannot also complete EQR for the same engagement.');
    }
    eng.approvals[roleKey] = {
      by: this.state.currentPerson,
      at: new Date().toISOString(),
      generation: eng.generation,
      notes
    };
    this.logEvent(`Stage approval recorded: ${roleKey.toUpperCase()} by ${this.state.currentPerson}`, eng.id);
    this.notify();
  }

  public addEqrConcern(engId: string, text: string) {
    requireActiveIdentity(this.state);
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) return;
    if (!text || !text.trim()) throw new GuardError('INVALID_STATE', 'Concern text is required.');
    if (!eng.eqrConcerns) eng.eqrConcerns = [];
    const concernId = `EQR-0${eng.eqrConcerns.length + 1}`;
    eng.eqrConcerns.push({
      id: concernId,
      text: text.trim(),
      resolved: false,
      raisedBy: this.state.currentPerson,
      raisedAt: new Date().toISOString()
    });
    this.logEvent(`EQR concern ${concernId} raised by ${this.state.currentPerson}`, eng.id);
    this.notify();
  }

  public toggleEqrConcern(engId: string, concernId: string) {
    requireActiveIdentity(this.state);
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) return;
    const concern = eng.eqrConcerns?.find(c => c.id === concernId);
    if (!concern) throw new GuardError('INVALID_STATE', 'Concern not found.');
    concern.resolved = !concern.resolved;
    if (concern.resolved) {
      concern.resolvedAt = new Date().toISOString();
      concern.resolvedBy = this.state.currentPerson;
    } else {
      concern.resolvedAt = undefined;
      concern.resolvedBy = undefined;
    }
    this.logEvent(`EQR concern ${concernId} marked ${concern.resolved ? 'resolved' : 'open'}`, eng.id);
    this.notify();
  }

  public replaceWorkpaperRevision(engId: string, wpId: string, fileDetails: { name: string; size?: number }) {
    requireActiveIdentity(this.state);
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) return;
    const wp = eng.workpapers.find(w => w.id === wpId);
    if (!wp) throw new GuardError('INVALID_STATE', 'Workpaper not found.');
    if (!fileDetails.name || !fileDetails.name.trim()) throw new GuardError('INVALID_STATE', 'File name is required.');

    wp.version += 1;
    wp.status = 'In progress';
    if (wp.clearance) {
      wp.clearanceHistory.push({ ...wp.clearance });
      wp.clearance = null;
    }
    wp.documentName = fileDetails.name;
    wp.workingPaper = {
      file: fileDetails.name,
      name: fileDetails.name,
      size: fileDetails.size || 64000,
      sha: 'a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef',
      version: wp.version,
      uploadedAt: new Date().toISOString(),
      uploadedBy: this.state.currentPerson,
      local: true
    };
    this.logEvent(`Workpaper ${wp.id} revision v${wp.version} uploaded by ${this.state.currentPerson}`, wp.id);
    this.notify();
  }

  // --- PBC lifecycle (VP-023, VP-024): response is not acceptance ---------------
  public uploadPbcResponse(engId: string, requestId: string, file: { name: string; size?: number }) {
    requireActiveIdentity(this.state);
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) return;
    const req = eng.pbc.find(r => r.id === requestId);
    if (!req) throw new GuardError('INVALID_STATE', 'PBC request not found.');
    if (!file.name || !file.name.trim()) throw new GuardError('INVALID_STATE', 'File name is required.');

    const docId = `DOC-PBC-${Date.now().toString().slice(-4)}`;
    const newDoc: DocumentItem = {
      id: docId,
      clientId: eng.client,
      engagementId: eng.id,
      name: file.name,
      folderPath: `/PBC/`,
      version: 1,
      size: file.size || 50000,
      sha: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      classification: 'Client provided',
      visibility: 'Client shared',
      source: 'Local In-Session',
      linkedPbcId: req.id,
      uploadedBy: this.state.currentPerson,
      uploadedAt: new Date().toISOString()
    };
    this.state.documents.unshift(newDoc);

    if (!req.sharedFiles) req.sharedFiles = [];
    req.sharedFiles.push({
      id: docId,
      name: file.name,
      version: req.version,
      size: file.size || 50000,
      sha: newDoc.sha,
      uploadedBy: this.state.currentPerson,
      uploadedAt: new Date().toISOString(),
      source: 'Client Portal'
    });

    if (!req.thread) req.thread = [];
    req.thread.push({
      id: `TH-${Date.now()}`,
      kind: 'response',
      author: this.state.currentPerson,
      role: this.state.currentRole,
      text: `Uploaded evidence file: ${file.name}`,
      time: new Date().toISOString(),
      file: file.name,
      version: req.version,
      clientVisible: true
    });

    req.status = 'Received';
    this.logEvent(`PBC response file uploaded by ${this.state.currentPerson}: ${file.name}`, req.id);
    this.notify();
  }
  public addPbcRequest(engId: string, request: PbcRequestItem) {
    requireActiveIdentity(this.state);
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) return;
    if (!request.title || !request.title.trim()) throw new GuardError('INVALID_STATE', 'Request title is required.');
    eng.pbc.unshift({ ...request, status: 'Draft', version: 1 });
    this.logEvent(`PBC request drafted: ${request.title}`, request.id);
    this.notify();
  }

  public presentPbcRequest(engId: string, requestId: string) {
    requireActiveIdentity(this.state);
    const eng = this.state.engagements.find(e => e.id === engId);
    const req = eng?.pbc.find(r => r.id === requestId);
    if (!req) return;
    if (!req.title || (req as { contributor?: string }).contributor === undefined) {
      // Recipient recorded via contributor/owner fields; presentation requires context.
    }
    if (req.status !== 'Draft') throw new GuardError('INVALID_STATE', 'Only draft requests can be presented.');
    req.status = 'Requested';
    req.requestedBy = this.state.currentPerson;
    req.requestedAt = new Date().toISOString();
    this.logEvent(`PBC request presented: ${req.title}`, req.id);
    this.notify();
  }

  public acceptPbcResponse(engId: string, requestId: string) {
    // Only a different authorized person may accept; uploader cannot self-accept (VP-024).
    requireActiveIdentity(this.state);
    const eng = this.state.engagements.find(e => e.id === engId);
    const req = eng?.pbc.find(r => r.id === requestId);
    if (!req) return;
    const lastUploadBy = req.thread?.filter(t => t.kind === 'response').at(-1)?.author || req.contributor || '';
    if (lastUploadBy) requireIndependentActor(lastUploadBy, this.state.currentPerson, 'accept this PBC response');
    req.status = 'Accepted';
    this.logEvent(`PBC response accepted: ${req.title}`, req.id);
    this.notify();
  }

  // --- Time correction revision (VP-028): approved entries are never overwritten -
  public correctApprovedTime(entryId: string, correctedMinutes: number, reason: string) {
    requireActiveIdentity(this.state);
    const entry = this.state.times.find(t => t.id === entryId);
    if (!entry) return;
    if (entry.status !== 'Approved') throw new GuardError('INVALID_STATE', 'Only approved entries use correction revisions.');
    if (correctedMinutes <= 0) throw new GuardError('INVALID_STATE', 'Corrected duration must be positive.');
    entry.status = 'Superseded';
    const correction: TimeEntryItem = {
      ...entry,
      id: `${entry.id}-R${(entry.correctionRevision || 0) + 1}`,
      durationMinutes: correctedMinutes,
      status: 'Submitted',
      correctionRevision: (entry.correctionRevision || 0) + 1,
      reviewedBy: undefined,
      reviewedAt: undefined,
      returnReason: `Correction of ${entry.id}: ${reason}`
    };
    this.state.times.unshift(correction);
    this.logEvent(`Time correction submitted for ${entry.id}: ${reason}`, correction.id);
    this.notify();
  }

  // --- Evidence catalogue (VP-053): version-pinned shared references ------------
  public setEvidenceAdequacy(evidenceId: string, status: 'Adequate' | 'Pending verification' | 'Deficient', rationale = '') {
    requireActiveIdentity(this.state);
    const ev = this.state.evidenceCatalogue.find(e => e.id === evidenceId);
    if (!ev) throw new GuardError('INVALID_STATE', 'Evidence record not found.');
    if (status !== 'Adequate' && !rationale.trim()) {
      throw new GuardError('INVALID_STATE', 'A non-adequate determination requires a recorded rationale.');
    }
    ev.adequacyStatus = status;
    this.logEvent(`Evidence ${evidenceId} adequacy set to ${status} by ${this.state.currentPerson}${rationale ? ': ' + rationale : ''}`, evidenceId);
    this.notify();
  }

  public linkEvidenceProcedure(evidenceId: string, procedureId: string) {    requireActiveIdentity(this.state);
    const ev = this.state.evidenceCatalogue.find(e => e.id === evidenceId);
    if (!ev) throw new GuardError('INVALID_STATE', 'Evidence record not found.');
    if (!ev.linkedProcedures.includes(procedureId)) ev.linkedProcedures.push(procedureId);
    this.logEvent(`Evidence ${evidenceId} linked to procedure ${procedureId}`, evidenceId);
    this.notify();
  }

  // --- Findings disposition (VP-054) -------------------------------------------
  public setFindingDisposition(findingId: string, disposition: PrototypeState['findings'][0]['disposition'], rationale: string) {
    requireActiveIdentity(this.state);
    const f = this.state.findings.find(x => x.id === findingId);
    if (!f) return;
    if (!rationale || !rationale.trim()) throw new GuardError('INVALID_STATE', 'Finding disposition requires human rationale.');
    f.disposition = disposition;
    f.managementResponse = rationale;
    this.logEvent(`Finding ${findingId} disposition: ${disposition}`, findingId);
    this.notify();
  }

  // --- Amendment / reissue lineage (VP-058) ------------------------------------
  public prepareAmendedRelease(engId: string, reason: string) {
    requireActiveIdentity(this.state);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) return;
    const latest = eng.releases.at(-1);
    if (!latest) throw new GuardError('INVALID_STATE', 'No released package to amend.');
    eng.candidate = {
      generation: eng.generation + 1,
      preparedAt: new Date().toISOString(),
      preparedBy: this.state.currentPerson,
      manifest: [...latest.manifest.map(m => m.name), `Amendment note: ${reason}`]
    };
    eng.generation += 1;
    // Fresh review required: clear currentness of prior approvals for the new content.
    eng.approvals = { manager: null, client: null, partner: null, eqr: null };
    this.logEvent(`Amended release prepared from ${latest.id}: ${reason}`, eng.id);
    this.notify();
  }

  // --- Firm settings apply prospectively (VP-062) -------------------------------
  public updateFirmSettings(patch: Partial<PrototypeState['firmSettings']>, reason = '') {
    requireActiveIdentity(this.state);
    this.state.firmSettings = { ...this.state.firmSettings, ...patch };
    this.logEvent(`Firm settings updated${reason ? ': ' + reason : ''}`, 'FIRM');
    this.notify();
  }

  /** Fixture integrity snapshot for tests and the coverage report. */
  public checkIntegrity() {
    return validateFixtures(this.state);
  }

  // --- Release & Archive (VP-057, VP-058, VP-059) ---
  public prepareReleaseCandidate(engId: string) {
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) return;
    eng.candidate = {
      generation: eng.generation,
      preparedAt: new Date().toISOString(),
      preparedBy: this.state.currentPerson,
      manifest: [
        'Auditor_Report_FY2026.pdf',
        'Financial_Statements_Package_v3.xlsx',
        'Management_Representation_Letter.pdf'
      ]
    };
    this.logEvent(`Release candidate frozen for ${eng.id} (Gen ${eng.generation})`, eng.id);
    this.notify();
  }

  public issueRelease(engId: string, dispatchNote = '') {
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng || !eng.candidate) return;
    const releaseId = `REL-2600${eng.releases.length + 1}`;
    const prevRelease = eng.releases.at(-1);
    eng.releases.push({
      id: releaseId,
      version: eng.releases.length + 1,
      generation: eng.candidate.generation,
      releasedAt: new Date().toISOString(),
      releasedBy: this.state.currentPerson,
      delivered: true,
      dispatchNote,
      predecessorId: prevRelease ? prevRelease.id : undefined,
      recipients: ['Omar Nasser (CFO)', 'Daniel James (Partner)'],
      manifest: [
        { id: 'M-01', name: 'Auditor_Report_FY2026.pdf', type: 'PDF', sha: '99aabbccddeeff001122334455667788' },
        { id: 'M-02', name: 'Financial_Statements_Package_v3.xlsx', type: 'XLSX', sha: '77889900aabbccddeeff112233445566' }
      ]
    });
    eng.candidate = null;
    this.logEvent(`Report package released in demo: ${releaseId}`, eng.id);
    this.notify();
  }

  public reopenReleaseForAmendment(engId: string, reason: string) {
    requireActiveIdentity(this.state);
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) return;
    if (!reason || !reason.trim()) throw new GuardError('INVALID_STATE', 'Amendment reason is required.');

    const lastRelease = eng.releases.at(-1);
    if (lastRelease) {
      lastRelease.isAmended = true;
    }

    eng.packageRevision++;
    eng.generation++;
    eng.candidate = null;
    // Approvals for partner are invalidated for the new generation
    eng.approvals.partner = null;
    if (eng.eqrRequired) {
      eng.approvals.eqr = null;
    }
    this.logEvent(`Release re-opened for amendment: ${reason} (Gen ${eng.generation})`, eng.id);
    this.notify();
  }

  public prepareClientWorkspace(clientId: string, year = 2026) {
    requireActiveIdentity(this.state);
    const client = this.state.clients.find(c => c.id === clientId);
    const code = client?.code || clientId;
    if (!this.state.folders) this.state.folders = [];
    const canonical = [
      { path: `/Clients/${code}/`, label: `${client?.name || code} Root`, clientId },
      { path: `/Clients/${code}/${year}/`, label: `FY ${year} Records`, clientId },
      { path: `/Clients/${code}/${year}/01_Acceptance/`, label: '01 Acceptance & KYC', clientId },
      { path: `/Clients/${code}/${year}/02_Planning/`, label: '02 Audit Planning', clientId },
      { path: `/Clients/${code}/${year}/03_Fieldwork/`, label: '03 Substantive Fieldwork', clientId },
      { path: `/Clients/${code}/${year}/04_Deliverables/`, label: '04 Signed Deliverables', clientId },
      { path: `/Clients/${code}/${year}/05_Correspondence/`, label: '05 Client Communications', clientId }
    ];
    canonical.forEach(folder => {
      if (!this.state.folders!.some(f => f.path === folder.path)) {
        this.state.folders!.push(folder);
      }
    });
    this.logEvent(`Canonical SharePoint workspace prepared for client ${code}`, clientId);
    this.notify();
  }

  public archiveEngagement(engId: string, releaseId: string, retentionUntil?: string, onHold = false, holdReason?: string) {
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) return;
    eng.archive = {
      archivedAt: new Date().toISOString(),
      archivedBy: this.state.currentPerson,
      releaseId,
      manifest: ['Auditor_Report_FY2026.pdf', 'Financial_Statements_Package_v3.xlsx'],
      retentionUntil,
      onApplicationHold: onHold,
      holdReason
    };
    this.logEvent(`Engagement ${eng.id} archived in logical repository`, eng.id);
    this.notify();
  }

  // --- M365 Setup (VP-017, VP-022) ---
  public updateM365Config(config: PrototypeState['m365Config']) {
    this.state.m365Config = { ...config, liveConnected: false };
    this.notify();
  }

  public simulateM365Verification() {
    this.state.m365Config.status = 'Simulated verified';
    this.state.m365Config.lastSimulatedVerification = new Date().toISOString();
    this.state.m365Config.liveConnected = false;
    this.logEvent('M365 configuration simulation verified locally', 'M365');
    this.notify();
  }

  public simulateM365Disconnect() {
    this.state.m365Config.status = 'Disconnected';
    this.state.m365Config.liveConnected = false;
    this.logEvent('M365 connection simulated disconnected', 'M365');
    this.notify();
  }

  // --- Scenario & State Reset (VP-004) ---
  public loadScenario(name: ScenarioName) {
    this.state = loadScenarioState(name);
    this.logEvent(`Loaded scenario preset: ${name}`, 'SYS');
    this.notify();
  }

  public resetState() {
    this.state = createInitialState();
    this.logEvent('Local prototype state reset to initial baseline', 'SYS');
    this.notify();
  }

  public exportStateJSON(): string {
    return JSON.stringify(this.state, null, 2);
  }

  public importStateJSON(jsonStr: string) {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      throw new Error('Invalid JSON format for AuditSphere state import.');
    }
    const p = parsed as { engagements?: unknown; schema?: unknown };
    if (!p || !Array.isArray(p.engagements)) {
      throw new Error('Imported state is ambiguous: missing engagements. Prior payload preserved; nothing was overwritten.');
    }
    if (typeof p.schema === 'number' && p.schema > CURRENT_SCHEMA) {
      throw new Error(`Imported state uses schema v${p.schema}, newer than supported v${CURRENT_SCHEMA}.`);
    }
    try {
      const current = localStorage.getItem(STORAGE_KEY);
      if (current) localStorage.setItem(STORAGE_BACKUP_KEY, current);
    } catch { /* quota */ }
    const { state, warnings } = migratePersistedState(parsed, createInitialState());
    const issues = validateFixtures(state);
    if (issues.length > 0) {
      throw new Error(`Imported state failed integrity: ${issues[0].message} (${issues.length} issue(s)). Prior payload preserved.`);
    }
    this.state = state;
    warnings.forEach(w => this.logEvent(w, 'SYS'));
    this.logEvent('Validated synthetic state imported successfully', 'SYS');
    this.notify();
  }
}

export const prototypeStore = new PrototypeStore();
