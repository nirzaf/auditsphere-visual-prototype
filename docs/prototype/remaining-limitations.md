# AuditSphere Visual Prototype — Remaining Limitations

Updated 2026-09-23. Selected R01–R14 defects received code and regression
coverage, but that does not constitute full acceptance. All 64 stories and 39
modules remain Partial; see `verification.md` for the exact executed checks.

## Known acceptance gaps

- **AT-20 — document replacement:** Chrome verifies a replacement revision is
  registered separately, preserves the prior document and evidence pin, and
  shows reviewers that a newer version exists. The replacement creates a new
  pending-verification evidence reference, marks dependent procedures stale,
  and invalidates direct workpaper clearance pins. Human adequacy review,
  fieldwork reassessment and independent re-clearance remain manual. Original
  bytes remain local.
- **AT-22 — local document metadata:** Chrome registers a real selected local
  file, reloads the browser, and confirms the original bytes are not stored or
  presented as downloadable. Upload to a remote library is outside scope.
- **VP-061 — global search:** Chrome verifies the client persona cannot find an
  internal communication and can find a shared document; unit coverage checks
  document-name grant scoping. Other client/person grant combinations, result
  cross-links and search types still need direct journey coverage.
- **VP-060 — reporting:** WIP now values approved time using its approval-pinned
  rate; missing rates remain unknown instead of using a later budget version.
  A fixed calculation check covers approved, unapproved and missing-rate rows.
  Chrome compares every exported CSV cell with the visible table for 13 reports
  and independently recomputes every row for WIP, utilization and compliance.
  Independent source mapping for all fields in the remaining reports remains
  incomplete.
- **VP-032/033 — receivables:** Chrome records an offline receipt, allocates it
  to an issued invoice and reverses it with a reason while preserving prior
  settlements. Unit coverage verifies multi-invoice allocation and reverses one
  allocation without changing the other invoice. The browser journey and full
  statement workflow remain partial; the integration is offline-only.
- **VP-030 — source-linked billing:** Chrome drafts an invoice from approved
  billable time at its pinned rate and accepted fixed-fee proposal balance. Time
  sources are reserved once, and fixed-fee invoices cannot exceed the accepted
  contract balance. Fixed-fee caps are proposal-level; per-service milestone
  allocation remains unmodeled.
- **AT-14 — internal collaboration:** Chrome verifies an internal job note and
  authorized staff mention stay absent from the client portal. Authors can now
  edit their notes; the edit records actor and time, and another persona is
  denied by the shared store guard. Moderation and recipient-specific
  notification browsing remain incomplete.
- **AT-27 — manual communications:** Chrome records an inbound meeting note with
  internal visibility and confirms the client portal omits it. Broader activity
  linking across communication/client/job views remains incomplete.
- **AT-26 — simulated email:** Chrome resolves the request template and records
  accepted, failed and unknown outcomes locally without external mail requests.
  Recipient validation, delivery evidence and retry/duplicate policy remain
  incomplete.
- **AT-21 — optional OneDrive:** Chrome verifies disabled-by-default gating,
  saved enablement, current simulated success and a selected local metadata
  import under the SharePoint canonical hierarchy. Real file transfer and
  version freshness remain outside the prototype.

- **AT-11/12 — jobs and tasks:** Chrome verifies that open subtasks block parent
  completion and that reassignment changes the real assignee with a retained
  reason and no authority grant. Job cancellation and the full edit/status/filter
  matrix remain unverified.
- **AT-13 — job templates:** Chrome authors and publishes a Draft, applies it
  to a fresh job/tree, then creates and publishes a separate edited revision.
  The existing job and prior published template remain unchanged, and jobs pin
  the exact source revision. Chrome submits the same instantiation form twice
  with one operation ID and observes only one created job; unit checks reject
  reuse of that ID with changed details.

- **VP-050 — audit fieldwork:** Chrome records work performed against PRC-01,
  submits it with a linked current adequate evidence revision, denies preparer
  self-clearance, and retains independent manager clearance after reload. The
  PRC-04 exception remains visible. Procedure template administration, detailed
  edit history, and the full exception rework matrix remain incomplete.

- **VP-049 — risks and programs:** the risk register now edits persisted
  engagement-scoped risks; Chrome verifies a response edit and reciprocal
  RSK-01↔PRC-03 link after reload, and schema v9 repairs legacy unscoped links.
  Reusable program-template administration, risk revisions, and the complete
  change/rework matrix remain incomplete.

- **VP-051 — substantive sampling:** populations are engagement-scoped; Chrome
  imports CSV population rows with SHA-256 identity, recalculates source totals,
  preserves predecessor rows and results, and resets selections after replacement.
  Chrome rejects duplicate references without changing the active revision and
  verifies the new source identity after reload. Full-frame reconciliation,
  browser-level XLSX import, and assurance inference remain incomplete/out of scope.

