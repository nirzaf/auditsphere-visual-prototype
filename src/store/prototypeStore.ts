// AuditSphere Single Typed Store & Command Boundary
// VP-002, VP-004, VP-019, VP-056: Single state, guarded actions, reactive subscriptions

import { PrototypeState, RoleKey, ClientRecord, EngagementRecord, JobRecord, JobTaskItem, JobTemplateItem, TimeEntryItem, InvoiceRecord, ReceiptRecord, CreditNoteRecord, PbcRequestItem, WorkpaperItem, WorkpaperTemplateItem, ReviewNoteItem, AdjustmentJournalItem, ConsolidationGroupRecord, DocumentItem, CommunicationItem, AcceptanceCaseRecord, AuditPlanRecord, ArchiveRecord, ArchiveHistoryEntry, ArchivedArtifactRecord, SimulatedInvitation, IdentityStatusEvent, StatementSetRevision, ReconciliationSchedule, ClientAccountingProfile } from '../types';
import { createInitialState } from './initialState';
import { ScenarioName, loadScenarioState } from './scenarios';
import { CURRENT_SCHEMA, migratePersistedState, validateFixtures } from '../services/migrations';
import { requireActiveIdentity, requireIndependentActor, requireEngagementScope, requireClientScope, visibleEngagementIds, isClientRole, canOpenRoute, GuardError } from '../services/guards';
import { calculateReconciliationVariance } from '../services/calculations';

const STORAGE_KEY = 'ste-auditsphere-role-portals-v2';
const STORAGE_BACKUP_KEY = 'ste-auditsphere-role-portals-v2.backup';

const isValidMoney = (amount: number, allowZero = false) =>
  Number.isFinite(amount) && (allowZero ? amount >= 0 : amount > 0) && Math.round(amount * 100) === amount * 100;

const isSampleFrameReconciled = (state: PrototypeState, population: PrototypeState['samplePopulations'][number]) => {
  const engagement = state.engagements.find(item => item.id === population.engagementId);
  const glRow = engagement?.rows.find(row => row.code === population.accountCode);
  return Boolean(population.sourceComplete && engagement && glRow && population.period === engagement.year && population.currency === engagement.currency && population.items.every(item => (!item.period || item.period === population.period) && (!item.currency || item.currency === population.currency)) && Math.abs(glRow.balance - population.totalPopulationValue) < 0.01);
};

