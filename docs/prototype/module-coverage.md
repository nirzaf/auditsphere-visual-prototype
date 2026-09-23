# AuditSphere Visual Prototype — 39-Module Coverage (VP-064)

Version 1.0 · 2026-09-23 · `docs/prototype/module-coverage.md`

Columns describe implementation areas and acceptance assertions to execute; they are
not evidence that the acceptance journeys have run. Every module remains Partial
until its complete journey has direct, recorded evidence in `verification.md`.

| Module ID | Story IDs | Route(s) | Command(s) | Fixture(s) | Positive acceptance assertion | Negative/scope assertion | Rework/stale assertion | Result | Limitation |
|---|---|---|---|---|---|---|---|---|---|
| 01 | VP-005, VP-060 | overview | scoped selectors | full-practice | dashboard counters agree with registers | narrow grant excludes siblings | overdue uses fixed as-of | Partial | Finance sections gated by visibility |
| 02 | VP-006, VP-007, VP-008 | clients, client-detail | addClient/updateClient/addContact/setPrimaryContact | CL-001…CL-005, contacts, GRP-REL-01 | profile save propagates | duplicate code rejected; similar-name warns | stale edit rejected | Partial | Soft-archival only |
| 03 | VP-009 | acquisition | addLead/updateLead/convertLead | LD-001…LD-004 | convert creates linked client once | lost needs reason; no auto-acceptance | — | Partial | No auto-capture |
| 04 | VP-010, VP-011, VP-012 | proposals, engagements | addProposal/reviewProposal/recordProposalResponse/addEngagement | PROP-001, ENG-26001/26002/26003 | revision-bound review/response | same-person review denied | edit stales approval | Partial | — |
| 05 | VP-013, VP-014 | jobs | addJob/updateJob/addTask/updateTask/reassignTask | JOB-2601/2602, TSK hierarchy | manual states; blocked needs reason | 2nd level/cycle/cross-job rejected | parent blocked by open children | Partial | — |
| 06 | VP-015 | job-templates | applyJobTemplate | TPL-JOB-01/02 | one fresh tree per operation | draft/retired not offered | template change spares old jobs | Partial | No recurrence |
| 07 | VP-016, VP-027 | communications | addComment/addCommunication | COM-01/02, COMM-01/02 | threads linked to subject | client cannot see internal notes | edited marker | Partial | In-app notices only |
| 08 | VP-025 | portal | scoped projections | multi-grant Amal Nasser | entity switch re-scopes all lists | no draft/internal leakage | withdrawn-sharing state | Partial | No Pay button |
| 09 | VP-023, VP-024 | portal | addPbcRequest/presentPbcRequest/acceptPbcResponse | PBC-01…04 | presented request appears in portal | recipient cross-client rejected | replacement needs re-review; self-accept denied | Partial | No reminders |
| 10 | VP-020, VP-021 | documents | addDocument/prepareClientWorkspace | DOC-001…004 | library independent of PBC | wrong-root link flagged | version pin keeps old ref; reload explains bytes | Partial | Metadata+hash only |
| 11 | VP-026, VP-027 | communications | addCommunication | TPL-EM-01/02 | simulate accepted/failed/unknown | invalid recipient/placeholder blocked | no duplicate accepted on repeat | Partial | No inbox/sync |
| 12 | VP-028 | my-time | addTimeEntry/reviewTimeEntry/correctApprovedTime | TIME-01…04 | submit→approve updates totals | self-approve denied | correction supersedes, history kept | Partial | No auto-capture |
| 13 | VP-029 | budgets | updateBudget | BDG-26001 | §5.5 math reconciles | unknown cost = unknown | rate edit versions, history kept | Partial | No scheduler |
| 14 | VP-030, VP-031 | billing | addInvoice/reviewInvoice/issueInvoice/addCreditNote | INV-2026-001…003, CRN-2026-001 | lines/total reconcile; one issue event | double-source/self-review/cross-client rejected | issued immutable; credit lineage | Partial | No tax engine |
| 15 | VP-032, VP-033 | receivables | addReceipt/allocateReceipt/reverseAllocation | REC-2026-001/002 | receipt = allocations + unallocated | over/cross/draft rejected | reversal restores with reason | Partial | Offline only |
| 16 | VP-060 | reports | deterministic selectors | all registers | rows/exports reconcile | scope applies to downloads | source edit refreshes reports | Partial | No AI/BI |
| 17 | VP-008, VP-061 | clients + search | scoped search | all fixtures | grouped results open context | unauthorized contribute nothing | archive updates index | Partial | Text/metadata only |
| 18 | VP-017, VP-020, VP-021, VP-022, VP-026 | m365-setup | updateM365Config/simulateM365Verification/simulateM365Disconnect | synthetic tenant | resumable simulated config | denied/missing/expired/throttled/unavailable fixtures | config change stales tests | Partial | liveConnected=false |
| 19 | VP-018, VP-019 | administration | grantAccess/revokeAccess | 19 personas, person-keyed grants | least-privilege tabs | sibling hidden; admin cannot self-promote | stale dialog revalidates | Partial | Illustrative only |
| 20 | VP-034, VP-037 | accounting-setup | chart/period/dimension editors | ENG rows, mappings | context inherits visibly | cycles/duplicates rejected | approved edits version + stale outputs | Partial | Import-first only |
| 21 | VP-035, VP-036 | accounting-setup | updateTrialBalanceRows/TBImportWizard | synthetic CSV/XLSX | genuine XLSX within limits | unbalanced/dup/formula rejected, old source kept | replacement stales dependents | Partial | 2,000 rows / 2 MB |
| 22 | VP-038 | accounting-setup | addAdjustmentJournal/updateAdjustmentJournal | AJ-01 | balanced + reviewed → included once | unbalanced/self-approval rejected | reflected source zeroes effect | Partial | No ledger posting |
| 23 | VP-039 | accounting-setup | reconciliation editors | REC-01…04 | residual reproducible | nonzero residual blocks | source replacement stales review | Partial | Manual only |
| 24 | VP-040, VP-041 | financial-statements | statement builder | mapped periods | columns/subtotals reconcile | missing prior = unavailable | layout change = new revision | Partial | Supported lines only |
| 25 | VP-042 | financial-packages | package builder + exportService | package v3 | XLSX/DOCX/PDF open with totals+watermark | generation failure blocks output | content change = new artifact revision | Partial | Local generation |
| 26 | VP-043, VP-044, VP-045, VP-046 | consolidation | updateConsolidationGroup | GRP-01, ELIM-01 | consolidated = translated + eliminations | missing rate/period blocks | perimeter change stales approvals | Partial | Bounded profile |
| 27 | VP-047 | onboarding | acceptance cases | questionnaire | separate collection/recommendation/decision | prohibitions visible | continuance drafts fresh context | Partial | No live screening |
| 28 | VP-048 | audit-planning | plan/materiality editor | benchmark fixture | deterministic materiality math | missing benchmark blocked | approved edit = new revision | Partial | Illustrative |
| 29 | VP-049 | audit-risks | risk/program editors | RSK-01…03, PRG-01/02 | reciprocal links; gaps shown | cross-engagement rejected | approved change stales review | Partial | No AI scoring |
| 30 | VP-050 | audit-risks | procedure execution | PRC-01…04 | required evidence or limitation | exception stays visible | evidence change renews review | Partial | — |
| 31 | VP-051 | sampling | population editors | POP-01 | selected + remainder reconcile | wrong-period blocked | replacement keeps history, needs reselection | Partial | No assurance inference |
| 32 | VP-052 | audit | updateWorkpaper/clearWorkpaper | WP-A1…F1 | exact-revision clear | preparer cannot self-clear | evidence swap keeps history | Partial | Six tabs retained |
| 33 | VP-053 | evidence | linkEvidenceProcedure | EVD-01/02 | shared refs resolve to same version | wrong-client/version rejected | replacement flags dependents | Partial | Metadata search |
| 34 | VP-054 | findings | setFindingDisposition | FND-01 | promotion keeps provenance | qualitative without amount OK | close/reopen needs rationale | Partial | Contextual materiality |
| 35 | VP-055 | reviews | addReviewNote/respondReviewNote/clearReviewNote | RN-001/002 | queues update without widening | responder cannot self-clear | subject change reopens | Partial | — |
| 36 | VP-056 | approvals | recordApproval (per-engagement) | ENG approvals | EQR per engagement | partner≠EQR; self-approve denied | artifact change needs fresh decision | Partial | No signatures |
| 37 | VP-057, VP-058 | delivery | prepareReleaseCandidate/issueRelease/prepareAmendedRelease | releases | gates block with links; manifest frozen | duplicate click = one release | amendment needs fresh review | Partial | Dispatch simulation |
| 38 | VP-059 | records | archiveEngagement | archive manifest | exact identities; no duplicates | hold blocks handover; no Purview gate | successor archives keep history | Partial | Logical index only |
| 39 | VP-019, VP-062 | administration | updateFirmSettings | firmSettings | settings apply prospectively | business-role gates hold | issued/released history unchanged | Partial | No excluded toggles |

Cross-cutting VP-001–VP-004, VP-063–VP-064 apply to every row (scope freeze,
single store/bridge, navigation/forms, migrations/scenarios, tests, evidence).
