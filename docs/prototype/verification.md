# AuditSphere Visual Prototype — Verification Record (VP-063/VP-064)

| 2026-09-24 | VP-013/014 job register controls and safe cancellation | `npm run lint`, `npm run test:unit`, `npm run test:e2e`, focused AT-11/12 Chrome | PASS — 145/145 unit, 63/63 full E2E; focused AT-11/12 1/1 after final read-only assertion | Chrome combines client, engagement, owner, status and overdue filters; manually blocks a job with a required reason; then cancels it with an attributable reason and confirms the job and retained tasks, linked document and time remain accessible but read-only. Unit guards require the cancellation reason, preserve task history, prevent reopen, and block new tasks, task edits/reassignment and time against cancelled jobs. Existing parent-completion, one-level hierarchy and reasoned reassignment checks pass. Stories VP-013/014 and Module 05 remain Partial because editable job fields, task editing/status/reorder and files/time detail tabs are still incomplete. |

| 2026-09-24 | `ebb7228` | Wrangler Pages Production deploy + live bundle hash check | PASS | Deployed to the existing `steaudit-prototype` Production / `production` project as `7bc8dea9-a882-4ce8-83dd-882200af0b98` ([release](https://7bc8dea9.steaudit-prototype.pages.dev)). Both the immutable release and `https://prototype.steaudit.com` returned HTTP 200 and served `assets/index-ETCiI9Iz.js` (2,231,539 bytes; SHA-256 `f7fea0ef4a4fc72851206d384f6ccd4fd165ee8dbc765287618094e5bc79e855`), matching the local build. |

| 2026-09-24 | VP-005 dashboard filter and finance visibility follow-up | `npm run lint`, `npm run test:unit`, `npm run test:e2e` | PASS — 144/144 unit, 63/63 E2E | Chrome confirms the global manager dashboard recalculates and filters by fiscal period, client and engagement; finance summaries are visible to the manager and absent for the preparer. Existing narrow-grant, overdue work drill-down, assignee and as-of boundary checks also pass. Module 01 remains Partial because partner, billing and other staff persona combinations still need direct journey evidence. No application source changed; production remains the previously verified implementation on the existing `steaudit-prototype` Pages project at `https://prototype.steaudit.com`. |

| 2026-09-24 | VP-034 client chart revision dependency invalidation | `npm run lint`, `npm run test:unit`, `npm run test:e2e` | PASS — 144/144 unit, 63/63 E2E | AT-34 changes both client accounting context and chart account detail. Chrome verifies the selected engagement retains its previous package basis, its reviewed statement set becomes stale, and a same-client sibling engagement loses mapping approval (retained as Draft) and has its reviewed statement set staled. The journey now self-seeds and passes in isolation. Module 20 remains Partial for broader period/chart change and dependent-output rework combinations. No application source changed; existing production behavior remains on `steaudit-prototype` at `https://prototype.steaudit.com`. |

| 2026-09-24 | VP-005 dashboard scope safety | `npm run lint`, `npm run test:unit`, `npm run test:e2e` | PASS — 144/144 unit, 63/63 E2E | Chrome verifies the narrow ENG-26001 grant sees only its portfolio row and client count; sibling engagement, sibling activity and a selected sibling are hidden. Global manager retains the complete portfolio. Dashboard counters, stage distribution and selected-engagement attention derive from permitted engagements, and the displayed as-of date comes from shared state. VP-005 remains Partial because selectable as-of drill-down and overdue metrics are not implemented. Commit `b8f76f2` was pushed to `main` and deployed to the existing `steaudit-prototype` Production / `production` Pages branch as `https://f14df4dc.steaudit-prototype.pages.dev`. That URL and `https://prototype.steaudit.com` returned HTTP 200 and served `assets/index-CrMaXp7V.js` (2,219,350 bytes; SHA-256 `b754d6035f051b8777912e50526f5572e41d4c91808f5b642d917164a1b3b2bd`), matching local `dist`. |

| 2026-09-24 | Narrow-grant job/task drill-down safety | `npm run lint`, `npm run test:unit`, `npm run test:e2e` | PASS — 144/144 unit, 63/63 E2E | The VP-005 browser journey seeds one synthetic sibling job/task. A narrow ENG-26001 persona cannot see that job or task in the Jobs workspace; the global manager can. Jobs, task rows, client selectors, engagement selectors and selected workspace now all derive from granted engagements. Module 05 remains Partial for job cancellation and its full edit/status/filter matrix. Commit `729e47b` was pushed and deployed to the existing `steaudit-prototype` production branch as `https://3be4e39d.steaudit-prototype.pages.dev`. That URL and `https://prototype.steaudit.com` returned HTTP 200 and served `assets/index-CaJqCnhO.js` (2,219,600 bytes; SHA-256 `3ae70089649f92b3e147c1939dcadc54a82b59896cba223030241d99848cdf3b`), matching the local build. |

| 2026-09-24 | VP-060 reporting catalogue and persona/filter acceptance | `npm run lint`, `npm run test:unit`, `npm run test:e2e` | PASS — 144/144 unit, 62/62 E2E | Chrome reconciles all 16 report CSVs to source values, independently recomputes WIP/utilization/compliance, invokes print for every report, and verifies full manager/partner, nine-report billing, and four-report records catalogues. Every records report is exported under a selected-client filter and checked against source engagement membership. VP-060 is Verified. No app source changed in this acceptance update; production already serves the tested report implementation at `https://prototype.steaudit.com`. |

| 2026-09-24 | VP-057/058 exact release integrity and amendment gates | `npm run lint`, `npm run test:unit`, `npm run test:e2e` | PASS — 144/144 unit, 62/62 E2E | Chrome tampers with a generated package artifact and confirms SHA-256 verification blocks candidate freeze; restores the original bytes, then freezes and issues the exact artifact manifest. The journey confirms amendment preserves predecessor identities and resets candidate/partner approval. Unit tests cover missing release gates, stale candidates, idempotent candidate preparation, duplicate same-generation issue and mandatory fresh approvals after amendment. VP-057/058 are Verified. Existing production build includes the tested behavior; this update changes only acceptance tests and records. |

| 2026-09-24 | VP-047 acceptance and continuance completion | `npm run lint`, `npm run test:unit`, `npm run test:e2e` | PASS — 144/144 unit, 62/62 E2E | Chrome saves five evidence-backed screening checks, records a pending recommendation, displays prohibited-mandate status, requires a separate assigned-partner decision, and creates the next-period draft from changed facts. The draft has no copied balances, tasks, documents/evidence, samples, audit programs, time, budgets, findings, workpapers, reviews, approvals, packages or releases. Unit tests reject missing screening evidence, prohibited acceptance and blank changed-facts; retry remains idempotent. VP-047 is Verified. No app source changed in this acceptance update; its existing implementation is included in production release `8ce2648f` at the immutable Pages URL and `prototype.steaudit.com`, both previously verified with the same 2,218,176-byte application bundle. |

| 2026-09-24 | VP-059 successor archive UI / handover target | `npm run lint`, `npm run test:unit`, `npm run test:e2e` | PASS — 144/144 unit, 62/62 E2E | Chrome rearchives a successor release from the practice register, checks both archive records and predecessor linkage, verifies all copied artifact hashes, then records retention and hold/handover history on the latest archive. Unit checks reject invalid dates, unexplained holds, missing releases and artifact digest mismatches; a shared-store fix makes handover select the latest archive. VP-059 is Verified. Commit `ca4ec89` was pushed to `main` and deployed to the existing `steaudit-prototype` Production / `production` branch as `https://8ce2648f.steaudit-prototype.pages.dev`. That URL and `https://prototype.steaudit.com` returned HTTP 200, served the same-origin CSP, and returned `assets/index-Cg1rEtQy.js` (2,218,176 bytes; SHA-256 `d08879a64865d69b3e2891c344628be4f6d238fdbdd0dda898abe89a35d457a5`), matching local `dist`. |

| 2026-09-24 | VP-063 external-request block / local build | `npm run lint`, `npm run test:unit`, `npm run test:e2e` | PASS — 144/144 unit, 62/62 E2E | Five static checks and 57 Chrome journeys. A same-origin Content Security Policy restricts default resources and all runtime connections to self. Static acceptance asserts the policy, and Chrome confirms an attempted external `fetch` is rejected by CSP. CDP Fetch independently blocks non-local HTTP(S) during the browser suite, which recorded zero blocked attempts and zero external network requests. This verifies the exercised Chrome flows only; VP-063 remains Partial pending all-state coverage. Commit `6d6a9ed` was pushed to `main` and deployed to the existing `steaudit-prototype` Production / `production` Pages branch as `https://05a679dc.steaudit-prototype.pages.dev`. Both the immutable release URL and `https://prototype.steaudit.com` returned HTTP 200, exposed the same-origin CSP, and served `assets/index-Cm0YP8pz.js` (2,218,158 bytes; SHA-256 `669e66b5c35fe1fdea307dfd47cdff6ed0e96a190276a30cf83380835bb20abb`), matching local `dist`. |

| 2026-09-24 | VP-056 independent approvals / release 73c6e93 | npm run lint, npm run test:unit, npm run test:e2e | PASS — 144/144 unit, 61/61 E2E | Five static checks and 56 Chrome journeys. VP-056 verifies reasoned EQR assignment/substitution, only the assigned EQR can concur, partner/manager/team independence, concern isolation between engagements, deliberate current-revision package presentation, and client acknowledgement with rationale/evidence before release. Stale decisions are rejected and history keeps the original generation. Commit 73c6e93 is pushed to main and deployed to the existing steaudit-prototype Production / production Pages project as fd075aed-482c-47c3-be5a-0a81ad335c94 (https://fd075aed.steaudit-prototype.pages.dev). The release URL and https://prototype.steaudit.com both returned HTTP 200 and served assets/index-Cm0YP8pz.js (2,218,158 bytes; SHA-256 669e66b5c35fe1fdea307dfd47cdff6ed0e96a190276a30cf83380835bb20abb). The custom hostname's bundle hash matches the immutable release and local build. |

Updated 2026-09-24. This record distinguishes executed checks from planned
acceptance assertions. The latest source and Pages release are recorded below;
the existing `steaudit-prototype` project serves `prototype.steaudit.com`.

| 2026-09-24 | VP-055 scoped review queue complete / release `fffc74d` | `npm run lint`, `npm run test:unit`, `npm run test:e2e` | PASS — 143/143 unit, 61/61 E2E | E2E includes five static checks and 56 Chrome journeys. AT-55 verifies reasoned reassignment moves a point between personal queues, cross-engagement response routing, status/severity filters, CSV export exclusion for an ungranted sibling engagement, and omission of internal review text from the client portal. Finding subjects pin to revisions and reopen after disposition change; preparers can reach the review queue. VP-055 is Verified. Commit `fffc74d` is on `main` and deployed to the existing `steaudit-prototype` Production / `production` Pages project as `f5794bd1-c836-4515-85eb-d4478df661b6`. The release URL and `https://prototype.steaudit.com` both returned HTTP 200 and served `assets/index-BVOhblsG.js` (2,208,850 bytes; SHA-256 `62d21b1ce6a7c4ea8e0a4d0454e1d981cedb8f643848657c3816b3ec6416876a`). Custom-host bundle bytes match the release and local build. Overall acceptance remains Partial: 58 stories and 34 modules still lack full criterion-by-criterion evidence. |
| 2026-09-24 | VP-059 archive metadata lineage | `npm run lint`, `npm run test:unit`, `npm run test:e2e` | PASS — 141/141 unit, 58/58 E2E | Schema v21 migrates legacy archives with an attributable baseline; store tests verify corrections and successor links. Chrome verifies a retention correction, held-handover rejection without a record, and local handover after lift. The full run also rechecks AT-32's date-sensitive allocations and AT-23's named contributor using the permitted client identity. Vite retains the existing large-bundle advisory. Successor-release artifact copying remains unverified in Chrome. |
| 2026-09-23 | AT-53 dialog keyboard behavior | `npm run lint`, `npm run test:unit`, `npm run test:e2e` | PASS — 139/139 unit, 58/58 E2E | Chrome verifies route rendering and no horizontal overflow at 320px, 390px and 768px; the client dialog has an accessible name, initial focus, Tab wrap, Escape cancel, and trigger focus restoration. Client portal projection also confirms shared documents appear while an internal workpaper stays hidden. VP-003 remains Partial; this does not cover every dialog or unsaved-change flow. |

## Commands

- `npm run build` runs `tsc --noEmit && vite build`.
- `npm run test:unit` runs the deterministic Node test suite.
- `npm run test:e2e` builds, serves `dist/` on loopback, runs static smoke checks,
  then launches headless Chrome for real browser checks.
- `npm run legacy:check` was not rerun in this pass; prior results are historical.

## Latest execution

| Date (UTC) | Revision | Command | Result | Evidence and limits |
|---|---|---|---|---|
| 2026-09-24 | working tree after `d028d4f` | `npm run lint` + `npm run test:unit` + `npm run test:e2e` | PASS — 141/141 unit, 59/59 E2E | VP-055 binds responses to workpaper versions, rejects responder self-clear, records independent clearance, and reopens after a workpaper revision while retaining prior response history. Cross-engagement personal queues, assignment history, non-workpaper subjects, filters and exports remain open. |
| 2026-09-24 | working tree after `2a553ba` | `npm run lint` + `npm run test:unit` + `npm run test:e2e` | PASS — 141/141 unit, 58/58 E2E | VP-054 now creates a finding from a tested sample exception in Chrome and retains its population/item reference, signed net amount and gross amount. Lint is clean; Vite retains the existing large-bundle advisory. Cross-view finding reports and the full reopen/waiver matrix remain open. |
| 2026-09-24 | working tree after `9602a2b` | `npm run test:e2e` + focused AT-41/42/48 rerun | PASS — 58/58 + 1/1 | VP-053 covers EVD-01 replacement/adequacy and post-unlink client projection. AT-41/42/48 issues a three-artifact package, unlinks a same-engagement evidence reference, verifies reassessment, and confirms the released manifest/source revisions remain fixed and each available artifact's SHA-256 still matches its issued identity. |
| 2026-09-24 | `5e07348` | Wrangler Pages production deploy + live HTTP/hash check | PASS | Existing `steaudit-prototype` project; release `119a0f4c` (`https://119a0f4c.steaudit-prototype.pages.dev`). Release URL and `https://prototype.steaudit.com` returned HTTP 200 and served `assets/index-Ce5fSX8H.js` (2,200,407 bytes, SHA-256 `3ddd7feeb8f323d86a3375b17514ba8dc5e37beb7b7efa4c270418cf2141bc18`), matching the local production bundle. |
| 2026-09-24 | `5e07348` | `npm run lint` + `npm run test:unit` + `npm run test:e2e` | PASS — 141/141 unit, 58/58 E2E | AT-49 reconciles all 16 CSVs against source records and independently recomputes WIP, utilization and compliance; Billing sees its nine-report catalogue and its filtered invoice CSV excludes other clients. The journey exposed and verifies fallback from optional `engagementId` to required `eng` on seeded invoices, restoring issued/paid amounts in WIP and invoice/credit/aging engagement references. Build retains the existing large-bundle advisory. |
| 2026-09-24 | `95e5141` | Wrangler Pages production deploy + live HTTP/hash check | PASS | Existing `steaudit-prototype` project; release `1699d781` (`https://1699d781.steaudit-prototype.pages.dev`). Release URL and `https://prototype.steaudit.com` returned HTTP 200 and served `assets/index-Cz-hpa9t.js` (2,200,347 bytes, SHA-256 `801d11c0ac078caf26749576c44e5e79e96878b6b9053743b05c880a8fd33079`), matching the local production bundle. |
| 2026-09-24 | working tree before archive lineage commit | `npm run lint` + `npm run test:unit` + `npm run test:e2e` | PASS — 141/141 unit, 58/58 E2E | Migration v21 preserves archive manifests and adds baseline history; archive updates retain actor/time and before/after metadata, successor archive records reference their predecessor. Chrome covers metadata correction and the hold/handover branch. Full Pages deploy follows the source commit. |
| 2026-09-23 | working tree after `8b0caba` | `npm run test:e2e` | PASS — 58/58 | AT-41/42/48 now exercises VP-059 hold and handover: an active hold rejects the request without creating state; after lift, the requester and reason persist as local metadata. This does not send or authorize an external records transfer. No app code changed; the verified production release remains `aa201f0c`. |
| 2026-09-23 | working tree after `3de0366` | `npm run test:e2e` | PASS — 58/58 | Five static checks and 53 Chrome journeys. AT-18/AT-25 now opens Shared Documents and confirms the client-shared bank statement is visible while the engagement's internal working-paper document is not. No app code changed; the verified production release remains `aa201f0c`. |
| 2026-09-23 | `dfded0f` | Wrangler Pages production deploy + live HTTP/hash check | PASS | Existing `steaudit-prototype` project; release `aa201f0c` (`https://aa201f0c.steaudit-prototype.pages.dev`). Release URL and `https://prototype.steaudit.com` returned HTTP 200 and served `assets/index-Cb1eqTbH.js` (2,197,471 bytes, SHA-256 `c97ef51b76ae68eb183be5865c7ea32636ca678108456ad8e538d51297f9d106`), matching the local production bundle. |
| 2026-09-23 | `545c15a` | Wrangler Pages production deploy + live HTTP/hash check | PASS | Existing `steaudit-prototype` Pages project; release `b941fa73` (`https://b941fa73.steaudit-prototype.pages.dev`). Release URL and `https://prototype.steaudit.com` returned HTTP 200 and served `assets/index-Bup50Yz5.js` (2,180,640 bytes, SHA-256 `dec0772afaf45ed8834df947ef1e1f7814c96e1fa395b4f7fda2c35c3ccfc6fd`), matching the local production bundle. |
| 2026-09-23 | AT-26 recipient and attempt controls | `npm run test:unit` + `npm run test:e2e` | PASS — 138/138 unit, 58/58 E2E | Unit and Chrome reject out-of-client recipients without creating records; each accepted, failed or unknown manual attempt stores a unique local reference and evidence explicitly disclaiming provider receipt. No external mail request or automatic retry occurs. |
| 2026-09-23 | `60b360d` | Wrangler Pages production deploy + live HTTP/hash check | PASS | Existing `steaudit-prototype` Pages project; release `799775b8` (`https://799775b8.steaudit-prototype.pages.dev`). Release URL and `https://prototype.steaudit.com` returned HTTP 200 and served `assets/index-S_oqf5XB.js` (2,179,164 bytes, SHA-256 `14318ad39965d854377091bb78a6eccc197d68fbeb0a2b9b0f5e3cd6de36714f`), matching the local production bundle. |
| 2026-09-23 | VP-039 reconciliation rework | `npm run test:unit` + `npm run test:e2e` | PASS — 137/137 unit, 58/58 E2E | Chrome returns a schedule with a required reason, manager saves revision 2 after correcting the as-of date, and reviewer independently approves it; the return note remains readable in revision history. Unit coverage also confirms source replacement stales approved work and preserves its history. |
| 2026-09-23 | `a8d74ac` | `npm run test:unit` + `npm run test:e2e` | PASS — 137/137 unit, 58/58 E2E | VP-021 Chrome covers stable document identity through rename/move, rejects cross-client/invalid folder paths, blocks unavailable preview and evidence acceptance, and restores the reference. Build passed with the existing large-bundle advisory. |
| 2026-09-23 | `a8d74ac` | Wrangler Pages production deploy + live HTTP/hash check | PASS | Existing `steaudit-prototype` Pages project; release `23729c44` (`https://23729c44.steaudit-prototype.pages.dev`). Release URL and `https://prototype.steaudit.com` returned HTTP 200 and served `assets/index-C_T2W_jT.js` (2,179,065 bytes, SHA-256 `68127355d4dcbb2966d3b98978120a43f231b09db1a7e29084af735ad3d28f73`), matching the local production bundle. |
| 2026-09-23 | working tree after `1f9fb76` | `npm run test:unit` + `npm run test:e2e` | PASS — 136/136 unit, 57/57 E2E | Five static checks and 52 Chrome journeys. AT-49 verifies native print is invoked for all 16 reports in addition to CSV coverage. AT-52 now carries manually entered client data through won opportunity, scoped client response, engagement, job, approved mapping and persisted XLSX/DOCX/PDF artifacts. AT-53 checks all staff routes plus 768px/390px layout, modal bounds and keyboard focus/Tab navigation. Overall ledger remains 59/64 stories and 36/39 modules Partial; these journeys do not close every backlog criterion. |
| 2026-09-23 | working tree after `1f9fb76` | `npm run test:unit` + `npm run test:e2e` | PASS — 136/136 unit, 57/57 E2E | Follow-up R05 check verifies case-insensitive trimmed recipient deduplication and blocks a second release record for the same generation. Build passed with the existing large-bundle advisory. Overall ledger remains Partial. |
| 2026-09-23 | working tree after `8531ff1` | `npm run test:e2e` | PASS — 57/57 | AT-49/AT-60 now maps every CSV field in all 16 reports to persisted source records; WIP, utilization and compliance rows are independently recalculated. Five static checks and 52 Chrome journeys passed. OS print output and remaining report filter/persona combinations remain outside this evidence. |
| 2026-09-23 | working tree after `29a6c7a` | `npm run test:unit` + `npm run test:e2e` | PASS — 136/136 unit, 57/57 E2E | AT-20 now completes replacement review, current-evidence relinking, preparer reassessment and independent reviewer re-clearance for PRC-01; the prior evidence pin remains unchanged. The run also includes all-report source mapping, native print invocation, AT-52 and expanded AT-53. Overall acceptance remains Partial. |
| 2026-09-23 | working tree after `aa0180d` | `npm run test:unit` + `npm run test:e2e` | PASS — 136/136 unit, 57/57 E2E | AT-20 now covers evidence replacement through procedure and WP-A1 reassessment: reasoned removal of the stale workpaper pin, replacement pin, updated workpaper, current workbook metadata, submission and independent reviewer clearance. Old document and clearance/link histories remain retained. Five static checks and 52 Chrome journeys passed; remaining VP-021 rename/move/broken-reference cases are still open. |
| 2026-09-23 | `d0d5f3e` | Wrangler Pages production deploy + live HTTP/hash check | PASS | Existing `steaudit-prototype` Pages project; release `d76da5d5` (`https://d76da5d5.steaudit-prototype.pages.dev`). Release and `https://prototype.steaudit.com` returned HTTP 200 and served `assets/index-CxFt5gBh.js` (2,176,556 bytes, SHA-256 `31412d3dafa44e97c3a90543d7298c9121eaf63fce0b2551fb873901dad7bd84`), matching the local production bundle. |
| 2026-09-23 | `77b38d8` | Wrangler Pages production deploy + live HTTP/hash check | PASS | Existing `steaudit-prototype` Pages project; release `2be4ea82` (`https://2be4ea82.steaudit-prototype.pages.dev`). Release and `https://prototype.steaudit.com` returned HTTP 200 and served `assets/index-Ba4Qhsrp.js` (2,174,474 bytes, SHA-256 `e09fffbdf09b0f48eaaee281f6d3cc239162c8c15eff9532d568ce0d9e058f68`), matching the local production bundle. |
| 2026-09-23 | `740ebaa` | Wrangler Pages production deploy + live HTTP/hash check | PASS | Existing `steaudit-prototype` Pages project; release `2308d8dd` (`https://2308d8dd.steaudit-prototype.pages.dev`). Release and `https://prototype.steaudit.com` returned HTTP 200 and served `assets/index-Ct9Wccdr.js` (2,173,236 bytes, SHA-256 `adc7bd0f8c1dca72eb069d516800bdc1dfb3596ad913719004bcf87ba0677436`), matching the local production bundle. |
| 2026-09-23 | `37a5800` | Wrangler Pages production deploy + live HTTP/hash check | PASS | Existing `steaudit-prototype` project; production release `9148ac5e` (`https://9148ac5e.steaudit-prototype.pages.dev`). The release URL and `https://prototype.steaudit.com` returned HTTP 200 and served `assets/index-BNM55kZx.js` (2,173,056 bytes, SHA-256 `8606e0291fb0d0c04d8ee11e705c1770aad0fcc42fcc927186f069732cb83aaf`), matching local `dist/`; bundle includes the VP-018 and VP-037 evidence-backed statuses. |
| 2026-09-23 | `0cc8f53` | Wrangler Pages production deploy + live HTTP/hash check | PASS | Existing `steaudit-prototype` project; production release `bec7bc33` (`https://bec7bc33.steaudit-prototype.pages.dev`). The release URL and `https://prototype.steaudit.com` returned HTTP 200 and served `assets/index-BLc-uQV0.js` (2,172,828 bytes, SHA-256 `e608d7f73af898470f5c2244dacd81d09820395161078f1eefd32ecd63a41f4d`), matching local `dist/`. |
| 2026-09-23 | working tree after `b8bed7f` | `npm run test:unit` + `npm run test:e2e` | PASS — 136/136 unit, 57/57 E2E | Five static checks and 52 actual Chrome journeys. AT-17/18, AT-37, AT-51/52, annual continuance, exact package artifacts, reports, consolidation, trial-balance replacement and all staff routes passed. Coverage ledger reconciled: VP-009, VP-018, VP-037, VP-051, VP-052 / Modules 03, 31, 32 Verified; 59/64 stories and 36/39 modules remain Partial. |
| 2026-09-23 | `cbd9ad6` | Wrangler Pages production deploy + live HTTP/hash check | PASS | Existing `steaudit-prototype` production project; release `62a3110b` (`https://62a3110b.steaudit-prototype.pages.dev`). Release and `https://prototype.steaudit.com` returned HTTP 200 and served `assets/index-BlMfR5dl.js` (2,172,573 bytes, SHA-256 `3c78de8e936106be6e0020cf7f561abc57a644ddd5854e70e97d8c1f8e2fd01b`), matching local `dist/`; bundle contains disclosure applicability controls and no longer seeds an unsupported IFRS inclusion claim. |
| 2026-09-23 | VP-041 disclosure applicability follow-up | `npm run test:unit` | PASS — 136/136 | Unit suite remains green; disclosure applicability is validated in Chrome package assembly. |
| 2026-09-23 | VP-041 disclosure applicability follow-up | `npm run test:e2e` | PASS — 57/57 | AT-41 verifies an enabled disclosure section starts unassessed and blocks package validation, then persists an Applicable decision and entered note in the exact package revision. AT-38 package artifact journey also passes. This is package-level applicability, not a per-note accounting-standard checklist. |
| 2026-09-23 | VP-041 disclosure applicability follow-up | `npm run build` | PASS | TypeScript and Vite production build passed with the existing >500 kB main-chunk advisory. |
| 2026-09-23 | `a19db6d` | Wrangler Pages production deploy + live HTTP/hash check | PASS | Existing `steaudit-prototype` production project; release `08a716b2` (`https://08a716b2.steaudit-prototype.pages.dev`). The release URL and `https://prototype.steaudit.com` returned HTTP 200 and served `assets/index--45U9AhT.js` (2,171,515 bytes, SHA-256 `94c649ce97fc8a025fe041a111eb2b91e6cdf91516595924a78e5f7b5594a03b`), matching local `dist/`. The bundle contains the unavailable cash-flow disclosure and no longer contains the unsupported depreciation example. |
| 2026-09-23 | VP-040 cash-flow truthfulness follow-up | `npm run test:unit` | PASS — 136/136 | Existing statement lifecycle and comparative invalidation guards remain green. |
| 2026-09-23 | VP-040 cash-flow truthfulness follow-up | `npm run test:e2e` | PASS — 57/57 | Five static checks and 52 Chrome journeys. AT-37 verifies the cash-flow tab reports unavailable without classified movement data and displays no unsupported sample amounts; comparative mapping changes stale reviewed output. |
| 2026-09-23 | VP-040 cash-flow truthfulness follow-up | `npm run build` | PASS | TypeScript and Vite production build passed with the existing >500 kB main-chunk advisory. |
| 2026-09-23 | `d68f7bd` | Wrangler Pages production deploy + live HTTP/hash check | PASS | Existing `steaudit-prototype` production project; release `9fe38681` (`https://9fe38681.steaudit-prototype.pages.dev`). The release URL and `https://prototype.steaudit.com` returned HTTP 200 and served `assets/index-CzRSn7CZ.js` (2,172,969 bytes, SHA-256 `340fe778117a0f13fc788fdb89b9f48c2c628d6eb97860dd2d803fe1b3946e84`), matching local `dist/`; application bundle is unchanged from the previous release, with this deploy carrying updated prototype acceptance documentation. |
| 2026-09-23 | VP-040 comparative-staleness follow-up | `npm run test:unit` | PASS — 136/136 | A comparative mapping revision stales a reviewed statement set, and another review attempt is rejected with the revision remaining stale. |
| 2026-09-23 | VP-040 comparative-staleness follow-up | `npm run test:e2e` | PASS — 57/57 | Five static checks and 52 Chrome journeys. AT-37 revises the approved comparative period mapping after statement review, reloads and verifies the current-period statement remains Stale with no review action. Broader layout, disclosure and cash-flow acceptance remains open. |
| 2026-09-23 | VP-040 comparative-staleness follow-up | `npm run build` | PASS | TypeScript and Vite production build passed with the existing >500 kB main-chunk advisory. |
| 2026-09-23 | `b3383b8` | Wrangler Pages production deploy + live HTTP/hash check | PASS | Existing `steaudit-prototype` production project; release `f2eb6e28` (`https://f2eb6e28.steaudit-prototype.pages.dev`). The release URL and `https://prototype.steaudit.com` returned HTTP 200 and served `assets/index-CzRSn7CZ.js` (2,172,969 bytes, SHA-256 `340fe778117a0f13fc788fdb89b9f48c2c628d6eb97860dd2d803fe1b3946e84`), matching local `dist/`; bundle contains the risk-driven plan revision and procedure reassessment behavior. |
| 2026-09-23 | VP-049 working tree | `npm run test:unit` | PASS — 136/136 | Changing a risk supersedes approved plan v1, creates independent-review plan v2, preserves prior risk and review history, and flags added/removed linked procedures for reassessment; reassessment blocks procedure submission. |
| 2026-09-23 | VP-049 working tree | `npm run test:e2e` | PASS — 57/57 | Five static checks and 52 Chrome journeys. VP-049 approves plan v1, edits RSK-01, verifies the risk-driven plan v2 and PRC-03 reassessment after reload, then approves v2 as an independent reviewer. Broader return/rework and reopen scenarios remain unverified. |
| 2026-09-23 | VP-049 working tree | `npm run build` | PASS | TypeScript and Vite production build passed with the existing >500 kB main-chunk advisory. |
| 2026-09-23 | `1ce9f42` | Wrangler Pages production deploy + live HTTP/hash check | PASS | Existing `steaudit-prototype` production project; release `e740ad76` (`https://e740ad76.steaudit-prototype.pages.dev`). Release and `https://prototype.steaudit.com` returned HTTP 200 and served `assets/index-Ca8CYdSx.js` (2,170,545 bytes, SHA-256 `4a0bb4b80ac5b9197c591eeeec3d55ac80e8f6b6e3063c5b26f8d65c75417843`), matching the local bundle and containing in-scope evidence resolution and the VP-039 schedule editor/review actions. |
| 2026-09-23 | `6b8d6e4` | Wrangler Pages production deploy + live HTTP/hash check | PASS | Existing `steaudit-prototype` production project; release `ef5b91f0` (`https://ef5b91f0.steaudit-prototype.pages.dev`). Release and `https://prototype.steaudit.com` returned HTTP 200 and served `assets/index-DhaYtjGU.js` (2,170,359 bytes, SHA-256 `bb81e2bd5cc3367c9b6d211def80cc33b62b86d4129b22c9866a65c9beaec088`), matching the local bundle and containing the VP-039 schedule editor/review actions. |
| 2026-09-23 | VP-039 working tree | `npm run test:unit` | PASS — 136/136 | Reconciliation draft source pin, date/currency/evidence scope, independent-review guard, residual and proposed-correction blocks, revision history, and TB/document replacement stale state; existing EX09 confirms corrections cannot clear timing residuals. |
| 2026-09-23 | VP-039 working tree | `npm run test:e2e` | PASS — 57/57 | Five static checks and 52 Chrome journeys. AT-39 creates and reads back a source-pinned schedule, blocks self-approval and records an independent reviewer approval. Browser return/rework remains unverified. |
| 2026-09-23 | VP-039 working tree | `npm run build` | PASS | TypeScript and Vite build passed with the existing >500 kB main-chunk advisory. |
| 2026-09-23 | current working tree | `npm run test:unit` | PASS — 135/135 | VP-012 service/year/period changes reset planning, source and mapping acceptance, stale statement sets and require procedure reassessment; earlier workflow guards remain green. |
| 2026-09-23 | current working tree | `npm run test:e2e` | PASS — 57/57 | Five static checks and 52 Chrome journeys. VP-012 edits service, year, reporting period, due date and team; change history persists and the suite remains green. |
| 2026-09-23 | `f01a6d1` | Wrangler Pages production deploy + live HTTP/bundle check | PASS | Existing `steaudit-prototype` production project; release `6100e7d4` (`https://6100e7d4.steaudit-prototype.pages.dev`). Release and `prototype.steaudit.com` returned HTTP 200 and served `assets/index-AkSanTQv.js` (2,158,267 bytes, SHA-256 `02dbade4f354b885f3539c6441bc044f05faeb83737b2b28220dcf16e5d94dfc`), including service/period controls and procedure reassessment. |
| 2026-09-23 | current working tree | `npm run build` | PASS | TypeScript and Vite build passed; main bundle 2,155.48 kB (603.06 kB gzip), with the existing >500 kB advisory. |
| 2026-09-23 | current working tree | `npm run test:unit` | PASS — 135/135 | Includes disabled-identity route denial, unsupported audit-template area rejection, retirement behavior, mapping, sampling, release and migration checks. |
| 2026-09-23 | current working tree | `npm run test:e2e` | PASS — 57/57 | Five static checks and 52 Chrome journeys. VP-018 verifies local creation without grants, disable/recovery, requirements-only routing, invitation expiry/revoke history; VP-049 verifies risk links, coverage gaps, fresh template application and retirement without changing existing work. |
| 2026-09-23 | `4769a3a` | Wrangler Pages production deploy + live HTTP/bundle check | PASS | Existing `steaudit-prototype` project, production branch; release `a387e2f3` (`https://a387e2f3.steaudit-prototype.pages.dev`). Release URL and `prototype.steaudit.com` returned HTTP 200 and served `assets/index-CDeoiElD.js` (2,155,543 bytes, SHA-256 `ce307b1e2a6d53de9cd5a80aefc5b0ca597af759c9f39b8789b24747ca73e161`), containing template retirement and disabled-identity route controls. |
| 2026-09-23 | current working tree | `npm run build` | PASS | TypeScript check and Vite production build passed; main bundle 2,149.68 kB (601.93 kB gzip), with the existing >500 kB advisory. |
| 2026-09-23 | current working tree | `npm run test:unit` | PASS — 134/134 | Includes schema v0–v19 migration, VP-012 pending-acceptance/lifecycle guards and terminal states, statement revision review/staleness, opportunity guards, mapping, sampling, package, finance and release checks. |
| 2026-09-23 | current working tree | `npm run test:e2e` | PASS — 57/57 | Five static checks plus 52 serial Chrome journeys. VP-012 verifies reasoned suspend/resume/cancel history; AT-07 covers inquiry editing, Lost/Unqualified reasons, list/rework, Won conversion and existing-client linking; AT-37 saves/reviews comparative statements. VP-009, VP-051 and VP-052 are Verified; overall coverage remains Partial. |
| 2026-09-23 | `a486efd` | Wrangler Pages production deploy + live HTTP/bundle check | PASS | Existing `steaudit-prototype` project, production branch; release `13e668b8-4da7-40ed-a8aa-45fd26a685b3`, source `a486efd`. Both `prototype.steaudit.com` and `13e668b8.steaudit-prototype.pages.dev` returned HTTP 200 and served `assets/index-roIATMjg.js`, SHA-256 `383b17cb60e597542999f3e9eb27492b815bfdf1953e6a5eb7bb9a373e8743e3` (2,149,687 bytes). Reloading the custom domain rendered the current AuditSphere shell. |
| 2026-09-23 | `fbeae22` | Wrangler Pages production deploy + live HTTP/bundle check | PASS | Existing `steaudit-prototype` project, production branch; release `584a714a-2672-4463-bfca-fcc7de38d418`, source `fbeae22`. Both `prototype.steaudit.com` and `584a714a.steaudit-prototype.pages.dev` returned HTTP 200 and served `assets/index-CtFJs6M2.js`, SHA-256 `07cb8406e05a8395a6c68f470bb36c08d629176dc73d6c5d49ff031466e71da5` (2,145,428 bytes). |
| 2026-09-23 | `8208d48` | Wrangler Pages production deploy + live HTTP/bundle check | PASS | Existing `steaudit-prototype` production branch, release `e675b376-84b6-44ba-8a27-40c39aaa5176`; release and `prototype.steaudit.com` returned HTTP 200 and served identical `assets/index-BZplP356.js` (SHA-256 `de41b524129c077b7c1de4092a27fe817c7fead905ad9d25b6fb5b57584bb293`). Bundle contains Won-to-Prospect conversion UI and guard. |
| 2026-09-23 | `7c46768` | Wrangler Pages production deploy + Chrome check | PASS | Deployed to the existing `steaudit-prototype` production project; release `148c2362.steaudit-prototype.pages.dev`, Wrangler source `7c46768`. Reloaded `prototype.steaudit.com` in Chrome; the AuditSphere app shell remained rendered. |
| 2026-09-23 | `9176c23` | Wrangler Pages production deploy + Chrome check | PASS | Deployed to the existing `steaudit-prototype` production project; release `8f3f2e25.steaudit-prototype.pages.dev`, Wrangler source `9176c23`. Reloaded `prototype.steaudit.com` in Chrome; the AuditSphere app shell rendered. |
| 2026-09-23 | `dabb33d` | Wrangler Pages production deploy + Chrome check | PASS | Deployed to the existing `steaudit-prototype` production project; release `c06010ed.steaudit-prototype.pages.dev`, Wrangler source `dabb33d`. Reloaded `prototype.steaudit.com` in Chrome; the AuditSphere app shell rendered. |
| 2026-09-23 | `bd39e36` | Wrangler Pages production deploy + Chrome check | PASS | Deployed to the existing `steaudit-prototype` project, production branch; release `819de4cd.steaudit-prototype.pages.dev`, Wrangler source `bd39e36`. Reloaded `prototype.steaudit.com` in Chrome and confirmed the AuditSphere app shell renders. |
| 2026-09-23 | `a2bfb2a` | Wrangler Pages production deploy + Chrome check | PASS | Existing `steaudit-prototype` production project, production branch; release `ffb60930.steaudit-prototype.pages.dev`. Wrangler confirms source `a2bfb2a`; Chrome reloads `prototype.steaudit.com` and renders the AuditSphere app shell. |
| 2026-09-23 | `0c593a8` | Wrangler Pages production deploy + Chrome check | PASS | Existing `steaudit-prototype` production project, production branch; release `f3bd18ef.steaudit-prototype.pages.dev`. Wrangler confirms source `0c593a8`; Chrome reloads `prototype.steaudit.com` and renders the AuditSphere app shell. |
| 2026-09-23 | `338e572` | Wrangler Pages production deploy + Chrome check | PASS | Existing `steaudit-prototype` production project, production branch; release `15776fb7.steaudit-prototype.pages.dev`. Wrangler confirms source `338e572`; Chrome reloads `prototype.steaudit.com` and renders the AuditSphere app shell. |
| 2026-09-23 | `9641bb7` | Wrangler Pages production deploy + Chrome check | PASS | Existing `steaudit-prototype` production project, production branch; release `e349f665.steaudit-prototype.pages.dev`. Wrangler confirms source `9641bb7`; Chrome reloads `prototype.steaudit.com` and renders the AuditSphere app shell. |
| 2026-09-23 | `5b1b5ba` | Wrangler Pages production deploy + Chrome check | PASS | Existing `steaudit-prototype` production project; release `7db9ca26.steaudit-prototype.pages.dev`, Wrangler reports source `5b1b5ba`. Chrome loaded the AuditSphere app shell from both the release URL and `prototype.steaudit.com`. Direct HTTP probes from the shell network returned Cloudflare 1010, so independent served-asset hash comparison was unavailable. |
| 2026-09-23 | `c8058c3` | Wrangler Pages production deploy + live HTTP/hash check | PASS | Existing `steaudit-prototype` production branch, release `9aa9dea0.steaudit-prototype.pages.dev`; custom domain and release returned HTTP 200. Both served `assets/index-CVBl4TGN.js` SHA-256 `12a95a8794a0a15b0cdf8d444b8baab88b4c2b43165d00c86a3304af4e1f8db8` and `assets/index-PSPlkYSo.css` SHA-256 `06f8ffa8ef2840377e8644c8c106cbe8f17b23f71618ee0d4951b0be04cf3ef8`, matching the local build. |
| 2026-09-23 | `3129bbd` | Wrangler Pages production deploy + live HTTP/hash check | PASS | Existing `steaudit-prototype` production branch, release `1c23ea93-01d3-4ebd-b034-6f0c76f25d46`; release and `prototype.steaudit.com` returned HTTP 200 and served identical `assets/index-vKr6aj0p.js` (SHA-256 `76b5694c34a6f3d551c8f24be6be1c4f456a443e11c42d98794cedcb6ce36a74`). Bundle contains saved statement revisions, independent review and comparative-change staleness controls. |
| 2026-09-23 | current working tree (VP-037 mapping workflow) | `npm run test:unit` | PASS — 119/119 | Mapping revision history, unknown-account/target rejection, exact split conservation, self-review rejection, independent approval, and migration to schema v14. |
| 2026-09-23 | current working tree (AT-37 VP-037 mappings) | `npm run test:e2e` | PASS — 42/42 | Five static checks and 37 Chrome checks. AT-37 saves an engagement mapping revision, approves it as a separate reviewer, and verifies mapped statement rows retain their source account and mapping references. |
| 2026-09-23 | `38a321a` | Wrangler Pages production deploy + live HTTP/hash check | PASS | Existing `steaudit-prototype` production branch, release `7613b682.steaudit-prototype.pages.dev`; custom domain and release returned HTTP 200. Both served `assets/index-CPx4TMHA.js` SHA-256 `c672ad1d09bb2c8057718fd4d19d9033bc853e6ebc8da9346778b754067c4da8` and `assets/index-PSPlkYSo.css` SHA-256 `06f8ffa8ef2840377e8644c8c106cbe8f17b23f71618ee0d4951b0be04cf3ef8`, matching local output. Bundle contains the print action and layout. |
| 2026-09-23 | current working tree (VP-032/033 statement print view) | `npm run test:unit` | PASS — 118/118 | Existing receivables arithmetic, boundary and future-effective receipt checks remain green. The new filters and print view are verified by Chrome rather than unit-level component checks. |
| 2026-09-23 | current working tree (VP-032/033 statement print view) | `npm run test:e2e` | PASS — 41/41 | Five static checks and 36 Chrome checks; statement rows match export, client/date/currency filters preserve scope, and the native print action receives the selected statement. headless Chrome generated a PDF and verified its signature and non-empty bytes; OS dialog printing was not exercised. |
| 2026-09-23 | `5f8f243` | Wrangler Pages production deploy + live HTTP/hash check | PASS | Existing `steaudit-prototype` production branch, release `bfe5ce10.steaudit-prototype.pages.dev`; custom domain and release returned HTTP 200 with the same `assets/index-DEkFBh5l.js` SHA-256 `2bd9df9b425ae3a2697f93189b0462513c969fc2acac0cb9791e1353bd2bb103`, matching local build. Served bundle contains the as-of and currency filters. |
| 2026-09-23 | `2d41ec3` | Wrangler Pages production deploy + live HTTP/hash check | PASS | Existing `steaudit-prototype` project, production branch, release `816fe1cb.steaudit-prototype.pages.dev`; custom domain and release both returned HTTP 200 and served `assets/index-mciUbur3.js` with matching SHA-256 `874d40417fa357591228a76473fdc822aeb91d06d5ee254fc129c906739e3b48`. |
| 2026-09-23 | current working tree (VP-032/033 receivables) | `npm run test:e2e` | PASS — 41/41 | AT-32/33 verifies client/date/currency filters, historical aging before later receipts, separate USD/QAR balances, split receipt and independent reversal, then reconciles rendered and CSV statement rows including issued credits. It invokes the native print action; headless Chrome generated a PDF and verified its signature and non-empty bytes; OS dialog printing was not exercised. Other-client Draft invoices are excluded. Added currency/invoice are isolated synthetic fixtures. |
| 2026-09-23 | current working tree (VP-060 CSV reconciliation) | `npm run test:e2e` | PASS — 41/41 | Five static checks and 36 Chrome checks. AT-49/60 compares every exported cell for 13 table-backed reports with the rendered table, independently recomputes all rows for WIP, utilization and compliance, and checks client scoping. |
| 2026-09-23 | current working tree (AT-20 dependency invalidation) | `npm run test:unit` | PASS — 118/118 | Replacement creates a Pending verification evidence reference, stales linked procedures, blocks clearance/submission without current evidence, and records then invalidates direct workpaper clearance pins. |
| 2026-09-23 | current working tree | `npm run test:e2e` | PASS — 41/41 | Five static checks and 36 Chrome checks; AT-20 verifies the old evidence pin stays exact while PRC-01/02 become stale and WP-A1 clearance moves to history. |
| 2026-09-23 | `75947c7` | Wrangler Pages production deploy + live HTTP/hash check | PASS | Existing `steaudit-prototype` project, production branch, release `f544c79e.steaudit-prototype.pages.dev`; fresh custom-domain and release requests returned HTTP 200 and served `assets/index-B0DaNhf0.js` with matching SHA-256 `fef3032dbc8c465808b8b9c6402a895e3dc88f73f12d41272bdb0a5886fd607a`. |
| 2026-09-23 | current working tree (VP-015 revision changes) | `npm run test:unit` | PASS — 118/118 | AT-13 store checks preserve published template revisions, bind generated jobs to the exact version, deduplicate repeated operation IDs and reject conflicting reuse. |
| 2026-09-23 | current working tree | `npm run test:e2e` | PASS — 41/41 | Five static checks and 36 Chrome checks; AT-13 edits a published template into a new Draft revision, confirms the old template/job are unchanged, then publishes and applies the new version. The form is submitted twice with one operation ID and creates one job. |
| 2026-09-23 | `33cef1b` | Wrangler Pages production deploy + live HTTP/hash check | PASS | Existing `steaudit-prototype` project, production branch, release `9246edf3.steaudit-prototype.pages.dev`; cache-busted custom domain and release URL returned HTTP 200 and served `assets/index-tSx5GCFa.js` with matching SHA-256 `68667147768f83713c7d449904d01e63efdf9cadb9cf85f04558d8f399c57b4b`. |
| 2026-09-23 | `03577ba` | `npm run test:unit` | PASS — 117/117 | Schema v13 adds acceptance evidence references; legacy approvals preserve history while losing unsupported active authority; VP-032 splits one receipt across two invoices and reverses one allocation independently. |
| 2026-09-23 | working tree after `812f9cc` | `npm run test:e2e` | PASS — 40/40 | AT-49/60 now reconciles CSV row counts for all 16 reports against current permitted source registers, in addition to client scoping and CSV-column checks. |
| 2026-09-23 | working tree after `a220a78` | `npm run test:e2e` | PASS — 41/41 | Five static checks and 36 Chrome journeys; adds schema v12-to-v13 browser migration evidence review and verifies no continuance action survives unsupported legacy approval. |
| 2026-09-23 | `c3485e6` | `npm run test:e2e` | PASS — 40/40 | Five static checks and 35 actual Chrome checks. VP-017 verifies permitted-person/role mapping is separate from authorization; VP-019 verifies reasoned revocation history; VP-047 and existing cross-module journeys pass. |
| 2026-09-23 | `c3485e6` | `npm run build` | PASS | TypeScript clean; Vite emitted the app. Main JS bundle is about 2.03 MB (576.23 kB gzip), above Vite's 500 kB advisory threshold. |
| 2026-09-23 | `c3485e6` | Wrangler Pages production deploy + live HTTP check | PASS | Existing `steaudit-prototype` production release `6a7ecd3a-9b9c-4c88-8d87-6ea2fe768394`; release URL and `prototype.steaudit.com` returned HTTP 200 and referenced `assets/index-BgHw1Ss-.js` with legacy approval review safeguards. |
| 2026-09-23 | `b086b99` | Wrangler Pages production deploy + live HTTP check | PASS | Existing `steaudit-prototype` production release `06cf7853-08e5-4e7d-b01e-2ebbc70bfa8d`; release URL and cache-busted `prototype.steaudit.com` returned HTTP 200 and referenced `assets/index-DWvk2a2d.js`. Served bundle contains durable grant/revocation history. |
| 2026-09-23 | `846fb41` | Wrangler Pages production deploy + live HTTP check | PASS | Existing `steaudit-prototype` production release `9ea3bb84-ff23-410d-a7d9-23b5347b115d`; release URL and cache-busted `prototype.steaudit.com` returned HTTP 200 and referenced `assets/index-BIrmFQjb.js`. Served bundle includes CSV/XLSX population import and source replacement commands. |
| 2026-09-23 | `e88a492` | Wrangler Pages production deploy + live HTTP check | PASS | Existing `steaudit-prototype` production release `564af1db-c3fd-47d6-9034-864ba704ff19`; release URL and cache-busted `prototype.steaudit.com` returned HTTP 200 and referenced `assets/index-hqyW5HIA.js`. Served bundle contains `setSampleItemSelected` and `recordSampleItemTest`. |
| 2026-09-23 | `b42324e` | Wrangler Pages production deploy + live HTTP check | PASS | Existing `steaudit-prototype` production release `7462804d-cc64-47b1-be04-ff849ff4ee74`; release URL and cache-busted `prototype.steaudit.com` returned HTTP 200 and referenced `assets/index-BeTW39ZE.js`. Served bundle contains `updateAuditRisk` and `setAuditRiskProcedureLink`. |
| 2026-09-23 | `49e9ed8` | Wrangler Pages production deploy + live HTTP check | PASS | Existing `steaudit-prototype` production release `7d4033e3-3682-4742-a76b-fa6189081852`; release URL and `prototype.steaudit.com` returned HTTP 200 and referenced `assets/index-273pKITI.js`. The served bundle contains the procedure execution controls and PBC retention flow. |
| 2026-09-23 | `b68bbe1` | Wrangler Pages production deploy + live HTTP check | PASS | Existing `steaudit-prototype` production release `74e0efcc-b45d-4380-971e-12ab0cc300d8`; release URL and cache-busted `prototype.steaudit.com` returned HTTP 200 and referenced `assets/index--1Rj-hLz.js`. |
| 2026-09-23 | `79039f4` | `npm run build` | PASS | TypeScript clean; Vite emitted the app. Main JS bundle is about 2.01 MB (570.90 kB gzip), above Vite's 500 kB advisory threshold. |
| 2026-09-23 | `79039f4` | Wrangler Pages production deploy + live HTTP check | PASS | Existing `steaudit-prototype` project, production branch, release `d5816d3b-d2bb-4980-bc40-379e333ed1b9`; release URL and cache-busted `prototype.steaudit.com` returned HTTP 200 and referenced `assets/index-CWDfVmw0.js`. |
| 2026-09-23 | current working tree after `b4543d5` | `npm run test:e2e` | PASS — 37/37 | Five static checks and 32 actual Chrome checks. AT-29 versions budget rates while retaining the old approved-time rate snapshot; AT-32 verifies receipt entry, allocation and reasoned reversal; AT-50 verifies client search scope. |
| 2026-09-23 | current working tree after `9024ff8` | `npm run test:e2e` | PASS — 36/36 | Five static checks and 31 actual Chrome checks. AT-50 verifies client-scoped search; AT-32 records, allocates and reverses an offline receipt while preserving the prior settled balance. Multi-invoice allocation and other search grants/cross-links remain incomplete. |
| 2026-09-23 | `9e28d5a` | `npm run build` | PASS | TypeScript clean; Vite emitted the app. Main JS bundle is about 2.01 MB (570.89 kB gzip), above Vite's 500 kB advisory threshold. |
| 2026-09-23 | `9e28d5a` | `npm run test:unit` | PASS — 109/109, 25 suites | VP-030 validates approved-time source and pinned rate, exact-once reservation, accepted proposal revision matching, and fixed-fee contract cap; prior accounting, scope, migration, package, reporting and workflow checks remain included. |
| 2026-09-23 | `9e28d5a` | `npm run test:e2e` | PASS — 34/34 | Five static checks and 29 actual Chrome checks. AT-30 drafts from approved time and the remaining accepted fixed-fee balance, persists exact sources, and prevents future source reuse. Per-service milestone allocation remains unmodeled. |
| 2026-09-23 | `9e28d5a` | Wrangler Pages production deploy + live HTTP check | PASS | Existing `steaudit-prototype` project, production branch, release `bff09005-63c3-40f8-b75d-3ef5698c007e`; release URL and cache-busted `prototype.steaudit.com` returned HTTP 200 and referenced `assets/index-Cf8AoO9-.js`. |
| 2026-09-23 | `4f69bba` | Wrangler Pages production deploy + live HTTP check | PASS | Existing `steaudit-prototype` project, production branch, release `d7e66d06-34b6-4b6f-a6fe-482e6b34a276`; release URL and cache-busted `prototype.steaudit.com` returned HTTP 200 and referenced `assets/index-BLmnH2c-.js`. |
| 2026-09-23 | `e7f41d1` | `npm run test:unit` | PASS — 107/107, 25 suites | Independent invoice and credit approval/issue lifecycle invariants, alongside prior scope, package, reporting, accounting and workflow checks. |
| 2026-09-23 | `e7f41d1` | `npm run test:e2e` | PASS — 33/33 | Five static checks and 28 actual Chrome checks. VP-031 denies invoice self-review, requires separate invoice and credit approval/issue, and updates outstanding balance after a partial credit. |
| 2026-09-23 | `e7f41d1` | Wrangler Pages production deploy + live HTTP check | PASS | Existing `steaudit-prototype` project, production branch, release `80077bf7-795d-4752-8bbc-ad966d8c4f55`; release URL and cache-busted `prototype.steaudit.com` returned HTTP 200 and referenced `assets/index-B7zPlDhB.js`. |
| 2026-09-23 | working tree based on `d6a226d` | `npm run build` | PASS | TypeScript clean; Vite emitted the app. Main JS bundle is about 1.96 MB (559 kB gzip), above Vite's 500 kB advisory threshold. |
| 2026-09-23 | working tree based on `d6a226d` | `npm run test:unit` | PASS — 97/97, 20 suites | Includes RR01–RR38, schema migrations 0–11, continuance guards, source revisions, artifact/package checks, PBC clarification/replacement/acceptance, and balanced consolidation including current-period result. These verify selected deterministic rules, not all UI journeys. |
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
| 2026-09-23 | current working tree | `npm run test:e2e` | PASS — 30/30 | Five static checks and 25 actual Chrome checks. AT-21 proves OneDrive is disabled by default; after explicit enablement and a current simulated success, selected import records local metadata under the SharePoint canonical hierarchy without external HTTP(S) calls. |
| 2026-09-23 | current working tree | `npm run test:unit` | PASS — 107/107, 25 suites | AT-20 store guard preserves the prior document and exact evidence pin, requires the expected next version, and prevents branching a revision chain. |
| 2026-09-23 | current working tree | `npm run test:e2e` | PASS — 31/31 | Five static checks and 26 actual Chrome checks. AT-20 selects a local replacement file, records v2 with a digest, keeps EVD-01 pinned to DOC-002 v1 and displays a newer-version indicator. |
| 2026-09-23 | current working tree | `npm run test:e2e` | PASS — 33/33 | Five static checks and 28 actual Chrome checks. VP-031 denies invoice self-review, requires separate invoice and credit approval/issue, and updates outstanding balance after a partial credit. |
| 2026-09-23 | current working tree | `npm run test:e2e` | PASS — 31/31 | Re-ran all five static checks and 26 actual Chrome checks; the archive journey verifies optional retention is described as firm-selected metadata without legal requirement or scheduled deletion. |
| 2026-09-23 | `8eed12e` | Wrangler Pages production deploy + live HTTP check | PASS | Existing project `steaudit-prototype`, production branch, release `dd704f82-1a24-40b3-90f0-6cd5dfe02ca5`; cache-busted custom domain returned HTTP 200 and referenced `assets/index-C0d5PfYS.js`. |
| 2026-09-23 | `c3f5fe9` | Wrangler Pages production deploy + live HTTP check | PASS | Existing project `steaudit-prototype`, production branch, release `5fde9bc0-31e4-481d-a835-2f2135293b5f`; release URL and cache-busted `prototype.steaudit.com` returned HTTP 200 and referenced `assets/index-DCcknJ1g.js`. |
| 2026-09-23 | `b78505c` | Wrangler Pages production deploy + live HTTP check | PASS | Existing project `steaudit-prototype`, production branch, release `f07dad8c-7302-447b-9245-dc20a53e93b0`; release URL and cache-busted `prototype.steaudit.com` returned HTTP 200 and referenced `assets/index-BCLU5nQI.js`. |
| 2026-09-23 | `86a83c8` | Wrangler Pages production deploy + live HTTP check | PASS | Existing project `steaudit-prototype`, production branch, release `6cfc81cc-8f62-4c0e-ac8d-eb35fa5ee976`; release URL and fresh `prototype.steaudit.com` returned HTTP 200 and referenced `assets/index-B1wq733t.js`. |
| 2026-09-23 | `2f95298` | Wrangler Pages production deploy + live HTTP check | PASS | Existing project `steaudit-prototype`, production branch, release `3ebc950f-6308-41de-8fa0-2d918c5a760d`; release URL and fresh `prototype.steaudit.com` returned HTTP 200 and referenced `assets/index-eFWsIY_D.js`. |
| 2026-09-23 | `f0f9b5e` | Wrangler Pages production deploy + live HTTP check | PASS | Existing project `steaudit-prototype`, production branch, release `0f73c89d-4b52-411f-8827-dee3d30ffb28`; release URL and `prototype.steaudit.com` returned HTTP 200 and referenced `assets/index-BZuaglhu.js`. |
| 2026-09-23 | `bc66434` | Wrangler Pages production deploy + live HTTP check | PASS | Existing project `steaudit-prototype`, production branch, release `9b647364-9cab-46b1-910d-8fa3008faaf6`; release URL and `prototype.steaudit.com` returned HTTP 200 and referenced `assets/index-t5kkKkg3.js`. |
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
The AT-49/60 report journey checks every catalogue entry and exported CSV.
For 13 table-backed reports it compares each exported cell with the rendered
table; for WIP, utilization and compliance it independently computes every
expected row from the source registers. It also checks cross-client leakage.
The AT-43/44/45 journey checks the configured group perimeter, local currency
rates, approved elimination, balanced output and source-TB immutability. A second
AT-43 journey blocks missing foreign-currency rates, rejects an invalid zero rate,
and verifies a dated closing-rate revision unblocks translation without changing
source rows. Perimeter edits and missing-component recovery remain unverified.
The AT-35 import journey drives CSV and actual XLSX files through the UI,
checking that a rejected preview leaves the accepted source unchanged and that
accepted replacements retain predecessor rows and source identities.
The AT-23/24 journey creates and presents a request, hides its draft from the
client, records two client-file versions around a client-visible clarification,
then accepts the replacement separately.
The AT-21 journey keeps OneDrive disabled by default, enables it in saved
configuration, verifies a current simulated success, then explicitly selects a
sample. The resulting metadata remains in the canonical SharePoint engagement
folder; this does not represent a real OneDrive download or SharePoint upload.
The AT-20 journey selects a local replacement, retains the prior document row,
adds a separately identified v2 with SHA-256 metadata and leaves EVD-01 pinned
to DOC-002 v1. It marks dependent procedures and workpaper clearances for
reassessment; new evidence still requires manual verification and independent
review before clearance.
The AT-13 journey also authors a two-phase Draft in Chrome, publishes and
instantiates it, then creates an edited Draft revision without changing the
published source or existing job. It publishes and applies the new revision;
jobs retain the exact template revision. Chrome submits the same operation
twice and verifies only one job exists; unit checks reject reuse of the ID with
changed details.
The AT-22 journey selects a local file, persists only metadata and its digest,
reloads, then verifies the preview explains that original bytes are unavailable
and offers no misleading original-download action.
The focused previous run contained five static checks and 28 actual Chrome checks;
these focused journeys do not establish the remaining unexecuted AT criteria.
The VP-031 journey denies invoice self-review, requires an independent billing
approval and partner issue, then creates a partial credit, separately reviews
it and records issue against the remaining invoice balance. It does not verify
VP-030 source consumption from approved time or service records.
The AT-26 journey selects the PBC request template and confirms all placeholders
resolve in the subject/body. It records accepted, failed and unknown outcomes
as separate local communication records and confirms the sends create no
external HTTP(S) request. Acceptance remains simulation only; actual delivery,
recipient validation and retry policy remain outside this verified slice.

## Acceptance status

Latest focused unit run: `npm run test:unit` passed 122/122. A new VP-032 unit
journey allocates one receipt over two issued invoices and reverses one allocation
without disturbing the second invoice. The browser suite is 41/41;
AT-49/60 now checks every CSV cell against the displayed values for 13 reports
and independently computes all rows for three formula reports. All AT-01–AT-54 identifiers now appear in automated test source. That traceability
does not mean every acceptance criterion has been executed end to end.

At this verification point, 36 of 39 modules and 59 of 64 stories remain
Partial (VP-009, VP-018, VP-037, VP-051 and VP-052 are Verified). The Chrome suite checks
major workflows and route rendering; it does not execute and verify every
acceptance criterion. In particular, the route
smoke test does not prove create/edit/review/rework behavior on each route.
Unit checks provide focused evidence for selected calculation, access, migration,
and workflow invariants only.

Outstanding review gaps include the full consolidation suite against
reordered/missing components (R09); complete adjustment/reporting acceptance
journeys (R08); dispatch, duplicate-delivery, and all release edge paths (R05);
remaining end-to-end acceptance journeys across the modules (R12); and browser
storage limits on the explicitly local archive scope (R14). Purview/provider
retention locks and physical deletion controls are excluded acceptance scope. The
current checks cover schema migrations 0–19 and browser storage conflict/quota
behavior, but do not establish every recovery path. Package section ordering and
notes now persist with generated revisions. Egress evidence is limited to
source/bundle probes and exercised Chrome journeys. The prototype remains
browser-local and simulated; see `remaining-limitations.md` for scope boundaries.

The VP-047 follow-up adds per-check acceptance screening evidence references,
retains them in recommendation history, rejects completed checks without a
reference, and prevents legacy approvals without references from authorizing
engagement work. `npm run test:unit` passed 114/114 and `npm run test:e2e` passed
40/40 in Chrome; `npm run build` passed with the existing large-bundle advisory.
Commit `7c92df3` is deployed to the existing `steaudit-prototype` Pages project
on the `production` branch as release `ff530ea1-0ae9-4c01-8ebf-0f409db2f694`.
The release URL and `https://prototype.steaudit.com` returned HTTP 200 and served
`assets/index-CH22FW0F.js`, which contains the evidence-reference validation and
five screening reference inputs. Live screening and identity verification remain
out of scope. The overall 64 story and 39 module acceptance ledger remains
**Partial** pending full execution of the remaining criteria.

The VP-060 report follow-up fixes WIP calculation to use each approved time
entry's pinned rate rather than the current budget. Missing pinned rates remain
unknown. `npm run test:unit` passed 115/115, `npm run test:e2e` passed 40/40 in
Chrome, and `npm run build` passed with the existing large-bundle advisory.
Commit `c62ed7d` is deployed to the existing `steaudit-prototype` Pages project
on `production` as release `88464b68-b541-44c7-8c63-7cb4798f02ec`. The release
and `prototype.steaudit.com` returned HTTP 200 and served
`assets/index-BQWlY3JI.js`. The full 16-report source reconciliation is still
incomplete; the 64-story and 39-module ledger remains **Partial**.

The legacy acceptance follow-up keeps historical accepted decisions visible
while marking them as requiring evidence review and suppressing continuance
actions until a valid current-period approval exists. Unit migration checks and
the 40/40 Chrome suite pass; the build passes with the existing bundle advisory.
Commit `c3485e6` is deployed to the existing `steaudit-prototype` Pages project
on `production` as release `6a7ecd3a-9b9c-4c88-8d87-6ea2fe768394`.
`prototype.steaudit.com` returned HTTP 200 and served
`assets/index-BgHw1Ss-.js`, including the legacy-review notice and required
screening-reference controls. Overall acceptance remains **Partial**.

VP-037 follow-up: financial statements and packages now require a current,
independently approved mapping that covers every trial-balance account. An
engagement without a mapping shows its unmapped accounts and cannot export
statements or pass package validation. Generated XLSX/DOCX/PDF package content
now reports the persisted mapping revision independently of the TB source
revision. `npm run test:unit` passed 131/131 and `npm run test:e2e` passed 56/56
(five static checks and 51 Chrome journeys); Chrome verifies unmapped statement
exports are disabled, an independently reviewed mapping unlocks statements,
and the generated package is approved/released against its mapping revision.
Build passes with the existing large-bundle advisory. Module 20 remains Partial
until the complete chart, period, dimension and dependent-output acceptance
matrix is executed. Commit `e29d3a1` was pushed to `main` and deployed to the
existing `steaudit-prototype` Pages project on production as release
`09ddcfa7-9173-496d-8cd4-b053a4ddb292` (`https://09ddcfa7.steaudit-prototype.pages.dev`).
Both the release URL and `https://prototype.steaudit.com` returned HTTP 200 and
served `assets/index-Cbjjq6p3.js`, which contains the mapping gate and corrected
package mapping revision content.

VP-019 follow-up: grant authoring now requires an approved-request reference
and reason, supports an effective date and optional expiry, rejects invalid or
reversed date windows, and preserves the request and date window in grant
history after revocation. A scheduled grant is not included in the user's
visible engagement scope before its effective date. Unit checks passed 131/131;
E2E passed 56/56, including the Chrome grant form, history, and scoped access
journey. The wider professional-role approval and group-scope matrix remains
open, so Module 19 remains Partial. Production deployment evidence follows.
Commit `256c83a` was pushed to `main` and deployed to the existing
`steaudit-prototype` production Pages project as release
`b88d44fa-b63f-4995-be09-f47fe445438f`. A no-cache request to both the release
URL and `https://prototype.steaudit.com` returned HTTP 200 and served
`assets/index-DStF5-hW.js`; that bundle contains the required request-reference
and effective-date grant controls.

VP-040 follow-up: the financial-statement workspace now selects a prior
engagement for the same client and currency and displays comparative asset,
liability, equity, revenue and profit totals only when both periods have fully
approved mappings. Missing/unmapped prior data is explicitly unavailable, not
zero. Chrome verified the unavailable state, independently mapped and approved
the 2025 period, and reconciled current/prior assets at QAR 2,250,000 and QAR
800,000. Full verification passed: 131/131 unit checks and 56/56 E2E checks
(five static checks and 51 Chrome journeys); build passed with the existing
large-bundle advisory. Comparative detail exports and persisted/reviewed
statement-output versions remain open. Commit `e6e538d` was pushed to `main`
and deployed to the existing `steaudit-prototype` production Pages project as
release `1504e96b-a71e-4bc8-bb02-661231aa7b68`. A no-cache request to both the
release URL and `https://prototype.steaudit.com` returned HTTP 200 and served
`assets/index-BsAZniN0.js`, which contains the comparative-period selection and
unavailable-state behavior.

VP-040 export follow-up: statement XLSX/PDF output now pairs each mapped line
and subtotal with current and comparative amounts plus source-account references.
If the prior period is unavailable, the comparative column says unavailable
instead of substituting zero. Chrome reads the downloaded XLSX bytes back and
checks the QAR 2,250,000 current / QAR 800,000 comparative cash line and both
source-account lists. Unit checks passed 131/131; E2E passed 56/56 (five static
checks and 51 Chrome journeys); the build passed with the existing large-bundle
advisory. Persisted statement revisions, independent statement review and
stale-review behavior remain open. Commit `6bce149` was pushed to `main` and
deployed to the existing `steaudit-prototype` production Pages project as
release `c35c6d38-09da-4045-aa7c-bf0bb57bc829`. A no-cache request to both the
release URL and `https://prototype.steaudit.com` returned HTTP 200 and served
`assets/index-BMBC8qpe.js`, containing the paired comparative columns, source
references and unavailable-state handling.

VP-012 administration follow-up: engagement administrators can edit due date,
manager, partner and professional team. Team membership requires unique active
professional personas and a current engagement grant; saving records the change
and invalidates existing release approvals. Chrome verifies a due-date change,
adds a currently granted teammate, reloads the saved history, then suspends,
resumes and cancels the engagement. `npm run test:unit` passed 134/134 and
`npm run test:e2e` passed 57/57 (five static checks and 52 Chrome journeys);
`npm run build` passed with the existing large-bundle advisory. Service/period
scope edits and the complete affected-review applicability matrix remain open,
so VP-012 is still Partial. Commit `fe9b703` was pushed to `main` and deployed
to the existing `steaudit-prototype` Pages project on `production` as release
`eeca0c1f` (`https://eeca0c1f.steaudit-prototype.pages.dev`). Both the release
URL and `https://prototype.steaudit.com` returned HTTP 200 and served
`assets/index-BWkktXve.js` (2,152,630 bytes, SHA-256
`a286b81a60b3dcbd5f1d89a90c0c5a083c64b1c9591f8a9664a24fb59e69edcd`), containing
the engagement details editor. Overall acceptance remains Partial: 36 modules
and 61 stories still require complete criterion-by-criterion evidence.
VP-034 implementation follow-up: added client accounting profiles and guarded
versioned setup for legal entity, reporting basis, currency, chart hierarchy,
open/closed period books and bounded dimensions. Engagements pin profile/chart
revisions and period books; continuance and new engagement paths get a period
record. Chart edits clear mapping approval and invalidate dependent statement
and release state. The import wizard displays context, and imported account
codes must be active posting accounts in the selected open book. Schema v20
migrates legacy TB rows into chart and period records and leaves legacy history
explicitly unpinned and the reporting basis stays unselected until configured.
Accounting-context edits stale dependent current/comparative statement sets;
package generations are visibly stale until reassembled. Unit checks passed
139/139; full build and Chrome acceptance passed 58/58, including AT-34
edit/save/reload, invalid setup rejection, statement invalidation and stale
package detection. The existing large-bundle advisory remains. Module 20 remains
Partial pending broader client/period/chart rework combinations.

Deployment verification: commits `97e703a` and `109bc39` are on `main`; the
latest production Pages deployment is `b80bf015-6808-41f1-a07a-9f2fbc9707ab`
from source commit `109bc39` in the existing `steaudit-prototype` project on
`production`. The immutable release URL
`https://b80bf015.steaudit-prototype.pages.dev` and
`https://prototype.steaudit.com` both returned HTTP 200 and served
`assets/index-BHsMriQO.js`, 2,195,699 bytes, SHA-256
`bd38e283eca45299658f7c5663f0c6cc53fba33d56bc8cf54b3114c36100a550`. Both
bundles contain the setup editor and guarded-import controls. Wrangler reports
the same production deployment/source SHA. Verification: 139/139 unit tests,
including duplicate-code, chart-parent, foreign-period-owner, closed-book and
dimension-value rejection; and
58/58 build/static/Chrome checks, and `git diff --check` passed. Build retains
the existing >500 kB chunk advisory.

Accounting-context invalidation follow-up: commit `f4ec3c1` is on `main` and
deployed to the same production Pages project. Wrangler identifies deployment
`94a3dc80-2414-4205-b619-6f56d10c9138` as Production / `production`, source
`f4ec3c1`. Both `https://94a3dc80.steaudit-prototype.pages.dev` and
`https://prototype.steaudit.com` returned HTTP 200 and served
`assets/index-Dz8Zerb5.js` (2,196,537 bytes; SHA-256
`41fd97e289b3587f9ca4d5c92389277f9cc2c8daf4dfe13cd13499d3932ad8c3`). Both
served bundles contain the setup editor, guarded import and stale-package
controls. `npm run lint`, `npm run test:unit` (139/139), `npm run test:e2e`
(58/58), and `git diff --check` passed before deployment.

VP-055 version-bound review-note follow-up: commit `062ecfb` is on `main` and
deployed to the existing `steaudit-prototype` production Pages project on
`production` as deployment `f049502c-fd22-400d-98f7-f95587ead5a0`
(`https://f049502c.steaudit-prototype.pages.dev`). Wrangler reports source
`062ecfb`. The release URL and `https://prototype.steaudit.com` both returned
HTTP 200 and served `assets/index-BE5eoY-k.js` (2,201,943 bytes; SHA-256
`0a3b2a84e708640e1aba927e436781023e7864518f31266b19a224e6a8b1e26e`). The
custom hostname initially returned its previous HTML bundle; a no-cache
request then served the deployment bundle. Verification before deployment:
`npm run lint`, `npm run test:unit` (141/141), and `npm run test:e2e` (59/59).
The issued-artifact/version-bound review journey passes; other review queues,
filters and assignment gaps remain open, so VP-055 and overall acceptance
remain Partial.

VP-055 filter regression follow-up: `npm run lint` and `npm run test:e2e` passed
(61/61) after extending AT-55. The browser journey explicitly checks
that status filtering retains Responded notes, High severity excludes a Low
note, and clearing the severity filter restores it. Application code and the
deployed `fffc74d` asset did not change.

VP-005 dashboard follow-up: dashboard metrics now open filtered working lists;
client, engagement, fiscal-period and assignee filters apply to the scoped
records; overdue work uses the shared fixed as-of date and excludes completed
or cancelled jobs/tasks and accepted/cancelled/draft PBC requests. The Chrome
journey seeds one overdue job, task and client request and verifies the count
and drill-down reconcile to three, then filters by assignee and verifies two.
Ready-to-release excludes engagements with no workpapers. Billing and
receivables summaries remain role-gated and currency-separated. `npm run lint`
passed, unit tests passed 144/144, and build/Chrome E2E passed 63/63 (five
static checks and 58 Chrome journeys). The existing >500 kB bundle warning
remains. VP-005 stays Partial pending direct evidence across the full
staff/finance visibility matrix. Commit `4bcbf23` was
pushed to `main` and deployed to the existing `steaudit-prototype` Pages project
on production branch `production` as deployment
`36432d1f-634e-409e-9fcf-95ca0b0cd248`
([release](https://36432d1f.steaudit-prototype.pages.dev)). The release URL and
`https://prototype.steaudit.com` both returned HTTP 200 and served
`assets/index-CwKgUQxY.js` (2,224,767 bytes; SHA-256
`8b72e350b3b033ae35d94450881c0bd52a9978b2919b707c2f398e1263387989`), matching
the local build. Wrangler reports production source `4bcbf23`.

VP-005 date override follow-up: the dashboard date control now overrides the
shared default for overdue work and receivables aging. Chrome verifies due-date
inclusivity by showing zero overdue on 2026-09-22 and three on 2026-09-23; the
previous scoped-count, drill-down, completed-item exclusion and assignee checks
still pass. The external-egress assertion now correctly ignores local data URIs
while continuing to reject external HTTP(S) requests. `npm run lint` passed,
unit tests passed 144/144, and full build/Chrome E2E passed 63/63. The existing
large-bundle advisory remains. Commit `3cfb3e1` was pushed to `main` and
deployed to the same `steaudit-prototype` production project as deployment
`094e04c7-1af9-41f5-b05c-41b51a78bade`
([release](https://094e04c7.steaudit-prototype.pages.dev)). The release URL and
`https://prototype.steaudit.com` both returned HTTP 200 and served
`assets/index-81CmgsWB.js` (2,224,916 bytes; SHA-256
`51a6cd20616a9b5b81633478f9a85a70211275da06cf7b4b9a02a060d9692cd6`), matching
the local build. Wrangler reports production source `3cfb3e1`.

VP-032/033 amount drill-down follow-up: receivables now displays all five
aging buckets and each opens an invoice-level detail table showing gross,
issued credits, effective payments, outstanding balance, bucket and overdue
days. AT-32 Chrome verifies the 31–60 day invoice rows include the contributing
INV-2026-002 and sum exactly to the bucket total before continuing the receipt
allocation/reversal journey. `npm run lint` passed, unit tests passed 144/144,
and build/Chrome E2E passed 63/63. The existing bundle-size advisory remains;
OS print/PDF output is not captured, and receivables stays offline-only. Commit
`e00421d` was pushed to `main` and deployed to the existing
`steaudit-prototype` production Pages project as deployment
`0db60b70-f1eb-400e-99c6-b6d3ae324308`
([release](https://0db60b70.steaudit-prototype.pages.dev)). The release URL and
`https://prototype.steaudit.com` both returned HTTP 200 and served
`assets/index-BDgkQtGG.js` (2,226,535 bytes; SHA-256
`5b1f75fe5926f76cf362c5a396d4e88976c64281e7b5b139ff306f93f2427e57`), matching
the local build. Wrangler reports production source `e00421d`.

VP-061 result navigation follow-up: clicking a client search result now selects
that client and opens its detail; clicking an explicitly shared document as a
client selects the permitted engagement and opens the portal. The Chrome
journey checks both links and confirms internal communications remain absent.
`npm run lint` passed, unit tests passed 144/144, and build/Chrome E2E passed
63/63. VP-061 remains Partial for broader person/grant combinations and the
remaining search result links. The existing bundle-size warning remains. Commit
`ff3c5ff` was pushed to `main` and deployed to the existing
`steaudit-prototype` production Pages project as deployment
`00e7da3e-bfa9-4b80-ae6b-e798337c09e1`
([release](https://00e7da3e.steaudit-prototype.pages.dev)). The release URL and
`https://prototype.steaudit.com` both returned HTTP 200 and served
`assets/index-DIGbSQtQ.js` (2,226,692 bytes; SHA-256
`4bfed1f8d168f2c124c1819865bd1b53efb74f8a114562e91c48a78d08ab8886`), matching
the local build. Wrangler reports production source `ff3c5ff`.

VP-061 identifier search follow-up: local search now matches record IDs as well
as names for clients, contacts, engagements, jobs, tasks, documents, invoices,
communications, findings, workpapers and PBC requests while retaining the
existing grant filters. Chrome searches `JOB-2601` and `INV-26002`, opens their
respective workspaces and confirms both retain `ENG-26001` context. `npm run
lint` passed, unit tests passed 144/144, and full build/Chrome E2E passed 63/63.
The existing >500 kB bundle advisory remains. Commit `eac4cac` was pushed to
`main` and deployed to the existing `steaudit-prototype` production Pages
project as deployment `aa5a2fab-1a3f-4231-b186-5797caa6b405`
([release](https://aa5a2fab.steaudit-prototype.pages.dev)). The release URL and
`https://prototype.steaudit.com` both returned HTTP 200 and served
`assets/index-BuBX9Ebz.js` (2,226,463 bytes; SHA-256
`fa03ca426d17275eabd011f0a01b8cbc158602b27a501e9be6a6d4635b007336`), matching
the local build. Wrangler reports production source `eac4cac`.

VP-005 finance-visibility follow-up: the browser journey now verifies the
Billing & Receivables summary is present for a manager and absent for a
preparer, in addition to the existing manager-wide and narrow-grant checks.
`npm run lint` passed and `npm run test:e2e` passed 63/63 (five static checks
and 58 Chrome journeys). No application code changed, so production remains
the verified `eac4cac` build.

VP-049 template revision follow-up: `npm run test:unit` passed 145/145 and
`npm run test:e2e` passed 63/63 (five static checks and 58 Chrome journeys).
The Chrome journey now creates and publishes template v1, applies it, retains
v1 as history when drafting v2, prevents draft use before publication, applies
v2 as fresh work, and verifies both applications remain pinned after template
retirement. Risk edit/review impact checks also pass. VP-049 stays Partial for
broader risk return/rework and reopen cases. The production bundle-size
advisory (>500 kB) remains.

VP-049 template revision changes from `9816b7b` are live. Production release
`https://4cfb292a.steaudit-prototype.pages.dev` and `https://prototype.steaudit.com`
both returned HTTP 200 and served `assets/index-Df4fnS9R.js` (2,231,623 bytes;
SHA-256 `98b1f99c8b8f6eb09a04a0e1ba21591603e434b9546e53b4d13bc8bea85e08ec`),
matching the local build. Wrangler reports deployment
`4cfb292a-36c1-4025-bc4e-de0673ffc4bd` as Production on branch `production`,
source `9816b7b`.

VP-049 risk-plan rework follow-up: the focused real-Chrome journey passed (1/1).
It returns the risk-driven plan with a retained reviewer rationale, saves manager
rework as a new revision without erasing the return, then independently approves
the new revision and verifies planning is restored. `npm run lint` passed,
`npm run test:unit` passed 145/145, and the complete E2E suite passed 63/63
(five static checks and 58 Chrome journeys). VP-049 remains Partial for broader
risk combinations. The bundle-size advisory (>500 kB) remains.
