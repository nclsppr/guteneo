# Public design preview — 2026-09-16

The user requested an immediate Cloudflare deployment to inspect the existing design. The preview is live at **https://guteneo.com**, with the sample workspace at **https://guteneo.com/#/app**. The fallback address is https://guteneo-preview.nclsppr.workers.dev.

The separate `guteneo-preview` Worker serves the React application built with `VITE_PUBLIC_PREVIEW=true`. The first deployment version was `71f30997-dfbd-4f70-a4ce-10cfa4367e81`. `/release.json` records the currently deployed source commit, whether local changes were included, the source snapshot digest and individual asset digests. `/health` identifies the preview mode and closed live-send gate. These endpoints are public evidence; a successful local build alone is not deployment proof.

## What is interactive

- Landing and responsive dashboard, documents, sends, campaigns, sender profiles, usage and administration.
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

Desktop Chromium and iPhone WebKit tests cover all workspace routes, layout overflow, zero browser API requests, PDF canvas display, preparation/approval/simulation and remote route rejection. Captures are under `reports/screenshots/preview/`. Noindex prevents the unfinished preview from being advertised as a launched service.

Official deployment references checked on 2026-09-16: [Worker static assets](https://developers.cloudflare.com/workers/static-assets/), [routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/), [custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).
