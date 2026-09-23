# AuditSphere Visual Prototype — Verification Record (VP-063/VP-064)

Updated 2026-09-23. This record distinguishes executed checks from planned
acceptance assertions. Commit `5ec7cd9` was deployed to the existing
`steaudit-prototype` Pages project and verified at `prototype.steaudit.com`.
This working-tree change has not yet been committed or deployed.

## Commands

- `npm run build` runs `tsc --noEmit && vite build`.
- `npm run test:unit` runs the deterministic Node test suite.
- `npm run test:e2e` builds, serves `dist/` on loopback, runs static smoke checks,
  then launches headless Chrome for real browser checks.
- `npm run legacy:check` was not rerun in this pass; prior results are historical.

## Latest execution

| Date (UTC) | Revision | Command | Result | Evidence and limits |
|---|---|---|---|---|
| 2026-09-23 | working tree based on `5ec7cd9` | `npm run build` | PASS | TypeScript clean; Vite emitted the app. Main JS bundle is about 1.95 MB (557 kB gzip), above Vite's 500 kB advisory threshold. |
| 2026-09-23 | working tree based on `5ec7cd9` | `npm run test:unit` | PASS — 96/96, 20 suites | Includes RR01–RR38, schema migrations 0–8, continuance guards, source revisions and artifact/package checks. These verify selected deterministic rules, not all UI journeys. |
| 2026-09-23 | working tree based on `5ec7cd9` | `npm run test:e2e` | PASS — 14/14 | Five static checks and nine real Chrome checks. Chrome exercised M365 configuration, recovery and workspace setup; identity mapping vs scoped grants; persona scoping; all staff routes; partner-approved annual continuance into a clean draft; generated package bytes and digests across reload; scoped reporting; storage conflict preservation and quota failure messaging. |

The Chrome request check observed only loopback requests in the exercised
journeys. Static excluded-surface scans and this sample do not establish a formal
network policy for every possible UI state. The AT-41/42/48 browser journey now
also exercises manager, management and partner approvals, exact artifact-bound
release, amendment generation reset, predecessor manifest preservation, and
archive indexing with an unspecified optional retention date.

## Acceptance status

The 64 story rows and 39 module rows remain **Partial**. The Chrome suite checks
shell behavior and route rendering; it does not execute and verify every
acceptance criterion or complete AT-01–AT-54 journeys. In particular, the route
smoke test does not prove create/edit/review/rework behavior on each route.
Unit checks provide focused evidence for selected calculation, access, migration,
and workflow invariants only.

Outstanding review gaps include the full consolidation suite against
reordered/missing components (R09); complete adjustment/reporting acceptance
journeys (R08); dispatch, duplicate-delivery, and all release edge paths (R05);
source-byte immutable archives and physical retention locks (R14); and remaining
end-to-end acceptance journeys across the modules (R12). The
current checks cover schema migrations 0–8 and browser storage conflict/quota
behavior, but do not establish every recovery path. Package section ordering and
notes now persist with generated revisions. Egress evidence is limited to
source/bundle probes and exercised Chrome journeys. The prototype remains
browser-local and simulated; see `remaining-limitations.md` for scope boundaries.
