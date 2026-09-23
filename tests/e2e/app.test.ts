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
import { calculateReceivablesAging } from '../../src/services/calculations.js';
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
  readonly exceptions: string[] = [];

  constructor(private ws: WebSocket) {
    ws.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (message.method === 'Network.requestWillBeSent') this.requests.push(message.params.request.url);
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
  browserTab = new CdpTab(ws);
  await browserTab.command('Page.enable');
  await browserTab.command('Runtime.enable');
  await browserTab.command('Network.enable');
  await browserTab.command('Page.navigate', { url: baseUrl });
  const ready = await waitForBrowser('document.querySelector("#app-root .brandname")?.innerText.includes("Audit")');
  assert.equal(ready, true, 'React shell did not render in Chrome');
});

after(async () => {
  browserTab?.close();
  if (chrome && chrome.exitCode === null) chrome.kill('SIGTERM');
  if (chrome) await new Promise<void>(resolve => chrome!.once('exit', () => resolve()));
  if (profileDir) rmSync(profileDir, { recursive: true, force: true });
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
    const egressHosts = [
      'graph.microsoft.com', 'login.microsoftonline.com', 'outlook.office',
      'api.stripe.com', 'paypal.com', 'openai.com', 'api.anthropic.com'
    ];
    for (const host of egressHosts) {
      assert.equal(html.includes(host), false, `entrypoint references external host ${host}`);
    }
  });

  it('AT-15/25: static shell references the simulated M365 + portal surfaces', async () => {
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

describe('actual Chrome browser acceptance', () => {
  it('AT-01/03/04: renders the app, keeps controls local, and presents scope disclosures', async () => {
    assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /SIMULATED IDENTITY \(NOT LIVE AUTH\)/);
    assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /Synthetic records\. No live external integrations/);
    assert.deepEqual(browserTab!.exceptions, []);
    assert.ok(browserTab!.requests.length > 0, 'Chrome should request same-origin app assets');
    const external = browserTab!.requests.filter(url => !url.startsWith(baseUrl));
    assert.deepEqual(external, [], `unexpected browser egress: ${external.join(', ')}`);
  });

  it('AT-15/16: saves a per-capability M365 simulation and retains it on reload', async () => {
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
  });

  it('AT-18/25/53: switches to a client persona and exposes only the portal', async () => {
    const changed = await browserTab!.evaluate<boolean>(`(() => {
      const select = document.querySelector("#role-select");
      const option = [...select.options].find(x => x.textContent.includes("Finance contributor"));
      if (!option) return false;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(select, option.value);
      select.dispatchEvent(new Event("change", { bubbles: true })); return true;
    })()`);
    assert.equal(changed, true, 'client persona option should exist');
    assert.equal(await waitForBrowser('document.querySelector("nav button")?.innerText.includes("Client Experience Portal")'), true);
    const nav = await browserTab!.evaluate<string[]>('[...document.querySelectorAll("nav button")].map(x => x.innerText.trim())');
    assert.deepEqual(nav, ['Client Experience Portal', 'Specifications & PRD']);
    assert.equal(browserTab!.exceptions.length, 0);
  });

  it('AT-17/18: keeps identity mapping separate from a reviewed scoped access grant', async () => {
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
    await clickButton('Record approved grant');
    assert.equal(await browserTab!.evaluate<boolean>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).roleGrants.some(g=>g.userId==='client' && g.scopeKind==='Client' && g.scopeId==='CL-002')`), true, 'management approver receives only the explicitly approved client scope');
    await clickButton('Access History (2)');
    assert.equal(await waitForBrowser(`document.body.innerText.includes('Approved scoped access request')&&document.body.innerText.includes('Mona Khalil')`), true, 'grant events retain approver, target and recorded reason');
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
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('VP-051: selects scoped population items and persists substantive test exceptions', async () => {
    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');const o=[...s.options].find(x=>x.textContent.includes('Audit preparer'));if(!o)throw Error('Preparer persona missing');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentRole === 'preparer'`), true);
    await browserTab!.evaluate(`(() => {const r=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim()==='Sampling & Populations');if(!r)throw Error('Sampling route missing');r.click();})()`);
    assert.equal(await waitForBrowser('document.body.innerText.includes("Substantive Sampling & Population Testing")'), true);
    assert.equal(await browserTab!.evaluate<boolean>(`document.querySelector('[data-sample-item="SAMP-01"] input[type=checkbox]')?.disabled`), true, 'seed excerpt cannot be represented as a complete sampling frame');
    await browserTab!.evaluate(`(() => {const i=document.querySelector('[aria-label="Import population source CSV or XLSX"]');const d=new DataTransfer();d.items.add(new File(['itemRef,date,counterparty,amount,description\\nNEW-1,2026-09-20,Customer One,100,Invoice one\\nNEW-2,2026-09-21,Customer Two,200,Invoice two'],'population.csv',{type:'text/csv'}));i.files=d.files;i.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`(() => {const p=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).samplePopulations[0];return p.sourceRevision===2&&p.sourceComplete&&p.totalPopulationCount===2&&p.totalPopulationValue===300;})()`), true, 'CSV source replaces the population with reconciled totals');
    const amountSet = await browserTab!.evaluate<boolean>(`(() => {const row=document.querySelector('[data-sample-item="SAMP-IMPORT-1"]');const checkbox=row?.querySelector('input[type=checkbox]');if(!checkbox)return false;checkbox.click();const input=row.querySelector('[data-audited-amount]');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(input,'90');input.dispatchEvent(new Event('input',{bubbles:true}));const note=row.querySelector('[data-test-notes]');const setNote=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;setNote.call(note,'Vouched to confirmation; QAR 10 shortfall requires follow-up.');note.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
    assert.equal(amountSet, true);
    const record = await browserTab!.evaluate<boolean>(`(() => {const row=document.querySelector('[data-sample-item="SAMP-IMPORT-1"]');const b=[...row.querySelectorAll('button')].find(x=>x.innerText.trim()==='Record test');if(!b)return false;b.click();return true;})()`);
    assert.equal(record, true);
    assert.equal(await waitForBrowser(`(() => {const i=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).samplePopulations[0].items.find(x=>x.id==='SAMP-IMPORT-1');return i.tested&&i.selected&&i.result==='Exception noted'&&i.difference===-10&&i.notes.includes('QAR 10 shortfall');})()`), true, 'test amount, exception and notes persist');
    await browserTab!.evaluate(`(() => {const i=document.querySelector('[aria-label="Import population source CSV or XLSX"]');const d=new DataTransfer();d.items.add(new File(['itemRef,date,counterparty,amount\\nNEW-3,2026-09-22,Customer Three,250'],'replacement.csv',{type:'text/csv'}));i.files=d.files;i.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`(() => {const p=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).samplePopulations[0];return p.sourceRevision===3&&p.totalPopulationCount===1&&p.totalPopulationValue===250&&p.selectedCount===0;})()`), true, 'source replacement starts with a clean sample selection');
    const imported = await browserTab!.evaluate<any>(`(() => {const p=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).samplePopulations[0];return {sha:p.sourceSha256,history:p.sourceHistory,items:p.items,selectedCount:p.selectedCount};})()`);
    assert.match(imported.sha, /^[a-f0-9]{64}$/);
    assert.equal(imported.history[1].items.find((i: any) => i.id==='SAMP-IMPORT-1').difference, -10, 'replacement retains exact prior sample work');
    assert.equal(imported.selectedCount, 0);
    assert.ok(imported.items.every((i: any) => !i.selected && !i.tested), 'new source requires fresh manual selection and testing');
    await browserTab!.evaluate(`(() => {const i=document.querySelector('[aria-label="Import population source CSV or XLSX"]');const d=new DataTransfer();d.items.add(new File(['reference,date,customer,value\\nDUP,2026-09-20,C,5\\nDUP,2026-09-21,C,6'],'duplicate.csv',{type:'text/csv'}));i.files=d.files;i.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser(`document.querySelector('[role=status]')?.innerText.includes('duplicated')`), true, 'invalid replacement reports duplicate references');
    assert.equal(await browserTab!.evaluate<number>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).samplePopulations[0].sourceRevision`), 3, 'invalid file cannot replace the current source');
    await browserTab!.command('Page.reload');
    assert.equal(await waitForBrowser('!!document.querySelector("#app-root .brandname")'), true);
    await browserTab!.evaluate(`(() => {const r=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim()==='Sampling & Populations');r.click();})()`);
    assert.equal(await waitForBrowser(`(() => {const p=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).samplePopulations[0];return p.sourceRevision===3&&p.sourceSha256===${JSON.stringify(imported.sha)}&&document.body.innerText.includes('Previous source revisions (2)');})()`), true, 'current and prior source identities remain visible after reload');
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
    await clickButton('Risks & Audit Programs');
    await clickButton('Identified Risk Register (3)');
    const opened = await browserTab!.evaluate<boolean>(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(r=>r.innerText.includes('RSK-01'));const button=[...(row?.querySelectorAll('button')||[])].find(b=>b.innerText==='Edit risk');if(!button)return false;button.click();return true;})()`);
    assert.equal(opened, true);
    await browserTab!.evaluate(`(() => {const panel=[...document.querySelectorAll('.panel')].find(p=>p.querySelector('h3')?.innerText==='Edit RSK-01');const response=panel?.querySelectorAll('textarea')[2];const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(response,'Independent confirmations plus year-end cut-off tests.');response.dispatchEvent(new Event('input',{bubbles:true}));const label=[...panel.querySelectorAll('label')].find(l=>l.innerText.includes('PRC-03'));const checkbox=label?.querySelector('input[type=checkbox]');if(!checkbox)throw new Error('PRC-03 risk link control unavailable');checkbox.click();})()`);
    await clickButton('Save assessed risk');
    assert.equal(await waitForBrowser(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const r=s.auditRisks.find(x=>x.id==='RSK-01');const p=s.auditPrograms.flatMap(x=>x.procedures).find(x=>x.id==='PRC-03');return r.response.includes('Independent confirmations')&&r.linkedProcedureIds.includes('PRC-03')&&p.linkedRiskIds.includes('RSK-01');})()`), true, 'risk edit and both sides of the procedure link persist');
    await browserTab!.command('Page.reload');
    assert.equal(await waitForBrowser('!!document.querySelector("#app-root .brandname")'), true);
    await clickButton('Risks & Audit Programs');
    await clickButton('Identified Risk Register (3)');
    assert.equal(await waitForBrowser(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(r=>r.innerText.includes('RSK-01'));return !!row&&row.innerText.includes('Independent confirmations')&&row.innerText.includes('PRC-03');})()`), true, 'risk response and link remain visible after reload');
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('AT-05/06: creates a client, primary contact, typed value and non-authorizing relationship group', async () => {
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
    await clickButton('Save Contact');
    const contact = await browserTab!.evaluate<any>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).contacts.find(c=>c.name==='Nora Secondary')`);
    assert.equal(contact.clientId, clientId);
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

  it('AT-07/08: registers an opportunity, drafts a proposal and presents only after independent review', async () => {
    const setPersona = async (name: string) => browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');const o=[...s.options].find(x=>x.textContent.includes(${JSON.stringify(name)}));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const setLabel = async (label: string, value: string, tag = 'input') => browserTab!.evaluate(`(() => {const l=[...document.querySelectorAll('.modal-backdrop label')].find(x=>x.textContent.includes(${JSON.stringify(label)}));const e=l?.querySelector(${JSON.stringify(tag)})||l?.parentElement?.querySelector(${JSON.stringify(tag)});if(!e)throw Error('Missing '+${JSON.stringify(label)});const p=Object.getOwnPropertyDescriptor(${tag === 'textarea' ? 'HTMLTextAreaElement' : 'HTMLInputElement'}.prototype,'value').set;p.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await setPersona('Relationship owner');
    await browserTab!.evaluate(`(() => {const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().startsWith('Acquisition & Pipeline'));if(!b)throw Error('Missing acquisition route');b.click();})()`);
    await clickButton('New Inquiry');
    await setLabel('Prospective Client Name', 'AT07 Journey Opportunity');
    await setLabel('Primary Contact', 'Nora Opportunity');
    await clickButton('Register Inquiry');
    const leadId = await browserTab!.evaluate<string>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).leads.find(l=>l.name==='AT07 Journey Opportunity')?.id`);
    assert.ok(leadId);
    const openLead = async (name: string) => browserTab!.evaluate(`(() => {const card=[...document.querySelectorAll('.lead-card')].find(x=>x.innerText.includes(${JSON.stringify(name)}));const b=[...(card?.querySelectorAll('button')||[])].find(x=>x.innerText.trim()==='Details');if(!b)throw Error('Missing lead '+${JSON.stringify(name)});b.click();})()`);
    const setLeadStage = async (stage: string) => browserTab!.evaluate(`(() => {const s=document.querySelector('.modal-backdrop select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(stage)});s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
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
    await clickButton('✕');
    await browserTab!.evaluate(`(() => {const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().startsWith('Proposals & Terms'));if(!b)throw Error('Missing proposals route');b.click();})()`);
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

  it('AT-11/12: blocks parent completion until subtasks finish and records an actual task reassignment', async () => {
    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');const o=[...s.options].find(x=>x.textContent.includes('Engagement manager'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await browserTab!.evaluate(`(() => {const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().startsWith('Jobs & Tasks'));if(!b)throw Error('Missing jobs route');b.click();})()`);
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
    await browserTab!.evaluate(`(() => {const t=document.querySelector('.modal-backdrop textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'AT14 staff-only coordination note.');t.dispatchEvent(new Event('input',{bubbles:true}));t.dispatchEvent(new Event('change',{bubbles:true}));const s=document.querySelector('.modal-backdrop select[multiple]');const o=[...s.options].find(x=>x.textContent.includes('Daniel James'));if(!o)throw Error('No authorized staff mention option');o.selected=true;s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await clickButton('Save Internal Note');
    const comment = await browserTab!.evaluate<any>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).comments.find(c=>c.text==='AT14 staff-only coordination note.')`);
    assert.ok(comment);
    assert.equal(comment.visibility, 'internal');
    assert.equal(comment.mentions.length, 1);
    assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /AT14 staff-only coordination note/);
    await clickButton('Edit');
    await browserTab!.evaluate(`(() => {const t=document.querySelector('.modal-backdrop textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'AT14 revised staff-only coordination note.');t.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await clickButton('Save Note Changes');
    const editedComment = await browserTab!.evaluate<any>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).comments.find(c=>c.id===${JSON.stringify(comment.id)})`);
    assert.equal(editedComment.editedBy, comment.author);
    assert.ok(editedComment.editedAt);
    assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /AT14 revised staff-only coordination note/);
    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');const o=[...s.options].find(x=>x.textContent.includes('Management approver'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const clientView = await browserTab!.evaluate<string>('document.body.innerText');
    assert.match(clientView, /CLIENT SECURE PORTAL/);
    assert.doesNotMatch(clientView, /AT14 revised staff-only coordination note/);
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('AT-27: logs a received meeting note manually and keeps the internal record out of the client portal', async () => {
    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');const o=[...s.options].find(x=>x.textContent.includes('Engagement manager'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().startsWith('Team & Client Comms'));if(!b)throw Error('Missing communications route');b.click();})()`);
    await clickButton('Log Call / Meeting Note');
    const setNoteField = async (label: string, value: string) => browserTab!.evaluate(`(() => {const l=[...document.querySelectorAll('.modal-backdrop label')].find(x=>x.textContent.includes(${JSON.stringify(label)}));const e=l?.parentElement?.querySelector('input,textarea');if(!e)throw Error('Missing '+${JSON.stringify(label)});const p=e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await setNoteField('Summary Header', 'AT27 Received meeting note');
    await setNoteField('Discussion Notes', 'Client confirmed the inventory count date.',);
    await clickButton('Save Note');
    const saved = await browserTab!.evaluate<any>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).communications.find(c=>c.summary==='AT27 Received meeting note')`);
    assert.equal(saved.direction, 'Inbound');
    assert.equal(saved.visibility, 'Internal');
    assert.equal(saved.body, 'Client confirmed the inventory count date.');
    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');const o=[...s.options].find(x=>x.textContent.includes('Management approver'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await clickButton('Messages & Mail');
    assert.doesNotMatch(await browserTab!.evaluate<string>('document.body.innerText'), /AT27 Received meeting note|Client confirmed the inventory count date/);
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('AT-26: resolves a mail template and records accepted, failed, and unknown outcomes locally', async () => {
    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');const o=[...s.options].find(x=>x.textContent.includes('Engagement manager'));Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().startsWith('Team & Client Comms'));if(!b)throw Error('Missing communications route');b.click();})()`);
    const initialCount = await browserTab!.evaluate<number>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).communications.length`);
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
    const stateAfter = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return {old:s.documents.find(d=>d.id==='DOC-002'),next:s.documents.find(d=>d.supersedesDocumentId==='DOC-002'),evidence:s.evidenceCatalogue.find(e=>e.id==='EVD-01')};})()`);
    assert.equal(stateAfter.old.version, 1);
    assert.equal(stateAfter.next.version, 2);
    assert.equal(stateAfter.evidence.documentId, 'DOC-002');
    assert.equal(stateAfter.evidence.version, 1);
    await browserTab!.evaluate(`(() => {const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().startsWith('Evidence Catalogue'));if(!b)throw Error('Evidence Catalogue navigation missing');b.click();})()`);
    const evidenceView = await browserTab!.evaluate<string>('document.body.innerText');
    assert.match(evidenceView, /Pinned v1/);
    assert.match(evidenceView, /Newer version available/);
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

  it('VP-031: requires independent invoice and credit review before issue', async () => {
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
    await setPersona('manager');
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
    const clientUserId = await browserTab!.evaluate<string>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));return s.users.find(u=>u.label==='Management approver').id;})()`);
    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(clientUserId)});s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    assert.equal(await waitForBrowser('JSON.parse(localStorage.getItem("ste-auditsphere-role-portals-v2")).currentRole==="client"'), true, 'client persona must be active before search');
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
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('AT-32/VP-032: records, allocates and reverses an offline receipt with a reason', async () => {
    await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'billing');s.dispatchEvent(new Event('change',{bubbles:true}));const b=[...document.querySelectorAll('nav button')].find(x=>x.innerText.trim().startsWith('Receivables & Receipts'));if(!b)throw Error('Receivables navigation is missing');b.click();})()`);
    await clickButton('Record Offline Receipt');
    await browserTab!.evaluate(`(() => {const set=(label,value)=>{const l=[...document.querySelectorAll('.modal-backdrop label')].find(x=>x.textContent.includes(label));const f=l?.parentElement?.querySelector('input');if(!f)throw Error('Missing receipt field '+label);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(f,value);f.dispatchEvent(new Event('input',{bubbles:true}));f.dispatchEvent(new Event('change',{bubbles:true}));};set('Receipt Number','RCP-AT32');set('Amount (QAR)','50000');set('Bank Reference / Cheque No.','AT32-BANK-REF');})()`);
    await clickButton('Record Receipt');
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).receipts.some(r=>r.receiptNumber==='RCP-AT32'&&r.allocatedAmount===0)`), true);
    const openAllocation = await browserTab!.evaluate<boolean>(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes('RCP-AT32'));const b=[...(row?.querySelectorAll('button')||[])].find(x=>x.innerText.trim()==='Allocate to Invoice');if(!b)return false;b.click();return true;})()`);
    assert.equal(openAllocation,true);
    const invoiceBefore = await browserTab!.evaluate<number>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const select=document.querySelector('.modal-backdrop select');const invoice=s.invoices.find(i=>i.id===select.value);const allocated=s.receipts.flatMap(r=>r.allocations).filter(a=>a.invoiceId===invoice.id&&!a.reversed).reduce((sum,a)=>sum+a.amount,0);return Math.max(invoice.paid||0,allocated);})()`);
    await clickButton('Apply Allocation');
    const afterAllocation = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const r=s.receipts.find(x=>x.receiptNumber==='RCP-AT32');const a=r.allocations[0];return {receipt:r,allocation:a,invoice:s.invoices.find(x=>x.id===a.invoiceId)};})()`);
    assert.equal(afterAllocation.allocation.amount,50000);
    assert.equal(afterAllocation.receipt.allocatedAmount,50000);
    assert.equal(afterAllocation.invoice.paid,invoiceBefore+50000);

    const beginReverse = browserTab!.evaluate<boolean>(`(() => {const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='Reverse Allocation');if(!b)return false;b.click();return true;})()`);
    await new Promise(resolve=>setTimeout(resolve,50));
    await browserTab!.command('Page.handleJavaScriptDialog',{accept:true,promptText:'AT32 bank allocation correction'});
    assert.equal(await beginReverse,true);
    const reversed = await browserTab!.evaluate<any>(`(() => {const s=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2'));const r=s.receipts.find(x=>x.receiptNumber==='RCP-AT32');const a=r.allocations[0];return {receipt:r,allocation:a,invoice:s.invoices.find(x=>x.id===a.invoiceId)};})()`);
    assert.equal(reversed.allocation.reversed,true);
    assert.equal(reversed.allocation.reversalReason,'AT32 bank allocation correction');
    assert.equal(reversed.receipt.allocatedAmount,0);
    assert.equal(reversed.invoice.paid,invoiceBefore);
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

  it('VP-047: records independent acceptance and creates a clean next-period draft', async () => {
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
      return { priorRows: prior?.rows?.length, evidenceRefs: Object.keys(priorCase?.screeningEvidence || {}).length, continuedTo: priorCase?.continuedToEngagementId, draftId: draft?.id, acceptance: draft?.acceptance, terms: draft?.terms, rows: draft?.rows?.length, sourceHistory: draft?.sourceHistory?.length, jobs: jobs.length, tasks: state.jobTasks.filter(t => jobIds.has(t.jobId)).length, documents: documentIds.size, linkedEvidence: state.evidenceCatalogue.filter(e => documentIds.has(e.documentId)).length, findings: state.findings.filter(f => f.engagementId === draft?.id).length, workpapers: draft?.workpapers?.length, reviews: draft?.reviews?.length, packages: draft?.packageHistory?.length, releases: draft?.releases?.length, approvals: Object.values(draft?.approvals || {}).filter(Boolean).length, approvalHistory: draft?.approvalHistory?.length, reconciliations: draft?.reconciliations?.length, pbc: draft?.pbc?.length, events: draft?.events?.length };
    })()`);
    assert.ok(persisted.priorRows > 0, 'prior period source rows remain intact');
    assert.equal(persisted.continuedTo, 'ENG-CONT-CL-001-2027');
    assert.equal(persisted.evidenceRefs, 5);
    assert.equal(persisted.draftId, 'ENG-CONT-CL-001-2027');
    assert.equal(persisted.acceptance, false);
    assert.equal(persisted.terms, false);
    for (const field of ['rows', 'sourceHistory', 'jobs', 'tasks', 'documents', 'linkedEvidence', 'findings', 'workpapers', 'reviews', 'packages', 'releases', 'approvals', 'approvalHistory', 'reconciliations', 'pbc']) assert.equal(persisted[field], 0, `${field} must start empty`);
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('AT-41/42/48: saves exact generated package artifacts and verifies them after reload', async () => {
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
    await clickButton('Financial Packages');
    assert.equal(await waitForBrowser('document.body.innerText.includes("Financial Reporting Packages")'), true);
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
      return { revision: pack.revision, sourceVersion: pack.sourceVersion, mappingRevision: pack.mappingRevision, validation: pack.validation.passed, files };
    })()`);
    assert.equal(persisted.revision, 2);
    assert.equal(persisted.sourceVersion, persisted.mappingRevision);
    assert.equal(persisted.validation, true);
    assert.deepEqual(persisted.files.map((f: any) => f.kind).sort(), ['DOCX', 'PDF', 'XLSX']);
    for (const file of persisted.files) {
      assert.ok(file.size > 0);
      assert.equal(file.sha256, file.expected, `${file.kind} digest must match saved package metadata`);
    }
    await browserTab!.command('Page.reload');
    assert.equal(await waitForBrowser('!!document.querySelector("#app-root .brandname")'), true);
    await clickButton('Financial Packages');
    assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /Saved Revision 2 · Validated/);

    await clickButton('Sign-offs & EQR');
    await clickButton('Sign Off as Manager (Layla Rahman)');
    await browserTab!.evaluate(`(() => {
      const role = document.querySelector('#role-select');
      const option = [...role.options].find(o => o.textContent.includes('Management approver'));
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(role, option.value);
      role.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    assert.equal(await waitForBrowser('JSON.parse(localStorage.getItem("ste-auditsphere-role-portals-v2")).currentRole === "client"'), true);
    await browserTab!.evaluate(`(() => {
      const client = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'CL-002'));
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(client, 'CL-002');
      client.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    assert.equal(await waitForBrowser('document.body.innerText.includes("Northstar Services") && [...document.querySelectorAll("select")].some(s=>s.value==="ENG-26002") && [...document.querySelectorAll("select")].some(s=>s.value==="CL-002")'), true, 'client can switch only to explicitly granted entity and engagement');
    await clickButton('Management Approvals');
    await clickButton('Record Representation Receipt');
    assert.equal(await browserTab!.evaluate<boolean>(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26002').approvals.client?.generation === 2`), true);
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
    assert.equal(approvals.manager.generation, persisted.revision);
    assert.equal(approvals.client.generation, persisted.revision);
    assert.equal(approvals.partner.generation, persisted.revision);

    await clickButton('Release & Completion');
    await clickButton('Freeze Release Candidate (Generation 2)');
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

    await clickButton('Re-open for Amendment');
    await browserTab!.evaluate('document.querySelector(".modal textarea").focus()');
    await browserTab!.command('Input.insertText', { text: 'Correct subsequent-event disclosure before final issue.' });
    await clickButton('Confirm Amendment');
    const reopened = await browserTab!.evaluate<any>(`(() => {const e=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(x=>x.id==='ENG-26002');return {generation:e.generation,packageRevision:e.packageRevision,candidate:e.candidate,approvals:e.approvals,release:e.releases[0]};})()`);
    assert.equal(reopened.generation, 3);
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
    assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /Not specified/);
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('AT-49/60: validates every practice report, client scoping, and exported CSV rows', async () => {
    await clickButton('Report Centre');
    assert.equal(await waitForBrowser('!!document.querySelector("#practice-report")'), true);
    await browserTab!.evaluate(`(() => { URL.createObjectURL = blob => { window.__reportCsv = blob; return 'blob:report-test'; }; })()`);
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
      assert.ok(csv.split('\n')[0].split(',').length >= 4, `${report.label} export should include report columns`);
      const sourceState = await browserTab!.evaluate<any>('JSON.parse(localStorage.getItem("ste-auditsphere-role-portals-v2"))');
      const visibleClients = visibleClientIds(sourceState);
      const visibleEngagements = visibleEngagementIds(sourceState);
      const clients = sourceState.clients.filter((item: any) => visibleClients === 'ALL' || visibleClients.includes(item.id));
      const engagements = sourceState.engagements.filter((item: any) => (visibleEngagements === 'ALL' || visibleEngagements.includes(item.id)) && (visibleClients === 'ALL' || visibleClients.includes(item.client)));
      const engagementIds = new Set(engagements.map((item: any) => item.id));
      const jobs = sourceState.jobs.filter((item: any) => engagementIds.has(item.engagementId));
      const jobIds = new Set(jobs.map((item: any) => item.id));
      const invoices = sourceState.invoices.filter((item: any) => item.engagementId && engagementIds.has(item.engagementId));
      const invoiceIds = new Set(invoices.map((item: any) => item.id));
      const clientIds = new Set(clients.map((item: any) => item.id));
      const credits = sourceState.creditNotes.filter((item: any) => invoiceIds.has(item.invoiceId) && clientIds.has(item.clientId));
      const receipts = sourceState.receipts.filter((item: any) => clientIds.has(item.clientId));
      const aging = calculateReceivablesAging(invoices, credits, receipts, sourceState.asOfDate);
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
      let records = 1;
      let quoted = false;
      for (let i = 0; i < csv.length; i++) {
        if (csv[i] === '"' && csv[i + 1] === '"' && quoted) { i++; continue; }
        if (csv[i] === '"') quoted = !quoted;
        else if (csv[i] === '\n' && !quoted) records++;
      }
      assert.equal(records - 1, expectedRows[report.value], `${report.label} CSV row count should reconcile to current source records`);
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
    assert.equal(browserTab!.exceptions.length, 0);
  });

  it('AT-43/44/45: reviews pinned consolidation snapshots and approved eliminations without changing source TBs', async () => {
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
    assert.match(await browserTab!.evaluate<string>('document.body.innerText'), /Stored group rates translate the pinned component snapshots/);
    const sourceAfter = await browserTab!.evaluate<string>(`JSON.stringify(['ENG-26001','ENG-26002'].map(id => { const e=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(x=>x.id===id); return {id, rows:e.rows, sourceVersion:e.sourceVersion}; }))`);
    assert.equal(sourceAfter, sourceBefore, 'consolidation review must not mutate component trial balances');
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('AT-35: rejects an unbalanced TB import then preserves the accepted source revision on replacement', async () => {
    const before = await browserTab!.evaluate<any>(`(() => {const e=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(x=>x.id==='ENG-26002');return {version:e.sourceVersion,rows:e.rows,history:e.sourceHistory};})()`);
    await clickButton('Accounting Workbench');
    assert.equal(await waitForBrowser('document.body.innerText.includes("Trial-Balance Intake")'), true);
    const file = (name: string, contents: string) => `(() => {
      const input=document.querySelector('input[type=file]'); const transfer=new DataTransfer();
      transfer.items.add(new File([${JSON.stringify(contents)}],${JSON.stringify(name)},{type:'text/csv'}));
      input.files=transfer.files; input.dispatchEvent(new Event('change',{bubbles:true}));
    })()`;
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
    assert.equal(await waitForBrowser('document.body.innerText.includes("Preview ready: 2 rows, net 0.00")'), true);
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
      const input=document.querySelector('input[type=file]'); const transfer=new DataTransfer();
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
    assert.deepEqual(browserTab!.exceptions, []);
  });

  it('AT-23/24: creates a PBC request, receives a replacement after clarification, then accepts it independently', async () => {
    const switchPersona = async (label: string, role: string) => {
      await browserTab!.evaluate(`(() => {const s=document.querySelector('#role-select');const o=[...s.options].find(x=>x.textContent.includes(${JSON.stringify(label)}));if(!o)throw Error('Missing persona: '+${JSON.stringify(label)});Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).currentRole === ${JSON.stringify(role)}`), true);
      assert.equal(await waitForBrowser(role === 'client' ? 'document.body.innerText.includes("Client Experience Portal")' : 'document.body.innerText.includes("Client Portfolio")'), true);
      if (role === 'client') {
        await browserTab!.evaluate(`(() => {const s=[...document.querySelectorAll('select')].find(x=>[...x.options].some(o=>o.value==='CL-002'));if(!s)throw Error('Client entity selector missing');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'CL-002');s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
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
    const formReady = await browserTab!.evaluate<boolean>(`(() => {const f=[...document.querySelectorAll('form')].find(x=>x.innerText.includes('Client recipient'));if(!f)return false;const inputs=f.querySelectorAll('input');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(inputs[0],'Updated fixed-asset register');inputs[0].dispatchEvent(new Event('input',{bubbles:true}));inputs[0].dispatchEvent(new Event('change',{bubbles:true}));setter.call(inputs[3],'Omar Nasser');inputs[3].dispatchEvent(new Event('input',{bubbles:true}));inputs[3].dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
    assert.equal(formReady, true);
    await clickButton('Save Draft Request');
    const created = await browserTab!.evaluate<any>(`(() => {const e=JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(x=>x.id==='ENG-26002');return e.pbc.find(x=>x.title==='Updated fixed-asset register');})()`);
    assert.ok(created?.id);
    assert.equal(created.status, 'Draft');
    await switchPersona('Management approver', 'client');
    await openPortalRequests();
    assert.doesNotMatch(await browserTab!.evaluate<string>('document.body.innerText'), /Updated fixed-asset register/,'draft PBC must remain hidden from the client');

    await switchPersona('Engagement manager', 'manager');
    await openNorthstarWorkspace();
    const present = await browserTab!.evaluate<boolean>(`(() => {const row=[...document.querySelectorAll('tbody tr')].find(x=>x.innerText.includes(${JSON.stringify(created.id)}));const b=[...(row?.querySelectorAll('button')||[])].find(x=>x.innerText.trim()==='Present request');if(!b)return false;b.click();return true;})()`);
    assert.equal(present, true);
    assert.equal(await waitForBrowser(`JSON.parse(localStorage.getItem('ste-auditsphere-role-portals-v2')).engagements.find(e=>e.id==='ENG-26002').pbc.find(p=>p.id===${JSON.stringify(created.id)}).status === 'Requested'`), true);

    await switchPersona('Management approver', 'client');
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

    await switchPersona('Management approver', 'client');
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

  it('AT-38/40: includes an accepted unreflected adjustment in the financial statements', async () => {
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
    await clickButton(assembleLabel);
    assert.equal(await waitForBrowser('document.body.innerText.includes("saved with exact XLSX, DOCX and PDF files")'), true);
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

  it('AT-02/54: preserves conflicts and reports browser-storage failure without silent overwrite', async () => {
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
});
