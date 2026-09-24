---
id: "VP-061"
title: "Finish scoped search targets and return-to-context cases"
status: "NOT_STARTED"
work_kind: "VERIFY_FIRST"
priority: "P2"
source_status: "REPOSITORY_REPORTED_PARTIAL"
source_stories: ["VP-061"]
modules: ["MOD-17"]
depends_on: []
owner: ""
reviewer: ""
evidence: ""
blocked_reason: ""
updated_at: ""
---

# VP-061 — Finish scoped search targets and return-to-context cases

[Master progress](../../00_MASTER_INDEX.md) · [Chunk index](00_INDEX.md) · [Execution rules](../../03_EXECUTION_RULES.md)

**Work kind:** `VERIFY_FIRST` · **Priority:** P2 · **Baseline:** `b24359c`

**Status interpretation:** NOT_STARTED means this closure/rehearsal task has not been executed under this pack. It does not mean the feature or module is absent.

**Source acceptance remains Partial in the reviewed records.** Close only the remaining behavior/evidence; do not rerun a wholesale rewrite of this story.

## Preserve and reuse

Existing exact task/workpaper/contact/finding/PBC navigation and scoped filters.

## Bounded implementation / verification steps

1. Reconcile already-added target fixes with old pending descriptions.
2. Run all permitted persona/grant/type combinations, including archived/unavailable targets and grant revocation.
3. Verify record highlighting, engagement selection and return filters; preserve deterministic text/metadata search.

## Source traceability and candidate code

Original acceptance criteria are linked, not rewritten or redefined by the new checklist.

- [VP-061, original criteria AC01–AC04](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#vp-061)

Source action locators: `VP-061-E01`, `VP-061-E02`, `VP-061-R03`. Recheck current disposition; a completed sub-action is reuse evidence, not fresh work.

Candidate touchpoints (inspect current ownership before editing):

- [`src/components/modules/ClientDetailView.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/components/modules/ClientDetailView.tsx)

[S02: Current requirements/progress tracker](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)

## Client-demo procedure

Use the following role/context/input/result guides. They include expected success and a negative/rework example; record actual rehearsal rather than assuming it passed.

- [MOD-17 — Search & Centralized Client View](../../modules/MOD-17_Search_Centralized_Client_View.md)

## Task acceptance checklist

<!-- TASK_ACCEPTANCE -->
- [ ] Every result opens the correct specific authorized record.
- [ ] Search/count/filter options never reveal an ungranted record.
- [ ] Unavailable/archived results are labeled and cannot bypass availability guards.
- [ ] No embeddings, AI, indexing service or duplicate record store is added.
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
