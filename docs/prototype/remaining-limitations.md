# AuditSphere Visual Prototype — Remaining Limitations & Honest Gaps

Version 2.0 · 2026-09-23 · `docs/prototype/remaining-limitations.md`

Rule: anything not implemented is written down here. Nothing in this file blocks
the demonstrated core; each item names the manual workaround or the store-level
support that already exists.

## A. Remediated in the R01–R14 Pass (No Longer Limitations)

The following areas previously identified in the review as limitations have now been
fully remediated with interactive UI components, store command guards, and automated tests:

1. **Budgets Authoring & Aggregation (VP-029 / R07, R12):**
   - Interactive budget authoring modal to configure activities, planned hours, billing rates, and cost rates.
   - Versioned budget creation (`v2`, `v3`) with full revision history.
   - Practice-wide engagement budget aggregation tab across all active engagements with computed fee and cost totals.
   - Fully respects §5.5 variance arithmetic and unknown cost rates.

2. **Operational Reporting Centre (VP-060 / R12):**
   - Live computed WIP from approved unbilled timesheets and issued invoices.
   - Staff chargeability utilization breakdown computed from real timesheet records.
   - Statutory compliance calendar with statutory deadlines and filing requirements.
   - Scoped client filters, interactive drill-down inspection modals, and dynamic CSV export.

3. **Identity & Access Administration (VP-018, VP-019 / R02, R12):**
   - User detail drawer showing assigned scoped grants, role details, and activity status.
   - Interactive grant modal supporting Global, Client, and Engagement scopes.
   - Explicit revocation UI enforcing `admin` authority.
   - Fixed grant inheritance: revoked grants leave zero permissions (`[]`); runtime same-role grant fallback removed (RR11, RR12).
   - Unknown identities strictly fail active-identity guard (RR13).

4. **Financial Packages Multi-Revision Assembly (VP-042 / R12, R14):**
   - Interactive package contents selection (toggles) and ordering (Up/Down buttons).
   - Live validation summary panel verifying financial statements, trial balance tie-out, disclosure notes, and approvals.
   - Multi-revision assembly via `prototypeStore.updatePackageRevision` producing versioned package artifacts.

5. **Client Acceptance & Continuance Workflow (VP-047 / R12):**
   - Persisted multi-stage acceptance cases in `state.acceptanceCases` by client ID.
   - Interactive pre-conditions management (add/remove conditions), risk rating, and independence checklist.
   - Partner acceptance decision with formal rationale and timestamp.
   - Dedicated continuance history register tracking annual re-evaluation decisions.

6. **Audit Planning & Materiality Workspace (VP-048 / R12):**
   - Versioned audit plan persistence (`state.auditPlans`) with plan revision history.
   - ISA 320 materiality calculation with user-selected benchmark percentage and rationale.
   - Team section allocations and engagement timing milestones.
   - Independent audit plan review workflow (draft → approved) with reviewer notes.

7. **Records & Archive Register (VP-059 / R12, R14):**
   - Cross-engagement archive register listing all archived engagements with retention expiry dates.
   - Successor handover inspection request modal with reason logging.
   - Validated release binding: `archiveEngagement` strictly requires an existing issued release and records predecessor lineage.

8. **Management Approver Role Mapping (VP-056 / R04):**
   - Management account approval strictly requires `client` role (fixing RR17).
   - Client administrator (`client_admin`) is rejected from recording management approval (fixing RR18).

9. **Release Readiness & Idempotency (VP-057, VP-058 / R05):**
   - `prepareReleaseCandidate` and `issueRelease` strictly enforce readiness gates via `evaluateReleaseReadiness`.
   - Stale candidates cannot be issued if engagement generation changes (RR23).
   - Re-preparing unchanged content is idempotent and returns the existing candidate (RR24).

10. **Receivables Aging & Allocation Invariants (VP-032, VP-033 / R07):**
    - Effective settlement date is `Math.max(allocDate, rcptDate)`.
    - Historical reversals preserve earlier as-of balances (RR04, RR05).
    - Finite number validation (`Number.isFinite`) and legacy paid balance caps enforced (RR31, RR32).

11. **GL Completeness (VP-036 / R08):**
    - Missing opening balances block completeness and aggregate strictly derives from row status (RR07, RR08).

12. **Consolidation Component Resolution (VP-043–VP-046 / R09):**
    - Resolves component engagements directly from group definitions; blocks calculation if components are missing rather than fabricating fake rows.

13. **Client Portal & Search Scoping (VP-025, VP-061 / R03):**
    - Client portal safely resolves to `null` with empty state when no clients are permitted (RR37).
    - Client global search strictly excludes internal document names (RR38).

14. **PBC & Task Hierarchy Invariants (VP-013, VP-014, VP-024 / R06, R13):**
    - Draft PBC with no received evidence cannot be accepted (RR33).
    - Tasks referencing nonexistent jobs are rejected (RR27).

## B. Scope Boundary Invariants (By Design)

The following architectural invariants are intentional boundaries of the browser-only prototype:

1. **No External Service Egress:**
   - No live Microsoft Graph/OAuth APIs. M365 integration is simulated with explicit synthetic failure/success states and independent per-service verification.
   - No external email delivery (SMTP/Exchange). Outgoing messages are simulated locally.
   - No payment gateway integrations. Receipts and allocations are recorded offline.
   - No external e-signature platforms (DocuSign/Adobe Sign). Approvals are recorded through authenticated persona actions.
   - No statutory tax or payroll calculation engines.
   - No external Microsoft Purview retention locks. Archive retention dates and application holds are managed as internal prototype metadata.
   - No artificial intelligence (AI) models, embeddings, or external inference APIs.

2. **In-Browser Synthetic Persistence:**
   - Single-tab editing is the supported operational mode; cross-tab modifications trigger conflict notices to prevent lost updates.
   - State persists via `localStorage` with versioned migration and factory reset capabilities.

## C. Automated Verification Status (90/90 Unit Tests, 5/5 E2E Checks)

All 38 reproduction checks (RR01–RR38) from the acceptance re-review are automated in `tests/unit/reproduction_register.test.ts`.

| Test Category | Suite Count | Test Count | Status | Notes |
|---|---|---|---|---|
| **Reproduction Register (RR01–RR38)** | 1 suite | 38 tests | **PASS (38/38)** | Full automated coverage of R01–R14 findings |
| **Separation of Duties & Guards** | 5 suites | 14 tests | **PASS (14/14)** | Active identity, role checks, SoD invariants |
| **Calculation & Financial Invariants** | 4 suites | 12 tests | **PASS (12/12)** | AR aging, allocations, GL tie-out, consolidation |
| **Workflow Lifecycle & Releases** | 4 suites | 10 tests | **PASS (10/10)** | Tasks, templates, workpapers, PBC, releases |
| **Intake & Export Formats** | 4 suites | 10 tests | **PASS (10/10)** | CSV/XLSX intake, XLSX/DOCX/PDF watermarked exports |
| **Scope Freeze & Egress Probes** | 2 suites | 6 tests | **PASS (6/6)** | Target code scan, bundle scan, zero egress |
| **Total Unit Suite** | **20 suites** | **90 tests** | **PASS (90/90)** | `npm run test:unit` |
| **E2E Smoke & Bundle Suite** | **1 suite** | **5 tests** | **PASS (5/5)** | `npm run test:e2e` |
