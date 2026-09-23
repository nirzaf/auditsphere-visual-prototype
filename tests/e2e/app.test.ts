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
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'JavaScript evaluation failed');
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
      return { priorRows: prior?.rows?.length, continuedTo: priorCase?.continuedToEngagementId, draftId: draft?.id, acceptance: draft?.acceptance, terms: draft?.terms, rows: draft?.rows?.length, sourceHistory: draft?.sourceHistory?.length, jobs: jobs.length, tasks: state.jobTasks.filter(t => jobIds.has(t.jobId)).length, documents: documentIds.size, linkedEvidence: state.evidenceCatalogue.filter(e => documentIds.has(e.documentId)).length, findings: state.findings.filter(f => f.engagementId === draft?.id).length, workpapers: draft?.workpapers?.length, reviews: draft?.reviews?.length, packages: draft?.packageHistory?.length, releases: draft?.releases?.length, approvals: Object.values(draft?.approvals || {}).filter(Boolean).length, approvalHistory: draft?.approvalHistory?.length, reconciliations: draft?.reconciliations?.length, pbc: draft?.pbc?.length, events: draft?.events?.length };
    })()`);
    assert.ok(persisted.priorRows > 0, 'prior period source rows remain intact');
    assert.equal(persisted.continuedTo, 'ENG-CONT-CL-001-2027');
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
});
