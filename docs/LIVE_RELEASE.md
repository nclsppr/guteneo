# Hosted continuation — 2026-09-17

Guteneo has two hosted surfaces. **https://guteneo.com** is the public design preview with fictional per-tab data. **https://guteneo-app.nclsppr.workers.dev** serves the production-mode backend and the same visual updates. The planned identity rollout first deploys and verifies the configured backend, then moves the root domain to it with live sending disabled, and finally qualifies actual signup and reconnection on the canonical callback. If authentication fails, restore the preview domain route. The PR remains open and unmerged.

## Published source and public evidence — historical release `8f39014`

| Surface | Clean source commit | Active Worker version | Verified public assets |
| --- | --- | --- | --- |
| Design preview | `8f39014b8ebf9b38b5e3f217393bdce2d4507c17` | `ae250f7f-dfdf-4f6b-a70c-1c38d92fe0e0` | 44 |
| Application backend | `8f39014b8ebf9b38b5e3f217393bdce2d4507c17` | `e86ba7b2-c3b3-43e4-bb76-a8741236c627` | 46 |

Both deployments above serve 100% of traffic, verified through the Cloudflare deployment API. Each asset was compared with its clean local SHA-256 manifest, including nested `index.html` files through their canonical directory URLs. `_headers` is configuration, checked through resulting response security headers. Machine-readable evidence: `reports/live-release-proof.json` and `reports/preview-release-proof.json`.

Backend snapshot: `b6aa291a7ca49ba742f90d73e2063488379c6db4a71b82c56b84443c6f06d41f`. Preview snapshot: `16f20ee339b3d2312f2a4db475e458d5af1d6f16cb52ee3d1be67bfedc8706e9`. Public manifests: [preview](https://guteneo.com/release.json), [backend](https://guteneo-app.nclsppr.workers.dev/release.json).

CI passes for exact current source `8f39014`: [verification](https://github.com/nclsppr/guteneo/actions/runs/35164317625) and [verification](https://github.com/nclsppr/guteneo/actions/runs/35164314191). The public journal, both illustrated history articles and legal page are published with complete initial HTML and verified security headers. Twenty remote browser checks passed on the preceding `25e2f61` deployment; the final release preserves those visible assets and adds the backend header-policy regression fix. Current manifests and HTTP header checks were rerun after both final deployments.

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

The published release snapshot above reported production mode, registration disabled, billing unconfigured, scanner/rendering connected, all three provider credentials configured but not live-validated, and **`LIVE_SENDS_ENABLED=false`**. Its identity checks failed closed before the later Auth0 provisioning. This historical snapshot is not a fresh capability check after credential installation. Public design data stays separate from D1/R2 and never sends documents.

On 17 September the official Auth0 CLI session was renewed, the three dedicated Guteneo clients, database connection, API and two Actions were provisioned, and the browser credentials were installed privately in Cloudflare. The user explicitly retained the Free plan. The local candidate uses the `verified_email` policy and migration0019; these changes are not part of the published `8f39014` source. A real signup, received verification email, signed verified-account evidence and completed browser session still need qualification before account activation is claimed. MFA is optional in this policy; the legacy default remains strict. See [AUTH0_SETUP.md](AUTH0_SETUP.md).

The browser client's registered callback is `https://guteneo.com/auth/callback`. A complete browser session therefore requires the root domain to reach the backend; a login started on `workers.dev` cannot qualify that flow because its host-only login cookie does not accompany the canonical callback. Verify the configured Universal Login and backend release first, then switch the domain and start a fresh signup from `guteneo.com`. Keep `LIVE_SENDS_ENABLED=false` throughout and verify reconnection, logout and the EUR50 account balance separately. Returning the domain to the preview disables the account API without deleting provisioned identities or account records; subsequent qualification must start a new login.

Stripe tracking is implemented but credentials and actual billing qualification remain absent. Qualified account tariffs, sender/country policy, funded budgets, signed callbacks and immutable human approval remain prerequisites for any communication. Host-specific OAuth/PDF transfer in ChatGPT, Claude and Cursor remains untested; downloadable packages do not imply marketplace publication or an operational host connection.

No real fax, postal letter, email, Stripe charge or automatic credit refill was performed. See [EXECUTION_PLAN.md](EXECUTION_PLAN.md) for the remaining implementation and activation work.

## Private infrastructure

D1 and R2 use EU jurisdiction; interactive, bulk and dead-letter queues are configured. `guteneo-scanner` previously passed real ClamAV clean/EICAR/hash checks with EU placement observed, and `guteneo-documents` passed actual Browser Run rendering/exact-byte parsing. These services have no public route. Scanner definitions require regular rebuilds and fail closed after 72 hours; prior qualification is distinct from current definition freshness. Details: [CLOUDFLARE_SETUP.md](CLOUDFLARE_SETUP.md), [SCANNER.md](SCANNER.md).

## Repeatable proof

Build clean committed source, deploy the intended Wrangler configuration, then run `node scripts/verify-release.mjs https://guteneo-app.nclsppr.workers.dev dist/web/release.json`. Inspect runtime capabilities and active Worker version after any secret update. Preview publication uses its separate configuration and remote browser suite described in [PUBLIC_PREVIEW.md](PUBLIC_PREVIEW.md). A dry-run, local test or successful asset upload alone is not release proof.
