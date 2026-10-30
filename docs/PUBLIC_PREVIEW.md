# Public design preview — updated 2026-10-26

The user originally requested an immediate Cloudflare deployment to inspect the existing design. The separate preview is now at **https://guteneo-preview.nclsppr.workers.dev**, with its fictional workspace at **https://guteneo-preview.nclsppr.workers.dev/#/app**. Since the controlled switch on 17 September 2026 at 01:11 UTC, **https://guteneo.com** serves the production-mode application, with authenticated accounts and channel availability governed by its current configuration and provider gates. Do not run the fictional-preview journeys against that canonical application. Only the read-only developer and SEO specs support the explicit `GUTENEO_PUBLIC_APP=1` mode for canonical qualification; never run the fictional workspace journeys there. See [LIVE_RELEASE.md](LIVE_RELEASE.md) for its current release and remaining account qualification.

The separate `guteneo-preview` Worker serves the React application built with `VITE_PUBLIC_PREVIEW=true`. The first deployment version was `71f30997-dfbd-4f70-a4ce-10cfa4367e81`. `/release.json` records the currently deployed source commit, whether local changes were included, the source snapshot digest and individual asset digests. `/health` identifies the preview mode and closed live-send gate. These endpoints are public evidence; a successful local build alone is not deployment proof.

The preview publication recorded at **03:11:29 UTC** on 17 September used source `118ce087c3fe5a1ad63bd4c562adb8e26aa8af21`, Worker version `2a63dad6-f48c-4f0e-acef-18a5e4026392`, with **100% traffic** verified. All 51 public asset hashes, robots policy and security headers matched the clean local build, snapshot `90b8a7cc9527c7a60042e2f30b2ce2da3087858ef973695f1f56eaec6ab323b0`; evidence: `reports/preview-118ce087-release-proof.json`. That published preview passed **30 browser cases with four intentional desktop skips** in 12 seconds (`reports/published-preview-118ce087.json`). This is dated fictional preview evidence, separate from the canonical application’s eight read-only public checks and its `/api/health` endpoint. Read the public `/release.json` for the currently served source.

## ChatGPT archive download — local candidate, 25 October 2026

