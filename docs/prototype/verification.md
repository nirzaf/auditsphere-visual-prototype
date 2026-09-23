# AuditSphere Visual Prototype — Verification Record (VP-063/VP-064)

Updated 2026-09-23. This record distinguishes executed checks from planned
acceptance assertions. Commit `c3f5fe9` is deployed as Pages release
`5fde9bc0-31e4-481d-a835-2f2135293b5f` in the existing `steaudit-prototype`
project at `prototype.steaudit.com`.

## Commands

- `npm run build` runs `tsc --noEmit && vite build`.
- `npm run test:unit` runs the deterministic Node test suite.
- `npm run test:e2e` builds, serves `dist/` on loopback, runs static smoke checks,
  then launches headless Chrome for real browser checks.
- `npm run legacy:check` was not rerun in this pass; prior results are historical.

## Latest execution

| Date (UTC) | Revision | Command | Result | Evidence and limits |
|---|---|---|---|---|
| 2026-09-23 | working tree based on `d6a226d` | `npm run build` | PASS | TypeScript clean; Vite emitted the app. Main JS bundle is about 1.96 MB (559 kB gzip), above Vite's 500 kB advisory threshold. |
| 2026-09-23 | working tree based on `d6a226d` | `npm run test:unit` | PASS — 97/97, 20 suites | Includes RR01–RR38, schema migrations 0–8, continuance guards, source revisions, artifact/package checks, PBC clarification/replacement/acceptance, and balanced consolidation including current-period result. These verify selected deterministic rules, not all UI journeys. |
| 2026-09-23 | working tree based on `d6a226d` | `npm run test:e2e` | PASS — 17/17 | Five static checks and twelve real Chrome checks. Reporting covers all 16 views, CSV headers and client filtering. Consolidation checks pinned snapshots, QAR 50,000 elimination, balance and unchanged TB. TB import covers rejected CSV, accepted CSV/XLSX and source lineage. PBC covers draft/present, response, visible clarification, replacement and separate acceptance. Other paths cover M365, scoped grants, route rendering, continuance, release/amendment/archive and storage conflict/quota. |
| 2026-09-23 | working tree after `823c311` | `npm run test:unit` | PASS — 98/98, 21 suites | AT-28 lifecycle covers manager return, owner resubmission, independent approval, approved-time correction and retained superseded revisions. |
| 2026-09-23 | working tree after `823c311` | `npm run test:e2e` | PASS — 18/18 | Five static checks and thirteen actual Chrome checks. AT-28 exercises the complete entry, return, resubmission, approval and correction UI lifecycle; the other documented browser journeys remain as stated above. |
| 2026-09-23 | current working tree | `npm run test:unit` | PASS — 99/99, 21 suites | Added accepted adjustment application, reflected adjustment de-duplication, uncertain-reflection/missing-account blocking, source immutability and current-period result in equity checks. |
| 2026-09-23 | current working tree | `npm run test:e2e` | PASS — 19/19 | Five static checks and fourteen actual Chrome checks. AT-38/40 confirms AJ-01 changes the rendered income statement, the adjusted statement of financial position remains balanced, and generated XLSX package rows contain both journal lines without changing source TB. |
| 2026-09-23 | current working tree | `npm run test:unit` | PASS — 100/100, 22 suites | Adds a guarded adjustment lifecycle: independent technical review, scoped client acceptance, rejection rationale, then the existing exact-once reporting calculation. |
| 2026-09-23 | current working tree | `npm run test:e2e` | PASS — 20/20 | Five static checks and fifteen actual Chrome checks. AT-38 creates a journal as the preparer, records an independent manager review, then records scoped management acceptance as the client persona. |
| 2026-09-23 | current working tree | `npm run test:unit` | PASS — 100/100, 22 suites | PBC response checks require the assigned contributor and a valid digest, lock accepted submissions, and retain the accepting actor, time and exact version. |
| 2026-09-23 | current working tree | `npm run test:e2e` | PASS — 20/20 | AT-23/24 exercises a client upload, clarification, replacement version and independent acceptance; assertions confirm the accepted actor, timestamp and exact version. |
| 2026-09-23 | `4371693` | `npm run test:unit` | PASS — 104/104, 23 suites | Adds AT-09: current presented revision and explicit response evidence required; accepted proposal does not create an engagement. |
| 2026-09-23 | `4371693` | `npm run test:e2e` | PASS — 23/23 | Five static checks and eighteen actual Chrome checks. AT-07/08 covers inquiry and independent proposal review/presentation; AT-09 records client acceptance with evidence through the portal and confirms no automatic engagement. |
| 2026-09-23 | `4371693` | Wrangler Pages production deploy + live HTTP check | PASS | Existing project `steaudit-prototype`, production branch, release `defb43b9-e44d-4a66-9d0c-2779ec07a64e`; custom domain returned HTTP 200 and referenced `assets/index-5dNzn6pQ.js` with the client proposal response tab and evidence-reference controls. |
| 2026-09-23 | `a2f533a` | Wrangler Pages production deploy + live HTTP check | PASS | Existing project `steaudit-prototype`, production branch, release `0e493061-2811-4879-a7c6-09d652c0787e`; cache-busted custom domain and release URLs returned HTTP 200 and referenced `assets/index-C9PHq3kX.js`, including current proposal acceptance coverage notes. |
| 2026-09-23 | current working tree | `npm run test:unit` | PASS — 105/105, 24 suites | AT-10 checks proposal/client matching, one engagement per accepted proposal, evidence-gated partner activation and proposal revision lineage. |
| 2026-09-23 | current working tree | `npm run test:e2e` | PASS — 24/24 | Five static checks and nineteen actual Chrome checks. AT-10 creates an accepted-proposal draft once, confirms terms/acceptance remain pending, then activates with partner evidence. |
| 2026-09-23 | current working tree | `npm run test:e2e` | PASS — 24/24 | AT-07 now verifies Inquiry → Discovery → Proposal history, separate QAR/USD open pipeline totals, required lost reason and exclusion of losses from conversion/open totals. |
| 2026-09-23 | current working tree | `npm run test:e2e` | PASS — 25/25 | AT-11/12 adds actual Chrome checks for parent completion blocked by unfinished subtasks, reassignment between different qualified people, retained from/to/reason history and unchanged role grants. |
| 2026-09-23 | current working tree | `npm run test:e2e` | PASS — 26/26 | AT-13 explicitly applies TPL-JOB-01, verifies one fresh linked job and exact task-tree size, fresh IDs and reset Not started statuses. |
| 2026-09-23 | current working tree | `npm run test:unit` | PASS — 106/106, 25 suites | AT-14 rejects a client persona as a job mention recipient and records an eligible staff mention locally. |
| 2026-09-23 | current working tree | `npm run test:e2e` | PASS — 27/27 | AT-14 saves and displays an internal job note to staff, then switches to the client portal and confirms the note is absent. |
| 2026-09-23 | current working tree | `npm run test:e2e` | PASS — 28/28 | AT-27 records a manually received meeting note as Internal and verifies it is absent from the scoped client portal messages. |
| 2026-09-23 | current working tree | `npm run test:unit` | PASS — 106/106, 25 suites | No unit behavior changed in this increment. |
| 2026-09-23 | current working tree | `npm run test:e2e` | PASS — 29/29 | Five static checks and 24 actual Chrome checks. AT-26 resolves client/contact/request/date placeholders, records each selected accepted/failed/unknown outcome once, and detects no external HTTP(S) mail request. |
| 2026-09-23 | `8eed12e` | Wrangler Pages production deploy + live HTTP check | PASS | Existing project `steaudit-prototype`, production branch, release `dd704f82-1a24-40b3-90f0-6cd5dfe02ca5`; cache-busted custom domain returned HTTP 200 and referenced `assets/index-C0d5PfYS.js`. |
| 2026-09-23 | `c3f5fe9` | Wrangler Pages production deploy + live HTTP check | PASS | Existing project `steaudit-prototype`, production branch, release `5fde9bc0-31e4-481d-a835-2f2135293b5f`; release URL and cache-busted `prototype.steaudit.com` returned HTTP 200 and referenced `assets/index-DCcknJ1g.js`. |
| 2026-09-23 | `cabe09a` | Wrangler Pages production deploy + live HTTP check | PASS | Existing project `steaudit-prototype`, production branch, release `8af7da76-b424-4d46-9ca5-822de6748697`; cache-busted custom domain returned HTTP 200 and referenced `assets/index-Bk0-Z_4X.js` with scoped internal notes and mentions. |
| 2026-09-23 | `6f9441d` | Wrangler Pages production deploy + live HTTP check | PASS | Existing project `steaudit-prototype`, production branch, release `b045b304-3f94-4c23-b065-cdc6d546e6e0`; cache-busted custom domain returned HTTP 200 and referenced `assets/index-vTNLMhnj.js`. |
| 2026-09-23 | `bf9610f` | Wrangler Pages production deploy + live HTTP check | PASS | Existing project `steaudit-prototype`, production branch, release `573e424f-3cf9-450c-a308-10f6b13608ad`; cache-busted `prototype.steaudit.com` returned HTTP 200 and referenced `assets/index-cQ67ul7c.js`. |
| 2026-09-23 | `0fbd838` | Wrangler Pages production deploy + live HTTP check | PASS | Existing project `steaudit-prototype`, production branch, release `be15a1c6-01a6-4051-945c-e49781be2f97`; cache-busted custom domain returned HTTP 200 and referenced `assets/index-DdSpPceo.js` with the verified opportunity flows. |
| 2026-09-23 | `a4d2584` | Wrangler Pages production deploy + live HTTP check | PASS | Existing project `steaudit-prototype`, production branch, release `21b32296-a1d0-4b5d-b7ff-b142b3f738be`; release URL and cache-busted `prototype.steaudit.com` returned HTTP 200 with `assets/index-CfbE3If6.js`, including accepted-proposal draft and partner activation flow. |
| 2026-09-23 | `4245121` | Wrangler Pages production deploy + live HTTP check | PASS | Existing project `steaudit-prototype`, production branch, release `e2cd611f-30fd-4888-8a63-958a693c42de`; both `prototype.steaudit.com` and the release URL returned HTTP 200 and referenced `assets/index-r25pgxPf.js`, which includes the AT-07/08 proposal workflow. |
| 2026-09-23 | `7f9420f` | Wrangler Pages production deploy + live HTTP check | PASS | Existing project `steaudit-prototype`, release `66f5c1f5-5123-4bdf-b8f8-3fae08f93ee4`; cache-busted `prototype.steaudit.com` returned HTTP 200 and referenced `assets/index-Dikuk21g.js`, which includes the client custom-field editor, relationship group flow and scope guards. |
| 2026-09-23 | `3831163` | Wrangler Pages production deploy + live HTTP check | PASS | Existing project `steaudit-prototype`, release `89b2434a-aa9b-46f3-b4dd-4cb83290b976`; cache-busted `prototype.steaudit.com` returned HTTP 200 and referenced `assets/index-5Js-qCHe.js`, which includes the PBC contributor and acceptance-version guards. |
| 2026-09-23 | `c92459d` | Wrangler Pages production deploy + live HTTP check | PASS | Existing project `steaudit-prototype`, release `ae0eafaf-ace4-427c-91f9-f62c2056d176`; `prototype.steaudit.com` returned HTTP 200 and referenced `assets/index-Ck3yghnw.js`. |
| 2026-09-23 | `969c61c` | Wrangler Pages production deploy + live HTTP check | PASS | Existing project `steaudit-prototype`, release `51864da9-d53a-4690-9634-c70a58b48c52`; `prototype.steaudit.com` returned HTTP 200 and referenced `assets/index-C_vdsVES.js`. |
| 2026-09-23 | `f645193` | Wrangler Pages production deploy + live HTTP check | PASS | Existing project `steaudit-prototype`, release `9ff739d4-37cf-42f0-96c4-b8b405f25177`; `prototype.steaudit.com` returned HTTP 200 and referenced `assets/index-CJxHUyQS.js`. |

