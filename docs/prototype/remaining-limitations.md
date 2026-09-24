# AuditSphere Visual Prototype — Remaining Limitations

Updated 2026-09-24. Selected R01–R14 defects received code and regression
coverage, but that does not constitute full acceptance. VP-009, VP-014, VP-018,
VP-035, VP-037, VP-047, VP-051, VP-052, VP-053, VP-055, VP-056, VP-057,
VP-058, VP-059 and VP-060 are Verified; 49 of 64 stories and 29 of 39 modules remain
Partial.
Automated sources explicitly trace AT-01 through AT-55. See
`verification.md` for exact executed checks.

## Known acceptance gaps

- **VP-035 — trial-balance import (Verified):** AT-35 covers signed-net and
  debit/credit conventions, mapped accounting dimensions, header selection,
  CSV and genuine XLSX replacement history, exact source hashes/context, and
  non-committing errors for malformed, unbalanced, duplicate, formula,
  unknown-dimension, over-limit, unmapped-account and stale-context inputs.
  The store also rejects invalid dimension values atomically. MOD-21 remains
  Partial for the separate GL intake and opening/movement/closing work in
  VP-036.

- **VP-034 — accounting setup:** client legal entity, reporting basis and
  currency; versioned chart accounts with parent/posting/active state; owned
  open/closed period books; bounded dimensions; engagement profile/chart/book
  pins; and setup revision history are implemented. Trial-balance imports show
  this context and reject incomplete setup or codes absent from the active
  posting chart. AT-34 Chrome and unit checks cover save/reload, retained prior
  revision, invalid date ranges, duplicate codes, hierarchy cycles, posting
  parents, cross-client period owners, closed books, duplicate dimension values
  and invalid import accounts. The full mapping, unmapped-account, comparative statement
  lineage workflow is covered by the separately verified VP-037 story. AT-34
  now confirms an accounting-context edit stales reviewed statements and marks
  the prior package generation stale. A chart edit also downgrades an approved
  mapping and stales a reviewed statement set in a same-client sibling
  engagement, retaining the mapping as a draft. Module 20 remains Partial until
  the wider client/period/chart change and rework combinations have direct
  acceptance evidence. Migrated legacy records keep reporting basis unselected
  until an authorized person configures it.
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
  document-name grant scoping. Shared-document results now open the client
  portal with the matching engagement selected; staff client results open the
  matching client detail; job and invoice IDs are searchable and navigate with
  their engagement context. Search now filters by record type and permitted
  client/engagement context; Chrome confirms these filters narrow results and
  client filter choices omit ungranted engagements. Task results select and
  highlight their task; workpaper and finding results select matching records;
  contact results open Contacts at the matching row; PBC results open Requests
  at the matching row. Unavailable documents remain searchable with an
  Unavailable status and open as selected, non-openable records; archived client
  results are labeled and still open their historical client record. Broader
  combinations across other person/grant classes remain uncovered. Chrome also
  confirms the two-grant client administrator sees CL-001/CL-003 and cannot
  discover CL-002 in search context choices.
- **VP-060 — reporting (Verified):** WIP now values approved time using its approval-pinned
  rate; missing rates remain unknown instead of using a later budget version.
  A fixed calculation check covers approved, unapproved and missing-rate rows.
  Chrome now maps every exported CSV field for all 16 reports to persisted source
  records; WIP, utilization and compliance values are also independently
  recomputed. Chrome verifies manager and partner full catalogues, billing's nine
  reports, records' four reports and client-filtered exports for all records views.
  Print actions are invoked for all 16 reports. Device-specific printer output and
  external BI are outside the browser prototype.
- **VP-032/033 — receivables:** Chrome records an offline receipt, allocates it
  across two issued invoices and reverses one allocation with a reason while
  preserving the other invoice settlement. It exports a client-scoped CSV
  statement with issued invoices, credits and receipts; Draft and other-client
  invoices are excluded. Client, as-of date and currency filters drive the
  balances, including historical balances before a later receipt. Printable
  layout and native print action are implemented, though OS print/PDF output is
  not captured. The integration is offline-only. Five aging bucket cards now
  open invoice-level gross, credit,
  payment, outstanding and overdue-day detail; Chrome verifies the displayed
  31–60 day invoices sum to the bucket total.
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

