// AuditSphere schema migrations + fixture integrity — VP-004
// Versioned browser-local metadata persistence. Preserve previous payload before
// migration, migrate deterministically, validate references, never silently reset.

import type { PrototypeState } from '../types';

export const CURRENT_SCHEMA = 4;

export interface MigrationResult {
  state: PrototypeState;
  migratedFrom: number;
  warnings: string[];
}

export interface IntegrityIssue {
  code: string;
  message: string;
}

/** Validate foreign references, dates, money control totals, no binary payloads. */
export function validateFixtures(state: PrototypeState): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const clientIds = new Set(state.clients.map(c => c.id));
  const engIds = new Set(state.engagements.map(e => e.id));
  const jobIds = new Set(state.jobs.map(j => j.id));
  const taskIds = new Set(state.jobTasks.map(t => t.id));

  for (const e of state.engagements) {
    if (!clientIds.has(e.client)) {
      issues.push({ code: 'FK_ENGAGEMENT_CLIENT', message: `Engagement ${e.id} references unknown client ${e.client}` });
    }
  }
  for (const j of state.jobs) {
    if (!clientIds.has(j.clientId)) issues.push({ code: 'FK_JOB_CLIENT', message: `Job ${j.id} references unknown client ${j.clientId}` });
    if (!engIds.has(j.engagementId)) issues.push({ code: 'FK_JOB_ENGAGEMENT', message: `Job ${j.id} references unknown engagement ${j.engagementId}` });
  }
  for (const t of state.jobTasks) {
    if (!jobIds.has(t.jobId)) issues.push({ code: 'FK_TASK_JOB', message: `Task ${t.id} references unknown job ${t.jobId}` });
    if (t.parentTaskId) {
      if (!taskIds.has(t.parentTaskId)) {
        issues.push({ code: 'FK_SUBTASK_PARENT', message: `Subtask ${t.id} references unknown parent ${t.parentTaskId}` });
      } else {
        const parent = state.jobTasks.find(p => p.id === t.parentTaskId);
        if (parent?.parentTaskId) issues.push({ code: 'HIERARCHY_DEPTH', message: `Task ${t.id} nests deeper than one subtask level` });
        if (parent && parent.jobId !== t.jobId) issues.push({ code: 'HIERARCHY_JOB', message: `Subtask ${t.id} crosses jobs` });
      }
    }
  }
  for (const inv of state.invoices) {
    if (!clientIds.has(inv.clientId)) issues.push({ code: 'FK_INVOICE_CLIENT', message: `Invoice ${inv.id} references unknown client ${inv.clientId}` });
    const lineSum = inv.lines.reduce((s, l) => s + l.amount, 0);
    if (Math.abs(lineSum - inv.amount) > 0.005) {
      issues.push({ code: 'MONEY_INVOICE_TOTAL', message: `Invoice ${inv.id} total ${inv.amount} != sum of lines ${lineSum}` });
    }
  }
  // Monetary control total: 8-account demo TB must net to zero per engagement where applicable
  // (only warn when engagement carries the canonical 8 demo rows)
  for (const e of state.engagements) {
    if (e.rows.length === 8) {
      const net = e.rows.reduce((s, r) => s + r.balance, 0);
      if (Math.abs(net) > 0.005) {
        issues.push({ code: 'MONEY_TB_IMBALANCE', message: `Engagement ${e.id} trial balance nets to ${net}, expected 0` });
      }
    }
  }
  // No uploaded binary payloads in persisted state
  const raw = JSON.stringify(state);
  if (/data:[^,]*;base64,/i.test(raw)) {
    issues.push({ code: 'PERSISTENCE_BINARY', message: 'Persisted state contains inline binary payload (file bytes must stay in-session only)' });
  }
  // No real personal data: demo emails must use .demo
  for (const u of state.users) {
    if (u.email && !/\.demo$/.test(u.email) && !/\.invalid$/.test(u.email)) {
      issues.push({ code: 'FIXTURE_PII', message: `User ${u.name} email ${u.email} is not a synthetic .demo address` });
    }
  }
  return issues;
}

export function migratePersistedState(parsed: unknown, fresh: PrototypeState): MigrationResult {
  const warnings: string[] = [];
  const p = parsed as Record<string, unknown>;
  const from = typeof p?.schema === 'number' ? (p.schema as number) : 0;
  let state: PrototypeState = { ...fresh, ...(parsed as Partial<PrototypeState>) };
  if (from < 3) {
    warnings.push(`Migrated legacy schema v${from} to v${CURRENT_SCHEMA}: preserved engagements, PBC, workpapers, reviews and releases.`);
    state.asOfDate = state.asOfDate || '2026-09-23';
  }
  if (from < 4) {
    // v4: engagement-scoped EQR state, per-engagement approvals, M365 independent cards
    for (const e of state.engagements) {
      if (!e.approvals) {
        (e as unknown as Record<string, unknown>).approvals = { manager: null, client: null, partner: null, eqr: null };
        warnings.push(`Engagement ${e.id}: initialised per-engagement approval/EQR state (VP-056).`);
      }
    }
    if (!state.emailTemplates) state.emailTemplates = fresh.emailTemplates;
    if (!state.customFields) state.customFields = fresh.customFields;
  }
  state.schema = CURRENT_SCHEMA;
  return { state, migratedFrom: from, warnings };
}
