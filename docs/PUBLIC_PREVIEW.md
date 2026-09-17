# Public design preview — updated 2026-09-17

The user originally requested an immediate Cloudflare deployment to inspect the existing design. The separate preview is now at **https://guteneo-preview.nclsppr.workers.dev**, with its fictional workspace at **https://guteneo-preview.nclsppr.workers.dev/#/app**. Since the controlled switch on 17 September 2026 at 01:11 UTC, **https://guteneo.com** serves the production-mode application, with Auth0 configured and live sending disabled. Do not run the fictional-preview journeys against that canonical application. Only the read-only developer and SEO specs support the explicit `GUTENEO_PUBLIC_APP=1` mode for canonical qualification; never run the fictional workspace journeys there. See [LIVE_RELEASE.md](LIVE_RELEASE.md) for its current release and remaining account qualification.

The separate `guteneo-preview` Worker serves the React application built with `VITE_PUBLIC_PREVIEW=true`. The first deployment version was `71f30997-dfbd-4f70-a4ce-10cfa4367e81`. `/release.json` records the currently deployed source commit, whether local changes were included, the source snapshot digest and individual asset digests. `/health` identifies the preview mode and closed live-send gate. These endpoints are public evidence; a successful local build alone is not deployment proof.

Current preview source is `813dd7173389f8fbcc1e1e1abaf68be905e7084c`, Worker version `b47daae5-19bd-43c9-91e6-a78d159efc35`, deployed at 02:29 UTC on 17 September with 100% traffic verified. All 51 public asset hashes, robots policy and security headers match the clean local build. This remains fictional preview evidence.

## What is interactive

- Landing and responsive dashboard, documents, sends, campaigns, sender profiles, usage, account settings, billing state and administration.
- Real locally generated fictional PDF examples that can be displayed and downloaded.
- Preparation, browser review, approval and deterministic simulated results for individual sends; CSV validation and campaign preparation.
- Sample organizations isolated in one tab's memory. Reloading restores the examples; closing the page retains no application data. No document contents or form data are submitted to a backend.

The public preview is a design model, distinct from the local application's D1/R2/Queue simulator. It does not qualify identity, MCP hosts, document ingestion, provider execution or reliability under real load. File upload and custom PDF rendering are disabled in this public preview. Assistant connection controls explain that the service is not yet connected. All real backend routes and all write methods return `403 PREVIEW_ONLY`; the Worker has only an `ASSETS` binding. No production authentication bypass, public document bucket or shared demo database was introduced.

## Build, verify and release

```sh
npm run build:preview
npm run test:preview
npx wrangler deploy --config wrangler.preview.jsonc --dry-run
npx wrangler deploy --config wrangler.preview.jsonc
GUTENEO_PREVIEW_URL=https://guteneo-preview.nclsppr.workers.dev npm run test:preview
```

The build explicitly enables preview mode and uses `dist/preview`, leaving the application build in `dist/web`. It fails if deployment inputs change while building. Source and asset digests permit verification even for an early release from uncommitted changes; the final release should use a clean committed source. GitHub CI builds and tests this preview but does not deploy it.

Desktop Chromium and iPhone WebKit tests cover all workspace routes, layout overflow, zero browser API requests, PDF canvas display, preparation/approval/simulation and remote route rejection. Captures are under `reports/screenshots/preview/`.

The preview remains noindex on its `workers.dev` hostname. Since the editorial SEO update and subsequent domain switch on 17 September 2026, the application serves six indexable public documents on `guteneo.com`: the homepage, journal index, two history articles, legal notice and developer documentation. Their initial HTML contains the full content and metadata; journal and legal pages require no JavaScript. Both the fictional preview workspace and real private account routes remain excluded from the sitemap. Missing paths return actual 404s. See [TECHNICAL_SEO.md](TECHNICAL_SEO.md). Indexing eligibility is not proof that a search engine has indexed or ranked the pages.

Official deployment references checked on 2026-09-16: [Worker static assets](https://developers.cloudflare.com/workers/static-assets/), [routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/), [custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

## Historical v0.2 preview publication proof

Before the canonical domain moved to the real application, the updated preview deployed there from clean commit `b3988da34c2d73765be7e74c6fda2af2e887b5ba`, Worker version `e0f61996-192e-4b59-8462-0a7c2d3d12d3`. At 21:41 UTC on 16 September all 25 served asset hashes matched the local manifest; Cloudflare canonicalizes `/index.html` to `/`, whose exact bytes were verified. Response security headers were also checked. This is historical preview evidence, not the current canonical application's identity or sending qualification. Account, billing and team surfaces in the separate preview remain clearly labelled fictional.
