# AuditSphere Visual Prototype — Remaining Limitations

Updated 2026-09-23. Selected R01–R14 defects received code and regression
coverage, but that does not constitute full acceptance. All 64 stories and 39
modules remain Partial; see `verification.md` for the exact executed checks.

## Known acceptance gaps

- **R05 — release evidence:** readiness and stale-candidate guards are implemented,
  but manifests identify metadata and synthetic filenames; they do not freeze
  actual saved package bytes and digests. Full release journeys remain unverified.
- **R08 — accounting history:** trial-balance rows can be replaced; immutable import
  history and the complete adjustment-to-report pipeline remain incomplete.
- **R09 — consolidation:** component resolution and pinned snapshots are improved;
  full group workflows against reordered and missing components have not been run.
- **R10 — migration/recovery:** schema migration exists, but exhaustive
  version-by-version integrity migration and browser storage recovery are not
  verified end to end.
- **R12 — acceptance breadth:** screens and store paths exist across the 39 modules,
  but complete journeys for AT-01–AT-54 have not been executed. Package selection
  and ordering are component-local and not persisted; invitation/access history,
  AML/KYC evidence, procedures/sampling, reports, and other full acceptance paths
  still need direct evidence.
- **R14 — archive integrity:** release metadata indexes and handover records are
  available, but source bytes are not preserved as an immutable archive and no
  Purview retention lock exists.
- **Cross-cutting:** Chrome network observation covers the exercised journeys only;
  no formal all-state egress policy is established. This is a browser-local,
  synthetic prototype with no live M365, email, payments, e-signatures, tax/payroll,
  AI, or Purview services.
- **Build size:** Vite warns that the main bundle exceeds 500 kB (about 1.92 MB,
  549 kB gzip in the latest build).

## Verification snapshot

Latest recorded run: 92/92 unit checks and 9/9 E2E checks passed. E2E is five
static smoke checks plus four actual Chrome checks, including rendering all 31
staff navigation routes. Route rendering is not workflow acceptance. See
`verification.md`; earlier counts in this repository are historical.
