# Developer reference — 17 September 2026

The public developer page is `/developers/`; `/openapi.json` describes the beta
REST contract rather than a commercial opening. The canonical domain serves the
application. Only the separate fictional preview at
`guteneo-preview.nclsppr.workers.dev` refuses business API routes with
`403 PREVIEW_ONLY`. Inspect actually served capabilities/release before using a
new journey. An account, promotional credit or provider credentials establish
neither activated transport nor actual assistant qualification.

The [API contract](API_CONTRACT.md) owns common authentication, document, dispatch,
amount, idempotency and error rules. [Studio contracts](TEMPLATES_DATA_DISTRIBUTION.md)
own templates/datasets/mappings/generation/distribution; [postal review](POSTAL_REVIEW.md)
owns preflight/transfer/quote; [expert approval](EXPERT_APPROVAL.md) owns delegated
authority. Link to these instead of maintaining another copy of their full rules.

## Contract and authority

The studio integration described OpenAPI 3.0.3 business version 0.2.0 with **55 paths
and 64 operations**. The separately dated publication below exposed a smaller
historical contract. Current source of truth is
`apps/web/public/openapi.json`, `apps/api/src/index.ts`, `auth.ts`, `documents.ts`,
`postal.ts`, `template-workflow-routes.ts`, domain services and shared contracts.
Any route, scope, field, state or limit change must update the specification.

There is no REST `/api/documents/import`: `import_document` is MCP; REST upload is
multipart. [Public PDF import](PUBLIC_PDF_IMPORT.md) removed the hosted source-domain
allowlist in the 17 September local candidate, retaining public HTTPS DNS,
network/download/scan limits and rejection of private URLs, nonstandard ports and
redirects. Local URL import remains disabled; authenticated multipart remains.
This is no claim of deployment or universal assistant-file compatibility.

For production postal preparation, read account requirements, check exact PDF and
open the returned `reviewUrl`. Standard `/transfer` requires browser review/consent
and is excluded from the OAuth reference; expert `transfer_postal_draft` needs a
prior postal mandate. Quotes reuse the draft without a second upload;
`canSend:false` remains. REST preparation returns `Dispatch` without `approvalUrl`;
open `https://guteneo.com/#/app/dispatch/{id}`. MCP constructs its approval link.
OAuth scopes do not create human consent. Standard `/approve` requires browser
session/CSRF; expert approval is separately delegated, with current mandate/review
and unchanged host confirmations. Account, billing, administration, callbacks and
private provider operations are excluded from this public OAuth contract.

Website/native login starts at `guteneo.com` using `auth.guteneo.com`.
`/auth/mobile/authorize` retains the mobile return and selects configured browser
domain before canonical callback. Existing **API/MCP** clients retain issuer
`https://pieper.eu.auth0.com/`, authorization
`https://pieper.eu.auth0.com/authorize`, token
`https://pieper.eu.auth0.com/oauth/token`, audience `https://guteneo.com/mcp`.
Do not edit issuer documentation without coordinated server/client migration.
Registered clients require exact callbacks, Authorization Code + PKCE S256 and
checked `state`. Access tokens use Bearer only; ID tokens, provider keys and URL
tokens are no substitute. Public clients contain no client secret.

Verified-email onboarding, signed `https://guteneo.com/verified_account=true`,
current membership and connection determine tenant and authority. Sessions lacking
`verifiedAccount` reconnect. Beta `verified_email` does not require MFA; historical
default `verified_email_and_mfa` still requires it for administrators. Multiple
memberships require connection selection; body/header cannot choose tenant.
Operator/viewer/supervisor/admin authority and usage-reporting gates remain those
in [WORKSPACE_ROLES.md](WORKSPACE_ROLES.md). Auth0 scope declarations do not grant
new studio scopes to existing tokens: obtain new consent.

Private studio PDFs remain creator-only except exact dispatch-bound reads by a
currently authorized administrator/supervisor reviewer. Supply matching
`dispatchId` to document/content reads or MCP `get_document`/`read_document_pages`;
OAuth also needs `dispatches:read`. This does not expose the PDF in library/list
results. Ready/scan/hash, amount/rounding, quota, immutable approval and unknown
outcome rules are defined once in [API_CONTRACT.md](API_CONTRACT.md).

