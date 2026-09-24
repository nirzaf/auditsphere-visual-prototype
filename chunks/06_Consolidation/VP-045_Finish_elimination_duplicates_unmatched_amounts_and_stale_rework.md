---
id: "VP-045"
title: "Finish elimination duplicates, unmatched amounts and stale rework"
status: "NOT_STARTED"
work_kind: "VERIFY_FIRST"
priority: "P1"
source_status: "REPOSITORY_REPORTED_PARTIAL"
source_stories: ["VP-045"]
modules: ["MOD-26"]
depends_on: []
owner: ""
reviewer: ""
evidence: ""
blocked_reason: ""
updated_at: ""
---

# VP-045 — Finish elimination duplicates, unmatched amounts and stale rework

[Master progress](../../00_MASTER_INDEX.md) · [Chunk index](00_INDEX.md) · [Execution rules](../../03_EXECUTION_RULES.md)

**Work kind:** `VERIFY_FIRST` · **Priority:** P1 · **Baseline:** `b24359c`

**Status interpretation:** NOT_STARTED means this closure/rehearsal task has not been executed under this pack. It does not mean the feature or module is absent.

**Source acceptance remains Partial in the reviewed records.** Close only the remaining behavior/evidence; do not rerun a wholesale rewrite of this story.

## Preserve and reuse

Draft→submit→independent return→amend→approve and visible unmatched residual are now implemented.

## Bounded implementation / verification steps

1. Compare four original criteria with current lifecycle and counterparty/evidence semantics.
2. Complete duplicate source inclusion, unbalanced/mixed-context and incompatible-counterparty cases.
3. Change a component/rate/perimeter after approval and rehearse clear stale feedback and fresh review; add a separate unmatched-resolution record only if original criteria require it.

## Source traceability and candidate code

Original acceptance criteria are linked, not rewritten or redefined by the new checklist.

- [VP-045, original criteria AC01–AC04](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#vp-045)

Source action locators: `VP-045-E02`, `VP-045-R01`. Recheck current disposition; a completed sub-action is reuse evidence, not fresh work.

Candidate touchpoints (inspect current ownership before editing):

- [`src/components/modules/ConsolidationView.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/components/modules/ConsolidationView.tsx)

[S02: Current requirements/progress tracker](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)

## Client-demo procedure

Use the following role/context/input/result guides. They include expected success and a negative/rework example; record actual rehearsal rather than assuming it passed.

- [MOD-26 — Consolidation](../../modules/MOD-26_Consolidation.md)

## Task acceptance checklist

<!-- TASK_ACCEPTANCE -->
- [ ] Approved matched amount is consumed once; $100 unmatched remains after eliminating only the supported $900 pair.
- [ ] Invalid/duplicate/mixed-source journals never reduce group totals.
- [ ] Approval binds current component/perimeter/rate identities and becomes stale on change.
- [ ] Manual reasoned rework retains old decisions and never changes a component TB.
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