The Chrome request check observed only loopback requests in the exercised
journeys. Static excluded-surface scans and this sample do not establish a formal
network policy for every possible UI state. The AT-41/42/48 browser journey now
also exercises manager, management and partner approvals, exact artifact-bound
release, amendment generation reset, predecessor manifest preservation, and
archive artifact copies with rechecked bytes and an unspecified optional
retention date.
The AT-49/60 report journey checks every catalogue entry and exported CSV
structure, with explicit cross-client leakage checks on a filtered export.
The AT-43/44/45 journey checks the configured group perimeter, local currency
rates, approved elimination, balanced output and source-TB immutability. It does
not cover perimeter edits, missing-component recovery or non-base-currency rates.
The AT-35 import journey drives CSV and actual XLSX files through the UI,
checking that a rejected preview leaves the accepted source unchanged and that
accepted replacements retain predecessor rows and source identities.
The AT-23/24 journey creates and presents a request, hides its draft from the
client, records two client-file versions around a client-visible clarification,
then accepts the replacement separately.
The AT-26 journey selects the PBC request template and confirms all placeholders
resolve in the subject/body. It records accepted, failed and unknown outcomes
as separate local communication records and confirms the sends create no
external HTTP(S) request. Acceptance remains simulation only; actual delivery,
recipient validation and retry policy remain outside this verified slice.

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
server-side immutable archives and physical retention locks (R14); and remaining
end-to-end acceptance journeys across the modules (R12). The
current checks cover schema migrations 0–8 and browser storage conflict/quota
behavior, but do not establish every recovery path. Package section ordering and
notes now persist with generated revisions. Egress evidence is limited to
source/bundle probes and exercised Chrome journeys. The prototype remains
browser-local and simulated; see `remaining-limitations.md` for scope boundaries.
