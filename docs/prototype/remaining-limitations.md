# AuditSphere Visual Prototype — Remaining Limitations

Updated 2026-09-23. Selected R01–R14 defects received code and regression
coverage, but that does not constitute full acceptance. VP-009, VP-018, VP-037,
VP-051 and VP-052 are Verified. VP-053 gained reasoned unlink history and adequacy-driven
invalidation, but its full projection/provenance matrix remains open; 36 of 39 modules remain Partial. Automated sources explicitly trace AT-01 through AT-54. See
`verification.md` for exact executed checks.

## Known acceptance gaps

- **VP-034 — accounting setup:** client legal entity, reporting basis and
  currency; versioned chart accounts with parent/posting/active state; owned
  open/closed period books; bounded dimensions; engagement profile/chart/book
  pins; and setup revision history are implemented. Trial-balance imports show
  this context and reject incomplete setup or codes absent from the active
  posting chart. AT-34 Chrome and unit checks cover save/reload, retained prior
  revision, invalid date ranges, duplicate codes, hierarchy cycles, and invalid
  import accounts. The full mapping, unmapped-account, comparative statement
  lineage and downstream rework matrix remains incomplete, so Module 20 remains
  Partial.
- **VP-039 — manual reconciliation:** preparers can save source-version-pinned
  schedules with dated, typed items; reviewers must be independent, return
  decisions need a reason, and approval blocks unexplained residuals, missing
  evidence and unlinked proposed corrections. Unit coverage verifies a saved
  approved revision is retained and TB or referenced-document replacement
  stales the live schedule; Chrome verifies draft creation, self-approval
  denial, reasoned return, manager rework as a new revision, retained return
  rationale and independent approval against scoped evidence. Fully external
  statement provenance and subsequent bank reconciliation remain outside the
  local simulation.
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
  Chrome now maps every exported CSV field for all 16 reports to persisted source
  records; WIP, utilization and compliance values are also independently
  recomputed. OS-level print output and the remaining filter/persona combinations
  still lack full acceptance evidence.
- **VP-032/033 — receivables:** Chrome records an offline receipt, allocates it
  across two issued invoices and reverses one allocation with a reason while
  preserving the other invoice settlement. It exports a client-scoped CSV
  statement with issued invoices, credits and receipts; Draft and other-client
  invoices are excluded. Client, as-of date and currency filters drive the
  balances, including historical balances before a later receipt. Printable
  layout and native print action are implemented, though OS print/PDF output is
  not captured. Amount drill-downs remain incomplete; the integration is
  offline-only.
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
  Only active contacts for the client can be selected; each explicit send stores
  a unique local simulation reference and states that no provider receipt or
  external delivery confirmation exists. There are no automatic retries, and
  another explicit send is a separate attempt. Real provider receipts remain
  outside the local prototype.
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

- **VP-053 — shared evidence:** evidence links now preserve link/unlink actor,
  time and reason; new links require an adequate current source revision. A
  reasoned unlink stales its linked procedure; an adequacy change stales linked
  cleared/submitted procedures and workpapers, moves prior clearance to history
  and requires a fresh submission. The separate workpaper document pin remains
  intact when only a procedure relation is removed.
  Unit checks cover stale-link rejection and dependent invalidation; Chrome covers
  the unlink flow. Client projection isolation for internal evidence tags and
  issued-package provenance after unlink still need a full journey.

- **VP-054 — findings:** the findings register now writes through guarded store
  commands, validates scoped source references, preserves promoted sample
  exceptions, accepts qualitative findings without amounts, and separates signed
  net amounts from gross absolute totals by currency. Dispositions keep actor,
  rationale and time; “Corrected in TB” requires a linked reviewed journal that
  is reflected. Significant unresolved findings block release readiness. Chrome
  verifies a sourced qualitative finding and durable disposition; sampled
  exception promotion, financial aggregation and the complete reopen/waiver
  matrix still need direct browser evidence.

- **VP-049 — risks and programs:** the risk register now edits persisted
  engagement-scoped risks; Chrome verifies a response edit and reciprocal
  RSK-01↔PRC-03 link after reload, and schema v9 repairs legacy unscoped links.
  Reusable program templates use supported audit areas, can be drafted, independently
  published, applied with fresh procedure IDs and empty work state, revised with prior
  versions retained, and retired without changing applied engagement work. Program
  views display reciprocal risk links and unresolved coverage gaps. Risk revisions
  are logged and visible. An approved plan now creates a superseding under-review
  revision when a risk changes, linked procedures require reassessment, and an
  independent reviewer can approve the new plan. Broader risk change, return/rework
  and reopen scenarios still need direct acceptance evidence.

- **VP-018/019 — identity and access:** Chrome grants and revokes an engagement
  scope and verifies durable actor/time/scope/reason history after both actions.
  Grants now record approved-request references and effective/expiry dates;
  scheduled authority is excluded until its effective date, and the original
  window remains in grant history after revocation.
  The M365 wizard also saves permitted-person and initial role mappings without
  creating access grants. Local identity creation, disable/reactivate history, disabled-route restriction,
  and simulated invite/expiry/revoke/accept actions are covered; external invitations
  and actual authentication remain out of scope.