20 September candidate `POST /api/postal/address-pages` and
`create_postal_address_page` explicitly create a separate checked PDF, preserve the
original and use idempotency without Pingen transfer. See [POSTAL_ADDRESS_PAGE.md](POSTAL_ADDRESS_PAGE.md).
Release `118ce087` adds customer-only `faxPricing` (nanoEUR range, firm cent cap,
frozen FX, separate settlement); `estimated_minor` is no final usage charge.
Supplier costs are withheld from public projections; no public tariff-write or
settlement endpoint is added. Publication proof is separate from send activation.

## Public reference rendering and security

The initial sixth public page was prerendered with title, description, canonical,
WebPage/BreadcrumbList and no-JavaScript text; it joined sitemap and preview public
allowlist. Unknown routes remain 404; alternative hosts remain noindex and business
routes inaccessible. Only home and the developer page retain JavaScript entrypoints.
The page wrapper avoids dashboard session/capability hooks. Historical references
to `/developpeurs/` describe its original URL; canonical generation now uses
`/developers/` with inbound compatibility.

Swagger UI **5.33.0** is bundled locally, without CDN, and its loader/bundle/CSS load
only after Open Swagger reference. Reading/downloading works without Swagger.
Its sole read is self-contained `/openapi.json`, without credentials, redirects
or remote `$ref`. No business API call, OAuth form, token or example submission
runs on this page.

Configuration: `supportedSubmitMethods:[]`, `tryItOutEnabled:false`,
`validatorUrl:null`, `queryConfigEnabled:false`, `persistAuthorization:false`,
`withCredentials:false`, `deepLinking:false`. Authorization components are disabled;
`requestInterceptor` refuses Swagger-originated requests. No `initOAuth` or
query-selectable configuration URL exists. CSP adds neither `unsafe-eval` nor
external scripts. [TECHNICAL_SEO.md](TECHNICAL_SEO.md) owns origin-dependent indexing.

The tracked JSON specification is checked against router operations/middleware
scopes, parsed with **@apidevtools/swagger-parser 13.0.0**, and checked for external
references and sensitive shapes: integer cents, serialized JSON, nullability,
idempotency and no public approval route.
[Swagger configuration](https://swagger.io/docs/open-source-tools/swagger-ui/usage/configuration/),
[installation](https://swagger.io/docs/open-source-tools/swagger-ui/usage/installation/).
Versions were checked on npm on 17 September 2026. Optional `@scarf/scarf` telemetry
scripts were not approved.

## Initial local validation — historical

- Typecheck/focused lint passed.
- `node --test tests/security/openapi.test.mjs tests/security/public-pages.test.mjs`: 11/11 contract/generation/SSR-encoding checks passed; retain with changes.
- `npx vitest run tests/unit/preview-worker.test.ts --reporter=default`: 37 preview-boundary assertions passed.
- `npm run build:preview`: local build passed, Swagger/CSS split into separate chunks, unchanged CSP.
- `npx playwright test --config playwright.preview.config.ts tests/preview-e2e/developers.spec.ts tests/preview-e2e/seo.spec.ts --reporter=list`: 8/8 desktop Chromium/iPhone WebKit cases passed. Six initial routes, real HTTP, no-JS reading, lazy loading, no Swagger API/auth/execution, cookieless/Bearer-free contract request, ignored configuration parameters, no overflow, final nanoEUR synchronization and mobile Swagger presentation were covered.

Documentation changes themselves authorize no commit, deployment, real OAuth,
communication or provider activation.

## Published qualification — 17 September 2026

Release `118ce087c3fe5a1ad63bd4c562adb8e26aa8af21` exposes 20 paths and 23 operations on https://guteneo.com/openapi.json, with the customer-only fax v3 contract. Post-deployment developer/SEO checks passed **8/8** across desktop and iPhone in 4.6 seconds (`reports/published-118ce087-public-browser.json`); the Swagger page remains error-free, without API execution, bearer tokens or cookies on its specification request. The explicit production-public test mode verifies the separate anonymous session 401 instead of the fictional preview 403. Both exact-source CI runs passed. See [LIVE_RELEASE.md](LIVE_RELEASE.md) for exact source, Worker versions and asset proof; these checks do not qualify an authenticated API journey or activate a transport.
