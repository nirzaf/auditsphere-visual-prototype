# AuditSphere · All-role portals v2

A source-grounded, dependency-free frontend visualization of the 14 roles in STE-PRD-001.

## Open
Open `index.html` in a modern browser. Choose a persona in the top-right **DEMO PERSONA — NOT A LOGIN** selector. The default is Engagement manager. **All 14 role views** opens the role directory. The play icon opens the cross-role walkthrough.

No provider login, paid package, backend or network connection is needed. Optional local hosting: run `python3 -m http.server 8080` inside this folder and open localhost on that port.

## Build
Run `python3 build.py`. The script embeds source.json, roles.json, permissions.json, CSS and JavaScript into one index.html. It also emits app.bundle.js for syntax checking.

- base-app.js: preserved original workflow demonstration with the v2 storage namespace and upload-context checks.
- role-views.js: role-specific screens, frontend activity policy, projections and local handoffs.
- roles.json: all 14 source roles, proposed views/features and explicit demo scope.
- permissions.json: 44 proposed activity families and their conditions.
- styles.css / roles.css: shared and role-specific styling.
- source.json: the user-supplied PRD as read-only reference; original DOCX SHA-256 is recorded.
- ROLE_GUIDE.md: features, privileges, restrictions, handoffs and limitations.

## Validate
`node --check app.bundle.js`

The optional test script requires Playwright for Python and an installed Chromium. Set `CHROMIUM_PATH` to its executable when different from `/usr/bin/chromium`; then run `python3 test_roles.py`. Tests use in-memory document rendering. `test-results.json` identifies the tested HTML hash and limits.

## Important limits
This is NOT the AuditSphere production repository, not a backend, and not authentication/authorization. All synthetic state and role definitions remain inspectable by anyone who has the HTML. Menu filtering and browser checks are not a security boundary. There are no real Microsoft connections, screening lookups, documents stored at a provider, legal signatures, ledger postings, emails, money movement, filings or immutable archives. Uploads retain metadata/hash only, not original document bytes.

Production requires the source specification's individual authority, scope checks, server-side gates and independent acceptance. Features listed in the role guide are source responsibilities/proposed design; representative frontend interactions do not implement every service or policy.

No original Google document, repository or earlier prototype was modified. The v2 storage namespace is separate. Use synthetic data only.
