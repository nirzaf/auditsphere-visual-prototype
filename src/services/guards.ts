// AuditSphere shared command guards — VP-002/VP-003/VP-019/VP-056
// Single place for demo person, active status, role grant, scope, revision and
// separation-of-duties checks. UI actions AND programmatic command calls must use
// these so tests exercise the same rules as the browser.
// Browser-local only: these illustrate intended production behaviour; browser data
// remains inspectable by the browser owner.

import type { PrototypeState, RoleKey, RouteKey } from '../types';

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

export function activePersona(state: PrototypeState) {
  const user = state.users.find(u => u.id === state.currentUserId);
  return user
    ? { id: user.id, personId: user.personId || user.id, name: user.name, role: user.role, active: user.status === 'Active' && state.currentPerson === user.name && state.currentRole === user.role }
    : { id: '', personId: '', name: state.currentPerson, role: state.currentRole, active: false };
}

export function requireActiveIdentity(state: PrototypeState): void {
  const persona = activePersona(state);
  if (!persona.id || state.currentPerson !== persona.name || state.currentRole !== persona.role) {
    throw new GuardError('DISABLED_IDENTITY', `Identity "${state.currentPerson}" is not recognized.`);
  }
  if (!persona.active) {
    throw new GuardError('DISABLED_IDENTITY', `Identity "${persona.name}" is disabled and cannot perform business commands.`);
  }
}

/** Narrow grants: Global sees all; Client sees one client; Engagement sees one engagement.
 * Grants bind to immutable persona IDs. Revoking grants results in zero access,
 * never fallback to another person's grants. */
export function visibleClientIds(state: PrototypeState, userId = state.currentUserId): string[] | 'ALL' {
  const user = state.users.find(u => u.id === userId && u.status === 'Active');
  if (!user || (userId === state.currentUserId && !activePersona(state).active)) return [];
  const today = state.asOfDate || new Date().toISOString().slice(0, 10);
  const grants = state.roleGrants.filter(g => g.userId === userId && g.role === user.role && (!g.effectiveFrom || g.effectiveFrom <= today) && (!g.expiresAt || g.expiresAt >= today));
  if (grants.length === 0) return [];
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

export function visibleEngagementIds(state: PrototypeState, userId = state.currentUserId): string[] | 'ALL' {
  const user = state.users.find(u => u.id === userId && u.status === 'Active');
  if (!user || (userId === state.currentUserId && !activePersona(state).active)) return [];
  const today = state.asOfDate || new Date().toISOString().slice(0, 10);
  const grants = state.roleGrants.filter(g => g.userId === userId && g.role === user.role && (!g.effectiveFrom || g.effectiveFrom <= today) && (!g.expiresAt || g.expiresAt >= today));
  if (grants.length === 0) return [];
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
export function requireIndependentActor(preparer: string, actor: string, action: string, state?: PrototypeState): void {
  const naturalId = (identity: string) => {
    const user = state?.users.find(u => u.id === identity || u.name === identity);
    return user?.personId || user?.id || identity;
  };
  if (naturalId(preparer) === naturalId(actor)) {
    throw new GuardError('SELF_APPROVAL', `Separation of duties: ${actor} cannot ${action}; the same person cannot review their own work, even under a different role label.`);
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

const PROFESSIONAL_ROUTES: RouteKey[] = [
  'overview', 'clients', 'client-detail', 'proposals', 'engagements', 'jobs', 'job-templates',
  'documents', 'communications', 'my-time', 'budgets', 'billing', 'receivables',
  'accounting-setup', 'trial-balance', 'gl-transactions', 'account-mappings', 'adjustments',
  'reconciliations', 'financial-statements', 'financial-packages', 'consolidation', 'onboarding',
  'audit-planning', 'audit-risks', 'audit-fieldwork', 'sampling', 'audit', 'evidence', 'findings',
  'reviews', 'approvals', 'quality', 'delivery', 'records', 'reports', 'portal', 'm365-setup', 'requirements'
];

/** Shared UI route policy; App checks it again so direct navigation cannot bypass the sidebar. */
export function canOpenRoute(role: RoleKey, route: RouteKey): boolean {
  if (route === 'requirements') return true;
  if (isClientRole(role)) return route === 'portal';
  if (role === 'partner') return PROFESSIONAL_ROUTES.includes(route);
  if (role === 'manager') return PROFESSIONAL_ROUTES.includes(route) && route !== 'administration';
  if (role === 'reviewer') return ['overview', 'engagements', 'jobs', 'documents', 'communications', 'my-time', 'budgets', 'accounting-setup', 'trial-balance', 'gl-transactions', 'account-mappings', 'adjustments', 'reconciliations', 'financial-statements', 'financial-packages', 'audit-planning', 'audit-risks', 'audit-fieldwork', 'sampling', 'audit', 'evidence', 'findings', 'reviews', 'approvals', 'quality', 'requirements'].includes(route);
  if (role === 'preparer') return ['overview', 'engagements', 'jobs', 'documents', 'communications', 'my-time', 'budgets', 'accounting-setup', 'trial-balance', 'gl-transactions', 'account-mappings', 'adjustments', 'reconciliations', 'financial-statements', 'audit-planning', 'audit-risks', 'audit-fieldwork', 'sampling', 'audit', 'evidence', 'findings', 'requirements'].includes(route);
  if (role === 'eqr') return ['overview', 'engagements', 'documents', 'accounting-setup', 'trial-balance', 'financial-statements', 'financial-packages', 'audit-planning', 'audit-risks', 'audit', 'evidence', 'findings', 'reviews', 'approvals', 'quality', 'delivery', 'records', 'requirements'].includes(route);
  if (role === 'relationship') return ['overview', 'clients', 'client-detail', 'acquisition', 'proposals', 'engagements', 'communications', 'requirements'].includes(route);
  if (role === 'onboarding') return ['overview', 'clients', 'client-detail', 'engagements', 'documents', 'communications', 'onboarding', 'portal', 'requirements'].includes(route);
  if (role === 'compliance') return ['overview', 'clients', 'client-detail', 'engagements', 'documents', 'onboarding', 'approvals', 'requirements'].includes(route);
  if (role === 'billing') return ['overview', 'clients', 'my-time', 'budgets', 'billing', 'receivables', 'reports', 'requirements'].includes(route);
  if (role === 'records') return ['overview', 'clients', 'documents', 'records', 'reports', 'requirements'].includes(route);
  if (role === 'admin') return ['overview', 'administration', 'm365-setup', 'requirements'].includes(route);
  return false;
}
