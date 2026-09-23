# AuditSphere Visual Prototype — Verification Record (VP-063/VP-064)

Updated 2026-09-23. This record distinguishes executed checks from planned
acceptance assertions. No deployment or merge was performed.

## Commands

- `npm run build` runs `tsc --noEmit && vite build`.
- `npm run test:unit` runs the deterministic Node test suite.
- `npm run test:e2e` builds, serves `dist/` on loopback, runs static smoke checks,
  then launches headless Chrome for real browser checks.
- `npm run legacy:check` was not rerun in this pass; prior results are historical.

## Latest execution

| Date (UTC) | Revision | Command | Result | Evidence and limits |
|---|---|---|---|---|
| 2026-09-23 | working tree based on `2d3b6ae` | `npm run build` | PASS | TypeScript clean; Vite emitted the app. Main JS bundle is about 1.92 MB (549 kB gzip), above Vite's 500 kB advisory threshold. |
| 2026-09-23 | working tree based on `2d3b6ae` | `npm run test:unit` | PASS — 92/92, 20 suites | Includes RR01–RR38 and additional acceptance/planning checks. These verify selected deterministic rules, not all UI journeys. |
| 2026-09-23 | working tree based on `2d3b6ae` | `npm run test:e2e` | PASS — 9/9 | Five static smoke checks and four real Chrome checks. Chrome rendered the shell, exercised a persisted M365 simulation, switched to client persona, and opened all 31 staff navigation routes without render exceptions. |

The Chrome request check observed only loopback requests in the exercised
journeys. Static excluded-surface scans and this sample do not establish a formal
network policy for every possible UI state.

## Acceptance status

The 64 story rows and 39 module rows remain **Partial**. The Chrome suite checks
shell behavior and route rendering; it does not execute and verify every
acceptance criterion or complete AT-01–AT-54 journeys. In particular, the route
smoke test does not prove create/edit/review/rework behavior on each route.
Unit checks provide focused evidence for selected calculation, access, migration,
and workflow invariants only.

Outstanding review gaps include: full version-by-version migration and recovery
journeys (R10); full consolidation suite against reordered/missing components
(R09); immutable TB import history and complete adjustment/reporting pipeline
(R08); release manifests bound to actual saved package bytes and digests (R05);
source-byte immutable archives and Purview retention locks (R14); and remaining
end-to-end acceptance journeys across the modules (R12). Financial package
selection/order remains component-local rather than persisted. Egress evidence is
limited to source/bundle probes and the exercised Chrome journeys. The prototype
remains browser-local and simulated; see `remaining-limitations.md` for scope
boundaries.

Source/test tree fingerprint (SHA-256 over sorted paths and contents under
`src/` and `tests/`): `f159868f160a2ec49b88db9a15537a80def938d1f8d69a2c755ba696c2f8046d`.
Generated main asset `dist/assets/index-ujq39aWI.js` SHA-256:
`8013d773b0c997237898c38b91d176fd6ef83cce21c0a4b9712e9ade41624901`.
