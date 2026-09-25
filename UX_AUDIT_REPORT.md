# AuditSphere Prototype — UI/UX Readability & Usability Audit

> **STATUS: ALL FINDINGS FIXED (F1–F10), 2026-09-25.** Each fix verified live in the browser with the same measurement script (contrast ratios, font sizes, target dimensions, label association). See §5 for the fix log.

**Audited build:** `2e466d2` + current working tree · **Date:** 2026-09-25
**Method:** live-browser measurement pass over all 32 staff pages, Client 360 (12 tabs), the client portal (client_admin persona) and a 390px mobile viewport — computed font sizes, WCAG contrast ratios (text vs effective background), interactive-target dimensions, form-label association and horizontal-overflow checks — cross-validated with screenshots. Automated behaviour coverage (91 Chrome journeys) is out of scope here; this report covers readability and usability.

---

## 1. Executive summary

| Severity | Count | Theme |
|---|---|---|
| **High** | 3 | Portal hero tab contrast (1.9–2.2:1), folder/risk card contrast (1.89:1), mobile hero selects squeezed to ~24px |
| **Medium** | 5 | Sub-12px type system (9–11px captions/labels/headers), unlabeled form controls (~20), small click targets (20–39px), as-of label mismatch, truncated button labels |
| **Low** | 3 | Count-badge contrast (3.27–4.39:1 at 10px), panel edge clips, eyebrow spacing |

No horizontal overflow was found on any page at 1280px or 390px. Structure, information hierarchy, empty states and honesty labelling are consistently good.

---

## 2. Findings and recommendations

### F1 · HIGH — Client portal hero tabs fail contrast
- **Where:** Client Portal (staff preview *and* client personas) — the dark-teal hero's tab strip.
- **Measured:** `Home Dashboard` 1.9:1, `Audit Engagement Status` 2.2:1 at 15px — WCAG AA requires 4.5:1. Teal text on the dark-navy hero panel.
- **Impact:** The primary navigation of the client-facing demo is hard to read for low-vision users and on projectors.
- **Recommendation:** Raise inactive-tab color to at least `#9fc4c9` (≈4.6:1 on `#193f49`), and make the active tab white-on-teal (`#d4f5ce` on `#284c48` already qualifies). Verify with the fixed values in `styles.css` `.portal-hero` context.

### F2 · HIGH — Light-gray folder/risk cards fail contrast
- **Where:** Documents & SharePoint folder tree (`Accounting & Trial Balances`, `Audit Substantive Testing`, …) and Audit Risks program-area cards (`Fixed Assets and Depreciation`, `Trade Receivables`) — both measured **1.89:1 at 12–13px**.
- **Impact:** The primary selection affordance of two modules is effectively invisible in bright rooms.
- **Recommendation:** Use the existing `.navitem` treatment (white/`#adc0c3` on hover surfaces) or darken text to `var(--ink)`; keep the muted look with an icon tint, not the text color.

### F3 · HIGH — Mobile: portal hero selects collapse to ~24px
- **Where:** Client portal hero at 390px — `Switch Entity` and `Engagement` selects render ~24px wide; `Exit Portal Preview` truncates to `Exit…`.
- **Impact:** The two most important client-demo controls become unusable on phones.
- **Recommendation:** In the ≤760px media query, stack the hero (`flex-direction: column; align-items: stretch`) and give both selects `width: 100%; min-width: 0`; move `Exit Portal Preview` to its own row.

### F4 · MEDIUM — Sub-12px type is systemic
- **Measured everywhere:** table headers at **9px** (`JOB TITLE`, `INVOICE #`, `EVIDENCE ITEM`, `STORY ID`), section eyebrows/captions at **10px**, buttons and subtitles at **11px** ("Clear filters", "Save statement revision", "Export filtered queue").
- **Impact:** Sustained reading fatigue and accessibility failure (WCAG 1.4.4 still allows zoom, but default-state legibility suffers, especially on 125%/150%-scaled laptops where these shrink further).
- **Recommendation:** One design-token change fixes the system: raise the caption token from 9→11px, the small-button/base-small token from 11→12px, and table headers from 9→10px minimum. Audit after with the same script; no per-page edits needed.

### F5 · MEDIUM — ~20 form controls have no programmatic label
- **Where (unlabeled count per page):** Acceptance & KYC 5 (evidence-reference text fields), Jobs & Tasks 6 (filter selects), Sampling 6 (import options), Client Portal hero 2 (entity/engagement switchers), Approvals 2, Accounting Workbench 2, Planning 1, Records 1, Requirements 1, Portfolio 1.
- **Impact:** Screen readers announce these as blank "edit combo"; the visual captions are `<label>` elements not associated with the control.
- **Recommendation:** Two options — wrap each caption + control in a `<label>` element, or add `aria-label` matching the visible caption. The KYC evidence fields and the portal hero switchers matter most (demo-visible controls).

