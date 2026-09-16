# Guteneo

An independent, MCP-first correspondence product: exact PDF → fax or physical post, HTML → PDF, and HTML/text → individual email. French editorial frontend inspired by printing craft. Telnyx, Amazon SES and Pingen connectors. No VBS dependency.

**Public design preview:** [guteneo.com](https://guteneo.com), with a directly accessible [sample workspace](https://guteneo.com/#/app). The dedicated Cloudflare preview runs entirely with fictional, per-tab browser data. No registration, upload, payment, assistant connection or real sending is active there. See [deployment evidence and preview commands](docs/PUBLIC_PREVIEW.md).

**Hosted beta:** [guteneo-app.nclsppr.workers.dev](https://guteneo-app.nclsppr.workers.dev) runs the production-mode backend with private EU D1/R2 storage, queues and qualified private PDF services. Account/profile/session/team management, billing tracking and MCP/plugin packages are implemented. Auth0 activation and Stripe setup remain incomplete, and real assistant clients have not been qualified. Telnyx credentials are installed; verified account tariffs, an owned sender and funded budgets still gate live fax. See [release evidence](docs/LIVE_RELEASE.md).

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
- [Hosted release](docs/LIVE_RELEASE.md), [Cloudflare setup](docs/CLOUDFLARE_SETUP.md), [remote migrations](docs/D1_MIGRATION.md)
- [Account and team administration](docs/ACCOUNT_ADMIN.md), [billing](docs/BILLING.md), [assistant installation](docs/LLM_SETUP.md)
- [Secure credential setup](docs/SECURE_CONFIGURATION.md), [antivirus](docs/SCANNER.md), [PDF rescan](docs/SCANNER_RESCAN.md)
- [Brand asset](docs/BRAND_ASSET.md)

## Deliberate gates

No local auth in hosted environments; no simulation production. R2 private, organizational isolation throughout. Missing production scanner means quarantine before PDF parsing; rendering runs in a separate Worker. New real organizations have zero sending credits and a bounded daily PDF allowance (10 imports / 20 MiB / 3 renders). Marketing is blocked pending unsubscribe/reputation qualification. Accounts, sender identities, exact destinations, real tariffs and explicit real-send approval must be supplied; examples contain no production identifiers.

Cloudflare configuration examples are separate for staging/production. The root Wrangler config is **local only**. The public design preview uses `wrangler.preview.jsonc`; it has no business-service bindings. The hosted backend uses `wrangler.live.jsonc`. CI verifies the application, isolated scanner and preview without deploying them. Use `npm run setup:fax` or `npm run setup:billing` for local secure credential transfer; never paste credentials into a task message.
