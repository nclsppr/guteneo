# Public design preview — 2026-09-16

The user requested an immediate Cloudflare deployment to inspect the existing design. The preview is live at **https://guteneo.com**, with the sample workspace at **https://guteneo.com/#/app**. The fallback address is https://guteneo-preview.nclsppr.workers.dev.

The separate `guteneo-preview` Worker serves the React application built with `VITE_PUBLIC_PREVIEW=true`. The first deployment version was `71f30997-dfbd-4f70-a4ce-10cfa4367e81`. `/release.json` records the currently deployed source commit, whether local changes were included, the source snapshot digest and individual asset digests. `/health` identifies the preview mode and closed live-send gate. These endpoints are public evidence; a successful local build alone is not deployment proof.

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
GUTENEO_PREVIEW_URL=https://guteneo.com npm run test:preview
```

The build explicitly enables preview mode and uses `dist/preview`, leaving the application build in `dist/web`. It fails if deployment inputs change while building. Source and asset digests permit verification even for an early release from uncommitted changes; the final release should use a clean committed source. GitHub CI builds and tests this preview but does not deploy it.

Desktop Chromium and iPhone WebKit tests cover all workspace routes, layout overflow, zero browser API requests, PDF canvas display, preparation/approval/simulation and remote route rejection. Captures are under `reports/screenshots/preview/`.

Since the editorial SEO update of 17 September 2026, the six public documents on `guteneo.com` are eligible for indexing: the homepage, journal index, two history articles, legal notice and developer documentation. Their initial HTML contains the full content and metadata; journal and legal pages require no JavaScript. The hash-based fictional workspace remains excluded from the sitemap, while alternate preview/backend hostnames stay noindex. Missing paths return actual 404s. See [TECHNICAL_SEO.md](TECHNICAL_SEO.md). Indexing eligibility is not proof that a search engine has indexed or ranked the pages.

Official deployment references checked on 2026-09-16: [Worker static assets](https://developers.cloudflare.com/workers/static-assets/), [routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/), [custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

## v0.2 publication proof

The updated preview deployed from clean commit `b3988da34c2d73765be7e74c6fda2af2e887b5ba`, Worker version `e0f61996-192e-4b59-8462-0a7c2d3d12d3`. At 21:41 UTC all 25 served asset hashes matched the local manifest; Cloudflare canonicalizes `/index.html` to `/`, whose exact bytes were verified. Response security headers were also checked. Account, billing and team surfaces remain clearly labelled fictional preview states; real account activation is tracked separately in LIVE_RELEASE.md.
