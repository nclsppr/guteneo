# Guteneo

An independent, MCP-first correspondence product: exact PDF → fax or physical post, HTML → PDF, and HTML/text → individual email. French editorial frontend inspired by printing craft. Telnyx, Amazon SES and Pingen connectors. No VBS dependency.

**Current delivery:** usable local vertical through real Cloudflare emulation and deterministic, prominently labelled simulation. Provider adapters, managed Auth0 integration and stateless MCP are implemented and fixture-tested. No real provider send, remote OAuth client, Cloudflare deployment or paid resource has been authorized or executed. Live pricing qualification/snapshot integration still blocks production preparation. This is not a production-readiness claim.

## Run locally

Requires Node22.16+ and npm. Use localhost exactly (Origin/CSRF are checked).

```sh
npm ci
npx playwright install chromium
npm run demo
```

Open `http://localhost:8787`, enter the atelier and select either fictional organization. `demo` applies local migrations, seeds fictional organizations, builds the frontend and starts Workers and the local PDF renderer. No cloud credentials or real communication needed.

If the Playwright CDN is unavailable on Linux, `npm run browser:prepare` extracts the bundled Chromium development fallback; it does not qualify Safari or remote Browser Run. The renderer selects this fallback if the regular browser is absent.

```sh
npm run db:migrate   # local D1 only
npm run db:seed      # idempotent simulation fixtures/credits
npm run typecheck
npm run lint
npm test
npm run test:e2e     # install Chromium + WebKit dependencies first
npm run build       # typecheck + frontend build + Wrangler dry-run
npm run costs
node scripts/http-smoke.mjs --with-server
npm run deploy:plan -- staging
```

Restricted environment verification used `GUTENEO_BUNDLED_CHROMIUM=1 npx playwright test --project=chromium --project=mobile-chromium`. iPhone/WebKit is a separate project and is not silently replaced by mobile Chromium. Exact executed results and captures: [TEST_RESULTS](docs/TEST_RESULTS.md).

`npm run dev` is the supported complete local workflow. The optional `dev:web` Vite server is only for frontend development: its different origin needs an explicitly coherent local origin/proxy setup before authenticated mutations can work. Never bypass the Origin/CSRF checks to enable hot reload.

## What to try

1. Documents → import a PDF or explicitly generate one from HTML.
2. Prepare one fax, email or postal operation. Inspect exact content, sender, recipient and ceiling.
3. Human checkbox → approve that version → confirm simulation. Follow per-channel results and the same dispatch ID.
4. Import CSV into a named campaign; correct invalid/duplicate rows before preparing recipient operations. Reuse the same document.
5. Connect an assistant → inspect capabilities and honest compatibility status. MCP itself cannot approve a request.
6. Administration → inspect attempts/uncertainty and pause a channel. No blind retry for uncertain transmissions.

## Documentation

- [Product scope and accepted journeys](docs/PRODUCT.md)
- [Execution plan, evidence and remaining work](docs/EXECUTION_PLAN.md)
- [Architecture](docs/ARCHITECTURE.md), [data model](docs/DATA_MODEL.md), [ADR](docs/adr/0001-reliable-modular-monolith.md)
- [API contract](docs/API_CONTRACT.md), [identity/MCP and client matrix](docs/IDENTITY_MCP.md), [Cursor file adapter](docs/CURSOR.md)
- [Provider contracts/setup](docs/PROVIDERS.md), [live activation](docs/LIVE_ACTIVATION.md)
- [Threats and controls](docs/THREATS.md), [dated verification sources](docs/VERIFICATION.md)
- [Costs](docs/COSTS.md), [operations/deployment/restore](docs/RUNBOOK.md), [restore proof](docs/RESTORE_PROOF.md)
- [Demonstration](docs/DEMO.md), [test results](docs/TEST_RESULTS.md), [product improvements](docs/IMPROVEMENTS.md)
- [Brand asset](docs/BRAND_ASSET.md)

## Deliberate gates

No local auth in hosted environments; no simulation production. R2 private, organizational isolation throughout. Missing production scanner means quarantine before PDF parsing; rendering runs in a separate Worker. New real organizations have zero credits. Marketing is blocked pending unsubscribe/reputation qualification. Accounts, sender identities, exact destinations, real tariffs and explicit real-send approval must be supplied; examples contain no production identifiers.

Cloudflare configuration examples are separate for staging/production. The root Wrangler config is **local only**. No CI deployment or DNS action exists. `guteneo.com` is the intended domain, not evidence of a live deployment.
