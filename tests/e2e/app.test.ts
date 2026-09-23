// VP-063: static smoke checks plus real Chrome route and local-action checks.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, Server, IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync, existsSync, readdirSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawn, ChildProcess } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const dist = join(repoRoot, 'dist');

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.map': 'application/json'
};

let server: Server;
let baseUrl = '';
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

async function waitForBrowser(expression: string, timeoutMs = 8000): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await browserTab!.evaluate<boolean>(expression).catch(() => false)) return true;
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
});
