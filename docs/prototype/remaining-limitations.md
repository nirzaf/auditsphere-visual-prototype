# AuditSphere Visual Prototype — Remaining Limitations

Updated 2026-09-23. Selected R01–R14 defects received code and regression
coverage, but that does not constitute full acceptance. All 64 stories and 39
modules remain Partial; see `verification.md` for the exact executed checks.

## Known acceptance gaps

- **R05 — release evidence:** package revisions now create and persist real XLSX,
  DOCX and PDF bytes with verified SHA-256 manifests, and the issue guard binds to
  those artifacts. Chrome verifies manager, management and partner approvals,
  release, amendment reset, and predecessor-manifest preservation. Dispatch,
  duplicate-delivery and all release edge paths remain unverified.
- **R08 — accounting history:** imported trial-balance snapshots and mapping/source
  metadata are retained by revision. The complete adjustment-to-report pipeline
  and all reporting acceptance journeys remain unverified.
- **R09 — consolidation:** component resolution and pinned snapshots are improved;
  full group workflows against reordered and missing components have not been run.
- **R10 — migration/recovery:** migrations from schema versions 0–8 pass unit
  integrity checks, and Chrome checks preserve a concurrent save and report quota
  failures. Other recovery and corrupted-storage paths remain unverified.
- **R12 — acceptance breadth:** Chrome now executes annual continuance, generated
  package persistence/release/amendment/archive, reporting catalogue and storage recovery journeys. Complete
  AT-01–AT-54 have not been executed. Invitation/access history, AML/KYC evidence,
  procedures/sampling, report behavior and other full acceptance paths still need
  direct evidence. Package sections, ordering and notes now persist by revision.
- **R14 — archive integrity:** release metadata indexes and handover records are
  available, but source bytes are not preserved as an immutable archive. Retention
  dates are optional metadata; there is no physical archive lock.
- **Cross-cutting:** Chrome network observation covers the exercised journeys only;
  no formal all-state egress policy is established. This is a browser-local,
  synthetic prototype with no live M365, email, payments, e-signatures, tax/payroll,
  AI, or other external services. Purview is excluded from the supported product
  scope, not an outstanding acceptance requirement.
- **Build size:** Vite warns that the main bundle exceeds 500 kB (about 1.92 MB,
  549 kB gzip in the latest build).

## Verification snapshot

Latest recorded run: 96/96 unit checks and 14/14 E2E checks passed. E2E is five
static checks plus nine actual Chrome checks, including rendering all 31 staff
navigation routes and selected workflow journeys. Route rendering is not full
workflow acceptance. See
`verification.md`; earlier counts in this repository are historical.
