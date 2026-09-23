# AuditSphere Visual Prototype — Verification Record (VP-063/VP-064)

Updated 2026-09-23. This record distinguishes executed checks from planned
acceptance assertions. The latest source and Pages release are recorded below;
the existing `steaudit-prototype` project serves `prototype.steaudit.com`.

## Commands

- `npm run build` runs `tsc --noEmit && vite build`.
- `npm run test:unit` runs the deterministic Node test suite.
- `npm run test:e2e` builds, serves `dist/` on loopback, runs static smoke checks,
  then launches headless Chrome for real browser checks.
- `npm run legacy:check` was not rerun in this pass; prior results are historical.

## Latest execution

| Date (UTC) | Revision | Command | Result | Evidence and limits |
|---|---|---|---|---|
| 2026-09-23 | working tree after `1f9fb76` | `npm run test:unit` + `npm run test:e2e` | PASS — 136/136 unit, 57/57 E2E | Five static checks and 52 Chrome journeys. AT-49 verifies native print is invoked for all 16 reports in addition to CSV coverage. AT-52 now carries manually entered client data through won opportunity, scoped client response, engagement, job, approved mapping and persisted XLSX/DOCX/PDF artifacts. AT-53 checks all staff routes plus 768px/390px layout, modal bounds and keyboard focus/Tab navigation. Overall ledger remains 59/64 stories and 36/39 modules Partial; these journeys do not close every backlog criterion. |
| 2026-09-23 | working tree after `1f9fb76` | `npm run test:unit` + `npm run test:e2e` | PASS — 136/136 unit, 57/57 E2E | Follow-up R05 check verifies case-insensitive trimmed recipient deduplication and blocks a second release record for the same generation. Build passed with the existing large-bundle advisory. Overall ledger remains Partial. |
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
