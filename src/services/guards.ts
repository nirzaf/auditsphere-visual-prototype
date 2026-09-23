// AuditSphere shared command guards — VP-002/VP-003/VP-019/VP-056
// Single place for demo person, active status, role grant, scope, revision and
// separation-of-duties checks. UI actions AND programmatic command calls must use
// these so tests exercise the same rules as the browser.
// Browser-local only: these illustrate intended production behaviour; browser data
// remains inspectable by the browser owner.

import type { PrototypeState, RoleKey } from '../types';

export interface CommandContext {
  person: string;
  role: RoleKey;
  expectedRevision?: number;
  actualRevision?: number;
}

export class GuardError extends Error {
  code: 'FORBIDDEN_SCOPE' | 'SELF_APPROVAL' | 'STALE_REVISION' | 'DISABLED_IDENTITY' | 'INVALID_STATE';
  constructor(code: GuardError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

export function activePersona(state: PrototypeState): { name: string; role: RoleKey; active: boolean } {
  const user = state.users.find(u => u.name === state.currentPerson)
    ?? state.users.find(u => u.role === state.currentRole)
    ?? state.users[0];
  return { name: user.name, role: state.currentRole, active: user.status === 'Active' };
}

export function requireActiveIdentity(state: PrototypeState): void {
  const persona = activePersona(state);
  const record = state.users.find(u => u.name === persona.name);
  if (!record || record.status !== 'Active') {
    throw new GuardError('DISABLED_IDENTITY', `Identity "${persona.name}" is disabled and cannot perform business commands.`);
  }
}

/** Narrow grants: Global sees all; Client sees one client; Engagement sees one engagement.
 * Grants bind to the natural person name (userId). Legacy payloads that keyed
 * grants by role are honoured only when no person-named grant exists. */
export function visibleClientIds(state: PrototypeState, personName?: string): string[] | 'ALL' {
  const person = personName ?? state.currentPerson;
  const personGrants = state.roleGrants.filter(g => g.userId === person);
  const grants = personGrants.length > 0 ? personGrants : state.roleGrants.filter(g =>
    state.users.find(u => u.name === person)?.role === g.role);
  if (grants.some(g => g.scopeKind === 'Global')) return 'ALL';
  const clients = new Set<string>();
  for (const g of grants) {
    if (g.scopeKind === 'Client' && g.scopeId) clients.add(g.scopeId);
    if (g.scopeKind === 'Engagement' && g.scopeId) {
      const eng = state.engagements.find(e => e.id === g.scopeId);
      if (eng) clients.add(eng.client);
    }
  }
  return [...clients];
}

export function visibleEngagementIds(state: PrototypeState): string[] | 'ALL' {
  const personGrants = state.roleGrants.filter(g => g.userId === state.currentPerson);
  const grants = personGrants.length > 0 ? personGrants : state.roleGrants.filter(g =>
    state.users.find(u => u.name === state.currentPerson)?.role === g.role);
  if (grants.some(g => g.scopeKind === 'Global')) return 'ALL';
  const engs = new Set<string>();
  for (const g of grants) {
    if (g.scopeKind === 'Engagement' && g.scopeId) engs.add(g.scopeId);
    if (g.scopeKind === 'Client' && g.scopeId) {
      state.engagements.filter(e => e.client === g.scopeId).forEach(e => engs.add(e.id));
    }
  }
  return [...engs];
}

export function requireClientScope(state: PrototypeState, clientId: string): void {
  const visible = visibleClientIds(state);
  if (visible !== 'ALL' && !visible.includes(clientId)) {
    throw new GuardError('FORBIDDEN_SCOPE', `Client "${clientId}" is outside the current scoped grant.`);
  }
}

export function requireEngagementScope(state: PrototypeState, engagementId: string): void {
  const visible = visibleEngagementIds(state);
  if (visible !== 'ALL' && !visible.includes(engagementId)) {
    throw new GuardError('FORBIDDEN_SCOPE', `Engagement "${engagementId}" is outside the current scoped grant.`);
  }
}

/** Same natural person cannot approve their own preparation by switching role labels. */
export function requireIndependentActor(preparerName: string, actorName: string, action: string): void {
  if (preparerName === actorName) {
    throw new GuardError('SELF_APPROVAL', `Separation of duties: ${actorName} cannot ${action} their own work, even under a different role label.`);
  }
}

export function requireRevision(expected: number | undefined, actual: number, subject: string): void {
  if (expected !== undefined && expected !== actual) {
    throw new GuardError('STALE_REVISION', `Stale ${subject}: expected revision ${expected} but found ${actual}. Reload and retry.`);
  }
}

/** Client views must never receive staff economics, internal notes or presenter exports. */
export const CLIENT_ROLES: RoleKey[] = ['client_admin', 'client_finance', 'client'];
export function isClientRole(role: RoleKey): boolean {
  return (CLIENT_ROLES as string[]).includes(role);
}
