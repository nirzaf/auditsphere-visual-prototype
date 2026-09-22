"""Browser-local role visualization checks. No backend/tenant/security certification.
Uses Chromium in-memory document rendering; browser-origin persistence and real downloads
are NOT verified by this suite. Install Playwright and set CHROMIUM_PATH for another host.
"""
import json,os,hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent
results=[]
def main():
 roles=json.loads((ROOT/'roles.json').read_text())
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':1512,'height':1000},device_scale_factor=1)
  page.set_default_timeout(7000)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content((ROOT/'legacy/index.html').read_text(),wait_until='load')
  def check(name,expr):
   ok=page.evaluate(expr) if isinstance(expr,str) else bool(expr)
   results.append({'test':name,'passed':bool(ok)})
   if not ok or len(results)%25==0:print(len(results),name,ok,flush=True)
   if not ok:raise AssertionError(name)
  def role(k):page.select_option('#role-select',k)
  def route(r):page.evaluate('(r)=>go(r)',r)
  def action(name,data=None):return page.evaluate('async ([n,d])=>await actions[n](d)',[name,data or {}])
  def deny(name,data=None):return page.evaluate('async ([n,d])=>{try{await actions[n](d);return false;}catch(e){return true;}}',[name,data or {}])
  def confirm():action('r-confirm')
  def fill(id,text):page.fill('#'+id,text)
  def reset():page.evaluate('state=seed();initRoleState();state.role="manager";ensureContext();ui.route="overview";render();')
  check('Exactly 14 role personas','Object.keys(ROLES).length===14')
  check('44 documented activity families','ROLE_PERMISSIONS.length===44')
  for k,r in roles.items():
   role(k)
   for path in r['routes']:
    route(path)
    check(k+' renders '+path,'ui.route==='+json.dumps(path)+' && document.querySelector("h1")!==null')
    check(k+' no desktop body overflow '+path,'document.documentElement.scrollWidth<=window.innerWidth')
   for forbidden in set(['accounting','compliance','administration','delivery','client-team','billing'])-set(r['routes']):
    page.evaluate('(r)=>go(r)',forbidden)
    check(k+' denied route '+forbidden,'ui.route==="overview"')
  reset()
  for k in ['client_admin','client_finance','client']:
   role(k);route('portal')
   check(k+' has no other client records','!["Northstar Services","Cedar Manufacturing","Harbor Logistics","RN-001","WP-C1"].some(s=>document.getElementById("main").textContent.includes(s))')
   check(k+' cannot open other client',deny('client-detail',{'id':'CL-003'}))
   check(k+' cannot issue report',deny('issue-release'))
  role('admin');check('Admin cannot authorize report',deny('package-approve',{'key':'partner'}));check('Admin cannot read financial workspace','!permission("financial.read")')
  role('preparer');check('Preparer cannot clear own review',deny('clear-note',{'id':'RN-001'}))
  role('client_finance');check('Contributor cannot approve management accounts',deny('r-management-approve'))
  role('client_admin');check('Client administrator cannot act as signatory',deny('r-management-approve'))
  # Independent intake handoff.
  role('onboarding');action('r-intake-open',{'id':'CASE-003'})
  for i in range(4):page.check('#intake-'+str(i))
  page.select_option('#intake-next','submit');confirm()
  check('Onboarding submits to separate compliance','rv().cases[1].stage==="Awaiting compliance"')
  role('partner');action('r-partner-case',{'id':'CASE-003'});page.select_option('#accept-decision','Accept');fill('accept-reason','Synthetic requested service reviewed.')
  check('Partner cannot bypass missing compliance',deny('r-confirm'));action('close-modal')
  role('compliance');action('r-compliance-open',{'id':'CASE-003'})
  for id in ['comp-identity','comp-conflicts','comp-open']:page.check('#'+id)
  page.select_option('#comp-decision','Recommend acceptance');fill('comp-reason','Synthetic evidence and applicable checks reviewed.');confirm()
  check('Compliance recommends but does not accept','rv().cases[1].stage==="Awaiting partner"')
  role('partner');action('r-partner-case',{'id':'CASE-003'});page.select_option('#accept-decision','Accept');fill('accept-reason','Permitted service and required independent clearances reviewed.');confirm()
  check('Distinct partner records acceptance','rv().cases[1].stage==="Accepted" && rv().cases[1].decisionBy!==rv().cases[1].reviewedBy')
  # Client role nomination never grants authority itself.
  role('client_admin');action('r-contact-new');fill('contact-name','Demo New Signatory');page.select_option('#contact-role','client');fill('contact-reason','Existing entity only, authority evidence required.');confirm()
  check('Nomination stays pending','rv().accessRequests.at(-1).state==="Pending verification"')
  rid=page.evaluate('rv().accessRequests.at(-1).id')
  role('admin');action('r-access-verify',{'id':rid});page.check('#access-entity');page.check('#access-identity');fill('access-reason','Synthetic authority reference.')
  check('Signatory authority check cannot be omitted',deny('r-confirm'))
  page.check('#access-signatory');confirm();check('Verified access request retains admin actor','rv().accessRequests.at(-1).state==="Approved in demo" && rv().accessRequests.at(-1).verifiedBy==="Ethan Reed"')
  # Office billing boundary and independent approval.
  role('billing');action('r-new-invoice');fill('new-inv-desc','Synthetic annual fee');fill('new-inv-amount','1500.00');confirm()
  iid=page.evaluate('state.invoices.at(-1).id');action('r-invoice-submit',{'id':iid})
  check('Billing cannot self-review',deny('r-review-invoice',{'id':iid}));check('Invoice cannot issue before independent review',deny('invoice-issue',{'id':iid}))
  role('manager');action('r-review-invoice',{'id':iid});fill('inv-review','Fee and scope verified within assigned commercial authority.');confirm()
  role('billing');action('invoice-issue',{'id':iid});check('Approved invoice issues','state.invoices.at(-1).status==="Issued"')
  before=page.evaluate('totals(state.engagements[0]).assets');action('invoice',{'id':iid});fill('receipt-amount','100.00');action('invoice-receipt',{'id':iid})
  check('Receipt affects only firm invoice',page.evaluate('state.invoices.at(-1).paid')==10000 and page.evaluate('totals(state.engagements[0]).assets')==before)
  # Full accounting/review/management/EQR/release handoff.
  reset()
  for note in ['RN-001','RN-002']:
   role('preparer');route('reviews');action('select-review',{'id':note});fill('review-response','Updated synthetic source evidence and corroboration for '+note);action('respond-note',{'id':note})
   role('reviewer');route('reviews');action('select-review',{'id':note});action('clear-note',{'id':note})
  check('Independent reviewer clears both submitted responses','allNotesClear() && allWorkClear()')
  role('preparer');route('accounting');action('build-package');check('Rebuilt package matches generation','E().builtGeneration===E().generation')
  role('manager');route('reviews');action('package-approve',{'key':'manager'});check('Manager approval current','isCurrent("manager")')
  action('r-eqr-response',{'id':'EQR-001'});fill('eqr-team-response','Technical evidence, rationale and revised source workpaper supplied.');confirm()
  role('client');route('client-approvals');action('r-management-approve');page.check('#mgmt-responsible');fill('mgmt-reason','Management accepts responsibility for this exact demo package.');confirm()
  action('r-representation');page.check('#rep-facts');fill('rep-reason','Synthetic representation for the presented package.');confirm()
  check('Management approval and representation are separate','isCurrent("client") && rv().representations[E().id].revision===E().packageRevision')
  role('partner');route('reviews');action('package-approve',{'key':'partner'});check('Incomplete required EQR blocks release',deny('prepare-release'))
  role('eqr');route('quality');action('r-eqr-eligibility');page.check('#eqr-independent');page.check('#eqr-competent');fill('eqr-eligibility-reason','Synthetic independent eligible reviewer.');confirm()
  action('r-eqr-concern',{'id':'EQR-001'});page.select_option('#eqr-disposition','Clear concern');fill('eqr-review','The team response supports the judgment for this sample.');confirm()
  action('r-eqr-complete');fill('eqr-complete-reason','Required significant judgments evaluated for the selected version.');confirm()
  check('EQR completion is exact-version bound','isCurrent("eqr")')
  role('partner');route('delivery');action('prepare-release');action('issue-release');check('One frozen release','E().releases.length===1 && E().releases[0].hash.length===64')
  action('issue-release');check('Repeat issue does not duplicate release','E().releases.length===1')
  release_id=page.evaluate('E().releases[0].id');action('demo-deliver',{'id':release_id});check('Delivery is separately recorded','E().releases[0].delivered===true')
  role('records');route('records');action('r-record-open',{'eng':'ENG-26001','id':release_id});action('archive');action('close-modal');check('Records assembly stays explicitly simulated','E().archive.status==="SIMULATION_ONLY_NO_PROVIDER_PROTECTION"')
  action('r-hold-open',{'eng':'ENG-26001'});fill('hold-reason','Synthetic legal-hold instruction, no provider effect.');confirm()
  action('r-hold-open',{'eng':'ENG-26001'});page.select_option('#hold-kind','Request disposition review');fill('hold-reason','Attempted test disposition.');check('Hold blocks disposition',deny('r-confirm'));action('close-modal')
  role('client');route('client-deliverables');check('Client sees delivered preview','document.getElementById("main").textContent.includes("REL-001")');check('Client cannot export internal release manifest',deny('release-export',{'id':release_id}));action('r-ack-delivery',{'id':release_id});check('Client acknowledgement recorded','!!rv().acknowledgements["ENG-26001/REL-001"]')
  frozen=page.evaluate('E().releases[0].artifact');role('preparer');route('accounting');action('source-change');check('Source change stales old approvals','!isCurrent("manager")&&!isCurrent("client")&&!isCurrent("partner")');check('Issued artifact remains preserved',page.evaluate('E().releases[0].artifact')==frozen)
  # A newly proposed adjustment needs independent technical review before consent.
  reset();role('preparer');route('accounting');action('revise-adjustment');fill('aj-amount','600.00');action('save-aj');check('Proposal is awaiting management','E().journalState==="Management pending"')
  role('client');action('r-journal-consent');fill('aj-consent-reason','Test management reason.');check('Management cannot bypass adjustment technical review',deny('r-confirm'));action('close-modal')
  role('reviewer');route('accounting');action('r-journal-review');fill('aj-check','Synthetic useful-life evidence and calculation checked.');confirm()
  role('client');action('r-journal-consent');fill('aj-consent-reason','Approved management reporting adjustment.');confirm();check('Reviewed adjustment applies once','E().journalState==="Applied" && E().adjustment===60000')
  # Disable behavior is only frontend simulation.
  role('admin');action('r-user-open',{'id':'reviewer'});page.select_option('#user-next','Disabled');fill('user-reason','Synthetic departure instruction.');confirm();role('reviewer');check('Disabled persona cannot use business action',deny('clear-note',{'id':'RN-001'}));check('Disabled persona sees suspension','document.getElementById("main").textContent.includes("Access suspended")')
  role('admin');action('r-user-open',{'id':'reviewer'});page.select_option('#user-next','Active');fill('user-reason','Synthetic approved restoration.');confirm()
  # All routes are checked again at mobile size.
  reset();page.set_viewport_size({'width':390,'height':844})
  for k,r in roles.items():
   role(k)
   for path in r['routes']:
    route(path);check(k+' no mobile body overflow '+path,'document.documentElement.scrollWidth<=window.innerWidth')
  check('No uncaught browser errors',errors==[])
  # Screenshots are captured separately; keep regression execution bounded.
  role('client_finance');route('overview');page.wait_for_timeout(250)
  check('Mobile sidebar fully off canvas when closed', 'document.getElementById("sidebar").getBoundingClientRect().right<=1')
  browser.close()
 return errors
if __name__=='__main__':
 error=None
 try: errors=main()
 except Exception as e:
  error=str(e);print('FAILED:',error)
 finally:
  payload={'tested_file_sha256':hashlib.sha256((ROOT/'legacy/index.html').read_bytes()).hexdigest(),'environment':'Chromium in-memory rendering using Playwright. Synthetic single-browser data only. No server/tenant tests.','passed':sum(t['passed'] for t in results),'failed':sum(not t['passed'] for t in results),'execution_error':error,'not_tested':['real authentication or authorization','provider integrations','browser-origin persistence','actual downloads/printing','production concurrency/security','legal signatures/retention'], 'results':results}
  (ROOT/'test-results.json').write_text(json.dumps(payload,indent=2))
  print('Checks:',payload['passed'],'passed;',payload['failed'],'failed')
 if error:raise SystemExit(1)
