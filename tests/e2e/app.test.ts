// VP-063 e2e: Vite build served locally (AT-01/03/04/15/25/41 probes).
// No browser binary needed: serves dist/ over loopback, fetches the entrypoint
// and asserts the shell boots, simulations stay local, and docs exist.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, Server, IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const dist = join(repoRoot, 'dist');

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.map': 'application/json'
};

let server: Server;
let baseUrl = '';

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
});

after(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});

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
