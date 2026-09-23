# AuditSphere Visual Prototype — Verification Record (VP-063/VP-064)

`docs/prototype/verification.md` · updated only with actually executed checks.

## How to run

```bash
npm ci
npm run build
npm run legacy:check
npm run test:unit
npm run test:e2e
```

- `test:unit`: deterministic store/calculation/migration/scope/export-format checks
  (`tests/unit/*.test.ts` via `tsx --test`). No network.
- `test:e2e`: builds the Vite app, serves `dist/` locally, asserts routes render,
  simulations make no external provider calls, and exported XLSX/DOCX/PDF parse as
  their stated formats with expected totals + watermark (`tests/e2e/*.test.ts`).

## Executed runs

| Date (UTC) | Commit | Command | Result | Notes |
|---|---|---|---|---|
| 2026-09-23 | 1c04508 | `npm run build` | PASS (1.68s, 262→~270 modules) | `tsc --noEmit && vite build` → `dist/` |
| 2026-09-23 | 1c04508 | `npm run legacy:check` | PASS | `node --check app.bundle.js` |
| 2026-09-23 | 1c04508 | `npm run test:unit` | PASS — 34/34, 14 suites | §8.1 arithmetic, SoD/scope/hierarchy/money, migrations, AT-04 scan, TB parsing, XLSX/DOCX/PDF format |
| 2026-09-23 | 1c04508 | `npm run test:e2e` | PASS — 5/5 | `dist/` served on loopback; shell boots, no provider egress, simulated surfaces present, docs ship |
| 2026-09-23 | 1c04508 + working tree | `npm run build` | PASS | incl. budgets-actuals fix, RBAC fix, evidence persistence, in-UI prototype notes |
| 2026-09-23 | 1c04508 + working tree | `npm run legacy:check` | PASS | `node --check app.bundle.js` |
| 2026-09-23 | 1c04508 + working tree | `npm run test:unit` | PASS — 40/40, 18 suites | prior 34 + evidence-adequacy guards and extended SoD/money assertions |
| 2026-09-23 | 1c04508 + working tree | `npm run test:e2e` | PASS — 5/5 | re-run after UI-note pass |
| 2026-09-23 | working tree (Gap Closure) | `npm run build` | PASS (1.66s, 265 modules) | `tsc --noEmit && vite build` → `dist/` with 0 type errors |
| 2026-09-23 | working tree (Gap Closure) | `npm run legacy:check` | PASS | `node --check app.bundle.js` |
| 2026-09-23 | working tree (Gap Closure) | `npm run test:unit` | PASS — 52/52, 19 suites | EX01–EX18 reproduction checks, F01–F16 findings remediated (F03 EQR concerns, F04 release amendment lineage, F05 workpaper revisions & PBC intake, F06 job template lifecycle, F13 canonical SharePoint folder hierarchy, F14 watermarking) |
| 2026-09-23 | working tree (Gap Closure) | `npm run test:e2e` | PASS — 5/5 | local loopback build; shell boots, no provider egress, simulated surfaces present, docs ship |
| 2026-09-23 | working tree (R01–R14 Remediation) | `npm run build` | PASS (1.88s, 265 modules) | `tsc --noEmit && vite build` → `dist/` with 0 type errors |
| 2026-09-23 | working tree (R01–R14 Remediation) | `npm run legacy:check` | PASS | `node --check app.bundle.js` |
| 2026-09-23 | working tree (R01–R14 Remediation) | `npm run test:unit` | PASS — 90/90, 20 suites | Prior 52 + 38 reproduction checks (RR01–RR38) covering all 14 findings (R01–R14). Money invariants, GL completeness, role mapping, release readiness, and grant scope verified |
| 2026-09-23 | working tree (R01–R14 Remediation) | `npm run test:e2e` | PASS — 5/5 | local loopback build; shell boots, no provider egress, simulated surfaces present, docs ship |

No test counts, commit IDs, fixture IDs or artifact hashes are claimed until the
rows above are filled from real runs. Predecessor counts in `test-results.json`
and `test_results.json` are historical, not evidence for this backlog.

## AT-01…AT-54 mapping

Unit suite covers the deterministic cores (AT-29/33/38/40/42/43 arithmetic,
AT-04 exclusion scan, AT-11 hierarchy, AT-20 evidence adequacy, AT-24/31/47 SoD,
AT-02 upgrade paths, AT-30/31/32 allocation math). The e2e suite exercises the Vite
build for AT-01/03/04/15/25/41 journeys plus scoped search (AT-18/50) probes.
The full per-journey automation status (Automated / Partially / Scripted) is
tracked in `remaining-limitations.md` §D; scripted journeys are listed as
unexecuted here, not as passes.
