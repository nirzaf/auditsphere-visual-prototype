# AuditSphere Visual Prototype — Remaining Limitations & Honest Gaps

Version 1.0 · 2026-09-23 · `docs/prototype/remaining-limitations.md`

Rule: anything not implemented is written down here and, where it affects a
screen, also bannered in that view as an amber **Prototype note**. Nothing in
this file blocks the demonstrated core; each item names the manual workaround or
the store-level support that already exists.

## A. Fixed in the latest pass (no longer limitations)

- **Budgets actuals were fabricated** (`actualHours ?? 30`, hardcoded grade table,
  “Real-time timesheet synchronization”). Now computed solely from approved time
  entries per §5.5, with submitted-but-unapproved time excluded and shown, missing
  cost rates rendered as unknown, and an honest empty state when no budget exists.
- **RBAC matrix listed fictitious roles** (`senior`, `associate`, `tax_manager`,
  `client_exec`, `billing_specialist`) — `tax_manager` violated the tax exclusion.
  Now lists the 14 agreed roles with live persona counts and SoD wording.
- **Evidence adequacy toggle was local-only.** Now persisted via
  `setEvidenceAdequacy` with an active-identity guard and rationale requirement.
- **Financial Packages named a non-existent EQR** (“Fatima Al-Kuwari”). Now
  references Dr. Tariq Al-Sayed, with EQR-not-required stated where applicable.
- **Persona counts** (“14 Prototype Personas”) now render the live directory size
  (19 demo people across 14 roles).

## B. Residual partials (amber Prototype-note banner in the view)

| Module(s) | What works | What is missing / workaround |
|---|---|---|
| 13 Budgets | Comparison of versioned budget vs approved time; §5.5 math tested | No budget authoring UI (new versions, rate edits). Seeded BDG-26001 is the demo source; store `updateBudget` exists. No engagement aggregation view, optimizer, or recurring budgets (excluded by scope) |
| 16 Reporting | WIP / utilization / compliance-calendar presentation; CSV export mirrors display | Tables are static illustrative fixtures, labelled in-view. Live computed reporting lives in Budgets and Receivables. Filtered operational reports with drill-downs and scoped exports (VP-060) are presenter-scripted |
| 19/39 Administration | Persona directory, firm settings (prospective), 14-role matrix, factory reset | No per-user detail tabs (grants, assignments, access history), no pending-invitation tracking or revocation UI. Grants are managed via store commands; least-privilege is shown through scoped shell/search/guards |
| 24/25 Statements & Packages | Genuine XLSX/DOCX/PDF outputs with entity, period, revision, watermark; lineage identity shown | No interactive contents selection/ordering, no multi-revision version list, no validation-summary panel in the package view |
| 27 Acceptance | Illustrative questionnaire + partner-decision panel | Session-local only: no persisted evaluation case, evidence references, conditions, separate collection/recommendation/decision trail, or continuance draft action (VP-047 specifies the full case) |
| 28 Planning | Deterministic materiality arithmetic (tested) | Session-local only: no saved versioned plan revision, team/timing/significant-area tabs, independent plan review, or stale-fieldwork marking (VP-048) |
| 33 Evidence | Persisted attributable adequacy; version-pinned shared refs; procedure links | Deficiency does not auto-flag dependent procedures/workpapers/reviews — each linked subject must be re-cleared explicitly. No version-compare view (manual side-by-side in the library) |
| 38 Records | Single-engagement archive with manifest, retention metadata, holds | No cross-engagement searchable register, handover requests, or successor-archive versions in-view. Retention/hold are metadata only |

## C. Cross-cutting notes

- **AT automation is partial by design in this pass** (see §D). Every journey is
  either executed (unit/e2e, recorded in `verification.md`) or presenter-scripted
  from `demo-scenarios.md`. Scripted journeys are not claimed as passes.
- **Dedicated UI controls for some store-supported edge actions were not
  individually click-verified** (e.g. proposal print preview, engagement
  suspension/close views, template retire, mapping split editor, GL
  opening-source selector, FX table editing, population reselection, PBC
  clarification thread UI, completion-checklist UI, handover requests). The
  underlying commands, guards and calculations exist and are unit-tested where
  the AT table says so; treat the clicks as presenter-scripted until executed.
- **Performance fixtures** (§9.3: 25 clients / 50 engagements / 100 jobs /
  1,000 tasks / 2,000-row import) were not run as load scenarios. Import caps
  (2,000 rows / 2 MB) are enforced and tested; larger sizes are unmeasured, not
  supported.
- **No real-time collaboration**: one active editing tab is the supported mode;
  a second tab raises a conflict notice instead of merging.
- All scope-exclusion honesty rules from `scope.md` still apply: no live
  connections, payments, signatures, email delivery, or retention operations.

## D. AT-01…AT-54 automation status

- **Automated** = executed by `test:unit` / `test:e2e` (counts in `verification.md`).
- **Partially** = guards/math/probes automated; end-to-end clicks presenter-scripted.
- **Scripted** = presenter-scripted from `demo-scenarios.md`; not claimed as a pass.

