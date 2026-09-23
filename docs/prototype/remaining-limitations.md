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
  remains unverified. Chrome now opens all 16 practice reports and inspects CSV
  structure, with a filtered client export checked for cross-client leakage. The
  TB UI rejects unbalanced CSV, commits balanced CSV and actual XLSX, and retains
  predecessor rows and source hashes; full GL and adjustment workflows remain.
- **R09 — consolidation:** component resolution and pinned snapshots are improved;
  Chrome now verifies the configured group, approved elimination, balanced output
  and source-TB immutability. Perimeter edits, missing-component recovery, and
  non-base-currency translation workflows remain unverified.
- **R10 — migration/recovery:** migrations from schema versions 0–8 pass unit
  integrity checks, and Chrome checks preserve a concurrent save and report quota
  failures. Other recovery and corrupted-storage paths remain unverified.
- **R12 — acceptance breadth:** Chrome now executes annual continuance, generated
  package persistence/release/amendment/archive, the full report catalogue and
  storage recovery journeys, CSV/XLSX TB replacement, and the complete PBC
  request/response/clarification/replacement/acceptance cycle. Complete
  AT-01–AT-54 have not been executed.
  Invitation/access history, AML/KYC evidence, procedures/sampling, report data
  reconciliation and other full acceptance paths still need direct evidence.
  Package sections, ordering and notes now persist by revision.
- **R14 — archive integrity:** archive creation now copies every released package
  artifact into a separate IndexedDB record and verifies size, MIME type and
  SHA-256 before recording the archive. The copies remain browser-local and can
  be cleared or altered outside the app; there is no server-side immutable archive
  or physical retention lock. Retention dates remain optional metadata.
- **Cross-cutting:** Chrome network observation covers the exercised journeys only;
  no formal all-state egress policy is established. This is a browser-local,
  synthetic prototype with no live M365, email, payments, e-signatures, tax/payroll,
  AI, or other external services. Purview is excluded from the supported product
  scope, not an outstanding acceptance requirement.
- **Build size:** Vite warns that the main bundle exceeds 500 kB (about 1.92 MB,
  549 kB gzip in the latest build).

## Verification snapshot

Latest recorded run: 98/98 unit checks and 17/17 E2E checks passed. The unit
suite now exercises the AT-28 return, resubmission, approval and correction
revision lifecycle. E2E is five static checks plus twelve actual Chrome checks,
including rendering all 31 staff navigation routes and selected workflow
journeys. Route rendering is not full workflow acceptance. See
`verification.md`; earlier counts in this repository are historical.
