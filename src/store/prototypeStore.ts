// AuditSphere Single Typed Store & Command Boundary
// VP-002, VP-004, VP-019, VP-056: Single state, guarded actions, reactive subscriptions

import { PrototypeState, RoleKey, ClientRecord, EngagementRecord, JobRecord, JobTaskItem, TimeEntryItem, InvoiceRecord, ReceiptRecord, CreditNoteRecord, PbcRequestItem, WorkpaperItem, ReviewNoteItem, AdjustmentJournalItem, ConsolidationGroupRecord, DocumentItem, CommunicationItem } from '../types';
import { createInitialState } from './initialState';
import { ScenarioName, loadScenarioState } from './scenarios';

const STORAGE_KEY = 'ste-auditsphere-role-portals-v2';

class PrototypeStore {
  private state: PrototypeState;
  private listeners: Set<() => void> = new Set();
  private isSessionOnly = false;

  constructor() {
    this.state = this.loadInitialState();
  }

  private loadInitialState(): PrototypeState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.schema >= 2 && Array.isArray(parsed.engagements)) {
          return { ...createInitialState(), ...parsed };
        }
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
    this.state.currentPerson = name;
    this.notify();
  }

  public setSelectedEngagement(id: string) {
    this.state.selectedEngagement = id;
    this.notify();
  }

  // --- Client Actions (VP-006, VP-007) ---
  public addClient(client: ClientRecord) {
    this.state.clients.push(client);
    this.logEvent(`New client profile created: ${client.name}`, client.id);
    this.notify();
  }

  public updateClient(client: ClientRecord) {
    const index = this.state.clients.findIndex(c => c.id === client.id);
    if (index >= 0) {
      this.state.clients[index] = client;
      this.logEvent(`Client profile updated: ${client.name}`, client.id);
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
    const prop = this.state.proposals.find(p => p.id === propId);
    if (!prop) return;
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
    this.state.jobTasks.push(task);
    this.notify();
  }

  public updateTask(task: JobTaskItem) {
    const index = this.state.jobTasks.findIndex(t => t.id === task.id);
    if (index >= 0) {
      this.state.jobTasks[index] = task;
      this.notify();
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

  public applyJobTemplate(templateId: string, engagementId: string, jobTitle: string, dueDate: string, owner: string) {
    const tpl = this.state.jobTemplates.find(t => t.id === templateId);
    if (!tpl) return;
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

  public prepareClientWorkspace(clientId: string) {
    const client = this.state.clients.find(c => c.id === clientId);
    if (!client) return;
    this.logEvent(`SharePoint client workspace prepared for ${client.name}`, client.id);
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
    this.state.creditNotes.push(credit);
    const inv = this.state.invoices.find(i => i.id === credit.invoiceId);
    if (inv) {
      inv.creditsApplied = (inv.creditsApplied || 0) + credit.amount;
    }
    this.logEvent(`Credit note issued: ${credit.creditNumber} (${credit.amount} QAR)`, credit.id);
    this.notify();
  }

  // --- Offline Receipts & Allocations (VP-032) ---
  public addReceipt(receipt: ReceiptRecord) {
    this.state.receipts.unshift(receipt);
    this.logEvent(`Offline receipt recorded: ${receipt.receiptNumber} (${receipt.amount} ${receipt.currency})`, receipt.id);
    this.notify();
  }

  public allocateReceipt(receiptId: string, invoiceId: string, amount: number) {
    const receipt = this.state.receipts.find(r => r.id === receiptId);
    const invoice = this.state.invoices.find(i => i.id === invoiceId);
    if (!receipt || !invoice) return;

    const unallocated = receipt.amount - receipt.allocatedAmount;
    if (amount > unallocated) {
      throw new Error('Allocation exceeds available unallocated receipt balance.');
    }

    receipt.allocatedAmount += amount;
    receipt.allocations.push({
      invoiceId,
      amount,
      allocatedAt: new Date().toISOString()
    });

    invoice.paid += amount;
    if (invoice.paid >= invoice.amount) {
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
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) return;
    eng.approvals[roleKey] = {
      by: this.state.currentPerson,
      at: new Date().toISOString(),
      generation: eng.generation,
      notes
    };
    this.logEvent(`Stage approval recorded: ${roleKey.toUpperCase()} by ${this.state.currentPerson}`, eng.id);
    this.notify();
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
    eng.releases.push({
      id: releaseId,
      version: eng.releases.length + 1,
      generation: eng.candidate.generation,
      releasedAt: new Date().toISOString(),
      releasedBy: this.state.currentPerson,
      delivered: true,
      dispatchNote,
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
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed && Array.isArray(parsed.engagements)) {
        this.state = { ...createInitialState(), ...parsed };
        this.logEvent('Custom JSON state imported successfully', 'SYS');
        this.notify();
      }
    } catch (e) {
      throw new Error('Invalid JSON format for AuditSphere state import.');
    }
  }
}

export const prototypeStore = new PrototypeStore();
