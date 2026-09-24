# AuditSphere prototype — client demonstration task pack

**Review snapshot:** `nirzaf/auditsphere-visual-prototype` / `main@b24359cd1832d6e026b4226cef8d9b2248903ee9`  
**Prepared:** 2026-09-24  
**Deliverable:** pending-work decomposition and a module-by-module demonstration plan. No application code, GitHub files, issues or deployments were changed.

## Start here

Open [00_MASTER_INDEX.md](00_MASTER_INDEX.md) for the implementation work, [01_MODULE_INDEX.md](01_MODULE_INDEX.md) for all 39 modules and [02_CLIENT_DEMO_PLAYBOOK.md](02_CLIENT_DEMO_PLAYBOOK.md) for the presentation sequence. The [execution rules](03_EXECUTION_RULES.md) explain status and scope.

This bundle contains **52 task cards in 10 chunks**: **48 closure cards for the original stories still reported Partial**, plus **4 explicitly proposed presentation/rehearsal work items**. It also contains **39 module rehearsal guides**. A partial story is not necessarily missing functionality; many cards say **VERIFY_FIRST** because the code already implements useful parts.

The current repository reports **10 of 39 modules** and **16 of 64 stories** Verified. Those statuses are preserved as repository-reported facts, not independent acceptance by this review. The [verified-baseline register](reference/VERIFIED_BASELINE_DO_NOT_REBUILD.md) prevents rebuilding them. Original scope is **256 criteria and 54 cross-module journeys**; later test identifiers do not renumber that contract.

## What the review established

The review used the current connected GitHub snapshot, the 39-module map, the tracker and recent verification/limitation records, with direct code inspection of the active React routes, Shell, scenario/persona factories, planning and financial-statement/status views. It found stale documentation and concrete planning-form/feedback concerns as well as recorded residual acceptance gaps. See [review findings](reference/REVIEW_FINDINGS.md).

**Verification limit:** no new application build, unit suite, browser journey or live deployment check was executed here. The repository records 172 unit and 74 E2E checks at earlier precise source/test checkpoints. The included guide steps are rehearsal targets, not assertions that this author clicked each screen. A local pack validator/self-test checks only this generated bundle.

## How to use the bundle

1. Read the current repository instructions, then compare its HEAD with the pinned snapshot. Preserve newer work.
2. Pick a ready task from the master or chunk index. For VERIFY_FIRST work, inspect/run the named path before writing code.
3. Update only the existing prototype implementation and its canonical tracker/evidence when actually authorized. Do not change the production AuditSphere repository.
4. Use that module's guide to demonstrate success, denial/error and rework. Record actual results; never infer acceptance from a visible menu or a test name.
5. Update the task card's front matter or use the helper below. Refresh indexes and validate the pack.

## Progress commands

Run from this extracted directory with Python 3:

```bash
python3 tools/progress.py validate
python3 tools/progress.py next
python3 tools/progress.py set VP-048 IN_PROGRESS --owner "Developer name"
python3 tools/progress.py set VP-048 IN_REVIEW --owner "Developer name" --evidence "https://github.com/OWNER/REPO/pull/NUMBER"
python3 tools/progress.py set VP-048 COMPLETED --owner "Developer name" --reviewer "Reviewer name" --evidence "https://github.com/OWNER/REPO/pull/NUMBER"
python3 tools/progress.py refresh
python3 tools/test_progress.py
```

The example URL is a placeholder: replace it with real evidence. `COMPLETED` requires an owner, reviewer, evidence and checked task acceptance items. It does not mark an original VP story Verified automatically. On Windows, use `py -3` instead of `python3` where appropriate. Markdown can also be edited directly; then run `refresh` and `validate`.

## Two separate completion decisions

**Demo-ready:** the chosen client agenda works with declared limitations, clear role handoffs and truthful output. Every module's demonstration is logged in [MODULE_DEMO_SIGNOFF.md](tracking/MODULE_DEMO_SIGNOFF.md). A partial story can still have a demo-ready bounded path.

**Full original acceptance:** every original requirement has the required actual evidence in the repository's canonical tracker. `docs/Progress_Tracker.md` remains the authority for VP acceptance. This pack's front matter tracks only the execution of these repair/presentation chunks.

Do not delay all demonstrations solely for excluded live integrations or every optional edge matrix. Equally, do not advertise an unimplemented action as available or claim the whole prototype is accepted while required criteria remain open.

## Reuse, do not duplicate

Keep React + TypeScript + Vite, the current `src/components/modules` and `src/store/prototypeStore.ts`, the existing visual system and six scenario presets. Do not add a backend, second store, workflow engine, replacement role system or a new requirements authority. Integrate resulting guides into the existing `ROLE_GUIDE.md` / `docs/prototype/demo-scenarios.md` when the task is completed.

[Source register](reference/SOURCES.md) · [Scope/storage rules](reference/SCOPE_AND_STORAGE_BOUNDARIES.md) · [Role handoffs](reference/ROLE_HANDOFF_GUIDE.md) · [All-original-story traceability](tracking/SOURCE_TRACEABILITY.md)
