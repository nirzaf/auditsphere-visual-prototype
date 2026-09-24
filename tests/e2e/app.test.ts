// VP-063: static smoke checks plus real Chrome route and local-action checks.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, Server, IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync, existsSync, readdirSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawn, ChildProcess } from 'node:child_process';
import * as XLSX from 'xlsx';
import { calculateRecordedWipValue, calculateReceivablesAging, formatCurrency, formatMinutesToHours } from '../../src/services/calculations.js';
import { visibleClientIds, visibleEngagementIds } from '../../src/services/guards.js';
import { createInitialState } from '../../src/store/initialState.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const dist = join(repoRoot, 'dist');

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.map': 'application/json'
};

let server: Server;
let baseUrl = '';
let browserDebugPort = '';
let chrome: ChildProcess | undefined;
let profileDir = '';
let browserTab: CdpTab | undefined;

class CdpTab {
  private seq = 0;
  private pending = new Map<number, (message: any) => void>();
  readonly requests: string[] = [];
  readonly blockedExternalRequests: string[] = [];
  readonly exceptions: string[] = [];

  constructor(private ws: WebSocket, private allowedOrigin: string) {
    ws.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (message.method === 'Network.requestWillBeSent') this.requests.push(message.params.request.url);
      if (message.method === 'Fetch.requestPaused') {
        const url = message.params.request.url as string;
        let sameOrigin = false;
        try { sameOrigin = new URL(url).origin === this.allowedOrigin; } catch {}
        if (!sameOrigin) this.blockedExternalRequests.push(url);
        void this.command(sameOrigin ? 'Fetch.continueRequest' : 'Fetch.failRequest', sameOrigin
          ? { requestId: message.params.requestId }
          : { requestId: message.params.requestId, errorReason: 'BlockedByClient' })
          .catch(error => this.exceptions.push(String(error)));
      }
      if (message.method === 'Runtime.exceptionThrown') this.exceptions.push(message.params.exceptionDetails.text || 'browser exception');
      if (message.id) this.pending.get(message.id)?.(message);
      if (message.id) this.pending.delete(message.id);
    });
  }

  async command(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const id = ++this.seq;
    const response = new Promise<any>(resolve => this.pending.set(id, resolve));
    this.ws.send(JSON.stringify({ id, method, params }));
    const message = await response;
    if (message.error) throw new Error(`${method}: ${message.error.message}`);
    return message.result;
  }

  async evaluate<T = unknown>(expression: string): Promise<T> {
    const result = await this.command('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true, userGesture: true
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'JavaScript evaluation failed');
    return result.result.value as T;
  }

  async blockExternalHttp(): Promise<void> {
    await this.command('Fetch.enable', { patterns: [{ urlPattern: 'http://*/*' }, { urlPattern: 'https://*/*' }] });
  }

  close() { this.ws.close(); }
}

function serve() {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    let file = join(dist, urlPath === '/' ? 'index.html' : urlPath.slice(1));
    try {
      if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) {
        file = join(dist, 'index.html'); // SPA fallback
      }
      const body = readFileSync(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
}

before(async () => {
  assert.ok(existsSync(join(dist, 'index.html')), 'dist/index.html missing — run npm run build first');
  server = serve();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;

  const chromePath = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']
    .find(path => existsSync(path));
  assert.ok(chromePath, 'Chrome/Chromium is required for actual browser acceptance');
  profileDir = mkdtempSync(join(tmpdir(), 'auditsphere-e2e-'));
  chrome = spawn(chromePath, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--remote-debugging-port=0', '--remote-allow-origins=*', `--user-data-dir=${profileDir}`,
    '--no-first-run', '--no-default-browser-check', 'about:blank'
  ], { stdio: 'ignore' });
  const activePortPath = join(profileDir, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 100 && !existsSync(activePortPath); attempt++) {
    if (chrome.exitCode !== null) throw new Error(`Chrome exited with code ${chrome.exitCode}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(existsSync(activePortPath), 'Chrome remote debugging endpoint did not start');
  const [debugPort] = readFileSync(activePortPath, 'utf8').trim().split('\n');
  browserDebugPort = debugPort;
  let target: any;
  for (let attempt = 0; attempt < 50; attempt++) {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' }).catch(() => null);
    if (response?.ok) { target = await response.json(); break; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(target?.webSocketDebuggerUrl, 'Chrome page target did not start');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true });
    ws.addEventListener('error', () => reject(new Error('Could not connect to Chrome DevTools')), { once: true });
  });
  browserTab = new CdpTab(ws, new URL(baseUrl).origin);
  await browserTab.command('Page.enable');
  await browserTab.command('Runtime.enable');
  await browserTab.command('Network.enable');
  await browserTab.blockExternalHttp();
  await browserTab.command('Page.navigate', { url: baseUrl });
  const ready = await waitForBrowser('document.querySelector("#app-root .brandname")?.innerText.includes("Audit")');
  assert.equal(ready, true, 'React shell did not render in Chrome');
});

after(async () => {
  browserTab?.close();
  if (chrome?.exitCode === null) {
    const exited = new Promise<void>(resolve => chrome!.once('exit', () => resolve()));
    chrome.kill('SIGTERM');
    if (chrome.exitCode === null) await exited;
  }
  if (profileDir) rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  await new Promise<void>(resolve => server.close(() => resolve()));
});

async function waitForBrowser(expression: string, timeoutMs = 8000, tab = browserTab!): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await tab.evaluate<boolean>(expression).catch(() => false)) return true;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return false;
}

async function clickButton(label: string): Promise<void> {
  const found = await browserTab!.evaluate<boolean>(`(() => {
    const b = [...document.querySelectorAll("button")].find(x => x.innerText.trim() === ${JSON.stringify(label)});
    if (!b) return false; b.click(); return true;
  })()`);
  assert.equal(found, true, `button not found: ${label}`);
  await new Promise(resolve => setTimeout(resolve, 150));
}

async function clickButtonStartingWith(label: string): Promise<void> {
  const found = await browserTab!.evaluate<boolean>(`(() => {
    const b = [...document.querySelectorAll("button")].find(x => x.innerText.trim().startsWith(${JSON.stringify(label)}));
    if (!b) return false; b.click(); return true;
  })()`);
  assert.equal(found, true, `button not found starting with: ${label}`);
  await new Promise(resolve => setTimeout(resolve, 150));
}

async function clickPanelButton(heading: string, label: string): Promise<void> {
  const found = await browserTab!.evaluate<boolean>(`(() => {
    const title = [...document.querySelectorAll('h3')].find(x => x.innerText.toLowerCase().includes(${JSON.stringify(heading.toLowerCase())}));
    const panel = title?.closest('.panel');
    const button = [...(panel?.querySelectorAll('button') || [])].find(x => x.innerText.trim() === ${JSON.stringify(label)});
    if (!button || button.disabled) return false;
    button.click(); return true;
  })()`);
  assert.equal(found, true, `panel button not found or disabled: ${heading} / ${label}`);
  await new Promise(resolve => setTimeout(resolve, 150));
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted && ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
    else if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === ',') { row.push(field); field = ''; }
    else if (!quoted && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

describe('vite build serves locally', () => {
  it('AT-01: entrypoint boots the React shell with empty-state-safe markup', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('id="root"'), 'missing React root host');
    assert.ok(html.includes('assets/'), 'missing Vite asset reference');
  });

  it('AT-04: served bundle advertises no excluded product surface', async () => {
    const html = await fetch(`${baseUrl}/`).then(r => r.text());
    const assetRefs = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1]);
    assert.ok(assetRefs.length > 0, 'expected bundled scripts');
    const forbidden = ['purview', 'stripe', 'paypal', 'docusign', 'openai', 'power-bi', 'zapier'];
    for (const ref of assetRefs) {
      const js = await fetch(`${baseUrl}/${ref.replace(/^\.\//, '')}`).then(r => r.text());
      for (const word of forbidden) {
        // Allow explicit "not in product" disclaimers (case-insensitive context).
        const hits = js.split(word);
        if (hits.length > 1) {
          const ctx = js.toLowerCase();
          const idx = ctx.indexOf(word);
          const snippet = ctx.slice(Math.max(0, idx - 120), idx + 120);
          assert.ok(/not |no |without|exclud|never|historical/.test(snippet), `bundle markets excluded surface "${word}": ...${snippet.slice(0, 80)}...`);
        }
      }
    }
  });

  it('AT-03: no external Microsoft/mail/payment/AI egress is baked into markup', async () => {
    const html = await fetch(`${baseUrl}/`).then(r => r.text());
    const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/i)?.[1];
    assert.ok(csp, 'the built app must ship a Content Security Policy');
    assert.match(csp, /(?:^|;\s*)connect-src 'self'(?:;|$)/, 'runtime connections must stay same-origin');
    assert.match(csp, /(?:^|;\s*)default-src 'self'(?:;|$)/, 'unspecified resource types must stay same-origin');
    const egressHosts = [
      'graph.microsoft.com', 'login.microsoftonline.com', 'outlook.office',
      'api.stripe.com', 'paypal.com', 'openai.com', 'api.anthropic.com'
    ];
    for (const host of egressHosts) {
      assert.equal(html.includes(host), false, `entrypoint references external host ${host}`);
    }
  });

  it('AT-15/AT-25: static shell references the simulated M365 + portal surfaces', async () => {
    // Route registry ships inside the bundle; assert the built JS contains the
    // simulated surface keys (never live endpoints).
    const html = await fetch(`${baseUrl}/`).then(r => r.text());
    const assetRefs = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1]);
    let bundle = '';
    for (const ref of assetRefs) {
      bundle += await fetch(`${baseUrl}/${ref.replace(/^\.\//, '')}`).then(r => r.text());
    }
    assert.ok(bundle.includes('m365-setup'), 'missing M365 setup surface');
    assert.ok(bundle.includes('liveConnected'), 'missing liveConnected=false honesty marker');
    assert.ok(bundle.includes('portal'), 'missing client portal surface');
  });

  it('VP-064: prototype docs ship alongside the build evidence', () => {
    for (const doc of ['scope.md', 'baseline.md', 'module-coverage.md', 'demo-scenarios.md', 'verification.md']) {
      assert.ok(existsSync(join(repoRoot, 'docs/prototype', doc)), `missing docs/prototype/${doc}`);
    }
    void readdirSync;
  });
});

describe('actual Chrome browser acceptance', { concurrency: false }, () => {
  it('AT-01/AT-03/AT-04: renders the app, keeps controls local, and presents scope disclosures', async () => {
    assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /SIMULATED IDENTITY \(NOT LIVE AUTH\)/);
    assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /Synthetic records\. No live external integrations/);
    assert.deepEqual(browserTab!.exceptions, []);
    assert.ok(browserTab!.requests.length > 0, 'Chrome should request same-origin app assets');
    const external = browserTab!.requests.filter(url => /^https?:/i.test(url) && !url.startsWith(baseUrl));
    assert.deepEqual(external, [], `unexpected browser egress: ${external.join(', ')}`);
  });

  it('VP-005: scopes dashboard records, metrics, attention and activity to the active grant', async () => {
    await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2',${JSON.stringify(JSON.stringify(createInitialState()))})`);
    await browserTab!.command('Page.reload');
    assert.equal(await waitForBrowser('!!document.querySelector("#role-select")'), true);
    await browserTab!.evaluate(`(() => {const role=document.querySelector('#role-select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(role,'group-user');role.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentUserId==='group-user'`), true);
    await browserTab!.evaluate(`(() => {const key='ste-auditsphere-role-portals-v2';const s=JSON.parse(localStorage.getItem(key));s.selectedEngagement='ENG-26002';s.events.unshift({type:'message',text:'PRIVATE-SIBLING-ACTIVITY',ref:'ENG-26002',time:s.asOfDate});s.jobs.push({id:'JOB-PRIVATE-26002',clientId:'CL-002',engagementId:'ENG-26002',title:'PRIVATE-SIBLING-JOB',owner:'Layla Rahman',dueDate:s.asOfDate,status:'In progress',createdAt:s.asOfDate+'T00:00:00.000Z'});s.jobTasks.push({id:'TSK-PRIVATE-26002',jobId:'JOB-PRIVATE-26002',title:'PRIVATE-SIBLING-TASK',assignee:'Layla Rahman',status:'Not started',order:1});localStorage.setItem(key,JSON.stringify(s));location.reload();})()`);
    assert.equal(await waitForBrowser(`document.querySelector('.crumb')?.innerText.includes('OVERVIEW')`), true, 'narrow persona opens its permitted dashboard');
    const narrow = await browserTab!.evaluate<any>(`(() => ({rows:[...document.querySelectorAll('.panel table tbody tr')].map(r=>r.innerText),metrics:[...document.querySelectorAll('.metric')].map(x=>x.innerText),body:document.body.innerText}))()`);
    assert.equal(narrow.rows.length, 1, `portfolio contains only the one granted engagement: ${JSON.stringify(narrow)}`);
    assert.ok(narrow.rows[0].includes('ENG-26001'));
    assert.equal(narrow.rows.some((row: string) => row.includes('ENG-26002')), false);
    assert.equal(narrow.metrics[0].match(/\n(\d+)\n/)?.[1], '1', 'active engagement count is scoped');
    assert.equal(narrow.metrics[0].includes('1 permitted client'), true, 'client count is scoped');
    assert.equal(narrow.body.includes('PRIVATE-SIBLING-ACTIVITY'), false, 'sibling activity is hidden');
    assert.equal(narrow.body.includes('ENG-26002'), false, 'selected sibling is replaced with a permitted engagement');
    await browserTab!.evaluate(`(() => {const key='ste-auditsphere-role-portals-v2';const s=JSON.parse(localStorage.getItem(key));s.jobs.push({id:'JOB-OVERDUE-26001',clientId:'CL-001',engagementId:'ENG-26001',title:'OVERDUE-OPEN-JOB',owner:'Layla Rahman',dueDate:'2026-09-22',status:'In progress',createdAt:'2026-09-01T00:00:00.000Z'},{id:'JOB-COMPLETE-26001',clientId:'CL-001',engagementId:'ENG-26001',title:'COMPLETED-OLD-JOB',owner:'Layla Rahman',dueDate:'2026-09-20',status:'Completed',createdAt:'2026-09-01T00:00:00.000Z'});s.jobTasks.push({id:'TSK-OVERDUE-26001',jobId:'JOB-OVERDUE-26001',title:'OVERDUE-OPEN-TASK',assignee:'Layla Rahman',status:'Not started',dueDate:'2026-09-22',order:1},{id:'TSK-COMPLETE-26001',jobId:'JOB-OVERDUE-26001',title:'COMPLETED-OLD-TASK',assignee:'Layla Rahman',status:'Completed',dueDate:'2026-09-20',order:2});s.engagements.find(e=>e.id==='ENG-26001').pbc.push({id:'PBC-OVERDUE-26001',title:'OVERDUE-OPEN-REQUEST',status:'Requested',due:'2026-09-22',owner:'Omar Nasser'});localStorage.setItem(key,JSON.stringify(s));location.reload();})()`);
    assert.equal(await waitForBrowser(`document.querySelector('[aria-label^="Overdue Work"]')?.getAttribute('aria-label').includes('3.')`), true, 'overdue count includes open job, task, and PBC due before the fixed as-of date');
    await browserTab!.evaluate(`document.querySelector('[aria-label^="Overdue Work"]')?.click()`);
    assert.equal(await waitForBrowser(`document.body.innerText.includes('Filtered work list')`), true, 'overdue metric opens its working list');
    const overdueRows = await browserTab!.evaluate<string>(`[...document.querySelectorAll('.panel')].find(p=>p.innerText.includes('Filtered work list'))?.innerText||'FILTERED LIST NOT FOUND'`);
    assert.ok(overdueRows.includes('OVERDUE-OPEN-JOB')&&overdueRows.includes('OVERDUE-OPEN-TASK')&&overdueRows.includes('OVERDUE-OPEN-REQUEST')&&!overdueRows.includes('COMPLETED-OLD'), `overdue drill-down reconciles and excludes completed records: ${overdueRows}`);
    await browserTab!.evaluate(`(() => {const el=document.querySelector('[aria-label="Dashboard assignee filter"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,'Layla Rahman');el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`document.querySelector('[aria-label^="Overdue Work"]')?.getAttribute('aria-label').includes('2.')`), true, 'assignee filter recalculates overdue work');
    await browserTab!.evaluate(`(() => {const el=document.querySelector('[aria-label="Dashboard assignee filter"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,'ALL');el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await browserTab!.evaluate(`(() => {const el=document.querySelector('[aria-label="Dashboard as-of date"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'2026-09-22');el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`document.querySelector('[aria-label^="Overdue Work"]')?.getAttribute('aria-label').includes('Overdue Work: 0.')`), true, 'selectable as-of date recalculates overdue items at the inclusive date boundary');
    await browserTab!.evaluate(`(() => {const el=document.querySelector('[aria-label="Dashboard as-of date"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'2026-09-23');el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`document.querySelector('[aria-label^="Overdue Work"]')?.getAttribute('aria-label').includes('Overdue Work: 3.')`), true, 'overdue count returns when the as-of date moves forward');
    await browserTab!.evaluate(`document.querySelector('[aria-label^="Overdue Work"]')?.click()`);
    await clickButtonStartingWith('Jobs & Tasks');
    assert.equal(await waitForBrowser(`document.querySelector('.crumb')?.innerText.includes('JOBS')`), true, 'scoped jobs route opened');
    const narrowJobs = await browserTab!.evaluate<string>('document.body.innerText');
    assert.equal(narrowJobs.includes('PRIVATE-SIBLING-JOB'), false, 'sibling jobs are excluded from the register');
    assert.equal(narrowJobs.includes('PRIVATE-SIBLING-TASK'), false, 'sibling tasks are excluded from the workspace');
    await browserTab!.evaluate(`(() => {const key='ste-auditsphere-role-portals-v2';const s=JSON.parse(localStorage.getItem(key));s.currentUserId='manager';s.currentPerson='Layla Rahman';s.currentRole='manager';s.selectedEngagement='ENG-26001';localStorage.setItem(key,JSON.stringify(s));location.reload();})()`);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentUserId==='manager'`), true);
    assert.equal(await waitForBrowser(`document.querySelector('.panel table tbody')?.innerText.includes('ENG-26002')`), true, 'global manager dashboard has loaded');
    const globalRows = await browserTab!.evaluate<string[]>(`[...document.querySelectorAll('.panel table tbody tr')].map(r=>r.innerText)`);
    assert.ok(globalRows.length > 1, 'global manager retains the full portfolio');
    assert.ok(globalRows.some(row => row.includes('ENG-26002')));
    const setDashboardFilter = (label: string, value: string) => browserTab!.evaluate(`(() => {const select=document.querySelector('[aria-label="${label}"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,${JSON.stringify(value)});select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await setDashboardFilter('Dashboard period filter','2025');
    assert.equal(await waitForBrowser(`document.querySelector('[aria-label^="Active Engagements"]')?.getAttribute('aria-label').includes('Active Engagements: 1.')`), true, 'period filter narrows the engagement metric');
    assert.equal(await browserTab!.evaluate<string>(`document.querySelector('.panel table tbody')?.innerText.includes('ENG-26003')`), true, 'period filter shows its matching engagement');
    await setDashboardFilter('Dashboard period filter','ALL');
    await setDashboardFilter('Dashboard client filter','CL-001');
    assert.equal(await waitForBrowser(`document.querySelector('.panel table tbody')?.innerText.includes('ENG-26001')&&document.querySelector('.panel table tbody')?.innerText.includes('ENG-26003')`), true, 'client filter shows only that client engagements');
    await setDashboardFilter('Dashboard client filter','ALL');
    await setDashboardFilter('Dashboard engagement filter','ENG-26002');
    assert.equal(await waitForBrowser(`document.querySelector('[aria-label^="Active Engagements"]')?.getAttribute('aria-label').includes('Active Engagements: 1.')`), true, 'engagement filter recalculates the dashboard metric');
    assert.equal(await browserTab!.evaluate<string>(`document.querySelector('.panel table tbody')?.innerText.includes('ENG-26002')`), true, 'engagement filter shows its selected record');
    await setDashboardFilter('Dashboard engagement filter','ALL');
    const readyDrilldown = await browserTab!.evaluate<any>(`(() => {const card=document.querySelector('[aria-label^="Ready to Release"]');const value=Number(card.querySelector('.metric-value').innerText);card.click();const panel=[...document.querySelectorAll('.panel')].find(x=>x.innerText.includes('Filtered work list'));const rows=[...(panel?.querySelectorAll('tbody tr')||[])].filter(row=>!row.innerText.includes('No matching records.'));return {value,rows:rows.map(row=>row.innerText),summary:panel?.innerText};})()`);
    assert.equal(readyDrilldown.rows.length, readyDrilldown.value, `ready metric and drill-down must reconcile: ${JSON.stringify(readyDrilldown)}`);
    assert.equal(await browserTab!.evaluate<boolean>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const rows=[...document.querySelectorAll('.panel')].find(x=>x.innerText.includes('Filtered work list'))?.querySelectorAll('tbody tr')||[];return [...rows].filter(r=>!r.innerText.includes('No matching records.')).every(r=>{const id=r.innerText.match(/ENG-\\d+/)?.[0];const e=s.engagements.find(x=>x.id===id);return e&&e.workpapers.length>0&&e.workpapers.every(w=>w.status==='Cleared')&&e.reviews.every(x=>x.status==='Cleared');});})()`), true, 'ready list contains only engagements with fully cleared workpapers and reviews');
    await browserTab!.evaluate(`document.querySelector('[aria-label^="Ready to Release"]')?.click()`);
    assert.equal(await browserTab!.evaluate<boolean>(`document.body.innerText.includes('Billing & Receivables')`), true, 'manager sees financial dashboard summaries');
    await browserTab!.evaluate(`(() => {const select=document.querySelector('#role-select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'preparer');select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentRole==='preparer'`), true);
    assert.equal(await browserTab!.evaluate<boolean>(`!document.body.innerText.includes('Billing & Receivables')`), true, 'preparer cannot see financial dashboard summaries');
    await browserTab!.evaluate(`(() => {const select=document.querySelector('#role-select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'manager');select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentRole==='manager'`), true);
    await clickButtonStartingWith('Jobs & Tasks');
    assert.equal(await waitForBrowser(`document.body.innerText.includes('PRIVATE-SIBLING-JOB')`), true, 'global manager retains the full job register');

    const roleViewState = await browserTab!.evaluate<string>(`localStorage.getItem('ste-auditsphere-role-portals-v2') || ''`);
    try {
      const selectPersona = async (userId: string) => browserTab!.evaluate(`(() => {const select=document.querySelector('#role-select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,${JSON.stringify(userId)});select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await selectPersona('partner');
      assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentRole==='partner'`), true);
      await clickButtonStartingWith('Practice Overview');
      assert.equal(await browserTab!.evaluate<boolean>(`document.querySelector('main#main')?.innerText.includes('Billing & Receivables')`), true, 'partner sees practice finance summaries');
      assert.equal(await browserTab!.evaluate<string>(`document.querySelector('[aria-label^="Active Engagements"]')?.getAttribute('aria-label').match(/Active Engagements: (\\d+)/)?.[1]||''`), '3', 'partner dashboard includes all permitted engagements');

      await selectPersona('billing');
      assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentRole==='billing'`), true);
      await clickButtonStartingWith('Practice Overview');
      assert.equal(await browserTab!.evaluate<boolean>(`document.querySelector('main#main')?.innerText.includes('Billing & Receivables')`), true, 'billing persona receives financial summaries');

      await selectPersona('records');
      assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentRole==='records'`), true);
      await clickButtonStartingWith('Practice Overview');
      assert.equal(await browserTab!.evaluate<boolean>(`!document.querySelector('main#main')?.innerText.includes('Billing & Receivables')`), true, 'records persona does not receive finance summaries');

      await browserTab!.evaluate(`(() => {const key='ste-auditsphere-role-portals-v2';const state=JSON.parse(localStorage.getItem(key));state.roleGrants=state.roleGrants.filter(grant=>grant.userId!=='billing');state.roleGrants.push({userId:'billing',role:'billing',scopeKind:'Engagement',scopeId:'ENG-26001'});state.selectedEngagement='ENG-26002';localStorage.setItem(key,JSON.stringify(state));location.reload();})()`);
      assert.equal(await waitForBrowser('!!document.querySelector("#role-select")'), true);
      await selectPersona('billing');
      assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentUserId==='billing'`), true);
      assert.equal(await browserTab!.evaluate<boolean>(`document.querySelector('.crumb')?.innerText.includes('OVERVIEW')`), true);
      const scopedBilling = await browserTab!.evaluate<any>(`(() => ({body:document.querySelector('main#main')?.innerText||'',engagements:document.querySelector('[aria-label^="Active Engagements"]')?.getAttribute('aria-label')}))()`);
      assert.ok(scopedBilling.engagements?.includes('Active Engagements: 1.'), `narrow billing count is scoped: ${scopedBilling.engagements}`);
      assert.equal(scopedBilling.body.includes('ENG-26002'), false, 'narrow billing dashboard contains no sibling engagement identifiers');
      assert.equal(scopedBilling.body.includes('PRIVATE-SIBLING-JOB'), false, 'narrow billing dashboard contains no sibling jobs');
    } finally {
      await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2',${JSON.stringify(roleViewState)})`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
    }
    const emptyState = createInitialState() as any;
    emptyState.roleGrants = emptyState.roleGrants.filter((grant: any) => grant.userId !== 'manager');
    emptyState.roleGrants.push({ userId: 'manager', role: 'manager', scopeKind: 'Client', scopeId: 'CL-003' });
    emptyState.selectedEngagement = 'ENG-26001';
    try {
      await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2',${JSON.stringify(JSON.stringify(emptyState))})`);
      await browserTab!.command('Page.reload');
      assert.equal(await waitForBrowser('!!document.querySelector("#role-select")'), true);
      const emptyDashboard = await browserTab!.evaluate<any>(`(() => ({body:document.querySelector('main#main')?.innerText||'',metrics:[...document.querySelectorAll('.metric')].map(x=>({name:x.querySelector('.metric-top')?.innerText,value:x.querySelector('.metric-value')?.innerText,aria:x.getAttribute('aria-label')}))}))()`);
      assert.equal(emptyDashboard.metrics.length, 6);
      assert.ok(emptyDashboard.metrics.every((item: any) => item.value === '0'), `empty scope reports zero for all six metrics: ${JSON.stringify(emptyDashboard.metrics)}`);
      assert.equal(emptyDashboard.body.includes('ENG-26001'), false, 'stale out-of-scope engagement selection is not exposed');
      assert.match(emptyDashboard.body, /No open tasks assigned to you in this scope/);
      assert.match(emptyDashboard.body, /No jobs in this scope/);
      assert.match(emptyDashboard.body, /No recent client activity in this scope/);
      await browserTab!.evaluate(`document.querySelector('[aria-label^="Active Engagements"]')?.click()`);
      assert.equal(await waitForBrowser(`[...document.querySelectorAll('.panel')].some(panel=>panel.innerText.includes('Filtered work list')&&panel.innerText.includes('0 record(s)')&&panel.innerText.includes('No matching records.'))`), true, 'zero-count drill-down remains an explicit empty list');
    } finally {
      await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2',${JSON.stringify(roleViewState)})`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
    }
    const deniedState = createInitialState() as any;
    deniedState.roleGrants = deniedState.roleGrants.filter((grant: any) => grant.userId !== 'manager');
    deniedState.selectedEngagement = 'ENG-26001';
    try {
      await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2',${JSON.stringify(JSON.stringify(deniedState))})`);
      await browserTab!.command('Page.reload');
      assert.equal(await waitForBrowser('!!document.querySelector("#role-select")'), true);
      const deniedDashboard = await browserTab!.evaluate<any>(`(() => ({body:document.querySelector('main#main')?.innerText||'',metrics:[...document.querySelectorAll('.metric')].map(x=>({value:x.querySelector('.metric-value')?.innerText,aria:x.getAttribute('aria-label')}))}))()`);
      assert.equal(deniedDashboard.metrics.length, 6);
      assert.ok(deniedDashboard.metrics.every((item: any) => item.value === '0'), `ungranted manager receives zero metrics: ${JSON.stringify(deniedDashboard.metrics)}`);
      assert.equal(deniedDashboard.body.includes('ENG-26001'), false, 'ungranted manager cannot see stale engagement data');
      assert.match(deniedDashboard.body, /No open tasks assigned to you in this scope/);
      assert.match(deniedDashboard.body, /No jobs in this scope/);
      assert.match(deniedDashboard.body, /No recent client activity in this scope/);
    } finally {
      await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2',${JSON.stringify(roleViewState)})`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
    }
    const terminalState = createInitialState() as any;
    terminalState.roleGrants = terminalState.roleGrants.filter((grant: any) => grant.userId !== 'manager');
    terminalState.roleGrants.push({ userId: 'manager', role: 'manager', scopeKind: 'Engagement', scopeId: 'ENG-26001' });
    terminalState.currentUserId = 'manager';
    terminalState.currentRole = 'manager';
    terminalState.currentPerson = 'Layla Rahman';
    terminalState.asOfDate = '2026-09-23';
    terminalState.selectedEngagement = 'ENG-26001';
    const terminalJob = terminalState.jobs.find((job: any) => job.id === 'JOB-2601');
    terminalJob.status = 'Blocked';
    terminalJob.blockedReason = 'Waiting for client evidence';
    terminalJob.dueDate = '2026-09-22';
    for (const [id, status] of [['TSK-101', 'Completed'], ['TSK-102', 'Cancelled'], ['TSK-103', 'Blocked']]) {
      const task = terminalState.jobTasks.find((item: any) => item.id === id);
      task.status = status;
      task.assignee = 'Layla Rahman';
      task.dueDate = '2026-09-22';
      if (status === 'Blocked') task.blockedReason = 'Waiting for client evidence';
    }
    try {
      await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2',${JSON.stringify(JSON.stringify(terminalState))})`);
      await browserTab!.command('Page.reload');
      assert.equal(await waitForBrowser('!!document.querySelector("#role-select")'), true);
      const terminalMetrics = await browserTab!.evaluate<any>(`(() => Object.fromEntries([...document.querySelectorAll('.metric')].map(x=>[x.querySelector('.metric-top')?.innerText,Number(x.querySelector('.metric-value')?.innerText)])))()`);
      assert.equal(terminalMetrics['My Open Tasks'], 1, `completed/cancelled tasks are excluded while blocked work remains open: ${JSON.stringify(terminalMetrics)}`);
      assert.equal(terminalMetrics['Overdue Work'], 2, `only blocked past-due job and task contribute to overdue count: ${JSON.stringify(terminalMetrics)}`);
      await browserTab!.evaluate(`document.querySelector('[aria-label^="My Open Tasks"]')?.click()`);
      const openTaskList = await browserTab!.evaluate<string>(`[...document.querySelectorAll('.panel')].find(panel=>panel.innerText.includes('Filtered work list'))?.innerText||''`);
      assert.match(openTaskList, /TSK-103/);
      assert.doesNotMatch(openTaskList, /TSK-101|TSK-102/);
      await browserTab!.evaluate(`document.querySelector('[aria-label^="My Open Tasks"]')?.click();document.querySelector('[aria-label^="Overdue Work"]')?.click()`);
      const overdueList = await browserTab!.evaluate<string>(`[...document.querySelectorAll('.panel')].find(panel=>panel.innerText.includes('Filtered work list'))?.innerText||''`);
      assert.match(overdueList, /JOB-2601/);
      assert.match(overdueList, /TSK-103/);
      assert.doesNotMatch(overdueList, /TSK-101|TSK-102/);
    } finally {
      await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2',${JSON.stringify(roleViewState)})`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
    }
    const archivedState = createInitialState() as any;
    const archivedEngagement = archivedState.engagements.find((item: any) => item.id === 'ENG-26001');
    archivedEngagement.archive = { archivedAt: '2026-09-23T12:00:00.000Z', archivedBy: 'Layla Rahman', releaseId: 'REL-ARCHIVED-DASHBOARD', manifest: [], artifacts: [] };
    archivedEngagement.reviews.forEach((item: any) => { item.status = 'Cleared'; });
    archivedEngagement.pbc.forEach((item: any) => { item.status = 'Accepted'; });
    archivedEngagement.workpapers.forEach((item: any) => { item.status = 'Cleared'; });
    archivedState.jobs.filter((item: any) => item.engagementId === archivedEngagement.id).forEach((item: any) => { item.status = 'Completed'; });
    const archivedJobIds = new Set(archivedState.jobs.filter((item: any) => item.engagementId === archivedEngagement.id).map((item: any) => item.id));
    archivedState.jobTasks.filter((item: any) => archivedJobIds.has(item.jobId)).forEach((item: any) => { item.status = 'Completed'; });
    try {
      await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2',${JSON.stringify(JSON.stringify(archivedState))})`);
      await browserTab!.command('Page.reload');
      assert.equal(await waitForBrowser('!!document.querySelector("#role-select")'), true);
      const archivedDashboard = await browserTab!.evaluate<any>(`(() => ({body:document.querySelector('main#main')?.innerText||'',metrics:Object.fromEntries([...document.querySelectorAll('.metric')].map(x=>[x.querySelector('.metric-top')?.innerText,Number(x.querySelector('.metric-value')?.innerText)])),deadlineRows:[...document.querySelectorAll('.grid-main table tbody tr')].map(row=>row.innerText)}))()`);
      assert.equal(archivedDashboard.metrics['Active Engagements'], 2, 'archived engagement is excluded from active count');
      assert.equal(archivedDashboard.metrics['Awaiting Review'], 0);
      assert.equal(archivedDashboard.metrics['Client Requests'], 0);
      assert.equal(archivedDashboard.metrics['Ready to Release'], 0, 'archived engagement cannot be counted as ready for another release');
      assert.ok(archivedDashboard.deadlineRows.every((row: string) => !row.includes('ENG-26001')), 'archived engagement is omitted from active deadline table');
      await browserTab!.evaluate(`document.querySelector('[aria-label^="Ready to Release"]')?.click()`);
      const readyList = await browserTab!.evaluate<string>(`[...document.querySelectorAll('.panel')].find(panel=>panel.innerText.includes('Filtered work list'))?.innerText||''`);
      assert.match(readyList, /0 record\(s\)/);
      assert.doesNotMatch(readyList, /ENG-26001/);
    } finally {
      await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2',${JSON.stringify(roleViewState)})`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
    }
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('AT-15/AT-16: saves a per-capability M365 simulation and retains it on reload', async () => {
    await clickButton('Microsoft 365 Setup');
    assert.equal(await waitForBrowser('document.body.innerText.includes("Microsoft 365 Setup (Simulated)")'), true);
    const clicked = await browserTab!.evaluate<boolean>(`(() => {
      const b = [...document.querySelectorAll("button")].find(x => x.innerText.trim() === "Simulate: Success (simulated)");
      if (!b) return false; b.click(); return true;
    })()`);
    assert.equal(clicked, true);
    assert.equal(await waitForBrowser('document.querySelector("[role=status]")?.innerText.includes("identity result saved")'), true);
    await browserTab!.command('Page.reload');
    assert.equal(await waitForBrowser('!!document.querySelector("#app-root .brandname")'), true);
    await clickButton('Microsoft 365 Setup');
    const persistedText = await browserTab!.evaluate<string>('document.body.innerText');
    const afterReload = await browserTab!.evaluate<string>('JSON.stringify({ route: document.querySelector(".crumb")?.innerText, text: document.body?.innerText.slice(-1800), result: JSON.parse(localStorage.getItem("ste-auditsphere-role-portals-v2") || "{}").m365Config?.verificationResults })');
    assert.match(persistedText, /Identity — Simulated Test\s+success ·/, `saved result should remain visible after reload: ${afterReload}`);
    assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /liveConnected: false/);

    await clickPanelButton('sharepoint — simulated test', 'Simulate: Success (simulated)');
    const beforeConfig = await browserTab!.evaluate<any>(`(() => { const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')); return {revision:s.m365Config.configRevision, grants:s.roleGrants.length, identity:s.m365Config.verificationResults.identity.configRevision, sharepoint:s.m365Config.verificationResults.sharepoint.configRevision}; })()`);
    await browserTab!.evaluate(`(() => {
      const row = [...document.querySelectorAll('fieldset .between')].find(x => x.innerText.includes('Layla Rahman'));
      const role = row?.querySelector('select[aria-label="AuditSphere role for Layla Rahman"]');
      if (!role) throw new Error('Layla identity mapping not visible');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(role, 'reviewer');
      role.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await clickButton('Save simulated configuration');
    assert.equal(await waitForBrowser(`(() => { const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')); return s.m365Config.permittedUsers.some(x=>x.userId==='manager' && x.role==='reviewer'); })()`), true, 'permitted person role mapping persists');
    const mapped = await browserTab!.evaluate<any>(`(() => { const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')); return {revision:s.m365Config.configRevision, grants:s.roleGrants.length, identity:s.m365Config.verificationResults.identity.configRevision}; })()`);
    assert.ok(mapped.revision > beforeConfig.revision);
    assert.equal(mapped.grants, beforeConfig.grants, 'identity mapping alone must not create an authorization grant');
    assert.equal(mapped.identity, beforeConfig.identity, 'configuration edits retain prior identity result as stale evidence');

    const rootInput = await browserTab!.evaluate<boolean>(`(() => {
      const label = [...document.querySelectorAll('label')].find(x => x.textContent.trim() === 'Folder root');
      const input = label?.parentElement?.querySelector('input');
      if (!input) return false;
      input.focus(); return true;
    })()`);
    assert.equal(rootInput, true);
    await browserTab!.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Control', code: 'ControlLeft', modifiers: 2 });
    await browserTab!.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2 });
    await browserTab!.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2 });
    await browserTab!.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Control', code: 'ControlLeft' });
    await browserTab!.command('Input.insertText', { text: '/AuditSphere/Clients/UpdatedRoot' });
    await clickButton('Save simulated configuration');
    assert.equal(await waitForBrowser(`(() => {const c=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).m365Config; return c.verificationResults.identity.configRevision < c.configRevision && c.verificationResults.sharepoint.configRevision < c.configRevision;})()`), true, 'changing resource selections makes earlier results stale');
    await clickPanelButton('sharepoint — simulated test', 'Simulate: Access denied (simulated)');
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).m365Config.verificationResults.sharepoint.outcome === 'access-denied'`), true);
    await clickPanelButton('mail — simulated test', 'Simulate: Service unavailable (simulated)');
    const failures = await browserTab!.evaluate<any>(`(() => { const c=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).m365Config; return {site:c.verificationResults.sharepoint.outcome,mail:c.verificationResults.mail.outcome}; })()`);
    assert.equal(failures.site, 'access-denied', 'optional mail failure must not overwrite SharePoint state');
    assert.equal(failures.mail, 'unavailable');
    await clickPanelButton('sharepoint — simulated test', 'Retry with success fixture');
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).m365Config.verificationResults.sharepoint.outcome === 'success'`), true);
    await clickPanelButton('mail — simulated test', 'Simulate: Service unavailable (simulated)');
    assert.equal(await browserTab!.evaluate<boolean>(`(() => {const c=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).m365Config; return c.verificationResults.sharepoint.outcome==='success' && c.verificationResults.mail.outcome==='unavailable';})()`), true, 'mail outage does not invalidate successful SharePoint setup');
    const foldersBefore = await browserTab!.evaluate<number>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).folders.filter(x=>x.clientId==='CL-001').length`);
    await clickPanelButton('sharepoint — simulated test', 'Prepare selected client workspace');
    const foldersAfter = await browserTab!.evaluate<number>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).folders.filter(x=>x.clientId==='CL-001').length`);
    assert.ok(foldersAfter > foldersBefore, 'explicit workspace preparation creates its canonical folder set');
    await clickPanelButton('sharepoint — simulated test', 'Prepare selected client workspace');
    const foldersAfterRetry = await browserTab!.evaluate<number>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).folders.filter(x=>x.clientId==='CL-001').length`);
    assert.equal(foldersAfterRetry, foldersAfter, 'retry remains idempotent');

    const searchTarget = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const e=s.engagements.find(x=>x.id!==s.selectedEngagement);return {id:e.id,client:e.client,engagement:s.selectedEngagement,activeClient:s.engagements.find(x=>x.id===s.selectedEngagement)?.client};})()`);
    assert.ok(searchTarget?.id && searchTarget.id !== searchTarget.engagement, 'fixture must have a second engagement for context switching');
    const beforeSearch = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return {engagement:s.selectedEngagement,tenant:s.m365Config.tenantId};})()`);
    await browserTab!.evaluate(`(() => {const i=[...document.querySelectorAll('label')].find(x=>x.textContent.trim()==='Synthetic tenant ID (fixture)')?.parentElement?.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'Search draft');i.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.search-trigger').click();})()`);
    assert.equal(await waitForBrowser('!!document.querySelector(\'.modal-backdrop input[placeholder^="Type to search"]\')'), true, 'global search opened from a dirty form');
    await browserTab!.evaluate(`(() => {const i=document.querySelector('.modal-backdrop input[placeholder^="Type to search"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,${JSON.stringify(searchTarget.id)});i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`[...document.querySelectorAll('.modal-backdrop button')].some(x=>x.innerText.includes(${JSON.stringify(searchTarget.id)}))`), true, `second engagement ${searchTarget.id} is available in scoped search`);
    const chooseSearchTarget = async () => {
      const found = await browserTab!.evaluate<boolean>(`(() => {const b=[...document.querySelectorAll('.modal-backdrop button')].find(x=>x.innerText.includes(${JSON.stringify(searchTarget.id)}));if(!b)return false;b.click();return true;})()`);
      assert.equal(found, true, 'search target button is available');
    };
    await chooseSearchTarget();
    assert.equal(await waitForBrowser('!![...document.querySelectorAll("[role=dialog] h2")].some(x=>x.innerText.includes("Unsaved changes"))'), true, 'search context selection asks about the dirty form');
    assert.deepEqual(await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return {engagement:s.selectedEngagement,tenant:s.m365Config.tenantId};})()`), beforeSearch, 'search selection must not change context or persist the dirty draft before a decision');
    await clickButton('Stay');
    assert.equal(await browserTab!.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).selectedEngagement`), searchTarget.engagement, 'Stay leaves the search context unchanged');
    await chooseSearchTarget();
    await clickButton('Discard and continue');
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).selectedEngagement===${JSON.stringify(searchTarget.id)}`), true, 'Discard applies the searched engagement after clearing the draft');
    await clickButton('Microsoft 365 Setup');

    await browserTab!.evaluate(`(() => {const i=[...document.querySelectorAll('label')].find(x=>x.textContent.trim()==='Synthetic tenant ID (fixture)')?.parentElement?.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'Discarded tenant');i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    const beforeDisconnect = await browserTab!.evaluate<any>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).m365Config`);
    await clickButton('Simulate disconnect');
    assert.equal(await waitForBrowser('!!document.querySelector("[role=dialog] h2")?.innerText.includes("Unsaved changes")'), true, 'disconnect is also guarded');
    assert.deepEqual(await browserTab!.evaluate<any>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).m365Config`), beforeDisconnect, 'disconnect does not mutate saved configuration before a decision');
    await clickButton('Stay');
    await clickButtonStartingWith('Jobs & Tasks');
    assert.equal(await waitForBrowser('!!document.querySelector("[role=dialog] h2")?.innerText.includes("Unsaved changes")'), true, 'route changes ask how to handle a dirty setup form');
    await clickButton('Stay');
    assert.equal(await waitForBrowser('document.querySelector("main#main h1")?.innerText.includes("Microsoft 365 Setup")'), true, 'cancel keeps the current route');
    assert.equal(await browserTab!.evaluate<boolean>(`document.querySelector('input.mono')?.value==='Discarded tenant'`), true, 'cancel preserves the unsaved draft');
    await clickButtonStartingWith('Jobs & Tasks');
    await clickButton('Discard and continue');
    assert.equal(await waitForBrowser('document.querySelector("main#main h1")?.innerText.includes("Jobs & Task Delivery")'), true, 'discard continues the pending route change');
    assert.notEqual(await browserTab!.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).m365Config.tenantId`), 'Discarded tenant', 'discard leaves stored configuration unchanged');

    await clickButton('Microsoft 365 Setup');
    await browserTab!.evaluate(`(() => {const i=[...document.querySelectorAll('label')].find(x=>x.textContent.trim()==='Synthetic tenant ID (fixture)')?.parentElement?.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'Saved tenant');i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await clickButtonStartingWith('Jobs & Tasks');
    await clickButton('Save and continue');
    assert.equal(await waitForBrowser('document.querySelector("main#main h1")?.innerText.includes("Jobs & Task Delivery")'), true, 'saving continues the pending route change');
    assert.equal(await browserTab!.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).m365Config.tenantId`), 'Saved tenant', 'save persists the dirty configuration before leaving');

    await clickButton('Microsoft 365 Setup');
    const originalContext = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return {user:s.currentUserId,engagement:s.selectedEngagement};})()`);
    await browserTab!.evaluate(`(() => {const i=[...document.querySelectorAll('label')].find(x=>x.textContent.trim()==='Synthetic tenant ID (fixture)')?.parentElement?.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'Persona draft');i.dispatchEvent(new Event('input',{bubbles:true}));const s=document.querySelector('#role-select');const next=[...s.options].find(o=>o.value!==s.value);Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,next.value);s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser('!!document.querySelector("[role=dialog] h2")?.innerText.includes("Unsaved changes")'), true, 'persona changes are guarded while this form is dirty');
    await clickButton('Stay');
    assert.equal(await browserTab!.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentUserId`), originalContext.user, 'cancel leaves the active persona unchanged');
    await browserTab!.evaluate(`(() => {const i=[...document.querySelectorAll('label')].find(x=>x.textContent.trim()==='Synthetic tenant ID (fixture)')?.parentElement?.querySelector('input');if(i.value!=='Persona draft')throw Error('dirty form was lost');const s=[...document.querySelectorAll('select')].find(x=>x.getAttribute('aria-label')==='Selected engagement');const next=[...s.options].find(o=>o.value!==s.value);Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,next.value);s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser('!!document.querySelector("[role=dialog] h2")?.innerText.includes("Unsaved changes")'), true, 'engagement changes are guarded while this form is dirty');
    await clickButton('Stay');
    assert.equal(await browserTab!.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).selectedEngagement`), originalContext.engagement, 'cancel leaves the active engagement unchanged');
    await clickButtonStartingWith('Jobs & Tasks');
    await clickButton('Discard and continue');
    assert.equal(await waitForBrowser('document.querySelector("main#main h1")?.innerText.includes("Jobs & Task Delivery")'), true, 'discard clears the form before applying another context change');
  });

  it('VP-003-AC02: guards an unsaved client contact across persona changes', async () => {
    const saved = await browserTab!.evaluate<string | null>(`localStorage.getItem('ste-auditsphere-role-portals-v2')`);
    try {
      await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2',${JSON.stringify(JSON.stringify(createInitialState()))})`);
      await browserTab!.command('Page.reload');
      assert.equal(await waitForBrowser('!!document.querySelector("#app-root .brandname")'), true);
      await clickButtonStartingWith('Client Portfolio');
      await clickButton('Client 360 Workspace');
      await clickButtonStartingWith('Contacts');
      await clickButton('Add Contact');
      await browserTab!.evaluate(`(() => {const name=document.querySelector('.modal-backdrop input[type="text"]');const email=document.querySelector('.modal-backdrop input[type="email"]');for(const [el,value] of [[name,'Guarded Contact'],[email,'guarded@example.demo']]){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
      assert.equal(await browserTab!.evaluate<boolean>(`document.querySelector('.modal-backdrop form').checkValidity()`), true, 'contact draft satisfies native form validation');
      const changePersona = async (userId: string) => browserTab!.evaluate<boolean>(`(() => {const select=document.querySelector('#role-select');const option=[...select.options].find(x=>x.value===${JSON.stringify(userId)});if(!option)return false;Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,option.value);select.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
      assert.equal(await changePersona('preparer'), true);
      assert.equal(await waitForBrowser('!![...document.querySelectorAll("[role=dialog] h2")].some(x=>x.innerText.includes("Unsaved changes"))'), true, 'persona switch prompts for the dirty client contact');
      assert.equal(await browserTab!.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentUserId`), 'manager', 'pending persona transition has not changed identity');
      await clickButton('Stay');
      assert.equal(await browserTab!.evaluate<string>(`document.querySelector('.modal-backdrop input[type="text"]')?.value`), 'Guarded Contact', 'Stay preserves the contact draft');
      assert.equal(await changePersona('preparer'), true);
      assert.equal(await waitForBrowser('!![...document.querySelectorAll("[role=dialog] h2")].some(x=>x.innerText.includes("Unsaved changes"))'), true, 'second persona switch still sees the preserved draft');
      await clickButton('Save and continue');
      assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentUserId==='preparer'`), true, 'Save records the contact before changing persona');
      assert.equal(await browserTab!.evaluate<boolean>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).contacts.some(x=>x.name==='Guarded Contact'&&x.email==='guarded@example.demo')`), true);

      assert.equal(await changePersona('manager'), true);
      await clickButtonStartingWith('Client Portfolio');
      await clickButton('Client 360 Workspace');
      await clickButtonStartingWith('Contacts');
      await clickButton('Add Contact');
      await browserTab!.evaluate(`(() => {const name=document.querySelector('.modal-backdrop input[type="text"]');const email=document.querySelector('.modal-backdrop input[type="email"]');for(const [el,value] of [[name,'Discarded Contact'],[email,'discarded@example.demo']]){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
      assert.equal(await changePersona('preparer'), true);
      await clickButton('Discard and continue');
      assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentUserId==='preparer'`), true);
      assert.equal(await browserTab!.evaluate<boolean>(`!JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).contacts.some(x=>x.name==='Discarded Contact')`), true, 'Discard changes persona without creating the contact');
    } finally {
      await browserTab!.evaluate(`(() => {const k='ste-auditsphere-role-portals-v2';const v=${JSON.stringify(saved)};if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v);})()`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
    }
  });

  it('AT-18/AT-25/AT-53: switches to a client persona and exposes only the portal', async () => {
    const changed = await browserTab!.evaluate<boolean>(`(() => {
      const select = document.querySelector("#role-select");
      const option = [...select.options].find(x => x.textContent.includes("Client administrator"));
      if (!option) return false;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(select, option.value);
      select.dispatchEvent(new Event("change", { bubbles: true })); return true;
    })()`);
    assert.equal(changed, true, 'client persona option should exist');
    assert.equal(await waitForBrowser('document.querySelector("nav button")?.innerText.includes("Client Experience Portal")'), true);
    const nav = await browserTab!.evaluate<string[]>('[...document.querySelectorAll("nav button")].map(x => x.innerText.trim())');
    assert.deepEqual(nav, ['Client Experience Portal', 'Specifications & PRD']);
    await clickButton('Client Experience Portal');
    const entityContext = await browserTab!.evaluate<any>(`(() => {const select=[...document.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='CL-003'));return select&&{values:[...select.options].map(o=>o.value)};})()`);
    assert.deepEqual(entityContext.values, ['CL-001', 'CL-003'], 'multi-entity client receives only the two explicitly granted entities');
    await browserTab!.evaluate(`(() => {const select=[...document.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='CL-003'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'CL-003');select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser('document.querySelector("main#main h2")?.innerText.includes("Cedar Manufacturing")'), true, 'entity switch updates the client heading');
    await clickButton('Shared Documents');
    assert.equal(await waitForBrowser('document.querySelector("main#main")?.innerText.includes("No shared documents available for this entity.")'), true, 'shared-document list is re-scoped after entity switch');
    await clickButton('Fee Invoices');
    assert.equal(await waitForBrowser('document.querySelector("main#main")?.innerText.includes("No issued invoices for this entity.")'), true, 'invoice list is re-scoped after entity switch');
    assert.doesNotMatch(await browserTab!.evaluate<string>('document.querySelector("main#main").innerText'), /Pay (?:Now|Online)/);
    await browserTab!.evaluate(`(() => {const select=[...document.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='CL-001')&&[...s.options].some(o=>o.value==='CL-003'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'CL-001');select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser('document.querySelector("main#main h2")?.innerText.includes("Example Trading Entity")'), true, 'switching back restores only that entity projection');
    await clickButton('Shared Documents');
    assert.equal(await waitForBrowser('document.querySelector("main#main")?.innerText.includes("Bank_Statement_December.pdf")'), true, 'client-visible source documents remain available');
    assert.equal(await browserTab!.evaluate<boolean>('!document.querySelector("main#main")?.innerText.includes("WP-A1_Cash_and_Bank_Audit_Schedule.xlsx")'), true, 'internal evidence and working-paper document names stay out of the client projection');
    await clickButton('Fee Invoices');
    assert.match(await browserTab!.evaluate<string>('document.querySelector("main#main").innerText'), /Download Invoice PDF/);
    await browserTab!.evaluate('(() => {window.__invoiceDownload={fileName:"",type:"",size:0};window.__realCreateObjectURL=URL.createObjectURL;window.__realAnchorClick=HTMLAnchorElement.prototype.click;URL.createObjectURL=blob=>{window.__invoiceDownload.type=blob.type;window.__invoiceDownload.size=blob.size;return "blob:invoice-fixture"};HTMLAnchorElement.prototype.click=function(){window.__invoiceDownload.fileName=this.download};})()');
    try {
      await browserTab!.evaluate('(() => {const button=[...document.querySelectorAll("tbody tr button")].find(b=>b.innerText.includes("Download Invoice PDF"));if(!button)throw new Error("issued invoice download action missing");button.click();})()');
      const invoiceDownload = await browserTab!.evaluate<any>('window.__invoiceDownload');
      assert.match(invoiceDownload.fileName, /_Client_Copy\.pdf$/);
      assert.equal(invoiceDownload.type, 'application/pdf');
      assert.ok(invoiceDownload.size > 0, 'client invoice download is a genuine PDF artifact');
    } finally {
      await browserTab!.evaluate('URL.createObjectURL=window.__realCreateObjectURL;HTMLAnchorElement.prototype.click=window.__realAnchorClick;delete window.__realCreateObjectURL;delete window.__realAnchorClick;delete window.__invoiceDownload');
    }
    assert.equal(browserTab!.exceptions.length, 0);
  });

  it('AT-17/AT-18: keeps identity mapping separate from a reviewed scoped access grant', async () => {
    await browserTab!.evaluate(`(() => {
      const role = document.querySelector('#role-select');
      const option = [...role.options].find(o => /system administrator/i.test(o.textContent));
      if (!option) throw new Error('system administrator persona missing');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(role, option.value);
      role.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    assert.equal(await waitForBrowser('JSON.parse(localStorage.getItem("ste-auditsphere-role-portals-v2")).currentRole === "admin"'), true);
    await clickButton('Firm Administration');
    assert.equal(await waitForBrowser('document.body.innerText.includes("Practice Administration & Access Control")'), true);
    const opened = await browserTab!.evaluate<boolean>(`(() => {
      const row = [...document.querySelectorAll('tbody tr')].find(x => x.innerText.includes('Mona Khalil'));
      const button = [...(row?.querySelectorAll('button') || [])].find(x => x.innerText.trim() === '+ Grant Scope');
      if (!button) return false; button.click(); return true;
    })()`);
    assert.equal(opened, true, 'fixture persona can be selected for a scoped grant');
    await browserTab!.evaluate(`(() => {
      const selects = [...document.querySelectorAll('.modal-card select')];
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(selects[0], 'Engagement');
      selects[0].dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await browserTab!.evaluate(`(() => {
      const target = [...document.querySelectorAll('.modal-card select')].find(x => [...x.options].some(o => o.value === 'ENG-26002'));
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(target, 'ENG-26002');
      target.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await browserTab!.evaluate(`(() => {const ref=document.querySelector('[aria-label="Approved access request reference"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(ref,'AR-2026-0041');ref.dispatchEvent(new Event('input',{bubbles:true}));const reason=document.querySelector('[aria-label="Access grant reason"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(reason,'Scoped engagement assignment');reason.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    const before = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')); return {grants:s.roleGrants.filter(g=>g.userId==='group-user'), mappings:s.m365Config.permittedUsers};})()`);
    await clickButton('Record approved grant');
    const after = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')); return {grants:s.roleGrants.filter(g=>g.userId==='group-user'), mappings:s.m365Config.permittedUsers};})()`);
    assert.equal(before.grants.some((g: any) => g.scopeKind === 'Engagement' && g.scopeId === 'ENG-26002'), false);
    assert.ok(after.grants.some((g: any) => g.scopeKind === 'Engagement' && g.scopeId === 'ENG-26002'), 'approved scope adds exactly the requested target');
    assert.deepEqual(after.mappings, before.mappings, 'administrative grant does not rewrite M365 identity mappings');
    await clickButton('✕');
    const clientGrantOpened = await browserTab!.evaluate<boolean>(`(() => {
      const row = [...document.querySelectorAll('tbody tr')].find(x => x.innerText.includes('Omar Nasser'));
      const button = [...(row?.querySelectorAll('button') || [])].find(x => x.innerText.trim() === '+ Grant Scope');
      if (!button) return false; button.click(); return true;
    })()`);
    assert.equal(clientGrantOpened, true);
    await browserTab!.evaluate(`(() => {
      const scope = document.querySelector('.modal-card select');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(scope, 'Client');
      scope.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    assert.equal(await waitForBrowser('!![...document.querySelectorAll(".modal-card select")].find(x => [...x.options].some(o => o.value === "CL-002"))'), true);
    await browserTab!.evaluate(`(() => {
      const client = [...document.querySelectorAll('.modal-card select')].find(x => [...x.options].some(o => o.value === 'CL-002'));
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(client, 'CL-002');
      client.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await browserTab!.evaluate(`(() => {
      const set=(selector,value)=>{const input=document.querySelector(selector);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));};
      set('[aria-label="Approved access request reference"]','AR-2026-0042');
      set('[aria-label="Grant expiry date"]','2027-09-22');
      const reason=document.querySelector('[aria-label="Access grant reason"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(reason,'Quarterly management approval responsibility');reason.dispatchEvent(new Event('input',{bubbles:true}));
    })()`);
    await clickButton('Record approved grant');
    assert.equal(await browserTab!.evaluate<boolean>(`(() => {const g=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).roleGrants.find(g=>g.userId==='client'&&g.scopeKind==='Client'&&g.scopeId==='CL-002');return g?.requestRef==='AR-2026-0042'&&g?.expiresAt==='2027-09-22'&&g?.reason==='Quarterly management approval responsibility';})()`), true, 'approved request, reason, and expiry persist with the scope grant');
    await clickButton('Access History (2)');
    assert.equal(await waitForBrowser(`document.body.innerText.includes('AR-2026-0042')&&document.body.innerText.includes('Quarterly management approval responsibility')&&document.body.innerText.includes('Mona Khalil')`), true, 'grant events retain request, approver, target and recorded reason');
    await browserTab!.evaluate(`(() => [...document.querySelectorAll('.tab-btn')].find(x=>x.innerText.trim().startsWith('Active Access Grants')).click())()`);
    assert.equal(await waitForBrowser(`document.querySelector('.panel-head h3')?.innerText==='Explicit Access Grants Register'`), true, 'active grants table opened');
    await browserTab!.evaluate(`(() => {window.prompt=()=> 'Assignment ended';const row=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes('group-user')&&x.innerText.includes('ENG-26002'));const revoke=[...(row?.querySelectorAll('button')||[])].find(x=>x.innerText.trim()==='Revoke Grant');if(!revoke)throw Error('target grant not listed');revoke.click();})()`);
    assert.equal(await waitForBrowser(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return s.roleGrantHistory.length===3&&!s.roleGrants.some(g=>g.userId==='group-user'&&g.scopeId==='ENG-26002');})()`), true, 'revocation removes authority but appends a durable event');
    await browserTab!.evaluate(`(() => [...document.querySelectorAll('.tab-btn')].find(x=>x.innerText.trim().startsWith('Access History')).click())()`);
    assert.equal(await waitForBrowser(`document.body.innerText.includes('Assignment ended')&&document.body.innerText.includes('Revoked')`), true, 'revocation reason and event remain visible in history');
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('AT-53: opens every staff navigation route in Chrome without a render exception', async () => {
    const changed = await browserTab!.evaluate<boolean>(`(() => {
      const select = document.querySelector("#role-select");
      const option = [...select.options].find(x => x.textContent.includes("Engagement partner"));
      if (!option) return false;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(select, option.value);
      select.dispatchEvent(new Event("change", { bubbles: true })); return true;
    })()`);
    assert.equal(changed, true, 'partner persona option should exist');
    assert.equal(await waitForBrowser('document.querySelector("#role-select")?.selectedOptions[0]?.textContent.includes("Engagement partner")'), true);
    const labels = await browserTab!.evaluate<string[]>('[...document.querySelectorAll("nav button")].map(x => x.innerText.trim())');
    assert.ok(labels.length >= 30, `expected the complete professional module navigation, got ${labels.length}`);
    for (const label of labels) {
      await clickButton(label);
      const content = await browserTab!.evaluate<string>('document.querySelector("main#main")?.innerText || ""');
      assert.ok(content.trim().length > 0, `route rendered no content: ${label}`);
    }
    try {
      for (const width of [768, 390, 320]) {
        await browserTab!.command('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 500 });
        await clickButtonStartingWith('Client Portfolio');
        const pageWidth = await browserTab!.evaluate<number>('document.documentElement.scrollWidth');
        assert.ok(pageWidth <= width, `client portfolio overflows at ${width}px: ${pageWidth}px`);
        await clickButton('Add Client Profile');
        const modal = await browserTab!.evaluate<any>(`(() => {const m=document.querySelector('.modal');const r=m?.getBoundingClientRect();return r&&{left:r.left,right:r.right,width:r.width,viewport:innerWidth,scrollHeight:m.scrollHeight,clientHeight:m.clientHeight};})()`);
        assert.ok(modal && modal.left >= 0 && modal.right <= width, `client form exceeds ${width}px viewport: ${JSON.stringify(modal)}`);
        assert.equal(await browserTab!.evaluate<boolean>(`(() => document.querySelector('[role="dialog"][aria-modal="true"]')?.contains(document.activeElement))()`), true, 'opening the dialog moves keyboard focus inside it');
        await browserTab!.evaluate(`(() => {const controls=[...document.querySelectorAll('[role="dialog"] button,[role="dialog"] input,[role="dialog"] select,[role="dialog"] textarea')].filter(x=>!x.disabled);controls.at(-1).focus();})()`);
        await browserTab!.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
        await browserTab!.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
        assert.equal(await browserTab!.evaluate<boolean>(`(() => document.activeElement===document.querySelector('[role="dialog"] button'))()`), true, 'Tab from the last control wraps to the first dialog control');
        await browserTab!.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
        await browserTab!.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
        assert.equal(await waitForBrowser('!document.querySelector("[role=dialog]")'), true, 'Escape cancels the dialog');
        assert.equal(await browserTab!.evaluate<boolean>(`(() => document.activeElement===document.querySelector('.pagehead button'))()`), true, 'closing the dialog restores focus to its trigger');
      }
    } finally {
      await browserTab!.command('Emulation.clearDeviceMetricsOverride');
    }
    await clickButtonStartingWith('Jobs & Tasks');
    await browserTab!.evaluate(`(() => {const trigger=[...document.querySelectorAll('button')].find(x=>x.innerText.trim().endsWith('New Job'));trigger?.focus();trigger?.click();})()`);
    assert.equal(await waitForBrowser('!!document.querySelector("[role=dialog][aria-modal=true][aria-labelledby]")'), true, 'unannotated module dialogs receive accessible name and dialog semantics');
    assert.equal(await browserTab!.evaluate<boolean>(`(() => document.querySelector('[role=dialog]')?.contains(document.activeElement))()`), true, 'opening a module dialog moves focus inside');
    await browserTab!.evaluate(`(() => {const dialog=document.querySelector('[role=dialog]');const items=[...dialog.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])')].filter(x=>x.getClientRects().length);items.at(-1).focus();})()`);
    await browserTab!.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    await browserTab!.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    assert.equal(await browserTab!.evaluate<boolean>(`(() => {const d=document.querySelector('[role=dialog]');const items=[...d.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])')].filter(x=>x.getClientRects().length);return document.activeElement===items[0];})()`), true, 'Tab remains inside the module dialog');
    await browserTab!.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await browserTab!.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    assert.equal(await waitForBrowser('!document.querySelector("[role=dialog]")'), true, 'Escape cancels the module dialog');
    assert.equal(await browserTab!.evaluate<boolean>(`(() => document.activeElement?.textContent?.trim().endsWith('New Job'))()`), true, 'closing restores focus to the opener');
    const priorState = await browserTab!.evaluate<string | null>(`localStorage.getItem('ste-auditsphere-role-portals-v2')`);
    try {
      await browserTab!.evaluate(`(() => {const trigger=[...document.querySelectorAll('button')].find(x=>x.innerText.trim().endsWith('New Job'));trigger?.focus();trigger?.click();})()`);
      assert.equal(await waitForBrowser('!!document.querySelector("[role=dialog]")'), true);
      await browserTab!.evaluate(`(() => {const dialog=document.querySelector('[role=dialog]');const title=dialog.querySelector('input[type=text]');const due=dialog.querySelector('input[type=date]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(title,'AT53 keyboard submitted job');title.dispatchEvent(new Event('input',{bubbles:true}));Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(due,'2026-10-31');due.dispatchEvent(new Event('input',{bubbles:true}));dialog.querySelector('button[type=submit]').focus();})()`);
      await browserTab!.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', unmodifiedText: '\r', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
      await browserTab!.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
      const keyboardSubmitted = await waitForBrowser('!document.querySelector("[role=dialog]")&&document.body.innerText.includes("AT53 keyboard submitted job")');
      const submitState = await browserTab!.evaluate<any>(`(() => {const d=document.querySelector('[role=dialog]');return {open:!!d,title:d?.querySelector('input[type=text]')?.value,due:d?.querySelector('input[type=date]')?.value,valid:d?.querySelector('form')?.checkValidity(),active:document.activeElement?.outerHTML?.slice(0,180),notice:document.querySelector('[role=status]')?.innerText};})()`);
      assert.equal(keyboardSubmitted, true, `Enter submits the valid form from the keyboard: ${JSON.stringify(submitState)}`);
      assert.equal(await browserTab!.evaluate<boolean>(`(() => document.activeElement?.textContent?.trim().endsWith('New Job'))()`), true, 'keyboard save restores focus to its opener');
    } finally {
      await browserTab!.evaluate(`(() => {const k='ste-auditsphere-role-portals-v2';const v=${JSON.stringify(priorState)};if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v);})()`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
    }
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('VP-051: reconciles scoped CSV/XLSX populations before testing and preserves replacement history', async () => {
    await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2', ${JSON.stringify(JSON.stringify(createInitialState()))})`);
    await browserTab!.command('Page.reload');
    assert.equal(await waitForBrowser('!!document.querySelector("#app-root .brandname")'), true, 'sampling journey starts from a clean manager state');
    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');const o=[...s.options].find(x=>x.textContent.includes('Audit preparer'));if(!o)throw Error('Preparer persona missing');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentRole === 'preparer'`), true);
    await browserTab!.evaluate(`(() => {const r=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim()==='Sampling & Populations');if(!r)throw Error('Sampling route missing');r.click();})()`);
    assert.equal(await waitForBrowser('document.body.innerText.includes("Substantive Sampling & Population Testing")'), true);
    assert.equal(await browserTab!.evaluate<boolean>(`document.querySelector('[data-sample-item="SAMP-01"] input[type=checkbox]')?.disabled`), true, 'seed excerpt cannot be represented as a complete sampling frame');
    const uploadCsv = async (name: string, contents: string) => browserTab!.evaluate(`(() => {const i=document.querySelector('[aria-label="Import population source CSV or XLSX"]');const d=new DataTransfer();d.items.add(new File([${JSON.stringify(contents)}],${JSON.stringify(name)},{type:'text/csv'}));i.files=d.files;i.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await uploadCsv('wrong-context.csv','itemRef,date,counterparty,amount,period,currency\nBAD-1,2026-09-20,Customer,500000,2025,USD');
    assert.equal(await waitForBrowser(`document.querySelector('[role=status]')?.innerText.includes('period/currency')`), true, 'wrong-period/currency source is rejected');
    assert.equal(await browserTab!.evaluate<number>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).samplePopulations[0].sourceRevision`), 1, 'wrong context leaves the prior source unchanged');
    await uploadCsv('population.csv','itemRef,date,counterparty,amount,description,period,currency\nNEW-1,2026-09-20,Customer One,100000,Invoice one,2026,QAR\nNEW-2,2026-09-21,Customer Two,400000,Invoice two,2026,QAR');
    assert.equal(await waitForBrowser(`(() => {const p=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).samplePopulations[0];return p.sourceRevision===2&&p.sourceComplete&&p.totalPopulationCount===2&&p.totalPopulationValue===500000&&document.body.innerText.includes('Reconciled to GL Frame');})()`), true, 'CSV population ties to mapped QAR 500000 GL balance');
    const amountSet = await browserTab!.evaluate<boolean>(`(() => {const row=document.querySelector('[data-sample-item="SAMP-IMPORT-1"]');const checkbox=row?.querySelector('input[type=checkbox]');if(!checkbox||checkbox.disabled)return false;const setNote=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;const rationale=row.querySelector('[data-selection-rationale]');setNote.call(rationale,'High-value item selected for targeted vouching.');rationale.dispatchEvent(new Event('input',{bubbles:true}));checkbox.click();const input=row.querySelector('[data-audited-amount]');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(input,'99990');input.dispatchEvent(new Event('input',{bubbles:true}));const note=row.querySelector('[data-test-notes]');setNote.call(note,'Vouched to confirmation; QAR 10 shortfall requires follow-up.');note.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
    assert.equal(amountSet, true);
    const record = await browserTab!.evaluate<boolean>(`(() => {const row=document.querySelector('[data-sample-item="SAMP-IMPORT-1"]');const b=[...row.querySelectorAll('button')].find(x=>x.innerText.trim()==='Record test');if(!b)return false;b.click();return true;})()`);
    assert.equal(record, true);
    assert.equal(await waitForBrowser(`(() => {const i=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).samplePopulations[0].items.find(x=>x.id==='SAMP-IMPORT-1');return i.tested&&i.selected&&i.result==='Exception noted'&&i.difference===-10&&i.notes.includes('QAR 10 shortfall');})()`), true, 'test amount, exception and notes persist');
    await browserTab!.evaluate(`(() => {const row=document.querySelector('[data-sample-item="SAMP-IMPORT-2"]');const rationale=row.querySelector('[data-selection-rationale]');const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(rationale,'Select as a representative customer balance.');rationale.dispatchEvent(new Event('input',{bubbles:true}));row.querySelector('input[type=checkbox]').click();})()`);
    await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).samplePopulations[0].selectedCount===2`);
    await browserTab!.evaluate(`(() => {const row=document.querySelector('[data-sample-item="SAMP-IMPORT-2"]');const limitation=row.querySelector('[data-limitation]');const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(limitation,'Invoice attachment was unavailable for inspection.');limitation.dispatchEvent(new Event('input',{bubbles:true}));[...row.querySelectorAll('button')].find(b=>b.innerText==='Record limitation').click();})()`);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).samplePopulations[0].items.find(i=>i.id==='SAMP-IMPORT-2').result==='Limited'`), true, 'selected item can carry an explicit testing limitation');
    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');const o=[...s.options].find(x=>x.textContent.includes('Senior reviewer'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentRole==='reviewer'`), true);
    await browserTab!.evaluate(`(() => {const t=document.querySelector('[aria-label="Sample selection evaluation"]');const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(t,'One tested exception and one limited item; no selected items remain untested.');t.dispatchEvent(new Event('input',{bubbles:true}));[...document.querySelectorAll('button')].find(b=>b.innerText==='Record independent review').click();})()`);
    assert.equal(await waitForBrowser(`(() => {const p=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).samplePopulations[0];const r=p.selectionReviews?.at(-1);return r?.testedCount===1&&r.limitedCount===1&&r.untestedCount===0&&r.exceptionCount===1&&r.sourceRevision===p.sourceRevision;})()`), true, 'independent selection review records tested, limited, untested and exception counts');
    await browserTab!.evaluate(`(() => {const row=document.querySelector('[data-sample-item="SAMP-IMPORT-1"]');const s=row.querySelector('select[aria-label="Finding for NEW-1"]');if(!s)throw new Error('Finding link selector missing');const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;set.call(s,'FND-01');s.dispatchEvent(new Event('change',{bubbles:true}));[...row.querySelectorAll('button')].find(b=>b.innerText==='Link finding').click();})()`);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).samplePopulations[0].items[0].findingId==='FND-01'`), true, 'exception links to the engagement finding');
    await uploadCsv('replacement.csv','itemRef,date,counterparty,amount,period,currency\nNEW-3,2026-09-22,Customer Three,250,2026,QAR');
    assert.equal(await waitForBrowser(`(() => {const p=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).samplePopulations[0];const item=document.querySelector('[data-sample-item="SAMP-IMPORT-1"] input[type=checkbox]');return p.sourceRevision===3&&p.totalPopulationCount===1&&p.totalPopulationValue===250&&p.selectedCount===0&&item?.disabled&&document.body.innerText.includes('Variance QAR');})()`), true, 'a GL variance blocks sampling on the imported source');
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['itemRef','date','counterparty','amount','period','currency'],['XLSX-1','2026-09-22','Customer X',300000,2026,'QAR'],['XLSX-2','2026-09-23','Customer Y',200000,2026,'QAR']]), 'Population');
    const xlsxBase64 = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
    await browserTab!.evaluate(`(() => {const raw=atob(${JSON.stringify(xlsxBase64)});const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));const i=document.querySelector('[aria-label="Import population source CSV or XLSX"]');const d=new DataTransfer();d.items.add(new File([bytes],'population.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));i.files=d.files;i.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`(() => {const p=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).samplePopulations[0];return p.sourceRevision===4&&p.sourceFileName==='population.xlsx'&&p.totalPopulationValue===500000&&p.items.every(i=>!i.selected&&!i.tested)&&document.body.innerText.includes('Reconciled to GL Frame');})()`), true, 'genuine XLSX replacement re-reconciles and resets item testing');
    const imported = await browserTab!.evaluate<any>(`(() => {const p=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).samplePopulations[0];return {sha:p.sourceSha256,history:p.sourceHistory,items:p.items,selectedCount:p.selectedCount};})()`);
    assert.match(imported.sha, /^[a-f0-9]{64}$/);
    assert.equal(imported.history[1].items.find((i: any) => i.id==='SAMP-IMPORT-1').difference, -10, 'replacement retains exact prior sample work');
    assert.equal(imported.history[1].items.find((i: any) => i.id==='SAMP-IMPORT-1').findingId, 'FND-01', 'replacement retains the linked finding in source history');
    assert.equal(imported.selectedCount, 0);
    assert.ok(imported.items.every((i: any) => !i.selected && !i.tested), 'new source requires fresh manual selection and testing');
    await uploadCsv('duplicate.csv','reference,date,customer,value\nDUP,2026-09-20,C,5\nDUP,2026-09-21,C,6');
    assert.equal(await waitForBrowser(`document.querySelector('[role=status]')?.innerText.includes('duplicated')`), true, 'invalid replacement reports duplicate references');
    assert.equal(await browserTab!.evaluate<number>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).samplePopulations[0].sourceRevision`), 4, 'invalid file cannot replace the current source');
    await browserTab!.command('Page.reload');
    assert.equal(await waitForBrowser('!!document.querySelector("#app-root .brandname")'), true);
    await browserTab!.evaluate(`(() => {const r=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim()==='Sampling & Populations');r.click();})()`);
    assert.equal(await waitForBrowser(`(() => {const p=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).samplePopulations[0];return p.sourceRevision===4&&p.sourceSha256===${JSON.stringify(imported.sha)}&&document.body.innerText.includes('Previous source revisions (3)');})()`), true, 'current and prior source identities remain visible after reload');
    assert.deepEqual(browserTab!.exceptions, []);
  });
  it('VP-052: creates a clean workpaper from a published template with a genuine sample workbook', async () => {
    await browserTab!.evaluate(`(() => {const r=document.querySelector('#role-select');const o=[...r.options].find(x=>x.textContent.includes('Engagement manager'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(r,o.value);r.dispatchEvent(new Event('change',{bubbles:true}));const e=document.querySelector('select[aria-label="Selected engagement"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'ENG-26001');e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentRole==='manager'`), true);
    await clickButtonStartingWith('Audit Workpapers');
    assert.equal(await waitForBrowser('document.body.innerText.includes("Create from a published workpaper template")'), true);
    await clickButton('Create workpaper');
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26001').workpapers.some(w=>w.sourceTemplateId==='TPL-WP-CASH-01')`), true);
    const created = await browserTab!.evaluate<any>(`(() => {const e=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26001');return e.workpapers.find(w=>w.sourceTemplateId==='TPL-WP-CASH-01')})()`);
    assert.deepEqual([created.sourceTemplateVersion, created.version, created.status, created.preparer, created.reviewer], [1, 1, 'Planned', 'Adam Khan', 'Sara Malik']);
    assert.deepEqual([created.workingPaper, created.evidenceRefs, created.supportingEvidence, created.clearance, created.conclusion], [null, [], [], null, '']);
    assert.ok(created.guidelines.length && created.assignmentHistory.length === 2, 'template guidance and assignment provenance are retained');
    assert.deepEqual(created.sourceProcedureRefs, ['PRC-01'], 'template procedure references are retained');
    const sample = XLSX.read(readFileSync(join(repoRoot, 'templates/WP-A1_Cash_and_Bank_Audit_Template.xlsx')), { type: 'buffer' });
    assert.ok(sample.SheetNames.length && XLSX.utils.sheet_to_json(sample.Sheets[sample.SheetNames[0]]).length > 0, 'sample is a genuine workbook');
    assert.ok(await browserTab!.evaluate<boolean>(`[...document.querySelectorAll('a')].some(a=>a.innerText.includes('Download genuine sample XLSX')&&a.href.includes('/templates/WP-A1_Cash_and_Bank_Audit_Template.xlsx'))`));
    await browserTab!.evaluate(`(() => {const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;for(const [name,value] of [['Workpaper scope','All material cash accounts and year-end cut-off.'],['Work performed','Agreed GL to bank confirmation and statement; inspected subsequent cut-off.'],['Workpaper conclusion','Balances agree; no exceptions noted.']]){const field=document.querySelector('[aria-label="'+name+'"]');set.call(field,value);field.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
    await clickButton('Save workpaper revision');
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26001').workpapers.find(w=>w.id===${JSON.stringify(created.id)}).version===2`), true, 'draft edits are versioned');
    await clickButton('5. Pinned Evidence');
    await browserTab!.evaluate(`(() => {const s=document.querySelector('[aria-label="Workpaper evidence document"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'DOC-002');s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await clickButton('Pin evidence revision');
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26001').workpapers.find(w=>w.id===${JSON.stringify(created.id)}).evidenceRefs.includes('DOC-002')`), true, 'same-engagement evidence revision is pinned');
    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');const o=[...s.options].find(x=>x.textContent.includes('Audit preparer — Adam'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentRole==='preparer'`), true);
    await clickButton('4. Artifact & Revision');
    await clickButton('Upload Replacement Revision');
    await browserTab!.evaluate(`(async()=>{const response=await fetch('/templates/WP-A1_Cash_and_Bank_Audit_Template.xlsx');const blob=await response.blob();const file=new File([blob],'WP-A1_Cash_and_Bank_Audit_Template.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});const input=document.querySelector('.modal input[type=file]');const data=new DataTransfer();data.items.add(file);input.files=data.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`(() => {const b=[...document.querySelectorAll('.modal button')].find(b=>b.innerText.includes('Record Revision'));return !!b&&!b.disabled;})()`), true, 'sample workbook metadata is selected for the current revision');
    await browserTab!.evaluate(`[...document.querySelectorAll('.modal button')].find(b=>b.innerText.includes('Record Revision')).click()`);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26001').workpapers.find(w=>w.id===${JSON.stringify(created.id)}).workingPaper?.version===4`), true, 'uploaded workbook metadata is pinned to its workpaper revision');
    await clickButton('1. Objective & Scope');
    await clickButton('Submit for independent review');
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26001').workpapers.find(w=>w.id===${JSON.stringify(created.id)}).status==='Submitted'`), true, 'current workpaper revision is submitted with required records');
    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');const o=[...s.options].find(x=>x.textContent.includes('Senior reviewer — Sara'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentRole==='reviewer'`), true);
    await clickButton('6. Clearance & History');
    await clickButton('Sign & Clear Workpaper');
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26001').workpapers.find(w=>w.id===${JSON.stringify(created.id)}).status==='Cleared'`), true, 'assigned reviewer clears the exact submitted revision');
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('VP-050: persists procedure fieldwork and requires independent reviewer clearance', async () => {
    const switchRole = async (label: string, role: string) => {
      await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');const o=[...s.options].find(x=>x.textContent.includes(${JSON.stringify(label)}));if(!o)throw Error('Missing persona '+${JSON.stringify(label)});Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentRole === ${JSON.stringify(role)}`), true);
    };
    await switchRole('Audit preparer', 'preparer');
    await browserTab!.evaluate(`(() => {const e=document.querySelector('select[aria-label="Selected engagement"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'ENG-26001');e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).selectedEngagement === 'ENG-26001'`), true);
    await clickButton('Risks & Audit Programs');
    assert.equal(await waitForBrowser('document.body.innerText.includes("Audit Risks & Substantive Programs")'), true);
    await clickButton('Fixed Assets and Depreciation');
    const exceptionVisible = await browserTab!.evaluate<boolean>(`(() => {const r=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes('PRC-04'));return !!r&&r.innerText.includes('Exception recorded')&&r.innerText.includes('under-accrual');})()`);
    assert.equal(exceptionVisible, true, 'existing fieldwork exceptions remain visible');
    await clickButton('Cash and Bank Balances');
    const opened = await browserTab!.evaluate<boolean>(`(() => {const r=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes('PRC-01'));const b=[...(r?.querySelectorAll('button')||[])].find(x=>x.innerText==='Record fieldwork');if(!b)return false;b.click();return true;})()`);
    assert.equal(opened, true);
    await browserTab!.evaluate(`(() => {const w=document.querySelector('[aria-label="Work performed for PRC-01"]');const c=document.querySelector('[aria-label="Conclusion for PRC-01"]');const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(w,'Reconfirmed both year-end bank balances to current independent confirmations.');w.dispatchEvent(new Event('input',{bubbles:true}));const setInput=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setInput.call(c,'No exceptions; balances agree to the ledger.');c.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await clickButton('Save fieldwork');
    const procedureRow = await browserTab!.evaluate<boolean>(`(() => {const r=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes('PRC-01'));const s=r?.querySelector('select');const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;set.call(s,'In progress');s.dispatchEvent(new Event('change',{bubbles:true}));set.call(s,'Submitted');s.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
    assert.equal(procedureRow, true);
    assert.equal(await waitForBrowser(`(() => {const p=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).auditPrograms.flatMap(x=>x.procedures).find(x=>x.id==='PRC-01');return p.status==='Submitted'&&p.preparedByUserId==='preparer'&&p.workPerformed.includes('independent confirmations');})()`), true, 'submitted fieldwork and preparer identity persist');
    await browserTab!.evaluate(`(() => {const r=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes('PRC-01'));const s=r.querySelector('select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'Cleared');s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).auditPrograms.flatMap(x=>x.procedures).find(x=>x.id==='PRC-01').status === 'Submitted'`), true, 'preparer cannot clear their own submitted work');
    await switchRole('Engagement manager', 'manager');
    await browserTab!.evaluate(`(() => {const r=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes('PRC-01'));const s=r.querySelector('select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'Cleared');s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`(() => {const p=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).auditPrograms.flatMap(x=>x.procedures).find(x=>x.id==='PRC-01');return p.status==='Cleared'&&p.reviewedByUserId==='manager'&&!!p.reviewedAt;})()`), true, 'independent manager clearance is recorded separately');
    await browserTab!.command('Page.reload');
    assert.equal(await waitForBrowser('!!document.querySelector("#app-root .brandname")'), true);
    await clickButton('Risks & Audit Programs');
    assert.equal(await waitForBrowser(`[...document.querySelectorAll('tbody tr')].some(r=>r.innerText.includes('PRC-01')&&r.innerText.includes('Reviewed by Layla Rahman'))`), true, 'review attribution remains visible after reload');
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('VP-049: edits the persisted risk register and keeps procedure links reciprocal', async () => {
    await browserTab!.evaluate(`(() => {const role=document.querySelector('#role-select');const manager=[...role.options].find(o=>o.textContent.includes('Engagement manager'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(role,manager.value);role.dispatchEvent(new Event('change',{bubbles:true}));const e=document.querySelector('select[aria-label="Selected engagement"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'ENG-26001');e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentRole==='manager'&&JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).selectedEngagement==='ENG-26001'`), true);
    await clickButton('Audit Planning & Materiality');
    await clickButtonStartingWith('Plan Versions & Review');
    await clickButton('Save Version 1');
    await browserTab!.evaluate(`(() => {const role=document.querySelector('#role-select');const reviewer=[...role.options].find(o=>o.textContent.includes('Senior reviewer — Sara Malik'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(role,reviewer.value);role.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await clickButton('Approve Audit Plan Strategy');
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).auditPlans.find(p=>p.engagementId==='ENG-26001').status==='Approved'`), true);
    await browserTab!.evaluate(`(() => {const role=document.querySelector('#role-select');const manager=[...role.options].find(o=>o.textContent.includes('Engagement manager'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(role,manager.value);role.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await clickButton('Risks & Audit Programs');
    await clickButton('Identified Risk Register (3)');
    const opened = await browserTab!.evaluate<boolean>(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(r=>r.innerText.includes('RSK-01'));const button=[...(row?.querySelectorAll('button')||[])].find(b=>b.innerText==='Edit risk');if(!button)return false;button.click();return true;})()`);
    assert.equal(opened, true);
    await browserTab!.evaluate(`(() => {const panel=[...document.querySelectorAll('.panel')].find(p=>p.querySelector('h3')?.innerText==='Edit RSK-01');const response=panel?.querySelectorAll('textarea')[2];const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(response,'Independent confirmations plus year-end cut-off tests.');response.dispatchEvent(new Event('input',{bubbles:true}));const label=[...panel.querySelectorAll('label')].find(l=>l.innerText.includes('PRC-03'));const checkbox=label?.querySelector('input[type=checkbox]');if(!checkbox)throw new Error('PRC-03 risk link control unavailable');checkbox.click();})()`);
    await clickButton('Save assessed risk');
    const riskRework = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const r=s.auditRisks.find(x=>x.id==='RSK-01');const p=s.auditPrograms.flatMap(x=>x.procedures).find(x=>x.id==='PRC-03');return {response:r.response, riskLinks:r.linkedProcedureIds, procedureLinks:p.linkedRiskIds, reassess:p.scopeReassessmentRequired, plans:s.auditPlans.map(x=>({status:x.status,rationales:x.rationales})), currentUserId:s.currentUserId};})()`);
    assert.equal(riskRework.response.includes('Independent confirmations')&&riskRework.riskLinks.includes('PRC-03')&&riskRework.procedureLinks.includes('RSK-01')&&riskRework.reassess&&riskRework.plans.map((p:any)=>p.status).join(',')==='Superseded,Under review'&&riskRework.plans[1].rationales.at(-1).includes('Risk RSK-01 changed'), true, `risk edit impact: ${JSON.stringify(riskRework)}`);
    await browserTab!.command('Page.reload');
    assert.equal(await waitForBrowser('!!document.querySelector("#app-root .brandname")'), true);
    await clickButton('Risks & Audit Programs');
    await clickButton('Identified Risk Register (3)');
    assert.equal(await waitForBrowser(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(r=>r.innerText.includes('RSK-01'));return !!row&&row.innerText.includes('Independent confirmations')&&row.innerText.includes('PRC-03');})()`), true, 'risk response and link remain visible after reload');
    await clickButton('Audit Planning & Materiality');
    await clickButtonStartingWith('Plan Versions & Review');
    assert.equal(await browserTab!.evaluate<boolean>(`document.body.innerText.includes('Risk RSK-01 changed; audit plan v2 requires independent review.')`), true, 'superseded plan and current revision show the risk-driven review impact');
    await browserTab!.evaluate(`(() => {const role=document.querySelector('#role-select');const reviewer=[...role.options].find(o=>o.textContent.includes('Senior reviewer — Sara Malik'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(role,reviewer.value);role.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await clickButton('Approve Audit Plan Strategy');
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).auditPlans.find(p=>p.version===2).status==='Approved'`), true, 'independent review can approve the risk-driven plan revision');
    await browserTab!.evaluate(`(() => {const role=document.querySelector('#role-select');const manager=[...role.options].find(o=>o.textContent.includes('Engagement manager'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(role,manager.value);role.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await clickButton('Audit Planning & Materiality');
    await clickButtonStartingWith('Plan Versions & Review');
    await clickButton('Save Version 3');
    await browserTab!.evaluate(`(() => {const role=document.querySelector('#role-select');const reviewer=[...role.options].find(o=>o.textContent.includes('Senior reviewer — Sara Malik'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(role,reviewer.value);role.dispatchEvent(new Event('change',{bubbles:true}));const box=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(box,'Rework the risk response rationale before approval.');box.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await clickButton('Return for Rework');
    assert.equal(await waitForBrowser(`(() => {const p=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).auditPlans.find(p=>p.version===3);return p.status==='Draft'&&p.reviewNotes==='Rework the risk response rationale before approval.';})()`), true, 'independent return retains reviewer rationale and does not clear planning');
    await browserTab!.evaluate(`(() => {const role=document.querySelector('#role-select');const manager=[...role.options].find(o=>o.textContent.includes('Engagement manager'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(role,manager.value);role.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await clickButton('Save Version 4');
    assert.equal(await waitForBrowser(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const p=s.auditPlans;return p.find(x=>x.version===3).status==='Superseded'&&p.find(x=>x.version===3).reviewNotes==='Rework the risk response rationale before approval.'&&p.find(x=>x.version===4).status==='Under review';})()`), true, 'manager rework creates a new revision and preserves the returned version');
    await browserTab!.evaluate(`(() => {const role=document.querySelector('#role-select');const reviewer=[...role.options].find(o=>o.textContent.includes('Senior reviewer — Sara Malik'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(role,reviewer.value);role.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await clickButton('Approve Audit Plan Strategy');
    assert.equal(await waitForBrowser(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return s.auditPlans.find(p=>p.version===4).status==='Approved'&&s.engagements.find(e=>e.id==='ENG-26001').planning;})()`), true, 'independent approval of the reworked revision restores the planning gate');
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('AT-05/AT-06: creates a client, primary contact, typed value and non-authorizing relationship group', async () => {
    const setPersona = async (name: string) => browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');const o=[...s.options].find(x=>x.textContent.includes(${JSON.stringify(name)}));if(!o)throw Error('Missing persona '+${JSON.stringify(name)});Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const setLabeledField = async (label: string, value: string) => browserTab!.evaluate(`(() => {const l=[...document.querySelectorAll('.modal-backdrop label')].find(x=>x.textContent.trim()==${JSON.stringify(label)});const e=l?.parentElement?.querySelector('input');if(!e)throw Error('Missing '+${JSON.stringify(label)});const p=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;p.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const setSelect = async (selector: string, value: string) => browserTab!.evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('change',{bubbles:true}));})()`);

    await setPersona('Engagement partner');
    const portfolio = await browserTab!.evaluate<boolean>(`(() => {const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().startsWith('Client Portfolio'));if(!b)return false;b.click();return true;})()`);
    assert.equal(portfolio, true);
    await clickButton('Add Client Profile');
    await setLabeledField('Legal Entity Name', 'AT05 Journey Entity');
    await setLabeledField('Primary Contact Person', 'Nora Journey');
    await setLabeledField('Contact Email', 'nora@journey.demo');
    await clickButton('Create Client');
    const clientId = await browserTab!.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).clients.find(c=>c.name==='AT05 Journey Entity')?.id`);
    assert.ok(clientId);
    const opened = await browserTab!.evaluate<boolean>(`(() => {const c=[...document.querySelectorAll('.client-card')].find(x=>x.innerText.includes('AT05 Journey Entity'));const b=[...(c?.querySelectorAll('button')||[])].find(x=>x.innerText.trim()==='Client 360 Workspace');if(!b)return false;b.click();return true;})()`);
    assert.equal(opened, true);
    await setSelect('select[aria-label="Custom field"]', 'cf_entity_tier');
    await setSelect('select[aria-label="Custom field value"]', 'Tier 2 SME');
    await clickButton('Save custom value');
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).clients.find(c=>c.id===${JSON.stringify(clientId)}).customFields.cf_entity_tier==='Tier 2 SME'`), true);
    await browserTab!.evaluate(`(() => {const d=[...document.querySelectorAll('details')].find(x=>x.innerText.includes('Manage bounded custom fields'));d.querySelector('summary').click();})()`);
    await browserTab!.evaluate(`(() => {const e=document.querySelector('[aria-label="New custom field label"]');const p=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;p.call(e,'Journey Tier');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await setSelect('[aria-label="New custom field type"]', 'choice');
    await browserTab!.evaluate(`(() => {const e=document.querySelector('[aria-label="New custom field choices"]');const p=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;p.call(e,'Standard, Enhanced');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await clickButton('Add bounded field');
    const fieldId = await browserTab!.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).customFields.find(f=>f.label==='Journey Tier')?.id`);
    assert.ok(fieldId);
    await setSelect('select[aria-label="Custom field"]', fieldId);
    await setSelect('select[aria-label="Custom field value"]', 'Enhanced');
    await clickButton('Save custom value');
    const fieldDisabled = await browserTab!.evaluate<boolean>(`(() => {const row=[...document.querySelectorAll('.row')].find(x=>x.innerText.startsWith('Journey Tier · choice'));const b=[...(row?.querySelectorAll('button')||[])].find(x=>x.innerText==='Disable');if(!b)return false;b.click();return true;})()`);
    assert.equal(fieldDisabled, true);
    assert.equal(await waitForBrowser(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return s.customFields.find(f=>f.id===${JSON.stringify(fieldId)}).enabled===false && s.clients.find(c=>c.id===${JSON.stringify(clientId)}).customFields[${JSON.stringify(fieldId)}]==='Enhanced';})()`), true);
    const groupName = `AT05 Relationship ${clientId}`;
    await browserTab!.evaluate(`(() => {const e=document.querySelector('[aria-label="New relationship group"]');const p=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;p.call(e,${JSON.stringify(groupName)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await clickButton('Create group');
    const groupId = await browserTab!.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).relationshipGroups.find(g=>g.name===${JSON.stringify(groupName)})?.id`);
    assert.ok(groupId);
    await clickButton('Contacts');
    await clickButton('Add Contact');
    await setLabeledField('Full Name', 'Nora Secondary');
    await setLabeledField('Job Title', 'Controller');
    await setLabeledField('Email Address', 'nora.secondary@journey.demo');
    await setLabeledField('Responsibility', 'Monthly financial reporting');
    await browserTab!.evaluate(`(() => {const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;for(const [label,value] of [['Contact effective from','2026-01-01'],['Contact effective to','2026-12-31']]){const input=document.querySelector('[aria-label="'+label+'"]');setter.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}})()`);
    await clickButton('Save Contact');
    const contact = await browserTab!.evaluate<any>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).contacts.find(c=>c.name==='Nora Secondary')`);
    assert.equal(contact.clientId, clientId);
    assert.equal(contact.responsibility, 'Monthly financial reporting');
    assert.equal(contact.effectiveFrom, '2026-01-01');
    assert.equal(contact.effectiveTo, '2026-12-31');
    assert.equal(contact.portalAccessRequested, false, 'a contact is not an account or access grant');

    await clickButton('Back to Portfolio');
    const linked = await browserTab!.evaluate<boolean>(`(() => {const c=[...document.querySelectorAll('.client-card')].find(x=>x.innerText.includes('CL-003'));const b=[...(c?.querySelectorAll('button')||[])].find(x=>x.innerText.trim()==='Client 360 Workspace');if(!b)return false;b.click();return true;})()`);
    assert.equal(linked, true);
    const grantsBeforeGroupLink = await browserTab!.evaluate<any[]>('JSON.parse(localStorage.getItem("ste-auditsphere-role-portals-v2")).roleGrants');
    await setSelect('#relationship-group', groupId);
    const linkedState = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return {members:s.relationshipGroups.find(g=>g.id===${JSON.stringify(groupId)}).clientIds, grants:s.roleGrants};})()`);
    assert.ok(linkedState.members.includes(clientId) && linkedState.members.includes('CL-003'));
    assert.deepEqual(linkedState.grants, grantsBeforeGroupLink, 'relationship links must not change access grants');
    assert.ok(linkedState.grants.every((g: any) => g.scopeId !== clientId), 'relationship links must not grant access to the new related client');

    for (const tab of ['Overview','Contacts','Engagements','Jobs','Documents','PBC Requests','Communications','Time & Budgets','Billing & AR','Accounting','Audit & Reviews','Audit Log']) {
      await clickButton(tab);
      const text = await browserTab!.evaluate<string>('document.querySelector("main#main")?.innerText || ""');
      assert.ok(text.includes('Cedar Manufacturing'), `client workspace context was lost on ${tab}`);
      assert.doesNotMatch(text, /ENG-26001|ENG-26002/, `${tab} leaked another client's engagement`);
    }
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('AT-07/AT-08: registers an opportunity, drafts a proposal and presents only after independent review', async () => {
    const setPersona = async (name: string) => browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');const o=[...s.options].find(x=>x.textContent.includes(${JSON.stringify(name)}));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const setLabel = async (label: string, value: string, tag = 'input') => browserTab!.evaluate(`(() => {const l=[...document.querySelectorAll('.modal-backdrop label')].find(x=>x.textContent.includes(${JSON.stringify(label)}));const e=l?.querySelector(${JSON.stringify(tag)})||l?.parentElement?.querySelector(${JSON.stringify(tag)});if(!e)throw Error('Missing '+${JSON.stringify(label)});const p=Object.getOwnPropertyDescriptor(${tag === 'textarea' ? 'HTMLTextAreaElement' : 'HTMLInputElement'}.prototype,'value').set;p.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await setPersona('Relationship owner');
    await browserTab!.evaluate(`(() => {const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().startsWith('Acquisition & Pipeline'));if(!b)throw Error('Missing acquisition route');b.click();})()`);
    await clickButton('New Inquiry');
    await setLabel('Prospective Client Name', 'AT07 Journey Opportunity');
    await setLabel('Primary Contact', 'Nora Opportunity');
    await setLabel('Inquiry source', 'Existing client referral');
    await setLabel('Target date', '2026-09-30', 'input');
    await setLabel('Next action', 'Schedule discovery call');
    await setLabel('Discovery notes', 'Discuss FY2026 audit scope.', 'textarea');
    await clickButton('Register Inquiry');
    const leadId = await browserTab!.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).leads.find(l=>l.name==='AT07 Journey Opportunity')?.id`);
    assert.ok(leadId);
    const capturedLead = await browserTab!.evaluate<any>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).leads.find(l=>l.id===${JSON.stringify(leadId)})`);
    assert.equal(capturedLead.source, 'Existing client referral');
    assert.equal(capturedLead.targetDate, '2026-09-30');
    assert.equal(capturedLead.nextAction, 'Schedule discovery call');
    assert.equal(capturedLead.discoveryNotes, 'Discuss FY2026 audit scope.');
    const openLead = async (name: string) => browserTab!.evaluate(`(() => {const card=[...document.querySelectorAll('.lead-card')].find(x=>x.innerText.includes(${JSON.stringify(name)}));const b=[...(card?.querySelectorAll('button')||[])].find(x=>x.innerText.trim()==='Details');if(!b)throw Error('Missing lead '+${JSON.stringify(name)});b.click();})()`);
    const setLeadStage = async (stage: string) => browserTab!.evaluate(`(() => {const l=[...document.querySelectorAll('.modal-backdrop label')].find(x=>x.textContent.includes('Update stage'));const s=l?.querySelector('select');if(!s)throw Error('Missing opportunity stage control');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(stage)});s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await openLead('AT07 Journey Opportunity');
    await setLeadStage('Discovery');
    await setLeadStage('Proposal');
    const leadHistory = await browserTab!.evaluate<string[]>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).leads.find(l=>l.id===${JSON.stringify(leadId)}).history.map(h=>h.stage)`);
    assert.deepEqual(leadHistory, ['Inquiry', 'Discovery', 'Proposal']);
    await clickButton('✕');
    await clickButton('New Inquiry');
    await setLabel('Prospective Client Name', 'AT07 USD Opportunity');
    await setLabel('Primary Contact', 'Iris USD');
    await browserTab!.evaluate(`(() => {const s=[...document.querySelectorAll('.modal-backdrop select')].find(e=>[...e.options].some(o=>o.value==='USD'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'USD');s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await clickButton('Register Inquiry');
    await openLead('AT07 USD Opportunity');
    await setLeadStage('Discovery');
    const displayedFees = await browserTab!.evaluate<string>('document.querySelector(".metric.purple .metric-val")?.innerText || ""');
    assert.match(displayedFees, /QAR.*USD|USD.*QAR/, `open fees should stay split by currency: ${displayedFees}`);
    await clickButton('✕');
    await clickButton('New Inquiry');
    await setLabel('Prospective Client Name', 'AT07 Lost Opportunity');
    await setLabel('Primary Contact', 'Iris Lost');
    await clickButton('Register Inquiry');
    await openLead('AT07 Lost Opportunity');
    await browserTab!.evaluate(`window.prompt=()=> 'Budget deferred';`);
    await setLeadStage('Lost');
    const loss = await browserTab!.evaluate<any>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).leads.find(l=>l.name==='AT07 Lost Opportunity')`);
    assert.equal(loss.lostReason, 'Budget deferred');
    assert.equal(loss.history.at(-1).reason, 'Budget deferred');
    assert.equal(await browserTab!.evaluate<boolean>('![...document.querySelectorAll(".modal-backdrop button")].some(b=>b.innerText.includes("Convert Opportunity"))'), true, 'lost opportunity cannot be converted');
    assert.equal(await browserTab!.evaluate<number>(`Number(document.querySelector('.metric .metric-val')?.innerText)`), await browserTab!.evaluate<number>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).leads.filter(l=>!['Won','Lost','Unqualified'].includes(l.stage)).length`), 'lost opportunities are excluded from open counts');
    await clickButton('✕');
    await clickButton('New Inquiry');
    await setLabel('Prospective Client Name', 'AT07 Unqualified Opportunity');
    await setLabel('Primary Contact', 'Aisha Unqualified');
    await clickButton('Register Inquiry');
    await openLead('AT07 Unqualified Opportunity');
    await setLeadStage('Discovery');
    await browserTab!.evaluate(`window.prompt=()=> 'Outside supported service scope';`);
    await setLeadStage('Unqualified');
    const unqualified = await browserTab!.evaluate<any>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).leads.find(l=>l.name==='AT07 Unqualified Opportunity')`);
    assert.equal(unqualified.history.at(-1).reason, 'Outside supported service scope');
    assert.equal(await browserTab!.evaluate<number>(`Number(document.querySelector('.metric .metric-val')?.innerText)`), await browserTab!.evaluate<number>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).leads.filter(l=>!['Won','Lost','Unqualified'].includes(l.stage)).length`), 'unqualified opportunities are excluded from open counts');
    await clickButton('✕');
    await clickButton('List view');
    assert.match(await browserTab!.evaluate<string>('document.querySelector("main#main")?.innerText || ""'), /AT07 Lost Opportunity[\s\S]*Lost[\s\S]*Budget deferred/);
    assert.match(await browserTab!.evaluate<string>('document.querySelector("main#main")?.innerText || ""'), /AT07 Unqualified Opportunity[\s\S]*Unqualified[\s\S]*Outside supported service scope/);
    await browserTab!.evaluate(`(() => {const row=[...document.querySelectorAll('.tablewrap tbody tr')].find(x=>x.innerText.includes('AT07 Lost Opportunity'));const b=[...(row?.querySelectorAll('button')||[])].find(x=>x.innerText==='Details');if(!b)throw Error('Lost outcome unavailable in list view');b.click();})()`);
    await setLeadStage('Discovery');
    const reopened = await browserTab!.evaluate<any>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).leads.find(l=>l.name==='AT07 Lost Opportunity')`);
    assert.equal(reopened.stage, 'Discovery');
    assert.equal(reopened.history.at(-2).reason, 'Budget deferred');
    await clickButton('✕');
    await clickButton('Pipeline view');
    await clickButton('New Inquiry');
    await setLabel('Prospective Client Name', 'AT07 Won Prospect');
    await setLabel('Primary Contact', 'Amina Won');
    await clickButton('Register Inquiry');
    const wonLeadId = await browserTab!.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).leads.find(l=>l.name==='AT07 Won Prospect')?.id`);
    assert.ok(wonLeadId);
    await openLead('AT07 Won Prospect');
    await setLeadStage('Discovery');
    await setLeadStage('Evaluation');
    await setLeadStage('Won');
    await setLabel('Discovery notes', 'Updated after evaluation.', 'textarea');
    await clickButton('Save Opportunity Details');
    assert.equal(await browserTab!.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).leads.find(l=>l.name==='AT07 Won Prospect').discoveryNotes`), 'Updated after evaluation.');
    await clickButton('Convert Won Opportunity to Prospect');
    const converted = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const l=s.leads.find(x=>x.id===${JSON.stringify(wonLeadId)});const c=s.clients.find(x=>x.id===l.convertedClientId);return {lead:l,client:c};})()`);
    assert.equal(converted.client.status, 'Prospect');
    assert.equal(converted.lead.accepted, false, 'commercial conversion does not grant professional acceptance');
    assert.ok(converted.lead.history.some((item: any) => item.stage === 'Won'));
    await clickButton('New Inquiry');
    await setLabel('Prospective Client Name', 'AT07 Existing Client Link');
    await setLabel('Primary Contact', 'Leila Existing');
    await clickButton('Register Inquiry');
    await openLead('AT07 Existing Client Link');
    await setLeadStage('Discovery');
    await setLeadStage('Evaluation');
    await setLeadStage('Won');
    const existingClientId = await browserTab!.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).clients[0].id`);
    const clientsBeforeLink = await browserTab!.evaluate<number>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).clients.length`);
    await browserTab!.evaluate(`(() => {const s=document.querySelector('[aria-label="Existing client for conversion"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(existingClientId)});s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await clickButton('Link Won Opportunity to Client');
    const linkedExistingClient = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return {lead:s.leads.find(l=>l.name==='AT07 Existing Client Link'),clients:s.clients.length};})()`);
    assert.equal(linkedExistingClient.lead.convertedClientId, existingClientId);
    assert.equal(linkedExistingClient.clients, clientsBeforeLink, 'linking an existing client creates no duplicate');
    await browserTab!.evaluate(`(() => {const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().startsWith('Proposals & Terms'));b.click();})()`);
    await waitForBrowser('document.querySelector("main#main")?.innerText.includes("Proposals")');
    await clickButton('New Proposal');
    await setLabel('Title', 'AT08 Journey Proposal');
    await browserTab!.evaluate(`(() => {const e=[...document.querySelectorAll('.modal-backdrop select')].find(x=>[...x.options].some(o=>o.value===${JSON.stringify(leadId)}));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,${JSON.stringify(leadId)});e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await setLabel('Scope', 'External audit of FY2026 statements', 'textarea');
    await setLabel('Exclusions', 'Tax advisory', 'textarea');
    await setLabel('Deliverables', 'Independent auditor report', 'textarea');
    await setLabel('Client responsibilities', 'Provide complete records', 'textarea');
    await setLabel('Fixed fee', '12500');
    await setLabel('Terms', 'Payment within 30 days.', 'textarea');
    await clickButton('Create Draft');
    const proposalId = await browserTab!.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).proposals.find(p=>p.title==='AT08 Journey Proposal')?.id`);
    assert.ok(proposalId);
    await clickButton('Review');
    await setPersona('Engagement partner');
    await clickButton('Record Review Decision');
    await clickButton('Mark Presented');
    const presented = await browserTab!.evaluate<any>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).proposals.find(p=>p.id===${JSON.stringify(proposalId)})`);
    assert.equal(presented.state, 'Presented');
    assert.equal(presented.presentedSnapshot.revision, presented.revision);
    assert.equal(presented.presentedSnapshot.items[0].scope, 'External audit of FY2026 statements');
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('AT-09: client records a presented proposal response with evidence without auto-creating an engagement', async () => {
    const before = await browserTab!.evaluate<any>(`(() => {const key='ste-auditsphere-role-portals-v2';const s=JSON.parse(localStorage.getItem(key));const p=s.proposals.find(x=>x.id==='PROP-001');p.state='Presented';p.presentedSnapshot={revision:p.revision,title:p.title,currency:p.currency,totalAmount:p.totalAmount,items:structuredClone(p.items),terms:p.terms,presentedBy:'Layla Rahman',presentedAt:'2026-09-23T10:00:00Z'};delete p.clientResponse;localStorage.setItem(key,JSON.stringify(s));return {engagements:s.engagements.length};})()`);
    await browserTab!.command('Page.reload');
    assert.equal(await waitForBrowser('!!document.querySelector("#role-select")'), true);
    const changed = await browserTab!.evaluate<boolean>(`(() => {const s=document.querySelector('#role-select');const o=[...s.options].find(x=>x.textContent.includes('Management approver'));if(!o)return false;Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
    assert.equal(changed, true);
    await clickButton('Proposals & Terms');
    const setLabel = async (label: string, value: string) => browserTab!.evaluate(`(() => {const l=[...document.querySelectorAll('label')].find(x=>x.textContent.includes(${JSON.stringify(label)}));const e=l?.querySelector('input,textarea');if(!e)throw Error('Missing '+${JSON.stringify(label)});const proto=e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await setLabel('Authorized signatory', 'Omar Nasser');
    await setLabel('Evidence reference', 'MAIL-AT09-2026-09-23');
    await setLabel('Response notes', 'Accepted the presented scope and fee.',);
    await clickButton('Record Acceptance');
    const after = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const p=s.proposals.find(x=>x.id==='PROP-001');return {state:p.state,response:p.clientResponse,engagements:s.engagements.length};})()`);
    assert.equal(after.state, 'Accepted');
    assert.equal(after.response.evidenceRef, 'MAIL-AT09-2026-09-23');
    assert.equal(after.engagements, before.engagements);
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('AT-10: creates a draft once from accepted proposal terms then requires partner activation evidence', async () => {
    await browserTab!.evaluate(`(() => {const key='ste-auditsphere-role-portals-v2';const s=JSON.parse(localStorage.getItem(key));const p=structuredClone(s.proposals.find(x=>x.id==='PROP-001'));p.id='PROP-AT10';p.title='AT10 Accepted Proposal';p.state='Accepted';p.clientResponse={responseType:'Accepted',contact:'Omar Nasser',date:'2026-09-23',method:'Email',notes:'Accepted current revision.',evidenceRef:'MAIL-AT10-ACCEPTED'};p.presentedSnapshot={revision:p.revision,title:p.title,currency:p.currency,totalAmount:p.totalAmount,items:structuredClone(p.items),terms:p.terms,presentedBy:'Layla Rahman',presentedAt:'2026-09-23T10:00:00Z'};s.proposals.push(p);localStorage.setItem(key,JSON.stringify(s));})()`);
    await browserTab!.command('Page.reload');
    assert.equal(await waitForBrowser('!!document.querySelector("#role-select")'), true);
    const setPersona = async () => browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');const o=[...s.options].find(x=>x.textContent.includes('Engagement partner'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await setPersona();
    await browserTab!.evaluate(`(() => {const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().startsWith('Engagements'));if(!b)throw Error('Missing engagements route');b.click();})()`);
    await clickButton('New Engagement');
    await browserTab!.evaluate(`(() => {const s=[...document.querySelectorAll('.modal-backdrop select')].find(e=>[...e.options].some(o=>o.value==='PROP-AT10'));if(!s)throw Error('Accepted proposal option missing: '+JSON.stringify({modal:!!document.querySelector('.modal-backdrop'),body:document.body.innerText.slice(-500),proposals:JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).proposals.filter(p=>p.id.startsWith('PROP-AT10'))}));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'PROP-AT10');s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await clickButton('Create Engagement');
    const draft = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const e=s.engagements.find(x=>x.proposalId==='PROP-AT10');return {id:e?.id,stage:e?.stage,client:e?.client,fee:e?.agreedFee,currency:e?.currency,acceptance:e?.acceptance,terms:e?.terms,count:s.engagements.filter(x=>x.proposalId==='PROP-AT10').length};})()`);
    assert.ok(draft.id);
    assert.equal(draft.stage, 'Draft');
    assert.equal(draft.client, 'CL-001');
    assert.equal(draft.acceptance, false);
    assert.equal(draft.terms, false);
    assert.equal(draft.count, 1);
    await browserTab!.evaluate(`window.prompt=()=> 'PARTNER-AT10-ACCEPTANCE';`);
    await clickButton('Activate Engagement');
    const active = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const e=s.engagements.find(x=>x.id===${JSON.stringify(draft.id)});return {stage:e.stage,acceptance:e.acceptance,terms:e.terms,record:e.professionalAcceptance};})()`);
    assert.equal(active.stage, 'Planning');
    assert.equal(active.acceptance, true);
    assert.equal(active.terms, true);
    assert.equal(active.record.evidenceRef, 'PARTNER-AT10-ACCEPTANCE');
    assert.equal(active.record.proposalRevision, 2);
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('AT-11/AT-12: blocks parent completion until subtasks finish and records an actual task reassignment', async () => {
    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');const o=[...s.options].find(x=>x.textContent.includes('Engagement manager'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const expectedProgress = await browserTab!.evaluate<any>(`(() => {const k='ste-auditsphere-role-portals-v2';const s=JSON.parse(localStorage.getItem(k));s.selectedEngagement='ENG-26001';const task=s.jobTasks.find(t=>t.id==='TSK-103');const job=s.jobs.find(j=>j.id===task.jobId);const leaves=s.jobTasks.filter(t=>t.jobId===job.id&&t.status!=='Cancelled'&&!s.jobTasks.some(sub=>sub.parentTaskId===t.id&&sub.status!=='Cancelled'));const expected={total:leaves.length,completed:leaves.filter(t=>t.status==='Completed').length};s.jobTasks.push({id:'TSK-AT11-CANCELLED-LEAF',jobId:job.id,title:'Cancelled leaf does not count',assignee:'Layla Rahman',status:'Cancelled',order:99});s.jobs.push({id:'JOB-AT11-CANCEL',clientId:'CL-001',engagementId:'ENG-26001',title:'AT-11 Safe Cancellation Fixture',owner:'Layla Rahman',dueDate:'2026-09-20',status:'In progress',createdAt:'2026-09-01T00:00:00.000Z'},{id:'JOB-AT11-EMPTY',clientId:'CL-001',engagementId:'ENG-26001',title:'AT-11 Empty Work Fixture',owner:'Layla Rahman',dueDate:'2026-10-31',status:'Not started',createdAt:'2026-09-01T00:00:00.000Z'});s.jobTasks.push({id:'TSK-AT11-CANCEL',jobId:'JOB-AT11-CANCEL',title:'Retained task',assignee:'Layla Rahman',status:'In progress',order:1});s.documents.push({id:'DOC-AT11-CANCEL',clientId:'CL-001',engagementId:'ENG-26001',name:'Retained job document.pdf',folderPath:'/Engagements/2026/Audit/',version:1,size:100,classification:'Client provided',visibility:'Internal',source:'SharePoint',linkedJobId:'JOB-AT11-CANCEL',uploadedBy:'Layla Rahman',uploadedAt:'2026-09-22T10:00:00.000Z'});s.times.push({id:'TIME-AT11-CANCEL',person:'Layla Rahman',clientId:'CL-001',engagementId:'ENG-26001',jobId:'JOB-AT11-CANCEL',taskId:'TSK-AT11-CANCEL',taskTitle:'Retained task',date:'2026-09-20',durationMinutes:60,billable:true,activity:'Testing',status:'Draft'});localStorage.setItem(k,JSON.stringify(s));return expected;})()`);
    await browserTab!.command('Page.reload');
    assert.equal(await waitForBrowser('!!document.querySelector("#app-root .brandname")'), true);
    await browserTab!.evaluate(`(() => {const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().startsWith('Jobs & Tasks'));if(!b)throw Error('Missing jobs route');b.click();})()`);
    assert.equal(await waitForBrowser(`document.body.innerText.includes('${expectedProgress.completed} of ${expectedProgress.total} leaf tasks')`), true, 'cancelled tasks are excluded from unique leaf-task progress');
    const before = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return {task:s.jobTasks.find(t=>t.id==='TSK-103').status,grants:s.roleGrants};})()`);
    await browserTab!.evaluate(`(() => {const box=[...document.querySelectorAll('.borderbox')].find(x=>x.innerText.includes('Fixed assets register verification and depreciation recalculation'));const check=box?.querySelector('input[type=checkbox]');if(!check)throw Error('Fixed asset parent task checkbox missing');check.click();})()`);
    assert.equal(await browserTab!.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).jobTasks.find(t=>t.id==='TSK-103').status`), before.task, 'open subtasks prevent parent completion');
    const reassign = await browserTab!.evaluate<boolean>(`(() => {const box=[...document.querySelectorAll('.borderbox')].find(x=>x.innerText.includes('Financial statement tie-out and disclosure review'));const button=[...(box?.querySelectorAll('button')||[])].find(x=>x.innerText.trim()==='Reassign');if(!button)return false;button.click();return true;})()`);
    assert.equal(reassign, true);
    await browserTab!.evaluate(`(() => {const s=document.querySelector('.modal-backdrop select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'Adam Khan');s.dispatchEvent(new Event('change',{bubbles:true}));const t=document.querySelector('.modal-backdrop textarea');const p=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;p.call(t,'Capacity balancing for the reporting deadline.');t.dispatchEvent(new Event('input',{bubbles:true}));t.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await clickButton('Confirm Reassignment');
    const after = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const t=s.jobTasks.find(t=>t.id==='TSK-104');return {assignee:t.assignee,history:t.reassignmentHistory,grants:s.roleGrants};})()`);
    assert.equal(after.assignee, 'Adam Khan');
    assert.equal(after.history.at(-1).from, 'Sara Malik');
    assert.equal(after.history.at(-1).to, 'Adam Khan');
    assert.equal(after.history.at(-1).reason, 'Capacity balancing for the reporting deadline.');
    assert.deepEqual(after.grants, before.grants, 'general task assignment does not grant professional approval authority');
    await browserTab!.evaluate(`(() => {const button=document.querySelector('[aria-label="Edit task TSK-104"]');if(!button)throw Error('Task edit control unavailable');button.click();})()`);
    await browserTab!.evaluate(`(() => {const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;const title=document.querySelector('[aria-label="Edited task title"]');set.call(title,'Tie out statements and disclosures');title.dispatchEvent(new Event('input',{bubbles:true}));const date=document.querySelector('[aria-label="Edited task due date"]');set.call(date,'2026-10-15');date.dispatchEvent(new Event('input',{bubbles:true}));const desc=document.querySelector('[aria-label="Edited task description"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(desc,'Reconcile statement disclosures to reviewed source balances.');desc.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await clickButton('Save Task');
    assert.equal(await waitForBrowser(`(() => {const t=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).jobTasks.find(x=>x.id==='TSK-104');return t.title==='Tie out statements and disclosures'&&t.description.includes('reviewed source balances')&&t.dueDate==='2026-10-15'&&t.assignee==='Adam Khan'&&t.reassignmentHistory.at(-1).reason==='Capacity balancing for the reporting deadline.';})()`), true, 'editing task details retains its assignment and reassignment audit history');
    await browserTab!.evaluate(`(() => {window.prompt=()=> 'Waiting for updated asset register';const status=document.querySelector('[aria-label="Task status TSK-104"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(status,'Blocked');status.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`(() => {const t=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).jobTasks.find(x=>x.id==='TSK-104');return t.status==='Blocked'&&t.blockedReason==='Waiting for updated asset register';})()`), true, 'blocked task state requires and retains its explanation');
    await browserTab!.evaluate(`(() => {const status=document.querySelector('[aria-label="Task status TSK-104"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(status,'In progress');status.dispatchEvent(new Event('change',{bubbles:true}));const button=document.querySelector('[aria-label="Move Fixed assets register verification and depreciation recalculation up"]');button?.click();})()`);
    assert.equal(await waitForBrowser(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return s.jobTasks.find(x=>x.id==='TSK-103').order===2&&s.jobTasks.find(x=>x.id==='TSK-102').order===3&&s.jobTasks.find(x=>x.id==='TSK-104').status==='In progress'&&!s.jobTasks.find(x=>x.id==='TSK-104').blockedReason;})()`), true, 'ordered task movement swaps siblings and clearing a block removes its reason');
    await browserTab!.evaluate(`(() => {window.prompt=()=> 'Work was superseded.';const status=document.querySelector('[aria-label="Task status TSK-104"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(status,'Cancelled');status.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`(() => {const t=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).jobTasks.find(x=>x.id==='TSK-104');return t.status==='Cancelled'&&t.statusHistory.at(-1).reason==='Work was superseded.';})()`), true, 'task cancellation retains the reason and actor history');
    await browserTab!.evaluate(`(() => {window.prompt=()=> 'The required work is back in scope.';const status=document.querySelector('[aria-label="Task status TSK-104"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(status,'In progress');status.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`(() => {const t=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).jobTasks.find(x=>x.id==='TSK-104');return t.status==='In progress'&&t.statusHistory.at(-1).reason==='The required work is back in scope.';})()`), true, 'reopening a cancelled task requires and records a reason');
    const setJobFilter = async (label: string, value: string) => browserTab!.evaluate(`(() => {const el=document.querySelector('[aria-label="${label}"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await setJobFilter('Jobs client filter', 'CL-001');
    await setJobFilter('Jobs engagement filter', 'ENG-26001');
    await setJobFilter('Jobs owner filter', 'Layla Rahman');
    await setJobFilter('Jobs status filter', 'In progress');
    await browserTab!.evaluate(`document.querySelector('[aria-label="Overdue jobs only"]').click()`);
    assert.equal(await waitForBrowser(`[...document.querySelectorAll('tbody tr')].some(r=>r.innerText.includes('JOB-AT11-CANCEL'))`), true, 'register filters combine client, engagement, owner, status and overdue state');
    await setJobFilter('Jobs status filter', 'ALL');
    await browserTab!.evaluate(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(r=>r.innerText.includes('JOB-AT11-CANCEL'));row.click();})()`);
    assert.equal(await waitForBrowser(`document.querySelector('.eyebrow')?.innerText.includes('JOB-AT11-CANCEL')`), true, 'selected job workspace follows the clicked register row');
    await clickButton('Edit Job Details');
    await browserTab!.evaluate(`(() => {const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;const title=document.querySelector('[aria-label="Edited job title"]');set.call(title,'AT-11 Cancellation Fixture');title.dispatchEvent(new Event('input',{bubbles:true}));const desc=document.querySelector('[aria-label="Edited job description"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(desc,'Retained scope details after client cancellation.');desc.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await clickButton('Save Job Details');
    assert.equal(await waitForBrowser(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const j=s.jobs.find(x=>x.id==='JOB-AT11-CANCEL');return j.title==='AT-11 Cancellation Fixture'&&j.description.includes('Retained scope details')&&s.events.some(e=>e.ref===j.id&&e.text.includes('details updated: title, description'));})()`), true, 'manager edits job title and scope details with a history event');
    await browserTab!.evaluate(`(() => {window.prompt=()=> 'Awaiting client approval.';const status=document.querySelector('[aria-label="Selected job status"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(status,'Blocked');status.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).jobs.find(j=>j.id==='JOB-AT11-CANCEL').blockedReason==='Awaiting client approval.'`), true, 'blocked status persists its required reason');
    await browserTab!.evaluate(`(() => {const status=document.querySelector('[aria-label="Selected job status"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(status,'In progress');status.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).jobs.find(j=>j.id==='JOB-AT11-CANCEL').status==='In progress'`);
    await browserTab!.evaluate(`(() => {const status=document.querySelector('[aria-label="Selected job status"]');window.prompt=()=> 'Scope was cancelled by the client.';Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(status,'Cancelled');status.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const cancelled = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return {job:s.jobs.find(j=>j.id==='JOB-AT11-CANCEL'),task:s.jobTasks.find(t=>t.id==='TSK-AT11-CANCEL'),document:s.documents.find(d=>d.id==='DOC-AT11-CANCEL'),time:s.times.find(t=>t.id==='TIME-AT11-CANCEL'),event:s.events.find(e=>e.ref==='JOB-AT11-CANCEL')}})()`);
    assert.equal(cancelled.job.status, 'Cancelled');
    assert.equal(cancelled.job.cancellationReason, 'Scope was cancelled by the client.');
    assert.equal(cancelled.job.cancelledByUserId, 'manager');
    assert.ok(cancelled.job.cancelledAt);
    assert.equal(cancelled.task.id, 'TSK-AT11-CANCEL', 'job cancellation retains task history');
    assert.equal(cancelled.document.linkedJobId, 'JOB-AT11-CANCEL', 'job cancellation retains linked document history');
    assert.equal(cancelled.time.jobId, 'JOB-AT11-CANCEL', 'job cancellation retains linked time history');
    assert.match(cancelled.event.text, /Scope was cancelled by the client/);
    await browserTab!.evaluate(`document.querySelector('[aria-label="Overdue jobs only"]').click()`);
    await setJobFilter('Jobs status filter', 'Cancelled');
    await browserTab!.evaluate(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(r=>r.innerText.includes('JOB-AT11-CANCEL'));if(!row)throw Error('Cancelled job is missing from its status-filtered register');row.click();})()`);
    assert.equal(await waitForBrowser(`document.querySelector('.eyebrow')?.innerText.includes('JOB-AT11-CANCEL')`), true);
    const jobDetails = await browserTab!.evaluate<string>('document.body.innerText');
    assert.match(jobDetails, /Job Files \(1\)/);
    assert.match(jobDetails, /Retained job document\.pdf/);
    assert.match(jobDetails, /Job Time \(1\)/);
    assert.match(jobDetails, /Retained task/);
    const cancelledControls = await browserTab!.evaluate<boolean>(`(() => document.querySelector('[aria-label="Selected job status"]')?.disabled&&[...document.querySelectorAll('.borderbox input[type=checkbox]')].every(e=>e.disabled)&&[...document.querySelectorAll('.borderbox button')].every(e=>e.disabled))()`);
    assert.equal(cancelledControls, true, 'cancelled work remains visible and read-only');
    const retainedJobId = await browserTab!.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).jobTasks.find(t=>t.id==='TSK-104').jobId`);
    await browserTab!.command('Page.reload');
    assert.equal(await waitForBrowser('!!document.querySelector("#app-root .brandname")'), true);
    await browserTab!.evaluate(`(() => {const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().startsWith('Jobs & Tasks'));b.click();})()`);
    await browserTab!.evaluate(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(r=>r.innerText.includes(${JSON.stringify(retainedJobId)}));if(!row)throw Error('Task job is missing after reload');row.click();})()`);
    assert.equal(await waitForBrowser("document.body.innerText.includes('Tie out statements and disclosures')&&document.body.innerText.includes('Assigned: Adam Khan')"), true, 'edited ownership and task text survive reload');
    assert.equal(await browserTab!.evaluate<boolean>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return s.jobTasks.find(t=>t.id==='TSK-103').order===2&&s.jobTasks.find(t=>t.id==='TSK-102').order===3;})()`), true, 'task sibling order survives reload');
    assert.equal(await browserTab!.evaluate<boolean>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).jobTasks.find(t=>t.id==='TSK-104').status==='In progress'`), true, 'task status survives reload');
    await browserTab!.evaluate(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(r=>r.innerText.includes('JOB-AT11-EMPTY'));if(!row)throw Error('Empty-work job is missing');row.click();})()`);
    assert.equal(await waitForBrowser("document.body.innerText.includes('No active leaf tasks (0%)')&&document.body.innerText.includes('No tasks defined for this job yet.')"), true, 'empty work is shown as no tasks rather than an unexplained zero');
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('AT-13: explicitly applies a published template with fresh tasks and no copied work state', async () => {
    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');const o=[...s.options].find(x=>x.textContent.includes('Engagement manager'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await browserTab!.evaluate(`(() => {const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().startsWith('Job Templates'));if(!b)throw Error('Missing job templates route');b.click();})()`);
    const before = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const t=s.jobTemplates.find(x=>x.id==='TPL-JOB-01');return {jobs:s.jobs.length,tasks:s.jobTasks.length,jobIds:s.jobs.map(j=>j.id),template:t};})()`);
    const opened = await browserTab!.evaluate<boolean>(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes('TPL-JOB-01'));const b=[...(row?.querySelectorAll('button')||[])].find(x=>x.innerText.trim()==='Use Template');if(!b)return false;b.click();return true;})()`);
    assert.equal(opened, true);
    await browserTab!.evaluate(`(() => {const s=[...document.querySelectorAll('.modal-backdrop select')].find(x=>[...x.options].some(o=>o.value==='ENG-26001'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'ENG-26001');s.dispatchEvent(new Event('change',{bubbles:true}));const d=document.querySelector('.modal-backdrop input[type=date]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(d,'2026-11-01');d.dispatchEvent(new Event('input',{bubbles:true}));d.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await clickButton('Instantiate Job');
    const after = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const j=s.jobs.find(x=>x.fromTemplateId==='TPL-JOB-01'&&!${JSON.stringify(before.jobIds)}.includes(x.id));return {jobs:s.jobs.length,tasks:s.jobTasks.length,job:j,tree:j?s.jobTasks.filter(t=>t.jobId===j.id):[]};})()`);
    assert.equal(after.jobs, before.jobs + 1);
    assert.ok(after.job, 'one fresh template job was created');
    assert.equal(after.job.clientId, 'CL-001');
    assert.equal(after.job.engagementId, 'ENG-26001');
    assert.equal(after.tasks > before.tasks, true);
    assert.equal(after.tree.length, before.template.tasks.reduce((n: number, t: any) => n + 1 + (t.subtasks?.length || 0), 0));
    assert.ok(after.tree.every((task: any) => task.status === 'Not started'), 'template application does not copy prior task state');
    assert.ok(after.tree.every((task: any) => task.jobId === after.job.id && task.id !== 'TSK-103'), 'template application assigns a fresh job/task tree');
    await browserTab!.evaluate(`(() => {const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().startsWith('Job Templates'));if(!b)throw Error('Missing job templates route');b.click();})()`);
    await clickButton('Author New Template');
    await browserTab!.evaluate(`(() => {const set=(label,value)=>{const l=[...document.querySelectorAll('.modal-backdrop label')].find(x=>x.textContent.includes(label));const field=l?.parentElement?.querySelector('input,textarea');if(!field)throw Error('Missing template field '+label);const p=field instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(field,value);field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));};set('Template Name','AT13 Lifecycle Template');set('Default Job Title','AT13 Lifecycle Job');set('Template Description','Lifecycle acceptance fixture');set('Standard Phases','Planning\\nReview');})()`);
    await clickButton('Create Draft Template');
    const authored = await browserTab!.evaluate<any>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).jobTemplates.find(t=>t.name==='AT13 Lifecycle Template')`);
    assert.equal(authored.status, 'Draft');
    assert.deepEqual(authored.tasks.map((task: any) => task.title), ['Planning', 'Review']);
    const jobsBeforeLifecycle = await browserTab!.evaluate<number>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).jobs.length`);
    await clickButton('Publish Template');
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).jobTemplates.find(t=>t.id===${JSON.stringify(authored.id)}).status==='Published'`), true);
    await clickButton('Create Job from Template');
    await clickButton('Instantiate Job');
    const lifecycleJob = await browserTab!.evaluate<any>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).jobs.find(j=>j.fromTemplateId===${JSON.stringify(authored.id)})`);
    assert.ok(lifecycleJob);
    assert.equal(lifecycleJob.status, 'Not started');
    assert.equal(lifecycleJob.fromTemplateRevision, authored.revision, 'job pins the exact published template revision');
    assert.equal(await browserTab!.evaluate<number>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).jobs.length`), jobsBeforeLifecycle + 1);
    await browserTab!.evaluate(`(() => {const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().startsWith('Job Templates'));b.click();})()`);
    await browserTab!.evaluate(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes(${JSON.stringify(authored.id)}));row.click();})()`);
    await clickButton('Create New Revision');
    await browserTab!.evaluate(`(() => {const label=[...document.querySelectorAll('.modal-backdrop label')].find(x=>x.textContent.includes('Standard Phases'));const t=label?.parentElement?.querySelector('textarea');if(!t)throw Error('Revision phases textarea missing');const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')?.set;if(!setter)throw Error('Textarea value setter missing');setter.call(t,'Planning Revised\\nReview\\nClose');t.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await clickButton('Save Draft Revision');
    const revised = await browserTab!.evaluate<any>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).jobTemplates.find(t=>t.revisionOfId===${JSON.stringify(authored.id)})`);
    assert.equal(revised.revision, authored.revision + 1);
    assert.equal(revised.status, 'Draft');
    assert.deepEqual(revised.tasks.map((task: any) => task.title), ['Planning Revised', 'Review', 'Close']);
    const unchanged = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return {old:s.jobTemplates.find(t=>t.id===${JSON.stringify(authored.id)}),job:s.jobs.find(j=>j.id===${JSON.stringify(lifecycleJob.id)}),tree:s.jobTasks.filter(t=>t.jobId===${JSON.stringify(lifecycleJob.id)})};})()`);
    assert.equal(unchanged.old.status, 'Published');
    assert.deepEqual(unchanged.old.tasks, authored.tasks);
    assert.equal(unchanged.job.fromTemplateRevision, 1);
    assert.equal(unchanged.tree.some((task: any) => task.title === 'Planning'), true);
    await clickButton('Publish Template');
    const jobsBeforeRevision = await browserTab!.evaluate<number>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).jobs.length`);
    await clickButton('Create Job from Template');
    await browserTab!.evaluate(`(() => {const form=document.querySelector('.modal-backdrop form');if(!form)throw Error('Template instantiation form missing');form.requestSubmit();form.requestSubmit();})()`);
    const jobFromRevision = await browserTab!.evaluate<any>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).jobs.find(j=>j.fromTemplateId===${JSON.stringify(revised.id)})`);
    assert.equal(jobFromRevision.fromTemplateRevision, 2);
    assert.equal(await browserTab!.evaluate<number>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).jobs.length`), jobsBeforeRevision + 1);
    await browserTab!.evaluate(`(() => {const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().startsWith('Job Templates'));b.click();})()`);
    await browserTab!.evaluate(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes(${JSON.stringify(authored.id)}));if(!row)throw Error('Authored template row missing');row.click();})()`);
    await clickButton('Retire Template');
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).jobTemplates.find(t=>t.id===${JSON.stringify(authored.id)}).status==='Retired'`), true);
    assert.equal(await browserTab!.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).jobs.find(j=>j.id===${JSON.stringify(lifecycleJob.id)}).status`), 'Not started', 'retirement preserves the created job');
    assert.equal(await browserTab!.evaluate<boolean>(`[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes(${JSON.stringify(authored.id)})).querySelector('button').disabled`), true, 'retired template cannot be instantiated');
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('AT-14: keeps job notes internal and records only scope-authorized local mentions', async () => {
    await browserTab!.evaluate(`(() => {const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().startsWith('Jobs & Tasks'));if(!b)throw Error('Missing jobs route');b.click();})()`);
    await clickButton('Add Internal Note');
    await browserTab!.evaluate(`(() => {const t=document.querySelector('.modal-backdrop textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'AT14 staff-only coordination note.');t.dispatchEvent(new Event('input',{bubbles:true}));t.dispatchEvent(new Event('change',{bubbles:true}));const s=document.querySelector('.modal-backdrop select[multiple]');for(const name of ['Daniel James','Adam Khan']){const o=[...s.options].find(x=>x.textContent.includes(name));if(!o)throw Error('No authorized staff mention option for '+name);o.selected=true;}s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await clickButton('Save Internal Note');
    const comment = await browserTab!.evaluate<any>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).comments.find(c=>c.text==='AT14 staff-only coordination note.')`);
    assert.ok(comment);
    assert.equal(comment.visibility, 'internal');
    assert.equal(comment.mentions.length, 2);
    assert.equal(await browserTab!.evaluate<boolean>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return s.localNotices.filter(n=>n.commentId===${JSON.stringify(comment.id)}).length===2&&s.localNotices.filter(n=>n.commentId===${JSON.stringify(comment.id)}).every(n=>${JSON.stringify(comment.mentions)}.includes(n.recipientUserId));})()`), true, 'mention notices are persisted only for the selected recipients');
    assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /AT14 staff-only coordination note/);
    await browserTab!.evaluate(`(() => {const button=[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')?.startsWith('Edit internal note'));if(!button)throw Error('Internal note edit control missing');button.click();})()`);
    await browserTab!.evaluate(`(() => {const t=document.querySelector('.modal-backdrop textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'AT14 revised staff-only coordination note.');t.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await clickButton('Save Note Changes');
    const editedComment = await browserTab!.evaluate<any>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).comments.find(c=>c.id===${JSON.stringify(comment.id)})`);
    assert.equal(editedComment.editedBy, comment.author);
    assert.ok(editedComment.editedAt);
    assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /AT14 revised staff-only coordination note/);
    await clickButton('Add task note');
    await browserTab!.evaluate(`(() => {const t=document.querySelector('.modal-backdrop textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'AT14 internal task note.');t.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await clickButton('Save Internal Note');
    const taskNote = await browserTab!.evaluate<any>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).comments.find(c=>c.text==='AT14 internal task note.')`);
    assert.equal(taskNote.subjectType, 'task');
    assert.ok(await browserTab!.evaluate<boolean>(`document.body.innerText.includes('AT14 internal task note.')`));
    const taskFileId = await browserTab!.evaluate<string>(`(() => {const s=document.querySelector('select[aria-label^="Task file to link"]');if(!s||s.options.length<2)throw Error('No same-engagement document can be linked to a task');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,s.options[1].value);s.dispatchEvent(new Event('change',{bubbles:true}));return s.options[1].value;})()`);
    await clickButton('Link file');
    assert.equal(await browserTab!.evaluate<boolean>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).documents.find(d=>d.id===${JSON.stringify(taskFileId)}).linkedTaskId===${JSON.stringify(taskNote.subjectId)}`), true, 'the task retains its registered document reference');
    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');const o=[...s.options].find(x=>x.textContent.includes('Engagement partner')&&x.textContent.includes('Daniel James'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().startsWith('Jobs & Tasks'));b.click();})()`);
    assert.equal(await waitForBrowser(`document.body.innerText.includes('My Local Notices')&&document.body.innerText.includes('Layla Rahman mentioned you on job')`), true, 'recipient sees a local notice without the comment text in the notice preview');
    await clickButton('Mark read');
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).localNotices.some(n=>n.commentId===${JSON.stringify(comment.id)}&&n.recipientUserId===JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentUserId&&n.readAt)`), true, 'only the signed-in mention recipient can mark their notice read');
    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');const o=[...s.options].find(x=>x.textContent.includes('Mariam Saeed'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().startsWith('Jobs & Tasks'));b.click();const card=[...document.querySelectorAll('.borderbox')].find(x=>x.innerText.includes('AT14 revised staff-only coordination note.'));window.prompt=()=> 'Contains information that should not remain in a staff comment.';[...card.querySelectorAll('button')].find(x=>x.innerText.trim()==='Moderate').click();})()`);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).comments.find(c=>c.id===${JSON.stringify(comment.id)}).moderationHistory.at(-1).action==='Hidden'`), true, 'moderator hides the note with attributable history');
    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');const o=[...s.options].find(x=>x.textContent.includes('Audit preparer'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().startsWith('Jobs & Tasks'));b.click();})()`);
    assert.equal(await waitForBrowser("document.body.innerText.includes('My Local Notices')"), true, 'another named recipient sees their own notice');
    assert.doesNotMatch(await browserTab!.evaluate<string>('document.body.innerText'), /AT14 revised staff-only coordination note/);
    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');const o=[...s.options].find(x=>x.textContent.includes('Management approver'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const clientView = await browserTab!.evaluate<string>('document.body.innerText');
    assert.match(clientView, /CLIENT SECURE PORTAL/);
    assert.doesNotMatch(clientView, /AT14 revised staff-only coordination note/);
    assert.doesNotMatch(clientView, /AT14 internal task note/);
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('AT-27: logs a received meeting note manually and keeps the internal record out of the client portal', async () => {
    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');const o=[...s.options].find(x=>x.textContent.includes('Engagement manager'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().startsWith('Team & Client Comms'));if(!b)throw Error('Missing communications route');b.click();})()`);
    await clickButton('Log Call / Meeting Note');
    const setNoteField = async (label: string, value: string) => browserTab!.evaluate(`(() => {const l=[...document.querySelectorAll('.modal-backdrop label')].find(x=>x.textContent.includes(${JSON.stringify(label)}));const e=l?.parentElement?.querySelector('input,textarea');if(!e)throw Error('Missing '+${JSON.stringify(label)});const p=e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await setNoteField('Summary Header', 'AT27 Received meeting note');
    await setNoteField('Discussion Notes', 'Client confirmed the inventory count date.',);
    await browserTab!.evaluate(`(() => {const l=[...document.querySelectorAll('.modal-backdrop label')].find(x=>x.textContent.includes('Related job'));const s=l?.querySelector('select');if(!s||s.options.length<2)throw Error('No related job choices');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,s.options[1].value);s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await clickButton('Save Note');
    const saved = await browserTab!.evaluate<any>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).communications.find(c=>c.summary==='AT27 Received meeting note')`);
    assert.equal(saved.direction, 'Inbound');
    assert.equal(saved.visibility, 'Internal');
    assert.equal(saved.body, 'Client confirmed the inventory count date.');
    assert.ok(saved.jobId, 'the manually logged communication keeps its related job identity');
    await browserTab!.evaluate(`(() => {const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().startsWith('Jobs & Tasks'));b.click();})()`);
    assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /AT27 Received meeting note/, 'the job view projects the same communication record');
    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');const o=[...s.options].find(x=>x.textContent.includes('Management approver'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await clickButton('Messages & Mail');
    assert.doesNotMatch(await browserTab!.evaluate<string>('document.body.innerText'), /AT27 Received meeting note|Client confirmed the inventory count date/);
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('AT-26: resolves a mail template and records accepted, failed, and unknown outcomes locally', async () => {
    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');const o=[...s.options].find(x=>x.textContent.includes('Engagement manager'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().startsWith('Team & Client Comms'));if(!b)throw Error('Missing communications route');b.click();})()`);
    const initialCount = await browserTab!.evaluate<number>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).communications.length`);
    await clickButton('Compose Simulated Email');
    await browserTab!.evaluate(`(() => {const input=document.querySelector('[aria-label="Email recipient"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'aisha.saleh@northstar.demo');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await clickButton('Simulate Send');
    assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /Recipient must be an active contact for this client/);
    assert.equal(await browserTab!.evaluate<number>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).communications.length`), initialCount, 'out-of-client recipient produces no attempt record');
    await browserTab!.evaluate(`(() => {const input=document.querySelector('[aria-label="Email recipient"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'omar.nasser@example-trading.demo');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await clickButton('Cancel');
    for (const [outcome, expected] of [['Simulated accepted', 'Simulated accepted'], ['Simulated failed', 'Simulated failed'], ['Outcome unknown', 'Outcome unknown']] as const) {
      await clickButton('Compose Simulated Email');
      await browserTab!.evaluate(`(() => {const label=[...document.querySelectorAll('.modal-backdrop label')].find(x=>x.textContent.includes('Email Template'));const select=label.parentElement.querySelector('select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'TPL-EM-01');select.dispatchEvent(new Event('change',{bubbles:true}));const outcome=[...document.querySelectorAll('.modal-backdrop label')].find(x=>x.textContent.includes('Simulated Delivery Outcome')).parentElement.querySelector('select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(outcome,${JSON.stringify(outcome)});outcome.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      const rendered = await browserTab!.evaluate<any>(`(() => {const m=document.querySelector('.modal-backdrop');return {subject:m.querySelector('input[type=text]').value,body:m.querySelector('textarea').value};})()`);
      assert.match(rendered.subject, /Example Trading Entity/, 'client placeholder resolves in subject');
      assert.match(rendered.body, /Omar Nasser/, 'contact placeholder resolves in body');
      assert.doesNotMatch(`${rendered.subject}\n${rendered.body}`, /\{client_name\}|\{client_contact\}|\{request_title\}|\{due_date\}/, 'no unresolved template placeholders');
      await clickButton('Simulate Send');
    }
    const saved = await browserTab!.evaluate<any>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).communications.slice(0,3)`);
    assert.equal(saved.length, 3);
    assert.deepEqual(saved.map((item: any) => item.status).sort(), ['Outcome unknown', 'Simulated accepted', 'Simulated failed']);
    assert.equal(new Set(saved.map((item: any) => item.id)).size, 3, 'each explicit simulation has one unique record');
    assert.equal(new Set(saved.map((item: any) => item.simulationReference)).size, 3, 'each manual click records one unique simulation reference');
    assert.ok(saved.every((item: any) => item.recipientEmail === 'omar.nasser@example-trading.demo' && item.simulationEvidence.includes('no provider receipt')));
    assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /Simulation evidence · MAIL-SIM-/);
    assert.ok(saved.every((item: any) => item.direction === 'Outbound' && item.visibility === 'Client visible'));
    assert.equal(await browserTab!.evaluate<number>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).communications.length`), initialCount + 3, 'no automatic retry or duplicate record');
    assert.deepEqual(browserTab!.requests.filter(url => /^https?:/.test(url) && !url.startsWith(baseUrl)), [], 'simulated send makes no external mail request');
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('AT-21: keeps OneDrive optional until enabled and preserves SharePoint as canonical storage', async () => {
    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'admin');s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentUserId === 'admin'`), true, 'administrator persona is active');
    assert.equal(await waitForBrowser(`[...document.querySelectorAll('nav button')].some(x=>x.innerText.trim()==='Microsoft 365 Setup')`), true, 'administrator can open M365 setup');
    await browserTab!.evaluate(`(() => {const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim()==='Microsoft 365 Setup');if(!b)throw Error('Microsoft 365 Setup navigation is missing');b.click();})()`);
    assert.equal(await waitForBrowser('document.querySelector(".crumb")?.innerText.includes("M365 SETUP")'), true, 'M365 setup route opened');
    const setupText = await browserTab!.evaluate<string>('document.body.innerText');
    assert.match(setupText, /OneDrive/, 'M365 setup renders the optional OneDrive section');
    const disabled = await browserTab!.evaluate<boolean>(`(() => {const label=[...document.querySelectorAll('label')].find(x=>x.innerText.includes('Enable bounded OneDrive'));return [...label.closest('.panel').querySelectorAll('button')].filter(x=>x.innerText.includes('Success (simulated)')).every(x=>x.disabled);})()`);
    assert.equal(disabled, true, 'optional OneDrive verification is disabled by default');
    await browserTab!.evaluate(`(() => {const label=[...document.querySelectorAll('label')].find(x=>x.innerText.includes('Enable bounded OneDrive'));const input=label.querySelector('input[type=checkbox]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'checked').set.call(input,true);input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await clickButton('Save simulated configuration');
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).m365Config.oneDriveEnabled === true`), true, 'optional import selection was saved');
    const cardText = await browserTab!.evaluate<string>('document.body.innerText');
    assert.match(cardText, /OneDrive \(optional\)/i);
    await clickPanelButton('onedrive (optional)', 'Simulate: Success (simulated)');
    const configBefore = await browserTab!.evaluate<any>(`(() => {const c=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).m365Config;return {enabled:c.oneDriveEnabled,site:c.sharePointSite,root:c.folderRoot,revision:c.configRevision};})()`);
    assert.equal(configBefore.enabled, true);
    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'manager');s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentUserId === 'manager'`), true);
    await browserTab!.evaluate(`(() => {const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().startsWith('Documents & SharePoint'));if(!b)throw Error('Documents navigation is missing');b.click();})()`);
    assert.equal(await waitForBrowser('document.querySelector(".crumb")?.innerText.includes("DOCUMENTS")'), true, 'document library route opened');
    await clickButton('Import from OneDrive');
    await clickButton('Record sample metadata');
    const imported = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const d=s.documents.find(x=>x.source==='OneDrive Import');return {doc:d,config:s.m365Config};})()`);
    assert.ok(imported.doc, 'explicit sample selection registers one local document record');
    assert.equal(imported.doc.folderPath, '/Engagements/2026/Audit/');
    assert.equal(imported.doc.clientId, 'CL-001');
    assert.equal(imported.config.sharePointSite, configBefore.site, 'OneDrive import does not change the canonical SharePoint site');
    assert.equal(imported.config.folderRoot, configBefore.root);
    assert.deepEqual(browserTab!.requests.filter(url => /^https?:/.test(url) && !url.startsWith(baseUrl)), []);
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('AT-20: registers a replacement file without silently changing its pinned evidence reference', async () => {
    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'manager');s.dispatchEvent(new Event('change',{bubbles:true}));const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().startsWith('Documents & SharePoint'));if(!b)throw Error('Documents navigation is missing');b.click();})()`);
    const opened = await browserTab!.evaluate<boolean>(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes('DOC-002'));const b=[...(row?.querySelectorAll('button')||[])].find(x=>x.innerText.trim()==='Open in M365');if(!b)return false;b.click();return true;})()`);
    assert.equal(opened, true, 'linked bank statement can be opened');
    await browserTab!.evaluate(`(() => {const input=document.querySelector('.modal-backdrop input[type=file]');if(!input)throw Error('Replacement file input missing');const transfer=new DataTransfer();transfer.items.add(new File(['replacement bank statement'], 'Bank_Statement_December_v2.pdf', {type:'application/pdf'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await clickButton('Record Replacement v2');
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).documents.some(d=>d.supersedesDocumentId==='DOC-002')`), true, 'replacement revision recorded');
    const stateAfter = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return {old:s.documents.find(d=>d.id==='DOC-002'),next:s.documents.find(d=>d.supersedesDocumentId==='DOC-002'),evidence:s.evidenceCatalogue.find(e=>e.id==='EVD-01'),replacementEvidence:s.evidenceCatalogue.find(e=>e.documentId===s.documents.find(d=>d.supersedesDocumentId==='DOC-002').id),procedures:s.auditPrograms.flatMap(p=>p.procedures).filter(p=>p.id==='PRC-01'||p.id==='PRC-02'),workpaper:s.engagements.find(e=>e.id==='ENG-26001').workpapers.find(w=>w.id==='WP-A1')};})()`);
    assert.equal(stateAfter.old.version, 1);
    assert.equal(stateAfter.next.version, 2);
    assert.equal(stateAfter.evidence.documentId, 'DOC-002');
    assert.equal(stateAfter.evidence.version, 1);
    assert.equal(stateAfter.replacementEvidence.adequacyStatus, 'Pending verification');
    assert.ok(stateAfter.procedures.every((procedure: any) => procedure.evidenceReassessmentRequired && procedure.status === 'In progress'));
    assert.equal(stateAfter.workpaper.status, 'Changes required');
    assert.equal(stateAfter.workpaper.clearance, null);
    assert.equal(stateAfter.workpaper.clearanceHistory.length, 1);
    await browserTab!.evaluate(`(() => {const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().startsWith('Evidence Catalogue'));if(!b)throw Error('Evidence Catalogue navigation missing');b.click();})()`);
    const evidenceView = await browserTab!.evaluate<string>('document.body.innerText');
    assert.match(evidenceView, /Pinned v1/);
    assert.match(evidenceView, /Newer version available/);

    const replacementEvidenceId = stateAfter.replacementEvidence.id;
    const replacementRowExists = await browserTab!.evaluate<boolean>(`[...document.querySelectorAll('tbody tr')].some(row=>row.innerText.includes(${JSON.stringify(replacementEvidenceId)})&&row.innerText.includes('Pending verification'))`);
    assert.equal(replacementRowExists, true, 'reviewer can identify the new evidence revision for adequacy review');
    await clickButton('Mark Adequate');
    assert.equal(await waitForBrowser(`(() => {const ev=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).evidenceCatalogue.find(x=>x.id===${JSON.stringify(replacementEvidenceId)});return ev.adequacyStatus==='Adequate'&&ev.adequacyHistory.at(-1).actorId==='manager';})()`), true, 'independent manager records the replacement evidence adequacy decision');
    await browserTab!.evaluate(`(() => {const select=document.querySelector('[aria-label="Procedure to link ${replacementEvidenceId}"]');if(!select||![...select.options].some(option=>option.value==='PRC-01'))throw Error('Scoped replacement evidence link control is missing PRC-01');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'PRC-01');select.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('[aria-label="Link ${replacementEvidenceId} to selected procedure"]').click();})()`);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).evidenceCatalogue.find(x=>x.id===${JSON.stringify(replacementEvidenceId)}).linkedProcedures.includes('PRC-01')`), true, 'reviewed current evidence is linked through the scoped catalogue action');

    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'preparer');s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentRole==='preparer'`), true);
    await browserTab!.evaluate(`(() => {const e=document.querySelector('select[aria-label="Selected engagement"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'ENG-26001');e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).selectedEngagement==='ENG-26001'`), true);
    await clickButton('Risks & Audit Programs');
    assert.equal(await waitForBrowser('document.body.innerText.includes("Audit Risks & Substantive Programs")'), true);
    await clickButton('Cash and Bank Balances');
    await browserTab!.evaluate(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes('PRC-01'));const edit=[...row.querySelectorAll('button')].find(button=>button.innerText.trim()==='Record fieldwork');if(!edit)throw Error('Record fieldwork action is missing');edit.click();})()`);
    assert.equal(await waitForBrowser('!!document.querySelector(`[aria-label="Work performed for PRC-01"]`)'), true, 'fieldwork editor opens for the selected procedure');
    await browserTab!.evaluate(`(() => {const work=document.querySelector('[aria-label="Work performed for PRC-01"]');const conclusion=document.querySelector('[aria-label="Conclusion for PRC-01"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(work,'Reassessed using the reviewed replacement bank statement v2.');work.dispatchEvent(new Event('input',{bubbles:true}));Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(conclusion,'Replacement statement agrees to the ledger.');conclusion.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await clickButton('Save fieldwork');
    await browserTab!.evaluate(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes('PRC-01'));const select=row.querySelector('select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'Submitted');select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`(() => {const p=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).auditPrograms.flatMap(x=>x.procedures).find(x=>x.id==='PRC-01');return p.status==='Submitted'&&!p.evidenceReassessmentRequired&&p.workPerformed.includes('replacement bank statement v2');})()`), true, 'preparer reassesses and resubmits work against the new evidence');
    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');const option=[...s.options].find(x=>x.textContent.includes('Senior reviewer — Sara'));if(!option)throw Error('Independent reviewer identity is missing');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,option.value);s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await browserTab!.evaluate(`(() => {const select=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes('PRC-01')).querySelector('select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'Cleared');select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`(() => {const p=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).auditPrograms.flatMap(x=>x.procedures).find(x=>x.id==='PRC-01');return p.status==='Cleared'&&p.reviewedByUserId==='reviewer'&&!!p.reviewedAt;})()`), true, 'independent reviewer re-clears the reassessed work');

    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');const o=[...s.options].find(x=>x.textContent.includes('Audit preparer — Adam Khan'));if(!o)throw Error('Assigned workpaper preparer is missing');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentPerson==='Adam Khan'`), true);
    await browserTab!.evaluate(`(() => {const e=document.querySelector('select[aria-label="Selected engagement"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'ENG-26001');e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).selectedEngagement==='ENG-26001'`), true);
    await clickButtonStartingWith('Audit Workpapers');
    assert.equal(await waitForBrowser('document.body.innerText.includes("Engagement Workpapers")'), true);
    await clickButton('5. Pinned Evidence');
    await browserTab!.evaluate(`(() => {window.prompt=()=> 'Superseded by reviewed current bank statement v2.';const b=document.querySelector('[aria-label="Unpin DOC-002 from WP-A1"]');if(!b)throw Error('Stale WP-A1 evidence pin cannot be removed');b.click();})()`);
    assert.equal(await waitForBrowser(`(() => {const w=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26001').workpapers.find(x=>x.id==='WP-A1');return !w.evidenceRefs.includes('DOC-002')&&w.evidenceLinkHistory.at(-1).action==='Unlinked'&&w.evidenceLinkHistory.at(-1).reason.includes('Superseded');})()`), true, 'stale workpaper pin is removed with actor-attributed reason history');
    await browserTab!.evaluate(`(() => {const s=document.querySelector('[aria-label="Workpaper evidence document"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(stateAfter.next.id)});s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await clickButton('Pin evidence revision');
    assert.equal(await waitForBrowser(`(() => {const w=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26001').workpapers.find(x=>x.id==='WP-A1');return w.evidenceRefs.length===1&&w.evidenceRefs[0]===${JSON.stringify(stateAfter.next.id)}&&w.evidenceRevisions[${JSON.stringify(stateAfter.next.id)}]===2;})()`), true, 'workpaper now pins only the reviewed current document revision');
    await clickButton('1. Objective & Scope');
    await browserTab!.evaluate(`(() => {const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;for(const [label,value] of [['Workpaper scope','Cash and bank balances reassessed to the reviewed replacement statement v2.'],['Work performed','Reconciled the new statement v2 and retested the confirmation/cut-off evidence.'],['Workpaper conclusion','The replacement statement agrees to the ledger; no exceptions remain.']]){const field=document.querySelector('[aria-label="'+label+'"]');set.call(field,value);field.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
    await clickButton('Save workpaper revision');
    await clickButton('4. Artifact & Revision');
    await clickButton('Upload Replacement Revision');
    await browserTab!.evaluate(`(async() => {const response=await fetch('/templates/WP-A1_Cash_and_Bank_Audit_Template.xlsx');const bytes=await response.arrayBuffer();const file=new File([bytes],'WP-A1_Replacement_Statement_v2.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});const input=document.querySelector('.modal-backdrop input[type=file]');const transfer=new DataTransfer();transfer.items.add(file);input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await browserTab!.evaluate(`document.querySelector('.modal-backdrop form').requestSubmit()`);
    assert.equal(await waitForBrowser(`(() => {const w=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26001').workpapers.find(x=>x.id==='WP-A1');return w.workingPaper.version===w.version&&w.workingPaper.name==='WP-A1_Replacement_Statement_v2.xlsx';})()`), true, 'a new workbook revision is pinned to the updated workpaper version');
    await clickButton('1. Objective & Scope');
    await clickButton('Submit for independent review');
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26001').workpapers.find(w=>w.id==='WP-A1').status==='Submitted'`), true, 'reassessed workpaper submits with current evidence and current workbook');
    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');const o=[...s.options].find(x=>x.textContent.includes('Senior reviewer — Sara'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await clickButton('6. Clearance & History');
    await clickButton('Sign & Clear Workpaper');
    assert.equal(await waitForBrowser(`(() => {const w=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26001').workpapers.find(x=>x.id==='WP-A1');return w.status==='Cleared'&&w.clearance.clearedBy==='Sara Malik'&&w.evidenceLinkHistory.at(-1).action==='Linked';})()`), true, 'independent reviewer re-clears the replacement workpaper revision');
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('VP-021: keeps stable document identity through rename, move and unavailable-reference recovery', async () => {
    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'manager');s.dispatchEvent(new Event('change',{bubbles:true}));const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().startsWith('Documents & SharePoint'));b.click();})()`);
    await browserTab!.evaluate(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes('DOC-002'));window.prompt=()=> 'Client requested temporary withdrawal pending review.';[...row.querySelectorAll('button')].find(x=>x.innerText==='Withdraw sharing').click();})()`);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).documents.find(x=>x.id==='DOC-002').visibility==='Internal'&&JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).documents.find(x=>x.id==='DOC-002').sharingHistory.at(-1).reason.includes('temporary withdrawal')`), true, 'withdrawal records actor, time, direction and reason');
    await browserTab!.evaluate(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes('DOC-002'));window.prompt=()=> 'Client approved restored sharing.';[...row.querySelectorAll('button')].find(x=>x.innerText==='Share with client').click();})()`);
    await browserTab!.evaluate(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes('DOC-002'));[...row.querySelectorAll('button')].find(x=>x.innerText==='Open in M365').click();})()`);
    assert.match(await browserTab!.evaluate<string>('document.querySelector(".modal-backdrop")?.innerText||""'), /Sharing history \(2\)/);
    await clickButton('Close Viewer');
    await browserTab!.evaluate(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes('DOC-002'));let i=0;window.prompt=()=>i++===0?'Moved bank statement.pdf':'/Engagements/2026/Accounting/';[...row.querySelectorAll('button')].find(x=>x.innerText==='Rename / Move').click();})()`);
    assert.equal(await waitForBrowser(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const d=s.documents.find(x=>x.id==='DOC-002');return d.name==='Moved bank statement.pdf'&&d.folderPath==='/Engagements/2026/Accounting/'&&s.evidenceCatalogue.find(x=>x.id==='EVD-01').documentId==='DOC-002';})()`), true, 'renaming and moving retain stable document/evidence IDs');
    await browserTab!.evaluate(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes('DOC-002'));window.prompt=()=> 'Source item deleted';[...row.querySelectorAll('button')].find(x=>x.innerText==='Simulate unavailable').click();})()`);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).documents.find(x=>x.id==='DOC-002').brokenLink===true`), true, 'unavailable reference state is persisted');
    const blocked = await browserTab!.evaluate<boolean>(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes('DOC-002'));return row.innerText.includes('Reference unavailable')&&row.querySelector('button').disabled&&row.querySelector('button').innerText==='Unavailable';})()`);
    assert.equal(blocked, true, 'unavailable item cannot be opened');
    await browserTab!.evaluate(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes('DOC-002'));[...row.querySelectorAll('button')].find(x=>x.innerText==='Restore reference').click();})()`);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).documents.find(x=>x.id==='DOC-002').brokenLink===false`), true, 'restoring reference re-enables the existing stable identity');
  });

  it('VP-053: records reasoned evidence unlink history and keeps the linked procedure stale', async () => {
    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'manager');s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentRole==='manager'`), true);
    await clickButton('Evidence Catalogue');
    assert.equal(await waitForBrowser('document.querySelector("h1")?.innerText==="Evidence Catalogue"'), true);
    await browserTab!.evaluate(`(() => {window.prompt=()=> 'Workpaper now relies on the superseding bank statement.';const b=document.querySelector('button[aria-label="Unlink PRC-02 from EVD-01"]');if(!b)throw Error('Expected scoped evidence unlink control: '+[...document.querySelectorAll('button')].map(x=>x.getAttribute('aria-label')||x.innerText).join('|'));b.click();})()`);
    assert.equal(await waitForBrowser(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const ev=s.evidenceCatalogue.find(x=>x.id==='EVD-01');const proc=s.auditPrograms.flatMap(x=>x.procedures).find(x=>x.id==='PRC-02');return !ev.linkedProcedures.includes('PRC-02')&&ev.linkedProcedureHistory.at(-1).action==='Unlinked'&&ev.linkedProcedureHistory.at(-1).reason.includes('superseding')&&proc.evidenceReassessmentRequired;})()`), true, 'unlink preserves actor/reason history and requires fieldwork reassessment');
    assert.equal(await waitForBrowser('document.body.innerText.includes("prior link retained in history")'), true, 'the evidence catalogue explains the version history and stale dependent');
    const clientUserId = await browserTab!.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).users.find(u=>u.label==='Management approver').id`);
    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(clientUserId)});s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentRole==='client'`), true);
    await clickButton('Shared Documents');
    const projectedEvidenceDocs = await browserTab!.evaluate<string>('document.body.innerText');
    assert.match(projectedEvidenceDocs, /Bank_Statement_December/);
    assert.doesNotMatch(projectedEvidenceDocs, /WP-A1_Cash_and_Bank_Audit_Schedule|EVD-01|PRC-02/, 'client projection must hide internal workpaper and internal evidence-link identifiers after unlink');
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('AT-22: persists selected-file metadata across reload and explains that original bytes are unavailable', async () => {
    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'manager');s.dispatchEvent(new Event('change',{bubbles:true}));const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().startsWith('Documents & SharePoint'));if(!b)throw Error('Documents navigation is missing');b.click();})()`);
    await clickButton('Register File');
    await browserTab!.evaluate(`(() => {const input=document.querySelector('.modal-backdrop input[type=file]');const transfer=new DataTransfer();transfer.items.add(new File(['AT22_BYTES_MUST_NOT_PERSIST'], 'AT22_Metadata_Only.txt', {type:'text/plain'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await clickButton('Record file metadata');
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).documents.some(d=>d.name==='AT22_Metadata_Only.txt')`), true);
    const saved = await browserTab!.evaluate<any>(`(() => {const raw=localStorage.getItem('ste-auditsphere-role-portals-v2');const s=JSON.parse(raw);return {doc:s.documents.find(d=>d.name==='AT22_Metadata_Only.txt'),raw};})()`);
    assert.match(saved.doc.sha, /^[a-f0-9]{64}$/i);
    assert.equal(saved.doc.source, 'Local In-Session');
    assert.equal(saved.raw.includes('AT22_BYTES_MUST_NOT_PERSIST'), false, 'file bytes are not persisted');
    await browserTab!.command('Page.reload');
    assert.equal(await waitForBrowser('!!document.querySelector("#app-root .brandname")'), true);
    await browserTab!.evaluate(`(() => {const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().startsWith('Documents & SharePoint'));if(!b)throw Error('Documents navigation is missing after reload');b.click();})()`);
    const opened = await browserTab!.evaluate<boolean>(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes('AT22_Metadata_Only.txt'));const b=[...(row?.querySelectorAll('button')||[])].find(x=>x.innerText.trim()==='Open in M365');if(!b)return false;b.click();return true;})()`);
    assert.equal(opened, true, 'selected file metadata remains visible after reload');
    const preview = await browserTab!.evaluate<string>('document.querySelector(".modal-backdrop").innerText');
    assert.match(preview, /Original file content is unavailable/);
    assert.match(preview, /No original file bytes are stored/);
    assert.doesNotMatch(preview, /Download original/i);
    assert.deepEqual(browserTab!.requests.filter(url => /^https?:/.test(url) && !url.startsWith(baseUrl)), []);
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('AT-30/VP-030: drafts an invoice from approved time and reserves the source once', async () => {
    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'billing');s.dispatchEvent(new Event('change',{bubbles:true}));const e=document.querySelector('select[aria-label="Selected engagement"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'ENG-26001');e.dispatchEvent(new Event('change',{bubbles:true}));const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().startsWith('Billing & Invoices'));if(!b)throw Error('Billing navigation is missing');b.click();})()`);
    await clickButton('Draft New Invoice');
    const selected = await browserTab!.evaluate<boolean>(`(() => {const label=[...document.querySelectorAll('.modal-backdrop label')].find(x=>x.innerText.includes('Bank reconciliations & circularisations'));const input=label?.querySelector('input[type=checkbox]');if(!input)return false;input.click();return input.checked;})()`);
    assert.equal(selected, true, `approved time should be selectable as an invoice source; modal=${await browserTab!.evaluate<string>('document.querySelector(".modal-backdrop .modal-body")?.innerText || "missing"')}`);
    await browserTab!.evaluate(`(() => {const input=document.querySelector('.modal-backdrop input[type=text]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'INV-AT30');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.match(await browserTab!.evaluate<string>('document.querySelector(".modal-backdrop input[type=number]")?.value || ""'), /^600$/, 'three approved hours at QAR 200/hour should total QAR 600');
    await clickButton('Create Draft');
    const result = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const i=s.invoices.find(x=>x.invoiceNumber==='INV-AT30');const t=s.times.find(x=>x.id==='TIME-01');return {invoice:i,time:t};})()`);
    assert.equal(result.invoice.status, 'Draft');
    assert.equal(result.invoice.amount, 600);
    assert.deepEqual(result.invoice.lines.map((line: any) => [line.sourceType,line.sourceId,line.quantity,line.rate,line.amount]), [['Time entry','TIME-01',3,200,600]]);
    assert.equal(result.time.billedInvoiceId, result.invoice.id);
    await clickButton('Draft New Invoice');
    assert.equal(await browserTab!.evaluate<boolean>(`[...document.querySelectorAll('.modal-backdrop label')].some(x=>x.innerText.includes('Bank reconciliations & circularisations'))`), false, 'reserved time source must disappear from future draft choices');
    const fixedSelected = await browserTab!.evaluate<boolean>(`(() => {const label=[...document.querySelectorAll('.modal-backdrop label')].find(x=>x.innerText.includes('Accepted fixed-fee services'));const input=label?.querySelector('input[type=checkbox]');if(!input)return false;input.click();return input.checked;})()`);
    assert.equal(fixedSelected, true, 'remaining accepted proposal service balance should be selectable');
    assert.equal(await waitForBrowser('document.querySelector(".modal-backdrop input[type=number]")?.value === "100000"'), true, `historical source invoices should reduce the fixed-fee balance to QAR 100,000; state=${await browserTab!.evaluate<string>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const p=s.proposals.find(x=>x.id==='PROP-001');return JSON.stringify({proposal:p?.items.filter(i=>i.feeModel==='Fixed').reduce((a,i)=>a+i.amount,0),fixed:s.invoices.filter(i=>i.clientId==='CL-001'&&(i.engagementId||i.eng)==='ENG-26001'&&i.status!=='Cancelled').flatMap(i=>i.lines).filter(l=>l.sourceType==='Fixed service').map(l=>l.amount),invoiceAmounts:s.invoices.map(i=>[i.invoiceNumber,i.amount,i.status])});})()` )}`);
    await browserTab!.evaluate(`(() => {const input=document.querySelector('.modal-backdrop input[type=text]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'INV-AT30S');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await clickButton('Create Draft');
    const fixed = await browserTab!.evaluate<any>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).invoices.find(i=>i.invoiceNumber==='INV-AT30S')`);
    assert.equal(fixed.amount, 100000);
    assert.equal(fixed.lines[0].sourceType, 'Fixed service');
    assert.equal(fixed.lines[0].sourceId, 'proposal:PROP-001:r2');
    await clickButton('Draft New Invoice');
    assert.equal(await browserTab!.evaluate<boolean>(`[...document.querySelectorAll('.modal-backdrop label')].some(x=>x.innerText.includes('Accepted fixed-fee services'))`), false, 'fully consumed accepted proposal balance must disappear from future draft choices');
    await clickButton('Cancel');
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('AT-31/VP-031: requires independent invoice and credit review before issue', async () => {
    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'manager');s.dispatchEvent(new Event('change',{bubbles:true}));const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().startsWith('Billing & Invoices'));if(!b)throw Error('Billing navigation is missing');b.click();})()`);
    await clickButton('Draft New Invoice');
    await browserTab!.evaluate(`(() => {const set=(label,value)=>{const l=[...document.querySelectorAll('.modal-backdrop label')].find(x=>x.textContent.includes(label));const f=l?.parentElement?.querySelector('input');if(!f)throw Error('Missing invoice field '+label);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(f,value);f.dispatchEvent(new Event('input',{bubbles:true}));f.dispatchEvent(new Event('change',{bubbles:true}));};set('Invoice Number','INV-AT31');set('Fee Description','AT31 acceptance invoice');set('Invoice Amount (QAR)','100000');})()`);
    await clickButton('Create Draft');
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).invoices.some(i=>i.invoiceNumber==='INV-AT31')`), true);
    const invoice = await browserTab!.evaluate<any>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).invoices.find(i=>i.invoiceNumber==='INV-AT31')`);
    assert.equal(invoice.status, 'Draft');
    const selfApprove = await browserTab!.evaluate<boolean>(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes('INV-AT31'));const b=[...row.querySelectorAll('button')].find(x=>x.innerText.trim()==='Approve');if(!b)return false;b.click();return true;})()`);
    assert.equal(selfApprove, true);
    assert.equal(await waitForBrowser('document.body.innerText.toLowerCase().includes("cannot approve their own invoice")'), true, 'preparer cannot approve own invoice');
    assert.equal(await browserTab!.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).invoices.find(i=>i.id===${JSON.stringify(invoice.id)}).status`), 'Draft');
    const setPersona = async (id: string) => browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(id)});s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const invoiceAction = async (number: string, action: string) => browserTab!.evaluate<boolean>(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes(${JSON.stringify(number)}));const b=[...(row?.querySelectorAll('button')||[])].find(x=>x.innerText.trim()===${JSON.stringify(action)});if(!b)return false;b.click();return true;})()`);
    await setPersona('billing');
    assert.equal(await invoiceAction('INV-AT31','Approve'), true);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).invoices.find(i=>i.id===${JSON.stringify(invoice.id)}).status==='Approved'`), true);
    await setPersona('partner');
    assert.equal(await invoiceAction('INV-AT31','Issue'), true);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).invoices.find(i=>i.id===${JSON.stringify(invoice.id)}).status==='Issued'`), true);
    assert.equal(await invoiceAction('INV-AT31','Credit Note'), true);
    await clickButton('Create Draft Credit Note');
    const credit = await browserTab!.evaluate<any>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).creditNotes.find(c=>c.invoiceId===${JSON.stringify(invoice.id)})`);
    assert.ok(credit);
    assert.equal(credit.status, 'Draft');
    await setPersona('billing');
    assert.equal(await invoiceAction(credit.creditNumber,'Approve'), true);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).creditNotes.find(c=>c.id===${JSON.stringify(credit.id)}).status==='Approved'`), true);
    await browserTab!.evaluate(`(() => {const select=document.querySelector('#role-select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'manager');select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentRole==='manager'`), true);
    assert.equal(await invoiceAction(credit.creditNumber,'Issue'), true);
    const final = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return {invoice:s.invoices.find(i=>i.id===${JSON.stringify(invoice.id)}),credit:s.creditNotes.find(c=>c.id===${JSON.stringify(credit.id)})};})()`);
    assert.equal(final.credit.status, 'Issued');
    assert.equal(final.credit.reviewedBy, 'Leila Hassan');
    assert.equal(final.credit.issuedBy, 'Layla Rahman');
    assert.equal(final.invoice.creditsApplied, credit.amount);
    assert.equal(final.invoice.amount-final.invoice.creditsApplied, 75000);
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('AT-50/VP-061: client search excludes internal activity and finds shared documents', async () => {
    await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2',${JSON.stringify(JSON.stringify(createInitialState()))})`);
    await browserTab!.command('Page.reload');
    assert.equal(await waitForBrowser('!!document.querySelector("#role-select")'), true);
    const clientUserId = await browserTab!.evaluate<string>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return s.users.find(u=>u.label==='Client administrator').id;})()`);
    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(clientUserId)});s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser('JSON.parse(localStorage.getItem("ste-auditsphere-role-portals-v2")).currentRole==="client_admin"'), true, 'multi-grant client administrator must be active before search');
    assert.equal(await waitForBrowser(`document.querySelector('#role-select')?.value===${JSON.stringify(clientUserId)}`), true);
    const search = async (query: string) => {
      await browserTab!.evaluate(`document.querySelector('.search-trigger')?.click()`);
      assert.equal(await waitForBrowser('!!document.querySelector(".modal-backdrop input")'), true, 'search dialog should open for the active client persona');
      await browserTab!.evaluate(`(() => {const input=document.querySelector('.modal-backdrop input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(query)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await new Promise(resolve => setTimeout(resolve, 100));
      return browserTab!.evaluate<string>('document.querySelector(".modal-backdrop .modal-body")?.innerText || ""');
    };
    const internal = await browserTab!.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).communications.find(c=>c.visibility==='Internal').summary`);
    assert.match(await search(internal), /No matching records found/);
    const sharedName = await browserTab!.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).documents.find(d=>d.visibility==='Client shared'&&d.name.includes('Draft_Financial_Statements')).name`);
    const shared = await search(sharedName);
    assert.ok(shared.includes(sharedName));
    assert.match(shared, /Shared document/);
    const sharedEngagementId = await browserTab!.evaluate<string>('JSON.parse(localStorage.getItem("ste-auditsphere-role-portals-v2")).documents.find(d=>d.name===' + JSON.stringify(sharedName) + ').engagementId');
    const sharedContext = 'engagement:' + sharedEngagementId;
    await browserTab!.evaluate('(() => {const type=document.querySelector("#global-search-type");Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set.call(type,"Shared document");type.dispatchEvent(new Event("change",{bubbles:true}));const context=document.querySelector("#global-search-context");Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set.call(context,' + JSON.stringify(sharedContext) + ');context.dispatchEvent(new Event("change",{bubbles:true}));})()');
    assert.equal(await waitForBrowser('[...document.querySelectorAll(".modal-body button")].length===1&&[...document.querySelectorAll(".modal-body button")][0].innerText.includes("Shared document")'), true, 'client filters retain only the shared document in its permitted engagement');
    const clientSearchContexts = await browserTab!.evaluate<string[]>('[...document.querySelector("#global-search-context").options].map(option=>option.value)');
    assert.ok(clientSearchContexts.includes(sharedContext), 'the document result remains within its permitted engagement filter');
    assert.ok(clientSearchContexts.includes('client:CL-001') && clientSearchContexts.includes('client:CL-003'), 'multi-grant client sees both explicitly granted client filters');
    assert.equal(clientSearchContexts.includes('client:CL-002'), false, 'multi-grant client cannot discover an ungranted client through search filters');
    const hasHiddenEngagement = await browserTab!.evaluate<boolean>('JSON.parse(localStorage.getItem("ste-auditsphere-role-portals-v2")).engagements.some(e=>!' + JSON.stringify(clientSearchContexts) + '.includes("engagement:"+e.id))');
    assert.equal(hasHiddenEngagement, true, 'a client cannot discover ungranted engagements through filter options');
    await browserTab!.evaluate(`(() => {const result=[...document.querySelectorAll('.modal-body button')].find(button=>button.innerText.includes('Shared document'));if(!result)throw Error('Shared document result missing');result.click();})()`);
    assert.equal(await waitForBrowser(`document.querySelector('.crumb')?.innerText.includes('PORTAL')`), true, 'shared client search result opens the portal');
    assert.equal(await browserTab!.evaluate<boolean>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const d=s.documents.find(x=>x.name===${JSON.stringify(sharedName)});return s.selectedEngagement===d.engagementId;})()`), true, 'shared document result selects its permitted engagement context');
    await browserTab!.evaluate(`(() => {const select=document.querySelector('#role-select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'manager');select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentRole==='manager'`), true);
    const clientName = await browserTab!.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).clients.find(c=>c.id==='CL-001').name`);
    await search(clientName);
    await browserTab!.evaluate(`(() => {const result=[...document.querySelectorAll('.modal-body button')].find(button=>button.innerText.includes('Client · CL-001'));if(!result)throw Error('Client result missing');result.click();})()`);
    assert.equal(await waitForBrowser(`document.querySelector('.crumb')?.innerText.includes('CLIENT DETAIL')`), true, 'staff client search result opens the selected client detail');
    assert.ok((await browserTab!.evaluate<string>('document.body.innerText')).includes(clientName), 'client result opens the matching client record');
    assert.match(await search('audit'), /Job · JOB-2601/, 'search spans matching business records');
    const setSearchFilter = async (id: string, value: string) => {
      const script = '(() => {const select=document.querySelector(' + JSON.stringify(id) + ');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set.call(select,' + JSON.stringify(value) + ');select.dispatchEvent(new Event("change",{bubbles:true}));})()';
      await browserTab!.evaluate(script);
    };
    await setSearchFilter('#global-search-type', 'Job');
    assert.equal(await waitForBrowser('[...document.querySelectorAll(".modal-body button")].length>0&&[...document.querySelectorAll(".modal-body button")].every(button=>button.innerText.includes("Job ·"))'), true, 'record-type filter returns only jobs');
    await setSearchFilter('#global-search-context', 'engagement:ENG-26002');
    assert.equal(await waitForBrowser('document.querySelector(".modal-body")?.innerText.includes("No matching records found")'), true, 'context filter removes matching records from other engagements');
    await setSearchFilter('#global-search-context', 'engagement:ENG-26001');
    assert.equal(await waitForBrowser('[...document.querySelectorAll(".modal-body button")].some(button=>button.innerText.includes("Job · JOB-2601"))'), true, 'permitted engagement context restores only its matching job');
    await browserTab!.evaluate(`(() => {const result=[...document.querySelectorAll('.modal-body button')].find(button=>button.innerText.includes('Job · JOB-2601'));if(!result)throw Error('Job result missing');result.click();})()`);
    assert.equal(await waitForBrowser(`document.querySelector('.crumb')?.innerText.includes('JOBS')`), true, 'job result opens the Jobs workspace');
    assert.equal(await browserTab!.evaluate<boolean>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).selectedEngagement==='ENG-26001'`), true, 'job result selects its engagement');
    assert.match(await search('INV-26002'), /Invoice · 200000 QAR/, 'record IDs are searchable for invoices');
    await browserTab!.evaluate(`(() => {const result=[...document.querySelectorAll('.modal-body button')].find(button=>button.innerText.includes('Invoice · 200000 QAR'));if(!result)throw Error('Invoice result missing');result.click();})()`);
    assert.equal(await waitForBrowser(`document.querySelector('.crumb')?.innerText.includes('BILLING')`), true, 'invoice result opens Billing');
    assert.equal(await browserTab!.evaluate<boolean>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).selectedEngagement==='ENG-26001'`), true, 'invoice result selects its engagement');
    const taskId = await browserTab!.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).jobTasks.find(task=>!task.parentTaskId).id`);
    await search(taskId);
    await browserTab!.evaluate(`(() => {const result=[...document.querySelectorAll('.modal-body button')].find(button=>button.innerText.includes(${JSON.stringify('Task · ' + taskId)}));if(!result)throw Error('Task result missing');result.click();})()`);
    assert.equal(await waitForBrowser(`document.querySelector('.crumb')?.innerText.includes('JOBS')`), true, 'task result opens Jobs');
    assert.equal(await waitForBrowser(`document.querySelector('[data-search-target="true"]')!==null`), true, 'task result selects and highlights its parent job task');
    const workpaperId = await browserTab!.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(engagement=>engagement.id==='ENG-26001').workpapers[0].id`);
    await search(workpaperId);
    await browserTab!.evaluate(`(() => {const result=[...document.querySelectorAll('.modal-body button')].find(button=>button.innerText.includes(${JSON.stringify('Workpaper · ' + workpaperId)}));if(!result)throw Error('Workpaper result missing');result.click();})()`);
    assert.equal(await waitForBrowser(`document.querySelector('.crumb')?.innerText.includes('AUDIT')`), true, 'workpaper result opens Audit');
    assert.equal(await waitForBrowser(`[...document.querySelectorAll('tbody tr.selected-row')].some(row=>row.innerText.includes(${JSON.stringify(workpaperId)}))`), true, 'workpaper result selects the matching workpaper');
    const contactId = await browserTab!.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).contacts[0].id`);
    await search(contactId);
    await browserTab!.evaluate(`(() => {const result=[...document.querySelectorAll('.modal-body button')].find(button=>button.innerText.includes(${JSON.stringify('Contact · ')}));if(!result)throw Error('Contact result missing');result.click();})()`);
    assert.equal(await waitForBrowser(`document.querySelector('.crumb')?.innerText.includes('CLIENT DETAIL')`), true, 'contact result opens its client detail');
    assert.equal(await waitForBrowser(`document.querySelector('[data-search-target="true"]')?.innerText.includes(document.querySelector('[data-search-target="true"]')?.querySelector('td')?.innerText)`), true, 'contact result opens the Contacts tab and selects the matching contact');
    const pbcId = await browserTab!.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.flatMap(engagement=>engagement.pbc).find(Boolean).id`);
    await search(pbcId);
    await browserTab!.evaluate(`(() => {const result=[...document.querySelectorAll('.modal-body button')].find(button=>button.innerText.includes(${JSON.stringify('PBC · ' + pbcId)}));if(!result)throw Error('PBC result missing');result.click();})()`);
    assert.equal(await waitForBrowser(`document.querySelector('.crumb')?.innerText.includes('CLIENT DETAIL')`), true, 'PBC result opens its client detail');
    assert.equal(await waitForBrowser(`document.querySelector('[data-search-target="true"]')?.innerText.includes(${JSON.stringify(pbcId)})`), true, 'PBC result opens Requests and selects the matching request');
    const findingId = await browserTab!.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).findings[0].id`);
    await search(findingId);
    await browserTab!.evaluate(`(() => {const result=[...document.querySelectorAll('.modal-body button')].find(button=>button.innerText.includes(${JSON.stringify('Finding · ' + findingId)}));if(!result)throw Error('Finding result missing');result.click();})()`);
    assert.equal(await waitForBrowser(`document.querySelector('.crumb')?.innerText.includes('FINDINGS')`), true, 'finding result opens Findings');
    assert.equal(await waitForBrowser(`document.querySelector('[data-search-target="true"]')?.innerText.includes(${JSON.stringify(findingId)})`), true, 'finding result selects the matching finding');
    const doc = await browserTab!.evaluate<any>(`(() => {const d=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).documents.find(document=>document.clientId==='CL-001');return {id:d.id,name:d.name};})()`);
    await search(doc.name);
    await browserTab!.evaluate(`(() => {const result=[...document.querySelectorAll('.modal-body button')].find(button=>button.innerText.includes(${JSON.stringify('Document · v')}));if(!result)throw Error('Document result missing');result.click();})()`);
    assert.equal(await waitForBrowser(`document.querySelector('.crumb')?.innerText.includes('DOCUMENTS')`), true, 'document result opens Documents');
    assert.equal(await waitForBrowser(`document.querySelector('[data-search-target="true"]')?.innerText.includes(${JSON.stringify(doc.name)})`), true, 'document result selects the exact document');
    const markUnavailable = browserTab!.evaluate<boolean>(`(() => {const row=document.querySelector('[data-search-target="true"]');const button=[...(row?.querySelectorAll('button')||[])].find(item=>item.innerText.trim()==='Simulate unavailable');if(!button)return false;button.click();return true;})()`);
    await new Promise(resolve=>setTimeout(resolve,50));
    await browserTab!.command('Page.handleJavaScriptDialog',{accept:true,promptText:'AT50 unavailable source fixture'});
    assert.equal(await markUnavailable,true);
    assert.equal(await waitForBrowser(`document.querySelector('[data-search-target="true"] button')?.disabled`), true, 'unavailable documents cannot be opened');
    await search(doc.id);
    assert.match(await browserTab!.evaluate<string>(`[...document.querySelectorAll('.modal-body button')].find(button=>button.innerText.includes(${JSON.stringify(doc.name)}))?.innerText||''`), /Unavailable/);
    await browserTab!.evaluate(`(() => {const result=[...document.querySelectorAll('.modal-body button')].find(button=>button.innerText.includes(${JSON.stringify(doc.name)}));if(!result)throw Error('Unavailable document result missing');result.click();})()`);
    assert.equal(await waitForBrowser(`document.querySelector('[data-search-target="true"]')?.innerText.includes('Reference unavailable')`), true, 'unavailable search target opens its record with its state visible');
    await browserTab!.evaluate(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));s.clients.find(client=>client.id==='CL-001').status='Archived';localStorage.setItem('ste-auditsphere-role-portals-v2',JSON.stringify(s));})()`);
    await browserTab!.command('Page.reload');
    assert.equal(await waitForBrowser('!!document.querySelector("#role-select")'), true);
    await search('CL-001');
    assert.match(await browserTab!.evaluate<string>(`[...document.querySelectorAll('.modal-body button')].find(button=>button.innerText.includes('CL-001'))?.innerText||''`), /Archived/);
    await browserTab!.evaluate(`(() => {const result=[...document.querySelectorAll('.modal-body button')].find(button=>button.innerText.includes('CL-001'));if(!result)throw Error('Archived client result missing');result.click();})()`);
    assert.equal(await waitForBrowser(`document.querySelector('.crumb')?.innerText.includes('CLIENT DETAIL')`), true, 'archived client result still opens its historical client record');
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('AT-32/AT-33 VP-032/033: filters aging and statements, splits one offline receipt across invoices and reverses one allocation', async t => {
    const priorState = await browserTab!.evaluate<string | null>(`localStorage.getItem('ste-auditsphere-role-portals-v2')`);
    t.after(async () => {
      await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2',${JSON.stringify(priorState ?? JSON.stringify(createInitialState()))})`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#role-select")');
    });
    await browserTab!.evaluate(`(() => {const s=${JSON.stringify(createInitialState())};const invoice={...s.invoices.find(i=>i.id==='INV-26002'),id:'INV-AT32-SECOND',invoiceNumber:'INV-AT32-SECOND',paid:0,status:'Issued'};const foreignCurrencyInvoice={...invoice,id:'INV-AT32-USD',invoiceNumber:'INV-AT32-USD',currency:'USD'};s.invoices.push(invoice,foreignCurrencyInvoice);localStorage.setItem('ste-auditsphere-role-portals-v2',JSON.stringify(s));})()`);
    await browserTab!.command('Page.reload');
    assert.equal(await waitForBrowser('!!document.querySelector("#role-select")'),true);
    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'billing');s.dispatchEvent(new Event('change',{bubbles:true}));const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().startsWith('Receivables & Receipts'));if(!b)throw Error('Receivables navigation is missing');b.click();})()`);
    const filtersReady = await waitForBrowser('!!document.querySelector(`[aria-label="Receivables client"]`)');
    assert.ok(filtersReady, await browserTab!.evaluate<string>('document.body.innerText.slice(0,1600)'));
    await browserTab!.evaluate(`(() => {const client=document.querySelector('[aria-label="Receivables client"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(client,'CL-001');client.dispatchEvent(new Event('change',{bubbles:true}));const date=document.querySelector('[aria-label="Receivables as of date"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(date,'2026-09-01');date.dispatchEvent(new Event('input',{bubbles:true}));date.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const currencyOptions = await browserTab!.evaluate<string[]>(`[...document.querySelector('[aria-label="Receivables currency"]').options].map(o=>o.value)`);
    assert.deepEqual(currencyOptions,['QAR','USD'],'currency selector should expose each permitted balance currency separately');
    await browserTab!.evaluate(`(() => {const select=document.querySelector('[aria-label="Receivables currency"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'USD');select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const usdAgingFixture = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return {invoices:s.invoices.filter(i=>i.clientId==='CL-001'&&i.currency==='USD'),credits:s.creditNotes.filter(c=>c.clientId==='CL-001'),receipts:s.receipts.filter(r=>r.clientId==='CL-001'&&r.currency==='USD')};})()`);
    const expectedUsdAging = calculateReceivablesAging(usdAgingFixture.invoices,usdAgingFixture.credits,usdAgingFixture.receipts,'2026-09-01','CL-001');
    const displayedUsdCurrent = await browserTab!.evaluate<string>(`[...document.querySelectorAll('.metric')].find(x=>x.querySelector('.metric-label')?.innerText.includes('Current'))?.querySelector('.metric-val')?.innerText || ''`);
    assert.equal(displayedUsdCurrent,formatCurrency(expectedUsdAging.current,'USD'),'aging should show a single currency balance using its selected currency');
    await browserTab!.evaluate(`(() => {const select=document.querySelector('[aria-label="Receivables currency"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'QAR');select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const agingFixture = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return {invoices:s.invoices.filter(i=>i.clientId==='CL-001'&&i.currency==='QAR'),credits:s.creditNotes.filter(c=>c.clientId==='CL-001'),receipts:s.receipts.filter(r=>r.clientId==='CL-001'&&r.currency==='QAR')};})()`);
    const expectedAging = calculateReceivablesAging(agingFixture.invoices,agingFixture.credits,agingFixture.receipts,'2026-09-01','CL-001');
    const displayedCurrent = await browserTab!.evaluate<string>(`[...document.querySelectorAll('.metric')].find(x=>x.querySelector('.metric-label')?.innerText.includes('Current'))?.querySelector('.metric-val')?.innerText || ''`);
    assert.equal(displayedCurrent,formatCurrency(expectedAging.current),'selected client, currency and as-of date must drive aging balances');
    await browserTab!.evaluate(`(() => {const date=document.querySelector('[aria-label="Receivables as of date"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(date,'2026-09-23');date.dispatchEvent(new Event('input',{bubbles:true}));date.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const lateInvoices = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return {invoices:s.invoices.filter(i=>i.clientId==='CL-001'&&i.currency==='QAR'),credits:s.creditNotes.filter(c=>c.clientId==='CL-001'),receipts:s.receipts.filter(r=>r.clientId==='CL-001'&&r.currency==='QAR')};})()`);
    const expectedLateAging = calculateReceivablesAging(lateInvoices.invoices,lateInvoices.credits,lateInvoices.receipts,'2026-09-23','CL-001');
    await browserTab!.evaluate(`document.querySelector('[aria-label^="31–60 Days:"]')?.click()`);
    assert.equal(await waitForBrowser(`[...document.querySelectorAll('.panel h3')].some(h=>h.innerText==='31–60 days invoice detail')`), true, 'aging metric opens matching invoice details');
    const lateDetail = await browserTab!.evaluate<any>(`(() => {const rows=[...document.querySelectorAll('tr[data-outstanding]')];return {ids:rows.map(r=>r.innerText),total:rows.reduce((sum,r)=>sum+Number(r.getAttribute('data-outstanding')),0)};})()`);
    assert.ok(lateDetail.ids.some((row:string)=>row.includes('INV-2026-002')),'aging drill-down shows the contributing invoice');
    assert.equal(lateDetail.total,expectedLateAging.days31to60,'invoice detail sums to the displayed 31–60-day bucket');
    await clickButton('Record Offline Receipt');
    await browserTab!.evaluate(`(() => {const set=(label,value)=>{const l=[...document.querySelectorAll('.modal-backdrop label')].find(x=>x.textContent.includes(label));const f=l?.parentElement?.querySelector('input');if(!f)throw Error('Missing receipt field '+label);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(f,value);f.dispatchEvent(new Event('input',{bubbles:true}));f.dispatchEvent(new Event('change',{bubbles:true}));};set('Receipt Number','RCP-AT32');set('Amount (QAR)','50000');set('Bank Reference / Cheque No.','AT32-BANK-REF');})()`);
    await clickButton('Record Receipt');
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).receipts.some(r=>r.receiptNumber==='RCP-AT32'&&r.allocatedAmount===0)`), true);
    await browserTab!.evaluate(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const receipt=s.receipts.find(r=>r.receiptNumber==='RCP-AT32');const date=document.querySelector('[aria-label="Receivables as of date"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(date,receipt.date);date.dispatchEvent(new Event('input',{bubbles:true}));date.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const openAllocation = await browserTab!.evaluate<boolean>(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes('RCP-AT32')&&[...x.querySelectorAll('button')].some(b=>b.innerText.trim()==='Allocate to Invoice'));const b=[...(row?.querySelectorAll('button')||[])].find(x=>x.innerText.trim()==='Allocate to Invoice');if(!b)return false;b.click();return true;})()`);
    assert.equal(openAllocation,true);
    const invoiceBefore = await browserTab!.evaluate<number>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const select=document.querySelector('.modal-backdrop select');const invoice=s.invoices.find(i=>i.id===select.value);const allocated=s.receipts.flatMap(r=>r.allocations).filter(a=>a.invoiceId===invoice.id&&!a.reversed).reduce((sum,a)=>sum+a.amount,0);return {id:invoice.id, paid:Math.max(invoice.paid||0,allocated)};})()`);
    await browserTab!.evaluate(`(() => {const input=document.querySelector('.modal-backdrop input[type="number"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'20000');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await clickButton('Apply Allocation');
    const firstAllocation = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const r=s.receipts.find(x=>x.receiptNumber==='RCP-AT32');const a=r.allocations[0];return {receipt:r,allocation:a,invoice:s.invoices.find(x=>x.id===a.invoiceId)};})()`);
    assert.equal(firstAllocation.allocation.amount,20000);
    assert.equal(firstAllocation.receipt.allocatedAmount,20000);
    assert.equal(firstAllocation.invoice.paid,invoiceBefore.paid+20000);

    const secondInvoice = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return {match:s.invoices.find(i=>i.clientId===${JSON.stringify(firstAllocation.invoice.clientId)}&&i.id!==${JSON.stringify(firstAllocation.invoice.id)}&&i.paid<i.amount),invoices:s.invoices.map(i=>({id:i.id,clientId:i.clientId,paid:i.paid,amount:i.amount,status:i.status}))};})()`);
    const secondInvoiceId = secondInvoice.match?.id ?? '';
    assert.ok(secondInvoiceId, `fixture should have a second outstanding invoice: ${JSON.stringify(secondInvoice.invoices)}`);
    assert.equal(await browserTab!.evaluate<boolean>(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes('RCP-AT32')&&[...x.querySelectorAll('button')].some(b=>b.innerText.trim()==='Allocate to Invoice'));const b=[...(row?.querySelectorAll('button')||[])].find(x=>x.innerText.trim()==='Allocate to Invoice');if(!b)return false;b.click();return true;})()`), true);
    await browserTab!.evaluate(`(() => {const modal=document.querySelector('.modal-backdrop');const select=modal?.querySelector('select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,${JSON.stringify(secondInvoiceId)});select.dispatchEvent(new Event('change',{bubbles:true}));const input=modal?.querySelector('input[type="number"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'30000');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await clickButton('Apply Allocation');
    const twoAllocations = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const r=s.receipts.find(x=>x.receiptNumber==='RCP-AT32');return {receipt:r, allocations:r.allocations.map(a=>({ ...a, paid:s.invoices.find(i=>i.id===a.invoiceId).paid}))};})()`);
    assert.equal(twoAllocations.receipt.allocatedAmount,50000);
    assert.equal(twoAllocations.allocations.length,2);
    assert.deepEqual(twoAllocations.allocations.map((a: any)=>a.amount),[20000,30000]);

    const beginReverse = browserTab!.evaluate<boolean>(`(() => {const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='Reverse Allocation');if(!b)return false;b.click();return true;})()`);
    await new Promise(resolve=>setTimeout(resolve,50));
    await browserTab!.command('Page.handleJavaScriptDialog',{accept:true,promptText:'AT32 bank allocation correction'});
    assert.equal(await beginReverse,true);
    const reversed = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const r=s.receipts.find(x=>x.receiptNumber==='RCP-AT32');const a=r.allocations[0], b=r.allocations[1];return {receipt:r,allocation:a,other:b,invoice:s.invoices.find(x=>x.id===a.invoiceId),otherInvoice:s.invoices.find(x=>x.id===b.invoiceId)};})()`);
    assert.equal(reversed.allocation.reversed,true);
    assert.equal(reversed.allocation.reversalReason,'AT32 bank allocation correction');
    assert.equal(reversed.invoice.paid,invoiceBefore.paid);
    assert.equal(Boolean(reversed.other.reversed),false);
    assert.equal(reversed.other.amount,30000);
    assert.equal(reversed.otherInvoice.paid,twoAllocations.allocations[1].paid);
    assert.equal(reversed.receipt.allocatedAmount,30000);
    await browserTab!.evaluate(`(() => {const date=document.querySelector('[aria-label="Receivables as of date"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(date,'2026-09-23');date.dispatchEvent(new Event('input',{bubbles:true}));date.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const statementSource = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const clientId=s.clients[0].id;const asOf='2026-09-23';const allocatedAsOf=(allocations,receiptDate)=>allocations.filter(a=>(a.date||a.allocatedAt||receiptDate).slice(0,10)<=asOf&&(!a.reversed||!a.reversalDate||a.reversalDate>asOf)).reduce((sum,a)=>sum+a.amount,0);const paidAsOf=i=>{const ledger=s.receipts.flatMap(r=>r.allocations.map(a=>({...a,receiptDate:r.date}))).filter(a=>a.invoiceId===i.id);return ledger.length?ledger.filter(a=>(a.date||a.allocatedAt||a.receiptDate).slice(0,10)<=asOf&&(!a.reversed||!a.reversalDate||a.reversalDate>asOf)).reduce((sum,a)=>sum+a.amount,0):i.paid;};return [ ['Document No','Date','Type','Currency','Billed Amount','Paid / Allocated','Balance'], ...s.invoices.filter(i=>i.clientId===clientId&&i.currency==='QAR'&&(i.status==='Issued'||i.status==='Paid')&&(i.issueDate||i.due)<=asOf).map(i=>{const paid=paidAsOf(i);return [i.invoiceNumber,i.issueDate||i.due,'Invoice',i.currency,String(i.amount),String(paid),String(i.amount-paid)];}), ...s.creditNotes.filter(c=>c.clientId===clientId&&c.status==='Issued'&&c.issueDate<=asOf).map(c=>[c.creditNumber,c.issueDate,'Credit note',c.currency||'QAR',String(-c.amount),'0',String(-c.amount)]), ...s.receipts.filter(r=>r.clientId===clientId&&r.currency==='QAR'&&r.date<=asOf).map(r=>{const allocated=allocatedAsOf(r.allocations,r.date);return [r.receiptNumber,r.date,'Receipt',r.currency,String(-r.amount),String(allocated),String(r.amount-allocated)];}) ];})()`);
    const visibleStatement = await browserTab!.evaluate<string[][]>(`[...document.querySelectorAll('.receivables-statement tbody tr')].map(tr=>[...tr.querySelectorAll('td')].map(td=>td.innerText))`);
    assert.deepEqual(visibleStatement,statementSource.slice(1),'printable statement table must match its exported rows');
    await browserTab!.evaluate(`(() => {window.__printCalled=false;window.print=()=>{window.__printCalled=true;};const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='Print Statement');if(!b)throw Error('Print Statement button missing');b.click();})()`);
    assert.equal(await browserTab!.evaluate<boolean>('window.__printCalled'),true,'print control should open the browser print flow');
    await browserTab!.evaluate('delete window.print');
    const printedPdf = await browserTab!.command('Page.printToPDF',{printBackground:true,preferCSSPageSize:true});
    const printedBytes = Buffer.from(printedPdf.data,'base64');
    assert.equal(printedBytes.subarray(0,4).toString(),'%PDF','statement print stylesheet should produce a browser PDF');
    assert.ok(printedBytes.length>1000,'printed statement PDF should contain rendered content');
    await browserTab!.evaluate(`(() => {window.__statementBlob=null;URL.createObjectURL=blob=>{window.__statementBlob=blob;return 'blob:statement-test';};const b=[...document.querySelectorAll('button')].find(x=>x.innerText.includes('Export Statement CSV'));if(!b)throw Error('Statement export control is missing');b.click();})()`);
    const statementText = await browserTab!.evaluate<string>(`window.__statementBlob ? window.__statementBlob.text() : ''`);
    const statement = parseCsv(statementText);
    assert.deepEqual(statement,statementSource);
    assert.equal(statement.some(row=>row.includes('INV-2026-003')),false,'client statement must exclude another client draft invoice');
    assert.deepEqual(browserTab!.exceptions,[]);
  });

  it('AT-29/VP-029: versions a budget without rewriting approved time rates', async () => {
    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'manager');s.dispatchEvent(new Event('change',{bubbles:true}));const e=document.querySelector('select[aria-label="Selected engagement"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'ENG-26001');e.dispatchEvent(new Event('change',{bubbles:true}));const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().startsWith('Budgets & Variances'));if(!b)throw Error('Budget navigation is missing');b.click();})()`);
    await clickButton('Author New Budget Version');
    await browserTab!.evaluate(`(() => {const label=[...document.querySelectorAll('.modal-overlay label')].find(x=>x.innerText.trim()==='Billing Rate (/hr)');const input=label?.parentElement?.querySelector('input');if(!input)throw Error('Budget billing rate input missing');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'300');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await clickButton('Save Version 2');
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).budgets.find(b=>b.engagementId==='ENG-26001').version===2`),true);
    const snapshot = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const b=s.budgets.find(x=>x.engagementId==='ENG-26001');const t=s.times.find(x=>x.id==='TIME-01');return {version:b.version,rate:b.lines.find(x=>x.roleOrActivity==='Audit fieldwork').billingRatePerHour,history:b.history,timeRate:t.billingRatePerHour,timeBudgetVersion:t.budgetVersion};})()`);
    assert.equal(snapshot.version,2);
    assert.equal(snapshot.rate,300);
    assert.equal(snapshot.history[0].version,1);
    assert.equal(snapshot.timeRate,200,'approved time retains its original pinned billing rate');
    assert.equal(snapshot.timeBudgetVersion,1);
    assert.deepEqual(browserTab!.exceptions,[]);
  });

  it('AT-44/VP-047: records independent acceptance and creates a clean next-period draft', async () => {
    await browserTab!.evaluate(`(() => {
      const role = document.querySelector('#role-select');
      const option = [...role.options].find(o => o.textContent.includes('Engagement manager'));
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(role, option.value);
      role.dispatchEvent(new Event('change', { bubbles: true }));
      const engagement = document.querySelector('select[aria-label="Selected engagement"]');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(engagement, 'ENG-26001');
      engagement.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await clickButton('Acceptance & KYC');
    assert.equal(await waitForBrowser('document.body.innerText.includes("Client Acceptance & Continuance")'), true);
    await browserTab!.evaluate(`(() => {
      for (const box of document.querySelectorAll('input[type=checkbox]')) {
        if (!box.checked) box.click();
      }
      for (const [name, value] of Object.entries({ 'AML/KYC': 'KYC-CASE-26001', independence: 'IND-REVIEW-26001', conflicts: 'COI-CHECK-26001', prohibitions: 'ROTATION-26001', competence: 'TEAM-QUAL-26001' })) {
        const input = document.querySelector('[aria-label="Evidence reference for ' + name + '"]');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const rationale = document.querySelectorAll('textarea')[0];
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(rationale, 'Annual risk and independence screening completed.');
      rationale.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await clickButton('Save Recommendation');
    assert.equal(await waitForBrowser('document.body.innerText.includes("Partner decision is pending")'), true);
    assert.equal(await browserTab!.evaluate<boolean>(`[...document.querySelectorAll('select option')].some(o=>o.textContent.includes('Prohibited — Mandatory Mandate Rejection'))`), true, 'the prohibited mandate outcome is visible in the acceptance risk selector');
    await browserTab!.evaluate(`(() => {
      const role = document.querySelector('#role-select');
      const option = [...role.options].find(o => o.textContent.includes('Engagement partner'));
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(role, option.value);
      role.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    assert.equal(await waitForBrowser('(() => { const s = [...document.querySelectorAll("select")].find(x => [...x.options].some(o => o.textContent.includes("Accept & Continue Engagement Mandate"))); return s && !s.disabled; })()'), true, 'partner decision control should be enabled for the assigned partner');
    await browserTab!.evaluate(`(() => [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.textContent.includes('Accept & Continue Engagement Mandate'))).focus())()`);
    await browserTab!.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', text: 'a' });
    await browserTab!.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA' });
    await browserTab!.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter' });
    await browserTab!.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter' });
    assert.equal(await waitForBrowser('(() => { const b = [...document.querySelectorAll("button")].find(x => x.innerText.includes("Record Partner Decision")); return b && !b.disabled; })()'), true, 'partner decision should update to accepted');
    await browserTab!.evaluate(`(() => {
      const rationale = document.querySelectorAll('textarea')[1];
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(rationale, 'Proceed subject to current-period reassessment.');
      rationale.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await clickButton('Record Partner Decision');
    assert.equal(await waitForBrowser('document.body.innerText.includes("Manual Annual Continuance")'), true, (await browserTab!.evaluate<string>('JSON.stringify({top:document.body.innerText.slice(0,650), state:JSON.parse(localStorage.getItem("ste-auditsphere-role-portals-v2")).currentPerson, role:JSON.parse(localStorage.getItem("ste-auditsphere-role-portals-v2")).currentRole})')));
    await browserTab!.evaluate(`(() => {
      const role = document.querySelector('#role-select');
      const option = [...role.options].find(o => o.textContent.includes('Engagement manager'));
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(role, option.value);
      role.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    assert.equal(await waitForBrowser('!!document.querySelector("#continuance-changed-facts") && !document.querySelector("#continuance-changed-facts").disabled'), true);
    await browserTab!.evaluate('document.querySelector("#continuance-changed-facts").focus()');
    await browserTab!.command('Input.insertText', { text: 'Ownership and business activity were reviewed for the new period.' });
    assert.equal(await browserTab!.evaluate<boolean>('!([...document.querySelectorAll("button")].find(b => b.innerText.includes("Create Fresh FY2027 Draft"))?.disabled)'), true, 'changed facts should enable draft creation');
    await clickButton('Create Fresh FY2027 Draft');
    assert.equal(await waitForBrowser('JSON.parse(localStorage.getItem("ste-auditsphere-role-portals-v2")).acceptanceCases?.[0]?.continuedToEngagementId === "ENG-CONT-CL-001-2027"'), true);
    const persisted = await browserTab!.evaluate<any>(`(() => {
      const state = JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));
      const prior = state.engagements.find(e => e.id === 'ENG-26001');
      const priorCase = state.acceptanceCases.find(c => c.engagementId === 'ENG-26001');
      const draft = state.engagements.find(e => e.id === priorCase.continuedToEngagementId);
      const jobs = state.jobs.filter(j => j.engagementId === draft?.id);
      const jobIds = new Set(jobs.map(j => j.id));
      const documentIds = new Set(state.documents.filter(d => d.engagementId === draft?.id).map(d => d.id));
      return { priorRows: prior?.rows?.length, evidenceRefs: Object.keys(priorCase?.screeningEvidence || {}).length, continuedTo: priorCase?.continuedToEngagementId, draftId: draft?.id, acceptance: draft?.acceptance, terms: draft?.terms, rows: draft?.rows?.length, sourceHistory: draft?.sourceHistory?.length, jobs: jobs.length, tasks: state.jobTasks.filter(t => jobIds.has(t.jobId)).length, documents: documentIds.size, linkedEvidence: state.evidenceCatalogue.filter(e => documentIds.has(e.documentId)).length, samplePopulations: state.samplePopulations.filter(p => p.engagementId === draft?.id).length, auditPrograms: state.auditPrograms.filter(p => p.engagementId === draft?.id).length, timeEntries: state.times.filter(t => t.engagementId === draft?.id).length, budgets: state.budgets.filter(b => b.engagementId === draft?.id).length, findings: state.findings.filter(f => f.engagementId === draft?.id).length, workpapers: draft?.workpapers?.length, reviews: draft?.reviews?.length, packages: draft?.packageHistory?.length, releases: draft?.releases?.length, approvals: Object.values(draft?.approvals || {}).filter(Boolean).length, approvalHistory: draft?.approvalHistory?.length, reconciliations: draft?.reconciliations?.length, pbc: draft?.pbc?.length, events: draft?.events?.length };
    })()`);
    assert.ok(persisted.priorRows > 0, 'prior period source rows remain intact');
    assert.equal(persisted.continuedTo, 'ENG-CONT-CL-001-2027');
    assert.equal(persisted.evidenceRefs, 5);
    assert.equal(persisted.draftId, 'ENG-CONT-CL-001-2027');
    assert.equal(persisted.acceptance, false);
    assert.equal(persisted.terms, false);
    for (const field of ['rows', 'sourceHistory', 'jobs', 'tasks', 'documents', 'linkedEvidence', 'samplePopulations', 'auditPrograms', 'timeEntries', 'budgets', 'findings', 'workpapers', 'reviews', 'packages', 'releases', 'approvals', 'approvalHistory', 'reconciliations', 'pbc']) assert.equal(persisted[field], 0, `${field} must start empty`);
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('AT-41/AT-42/AT-48: saves exact generated package artifacts and verifies them after reload', async () => {
    await browserTab!.evaluate(`(() => {
      const key='ste-auditsphere-role-portals-v2';const state=JSON.parse(localStorage.getItem(key)||${JSON.stringify(JSON.stringify(createInitialState()))});
      state.auditPrograms.push({id:'PRG-AT53',engagementId:'ENG-26002',area:'Evidence provenance',objective:'Keep released package identities stable after a later evidence unlink.',procedures:[{id:'PRC-AT53',engagementId:'ENG-26002',linkedRiskIds:[],ref:'P-NS-1',title:'Evidence provenance fixture',instructions:'Verify the synthetic Northstar evidence reference.',assignee:'Adam Khan',requiredEvidence:'Reviewed source',status:'Cleared',workPerformed:'Verified current source revision.',conclusion:'Satisfactory'}]});
      state.documents.push({id:'DOC-AT53',clientId:'CL-002',engagementId:'ENG-26002',name:'Northstar_Internal_Evidence.pdf',folderPath:'/Engagements/2026/Audit/Workpapers/',version:1,size:1234,classification:'Working paper',visibility:'Internal',source:'SharePoint',uploadedBy:'Adam Khan',uploadedAt:'2026-09-22T10:00:00Z'});
      state.evidenceCatalogue.push({id:'EVD-AT53',title:'Northstar Evidence Provenance Fixture',documentId:'DOC-AT53',version:1,adequacyStatus:'Adequate',receivedDate:'2026-09-22',owner:'Adam Khan',linkedProcedures:['PRC-AT53']});
      localStorage.setItem(key,JSON.stringify(state));
    })()`);
    await browserTab!.command('Page.reload');
    assert.equal(await waitForBrowser('!!document.querySelector("#app-root .brandname")'), true, 'scoped evidence provenance fixture reloads');
    const selected = await browserTab!.evaluate<boolean>(`(() => {
      const role = document.querySelector('#role-select');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(role, 'manager');
      role.dispatchEvent(new Event('change', { bubbles: true }));
      const engagement = document.querySelector('select[aria-label="Selected engagement"]');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(engagement, 'ENG-26002');
      engagement.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    assert.equal(selected, true);
    const setRole = async (role: string) => browserTab!.evaluate(`(() => { const s=document.querySelector('#role-select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(role)}); s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    await setRole('manager');
    await clickButton('Accounting Workbench');
    await clickButton('Statement Mappings');
    await browserTab!.evaluate(`(() => {
      const state=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));
      const engagement=state.engagements.find(e=>e.id===state.selectedEngagement);
      const targets={asset:'Cash and cash equivalents',liability:'Trade payables',equity:'Share capital and reserves',revenue:'Revenue',expense:'Operating expenses'};
      for(const row of engagement.rows){const select=document.querySelector('[aria-label="Statement line for account '+row.code+'"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,targets[row.type]);select.dispatchEvent(new Event('change',{bubbles:true}));}
    })()`);
    await clickButton('Save New Revision');
    await setRole('reviewer');
    const approvedMapping = await browserTab!.evaluate<boolean>(`(() => {const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim().startsWith('Approve Revision v'));if(!b)return false;b.click();return true;})()`);
    assert.equal(approvedMapping, true, 'independent reviewer approves package mapping');
    await setRole('manager');
    await clickButton('Financial Packages');
    assert.equal(await waitForBrowser('document.body.innerText.includes("Financial Reporting Packages")'), true);
    assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /every disclosure must be prepared/);
    await browserTab!.evaluate(`(() => {const title=document.querySelector('input[aria-label="Disclosure title"]');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(title,'Significant accounting policies');title.dispatchEvent(new Event('input',{bubbles:true}));const text=document.querySelector('[aria-label="Significant accounting policies disclosure text"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(text,'E2E fixture: applicable disclosure note.');text.dispatchEvent(new Event('input',{bubbles:true}));const evidence=document.querySelector('input[aria-label="Evidence document ID"]');setter.call(evidence,'DOC-AT53');evidence.dispatchEvent(new Event('input',{bubbles:true}));[...document.querySelectorAll('label')].find(label=>label.innerText.includes('Include this note in the client package')).querySelector('input').click();})()`);
    await clickButton('Save preparer draft');
    await setRole('reviewer');
    await clickButton('Review independently');
    await setRole('manager');
    await browserTab!.evaluate(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(item=>item.innerText.includes('Statement of Comprehensive Income'));row.querySelector('button').click();})()`);
    assert.equal(await waitForBrowser(`(() => {const rows=[...document.querySelectorAll('tbody tr')];return rows.findIndex(row=>row.innerText.includes('Statement of Comprehensive Income'))<rows.findIndex(row=>row.innerText.includes('Statement of Financial Position'));})()`), true, 'React applies the selected section reordering');
    const packageSections = await browserTab!.evaluate<any>(`(() => {
      const ordered=[...document.querySelectorAll('tbody tr')];
      const cash=ordered.find(row=>row.innerText.includes('Statement of Cash Flows'));
      return {titles:ordered.map(row=>row.querySelector('td:nth-child(3)')?.innerText.trim()),cashDisabled:cash.querySelector('input').disabled,cashChecked:cash.querySelector('input').checked,cashReason:cash.innerText};
    })()`);
    assert.ok(packageSections.titles.indexOf('Statement of Comprehensive Income') < packageSections.titles.indexOf('Statement of Financial Position'), `the changed section order is shown before assembly: ${JSON.stringify(packageSections)}`);
    assert.equal(packageSections.cashDisabled, true, 'unsupported cash-flow output cannot be selected');
    assert.equal(packageSections.cashChecked, false);
      assert.match(packageSections.cashReason, /current cash-flow schedule is independently reviewed/);
    await browserTab!.evaluate('(() => {const BaseBlob=window.Blob;window.__testBaseBlob=BaseBlob;window.Blob=class extends BaseBlob {constructor(){throw new Error("fixture XLSX generation failure")}};})()');
    try {
      await clickButton('+ Assemble New Revision (Rev 2)');
      assert.equal(await waitForBrowser('document.body.innerText.includes("fixture XLSX generation failure")'), true, 'generator failure is reported to the user');
      assert.equal(await browserTab!.evaluate<boolean>(`(() => {const e=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(x=>x.id==='ENG-26002');return e.packageRevision===1&&!e.packageHistory.some(p=>p.revision===2);})()`), true, 'failed generation does not advance package revision or report a saved artifact');
    } finally {
      await browserTab!.evaluate('window.Blob=window.__testBaseBlob;delete window.__testBaseBlob');
    }
    const artifactCountBeforeFailure = await browserTab!.evaluate<number>(`(async()=>{const r=indexedDB.open('ste-auditsphere-generated-artifacts',1);r.onupgradeneeded=()=>r.result.createObjectStore('artifacts',{keyPath:'id'});const db=await new Promise(resolve=>{r.onsuccess=()=>resolve(r.result)});const count=await new Promise(resolve=>{const q=db.transaction('artifacts').objectStore('artifacts').count();q.onsuccess=()=>resolve(q.result)});db.close();return count})()`);
    await browserTab!.evaluate(`(() => {window.__originalArtifactPut=IDBObjectStore.prototype.put;window.__artifactPutCount=0;IDBObjectStore.prototype.put=function(...args){if(++window.__artifactPutCount===2)throw new Error('fixture artifact transaction failure');return window.__originalArtifactPut.apply(this,args)};})()`);
    try {
      await clickButton('+ Assemble New Revision (Rev 2)');
      assert.equal(await waitForBrowser('document.body.innerText.includes("fixture artifact transaction failure")'), true, 'partial artifact persistence failure is surfaced');
      assert.equal(await browserTab!.evaluate<boolean>(`(() => {const e=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(x=>x.id==='ENG-26002');return e.packageRevision===1&&!e.packageHistory.some(p=>p.revision===2);})()`), true, 'failed artifact transaction does not save a package revision');
      const artifactCountAfterFailure = await browserTab!.evaluate<number>(`(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('ste-auditsphere-generated-artifacts',1);r.onsuccess=()=>resolve(r.result)});const count=await new Promise(resolve=>{const q=db.transaction('artifacts').objectStore('artifacts').count();q.onsuccess=()=>resolve(q.result)});db.close();return count})()`);
      assert.equal(artifactCountAfterFailure, artifactCountBeforeFailure, 'aborted package write leaves no partial artifact blobs');
    } finally {
      await browserTab!.evaluate('IDBObjectStore.prototype.put=window.__originalArtifactPut;delete window.__originalArtifactPut;delete window.__artifactPutCount');
    }
    await clickButton('+ Assemble New Revision (Rev 2)');
    assert.equal(await waitForBrowser('document.body.innerText.includes("Package revision 2 saved with exact XLSX, DOCX and PDF files.")'), true, 'package should persist genuine artifacts');
    const persisted = await browserTab!.evaluate<any>(`(async () => {
      const state = JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));
      const eng = state.engagements.find(e => e.id === 'ENG-26002');
      const pack = eng.packageHistory.find(p => p.revision === 2);
      const db = await new Promise((resolve, reject) => { const r = indexedDB.open('ste-auditsphere-generated-artifacts', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      const files = await Promise.all(pack.artifacts.map(async a => {
        const blob = await new Promise((resolve, reject) => { const r = db.transaction('artifacts').objectStore('artifacts').get(a.id); r.onsuccess = () => resolve(r.result?.blob); r.onerror = () => reject(r.error); });
        const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(x => x.toString(16).padStart(2, '0')).join('');
        return { kind: a.kind, size: blob.size, mime: blob.type, sha256: digest, expected: a.sha256 };
      }));
      db.close();
      return { revision: pack.revision, generation: pack.generation, sourceVersion: pack.sourceVersion, mappingRevision: pack.mappingRevision, validation: pack.validation.passed, disclosures: pack.disclosures, sections:pack.sections.map(({id,enabled,order})=>({id,enabled,order})), files };
    })()`);
    assert.equal(persisted.revision, 2);
    assert.equal(persisted.mappingRevision, 1, 'mapping revision remains independent of source version 1');
    assert.equal(persisted.validation, true);
    assert.equal(persisted.disclosures.length, 1);
    assert.equal(persisted.disclosures[0].status, 'Reviewed');
    assert.equal(persisted.disclosures[0].sharedWithClient, true);
    assert.ok(persisted.sections.find((section:any)=>section.id==='pnl').order < persisted.sections.find((section:any)=>section.id==='bs').order);
    assert.equal(persisted.sections.find((section:any)=>section.id==='cf').enabled, false, 'unsupported cash-flow content is excluded from the artifact revision');
    assert.deepEqual(persisted.files.map((f: any) => f.kind).sort(), ['DOCX', 'PDF', 'XLSX']);
    for (const file of persisted.files) {
      assert.ok(file.size > 0);
      assert.equal(file.sha256, file.expected, `${file.kind} digest must match saved package metadata`);
    }
    await browserTab!.command('Page.reload');
    assert.equal(await waitForBrowser('!!document.querySelector("#app-root .brandname")'), true);
    await clickButton('Financial Packages');
    assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /Saved Revision 2 · Validated/);
    const reloadedPackageSections = await browserTab!.evaluate<any>(`(() => {const rows=[...document.querySelectorAll('tbody tr')];const cash=rows.find(row=>row.innerText.includes('Statement of Cash Flows'));return {titles:rows.map(row=>row.querySelector('td:nth-child(3)')?.innerText.trim()),cashDisabled:cash.querySelector('input').disabled,cashChecked:cash.querySelector('input').checked};})()`);
    assert.ok(reloadedPackageSections.titles.indexOf('Statement of Comprehensive Income') < reloadedPackageSections.titles.indexOf('Statement of Financial Position'), 'section order survives reload');
    assert.equal(reloadedPackageSections.cashDisabled, true);
    assert.equal(reloadedPackageSections.cashChecked, false);

    await setRole('manager-2');
    await clickButton('Sign-offs & EQR');
    await clickButton('Sign Off as Manager (Layla Rahman)');
    await clickButton('Present Current Package');
    assert.equal(await browserTab!.evaluate<boolean>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26002').managementPresentation?.packageRevision === ${persisted.revision}`), true, 'management presentation pins the current package revision');
    await browserTab!.evaluate(`(() => {
      const role = document.querySelector('#role-select');
      const option = [...role.options].find(o => o.textContent.includes('Aisha Saleh'));
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(role, option.value);
      role.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    assert.equal(await waitForBrowser('JSON.parse(localStorage.getItem("ste-auditsphere-role-portals-v2")).currentRole === "client"'), true);
    assert.equal(await waitForBrowser('document.body.innerText.includes("Northstar Services") && JSON.parse(localStorage.getItem("ste-auditsphere-role-portals-v2")).selectedEngagement === "ENG-26002"'), true, 'explicitly granted client identity opens its own portal and engagement');
    await clickButton('Management Approvals');
    await browserTab!.evaluate(`(() => {const reason=document.querySelector('[aria-label="Management package rationale"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(reason,'Reviewed the exact package revision and agree with the presented statements.');reason.dispatchEvent(new Event('input',{bubbles:true}));const evidence=document.querySelector('[aria-label="Management package evidence"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(evidence,'Northstar board minutes 2026-09-23');evidence.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await clickButton('Acknowledge Package');
    assert.equal(await browserTab!.evaluate<boolean>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26002').managementPackageDecision?.evidenceRef === 'Northstar board minutes 2026-09-23'`), true, 'management acknowledgement retains rationale and evidence for the presented revision');
    await clickButton('Record Representation Receipt');
    assert.equal(await browserTab!.evaluate<boolean>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26002').approvals.client?.generation === ${persisted.generation}`), true);
    await browserTab!.evaluate(`(() => {
      const role = document.querySelector('#role-select');
      const option = [...role.options].find(o => o.textContent.includes('Engagement partner'));
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(role, option.value);
      role.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    assert.equal(await waitForBrowser('JSON.parse(localStorage.getItem("ste-auditsphere-role-portals-v2")).currentRole === "partner"'), true);
    await clickButton('Sign-offs & EQR');
    await clickButton('Approve as Lead Partner (Daniel James)');
    const approvals = await browserTab!.evaluate<any>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26002').approvals`);
    assert.equal(approvals.manager.generation, persisted.generation);
    assert.equal(approvals.client.generation, persisted.generation);
    assert.equal(approvals.partner.generation, persisted.generation);

    await clickButton('Release & Completion');
    await browserTab!.evaluate(`(async()=>{const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const e=s.engagements.find(x=>x.id==='ENG-26002');const artifact=e.packageHistory.find(x=>x.revision===e.packageRevision).artifacts[0];const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('ste-auditsphere-generated-artifacts',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const original=await new Promise((resolve,reject)=>{const r=db.transaction('artifacts').objectStore('artifacts').get(artifact.id);r.onsuccess=()=>resolve(r.result?.blob);r.onerror=()=>reject(r.error);});window.__tamperedReleaseArtifact={id:artifact.id,blob:original};const bytes=await original.arrayBuffer();new Uint8Array(bytes)[0]^=1;const tx=db.transaction('artifacts','readwrite');tx.objectStore('artifacts').put({id:artifact.id,blob:new Blob([bytes],{type:original.type})});await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});db.close();})()`);
    await clickButton(`Freeze Release Candidate (Generation ${persisted.generation})`);
    assert.equal(await waitForBrowser('document.body.innerText.includes("failed its SHA-256 integrity check")'), true, 'tampered generated bytes must block candidate freeze');
    assert.equal(await browserTab!.evaluate<boolean>(`!JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26002').candidate`), true);
    await browserTab!.evaluate(`(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('ste-auditsphere-generated-artifacts',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const saved=window.__tamperedReleaseArtifact;const tx=db.transaction('artifacts','readwrite');tx.objectStore('artifacts').put({id:saved.id,blob:saved.blob});await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});db.close();delete window.__tamperedReleaseArtifact;})()`);
    await clickButton(`Freeze Release Candidate (Generation ${persisted.generation})`);
    assert.equal(await waitForBrowser('!!JSON.parse(localStorage.getItem("ste-auditsphere-role-portals-v2")).engagements.find(e=>e.id==="ENG-26002").candidate'), true);
    const releaseText = await browserTab!.evaluate<boolean>(`(() => {
      const labels=[...document.querySelectorAll('label')];
      const note=labels.find(x=>x.textContent.trim()==='Local release note')?.parentElement?.querySelector('textarea');
      const recipients=labels.find(x=>x.textContent.trim()==='Recipient metadata (comma separated)')?.parentElement?.querySelector('input');
      if (!note || !recipients) return false;
      note.focus(); return true;
    })()`);
    assert.equal(releaseText, true);
    await browserTab!.command('Input.insertText', { text: 'Approved local release of revision 2.' });
    await browserTab!.evaluate(`(() => [...document.querySelectorAll('label')].find(x=>x.textContent.trim()==='Recipient metadata (comma separated)').parentElement.querySelector('input').focus())()`);
    await browserTab!.command('Input.insertText', { text: 'board@example.invalid, client@example.invalid' });
    await clickButton('Record Local Release');
    assert.equal(await waitForBrowser('JSON.parse(localStorage.getItem("ste-auditsphere-role-portals-v2")).engagements.find(e=>e.id==="ENG-26002").releases.length === 1'), true);
    const frozenRelease = await browserTab!.evaluate<any>(`(() => {const e=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(x=>x.id==='ENG-26002');return {release:e.releases[0], artifacts:e.packageHistory.find(x=>x.revision===2).artifacts};})()`);
    assert.deepEqual(frozenRelease.release.manifest.map((x: any) => x.artifactId).sort(), frozenRelease.artifacts.map((x: any) => x.id).sort());
    for (const artifact of frozenRelease.artifacts) assert.ok(frozenRelease.release.manifest.some((x: any) => x.artifactId === artifact.id && x.sha === artifact.sha256));

    await setRole('manager');
    await clickButton('Evidence Catalogue');
    await browserTab!.evaluate(`(() => {window.prompt=()=> 'The evidence link was removed after report release.';const b=document.querySelector('button[aria-label="Unlink PRC-AT53 from EVD-AT53"]');if(!b)throw Error('Released engagement evidence unlink control is missing');b.click();})()`);
    assert.equal(await waitForBrowser(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const e=s.engagements.find(x=>x.id==='ENG-26002');const ev=s.evidenceCatalogue.find(x=>x.id==='EVD-AT53');const p=s.auditPrograms.flatMap(x=>x.procedures).find(x=>x.id==='PRC-AT53');return !ev.linkedProcedures.includes('PRC-AT53')&&p.evidenceReassessmentRequired&&e.releases[0].manifest.length===${frozenRelease.release.manifest.length};})()`), true, 'unlink stales current procedure state while retaining the issued release record');
    const releaseAfterEvidenceUnlink = await browserTab!.evaluate<any>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26002').releases[0].manifest`);
    assert.deepEqual(releaseAfterEvidenceUnlink, frozenRelease.release.manifest, 'later evidence unlink cannot rewrite issued artifact provenance');
    const issuedBytesAfterUnlink = await browserTab!.evaluate<any[]>(`(async()=>{const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const m=s.engagements.find(e=>e.id==='ENG-26002').releases[0].manifest;const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('ste-auditsphere-generated-artifacts',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const out=await Promise.all(m.map(async x=>{const blob=await new Promise((resolve,reject)=>{const r=db.transaction('artifacts').objectStore('artifacts').get(x.artifactId);r.onsuccess=()=>resolve(r.result?.blob);r.onerror=()=>reject(r.error);});const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join('');return {id:x.artifactId,size:blob.size,sha,expected:x.sha};}));db.close();return out;})()`);
    assert.deepEqual(issuedBytesAfterUnlink.map((x: any) => [x.id, x.sha]), frozenRelease.release.manifest.map((x: any) => [x.artifactId, x.sha]));
    assert.ok(issuedBytesAfterUnlink.every((x: any) => x.size > 0), 'every previously issued artifact remains available after evidence unlink');
    await clickButton('Release & Completion');

    await clickButton('Re-open for Amendment');
    await browserTab!.evaluate('document.querySelector(".modal textarea").focus()');
    await browserTab!.command('Input.insertText', { text: 'Correct subsequent-event disclosure before final issue.' });
    await clickButton('Confirm Amendment');
    const reopened = await browserTab!.evaluate<any>(`(() => {const e=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(x=>x.id==='ENG-26002');return {generation:e.generation,packageRevision:e.packageRevision,candidate:e.candidate,approvals:e.approvals,release:e.releases[0]};})()`);
    assert.equal(reopened.generation, persisted.generation + 2, 'evidence unlink and amendment each invalidate the current generation');
    assert.equal(reopened.packageRevision, 3);
    assert.equal(reopened.candidate, null);
    assert.equal(reopened.approvals.partner, null, 'amendment requires new generation-bound partner review');
    assert.deepEqual(reopened.release.manifest, frozenRelease.release.manifest, 'predecessor release remains byte-identity stable');

    await clickButton('Records & Archive');
    assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /Retention Until \(Optional\)/);
    assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /Optional firm-selected date only; it asserts no legal requirement and schedules no deletion/);
    assert.doesNotMatch(await browserTab!.evaluate<string>('document.body.innerText'), /10 Years Statutory Retention/);
    await clickButton('Create Local Archive Index');
    assert.equal(await waitForBrowser('document.body.innerText.includes("Archived 3 verified artifact copies")'), true);
    const archive = await browserTab!.evaluate<any>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26002').archive`);
    assert.equal(archive.retentionUntil, undefined, 'archive retention date remains optional');
    assert.equal(archive.artifacts.length, 3);
    assert.equal(archive.manifest.length, archive.artifacts.length);
    assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /Verified Archived Artifacts \(3\)/);
    const archiveBytes = await browserTab!.evaluate<any>(`(async () => {
      const a=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26002').archive;
      const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('ste-auditsphere-generated-artifacts',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      const copies=await Promise.all(a.artifacts.map(async x=>{const blob=await new Promise((resolve,reject)=>{const r=db.transaction('artifacts').objectStore('artifacts').get(x.id);r.onsuccess=()=>resolve(r.result?.blob);r.onerror=()=>reject(r.error);});const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join('');return {id:x.id,size:blob.size,mime:blob.type,sha,expected:x.sha256};}));db.close();return copies;
    })()`);
    for (const copy of archiveBytes) {
      assert.match(copy.id, /^archive:ENG-26002:/);
      assert.ok(copy.size > 0);
      assert.equal(copy.sha, copy.expected, 'archived copy must retain exact released bytes');
    }
    await browserTab!.evaluate(`(() => {
      const key='ste-auditsphere-role-portals-v2';const s=JSON.parse(localStorage.getItem(key));const e=s.engagements.find(x=>x.id==='ENG-26002');
      const release=JSON.parse(JSON.stringify(e.releases.at(-1)));release.id='REL-E2E-SUCCESSOR';release.version++;release.releasedAt='2026-09-24T12:00:00.000Z';release.manifest=release.manifest.map((m,i)=>({...m,id:'M-REL-E2E-SUCCESSOR-'+i}));e.releases.push(release);localStorage.setItem(key,JSON.stringify(s));
    })()`);
    await browserTab!.command('Page.reload');
    assert.equal(await waitForBrowser('!!document.querySelector("#app-root .brandname")'), true);
    await clickButton('Records & Archive');
    await clickButtonStartingWith('Cross-Engagement Archive Register');
    await clickButton('Index Successor Release');
    assert.equal(await waitForBrowser('document.body.innerText.includes("Archived 3 verified artifact copies for ENG-26002")'), true, 'successor archive copies its verified release artifacts');
    const successorArchive = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const e=s.engagements.find(x=>x.id==='ENG-26002');return {releaseId:e.archive.releaseId,predecessor:e.archive.predecessorArchiveId,history:e.archive.history.map(x=>x.action),records:s.archives.filter(x=>x.engagementId===e.id).map(x=>({id:x.id,releaseId:x.releaseId})),artifacts:e.archive.artifacts};})()`);
    assert.equal(successorArchive.releaseId, 'REL-E2E-SUCCESSOR');
    assert.equal(successorArchive.predecessor, `ARC-ENG-26002-${archive.releaseId}`);
    assert.equal(successorArchive.history[0], 'Successor release archived');
    assert.deepEqual(successorArchive.records.map((x: any) => x.releaseId), [archive.releaseId, 'REL-E2E-SUCCESSOR'], 'predecessor archive remains indexed');
    await browserTab!.evaluate(`(async()=>{const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const a=s.engagements.find(x=>x.id==='ENG-26002').archive;const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('ste-auditsphere-generated-artifacts',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const files=await Promise.all(a.artifacts.map(async x=>{const blob=await new Promise((resolve,reject)=>{const r=db.transaction('artifacts').objectStore('artifacts').get(x.id);r.onsuccess=()=>resolve(r.result?.blob);r.onerror=()=>reject(r.error);});return {id:x.id,sha:[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join(''),expected:x.sha256};}));db.close();if(files.some(x=>x.sha!==x.expected))throw Error('successor archived-byte hash mismatch');})()`);
    await clickButtonStartingWith('Selected Engagement');
    await browserTab!.evaluate(`(() => {const label=[...document.querySelectorAll('label')].find(x=>x.textContent.includes('Correct optional retention-until date'));const input=label.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'2030-12-31');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await clickButton('Save Archive Metadata');
    assert.equal(await waitForBrowser(`(() => {const a=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).archives.filter(x=>x.engagementId==='ENG-26002').at(-1);return a.retentionUntil==='2030-12-31'&&a.history.at(-1).action==='Metadata corrected'&&a.history.at(-1).before.retentionUntil===undefined;})()`), true, 'retention correction preserves the prior metadata and its actor/time history');
    await clickButton('Place Application Legal Hold');
    assert.equal(await waitForBrowser(`(() => {const a=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).archives.filter(x=>x.engagementId==='ENG-26002').at(-1);return a?.onApplicationHold&&a.holdReason?.includes('tax authority');})()`), true, 'application hold requires and retains its reason');
    await clickButton('Process Successor Handover');
    await clickButton('Authorize Handover Record');
    assert.equal(await waitForBrowser('document.body.innerText.includes("active application hold blocks the handover request")'), true, 'active application hold blocks the handover request');
    assert.equal(await browserTab!.evaluate<boolean>(`(() => {const a=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).archives.filter(x=>x.engagementId==='ENG-26002').at(-1);return !a.handoverRequested&&!a.handoverRequester;})()`), true, 'blocked handover creates no request record');
    await clickButton('Cancel');
    await clickButton('Lift Application Legal Hold');
    await clickButton('Process Successor Handover');
    await clickButton('Authorize Handover Record');
    assert.equal(await waitForBrowser(`(() => {const a=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).archives.filter(x=>x.engagementId==='ENG-26002').at(-1);return a.handoverRequested&&a.handoverRequester==='KPMG Qatar (Successor Audit Firm)'&&a.handoverNotes.includes('ISA 510');})()`), true, 'after hold release, an authorized handover request is recorded locally on the latest archive');
    assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /2030-12-31/);
    await clickButton('Financial Packages');
    await clickButton('Revise disclosure');
    await browserTab!.evaluate(`(() => {const notes=document.querySelector('[aria-label="Significant accounting policies disclosure text"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(notes,'E2E fixture: revision after amendment.');notes.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await clickButton('Save preparer draft');
    await setRole('reviewer');
    await clickButton('Review independently');
    await setRole('manager');
    await clickButton('+ Assemble New Revision (Rev 4)');
    assert.equal(await waitForBrowser('document.body.innerText.includes("Package revision 4 saved with exact XLSX, DOCX and PDF files")'), true, 'amended package content creates a new artifact revision');
    const lineage = await browserTab!.evaluate<any>(`(async()=>{const e=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(x=>x.id==='ENG-26002');const prior=e.packageHistory.find(x=>x.revision===2),next=e.packageHistory.find(x=>x.revision===4);const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('ste-auditsphere-generated-artifacts',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});const bytes=await Promise.all(prior.artifacts.map(async a=>{const blob=await new Promise((resolve,reject)=>{const r=db.transaction('artifacts').objectStore('artifacts').get(a.id);r.onsuccess=()=>resolve(r.result?.blob);r.onerror=()=>reject(r.error)});const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join('');return {id:a.id,sha,expected:a.sha256,size:blob.size}}));db.close();return {priorIds:prior.artifacts.map(a=>a.id),nextIds:next.artifacts.map(a=>a.id),bytes};})()`);
    assert.ok(lineage.priorIds.every((id:string)=>!lineage.nextIds.includes(id)), 'new artifact identities are distinct');
    assert.ok(lineage.bytes.every((file:any)=>file.size>0&&file.sha===file.expected), 'the historical package artifacts remain byte-exact after reassembly');
    await setRole('manager');
    await clickButton('Sign-offs & EQR');
    await clickButton('Present Current Package');
    assert.equal(await browserTab!.evaluate<boolean>(`(() => {const e=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26002');return e.managementPresentation?.packageRevision===4&&!e.managementPackageDecision&&(e.managementPackageDecisionHistory||[]).some(d=>d.packageRevision===2&&d.decision==='Acknowledged');})()`), true, 'replacement package presentation keeps the prior acknowledgement historical and unacknowledged for the new revision');
    await browserTab!.evaluate(`(() => {const select=document.querySelector('#role-select');const option=[...select.options].find(o=>o.textContent.includes('Aisha Saleh'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,option.value);select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser('JSON.parse(localStorage.getItem("ste-auditsphere-role-portals-v2")).currentRole === "client"'), true);
    await clickButton('Management Approvals');
    await browserTab!.evaluate(`(() => {const reason=document.querySelector('[aria-label="Management package rationale"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(reason,'Reviewed replacement financial package revision 4.');reason.dispatchEvent(new Event('input',{bubbles:true}));const evidence=document.querySelector('[aria-label="Management package evidence"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(evidence,'Northstar board minutes 2026-09-24');evidence.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await clickButton('Acknowledge Package');
    assert.equal(await browserTab!.evaluate<boolean>(`(() => {const e=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26002');return e.managementPackageDecision?.decision==='Acknowledged'&&e.managementPackageDecision.packageRevision===4&&e.managementPackageDecision.evidenceRef==='Northstar board minutes 2026-09-24'&&e.managementPackageDecisionHistory.some(d=>d.packageRevision===2&&d.decision==='Acknowledged');})()`), true, 'independent management acknowledgement pins replacement revision 4 while retaining revision 2 history');
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('AT-49/AT-60: validates every practice report, client scoping, and exported CSV rows', async () => {
    const priorState = await browserTab!.evaluate<string | null>(`localStorage.getItem('ste-auditsphere-role-portals-v2')`);
    try {
      await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2', ${JSON.stringify(JSON.stringify(createInitialState()))})`);
      await browserTab!.command('Page.reload');
      assert.equal(await waitForBrowser('!!document.querySelector("#app-root .brandname")'), true, 'report fixture reloads from a deterministic manager state');
      await clickButton('Report Centre');
      assert.equal(await waitForBrowser('!!document.querySelector("#practice-report")'), true);
      await browserTab!.evaluate(`(() => { URL.createObjectURL = blob => { window.__reportCsv = blob; return 'blob:report-test'; }; window.__reportPrints=0; window.print=()=>window.__reportPrints++; })()`);
      const reports = await browserTab!.evaluate<Array<{ value: string; label: string }>>('[...document.querySelectorAll("#practice-report option")].map(o => ({ value: o.value, label: o.textContent.trim() }))');
      assert.equal(reports.length, 16, 'VP-060 report catalogue count');
      for (const report of reports) {
        await browserTab!.evaluate(`(() => {
        const select = document.querySelector('#practice-report');
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(report.value)});
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`);
        assert.equal(await waitForBrowser(`document.querySelector('#practice-report')?.value === ${JSON.stringify(report.value)}`), true);
        const visible = await browserTab!.evaluate<string>('document.body.innerText');
        assert.ok(visible.includes(report.label), `report view is not visible: ${report.label}`);
        const headers = await browserTab!.evaluate<string[]>('[...document.querySelectorAll("table thead th")].map(x => x.innerText.trim())');
        assert.ok(headers.length >= 4, `${report.label} should render a populated report table`);
        if (report.value === 'ar') assert.match(visible, /As of 2026-09-23/);
        await clickButton('Export Active Report (CSV)');
        const csv = await browserTab!.evaluate<string>('window.__reportCsv.text()');
        const csvRows = parseCsv(csv);
        assert.ok(csvRows[0].length >= 4, `${report.label} export should include report columns`);
        await clickButton('Print Active Report');
        assert.equal(await browserTab!.evaluate<number>('window.__reportPrints'), reports.indexOf(report) + 1, `${report.label} invokes the browser print flow`);
        const sourceState = await browserTab!.evaluate<any>('JSON.parse(localStorage.getItem("ste-auditsphere-role-portals-v2"))');
        const visibleClients = visibleClientIds(sourceState);
        const visibleEngagements = visibleEngagementIds(sourceState);
        const clients = sourceState.clients.filter((item: any) => visibleClients === 'ALL' || visibleClients.includes(item.id));
        const engagements = sourceState.engagements.filter((item: any) => (visibleEngagements === 'ALL' || visibleEngagements.includes(item.id)) && (visibleClients === 'ALL' || visibleClients.includes(item.client)));
        const engagementIds = new Set(engagements.map((item: any) => item.id));
        const jobs = sourceState.jobs.filter((item: any) => engagementIds.has(item.engagementId));
        const jobIds = new Set(jobs.map((item: any) => item.id));
        const invoices = sourceState.invoices.filter((item: any) => engagementIds.has(item.engagementId || item.eng));
        const invoiceIds = new Set(invoices.map((item: any) => item.id));
        const clientIds = new Set(clients.map((item: any) => item.id));
        const credits = sourceState.creditNotes.filter((item: any) => invoiceIds.has(item.invoiceId) && clientIds.has(item.clientId));
        const receipts = sourceState.receipts.filter((item: any) => clientIds.has(item.clientId));
        const aging = calculateReceivablesAging(invoices, credits, receipts, sourceState.asOfDate);
        const valueRows: Record<string, string[][]> = {};
        const wip = engagements.map((engagement: any) => {
          const approved = sourceState.times.filter((time: any) => time.engagementId === engagement.id && time.status === 'Approved');
          const recorded = calculateRecordedWipValue(approved);
          const billed = sourceState.invoices.filter((invoice: any) => (invoice.engagementId || invoice.eng) === engagement.id && ['Issued', 'Paid'].includes(invoice.status)).reduce((sum: number, invoice: any) => sum + invoice.amount, 0);
          const unbilled = recorded === null ? null : Math.max(0, recorded - billed);
          return { engagement, client: sourceState.clients.find((item: any) => item.id === engagement.client), approved, recorded, billed, unbilled };
        });
        const singleWipCurrency = new Set(wip.map((item: any) => item.engagement.currency)).size <= 1;
        const totalWip = singleWipCurrency && wip.every((item: any) => item.recorded !== null) ? wip.reduce((sum: number, item: any) => sum + item.recorded, 0) : null;
        const totalBilled = singleWipCurrency ? wip.reduce((sum: number, item: any) => sum + item.billed, 0) : null;
        const totalUnbilled = singleWipCurrency && wip.every((item: any) => item.unbilled !== null) ? wip.reduce((sum: number, item: any) => sum + item.unbilled, 0) : null;
        valueRows.wip = [
          ...wip.map((item: any) => [item.client?.name || item.engagement.client, item.engagement.id, item.engagement.service, item.engagement.currency, formatMinutesToHours(item.approved.reduce((sum: number, time: any) => sum + time.durationMinutes, 0)), item.recorded === null ? 'Unknown' : String(item.recorded), String(item.billed), item.unbilled === null ? 'Unknown' : String(item.unbilled)]),
          ['Filtered totals', '', '', singleWipCurrency ? wip[0]?.engagement.currency || 'QAR' : 'Mixed', formatMinutesToHours(wip.reduce((sum: number, item: any) => sum + item.approved.reduce((mins: number, time: any) => mins + time.durationMinutes, 0), 0)), totalWip === null ? 'Unknown' : String(totalWip), totalBilled === null ? 'Unknown' : String(totalBilled), totalUnbilled === null ? 'Unknown' : String(totalUnbilled)]
        ];
        valueRows.utilization = sourceState.users.filter((user: any) => user.group === 'Professional').map((user: any) => {
          const times = sourceState.times.filter((time: any) => time.person === user.name && time.status === 'Approved' && engagementIds.has(time.engagementId));
          const billable = times.filter((time: any) => time.billable).reduce((sum: number, time: any) => sum + time.durationMinutes, 0);
          const nonBillable = times.filter((time: any) => !time.billable).reduce((sum: number, time: any) => sum + time.durationMinutes, 0);
          const target = user.role === 'partner' ? 50 : user.role === 'manager' ? 75 : 85;
          return [user.name, user.label, String(Math.round(billable / 60)), String(Math.round(nonBillable / 60)), `${target}%`, `${times.length ? Math.round(billable / (billable + nonBillable) * 100) : 0}%`];
        });
        valueRows.compliance = engagements.map((engagement: any) => [engagement.id, sourceState.clients.find((item: any) => item.id === engagement.client)?.name || engagement.client, engagement.service, String(engagement.year), engagement.due, engagement.stage, engagement.partner]);
        const clientName = (id: string) => sourceState.clients.find((item: any) => item.id === id)?.name || id;
        valueRows.clients = engagements.map((e: any) => [clientName(e.client), e.id, e.service, String(e.year), e.stage, e.manager, e.partner, e.currency]);
        valueRows.jobs = jobs.map((j: any) => [j.id, j.engagementId, j.title, j.owner, j.status, j.dueDate, j.dueDate < sourceState.asOfDate && !['Completed', 'Cancelled'].includes(j.status) ? 'Yes' : 'No']);
        valueRows.tasks = sourceState.jobTasks.filter((t: any) => jobIds.has(t.jobId)).map((t: any) => [t.id, t.jobId, jobs.find((j: any) => j.id === t.jobId)?.engagementId || '', t.title, t.assignee, t.status, t.dueDate || '', t.dueDate && t.dueDate < sourceState.asOfDate && !['Completed', 'Cancelled'].includes(t.status) ? 'Yes' : 'No']);
        valueRows.pbc = engagements.flatMap((e: any) => e.pbc.filter((p: any) => !['Accepted', 'Cancelled'].includes(p.status)).map((p: any) => [p.id, e.id, p.title, p.status, p.owner, p.due]));
        valueRows.time = sourceState.times.filter((t: any) => t.status === 'Approved' && engagementIds.has(t.engagementId)).map((t: any) => [t.person, t.engagementId, t.activity, t.date, String(t.durationMinutes), t.billable ? 'Billable' : 'Non-billable', t.currency || 'Unknown', t.billable && t.billingRatePerHour !== undefined ? (t.durationMinutes / 60 * t.billingRatePerHour).toFixed(2) : 'Unknown']);
        valueRows.budget = sourceState.budgets.filter((b: any) => engagementIds.has(b.engagementId)).map((b: any) => {
          const actual = sourceState.times.filter((t: any) => t.status === 'Approved' && t.engagementId === b.engagementId && (b.jobId ? t.jobId === b.jobId : !t.jobId));
          const planned = b.lines.reduce((sum: number, line: any) => sum + line.plannedMinutes, 0);
          const minutes = actual.reduce((sum: number, t: any) => sum + t.durationMinutes, 0);
          const billable = actual.filter((t: any) => t.billable);
          const amount = billable.every((t: any) => t.billingRatePerHour !== undefined) ? billable.reduce((sum: number, t: any) => sum + t.durationMinutes / 60 * (t.billingRatePerHour || 0), 0).toFixed(2) : 'Unknown';
          return [b.engagementId, b.jobId || 'Engagement', String(b.version), b.currency, String(planned), String(minutes), String(minutes - planned), amount];
        });
        valueRows.invoices = invoices.filter((i: any) => clientIds.has(i.clientId)).map((i: any) => [i.invoiceNumber, i.engagementId || i.eng, clientName(i.clientId), i.status, i.currency, String(i.amount), String(i.paid), i.due]);
        valueRows.credits = credits.map((c: any) => [c.creditNumber, c.invoiceId, clientName(c.clientId), c.status, c.currency || 'Unknown', String(c.amount), c.issueDate || c.date || '']);
        valueRows.receipts = receipts.map((r: any) => {
          const allocated = r.allocations.filter((a: any) => !a.reversed && invoiceIds.has(a.invoiceId)).reduce((sum: number, a: any) => sum + a.amount, 0);
          return [r.receiptNumber, clientName(r.clientId), r.date, r.currency, String(r.amount), String(allocated), String(Math.max(0, r.amount - allocated))];
        });
        valueRows.ar = aging.invoiceBreakdown.map((r: any) => [r.invoice.invoiceNumber, r.invoice.engagementId || r.invoice.eng, r.invoice.currency, r.invoice.due, String(r.outstanding), r.bucket, String(r.daysOverdue)]);
        valueRows.findings = sourceState.findings.filter((f: any) => engagementIds.has(f.engagementId)).map((f: any) => [f.id, f.engagementId, f.title, f.severity || 'Unrated', f.disposition, f.currency || 'Unknown', f.amount === undefined ? 'Not quantified' : String(f.amount)]);
        valueRows.reviews = engagements.flatMap((e: any) => e.reviews.map((r: any) => [r.id, e.id, r.wp, r.severity, r.status, r.assigned, r.due]));
        valueRows.packages = engagements.map((e: any) => {
          const p = e.packageHistory?.find((item: any) => item.revision === e.packageRevision);
          return [e.id, clientName(e.client), String(e.packageRevision), p ? `TB v${p.sourceVersion}` : 'Not assembled', p ? p.validation.passed && p.sourceVersion === e.sourceVersion ? 'Ready' : 'Stale / blocked' : 'Not assembled', String(p?.artifacts.length || 0), (p?.artifacts || []).map((a: any) => a.sha256).join('; ')];
        });
        const expectedRows: Record<string, number> = {
          wip: engagements.length + 1,
          utilization: sourceState.users.filter((item: any) => item.group === 'Professional').length,
          compliance: engagements.length,
          clients: engagements.length,
          jobs: jobs.length,
          tasks: sourceState.jobTasks.filter((item: any) => jobIds.has(item.jobId)).length,
          pbc: engagements.flatMap((item: any) => item.pbc.filter((p: any) => !['Accepted', 'Cancelled'].includes(p.status))).length,
          time: sourceState.times.filter((item: any) => item.status === 'Approved' && engagementIds.has(item.engagementId)).length,
          budget: sourceState.budgets.filter((item: any) => engagementIds.has(item.engagementId)).length,
          invoices: invoices.filter((item: any) => clientIds.has(item.clientId)).length,
          credits: credits.length,
          receipts: receipts.length,
          ar: aging.invoiceBreakdown.length,
          findings: sourceState.findings.filter((item: any) => engagementIds.has(item.engagementId)).length,
          reviews: engagements.reduce((sum: number, item: any) => sum + item.reviews.length, 0),
          packages: engagements.length
        };
        assert.equal(csvRows.length - 1, expectedRows[report.value], `${report.label} CSV row count should reconcile to current source records`);
        if (valueRows[report.value]) {
          assert.deepEqual(csvRows.slice(1), valueRows[report.value], `${report.label} values should match independently recalculated source values`);
        } else {
          const displayed = await browserTab!.evaluate<{ headers: string[]; rows: string[][] }>(`(() => {const heading=[...document.querySelectorAll('h3')].find(x=>x.textContent.trim()===${JSON.stringify(report.label)});const table=heading?.closest('.panel')?.querySelector('table');if(!table)throw Error('Report table missing: '+${JSON.stringify(report.label)});return {headers:[...table.querySelectorAll('thead th')].map(x=>x.textContent.trim()).slice(0,-1),rows:[...table.querySelectorAll('tbody tr')].map(row=>[...row.querySelectorAll('td')].map(x=>x.textContent.trim()).slice(0,-1))};})()`);
          assert.deepEqual(csvRows[0], displayed.headers, `${report.label} CSV headers should match the on-screen report`);
          const displayedRows = displayed.rows.map((row, rowIndex) => row.map((cell, cellIndex) => csvRows[rowIndex + 1][cellIndex] === '' && cell === '—' ? '' : cell));
          assert.deepEqual(csvRows.slice(1), displayedRows, `${report.label} CSV values should match the on-screen report row by row`);
        }
      }

      await browserTab!.evaluate(`(() => {
        const client = document.querySelector('#report-client-filter');
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(client, 'CL-002');
        client.dispatchEvent(new Event('change', { bubbles: true }));
        const report = document.querySelector('#practice-report');
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(report, 'clients');
        report.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      assert.equal(await waitForBrowser('document.body.innerText.includes("Northstar Services")'), true);
      const rows = await browserTab!.evaluate<string[]>('[...document.querySelectorAll(".tablewrap tbody tr")].map(r => r.innerText)');
      assert.ok(rows.length > 0);
      assert.ok(rows.every(row => row.includes('CL-002') || row.includes('Northstar Services')), `client filter leaked another entity: ${rows.join(' | ')}`);
      await clickButton('Export Active Report (CSV)');
      const csv = await browserTab!.evaluate<string>('window.__reportCsv.text()');
      assert.match(csv, /Northstar Services/);
      assert.doesNotMatch(csv, /Example Trading Entity|Meridian Manufacturing/);

      await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');const o=[...s.options].find(x=>x.textContent.includes('Billing officer'));if(!o)throw Error('Billing persona missing');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentRole === 'billing'`), true);
      const billingReports = await browserTab!.evaluate<string[]>('[...document.querySelectorAll("#practice-report option")].map(o=>o.value)');
      assert.deepEqual(billingReports, ['wip', 'utilization', 'clients', 'time', 'budget', 'invoices', 'credits', 'receipts', 'ar']);
      assert.ok(!billingReports.some(key => ['jobs', 'tasks', 'compliance', 'pbc', 'findings', 'reviews', 'packages'].includes(key)), 'billing catalogue must hide reports outside its permitted set');
      await browserTab!.evaluate(`(() => {const c=document.querySelector('#report-client-filter');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(c,'CL-001');c.dispatchEvent(new Event('change',{bubbles:true}));const s=document.querySelector('#practice-report');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'invoices');s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      assert.equal(await waitForBrowser(`document.querySelector('#practice-report')?.value === 'invoices'`), true);
      await clickButton('Export Active Report (CSV)');
      const billingCsv = parseCsv(await browserTab!.evaluate<string>('window.__reportCsv.text()'));
      assert.ok(billingCsv.length > 1, 'billing persona has scoped invoice rows');
      assert.ok(billingCsv.slice(1).every(row => row[2] === 'Example Trading Entity'), 'billing export must honor the active client filter');

      const selectPersona = async (label: string) => browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');const o=[...s.options].find(x=>x.textContent.includes(${JSON.stringify(label)}));if(!o)throw Error('Persona missing: '+${JSON.stringify(label)});Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await selectPersona('Engagement partner');
      assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentRole === 'partner'`), true);
      assert.equal((await browserTab!.evaluate<string[]>('[...document.querySelectorAll("#practice-report option")].map(o=>o.value)')).length, 16, 'partner can use the complete manager report catalogue');

      await selectPersona('Records administrator');
      assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentRole === 'records'`), true);
      const recordsReports = await browserTab!.evaluate<string[]>('[...document.querySelectorAll("#practice-report option")].map(o=>o.value)');
      assert.deepEqual(recordsReports, ['compliance', 'clients', 'jobs', 'tasks'], 'records persona sees only its four permitted operational reports');
      await browserTab!.evaluate(`(() => {const c=document.querySelector('#report-client-filter');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(c,'CL-002');c.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      const engagementClients = await browserTab!.evaluate<Record<string, string>>(`Object.fromEntries(JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.map(e=>[e.id,e.client]))`);
      const engagementColumn: Record<string, number> = { compliance: 0, clients: 1, jobs: 1, tasks: 2 };
      const expectedRecordsRows = await browserTab!.evaluate<Record<string, number>>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const ids=new Set(s.engagements.filter(e=>e.client==='CL-002').map(e=>e.id));const jobs=s.jobs.filter(j=>ids.has(j.engagementId));const jobIds=new Set(jobs.map(j=>j.id));return {compliance:ids.size,clients:ids.size,jobs:jobs.length,tasks:s.jobTasks.filter(t=>jobIds.has(t.jobId)).length};})()`);
      for (const key of recordsReports) {
        await browserTab!.evaluate(`(() => {const s=document.querySelector('#practice-report');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(key)});s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
        await clickButton('Export Active Report (CSV)');
        const rows = parseCsv(await browserTab!.evaluate<string>('window.__reportCsv.text()')).slice(1);
        assert.equal(rows.length, expectedRecordsRows[key], `${key} filter should match selected-client source rows`);
        assert.ok(rows.every(row => engagementClients[row[engagementColumn[key]]] === 'CL-002'), `${key} export must contain only the selected client's engagements`);
      }
      assert.equal(browserTab!.exceptions.length, 0);
    } finally {
      if (priorState) {
        await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2', ${JSON.stringify(priorState)})`);
      } else {
        await browserTab!.evaluate(`localStorage.removeItem('ste-auditsphere-role-portals-v2')`);
      }
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
    }
  });

  it('AT-43/AT-44/AT-45: reviews pinned consolidation snapshots and approved eliminations without changing source TBs', async () => {
    const original = await browserTab!.evaluate<string | null>(`localStorage.getItem('ste-auditsphere-role-portals-v2')`);
    try {
      await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2', ${JSON.stringify(JSON.stringify(createInitialState()))})`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
      const sourceBefore = await browserTab!.evaluate<string>(`JSON.stringify(['ENG-26001','ENG-26002'].map(id => { const e=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(x=>x.id===id); return {id, rows:e.rows, sourceVersion:e.sourceVersion}; }))`);
      await clickButton('Group Consolidation');
      assert.equal(await waitForBrowser('document.body.innerText.includes("Group Consolidation Workbench")'), true);
      await clickButton('Group Perimeter & Pinned Packages (2)');
      const perimeter = await browserTab!.evaluate<string>('document.body.innerText');
      assert.match(perimeter, /Example Trading Entity/);
      assert.match(perimeter, /Northstar Services/);
      assert.match(perimeter, /Pinned snapshot/);
      await clickButton('Intercompany Eliminations (1)');
      assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /Elimination of Intercompany Management Fee/);
      assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /50,000/);
      await clickButton('Consolidated Balance Sheet Grid');
      assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /Equation Satisfied \(Net Zero\)/);
      await clickButton('Currency Translation (FX)');
      assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /supported synthetic profile translates every balance-sheet line/);
      const sourceAfter = await browserTab!.evaluate<string>(`JSON.stringify(['ENG-26001','ENG-26002'].map(id => { const e=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(x=>x.id===id); return {id, rows:e.rows, sourceVersion:e.sourceVersion}; }))`);
      assert.equal(sourceAfter, sourceBefore, 'consolidation review must not mutate component trial balances');
      assert.deepEqual(browserTab!.exceptions, []);
    } finally {
      if (original) await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2', ${JSON.stringify(original)})`);
      else await browserTab!.evaluate(`localStorage.removeItem('ste-auditsphere-role-portals-v2')`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
    }
  });

  it('AT-43: blocks missing FX and accepts a dated component-currency closing rate', async () => {
    const original = await browserTab!.evaluate<string | null>(`localStorage.getItem('ste-auditsphere-role-portals-v2')`);
    try {
      const sourceBefore = await browserTab!.evaluate<any>(`(() => {
        const state = ${JSON.stringify(createInitialState())};
        const group = state.consolidationGroups[0];
        group.components[1].currency = 'USD';
        group.components[1].functionalCurrency = 'USD';
        delete group.fxRates.USD;
        const eng = state.engagements.find(item => item.id === group.components[1].componentId);
        localStorage.setItem('ste-auditsphere-role-portals-v2', JSON.stringify(state));
        return structuredClone(eng.rows);
      })()`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
      await clickButton('Group Consolidation');
      assert.equal(await waitForBrowser('document.body.innerText.includes("Currency Rate Required")'), true);
      await browserTab!.evaluate(`(() => {const e=document.querySelector('[aria-label="FX closing rate"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'0');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await clickButton('Save closing rate');
      assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /greater than zero/);
      assert.equal(await browserTab!.evaluate<boolean>(`!JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).consolidationGroups[0].fxRates.USD`), true, 'invalid rate is not saved');
      await browserTab!.evaluate(`(() => {const e=document.querySelector('[aria-label="FX closing rate"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'3.64');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await clickButton('Save closing rate');
      assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).consolidationGroups[0].fxRateHistory.USD[0].rate===3.64`), true);
      assert.equal(await waitForBrowser('document.body.innerText.includes("Consolidated Balance Sheet Grid")'), true, 'valid rate unblocks the calculation');
      await clickButton('Currency Translation (FX)');
      const text = await browserTab!.evaluate<string>('document.body.innerText');
      assert.match(text, /USD → QAR: 3\.64/);
      assert.match(text, /v1 · Closing · 2026-09-23 · 3\.64/);
      assert.deepEqual(await browserTab!.evaluate<any>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26002').rows`), sourceBefore, 'translation leaves component TB rows unchanged');
      assert.deepEqual(browserTab!.exceptions, []);
    } finally {
      if (original) await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2', ${JSON.stringify(original)})`);
      else await browserTab!.evaluate(`localStorage.removeItem('ste-auditsphere-role-portals-v2')`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
    }
  });

  it('AT-43: blocks consolidation output and identifies a missing perimeter role', async () => {
    const original = await browserTab!.evaluate<string | null>(`localStorage.getItem('ste-auditsphere-role-portals-v2')`);
    try {
      const sourceBefore = await browserTab!.evaluate<string>(`(() => {
        const state = ${JSON.stringify(createInitialState())};
        const group = state.consolidationGroups[0];
        group.components = group.components.filter(component => component.role !== 'Subsidiary');
        const rows = state.engagements.find(engagement => engagement.id === 'ENG-26001').rows;
        localStorage.setItem('ste-auditsphere-role-portals-v2', JSON.stringify(state));
        return JSON.stringify(rows);
      })()`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
      await clickButton('Group Consolidation');
      const text = await browserTab!.evaluate<string>('document.body.innerText');
      assert.match(text, /group perimeter is incomplete \(missing Subsidiary\)/i);
      assert.match(text, /Unsupported Consolidation Profile/);
      assert.doesNotMatch(text, /Consolidated Balance Sheet Grid|Equation Satisfied/);
      assert.equal(await browserTab!.evaluate<string>(`JSON.stringify(JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(engagement => engagement.id === 'ENG-26001').rows)`), sourceBefore);
      assert.deepEqual(browserTab!.exceptions, []);
    } finally {
      if (original) await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2', ${JSON.stringify(original)})`);
      else await browserTab!.evaluate(`localStorage.removeItem('ste-auditsphere-role-portals-v2')`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
    }
  });

  it('AT-43: labels minority ownership unsupported and produces no consolidated figures', async () => {
    const original = await browserTab!.evaluate<string | null>(`localStorage.getItem('ste-auditsphere-role-portals-v2')`);
    try {
      const sourceBefore = await browserTab!.evaluate<string>(`(() => {
        const state = ${JSON.stringify(createInitialState())};
        const group = state.consolidationGroups[0];
        group.components[1].ownershipPercent = 80;
        const rows = state.engagements.find(engagement => engagement.id === 'ENG-26002').rows;
        localStorage.setItem('ste-auditsphere-role-portals-v2', JSON.stringify(state));
        return JSON.stringify(rows);
      })()`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
      await clickButton('Group Consolidation');
      const text = await browserTab!.evaluate<string>('document.body.innerText');
      assert.match(text, /only one Parent and one 100% owned Subsidiary/i);
      assert.doesNotMatch(text, /Consolidated Balance Sheet Grid|Equation Satisfied/);
      assert.equal(await browserTab!.evaluate<string>(`JSON.stringify(JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(engagement => engagement.id === 'ENG-26002').rows)`), sourceBefore);
      assert.deepEqual(browserTab!.exceptions, []);
    } finally {
      if (original) await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2', ${JSON.stringify(original)})`);
      else await browserTab!.evaluate(`localStorage.removeItem('ste-auditsphere-role-portals-v2')`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
    }
  });

  it('AT-43: edits the group perimeter with validation, history, elimination re-review and revert', async () => {
    const original = await browserTab!.evaluate<string | null>(`localStorage.getItem('ste-auditsphere-role-portals-v2')`);
    try {
      const sourceBefore = await browserTab!.evaluate<string>(`(() => {
        const state = ${JSON.stringify(createInitialState())};
        const seed = structuredClone(state.engagements.find(e => e.id === 'ENG-26002'));
        seed.id = 'ENG-26004';
        seed.client = 'CL-002';
        state.engagements.push(seed);
        localStorage.setItem('ste-auditsphere-role-portals-v2', JSON.stringify(state));
        return JSON.stringify(state.engagements.filter(e => ['ENG-26001', 'ENG-26002', 'ENG-26004'].includes(e.id)).map(e => ({ id: e.id, rows: e.rows })));
      })()`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
      const perimeterState = () => browserTab!.evaluate<any>(`(() => {const g=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).consolidationGroups[0];return {rev:g.perimeterRevision||1,history:(g.perimeterHistory||[]).length,subsidiary:g.components.find(c=>c.role==='Subsidiary').componentId,subDate:g.components.find(c=>c.role==='Subsidiary').effectiveDate||null,elim:g.eliminations[0].status,elimHistory:(g.eliminations[0].reviewHistory||[]).length,elimAmount:g.eliminations[0].amount};})()`);
      const setEditorInput = (label: string, value: string) => browserTab!.evaluate(`(() => {const e=document.querySelector('[aria-label='+JSON.stringify(${JSON.stringify(label)})+']');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      const setEditorSelect = (label: string, value: string) => browserTab!.evaluate(`(() => {const s=document.querySelector('[aria-label='+JSON.stringify(${JSON.stringify(label)})+']');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(value)});s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await clickButton('Group Consolidation');
      assert.equal(await waitForBrowser('document.body.innerText.includes("Group Consolidation Workbench")'), true);
      await clickButton('Group Perimeter & Pinned Packages (2)');
      assert.equal(await waitForBrowser('document.body.innerText.includes("Edit group perimeter")'), true);
      assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /Current perimeter revision 1/);
      await setEditorInput('Effective date for Parent component', '2026-02-30');
      await setEditorInput('Reason for perimeter change', 'Invalid date attempt');
      await clickButton('Save perimeter revision');
      assert.equal(await waitForBrowser('document.body.innerText.includes("valid effective date")'), true, 'impossible dates are rejected');
      assert.deepEqual(await perimeterState(), { rev: 1, history: 0, subsidiary: 'ENG-26002', subDate: null, elim: 'Approved', elimHistory: 0, elimAmount: 50000 }, 'a failed save leaves the recorded perimeter untouched');
      await setEditorInput('Effective date for Parent component', '2026-01-01');
      await setEditorInput('Effective date for Subsidiary component', '2026-03-15');
      await setEditorInput('Reason for perimeter change', 'Record component effective dates');
      await clickButton('Save perimeter revision');
      assert.equal(await waitForBrowser('document.body.innerText.includes("Perimeter revision 2 saved")'), true);
      assert.deepEqual(await perimeterState(), { rev: 2, history: 1, subsidiary: 'ENG-26002', subDate: '2026-03-15', elim: 'Approved', elimHistory: 0, elimAmount: 50000 }, 'date-only edits keep elimination approval');
      assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /2026-01-01/);
      await setEditorSelect('Subsidiary component engagement', 'ENG-26001');
      await setEditorInput('Reason for perimeter change', 'Duplicate attempt');
      await clickButton('Save perimeter revision');
      assert.equal(await waitForBrowser('document.body.innerText.includes("exactly two distinct")'), true, 'duplicate components are rejected');
      assert.equal((await perimeterState()).rev, 2, 'a rejected swap preserves the perimeter revision');
      await setEditorSelect('Subsidiary component engagement', 'ENG-26004');
      await setEditorInput('Reason for perimeter change', 'Correct subsidiary to the in-scope 2026 engagement');
      await clickButton('Save perimeter revision');
      assert.equal(await waitForBrowser('document.body.innerText.includes("Perimeter revision 3 saved")'), true);
      assert.deepEqual(await perimeterState(), { rev: 3, history: 2, subsidiary: 'ENG-26004', subDate: null, elim: 'Draft', elimHistory: 1, elimAmount: 50000 }, 'component replacement returns approval to draft with journal preserved');
      await clickButton('Intercompany Eliminations (1)');
      assert.equal(await waitForBrowser('document.body.innerText.includes("Re-review required")'), true);
      await clickButton('Group Perimeter & Pinned Packages (2)');
      await setEditorInput('Reason for perimeter change', 'Subsidiary correction was premature');
      await clickButton('Revert to revision 2');
      assert.equal(await waitForBrowser('document.body.innerText.includes("Perimeter revision 4 saved")'), true);
      assert.deepEqual(await perimeterState(), { rev: 4, history: 3, subsidiary: 'ENG-26002', subDate: '2026-03-15', elim: 'Draft', elimHistory: 1, elimAmount: 50000 }, 'revert restores the recorded revision content');
      assert.equal(await browserTab!.evaluate<string>(`JSON.stringify(JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.filter(e=>['ENG-26001','ENG-26002','ENG-26004'].includes(e.id)).map(e=>({id:e.id,rows:e.rows})))`), sourceBefore, 'perimeter work never mutates engagement trial balances');
      assert.deepEqual(browserTab!.exceptions, []);
    } finally {
      if (original) await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2', ${JSON.stringify(original)})`);
      else await browserTab!.evaluate(`localStorage.removeItem('ste-auditsphere-role-portals-v2')`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
    }
  });

  it('AT-43: projects only granted consolidation components under a narrow group grant', async () => {
    const original = await browserTab!.evaluate<string | null>(`localStorage.getItem('ste-auditsphere-role-portals-v2')`);
    try {
      await browserTab!.evaluate(`(() => {const s=${JSON.stringify(createInitialState())};s.currentUserId='group-user';s.currentPerson=s.users.find(u=>u.id==='group-user').name;s.currentRole='manager';s.selectedEngagement='ENG-26001';localStorage.setItem('ste-auditsphere-role-portals-v2',JSON.stringify(s));})()`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
      await clickButton('Group Consolidation');
      assert.equal(await waitForBrowser('document.body.innerText.includes("Group Consolidation Workbench")'), true);
      const text = await browserTab!.evaluate<string>('document.body.innerText');
      assert.match(text, /Example Trading Entity/, 'the granted Parent component is projected');
      assert.match(text, /Outside your scoped grant/, 'the ungranted Subsidiary slot is redacted');
      assert.match(text, /Consolidated output is unavailable under your scoped grant/);
      assert.doesNotMatch(text, /Northstar Services/, 'no ungranted client detail is projected');
      assert.doesNotMatch(text, /ENG-26002/, 'no ungranted engagement identity is projected');
      assert.doesNotMatch(text, /Consolidated Balance Sheet Grid|Intercompany Eliminations|Currency Translation/, 'no figure-bearing tabs are offered');
      assert.doesNotMatch(text, /Equation Satisfied|50,000|Edit group perimeter|Save perimeter revision|Revert to revision/, 'no figures, editor or history cross the grant boundary');
      assert.deepEqual(browserTab!.exceptions, []);
    } finally {
      if (original) await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2', ${JSON.stringify(original)})`);
      else await browserTab!.evaluate(`localStorage.removeItem('ste-auditsphere-role-portals-v2')`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
    }
  });

  it('AT-35: rejects an unbalanced TB import then preserves the accepted source revision on replacement', async () => {
    await browserTab!.evaluate(`(() => {const state=${JSON.stringify(createInitialState())};state.selectedEngagement='ENG-26002';localStorage.setItem('ste-auditsphere-role-portals-v2',JSON.stringify(state));})()`);
    await browserTab!.command('Page.reload');
    assert.equal(await waitForBrowser('!!document.querySelector("#role-select")'), true);
    const before = await browserTab!.evaluate<any>(`(() => {const e=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(x=>x.id==='ENG-26002');return {version:e.sourceVersion,rows:e.rows,history:e.sourceHistory};})()`);
    await clickButton('Accounting Workbench');
    assert.equal(await waitForBrowser('document.body.innerText.includes("Trial-Balance Intake")'), true);
    const file = (name: string, contents: string) => `(() => {
      const input=document.querySelector('input[type=file][accept*=".csv"]'); const transfer=new DataTransfer();
      transfer.items.add(new File([${JSON.stringify(contents)}],${JSON.stringify(name)},{type:'text/csv'}));
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'files').set.call(input,transfer.files); input.dispatchEvent(new Event('change',{bubbles:true}));
    })()`;
    const assertSourceUnchanged = async (message: string) => {
      const current = await browserTab!.evaluate<any>(`(() => {const e=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(x=>x.id==='ENG-26002');return {version:e.sourceVersion,rows:e.rows};})()`);
      assert.equal(current.version, before.version, message);
      assert.deepEqual(current.rows, before.rows, message);
    };
    await browserTab!.evaluate(file('duplicate.csv', 'code,name,balance\n1000,Cash,50\n1000,Cash duplicate,-50\n'));
    assert.equal(await waitForBrowser('document.body.innerText.includes("Selected: duplicate.csv")'), true);
    await clickButton('Preview & validate');
    assert.equal(await waitForBrowser('document.body.innerText.includes("duplicate account code")'), true);
    await assertSourceUnchanged('duplicate account codes cannot replace an accepted source');
    await browserTab!.evaluate(file('formula.csv', 'code,name,balance\n1000,Cash,=1+1\n2000,Payables,-100\n'));
    assert.equal(await waitForBrowser('document.body.innerText.includes("Selected: formula.csv")'), true);
    await clickButton('Preview & validate');
    assert.equal(await waitForBrowser('document.body.innerText.includes("formula cells are rejected")'), true);
    await assertSourceUnchanged('formula cells cannot replace an accepted source');
    await browserTab!.evaluate(file('renamed.csv.xlsx', 'code,name,balance\n1000,Cash,50\n2000,Payables,-50\n'));
    assert.equal(await waitForBrowser('document.body.innerText.includes("Selected: renamed.csv.xlsx")'), true);
    assert.equal(await waitForBrowser('document.body.innerText.includes("CSV or text renamed to .xlsx is rejected")'), true);
    await assertSourceUnchanged('a CSV with an XLSX extension is rejected before preview');
    await browserTab!.evaluate(`(() => {const input=document.querySelector('input[type=file][accept*=".csv"]');const transfer=new DataTransfer();transfer.items.add(new File([new Uint8Array(2*1024*1024+1)],'too-large.csv',{type:'text/csv'}));Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'files').set.call(input,transfer.files);input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser('document.body.innerText.includes("File exceeds the 2 MB demo limit")'), true);
    await assertSourceUnchanged('oversized sources cannot replace an accepted source');
    await browserTab!.evaluate(file('unbalanced.csv', 'code,name,balance\n1000,Cash,100\n2000,Payables,-50\n'));
    assert.equal(await waitForBrowser('document.body.innerText.includes("Selected: unbalanced.csv")'), true);
    await clickButton('Preview & validate');
    assert.equal(await waitForBrowser('document.body.innerText.includes("Unbalanced preview")'), true);
    const rejected = await browserTab!.evaluate<any>(`(() => {const e=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(x=>x.id==='ENG-26002');return {version:e.sourceVersion,rows:e.rows};})()`);
    assert.equal(rejected.version, before.version);
    assert.deepEqual(rejected.rows, before.rows);

    await browserTab!.evaluate(file('replacement.csv', 'code,name,balance\n1000,Cash,100\n2000,Payables,-100\n'));
    assert.equal(await waitForBrowser('document.body.innerText.includes("Selected: replacement.csv")'), true);
    await clickButton('Preview & validate');
    assert.equal(await waitForBrowser('document.body.innerText.includes("Preview ready: 2 rows, net 0.00")'), true, await browserTab!.evaluate<string>('document.body.innerText'));
    await clickButton('Commit as new source revision');
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26002').sourceVersion === ${before.version + 1}`), true);
    const after = await browserTab!.evaluate<any>(`(() => {const e=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(x=>x.id==='ENG-26002');return {version:e.sourceVersion,rows:e.rows,history:e.sourceHistory};})()`);
    assert.deepEqual(after.history.find((item: any) => item.version === before.version).rows, before.rows, 'previous accepted rows remain in source history');
    const imported = after.history.find((item: any) => item.version === after.version);
    assert.equal(imported.fileName, 'replacement.csv');
    assert.match(imported.sha256, /^[0-9a-f]{64}$/);
    assert.equal(imported.predecessorVersion, before.version);
    assert.deepEqual(imported.rows, after.rows);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['code', 'name', 'balance'], ['4000', 'Revenue', -50], ['5000', 'Expense', 50]]), 'TB');
    const base64 = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
    await browserTab!.evaluate(`(() => {
      const raw=atob(${JSON.stringify(base64)}); const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
      const input=document.querySelector('input[type=file][accept*=".csv"]'); const transfer=new DataTransfer();
      transfer.items.add(new File([bytes], 'replacement.xlsx', {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
      input.files=transfer.files; input.dispatchEvent(new Event('change',{bubbles:true}));
    })()`);
    assert.equal(await waitForBrowser('document.body.innerText.includes("Selected: replacement.xlsx")'), true);
    await clickButton('Preview & validate');
    assert.equal(await waitForBrowser('document.body.innerText.includes("Preview ready: 2 rows, net 0.00")'), true);
    await clickButton('Commit as new source revision');
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26002').sourceVersion === ${before.version + 2}`), true);
    const xlsxRevision = await browserTab!.evaluate<any>(`(() => {const e=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(x=>x.id==='ENG-26002');return e.sourceHistory.find(x=>x.version===e.sourceVersion);})()`);
    assert.equal(xlsxRevision.fileName, 'replacement.xlsx');
    assert.equal(xlsxRevision.format, 'XLSX');
    assert.equal(xlsxRevision.predecessorVersion, before.version + 1);
    assert.match(xlsxRevision.sha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(xlsxRevision.rows.map((row: any) => row.balance), [-50, 50]);
    await browserTab!.evaluate(file('missing-header.csv', ',Name,Balance\n1000,Cash,50\n2000,Payables,-50'));
    await waitForBrowser('document.body.innerText.includes("Selected: missing-header.csv")');
    await clickButton('Preview & validate');
    assert.equal(await waitForBrowser('document.body.innerText.includes("Missing required headers or ambiguous column mapping")'), true);
    assert.equal((await browserTab!.evaluate<any>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26002').sourceVersion`)), xlsxRevision.version);
    await browserTab!.evaluate(`(() => {const state=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const profile=state.clients.find(item=>item.id==='CL-002').accountingProfile;profile.dimensions[0].values=['Finance','Operations'];localStorage.setItem('ste-auditsphere-role-portals-v2',JSON.stringify(state));})()`);
    await browserTab!.command('Page.reload');
    await waitForBrowser('!!document.querySelector("#app-root .brandname")');
    await clickButton('Accounting Workbench');
    const setLabeledSelect = async (label: string, value: string) => browserTab!.evaluate(`(() => {const label=[...document.querySelectorAll('label')].find(item=>item.textContent.trim()===${JSON.stringify(label)});const select=label?.nextElementSibling;if(!(select instanceof HTMLSelectElement))throw Error('Missing select: '+${JSON.stringify(label)});Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,${JSON.stringify(value)});select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await browserTab!.evaluate(file('signed-net-dimensions.csv', 'Code,Department,Balance,Name\n1000,Finance,50,Cash\n2000,Operations,-50,Payables'));
    assert.equal(await waitForBrowser('document.body.innerText.includes("Selected: signed-net-dimensions.csv")'), true);
    assert.equal(await waitForBrowser('document.body.innerText.includes("Department · 1: Department")'), true, 'header mapping waits for asynchronous file parsing');
    await clickButton('Preview & validate');
    assert.equal(await waitForBrowser('document.body.innerText.includes("Preview ready: 2 rows, net 0.00")'), true);
    await clickButton('Commit as new source revision');
    const signedRevision = await browserTab!.evaluate<any>(`(() => {const e=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(x=>x.id==='ENG-26002');return {version:e.sourceVersion,rows:e.rows,source:e.sourceHistory.find(x=>x.version===e.sourceVersion)}})()`);
    assert.deepEqual(signedRevision.rows.map((row: any) => row.dimensions), [{ 'DIM-DEPT-CL-002': 'Finance' }, { 'DIM-DEPT-CL-002': 'Operations' }]);
    assert.equal(signedRevision.source.mapping.convention, 'signed-net');
    assert.equal(signedRevision.source.mapping.dimension.id, 'DIM-DEPT-CL-002');
    assert.equal(signedRevision.source.mapping.dimension.index, 1);
    assert.equal(signedRevision.source.accountingProfileRevision, 1);
    assert.equal(signedRevision.source.accountingChartRevision, 1);
    assert.equal(signedRevision.source.periodBookId, 'PB-ENG-26002');

    await browserTab!.evaluate(file('unknown-dimension.csv', 'Code,Department,Balance,Name\n1000,Unknown,50,Cash\n2000,Operations,-50,Payables'));
    assert.equal(await waitForBrowser('document.body.innerText.includes("Selected: unknown-dimension.csv")'), true);
    await waitForBrowser('document.body.innerText.includes("Department · 1: Department")');
    await clickButton('Preview & validate');
    assert.equal(await waitForBrowser('document.body.innerText.includes("unknown or missing Department value")'), true);
    assert.equal(await browserTab!.evaluate<boolean>(`[...document.querySelectorAll('button')].find(button=>button.innerText.includes('Commit as new source revision'))?.disabled`), true);
    assert.equal((await browserTab!.evaluate<any>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26002').sourceVersion`)), signedRevision.version, 'unknown dimensions preserve the accepted revision');

    await browserTab!.evaluate(file('debit-credit-reordered.csv', 'Account Name,Account Code,Department,Credit,Debit\nCash,1000,Finance,0,75\nPayables,2000,Operations,75,0'));
    await waitForBrowser('document.body.innerText.includes("Selected: debit-credit-reordered.csv")');
    await setLabeledSelect('Amount convention', 'debit-credit');
    await setLabeledSelect('Code column', '1');
    await setLabeledSelect('Name column', '0');
    await setLabeledSelect('Debit column', '4');
    await setLabeledSelect('Credit column', '3');
    await clickButton('Preview & validate');
    assert.equal(await waitForBrowser('document.body.innerText.includes("Preview ready: 2 rows, net 0.00")'), true);
    await clickButton('Commit as new source revision');
    const debitCreditRevision = await browserTab!.evaluate<any>(`(() => {const e=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(x=>x.id==='ENG-26002');return {rows:e.rows,source:e.sourceHistory.find(x=>x.version===e.sourceVersion)}})()`);
    assert.deepEqual(debitCreditRevision.rows.map((row: any) => row.balance), [75, -75]);
    assert.equal(debitCreditRevision.source.mapping.convention, 'debit-credit');
    assert.deepEqual(debitCreditRevision.source.mapping.dimension, { id: 'DIM-DEPT-CL-002', index: 2 });
    assert.equal(debitCreditRevision.source.predecessorVersion, signedRevision.version);

    await setLabeledSelect('Amount convention', 'signed-net');
    const overLimit = `code,name,balance\n${Array.from({ length: 2001 }, (_, index) => `${6000 + index},Account ${index},${index % 2 ? '1' : '-1'}`).join('\n')}`;
    await browserTab!.evaluate(file('row-limit.csv', overLimit));
    assert.equal(await waitForBrowser('document.body.innerText.includes("Selected: row-limit.csv")'), true);
    await clickButton('Preview & validate');
    assert.equal(await waitForBrowser('document.body.innerText.includes("Row limit exceeded: 2001 data rows (limit 2000)")'), true);
    assert.equal(await browserTab!.evaluate<boolean>(`[...document.querySelectorAll('button')].find(button=>button.innerText.includes('Commit as new source revision'))?.disabled`), true, 'row-limit failure cannot be committed');
    const afterRowLimit = await browserTab!.evaluate<any>(`(() => {const e=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(x=>x.id==='ENG-26002');return {version:e.sourceVersion,rows:e.rows};})()`);
    assert.deepEqual(afterRowLimit, { version: debitCreditRevision.source.version, rows: debitCreditRevision.rows }, 'row-limit failure preserves the latest accepted revision');

    await browserTab!.evaluate(file('wrong-chart.csv', 'code,name,balance\n9998,Unmapped A,-50\n9999,Unmapped B,50\n'));
    assert.equal(await waitForBrowser('document.body.innerText.includes("Selected: wrong-chart.csv")'), true);
    await clickButton('Preview & validate');
    assert.equal(await waitForBrowser('document.body.innerText.includes("Imported accounts must exist as active posting accounts in the selected chart")'), true);
    assert.equal(await browserTab!.evaluate<boolean>(`[...document.querySelectorAll('button')].find(button=>button.innerText.includes('Commit as new source revision'))?.disabled`), true, 'wrong-chart preview cannot be committed');
    const afterWrongChart = await browserTab!.evaluate<any>(`(() => {const e=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(x=>x.id==='ENG-26002');return {version:e.sourceVersion,rows:e.rows};})()`);
    assert.deepEqual(afterWrongChart, { version: debitCreditRevision.source.version, rows: debitCreditRevision.rows }, 'wrong-chart failure preserves the latest accepted revision');

    await browserTab!.evaluate(`(() => {const key='ste-auditsphere-role-portals-v2';const state=JSON.parse(localStorage.getItem(key));const engagement=state.engagements.find(item=>item.id==='ENG-26002');engagement.accountingChartRevision+=1;localStorage.setItem(key,JSON.stringify(state));})()`);
    await browserTab!.command('Page.reload');
    await waitForBrowser('!!document.querySelector("#app-root .brandname")');
    await clickButton('Accounting Workbench');
    assert.equal(await waitForBrowser('document.body.innerText.includes("Trial-Balance Intake")'), true);
    await browserTab!.evaluate(file('stale-context.csv', 'code,name,balance\n1000,Cash,-50\n2000,Payables,50\n'));
    assert.equal(await waitForBrowser('document.body.innerText.includes("Selected: stale-context.csv")'), true);
    await clickButton('Preview & validate');
    assert.equal(await waitForBrowser('document.body.innerText.includes("Complete or reload the client accounting setup and select this engagement’s period book before importing")'), true);
    assert.equal(await browserTab!.evaluate<boolean>(`[...document.querySelectorAll('button')].find(button=>button.innerText.includes('Commit as new source revision'))?.disabled`), true, 'stale context preview cannot be committed');
    const afterWrongContext = await browserTab!.evaluate<any>(`(() => {const e=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(x=>x.id==='ENG-26002');return {version:e.sourceVersion,rows:e.rows};})()`);
    assert.deepEqual(afterWrongContext, { version: debitCreditRevision.source.version, rows: debitCreditRevision.rows }, 'wrong-context failure preserves the latest accepted revision');
    assert.deepEqual(browserTab!.exceptions, []);
    await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2',${JSON.stringify(JSON.stringify(createInitialState()))})`);
    await browserTab!.command('Page.reload');
    await waitForBrowser('!!document.querySelector("#app-root .brandname")');
  });

  it('AT-23/AT-24: creates a PBC request, receives a replacement after clarification, then accepts it independently', async () => {
    const switchPersona = async (label: string, role: string) => {
      await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');const o=[...s.options].find(x=>x.textContent.includes(${JSON.stringify(label)}));if(!o)throw Error('Missing persona: '+${JSON.stringify(label)});Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentRole === ${JSON.stringify(role)}`), true);
      assert.equal(await waitForBrowser(role === 'client' ? 'document.body.innerText.includes("Client Experience Portal")' : 'document.body.innerText.includes("Client Portfolio")'), true);
      if (role === 'client') {
        await browserTab!.evaluate(`(() => {const s=[...document.querySelectorAll('select')].find(x=>[...x.options].some(o=>o.value==='CL-002'));if(s){Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'CL-002');s.dispatchEvent(new Event('change',{bubbles:true}));}else if(!document.body.innerText.includes('Northstar Services'))throw Error('Single-grant client did not resolve to its permitted Northstar entity');})()`);
        assert.equal(await waitForBrowser('document.body.innerText.includes("Northstar Services")'), true);
      }
    };
    const openNorthstarWorkspace = async () => {
      const nav = await browserTab!.evaluate<boolean>(`(() => {const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim().startsWith('Client Portfolio'));if(!b)return false;b.click();return true;})()`);
      assert.equal(nav, true, 'client portfolio navigation should be available to manager');
      const opened = await browserTab!.evaluate<boolean>(`(() => {const card=[...document.querySelectorAll('.client-card')].find(x=>x.innerText.includes('Northstar Services'));const b=[...(card?.querySelectorAll('button')||[])].find(x=>x.innerText.trim()==='Client 360 Workspace');if(!b)return false;b.click();return true;})()`);
      assert.equal(opened, true, 'Northstar client workspace button should be available');
      const tab = await browserTab!.evaluate<boolean>(`(() => {const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim().startsWith('PBC Requests'));if(!b)return false;b.click();return true;})()`);
      assert.equal(tab, true, 'PBC requests tab should be available');
    };
    const openPortalRequests = async () => {
      await clickButton('Client Experience Portal');
      const opened = await browserTab!.evaluate<boolean>(`(() => {const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim().startsWith('Information Requests'));if(!b)return false;b.click();return true;})()`);
      assert.equal(opened, true, 'portal information requests tab should be available');
    };
    const uploadResponse = async (requestId: string, name: string) => {
      const opened = await browserTab!.evaluate<boolean>(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes(${JSON.stringify(requestId)}));const b=[...(row?.querySelectorAll('button')||[])].find(x=>x.innerText.includes('Upload Document'));if(!b||b.disabled)return false;b.click();return true;})()`);
      assert.equal(opened, true, 'client upload should be enabled for a presented request');
      await browserTab!.evaluate(`(() => {const input=document.querySelector('.modal-backdrop input[type=file]');const d=new DataTransfer();d.items.add(new File([${JSON.stringify(`Synthetic evidence ${name}`)}],${JSON.stringify(name)},{type:'text/plain'}));input.files=d.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await clickButton('Save response file');
    };

    await switchPersona('Engagement manager', 'manager');
    await openNorthstarWorkspace();
    await clickButton('New PBC Request');
    const formReady = await browserTab!.evaluate<boolean>(`(() => {const f=[...document.querySelectorAll('form')].find(x=>x.innerText.includes('Client recipient'));if(!f)return false;const inputs=f.querySelectorAll('input');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(inputs[0],'Updated fixed-asset register');inputs[0].dispatchEvent(new Event('input',{bubbles:true}));inputs[0].dispatchEvent(new Event('change',{bubbles:true}));setter.call(inputs[3],'Aisha Saleh');inputs[3].dispatchEvent(new Event('input',{bubbles:true}));inputs[3].dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
    assert.equal(formReady, true);
    await clickButton('Save Draft Request');
    const created = await browserTab!.evaluate<any>(`(() => {const e=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(x=>x.id==='ENG-26002');return e.pbc.find(x=>x.title==='Updated fixed-asset register');})()`);
    assert.ok(created?.id);
    assert.equal(created.status, 'Draft');
    await switchPersona('Northstar management approver', 'client');
    await openPortalRequests();
    assert.doesNotMatch(await browserTab!.evaluate<string>('document.body.innerText'), /Updated fixed-asset register/,'draft PBC must remain hidden from the client');

    await switchPersona('Engagement manager', 'manager');
    await openNorthstarWorkspace();
    const present = await browserTab!.evaluate<boolean>(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes(${JSON.stringify(created.id)}));const b=[...(row?.querySelectorAll('button')||[])].find(x=>x.innerText.trim()==='Present request');if(!b)return false;b.click();return true;})()`);
    assert.equal(present, true);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26002').pbc.find(p=>p.id===${JSON.stringify(created.id)}).status === 'Requested'`), true);

    await switchPersona('Northstar management approver', 'client');
    await openPortalRequests();
    assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /Updated fixed-asset register/);
    await uploadResponse(created.id, 'fixed-assets-v1.txt');
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26002').pbc.find(p=>p.id===${JSON.stringify(created.id)}).status === 'Received'`), true);

    await switchPersona('Engagement manager', 'manager');
    await openNorthstarWorkspace();
    const requestClarification = await browserTab!.evaluate<boolean>(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes(${JSON.stringify(created.id)}));const b=[...(row?.querySelectorAll('button')||[])].find(x=>x.innerText.trim()==='Request clarification');if(!b)return false;b.click();return true;})()`);
    assert.equal(requestClarification, true);
    await browserTab!.evaluate(`(() => {const t=document.querySelector('.modal-backdrop textarea');t.focus();})()`);
    await browserTab!.command('Input.insertText',{text:'Please include the original purchase dates and depreciation method.'});
    await clickButton('Send clarification');
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26002').pbc.find(p=>p.id===${JSON.stringify(created.id)}).status === 'Needs clarification'`), true);

    await switchPersona('Northstar management approver', 'client');
    await openPortalRequests();
    assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /Please include the original purchase dates and depreciation method/);
    await uploadResponse(created.id, 'fixed-assets-v2.txt');
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26002').pbc.find(p=>p.id===${JSON.stringify(created.id)}).status === 'Received'`), true);
    await switchPersona('Engagement manager', 'manager');
    await openNorthstarWorkspace();
    const accept = await browserTab!.evaluate<boolean>(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes(${JSON.stringify(created.id)}));const b=[...(row?.querySelectorAll('button')||[])].find(x=>x.innerText.trim()==='Accept response');if(!b)return false;b.click();return true;})()`);
    assert.equal(accept, true);
    const accepted = await browserTab!.evaluate<any>(`(() => JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26002').pbc.find(p=>p.id===${JSON.stringify(created.id)}))()`);
    assert.equal(accepted.status, 'Accepted');
    assert.equal(accepted.acceptedVersion, 2);
    assert.equal(accepted.acceptedBy, 'Layla Rahman');
    assert.ok(accepted.acceptedAt);
    assert.deepEqual(accepted.sharedFiles.map((f: any) => [f.name, f.version]), [['fixed-assets-v1.txt', 1], ['fixed-assets-v2.txt', 2]]);
    const localFiles = await browserTab!.evaluate<any>(`(async()=>{const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const req=s.engagements.find(e=>e.id==='ENG-26002').pbc.find(p=>p.id===${JSON.stringify(created.id)});const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('ste-auditsphere-generated-artifacts',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});const files=await Promise.all(req.sharedFiles.map(async f=>{const blob=await new Promise((resolve,reject)=>{const r=db.transaction('artifacts').objectStore('artifacts').get(f.id);r.onsuccess=()=>resolve(r.result?.blob);r.onerror=()=>reject(r.error)});return {id:f.id,exists:!!blob,size:blob?.size,sha:blob&&[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join('')};}));db.close();return files;})()`);
    assert.equal(localFiles.length, 2);
    for (const file of localFiles) assert.equal(file.exists && file.size > 0 && /^[0-9a-f]{64}$/.test(file.sha), true, 'each PBC revision retains exact bytes with a verifiable digest');
    await browserTab!.command('Page.reload');
    assert.equal(await waitForBrowser('!!document.querySelector("#app-root .brandname")'), true);
    const persistedFiles = await browserTab!.evaluate<any[]>(`(async()=>{const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const req=s.engagements.find(e=>e.id==='ENG-26002').pbc.find(p=>p.id===${JSON.stringify(created.id)});const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('ste-auditsphere-generated-artifacts',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});const out=await Promise.all(req.sharedFiles.map(async f=>{const blob=await new Promise((resolve,reject)=>{const r=db.transaction('artifacts').objectStore('artifacts').get(f.id);r.onsuccess=()=>resolve(r.result?.blob);r.onerror=()=>reject(r.error)});return [f.id,blob?.size,f.size,blob&&[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join(''),f.sha];}));db.close();return out;})()`);
    for (const [id, size, expectedSize, sha, expectedSha] of persistedFiles) assert.ok(id && size === expectedSize && sha === expectedSha, 'PBC bytes and SHA remain intact after reload');
    assert.ok(accepted.thread.some((m: any) => m.kind==='clarification' && m.clientVisible));
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('AT-28: records, returns, resubmits and corrects approved time as retained revisions', async () => {
    const switchPersona = async (label: string, role: string) => {
      await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');const o=[...s.options].find(x=>x.textContent.includes(${JSON.stringify(label)}));if(!o)throw Error('Missing persona: '+${JSON.stringify(label)});Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      const changed = await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentRole === ${JSON.stringify(role)}`);
      assert.equal(changed, true, `persona switch failed: ${JSON.stringify(await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return {currentRole:s.currentRole,currentPerson:s.currentPerson,selected:document.querySelector('#role-select')?.value,options:[...document.querySelector('#role-select').options].map(o=>o.textContent)};})()`))}`);
    };
    const openTime = async () => {
      const opened = await browserTab!.evaluate<boolean>(`(() => {const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().startsWith('Time Tracking'));if(!b)return false;b.click();return true;})()`);
      assert.equal(opened, true, 'Time Tracking navigation should be available');
      assert.equal(await waitForBrowser('document.body.innerText.includes("Practice Timesheet Register")'), true);
    };
    const setField = async (selector: string, value: string) => browserTab!.evaluate(`(() => {const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing field '+${JSON.stringify(selector)});el.focus();const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`);

    await switchPersona('Audit preparer', 'preparer');
    await openTime();
    await clickButton('Record Time Entry');
    await setField('.modal-backdrop input[type="number"]', '90');
    await setField('.modal-backdrop input[type="text"]', 'AT28 correction sample');
    await setField('.modal-backdrop textarea', 'Initial timesheet evidence');
    await clickButton('Submit Time Entry');
    const entryId = await browserTab!.evaluate<string>(`(() => JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).times.find(t=>t.taskTitle==='AT28 correction sample')?.id || '')()`);
    assert.ok(entryId, 'submitted entry should be persisted');
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).times.find(t=>t.id===${JSON.stringify(entryId)}).status==='Submitted'`), true);

    await switchPersona('Engagement manager', 'manager');
    await openTime();
    const returnEntry = await browserTab!.evaluate<boolean>(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes(${JSON.stringify(entryId)}));const b=[...(row?.querySelectorAll('button')||[])].find(x=>x.innerText.trim()==='Return');if(!b)return false;b.click();return true;})()`);
    assert.equal(returnEntry, true, await browserTab!.evaluate<string>(`(() => [...document.querySelectorAll('tbody tr')].map(x=>x.innerText+' [buttons: '+[...x.querySelectorAll('button')].map(b=>b.innerText).join(',')+']').join('\\n'))()`));
    await setField('.modal-backdrop textarea', 'Please clarify the work performed.');
    await clickButton('Return Entry');
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).times.find(t=>t.id===${JSON.stringify(entryId)}).status==='Returned'`), true);

    await switchPersona('Audit preparer', 'preparer');
    await openTime();
    const resubmit = await browserTab!.evaluate<boolean>(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes(${JSON.stringify(entryId)}));const b=[...(row?.querySelectorAll('button')||[])].find(x=>x.innerText.trim()==='Resubmit correction');if(!b)return false;b.click();return true;})()`);
    assert.equal(resubmit, true);
    await setField('.modal-backdrop input[type="number"]', '75');
    await setField('.modal-backdrop textarea', 'Clarified work and evidence reference.');
    await clickButton('Submit Correction');
    const revisionId = `${entryId}-R1`;
    assert.equal(await waitForBrowser(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return s.times.find(t=>t.id===${JSON.stringify(entryId)}).status==='Superseded' && s.times.find(t=>t.id===${JSON.stringify(revisionId)})?.status==='Submitted';})()`), true);

    await switchPersona('Engagement manager', 'manager');
    await openTime();
    const approveRevision = await browserTab!.evaluate<boolean>(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes(${JSON.stringify(revisionId)}));const b=[...(row?.querySelectorAll('button')||[])].find(x=>x.innerText.trim()==='Approve');if(!b)return false;b.click();return true;})()`);
    assert.equal(approveRevision, true);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).times.find(t=>t.id===${JSON.stringify(revisionId)}).status==='Approved'`), true);
    const correct = await browserTab!.evaluate<boolean>(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes(${JSON.stringify(revisionId)}));const b=[...(row?.querySelectorAll('button')||[])].find(x=>x.innerText.trim()==='Correct approved time');if(!b)return false;b.click();return true;})()`);
    assert.equal(correct, true);
    await setField('.modal-backdrop input[type="number"]', '60');
    await setField('.modal-backdrop textarea', 'Correct timer rounding.');
    await clickButton('Submit Correction');
    const correctionId = `${revisionId}-R2`;
    const correctionSubmitted = await waitForBrowser(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return s.times.find(t=>t.id===${JSON.stringify(revisionId)}).status==='Superseded' && s.times.find(t=>t.id===${JSON.stringify(correctionId)})?.status==='Submitted' && s.times.find(t=>t.id===${JSON.stringify(correctionId)}).returnReason.includes('Correct timer rounding');})()`);
    assert.equal(correctionSubmitted, true, await browserTab!.evaluate<string>(`(() => JSON.stringify({times:JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).times.filter(t=>t.id.includes(${JSON.stringify(entryId)})),notices:document.body.innerText.slice(-600)}))()`));
    const approveCorrection = await browserTab!.evaluate<boolean>(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes(${JSON.stringify(correctionId)}));const b=[...(row?.querySelectorAll('button')||[])].find(x=>x.innerText.trim()==='Approve');if(!b)return false;b.click();return true;})()`);
    assert.equal(approveCorrection, true);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).times.find(t=>t.id===${JSON.stringify(correctionId)}).status==='Approved'`), true);
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('AT-38/AT-40: includes an accepted unreflected adjustment in the financial statements', async () => {
    const selected = await browserTab!.evaluate<boolean>(`(() => {const s=[...document.querySelectorAll('select')].find(x=>[...x.options].some(o=>o.value==='ENG-26001'));if(!s)return false;Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'ENG-26001');s.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
    assert.equal(selected, true, 'engagement selector should include the fixture engagement');
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).selectedEngagement==='ENG-26001'`), true);
    const expectedNet = await browserTab!.evaluate<string>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const e=s.engagements.find(x=>x.id==='ENG-26001');const raw=e.rows;const revenue=raw.filter(x=>x.type==='revenue').reduce((n,x)=>n+Math.abs(x.balance),0);const expense=raw.filter(x=>x.type==='expense');const cost=expense.filter(x=>x.name.toLowerCase().includes('cost')||x.code.startsWith('50')).reduce((n,x)=>n+x.balance,0);const opex=expense.filter(x=>!x.name.toLowerCase().includes('cost')&&!x.code.startsWith('50')).reduce((n,x)=>n+x.balance,0);const adj=s.adjustmentJournals.find(x=>x.engagementId===e.id&&x.id==='AJ-01');if(!adj||adj.status!=='Management accepted'||adj.reflectionStatus!=='Not reflected')throw Error('accepted unreflected adjustment fixture missing');const expected=revenue-cost-opex-50000;return 'QAR '+expected.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});})()`);
    await clickButton('Financial Statements');
    assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /Accepted, unreflected adjustments included: AJ-01/);
    assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /Balance Sheet Equation Balanced/);
    await clickButton('Statement of Comprehensive Income (P&L)');
    assert.match(await browserTab!.evaluate<string>('document.body.innerText'), new RegExp(expectedNet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await clickButton('Financial Packages');
    const assembleLabel = await browserTab!.evaluate<string>(`[...document.querySelectorAll('button')].find(b=>b.innerText.includes('Assemble New Revision'))?.innerText.trim()||''`);
    assert.ok(assembleLabel, 'package revision action should be available');
    await browserTab!.evaluate(`(() => {const title=document.querySelector('input[aria-label="Disclosure title"]');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(title,'Significant accounting policies');title.dispatchEvent(new Event('input',{bubbles:true}));const text=document.querySelector('[aria-label="Significant accounting policies disclosure text"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(text,'E2E fixture: applicable disclosure note.');text.dispatchEvent(new Event('input',{bubbles:true}));const evidence=document.querySelector('input[aria-label="Evidence document ID"]');setter.call(evidence,'DOC-002');evidence.dispatchEvent(new Event('input',{bubbles:true}));[...document.querySelectorAll('label')].find(label=>label.innerText.includes('Include this note in the client package')).querySelector('input').click();})()`);
    await clickButton('Save preparer draft');
    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');const o=[...s.options].find(x=>x.textContent.includes('Senior reviewer'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await clickButton('Review independently');
    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');const o=[...s.options].find(x=>x.textContent.includes('Engagement manager'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await clickButton(assembleLabel);
    const assembled = await waitForBrowser('document.body.innerText.includes("saved with exact XLSX, DOCX and PDF files")');
    assert.equal(assembled, true, await browserTab!.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(x=>x.id==='ENG-26001').packageHistory.map(x=>({revision:x.revision,passed:x.validation.passed,noteApplicability:x.noteApplicability,notes:x.notes}))`));
    const packageFile = await browserTab!.evaluate<string>(`(async()=>{const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const e=s.engagements.find(x=>x.id==='ENG-26001');const p=e.packageHistory.find(x=>x.revision===e.packageRevision);const a=p.artifacts.find(x=>x.kind==='XLSX');const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('ste-auditsphere-generated-artifacts',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});const blob=await new Promise((resolve,reject)=>{const r=db.transaction('artifacts').objectStore('artifacts').get(a.id);r.onsuccess=()=>resolve(r.result.blob);r.onerror=()=>reject(r.error)});const bytes=new Uint8Array(await blob.arrayBuffer());let bin='';for(const b of bytes)bin+=String.fromCharCode(b);db.close();return btoa(bin)})()`);
    const workbook = XLSX.read(Buffer.from(packageFile, 'base64'), { type: 'buffer' });
    const packageRows = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1, raw: true });
    assert.equal(packageRows.find(row => row[0] === '5000')?.[3], 350000, 'XLSX package contains approved depreciation debit');
    assert.equal(packageRows.find(row => row[0] === '1500')?.[3], 750000, 'XLSX package contains approved depreciation credit');
    const sourceAfter = await browserTab!.evaluate<any>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(x=>x.id==='ENG-26001').rows`);
    assert.equal(sourceAfter.find((row: any) => row.code === '5000').balance, 300000, 'package adjustment must not rewrite imported source rows');
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('AT-38: routes a new adjustment through independent technical review and client acceptance', async () => {
    const switchPersona = async (label: string, role: string) => {
      await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');const o=[...s.options].find(x=>x.textContent.includes(${JSON.stringify(label)}));if(!o)throw Error('Missing persona: '+${JSON.stringify(label)});Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentRole===${JSON.stringify(role)}`), true);
    };
    const setField = async (selector: string, value: string) => browserTab!.evaluate(`(() => {const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing field '+${JSON.stringify(selector)});const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const setAccount = async (index: number, code: string) => browserTab!.evaluate(`(() => {const el=document.querySelectorAll('.modal-backdrop select')[${index}];if(!el)throw Error('Missing account selector');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,${JSON.stringify(code)});el.dispatchEvent(new Event('change',{bubbles:true}));})()`);

    await switchPersona('Audit preparer — Adam Khan', 'preparer');
    await clickButton('Accounting Workbench');
    const adjustmentsTab = await browserTab!.evaluate<boolean>(`(() => {const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim().startsWith('Adjustments ('));if(!b)return false;b.click();return true;})()`);
    assert.equal(adjustmentsTab, true);
    await clickButton('Propose Adjustment Journal');
    await setField('.modal-backdrop input[type="text"]', 'AT38 management review sample');
    await setAccount(0, '5000');
    await setAccount(1, '1500');
    await setField('.modal-backdrop input[type="number"]', '1000');
    await setField('.modal-backdrop textarea', 'Accrue the year-end depreciation based on the approved asset schedule.');
    await clickButton('Propose Journal');
    const journal = await browserTab!.evaluate<any>(`(() => JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).adjustmentJournals.find(x=>x.title==='AT38 management review sample'))()`);
    assert.ok(journal?.id);
    assert.equal(journal.status, 'Draft');
    assert.equal(journal.preparedBy, 'Adam Khan');

    await switchPersona('Engagement manager', 'manager');
    await clickButton('Accounting Workbench');
    const review = await browserTab!.evaluate<boolean>(`(() => {const card=[...document.querySelectorAll('.panel')].find(x=>x.innerText.includes('AT38 management review sample'));const b=[...(card?.querySelectorAll('button')||[])].find(x=>x.innerText.trim()==='Complete Technical Review');if(!b)return false;b.click();return true;})()`);
    assert.equal(review, true, 'review action should be available to an independent manager');
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).adjustmentJournals.find(x=>x.id===${JSON.stringify(journal.id)}).status==='Technical review'`), true);

    await switchPersona('Management approver', 'client');
    assert.equal(await waitForBrowser('document.body.innerText.includes("Client Experience Portal")'), true);
    const approvalsTab = await browserTab!.evaluate<boolean>(`(() => {const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='Management Approvals');if(!b)return false;b.click();return true;})()`);
    assert.equal(approvalsTab, true);
    assert.equal(await waitForBrowser('document.body.innerText.includes("AT38 management review sample")'), true);
    await clickButton('Accept adjustment');
    const accepted = await browserTab!.evaluate<any>(`(() => JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).adjustmentJournals.find(x=>x.id===${JSON.stringify(journal.id)}))()`);
    assert.equal(accepted.status, 'Management accepted');
    assert.equal(accepted.reviewedBy, 'Layla Rahman');
    assert.equal(accepted.managementAcceptedBy, 'Omar Nasser');
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('AT-02/AT-54: preserves conflicts and reports browser-storage failure without silent overwrite', async () => {
    const targetResponse = await fetch(`http://127.0.0.1:${browserDebugPort}/json/new?about:blank`, { method: 'PUT' });
    assert.equal(targetResponse.ok, true);
    const target = await targetResponse.json() as { webSocketDebuggerUrl: string };
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve(), { once: true });
      ws.addEventListener('error', () => reject(new Error('Could not connect to second Chrome tab')), { once: true });
    });
    const secondTab = new CdpTab(ws);
    try {
      await secondTab.command('Page.enable');
      await secondTab.command('Runtime.enable');
      await secondTab.command('Page.navigate', { url: baseUrl });
      assert.equal(await waitForBrowser('!!document.querySelector("#app-root .brandname")', 8000, secondTab), true);
      await secondTab.evaluate(`(() => {
        const key = 'ste-auditsphere-role-portals-v2';
        const newer = JSON.parse(localStorage.getItem(key)); newer.asOfDate = '2026-09-24';
        localStorage.setItem(key, JSON.stringify(newer)); return true;
      })()`);
      assert.equal(await waitForBrowser('document.querySelector("[role=alert]")?.innerText.includes("Another tab saved newer demo data")'), true);
      await clickButton('Keep this tab and replace newer state');
      const backup = await browserTab!.evaluate<string>('localStorage.getItem("ste-auditsphere-role-portals-v2.backup") || ""');
      assert.equal(JSON.parse(backup).asOfDate, '2026-09-24', 'the conflicting state is preserved before local state wins');

      await browserTab!.evaluate(`(() => {
        window.__nativeSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function() { throw new DOMException('quota fixture', 'QuotaExceededError'); };
        const select = document.querySelector('select[aria-label="Selected engagement"]');
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, 'ENG-26001');
        select.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      assert.equal(await waitForBrowser('document.querySelector("[role=status]")?.innerText.includes("Browser storage is unavailable; changes last only for this session")'), true);
      await browserTab!.evaluate('Storage.prototype.setItem = window.__nativeSetItem');
    } finally { secondTab.close(); }
  });

  it('AT-02: preserves malformed saved state and offers a recoverable demo session', async () => {
    const key = 'ste-auditsphere-role-portals-v2';
    const backupKey = `${key}.backup`;
    const original = await browserTab!.evaluate<any>(`({state:localStorage.getItem(${JSON.stringify(key)}),backup:localStorage.getItem(${JSON.stringify(backupKey)})})`);
    const corrupt = '{"schema":22,"engagements":';
    try {
      await browserTab!.evaluate(`localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(corrupt)})`);
      await browserTab!.command('Page.reload');
      assert.equal(await waitForBrowser('!!document.querySelector("#app-root .brandname")'), true);
      const recoveryText = await browserTab!.evaluate<string>('document.body.innerText');
      assert.match(recoveryText, /Saved demo state could not be parsed/);
      assert.match(recoveryText, /SIMULATED IDENTITY \(NOT LIVE AUTH\)/, 'the app remains usable with a fresh in-memory demo');
      assert.equal(await browserTab!.evaluate<string>(`localStorage.getItem(${JSON.stringify(backupKey)})`), corrupt, 'the exact malformed payload is retained for recovery');
      assert.equal(await browserTab!.evaluate<string>(`localStorage.getItem(${JSON.stringify(key)})`), corrupt, 'recovery does not silently overwrite the original payload');
      const validButIncomplete = JSON.stringify({ schema: 22, engagements: [] });
      await browserTab!.evaluate(`localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(validButIncomplete)})`);
      await browserTab!.command('Page.reload');
      assert.equal(await waitForBrowser('!!document.querySelector("#app-root .brandname")'), true);
      const incompleteText = await browserTab!.evaluate<string>('document.body.innerText');
      assert.match(incompleteText, /Saved demo state failed integrity validation/);
      assert.equal(await browserTab!.evaluate<string>(`localStorage.getItem(${JSON.stringify(backupKey)})`), validButIncomplete, 'structurally invalid but parseable JSON is preserved exactly as recovery backup');
      assert.equal(await browserTab!.evaluate<string>(`localStorage.getItem(${JSON.stringify(key)})`), validButIncomplete, 'parseable invalid state is not silently replaced');
      assert.deepEqual(browserTab!.exceptions, []);
    } finally {
      await browserTab!.evaluate(`(() => {
        const key=${JSON.stringify(key)},backupKey=${JSON.stringify(backupKey)};
        if(${JSON.stringify(original.state)}===null)localStorage.removeItem(key);else localStorage.setItem(key,${JSON.stringify(original.state)});
        if(${JSON.stringify(original.backup)}===null)localStorage.removeItem(backupKey);else localStorage.setItem(backupKey,${JSON.stringify(original.backup)});
      })()`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
    }
  });

  it('VP-004: preserves a future-schema payload and restores a validated import', async () => {
    const key = 'ste-auditsphere-role-portals-v2';
    const backupKey = `${key}.backup`;
    const original = await browserTab!.evaluate<any>(`({state:localStorage.getItem(${JSON.stringify(key)}),backup:localStorage.getItem(${JSON.stringify(backupKey)})})`);
    const futureState = createInitialState() as any;
    futureState.schema = 23;
    const futurePayload = JSON.stringify(futureState);
    const downloadDir = mkdtempSync(join(tmpdir(), 'auditsphere-preserved-export-'));
    try {
      await browserTab!.evaluate(`localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(futurePayload)})`);
      await browserTab!.command('Page.reload');
      assert.equal(await waitForBrowser('!!document.querySelector("#app-root .brandname")'), true);
      assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /schema v23, newer than supported v22/);
      assert.equal(await browserTab!.evaluate<string>(`localStorage.getItem(${JSON.stringify(backupKey)})`), futurePayload, 'unsupported future state is retained byte-for-byte');
      assert.equal(await browserTab!.evaluate<boolean>(`!!document.querySelector('[aria-label="Import validated state JSON"]') && [...document.querySelectorAll('button')].some(b=>b.innerText==='Export preserved payload')`), true, 'recovery offers import and exact backup export');
      await browserTab!.command('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
      await clickButton('Export preserved payload');
      let downloaded: string[] = [];
      for (let attempt = 0; attempt < 50; attempt++) {
        downloaded = readdirSync(downloadDir).filter(name => !name.endsWith('.crdownload'));
        if (downloaded.length) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      assert.equal(downloaded.length, 1, 'preserved state export creates one completed download');
      assert.equal(readFileSync(join(downloadDir, downloaded[0]), 'utf8'), futurePayload, 'downloaded export bytes equal the exact preserved future-schema payload');
      await browserTab!.evaluate(`(() => {const input=document.querySelector('[aria-label="Import validated state JSON"]');const transfer=new DataTransfer();transfer.items.add(new File(['{"schema":22}'],'ambiguous-state.json',{type:'application/json'}));Object.defineProperty(input,'files',{configurable:true,value:transfer.files});input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      assert.equal(await waitForBrowser(`document.body.innerText.includes('Imported state is ambiguous: missing engagements')`), true, 'ambiguous imports report why they were rejected');
      assert.equal(await browserTab!.evaluate<string>(`localStorage.getItem(${JSON.stringify(key)})`), futurePayload, 'rejected import does not overwrite the unsupported prior payload');
      assert.equal(await browserTab!.evaluate<string>(`localStorage.getItem(${JSON.stringify(backupKey)})`), futurePayload, 'rejected import keeps the preserved backup unchanged');
      const validPayload = JSON.stringify(createInitialState());
      await browserTab!.evaluate(`(() => {const input=document.querySelector('[aria-label="Import validated state JSON"]');const transfer=new DataTransfer();transfer.items.add(new File([${JSON.stringify(validPayload)}],'recovered-state.json',{type:'application/json'}));Object.defineProperty(input,'files',{configurable:true,value:transfer.files});input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      assert.equal(await waitForBrowser(`!document.body.innerText.includes('newer than supported v22')`), true, 'successful import clears the recovery error');
      const restored = await browserTab!.evaluate<any>(`({schema:JSON.parse(localStorage.getItem(${JSON.stringify(key)})).schema,engagements:JSON.parse(localStorage.getItem(${JSON.stringify(key)})).engagements.length,backup:localStorage.getItem(${JSON.stringify(backupKey)})})`);
      assert.equal(restored.schema, 22);
      assert.ok(restored.engagements > 0);
      assert.equal(restored.backup, futurePayload, 'import retains the rejected future payload as a backup');
      assert.deepEqual(browserTab!.exceptions, []);
    } finally {
      await browserTab!.command('Page.setDownloadBehavior', { behavior: 'default' }).catch(() => {});
      rmSync(downloadDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      await browserTab!.evaluate(`(() => {const key=${JSON.stringify(key)},backupKey=${JSON.stringify(backupKey)};if(${JSON.stringify(original.state)}===null)localStorage.removeItem(key);else localStorage.setItem(key,${JSON.stringify(original.state)});if(${JSON.stringify(original.backup)}===null)localStorage.removeItem(backupKey);else localStorage.setItem(backupKey,${JSON.stringify(original.backup)});})()`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
    }
  });

  it('VP-047/v13: legacy accepted case remains historical and requires evidence review', async () => {
    const legacy = createInitialState() as any;
    const engagement = legacy.engagements.find((item: any) => item.id === 'ENG-26001');
    const manager = legacy.users.find((item: any) => item.role === 'manager');
    const partner = legacy.users.find((item: any) => item.role === 'partner' && item.name === engagement.partner);
    legacy.schema = 12;
    legacy.selectedEngagement = engagement.id;
    legacy.currentUserId = manager.id;
    legacy.currentPerson = manager.name;
    legacy.currentRole = manager.role;
    engagement.acceptance = true;
    legacy.acceptanceCases = [{
      id: 'ACC-LEGACY-E2E', engagementId: engagement.id, clientId: engagement.client, year: engagement.year, service: engagement.service,
      riskRating: 'Low', independenceConfirmed: true, amlKycCompleted: true, conflictsCleared: true, prohibitionsChecked: true,
      competenceConfirmed: true, conditions: [], recommendationBy: manager.name, recommendationByUserId: manager.id,
      recommendationDate: '2026-01-01', recommendationNotes: 'Legacy recommendation.', decisionBy: partner.name,
      decisionByUserId: partner.id, decisionDate: '2026-01-02', decisionStatus: 'Accepted', decisionNotes: 'Legacy approval.', history: []
    }];
    await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2', ${JSON.stringify(JSON.stringify(legacy))})`);
    await browserTab!.command('Page.reload');
    assert.equal(await waitForBrowser('!!document.querySelector("#app-root .brandname")'), true);
    await clickButton('Acceptance & KYC');
    assert.equal(await waitForBrowser('document.body.innerText.includes("Prior approval retained for history")'), true);
    const text = await browserTab!.evaluate<string>('document.body.innerText');
    assert.match(text, /Accepted · evidence review required/);
    assert.doesNotMatch(text, /Manual Annual Continuance/);
    const preserved = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2.backup'));const e=s.engagements.find(x=>x.id==='ENG-26001');const c=s.acceptanceCases.find(x=>x.id==='ACC-LEGACY-E2E');return {schema:s.schema,active:e.acceptance,status:c.decisionStatus,evidence:c.screeningEvidence};})()`);
    assert.equal(preserved.schema, 12);
    assert.equal(preserved.active, true, 'migration keeps the exact legacy payload as recovery backup');
    assert.equal(preserved.status, 'Accepted');
    assert.equal(preserved.evidence, undefined);
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('AT-37: independently approves account mappings and traces statement rows to their source accounts', async () => {
    const original = await browserTab!.evaluate<string>(`localStorage.getItem('ste-auditsphere-role-portals-v2')`);
    const setRole = async (role: string) => browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(role)});s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    try {
      await setRole('preparer');
      await browserTab!.evaluate(`(() => {const e=document.querySelector('select[aria-label="Selected engagement"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'ENG-26002');e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await clickButton('Financial Statements');
      const unmappedStatement = await browserTab!.evaluate<string>('document.body.innerText');
      assert.match(unmappedStatement, /Statement generation is blocked until the latest mapping revision is independently approved/);
      assert.match(unmappedStatement, /Unmapped: 1000/);
      assert.equal(await browserTab!.evaluate<boolean>(`[...document.querySelectorAll('button')].find(b=>b.innerText.includes('Export XLSX'))?.disabled`), true, 'unmapped balances cannot be exported as statements');
      await browserTab!.evaluate(`(() => {const e=document.querySelector('select[aria-label="Selected engagement"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'ENG-26001');e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await clickButton('Accounting Workbench');
      await clickButton('Statement Mappings');
      await browserTab!.evaluate(`(() => {
        const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));
        const e=s.engagements.find(x=>x.id===s.selectedEngagement);
        const targets={asset:'Cash and cash equivalents',liability:'Trade payables',equity:'Share capital and reserves',revenue:'Revenue',expense:'Operating expenses'};
        for(const row of e.rows){const select=document.querySelector('[aria-label="Statement line for account '+row.code+'"]');if(!select)throw Error('Missing mapping control for '+row.code);Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,targets[row.type]);select.dispatchEvent(new Event('change',{bubbles:true}));}
      })()`);
      await clickButton('Save New Revision');
      await browserTab!.evaluate(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(item=>item.querySelector('td')?.innerText.trim()==='1500');const button=[...(row?.querySelectorAll('button')||[])].find(item=>item.innerText.includes('Define Split'));if(!button)throw Error('Split editor not available for account 1500');button.click();})()`);
      await browserTab!.evaluate(`(() => {
        const modal=document.querySelector('.modal-content');
        const lines=modal.querySelectorAll('select');
        const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;
        setter.call(lines[0],'Property and equipment'); lines[0].dispatchEvent(new Event('change',{bubbles:true}));
        setter.call(lines[1],'Other current assets'); lines[1].dispatchEvent(new Event('change',{bubbles:true}));
        const inputs=modal.querySelectorAll('input[type="number"]');
        const inputSetter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
        inputSetter.call(inputs[0],'60'); inputs[0].dispatchEvent(new Event('input',{bubbles:true}));
        inputSetter.call(inputs[1],'40'); inputs[1].dispatchEvent(new Event('input',{bubbles:true}));
      })()`);
      await clickButton('Save Split Allocation');
      assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).accountMappingRevisions.filter(item=>item.engagementId==='ENG-26001').at(-1).mappings.find(item=>item.accountCode==='1500').targets.reduce((sum,target)=>sum+target.percentage,0)===100`), true, 'split allocation conserves the complete account balance');
      await setRole('reviewer');
      const approveVisible = await browserTab!.evaluate<boolean>(`(() => {const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim().startsWith('Approve Revision v'));if(!b)return false;b.click();return true;})()`);
      assert.equal(approveVisible, true, 'reviewer can approve the newly saved draft revision');
      const approved = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return s.accountMappingRevisions.filter(x=>x.engagementId===s.selectedEngagement).at(-1)})()`);
      assert.equal(approved.status, 'Approved');
      assert.deepEqual(approved.mappings.find((item: any) => item.accountCode === '1500').targets, [
        { statementLine: 'Property and equipment', percentage: 60 },
        { statementLine: 'Other current assets', percentage: 40 }
      ], 'independently approved revision retains split statement allocations');
      assert.equal(approved.mappings.length, (await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return s.engagements.find(x=>x.id===s.selectedEngagement).rows.length})()`)));
      await clickButton('Financial Statements');
      assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /Cash and cash equivalents · Source 1000 · Mapping Cash and cash equivalents/);
      assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /Property and equipment · Source 1500 · Mapping Property and equipment/);
      assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /Other current assets · Source 1500 · Mapping Other current assets/);
      assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /Comparative period unavailable; 2025 accounts lack a complete independently approved mapping/);
      await setRole('preparer');
      await clickButton('Accounting Workbench');
      await browserTab!.evaluate(`(() => {const e=document.querySelector('select[aria-label="Selected engagement"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'ENG-26003');e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await clickButton('Statement Mappings');
      await browserTab!.evaluate(`(() => {
        const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));
        const e=s.engagements.find(x=>x.id==='ENG-26003');
        const targets={asset:'Cash and cash equivalents',liability:'Trade payables',equity:'Share capital and reserves',revenue:'Revenue',expense:'Operating expenses'};
        for(const row of e.rows){const select=document.querySelector('[aria-label="Statement line for account '+row.code+'"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,targets[row.type]);select.dispatchEvent(new Event('change',{bubbles:true}));}
      })()`);
      await clickButton('Save New Revision');
      await setRole('reviewer');
      const priorApproved = await browserTab!.evaluate<boolean>(`(() => {const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim().startsWith('Approve Revision v'));if(!b)return false;b.click();return true;})()`);
      assert.equal(priorApproved, true, 'prior-period mapping is independently approved');
      await browserTab!.evaluate(`(() => {const e=document.querySelector('select[aria-label="Selected engagement"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'ENG-26001');e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await clickButton('Financial Statements');
      const comparative = await browserTab!.evaluate<string>('document.body.innerText');
      assert.match(comparative, /2026 current \(QAR\)/i);
      assert.match(comparative, /2025 comparative \(QAR\)/i);
      assert.match(comparative, /Total assets\s+QAR 2,250,000\.00\s+QAR 800,000\.00/i, 'comparative totals reconcile to the independently mapped periods');
      await browserTab!.evaluate(`(() => {URL.createObjectURL=(blob)=>{window.__statementExport=blob;return 'blob:statement-export'};URL.revokeObjectURL=()=>{};})()`);
      await clickButton('Export XLSX');
      const exported = await browserTab!.evaluate<string>(`(async()=>{const blob=window.__statementExport;const bytes=new Uint8Array(await blob.arrayBuffer());let bin='';for(const b of bytes)bin+=String.fromCharCode(b);return btoa(bin)})()`);
      const statementWorkbook = XLSX.read(Buffer.from(exported, 'base64'), { type: 'buffer' });
      const statementRows = XLSX.utils.sheet_to_json<any[]>(statementWorkbook.Sheets['Financial Data'], { header: 1, defval: '', range: 5 });
      assert.ok(statementRows[0].includes('Current FY2026 (QAR)') && statementRows[0].includes('Comparative FY2025 (QAR)'), 'statement export includes both reporting columns');
      const cashLine = statementRows.find((row: any[]) => row[0] === 'Cash and cash equivalents');
      assert.equal(cashLine?.[1], 1500000);
      assert.equal(cashLine?.[2], 800000);
      assert.equal(cashLine?.[3], '1000, 1100');
      assert.equal(cashLine?.[4], '1000, 1100');
      const otherCurrentAssetsLine = statementRows.find((row: any[]) => row[0] === 'Other current assets');
      assert.equal(otherCurrentAssetsLine?.[1], 300000, '40% of account 1500 flows to Other current assets');
      assert.equal(otherCurrentAssetsLine?.[3], '1500');
      await setRole('preparer');
      await clickButton('Save statement revision');
      assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /Latest: v1 · Draft/);
      await setRole('reviewer');
      await clickButton('Review statement revision v1');
      assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /Latest: v1 · Reviewed · prepared by .* · reviewed by/);
      const statementRevision = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return s.statementSetRevisions.find(x=>x.engagementId==='ENG-26001')})()`);
      assert.equal(statementRevision.status, 'Reviewed');
      assert.equal(statementRevision.comparativeEngagementId, 'ENG-26003');
      assert.equal(statementRevision.totals.assets, 2250000);
      assert.equal(statementRevision.comparativeTotals.assets, 800000);
      await setRole('preparer');
      await clickButton('Accounting Workbench');
      await browserTab!.evaluate(`(() => {const select=document.querySelector('select[aria-label="Selected engagement"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'ENG-26003');select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await clickButton('Statement Mappings');
      await clickButton('Save New Revision');
      assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).statementSetRevisions.find(x=>x.engagementId==='ENG-26001').status==='Stale'`), true, 'changing the comparative mapping stales a reviewed statement set');
      await browserTab!.evaluate(`(() => {const select=document.querySelector('select[aria-label="Selected engagement"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'ENG-26001');select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await clickButton('Financial Statements');
      await browserTab!.command('Page.reload');
      assert.equal(await waitForBrowser('!!document.querySelector("#app-root .brandname")'), true);
      await clickButton('Financial Statements');
      assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /Latest: v1 · Stale/);
      assert.equal(await browserTab!.evaluate<boolean>(`[...document.querySelectorAll('button')].some(button=>button.innerText.includes('Review statement revision v1'))`), false, 'stale statement set cannot be reviewed again');
      await clickButton('Statement of Cash Flows');
      const cashFlowDisclosure = await browserTab!.evaluate<string>(`document.querySelector('[aria-label="Statement of Cash Flows"]')?.innerText || ''`);
      assert.match(cashFlowDisclosure, /Enter supported movements from scoped evidence/);
      await browserTab!.evaluate(`(() => {
        const set=(selector,value,prototype)=>{const el=document.querySelector(selector);if(!el)throw Error('Missing '+selector);Object.getOwnPropertyDescriptor(prototype,'value').set.call(el,String(value));el.dispatchEvent(new Event(prototype===HTMLSelectElement.prototype?'change':'input',{bubbles:true}));};
        set('[aria-label="Opening cash"]',1400000,HTMLInputElement.prototype);
        set('[aria-label="Closing cash"]',1500000,HTMLInputElement.prototype);
        set('[aria-label^="Movement description"]','Owner equity contribution',HTMLInputElement.prototype);
        set('[aria-label^="Movement category"]','Equity contribution',HTMLSelectElement.prototype);
        set('[aria-label^="Movement amount"]',100000,HTMLInputElement.prototype);
        set('[aria-label^="Movement evidence"]','DOC-002',HTMLInputElement.prototype);
      })()`);
      await clickButton('Add movement');
      await browserTab!.evaluate(`(() => {
        const set=(selector,value,prototype,index=0)=>{const el=document.querySelectorAll(selector)[index];if(!el)throw Error('Missing '+selector);Object.getOwnPropertyDescriptor(prototype,'value').set.call(el,String(value));el.dispatchEvent(new Event(prototype===HTMLSelectElement.prototype?'change':'input',{bubbles:true}));};
        set('[aria-label^="Movement description"]','Lease asset recognised',HTMLInputElement.prototype,1);
        set('[aria-label^="Movement category"]','Non-cash',HTMLSelectElement.prototype,1);
        set('[aria-label^="Movement amount"]',50000,HTMLInputElement.prototype,1);
        set('[aria-label^="Movement evidence"]','DOC-002',HTMLInputElement.prototype,1);
      })()`);
      await clickButton('Save movement revision');
      assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(x=>x.id==='ENG-26001').cashFlowScheduleHistory?.at(-1)?.status==='Draft'`), true, 'movement inputs persist as a draft revision');
      await setRole('reviewer');
      await clickButton('Review schedule v1');
      assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(x=>x.id==='ENG-26001').cashFlowScheduleHistory?.at(-1)?.status==='Reviewed'`), true, 'independent reviewer approves the reconciled cash-flow schedule');
      const cashFlowRecord = await browserTab!.evaluate<any>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(x=>x.id==='ENG-26001').cashFlowScheduleHistory.at(-1)`);
      assert.equal(cashFlowRecord.openingCash + cashFlowRecord.movements.reduce((total: number, movement: any) => total + (movement.category === 'Non-cash' ? 0 : movement.amount), 0), cashFlowRecord.closingCash);
      assert.equal(cashFlowRecord.movements[0].evidenceRef, 'DOC-002');
      assert.equal(cashFlowRecord.movements[0].category, 'Equity contribution');
      assert.equal(cashFlowRecord.movements[1].category, 'Non-cash', 'non-cash item is retained but excluded from reconciliation');
      await setRole('preparer');
      await clickButton('Financial Packages');
      const packageCashFlow = await browserTab!.evaluate<any>(`(() => {const item=document.querySelector('[aria-label="Include Statement of Cash Flows"]');return {exists:!!item,enabled:item&&!item.disabled,checked:!!item?.checked,desc:item?.closest('tr')?.innerText||''}})()`);
      assert.equal(packageCashFlow.exists && packageCashFlow.enabled, true);
      if (!packageCashFlow.checked) await browserTab!.evaluate(`document.querySelector('[aria-label="Include Statement of Cash Flows"]').click()`);
      assert.equal(await browserTab!.evaluate<boolean>(`document.querySelector('[aria-label="Include Statement of Cash Flows"]')?.checked`), true);
      assert.match(packageCashFlow.desc, /Reviewed cash-flow schedule v1/);
      assert.deepEqual(browserTab!.exceptions, []);
    } finally {
      await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2', ${JSON.stringify(original)})`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
    }
  });

  it('AT-17/VP-018: adds a local identity without access, disables it, and inspects invitation history', async () => {
    const original = await browserTab!.evaluate<string | null>(`localStorage.getItem('ste-auditsphere-role-portals-v2')`);
    try {
      await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'admin');s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await clickButton('Firm Administration');
      await clickButton('Identity Lifecycle (4 invitations)');
      const set = async (label: string, value: string) => browserTab!.evaluate(`(() => {const e=document.querySelector('[aria-label="${label}"]');if(!e)throw Error('Missing '+${JSON.stringify(label)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await set('Demo identity name', 'Test Demo Identity');
      await set('Demo identity email', 'test.identity@example.demo');
      await clickButton('Add local identity');
      assert.equal(await waitForBrowser(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const u=s.users.find(x=>x.email==='test.identity@example.demo');return !!u && u.status==='Active' && !s.roleGrants.some(g=>g.userId===u.id) && s.identityStatusHistory.some(e=>e.userId===u.id&&e.action==='Created');})()`), true, 'new local identity exists without a grant');
      const dialog = await browserTab!.evaluate<boolean>(`(() => {window.prompt=()=> 'Test suspension';const row=[...document.querySelectorAll('tr')].find(x=>x.innerText.includes('test.identity@example.demo'));const b=[...(row?.querySelectorAll('button')||[])].find(x=>x.innerText.trim()==='Disable');if(!b)return false;b.click();return true;})()`);
      assert.equal(dialog, true);
      assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).users.find(x=>x.email==='test.identity@example.demo').status==='Disabled'`), true);
      await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');const id=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).users.find(x=>x.email==='test.identity@example.demo').id;Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,id);s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      assert.equal(await waitForBrowser(`document.body.innerText.includes('Prototype Requirements')`), true, 'disabled persona is restricted to requirements');
      await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');const id=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).users.find(x=>x.role==='admin'&&x.status==='Active').id;Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,id);s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await clickButton('Firm Administration');
      await clickButton('Identity Lifecycle (4 invitations)');
      const reactivate = await browserTab!.evaluate<boolean>(`(() => {const row=[...document.querySelectorAll('tr')].find(x=>x.innerText.includes('test.identity@example.demo'));const b=[...(row?.querySelectorAll('button')||[])].find(x=>x.innerText.trim()==='Reactivate');if(!b)return false;b.click();return true;})()`);
      assert.equal(reactivate, true);
      assert.equal(await waitForBrowser(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return s.users.find(x=>x.email==='test.identity@example.demo').status==='Active'&&['Created','Disabled','Activated'].every(a=>s.identityStatusHistory.some(e=>e.userId===s.users.find(x=>x.email==='test.identity@example.demo').id&&e.action===a));})()`), true, 'reactivation restores identity and preserves the complete status history');
      const lifecycle = await browserTab!.evaluate<string>('document.body.innerText');
      assert.match(lifecycle, /Pending/); assert.match(lifecycle, /Expired/); assert.match(lifecycle, /Revoked/); assert.match(lifecycle, /No live account or message/);
      await set('Invitation name', 'Pending Demo Recipient');
      await set('Invitation email', 'pending.invite@example.demo');
      await clickButton('Record simulated invite');
      await browserTab!.evaluate(`(() => {const key='ste-auditsphere-role-portals-v2';const s=JSON.parse(localStorage.getItem(key));const i=s.simulatedInvitations.find(x=>x.email==='pending.invite@example.demo');i.expiresAt='2000-01-01T00:00:00.000Z';localStorage.setItem(key,JSON.stringify(s));})()`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
      await clickButton('Firm Administration');
      await browserTab!.evaluate(`(() => {const b=[...document.querySelectorAll('button')].find(x=>x.innerText.includes('Identity Lifecycle'));if(!b)throw Error('identity lifecycle view missing');b.click();})()`);
      await waitForBrowser(`[...document.querySelectorAll('tr')].some(x=>x.innerText.includes('pending.invite@example.demo')&&x.innerText.includes('Expired'))`);
      const expiredRow = await browserTab!.evaluate<any>(`(() => {const row=[...document.querySelectorAll('tr')].find(x=>x.innerText.includes('pending.invite@example.demo'));return {text:row?.innerText,buttons:[...(row?.querySelectorAll('button')||[])].map(x=>x.innerText.trim())};})()`);
      assert.ok(expiredRow.text?.includes('Expired') && !expiredRow.buttons.includes('Simulate acceptance'), JSON.stringify(expiredRow));
      assert.equal(await browserTab!.evaluate<boolean>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return s.simulatedInvitations.some(i=>i.email==='pending.invite@example.demo'&&i.status==='Pending')&&!s.users.some(u=>u.email==='pending.invite@example.demo');})()`), true, 'expiry does not create an identity');
      await browserTab!.evaluate(`(() => {window.prompt=()=> 'Role no longer required';const row=[...document.querySelectorAll('tr')].find(x=>x.innerText.includes('pending.invite@example.demo'));const b=[...(row?.querySelectorAll('button')||[])].find(x=>x.innerText.trim()==='Renew 7 days');if(!b)throw Error('expired invite renewal missing');b.click();})()`);
      assert.equal(await waitForBrowser(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return s.simulatedInvitations.find(i=>i.email==='pending.invite@example.demo').status==='Pending'&&s.identityStatusHistory.some(e=>e.action==='InvitationExpired'&&e.userName==='Pending Demo Recipient')&&s.identityStatusHistory.some(e=>e.action==='InvitationResent'&&e.userName==='Pending Demo Recipient');})()`), true, 'expiry and renewal are both retained in lifecycle history');
      const revoke = await browserTab!.evaluate<boolean>(`(() => {window.prompt=()=> 'Role no longer required';const row=[...document.querySelectorAll('tr')].find(x=>x.innerText.includes('pending.invite@example.demo'));const b=[...(row?.querySelectorAll('button')||[])].find(x=>x.innerText.trim()==='Revoke');if(!b)return false;b.click();return true;})()`);
      assert.equal(revoke, true);
      assert.equal(await waitForBrowser(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return s.simulatedInvitations.some(i=>i.email==='pending.invite@example.demo'&&i.status==='Revoked')&&s.identityStatusHistory.some(e=>e.action==='InvitationRevoked'&&e.userName==='Pending Demo Recipient')&&!s.users.some(u=>u.email==='pending.invite@example.demo');})()`), true, 'revocation is recorded locally and creates neither an account nor a grant');
      assert.deepEqual(browserTab!.exceptions, []);
    } finally {
      if (original) await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2', ${JSON.stringify(original)})`);
      else await browserTab!.evaluate(`localStorage.removeItem('ste-auditsphere-role-portals-v2')`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
    }
  });

  it('VP-049: publishes and applies a reusable program template with fresh execution state', async () => {
    const original = await browserTab!.evaluate<string | null>(`localStorage.getItem('ste-auditsphere-role-portals-v2')`);
    try {
      await clickButton('Risks & Audit Programs');
      assert.equal(await browserTab!.evaluate<boolean>(`(() => {const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim().startsWith('Reusable Program Templates'));if(!b)return false;b.click();return true;})()`), true);
      await clickButton('New template');
      const setInput = async (selector: string, value: string) => browserTab!.evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e),'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
      await setInput('input[aria-label="Template name"]', 'Revenue substantive template');
      await setInput('select[aria-label="Template audit area"]', 'Revenue & Receivables');
      await setInput('textarea[aria-label="Template purpose"]', 'Verify recorded revenue assertions.');
      await setInput('input[aria-label="Template procedure title 1"]', 'Verify recorded revenue');
      await setInput('input[placeholder="Objective"]', 'Confirm existence and accuracy');
      await setInput('textarea[placeholder="Instructions"]', 'Inspect approved source records.');
      await setInput('input[placeholder="Assertions, comma separated"]', 'Existence, Accuracy');
      await setInput('input[placeholder="Required evidence type"]', 'Sales ledger');
      await clickButton('Save template draft');
      const templateId = await browserTab!.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).auditProgramTemplates.find(t=>t.procedures[0].title==='Verify recorded revenue').id`);
      const publish = await browserTab!.evaluate<boolean>(`(() => {const card=[...document.querySelectorAll('.borderbox')].find(e=>e.innerText.includes('Verify recorded revenue'));const b=[...(card?.querySelectorAll('button')||[])].find(x=>x.innerText.trim()==='Publish');if(!b)return false;b.click();return true;})()`);
      assert.equal(publish, true);
      await new Promise(resolve => setTimeout(resolve, 100));
      const apply = await browserTab!.evaluate<boolean>(`(() => {const card=[...document.querySelectorAll('.borderbox')].find(e=>e.innerText.includes('Verify recorded revenue'));const b=[...(card?.querySelectorAll('button')||[])].find(x=>x.innerText.trim()==='Apply to engagement');if(!b)return false;b.click();return true;})()`);
      assert.equal(apply, true);
      assert.equal(await waitForBrowser(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const p=s.auditPrograms.find(p=>p.sourceTemplateId===${JSON.stringify(templateId)});return !!p&&p.sourceTemplateVersion===1&&p.procedures.length===1&&p.procedures[0].title==='Verify recorded revenue'&&p.procedures[0].status==='Not started'&&!p.procedures[0].workPerformed&&!p.procedures[0].conclusion;})()`), true, 'application pins the published template and starts with empty execution state');
      const firstProgramId = await browserTab!.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).auditPrograms.find(p=>p.sourceTemplateId===${JSON.stringify(templateId)}).id`);
      assert.equal(await browserTab!.evaluate<boolean>(`document.body.innerText.includes('Unresolved risk coverage gaps')&&document.body.innerText.includes('Unlinked')`), true, 'program detail surfaces unresolved risk coverage');
      await clickButton('Risks & Audit Programs');
      await browserTab!.evaluate(`(() => {const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim().startsWith('Reusable Program Templates'));if(!b)throw Error('template tab unavailable');b.click();})()`);
      const revised = await browserTab!.evaluate<boolean>(`(() => {const card=[...document.querySelectorAll('.borderbox')].find(e=>e.innerText.includes('Revenue substantive template'));const b=[...(card?.querySelectorAll('button')||[])].find(x=>x.innerText.trim()==='Revise');if(!b)return false;b.click();return true;})()`);
      assert.equal(revised, true);
      await setInput('textarea[placeholder="Instructions"]', 'Inspect approved source records and recalculate selected invoices.');
      await clickButton('Save new draft revision');
      assert.equal(await waitForBrowser(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const t=s.auditProgramTemplates.find(x=>x.id===${JSON.stringify(templateId)});return t.version===2&&t.status==='Draft'&&t.procedures[0].instructions.includes('recalculate')&&s.auditProgramTemplateHistory.some(x=>x.id===t.id&&x.version===1&&x.status==='Published');})()`), true, 'template edit creates a retained draft revision without overwriting its published predecessor');
      assert.equal(await browserTab!.evaluate<boolean>(`(() => {const card=[...document.querySelectorAll('.borderbox')].find(e=>e.innerText.includes('Revenue substantive template'));return !!card&&![...card.querySelectorAll('button')].some(x=>x.innerText.trim()==='Apply to engagement');})()`), true, 'draft revisions cannot be applied before publication');
      const publishRevision = await browserTab!.evaluate<boolean>(`(() => {const card=[...document.querySelectorAll('.borderbox')].find(e=>e.innerText.includes('Revenue substantive template'));const b=[...(card?.querySelectorAll('button')||[])].find(x=>x.innerText.trim()==='Publish');if(!b)return false;b.click();return true;})()`);
      assert.equal(publishRevision, true);
      const applyRevision = await browserTab!.evaluate<boolean>(`(() => {const card=[...document.querySelectorAll('.borderbox')].find(e=>e.innerText.includes('Revenue substantive template'));const b=[...(card?.querySelectorAll('button')||[])].find(x=>x.innerText.trim()==='Apply to engagement');if(!b)return false;b.click();return true;})()`);
      assert.equal(applyRevision, true);
      assert.equal(await waitForBrowser(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const p=s.auditPrograms.filter(x=>x.sourceTemplateId===${JSON.stringify(templateId)});return p.length===2&&p.some(x=>x.id===${JSON.stringify(firstProgramId)}&&x.sourceTemplateVersion===1&&x.procedures[0].instructions==='Inspect approved source records.')&&p.some(x=>x.sourceTemplateVersion===2&&x.procedures[0].instructions.includes('recalculate')&&x.procedures[0].status==='Not started');})()`), true, 'each application remains pinned to its template revision and receives fresh procedure identities');
      await browserTab!.evaluate(`(() => {const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim().startsWith('Reusable Program Templates'));if(!b)throw Error('template tab unavailable');b.click();window.confirm=()=>true;})()`);
      await waitForBrowser(`!!document.querySelector('[aria-label="Retire Revenue substantive template"]')`);
      await browserTab!.evaluate(`document.querySelector('[aria-label="Retire Revenue substantive template"]').click()`);
      assert.equal(await waitForBrowser(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const t=s.auditProgramTemplates.find(x=>x.id===${JSON.stringify(templateId)});const p=s.auditPrograms.filter(x=>x.sourceTemplateId===${JSON.stringify(templateId)});return t.status==='Retired'&&p.length===2&&p.some(x=>x.sourceTemplateVersion===1&&x.procedures[0].instructions==='Inspect approved source records.')&&p.some(x=>x.sourceTemplateVersion===2&&x.procedures[0].instructions.includes('recalculate'));})()`), true, 'retirement blocks future use and leaves both applied engagement revisions unchanged');
      assert.deepEqual(browserTab!.exceptions, []);
    } finally {
      if (original) await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2', ${JSON.stringify(original)})`);
      else await browserTab!.evaluate(`localStorage.removeItem('ste-auditsphere-role-portals-v2')`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
    }
  });

  it('AT-19: prepares the same client workspace twice idempotently', async () => {
    const original = await browserTab!.evaluate<string | null>(`localStorage.getItem('ste-auditsphere-role-portals-v2')`);
    try {
      await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2', ${JSON.stringify(JSON.stringify(createInitialState()))})`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
      await clickButtonStartingWith('Documents & SharePoint');
      await clickButton('Verify Client Workspace');
      const afterFirst = await browserTab!.evaluate<number>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).folders.filter(f=>f.path==='/Clients/EXP-TRAD/').length`);
      await clickButton('Verify Client Workspace');
      const afterSecond = await browserTab!.evaluate<number>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).folders.filter(f=>f.path==='/Clients/EXP-TRAD/').length`);
      assert.equal(afterFirst, 1);
      assert.equal(afterSecond, afterFirst, 'repeated preparation leaves exactly one canonical root');
      assert.deepEqual(browserTab!.exceptions, []);
    } finally {
      if (original) await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2', ${JSON.stringify(original)})`);
      else await browserTab!.evaluate(`localStorage.removeItem('ste-auditsphere-role-portals-v2')`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
    }
  });

  it('AT-34: configures and persists the selected accounting context', async () => {
    const original = await browserTab!.evaluate<string | null>(`localStorage.getItem('ste-auditsphere-role-portals-v2')`);
    try {
      await browserTab!.evaluate(`(() => {const k='ste-auditsphere-role-portals-v2';const s=JSON.parse(localStorage.getItem(k)||${JSON.stringify(JSON.stringify(createInitialState()))});const e=s.engagements.find(x=>x.id===s.selectedEngagement);e.packageHistory=[{id:'AT34-OLD-PACKAGE',engagementId:e.id,revision:e.packageRevision,generation:e.generation,sourceVersion:e.sourceVersion,mappingRevision:0,notes:'',noteRevision:e.packageRevision,sections:[],validation:{passed:true},artifacts:[],createdAt:new Date().toISOString(),createdBy:s.currentPerson}];s.statementSetRevisions=[{id:'AT34-OLD-STATEMENT',engagementId:e.id,status:'Reviewed'}];const sibling=s.engagements.find(x=>x.client===e.client&&x.id!==e.id);if(sibling){sibling.mappingApproved=true;s.accountMappingRevisions.push({engagementId:sibling.id,revision:1,mappings:[],status:'Approved',preparedBy:'preparer',reviewedBy:'reviewer'});s.statementSetRevisions.push({id:'AT34-SIBLING-STATEMENT',engagementId:sibling.id,status:'Reviewed'});}localStorage.setItem(k,JSON.stringify(s));})()`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
      await clickButton('Accounting Workbench');
      await clickButton('Accounting Setup');
      let text = await browserTab!.evaluate<string>('document.body.innerText');
      assert.match(text, /Client accounting context/);
      assert.match(text, /Chart of accounts/);
      assert.match(text, /Periods and books/);
      assert.match(text, /Department/);
      const before = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const e=s.engagements.find(e=>e.id===s.selectedEngagement);return {profile:s.clients.find(c=>c.id===e.client).accountingProfile.revision,generation:e.generation}})()`);
      await browserTab!.evaluate(`(() => {const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;const input=document.querySelector('form input');setter.call(input,input.value+' AT34');input.dispatchEvent(new Event('input',{bubbles:true}));const account=document.querySelector('[aria-label="Account name"]');setter.call(account,account.value+' revised');account.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await clickButton('Save Accounting Setup');
      const saved = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const e=s.engagements.find(e=>e.id===s.selectedEngagement);const c=s.clients.find(c=>c.id===e.client);const sibling=s.engagements.find(x=>x.client===e.client&&x.id!==e.id);return {profile:c.accountingProfile,engagement:e,statement:s.statementSetRevisions.find(r=>r.id==='AT34-OLD-STATEMENT'),sibling,siblingMapping:s.accountMappingRevisions.find(r=>r.engagementId===sibling?.id),siblingStatement:s.statementSetRevisions.find(r=>r.id==='AT34-SIBLING-STATEMENT')}})()`);
      assert.equal(saved.profile.revision, before.profile + 1);
      assert.equal(saved.profile.history.at(-1).revision, before.profile);
      assert.match(saved.profile.legalEntityName, /AT34$/);
      assert.equal(saved.engagement.accountingProfileRevision, saved.profile.revision);
      assert.ok(saved.profile.periodBooks.some((book: any) => book.id === saved.engagement.accountingPeriodBookId));
      assert.equal(saved.engagement.generation, before.generation + 1);
      assert.equal(saved.engagement.packageHistory[0].generation, before.generation, 'the old package remains pinned to its prior context generation');
      assert.equal(saved.statement.status, 'Stale', 'setup changes stale a reviewed statement set');
      assert.ok(saved.sibling, 'fixture includes a second engagement for the same client');
      assert.equal(saved.sibling.mappingApproved, false, 'a chart edit invalidates approved mappings for other engagements of the same client');
      assert.equal(saved.siblingMapping.status, 'Draft', 'the sibling approval is retained as a draft instead of deleted');
      assert.equal(saved.siblingStatement.status, 'Stale', 'a chart edit stales sibling statement output');
      await clickButton('Financial Packages');
      text = await browserTab!.evaluate<string>('document.body.innerText');
      assert.match(text, /Saved Revision .*?Stale/);
      assert.match(text, /accounting or engagement context changed/);
      assert.deepEqual(browserTab!.exceptions, []);
    } finally {
      if (original) await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2', ${JSON.stringify(original)})`);
      else await browserTab!.evaluate(`localStorage.removeItem('ste-auditsphere-role-portals-v2')`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
    }
  });

  it('AT-36: renders general ledger completeness status', async () => {
    const original = await browserTab!.evaluate<string | null>(`localStorage.getItem('ste-auditsphere-role-portals-v2')`);
    try {
      await clickButton('Accounting Workbench');
      assert.equal(await browserTab!.evaluate<boolean>(`(() => {const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim().startsWith('General Ledger & Completeness'));if(!b)return false;b.click();return true;})()`), true);
      const text = await browserTab!.evaluate<string>('document.body.innerText');
      assert.match(text, /General Ledger Completeness Verification/);
      assert.match(text, /GL Fully Reconciled to TB|Discrepancies/);
      assert.deepEqual(browserTab!.exceptions, []);
    } finally {
      if (original) await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2', ${JSON.stringify(original)})`);
      else await browserTab!.evaluate(`localStorage.removeItem('ste-auditsphere-role-portals-v2')`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
    }
  });

  it('AT-39: renders reconciliation timing and variance totals', async () => {
    const original = await browserTab!.evaluate<string | null>(`localStorage.getItem('ste-auditsphere-role-portals-v2')`);
    try {
      await clickButton('Accounting Workbench');
      assert.equal(await browserTab!.evaluate<boolean>(`(() => {const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim().startsWith('Reconciliations'));if(!b)return false;b.click();return true;})()`), true);
      const text = await browserTab!.evaluate<string>('document.body.innerText');
      assert.match(text, /Total Timing Adjustments/);
      assert.match(text, /Unexplained Variance/);
      await browserTab!.evaluate(`(() => {const r=document.querySelector('#role-select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(r,'manager');r.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await clickButton('New Schedule');
      await browserTab!.evaluate(`(() => {const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;const name=document.querySelector('[aria-label="Reconciliation name"]');set.call(name,'AT-39 browser schedule');name.dispatchEvent(new Event('input',{bubbles:true}));const account=document.querySelector('[aria-label="Reconciliation account"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(account,'1000');account.dispatchEvent(new Event('change',{bubbles:true}));const date=document.querySelector('[aria-label="Reconciliation as-of date"]');set.call(date,'2026-12-31');date.dispatchEvent(new Event('input',{bubbles:true}));const balance=document.querySelector('[aria-label="Reconciliation statement balance"]');set.call(balance,'1000000');balance.dispatchEvent(new Event('input',{bubbles:true}));const evidence=document.querySelector('[aria-label="Reconciliation evidence"]');set.call(evidence,'DOC-002');evidence.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await clickButton('Save Reconciliation Draft');
      const saved = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return s.engagements.find(e=>e.id===s.selectedEngagement).reconciliations.find(r=>r.name==='AT-39 browser schedule')})()`);
      assert.equal(saved.status, 'Draft');
      assert.equal(saved.sourceVersion, await browserTab!.evaluate<number>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id===JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).selectedEngagement).sourceVersion`));
      assert.equal(saved.glBalance, 1000000);
      await clickButton('Approve schedule');
      assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /manager cannot review their reconciliation schedule/);
      await browserTab!.evaluate(`(() => {const r=document.querySelector('#role-select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(r,'reviewer');r.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await browserTab!.evaluate(`(() => {window.prompt=()=> 'Statement date and scope need correction.';})()`);
      await browserTab!.evaluate(`(() => {const panel=[...document.querySelectorAll('.panel.panel-pad')].find(x=>x.querySelector('h3')?.innerText==='AT-39 browser schedule');const button=[...panel.querySelectorAll('button')].find(x=>x.innerText.trim()==='Return for rework');if(!button)throw Error('Return action missing on AT-39 schedule');button.click();})()`);
      const returned = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return s.engagements.find(e=>e.id===s.selectedEngagement).reconciliations.find(r=>r.name==='AT-39 browser schedule')})()`);
      assert.equal(returned.status, 'Returned');
      assert.equal(returned.reviewNote, 'Statement date and scope need correction.');
      await browserTab!.evaluate(`(() => {const r=document.querySelector('#role-select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(r,'manager');r.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await browserTab!.evaluate(`(() => {const panel=[...document.querySelectorAll('.panel.panel-pad')].find(x=>x.querySelector('h3')?.innerText==='AT-39 browser schedule');const button=[...panel.querySelectorAll('button')].find(x=>x.innerText.trim()==='Edit schedule');if(!button)throw Error('Edit action missing on returned AT-39 schedule');button.click();})()`);
      await browserTab!.evaluate(`(() => {const date=document.querySelector('[aria-label="Reconciliation as-of date"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(date,'2026-09-22');date.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await clickButton('Save Reconciliation Draft');
      const reworked = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return s.engagements.find(e=>e.id===s.selectedEngagement).reconciliations.find(r=>r.name==='AT-39 browser schedule')})()`);
      assert.equal(reworked.status, 'Draft');
      assert.equal(reworked.revision, 2);
      assert.equal(reworked.asOfDate, '2026-09-22');
      assert.equal(reworked.history.at(-1).status, 'Returned');
      assert.equal(reworked.history.at(-1).reviewNote, 'Statement date and scope need correction.');
      await browserTab!.evaluate(`(() => {const r=document.querySelector('#role-select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(r,'reviewer');r.dispatchEvent(new Event('change',{bubbles:true}));const summary=[...document.querySelectorAll('summary')].find(x=>x.innerText.startsWith('Prior reconciliation revisions'));summary?.click();})()`);
      assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /review note: Statement date and scope need correction\./);
      await browserTab!.evaluate(`(() => {const panel=[...document.querySelectorAll('.panel.panel-pad')].find(x=>x.querySelector('h3')?.innerText==='AT-39 browser schedule');const button=[...panel.querySelectorAll('button')].find(x=>x.innerText.trim()==='Approve schedule');if(!button)throw Error('Approval action missing on reworked AT-39 schedule');button.click();})()`);
      const approved = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return s.engagements.find(e=>e.id===s.selectedEngagement).reconciliations.find(r=>r.name==='AT-39 browser schedule')})()`);
      assert.equal(approved.status, 'Approved');
      assert.equal(approved.reviewedByUserId, 'reviewer');
      assert.equal(approved.revision, 2);
      assert.deepEqual(browserTab!.exceptions, []);
    } finally {
      if (original) await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2', ${JSON.stringify(original)})`);
      else await browserTab!.evaluate(`localStorage.removeItem('ste-auditsphere-role-portals-v2')`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
    }
  });

  it('AT-46: opens workpaper, evidence and finding views', async () => {
    const original = await browserTab!.evaluate<string | null>(`localStorage.getItem('ste-auditsphere-role-portals-v2')`);
    try {
      await clickButtonStartingWith('Audit Workpapers');
      const text = await browserTab!.evaluate<string>('document.body.innerText');
      assert.match(text, /Workpapers|Status|Evidence|Clearance/);
      await clickButton('Evidence Catalogue');
      assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /Evidence/);
      await clickButtonStartingWith('Findings & Differences');
      const findingText = await browserTab!.evaluate<string>('document.body.innerText');
      assert.match(findingText, /Findings|Misstatement|Severity/);
      assert.deepEqual(browserTab!.exceptions, []);
    } finally {
      if (original) await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2', ${JSON.stringify(original)})`);
      else await browserTab!.evaluate(`localStorage.removeItem('ste-auditsphere-role-portals-v2')`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
    }
  });

  it('VP-054: records a sourced qualitative finding and durable reasoned disposition', async () => {
    await browserTab!.evaluate(`(() => {const r=document.querySelector('#role-select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(r,'manager');r.dispatchEvent(new Event('change',{bubbles:true}));const e=document.querySelector('select[aria-label="Selected engagement"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'ENG-26001');e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentRole==='manager'`), true);
    await browserTab!.evaluate(`(() => {const key='ste-auditsphere-role-portals-v2';const s=JSON.parse(localStorage.getItem(key));const p=s.samplePopulations.find(x=>x.engagementId==='ENG-26001');p.items.unshift({id:'AT54-SAMPLE-01',itemRef:'AT54-CUST-001',date:'2026-09-20',counterparty:'Customer sample fixture',amount:1000,selected:true,tested:true,result:'Exception noted',auditedAmount:750,difference:-250,notes:'Vouched balance is QAR 250 below the recorded amount.'});localStorage.setItem(key,JSON.stringify(s));})()`);
    await browserTab!.command('Page.reload');
    assert.equal(await waitForBrowser('!!document.querySelector("#app-root .brandname")'), true, 'sample exception fixture reloads');
    await browserTab!.evaluate(`(() => {const e=document.querySelector('select[aria-label="Selected engagement"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'ENG-26001');e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await clickButtonStartingWith('Findings & Differences');
    assert.equal(await browserTab!.evaluate<boolean>('document.body.innerText.includes("context only")'), true, 'materiality is contextual and does not auto-decide disposition');
    await clickButton('Raise Finding');
    await browserTab!.evaluate(`(() => {const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;const title=document.querySelector('[aria-label="Finding title"]');set.call(title,'VP-054 inventory count control gap');title.dispatchEvent(new Event('input',{bubbles:true}));const textareaSet=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;const condition=document.querySelector('[aria-label="Finding condition"]');textareaSet.call(condition,'Independent count sheets were not signed by a second counter.');condition.dispatchEvent(new Event('input',{bubbles:true}));const recommendation=document.querySelector('[aria-label="Finding recommendation"]');textareaSet.call(recommendation,'Require independent countersignature at each inventory location.');recommendation.dispatchEvent(new Event('input',{bubbles:true}));for(const [label,value] of [['Finding procedure','PRC-01'],['Finding evidence','EVD-01'],['Finding workpaper','WP-A1'],['Finding category','Internal control deficiency'],['Finding severity','Significant']]){const s=document.querySelector('[aria-label="'+label+'"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,value);s.dispatchEvent(new Event('change',{bubbles:true}));}})()`);
    await clickButton('Record Finding');
    const created = await browserTab!.evaluate<any>(`(() => JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).findings.find(x=>x.title==='VP-054 inventory count control gap'))()`);
    assert.ok(created?.id);
    assert.deepEqual([created.category, created.severity, created.amount, created.linkedProcedureId, created.linkedEvidenceId, created.linkedWorkpaperId], ['Internal control deficiency', 'Significant', undefined, 'PRC-01', 'EVD-01', 'WP-A1']);
    await browserTab!.evaluate(`(() => {window.prompt=()=> 'Management adopted the independent count review procedure.';const s=document.querySelector('[aria-label="Disposition for ${created.id}"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'Corrected by client');s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).findings.find(x=>x.id==='${created.id}').dispositionHistory?.length===1`), true, 'disposition rationale and actor are recorded in store history');
    await browserTab!.command('Page.reload');
    assert.equal(await waitForBrowser('!!document.querySelector("#app-root .brandname")'), true);
    const afterReload = await browserTab!.evaluate<any>(`(() => JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).findings.find(x=>x.id==='${created.id}'))()`);
    assert.deepEqual([afterReload.disposition, afterReload.dispositionHistory[0].rationale], ['Corrected by client', 'Management adopted the independent count review procedure.']);
    await clickButtonStartingWith('Findings & Differences');
    await clickButton('Raise Finding');
    await browserTab!.evaluate(`(() => {const setInput=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;const setText=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;const title=document.querySelector('[aria-label="Finding title"]');setInput.call(title,'VP-054 promoted sampled receivable shortfall');title.dispatchEvent(new Event('input',{bubbles:true}));for(const [label,value] of [['Finding condition','Sampled receivable is QAR 250 below the ledger.'],['Finding recommendation','Investigate the variance and correct the balance if confirmed.']]){const field=document.querySelector('[aria-label="'+label+'"]');setText.call(field,value);field.dispatchEvent(new Event('input',{bubbles:true}));}for(const [label,value] of [['Finding category','Monetary misstatement'],['Finding severity','Significant'],['Finding assertion','Existence'],['Finding currency','QAR'],['Finding sample exception','POP-01/AT54-SAMPLE-01']]){const field=document.querySelector('[aria-label="'+label+'"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(field,value);field.dispatchEvent(new Event('change',{bubbles:true}));}const amount=document.querySelector('[aria-label="Finding signed amount"]');setInput.call(amount,'-250');amount.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await clickButton('Record Finding');
    const promoted = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return {finding:s.findings.find(x=>x.title==='VP-054 promoted sampled receivable shortfall'),sample:s.samplePopulations.find(x=>x.id==='POP-01').items.find(x=>x.id==='AT54-SAMPLE-01')};})()`);
    assert.deepEqual([promoted.finding.linkedSamplePopulationId,promoted.finding.linkedSampleItemId,promoted.finding.netMisstatement,promoted.finding.grossMisstatement,promoted.sample.findingId],['POP-01','AT54-SAMPLE-01',-250,250,promoted.finding.id], 'promotion preserves the sample link and signed/gross amounts');
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('VP-055: requires an independent response review and reopens after workpaper revision', async () => {
    await browserTab!.evaluate(`(() => {const r=document.querySelector('#role-select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(r,'manager');r.dispatchEvent(new Event('change',{bubbles:true}));const e=document.querySelector('select[aria-label="Selected engagement"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'ENG-26001');e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentRole==='manager'`), true);
    await clickButtonStartingWith('Review Desk');
    await clickButton('Raise Review Note');
    await browserTab!.evaluate(`(() => {const t=document.querySelector('.modal-backdrop textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'AT55 verify current workpaper revision after response.');t.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await clickButton('Raise Query');
    const noteId = await browserTab!.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26001').reviews.find(r=>r.text==='AT55 verify current workpaper revision after response.').id`);
    const initial = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const e=s.engagements.find(x=>x.id==='ENG-26001');return {note:e.reviews.find(x=>x.id===${JSON.stringify(noteId)}),wp:e.workpapers.find(x=>x.id==='WP-A1')};})()`);
    assert.equal(initial.note.subjectVersion, initial.wp.version, 'new review query is pinned to its exact workpaper version');
    await browserTab!.evaluate(`(() => {const r=document.querySelector('#role-select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(r,'reviewer');r.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentRole==='reviewer'`), true);
    const respond = async (message: string) => {
      await browserTab!.evaluate(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes(${JSON.stringify(noteId)}));const b=[...row.querySelectorAll('button')].find(x=>x.innerText.trim()==='Respond');if(!b)throw Error('review response action unavailable for '+${JSON.stringify(noteId)});b.click();})()`);
      await browserTab!.evaluate(`(() => {const fields=document.querySelectorAll('.modal-backdrop textarea,.modal-backdrop input[type=text]');const setText=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;setText.call(fields[0],${JSON.stringify(message)});fields[0].dispatchEvent(new Event('input',{bubbles:true}));const setInput=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setInput.call(fields[1],'DOC-002');fields[1].dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await clickButton('Submit Response');
    };
    await respond('Checked the requested support against the current cash workpaper revision.');
    const firstResponse = await browserTab!.evaluate<any>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26001').reviews.find(r=>r.id===${JSON.stringify(noteId)})`);
    assert.equal(firstResponse.status,'Responded');
    assert.equal(firstResponse.subjectVersion, initial.wp.version);
    await clickButton('Clear Note');
    assert.equal(await waitForBrowser('document.body.innerText.includes("cannot clear their own review point")'), true, 'responder cannot clear their own response');
    await browserTab!.evaluate(`(() => {const r=document.querySelector('#role-select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(r,'manager');r.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentRole==='manager'`), true);
    await clickButton('Clear Note');
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26001').reviews.find(r=>r.id===${JSON.stringify(noteId)}).status==='Cleared'`), true, 'independent manager clears the responded query');
    await clickButtonStartingWith('Audit Workpapers');
    await browserTab!.evaluate(`(() => {const t=document.querySelector('[aria-label="Workpaper scope"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'Revision changed after review note clearance.');t.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await clickButton('Save workpaper revision');
    const reopened = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const e=s.engagements.find(x=>x.id==='ENG-26001');return {note:e.reviews.find(x=>x.id===${JSON.stringify(noteId)}),wp:e.workpapers.find(x=>x.id==='WP-A1')};})()`);
    assert.equal(reopened.note.status,'Reopened');
    assert.equal(reopened.note.response,firstResponse.response,'prior response remains in the history after its subject changes');
    assert.ok(reopened.note.history.some((event: any)=>event.action==='Reopened after workpaper revision'));
    await clickButtonStartingWith('Review Desk');
    await respond('Rechecked workpaper revision '+reopened.wp.version+' and linked current support.');
    const currentResponse = await browserTab!.evaluate<any>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26001').reviews.find(r=>r.id===${JSON.stringify(noteId)})`);
    assert.equal(currentResponse.status,'Responded');
    assert.equal(currentResponse.subjectVersion,reopened.wp.version,'new response is pinned to the current subject revision');
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('AT-55: shows a scope-filtered cross-engagement review queue', async () => {
    const original = await browserTab!.evaluate<string | null>(`localStorage.getItem('ste-auditsphere-role-portals-v2')`);
    try {
      if (!original) await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2', ${JSON.stringify(JSON.stringify(createInitialState()))})`);
      await browserTab!.evaluate(`(() => {
        const key='ste-auditsphere-role-portals-v2';
        const s=JSON.parse(localStorage.getItem(key));
        const selected=s.engagements.find(e=>e.id===s.selectedEngagement);
        const other=s.engagements.find(e=>e.id!==selected.id);
        if(!other) throw Error('second engagement fixture missing');
        const crossWorkpaper={...structuredClone(selected.workpapers[0]),id:'AT55-WP-CROSS',title:'Cross engagement queue fixture',version:1};
        other.workpapers=[crossWorkpaper];
        other.reviews ||= [];
        other.reviews.push({id:'AT55-QUEUE',wp:crossWorkpaper.id,title:'Cross engagement queue fixture',body:'Queue scope check',author:'Reviewer',raisedBy:'reviewer',assigned:s.currentPerson,assignee:s.currentPerson,due:s.asOfDate,response:'',severity:'Low',version:1,text:'Cross engagement queue fixture',status:'Open',history:[]});
        localStorage.setItem(key,JSON.stringify(s));
      })()`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
      await clickButtonStartingWith('Review Desk');
      const scope = await browserTab!.evaluate<any>(`(() => {const s=document.querySelector('[aria-label="Review queue scope"]');if(!s)throw Error('review queue filter missing: '+document.body.innerText.slice(0,400));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'scoped');s.dispatchEvent(new Event('change',{bubbles:true}));return s.value;})()`);
      assert.equal(scope, 'scoped');
      assert.equal(await waitForBrowser('document.body.innerText.includes("AT55-QUEUE")'), true, 'all-permitted queue includes assigned note from another engagement');
      const context = await browserTab!.evaluate<string>(`[...document.querySelectorAll('tbody tr')].find(r=>r.innerText.includes('AT55-QUEUE'))?.innerText || ''`);
      assert.match(context, /ENG-2600[2-9]/, 'cross-engagement row identifies its engagement and workpaper');
      await browserTab!.evaluate(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(r=>r.innerText.includes('AT55-QUEUE'));const select=row.querySelector('[aria-label="Reassign ENG-26002 AT55-QUEUE"]');if(!select)throw Error('reassignment control missing');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'preparer-2');select.dispatchEvent(new Event('change',{bubbles:true}));window.prompt=()=> 'Balance reviewer workload';row.querySelectorAll('button')[1].click();})()`);
      assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26002').reviews.find(r=>r.id==='AT55-QUEUE').assignedUserId==='preparer-2'`), true, 'manager reassigns the note to the eligible second preparer with a reason');
      await browserTab!.evaluate(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(r=>r.innerText.includes('AT55-QUEUE'));row.querySelector('button')?.click();})()`);
      await browserTab!.evaluate(`(() => {const input=document.querySelector('.modal-backdrop textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Responded from the cross-engagement review queue.');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await clickButton('Submit Response');
      const response = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return {other:s.engagements.find(e=>e.id==='ENG-26002').reviews.find(r=>r.id==='AT55-QUEUE'),selected:s.engagements.find(e=>e.id===s.selectedEngagement).reviews.some(r=>r.id==='AT55-QUEUE')}})()`);
      assert.equal(response.other.status, 'Responded', 'response action writes to the row engagement');
      assert.equal(response.other.response, 'Responded from the cross-engagement review queue.');
      assert.equal(response.other.responseEvidence, '', 'optional evidence from the wrong engagement is not inherited');
      assert.equal(response.selected, false, 'cross-engagement action does not mutate selected-engagement notes');
      await browserTab!.evaluate(`(() => {const s=document.querySelector('[aria-label="Review status filter"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'Responded');s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      assert.equal(await waitForBrowser('[...document.querySelectorAll("tbody tr")].some(row=>row.innerText.includes("AT55-QUEUE"))'), true, 'status filter retains matching responded notes');
      await browserTab!.evaluate(`(() => {const s=document.querySelector('[aria-label="Review severity filter"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'High');s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      assert.equal(await waitForBrowser('![...document.querySelectorAll("tbody tr")].some(row=>row.innerText.includes("AT55-QUEUE"))'), true, 'severity filter excludes a low-severity note');
      await browserTab!.evaluate(`(() => {const s=document.querySelector('[aria-label="Review severity filter"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'All');s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      assert.equal(await waitForBrowser('[...document.querySelectorAll("tbody tr")].some(row=>row.innerText.includes("AT55-QUEUE"))'), true, 'clearing severity filter restores matching queue row');
      await browserTab!.evaluate(`(() => {const s=document.querySelector('[aria-label="Review queue scope"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'assigned');s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      const previousAssigneeQueue = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return {current:s.currentUserId,assignee:s.engagements.find(e=>e.id==='ENG-26002').reviews.find(r=>r.id==='AT55-QUEUE').assignedUserId,filter:document.querySelector('[aria-label="Review queue scope"]')?.value,visible:[...document.querySelectorAll('tbody tr')].some(row=>row.innerText.includes('AT55-QUEUE'))}})()`);
      assert.equal(previousAssigneeQueue.visible, false, `reassignment removes note from previous assignee queue: ${JSON.stringify(previousAssigneeQueue)}`);
      await browserTab!.evaluate(`(() => {const key='ste-auditsphere-role-portals-v2';const s=JSON.parse(localStorage.getItem(key));s.currentUserId='preparer-2';s.currentPerson='Nadia Rahman';s.currentRole='preparer';localStorage.setItem(key,JSON.stringify(s));})()`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
      await clickButtonStartingWith('Review Desk');
      await browserTab!.evaluate(`(() => {const s=document.querySelector('[aria-label="Review queue scope"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'assigned');s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      assert.equal(await waitForBrowser('[...document.querySelectorAll("tbody tr")].some(row=>row.innerText.includes("AT55-QUEUE"))'), true, 'reassigned note appears in the new assignee personal queue');
      await browserTab!.evaluate(`(() => {const s=document.querySelector('[aria-label="Review queue scope"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'engagement');s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      assert.equal(await waitForBrowser('!document.body.innerText.includes("AT55-QUEUE")'), true, 'selected-engagement filter excludes other engagements');
      await browserTab!.evaluate(`(() => {const key='ste-auditsphere-role-portals-v2';const s=JSON.parse(localStorage.getItem(key));s.currentUserId='group-user';s.currentPerson=s.users.find(u=>u.id==='group-user').name;s.currentRole='manager';s.selectedEngagement='ENG-26001';localStorage.setItem(key,JSON.stringify(s));})()`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
      await clickButtonStartingWith('Review Desk');
      await browserTab!.evaluate(`(() => {const s=document.querySelector('[aria-label="Review queue scope"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'scoped');s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      assert.equal(await waitForBrowser('!document.body.innerText.includes("AT55-QUEUE")'), true, 'narrow grant excludes another engagement from queue');
      await browserTab!.evaluate(`(() => {const create=URL.createObjectURL.bind(URL);window.__reviewCsv='';URL.createObjectURL=blob=>{blob.text().then(text=>window.__reviewCsv=text);return create(blob);};})()`);
      await clickButton('Export filtered queue');
      assert.equal(await waitForBrowser('typeof window.__reviewCsv==="string" && window.__reviewCsv.includes("Engagement")'), true, 'filtered queue is exported as CSV');
      const exported = await browserTab!.evaluate<string>('window.__reviewCsv');
      assert.match(exported, /ENG-26001/);
      assert.doesNotMatch(exported, /AT55-QUEUE|ENG-26002/, 'export excludes notes from the ungranted sibling engagement');
      await browserTab!.evaluate(`(() => {const key='ste-auditsphere-role-portals-v2';const s=JSON.parse(localStorage.getItem(key));s.engagements.find(e=>e.id==='ENG-26001').reviews.push({id:'AT55-PRIVATE',wp:'WP-A1',subjectType:'workpaper',title:'Internal only',body:'Internal only',author:'Mona Khalil',raisedBy:'Mona Khalil',assigned:'Adam Khan',due:s.asOfDate,response:'',severity:'High',version:1,text:'INTERNAL-REVIEW-ONLY-AT55',status:'Open',history:[]});s.currentUserId='client_admin';s.currentPerson='Amal Nasser';s.currentRole='client_admin';localStorage.setItem(key,JSON.stringify(s));})()`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
      await clickButtonStartingWith('Client Experience Portal');
      assert.equal(await waitForBrowser('!document.body.innerText.includes("INTERNAL-REVIEW-ONLY-AT55")'), true, 'internal review text is not projected into the client portal');
      assert.deepEqual(browserTab!.exceptions, []);
    } finally {
      if (original) await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2', ${JSON.stringify(original)})`);
      else await browserTab!.evaluate(`localStorage.removeItem('ste-auditsphere-role-portals-v2')`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
    }
  });

  it('VP-055: raises a revision-pinned review note on a finding', async () => {
    const original = await browserTab!.evaluate<string | null>(`localStorage.getItem('ste-auditsphere-role-portals-v2')`);
    try {
      const seeded = createInitialState();
      seeded.currentUserId = 'manager';
      seeded.currentPerson = 'Layla Rahman';
      seeded.currentRole = 'manager';
      seeded.selectedEngagement = 'ENG-26001';
      await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2', ${JSON.stringify(JSON.stringify(seeded))})`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
      await clickButtonStartingWith('Review Desk');
      await clickButton('Raise Review Note');
      await browserTab!.evaluate(`(() => {const s=document.querySelector('[aria-label="Review subject type"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'finding');s.dispatchEvent(new Event('change',{bubbles:true}));const target=document.querySelector('[aria-label="Review subject"]');if(!target.value)throw Error('no eligible finding selected');})()`);
      await browserTab!.evaluate(`(() => {const t=document.querySelector('.modal-backdrop textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'Review the disposition basis for FND-01.');t.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await clickButton('Raise Query');
      const saved = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return s.engagements.find(e=>e.id==='ENG-26001').reviews.find(r=>r.text==='Review the disposition basis for FND-01.')})()`);
      assert.equal(saved.subjectType, 'finding');
      assert.equal(saved.wp, 'FND-01');
      assert.equal(saved.subjectVersion, 1);
      assert.deepEqual(browserTab!.exceptions, []);
    } finally {
      if (original) await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2', ${JSON.stringify(original)})`);
      else await browserTab!.evaluate(`localStorage.removeItem('ste-auditsphere-role-portals-v2')`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
    }
  });

  it('AT-47: opens the sign-offs and EQR workspace', async () => {
    const original = await browserTab!.evaluate<string | null>(`localStorage.getItem('ste-auditsphere-role-portals-v2')`);
    try {
      await clickButton('Sign-offs & EQR');
      const text = await browserTab!.evaluate<string>('document.body.innerText');
      assert.match(text, /Sign-offs|EQR|Partner|Manager/);
      assert.deepEqual(browserTab!.exceptions, []);
    } finally {
      if (original) await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2', ${JSON.stringify(original)})`);
      else await browserTab!.evaluate(`localStorage.removeItem('ste-auditsphere-role-portals-v2')`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
    }
  });

  it('AT-51: saves a new rate version without rewriting issued invoices', async () => {
    const original = await browserTab!.evaluate<string | null>(`localStorage.getItem('ste-auditsphere-role-portals-v2')`);
    if (!original) await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2', ${JSON.stringify(JSON.stringify(createInitialState()))})`);
    try {
      const issuedBefore = await browserTab!.evaluate<any[]>(`(() => {
        const s = JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));
        return s.invoices.filter(i => i.status === 'Issued').map(i => ({ id: i.id, amount: i.amount }));
      })()`);
      assert.ok(issuedBefore.length > 0, 'issued invoices exist');
      await clickButton('Budgets & Variances');
      await clickButton('Author New Budget Version');
      const previousRate = await browserTab!.evaluate<number>(`Number(document.querySelector('.modal-card input[type=\"number\"]').value)`);
      assert.ok(Number.isFinite(previousRate));
      await browserTab!.evaluate(`(() => {const input=document.querySelector('.modal-card input[type=\"number\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,String(${previousRate + 10}));input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      const nextVersion = await browserTab!.evaluate<number>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).budgets.find(b=>b.engagementId===JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).selectedEngagement).version+1`);
      await clickButton(`Save Version ${nextVersion}`);
      const issuedAfter = await browserTab!.evaluate<any[]>(`(() => {
        const s = JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));
        return s.invoices.filter(i => i.status === 'Issued').map(i => ({ id: i.id, amount: i.amount }));
      })()`);
      assert.equal(await browserTab!.evaluate<boolean>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).budgets.find(b=>b.engagementId===JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).selectedEngagement).version===${nextVersion}`), true, 'budget version advanced');
      assert.deepEqual(issuedBefore, issuedAfter, 'issued invoices remain immutable');
      assert.deepEqual(browserTab!.exceptions, []);
    } finally {
      if (original) await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2', ${JSON.stringify(original)})`);
      else await browserTab!.evaluate(`localStorage.removeItem('ste-auditsphere-role-portals-v2')`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
    }
  });

  it('AT-52: carries manually entered client data through engagement, job, mapped statements and a persisted package', async () => {
    const original = await browserTab!.evaluate<string | null>(`localStorage.getItem('ste-auditsphere-role-portals-v2')`);
    try {
      const setPersona = async (name: string) => browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');const o=[...s.options].find(x=>x.textContent.includes(${JSON.stringify(name)}));if(!o)throw Error('Missing persona '+${JSON.stringify(name)});Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      const setSelect = async (selector: string, value: string) => browserTab!.evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      const setField = async (label: string, value: string, tag: 'input'|'textarea' = 'input') => browserTab!.evaluate(`(() => {const l=[...document.querySelectorAll('.modal-backdrop label')].find(x=>x.textContent.includes(${JSON.stringify(label)}));const e=l?.querySelector(${JSON.stringify(tag)})||l?.parentElement?.querySelector(${JSON.stringify(tag)});if(!e)throw Error('Missing field '+${JSON.stringify(label)});const p=Object.getOwnPropertyDescriptor(${tag === 'textarea' ? 'HTMLTextAreaElement' : 'HTMLInputElement'}.prototype,'value').set;p.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);

      await setPersona('Relationship owner');
      await clickButtonStartingWith('Client Portfolio');
      await clickButton('Add Client Profile');
      await setField('Legal Entity Name', 'AT52 Manually Entered Entity');
      await setField('Primary Contact Person', 'Omar Nasser');
      await setField('Contact Email', 'omar.nasser@example-trading.demo');
      await clickButton('Create Client');
      const clientId = await browserTab!.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).clients.find(c=>c.name==='AT52 Manually Entered Entity')?.id`);
      assert.ok(clientId, 'the client originates from the visible create-client form');

      await browserTab!.evaluate(`(() => {const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().startsWith('Acquisition'));if(!b)throw Error('Missing acquisition route');b.click();})()`);
      await clickButton('New Inquiry');
      await setField('Prospective Client Name', 'AT52 Manually Entered Entity');
      await setField('Primary Contact', 'Omar Nasser');
      await clickButton('Register Inquiry');
      const leadId = await browserTab!.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).leads.find(l=>l.name==='AT52 Manually Entered Entity')?.id`);
      assert.ok(leadId);
      const openLead = await browserTab!.evaluate<boolean>(`(() => {const card=[...document.querySelectorAll('.lead-card')].find(x=>x.innerText.includes('AT52 Manually Entered Entity'));const b=[...(card?.querySelectorAll('button')||[])].find(x=>x.innerText.trim()==='Details');if(!b)return false;b.click();return true;})()`);
      assert.equal(openLead, true);
      const setStage = async (stage: string) => browserTab!.evaluate(`(() => {const l=[...document.querySelectorAll('.modal-backdrop label')].find(x=>x.textContent.includes('Update stage'));const s=l?.querySelector('select');if(!s)throw Error('Missing stage selector');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(stage)});s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await setStage('Discovery'); await setStage('Evaluation'); await setStage('Won');
      await browserTab!.evaluate(`(() => {const s=document.querySelector('[aria-label="Existing client for conversion"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(clientId)});s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await clickButton('Link Won Opportunity to Client');
      assert.equal(await browserTab!.evaluate<boolean>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).leads.find(l=>l.id===${JSON.stringify(leadId)}).convertedClientId===${JSON.stringify(clientId)}`), true);
      await clickButton('Proposals & Terms');
      await clickButton('New Proposal');
      await setField('Title', 'AT52 Manual Client Proposal');
      await setSelect('.modal-backdrop select', leadId);
      await setField('Scope', 'Annual audit of the manually entered client financial statements.', 'textarea');
      await setField('Exclusions', 'Tax and payroll services.', 'textarea');
      await setField('Deliverables', 'Reviewed financial statements and audit report.', 'textarea');
      await setField('Client responsibilities', 'Provide complete and accurate records.', 'textarea');
      await setField('Fixed fee', '18000');
      await setField('Terms', 'Payment within 30 days of invoice.', 'textarea');
      await clickButton('Create Draft');
      const proposalId = await browserTab!.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).proposals.find(p=>p.title==='AT52 Manual Client Proposal')?.id`);
      assert.ok(proposalId);
      const review = await browserTab!.evaluate<boolean>(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes('AT52 Manual Client Proposal'));const b=[...(row?.querySelectorAll('button')||[])].find(x=>x.innerText.trim()==='Review');if(!b)return false;b.click();return true;})()`);
      assert.equal(review, true);
      await setPersona('Engagement partner');
      await clickButton('Record Review Decision');
      await clickButton('Mark Presented');

      await setPersona('System administrator');
      await clickButton('Firm Administration');
      const userRow = await browserTab!.evaluate<boolean>(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes('Omar Nasser'));const b=[...(row?.querySelectorAll('button')||[])].find(x=>x.innerText.includes('Grant Scope'));if(!b)return false;b.click();return true;})()`);
      assert.equal(userRow, true, 'management approver receives an explicit client grant');
      await setSelect('.modal-card select', 'Client');
      await browserTab!.evaluate(`(() => {const e=[...document.querySelectorAll('.modal-card select')].find(s=>[...s.options].some(o=>o.value===${JSON.stringify(clientId)}));if(!e)throw Error('Missing target client grant selector');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,${JSON.stringify(clientId)});e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await browserTab!.evaluate(`(() => {const from=document.querySelector('[aria-label="Grant effective from"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(from,'2026-09-23');from.dispatchEvent(new Event('input',{bubbles:true}));from.dispatchEvent(new Event('change',{bubbles:true}));const ref=document.querySelector('[aria-label="Approved access request reference"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(ref,'AT52-ACCESS-001');ref.dispatchEvent(new Event('input',{bubbles:true}));const reason=document.querySelector('[aria-label="Access grant reason"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(reason,'Permit this client management approver to respond to its proposal.');reason.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await clickButton('Record approved grant');
      assert.equal(await browserTab!.evaluate<boolean>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).roleGrants.some(g=>g.userId==='client'&&g.scopeKind==='Client'&&g.scopeId===${JSON.stringify(clientId)})`), true);
      await setPersona('Omar Nasser');
      await clickButton('Proposals & Terms');
      await browserTab!.evaluate(`(() => {const s=[...document.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value===${JSON.stringify(clientId)}));if(!s)throw Error('Client portal cannot select its granted entity');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(clientId)});s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /AT52 Manual Client Proposal/);
      assert.equal(await browserTab!.evaluate<boolean>(`[...document.querySelectorAll('button')].some(b=>b.innerText.trim()==='Record Acceptance')`), true, 'the granted client portal displays its presented proposal');
      await browserTab!.evaluate(`(() => {const set=(label,value,textarea=false)=>{const l=[...document.querySelectorAll('label')].find(x=>x.textContent.includes(label));const e=l?.querySelector(textarea?'textarea':'input');if(!e)throw Error('Missing portal field '+label);Object.getOwnPropertyDescriptor(textarea?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));};set('Authorized signatory','Omar Nasser');set('Evidence reference (email','AT52-CLIENT-ACCEPTANCE-001');set('Response notes','Approved the presented scope for the current reporting period.',true);})()`);
      await clickButton('Record Acceptance');
      assert.equal(await browserTab!.evaluate<boolean>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).proposals.find(p=>p.id===${JSON.stringify(proposalId)}).state==='Accepted'`), true);

      await setPersona('Engagement partner');
      await clickButtonStartingWith('Engagements');
      await clickButton('New Engagement');
      await setSelect('.modal-backdrop select', proposalId);
      await clickButton('Create Engagement');
      const engagementId = await browserTab!.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.proposalId===${JSON.stringify(proposalId)})?.id`);
      assert.ok(engagementId);
      await browserTab!.evaluate(`window.prompt=()=> 'AT52-PROFESSIONAL-ACCEPTANCE-001';`);
      await clickButton('Activate Engagement');
      assert.equal(await browserTab!.evaluate<boolean>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const e=s.engagements.find(x=>x.id===${JSON.stringify(engagementId)});return e.client===${JSON.stringify(clientId)}&&e.stage==='Planning'&&e.professionalAcceptance?.evidenceRef==='AT52-PROFESSIONAL-ACCEPTANCE-001';})()`), true);

      await setPersona('Engagement manager');
      await browserTab!.evaluate(`(() => {const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().startsWith('Jobs & Tasks'));if(!b)throw Error('Missing jobs route');b.click();})()`);
      await clickButtonStartingWith('New Job');
      await setField('Job Title', 'AT52 Manually Entered Client Audit');
      await browserTab!.evaluate(`(() => {const selects=[...document.querySelectorAll('.modal-backdrop select')];for(const value of [${JSON.stringify(clientId)},${JSON.stringify(engagementId)}]){const e=selects.find(s=>[...s.options].some(o=>o.value===value));if(!e)throw Error('Missing select option '+value);Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('change',{bubbles:true}));}})()`);
      await setField('Due Date', '2026-10-31');
      await clickButton('Create Job');
      const job = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return s.jobs.find(j=>j.title==='AT52 Manually Entered Client Audit')})()`);
      assert.equal(job.engagementId, engagementId);
      assert.equal(job.clientId, clientId);

      await setPersona('preparer');
      await setSelect('select[aria-label="Selected engagement"]', engagementId);
      await clickButton('Accounting Workbench');
      await clickButton('Statement Mappings');
      await browserTab!.evaluate(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const e=s.engagements.find(x=>x.id===${JSON.stringify(engagementId)});const targets={asset:'Cash and cash equivalents',liability:'Trade payables',equity:'Share capital and reserves',revenue:'Revenue',expense:'Operating expenses'};for(const row of e.rows){const control=document.querySelector('[aria-label="Statement line for account '+row.code+'"]');if(!control)throw Error('Missing mapping for '+row.code);Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(control,targets[row.type]);control.dispatchEvent(new Event('change',{bubbles:true}));}})()`);
      await clickButton('Save New Revision');
      await setPersona('reviewer');
      const mappingApproved = await browserTab!.evaluate<boolean>(`(() => {const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim().startsWith('Approve Revision v'));if(!b)return false;b.click();return true;})()`);
      assert.equal(mappingApproved, true);
      await setPersona('manager');
      await clickButton('Financial Packages');
      const disclosure = await browserTab!.evaluate<boolean>(`!!document.querySelector('input[aria-label="Disclosure title"]')&&!!document.querySelector('select[aria-label="Significant accounting policies applicability"]')`);
      assert.equal(disclosure, true, 'package configuration is exposed for this dynamically created engagement');
      await browserTab!.evaluate(`(() => {const a=document.querySelector('select[aria-label="Significant accounting policies applicability"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(a,'Not applicable');a.dispatchEvent(new Event('change',{bubbles:true}));const n=document.querySelector('[aria-label="Significant accounting policies not-applicable rationale"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(n,'No additional disclosure note is applicable in this demonstration.');n.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await clickButton('Save preparer draft');
      await setPersona('reviewer');
      await clickButton('Review independently');
      await setPersona('manager');
      const assemble = await browserTab!.evaluate<boolean>(`(() => {const b=[...document.querySelectorAll('button')].find(x=>x.innerText.includes('Assemble New Revision'));if(!b||b.disabled)return false;b.click();return true;})()`);
      assert.equal(assemble, true, 'validated package can be assembled from the manually created client journey');
      assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id===${JSON.stringify(engagementId)}).packageHistory?.some(p=>p.artifacts?.length===3)`), true);
      const outcome = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const e=s.engagements.find(x=>x.id===${JSON.stringify(engagementId)});return {client:e.client,lead:s.leads.find(x=>x.id===${JSON.stringify(leadId)}).convertedClientId,proposal:s.proposals.find(x=>x.id===${JSON.stringify(proposalId)}).state,job:s.jobs.find(x=>x.title==='AT52 Manually Entered Client Audit')?.engagementId,packageRevision:e.packageHistory.at(-1)?.revision,artifacts:e.packageHistory.at(-1)?.artifacts?.map(a=>({kind:a.kind,size:a.size,sha256:a.sha256}))};})()`);
      assert.equal(outcome.client, clientId);
      assert.equal(outcome.lead, clientId);
      assert.equal(outcome.proposal, 'Accepted');
      assert.equal(outcome.job, engagementId);
      assert.ok(outcome.packageRevision);
      assert.deepEqual(outcome.artifacts.map((a:any)=>a.kind).sort(), ['DOCX','PDF','XLSX']);
      assert.ok(outcome.artifacts.every((a:any)=>a.size>0&&/^[a-f0-9]{64}$/.test(a.sha256)));
      assert.deepEqual(browserTab!.exceptions, []);
    } finally {
      if (original) await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2', ${JSON.stringify(original)})`);
      else await browserTab!.evaluate(`localStorage.removeItem('ste-auditsphere-role-portals-v2')`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
    }
  });

  it('VP-012: suspends and resumes an engagement with reasoned persisted history', async () => {
    const original = await browserTab!.evaluate<string | null>(`localStorage.getItem('ste-auditsphere-role-portals-v2')`);
    try {
      await clickButtonStartingWith('Engagements');
      assert.equal(await waitForBrowser('document.body.innerText.includes("Engagement Portfolio")'), true);
      const engagementId = await browserTab!.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).selectedEngagement`);
      await clickButton('Edit Engagement Details');
      await browserTab!.evaluate(`(() => {const set=(label,value,kind='input')=>{const input=document.querySelector('[aria-label="'+label+'"]');if(!input)throw Error('Missing '+label);Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input),'value').set.call(input,value);input.dispatchEvent(new Event(kind,{bubbles:true}));};set('Engagement service','Annual accounts','change');set('Engagement reporting year','2027');set('Engagement reporting period','01 Jan – 31 Dec 2027');set('Engagement target date','2026-10-05');const label=[...document.querySelectorAll('.modal-backdrop label')].find(x=>x.innerText.includes('Nadia Rahman'));const checkbox=label?.querySelector('input[type=checkbox]');if(!checkbox)throw Error('Missing Nadia team assignment');checkbox.click();})()`);
      await clickButton('Save Engagement Details');
      assert.equal(await browserTab!.evaluate<boolean>(`(() => {const e=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id===${JSON.stringify(engagementId)});return e.service==='Annual accounts'&&e.year===2027&&e.period==='01 Jan – 31 Dec 2027'&&e.due==='2026-10-05'&&e.team.includes('Nadia Rahman')&&e.events.some(x=>x.text.includes('service, year, period, due, team'));})()`), true, 'service, period, due date and team edits persist with history');
      await browserTab!.evaluate(`window.prompt=()=> 'Temporary conflict review.'`);
      await clickButton('Suspend Engagement');
      assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id===${JSON.stringify(engagementId)}).lifecycleStatus==='Suspended'`), true);
      assert.match(await browserTab!.evaluate<string>('document.querySelector("main#main")?.innerText || document.body.innerText'), /Active → Suspended by Layla Rahman: Temporary conflict review/);
      await browserTab!.evaluate(`window.prompt=()=> 'Conflict review cleared.'`);
      await clickButton('Resume Engagement');
      assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id===${JSON.stringify(engagementId)}).lifecycleStatus==='Active'`), true);
      await browserTab!.evaluate(`window.prompt=()=> 'Client requested termination.'`);
      await clickButton('Cancel Engagement');
      assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id===${JSON.stringify(engagementId)}).lifecycleStatus==='Cancelled'`), true);
      assert.equal(await browserTab!.evaluate<boolean>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id===${JSON.stringify(engagementId)}).events.filter(e=>e.type==='lifecycle').length===3`), true);
      assert.deepEqual(browserTab!.exceptions, []);
    } finally {
      if (original) await browserTab!.evaluate(`localStorage.setItem('ste-auditsphere-role-portals-v2', ${JSON.stringify(original)})`);
      else await browserTab!.evaluate(`localStorage.removeItem('ste-auditsphere-role-portals-v2')`);
      await browserTab!.command('Page.reload');
      await waitForBrowser('!!document.querySelector("#app-root .brandname")');
    }
  });

  it('AT-03/VP-063: blocks external HTTP requests across the Chrome acceptance journeys', async () => {
    const cspBlocksExternalFetch = await browserTab!.evaluate<boolean>(`fetch('https://example.invalid/egress-probe').then(()=>false,()=>true)`);
    assert.equal(cspBlocksExternalFetch, true, 'the shipped CSP must reject external fetch at runtime');
    assert.deepEqual(browserTab!.blockedExternalRequests, [], 'the active app must not attempt requests to external providers');
    const remoteRequests = browserTab!.requests.filter(url => /^https?:/i.test(url) && new URL(url).origin !== baseUrl);
    assert.deepEqual(remoteRequests, [], 'no external HTTP request should reach the browser network layer');
  });
});