- **AT-11/12 — jobs and tasks:** Chrome verifies combined client, engagement,
  owner, status and overdue job filters; manual status changes; reasoned job
  cancellation; and retained task, linked document and time records with an
  attributable cancellation event. Unit guards require a reason and prevent
  reopening a cancelled job. Chrome also verifies that open subtasks block parent
  completion and that reassignment changes the real assignee with a retained
  reason and no authority grant. Chrome now edits job and task details with
  history, changes task status with blocked-reason enforcement, reorders siblings,
  and displays linked job files and time entries while preserving assignment
  history. Task-level comments/attachments and the broader job/task return/reopen
  matrix remain incomplete.
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

- **VP-054 — findings:** the findings register now writes through guarded store
  commands, validates scoped source references, preserves promoted sample
  exceptions, accepts qualitative findings without amounts, and separates signed
  net amounts from gross absolute totals by currency. Dispositions keep actor,
  rationale and time; “Corrected in TB” requires a linked reviewed journal that
  is reflected. Significant unresolved findings block release readiness. Chrome
  verifies a sourced qualitative finding and durable disposition, plus promotion
  of a sampled monetary exception with its population/item link. Financial
  aggregation remains unit-backed; reporting and the full reopen/waiver matrix
  still need browser evidence.

- **VP-049 — risks and programs:** the risk register now edits persisted
  engagement-scoped risks; Chrome verifies a response edit and reciprocal
  RSK-01↔PRC-03 link after reload, and schema v9 repairs legacy unscoped links.
  Reusable program templates use supported audit areas, can be drafted, independently
  published, applied with fresh procedure IDs and empty work state, revised with prior
  versions retained, and retired without changing applied engagement work. Chrome
  verifies v1 and v2 remain pinned to separate applications after revision and retirement. Program
  views display reciprocal risk links and unresolved coverage gaps. Risk revisions
  are logged and visible. An approved plan now creates a superseding under-review
  revision when a risk changes, linked procedures require reassessment, and an
  independent reviewer can approve the new plan. Chrome also returns a plan with
  reviewer rationale, creates a separate manager rework revision, and independently
  approves it to restore planning. Broader risk combinations and reopen scenarios
  still need direct acceptance evidence.

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

- **R05 — release evidence:** package revisions create and persist real XLSX,
  DOCX and PDF bytes with verified SHA-256 manifests, and the issue guard binds to
  those artifacts. Chrome verifies exact-manifest release and amendment reset;
  altered bytes block candidate freeze until the exact saved blob is restored.
  Unit checks cover stale candidates, missing approvals, duplicate same-generation
  issue, recipient deduplication and amendment reapproval. VP-057/058 are Verified.
  Release remains an explicitly local record; no external delivery is performed.
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
  predecessor rows and source hashes for balanced CSV and actual XLSX. AT-35
  also exercises UI-level rejection of duplicate codes, formula amounts, CSV
  bytes mislabeled XLSX, unbalanced totals, files above 2 MB, 2,001-row input,
  unmapped chart accounts and stale chart context; each rejected input leaves
  the accepted source rows/version unchanged. Broader import mapping,
  malformed-workbook and recovery combinations remain unverified.
- **VP-037 — account mapping:** every account now requires an explicit mapping in
  a current independently approved revision before statements can be exported or
  a package can validate. Unmapped accounts are listed rather than silently
  treated as legacy classifications. AT-37 now maps all accounts, saves a 60/40
  split from property/equipment into other current assets, obtains independent
  approval, traces both output lines to account 1500 in screen and XLSX, and
  verifies source codes on export. The remaining chart/period/dimension and
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
  Cash-flow schedules now persist revisioned opening cash, signed operating,
  investing, financing and non-cash movements, closing cash and evidence
  references. Independent review checks evidence scope, cent accuracy, cash
  movement reconciliation and agreement with the current approved mapped TB
  cash balance. Source or mapping changes stale reviewed schedules. A current
  reviewed schedule can be selected into the exact saved financial package
  artifacts. Per-note disclosure records, shared client note projections,
  complete statement layout and broader cash-flow edge coverage remain open.
  Package preparation still has one overall disclosure applicability and note
  rationale; this does not replace a per-note accounting-standard checklist.
