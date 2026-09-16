# Hosted beta release — 2026-09-16

Guteneo has two separate hosted surfaces. `https://guteneo.com` is the public design preview, with fictional per-tab data. `https://guteneo-app.nclsppr.workers.dev` is the production-mode application backend. The root domain will move to that application after managed identity is configured and a real login is verified.

## Deployed foundation

The backend bootstrap deployed as `guteneo-app`, version `83ac4676-395f-4738-8cad-9bb293f94374`, before the final v0.2 code was committed. That bootstrap is not evidence that every current repository change is already served. Secret updates create subsequent Worker versions. The final code release must be verified against its public `/release.json` and Cloudflare deployment identity.

The backend has EU-jurisdiction D1/R2, interactive/bulk/dead-letter queues, and private scanning/rendering services. Resource identifiers, jurisdiction limits and setup evidence: [CLOUDFLARE_SETUP.md](CLOUDFLARE_SETUP.md). Migrations 0001–0013 were applied remotely, with clean integrity and foreign-key checks: [D1_MIGRATION.md](D1_MIGRATION.md).

Private services have independent release identities:

- `guteneo-scanner`: Worker `c753afc4-9310-4738-b3f2-5110f55f611e`, container `a03030c0-8135-4234-8e86-ec7016ec5e16`. Real ClamAV clean/EICAR/hash checks passed, with EU placement observed at `cdg08`.
- `guteneo-documents`: Worker `f38ce894-066a-4fb2-8e9f-fc8145b576e0`. Real Cloudflare Browser Run HTML-to-PDF and exact-byte parsing passed.

Neither service has a public route or workers.dev hostname. The scanner stops after two idle minutes; the instance was observed inactive after qualification. Definitions currently require an operator's daily rebuild/redeploy, and fail closed once older than 72 hours. See [SCANNER.md](SCANNER.md).

## Configuration installed

Cloudflare secret-name inspection confirms `TELNYX_API_KEY`, `TELNYX_PUBLIC_KEY` and `TELNYX_CONNECTION_ID`. Values are not included in source, release metadata or this document. The key expires on 2026-12-15 at 23:59 UTC. Telnyx application `Guteneo` has callback `https://guteneo.com/webhooks/telnyx`, outbound profile `Default` and concurrency limit 1. No owned number was present at inspection; `TELNYX_FROM` is absent.

Auth0 CLI authentication has expired and no real signup has completed. The isolated setup utility is ready but has not changed the tenant. Its exact prerequisites and official login procedure are in [AUTH0_SETUP.md](AUTH0_SETUP.md). Stripe is also unconfigured; billing pages expose that state rather than displaying invented invoices.

## Activation boundaries

- Registration requires the managed identity domain, browser client, audience and secret, then an actual verified-email/MFA login. Account/profile/team/session features are tested locally but are not advertised as accessible hosted accounts yet.
- Real fax requires qualified account tariffs, an owned verified sender, funded organizational quotas, enabled channel policy and explicit human approval of the immutable document/recipient/cost. `LIVE_SENDS_ENABLED=false` remains in production.
- MCP and downloadable host packages are implemented and tested through the official protocol transport. ChatGPT, Claude and Cursor account/OAuth/file-transfer qualification remains open. Packages are installable configuration artifacts, not a marketplace publication or proof of a successful host connection.
- No fax, postal letter, real email, Stripe charge or automatic credit refill was performed during this release.

## Verification procedure

Build from a clean committed source with `npm run build:live`, deploy `wrangler.live.jsonc`, then compare the deployed `/release.json` source commit and every public asset hash against the local manifest. `_headers` is a Cloudflare configuration file, not a served asset; verify resulting security response headers separately. Run `node scripts/verify-release.mjs https://guteneo-app.nclsppr.workers.dev dist/web/release.json` to perform the source/asset/header comparison. Inspect `/api/health`, `/api/capabilities`, anonymous protected routes, Worker version/bindings and secret names. A successful dry-run or passing local fixture is not public release proof.

The preview follows its separate build/deploy/remote-browser procedure in [PUBLIC_PREVIEW.md](PUBLIC_PREVIEW.md). CI verifies the application, scanner, migration transport and both bundles but does not publish or merge the open PR.
