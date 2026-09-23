# AuditSphere · All-role portals v2

AuditSphere is a source-grounded, browser-only visualization of the 14 roles in STE-PRD-001. It uses synthetic data only; there is no backend, live provider connection, authentication, or production authorization boundary.

## React + TypeScript + Vite

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Create a production build with:

```bash
npm run build
npm run preview
```

The Vite build is written to `dist-vite/` so the existing Cloudflare Pages artifact in `dist/` remains available while this migration is validated. `deploy.sh` builds and deploys the Vite output.

## Migration architecture

React owns the Vite entrypoint, typed data bootstrapping, runtime lifecycle, and static asset pipeline in `src/main.tsx`. The existing role portal renderer is loaded as one compatibility runtime from `app.bundle.js`; this preserves the complete local workflow, role switching, dialogs, uploads, and role-scoped guards while the screen templates are migrated incrementally into React components.

- `src/main.tsx`: React host and typed legacy-runtime bridge.
- `src/host.css`: React runtime loading/error state.
- `vite.config.ts`: Vite + React configuration with an isolated `dist-vite` output.
- `base-app.js` / `role-views.js`: existing imperative role portal behavior.
- `styles.css` / `roles.css`: existing responsive visual system, imported by Vite.
- `roles.json` / `permissions.json` / `source.json`: synthetic source and role data loaded through the typed entrypoint.

## Client file-request workflow

Auditors and accountants can create a client-facing file request from `Documents & PBC`. Each request captures a description, due date, recipient, simulated email preview, portal link, shared-file metadata, and a two-sided conversation timeline. Client administrator, finance contributor, and authorized signatory views expose the same request thread within their permitted client scope; the finance contributor can upload or replace a built-in synthetic sample through the portal and the engagement team can reply or review it.

Because this remains a browser-only prototype, email delivery is represented as a local preview and upload handling stores metadata plus a local hash only. No external email is sent and no document bytes leave or persist in the browser.

## Legacy compatibility build

The original dependency-free HTML build is still available for comparison or rollback:

```bash
py -3 build.py
```

It regenerates `app.bundle.js` and writes the standalone artifact to `legacy/index.html`; it no longer overwrites the Vite entrypoint. Validate the compatibility bundle with:

```bash
npm run legacy:check
```

## Scope and limitations

All synthetic state is inspectable in the browser and saved only in local storage when available. Uploads retain metadata and a local hash only; file bytes are not stored. The visualization does not implement production authentication, enforceable multi-user authorization, real Microsoft integrations, legal signatures, ledger postings, payments, filings, or immutable retention.

Current supported scope, exclusions and historical-source labelling: `docs/prototype/scope.md`. Inspected baseline inventory: `docs/prototype/baseline.md`. 39-module route/command/test map: `docs/prototype/module-coverage.md`. Presenter scenarios with fixed arithmetic: `docs/prototype/demo-scenarios.md`. Actually executed checks (never claimed in advance): `docs/prototype/verification.md`.

## Verification (VP-063)

```bash
npm ci
npm run build
npm run legacy:check
npm run test:unit   # deterministic calculations, guards, migrations, scope scan, TB parsing, export formats
npm run test:e2e    # serves dist/ on loopback; asserts shell boot, no provider egress, simulated surfaces
```

Microsoft 365 screens are local simulations (`liveConnected: false`); SharePoint is the canonical demo library, OneDrive import is optional and disabled by default, mail outcomes are simulated accepted/failed/unknown, and Microsoft Purview is not part of this product. Issued invoices, approvals and releases change local demo records only — no payment demand, signature, email delivery or external retention is performed.