- **VP-042 — financial packages:** package sections and their order persist
  across reload and revisions; Chrome verifies changed section ordering and
  confirms older artifact IDs and bytes remain intact after reassembly. A
  cash-flow section is selectable only from a current independently reviewed
  schedule and is added to package content with source evidence references. A
  forced XLSX-generation failure reports the exception and leaves
  the current revision unchanged. Package artifacts now persist together in one
  IndexedDB transaction; Chrome forces the second write to fail and confirms no
  partial blobs or package revision remain. After amendment, Chrome verifies the
  current package is re-presented and independently acknowledged by management;
  the previous decision remains in history. DOCX/PDF-specific generator-failure
  injection and broader sharing/edge combinations remain incomplete.
- **R09 — consolidation:** component resolution and pinned snapshots are improved;
  Chrome now verifies the configured group, approved elimination, balanced output
  and source-TB immutability. A separate Chrome journey blocks a missing foreign-
  currency closing rate, rejects zero, saves a dated rate revision and verifies
  source rows remain unchanged. The calculation profile is now explicitly limited
  to one Parent and one 100%-owned Subsidiary; store guards reject Associates and
  minority ownership, and Chrome verifies these unsupported profiles show no
  figures. Group updates now preserve existing immutable package pins or require
  a new pin to match the engagement's exact current revision and rows; altered
  balances cannot be submitted as a package snapshot. Schema v22 corrects only
  the known seeded label from Associate to Subsidiary. Chrome also removes the
  Subsidiary and verifies no output or source mutation. Perimeter edits now reject
  invalid dates and duplicate components, retain prior revisions, revert through
  a new revision, return an approved elimination to draft after component changes,
  and leave source trial balances unchanged. A narrow ENG-26001 grant now sees a
  redacted perimeter with no figures, editor or history, and self-loop or
  cross-group revision changes are rejected without touching state. Broader
  elimination and ownership cases remain incomplete.
- **R10 — migration/recovery:** migrations from schema versions 0–21 pass unit
  integrity checks. Chrome verifies concurrent-save and quota failures,
  malformed-payload preservation, exact future-schema backup preservation,
  ambiguous-import rejection without overwriting the backup, and validated v22
  import recovery. Recovery UI now offers validated import, current-state and
  preserved-payload export, and confirmed reset. Fixture guards cover impossible
  dates, reversed periods, broken references, personal email, binary payloads
  and monetary control totals. Historical recovery choices and downloaded-byte
  verification remain unverified.
- **R12 — acceptance breadth:** Chrome now executes annual continuance, generated
  package persistence/release/amendment/archive, the full report catalogue and
  storage recovery journeys, CSV/XLSX TB replacement, and the complete PBC
  request/response/clarification/replacement/acceptance cycle, plus client
  creation/contact/custom-field/relationship-group and Client 360 navigation
  journeys (AT-05/AT-06). Every AT-01 through AT-55 identifier now appears
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
  assert legal requirements or schedule deletion. Chrome now verifies an active
  application hold blocks handover without recording a request, then permits a
  local successor-auditor request after the hold is lifted. A retention-date
  correction preserves before/after metadata in attributed history; v21 migration
  retains a baseline for existing archives. Chrome now indexes a successor
  release, verifies its copied artifact digests and predecessor link, and exercises
  hold/handover against the latest archive record. Server-side immutability remains
  outside this browser-local prototype.
- **Cross-cutting:** The shipped Content Security Policy limits runtime connections and default
  resources to the same origin; Chrome also blocks non-local HTTP(S) requests
  during all exercised journeys. Top-level external navigation after a user
  follows a link is outside this resource-egress policy. This is a browser-local,
  synthetic prototype with no live M365, email, payments, e-signatures, tax/payroll,
  AI, or other external services. Purview is excluded from the supported product
  scope, not an outstanding acceptance requirement.
- **Build size:** Vite warns that the main bundle exceeds 500 kB (2,296.28 kB,
  635.98 kB gzip in the current build).

## Verification snapshot

Latest recorded full run: 161/161 unit checks and 70/70 E2E checks passed.
E2E includes five static checks and 65 Chrome journeys. The Chrome suite blocks
non-local HTTP(S) requests with CDP Fetch and asserts no external request was
attempted by the exercised flows. The built HTML also enforces same-origin
resource loading and runtime connections through CSP. VP-009, VP-014, VP-018,
VP-035, VP-037, VP-047, VP-051, VP-052, VP-053, VP-055, VP-056, VP-057,
VP-058, VP-059 and VP-060 are Verified; 49 of 64 stories and 29 of 39 modules remain Partial because full
criterion-by-criterion acceptance evidence is not complete. See
`verification.md`; earlier counts in this repository are historical.
