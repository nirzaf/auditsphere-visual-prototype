# Source register and verification boundaries

[Master index](../00_MASTER_INDEX.md)

**Snapshot:** `nirzaf/auditsphere-visual-prototype` / `main@b24359cd1832d6e026b4226cef8d9b2248903ee9`. The reviewed head was resolved through the connected GitHub branch endpoint. Content links below are immutable to that snapshot.

The review directly read selected ranges of the original backlog, tracker, coverage, limitations and recent verification records, together with the active application routing and key code files. S07 and S17 are existing canonical companion documents to consult during execution; they were not independently exhaustively reviewed. S18 identifies the store via the current tree, imports and command/test records, not a claim of line-by-line review of its full implementation.

| ID | Pinned source | Use / limit |
|---|---|---|
| S01 | [Original 64-story contract](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/Gap_Closure_User_Stories.md) | Complete 39-module definitions, original VP identifiers, shared rules and original 54 journeys. Historical missing/light assessments are not current gaps. |
| S02 | [Current requirements/progress tracker](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md) | Current reported 16 verified/48 partial stories; 256 original criteria; section 9 action dispositions. Several old summaries remain inconsistent with newer entries. |
| S03 | [39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) | Module routes, commands, examples and remaining acceptance limitations. |
| S04 | [Remaining limitations](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/remaining-limitations.md) | Useful residual-gap inventory, but reconcile with the newer tracker and verification before implementing. |
| S05 | [Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md) | Records 172 unit and 74 E2E checks (5 static, 69 Chrome), test HEAD 804ccc8, application source 188ee3b and deployed source 0004ce5. These are repository-recorded, not freshly rerun here. |
| S06 | [Presenter scenarios](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/demo-scenarios.md) | Six named scenario presets and fixed arithmetic; existing presenter guidance is a short outline, not a complete module-by-module script. |
| S07 | [Scope](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/scope.md) | Current allowed synthetic product boundaries. Consult with original contract and tracker. |
| S08 | [Active application routes](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/App.tsx) | Native React module imports and route rendering. Unsaved-form registration is explicitly passed to ClientDetailView and M365SetupView in the inspected application wiring. |
| S09 | [Shell/navigation](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/components/layout/Shell.tsx) | Current sidebar labels, persona/engagement switchers, search and existing scenario chooser. Extend these; do not build a second shell. |
| S10 | [Audit planning implementation](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/components/modules/AuditPlanningView.tsx) | Prefilled benchmark/team/milestones/review text; calculateMateriality is called with benchmark and percentage only; return/approve feedback needs review. |
| S11 | [Financial statement implementation](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/components/modules/FinancialStatementsView.tsx) | Existing mapped statements, comparative selection and reviewed cash/equity schedules. Do not recreate them as missing. |
| S12 | [Requirements status UI](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/components/modules/RequirementsView.tsx) | 39 module rows and VP status summaries; VP-014 and several limitation strings disagree with newer evidence. |
| S13 | [Synthetic personas and records](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/store/initialState.ts) | 22 persona entries, 14 distinct role keys, fixed as-of date, CL-001.. and engagement grants. Same-person Adam personas do not establish independent review. |
| S14 | [Scenario factories](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/store/scenarios.ts) | Six named factories, including full-practice, accounting-only, audit-findings, two-component-consolidation, blocked-rework and empty-practice. |
| S15 | [Actual package scripts](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/package.json) | React/TypeScript/Vite application; lint is tsc --noEmit, unit tests use tsx, E2E script builds before running tests. |
| S16 | [README](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/README.md) | Contains stale compatibility-runtime, build-directory and metadata-only statements; reconcile with active code and storage paths. |
| S17 | [Existing role guide](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/ROLE_GUIDE.md) | Reuse as the canonical user-role guide; this bundle is a planning/walkthrough overlay, not a replacement product specification. |
| S18 | [Shared store](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/store/prototypeStore.ts) | Canonical store/commands identified in source tree and route imports. Individual command behavior is supported by coverage/test records unless specifically code-inspected. |
| S19 | [Materiality helper and test](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/services/calculations.ts) | Search confirms performancePct defaults to 75; tests use 75%/5% synthetic examples. Such defaults are examples, not professional guidance. |

## Evidence categories

**CODE_INSPECTED:** an actual implementation line/route/control was read. This can identify a defect candidate, but not prove every runtime path.

**REPOSITORY_REPORTED:** the current tracker, coverage or verification records state an implementation/test result. Preserve its exact original checkpoint; do not promote it to a fresh run.

**PROPOSED_DEMO_WORK:** new presentation guidance/tour/rehearsal work recommended to meet this request. It does not alter the original 39-module contract.

**NOT_RUN:** no application/build/browser execution by this review. Generated-package validation is reported separately in `tracking/PACK_VALIDATION.md`.

## Evidence precedence for execution

Read current code and exact newest verification before using old “missing” prose. Keep the original VP criterion wording as the requirement. A later passing subcase can retire one old pending action without proving the full story. Where records disagree, document the discrepancy and verify; never fabricate a new canonical status.