- **VP-018/019 — identity and access:** Chrome grants and revokes an engagement
  scope and verifies durable actor/time/scope/reason history after both actions.
  The M365 wizard also saves permitted-person and initial role mappings without
  creating access grants. External invitations, identity onboarding/suspension,
  and an account status change history remain incomplete; personas are seeded
  simulation identities.

- **AT-07/08 — acquisition and proposals:** Chrome now exercises inquiry
  registration, stage history, separate-currency totals, required lost reason,
  scoped proposal drafting, independent review and presentation.
  Store checks enforce required loss reasons, stage history, line-item totals,
  stale-review reset on revision, and preservation of the exact presented
  revision. The client portal records accept/decline/withdraw responses with an
  authorized contact and explicit evidence reference without auto-creating an
  engagement. AT-10 creates one draft from the accepted revision and separately
  requires partner acceptance evidence before activation. Qualification and
  conversion edge paths, suspension, close and change applicability remain
  unverified.

- **R05 — release evidence:** package revisions now create and persist real XLSX,
  DOCX and PDF bytes with verified SHA-256 manifests, and the issue guard binds to
  those artifacts. Chrome verifies manager, management and partner approvals,
  release, amendment reset, and predecessor-manifest preservation. Dispatch,
  duplicate-delivery and all release edge paths remain unverified.
- **R08 — accounting history:** imported trial-balance snapshots and mapping/source
  metadata are retained by revision. Financial statements and package artifacts
  now include accepted, unreflected adjustments exactly once; reflected or
  reflection-uncertain entries are excluded, missing account codes block output,
  and source rows remain unchanged. Unit and Chrome checks cover AJ-01 through
  statements and current-period equity; Chrome parses the generated package XLSX
  and checks both accepted adjustment lines in the exact account rows. A separate
  Chrome journey covers draft creation, independent technical review and scoped
  client management acceptance. Reflection/rejection edge matrices, general-ledger
  and remaining downstream lineage workflows are still incomplete. Chrome also
  opens all 16 reports and checks CSV structure/client scoping; TB import retains
  predecessor rows and source hashes for balanced CSV and actual XLSX.
- **R09 — consolidation:** component resolution and pinned snapshots are improved;
  Chrome now verifies the configured group, approved elimination, balanced output
  and source-TB immutability. Perimeter edits, missing-component recovery, and
  non-base-currency translation workflows remain unverified.
- **R10 — migration/recovery:** migrations from schema versions 0–12 pass unit
  integrity checks, and Chrome checks preserve a concurrent save and report quota
  failures. Other recovery and corrupted-storage paths remain unverified.
- **R12 — acceptance breadth:** Chrome now executes annual continuance, generated
  package persistence/release/amendment/archive, the full report catalogue and
  storage recovery journeys, CSV/XLSX TB replacement, and the complete PBC
  request/response/clarification/replacement/acceptance cycle, plus client
  creation/contact/custom-field/relationship-group and Client 360 navigation
  journeys (AT-05/06). Complete
  The complete AT-01–AT-54 acceptance suite has not been executed end to end.
  External invitation and identity lifecycle, live AML/KYC screening (evidence references are manual), value-level report data reconciliation and
  other full acceptance paths still need direct evidence.
  Package sections, ordering and notes now persist by revision.
- **R06 — PBC submission limits:** responses are versioned with a required SHA-256;
  only the named contributor can upload, acceptance records actor/time/version,
  and accepted submissions cannot be overwritten. Chrome verifies both response
  versions' original bytes and digests remain in browser-local IndexedDB after
  reload. No external upload occurs; broader evidence and workpaper dependency
  workflows remain incomplete.
- **R14 — archive integrity:** archive creation now copies every released package
  artifact into a separate IndexedDB record and verifies size, MIME type and
  SHA-256 before recording the archive. The copies remain browser-local and can
  be cleared or altered outside the app. This remains within logical local archive
  scope; Purview locks, physical deletion controls and external retention services
  are excluded. Retention dates are optional firm-selected metadata and do not
  assert legal requirements or schedule deletion.
- **Cross-cutting:** Chrome network observation covers the exercised journeys only;
  no formal all-state egress policy is established. This is a browser-local,
  synthetic prototype with no live M365, email, payments, e-signatures, tax/payroll,
  AI, or other external services. Purview is excluded from the supported product
  scope, not an outstanding acceptance requirement.
- **Build size:** Vite warns that the main bundle exceeds 500 kB (about 2.03 MB,
  575.64 kB gzip in the latest build).

## Verification snapshot

Latest recorded run: 118/118 unit checks and 41/41 E2E checks passed. E2E
includes five static checks and 36 actual Chrome checks. It exercises the
approved-time and accepted fixed-fee invoice source paths alongside selected
workflow journeys; the
full AT-01–AT-54 suite has not run, and route rendering is not full workflow
acceptance. See `verification.md`; earlier counts in this repository are
historical.