const requireRole = (state: PrototypeState, allowed: RoleKey[], action: string) => {
  if (!allowed.includes(state.currentRole)) {
    throw new GuardError('FORBIDDEN_SCOPE', `Role "${state.currentRole}" cannot ${action}.`);
  }
};
const requireGlobalAdmin = (state: PrototypeState, action: string) => {
  if (state.currentRole !== 'admin' || !state.roleGrants.some(g => g.userId === state.currentUserId && g.role === 'admin' && g.scopeKind === 'Global')) {
    throw new GuardError('FORBIDDEN_SCOPE', `Only administrators with an active Global grant can ${action}.`);
  }
};

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
  public resolveStorageConflict(choice: 'reload' | 'keep-local'): void {
    if (!this.storageConflict) return;
    const latest = localStorage.getItem(STORAGE_KEY);
    if (choice === 'reload') {
      if (!latest) throw new GuardError('INVALID_STATE', 'The newer saved state is no longer available.');
      const parsed = JSON.parse(latest) as Partial<PrototypeState>;
      const { state } = migratePersistedState(parsed, createInitialState());
      const issues = validateFixtures(state);
      if (issues.length) throw new GuardError('INVALID_STATE', `Newer saved state failed validation: ${issues[0].message}`);
      this.state = state;
    } else if (latest) {
      // Preserve the other tab's latest payload before the user explicitly replaces it.
      localStorage.setItem(STORAGE_BACKUP_KEY, latest);
    }
    this.storageConflict = false;
    if (choice === 'keep-local') this.persist();
    this.listeners.forEach(fn => fn());
  }
  public isSessionOnlyMode(): boolean { return this.isSessionOnly; }
  public getLoadError(): string | null { return this.loadError; }

  private loadInitialState(): PrototypeState {
    if (typeof localStorage === 'undefined') {
      this.isSessionOnly = true;
      return createInitialState();
    }
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
          const issues = validateFixtures(state);
          if (issues.length === 0) return state;
          this.loadError = `Saved demo state failed integrity validation (${issues[0].message}). The original payload was preserved; reset or import a validated file.`;
          return createInitialState();
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
    if (this.isSessionOnly || this.storageConflict) return;
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
    return structuredClone(this.state);
  };

  private invalidateReleaseBasis(eng: EngagementRecord) {
    eng.generation++;
    eng.candidate = null;
    eng.approvals.manager = null;
    eng.approvals.client = null;
    eng.approvals.partner = null;
    eng.approvals.eqr = null;
  }

  private reopenWorkpaperReviewNotes(eng: EngagementRecord, workpaper: WorkpaperItem) {
    for (const note of eng.reviews.filter(item => item.wp === workpaper.id && ['Responded', 'Cleared'].includes(item.status))) {
      note.status = 'Reopened';
      note.history.push({ actor: this.state.currentPerson, action: 'Reopened after workpaper revision', time: new Date().toISOString(), text: `Workpaper revision changed to v${workpaper.version}; previous response remains historical.` });
    }
  }

  private assignAccountingPeriod(engagement: EngagementRecord) {
    const client = this.state.clients.find(item => item.id === engagement.client);
    if (!client) return;
    const profile = client.accountingProfile ||= { legalEntityName: client.name, reportingBasis: 'Not selected', baseCurrency: engagement.currency || 'QAR', accounts: [], periodBooks: [], dimensions: [], revision: 0, chartRevision: 0, history: [] };
    const period = profile.periodBooks.find(book => book.ownerEngagementId === engagement.id);
    if (period) { engagement.accountingPeriodBookId = period.id; engagement.accountingProfileRevision = profile.revision; engagement.accountingChartRevision = profile.chartRevision; return; }
    const dates = engagement.period.match(/(\d{4})/g) || [String(engagement.year)];
    const startYear = dates[0], endYear = dates.at(-1) || startYear;
    const id = `PB-${engagement.id}`;
    if (profile.revision) profile.history.push({ legalEntityName: profile.legalEntityName, reportingBasis: profile.reportingBasis, baseCurrency: profile.baseCurrency, accounts: structuredClone(profile.accounts), periodBooks: structuredClone(profile.periodBooks), dimensions: structuredClone(profile.dimensions), revision: profile.revision, chartRevision: profile.chartRevision, savedAt: new Date().toISOString(), savedByUserId: this.state.currentUserId });
    profile.periodBooks.push({ id, name: engagement.period, bookName: engagement.mode || 'General ledger', startDate: `${startYear}-01-01`, endDate: `${endYear}-12-31`, ownerEngagementId: engagement.id, status: 'Open' });
    profile.revision++;
    for (const existing of this.state.engagements.filter(item => item.client === engagement.client)) { existing.accountingProfileRevision = profile.revision; existing.accountingChartRevision = profile.chartRevision; }
    engagement.accountingPeriodBookId = id; engagement.accountingProfileRevision = profile.revision; engagement.accountingChartRevision = profile.chartRevision;
  }

  private hasNewerDocumentRevision(documentId: string) {
    return this.state.documents.some(document => document.supersedesDocumentId === documentId);
  }

  private staleReconciliation(rec: ReconciliationSchedule) {
    if (rec.status === 'Stale') return;
    if (rec.preparedAt) {
      rec.history ||= [];
      rec.history.push({ revision: rec.revision || 1, sourceVersion: rec.sourceVersion || 0, status: rec.status, savedAt: rec.preparedAt, savedByUserId: rec.preparedByUserId || '', glBalance: rec.glBalance ?? rec.sourceBalance, statementBalance: rec.statementBalance ?? rec.supportingBalance, items: structuredClone(rec.items || []), reviewedByUserId: rec.reviewedByUserId, reviewedAt: rec.reviewedAt, reviewNote: rec.reviewNote });
    }
    rec.status = 'Stale';
  }

  private staleStatementSetRevisions(changedEngagementId: string) {
    for (const revision of this.state.statementSetRevisions || []) {
      if (revision.engagementId !== changedEngagementId && revision.comparativeEngagementId !== changedEngagementId) continue;
      const engagement = this.state.engagements.find(item => item.id === revision.engagementId);
      const mappingRevision = Math.max(0, ...(this.state.accountMappingRevisions || []).filter(item => item.engagementId === revision.engagementId).map(item => item.revision));
      const comparison = revision.comparativeEngagementId && this.state.engagements.find(item => item.id === revision.comparativeEngagementId);
      const comparisonMappingRevision = comparison && Math.max(0, ...(this.state.accountMappingRevisions || []).filter(item => item.engagementId === comparison.id).map(item => item.revision));
      if (!engagement || revision.sourceVersion !== engagement.sourceVersion || revision.mappingRevision !== mappingRevision ||
          (revision.scopeSnapshot && (revision.scopeSnapshot.service !== engagement.service || revision.scopeSnapshot.year !== engagement.year || revision.scopeSnapshot.period !== engagement.period)) ||
          (revision.comparativeEngagementId && (!comparison || revision.comparativeSourceVersion !== comparison.sourceVersion || revision.comparativeMappingRevision !== comparisonMappingRevision || revision.comparativeScopeSnapshot && (revision.comparativeScopeSnapshot.service !== comparison.service || revision.comparativeScopeSnapshot.year !== comparison.year || revision.comparativeScopeSnapshot.period !== comparison.period)))) {
        revision.status = 'Stale';
      }
    }
  }

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
      this.state.currentUserId = persona.id;
      this.state.currentPerson = persona.name;
    }
    this.notify();
  }

  public setPerson(name: string) {
    const matching = this.state.users.filter(u => u.name === name && u.role === this.state.currentRole);
    const user = matching.length === 1 ? matching[0] : this.state.users.find(u => u.name === name);
    if (user) {
      this.state.currentUserId = user.id;
      this.state.currentPerson = user.name;
      this.state.currentRole = user.role;
    } else {
      this.state.currentPerson = name;
    }
    this.notify();
  }

  /** Switch by immutable persona ID, never by display name. */
  public setPersona(userId: string) {
    const user = this.state.users.find(u => u.id === userId);
    if (!user) throw new GuardError('DISABLED_IDENTITY', `Persona "${userId}" is not recognized.`);
    this.state.currentUserId = user.id;
    this.state.currentPerson = user.name;
    this.state.currentRole = user.role;
    this.notify();
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
    client.accountingProfile ||= { legalEntityName: client.name.trim(), reportingBasis: 'Not selected', baseCurrency: 'QAR', accounts: [], periodBooks: [], dimensions: [], revision: 0, chartRevision: 0, history: [] };
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
    requireRole(this.state, ['relationship', 'manager', 'partner', 'admin', 'onboarding'], 'add client contacts');
    requireClientScope(this.state, contact.clientId);
    if (!contact.name || !contact.name.trim()) {
      throw new GuardError('INVALID_STATE', 'Contact full name is required.');
    }
    if (!this.state.clients.some(c => c.id === contact.clientId) || !contact.email.trim() || this.state.contacts.some(c => c.id === contact.id)) throw new GuardError('INVALID_STATE', 'Contact must have a unique ID, existing client and email address.');
    if (contact.isPrimary && !contact.active) throw new GuardError('INVALID_STATE', 'An inactive contact cannot be primary.');
    if (contact.isPrimary) this.state.contacts.forEach(c => { if (c.clientId === contact.clientId) c.isPrimary = false; });
    contact.portalAccessRequested = false;
    this.state.contacts.push(contact);
    this.logEvent(`Contact added: ${contact.name} (${contact.clientId})`, contact.id);
    this.notify();
  }

  public setClientCustomField(clientId: string, fieldId: string, value: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['relationship', 'manager', 'partner', 'admin'], 'update client custom fields');
    requireClientScope(this.state, clientId);
    const client = this.state.clients.find(c => c.id === clientId);
    const field = this.state.customFields.find(f => f.id === fieldId && f.enabled !== false);
    if (!client || !field) throw new GuardError('INVALID_STATE', 'Client or active custom field was not found.');
    const text = value.trim();
    if (!text) throw new GuardError('INVALID_STATE', 'Custom field value is required.');
    if (field.type === 'number' && (!Number.isFinite(Number(text)) || text === '')) throw new GuardError('INVALID_STATE', 'Enter a finite number for this custom field.');
    if (field.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`)) || new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) !== text)) throw new GuardError('INVALID_STATE', 'Enter a valid date for this custom field.');
    if (field.type === 'choice' && !field.options?.includes(text)) throw new GuardError('INVALID_STATE', 'Select one of the configured choices for this custom field.');
    client.customFields ||= {};
    client.customFields[fieldId] = field.type === 'number' ? Number(text) : text;
    this.logEvent(`Client custom field updated: ${field.label}`, clientId);
    this.notify();
  }

  public addCustomFieldDefinition(label: string, type: PrototypeState['customFields'][number]['type'], options: string[] = []) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['relationship', 'manager', 'partner', 'admin'], 'define client custom fields');
    const cleanLabel = label.trim();
    const cleanOptions = [...new Set(options.map(option => option.trim()).filter(Boolean))];
    if (!cleanLabel || this.state.customFields.some(field => field.label.trim().toLowerCase() === cleanLabel.toLowerCase())) throw new GuardError('INVALID_STATE', 'Enter a unique custom field label.');
    if (type === 'choice' && cleanOptions.length < 2) throw new GuardError('INVALID_STATE', 'Choice fields need at least two distinct options.');
    const field = { id: `cf_${crypto.randomUUID()}`, label: cleanLabel, type, options: type === 'choice' ? cleanOptions : undefined, enabled: true };
    this.state.customFields.push(field);
    this.logEvent(`Client custom field defined: ${cleanLabel}`, field.id);
    this.notify();
    return field.id;
  }

  public setCustomFieldDefinitionEnabled(fieldId: string, enabled: boolean) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['relationship', 'manager', 'partner', 'admin'], 'change client custom field availability');
    const field = this.state.customFields.find(item => item.id === fieldId);
    if (!field) throw new GuardError('INVALID_STATE', 'Custom field definition was not found.');
    field.enabled = enabled;
    this.logEvent(`Client custom field ${enabled ? 'enabled' : 'disabled'}: ${field.label}`, field.id);
    this.notify();
  }

  public assignClientRelationshipGroup(clientId: string, groupId?: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['relationship', 'manager', 'partner', 'admin'], 'change client relationship groups');
    requireClientScope(this.state, clientId);
    const client = this.state.clients.find(c => c.id === clientId);
    const group = groupId ? this.state.relationshipGroups.find(g => g.id === groupId) : undefined;
    if (!client || (groupId && !group)) throw new GuardError('INVALID_STATE', 'Client or relationship group was not found.');
    if (client.relationshipGroupId) {
      const previous = this.state.relationshipGroups.find(g => g.id === client.relationshipGroupId);
      if (previous) previous.clientIds = previous.clientIds.filter(id => id !== clientId);
    }
    client.relationshipGroupId = group?.id;
    if (group && !group.clientIds.includes(clientId)) group.clientIds.push(clientId);
    this.logEvent(`Client ${group ? 'linked to' : 'removed from'} relationship group${group ? ` ${group.name}` : ''}`, clientId);
    this.notify();
  }

  public createClientRelationshipGroup(clientId: string, name: string, description = '') {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['relationship', 'manager', 'partner', 'admin'], 'create client relationship groups');
    requireClientScope(this.state, clientId);
    const client = this.state.clients.find(c => c.id === clientId);
    if (!client || !name.trim()) throw new GuardError('INVALID_STATE', 'Choose an existing client and enter a relationship group name.');
    if (this.state.relationshipGroups.some(group => group.name.trim().toLowerCase() === name.trim().toLowerCase())) throw new GuardError('INVALID_STATE', 'A relationship group with this name already exists.');
    if (client.relationshipGroupId) {
      const previous = this.state.relationshipGroups.find(group => group.id === client.relationshipGroupId);
      if (previous) previous.clientIds = previous.clientIds.filter(id => id !== clientId);
    }
    const group = { id: `GRP-REL-${crypto.randomUUID()}`, name: name.trim(), description: description.trim(), clientIds: [clientId] };
    this.state.relationshipGroups.push(group);
    client.relationshipGroupId = group.id;
    this.logEvent(`Client relationship group created: ${group.name}`, clientId);
    this.notify();
  }

  public setPrimaryContact(clientId: string, contactId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['relationship', 'manager', 'partner', 'admin'], 'set primary client contacts');
    requireClientScope(this.state, clientId);
    const contact = this.state.contacts.find(c => c.id === contactId && c.clientId === clientId);
    if (!contact) throw new GuardError('INVALID_STATE', 'Contact not found in this client.');
    if (!contact.active) throw new GuardError('INVALID_STATE', 'An inactive contact cannot be primary.');
    this.state.contacts.forEach(c => {
      if (c.clientId === clientId) c.isPrimary = c.id === contactId;
    });
    this.notify();
  }

  /** Explicit scoped grants (VP-019). Admin alone never grants professional authority. */
  public grantAccess(userId: string, role: RoleKey, scopeKind: 'Global' | 'Client' | 'Engagement', scopeId?: string, reason = '', dates: { effectiveFrom?: string; expiresAt?: string; requestRef?: string } = {}) {
    requireActiveIdentity(this.state);
    requireGlobalAdmin(this.state, 'grant access');
    const user = this.state.users.find(u => u.id === userId && u.status === 'Active');
    if (!user || user.role !== role) throw new GuardError('INVALID_STATE', 'Grant must target an active persona with its assigned role.');
    const actor = this.state.users.find(u => u.id === this.state.currentUserId)!;
    if ((actor.personId || actor.id) === (user.personId || user.id)) throw new GuardError('FORBIDDEN_SCOPE', 'Administrators cannot grant access to their own person.');
    if (!reason.trim()) throw new GuardError('INVALID_STATE', 'An approved request reason is required.');
    const validDate = (value?: string) => {
      if (!value) return true;
      const parsed = Date.parse(`${value}T00:00:00Z`);
      return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
    };
    if (!validDate(dates.effectiveFrom) || !validDate(dates.expiresAt) || dates.effectiveFrom && dates.expiresAt && dates.expiresAt < dates.effectiveFrom) throw new GuardError('INVALID_STATE', 'Grant effective and expiry dates must be valid, and expiry cannot precede the effective date.');
    if (!dates.requestRef?.trim()) throw new GuardError('INVALID_STATE', 'An approved access-request reference is required.');
    if ((scopeKind === 'Client' || scopeKind === 'Engagement') && !scopeId) {
      throw new GuardError('INVALID_STATE', 'Scoped grants require a scope ID.');
    }
    if (scopeKind === 'Client' && !this.state.clients.some(c => c.id === scopeId)) throw new GuardError('INVALID_STATE', 'Grant client does not exist.');
    if (scopeKind === 'Engagement' && !this.state.engagements.some(e => e.id === scopeId)) throw new GuardError('INVALID_STATE', 'Grant engagement does not exist.');
    if (this.state.roleGrants.some(g => g.userId === userId && g.role === role && g.scopeKind === scopeKind && g.scopeId === scopeId)) {
      throw new GuardError('INVALID_STATE', 'That scope is already granted to this persona.');
    }
    const at = new Date().toISOString();
    this.state.roleGrants.push({ userId, role, scopeKind, scopeId, effectiveFrom: dates.effectiveFrom, expiresAt: dates.expiresAt, requestRef: dates.requestRef.trim(), grantedAt: at, grantedBy: actor.id, reason: reason.trim() });
    this.state.roleGrantHistory ||= [];
    this.state.roleGrantHistory.push({ id: crypto.randomUUID(), action: 'Granted', userId, role, scopeKind, scopeId, actorUserId: actor.id, at, reason: reason.trim(), effectiveFrom: dates.effectiveFrom, expiresAt: dates.expiresAt, requestRef: dates.requestRef.trim() });
    this.logEvent(`Access granted: ${user.name} → ${role} (${scopeKind}${scopeId ? ':' + scopeId : ''}) — ${reason}`, scopeId || user.id);
    this.notify();
  }

  public revokeAccess(userId: string, role: RoleKey, scopeId: string | undefined, reason: string) {
    requireActiveIdentity(this.state);
    requireGlobalAdmin(this.state, 'revoke access');
    const idx = this.state.roleGrants.findIndex(g => g.userId === userId && g.role === role && (g.scopeId || undefined) === (scopeId || undefined));
    if (idx >= 0) {
      if (!reason.trim()) throw new GuardError('INVALID_STATE', 'An access-revocation reason is required.');
      const grant = this.state.roleGrants[idx];
      this.state.roleGrantHistory ||= [];
      this.state.roleGrantHistory.push({ id: crypto.randomUUID(), action: 'Revoked', userId, role, scopeKind: grant.scopeKind, scopeId: grant.scopeId, actorUserId: this.state.currentUserId, at: new Date().toISOString(), reason: reason.trim(), effectiveFrom: grant.effectiveFrom, expiresAt: grant.expiresAt, requestRef: grant.requestRef });
      this.state.roleGrants.splice(idx, 1);
      this.logEvent(`Access revoked: ${this.state.users.find(u => u.id === userId)?.name || userId} → ${role}${scopeId ? ' (' + scopeId + ')' : ''} — ${reason.trim()}`, scopeId || userId);
      this.notify();
    }
  }

  // --- Identity Lifecycle & Simulated Invitations (VP-018) ---
  public createDemoIdentity(identity: { name: string; email: string; role: RoleKey; label: string; group?: 'Commercial' | 'Professional' | 'Client' | 'Operations' }) {
    requireActiveIdentity(this.state);
    requireGlobalAdmin(this.state, 'create demo identities');
    if (!identity.name?.trim() || !identity.email?.trim()) throw new GuardError('INVALID_STATE', 'Identity name and email are required.');
    const normalizedEmail = identity.email.trim().toLowerCase();
    if (this.state.users.some(u => u.email.toLowerCase() === normalizedEmail)) {
      throw new GuardError('INVALID_STATE', `A persona with email "${identity.email}" already exists.`);
    }
    const id = `user-${Date.now().toString(36)}`;
    const initials = identity.name.trim().split(' ').map(n => n[0]).join('').slice(0, 3).toUpperCase();
    const group = identity.group || (identity.role === 'client' ? 'Client' : ['partner', 'manager', 'preparer', 'reviewer', 'eqr'].includes(identity.role) ? 'Professional' : 'Commercial');
    this.state.users.push({
      id,
      name: identity.name.trim(),
      initials,
      role: identity.role,
      label: identity.label || identity.role,
      group,
      email: normalizedEmail,
      status: 'Active'
    });
    this.state.identityStatusHistory ||= [];
    this.state.identityStatusHistory.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      action: 'Created',
      userId: id,
      userName: identity.name.trim(),
      role: identity.role,
      actor: this.state.currentPerson,
      reason: 'Created new simulated practice persona'
    });
    this.logEvent(`New simulated persona created: ${identity.name.trim()} (${identity.role})`, id);
    this.notify();
    return id;
  }

  public setUserStatus(userId: string, status: 'Active' | 'Disabled', reason = '') {
    requireActiveIdentity(this.state);
    requireGlobalAdmin(this.state, 'change identity status');
    const user = this.state.users.find(u => u.id === userId);
    if (!user) throw new GuardError('INVALID_STATE', `Identity "${userId}" not found.`);
    if (user.id === this.state.currentUserId && status === 'Disabled') {
      throw new GuardError('FORBIDDEN_SCOPE', 'Administrators cannot disable their own active session persona.');
    }
    user.status = status;
    this.state.identityStatusHistory ||= [];
    this.state.identityStatusHistory.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      action: status === 'Active' ? 'Activated' : 'Disabled',
      userId: user.id,
      userName: user.name,
      role: user.role,
      actor: this.state.currentPerson,
      reason: reason.trim() || `Identity status changed to ${status}`
    });
    this.logEvent(`Identity status changed: ${user.name} is now ${status}`, user.id);
    this.notify();
  }

  public sendSimulatedInvitation(invitation: { email: string; name: string; role: RoleKey; scopeKind: 'Global' | 'Client' | 'Engagement'; scopeId?: string }) {
    requireActiveIdentity(this.state);
    requireGlobalAdmin(this.state, 'send simulated invitations');
    if (!invitation.email?.trim() || !invitation.name?.trim()) throw new GuardError('INVALID_STATE', 'Recipient email and name are required.');
    const id = `INV-${Date.now().toString(36).toUpperCase()}`;
    const now = new Date();
    const expiry = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    this.state.simulatedInvitations ||= [];
    const record: SimulatedInvitation = {
      id,
      email: invitation.email.trim().toLowerCase(),
      name: invitation.name.trim(),
      role: invitation.role,
      scopeKind: invitation.scopeKind,
      scopeId: invitation.scopeId,
      status: 'Pending',
      invitedAt: now.toISOString(),
      invitedBy: this.state.currentPerson,
      expiresAt: expiry.toISOString()
    };
    this.state.simulatedInvitations.push(record);
    this.state.identityStatusHistory ||= [];
    this.state.identityStatusHistory.push({
      id: crypto.randomUUID(),
      timestamp: now.toISOString(),
      action: 'Invited',
      userId: id,
      userName: record.name,
      role: record.role,
      actor: this.state.currentPerson,
      reason: `Simulated invitation sent for ${record.role} (${record.scopeKind})`
    });
    this.logEvent(`Simulated invitation sent: ${record.name} (${record.email})`, id);
    this.notify();
    return id;
  }

  private recordInvitationExpiry(inv: SimulatedInvitation) {
    if (inv.status !== 'Pending' || Date.parse(inv.expiresAt) > Date.now()) return false;
    inv.status = 'Expired';
    this.state.identityStatusHistory ||= [];
    this.state.identityStatusHistory.push({
      id: crypto.randomUUID(), timestamp: new Date().toISOString(), action: 'InvitationExpired',
      userId: inv.id, userName: inv.name, role: inv.role, actor: this.state.currentPerson,
      reason: 'Simulated invitation passed its expiration time'
    });
    this.logEvent(`Simulated invitation expired: ${inv.name}`, inv.id);
    return true;
  }

  public revokeSimulatedInvitation(invitationId: string, reason: string) {
    requireActiveIdentity(this.state);
    requireGlobalAdmin(this.state, 'revoke simulated invitations');
    if (!reason?.trim()) throw new GuardError('INVALID_STATE', 'Revocation reason is required.');
    this.state.simulatedInvitations ||= [];
    const inv = this.state.simulatedInvitations.find(i => i.id === invitationId);
    if (!inv) throw new GuardError('INVALID_STATE', `Invitation "${invitationId}" not found.`);
    if (this.recordInvitationExpiry(inv)) {
      this.notify();
      throw new GuardError('INVALID_STATE', 'Expired invitations cannot be revoked. Renew it first if the recipient is still required.');
    }
    if (inv.status !== 'Pending') throw new GuardError('INVALID_STATE', 'Only pending invitations can be revoked.');
    inv.status = 'Revoked';
    inv.revokedAt = new Date().toISOString();
    inv.revokedBy = this.state.currentPerson;
    inv.revocationReason = reason.trim();
    this.state.identityStatusHistory ||= [];
    this.state.identityStatusHistory.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      action: 'InvitationRevoked',
      userId: inv.id,
      userName: inv.name,
      role: inv.role,
      actor: this.state.currentPerson,
      reason: reason.trim()
    });
    this.logEvent(`Simulated invitation revoked: ${inv.name} — ${reason.trim()}`, inv.id);
    this.notify();
  }

  public acceptSimulatedInvitation(invitationId: string) {
    requireActiveIdentity(this.state);
    this.state.simulatedInvitations ||= [];
    const inv = this.state.simulatedInvitations.find(i => i.id === invitationId);
    if (!inv) throw new GuardError('INVALID_STATE', `Invitation "${invitationId}" not found.`);
    if (this.recordInvitationExpiry(inv)) {
      this.notify();
      throw new GuardError('INVALID_STATE', 'This simulated invitation has expired. Renew it before acceptance.');
    }
    if (inv.status !== 'Pending') throw new GuardError('INVALID_STATE', 'Only pending invitations can be accepted.');
    inv.status = 'Accepted';
    let user = this.state.users.find(u => u.email.toLowerCase() === inv.email.toLowerCase());
    if (!user) {
      const id = `user-${Date.now().toString(36)}`;
      user = {
        id,
        name: inv.name,
        initials: inv.name.split(' ').map(n => n[0]).join('').slice(0, 3).toUpperCase(),
        role: inv.role,
        label: inv.role,
        group: inv.role === 'client' ? 'Client' : 'Professional',
        email: inv.email,
        status: 'Active'
      };
      this.state.users.push(user);
    } else {
      user.status = 'Active';
    }
    this.state.identityStatusHistory ||= [];
    this.state.identityStatusHistory.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      action: 'InvitationAccepted',
      userId: user.id,
      userName: user.name,
      role: user.role,
      actor: user.name,
      reason: 'Candidate completed simulated onboarding'
    });
    this.logEvent(`Simulated invitation accepted: ${user.name} onboarded as ${user.role}`, user.id);
    this.notify();
  }

  public resendSimulatedInvitation(invitationId: string) {
    requireActiveIdentity(this.state);
    requireGlobalAdmin(this.state, 'resend simulated invitations');
    this.state.simulatedInvitations ||= [];
    const inv = this.state.simulatedInvitations.find(i => i.id === invitationId);
    if (!inv) throw new GuardError('INVALID_STATE', `Invitation "${invitationId}" not found.`);
    this.recordInvitationExpiry(inv);
    const now = new Date();
    inv.status = 'Pending';
    inv.invitedAt = now.toISOString();
    inv.expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    inv.revokedAt = undefined;
    inv.revokedBy = undefined;
    inv.revocationReason = undefined;
    this.state.identityStatusHistory ||= [];
    this.state.identityStatusHistory.push({
      id: crypto.randomUUID(),
      timestamp: now.toISOString(),
      action: 'InvitationResent',
      userId: inv.id,
      userName: inv.name,
      role: inv.role,
      actor: this.state.currentPerson,
      reason: 'Invitation renewed with fresh 7-day expiration'
    });
    this.logEvent(`Simulated invitation resent to ${inv.name}`, inv.id);
    this.notify();
  }


  // --- Leads & Pipeline Actions (VP-009) ---
  public addLead(lead: PrototypeState['leads'][0]) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['relationship', 'manager', 'partner'], 'manage opportunities');
    if (!lead.name.trim() || !lead.contact.trim() || !lead.service.trim() || !lead.owner.trim()) throw new GuardError('INVALID_STATE', 'Opportunity name, contact, requested service, and owner are required.');
    if (!isValidMoney(lead.value, true)) throw new GuardError('INVALID_STATE', 'Opportunity amount must be a finite non-negative amount with at most two decimal places.');
    if (lead.targetDate && (!/^\d{4}-\d{2}-\d{2}$/.test(lead.targetDate) || !Number.isFinite(Date.parse(lead.targetDate)) || new Date(`${lead.targetDate}T00:00:00Z`).toISOString().slice(0, 10) !== lead.targetDate)) throw new GuardError('INVALID_STATE', 'Opportunity target date must be a real calendar date.');
    if (['Lost', 'Unqualified'].includes(lead.stage) && !lead.lostReason?.trim()) throw new GuardError('INVALID_STATE', 'A lost or unqualified opportunity requires an outcome reason.');
    if (this.state.leads.some(item => item.id === lead.id)) throw new GuardError('INVALID_STATE', `Opportunity "${lead.id}" already exists.`);
    lead.history ||= [{ by: this.state.currentPerson, at: new Date().toISOString(), stage: lead.stage }];
    this.state.leads.push(lead);
    this.logEvent(`New opportunity registered: ${lead.name}`, lead.id);
    this.notify();
  }

  public updateLead(lead: PrototypeState['leads'][0]) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['relationship', 'manager', 'partner'], 'manage opportunities');
    const index = this.state.leads.findIndex(l => l.id === lead.id);
    if (index >= 0) {
      if (this.state.leads[index].convertedClientId) throw new GuardError('INVALID_STATE', 'A converted opportunity cannot be converted or reclassified again.');
      if (!lead.name.trim() || !lead.contact.trim() || !lead.service.trim() || !lead.owner.trim() || !isValidMoney(lead.value, true)) throw new GuardError('INVALID_STATE', 'Opportunity name, contact, requested service, owner and a valid non-negative fee are required.');
      if (lead.targetDate && (!/^\d{4}-\d{2}-\d{2}$/.test(lead.targetDate) || !Number.isFinite(Date.parse(lead.targetDate)) || new Date(`${lead.targetDate}T00:00:00Z`).toISOString().slice(0, 10) !== lead.targetDate)) throw new GuardError('INVALID_STATE', 'Opportunity target date must be a real calendar date.');
      if (['Lost', 'Unqualified'].includes(lead.stage) && !lead.lostReason?.trim()) throw new GuardError('INVALID_STATE', 'A lost or unqualified opportunity requires an outcome reason.');
      if (lead.stage !== this.state.leads[index].stage) lead.history = [...(this.state.leads[index].history || []), { by: this.state.currentPerson, at: new Date().toISOString(), stage: lead.stage, reason: ['Lost', 'Unqualified'].includes(lead.stage) ? lead.lostReason?.trim() : undefined }];
      this.state.leads[index] = lead;
      this.logEvent(`Opportunity ${lead.id} moved to ${lead.stage}${['Lost', 'Unqualified'].includes(lead.stage) ? `: ${lead.lostReason}` : ''}`, lead.id);
      this.notify();
    }
  }

  public convertLead(leadId: string, clientId?: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['relationship', 'manager', 'partner'], 'convert opportunities');
    const lead = this.state.leads.find(l => l.id === leadId);
    if (!lead) throw new GuardError('INVALID_STATE', `Opportunity "${leadId}" was not found.`);
    if (lead.convertedClientId) return this.state.clients.find(c => c.id === lead.convertedClientId);
    if (lead.stage !== 'Won') throw new GuardError('INVALID_STATE', 'Only a won opportunity can be converted to a prospect.');
    lead.stage = 'Won';
    lead.accepted = false;

    // Check or create client
    let client = this.state.clients.find(c => c.id === clientId);
    if (clientId && !client) throw new GuardError('INVALID_STATE', `Client "${clientId}" was not found.`);
    if (client) requireClientScope(this.state, client.id);
    if (!client) {
      const newClientId = `CL-00${this.state.clients.length + 1}`;
      let code = lead.name.slice(0, 4).toUpperCase() || 'NEW';
      let suffix = 1;
      while (this.state.clients.some(c => c.code.toUpperCase() === code)) code = `${lead.name.slice(0, 3).toUpperCase()}${suffix++}`;
      client = {
        id: newClientId,
        code,
        name: lead.name,
        initials: lead.name.slice(0, 2).toUpperCase(),
        industry: 'Commercial Client',
        contact: lead.contact,
        email: lead.email,
        jurisdiction: 'State of Qatar',
        status: 'Prospect',
        risk: 'Low',
        revenue: lead.value,
        relationshipOwner: lead.owner
      };
      this.state.clients.push(client);
    }
    lead.convertedClientId = client.id;
    this.logEvent(`Opportunity ${lead.name} converted to client ${client.name}`, client.id);
    this.notify();
    return client;
  }

  // --- Proposal Actions (VP-010, VP-011) ---
  public addProposal(prop: PrototypeState['proposals'][0]) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['relationship', 'manager', 'partner'], 'draft proposals');
    if (prop.clientId) requireClientScope(this.state, prop.clientId);
    if (prop.leadId && !this.state.leads.some(l => l.id === prop.leadId)) throw new GuardError('INVALID_STATE', 'Proposal opportunity was not found.');
    if (prop.leadId && prop.clientId && this.state.leads.find(l => l.id === prop.leadId)?.convertedClientId !== prop.clientId) throw new GuardError('INVALID_STATE', 'Proposal opportunity and client do not match.');
    if (this.state.proposals.some(p => p.id === prop.id)) throw new GuardError('INVALID_STATE', `Proposal "${prop.id}" already exists.`);
    if (!prop.title.trim() || !prop.items.length || !prop.items.every(item => item.serviceName.trim() && item.scope.trim() && item.description.trim() && item.deliverables.trim() && isValidMoney(item.amount, true)) || !prop.terms.trim() || !isValidMoney(prop.totalAmount, true) || Math.abs(prop.items.reduce((sum, item) => sum + item.amount, 0) - prop.totalAmount) > 0.005) throw new GuardError('INVALID_STATE', 'Proposal requires a title, complete scope, deliverables, terms, and a total equal to its valid line items.');
    this.state.proposals.push(prop);
    this.logEvent(`Proposal ${prop.title} drafted (Rev ${prop.revision})`, prop.id);
    this.notify();
  }

  public updateProposal(prop: PrototypeState['proposals'][0]) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['relationship', 'manager', 'partner'], 'edit proposal drafts');
    const index = this.state.proposals.findIndex(item => item.id === prop.id);
    if (index < 0 || this.state.proposals[index].state !== 'Draft') throw new GuardError('INVALID_STATE', 'Only an existing draft proposal can be edited.');
    if (!prop.items.length || !prop.items.every(item => item.scope.trim() && item.deliverables.trim() && isValidMoney(item.amount, true)) || !prop.terms.trim() || Math.abs(prop.items.reduce((sum, item) => sum + item.amount, 0) - prop.totalAmount) > 0.005) throw new GuardError('INVALID_STATE', 'Proposal scope, deliverables, terms, and line item total are required.');
    this.state.proposals[index] = prop;
    this.logEvent(`Proposal ${prop.id} draft updated`, prop.id);
    this.notify();
  }

  public presentProposal(propId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['relationship', 'manager', 'partner'], 'present proposals');
    const prop = this.state.proposals.find(p => p.id === propId);
    if (!prop) throw new GuardError('INVALID_STATE', `Proposal "${propId}" was not found.`);
    if (prop.state !== 'Approved to send' || !prop.commercialReview?.approved) throw new GuardError('INVALID_STATE', 'Only an approved proposal can be presented.');
    if (prop.clientId) requireClientScope(this.state, prop.clientId);
    prop.presentedSnapshot = { revision: prop.revision, title: prop.title, currency: prop.currency, totalAmount: prop.totalAmount, items: structuredClone(prop.items), terms: prop.terms, presentedBy: this.state.currentPerson, presentedAt: new Date().toISOString() };
    prop.state = 'Presented';
    this.logEvent(`Proposal ${prop.id} Rev ${prop.revision} presented`, prop.id);
    this.notify();
  }

  public createProposalRevision(propId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['relationship', 'manager', 'partner'], 'revise proposals');
    const source = this.state.proposals.find(p => p.id === propId);
    if (!source) throw new GuardError('INVALID_STATE', `Proposal "${propId}" was not found.`);
    if (source.state === 'Accepted' || source.state === 'Superseded') throw new GuardError('INVALID_STATE', 'Accepted or superseded proposals cannot be revised.');
    if (source.clientId) requireClientScope(this.state, source.clientId);
    source.state = 'Superseded';
    const revision = { ...structuredClone(source), id: `${source.id}-R${source.revision + 1}`, revision: source.revision + 1, predecessorId: source.id, preparedBy: this.state.currentPerson, preparedAt: new Date().toISOString().slice(0, 10), state: 'Draft' as const, commercialReview: undefined, clientResponse: undefined, presentedSnapshot: undefined };
    this.state.proposals.push(revision);
    this.logEvent(`Proposal ${source.id} revised as ${revision.id}`, revision.id);
    this.notify();
    return revision;
  }

  public reviewProposal(propId: string, approved: boolean, notes?: string) {
    requireActiveIdentity(this.state);
    if (!['partner', 'manager'].includes(this.state.currentRole)) {
      throw new GuardError('FORBIDDEN_SCOPE', `Role "${this.state.currentRole}" is not authorized to commercially review proposals. Requires partner or manager.`);
    }
    const prop = this.state.proposals.find(p => p.id === propId);
    if (!prop) throw new GuardError('INVALID_STATE', `Proposal "${propId}" was not found.`);
    if (prop.clientId) requireClientScope(this.state, prop.clientId);
    // Same-person commercial approval denied even under another role label (VP-011).
    requireIndependentActor(prop.preparedBy, this.state.currentPerson, 'commercially approve this proposal', this.state);
    if (prop.state !== 'Draft' && prop.state !== 'Internal review') throw new GuardError('INVALID_STATE', 'Only an unpresented proposal revision can be reviewed.');
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
    requireActiveIdentity(this.state);
    requireRole(this.state, ['client'], 'record client proposal acceptance');
    const prop = this.state.proposals.find(p => p.id === propId);
    if (!prop || !response) throw new GuardError('INVALID_STATE', 'Proposal or client response was not found.');
    if (!prop.clientId) throw new GuardError('INVALID_STATE', 'Proposal must be linked to a client before recording a response.');
    requireClientScope(this.state, prop.clientId);
    if (prop.state !== 'Presented' || !prop.commercialReview?.approved) throw new GuardError('INVALID_STATE', 'Only an approved, presented proposal can receive a client response.');
    if (!prop.presentedSnapshot || prop.presentedSnapshot.revision !== prop.revision || !response.contact.trim() || !response.evidenceRef?.trim() || !response.notes.trim()) throw new GuardError('INVALID_STATE', 'Response requires the current presented revision, an authorized contact, notes, and an evidence reference.');
    prop.clientResponse = response;
    prop.state = response.responseType;
    this.logEvent(`Proposal ${prop.id} client response: ${response.responseType} by ${response.contact}`, prop.id);
    this.notify();
  }

  // --- Engagement Actions (VP-012) ---
  public addEngagement(eng: EngagementRecord) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'create engagements');
    requireClientScope(this.state, eng.client);
    if (!this.state.clients.some(c => c.id === eng.client)) throw new GuardError('INVALID_STATE', 'Engagement client was not found.');
    if (eng.proposalId) {
      const proposal = this.state.proposals.find(p => p.id === eng.proposalId);
      if (!proposal || proposal.clientId !== eng.client || proposal.state !== 'Accepted' || !proposal.clientResponse?.evidenceRef || proposal.presentedSnapshot?.revision !== proposal.revision) throw new GuardError('INVALID_STATE', 'Engagement must link to the same client’s accepted current proposal revision with evidence.');
      const existing = this.state.engagements.find(e => e.proposalId === eng.proposalId);
      if (existing) { requireClientScope(this.state, existing.client); return existing; }
      if (!['Draft', 'Acceptance'].includes(eng.stage) && (!eng.acceptance || !eng.terms)) throw new GuardError('INVALID_STATE', 'Engagement activation requires a separate professional acceptance and agreed terms.');
    } else if (!eng.acceptance || !eng.terms) {
      throw new GuardError('INVALID_STATE', 'Engagements without an accepted proposal require recorded acceptance and terms.');
    }
    if (this.state.engagements.some(e => e.id === eng.id)) throw new GuardError('INVALID_STATE', `Engagement "${eng.id}" already exists.`);
    this.assignAccountingPeriod(eng);
    this.state.engagements.push(eng);
    this.state.selectedEngagement = eng.id;
    this.logEvent(`New engagement created: ${eng.service} FY${eng.year}`, eng.id);
    this.notify();
    return eng;
  }

  public activateEngagement(engagementId: string, evidenceRef: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['partner'], 'professionally accept engagements');
    const eng = this.state.engagements.find(item => item.id === engagementId);
    if (!eng) throw new GuardError('INVALID_STATE', `Engagement "${engagementId}" was not found.`);
    requireEngagementScope(this.state, eng.id, 'activation');
    if (!['Draft', 'Acceptance'].includes(eng.stage)) throw new GuardError('INVALID_STATE', 'Only a draft engagement can be activated.');
    const proposal = this.state.proposals.find(item => item.id === eng.proposalId);
    if (!proposal || proposal.state !== 'Accepted' || !proposal.clientResponse?.evidenceRef || proposal.presentedSnapshot?.revision !== proposal.revision) throw new GuardError('INVALID_STATE', 'Activation requires the current accepted proposal revision and client evidence.');
    if (eng.professionalAcceptance) throw new GuardError('INVALID_STATE', 'This engagement has already been professionally accepted.');
    if (!evidenceRef.trim()) throw new GuardError('INVALID_STATE', 'Professional acceptance requires an evidence reference.');
    requireIndependentActor(proposal.preparedBy, this.state.currentPerson, 'professionally accept this engagement', this.state);
    eng.professionalAcceptance = { by: this.state.currentPerson, at: new Date().toISOString(), evidenceRef: evidenceRef.trim(), proposalRevision: proposal.revision };
    eng.acceptance = true;
    eng.terms = true;
    eng.stage = 'Planning';
    this.logEvent(`Engagement ${eng.id} professionally accepted against ${proposal.id} Rev ${proposal.revision}`, eng.id);
    this.notify();
  }

  public updateEngagement(eng: EngagementRecord) {
    requireActiveIdentity(this.state);
    const index = this.state.engagements.findIndex(e => e.id === eng.id);
    if (index < 0) throw new GuardError('INVALID_STATE', `Engagement "${eng.id}" was not found.`);
    requireRole(this.state, ['manager', 'partner'], 'edit engagement administration fields');
    requireEngagementScope(this.state, eng.id, 'administrative');
    const current = this.state.engagements[index];
    if (['Cancelled', 'Closed'].includes(current.lifecycleStatus || 'Active')) throw new GuardError('INVALID_STATE', 'Cancelled or closed engagements are immutable.');
    if (eng.client !== current.client) throw new GuardError('INVALID_STATE', 'An engagement cannot be reassigned to another client.');
    if (!this.state.users.some(u => u.status === 'Active' && u.role === 'manager' && u.name === eng.manager) || !this.state.users.some(u => u.status === 'Active' && u.role === 'partner' && u.name === eng.partner)) throw new GuardError('INVALID_STATE', 'Engagement manager and partner must be active assigned personas.');
    const scopeChanged = current.service !== eng.service || current.year !== eng.year || current.period !== eng.period;
    if (!eng.service.trim() || !eng.period.trim() || !Number.isInteger(eng.year) || eng.year < 1900 || eng.year > 2100 || !/^\d{4}$/.test(String(eng.year))) throw new GuardError('INVALID_STATE', 'Engagement service, reporting period and a valid reporting year are required.');
    const updated = { ...current, service: eng.service.trim(), year: eng.year, period: eng.period.trim(), stage: eng.stage, due: eng.due, manager: eng.manager, partner: eng.partner, team: [...eng.team], opinion: eng.opinion };
    if (new Set(updated.team).size !== updated.team.length || updated.team.some(name => !this.state.users.some(user => user.status === 'Active' && user.group === 'Professional' && user.name === name)) || !updated.team.includes(updated.manager) || !updated.team.includes(updated.partner)) throw new GuardError('INVALID_STATE', 'The engagement team must contain unique active professional personas, including its manager and partner.');
    for (const name of updated.team) {
      const user = this.state.users.find(item => item.status === 'Active' && item.group === 'Professional' && item.name === name)!;
      const visible = visibleEngagementIds(this.state, user.id);
      if (visible !== 'ALL' && !visible.includes(eng.id)) throw new GuardError('FORBIDDEN_SCOPE', `${name} does not have an active grant to engagement ${eng.id}.`);
    }
    if (JSON.stringify(updated) !== JSON.stringify(current)) {
      const changed = (['service', 'year', 'period', 'stage', 'due', 'manager', 'partner', 'team', 'opinion'] as const).filter(key => JSON.stringify(current[key]) !== JSON.stringify(updated[key]));
      if (scopeChanged) {
        updated.planning = false;
        updated.sourceAccepted = false;
        updated.mappingApproved = false;
        for (const revision of this.state.statementSetRevisions || []) if (revision.engagementId === eng.id || revision.comparativeEngagementId === eng.id) revision.status = 'Stale';
        for (const program of this.state.auditPrograms) if (program.engagementId === eng.id || (!program.engagementId && eng.id === this.state.engagements[0]?.id)) for (const procedure of program.procedures) {
          if (procedure.status === 'Not started' && !procedure.workPerformed && !procedure.conclusion) continue;
          procedure.scopeReassessmentHistory ||= [];
          procedure.scopeReassessmentHistory.push({ reason: 'Engagement service or reporting period changed', previousStatus: procedure.status, reviewedByUserId: procedure.reviewedByUserId, reviewedAt: procedure.reviewedAt, invalidatedAt: new Date().toISOString() });
          procedure.scopeReassessmentRequired = true;
          procedure.scopeReassessmentReason = 'Service or period changed';
          if (procedure.status === 'Cleared' || procedure.status === 'Submitted') procedure.status = 'In progress';
          procedure.reviewedByUserId = undefined;
          procedure.reviewedAt = undefined;
        }
      }
      updated.events = [...(current.events || []), { text: `Engagement administration changed by ${this.state.currentPerson}: ${changed.join(', ')}`, ref: eng.id, time: new Date().toISOString(), type: 'history' }];
      this.state.engagements[index] = updated;
      this.invalidateReleaseBasis(updated);
      this.logEvent(`Engagement ${eng.id} changed (${changed.join(', ')}); release approvals reset`, eng.id, 'history');
      this.notify();
    }
  }

  public setEngagementLifecycle(engagementId: string, status: NonNullable<EngagementRecord['lifecycleStatus']>, reason: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'change engagement lifecycle');
    requireEngagementScope(this.state, engagementId, 'administrative');
    const engagement = this.state.engagements.find(item => item.id === engagementId);
    if (!engagement) throw new GuardError('INVALID_STATE', `Engagement "${engagementId}" was not found.`);
    if (!reason.trim()) throw new GuardError('INVALID_STATE', 'An engagement lifecycle decision requires a reason.');
    const current = engagement.lifecycleStatus || 'Active';
    const valid = current === 'Active'
      ? ['Suspended', 'Cancelled', 'Closed'].includes(status)
      : current === 'Suspended'
        ? ['Active', 'Cancelled', 'Closed'].includes(status)
        : false;
    if (!valid) throw new GuardError('INVALID_STATE', `${current} engagement cannot transition to ${status}.`);
    if (status === 'Active' && ['Draft', 'Acceptance'].includes(engagement.stage) && engagement.proposalId && !engagement.professionalAcceptance) throw new GuardError('INVALID_STATE', 'Cannot resume an engagement without current professional acceptance.');
    engagement.lifecycleStatus = status;
    engagement.events ||= [];
    engagement.events.push({ text: `${current} → ${status} by ${this.state.currentPerson}: ${reason.trim()}`, ref: engagement.id, time: new Date().toISOString(), type: 'lifecycle' });
    this.invalidateReleaseBasis(engagement);
    this.logEvent(`Engagement ${engagement.id} ${status.toLowerCase()}: ${reason.trim()}`, engagement.id, 'history');
    this.notify();
  }

  // --- Jobs & Tasks (VP-013, VP-014, VP-015) ---
  public addJob(job: JobRecord) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'create jobs');
    requireEngagementScope(this.state, job.engagementId);
    const eng = this.state.engagements.find(e => e.id === job.engagementId);
    if (!eng || eng.client !== job.clientId) throw new GuardError('INVALID_STATE', 'Job client and engagement must match.');
    if (!job.title.trim() || !job.owner.trim() || !job.dueDate) throw new GuardError('INVALID_STATE', 'Job title, owner, and due date are required.');
    if (this.state.jobs.some(j => j.id === job.id)) throw new GuardError('INVALID_STATE', `Job "${job.id}" already exists.`);
    this.state.jobs.push(job);
    this.logEvent(`New job scheduled: ${job.title}`, job.id);
    this.notify();
  }

  public updateJob(job: JobRecord) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'update jobs');
    const index = this.state.jobs.findIndex(j => j.id === job.id);
    if (index >= 0) {
      requireEngagementScope(this.state, job.engagementId);
      if (job.clientId !== this.state.jobs[index].clientId || job.engagementId !== this.state.jobs[index].engagementId) throw new GuardError('INVALID_STATE', 'A job cannot be moved to a different client or engagement.');
      const children = this.state.jobTasks.filter(t => t.jobId === job.id && t.status !== 'Cancelled');
      if (job.status === 'Completed' && children.some(t => t.status !== 'Completed')) throw new GuardError('INVALID_STATE', 'Job cannot complete while required tasks are unfinished.');
      if (job.status === 'Blocked' && !job.blockedReason?.trim()) throw new GuardError('INVALID_STATE', 'Blocked status requires a reason.');
      this.state.jobs[index] = job;
      this.notify();
    }
  }

  public addTask(task: JobTaskItem) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer', 'partner'], 'create tasks');
    const job = this.state.jobs.find(j => j.id === task.jobId);
    if (!job) throw new GuardError('INVALID_STATE', `Referenced job "${task.jobId}" does not exist.`);
    requireEngagementScope(this.state, job.engagementId);
    this.assertTaskHierarchy(task);
    this.state.jobTasks.push(task);
    this.notify();
  }

  public updateTask(task: JobTaskItem) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer', 'partner'], 'update tasks');
    const job = this.state.jobs.find(j => j.id === task.jobId);
    if (!job) throw new GuardError('INVALID_STATE', `Referenced job "${task.jobId}" does not exist.`);
    requireEngagementScope(this.state, job.engagementId);
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
    const job = this.state.jobs.find(j => j.id === task.jobId);
    if (!job) {
      throw new GuardError('INVALID_STATE', `Referenced job "${task.jobId}" does not exist.`);
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
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'reassign tasks');
    const task = this.state.jobTasks.find(t => t.id === taskId);
    if (!task) throw new GuardError('INVALID_STATE', `Task "${taskId}" was not found.`);
    const job = this.state.jobs.find(j => j.id === task.jobId);
    if (!job) throw new GuardError('INVALID_STATE', 'Task job was not found.');
    requireEngagementScope(this.state, job.engagementId);
    if (!reason.trim()) throw new GuardError('INVALID_STATE', 'Task reassignment requires a reason.');
    if (!this.state.users.some(u => u.status === 'Active' && u.name === newAssignee)) throw new GuardError('INVALID_STATE', 'Task assignee must be an active persona.');
    if (task.assignee === newAssignee) throw new GuardError('INVALID_STATE', 'Choose a different assignee.');
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
    requireRole(this.state, ['manager', 'partner'], 'create job templates');
    if (!template.name || !template.name.trim()) throw new GuardError('INVALID_STATE', 'Template name is required.');
    if (this.state.jobTemplates.some(t => t.id === template.id)) throw new GuardError('INVALID_STATE', 'Job template ID must be unique.');
    this.state.jobTemplates.push(template);
    this.logEvent(`Job template created: ${template.name}`, template.id);
    this.notify();
  }

  public createJobTemplateRevision(sourceId: string, edits: Pick<JobTemplateItem, 'name' | 'service' | 'description' | 'defaultJobTitle' | 'tasks'>) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'revise job templates');
    const source = this.state.jobTemplates.find(template => template.id === sourceId);
    if (!source || source.status !== 'Published') throw new GuardError('INVALID_STATE', 'Only a published template can be revised.');
    if (!edits.name.trim() || !edits.defaultJobTitle.trim() || edits.tasks.length === 0 || edits.tasks.some(task => !task.title.trim() || (task.subtasks || []).some(subtask => !subtask.trim()))) throw new GuardError('INVALID_STATE', 'A revision requires a name, default job title, and titled phases/subtasks.');
    const rootTemplateId = source.rootTemplateId || source.id;
    const revision = Math.max(...this.state.jobTemplates.filter(template => (template.rootTemplateId || template.id) === rootTemplateId).map(template => template.revision)) + 1;
    const next: JobTemplateItem = { ...edits, id: `${rootTemplateId}-R${revision}`, status: 'Draft', revision, revisionOfId: source.id, rootTemplateId, tasks: structuredClone(edits.tasks) };
    if (this.state.jobTemplates.some(template => template.id === next.id)) throw new GuardError('INVALID_STATE', 'That template revision already exists.');
    this.state.jobTemplates.push(next);
    this.logEvent(`Job template revision ${revision} drafted from ${source.id}: ${next.name}`, next.id);
    this.notify();
    return next;
  }

  public publishJobTemplate(templateId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'publish job templates');
    const tpl = this.state.jobTemplates.find(t => t.id === templateId);
    if (!tpl) throw new GuardError('INVALID_STATE', 'Template not found.');
    tpl.status = 'Published';
    this.logEvent(`Job template published: ${tpl.name}`, tpl.id);
    this.notify();
  }

  public retireJobTemplate(templateId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'retire job templates');
    const tpl = this.state.jobTemplates.find(t => t.id === templateId);
    if (!tpl) throw new GuardError('INVALID_STATE', 'Template not found.');
    tpl.status = 'Retired';
    this.logEvent(`Job template retired: ${tpl.name}`, tpl.id);
    this.notify();
  }

  public applyJobTemplate(templateId: string, engagementId: string, jobTitle: string, dueDate: string, owner: string, operationId?: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'apply job templates');
    requireEngagementScope(this.state, engagementId);
    const tpl = this.state.jobTemplates.find(t => t.id === templateId);
    if (!tpl) throw new GuardError('INVALID_STATE', 'Template was not found.');
    if (operationId) {
      const prior = this.state.jobs.find(job => job.templateOperationId === operationId);
      if (prior) {
        if (prior.fromTemplateId !== templateId || prior.engagementId !== engagementId || prior.title !== jobTitle || prior.dueDate !== dueDate || prior.owner !== owner) throw new GuardError('INVALID_STATE', 'Template operation ID was already used for different job details.');
        return prior;
      }
    }
    if (tpl.status !== 'Published') {
      throw new GuardError('INVALID_STATE', 'Only Published templates can be applied to create jobs (VP-015).');
    }
    const eng = this.state.engagements.find(e => e.id === engagementId);
    if (!eng) throw new GuardError('INVALID_STATE', `Engagement "${engagementId}" was not found.`);
    if (!jobTitle.trim() || !dueDate || !this.state.users.some(u => u.status === 'Active' && u.name === owner)) throw new GuardError('INVALID_STATE', 'A job title, due date, and active owner are required.');
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
      fromTemplateRevision: tpl.revision,
      ...(operationId ? { templateOperationId: operationId } : {}),
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
    requireActiveIdentity(this.state);
    if (comment.subjectType === 'client') requireClientScope(this.state, comment.subjectId);
    else if (comment.subjectType === 'engagement') requireEngagementScope(this.state, comment.subjectId);
    else {
      const task = comment.subjectType === 'task' ? this.state.jobTasks.find(t => t.id === comment.subjectId) : undefined;
      const job = comment.subjectType === 'job' ? this.state.jobs.find(j => j.id === comment.subjectId) : task ? this.state.jobs.find(j => j.id === task.jobId) : undefined;
      if (!job) throw new GuardError('INVALID_STATE', 'Comment subject was not found.');
      requireEngagementScope(this.state, job.engagementId);
    }
    if (!comment.text.trim() || comment.text.length > 5000) throw new GuardError('INVALID_STATE', 'Comment text is required and must be 5,000 characters or fewer.');
    if (comment.subjectType !== 'client' && comment.visibility !== 'internal') throw new GuardError('INVALID_STATE', 'Job, task and engagement comments must remain internal.');
    if (this.state.comments.some(item => item.id === comment.id)) throw new GuardError('INVALID_STATE', `Comment "${comment.id}" already exists.`);
    if (comment.subjectType === 'job' || comment.subjectType === 'task') {
      const task = comment.subjectType === 'task' ? this.state.jobTasks.find(item => item.id === comment.subjectId) : undefined;
      const job = comment.subjectType === 'job' ? this.state.jobs.find(item => item.id === comment.subjectId) : this.state.jobs.find(item => item.id === task?.jobId);
      const eligibleIds = this.state.users.filter(user => {
        const visible = visibleEngagementIds(this.state, user.id);
        return user.status === 'Active' && !isClientRole(user.role) && canOpenRoute(user.role, 'jobs') && (visible === 'ALL' || visible.includes(job!.engagementId));
      }).map(user => user.id);
      if ((comment.mentions || []).some(id => !eligibleIds.includes(id))) throw new GuardError('FORBIDDEN_SCOPE', 'Mention recipients must be active users who can access this job.');
    }
    this.state.comments.push(comment);
    (comment.mentions || []).forEach(id => this.logEvent(`Local mention for ${this.state.users.find(user => user.id === id)?.name} on ${comment.subjectType} ${comment.subjectId}`, comment.id));
    this.notify();
  }

  public editComment(id: string, text: string) {
    requireActiveIdentity(this.state);
    const comment = this.state.comments.find(item => item.id === id);
    if (!comment) throw new GuardError('INVALID_STATE', 'Comment was not found.');
    if (comment.author !== this.state.currentPerson) throw new GuardError('FORBIDDEN_SCOPE', 'Only the comment author can edit this note.');
    if (!text.trim() || text.length > 5000) throw new GuardError('INVALID_STATE', 'Comment text is required and must be 5,000 characters or fewer.');
    comment.text = text.trim();
    comment.edited = true;
    comment.editedAt = new Date().toISOString();
    comment.editedBy = this.state.currentPerson;
    this.notify();
  }

  // --- Document Management & SharePoint (VP-020, VP-021) ---
  public addDocument(doc: DocumentItem) {
    requireActiveIdentity(this.state);
    requireClientScope(this.state, doc.clientId);
    if (doc.engagementId) {
      requireEngagementScope(this.state, doc.engagementId);
      if (this.state.engagements.find(e => e.id === doc.engagementId)?.client !== doc.clientId) throw new GuardError('INVALID_STATE', 'Document client and engagement must match.');
    }
    if (!doc.name.trim() || !Number.isFinite(doc.size) || doc.size < 0 || this.state.documents.some(d => d.id === doc.id)) throw new GuardError('INVALID_STATE', 'Document metadata is invalid or duplicated.');
    this.state.documents.push(doc);
    this.logEvent(`Document registered in library: ${doc.name} (v${doc.version})`, doc.id);
    this.notify();
  }

  public replaceDocumentRevision(documentId: string, file: { name: string; size: number; sha256: string }): DocumentItem {
    requireActiveIdentity(this.state);
    const previous = this.state.documents.find(doc => doc.id === documentId);
    if (!previous) throw new GuardError('INVALID_STATE', 'Document to replace was not found.');
    requireClientScope(this.state, previous.clientId);
    if (previous.engagementId) requireEngagementScope(this.state, previous.engagementId);
    if (!file.name.trim() || !Number.isFinite(file.size) || file.size < 0 || !/^[a-f0-9]{64}$/i.test(file.sha256)) throw new GuardError('INVALID_STATE', 'Replacement requires a file name, valid size and SHA-256 digest.');
    if (this.state.documents.some(doc => doc.supersedesDocumentId === previous.id)) throw new GuardError('STALE_REVISION', 'This document already has a replacement. Select its current revision.');
    const revision: DocumentItem = {
      ...previous,
      id: `DOC-${crypto.randomUUID()}`,
      name: file.name,
      version: previous.version + 1,
      size: file.size,
      sha: file.sha256,
      source: 'Local In-Session',
      uploadedBy: this.state.currentPerson,
      uploadedAt: new Date().toISOString(),
      supersedesDocumentId: previous.id,
      spSiteId: undefined,
      spDriveId: undefined,
      spItemId: undefined,
      brokenLink: undefined
    };
    this.state.documents.push(revision);
    const affectedEngagementIds = new Set<string>();
    const replacementEvidence = this.state.evidenceCatalogue.filter(item => item.documentId === previous.id).map(item => ({
      ...structuredClone(item),
      id: `EVD-${crypto.randomUUID()}`,
      documentId: revision.id,
      version: revision.version,
      sha: file.sha256,
      adequacyStatus: 'Pending verification' as const,
      receivedDate: this.state.asOfDate,
      owner: this.state.currentPerson,
      linkedProcedures: [],
      linkedProcedureHistory: []
    }));
    for (const item of this.state.evidenceCatalogue.filter(evidence => evidence.documentId === previous.id)) {
      for (const procedureId of item.linkedProcedures) {
        for (const program of this.state.auditPrograms) {
          const procedure = program.procedures.find(candidate => candidate.id === procedureId);
          if (!procedure) continue;
          const engagementId = procedure.engagementId || program.engagementId || previous.engagementId;
          const engagement = this.state.engagements.find(candidate => candidate.id === engagementId);
          if (!engagement) continue;
          procedure.evidenceReassessmentHistory ||= [];
          procedure.evidenceReassessmentHistory.push({ documentId: previous.id, version: previous.version, previousStatus: procedure.status, reviewedByUserId: procedure.reviewedByUserId, reviewedAt: procedure.reviewedAt, invalidatedAt: new Date().toISOString() });
          procedure.evidenceReassessmentRequired = true;
          if (procedure.status === 'Cleared') procedure.status = 'In progress';
          procedure.reviewedByUserId = undefined;
          procedure.reviewedAt = undefined;
          affectedEngagementIds.add(engagement.id);
        }
      }
    }
    this.state.evidenceCatalogue.push(...replacementEvidence);
    for (const engagement of this.state.engagements) {
      if (previous.engagementId && engagement.id !== previous.engagementId) continue;
      if (engagement.client !== previous.clientId) continue;
      for (const rec of engagement.reconciliations || []) {
        const scheduleEvidence = (rec.evidence || '').split(/[\s,;]+/).includes(previous.id);
        if (scheduleEvidence || (rec.items || []).some(item => item.evidenceDoc === previous.id)) {
          this.staleReconciliation(rec);
          affectedEngagementIds.add(engagement.id);
        }
      }
      for (const workpaper of engagement.workpapers) {
        if (!workpaper.evidenceRefs?.includes(previous.id)) continue;
        if (workpaper.clearance) workpaper.clearanceHistory.push({ ...workpaper.clearance });
        workpaper.clearance = null;
        workpaper.status = 'Changes required';
        workpaper.version += 1;
        affectedEngagementIds.add(engagement.id);
      }
    }
    for (const engagementId of affectedEngagementIds) {
      const engagement = this.state.engagements.find(candidate => candidate.id === engagementId);
      if (engagement) this.invalidateReleaseBasis(engagement);
    }
    this.logEvent(`Document ${previous.name} superseded by ${revision.name} (v${revision.version}); prior revision retained`, revision.id);
    this.notify();
    return revision;
  }

  public updateDocumentReference(documentId: string, name: string, folderPath: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'rename or move documents');
    const document = this.state.documents.find(item => item.id === documentId);
    if (!document) throw new GuardError('INVALID_STATE', 'Document was not found.');
    requireClientScope(this.state, document.clientId);
    if (document.engagementId) requireEngagementScope(this.state, document.engagementId);
    const cleanName = name.trim();
    const cleanPath = folderPath.trim();
    const folder = this.state.folders?.find(item => item.path === cleanPath);
    if (!cleanName || !cleanPath.startsWith('/') || !cleanPath.endsWith('/') || !folder || (folder.clientId && folder.clientId !== document.clientId)) throw new GuardError('INVALID_STATE', 'Choose a name and an existing folder in this client library.');
    document.name = cleanName;
    document.folderPath = cleanPath;
    this.logEvent(`Document reference renamed or moved: ${document.id} → ${cleanPath}${cleanName}`, document.id);
    this.notify();
  }

  public setDocumentAvailability(documentId: string, broken: boolean, reason = '') {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'change document reference availability');
    const document = this.state.documents.find(item => item.id === documentId);
    if (!document) throw new GuardError('INVALID_STATE', 'Document was not found.');
    requireClientScope(this.state, document.clientId);
    if (document.engagementId) requireEngagementScope(this.state, document.engagementId);
    if (broken && !reason.trim()) throw new GuardError('INVALID_STATE', 'Record why the document reference is unavailable.');
    document.brokenLink = broken;
    this.logEvent(`Document reference ${broken ? 'marked unavailable' : 'restored'}: ${document.id}${reason.trim() ? ` — ${reason.trim()}` : ''}`, document.id);
    this.notify();
  }

  // --- Communications (VP-026, VP-027) ---
  public addCommunication(comm: CommunicationItem) {
    requireActiveIdentity(this.state);
    requireClientScope(this.state, comm.clientId);
    if (comm.engagementId) {
      requireEngagementScope(this.state, comm.engagementId);
      if (this.state.engagements.find(e => e.id === comm.engagementId)?.client !== comm.clientId) throw new GuardError('INVALID_STATE', 'Communication client and engagement must match.');
    }
    if (!comm.summary.trim()) throw new GuardError('INVALID_STATE', 'Communication summary is required.');
    if (comm.direction === 'Outbound' && comm.channel === 'Email') {
      const recipient = comm.recipientEmail?.trim().toLowerCase() || '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) || !comm.body?.trim()) throw new GuardError('INVALID_STATE', 'A valid recipient email and message body are required.');
      if (!this.state.contacts.some(contact => contact.clientId === comm.clientId && contact.active && contact.email?.trim().toLowerCase() === recipient)) throw new GuardError('FORBIDDEN_SCOPE', 'Recipient must be an active contact for this client.');
      if (!comm.simulationReference?.trim() || !comm.simulationEvidence?.trim() || this.state.communications.some(item => item.id === comm.id || item.simulationReference === comm.simulationReference)) throw new GuardError('INVALID_STATE', 'Each simulated send needs a unique reference and recorded outcome evidence.');
      comm.recipientEmail = recipient;
    }
    this.state.communications.unshift(comm);
    this.logEvent(`Communication logged: ${comm.channel} (${comm.direction}) - ${comm.summary}`, comm.id);
    this.notify();
  }

  // --- Time Tracking (VP-028) ---
  public addTimeEntry(entry: TimeEntryItem) {
    requireActiveIdentity(this.state);
    requireEngagementScope(this.state, entry.engagementId);
    if (!Number.isInteger(entry.durationMinutes) || entry.durationMinutes <= 0 || !entry.activity.trim() || !entry.taskTitle.trim()) throw new GuardError('INVALID_STATE', 'Time entry needs an activity, task, and positive whole-minute duration.');
    if (entry.person !== this.state.currentPerson) throw new GuardError('FORBIDDEN_SCOPE', 'A persona can record time only for itself.');
    this.state.times.unshift(entry);
    this.logEvent(`Time entry recorded by ${entry.person} (${entry.durationMinutes} min)`, entry.id);
    this.notify();
  }

  public reviewTimeEntry(entryId: string, status: 'Approved' | 'Returned', returnReason?: string) {
    requireActiveIdentity(this.state);
    const entry = this.state.times.find(t => t.id === entryId);
    if (!entry) throw new GuardError('INVALID_STATE', `Time entry "${entryId}" was not found.`);
    requireEngagementScope(this.state, entry.engagementId);
    if (entry.status !== 'Submitted') throw new GuardError('INVALID_STATE', 'Only submitted time entries can be reviewed.');
    // Enforce separation of duties: cannot approve own time!
    if (status === 'Approved') requireIndependentActor(entry.person, this.state.currentPerson, 'approve their own time entry', this.state);
    requireRole(this.state, ['manager', 'reviewer', 'partner'], 'review time');
    if (status === 'Returned' && !returnReason?.trim()) throw new GuardError('INVALID_STATE', 'Returning time requires a reason.');
    if (status === 'Approved') {
      const budget = this.state.budgets.find(b => b.engagementId === entry.engagementId);
      const line = budget?.lines.find(l => l.roleOrActivity.trim().toLowerCase() === entry.activity.trim().toLowerCase());
      entry.budgetVersion = budget?.version;
      entry.billingRatePerHour = line?.billingRatePerHour;
      entry.costRatePerHour = line?.costRatePerHour;
      entry.currency = budget?.currency;
    }
    entry.status = status;
    entry.reviewedBy = this.state.currentPerson;
    entry.reviewedAt = new Date().toISOString();
    if (returnReason) entry.returnReason = returnReason;
    this.logEvent(`Time entry ${entry.id} ${status.toLowerCase()} by ${this.state.currentPerson}`, entry.id);
    this.notify();
  }

  public resubmitReturnedTime(entryId: string, correction: Pick<TimeEntryItem, 'taskTitle' | 'durationMinutes' | 'activity' | 'narrative' | 'billable'>) {
    requireActiveIdentity(this.state);
    const entry = this.state.times.find(t => t.id === entryId);
    if (!entry || entry.status !== 'Returned') throw new GuardError('INVALID_STATE', 'Only returned time entries can be resubmitted.');
    requireEngagementScope(this.state, entry.engagementId);
    if (entry.person !== this.state.currentPerson) throw new GuardError('FORBIDDEN_SCOPE', 'Only the original time owner can resubmit a returned entry.');
    if (!correction.taskTitle.trim() || !correction.activity.trim() || !Number.isInteger(correction.durationMinutes) || correction.durationMinutes <= 0) throw new GuardError('INVALID_STATE', 'Corrected time requires a task, activity and positive whole-minute duration.');
    entry.status = 'Superseded';
    const revision = (entry.correctionRevision || 0) + 1;
    this.state.times.unshift({ ...entry, ...correction, id: `${entry.id}-R${revision}`, status: 'Submitted', correctionRevision: revision, supersedesId: entry.id, reviewedBy: undefined, reviewedAt: undefined, returnReason: undefined, billingRatePerHour: undefined, costRatePerHour: undefined, budgetVersion: undefined });
    this.logEvent(`Returned time entry resubmitted as revision ${revision}: ${entry.id}`, entry.id);
    this.notify();
  }

  // --- Budgets (VP-029) ---
  public updateBudget(budget: PrototypeState['budgets'][0]) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['billing', 'manager', 'partner'], 'author engagement budgets');
    requireEngagementScope(this.state, budget.engagementId);
    if (budget.lines.length === 0 || budget.lines.some(line => !line.roleOrActivity.trim() || !Number.isInteger(line.plannedMinutes) || line.plannedMinutes < 0 || !isValidMoney(line.billingRatePerHour, true) || (line.costRatePerHour !== undefined && !isValidMoney(line.costRatePerHour, true))) || new Set(budget.lines.map(line => line.roleOrActivity.trim().toLowerCase())).size !== budget.lines.length) throw new GuardError('INVALID_STATE', 'Budget lines need unique activity names, non-negative whole minutes, and finite rates with at most two decimal places.');
    const index = this.state.budgets.findIndex(b => b.id === budget.id);
    if (index >= 0) {
      const prior = this.state.budgets[index];
      if (budget.version <= prior.version) throw new GuardError('STALE_REVISION', `Budget revision must advance beyond v${prior.version}.`);
      this.state.budgets[index] = {
        ...budget,
        history: [...(prior.history || []), { version: prior.version, savedAt: new Date().toISOString(), savedBy: this.state.currentPerson, lines: structuredClone(prior.lines) }]
      };
    } else {
      this.state.budgets.push(budget);
    }
    this.logEvent(`Engagement budget ${budget.id} saved`, budget.id);
    this.notify();
  }

  // --- Invoicing & Billing (VP-030, VP-031) ---
  public addInvoice(inv: InvoiceRecord) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['billing', 'manager', 'partner'], 'draft invoices');
    requireClientScope(this.state, inv.clientId);
    if (inv.engagementId) requireEngagementScope(this.state, inv.engagementId, 'billing');
    if (!isValidMoney(inv.amount, true) || !Array.isArray(inv.lines) || Math.abs(inv.lines.reduce((s, line) => s + line.amount, 0) - inv.amount) > 0.005) throw new GuardError('INVALID_STATE', 'Invoice total must match its line items.');
    if (inv.status !== 'Draft') throw new GuardError('INVALID_STATE', 'New invoices must begin as drafts.');
    if (this.state.invoices.some(i => i.id === inv.id || i.invoiceNumber === inv.invoiceNumber)) throw new GuardError('INVALID_STATE', 'Invoice ID and number must be unique.');
    const timeLines = inv.lines.filter(line => line.sourceType === 'Time entry');
    const sourceIds = timeLines.map(line => line.sourceId);
    if (sourceIds.some(id => !id) || new Set(sourceIds).size !== sourceIds.length) throw new GuardError('INVALID_STATE', 'Each billed time line must identify one unique approved time entry.');
    const timeSources = timeLines.map(line => {
      const time = this.state.times.find(entry => entry.id === line.sourceId);
      if (!time || time.status !== 'Approved' || !time.billable || time.supersedesId || time.billedInvoiceId) throw new GuardError('INVALID_STATE', `Time source "${line.sourceId}" is not approved, billable, current, and available for invoicing.`);
      if (time.clientId !== inv.clientId || time.engagementId !== (inv.engagementId || inv.eng)) throw new GuardError('FORBIDDEN_SCOPE', `Time source "${time.id}" does not belong to this invoice's client and engagement.`);
      if (!time.currency || time.currency !== inv.currency || !Number.isFinite(time.billingRatePerHour) || time.billingRatePerHour! <= 0) throw new GuardError('INVALID_STATE', `Time source "${time.id}" has no compatible approved billing rate and currency.`);
      const quantity = time.durationMinutes / 60;
      const amount = Math.round(quantity * time.billingRatePerHour! * 100) / 100;
      if (line.quantity !== quantity || line.rate !== time.billingRatePerHour || line.amount !== amount) throw new GuardError('INVALID_STATE', `Invoice line for "${time.id}" does not match its approved duration and pinned rate.`);
      if (this.state.invoices.some(existing => existing.lines.some(existingLine => existingLine.sourceType === 'Time entry' && existingLine.sourceId === time.id))) throw new GuardError('INVALID_STATE', `Time source "${time.id}" has already been consumed by an invoice.`);
      return time;
    });
    const fixedLines = inv.lines.filter(line => line.sourceType === 'Fixed service');
    const fixedSourceIds = fixedLines.map(line => line.sourceId);
    if (fixedSourceIds.some(id => !id) || new Set(fixedSourceIds).size > 1) throw new GuardError('INVALID_STATE', 'Fixed-service invoice lines must reference one accepted proposal revision.');
    if (fixedLines.length) {
      const sourceId = fixedSourceIds[0]!;
      const proposal = this.state.proposals.find(p => sourceId === `proposal:${p.id}:r${p.revision}` && p.state === 'Accepted' && p.items.some(item => item.feeModel === 'Fixed'));
      const engagement = this.state.engagements.find(e => e.id === (inv.engagementId || inv.eng) && e.proposalId === proposal?.id && e.client === inv.clientId && e.acceptance && e.terms);
      if (!proposal || !engagement || proposal.currency !== inv.currency) throw new GuardError('FORBIDDEN_SCOPE', 'Fixed-service billing must match an accepted proposal revision, engagement, client and currency.');
      const contracted = proposal.items.filter(item => item.feeModel === 'Fixed').reduce((sum, item) => sum + item.amount, 0);
      const previouslyBilled = this.state.invoices.filter(existing => existing.id !== inv.id && (existing.engagementId || existing.eng) === engagement.id && existing.clientId === inv.clientId && existing.status !== 'Cancelled').flatMap(existing => existing.lines).filter(line => line.sourceType === 'Fixed service').reduce((sum, line) => sum + line.amount, 0);
      const requested = fixedLines.reduce((sum, line) => sum + line.amount, 0);
      if (fixedLines.some(line => !isValidMoney(line.amount)) || previouslyBilled + requested > contracted + 0.005) throw new GuardError('INVALID_STATE', `Fixed-service billing exceeds the remaining accepted proposal balance of ${Math.max(0, contracted - previouslyBilled)} ${proposal.currency}.`);
    }
    this.state.invoices.push(inv);
    timeSources.forEach(time => { time.billedInvoiceId = inv.id; });
    this.logEvent(`Invoice draft created: ${inv.invoiceNumber}`, inv.id);
    this.notify();
  }

  public reviewInvoice(invId: string, approved: boolean) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['billing', 'manager', 'partner'], 'review invoices');
    const inv = this.state.invoices.find(i => i.id === invId);
    if (!inv) throw new GuardError('INVALID_STATE', `Invoice "${invId}" was not found.`);
    requireClientScope(this.state, inv.clientId);
    if (inv.engagementId) requireEngagementScope(this.state, inv.engagementId, 'billing');
    if (inv.status !== 'Draft') throw new GuardError('INVALID_STATE', 'Only draft invoices can be reviewed.');
    if (approved) requireIndependentActor(inv.preparedBy, this.state.currentPerson, 'approve their own invoice', this.state);
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
    requireActiveIdentity(this.state);
    requireRole(this.state, ['billing', 'manager', 'partner'], 'issue invoices');
    const inv = this.state.invoices.find(i => i.id === invId);
    if (!inv) throw new GuardError('INVALID_STATE', `Invoice "${invId}" was not found.`);
    requireClientScope(this.state, inv.clientId);
    if (inv.engagementId) requireEngagementScope(this.state, inv.engagementId, 'billing');
    if (inv.status !== 'Approved' || !inv.commercialApproval) throw new GuardError('INVALID_STATE', 'Only an independently reviewed invoice can be issued.');
    requireIndependentActor(inv.commercialApproval.by, this.state.currentPerson, 'issue an invoice they reviewed', this.state);
    inv.status = 'Issued';
    inv.issueDate = new Date().toISOString().split('T')[0];
    this.logEvent(`Invoice issued in demo: ${inv.invoiceNumber} (${inv.amount} ${inv.currency})`, inv.id);
    this.notify();
  }

  public addCreditNote(credit: CreditNoteRecord) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['billing', 'manager', 'partner'], 'draft credit notes');
    const inv = this.state.invoices.find(i => i.id === credit.invoiceId);
    if (!inv) throw new GuardError('INVALID_STATE', 'Credit note must link to an existing invoice.');
    if (inv.clientId !== credit.clientId) throw new GuardError('FORBIDDEN_SCOPE', 'Cross-client credits are rejected.');
    requireClientScope(this.state, credit.clientId);
    if (inv.engagementId) requireEngagementScope(this.state, inv.engagementId, 'billing');
    if (!isValidMoney(credit.amount)) throw new GuardError('INVALID_STATE', 'Credit amount must be finite, positive, and use at most two decimal places.');
    if ((credit.currency || inv.currency) !== inv.currency) throw new GuardError('INVALID_STATE', 'Credit note currency must match the invoice currency.');
    if (inv.status !== 'Issued' && inv.status !== 'Paid') throw new GuardError('INVALID_STATE', 'Credit notes can be created only for issued invoices.');
    const issuedCredits = this.state.creditNotes
      .filter(c => c.invoiceId === credit.invoiceId && c.status === 'Issued')
      .reduce((s, c) => s + c.amount, 0);
    const remaining = inv.amount - issuedCredits;
    if (credit.amount > remaining) {
      throw new GuardError('INVALID_STATE', `Credit ${credit.amount} exceeds remaining creditable amount ${remaining}.`);
    }
    this.state.creditNotes.push(credit);
    credit.status = 'Draft';
    credit.reviewedBy = undefined;
    credit.issuedBy = undefined;
    this.logEvent(`Credit note drafted: ${credit.creditNumber} (${credit.amount} ${credit.currency || inv.currency})`, credit.id);
    this.notify();
  }

  public reviewCreditNote(creditId: string, approved: boolean) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['billing', 'manager', 'partner'], 'review credit notes');
    const credit = this.state.creditNotes.find(c => c.id === creditId);
    if (!credit) throw new GuardError('INVALID_STATE', `Credit note "${creditId}" was not found.`);
    requireClientScope(this.state, credit.clientId);
    const invoice = this.state.invoices.find(i => i.id === credit.invoiceId);
    if (invoice?.engagementId) requireEngagementScope(this.state, invoice.engagementId, 'billing');
    if (credit.status !== 'Draft') throw new GuardError('INVALID_STATE', 'Only a draft credit note can be reviewed.');
    if (approved) requireIndependentActor(credit.preparedBy, this.state.currentPerson, 'approve their own credit note', this.state);
    credit.status = approved ? 'Approved' : 'Draft';
    credit.reviewedBy = approved ? this.state.currentPerson : undefined;
    this.logEvent(`Credit note ${credit.creditNumber} ${approved ? 'approved' : 'returned'} by ${this.state.currentPerson}`, credit.id);
    this.notify();
  }

  public issueCreditNote(creditId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['billing', 'manager', 'partner'], 'issue credit notes');
    const credit = this.state.creditNotes.find(c => c.id === creditId);
    if (!credit) throw new GuardError('INVALID_STATE', `Credit note "${creditId}" was not found.`);
    requireClientScope(this.state, credit.clientId);
    const invoice = this.state.invoices.find(i => i.id === credit.invoiceId);
    if (!invoice || (invoice.status !== 'Issued' && invoice.status !== 'Paid')) throw new GuardError('INVALID_STATE', 'Credit note invoice is no longer eligible for credit.');
    if ((credit.currency || invoice.currency) !== invoice.currency) throw new GuardError('INVALID_STATE', 'Credit note currency must match the invoice currency.');
    if (invoice.engagementId) requireEngagementScope(this.state, invoice.engagementId, 'billing');
    if (credit.status !== 'Approved' || !credit.reviewedBy) throw new GuardError('INVALID_STATE', 'Credit note must receive independent review before issue.');
    requireIndependentActor(credit.reviewedBy, this.state.currentPerson, 'issue the credit note they reviewed', this.state);
    const alreadyIssued = this.state.creditNotes.filter(c => c.invoiceId === invoice.id && c.status === 'Issued').reduce((sum, c) => sum + c.amount, 0);
    if (credit.amount > invoice.amount - alreadyIssued) throw new GuardError('INVALID_STATE', 'Credit note exceeds the remaining creditable invoice balance.');
    credit.status = 'Issued';
    credit.issueDate = this.state.asOfDate;
    credit.date = this.state.asOfDate;
    credit.issuedBy = this.state.currentPerson;
    invoice.creditsApplied = (invoice.creditsApplied || 0) + credit.amount;
    this.logEvent(`Credit note issued: ${credit.creditNumber} (${credit.amount} ${credit.currency || invoice.currency})`, credit.id);
    this.notify();
  }

  // --- Offline Receipts & Allocations (VP-032) ---
  public addReceipt(receipt: ReceiptRecord) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['billing', 'manager', 'partner'], 'record offline receipts');
    if (!isValidMoney(receipt.amount)) throw new GuardError('INVALID_STATE', 'Receipt amount must be finite, positive, and use at most two decimal places.');
    if (!receipt.clientId) throw new GuardError('INVALID_STATE', 'Receipt requires a client billing account.');
    if (this.state.receipts.some(r => r.id === receipt.id || r.receiptNumber === receipt.receiptNumber)) throw new GuardError('INVALID_STATE', 'Receipt ID and number must be unique.');
    requireClientScope(this.state, receipt.clientId);
    this.state.receipts.unshift(receipt);
    this.logEvent(`Offline receipt recorded: ${receipt.receiptNumber} (${receipt.amount} ${receipt.currency})`, receipt.id);
    this.notify();
  }

  public allocateReceipt(receiptId: string, invoiceId: string, amount: number) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['billing', 'manager', 'partner'], 'allocate offline receipts');
    const receipt = this.state.receipts.find(r => r.id === receiptId);
    const invoice = this.state.invoices.find(i => i.id === invoiceId);
    if (!receipt || !invoice) return;
    requireClientScope(this.state, receipt.clientId);
    if (receipt.clientId !== invoice.clientId) {
      throw new GuardError('FORBIDDEN_SCOPE', 'Cross-client allocation is rejected.');
    }
    if (invoice.engagementId) requireEngagementScope(this.state, invoice.engagementId, 'billing');
    if (receipt.currency !== invoice.currency) {
      throw new GuardError('INVALID_STATE', 'Cross-currency allocation is rejected.');
    }
    if (invoice.status !== 'Issued' && invoice.status !== 'Paid') {
      throw new GuardError('INVALID_STATE', 'Only issued invoices can receive allocations (draft/cancelled excluded).');
    }
    if (!isValidMoney(amount)) {
      throw new GuardError('INVALID_STATE', 'Allocation amount must be finite, positive, and use at most two decimal places.');
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

    const settledAmount = Math.max(invoice.paid || 0, totalAllocated);
    const remainingInvoice = Math.max(0, invoice.amount - issuedCredits - settledAmount);
    if (amount > remainingInvoice) {
      throw new GuardError('INVALID_STATE', `Allocation ${amount} exceeds remaining invoice balance ${remainingInvoice}.`);
    }

    receipt.allocatedAmount = (receipt.allocatedAmount || 0) + amount;
    const nowIso = new Date().toISOString();
    receipt.allocations.push({
      invoiceId,
      amount,
      allocatedAt: nowIso,
      date: nowIso.split('T')[0]
    });

    invoice.paid = settledAmount + amount;
    if (invoice.paid >= invoice.amount - issuedCredits) {
      invoice.status = 'Paid';
    }

    this.logEvent(`Receipt ${receipt.receiptNumber} allocated ${amount} QAR to invoice ${invoice.invoiceNumber}`, receipt.id);
    this.notify();
  }

  public reverseAllocation(receiptId: string, allocationIndex: number, reason: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['billing', 'manager', 'partner'], 'reverse receipt allocations');
    const receipt = this.state.receipts.find(r => r.id === receiptId);
    if (!receipt || !receipt.allocations[allocationIndex]) return;
    requireClientScope(this.state, receipt.clientId);
    if (!reason.trim()) throw new GuardError('INVALID_STATE', 'A reversal reason is required.');

    const alloc = receipt.allocations[allocationIndex];
    if (alloc.reversed) return;
    const invoice = this.state.invoices.find(i => i.id === alloc.invoiceId);
    if (!invoice) throw new GuardError('INVALID_STATE', 'The allocated invoice no longer exists.');
    if (invoice.engagementId) requireEngagementScope(this.state, invoice.engagementId, 'billing');

    alloc.reversed = true;
    alloc.reversalDate = new Date().toISOString().split('T')[0];
    alloc.reversalReason = reason;
    receipt.allocatedAmount = Math.max(0, receipt.allocatedAmount - alloc.amount);

    invoice.paid = Math.max(0, invoice.paid - alloc.amount);
    const issuedCredits = this.state.creditNotes.filter(c => c.invoiceId === invoice.id && c.status === 'Issued').reduce((sum, c) => sum + c.amount, 0);
    if (invoice.status === 'Paid' && invoice.paid < invoice.amount - issuedCredits) {
      invoice.status = 'Issued';
    }

    this.logEvent(`Allocation reversed on ${receipt.receiptNumber}: ${reason}`, receipt.id);
    this.notify();
  }

  // --- Accounting & TB (VP-035, VP-036, VP-038) ---
  public saveAccountingProfile(clientId: string, input: Omit<ClientAccountingProfile, 'revision' | 'chartRevision' | 'history'>, engagementId: string, periodBookId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer', 'partner'], 'edit accounting setup');
    requireClientScope(this.state, clientId);
    const client = this.state.clients.find(item => item.id === clientId);
    const engagement = this.state.engagements.find(item => item.id === engagementId && item.client === clientId);
    if (!client || !engagement) throw new GuardError('INVALID_STATE', 'Accounting setup requires an engagement belonging to this client.');
    const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
    const codes = input.accounts.map(account => account.code.trim());
    if (!input.legalEntityName.trim() || input.reportingBasis === 'Not selected' || !/^[A-Z]{3}$/.test(input.baseCurrency) || !input.accounts.length || new Set(codes).size !== codes.length || input.accounts.some(account => !account.code.trim() || !account.name.trim() || !['asset', 'liability', 'equity', 'revenue', 'expense'].includes(account.type))) throw new GuardError('INVALID_STATE', 'Setup requires a legal entity, reporting basis, three-letter currency and uniquely coded, named chart accounts.');
    const byCode = new Map(input.accounts.map(account => [account.code, account]));
    for (const account of input.accounts) {
      if (account.parentCode && (!byCode.has(account.parentCode) || account.parentCode === account.code || byCode.get(account.parentCode)?.posting)) throw new GuardError('INVALID_STATE', `Invalid chart parent for account ${account.code}.`);
      let parent = account.parentCode; const seen = new Set([account.code]);
      while (parent) { if (seen.has(parent)) throw new GuardError('INVALID_STATE', 'Chart hierarchy contains a cycle.'); seen.add(parent); parent = byCode.get(parent)?.parentCode; }
    }
    const ids = input.periodBooks.map(book => book.id);
    if (new Set(ids).size !== ids.length || input.periodBooks.some(book => !book.name.trim() || !book.bookName.trim() || !validDate(book.startDate) || !validDate(book.endDate) || book.startDate > book.endDate || !this.state.engagements.some(item => item.id === book.ownerEngagementId && item.client === clientId))) throw new GuardError('INVALID_STATE', 'Period books need unique IDs, valid ranges and an owner engagement for this client.');
    const selected = input.periodBooks.find(book => book.id === periodBookId && book.ownerEngagementId === engagementId);
    if (!selected || selected.status !== 'Open' || input.dimensions.some(d => !d.values.length || new Set(d.values.map(value => value.trim().toLowerCase())).size !== d.values.length || d.values.some(value => !value.trim()))) throw new GuardError('INVALID_STATE', 'Select an open period book for this engagement and use non-empty, unique dimension values.');
    const previous = client.accountingProfile || { legalEntityName: client.name, reportingBasis: 'Not selected' as const, baseCurrency: engagement.currency || 'QAR', accounts: [], periodBooks: [], dimensions: [], revision: 0, chartRevision: 0, history: [] };
    if (previous.revision && (engagement.accountingProfileRevision !== previous.revision || engagement.accountingChartRevision !== previous.chartRevision)) throw new GuardError('STALE_REVISION', 'Accounting setup changed; reload before saving.');
    const chartChanged = JSON.stringify(previous.accounts) !== JSON.stringify(input.accounts);
    const history = structuredClone(previous.history);
    if (previous.revision) history.push({ legalEntityName: previous.legalEntityName, reportingBasis: previous.reportingBasis, baseCurrency: previous.baseCurrency, accounts: structuredClone(previous.accounts), periodBooks: structuredClone(previous.periodBooks), dimensions: structuredClone(previous.dimensions), revision: previous.revision, chartRevision: previous.chartRevision, savedAt: new Date().toISOString(), savedByUserId: this.state.currentUserId });
    const profile: ClientAccountingProfile = { ...structuredClone(input), revision: previous.revision + 1, chartRevision: previous.chartRevision + Number(chartChanged), history };
    client.accountingProfile = profile;
    const engagementIds = new Set(this.state.engagements.filter(item => item.client === clientId).map(item => item.id));
    for (const revision of this.state.statementSetRevisions || []) if (engagementIds.has(revision.engagementId) || revision.comparativeEngagementId && engagementIds.has(revision.comparativeEngagementId)) revision.status = 'Stale';
    for (const item of this.state.engagements.filter(e => e.client === clientId)) {
      item.accountingProfileRevision = profile.revision; item.accountingChartRevision = profile.chartRevision;
      const book = profile.periodBooks.find(b => b.ownerEngagementId === item.id && b.id === (item.id === engagementId ? periodBookId : item.accountingPeriodBookId));
      if (book) item.accountingPeriodBookId = book.id;
      if (chartChanged && item.mappingApproved) { item.mappingApproved = false; for (const mapping of this.state.accountMappingRevisions || []) if (mapping.engagementId === item.id && mapping.status === 'Approved') mapping.status = 'Draft'; }
      this.staleStatementSetRevisions(item.id); this.invalidateReleaseBasis(item);
    }
    this.logEvent(`Accounting setup for ${client.name} saved as Rev ${profile.revision}${chartChanged ? ` (chart Rev ${profile.chartRevision})` : ''}`, engagementId);
    this.notify(); return profile.revision;
  }

  public updateTrialBalanceRows(
    engId: string,
    rows: PrototypeState['engagements'][0]['rows'],
    source?: { fileName: string; format: 'CSV' | 'XLSX'; sha256: string; mapping: { code: number; name: number; debit: number; credit: number; signed: number; convention: 'signed-net' | 'debit-credit' } }
  ) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer', 'reviewer', 'partner'], 'replace trial balance rows');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) throw new GuardError('INVALID_STATE', `Engagement "${engId}" was not found.`);
    const client = this.state.clients.find(item => item.id === eng.client);
    const profile = client?.accountingProfile;
    const periodBook = profile?.periodBooks.find(book => book.id === eng.accountingPeriodBookId && book.ownerEngagementId === engId);
    if (source && (!profile || profile.reportingBasis === 'Not selected' || !periodBook || eng.accountingProfileRevision !== profile.revision || eng.accountingChartRevision !== profile.chartRevision)) throw new GuardError('INVALID_STATE', 'Complete or reload the client accounting setup and select this engagement’s period book before importing a trial balance.');
    if (source && rows.some(row => !profile?.accounts.some(account => account.code === row.code && account.active && account.posting))) throw new GuardError('INVALID_STATE', 'Imported accounts must exist as active posting accounts in the selected chart.');
    if (!Array.isArray(rows) || rows.some(r => !r.code.trim() || !r.name.trim() || !Number.isFinite(r.balance)) || new Set(rows.map(r => r.code.trim())).size !== rows.length) throw new GuardError('INVALID_STATE', 'Trial balance rows require unique account codes, names, and finite balances.');
    if (source && (!source.fileName.trim() || !/^[0-9a-f]{64}$/i.test(source.sha256))) throw new GuardError('INVALID_STATE', 'Imported source requires a file name and SHA-256 digest.');
    if (!eng.sourceHistory) eng.sourceHistory = eng.rows.length ? [{ version: eng.sourceVersion || 1, rows: structuredClone(eng.rows), importedAt: this.state.asOfDate, importedBy: 'Legacy source; import metadata unavailable', format: 'Legacy' }] : [];
    const predecessorVersion = eng.sourceVersion;
    eng.sourceVersion++;
    eng.rows = structuredClone(rows);
    eng.sourceHistory.push({
      version: eng.sourceVersion,
      rows: structuredClone(rows),
      importedAt: new Date().toISOString(),
      importedBy: this.state.currentPerson,
      fileName: source?.fileName || 'Manual local replacement',
      format: source?.format || 'Manual',
      sha256: source?.sha256,
      mapping: source ? { ...source.mapping } : undefined,
      predecessorVersion,
      accountingProfileRevision: profile?.revision,
      accountingChartRevision: profile?.chartRevision,
      periodBookId: periodBook?.id
    });
    for (const rec of eng.reconciliations || []) {
      this.staleReconciliation(rec);
    }
    this.staleStatementSetRevisions(engId);
    this.invalidateReleaseBasis(eng);
    this.logEvent(`Trial balance updated for ${eng.id} (Source v${eng.sourceVersion})`, eng.id);
    this.notify();
  }

  public saveReconciliationSchedule(engagementId: string, input: ReconciliationSchedule) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['preparer', 'manager'], 'edit reconciliation schedules');
    requireEngagementScope(this.state, engagementId);
    const engagement = this.state.engagements.find(item => item.id === engagementId);
    const currentIndex = engagement?.reconciliations.findIndex(item => item.id === input.id || !item.id && item.ref === input.ref) ?? -1;
    const current = currentIndex >= 0 ? engagement?.reconciliations[currentIndex] : undefined;
    const date = input.asOfDate || this.state.asOfDate;
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
    const row = engagement?.rows.find(item => item.code === input.accountCode);
    const items = input.items || [];
    if (!engagement || !row || !input.name?.trim() || !input.accountCode || !validDate || !Number.isFinite(input.statementBalance ?? input.supportingBalance) || !input.evidence?.trim() || !Array.isArray(items) || new Set(items.map(item => item.id)).size !== items.length || items.some(item => !item.id.trim() || !item.description.trim() || !Number.isFinite(item.amount) || !['Timing item', 'Proposed correction'].includes(item.type) || !/^\d{4}-\d{2}-\d{2}$/.test(item.date) || !Number.isFinite(Date.parse(`${item.date}T00:00:00Z`)) || new Date(`${item.date}T00:00:00Z`).toISOString().slice(0, 10) !== item.date || item.date > date || item.currency && item.currency !== engagement.currency)) throw new GuardError('INVALID_STATE', 'Reconciliation requires a scoped account, valid as-of date, finite balances and complete, dated in-scope items in the engagement currency.');
    if (input.sourceVersion !== undefined && input.sourceVersion !== engagement.sourceVersion) throw new GuardError('STALE_REVISION', 'Trial balance changed; reload the schedule before editing.');
    const history = structuredClone(current?.history || input.history || []);
    if (current?.preparedAt) history.push({ revision: current.revision || 1, sourceVersion: current.sourceVersion || engagement.sourceVersion, status: current.status, savedAt: current.preparedAt, savedByUserId: current.preparedByUserId || '', glBalance: current.glBalance ?? current.sourceBalance, statementBalance: current.statementBalance ?? current.supportingBalance, items: structuredClone(current.items || []), reviewedByUserId: current.reviewedByUserId, reviewedAt: current.reviewedAt, reviewNote: current.reviewNote });
    const schedule: ReconciliationSchedule = { ...structuredClone(input), id: current?.id || input.id || `REC-${crypto.randomUUID()}`, title: input.title || input.name, ref: current?.ref || input.ref || `REC-${Date.now()}`, engagementId, accountCode: row.code, sourceBalance: row.balance, glBalance: row.balance, statementBalance: input.statementBalance ?? input.supportingBalance, supportingBalance: input.statementBalance ?? input.supportingBalance, asOfDate: date, currency: engagement.currency, sourceVersion: engagement.sourceVersion, revision: (current?.revision || 0) + 1, status: 'Draft', preparedByUserId: this.state.currentUserId, preparedAt: new Date().toISOString(), reviewedByUserId: undefined, reviewedAt: undefined, reviewNote: undefined, items: structuredClone(items), history };
    if (current && engagement) engagement.reconciliations[currentIndex] = schedule;
    else engagement.reconciliations.push(schedule);
    this.invalidateReleaseBasis(engagement);
    this.logEvent(`Reconciliation ${schedule.ref} saved as revision ${schedule.revision} against TB v${schedule.sourceVersion}`, engagementId);
    this.notify();
    return schedule.id;
  }

  public reviewReconciliationSchedule(engagementId: string, scheduleId: string, decision: 'Approved' | 'Returned', note = '') {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['reviewer', 'manager', 'partner'], 'review reconciliation schedules');
    requireEngagementScope(this.state, engagementId);
    const engagement = this.state.engagements.find(item => item.id === engagementId);
    const schedule = engagement?.reconciliations.find(item => item.id === scheduleId);
    if (!engagement || !schedule || !['Draft', 'Returned'].includes(schedule.status) || schedule.sourceVersion !== engagement.sourceVersion || !schedule.preparedByUserId) throw new GuardError('STALE_REVISION', 'Only the current draft reconciliation can be independently reviewed.');
    requireIndependentActor(schedule.preparedByUserId, this.state.currentUserId, 'review their reconciliation schedule', this.state);
    if (decision === 'Returned' && !note.trim()) throw new GuardError('INVALID_STATE', 'A return reason is required.');
    if (decision === 'Approved') {
      const variance = calculateReconciliationVariance(schedule);
      const hasScopedEvidence = (reference: string) => this.state.documents.some(document => document.id === reference && document.clientId === engagement.client && (!document.engagementId || document.engagementId === engagementId));
      const scheduleEvidence = schedule.evidence.split(/[\s,;]+/).some(hasScopedEvidence);
      if (!scheduleEvidence || (schedule.items || []).some(item => !item.evidenceDoc?.trim() || !hasScopedEvidence(item.evidenceDoc) || item.type === 'Proposed correction' && (!item.journalId || !this.state.adjustmentJournals.some(journal => journal.id === item.journalId && journal.engagementId === engagementId)))) throw new GuardError('INVALID_STATE', 'Every reconciliation reference must resolve to in-scope evidence and proposed corrections must link to an engagement journal.');
      if (variance.unexplainedDifference > 0.005) throw new GuardError('INVALID_STATE', `Unexplained reconciliation residual ${variance.unexplainedDifference.toFixed(2)} blocks approval.`);
    }
    schedule.status = decision;
    schedule.reviewedByUserId = this.state.currentUserId;
    schedule.reviewedAt = new Date().toISOString();
    schedule.reviewNote = note.trim() || undefined;
    this.invalidateReleaseBasis(engagement);
    this.logEvent(`Reconciliation ${schedule.ref} ${decision.toLowerCase()} by ${this.state.currentPerson}${note.trim() ? `: ${note.trim()}` : ''}`, engagementId);
    this.notify();
  }

  public saveAccountMappings(engagementId: string, mappings: NonNullable<PrototypeState['accountMappingRevisions']>[number]['mappings']) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer', 'partner'], 'edit account mappings');
    requireEngagementScope(this.state, engagementId);
    const engagement = this.state.engagements.find(e => e.id === engagementId);
    const validTargets = new Set(['Cash and cash equivalents', 'Trade receivables', 'Other current assets', 'Property and equipment', 'Trade payables', 'Borrowings', 'Share capital and reserves', 'Revenue', 'Cost of sales', 'Operating expenses', 'Finance costs', 'Income tax']);
    if (!engagement || !Array.isArray(mappings) || new Set(mappings.map(m => m.accountCode)).size !== mappings.length || mappings.some(m => !engagement.rows.some(r => r.code === m.accountCode) || !m.targets.length || m.targets.some(t => !validTargets.has(t.statementLine) || !Number.isFinite(t.percentage) || t.percentage <= 0) || Math.abs(m.targets.reduce((sum, t) => sum + t.percentage, 0) - 100) > 0.0001)) throw new GuardError('INVALID_STATE', 'Mappings must reference unique source accounts and valid statement targets whose allocations total exactly 100%.');
    this.state.accountMappingRevisions ||= [];
    const history = this.state.accountMappingRevisions.filter(r => r.engagementId === engagementId);
    const revision = history.length ? Math.max(...history.map(r => r.revision)) + 1 : 1;
    this.state.accountMappingRevisions.push({ engagementId, revision, mappings: structuredClone(mappings), status: 'Draft', preparedBy: this.state.currentUserId });
    this.staleStatementSetRevisions(engagementId);
    this.invalidateReleaseBasis(engagement);
    this.logEvent(`Account mappings saved for ${engagementId} (Mapping v${revision}); dependent output is stale`, engagementId);
    this.notify();
  }

  public approveAccountMappings(engagementId: string, revision: number) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['reviewer', 'partner'], 'approve account mappings');
    requireEngagementScope(this.state, engagementId);
    const mapping = this.state.accountMappingRevisions?.find(r => r.engagementId === engagementId && r.revision === revision);
    const engagement = this.state.engagements.find(e => e.id === engagementId);
    if (!mapping || !engagement || mapping.status !== 'Draft') throw new GuardError('INVALID_STATE', 'Only an existing draft mapping revision can be approved.');
    requireIndependentActor(mapping.preparedBy, this.state.currentUserId, 'approve account mappings', this.state);
    mapping.status = 'Approved';
    mapping.reviewedBy = this.state.currentUserId;
    this.staleStatementSetRevisions(engagementId);
    this.invalidateReleaseBasis(engagement);
    this.logEvent(`Account mappings v${revision} independently approved for ${engagementId}`, engagementId);
    this.notify();
  }

  public saveStatementSetRevision(input: Omit<StatementSetRevision, 'id' | 'revision' | 'status' | 'preparedByUserId' | 'preparedAt' | 'reviewedByUserId' | 'reviewedAt'>) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer', 'partner'], 'save financial statement revisions');
    requireEngagementScope(this.state, input.engagementId);
    const engagement = this.state.engagements.find(item => item.id === input.engagementId);
    const mapping = [...(this.state.accountMappingRevisions || []).filter(item => item.engagementId === input.engagementId)].sort((a, b) => b.revision - a.revision)[0];
    const unmapped = engagement?.rows.filter(row => !mapping?.mappings.some(item => item.accountCode === row.code)) || [];
    if (!engagement || !mapping || input.sourceVersion !== engagement.sourceVersion || input.mappingRevision !== mapping.revision || mapping.status !== 'Approved' || unmapped.length) throw new GuardError('STALE_REVISION', 'Statement revision requires a current, complete, approved account mapping and source.');
    const numbers = Object.values(input.totals).concat(input.comparativeTotals ? Object.values(input.comparativeTotals) : []);
    if (input.layoutVersion < 1 || numbers.some(value => !Number.isFinite(value)) || !Array.isArray(input.lines) || input.lines.some(line => !line.line.trim() || !Number.isFinite(line.current) || line.comparative !== undefined && !Number.isFinite(line.comparative) || !Array.isArray(line.currentSources) || !Array.isArray(line.comparativeSources))) throw new GuardError('INVALID_STATE', 'Statement revision totals and mapped source rows are invalid.');
    if (input.comparativeEngagementId) {
      const comparison = this.state.engagements.find(item => item.id === input.comparativeEngagementId);
      const comparisonMapping = [...(this.state.accountMappingRevisions || []).filter(item => item.engagementId === input.comparativeEngagementId)].sort((a, b) => b.revision - a.revision)[0];
      if (!comparison || !comparisonMapping || comparison.client !== engagement.client || comparison.currency !== engagement.currency || comparison.year >= engagement.year || input.comparativeSourceVersion !== comparison.sourceVersion || input.comparativeMappingRevision !== comparisonMapping.revision || comparisonMapping.status !== 'Approved' || comparison.rows.some(row => !comparisonMapping.mappings.some(item => item.accountCode === row.code))) throw new GuardError('STALE_REVISION', 'Comparative statement source and approved mapping must match the selected earlier client period.');
    } else if (input.comparativeTotals || input.lines.some(line => line.comparative !== undefined || line.comparativeSources.length)) {
      throw new GuardError('INVALID_STATE', 'Comparative figures require a selected, approved comparative period.');
    }
    this.state.statementSetRevisions ||= [];
    const history = this.state.statementSetRevisions.filter(item => item.engagementId === input.engagementId);
    const revision = Math.max(0, ...history.map(item => item.revision)) + 1;
    for (const prior of history) prior.status = 'Stale';
    const record: StatementSetRevision = { ...structuredClone(input), id: `${input.engagementId}-STMT-${revision}`, revision, status: 'Draft', preparedByUserId: this.state.currentUserId, preparedAt: new Date().toISOString() };
    record.scopeSnapshot = { service: engagement.service, year: engagement.year, period: engagement.period };
    const comparison = input.comparativeEngagementId && this.state.engagements.find(item => item.id === input.comparativeEngagementId);
    if (comparison) record.comparativeScopeSnapshot = { service: comparison.service, year: comparison.year, period: comparison.period };
    this.state.statementSetRevisions.push(record);
    this.logEvent(`Financial statement set v${revision} saved for ${input.engagementId}`, input.engagementId);
    this.notify();
    return revision;
  }

  public staleStatementRevisionsForComparativeChange(engagementId: string, comparativeEngagementId: string) {
    requireActiveIdentity(this.state);
    requireEngagementScope(this.state, engagementId);
    for (const revision of this.state.statementSetRevisions || []) {
      if (revision.engagementId === engagementId && revision.comparativeEngagementId !== (comparativeEngagementId || undefined)) revision.status = 'Stale';
    }
    this.notify();
  }

  public reviewStatementSetRevision(engagementId: string, revisionNumber: number) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['reviewer', 'partner', 'eqr'], 'review financial statement revisions');
    requireEngagementScope(this.state, engagementId);
    const history = (this.state.statementSetRevisions || []).filter(item => item.engagementId === engagementId);
    const revision = history.find(item => item.revision === revisionNumber);
    const latestRevision = Math.max(0, ...history.map(item => item.revision));
    const engagement = this.state.engagements.find(item => item.id === engagementId);
    const mappingRevision = Math.max(0, ...(this.state.accountMappingRevisions || []).filter(item => item.engagementId === engagementId).map(item => item.revision));
    const comparison = revision?.comparativeEngagementId ? this.state.engagements.find(item => item.id === revision.comparativeEngagementId) : undefined;
    const comparisonMappingRevision = comparison && Math.max(0, ...(this.state.accountMappingRevisions || []).filter(item => item.engagementId === comparison.id).map(item => item.revision));
    if (!revision || !engagement || revisionNumber !== latestRevision || revision.status !== 'Draft' || revision.sourceVersion !== engagement.sourceVersion || revision.mappingRevision !== mappingRevision || (revision.comparativeEngagementId && (!comparison || revision.comparativeSourceVersion !== comparison.sourceVersion || revision.comparativeMappingRevision !== comparisonMappingRevision))) {
      if (revision) revision.status = 'Stale';
      this.notify();
      throw new GuardError('STALE_REVISION', 'This statement revision is no longer current; prepare a new revision after source, mapping or comparative changes.');
    }
    const currentMapping = [...(this.state.accountMappingRevisions || []).filter(item => item.engagementId === engagementId)].sort((a, b) => b.revision - a.revision)[0];
    if (!currentMapping || currentMapping.status !== 'Approved' || engagement.rows.some(row => !currentMapping.mappings.some(item => item.accountCode === row.code))) throw new GuardError('STALE_REVISION', 'The current statement mapping is not complete and approved.');
    if (revision.comparativeEngagementId) {
      const compMapping = [...(this.state.accountMappingRevisions || []).filter(item => item.engagementId === comparison!.id)].sort((a, b) => b.revision - a.revision)[0];
      if (!compMapping || compMapping.status !== 'Approved' || comparison!.rows.some(row => !compMapping.mappings.some(item => item.accountCode === row.code))) throw new GuardError('STALE_REVISION', 'The comparative mapping is not complete and approved.');
    }
    requireIndependentActor(revision.preparedByUserId, this.state.currentUserId, 'review a statement set they prepared', this.state);
    revision.status = 'Reviewed';
    revision.reviewedByUserId = this.state.currentUserId;
    revision.reviewedAt = new Date().toISOString();
    this.logEvent(`Financial statement set v${revisionNumber} independently reviewed`, engagementId);
    this.notify();
  }

  public addAdjustmentJournal(journal: AdjustmentJournalItem) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer', 'reviewer', 'partner'], 'create adjustment journals');
    requireEngagementScope(this.state, journal.engagementId);
    if (!journal.title.trim() || journal.lines.length < 2 || journal.lines.some(l => !l.accountCode.trim() || !l.accountName.trim() || !isValidMoney(l.amount)) || this.state.adjustmentJournals.some(j => j.id === journal.id)) throw new GuardError('INVALID_STATE', 'Journal needs a unique ID, title, at least two coded lines, and finite positive amounts.');
    const engagement = this.state.engagements.find(e => e.id === journal.engagementId);
    if (!engagement || journal.lines.some(line => !engagement.rows.some(row => row.code === line.accountCode))) throw new GuardError('INVALID_STATE', 'Every adjustment account must exist in the engagement trial balance.');
    const debits = journal.lines.filter(l => l.type === 'debit').reduce((s, l) => s + l.amount, 0);
    const credits = journal.lines.filter(l => l.type === 'credit').reduce((s, l) => s + l.amount, 0);
    if (Math.abs(debits - credits) > 0.005) throw new GuardError('INVALID_STATE', 'Adjustment journal must balance before it can be saved.');
    this.state.adjustmentJournals.unshift({ ...journal, status: 'Draft', preparedBy: this.state.currentPerson, reviewedBy: undefined, managementAcceptedBy: undefined, managementDecisionNote: undefined });
    this.logEvent(`Adjustment journal proposed: ${journal.title}`, journal.id);
    this.notify();
  }

  public reviewAdjustmentJournal(journalId: string, approved: boolean) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'reviewer', 'partner'], 'technically review adjustment journals');
    const journal = this.state.adjustmentJournals.find(item => item.id === journalId);
    if (!journal) throw new GuardError('INVALID_STATE', 'Adjustment journal was not found.');
    requireEngagementScope(this.state, journal.engagementId);
    if (journal.status !== 'Draft') throw new GuardError('INVALID_STATE', 'Only draft adjustments can enter technical review.');
    requireIndependentActor(journal.preparedBy, this.state.currentPerson, 'technically review this adjustment journal', this.state);
    journal.status = approved ? 'Technical review' : 'Rejected';
    journal.reviewedBy = this.state.currentPerson;
    const engagement = this.state.engagements.find(e => e.id === journal.engagementId);
    if (engagement) this.invalidateReleaseBasis(engagement);
    this.logEvent(`Adjustment journal ${journal.id} ${approved ? 'passed technical review' : 'rejected at technical review'} by ${this.state.currentPerson}`, journal.id);
    this.notify();
  }

  public recordAdjustmentManagementDecision(journalId: string, accepted: boolean, note = '') {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['client'], 'record a management adjustment decision');
    const journal = this.state.adjustmentJournals.find(item => item.id === journalId);
    if (!journal) throw new GuardError('INVALID_STATE', 'Adjustment journal was not found.');
    const engagement = this.state.engagements.find(e => e.id === journal.engagementId);
    if (!engagement) throw new GuardError('INVALID_STATE', 'Adjustment engagement was not found.');
    requireClientScope(this.state, engagement.client);
    requireEngagementScope(this.state, engagement.id);
    if (journal.status !== 'Technical review' || !journal.reviewedBy) throw new GuardError('INVALID_STATE', 'Only technically reviewed adjustments can receive a management decision.');
    requireIndependentActor(journal.preparedBy, this.state.currentPerson, 'record management acceptance of this adjustment', this.state);
    requireIndependentActor(journal.reviewedBy, this.state.currentPerson, 'record management acceptance of this adjustment', this.state);
    if (!accepted && !note.trim()) throw new GuardError('INVALID_STATE', 'A rejected adjustment requires a management rationale.');
    journal.status = accepted ? 'Management accepted' : 'Rejected';
    journal.managementAcceptedBy = accepted ? this.state.currentPerson : undefined;
    journal.managementDecisionNote = note.trim() || undefined;
    this.invalidateReleaseBasis(engagement);
    this.logEvent(`Adjustment journal ${journal.id} ${accepted ? 'accepted' : 'rejected'} by management`, journal.id);
    this.notify();
  }

  public updateAdjustmentJournal(journal: AdjustmentJournalItem) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'reviewer', 'partner'], 'review or update adjustment journals');
    requireEngagementScope(this.state, journal.engagementId);
    const index = this.state.adjustmentJournals.findIndex(j => j.id === journal.id);
    if (index >= 0) {
      const current = this.state.adjustmentJournals[index];
      requireEngagementScope(this.state, current.engagementId);
      if (journal.engagementId !== current.engagementId || journal.preparedBy !== current.preparedBy || journal.title !== current.title || journal.status !== current.status || journal.reviewedBy !== current.reviewedBy || journal.managementAcceptedBy !== current.managementAcceptedBy || journal.managementDecisionNote !== current.managementDecisionNote || JSON.stringify(journal.lines) !== JSON.stringify(current.lines)) throw new GuardError('INVALID_STATE', 'Journal content, ownership and approval state are immutable after proposal. Use the guarded review and management-decision actions.');
      if (Boolean(journal.reflectedInClientBooks) !== (journal.reflectionStatus === 'Reflected in TB')) throw new GuardError('INVALID_STATE', 'The source-reflected flag and reflection status must agree.');
      this.state.adjustmentJournals[index] = journal;
      const eng = this.state.engagements.find(e => e.id === journal.engagementId);
      if (eng) this.invalidateReleaseBasis(eng);
      this.notify();
    }
  }

  // --- Consolidation (VP-043–VP-046) ---
  public updateConsolidationGroup(group: ConsolidationGroupRecord) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'change consolidation groups');
    if (!group.name.trim() || group.components.length !== 2 || new Set(group.components.map(c => c.componentId)).size !== 2) throw new GuardError('INVALID_STATE', 'This prototype supports named consolidation groups with exactly two distinct explicitly selected components.');
    if (!/FY\s+\d{4}/.test(group.period) || !/^[A-Z]{3}$/.test(group.presentationCurrency || group.currency)) throw new GuardError('INVALID_STATE', 'Enter a reporting period and ISO currency code.');
    for (const component of group.components) {
      const engagement = this.state.engagements.find(e => e.id === component.componentId);
      if (!engagement || engagement.year !== Number(group.period.match(/\d{4}/)?.[0])) throw new GuardError('INVALID_STATE', `Component ${component.componentId} does not match the group period.`);
      requireEngagementScope(this.state, engagement.id);
      if (!Number.isInteger(component.packageRevisionPinned) || component.packageRevisionPinned! < 1 || !component.packageRows) throw new GuardError('INVALID_STATE', `Component ${component.componentId} requires an explicit pinned package snapshot.`);
      if (!Number.isFinite(component.ownershipPercent) || component.ownershipPercent <= 0 || component.ownershipPercent > 100) throw new GuardError('INVALID_STATE', `Component ${component.componentId} ownership must be greater than 0 and no more than 100 percent.`);
      if (!/^[A-Z]{3}$/.test(component.currency)) throw new GuardError('INVALID_STATE', `Component ${component.componentId} requires an ISO currency code.`);
    }
    const index = this.state.consolidationGroups.findIndex(g => g.id === group.id);
    if (index >= 0) {
      this.state.consolidationGroups[index] = group;
    } else {
      this.state.consolidationGroups.push(group);
    }
    this.logEvent(`Consolidation group updated: ${group.name}`, group.id);
    this.notify();
  }

  public updateConsolidationFxRate(groupId: string, currency: string, rate: number, effectiveDate: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'change consolidation exchange rates');
    const group = this.state.consolidationGroups.find(item => item.id === groupId);
    if (!group) throw new GuardError('INVALID_STATE', `Consolidation group "${groupId}" was not found.`);
    for (const component of group.components) requireEngagementScope(this.state, component.componentId);
    const presentationCurrency = group.presentationCurrency || group.currency;
    if (!/^[A-Z]{3}$/.test(currency) || currency === presentationCurrency || !group.components.some(component => component.currency === currency)) throw new GuardError('INVALID_STATE', 'Select a foreign currency used by a group component.');
    if (!Number.isFinite(rate) || rate <= 0) throw new GuardError('INVALID_STATE', 'Exchange rate must be a finite number greater than zero.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) || Number.isNaN(Date.parse(effectiveDate)) || new Date(`${effectiveDate}T00:00:00Z`).toISOString().slice(0, 10) !== effectiveDate) throw new GuardError('INVALID_STATE', 'Enter a valid effective date.');
    group.fxRateHistory ||= {};
    const history = group.fxRateHistory[currency] ||= [];
    history.push({ revision: history.length + 1, rate, purpose: 'Closing', effectiveDate, changedBy: this.state.currentPerson, changedAt: new Date().toISOString() });
    group.fxRates[currency] = rate;
    group.status = 'In progress';
    this.logEvent(`Consolidation ${currency} closing rate updated to ${rate} for ${effectiveDate}`, groupId);
    this.notify();
  }

  // --- Audit Workpapers, Procedures, Reviews (VP-050, VP-052, VP-055, VP-056) ---
  public createWorkpaperFromTemplate(engId: string, templateId: string, preparerId: string, reviewerId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'create workpapers from templates');
    requireEngagementScope(this.state, engId);
    const engagement = this.state.engagements.find(item => item.id === engId);
    const template = this.state.workpaperTemplates?.find(item => item.id === templateId && item.status === 'Published');
    const preparer = this.state.users.find(item => item.id === preparerId && item.status === 'Active' && item.role === 'preparer');
    const reviewer = this.state.users.find(item => item.id === reviewerId && item.status === 'Active' && ['reviewer', 'manager', 'partner', 'eqr'].includes(item.role));
    if (!engagement || !template || !preparer || !reviewer) throw new GuardError('INVALID_STATE', 'Choose a published template and active eligible preparer/reviewer.');
    requireIndependentActor(preparer.id, reviewer.id, 'assign the same person as preparer and reviewer', this.state);
    const sequence = Math.max(0, ...engagement.workpapers.map(item => Number(item.id.match(/-(\d+)$/)?.[1] || 0))) + 1;
    const id = `WP-${engId}-${String(sequence).padStart(2, '0')}`;
    if (engagement.workpapers.some(item => item.id === id)) throw new GuardError('INVALID_STATE', 'Generated workpaper identity already exists.');
    const workpaper: WorkpaperItem = {
      id, title: template.name, objective: template.objective, assertion: template.assertion, risk: template.risk,
      version: 1, status: 'Planned', applicable: true, scope: template.scope, workPerformed: '', conclusion: '',
      sourceTemplateId: template.id, sourceTemplateVersion: template.version,
      sourceProcedureRefs: [...template.procedureRefs],
      preparer: preparer.name, reviewer: reviewer.name, assignmentHistory: [
        { role: 'preparer', to: preparer.id, assignedBy: this.state.currentUserId, reason: 'Created from published template', assignedAt: new Date().toISOString() },
        { role: 'reviewer', to: reviewer.id, assignedBy: this.state.currentUserId, reason: 'Created from published template', assignedAt: new Date().toISOString() }
      ],
      guidelines: structuredClone(template.guidelines), template: structuredClone(template.template), workingPaper: null,
      supportingEvidence: [], evidenceRefs: [], clearance: null, clearanceHistory: []
    };
    engagement.workpapers.push(workpaper);
    this.invalidateReleaseBasis(engagement);
    this.logEvent(`Workpaper ${id} created from ${template.id} v${template.version}`, engId);
    this.notify();
    return id;
  }

  public reassignWorkpaper(engId: string, wpId: string, role: 'preparer' | 'reviewer', userId: string, reason: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'reassign workpapers');
    requireEngagementScope(this.state, engId);
    const engagement = this.state.engagements.find(item => item.id === engId);
    const workpaper = engagement?.workpapers.find(item => item.id === wpId);
    const user = this.state.users.find(item => item.id === userId && item.status === 'Active' && (role === 'preparer' ? item.role === 'preparer' : ['reviewer', 'manager', 'partner', 'eqr'].includes(item.role)));
    if (!workpaper || !user || !reason.trim()) throw new GuardError('INVALID_STATE', 'Choose an eligible active assignee and record a reassignment reason.');
    const otherName = role === 'preparer' ? workpaper.reviewer : workpaper.preparer;
    const other = this.state.users.find(item => item.name === otherName);
    requireIndependentActor(user.id, other?.id || otherName, 'assign one person as both preparer and reviewer', this.state);
    const from = role === 'preparer' ? workpaper.preparer : workpaper.reviewer;
    if (from === user.name) return;
    workpaper.assignmentHistory ||= [];
    workpaper.assignmentHistory.push({ role, from, to: user.id, assignedBy: this.state.currentUserId, reason: reason.trim(), assignedAt: new Date().toISOString() });
    if (role === 'preparer') workpaper.preparer = user.name; else workpaper.reviewer = user.name;
    if (workpaper.clearance) workpaper.clearanceHistory.push({ ...workpaper.clearance });
    workpaper.clearance = null;
    workpaper.submittedBy = undefined;
    workpaper.submittedVersion = undefined;
    workpaper.version += 1;
    workpaper.status = 'In progress';
    if (engagement) this.reopenWorkpaperReviewNotes(engagement, workpaper);
    if (engagement) this.invalidateReleaseBasis(engagement);
    this.logEvent(`Workpaper ${wpId} ${role} reassigned to ${user.name}: ${reason.trim()}`, engId);
    this.notify();
  }

  public updateWorkpaper(engId: string, wpId: string, updates: Pick<WorkpaperItem, 'applicable'> & Partial<Pick<WorkpaperItem, 'scope' | 'workPerformed' | 'conclusion'>> & { rationale?: string }) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer', 'partner'], 'change workpaper applicability');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) return;
    const wp = eng.workpapers.find(w => w.id === wpId);
    if (!wp) return;
    const changed = wp.applicable !== updates.applicable || (updates.scope !== undefined && updates.scope !== wp.scope) || (updates.workPerformed !== undefined && updates.workPerformed !== wp.workPerformed) || (updates.conclusion !== undefined && updates.conclusion !== wp.conclusion);
    if (!changed) return;
    if (wp.applicable && !updates.applicable) {
      requireRole(this.state, ['manager', 'partner'], 'mark workpapers not applicable');
      if (!updates.rationale?.trim()) throw new GuardError('INVALID_STATE', 'Marking a workpaper not applicable requires a reason.');
      if (this.state.findings.some(item => item.engagementId === engId && item.linkedWorkpaperId === wpId && !['Corrected in TB', 'Corrected by client', 'Waived as immaterial'].includes(item.disposition))) throw new GuardError('INVALID_STATE', 'Resolve or formally disposition linked findings before marking the workpaper not applicable.');
    }
    wp.version++;
    this.reopenWorkpaperReviewNotes(eng, wp);
    wp.applicable = updates.applicable;
    if (updates.scope !== undefined) wp.scope = updates.scope.trim();
    if (updates.workPerformed !== undefined) wp.workPerformed = updates.workPerformed.trim();
    if (updates.conclusion !== undefined) wp.conclusion = updates.conclusion.trim();
    wp.status = updates.applicable ? 'In progress' : 'Not applicable';
    wp.notApplicableRationale = updates.applicable ? undefined : updates.rationale?.trim() || wp.notApplicableRationale;
    if (wp.clearance) wp.clearanceHistory.push({ ...wp.clearance });
    wp.clearance = null;
    wp.submittedBy = undefined;
    wp.submittedVersion = undefined;
    this.invalidateReleaseBasis(eng);
    this.logEvent(`Workpaper ${wpId} revised to v${wp.version}; prior submission/clearance is historical`, engId);
    this.notify();
  }

  public linkWorkpaperEvidence(engId: string, wpId: string, documentId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['preparer', 'manager', 'partner'], 'link workpaper evidence');
    requireEngagementScope(this.state, engId);
    const engagement = this.state.engagements.find(item => item.id === engId);
    const workpaper = engagement?.workpapers.find(item => item.id === wpId);
    const document = this.state.documents.find(item => item.id === documentId && item.engagementId === engId);
    if (!workpaper || !document || document.brokenLink) throw new GuardError('INVALID_STATE', 'Evidence must be an available document in this engagement.');
    if (this.hasNewerDocumentRevision(document.id)) throw new GuardError('STALE_REVISION', 'Pin the latest document revision before reassessing this workpaper.');
    workpaper.evidenceRefs ||= [];
    workpaper.evidenceRevisions ||= {};
    if (!workpaper.evidenceRefs.includes(document.id)) {
      workpaper.evidenceRefs.push(document.id);
      workpaper.evidenceLinkHistory ||= [];
      workpaper.evidenceLinkHistory.push({ documentId: document.id, version: document.version, action: 'Linked', actorId: this.state.currentUserId, reason: 'Pinned current document revision', at: new Date().toISOString() });
    }
    workpaper.evidenceRevisions[document.id] = document.version;
    workpaper.version++;
    if (engagement) this.reopenWorkpaperReviewNotes(engagement, workpaper);
    workpaper.status = 'In progress';
    workpaper.submittedBy = undefined;
    workpaper.submittedVersion = undefined;
    if (workpaper.clearance) workpaper.clearanceHistory.push({ ...workpaper.clearance });
    workpaper.clearance = null;
    if (engagement) this.invalidateReleaseBasis(engagement);
    this.logEvent(`Document ${document.id} v${document.version} linked to workpaper ${wpId} v${workpaper.version}`, engId);
    this.notify();
  }

  public unlinkWorkpaperEvidence(engId: string, wpId: string, documentId: string, reason: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['preparer', 'manager', 'partner'], 'unlink workpaper evidence');
    requireEngagementScope(this.state, engId);
    const engagement = this.state.engagements.find(item => item.id === engId);
    const workpaper = engagement?.workpapers.find(item => item.id === wpId);
    const document = this.state.documents.find(item => item.id === documentId && item.engagementId === engId);
    if (!workpaper || !document || !workpaper.evidenceRefs?.includes(documentId) || !reason.trim()) throw new GuardError('INVALID_STATE', 'A pinned workpaper document and removal reason are required.');
    workpaper.evidenceLinkHistory ||= [];
    workpaper.evidenceLinkHistory.push({ documentId, version: workpaper.evidenceRevisions?.[documentId] ?? document.version, action: 'Unlinked', actorId: this.state.currentUserId, reason: reason.trim(), at: new Date().toISOString() });
    workpaper.evidenceRefs = workpaper.evidenceRefs.filter(id => id !== documentId);
    if (workpaper.clearance) workpaper.clearanceHistory.push({ ...workpaper.clearance });
    workpaper.clearance = null;
    workpaper.submittedBy = undefined;
    workpaper.submittedVersion = undefined;
    workpaper.version++;
    if (engagement) this.reopenWorkpaperReviewNotes(engagement, workpaper);
    workpaper.status = 'In progress';
    if (engagement) this.invalidateReleaseBasis(engagement);
    this.logEvent(`Document ${documentId} unpinned from workpaper ${wpId}: ${reason.trim()}`, engId);
    this.notify();
  }

  public submitWorkpaper(engId: string, wpId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['preparer', 'manager', 'partner'], 'submit workpapers');
    requireEngagementScope(this.state, engId);
    const engagement = this.state.engagements.find(item => item.id === engId);
    const workpaper = engagement?.workpapers.find(item => item.id === wpId);
    if (!engagement || !workpaper || !workpaper.applicable || workpaper.status === 'Not applicable') throw new GuardError('INVALID_STATE', 'Only an applicable workpaper can be submitted.');
    if (this.state.currentRole === 'preparer' && workpaper.preparer !== this.state.currentPerson) throw new GuardError('FORBIDDEN_SCOPE', 'Only the assigned preparer may submit this workpaper.');
    if (!workpaper.workPerformed?.trim() || !workpaper.conclusion.trim() || !workpaper.scope?.trim() || !workpaper.workingPaper || workpaper.workingPaper.version !== workpaper.version || !(workpaper.evidenceRefs || []).length) throw new GuardError('INVALID_STATE', 'Record work performed, scope, conclusion, a current workbook and linked evidence before submission.');
    if ((workpaper.evidenceRefs || []).some(id => {
      const document = this.state.documents.find(item => item.id === id && item.engagementId === engId);
      return !document || document.brokenLink || this.hasNewerDocumentRevision(id) || workpaper.evidenceRevisions?.[id] !== document.version;
    })) throw new GuardError('INVALID_STATE', 'Refresh every evidence link to its current same-engagement document revision before submission.');
    if ((workpaper.evidenceRefs || []).some(id => this.state.evidenceCatalogue.some(item => item.documentId === id && (item.adequacyStatus !== 'Adequate' || item.version !== this.state.documents.find(document => document.id === id)?.version)))) throw new GuardError('STALE_REVISION', 'Evidence must be adequate and pinned to its current document revision before submission.');
    workpaper.submittedBy = this.state.currentUserId;
    workpaper.submittedVersion = workpaper.version;
    workpaper.submissionHistory ||= [];
    workpaper.submissionHistory.push({ version: workpaper.version, submittedBy: this.state.currentUserId, submittedAt: new Date().toISOString() });
    workpaper.status = 'Submitted';
    this.invalidateReleaseBasis(engagement);
    this.logEvent(`Workpaper ${wpId} revision v${workpaper.version} submitted for independent review`, engId);
    this.notify();
  }

  public clearWorkpaper(engId: string, wpId: string, notes: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'reviewer', 'partner'], 'clear workpapers');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) return;
    const wp = eng.workpapers.find(w => w.id === wpId);
    if (!wp) return;
    if (!wp.applicable || !notes.trim()) throw new GuardError('INVALID_STATE', 'Only applicable workpapers with a clearance rationale can be cleared.');
    if (wp.status !== 'Submitted' || wp.submittedVersion !== wp.version || !wp.submittedBy) throw new GuardError('INVALID_STATE', 'Only the exact current submitted revision can be cleared.');
    if (wp.reviewer !== this.state.currentPerson) throw new GuardError('FORBIDDEN_SCOPE', 'Only the assigned reviewer may clear this workpaper.');

    // Check separation of duties: preparer cannot clear own workpaper!
    requireIndependentActor(wp.preparer, this.state.currentPerson, 'independently clear this workpaper', this.state);

    this.invalidateReleaseBasis(eng);
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
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'reviewer', 'partner', 'eqr'], 'raise review points');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) throw new GuardError('INVALID_STATE', `Engagement "${engId}" was not found.`);
    const workpaper = eng.workpapers.find(item => item.id === note.wp);
    if (!workpaper) throw new GuardError('INVALID_STATE', `Review workpaper "${note.wp}" was not found.`);
    note.subjectVersion = workpaper.version;
    eng.reviews.unshift(note);
    this.invalidateReleaseBasis(eng);
    this.logEvent(`Review note ${note.id} raised on ${note.wp}`, note.id);
    this.notify();
  }

  public respondReviewNote(engId: string, noteId: string, response: string, evidenceDoc?: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer', 'reviewer', 'partner'], 'respond to review points');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) throw new GuardError('INVALID_STATE', `Engagement "${engId}" was not found.`);
    const note = eng.reviews.find(r => r.id === noteId);
    if (!note) throw new GuardError('INVALID_STATE', `Review point "${noteId}" was not found.`);
    if (!response.trim()) throw new GuardError('INVALID_STATE', 'A response is required.');
    const workpaper = eng.workpapers.find(item => item.id === note.wp);
    if (!workpaper) throw new GuardError('INVALID_STATE', `Review workpaper "${note.wp}" was not found.`);
    if (evidenceDoc) {
      const document = this.state.documents.find(d => d.id === evidenceDoc && d.engagementId === engId);
      if (!document) throw new GuardError('FORBIDDEN_SCOPE', 'Review evidence must be a document in this engagement.');
    }
    note.response = response;
    note.responseEvidence = evidenceDoc;
    note.status = 'Responded';
    note.subjectVersion = workpaper.version;
    this.invalidateReleaseBasis(eng);
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
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'reviewer', 'partner', 'eqr'], 'clear review points');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) return;
    const note = eng.reviews.find(r => r.id === noteId);
    if (!note) return;
    const workpaper = eng.workpapers.find(item => item.id === note.wp);
    if (!workpaper) throw new GuardError('INVALID_STATE', `Review workpaper "${note.wp}" was not found.`);
    if (note.status === 'Reopened' || (note.subjectVersion !== undefined && note.subjectVersion !== workpaper.version)) {
      note.status = 'Reopened';
      note.history.push({ actor: this.state.currentPerson, action: 'Stale response rejected', time: new Date().toISOString(), text: `Response refers to workpaper v${note.subjectVersion ?? 'unknown'}; current revision is v${workpaper.version}.` });
      this.notify();
      throw new GuardError('STALE_REVISION', 'Review point was reopened by a workpaper change; assess the current revision before clearing.');
    }

    // Responder cannot clear their own query!
    const lastResponder = note.history.filter(h => h.action.includes('Responded')).at(-1)?.actor;
    if (lastResponder) requireIndependentActor(lastResponder, this.state.currentPerson, 'clear their own review point', this.state);

    this.invalidateReleaseBasis(eng);

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
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) return;

    // Role authority checks (VP-019, VP-056 / EX14, RR17, RR18)
    const role = this.state.currentRole;
    if (roleKey === 'partner' && role !== 'partner') {
      throw new GuardError('FORBIDDEN_SCOPE', 'Only a partner can record partner clearance.');
    }
    if (roleKey === 'partner') {
      const assigned = this.state.users.find(u => u.name === eng.partner && u.role === 'partner');
      const actor = this.state.users.find(u => u.id === this.state.currentUserId);
      if (!assigned || !actor || (assigned.personId || assigned.id) !== (actor.personId || actor.id)) throw new GuardError('FORBIDDEN_SCOPE', 'Only the assigned engagement partner can record partner clearance.');
    }
    if (roleKey === 'eqr' && role !== 'eqr') {
      throw new GuardError('FORBIDDEN_SCOPE', 'Only an Engagement Quality Reviewer can record EQR concurrence.');
    }
    if (roleKey === 'manager' && !['manager', 'partner'].includes(role)) {
      throw new GuardError('FORBIDDEN_SCOPE', 'Only an engagement manager or partner can record manager clearance.');
    }
    if (roleKey === 'client' && role !== 'client') {
      throw new GuardError('FORBIDDEN_SCOPE', 'Only an authorized client management approver (role: "client") can record representation sign-off.');
    }

    requireEngagementScope(this.state, engId);

    if (roleKey === 'manager' && eng.approvals.partner?.byUserId) requireIndependentActor(eng.approvals.partner.byUserId, this.state.currentUserId, 'record manager clearance after partner sign-off', this.state);
    else if (roleKey === 'manager' && eng.approvals.partner?.by) requireIndependentActor(eng.approvals.partner.by, this.state.currentPerson, 'record manager clearance after partner sign-off', this.state);
    if (roleKey === 'partner' && eng.approvals.manager?.byUserId) requireIndependentActor(eng.approvals.manager.byUserId, this.state.currentUserId, 'record partner sign-off after manager clearance', this.state);
    else if (roleKey === 'partner' && eng.approvals.manager?.by) requireIndependentActor(eng.approvals.manager.by, this.state.currentPerson, 'record partner sign-off after manager clearance', this.state);
    if (roleKey === 'client' && !eng.acceptance) throw new GuardError('INVALID_STATE', 'Commercial acceptance must be recorded before management representation.');

    // EQR check: unresolved concerns block EQR sign-off (VP-056 / F03)
    if (roleKey === 'eqr' && eng.eqrConcerns?.some(c => !c.resolved)) {
      throw new GuardError('INVALID_STATE', 'Cannot complete EQR sign-off: Unresolved EQR concerns remain.');
    }

    // Partner cannot also complete EQR for the same engagement (VP-056), scoped
    // per engagement — never a global shared object.
    if (roleKey === 'eqr' && eng.approvals.partner?.byUserId) requireIndependentActor(eng.approvals.partner.byUserId, this.state.currentUserId, 'complete EQR after partner sign-off', this.state);
    else if (roleKey === 'eqr' && eng.approvals.partner?.by) requireIndependentActor(eng.approvals.partner.by, this.state.currentPerson, 'complete EQR after partner sign-off', this.state);
    eng.approvals[roleKey] = {
      by: this.state.currentPerson,
      byUserId: this.state.currentUserId,
      at: new Date().toISOString(),
      generation: eng.generation,
      notes
    };
    eng.approvalHistory ||= [];
    eng.approvalHistory.push({ role: roleKey, by: this.state.currentPerson, byUserId: this.state.currentUserId, at: eng.approvals[roleKey]!.at, generation: eng.generation, notes });
    this.logEvent(`Stage approval recorded: ${roleKey.toUpperCase()} by ${this.state.currentPerson}`, eng.id);
    this.notify();
  }

  public addEqrConcern(engId: string, text: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['eqr'], 'raise EQR concerns');
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
    this.invalidateReleaseBasis(eng);
    this.logEvent(`EQR concern ${concernId} raised by ${this.state.currentPerson}`, eng.id);
    this.notify();
  }

  public toggleEqrConcern(engId: string, concernId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['eqr'], 'resolve EQR concerns');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) return;
    const concern = eng.eqrConcerns?.find(c => c.id === concernId);
    if (!concern) throw new GuardError('INVALID_STATE', 'Concern not found.');
    if (!concern.resolved && !concern.response?.trim()) throw new GuardError('INVALID_STATE', 'Record and independently review the team response before resolving an EQR concern.');
    if (!concern.resolved) {
      requireIndependentActor(concern.raisedBy, this.state.currentUserId, 'resolve a concern raised by the same person', this.state);
      requireIndependentActor(concern.responseUserId || concern.responseBy || '', this.state.currentUserId, 'approve this EQR response', this.state);
    }
    this.invalidateReleaseBasis(eng);
    concern.resolved = !concern.resolved;
    if (concern.resolved) {
      concern.resolvedAt = new Date().toISOString();
      concern.resolvedBy = this.state.currentPerson;
      concern.resolvedUserId = this.state.currentUserId;
      concern.reviewedBy = this.state.currentPerson;
      concern.reviewedAt = concern.resolvedAt;
    } else {
      concern.resolvedAt = undefined;
      concern.resolvedBy = undefined;
      concern.resolvedUserId = undefined;
      concern.reviewedBy = undefined;
      concern.reviewedAt = undefined;
    }
    this.logEvent(`EQR concern ${concernId} marked ${concern.resolved ? 'resolved' : 'open'}`, eng.id);
    this.notify();
  }

  public respondEqrConcern(engId: string, concernId: string, response: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer', 'reviewer', 'partner'], 'respond to EQR concerns');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    const concern = eng?.eqrConcerns?.find(c => c.id === concernId);
    if (!eng || !concern || concern.resolved) throw new GuardError('INVALID_STATE', 'Only an open EQR concern can receive a response.');
    if (!response.trim()) throw new GuardError('INVALID_STATE', 'EQR response is required.');
    requireIndependentActor(concern.raisedBy, this.state.currentUserId, 'respond to a concern raised by the same person', this.state);
    concern.response = response.trim();
    concern.responseBy = this.state.currentPerson;
    concern.responseUserId = this.state.currentUserId;
    concern.responseAt = new Date().toISOString();
    this.invalidateReleaseBasis(eng);
    this.logEvent(`EQR concern ${concernId} response recorded`, eng.id);
    this.notify();
  }

  public replaceWorkpaperRevision(engId: string, wpId: string, fileDetails: { name: string; size?: number; sha256?: string }) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer', 'partner'], 'replace workpaper revisions');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) return;
    const wp = eng.workpapers.find(w => w.id === wpId);
    if (!wp) throw new GuardError('INVALID_STATE', 'Workpaper not found.');
    if (!fileDetails.name || !fileDetails.name.trim() || !Number.isFinite(fileDetails.size) || (fileDetails.size || 0) < 1) throw new GuardError('INVALID_STATE', 'Choose a non-empty local file.');
    if (fileDetails.sha256 && !/^[a-f0-9]{64}$/i.test(fileDetails.sha256)) throw new GuardError('INVALID_STATE', 'File digest must be a SHA-256 hex value.');

    this.invalidateReleaseBasis(eng);
    wp.version += 1;
    this.reopenWorkpaperReviewNotes(eng, wp);
    wp.status = 'In progress';
    wp.submittedBy = undefined;
    wp.submittedVersion = undefined;
    if (wp.clearance) {
      wp.clearanceHistory.push({ ...wp.clearance });
      wp.clearance = null;
    }
    wp.documentName = fileDetails.name;
    wp.workingPaper = {
      file: fileDetails.name,
      name: fileDetails.name,
      size: fileDetails.size!,
      sha: fileDetails.sha256,
      version: wp.version,
      uploadedAt: new Date().toISOString(),
      uploadedBy: this.state.currentPerson,
      local: true
    };
    this.logEvent(`Workpaper ${wp.id} revision v${wp.version} uploaded by ${this.state.currentPerson}`, wp.id);
    this.notify();
  }

  // --- PBC lifecycle (VP-023, VP-024): response is not acceptance ---------------
  public uploadPbcResponse(engId: string, requestId: string, file: { id?: string; name: string; size?: number; sha256?: string }) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['client_admin', 'client_finance', 'client'], 'upload client PBC responses');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) return;
    const req = eng.pbc.find(r => r.id === requestId);
    if (!req) throw new GuardError('INVALID_STATE', 'PBC request not found.');
    if (!file.name || !file.name.trim() || !Number.isFinite(file.size) || (file.size || 0) < 1) throw new GuardError('INVALID_STATE', 'Choose a non-empty local file.');
    if (!file.sha256 || !/^[a-f0-9]{64}$/i.test(file.sha256)) throw new GuardError('INVALID_STATE', 'A SHA-256 digest of the selected file is required.');
    if (req.contributor !== this.state.currentPerson) throw new GuardError('FORBIDDEN_SCOPE', 'Only the named client contributor can submit this PBC response.');
    if (!['Requested', 'Needs clarification', 'Received'].includes(req.status)) throw new GuardError('INVALID_STATE', `A response cannot be uploaded while the request is ${req.status}.`);

    const docId = file.id || `DOC-PBC-${crypto.randomUUID()}`;
    if (!/^DOC-PBC-[\w-]+$/.test(docId) || this.state.documents.some(document => document.id === docId)) throw new GuardError('INVALID_STATE', 'PBC response identity must be unique and valid.');
    const uploadedAt = new Date().toISOString();
    const uploadVersion = (req.sharedFiles?.at(-1)?.version || 0) + 1;
    const newDoc: DocumentItem = {
      id: docId,
      clientId: eng.client,
      engagementId: eng.id,
      name: file.name,
      folderPath: `/PBC/`,
      version: uploadVersion,
      size: file.size!,
      sha: file.sha256,
      classification: 'Client provided',
      visibility: 'Client shared',
      source: 'Local In-Session',
      linkedPbcId: req.id,
      uploadedBy: this.state.currentPerson,
      uploadedAt
    };
    this.state.documents.unshift(newDoc);

    if (!req.sharedFiles) req.sharedFiles = [];
    req.sharedFiles.push({
      id: docId,
      name: file.name,
      version: uploadVersion,
      size: file.size!,
      sha: file.sha256 || null,
      uploadedBy: this.state.currentPerson,
      uploadedAt,
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
      version: uploadVersion,
      clientVisible: true
    });

    req.file = file.name;
    req.version = uploadVersion;
    req.status = 'Received';
    req.acceptedBy = undefined;
    req.acceptedAt = undefined;
    req.acceptedVersion = undefined;
    this.invalidateReleaseBasis(eng);
    this.logEvent(`PBC response file uploaded by ${this.state.currentPerson}: ${file.name}`, req.id);
    this.notify();
  }
  public addPbcRequest(engId: string, request: PbcRequestItem) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner', 'preparer'], 'create PBC requests');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) return;
    if (!request.id?.trim() || this.state.engagements.some(e => e.pbc.some(p => p.id === request.id))) throw new GuardError('INVALID_STATE', 'PBC request ID must be unique.');
    if (!request.title || !request.title.trim() || !request.category.trim() || !request.owner.trim() || !request.contributor?.trim()) throw new GuardError('INVALID_STATE', 'Request title, category, owner and client recipient are required.');
    eng.pbc.unshift({ ...request, status: 'Draft', version: 1 });
    this.invalidateReleaseBasis(eng);
    this.logEvent(`PBC request drafted: ${request.title}`, request.id);
    this.notify();
  }

  public requestPbcClarification(engId: string, requestId: string, note: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'reviewer', 'partner'], 'request PBC clarification');
    requireEngagementScope(this.state, engId);
    const req = this.state.engagements.find(e => e.id === engId)?.pbc.find(r => r.id === requestId);
    if (!req || req.status !== 'Received') throw new GuardError('INVALID_STATE', 'Clarification requires a received response.');
    if (!note.trim()) throw new GuardError('INVALID_STATE', 'Clarification details are required.');
    req.status = 'Needs clarification';
    req.clarificationNote = note.trim();
    req.thread ||= [];
    req.thread.push({ id: `TH-${crypto.randomUUID()}`, kind: 'clarification', author: this.state.currentPerson, role: this.state.currentRole, text: req.clarificationNote, time: new Date().toISOString(), clientVisible: true });
    this.logEvent(`PBC clarification requested: ${req.title}`, req.id);
    this.notify();
  }

  public presentPbcRequest(engId: string, requestId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner', 'preparer'], 'present PBC requests');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    const req = eng?.pbc.find(r => r.id === requestId);
    if (!eng || !req) throw new GuardError('INVALID_STATE', `PBC request "${requestId}" was not found.`);
    if (!req.title.trim() || !req.owner.trim() || !req.contributor?.trim()) throw new GuardError('INVALID_STATE', 'A title, owner, and client recipient are required before presentation.');
    if (req.status !== 'Draft') throw new GuardError('INVALID_STATE', 'Only draft requests can be presented.');
    req.status = 'Requested';
    req.requestedBy = this.state.currentPerson;
    req.requestedAt = new Date().toISOString();
    this.invalidateReleaseBasis(eng);
    this.logEvent(`PBC request presented: ${req.title}`, req.id);
    this.notify();
  }

  public acceptPbcResponse(engId: string, requestId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'reviewer', 'partner'], 'accept PBC evidence');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    const req = eng?.pbc.find(r => r.id === requestId);
    if (!eng || !req) throw new GuardError('INVALID_STATE', `PBC request "${requestId}" was not found.`);
    if (req.status !== 'Received' || (!req.file && !req.responseDocId && (!req.sharedFiles || req.sharedFiles.length === 0))) {
      throw new GuardError('INVALID_STATE', 'Cannot accept PBC request: no valid submission has been received.');
    }
    const lastUploadBy = req.thread?.filter(t => t.kind === 'response').at(-1)?.author || req.contributor || '';
    if (lastUploadBy) {
      requireIndependentActor(lastUploadBy, this.state.currentPerson, 'accept this PBC response', this.state);
    }
    req.status = 'Accepted';
    req.acceptedBy = this.state.currentPerson;
    req.acceptedAt = new Date().toISOString();
    req.acceptedVersion = req.version;
    this.invalidateReleaseBasis(eng);
    this.logEvent(`PBC response accepted: ${req.title}`, req.id);
    this.notify();
  }

  // --- Time correction revision (VP-028): approved entries are never overwritten -
  public correctApprovedTime(entryId: string, correctedMinutes: number, reason: string) {
    requireActiveIdentity(this.state);
    const entry = this.state.times.find(t => t.id === entryId);
    if (!entry) return;
    requireEngagementScope(this.state, entry.engagementId);
    if (entry.status !== 'Approved') throw new GuardError('INVALID_STATE', 'Only approved entries use correction revisions.');
    if (!Number.isInteger(correctedMinutes) || correctedMinutes <= 0 || !reason.trim()) throw new GuardError('INVALID_STATE', 'Corrected duration must be positive whole minutes with a reason.');
    if (entry.person !== this.state.currentPerson && !['manager', 'partner'].includes(this.state.currentRole)) throw new GuardError('FORBIDDEN_SCOPE', 'Only the time owner or an engagement manager/partner can submit a correction.');
    entry.status = 'Superseded';
    const correction: TimeEntryItem = {
      ...entry,
      id: `${entry.id}-R${(entry.correctionRevision || 0) + 1}`,
      durationMinutes: correctedMinutes,
      status: 'Submitted',
      correctionRevision: (entry.correctionRevision || 0) + 1,
      supersedesId: entry.id,
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
    requireRole(this.state, ['manager', 'reviewer', 'partner', 'eqr'], 'set evidence adequacy');
    const ev = this.state.evidenceCatalogue.find(e => e.id === evidenceId);
    if (!ev) throw new GuardError('INVALID_STATE', 'Evidence record not found.');
    const evidenceDocument = this.state.documents.find(d => d.id === ev.documentId);
    if (!evidenceDocument) throw new GuardError('INVALID_STATE', 'Evidence document was not found.');
    if (evidenceDocument.clientId) requireClientScope(this.state, evidenceDocument.clientId);
    if (evidenceDocument.engagementId) requireEngagementScope(this.state, evidenceDocument.engagementId);
    if (status === 'Adequate' && evidenceDocument.brokenLink) throw new GuardError('INVALID_STATE', 'An unavailable document reference cannot be marked adequate.');
    if (status !== 'Adequate' && !rationale.trim()) {
      throw new GuardError('INVALID_STATE', 'A non-adequate determination requires a recorded rationale.');
    }
    const changed = ev.adequacyStatus !== status;
    ev.adequacyStatus = status;
    ev.adequacyHistory ||= [];
    if (changed) ev.adequacyHistory.push({ status, actorId: this.state.currentUserId, rationale: rationale.trim(), at: new Date().toISOString() });
    const linkedEng = evidenceDocument?.engagementId && this.state.engagements.find(e => e.id === evidenceDocument.engagementId);
    if (changed) {
      for (const program of this.state.auditPrograms) for (const procedure of program.procedures) {
        if (!ev.linkedProcedures.includes(procedure.id)) continue;
        const engagement = this.state.engagements.find(item => item.id === (procedure.engagementId || program.engagementId || evidenceDocument.engagementId));
        if (!engagement) continue;
        procedure.evidenceReassessmentHistory ||= [];
        procedure.evidenceReassessmentHistory.push({ documentId: ev.documentId, version: ev.version, previousStatus: procedure.status, reviewedByUserId: procedure.reviewedByUserId, reviewedAt: procedure.reviewedAt, invalidatedAt: new Date().toISOString() });
        procedure.evidenceReassessmentRequired = true;
        if (procedure.status === 'Cleared' || procedure.status === 'Submitted') procedure.status = 'In progress';
        procedure.reviewedByUserId = undefined;
        procedure.reviewedAt = undefined;
        this.invalidateReleaseBasis(engagement);
      }
      for (const engagement of this.state.engagements) for (const workpaper of engagement.workpapers) {
        if (!workpaper.evidenceRefs?.includes(ev.documentId)) continue;
        if (!workpaper.clearance && !workpaper.submittedVersion && workpaper.status !== 'Cleared' && workpaper.status !== 'Submitted') continue;
        if (workpaper.clearance) workpaper.clearanceHistory.push({ ...workpaper.clearance });
        workpaper.clearance = null;
        workpaper.submittedBy = undefined;
        workpaper.submittedVersion = undefined;
        workpaper.version++;
        this.reopenWorkpaperReviewNotes(engagement, workpaper);
        workpaper.status = 'Changes required';
        this.invalidateReleaseBasis(engagement);
      }
    }
    this.logEvent(`Evidence ${evidenceId} adequacy set to ${status} by ${this.state.currentPerson}${rationale ? ': ' + rationale : ''}`, evidenceId);
    this.notify();
  }

  public linkEvidenceProcedure(evidenceId: string, procedureId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer', 'reviewer', 'partner', 'eqr'], 'link evidence to a procedure');
    const ev = this.state.evidenceCatalogue.find(e => e.id === evidenceId);
    if (!ev) throw new GuardError('INVALID_STATE', 'Evidence record not found.');
    const doc = this.state.documents.find(d => d.id === ev.documentId);
    if (!doc) throw new GuardError('INVALID_STATE', 'Evidence document was not found.');
    const eng = this.state.engagements.find(e => e.id === (doc?.engagementId || this.state.selectedEngagement));
    if (!eng) throw new GuardError('INVALID_STATE', 'Select an engagement for this evidence link.');
    requireEngagementScope(this.state, eng.id);
    if (!this.state.auditPrograms.some(p => (p.engagementId === eng.id || (!p.engagementId && eng.id === this.state.engagements[0]?.id)) && p.procedures.some(proc => proc.id === procedureId))) throw new GuardError('INVALID_STATE', 'Procedure was not found in the selected engagement.');
    if (doc.clientId) requireClientScope(this.state, doc.clientId);
    if (doc.engagementId && doc.engagementId !== eng.id) throw new GuardError('FORBIDDEN_SCOPE', 'Evidence and procedure must belong to the same engagement.');
    if (doc.clientId !== eng.client) throw new GuardError('FORBIDDEN_SCOPE', 'Evidence and procedure must belong to the same client.');
    if (doc.brokenLink || ev.adequacyStatus !== 'Adequate' || doc.version !== ev.version || this.hasNewerDocumentRevision(doc.id)) throw new GuardError('STALE_REVISION', 'Only an available, adequate evidence record pinned to the current document revision can be linked.');
    if (!ev.linkedProcedures.includes(procedureId)) {
      ev.linkedProcedures.push(procedureId);
      ev.linkedProcedureHistory ||= [];
      ev.linkedProcedureHistory.push({ procedureId, action: 'Linked', actorId: this.state.currentUserId, reason: 'Linked to scoped audit procedure', at: new Date().toISOString() });
      this.invalidateReleaseBasis(eng);
    }
    this.logEvent(`Evidence ${evidenceId} linked to procedure ${procedureId}`, evidenceId);
    this.notify();
  }

  public unlinkEvidenceProcedure(evidenceId: string, procedureId: string, reason: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer', 'reviewer', 'partner', 'eqr'], 'unlink evidence from a procedure');
    const evidence = this.state.evidenceCatalogue.find(item => item.id === evidenceId);
    const document = evidence && this.state.documents.find(item => item.id === evidence.documentId);
    if (!evidence || !document || !evidence.linkedProcedures.includes(procedureId) || !reason.trim()) throw new GuardError('INVALID_STATE', 'A linked evidence record, procedure and unlink rationale are required.');
    const program = this.state.auditPrograms.find(item => item.procedures.some(procedure => procedure.id === procedureId));
    const procedure = program?.procedures.find(item => item.id === procedureId);
    const engagementId = procedure?.engagementId || program?.engagementId || document.engagementId;
    const engagement = this.state.engagements.find(item => item.id === engagementId);
    if (!procedure || !engagement) throw new GuardError('INVALID_STATE', 'Procedure was not found in the evidence scope.');
    requireEngagementScope(this.state, engagement.id);
    if (document.clientId) requireClientScope(this.state, document.clientId);
    if (document.engagementId && document.engagementId !== engagement.id) throw new GuardError('FORBIDDEN_SCOPE', 'Evidence and procedure must belong to the same engagement.');
    if (document.clientId !== engagement.client) throw new GuardError('FORBIDDEN_SCOPE', 'Evidence and procedure must belong to the same client.');
    evidence.linkedProcedures = evidence.linkedProcedures.filter(id => id !== procedureId);
    evidence.linkedProcedureHistory ||= [];
    evidence.linkedProcedureHistory.push({ procedureId, action: 'Unlinked', actorId: this.state.currentUserId, reason: reason.trim(), at: new Date().toISOString() });
    procedure.evidenceReassessmentHistory ||= [];
    procedure.evidenceReassessmentHistory.push({ documentId: evidence.documentId, version: evidence.version, previousStatus: procedure.status, reviewedByUserId: procedure.reviewedByUserId, reviewedAt: procedure.reviewedAt, invalidatedAt: new Date().toISOString() });
    procedure.evidenceReassessmentRequired = true;
    if (procedure.status === 'Cleared' || procedure.status === 'Submitted') procedure.status = 'In progress';
    procedure.reviewedByUserId = undefined;
    procedure.reviewedAt = undefined;
    this.invalidateReleaseBasis(engagement);
    this.logEvent(`Evidence ${evidenceId} unlinked from procedure ${procedureId}: ${reason.trim()}`, evidenceId);
    this.notify();
  }

  public updateAuditProcedureExecution(engId: string, procedureId: string, workPerformed: string, conclusion: string, evidenceLimitation: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['preparer', 'manager'], 'record procedure fieldwork');
    requireEngagementScope(this.state, engId);
    const procedure = this.state.auditPrograms.find(p => (p.engagementId === engId || (!p.engagementId && engId === this.state.engagements[0]?.id)) && p.procedures.some(item => item.id === procedureId))?.procedures.find(p => p.id === procedureId);
    if (!procedure) throw new GuardError('INVALID_STATE', 'Procedure was not found in the selected engagement.');
    if (!workPerformed.trim() || !conclusion.trim()) throw new GuardError('INVALID_STATE', 'Record work performed and a conclusion.');
    procedure.workPerformed = workPerformed.trim();
    procedure.conclusion = conclusion.trim();
    procedure.evidenceLimitation = evidenceLimitation.trim() || undefined;
    procedure.status = 'In progress';
    procedure.scopeReassessmentRequired = false;
    procedure.scopeReassessmentReason = undefined;
    procedure.reviewedByUserId = undefined;
    procedure.reviewedAt = undefined;
    const engagement = this.state.engagements.find(item => item.id === engId);
    if (engagement) this.invalidateReleaseBasis(engagement);
    this.logEvent(`Procedure ${procedureId} fieldwork updated`, procedureId);
    this.notify();
  }

  public updateAuditProcedureStatus(engId: string, procedureId: string, status: import('../types').AuditProcedureItem['status']) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['preparer', 'manager', 'reviewer', 'partner', 'eqr'], 'update procedure fieldwork status');
    requireEngagementScope(this.state, engId);
    const procedure = this.state.auditPrograms.find(p => (p.engagementId === engId || (!p.engagementId && engId === this.state.engagements[0]?.id)) && p.procedures.some(item => item.id === procedureId))?.procedures.find(p => p.id === procedureId);
    if (!procedure) throw new GuardError('INVALID_STATE', 'Procedure was not found in the selected engagement.');
    if (status === 'Submitted') {
      requireRole(this.state, ['preparer', 'manager'], 'submit procedure fieldwork');
      if (!procedure.workPerformed?.trim() || !procedure.conclusion?.trim()) throw new GuardError('INVALID_STATE', 'Record work performed and a conclusion before submitting fieldwork.');
      const hasCurrentEvidence = this.state.evidenceCatalogue.some(e => {
        if (!e.linkedProcedures.includes(procedureId) || e.adequacyStatus !== 'Adequate') return false;
        let document = this.state.documents.find(d => d.id === e.documentId);
        if (!document || document.brokenLink || document.clientId !== this.state.engagements.find(item => item.id === engId)?.client || (document.engagementId && document.engagementId !== engId) || document.version !== e.version) return false;
        return !this.hasNewerDocumentRevision(document.id);
      });
      if (!hasCurrentEvidence && !procedure.evidenceLimitation?.trim()) throw new GuardError('INVALID_STATE', 'Link current adequate evidence or record an evidence limitation before submitting.');
      if (procedure.scopeReassessmentRequired) throw new GuardError('STALE_REVISION', 'Planning scope changed; re-record this procedure before submitting.');
      procedure.preparedByUserId = this.state.currentUserId;
      procedure.evidenceReassessmentRequired = false;
    }
    if (status === 'Completed') throw new GuardError('INVALID_STATE', 'Use Submitted for preparer work and Cleared for independent review.');
    if (status === 'Cleared' && procedure.status !== 'Cleared') {
      requireRole(this.state, ['reviewer', 'manager', 'partner', 'eqr'], 'clear procedure fieldwork');
      if (procedure.evidenceReassessmentRequired) throw new GuardError('STALE_REVISION', 'Reassess the changed evidence and resubmit fieldwork before clearing this procedure.');
      if (procedure.status !== 'Submitted' || !procedure.preparedByUserId) throw new GuardError('INVALID_STATE', 'Only submitted fieldwork with a recorded preparer can be cleared.');
      requireIndependentActor(procedure.preparedByUserId, this.state.currentUserId, 'clear their own procedure fieldwork', this.state);
      procedure.reviewedByUserId = this.state.currentUserId;
      procedure.reviewedAt = new Date().toISOString();
    }
    if (status !== 'Cleared') {
      procedure.reviewedByUserId = undefined;
      procedure.reviewedAt = undefined;
    }
    if (status === 'Exceptions noted') procedure.hasExceptions = true;
    procedure.status = status;
    const engagement = this.state.engagements.find(item => item.id === engId);
    if (engagement) this.invalidateReleaseBasis(engagement);
    this.logEvent(`Procedure ${procedureId} status changed to ${status}`, procedureId);
    this.notify();
  }

  public updateAuditRisk(engId: string, riskId: string, changes: Pick<import('../types').AuditRiskItem, 'title' | 'area' | 'assertions' | 'description' | 'rationale' | 'response' | 'owner' | 'rating'> & { linkedProcedureIds?: string[] }) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer'], 'edit assessed risks');
    requireEngagementScope(this.state, engId);
    const risk = this.state.auditRisks.find(item => (item.engagementId === engId || (!item.engagementId && engId === this.state.engagements[0]?.id)) && item.id === riskId);
    if (!risk) throw new GuardError('INVALID_STATE', 'Risk was not found in the selected engagement.');
    const previousProcedureIds = [...(risk.linkedProcedureIds || [])];
    const nextProcedureIds = changes.linkedProcedureIds ?? previousProcedureIds;
    const scopedPrograms = this.state.auditPrograms.filter(program => program.engagementId === engId || (program.engagementId === undefined && engId === this.state.engagements[0]?.id));
    const scopedProcedureIds = new Set(scopedPrograms.flatMap(program => program.procedures.map(procedure => procedure.id)));
    if (new Set(nextProcedureIds).size !== nextProcedureIds.length || nextProcedureIds.some(id => !scopedProcedureIds.has(id))) throw new GuardError('FORBIDDEN_SCOPE', 'Risk and procedure must both belong to the selected engagement.');
    if (![changes.title, changes.area, changes.description, changes.rationale, changes.response, changes.owner].every(value => value?.trim())) throw new GuardError('INVALID_STATE', 'Risk title, area, description, rationale, response and owner are required.');
    if (!changes.assertions.length || new Set(changes.assertions).size !== changes.assertions.length || changes.assertions.some(assertion => !assertion.trim())) throw new GuardError('INVALID_STATE', 'Select at least one unique assertion.');
    if (!['Low', 'Medium', 'Significant'].includes(changes.rating) || !this.state.users.some(user => user.name === changes.owner && user.status === 'Active')) throw new GuardError('INVALID_STATE', 'Risk rating and active owner must be valid.');
    const previous = structuredClone(risk);
    const engagement = this.state.engagements.find(item => item.id === engId);
    const plans = (this.state.auditPlans || []).filter(plan => plan.engagementId === engId).sort((a, b) => b.version - a.version);
    const currentPlan = plans[0];
    let reviewImpact: string | undefined;
    if (engagement && currentPlan && ['Approved', 'Under review'].includes(currentPlan.status)) {
      const nextVersion = currentPlan.version + 1;
      reviewImpact = `Risk ${riskId} changed; audit plan v${nextVersion} requires independent review.`;
      const revision = { ...structuredClone(currentPlan), id: `PLAN-${engId}-V${nextVersion}`, version: nextVersion, status: 'Under review' as const, rationales: [...currentPlan.rationales, reviewImpact], preparedBy: this.state.currentPerson, preparedByUserId: this.state.currentUserId, preparedAt: new Date().toISOString(), reviewedBy: undefined, reviewedByUserId: undefined, reviewedAt: undefined, reviewNotes: undefined };
      currentPlan.status = 'Superseded';
      currentPlan.supersededReason = reviewImpact;
      this.state.auditPlans!.push(revision);
      engagement.planning = false;
    }
    Object.assign(risk, structuredClone(changes), { linkedProcedureIds: [...nextProcedureIds] });
    const affectedProcedureIds = new Set([...previousProcedureIds, ...nextProcedureIds]);
    for (const program of scopedPrograms) for (const procedure of program.procedures) {
      procedure.linkedRiskIds ||= [];
      if (nextProcedureIds.includes(procedure.id)) {
        if (!procedure.linkedRiskIds.includes(riskId)) procedure.linkedRiskIds.push(riskId);
      } else procedure.linkedRiskIds = procedure.linkedRiskIds.filter(id => id !== riskId);
    }
    risk.revisions ||= [];
    risk.revisions.push({
      revision: risk.revisions.length + 1,
      title: previous.title,
      area: previous.area,
      assertions: structuredClone(previous.assertions),
      description: previous.description,
      owner: previous.owner,
      linkedProcedureIds: previousProcedureIds,
      rating: previous.rating,
      response: previous.response,
      changedBy: this.state.currentPerson,
      changedAt: new Date().toISOString(),
      rationale: changes.rationale,
      reviewImpact
    });
    for (const program of scopedPrograms) {
      for (const procedure of program.procedures) {
        if (!affectedProcedureIds.has(procedure.id)) continue;
        procedure.scopeReassessmentHistory ||= [];
        procedure.scopeReassessmentHistory.push({ reason: `Risk ${riskId} changed`, previousStatus: procedure.status, reviewedByUserId: procedure.reviewedByUserId, reviewedAt: procedure.reviewedAt, invalidatedAt: new Date().toISOString() });
        procedure.scopeReassessmentRequired = true;
        procedure.scopeReassessmentReason = `Risk ${riskId} changed — reassess planned response`;
        if (procedure.status === 'Cleared' || procedure.status === 'Submitted') procedure.status = 'In progress';
        procedure.reviewedByUserId = undefined;
        procedure.reviewedAt = undefined;
      }
    }
    if (engagement) this.invalidateReleaseBasis(engagement);
    this.logEvent(`Risk ${riskId} updated (Revision ${risk.revisions.length})`, riskId);
    this.notify();
  }

  public createAuditProgramTemplate(template: Omit<import('../types').AuditProgramTemplate, 'id' | 'version' | 'status'>) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner', 'admin'], 'create audit program templates');
    if (!template.name?.trim() || !template.area?.trim() || !template.description?.trim()) {
      throw new GuardError('INVALID_STATE', 'Template name, area and description are required.');
    }
    if (![...new Set([...this.state.auditPrograms.map(program => program.area), ...(this.state.auditProgramTemplates || []).map(item => item.area)])].includes(template.area.trim())) throw new GuardError('INVALID_STATE', 'Template audit area must match a supported audit area.');
    if (!template.procedures?.length) {
      throw new GuardError('INVALID_STATE', 'Template must include at least one procedure.');
    }
    const id = `TPL-PRG-${crypto.randomUUID()}`;
    this.state.auditProgramTemplates ||= [];
    this.state.auditProgramTemplates.push({
      id,
      name: template.name.trim(),
      area: template.area.trim(),
      description: template.description.trim(),
      version: 1,
      status: 'Draft',
      procedures: structuredClone(template.procedures)
    });
    this.logEvent(`Audit program template created: ${template.name}`, id);
    this.notify();
    return id;
  }

  public reviseAuditProgramTemplate(templateId: string, changes: Pick<import('../types').AuditProgramTemplate, 'name' | 'area' | 'description' | 'procedures'>) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner', 'admin'], 'revise audit program templates');
    const template = this.state.auditProgramTemplates?.find(item => item.id === templateId);
    if (!template || template.status === 'Retired' || !changes.name.trim() || !changes.area.trim() || !changes.description.trim() || !changes.procedures.length) throw new GuardError('INVALID_STATE', 'A current reusable template and complete revised content are required.');
    if (![...new Set([...this.state.auditPrograms.map(program => program.area), ...(this.state.auditProgramTemplates || []).map(item => item.area)])].includes(changes.area.trim())) throw new GuardError('INVALID_STATE', 'Template audit area must match a supported audit area.');
    this.state.auditProgramTemplateHistory ||= [];
    this.state.auditProgramTemplateHistory.push(structuredClone(template));
    Object.assign(template, structuredClone(changes), { version: template.version + 1, status: 'Draft' as const });
    this.logEvent(`Audit program template ${template.name} revised to v${template.version} draft`, template.id);
    this.notify();
  }

  public publishAuditProgramTemplate(templateId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner', 'admin'], 'publish audit program templates');
    const template = this.state.auditProgramTemplates?.find(item => item.id === templateId);
    if (!template || template.status !== 'Draft' || !template.procedures.length) throw new GuardError('INVALID_STATE', 'Only a complete draft audit program template can be published.');
    template.status = 'Published';
    this.logEvent(`Audit program template ${template.name} v${template.version} published`, template.id);
    this.notify();
  }

  public retireAuditProgramTemplate(templateId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner', 'admin'], 'retire audit program templates');
    const template = this.state.auditProgramTemplates?.find(item => item.id === templateId);
    if (!template || template.status === 'Retired') throw new GuardError('INVALID_STATE', 'A current audit program template is required.');
    this.state.auditProgramTemplateHistory ||= [];
    this.state.auditProgramTemplateHistory.push(structuredClone(template));
    template.status = 'Retired';
    this.logEvent(`Audit program template ${template.name} v${template.version} retired`, template.id);
    this.notify();
  }

  public applyAuditProgramTemplate(engId: string, templateId: string, customTitle?: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer', 'partner'], 'apply audit program templates');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) throw new GuardError('INVALID_STATE', `Engagement "${engId}" was not found.`);
    this.state.auditProgramTemplates ||= [];
    const template = this.state.auditProgramTemplates.find(t => t.id === templateId && t.status === 'Published');
    if (!template) throw new GuardError('INVALID_STATE', 'Published audit program template not found.');

    const prgId = `PRG-${engId}-${crypto.randomUUID()}`;
    const newProcedures: import('../types').AuditProcedureItem[] = template.procedures.map((p, idx) => ({
      id: `PRC-${crypto.randomUUID()}`,
      engagementId: engId,
      ref: `PRC-${(idx + 1).toString().padStart(2, '0')}`,
      title: p.title,
      instructions: p.instructions,
      objective: p.objective,
      assertion: p.defaultAssertions.join(', '),
      requiredEvidence: p.requiredEvidenceType,
      status: 'Not started',
      linkedRiskIds: [],
      workPerformed: '',
      conclusion: ''
    }));

    this.state.auditPrograms.push({
      id: prgId,
      engagementId: engId,
      area: template.area,
      title: customTitle?.trim() || template.name,
      objective: template.description,
      sourceTemplateId: template.id,
      sourceTemplateVersion: template.version,
      procedures: newProcedures
    });

    this.invalidateReleaseBasis(eng);
    this.logEvent(`Applied program template "${template.name}" to ${engId} (${newProcedures.length} fresh procedures)`, engId);
    this.notify();
    return prgId;
  }


  public setAuditRiskProcedureLink(engId: string, riskId: string, procedureId: string, linked: boolean) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer'], 'link a risk to a procedure');
    requireEngagementScope(this.state, engId);
    const risk = this.state.auditRisks.find(item => (item.engagementId === engId || (!item.engagementId && engId === this.state.engagements[0]?.id)) && item.id === riskId);
    const program = this.state.auditPrograms.find(item => (item.engagementId === engId || (!item.engagementId && engId === this.state.engagements[0]?.id)) && item.procedures.some(proc => proc.id === procedureId));
    const procedure = program?.procedures.find(item => item.id === procedureId);
    if (!risk || !procedure) throw new GuardError('INVALID_STATE', 'Risk and procedure must both belong to the selected engagement.');
    risk.linkedProcedureIds ||= [];
    procedure.linkedRiskIds ||= [];
    if (linked) {
      if (!risk.linkedProcedureIds.includes(procedureId)) risk.linkedProcedureIds.push(procedureId);
      if (!procedure.linkedRiskIds.includes(riskId)) procedure.linkedRiskIds.push(riskId);
    } else {
      risk.linkedProcedureIds = risk.linkedProcedureIds.filter(id => id !== procedureId);
      procedure.linkedRiskIds = procedure.linkedRiskIds.filter(id => id !== riskId);
    }
    const engagement = this.state.engagements.find(item => item.id === engId);
    if (engagement) this.invalidateReleaseBasis(engagement);
    this.logEvent(`Risk ${riskId} ${linked ? 'linked to' : 'unlinked from'} procedure ${procedureId}`, riskId);
    this.notify();
  }

  public setSampleItemSelected(populationId: string, itemId: string, selected: boolean, rationale = '') {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['preparer', 'manager', 'reviewer', 'partner'], 'select substantive sample items');
    const population = this.state.samplePopulations.find(item => item.id === populationId);
    if (!population?.engagementId) throw new GuardError('INVALID_STATE', 'Population must be linked to an engagement.');
    requireEngagementScope(this.state, population.engagementId);
    if (!population.sourceComplete) throw new GuardError('INVALID_STATE', 'Import the complete population source before selecting sample items.');
    if (!isSampleFrameReconciled(this.state, population)) throw new GuardError('INVALID_STATE', 'Reconcile the complete population to its mapped GL balance, period and currency before selecting sample items.');
    const item = population.items.find(candidate => candidate.id === itemId);
    if (!item) throw new GuardError('INVALID_STATE', 'Sample item was not found in this population.');
    if (selected && !rationale.trim()) throw new GuardError('INVALID_STATE', 'Selection rationale is required.');
    item.selected = selected;
    item.selectionRationale = selected ? rationale.trim() : undefined;
    population.selectionVersion = (population.selectionVersion || 0) + 1;
    population.selectionPreparedBy = this.state.currentUserId;
    population.selectedCount = population.items.filter(candidate => candidate.selected).length;
    population.selectedValue = population.items.filter(candidate => candidate.selected).reduce((sum, candidate) => sum + candidate.amount, 0);
    const engagement = this.state.engagements.find(candidate => candidate.id === population.engagementId);
    if (engagement) this.invalidateReleaseBasis(engagement);
    this.logEvent(`Sample item ${itemId} ${selected ? 'selected' : 'removed from selection'}`, populationId);
    this.notify();
  }

  public reviewSampleSelection(populationId: string, evaluation: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['reviewer', 'partner'], 'review substantive sample selection');
    const population = this.state.samplePopulations.find(item => item.id === populationId);
    if (!population?.engagementId || !population.sourceComplete || !isSampleFrameReconciled(this.state, population)) throw new GuardError('INVALID_STATE', 'A complete, reconciled population is required before review.');
    requireEngagementScope(this.state, population.engagementId);
    if (!population.selectedCount || !evaluation.trim()) throw new GuardError('INVALID_STATE', 'Select items and record an evaluation before review.');
    if (!population.selectionPreparedBy) throw new GuardError('INVALID_STATE', 'A preparer must save the current selection before review.');
    requireIndependentActor(population.selectionPreparedBy, this.state.currentUserId, 'review sample selection', this.state);
    population.selectionReviews ||= [];
    population.selectionReviews.push({ version: population.selectionVersion || 0, sourceRevision: population.sourceRevision || 1, reviewedBy: this.state.currentUserId, reviewedAt: new Date().toISOString(), selectedCount: population.selectedCount, testedCount: population.items.filter(item => item.selected && item.tested).length, untestedCount: population.items.filter(item => item.selected && !item.tested && !item.limitation).length, limitedCount: population.items.filter(item => item.selected && Boolean(item.limitation)).length, exceptionCount: population.items.filter(item => item.selected && item.result === 'Exception noted').length, evaluation: evaluation.trim() });
    this.logEvent(`Sample selection v${population.selectionVersion || 0} independently reviewed`, populationId);
    this.notify();
  }

  public linkSampleExceptionToFinding(populationId: string, itemId: string, findingId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['preparer', 'manager', 'reviewer'], 'link a sample exception to a finding');
    const population = this.state.samplePopulations.find(item => item.id === populationId);
    if (!population?.engagementId) throw new GuardError('INVALID_STATE', 'Population must be linked to an engagement.');
    requireEngagementScope(this.state, population.engagementId);
    const sample = population.items.find(item => item.id === itemId);
    const finding = this.state.findings.find(item => item.id === findingId && item.engagementId === population.engagementId);
    if (!sample?.selected || !sample.tested || sample.result !== 'Exception noted' || !finding) throw new GuardError('INVALID_STATE', 'Link a tested sample exception to a finding in the same engagement.');
    sample.findingId = finding.id;
    this.logEvent(`Sample exception ${itemId} linked to finding ${finding.id}`, populationId);
    this.notify();
  }

  public recordSampleItemLimitation(populationId: string, itemId: string, limitation: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['preparer', 'manager'], 'record a sample testing limitation');
    const population = this.state.samplePopulations.find(item => item.id === populationId);
    if (!population?.engagementId || !population.sourceComplete || !isSampleFrameReconciled(this.state, population)) throw new GuardError('INVALID_STATE', 'A complete, reconciled population is required before recording limitations.');
    requireEngagementScope(this.state, population.engagementId);
    const sample = population.items.find(item => item.id === itemId);
    if (!sample?.selected || sample.tested || !limitation.trim()) throw new GuardError('INVALID_STATE', 'Select an untested item and explain the testing limitation.');
    sample.limitation = limitation.trim();
    sample.result = 'Limited';
    this.logEvent(`Sample item ${itemId} limitation recorded`, populationId);
    this.notify();
  }

  public recordSampleItemTest(populationId: string, itemId: string, auditedAmount: number, notes: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['preparer', 'manager', 'reviewer'], 'record substantive sample testing');
    const population = this.state.samplePopulations.find(item => item.id === populationId);
    if (!population?.engagementId) throw new GuardError('INVALID_STATE', 'Population must be linked to an engagement.');
    requireEngagementScope(this.state, population.engagementId);
    if (!population.sourceComplete) throw new GuardError('INVALID_STATE', 'Import the complete population source before recording sample tests.');
    if (!isSampleFrameReconciled(this.state, population)) throw new GuardError('INVALID_STATE', 'Reconcile the complete population to its mapped GL balance, period and currency before recording sample tests.');
    const item = population.items.find(candidate => candidate.id === itemId);
    if (!item?.selected) throw new GuardError('INVALID_STATE', 'Select the population item before recording test results.');
    if (!Number.isFinite(auditedAmount) || auditedAmount < 0 || !notes.trim()) throw new GuardError('INVALID_STATE', 'Audited amount must be non-negative and testing notes are required.');
    item.auditedAmount = auditedAmount;
    item.difference = auditedAmount - (item.recordedAmount ?? item.amount);
    item.tested = true;
    item.result = item.difference === 0 ? 'Satisfactory' : 'Exception noted';
    item.notes = notes.trim();
    item.limitation = undefined;
    const engagement = this.state.engagements.find(candidate => candidate.id === population.engagementId);
    if (engagement) this.invalidateReleaseBasis(engagement);
    this.logEvent(`Sample item ${itemId} test recorded: ${item.result}`, populationId);
    this.notify();
  }

  public replaceSamplePopulationSource(populationId: string, fileName: string, sha256: string, rows: import('../types').SamplePopulationRow[]) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['preparer', 'manager', 'reviewer'], 'replace a sample population source');
    const population = this.state.samplePopulations.find(item => item.id === populationId);
    if (!population?.engagementId) throw new GuardError('INVALID_STATE', 'Population must be linked to an engagement.');
    requireEngagementScope(this.state, population.engagementId);
    if (!fileName.trim() || fileName.length > 255 || !/^[a-f0-9]{64}$/.test(sha256) || !rows.length) throw new GuardError('INVALID_STATE', 'A named source file, SHA-256 digest, and at least one valid population row are required.');
    const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
    const engagement = this.state.engagements.find(item => item.id === population.engagementId);
    if (!engagement || !population.accountCode || population.period !== engagement.year || population.currency !== engagement.currency) throw new GuardError('INVALID_STATE', 'Population must identify an account, period and currency in its engagement context.');
    if (rows.length > 20000 || !Number.isFinite(rows.reduce((sum, row) => sum + row.amount, 0)) || new Set(rows.map(row => row.itemRef)).size !== rows.length || new Set(rows.map(row => row.id)).size !== rows.length || rows.some(row => !row.id.trim() || !row.itemRef.trim() || !validDate(row.date) || !row.counterparty.trim() || !Number.isFinite(row.amount) || (row.period !== undefined && row.period !== population.period) || (row.currency !== undefined && row.currency !== population.currency) || row.selected || row.tested || row.result !== 'Untested')) throw new GuardError('INVALID_STATE', 'Population rows must be unique, dated, numeric, in the engagement period/currency, and unselected/untested before replacement.');
    population.sourceHistory ||= [];
    population.sourceHistory.push({
      revision: population.sourceRevision || 1,
      fileName: population.sourceFileName || 'Legacy sample population',
      sha256: population.sourceSha256 || '',
      importedAt: new Date().toISOString(),
      importedBy: this.state.currentUserId,
      totalPopulationCount: population.totalPopulationCount,
      totalPopulationValue: population.totalPopulationValue,
      items: structuredClone(population.items)
    });
    population.sourceRevision = (population.sourceRevision || 1) + 1;
    population.sourceFileName = fileName.trim();
    population.sourceSha256 = sha256;
    population.sourceComplete = true;
    population.items = structuredClone(rows).map(row => ({ ...row, selected: false, tested: false, result: 'Untested', notes: undefined, limitation: undefined, auditedAmount: undefined, difference: undefined, findingId: undefined }));
    population.totalPopulationCount = rows.length;
    population.totalPopulationValue = rows.reduce((sum, row) => sum + row.amount, 0);
    population.selectedCount = 0;
    population.selectedValue = 0;
    population.selectionVersion = (population.selectionVersion || 0) + 1;
    population.selectionPreparedBy = undefined;
    if (engagement) this.invalidateReleaseBasis(engagement);
    this.logEvent(`Population ${populationId} source replaced with revision ${population.sourceRevision}`, populationId);
    this.notify();
  }

  // --- Findings disposition (VP-054) -------------------------------------------
  public addFinding(input: Omit<PrototypeState['findings'][number], 'id' | 'disposition' | 'dispositionHistory'>) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['preparer', 'manager', 'reviewer', 'partner', 'eqr'], 'record audit findings');
    requireEngagementScope(this.state, input.engagementId);
    const engagement = this.state.engagements.find(item => item.id === input.engagementId);
    if (!engagement || !input.title.trim() || !input.condition?.trim() || !input.recommendation?.trim() || !input.affectedAccount?.trim() || !input.assertion?.trim()) throw new GuardError('INVALID_STATE', 'Finding title, condition, recommendation, account and assertion are required.');
    if (!['Monetary misstatement', 'Internal control deficiency', 'Disclosure omission'].includes(input.category || input.type || '')) throw new GuardError('INVALID_STATE', 'Choose a supported finding type.');
    if (!['Material', 'Significant', 'Minor', 'Trivial'].includes(input.severity || '')) throw new GuardError('INVALID_STATE', 'Choose a supported finding severity.');
    if (input.owner && !this.state.users.some(user => user.name === input.owner && user.status === 'Active')) throw new GuardError('INVALID_STATE', 'Finding owner must be an active practice identity.');
    const category = input.category || input.type!;
    const amount = input.amount;
    if (category === 'Monetary misstatement') {
      if (!Number.isFinite(amount) || amount === 0 || !/^[A-Z]{3}$/.test(input.currency || '')) throw new GuardError('INVALID_STATE', 'Monetary findings require a non-zero signed amount and ISO currency code.');
    } else if (amount !== undefined && amount !== 0) throw new GuardError('INVALID_STATE', 'Qualitative findings cannot carry a monetary amount.');
    const procedureExists = !input.linkedProcedureId || this.state.auditPrograms.some(program => (program.engagementId === input.engagementId || (!program.engagementId && input.engagementId === this.state.engagements[0]?.id)) && program.procedures.some(procedure => procedure.id === input.linkedProcedureId));
    const workpaper = input.linkedWorkpaperId && engagement.workpapers.find(item => item.id === input.linkedWorkpaperId);
    const evidence = input.linkedEvidenceId && this.state.evidenceCatalogue.find(item => item.id === input.linkedEvidenceId);
    const evidenceDocument = evidence && this.state.documents.find(item => item.id === evidence.documentId && item.clientId === engagement.client && (!item.engagementId || item.engagementId === engagement.id));
    const population = input.linkedSamplePopulationId && this.state.samplePopulations.find(item => item.id === input.linkedSamplePopulationId && item.engagementId === engagement.id);
    const sampleItem = population && population.items.find(item => item.id === input.linkedSampleItemId && (item.result === 'Exception noted' || item.result === 'Exception'));
    const journal = input.linkedJournalId && this.state.adjustmentJournals.find(item => item.id === input.linkedJournalId && item.engagementId === engagement.id);
    const review = input.linkedReviewNoteId && engagement.reviews.find(item => item.id === input.linkedReviewNoteId);
    if (!procedureExists || (input.linkedWorkpaperId && !workpaper) || (input.linkedEvidenceId && !evidenceDocument) || (input.linkedSamplePopulationId && !sampleItem) || (input.linkedJournalId && !journal) || (input.linkedReviewNoteId && !review)) throw new GuardError('FORBIDDEN_SCOPE', 'Every linked source must resolve within this engagement and client.');
    const sequence = Math.max(0, ...this.state.findings.map(item => Number(item.id.match(/^FND-(\d+)$/)?.[1] || 0))) + 1;
    const id = `FND-${String(sequence).padStart(3, '0')}`;
    const finding: PrototypeState['findings'][number] = {
      ...structuredClone(input), id, category, type: category,
      grossMisstatement: category === 'Monetary misstatement' ? Math.abs(amount!) : undefined,
      netMisstatement: category === 'Monetary misstatement' ? amount : undefined,
      disposition: 'Proposed for correction', dispositionHistory: []
    };
    this.state.findings.unshift(finding);
    if (sampleItem) sampleItem.findingId = id;
    this.invalidateReleaseBasis(engagement);
    this.logEvent(`Audit finding raised: ${finding.title}`, id);
    this.notify();
    return id;
  }

  public setFindingDisposition(findingId: string, disposition: PrototypeState['findings'][0]['disposition'], rationale: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'reviewer', 'partner'], 'record finding dispositions');
    const f = this.state.findings.find(x => x.id === findingId);
    if (!f) return;
    requireEngagementScope(this.state, f.engagementId);
    if (!rationale || !rationale.trim()) throw new GuardError('INVALID_STATE', 'Finding disposition requires human rationale.');
    if (disposition === f.disposition) throw new GuardError('INVALID_STATE', 'Choose a different finding disposition.');
    if (disposition === 'Corrected in TB') {
      const journal = f.linkedJournalId && this.state.adjustmentJournals.find(item => item.id === f.linkedJournalId && item.engagementId === f.engagementId);
      if (!journal || journal.status !== 'Reporting included' || journal.reflectionStatus !== 'Reflected in TB') throw new GuardError('INVALID_STATE', 'A finding can be marked corrected in the trial balance only when its linked reviewed journal is included and reflected.');
    }
    f.dispositionHistory ||= [];
    f.dispositionHistory.push({ disposition, from: f.disposition, actorId: this.state.currentUserId, rationale: rationale.trim(), at: new Date().toISOString() });
    f.disposition = disposition;
    const eng = this.state.engagements.find(e => e.id === f.engagementId);
    if (eng) this.invalidateReleaseBasis(eng);
    this.logEvent(`Finding ${findingId} disposition: ${disposition}`, findingId);
    this.notify();
  }

  // --- Amendment / reissue lineage (VP-058) ------------------------------------
  public prepareAmendedRelease(engId: string, reason: string) {
    this.reopenReleaseForAmendment(engId, reason);
  }

  // --- Firm settings apply prospectively (VP-062) -------------------------------
  public updateFirmSettings(patch: Partial<PrototypeState['firmSettings']>, reason = '') {
    requireActiveIdentity(this.state);
    requireGlobalAdmin(this.state, 'change firm settings');
    this.state.firmSettings = { ...this.state.firmSettings, ...patch };
    this.logEvent(`Firm settings updated${reason ? ': ' + reason : ''}`, 'FIRM');
    this.notify();
  }

  /** Fixture integrity snapshot for tests and the coverage report. */
  public checkIntegrity() {
    return validateFixtures(this.state);
  }

  // --- Release & Archive (VP-057, VP-058, VP-059) ---
  public evaluateReleaseReadiness(engId: string): { ready: boolean; reason?: string } {
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) return { ready: false, reason: 'Engagement not found' };

    if (!eng.acceptance || !eng.terms) return { ready: false, reason: 'Commercial acceptance or agreed terms are missing' };
    if (!eng.planning || !eng.sourceAccepted || !eng.mappingApproved) return { ready: false, reason: 'Planning, accepted source, or approved mapping is missing' };

    const allWpCleared = (eng.workpapers || []).every(w => !w.applicable || w.status === 'Not applicable' || (
      w.status === 'Cleared' && !!w.clearance && w.clearance.version === w.version && w.clearance.sourceVersion === eng.sourceVersion
    ));
    if (!allWpCleared) return { ready: false, reason: 'One or more workpapers are not cleared or marked N/A' };

    const allReviewsCleared = eng.reviews.every(r => r.status === 'Cleared');
    if (!allReviewsCleared) return { ready: false, reason: 'One or more review notes remain open' };

    const openMaterialFindings = this.state.findings.filter(
      f => f.engagementId === eng.id &&
        !['Corrected in TB', 'Corrected by client', 'Waived as immaterial', 'Uncorrected waived'].includes(f.disposition) &&
        (f.severity === 'Material' || f.severity === 'Significant')
    );
    if (openMaterialFindings.length > 0) return { ready: false, reason: 'Unresolved material findings exist' };

    const gen = eng.generation;
    const naturalPersonId = (id: string | undefined, name: string | undefined) => {
      const user = this.state.users.find(u => u.id === id) || this.state.users.find(u => u.name === name);
      return user?.personId || user?.id || name;
    };
    if (!eng.approvals.manager || eng.approvals.manager.generation !== gen || naturalPersonId(eng.approvals.manager.byUserId, eng.approvals.manager.by) === naturalPersonId(eng.approvals.partner?.byUserId, eng.approvals.partner?.by)) {
      return { ready: false, reason: `Manager clearance missing or invalid for generation ${gen}` };
    }
    if (!eng.approvals.client || eng.approvals.client.generation !== gen || (eng.approvals.client.byUserId && this.state.users.find(u => u.id === eng.approvals.client!.byUserId)?.role !== 'client')) {
      return { ready: false, reason: `Client management representation missing or invalid for generation ${gen}` };
    }
    if (!eng.approvals.partner || eng.approvals.partner.generation !== gen || (eng.approvals.partner.byUserId && this.state.users.find(u => u.id === eng.approvals.partner!.byUserId)?.role !== 'partner')) {
      return { ready: false, reason: `Partner sign-off missing or invalid for generation ${gen}` };
    }
    if (eng.eqrRequired) {
      if (!eng.approvals.eqr || eng.approvals.eqr.generation !== gen || (eng.approvals.eqr.byUserId && this.state.users.find(u => u.id === eng.approvals.eqr!.byUserId)?.role !== 'eqr')) {
        return { ready: false, reason: `EQR concurrence missing or invalid for generation ${gen}` };
      }
      if (eng.eqrConcerns?.some(c => !c.resolved)) {
        return { ready: false, reason: 'Unresolved EQR concerns remain' };
      }
    }

    return { ready: true };
  }

  public prepareReleaseCandidate(engId: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'prepare a release candidate');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) throw new GuardError('INVALID_STATE', `Engagement "${engId}" not found.`);

    const readiness = this.evaluateReleaseReadiness(engId);
    if (!readiness.ready) {
      throw new GuardError('INVALID_STATE', `Cannot prepare release candidate: ${readiness.reason}`);
    }

    const packageDefinition = eng.packageHistory?.find(p => p.revision === eng.packageRevision);
    const mappingRevision = Math.max(0, ...(this.state.accountMappingRevisions || []).filter(r => r.engagementId === engId).map(r => r.revision));
    if (!packageDefinition || packageDefinition.generation !== eng.generation || packageDefinition.sourceVersion !== eng.sourceVersion || packageDefinition.mappingRevision !== mappingRevision || !packageDefinition.validation.passed || packageDefinition.artifacts.length !== 3) throw new GuardError('INVALID_STATE', 'Cannot prepare release candidate: assemble a valid current package revision with current source/mapping and XLSX, DOCX and PDF artifacts first.');
    if (eng.candidate && eng.candidate.generation === eng.generation && eng.candidate.sourceVersion === eng.sourceVersion && eng.candidate.packageRevision === eng.packageRevision && eng.candidate.packageDefinitionId === packageDefinition.id) {
      return eng.candidate;
    }

    eng.candidate = {
      generation: eng.generation,
      preparedAt: new Date().toISOString(),
      preparedBy: this.state.currentPerson,
      preparedByUserId: this.state.currentUserId,
      sourceVersion: eng.sourceVersion,
      packageRevision: eng.packageRevision,
      packageDefinitionId: packageDefinition.id,
      manifest: structuredClone(packageDefinition.artifacts)
    };
    this.logEvent(`Release candidate frozen for ${eng.id} (Gen ${eng.generation})`, eng.id);
    this.notify();
    return eng.candidate;
  }

  public saveFinancialPackageRevision(record: import('../types').FinancialPackageRevision) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer'], 'assemble a financial package revision');
    if (this.isSessionOnly) throw new GuardError('INVALID_STATE', 'Browser state storage is unavailable; package revisions cannot be claimed as persisted.');
    requireEngagementScope(this.state, record.engagementId);
    const eng = this.state.engagements.find(e => e.id === record.engagementId);
    const requiredKinds = ['XLSX', 'DOCX', 'PDF'];
    const mappingRevision = Math.max(0, ...(this.state.accountMappingRevisions || []).filter(r => r.engagementId === record.engagementId).map(r => r.revision));
    if (!eng || record.revision !== eng.packageRevision + 1 || record.generation !== eng.generation + 1 || record.sourceVersion !== eng.sourceVersion || record.mappingRevision !== mappingRevision || record.noteRevision !== record.revision || record.artifacts.length !== 3 || new Set(record.artifacts.map(a => a.kind)).size !== 3 || requiredKinds.some(kind => !record.artifacts.some(a => a.kind === kind)) || record.artifacts.some(a => !a.id || !a.name || !a.mimeType || a.size <= 0 || !/^[0-9a-f]{64}$/i.test(a.sha256)) || !record.sections.some(s => s.enabled) || new Set(record.sections.map(s => s.id)).size !== record.sections.length || record.sections.some((s, i) => s.order !== i + 1)) throw new GuardError('INVALID_STATE', 'Package revision must be the next generation/version with current source/mapping, unique ordered sections, and genuine XLSX/DOCX artifact digests.');
    eng.packageHistory ||= [];
    if (eng.packageHistory.some(p => p.revision === record.revision || p.id === record.id) || this.state.engagements.some(other => other.packageHistory?.some(p => p.artifacts.some(a => record.artifacts.some(n => n.id === a.id))))) throw new GuardError('INVALID_STATE', 'Package revision or artifact identity already exists.');
    eng.packageHistory.push(structuredClone(record));
    eng.packageRevision = record.revision;
    this.invalidateReleaseBasis(eng);
    this.logEvent(`Financial package revision ${record.revision} assembled from source v${record.sourceVersion}`, eng.id);
    this.notify();
    if (this.isSessionOnly) throw new GuardError('INVALID_STATE', 'Browser storage could not persist the package definition; the revision is available only for this session.');
  }

  public issueRelease(engId: string, dispatchNote = '', recipients: string[] = []) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['partner'], 'issue a release record');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) throw new GuardError('INVALID_STATE', `Engagement "${engId}" not found.`);
    const assignedPartner = this.state.users.find(u => u.name === eng.partner && u.role === 'partner');
    const activeActor = this.state.users.find(u => u.id === this.state.currentUserId);
    if (!assignedPartner || !activeActor || (assignedPartner.personId || assignedPartner.id) !== (activeActor.personId || activeActor.id)) throw new GuardError('FORBIDDEN_SCOPE', 'Only the assigned engagement partner can issue this release record.');
    if (!eng.candidate) {
      throw new GuardError('INVALID_STATE', 'Cannot issue release: no release candidate prepared.');
    }
    if (eng.candidate.generation !== eng.generation) {
      throw new GuardError('STALE_REVISION', `Release candidate is stale: candidate generation is ${eng.candidate.generation}, but current engagement generation is ${eng.generation}.`);
    }
    if (eng.candidate.sourceVersion !== eng.sourceVersion || eng.candidate.packageRevision !== eng.packageRevision) throw new GuardError('STALE_REVISION', 'Release candidate no longer matches the pinned source and package revisions.');
    const packageDefinition = eng.packageHistory?.find(p => p.id === eng.candidate!.packageDefinitionId && p.revision === eng.packageRevision && p.generation === eng.generation);
    if (!packageDefinition || JSON.stringify(packageDefinition.artifacts) !== JSON.stringify(eng.candidate.manifest)) throw new GuardError('STALE_REVISION', 'Release candidate artifact identities no longer match the frozen package revision.');
    if ((eng.approvals.partner?.byUserId ? eng.approvals.partner.byUserId !== this.state.currentUserId : eng.approvals.partner?.by !== this.state.currentPerson) || eng.approvals.partner?.generation !== eng.generation) throw new GuardError('FORBIDDEN_SCOPE', 'The active partner must record current-generation sign-off before issue.');
    const seenRecipients = new Set<string>();
    const cleanRecipients = recipients.map(r => r.trim()).filter(r => {
      const key = r.toLowerCase();
      if (!r || seenRecipients.has(key)) return false;
      seenRecipients.add(key);
      return true;
    });
    if (cleanRecipients.length === 0) throw new GuardError('INVALID_STATE', 'Enter at least one distribution recipient for the local release record.');
    if (!dispatchNote.trim()) throw new GuardError('INVALID_STATE', 'A distribution note is required.');

    const alreadyReleased = eng.releases.some(r => r.generation === eng.generation);
    if (alreadyReleased) {
      throw new GuardError('INVALID_STATE', `Generation ${eng.generation} has already been released.`);
    }

    const readiness = this.evaluateReleaseReadiness(engId);
    if (!readiness.ready) {
      throw new GuardError('INVALID_STATE', `Cannot issue release: ${readiness.reason}`);
    }

    const releaseId = `REL-2600${eng.releases.length + 1}`;
    const prevRelease = eng.releases.at(-1);
    eng.releases.push({
      id: releaseId,
      version: eng.releases.length + 1,
      generation: eng.candidate.generation,
      releasedAt: new Date().toISOString(),
      releasedBy: this.state.currentPerson,
      delivered: false,
      dispatchNote,
      predecessorId: prevRelease ? prevRelease.id : undefined,
      recipients: cleanRecipients,
      manifest: eng.candidate.manifest.map((artifact, index) => ({ id: `M-${releaseId}-${index + 1}`, artifactId: artifact.id, name: artifact.name, type: artifact.kind, mimeType: artifact.mimeType, size: artifact.size, sha: artifact.sha256, sourceId: packageDefinition.id, sourceRevision: eng.packageRevision }))
    });
    eng.candidate = null;
    this.logEvent(`Report package released in demo: ${releaseId}`, eng.id);
    this.notify();
  }

  public reopenReleaseForAmendment(engId: string, reason: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'reopen a release for amendment');
    requireEngagementScope(this.state, engId);
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) throw new GuardError('INVALID_STATE', `Engagement "${engId}" was not found.`);
    if (!reason || !reason.trim()) throw new GuardError('INVALID_STATE', 'Amendment reason is required.');

    if (!eng.releases.length) throw new GuardError('INVALID_STATE', 'No issued release record exists to amend.');

    eng.packageRevision++;
    this.invalidateReleaseBasis(eng);
    this.logEvent(`Release re-opened for amendment: ${reason} (Gen ${eng.generation})`, eng.id);
    this.notify();
  }

  public prepareClientWorkspace(clientId: string, year = 2026, engagementId?: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['admin', 'onboarding', 'relationship', 'manager', 'partner'], 'prepare client workspaces');
    const client = this.state.clients.find(c => c.id === clientId);
    if (!client) throw new GuardError('INVALID_STATE', `Client "${clientId}" not found.`);
    requireClientScope(this.state, clientId);
    const matchingEngagements = this.state.engagements.filter(e => e.client === clientId && e.year === year);
    const engagement = engagementId
      ? matchingEngagements.find(e => e.id === engagementId)
      : matchingEngagements.length === 1 ? matchingEngagements[0] : undefined;
    if (engagementId && !engagement) throw new GuardError('INVALID_STATE', `Engagement "${engagementId}" does not match this client and year.`);
    if (!engagementId && matchingEngagements.length > 1) throw new GuardError('INVALID_STATE', 'Choose the exact engagement before preparing a year workspace.');
    const code = client.code;
    if (!this.state.folders) this.state.folders = [];
    const canonical = [
      { path: `/Clients/${code}/`, label: `${client.name} Root`, clientId },
      { path: `/Clients/${code}/${year}/`, label: `FY ${year} Records`, clientId, engagementId: engagement?.id },
      ...(engagement ? [{ path: `/Clients/${code}/${year}/${engagement.id}/`, label: `${engagement.id} Records`, clientId, engagementId: engagement.id }] : []),
      ...(engagement ? [
        { path: `/Clients/${code}/${year}/${engagement.id}/01_Acceptance/`, label: '01 Acceptance & KYC', clientId, engagementId: engagement.id },
        { path: `/Clients/${code}/${year}/${engagement.id}/02_Planning/`, label: '02 Audit Planning', clientId, engagementId: engagement.id },
        { path: `/Clients/${code}/${year}/${engagement.id}/03_Fieldwork/`, label: '03 Fieldwork', clientId, engagementId: engagement.id },
        { path: `/Clients/${code}/${year}/${engagement.id}/04_Deliverables/`, label: '04 Deliverables', clientId, engagementId: engagement.id },
        { path: `/Clients/${code}/${year}/${engagement.id}/05_Correspondence/`, label: '05 Correspondence', clientId, engagementId: engagement.id }
      ] : [])
    ];
    canonical.forEach(folder => {
      if (!this.state.folders!.some(f => f.path === folder.path)) {
        this.state.folders!.push(folder);
      }
    });
    this.logEvent(`Canonical SharePoint workspace prepared for client ${code}`, clientId);
    this.notify();
  }

  public archiveEngagement(engId: string, releaseId: string, retentionUntil?: string, onHold = false, holdReason?: string, artifactCopies?: ArchivedArtifactRecord[]) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['records', 'manager', 'partner'], 'create or update local archive metadata');
    requireEngagementScope(this.state, engId, 'records');
    const eng = this.state.engagements.find(e => e.id === engId);
    if (!eng) throw new GuardError('INVALID_STATE', `Engagement "${engId}" not found.`);

    // Verify release exists and is eligible (R14)
    const release = eng.releases.find(r => r.id === releaseId);
    if (!release) {
      throw new GuardError('INVALID_STATE', `Cannot archive: Release "${releaseId}" does not exist for engagement "${engId}".`);
    }

    if (!release.manifest.length) throw new GuardError('INVALID_STATE', 'Cannot create an archive index without a release manifest.');
    const normalizedRetentionUntil = retentionUntil?.trim() || undefined;
    if (normalizedRetentionUntil && (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedRetentionUntil) || Number.isNaN(Date.parse(normalizedRetentionUntil)) || new Date(`${normalizedRetentionUntil}T00:00:00Z`).toISOString().slice(0, 10) !== normalizedRetentionUntil)) throw new GuardError('INVALID_STATE', 'Enter a valid retention date.');
    if (onHold && !holdReason?.trim()) throw new GuardError('INVALID_STATE', 'An application hold requires a reason.');
    if (!this.state.archives) this.state.archives = [];
    const existing = this.state.archives.find(a => a.engagementId === eng.id && a.releaseId === releaseId);
    const previousArchive = existing ? undefined : [...this.state.archives].reverse().find(a => a.engagementId === eng.id);
    const archiveArtifacts = existing?.artifacts || artifactCopies;
    if (!archiveArtifacts || archiveArtifacts.length !== release.manifest.length || release.manifest.some(m => !archiveArtifacts.some(a => a.sourceArtifactId === m.artifactId && a.sha256 === m.sha))) {
      throw new GuardError('INVALID_STATE', 'Cannot archive until exact release artifact bytes are copied and verified.');
    }
    const archiveManifest = release.manifest.map(m => `${m.id} · ${m.name} · SHA-256 ${m.sha}`);
    const before = existing ? { releaseId: existing.releaseId, retentionUntil: existing.retentionUntil, onHold: Boolean(existing.onApplicationHold ?? existing.onHold), holdReason: existing.holdReason } : undefined;
    const after = { releaseId, retentionUntil: normalizedRetentionUntil, onHold, holdReason: onHold ? holdReason?.trim() : undefined };
    const changed = !before || before.retentionUntil !== after.retentionUntil || before.onHold !== after.onHold || before.holdReason !== after.holdReason;
    const action: ArchiveHistoryEntry['action'] | undefined = !before
      ? previousArchive ? 'Successor release archived' : 'Archived'
      : before.onHold !== after.onHold ? after.onHold ? 'Application hold placed' : 'Application hold lifted'
        : changed ? 'Metadata corrected' : undefined;
    const history: ArchiveHistoryEntry[] = [...(existing?.history || (existing ? [{ action: 'Existing archive state' as const, actorId: existing.archivedBy, at: existing.archivedAt, after: before! }] : []))];
    if (action) history.push({ action, actorId: this.state.currentUserId, at: new Date().toISOString(), before, after });
    const predecessorArchiveId = existing?.predecessorArchiveId || previousArchive?.id;
    const archiveData = {
      archivedAt: existing?.archivedAt || new Date().toISOString(),
      archivedBy: existing?.archivedBy || this.state.currentPerson,
      releaseId,
      manifest: archiveManifest,
      artifacts: archiveArtifacts,
      retentionUntil: normalizedRetentionUntil,
      onApplicationHold: onHold,
      holdReason: after.holdReason,
      predecessorArchiveId,
      history
    };
    eng.archive = archiveData;

    const client = this.state.clients.find(c => c.id === eng.client);
    const archiveRecord: ArchiveRecord = {
      id: existing?.id || `ARC-${eng.id}-${releaseId}`,
      engagementId: eng.id,
      releaseId,
      clientName: client?.name || eng.client,
      service: eng.service,
      year: eng.year,
      archivedAt: archiveData.archivedAt,
      archivedBy: archiveData.archivedBy,
      manifest: archiveManifest,
      artifacts: archiveArtifacts,
      manifestCount: archiveManifest.length,
      retentionUntil: archiveData.retentionUntil,
      onHold,
      onApplicationHold: onHold,
      holdReason: after.holdReason,
      predecessorArchiveId,
      history
    };
    if (existing) Object.assign(existing, archiveRecord, { handoverRequested: existing.handoverRequested, handoverRequester: existing.handoverRequester, handoverNotes: existing.handoverNotes });
    else this.state.archives.push(archiveRecord);

    this.logEvent(`Engagement ${eng.id} archived with ${archiveArtifacts.length} verified artifact copies`, eng.id);
    this.notify();
  }

  public recordArchiveHandover(engId: string, requester: string, reason: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner', 'records'], 'record an archive handover request');
    requireEngagementScope(this.state, engId, 'records');
    const archive = this.state.archives?.find(a => a.engagementId === engId);
    if (!archive) throw new GuardError('INVALID_STATE', 'The engagement must have a local archive index first.');
    if (archive.onHold) throw new GuardError('INVALID_STATE', 'An active application hold blocks the handover request.');
    if (!requester.trim() || !reason.trim()) throw new GuardError('INVALID_STATE', 'Handover requester and reason are required.');
    archive.handoverRequested = true;
    archive.handoverRequester = requester.trim();
    archive.handoverNotes = `${reason.trim()} · recorded by ${this.state.currentPerson} on ${this.state.asOfDate}`;
    this.logEvent(`Archive handover request recorded for ${requester.trim()}: ${reason.trim()}`, engId);
    this.notify();
  }

  // --- Client Acceptance & Continuance (VP-047 / R12) ---
  public saveAcceptanceCase(accCase: AcceptanceCaseRecord) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['onboarding', 'compliance', 'manager', 'reviewer'], 'record an acceptance recommendation');
    requireClientScope(this.state, accCase.clientId);
    if (!this.state.clients.some(c => c.id === accCase.clientId) || !Number.isInteger(accCase.year) || !accCase.recommendationNotes.trim()) throw new GuardError('INVALID_STATE', 'Acceptance case needs an existing client, reporting year, and recommendation rationale.');
    const requiredEvidence = { amlKyc: accCase.amlKycCompleted, independence: accCase.independenceConfirmed, conflicts: accCase.conflictsCleared, prohibitions: accCase.prohibitionsChecked, competence: accCase.competenceConfirmed };
    if (Object.entries(requiredEvidence).some(([key, checked]) => checked && !accCase.screeningEvidence?.[key as keyof typeof requiredEvidence]?.trim())) throw new GuardError('INVALID_STATE', 'Every completed acceptance screening check needs an evidence reference.');
    if (!this.state.acceptanceCases) this.state.acceptanceCases = [];
    const idx = this.state.acceptanceCases.findIndex(c => c.id === accCase.id);
    const previous = idx >= 0 ? this.state.acceptanceCases[idx] : undefined;
    const linkedEngagement = this.state.engagements.find(e => e.client === accCase.clientId && e.year === accCase.year);
    const at = new Date().toISOString();
    const saved: AcceptanceCaseRecord = {
      ...accCase,
      engagementId: accCase.engagementId || linkedEngagement?.id,
      decisionStatus: 'Pending',
      decisionBy: undefined,
      decisionByUserId: undefined,
      decisionDate: undefined,
      decisionNotes: undefined,
      recommendationBy: this.state.currentPerson,
      recommendationByUserId: this.state.currentUserId,
      recommendationDate: at,
      history: [...(previous?.history || []), { action: 'recommendation', by: this.state.currentPerson, byUserId: this.state.currentUserId, at, notes: accCase.recommendationNotes, status: 'Pending', screeningEvidence: structuredClone(accCase.screeningEvidence || {}) }]
    };
    if (idx >= 0) this.state.acceptanceCases[idx] = saved;
    else this.state.acceptanceCases.push(saved);
    const eng = this.state.engagements.find(e => e.client === accCase.clientId && e.year === accCase.year);
    if (eng) {
      eng.acceptance = false;
      this.invalidateReleaseBasis(eng);
    }
    this.logEvent(`Acceptance recommendation saved for client ${accCase.clientId} (partner decision pending)`, accCase.clientId);
    this.notify();
  }

  public decideAcceptanceCase(caseId: string, decision: 'Accepted' | 'Declined', rationale: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['partner'], 'record the client acceptance decision');
    const record = this.state.acceptanceCases?.find(c => c.id === caseId);
    if (!record) throw new GuardError('INVALID_STATE', 'Acceptance case was not found.');
    requireClientScope(this.state, record.clientId);
    const eng = this.state.engagements.find(e => e.id === record.engagementId) || this.state.engagements.find(e => e.client === record.clientId && e.year === record.year);
    if (!eng) throw new GuardError('INVALID_STATE', 'Acceptance decision must be bound to an engagement.');
    requireEngagementScope(this.state, eng.id);
    const assignedPartner = this.state.users.find(u => u.name === eng.partner && u.role === 'partner');
    const actor = this.state.users.find(u => u.id === this.state.currentUserId);
    if (!assignedPartner || !actor || (assignedPartner.personId || assignedPartner.id) !== (actor.personId || actor.id)) throw new GuardError('FORBIDDEN_SCOPE', 'Only the assigned engagement partner can decide this case.');
    if (!rationale.trim()) throw new GuardError('INVALID_STATE', 'Partner decision requires a rationale.');
    if (decision === 'Accepted' && (record.riskRating === 'Prohibited' || !record.independenceConfirmed || !record.amlKycCompleted || !record.conflictsCleared || !record.prohibitionsChecked || !record.competenceConfirmed || ['amlKyc', 'independence', 'conflicts', 'prohibitions', 'competence'].some(key => !record.screeningEvidence?.[key as keyof NonNullable<AcceptanceCaseRecord['screeningEvidence']>]?.trim()))) throw new GuardError('INVALID_STATE', 'Acceptance is blocked until all required checks have evidence references and the mandate is not prohibited.');
    requireIndependentActor(record.recommendationByUserId || record.recommendationBy, this.state.currentUserId, 'decide a case they recommended', this.state);
    const at = new Date().toISOString();
    record.decisionStatus = decision;
    record.decisionBy = this.state.currentPerson;
    record.decisionByUserId = this.state.currentUserId;
    record.decisionDate = at;
    record.decisionNotes = rationale.trim();
    record.history ||= [];
    record.history.push({ action: 'decision', by: this.state.currentPerson, byUserId: this.state.currentUserId, at, notes: rationale.trim(), status: decision });
    eng.acceptance = decision === 'Accepted';
    this.invalidateReleaseBasis(eng);
    this.logEvent(`Partner ${decision.toLowerCase()} client acceptance case ${caseId}`, eng.id);
    this.notify();
  }

  public createContinuanceDraft(priorEngagementId: string, changedFacts: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'partner'], 'create a continuance draft');
    requireEngagementScope(this.state, priorEngagementId);
    const prior = this.state.engagements.find(e => e.id === priorEngagementId);
    if (!prior) throw new GuardError('INVALID_STATE', 'Prior-period engagement was not found.');
    const caseRecord = this.state.acceptanceCases?.find(c => c.clientId === prior.client && c.year === prior.year);
    const assignedPartner = this.state.users.find(u => u.name === prior.partner && u.role === 'partner');
    if (!prior.acceptance || !caseRecord || (caseRecord.engagementId && caseRecord.engagementId !== prior.id) || caseRecord.decisionStatus !== 'Accepted' || !caseRecord.decisionByUserId || !assignedPartner || (assignedPartner.personId || assignedPartner.id) !== (this.state.users.find(u => u.id === caseRecord.decisionByUserId)?.personId || caseRecord.decisionByUserId)) throw new GuardError('INVALID_STATE', 'A separately accepted prior-period continuance case is required.');
    if (!changedFacts.trim()) throw new GuardError('INVALID_STATE', 'Record current-period changes from the prior period before creating a draft.');
    if (caseRecord.continuedToEngagementId) {
      const existing = this.state.engagements.find(e => e.id === caseRecord.continuedToEngagementId);
      if (existing) return existing;
    }

    const year = prior.year + 1;
    const id = `ENG-CONT-${prior.client}-${year}`;
    if (this.state.engagements.some(e => e.id === id)) throw new GuardError('INVALID_STATE', 'A next-period engagement already exists without a matching continuance link.');
    const dueMonthDay = /^\d{4}-\d{2}-\d{2}$/.test(prior.due) ? prior.due.slice(5) : '09-28';
    const draft: EngagementRecord = {
      ...prior,
      id,
      continuanceFromEngagementId: prior.id,
      continuanceCaseId: caseRecord.id,
      continuanceNotes: changedFacts.trim(),
      stage: 'Acceptance pending',
      year,
      period: `01 Jan – 31 Dec ${year}`,
      due: `${year}-${dueMonthDay}`,
      agreedFee: 0,
      proposalId: undefined,
      acceptance: false,
      terms: false,
      planning: false,
      sourceAccepted: false,
      mappingApproved: false,
      generation: 0,
      packageRevision: 1,
      builtGeneration: 0,
      sourceVersion: 0,
      sourceHistory: [],
      packageHistory: [],
      candidate: null,
      releases: [],
      archive: null,
      approvals: { manager: null, client: null, partner: null, eqr: null },
      approvalHistory: [],
      eqrConcerns: [],
      rows: [],
      adjustment: 0,
      journalState: 'Draft',
      sourceReflection: false,
      supplements: false,
      reconciliations: [],
      workpapers: [],
      reviews: [],
      pbc: [],
      annual: { confirmed: [], decision: null, nextId: null },
      questionnaire: { answers: {}, status: 'Not started' },
      events: [{ text: `Fresh period draft linked to ${prior.id}; changed facts recorded`, ref: id, time: new Date().toISOString(), type: 'history' }]
    };
    this.assignAccountingPeriod(draft);
    this.state.engagements.push(draft);
    caseRecord.changedFacts = changedFacts.trim();
    caseRecord.continuedToEngagementId = id;
    this.state.selectedEngagement = id;
    this.logEvent(`Fresh FY${year} continuance draft created from ${prior.id}`, id);
    this.notify();
    return draft;
  }

  // --- Audit Planning & Materiality (VP-048 / R12) ---
  public saveAuditPlan(plan: AuditPlanRecord) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['manager', 'preparer', 'partner'], 'prepare an audit plan');
    requireEngagementScope(this.state, plan.engagementId);
    if (!this.state.auditPlans) this.state.auditPlans = [];
    const engPlans = this.state.auditPlans.filter(p => p.engagementId === plan.engagementId);
    const latest = engPlans.reduce<AuditPlanRecord | undefined>((current, item) => !current || item.version > current.version ? item : current, undefined);
    if (plan.version !== (latest?.version || 0) + 1 || plan.status !== 'Under review') throw new GuardError('STALE_REVISION', `New audit plan must be the next version and start under review (expected v${(latest?.version || 0) + 1}).`);
    if (!Number.isFinite(plan.benchmarkValue) || plan.benchmarkValue <= 0 || !Number.isFinite(plan.materialityRate) || plan.materialityRate <= 0 || !plan.rationales.some(r => r.trim())) throw new GuardError('INVALID_STATE', 'Audit plan needs a positive benchmark, rate, and rationale.');
    if (latest) latest.status = 'Superseded';
    plan.preparedBy = this.state.currentPerson;
    plan.preparedByUserId = this.state.currentUserId;
    plan.preparedAt = new Date().toISOString();
    this.state.auditPlans.push(plan);
    const eng = this.state.engagements.find(e => e.id === plan.engagementId);
    if (eng) {
      eng.planning = false;
      this.invalidateReleaseBasis(eng);
    }
    this.logEvent(`Audit plan ${plan.id} saved as v${plan.version} under review`, plan.engagementId);
    this.notify();
  }

  public reviewAuditPlan(planId: string, approved: boolean, notes: string) {
    requireActiveIdentity(this.state);
    if (!this.state.auditPlans) return;
    const plan = this.state.auditPlans.find(p => p.id === planId);
    if (!plan) return;
    requireRole(this.state, ['manager', 'reviewer', 'partner'], 'review audit plans');
    requireEngagementScope(this.state, plan.engagementId);
    if (plan.status !== 'Under review') throw new GuardError('STALE_REVISION', 'Only the current under-review plan can be reviewed.');
    if (!notes.trim()) throw new GuardError('INVALID_STATE', 'Plan review requires recorded notes.');
    requireIndependentActor(plan.preparedByUserId || plan.preparedBy || '', this.state.currentUserId, 'review this audit plan', this.state);
    plan.status = approved ? 'Approved' : 'Draft';
    plan.reviewedBy = this.state.currentPerson;
    plan.reviewedByUserId = this.state.currentUserId;
    plan.reviewedAt = new Date().toISOString();
    plan.reviewNotes = notes.trim();
    const eng = this.state.engagements.find(e => e.id === plan.engagementId);
    if (eng) {
      eng.planning = approved;
      this.invalidateReleaseBasis(eng);
    }
    this.logEvent(`Audit plan ${plan.id} review recorded: ${plan.status}`, plan.engagementId);
    this.notify();
  }

  // --- M365 Setup (VP-017, VP-022) ---
  public updateM365Config(config: PrototypeState['m365Config']) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['admin', 'manager', 'partner'], 'change simulated Microsoft configuration');
    const prev = this.state.m365Config;
    if (!Array.isArray(config.permittedUsers) || new Set(config.permittedUsers.map(u => u.userId)).size !== config.permittedUsers.length || config.permittedUsers.some(u => !this.state.users.some(person => person.id === u.userId && person.status === 'Active') || !this.state.users.some(person => person.role === u.role && person.status === 'Active'))) throw new GuardError('INVALID_STATE', 'Permitted-person mappings must use unique active personas and active AuditSphere roles.');
    const changed = prev.tenantId !== config.tenantId ||
      prev.tenantName !== config.tenantName ||
      prev.sharePointSite !== config.sharePointSite ||
      prev.sharePointLibrary !== config.sharePointLibrary ||
      prev.folderRoot !== config.folderRoot ||
      prev.mailSenderAccount !== config.mailSenderAccount ||
      prev.oneDriveEnabled !== config.oneDriveEnabled ||
      JSON.stringify(prev.permittedUserGroups) !== JSON.stringify(config.permittedUserGroups) ||
      JSON.stringify(prev.permittedUsers || []) !== JSON.stringify(config.permittedUsers);
    this.state.m365Config = {
      ...config,
      liveConnected: false,
      configRevision: (prev.configRevision || 1) + Number(changed),
      verificationResults: prev.verificationResults || {},
      status: changed ? 'Not configured' : prev.status
    };
    this.notify();
  }

  public simulateM365Verification(card: 'identity' | 'sharepoint' | 'mail' | 'onedrive', outcome: string) {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['admin', 'manager', 'partner'], 'run Microsoft service simulations');
    if (!['success', 'access-denied', 'missing-resource', 'expired-session', 'throttled', 'unavailable'].includes(outcome)) {
      throw new GuardError('INVALID_STATE', `Unsupported simulation outcome "${outcome}".`);
    }
    const config = this.state.m365Config;
    if (card === 'identity' && outcome === 'success' && (!config.permittedUsers?.length || config.permittedUsers.some(u => !this.state.users.some(person => person.id === u.userId && person.status === 'Active')))) throw new GuardError('INVALID_STATE', 'Select at least one active permitted person before a successful identity simulation.');
    if (card === 'mail' && !config.mailSenderAccount.trim()) throw new GuardError('INVALID_STATE', 'Mail verification requires a saved sender selection.');
    if (card === 'onedrive' && !config.oneDriveEnabled) throw new GuardError('INVALID_STATE', 'OneDrive simulation is disabled.');
    const resourceId = card === 'identity' ? `${config.tenantId}|${config.permittedUsers.map(u => `${u.userId}:${u.role}`).join(',')}`
      : card === 'sharepoint' ? `${config.tenantId}|${config.sharePointSite}|${config.sharePointLibrary}|${config.folderRoot}`
        : card === 'mail' ? `${config.tenantId}|${config.mailSenderAccount}`
          : `${config.tenantId}|${config.folderRoot}`;
    const revision = config.configRevision || 1;
    config.verificationResults = {
      ...config.verificationResults,
      [card]: { outcome, testedAt: new Date().toISOString(), configRevision: revision, resourceId }
    };
    const required = ['identity', 'sharepoint'] as const;
    config.status = required.every(key => config.verificationResults?.[key]?.outcome === 'success' && config.verificationResults[key]?.configRevision === revision)
      ? 'Simulated verified'
      : outcome === 'success' ? 'Not configured' : 'Simulated error';
    config.lastSimulatedVerification = new Date().toISOString();
    config.liveConnected = false;
    this.logEvent(`M365 ${card} simulation: ${outcome}`, resourceId);
    this.notify();
  }

  public simulateM365Disconnect() {
    requireActiveIdentity(this.state);
    requireRole(this.state, ['admin', 'manager', 'partner'], 'disconnect the simulated Microsoft configuration');
    this.state.m365Config.status = 'Disconnected';
    this.state.m365Config.configRevision = (this.state.m365Config.configRevision || 1) + 1;
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