- **AT-07/08 — acquisition and proposals:** Chrome now exercises inquiry
  registration, stage history, separate-currency totals, required lost reason,
  scoped proposal drafting, independent review and presentation.
  Chrome now also converts a qualified Won opportunity to a Prospect, verifies
  that acceptance remains false, and checks the resulting stage history. Store
  checks enforce non-Won/lost conversion blocks, idempotent Prospect creation,
  converted-record immutability, required loss reasons, line-item totals,
  stale-review reset on revision, and preservation of the exact presented
  revision. The client portal records accept/decline/withdraw responses with an
  authorized contact and explicit evidence reference without auto-creating an
  engagement. AT-10 creates one draft from the accepted revision and separately
  requires partner acceptance evidence before activation. VP-012 now supports
  reasoned suspension, resumption, cancellation and closure; suspended or
  terminal engagements block scoped professional commands, while billing and
  archive operations remain permitted. Unit and Chrome checks cover the
  lifecycle and retained history. The administration editor records service, reporting year/period, due date and
  team changes; validates active grants; and clears release approvals. Scope edits
  reset planning/source/mapping acceptance, stale saved statement revisions, and
  require fresh work and review for executed procedures. The full affected-review
  applicability matrix remains incomplete.

- **R05 — release evidence:** package revisions now create and persist real XLSX,
  DOCX and PDF bytes with verified SHA-256 manifests, and the issue guard binds to
  those artifacts. Chrome verifies manager, management and partner approvals,
  release, amendment reset, and predecessor-manifest preservation. A unit check
  now verifies case-insensitive recipient deduplication and blocks a second issue
  in the same generation. External dispatch/delivery and other release edge paths
  remain outside browser evidence.
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
- **VP-037 — account mapping:** every account now requires an explicit mapping in
  a current independently approved revision before statements can be exported or
  a package can validate. Unmapped accounts are listed rather than silently
  treated as legacy classifications. The AT-37 Chrome journey verifies blocking
  and an approved mapping path; the remaining chart/period/dimension and
  downstream rework matrix remains open.
- **VP-040 — comparative statements:** the statement workspace now selects an
  earlier engagement for the same client/currency and shows current/prior asset,
  liability, equity, revenue and profit totals only when both mappings are
  independently approved. Missing or unmapped prior data is labeled unavailable,
  not zero. Chrome maps and approves both periods and reconciles the comparative
  asset totals. XLSX/PDF exports carry paired mapped statement lines, values
  and source-account references. Saved statement-set revisions now pin source,
  current/prior mapping revisions, totals and line sources; independent review
  is required. Chrome now changes the prior period's mapping after review and
  verifies that the saved current-period statement becomes durably stale and
  cannot be reviewed again; the guard also has a unit check. Comparative source
  and current mapping changes are covered by the shared stale-revision path.
  The cash-flow tab now explicitly reports unavailable because classified
  operating, investing and financing movements are not stored; it no longer
  displays unsupported sample amounts. Full cash-flow source-data, layout and
  disclosure acceptance remains incomplete. Package preparation also requires
  an applicability decision and prepared note or not-applicable rationale;
  this package-level check does not replace a per-note accounting-standard
  checklist.
- **R09 — consolidation:** component resolution and pinned snapshots are improved;
  Chrome now verifies the configured group, approved elimination, balanced output
  and source-TB immutability. A separate Chrome journey blocks a missing foreign-
  currency closing rate, rejects zero, saves a dated rate revision and verifies
  source rows remain unchanged. Perimeter edits and missing-component recovery
  remain unverified.
- **R10 — migration/recovery:** migrations from schema versions 0–18 pass unit
  integrity checks, and Chrome checks preserve a concurrent save and report quota
  failures. Other recovery and corrupted-storage paths remain unverified.
- **R12 — acceptance breadth:** Chrome now executes annual continuance, generated
  package persistence/release/amendment/archive, the full report catalogue and
  storage recovery journeys, CSV/XLSX TB replacement, and the complete PBC
  request/response/clarification/replacement/acceptance cycle, plus client
  creation/contact/custom-field/relationship-group and Client 360 navigation
  journeys (AT-05/AT-06). Every AT-01 through AT-54 identifier now appears
  explicitly in automated test source, but every acceptance criterion has not been
  executed end to end. VP-018 now covers local identity creation/disable, invitation
  expiry block, renewal, revocation and history; external onboarding remains simulated.
  Live AML/KYC screening (evidence references are manual), value-level report data
  reconciliation and other full acceptance paths still need direct evidence.
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
- **Build size:** Vite warns that the main bundle exceeds 500 kB (2,180.64 kB,
  608.73 kB gzip in the latest deployed build).

## Verification snapshot

Latest recorded run: 138/138 unit checks and 58/58 E2E checks passed. E2E
includes five static checks and 53 Chrome journeys. VP-009, VP-018, VP-037,
VP-051 and VP-052 are Verified; 59 of 64 stories and 36 of 39 modules remain Partial because full
criterion-by-criterion acceptance evidence is not complete. See
`verification.md`; earlier counts in this repository are historical.
