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
      await clickButton('Record response metadata');
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
});
