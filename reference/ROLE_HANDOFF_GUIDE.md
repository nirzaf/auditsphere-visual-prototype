# Role handoffs and synthetic personas

[Module index](../01_MODULE_INDEX.md) · [Presenter playbook](../02_CLIENT_DEMO_PLAYBOOK.md)

The inspected seed has **22 persona entries and 14 distinct role keys**. Persona entries are not necessarily distinct natural people or simultaneous authenticated users. The role selector is a simulation, not a real login. Source: [S13: Synthetic personas and records](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/store/initialState.ts).

| Persona key | Synthetic name | Role key | Presentation use / boundary |
|---|---|---|---|
| `manager` | Layla Rahman | `manager` | Engagement manager; broad staff presentation |
| `manager-2` | Mariam Saeed | `manager` | Different natural person for eligible independent work |
| `partner` | Daniel James | `partner` | Engagement partner / professional decisions |
| `preparer` | Adam Khan | `preparer` | Preparation; same natural person as multirole-1 |
| `reviewer` | Sara Malik | `reviewer` | Senior review where eligible |
| `eqr` | Dr. Tariq Al-Sayed | `eqr` | Independent EQR where assigned and eligible |
| `eqr-2` | Dr. Samira Noor | `eqr` | Second EQR persona |
| `relationship` | Amira Qasim | `relationship` | Lead/client/proposal commercial work |
| `onboarding` | Hana Ali | `onboarding` | Onboarding coordination |
| `compliance` | Yusuf Ahmed | `compliance` | Compliance evidence/review |
| `billing` | Leila Hassan | `billing` | Firm invoicing and offline receipts; not client accounting authority |
| `records` | Farooq Mansour | `records` | Logical archive/hold/handover |
| `admin` | Khalid Al-Nuaimi | `admin` | System settings and scoped grants; not implicit professional authority |
| `client_admin` | Amal Nasser | `client_admin` | Explicit CL-001 and CL-003 grants |
| `client_finance` | Rami Nasser | `client_finance` | CL-001 PBC contribution |
| `client` | Omar Nasser | `client` | CL-001 management approver |
| `client-northstar` | Aisha Saleh | `client` | CL-002 management approver |
| `preparer-2` | Nadia Rahman | `preparer` | Second preparer for real reassignment |
| `reviewer-2` | Bilal Ahmed | `reviewer` | Second senior reviewer |
| `multirole-1` | Adam Khan | `billing` | Same personId as preparer; cannot self-approve through role switch |
| `reviewer-disabled` | Tariq Aziz | `reviewer` | Inactive identity, negative demonstration only |
| `group-user` | Mona Khalil | `manager` | Narrow ENG-26001 scope; no automatic access to other components |

## Handoffs to explain aloud

Commercial lead conversion → proposal acceptance → professional engagement acceptance are separate decisions. A client contact is not an access grant. A client administrator is not automatically a management approver. Assignment of a task does not grant professional approval power.

Preparation → submission → independent review → management acknowledgement → partner/EQR approval → release are distinct transitions over exact revisions. Do not use a role switch to clear the preparer's own work, disable a guard, seed a fake approval or hide an unresolved significant issue.

Use the module guide's proposed role order, then confirm the actual current grant and assigned-reviewer requirements. If the selected person is not eligible, show the denial and choose another legitimately eligible synthetic person through the supported administration path.

## Presenter-only tools

Scenario reset, metadata backup/import and the persona chooser must be clearly separated from business actions. Loading a named demonstration fixture is not evidence that a client completed its workflow. Label fixture starting state and all preexisting data before presenting it.
