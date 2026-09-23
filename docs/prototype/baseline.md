# AuditSphere Visual Prototype — Baseline Inventory (VP-001)

Version 1.0 · recorded 2026-09-23 · `docs/prototype/baseline.md`

Inspected checkout: `main` at `1c04508` (prior reviewed baseline `3f30d34` /
`3f30d348289d6d94dd49cb1d976e23018183eec9` reconciled — no reset performed).

## Active runtime

- Vite entrypoint: `src/main.tsx` → `src/App.tsx` (React 19 + TypeScript + Vite 8).
- Single typed store: `src/store/prototypeStore.ts` + `src/store/initialState.ts` +
  `src/store/scenarios.ts`; guards `src/services/guards.ts`; migrations
  `src/services/migrations.ts` (schema v4).
- 34 React feature views under `src/components/modules/` + `Shell` layout +
  `TBImportWizard`; route registry in `App.tsx`; grouped navigation
  (Practice / Work / Economics / Accounting / Audit / Client Services & Admin).
- Legacy compatibility: `base-app.js` + `role-views.js` concatenated by `build.py`
  into `app.bundle.js` (`legacy/index.html`). The Vite build is the canonical
  acceptance target; the standalone file is historical/comparison only.
- Visual system: `styles.css` + `roles.css` + `src/host.css`.
- Synthetic data: `roles.json`, `permissions.json`, `source.json`,
  `synthetic_trial_balance.csv`; QAR fixtures; demo clock `2026-09-23`.

## Package scripts (verified in package.json)

`dev` · `build` (`tsc --noEmit && vite build`) · `lint` (`tsc --noEmit`) ·
`preview` · `legacy:build` (`py -3 build.py`) · `legacy:check`
(`node --check app.bundle.js`) · `test:unit` · `test:e2e` (delivered under VP-063).

Dependencies: `react`, `react-dom`, `xlsx` (genuine workbook parsing),
`docx`, `jspdf` (genuine DOCX/PDF generation). No AI SDK, no payment gateway,
no signature provider, no M365 SDK — simulations are local fixtures.

## Route inventory (active Vite app)

overview, clients, client-detail, acquisition, proposals, engagements, onboarding,
jobs, job-templates, communications, documents, my-time, budgets, billing,
receivables, accounting-setup (+trial-balance/gl-transactions/account-mappings/
adjustments/reconciliations aliases), financial-statements, financial-packages,
consolidation, audit-planning, audit-risks (+audit-fieldwork), sampling, audit,
evidence, findings, reviews, approvals (+quality), delivery, records, portal,
reports, administration (+services), m365-setup, requirements (+role-guide).

## Exclusion scan (VP-001 acceptance 4)

Target-facing route/configuration data was scanned for excluded modules (AI,
mobile/PWA, payment gateways, eSignatures, tax/payroll service modules,
recurring-work controls, workflow builders, inbox/Triage, non-M365 providers,
Purview, SOC 2/encryption programmes). Result: no excluded module is offered as
available, optional setup, or release prerequisite. Allowlisted mentions only:
this scope file, `RequirementsView` historical notice, `RecordsArchiveView` and
M365 disclaimers explicitly stating Purview is NOT part of the product, and
predecessor artefacts labelled historical. Old test counts are not republished
as new runs; see `verification.md` for actually executed checks.