This candidate has been reconciled with `main` at `c81ea94` for release `1.1.3`; [26 October local validation](ASSISTANT_HUB.md#chatgpt-archive-candidate--25-october-2026) records the current archive and preview checks. Earlier archive-build evidence is historical.

The preview build generates the same static `/integrations/guteneo-plugin.zip` and `integrations/manifest.json` as the application build, using the synchronized plugin sources. The ChatGPT guide can therefore offer a real downloadable archive. The archive and manifest are covered by the preview release asset hashes; an outdated MCP/package fingerprint stops the build. See the [mandatory synchronization procedure](LLM_SETUP.md#mandatory-mcp-plugin-and-archive-synchronization).

Opening the guide or downloading the archive makes no backend call. The package contains the production endpoint `https://guteneo.com/mcp`; importing it into ChatGPT is a separate user action requiring the real Guteneo authentication and permissions. The preview does not provide a fictional MCP endpoint or activate a connection. Its browser-only fixture model and `ASSETS`-only Worker remain unchanged. Building or downloading the ZIP does not qualify installation, OAuth, a tool call or marketplace publication, and this candidate has not been deployed by this work.

## Local roles and large-volume fixtures — 30 October 2026 candidate

The loopback Vite development preview adds a collapsible **Local simulation**
control bar. Run `VITE_PUBLIC_PREVIEW=true npm run dev:web -- --host 127.0.0.1
--port 8791 --strictPort`, then open the local workspace. A separate
`npm run preview:belvedere` process serves the fictional read-only control tower.
The DEV flag, preview flag and loopback hostname are all required; built public
preview and production accounts do not expose these developer controls.

Five fictional accounts represent the four membership roles: administrator,
supervisor (approval/reporting options on), operator and observer, plus a separate
observer account with the local platform-access hint. This hint authorizes no real
platform request. Accounts are in-memory fixture identities; switching them creates
no Auth0 account, membership, session, mandate or communication. Existing unsaved
navigation guards can veto a scenario change. Applying a profile/seed remounts
application state, and scoped IDs, cursors and late-response guards reject prior
account/scenario data. No scenario preference persists after reload.

Choose the interactive default, or seeded Small, Large, Huge and Extreme metadata
sets. Each collection receives its own reproducible count within the selected
range, through one billion logical documents, dispatches, templates, datasets or
generations. The bar displays actual counts and offers a new random seed. Logical
collections generate at most fifty records per read; indexed lookup and pagination
never allocate an array proportional to the logical total. Studio source pages
retain bounded coordinate samples. Requested fictional PDF bytes and page images
are generated only on explicit opening, with bounded caches. These are browser
navigation/data-shape tests, not a measurement of a billion-row database or provider
throughput. Domain upload, scan, generation, price and recipient limits remain
unchanged.

The interactive default retains its existing fictional preparation/review flows.
Generated volume scenarios are read-only and explicitly labelled: they never
pretend that synthetic metadata is an approved quote, actual receipt or completed
delivery. Personal document fixtures have no original-download or personal-deposit
permission and no audit evidence. Personal bulk lookup accepts an exact document
number or fixture identifier; unsupported free-text search fails explicitly rather
than scanning virtual billions of rows. Local personal transport cannot fall through to
the real backend after a fixture refusal.

Only the fictional platform account sees the local Belvédère destination. Its
separate loopback GET/HEAD-only server retains the selected seed/counts and locale
in an encoded scenario path; it has no credentials, database, CORS grant or real
platform capability. The seven views use bounded generated pages and arithmetic
counts, and the default dedicated fixture remains compatible with prior tests.
Production canonical Belvédère continues to check its actual authenticated
platform authority on every read.

Source contracts: `preview-data.ts`, `preview.ts`, `preview-studio.ts`,
`preview-personal.ts`, `local-preview.ts` and `local-preview-controls.tsx` under
`apps/web/src`; the dedicated local server and `tests/fixtures/local-belvedere.ts`
remain server/test-only. `playwright.local-preview.config.ts` is a separate DEV
qualification configuration; hosted CI's production/browser-preview inventory and
coverage remain unchanged. Local unit and browser evidence, hosted checks and
actual deployment are qualified separately.

## What is interactive

- Landing and responsive dashboard, documents, sends, campaigns, sender profiles, usage, account settings, billing state and administration.
- Real locally generated fictional PDF examples that can be displayed and downloaded.
- Preparation, browser review, approval and deterministic simulated results for individual sends; CSV validation and campaign preparation.
- Sample organizations isolated in one tab's memory. Reloading restores the examples; closing the page retains no application data. No document contents or form data are submitted to a backend.

The public preview is a design model, distinct from the local application's D1/R2/Queue simulator. It does not qualify identity, MCP hosts, document ingestion, provider execution or reliability under real load. File upload and custom PDF rendering are disabled in this public preview. Assistant connection controls explain that the service is not yet connected. All real backend routes and all write methods return `403 PREVIEW_ONLY`; the Worker has only an `ASSETS` binding. No production authentication bypass, public document bucket or shared demo database was introduced.

## Email model parity

The tab-only preparation model accepts a message without custom HTML and formats
its text as an escaped paragraph with line breaks. Message-only preparation still
requires a subject and message. With a fictional ready PDF attachment, omitted
subject/message fields use the shared pure document-email template and the
selected fictional workspace name. The fictional account has no saved language,
so these defaults use French. Body defaults apply only when both custom HTML and
text are absent. Supplied custom HTML requires a supplied plain-text alternative
and remains unchanged in this isolated model; it does not run the production
sanitizer or derive text from HTML.

Preparation, review and simulated tracking remain in the tab's memory. No backend
request, real recipient link, hosting record, password, provider call or purchase
is created by this presentation parity. Protected-hosting behavior, HTML-to-text
conversion and authenticated sender identity need their separate application
checks. Preview form labels follow the same optional-document-message state as
the shared composer; a working fixture is not publication or inbox evidence.

## Build, verify and release

```sh
npm run build:preview
npm run test:preview
npx wrangler deploy --config wrangler.preview.jsonc --dry-run
npm run deploy:preview
GUTENEO_PREVIEW_URL=https://guteneo-preview.nclsppr.workers.dev npm run test:preview
```

The build explicitly enables preview mode and uses `dist/preview`, leaving the application build in `dist/web`. It fails if deployment inputs change while building. Publishing requires a clean `main` synchronized with `origin/main`, then rebuilds and checks the source and every asset before deployment; see [MAIN_RELEASE.md](MAIN_RELEASE.md). GitHub CI builds and tests this preview but does not deploy it.

Desktop Chromium and iPhone WebKit tests cover all workspace routes, layout overflow, zero browser API requests, PDF canvas display, preparation/approval/simulation and remote route rejection. Captures are under `reports/screenshots/preview/`.

The preview remains noindex on its `workers.dev` hostname. Since the editorial SEO update and subsequent domain switch on 17 September 2026, the application serves six indexable public documents on `guteneo.com`: the homepage, journal index, two history articles, legal notice and developer documentation. Their initial HTML contains the full content and metadata; journal and legal pages require no JavaScript. Both the fictional preview workspace and real private account routes remain excluded from the sitemap. Missing paths return actual 404s. See [TECHNICAL_SEO.md](TECHNICAL_SEO.md). Indexing eligibility is not proof that a search engine has indexed or ranked the pages.

Official deployment references checked on 2026-09-16: [Worker static assets](https://developers.cloudflare.com/workers/static-assets/), [routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/), [custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

## Historical v0.2 preview publication proof

Before the canonical domain moved to the real application, the updated preview deployed there from clean commit `b3988da34c2d73765be7e74c6fda2af2e887b5ba`, Worker version `e0f61996-192e-4b59-8462-0a7c2d3d12d3`. At 21:41 UTC on 16 September all 25 served asset hashes matched the local manifest; Cloudflare canonicalizes `/index.html` to `/`, whose exact bytes were verified. Response security headers were also checked. This is historical preview evidence, not the current canonical application's identity or sending qualification. Account, billing and team surfaces in the separate preview remain clearly labelled fictional.
