# Review findings — client-demo readiness

[Master index](../00_MASTER_INDEX.md) · [Sources](SOURCES.md)

**Repository:** `nirzaf/auditsphere-visual-prototype`  
**Reviewed HEAD:** `b24359cd1832d6e026b4226cef8d9b2248903ee9`  
**Method:** source/record review plus targeted active-code inspection; no fresh app build, live-browser rehearsal or deployment verification by this author. All priorities below are recommended client-demo sequencing, not copied GitHub issue priorities.

## Decision

The application already exposes all 39 functional areas in the current native React route map. The task is **complete and explain the supported experience**, not build 39 modules from zero. The repository records 10 modules/16 stories Verified, with 29 modules/48 stories still Partial. “Partial” combines missing acceptance evidence and residual functionality.

## Concrete code and content findings

| Finding | Basis | Why it matters | Task owner |
|---|---|---|---|
| Planning prepopulates benchmark/rationale/team/milestone assumptions and calls the helper with only benchmark and overall percentage. | CODE_INSPECTED: AuditPlanningView initial fields and calculateMateriality call. | A presentation can imply unentered assumptions or professional approval; separately required performance/trivial inputs need deliberate control. | VP-048 |
| Planning review feedback appends “Engagement planning gate cleared” on both approve and return. | CODE_INSPECTED: handleReviewPlan. | The visible message can contradict a returned plan's state. | VP-048 |
| Shared dirty-form registration is visibly wired to Client Detail and M365 in App.tsx, not all remaining module forms. | CODE_INSPECTED: route props. Other local protections need checking before claiming they are absent. | Persona/client/engagement changes must not lose a draft or apply it to the wrong record. | VP-003 |
| RequirementsView still labels VP-014 Partial and contains obsolete missing-feature descriptions for task/collaboration/template work. | CODE_INSPECTED status rows compared with newer tracker/verification. | The client and implementer can be told a working feature is missing. | VP-064 |
| README describes the compatibility runtime, old output directory and a universal metadata-only storage boundary. | CODE_INSPECTED active App and repository-reported artifact/PBC persistence disagree with those broad descriptions. | Presenter instructions and file-availability promises can be wrong. | VP-002 / VP-021 / VP-064 |
| Scenario and presenter documentation offers presets and short journeys rather than an exact 39-module click/role/result script. | SOURCE_READ: demo-scenarios.md and scenario factory. | The client demonstration needs explicit “how to use”, prerequisites and handoff guidance. | DEMO-001 / DEMO-002 / DEMO-004 |

## Residual work groups

**Accounting and group reporting:** bounded statement layouts, comparative/rework combinations, component-equity support where backed by the data, adjustment/reflection/source-replacement cases, reconciliation correction/evidence paths, and duplicate/mixed-source elimination cases. Preserve genuine packages, cash-flow/equity and group JSON implementations already recorded.

**Practice and collaboration:** complete client-profile fields/lifecycle, connected Client 360 actions, proposal content/lifecycle, engagement change impacts, job completion/rework and already-implemented communication/notification acceptance. No recurring-work or inbox product is added.

**M365, access and portal:** complete simulated setup/failure/cancel recovery, professional-role/scope/expiry combinations, exact file-availability guidance and remaining client/PBC sharing/recipient/reassessment paths. Live integrations are excluded.

**Firm economics:** finish time correction/billing impact, budget arithmetic/rate history, invoice revision/credit caps, offline allocation/reversal and as-of aging demonstrations. A receipt is not a payment action.

**Audit and presentation:** deliberate planning assumptions, multi-risk/procedure rework, findings/release impact, exact criterion evidence, module how-to content, role handoffs and measured responsive/keyboard rehearsal.

## Reconciliation warnings

The tracker mentions 109 acceptance planning rows, but several rows and old implementation actions are now complete. Do not interpret 109 as 109 missing features. This pack groups residual closure by the **48 still-partial original stories**, then adds four explicitly proposed presentation tasks. Named source action IDs inside each card are navigation aids, not duplicated independent tasks.

The 16/48 source summary, the 13-item old “verified stories” bullet, VP-014 in RequirementsView, some limitation paragraphs and old persona counts disagree. This review does not silently edit the source. VP-064 owns reconciliation. The inspected seed has 22 persona entries / 14 role keys; some entries share a natural person.

## Checks not performed here

No source code was changed; no application test suite, live browser UI, hosted URL or external provider was exercised. The source reports 172 unit and 74 E2E checks at precise earlier commits; those are not new test results. Package-level consistency and tracking-helper tests are recorded separately after actual local execution.

## Client-demo recommendation

First close truthful planning/feedback, navigation/form safety and current capability guidance. Rehearse the six existing presets with exact-role handoffs and real supported sample outputs. Keep full original acceptance separate: a limited agenda can be demo-ready with explicitly declared residual edge cases, but “all features accepted” is unsupported until the original criteria are evidenced.