| ID | Journey | Status | Evidence / note |
|---|---|---|---|
| AT-01 | Empty practice + persona entry | Partially | e2e boots shell; empty-scenario clicks scripted |
| AT-02 | Upgrade legacy local state | Automated | unit: legacy migrate, future-version, integrity |
| AT-03 | External-looking controls + interception | Partially | e2e markup/bundle probe; live runtime interception scripted |
| AT-04 | Supported-product UI | Automated | unit src scan + e2e bundle scan |
| AT-05 | Clients, contacts, custom values, group | Partially | unit duplicate-code guard; flows scripted |
| AT-06 | Workspace tabs + return navigation | Scripted | — |
| AT-07 | Inquiry → opportunity → proposal | Scripted | — |
| AT-08 | Proposal submit/review/revise | Partially | unit same-person denial; flows scripted |
| AT-09 | Manual acceptance before professional acceptance | Scripted | — |
| AT-10 | Activate engagement + create job | Scripted | — |
| AT-11 | Task/subtask hierarchy + completion | Automated | unit: depth, cycle, cross-job, parent-blocking |
| AT-12 | Reassign between same-role people | Scripted | store `reassignTask` + fixtures exist; clicks scripted |
| AT-13 | Publish/apply/revise template | Scripted | — |
| AT-14 | Internal comment + mention; client switch | Scripted | — |
| AT-15 | M365 setup simulation | Partially | e2e surface + unit `liveConnected`; wizard clicks scripted |
| AT-16 | Denied/changed/failed mail/disconnect | Scripted | fixtures exist in rebuilt setup view |
| AT-17 | Nominate/import user + grant | Scripted | store `grantAccess`/`revokeAccess` exist |
| AT-18 | Narrow grant, revoked grant, stale dialog | Automated | unit person-keyed scope incl. sibling exclusion |
| AT-19 | Prepare workspace twice | Scripted | idempotency rule documented; clicks scripted |
| AT-20 | Replace evidence-linked document | Scripted | adequacy persistence automated; replacement flow scripted |
| AT-21 | OneDrive selection/import | Scripted | optional toggle + provenance rule in place |
| AT-22 | Original file, reload, download | Scripted | in-session-only rule bannered in intake UI |
| AT-23 | Request → response → clarification → acceptance | Scripted | response≠acceptance enforced in store |
| AT-24 | Uploader self-acceptance attempt | Partially | `acceptPbcResponse` guard implemented; dedicated test pending |
| AT-25 | Multi-entity portal visibility | Partially | e2e surface probe; scope switching scripted |
| AT-26 | Template mail accepted/failed/unknown | Scripted | — |
| AT-27 | Manual incoming note | Scripted | — |
| AT-28 | Time submit → return → approve → correction | Partially | correction-revision command implemented; flow scripted |
| AT-29 | Budget arithmetic + missing cost | Automated | unit fixed example |
| AT-30 | Invoice from fixed/time sources | Partially | unit double-source/self-review guards; flow scripted |
| AT-31 | Invoice review/issue + partial credit | Partially | unit SoD + credit-cap guards; flow scripted |
| AT-32 | Receipt across invoices + reversal | Partially | unit over/cross-client guards; reversal flow scripted |
| AT-33 | As-of AR + aging boundaries | Automated | unit incl. boundary buckets, future-receipt exclusion |
| AT-34 | Chart/period/book/dimensions | Scripted | — |
| AT-35 | Valid/invalid CSV/XLSX import | Automated | unit genuine-XLSX, unbalanced/dup/formula rejection |
| AT-36 | GL import + tie-out | Scripted | `verifyGLCompleteness` implemented; journey scripted |
| AT-37 | Mapping revise + line source | Scripted | — |
| AT-38 | Adjustment + reflected source | Partially | unit once-only math; reflection flow scripted |
| AT-39 | Reconciliation timing + correction | Scripted | residual math implemented; journey scripted |
| AT-40 | Statements + comparatives | Partially | unit TB totals/profit; layout flow scripted |
| AT-41 | XLSX/DOCX/PDF outputs | Automated | unit genuine-format + watermark assertions |
| AT-42 | Same-currency consolidation | Automated | unit elimination + component-immutability |
| AT-43 | Translation then corrected rate | Partially | translation math covered; blocking behaviour scripted |
| AT-44 | Evaluation, conditions, continuance, plan | Partially | unit materiality math; case flows scripted |
| AT-45 | Risk → program → procedure → sampling | Scripted | — |
| AT-46 | Workpaper template → evidence → finding | Scripted | — |
| AT-47 | Review rework, EQR, second engagement | Partially | unit SoD codes; per-engagement EQR flow scripted |
| AT-48 | Completion → release → amendment → archive | Partially | amendment lineage implemented; journey scripted |
| AT-49 | Report filters + exports | Scripted | Budgets/Receivables computed views automated at unit level |
| AT-50 | Global search with restricted records | Partially | scoped search implemented; journey scripted |
| AT-51 | Settings change after issued work | Partially | prospective-update implemented; journey scripted |
| AT-52 | Full journey from manual entry | Scripted | — |
| AT-53 | Keyboard, responsive, reload, modals | Scripted | — |
| AT-54 | Concurrent tab + storage failure | Partially | migration/recovery unit-tested; live conflict scripted |
