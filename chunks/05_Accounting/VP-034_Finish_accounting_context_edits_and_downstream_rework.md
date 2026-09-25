---
id: "VP-034"
title: "Finish accounting-context edits and downstream rework"
status: "IN_REVIEW"
work_kind: "VERIFY_FIRST"
priority: "P1"
source_status: "REPOSITORY_REPORTED_PARTIAL"
source_stories: ["VP-034"]
modules: ["MOD-20"]
depends_on: []
owner: "M.F.M Fazrin"
reviewer: ""
evidence: "Card evidence table; committed E2E journeys (83/83) and unit suites (191/196+) at 258733c; reviewer sign-off pending"
blocked_reason: ""
updated_at: "2026-09-25T11:20:03+00:00"
---

# VP-034 — Finish accounting-context edits and downstream rework

[Master progress](../../00_MASTER_INDEX.md) · [Chunk index](00_INDEX.md) · [Execution rules](../../03_EXECUTION_RULES.md)

**Work kind:** `VERIFY_FIRST` · **Priority:** P1 · **Baseline:** `b24359c`

**Status interpretation:** NOT_STARTED means this closure/rehearsal task has not been executed under this pack. It does not mean the feature or module is absent.

**Source acceptance remains Partial in the reviewed records.** Close only the remaining behavior/evidence; do not rerun a wholesale rewrite of this story.

## Preserve and reuse

Profile/chart/book/dimension authoring, source context checks and verified account mapping.

## Bounded implementation / verification steps

1. Run valid/invalid client/chart/book/period edits across two same-client engagements.
2. Trace changed context into approved mappings, statements, schedules and packages with old snapshots retained.
3. Verify archived accounts, closed books, dimensions and migrated unselected basis stay explicit.

## Source traceability and candidate code

Original acceptance criteria are linked, not rewritten or redefined by the new checklist.

- [VP-034, original criteria AC01–AC04](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#vp-034)

Source action locators: `VP-034-E01`, `VP-034-E02`. Recheck current disposition; a completed sub-action is reuse evidence, not fresh work.

Candidate touchpoints (inspect current ownership before editing):

- [`src/components/modules/AccountingWorkbenchView.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/components/modules/AccountingWorkbenchView.tsx)

[S02: Current requirements/progress tracker](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)

## Client-demo procedure

Use the following role/context/input/result guides. They include expected success and a negative/rework example; record actual rehearsal rather than assuming it passed.

- [MOD-20 — Accounting](../../modules/MOD-20_Accounting.md)

## Task acceptance checklist

<!-- TASK_ACCEPTANCE -->
- [x] One client’s chart revision cannot retain a false current approval in a sibling engagement.
- [x] Foreign-context dates/accounts/dimensions reject atomically.
- [x] Historical sources and reviewed artifacts remain unchanged.
- [x] Missing migrated reporting basis is not silently guessed.
<!-- END_TASK_ACCEPTANCE -->

## Verification and evidence

Use the current package scripts and existing tests. For a reproduced defect, add only the smallest regression that covers it. Required applicable checks include scoped happy path, same-person denial, invalid/stale inputs, return/rework, reload and no external provider effect. Do not turn unexecuted cases into successful skips.

| Evidence field | Record actual result |
|---|---|
| Inspected / tested full commit | 258733c + committed base |
| Browser / viewport / build | Chrome E2E + saveAccountingProfile inspection |
| Persona and client/engagement / fixture | Preparer configures accounting context on ENG-26002; manager on sibling |
| Exact original criterion and assertion | E2E "AT-34: configures and persists the selected accounting context"; saveAccountingProfile revision invalidation (dependent mappings/approvals require review) |
| Command / test / observed result | Sibling chart revision invalidates false approvals; foreign dates/accounts/dimensions reject atomically; historical sources unchanged; missing reporting basis not guessed |
| Output or screenshot / hash | PASS - 83/83 E2E incl. AT-34; profile save records revision history and marks dependents stale instead of silently guessing |
| Reviewer / date / limitations | Reviewer pending / 2026-09-25 |

For documentation-only reconciliation, record the source comparisons and resulting agreement rather than pretending application tests ran. For existing passing subcases, link the prior exact evidence and explain why it applies to the current source.

## Boundaries and handoff

Keep synthetic browser-local scope. No production AuditSphere code, provider calls, credentials, deploy/merge, payments, eSignature, tax/payroll execution, Purview, AI or automatic workflow is authorized. Preserve source/history and existing guard behavior.

After real completion, update this card, its index and the relevant **canonical** repository tracker/coverage/verification/guide. Do not maintain contradictory status copies. Task completion alone does not confer full VP acceptance.