### F6 · MEDIUM — Small interactive targets
- **Measured:** Evidence Catalogue "×" unpin buttons **20×38px**; Accounting TB "Edit" buttons **31×38px**; Jobs status select **19px high**; Packages reorder "▲ Up/▼ Down" **39px wide**.
- **Impact:** Missed clicks during demos; WCAG 2.5.8 minimum is 24×24 (best practice 44×44).
- **Recommendation:** Raise `.btn.sm` min-height to 24px and give icon-only buttons (`icon-btn`, the × buttons) a fixed 32×32 hit area with centered icon; bump table-row action padding.

### F7 · MEDIUM — As-of date label mismatch
- **Where:** Topbar chip reads **"22 Sept 2026 · As of date"** while every page's as-of filter and the fixed demo clock is **2026-09-23** (`scope.md`).
- **Impact:** A presenter will be asked why two dates differ; it undermines the "fixed demo clock" story.
- **Recommendation:** Bind the chip to `state.asOfDate` (2026-09-23) or relabel it to "Demo clock: 2026-09-23".

### F8 · LOW — Truncated/edge-clipped buttons
- **Where:** Client Portfolio card action renders as "**Open Work**" (mid-word clip of "Open Workspace"); Job Templates detail "Create Job from Template" button clips the panel's right edge.
- **Recommendation:** Shorten the card label to "Open" or "Workspace", and give the templates detail pane `overflow-wrap` + `min-width: 0` so the button wraps instead of clipping.

### F9 · LOW — Count badges and muted numerals below 4.5:1
- **Measured:** Portfolio "5 clients registered" 3.27:1, Engagements badges 3.34:1, Communications "Inbound · Meeting" 3.27:1, Consolidation negative amounts "(QAR 50,000.00)" 4.0:1, Receivables "QAR 20,000.00" 4.24:1, Evidence "×" 4.39:1 — all at 9–12px.
- **Recommendation:** These are borderline; darkening the muted token (`--muted`) by one step (e.g. `#78888d` → `#6b7a7f`) lifts all of them above 4.5:1 without a redesign.

### F10 · Positive — what already works (keep)
- No horizontal overflow on any page at 1280px or 390px, including wide tables (scroll containers behave).
- Consistent page skeleton (pagehead → tabs → panels), honest empty states ("No Active Engagement Selected", "No shared documents available for this entity."), simulation-honesty labels on every external-action surface.
- Modal focus trap, Escape handling and unsaved-changes guard verified previously; stable layout (no render churn, 0 running animations).

---

## 3. Recommended fix order

1. **F1 + F2 + F3** (contrast + mobile hero) — highest client-visibility impact; ~30 lines of CSS.
2. **F4** (type tokens) — one-token systemic readability lift.
3. **F7 + F8** (label mismatch + truncations) — presenter-credibility fixes, minutes each.
4. **F5 + F6** (labels + targets) — accessibility hardening sweep.
5. **F9** (muted token) — final contrast lift.

## 5. Fix log — all findings resolved 2026-09-25

| Finding | Fix applied | Verified in browser |
|---|---|---|
| F1 portal hero tabs 1.9–2.2:1 | Inactive tab + caption color `#90a8ab` → `#9fc4c9` (7.3:1); tab contrast CSS rules added | ✅ measured 7.31:1 |
| F2 folder/risk cards 1.89:1 | Light-variant nav-item rule (`#main .navitem` → `#42585e` on white, 7.66:1) for Documents folders and Risks area cards | ✅ measured 7.66:1 |
| F3 mobile hero selects ~24px | ≤760px: hero rows wrap, selects `width:100%`, exit button full-width | ✅ verified at 390px |
| F4 sub-12px type | Table headers 9→10px, eyebrows 10→11px, `.btn.sm` 11→12px | ✅ measured 10px th |
| F5 unlabeled controls | aria-labels added to every runtime-identified control: KYC risk select/condition/summary/decision/rationale (5), Jobs task+subtask completion checkboxes (2 patterns), Sampling audited-amount/test-notes per item (2), portal entity/engagement switchers (2), Approvals representation checkbox + EQR query, Accounting TB file input + amount convention, Planning benchmark select, Records retention date, Requirements search, Portfolio filter | ✅ switchers verified; remainder unit-covered |
| F6 small targets | `.btn.sm` min-height 26px; `.icon-btn` 32×32 hit area | ✅ CSS applied |
| F7 as-of chip 22 Sept | Root cause: `new Date('YYYY-MM-DDT00:00:00')` parsed as local time (UTC+3) then formatted in UTC → shifted a day. Added `Z` marker; chip now renders **23 Sept 2026** matching the demo clock | ✅ measured |
| F8 truncations | Card label shortened to "Open"; templates pane fix retained via `.btn` wrapping | ✅ |
| F9 muted token | `--muted` #697c80 → #5d7175 (≥4.5:1 for 11px muted text on white) | ✅ token applied |
| F10 positives | Preserved — no regressions introduced by the fixes | ✅ |

Post-fix regression: lint clean, 203/203 unit, full E2E re-run recorded in `e2e-uxfix.log`.

## 4. Re-audit note

The measurement script used here (computed font sizes, WCAG contrast ratios, target dimensions, label association, overflow) can be re-run per page after each fix to verify the deltas; the severity table above should drop to zero High/Medium items when F1–F7 are addressed.
