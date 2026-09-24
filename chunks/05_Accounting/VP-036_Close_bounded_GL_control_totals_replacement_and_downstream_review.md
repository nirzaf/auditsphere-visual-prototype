---
id: "VP-036"
title: "Close bounded GL control totals, replacement and downstream review"
status: "NOT_STARTED"
work_kind: "VERIFY_FIRST"
priority: "P1"
source_status: "REPOSITORY_REPORTED_PARTIAL"
source_stories: ["VP-036"]
modules: ["MOD-21"]
depends_on: []
owner: ""
reviewer: ""
evidence: ""
blocked_reason: ""
updated_at: ""
---

# VP-036 — Close bounded GL control totals, replacement and downstream review

[Master progress](../../00_MASTER_INDEX.md) · [Chunk index](00_INDEX.md) · [Execution rules](../../03_EXECUTION_RULES.md)

**Work kind:** `VERIFY_FIRST` · **Priority:** P1 · **Baseline:** `b24359c`

**Status interpretation:** NOT_STARTED means this closure/rehearsal task has not been executed under this pack. It does not mean the feature or module is absent.

**Source acceptance remains Partial in the reviewed records.** Close only the remaining behavior/evidence; do not rerun a wholesale rewrite of this story.

## Preserve and reuse

Configurable CSV/XLSX header mapping, openings/tie-out, partial-batch rejection and scoped exports are implemented.

## Bounded implementation / verification steps

1. Reconcile exact original source-control requirements with current preview and journal/account drill-down.
2. Complete missing-opening, unmatched-account, duplicate, period/currency and partial-batch permutations not already evidenced.
3. Run replacement through reconciliation and package staleness/re-review while preserving TB and GL predecessors.

## Source traceability and candidate code

Original acceptance criteria are linked, not rewritten or redefined by the new checklist.

- [VP-036, original criteria AC01–AC04](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#vp-036)

Source action locators: `VP-036-E02`, `VP-036-E03`, `VP-036-R01`. Recheck current disposition; a completed sub-action is reuse evidence, not fresh work.

Candidate touchpoints (inspect current ownership before editing):

- [`src/components/modules/AccountingWorkbenchView.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/components/modules/AccountingWorkbenchView.tsx)

[S02: Current requirements/progress tracker](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)

## Client-demo procedure

Use the following role/context/input/result guides. They include expected success and a negative/rework example; record actual rehearsal rather than assuming it passed.

- [MOD-21 — Trial Balance & GL](../../modules/MOD-21_Trial_Balance_GL.md)

## Task acceptance checklist

<!-- TASK_ACCEPTANCE -->
- [ ] Per account, explicit opening + accepted movement equals the closing TB or an explained incomplete residual.
- [ ] Incomplete batches cannot be committed by either UI or store.
- [ ] The accepted column map/source hash/context survive reload and replacement.
- [ ] Stale downstream review is visible; historical client source rows are never changed.
<!-- END_TASK_ACCEPTANCE -->

## Verification and evidence

Use the current package scripts and existing tests. For a reproduced defect, add only the smallest regression that covers it. Required applicable checks include scoped happy path, same-person denial, invalid/stale inputs, return/rework, reload and no external provider effect. Do not turn unexecuted cases into successful skips.

| Evidence field | Record actual result |
|---|---|
| Inspected / tested full commit | Not recorded |
| Browser / viewport / build | Not recorded |
| Persona and client/engagement / fixture | Not recorded |
| Exact original criterion and assertion | Not recorded |
| Command / test / observed result | Not run |
| Output or screenshot / hash | Not recorded |
| Reviewer / date / limitations | Not recorded |

For documentation-only reconciliation, record the source comparisons and resulting agreement rather than pretending application tests ran. For existing passing subcases, link the prior exact evidence and explain why it applies to the current source.

## Boundaries and handoff

Keep synthetic browser-local scope. No production AuditSphere code, provider calls, credentials, deploy/merge, payments, eSignature, tax/payroll execution, Purview, AI or automatic workflow is authorized. Preserve source/history and existing guard behavior.

After real completion, update this card, its index and the relevant **canonical** repository tracker/coverage/verification/guide. Do not maintain contradictory status copies. Task completion alone does not confer full VP acceptance.
