# Hosted continuation — 2026-09-17

Guteneo has two hosted surfaces. **https://guteneo.com** is the public design preview with fictional per-tab data. **https://guteneo-app.nclsppr.workers.dev** serves the production-mode backend and the same visual updates. The root domain will move to that application after managed identity is configured and an actual login is verified. The PR remains open and unmerged.

## Published source and public evidence

| Surface | Clean source commit | Active Worker version | Verified public assets |
| --- | --- | --- | --- |
| Design preview | `872281827d375f38946dc8eea4dcef23ecd5a591` | `9cab9372-8098-4c7d-91c5-179f19953fbf` | 35 |
| Application backend | `ee64850691f9f50c3e7cee5cbbfea2afe46c448d` | `092f4792-fb1a-42e3-a76b-093c76376376` | 37 |

The backend code deployment was version `c5183396-e48c-46b3-9fcc-11a4136c9f0b`; installation of the verified Pingen upload origin produced the active secret-update version above, serving 100% of traffic. The preview also serves 100%. Each asset was compared with its local SHA-256 manifest, including `/index.html` through canonical `/`. `_headers` is configuration, checked through resulting response security headers. Machine-readable evidence: `reports/live-release-proof.json` and `reports/preview-release-proof.json`.

Backend snapshot: `d5a395028067ece9b038c8507e4aa1bffb74c336085b4916fdbebc86a001edb1`. Preview snapshot: `7340f3d612fc7378e59554de0701f451b172c077e165a16ab3a9749238588581`. Public manifests: [preview](https://guteneo.com/release.json), [backend](https://guteneo-app.nclsppr.workers.dev/release.json).

Both CI runs passed for the exact preview source: [PR verification](https://github.com/nclsppr/guteneo/actions/runs/35161641153), [push verification](https://github.com/nclsppr/guteneo/actions/runs/35161637609). Both checks also passed for the exact backend source `ee64850691f9f50c3e7cee5cbbfea2afe46c448d`: [PR verification](https://github.com/nclsppr/guteneo/actions/runs/35162247327) and [push verification](https://github.com/nclsppr/guteneo/actions/runs/35162242683). These include full unit/security suites, 36 application browser cases, 12 preview cases, migration transport, scanner and both deployment bundles.

## Delivered experience and account rules

Official ChatGPT, Claude, Grok and Cursor marks keep their shapes and colors inside perforated paper stamps. The Luxembourg footer now uses the printer's blue/ivory dithering, with automatic flight and four-pose wing animation, respecting reduced motion. The animation button is removed. The homepage and downloadable guide show dated customer price examples and applicable limits, without publishing supplier-margin arithmetic. The legal page identifies Nicolas Pieper, his supplied address/contact, Cloudflare hosting and the project's unregistered preparatory state.

The account ledger grants EUR50 once, shares the balance across all three channels, atomically reserves costs and stops unaffordable sends. Top-up stays disabled until Stripe is implemented. Migrations 0001–0015 are applied remotely, with clean integrity/foreign-key checks and domain-schema comparison. See [WELCOME_CREDIT.md](WELCOME_CREDIT.md), [D1_MIGRATION.md](D1_MIGRATION.md) and [TEST_RESULTS.md](TEST_RESULTS.md).

Twelve browser journeys pass both locally and on the published preview across desktop Chromium and iPhone WebKit. The complete local application suite previously passed 36 journeys; local unit/security runs and subsequent targeted provider checks are recorded separately in TEST_RESULTS. No fixture result is described as actual delivery.

## Provider configuration and real account checks

- **Telnyx:** an active Luxembourg number is attached to the active Guteneo fax application, T.38 is enabled, and the application allows one outgoing channel. `TELNYX_FROM` is installed privately. Current read-back includes Luxembourg, France, Germany and the other enabled European destinations, plus US/Canada; this number is not restricted to Luxembourg by that profile. Profile concurrency is null, maximum destination rate null, and daily spending enforcement is disabled; an unsupported daily-limit representation remains unknown and is reported as a partial diagnostic. The agent did not widen the destination list. The callback was corrected and saved to `https://guteneo-app.nclsppr.workers.dev/webhooks/telnyx`. An unsigned probe returns 401, while signed fixture tests prove exact-application signature verification independently of Auth0. No fax delivery is qualified. See [TELNYX_READINESS.md](TELNYX_READINESS.md).
- **Amazon SES:** Paris-region domain/DKIM/MAIL FROM resources and the dedicated sender are configured. Installed credentials authenticated as the exact intended IAM principal. The SNS subscription is confirmed, with authenticated confirmation and unsubscribe protection; its consumed one-use token was removed from the specific receipt. The account remains in sandbox, the configuration set's sending stays disabled, and actual delivery permission remains unqualified. See [SES_STATUS.md](SES_STATUS.md).
- **Pingen:** the dedicated Guteneo Client Credentials application was created through the authorized Safari session. Three access values were copied through masked local fields directly to Cloudflare, without credentials files or displayed secrets. Private OAuth and the exact organization read succeed: EUR, default country LU, left envelope window. A separate read-scoped `/file-upload` inspection returned the actual storage origin, now installed as the sole `PINGEN_UPLOAD_ORIGINS`; `PINGEN_SANDBOX=false` reflects the actual production account. No PDF was deposited, letter created, credit purchased or mail sent. Signed postal notifications, exact-document preflight and actual delivery qualification remain open. See [PINGEN_SETUP.md](PINGEN_SETUP.md).

## Runtime boundaries

The runtime reports production mode, registration disabled, billing unconfigured, scanner/rendering connected, all three provider credentials configured but not live-validated, and **`LIVE_SENDS_ENABLED=false`**. Protected account/document/MCP routes fail closed while identity is missing. Public design data stays separate from D1/R2 and never sends documents.

Auth0's earlier CLI authentication expired. Renew its official login, configure the dedicated client/audience/actions and verify a real email/MFA login before enabling signup. Stripe tracking is implemented but credentials and actual billing qualification remain absent. Qualified account tariffs, sender/country policy, funded budgets, signed callbacks and immutable human approval remain prerequisites for any communication. Host-specific OAuth/PDF transfer in ChatGPT, Claude and Cursor remains untested; downloadable packages do not imply marketplace publication or an operational host connection.

No real fax, postal letter, email, Stripe charge or automatic credit refill was performed. See [EXECUTION_PLAN.md](EXECUTION_PLAN.md) for the remaining implementation and activation work.

## Private infrastructure

D1 and R2 use EU jurisdiction; interactive, bulk and dead-letter queues are configured. `guteneo-scanner` previously passed real ClamAV clean/EICAR/hash checks with EU placement observed, and `guteneo-documents` passed actual Browser Run rendering/exact-byte parsing. These services have no public route. Scanner definitions require regular rebuilds and fail closed after 72 hours; prior qualification is distinct from current definition freshness. Details: [CLOUDFLARE_SETUP.md](CLOUDFLARE_SETUP.md), [SCANNER.md](SCANNER.md).

## Repeatable proof

Build clean committed source, deploy the intended Wrangler configuration, then run `node scripts/verify-release.mjs https://guteneo-app.nclsppr.workers.dev dist/web/release.json`. Inspect runtime capabilities and active Worker version after any secret update. Preview publication uses its separate configuration and remote browser suite described in [PUBLIC_PREVIEW.md](PUBLIC_PREVIEW.md). A dry-run, local test or successful asset upload alone is not release proof.
