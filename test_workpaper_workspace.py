"""Comprehensive verification suite for Audit Area Execution and Clearance Workspace.
Tests WP-A1 Cash & Bank lifecycle, 6 tabs, workbook uploads, evidence linking,
review notes, independent clearance, and source invalidation.
"""
import json, os, hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
results = []

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'),
            headless=True,
            args=['--no-sandbox']
        )
        page = browser.new_page(viewport={'width': 1512, 'height': 1000}, device_scale_factor=1)
        page.set_default_timeout(7000)
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.set_content((ROOT / 'legacy/index.html').read_text(), wait_until='load')

        def check(name, expr):
            ok = page.evaluate(expr) if isinstance(expr, str) else bool(expr)
            results.append({'test': name, 'passed': bool(ok)})
            print(f"[{'PASS' if ok else 'FAIL'}] {name}", flush=True)
            if not ok:
                raise AssertionError(name)

        def role(k):
            page.select_option('#role-select', k)

        def route(r):
            page.evaluate('(r)=>go(r)', r)

        def action(name, data=None):
            return page.evaluate('async ([n,d])=>await actions[n](d)', [name, data or {}])

        def deny(name, data=None):
            return page.evaluate('async ([n,d])=>{try{await actions[n](d);return false;}catch(e){return true;}}', [name, data or {}])

        def reset():
            page.evaluate('state=seed();initRoleState();state.role="manager";ensureContext();ui.route="overview";render();')

        print("=== Test Suite: Audit Area Workspace & Clearance Lifecycle ===")

        # 1. Initial seed state verification
        reset()
        check("Engagement seeded with 4 workpapers", "E().workpapers.length === 4")
        check("WP-A1 initially cleared in seed", "E().workpapers.find(w=>w.id==='WP-A1').status === 'Cleared'")
        check("WP-A1 has PBC-02 bank statement auto-linked", "E().workpapers.find(w=>w.id==='WP-A1').supportingEvidence.some(ev=>ev.pbcId==='PBC-02')")
        check("WP-A1 initial clearance is current", "isCurrentWorkpaperClearance(E().workpapers.find(w=>w.id==='WP-A1'))")
        check("Audit completion progress is calculated correctly", "auditWorkpaperProgress().total === 4 && auditWorkpaperProgress().cleared === 2 && auditWorkpaperProgress().percent === 50")

        # 2. Open Audit Workpapers route
        role('preparer')
        route('audit')
        check("Audit page displays WP progress card", "document.querySelector('.wp-progress-card') !== null")
        check("Audit completion metric shows 50%", "document.querySelector('.wp-progress-stat').textContent.includes('50%')")
        check("WP-A1 row has Workspace button", "document.querySelector('button[data-action=\"workpaper\"][data-id=\"WP-A1\"]') !== null")

        # 3. Open Workspace modal and verify tabs
        action('workpaper', {'id': 'WP-A1'})
        check("Workspace modal opens", "document.querySelector('.modal.xlarge') !== null")
        check("Modal contains 6 tabs", "document.querySelectorAll('.modal-tab').length === 6")

        # 4. Switch all 6 tabs
        for tab in ['overview', 'guidelines', 'workbook', 'evidence', 'clearance', 'history']:
            action('wp-tab', {'id': 'WP-A1', 'tab': tab})
            check(f"Switch to tab: {tab}", f"document.querySelector('.modal-tab.active[data-tab=\"{tab}\"]') !== null")

        # 5. Verify Audit Guidelines tab content
        action('wp-tab', {'id': 'WP-A1', 'tab': 'guidelines'})
        check("Guidelines mention ISA 500 and ISA 505", "document.querySelector('#modal-root').textContent.includes('ISA 500') && document.querySelector('#modal-root').textContent.includes('ISA 505')")
        check("Guidelines contain required procedures", "document.querySelector('#modal-root').textContent.includes('Substantive Audit Procedures')")

        # 6. Verify Approved Template download does NOT mark workpaper complete
        status_before = page.evaluate("E().workpapers.find(w=>w.id==='WP-A1').status")
        action('download-wp-template', {'id': 'WP-A1'})
        check("Template download keeps workpaper status unchanged", f"E().workpapers.find(w=>w.id==='WP-A1').status === '{status_before}'")

        # 7. Load completed sample schedule and verify version bump + clearance invalidation
        action('upload-wp-sample', {'id': 'WP-A1'})
        check("Sample schedule loads, bumping version to v3", "E().workpapers.find(w=>w.id==='WP-A1').version === 3")
        check("Status transitions to 'In progress'", "E().workpapers.find(w=>w.id==='WP-A1').status === 'In progress'")
        check("Clearance is cleared and moved to history", "E().workpapers.find(w=>w.id==='WP-A1').clearance === null && E().workpapers.find(w=>w.id==='WP-A1').clearanceHistory.length >= 1")
        check("Audit completion progress drops to 25%", "auditWorkpaperProgress().percent === 25")

        # 8. Evidence management: Link additional PBC request
        action('wp-link-pbc-confirm', {'wpid': 'WP-A1', 'pbcid': 'PBC-01'})
        check("PBC-01 linked to WP-A1", "E().workpapers.find(w=>w.id==='WP-A1').supportingEvidence.some(ev=>ev.pbcId==='PBC-01')")

        # 9. Evidence management: Attach direct sample confirmation
        action('wp-sample-evidence', {'id': 'WP-A1'})
        check("Sample direct confirmation attached", "E().workpapers.find(w=>w.id==='WP-A1').supportingEvidence.some(ev=>ev.title.includes('Direct Bank Confirmation'))")

        # 10. Evidence management: Unlink evidence
        ev_id = page.evaluate("E().workpapers.find(w=>w.id==='WP-A1').supportingEvidence.find(ev=>ev.pbcId==='PBC-01').id")
        action('wp-unlink-evidence', {'wpid': 'WP-A1', 'evid': ev_id})
        check("PBC-01 unlinked successfully", "!E().workpapers.find(w=>w.id==='WP-A1').supportingEvidence.some(ev=>ev.pbcId==='PBC-01')")

        # 11. Submit workpaper guards
        # Preparer submits with conclusion
        action('submit-wp', {'id': 'WP-A1'})
        check("Preparer submits WP-A1 (status becomes 'Submitted')", "E().workpapers.find(w=>w.id==='WP-A1').status === 'Submitted'")

        # 12. Role guard: Preparer cannot clear workpaper
        check("Preparer cannot clear workpaper", deny('clear-wp', {'id': 'WP-A1'}))

        # 13. Reviewer raises a review note on WP-A1
        role('reviewer')
        page.evaluate("""actions['wp-add-note']({id:'WP-A1'})""")
        page.fill('#rn-title', 'Verify bank confirmation sign-off date')
        page.fill('#rn-body', 'Ensure the confirmation letter date matches the balance sheet date exactly.')
        action('save-note')
        check("Review note created for WP-A1", "E().reviews.some(r=>r.wp==='WP-A1' && r.status==='Open')")
        check("WP-A1 status changes to 'Changes required'", "E().workpapers.find(w=>w.id==='WP-A1').status === 'Changes required'")

        # 14. Reviewer cannot clear while open review notes exist
        check("Reviewer cannot clear workpaper with open notes", deny('clear-wp', {'id': 'WP-A1'}))

        # 15. Preparer responds to the review note
        role('preparer')
        rn_id = page.evaluate("E().reviews.find(r=>r.wp==='WP-A1' && r.status==='Open').id")
        route('reviews')
        action('select-review', {'id': rn_id})
        page.fill('#review-response', 'Inspected bank confirmation letter. Signed on 31 Dec 2026. Attached direct corroboration.')
        action('respond-note', {'id': rn_id})
        check("Review note responded", f"E().reviews.find(r=>r.id==='{rn_id}').status === 'Responded'")
        check("Workpaper version bumped on response", "E().workpapers.find(w=>w.id==='WP-A1').version === 4")
        check("WP-A1 status back to 'Submitted'", "E().workpapers.find(w=>w.id==='WP-A1').status === 'Submitted'")

        # 16. Reviewer independently clears review note
        role('reviewer')
        action('clear-note', {'id': rn_id})
        check("Review note independently cleared", f"E().reviews.find(r=>r.id==='{rn_id}').status === 'Cleared'")

        # 17. Reviewer independently clears workpaper
        action('clear-wp', {'id': 'WP-A1'})
        check("WP-A1 cleared by senior reviewer", "E().workpapers.find(w=>w.id==='WP-A1').status === 'Cleared'")
        check("Clearance stamp recorded with reviewer and version", "E().workpapers.find(w=>w.id==='WP-A1').clearance.clearedBy === 'Sara Malik' && E().workpapers.find(w=>w.id==='WP-A1').clearance.version === 4")
        check("Clearance is current", "isCurrentWorkpaperClearance(E().workpapers.find(w=>w.id==='WP-A1'))")

        # 18. Source invalidation test: Trial balance source change
        role('preparer')
        route('accounting')
        action('source-change')
        check("Source version incremented", "E().sourceVersion === 2")
        check("WP-A1 clearance invalidated by source change", "E().workpapers.find(w=>w.id==='WP-A1').clearance === null")
        check("WP-A1 status set to 'Changes required'", "E().workpapers.find(w=>w.id==='WP-A1').status === 'Changes required'")
        check("WP-A1 clearance history contains the invalidated clearance", "E().workpapers.find(w=>w.id==='WP-A1').clearanceHistory.length >= 2")
        check("Audit progress dropped due to stale clearance", "auditWorkpaperProgress().cleared === 0 && auditWorkpaperProgress().percent === 0")

        # 19. Verify Workpaper Lineage & Audit UI renders stale badge
        route('audit')
        check("Stale/changes required badge renders in table", "document.querySelector('#main').textContent.includes('Changes required')")

        # 20. Toggle workpaper applicability
        action('toggle-wp-applicable', {'id': 'WP-F1'})
        check("WP-F1 toggled to not applicable", "E().workpapers.find(w=>w.id==='WP-F1').applicable === false")
        check("Progress calculates over applicable workpapers only (3 total)", "auditWorkpaperProgress().applicable === 3")

        browser.close()
        print("\n=== All 20 Workspace Acceptance Checks Passed Successfully! ===")
        return errors

if __name__ == '__main__':
    error = None
    try:
        errors = main()
    except Exception as e:
        error = str(e)
        print('FAILED:', error)
    finally:
        payload = {
            'suite': 'Audit Area Execution and Clearance Workspace',
            'passed': sum(t['passed'] for t in results),
            'failed': sum(not t['passed'] for t in results),
            'execution_error': error,
            'results': results
        }
        (ROOT / 'test_workpaper_workspace_results.json').write_text(json.dumps(payload, indent=2))
        print(f"Final summary: {payload['passed']} passed; {payload['failed']} failed")
    if error:
        raise SystemExit(1)
