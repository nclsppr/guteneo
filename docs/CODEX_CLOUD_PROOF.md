# Codex Cloud setup evidence — 4 October 2026

This record distinguishes repository implementation, the hosted development
environment, and authenticated provider access. It does not certify all three
from one successful command. See [configuration and service inventory](CODEX_CLOUD.md).

## Repository implementation

Prepared in isolated branch `codex/cloud-development-access`, from `619c8b4`.
The original checkout and its unrelated local changes were preserved.

Executed locally:

- `npm run cloud:setup`: lockfile install, all 51 local D1 migrations, fixtures,
  web build and offline diagnostic passed. No remote D1 operation occurred.
- After adding private writable Wrangler and npm directories, the complete
  setup passed again on `8ff36a3`, including an actual `npm ci` with a fresh
  private cache (667 packages installed), local migrations/fixtures, web build
  and offline diagnostic. The temporary cache/runtime directory was removed
  and both the worktree and index remained clean.
- `npm run test:cloud`: initially 12 tests passed, then 13 after adding rejection
  of masked credential values. Covers credential/response redaction,
  stdin-only authorization, proxy preservation, fixed GET endpoints, redirect
  refusal, request bounds, Cloudflare token/resource verification, malformed
  provider responses and bootstrap credential filtering/temporary-directory
  cleanup, including its private npm cache. Masked credentials are rejected
  before authenticated curl calls. Fixture secrets and private data remain absent
  from reports.
- `npm run lint`, `npm run typecheck`, Node/bash syntax and `git diff --check`
  passed.
- `npm run cloud:check -- --network --require=openai-docs`: the official
  Cloudflare, Telnyx and OpenAI documentation pages returned HTTP 200. Telnyx and
  Cloudflare API credentials reported `not_configured`, not success.

Dependency installation reported three existing advisories (two moderate, one
high). Dependencies were not changed by this development-access work.

GitHub Actions run `37220703612`, attempt 2, passed on repository head
`3104b445d55219a5b89f6df1d2b8fa14976f1797`. The first attempt exceeded the
existing iPhone job timeout; rerunning the failed jobs succeeded. This CI result
does not prove Cloud provider authentication.

## Hosted environment

Created the current Codex Cloud environment `guteneo-dev-autonome` for the
already connected `nclsppr/guteneo` repository, with **Only me** privacy.
The setup machine eventually became ready after an initial provisioning delay.
The setup record is the private chat
[`Set up guteneo`](https://chatgpt.com/local/01a107d9-8d60-7154-9542-fe15ecc1904d?hostId=local).

The hosted setup executed and reported:

- Node 24, dependency installation, local migrations/fixtures, build/typecheck,
  lint, and the existing developer feature-map check passed.
- Four representative test files: 95 tests passed.
- Chromium: one actual login/PDF upload/preview test passed.
- Local homepage returned HTTP 200; local application and PDF renderer started.
- The HTTP smoke script passed 19 assertions, then failed
  `mcp_has_no_human_approval_tool`. Its assertion rejects every tool name
  containing `approve`, including the current delegated
  `approve_and_send_dispatch`. This failure was retained in the setup report;
  it is not an entirely passing smoke suite.
- The setup restored its generated tracked reports and left the checkout clean.

Saved configuration includes the tested installation commands, writable npm and
Wrangler directories, and startup instructions with plugin-independent API/docs
fallbacks. The final install command wraps those commands in a reduced
environment excluding provider credentials; its filtering pattern is tested
locally, but the amended wrapper has not yet been replayed by a fresh Cloud task.
The Package managers preset is supplemented with seven exact hosts:
`developers.openai.com`, `learn.chatgpt.com`, `developers.cloudflare.com`,
`developers.telnyx.com`, `api.cloudflare.com`, `api.telnyx.com`, `api.github.com`.

Publication completed again after saving the two network secrets and clearing
the duplicated editor contents: the panel displayed **Environment published**
and **Published**. The corrected published snapshot has not yet been exercised
by a fresh task; authenticated results from the existing Cloud setup runtime
are distinguished below.

## Dedicated credentials

After the user's explicit confirmation, two reviewed credential types were created
and saved as environment-owned network secrets. The environment remains
**Only me**. API credential values were not written to repository files,
command arguments or reports. Connected desktop accounts alone remain
insufficient evidence of authentication in a Cloud process.

- Cloudflare: `guteneo-codex-cloud-read`, only **Workers Metadata Read-Only**, on
  the current shared account; the UI scope is the entire account, not one Worker.
  Expiration shown: 3 January 2027 (90 days). This does not grant D1, R2, DNS,
  script-content access, or write permissions. Compatibility with the exact
  diagnostic GET passed in the existing hosted setup runtime.
- Telnyx: `GUTENEO-CODEX-CLOUD-DEV`, expires 2 January 2027 at 23:59 UTC.
  The form exposes tags and expiration but no read-only permission scope.
  This is a dedicated key on the current account, not an isolated sandbox.

The Cloudflare credential is saved as `CLOUDFLARE_API_TOKEN`, restricted by the
Cloud proxy to `api.cloudflare.com`; Telnyx is `TELNYX_API_KEY`, restricted to
`api.telnyx.com`. Saved plain variables specify the Cloudflare account,
`CLOUDFLARE_TOKEN_OWNER=account`, and `CLOUDFLARE_WORKER_NAME=guteneo-app`.
Domain restriction does not reduce Telnyx's native API permissions. No sending
authority is inferred from possession of the key.

The first Telnyx attempt returned HTTP 401 because the portal's displayed key
was masked. Equivalent replacements retained the same tag, scope and expiry;
the three superseded development keys were deactivated. The complete value was
obtained through the portal's official copy action, verified in a temporary
local document, then stored in the Cloud secret. That document was cleared and
discarded without saving; the system clipboard was cleared. The checker now
rejects values containing `*` before authenticated requests.

An appended copy of the original install/start scripts was detected in the UI.
The editors were cleared and replaced before launching credential validation;
the corrected installation script contains only the reduced-environment
wrapper. The corrected configuration was saved and published successfully.

The current environment does not appear in the local `codex cloud` CLI's
environment picker. That CLI offered only the older `papersempire` and
`personal` environments; no environment ID was guessed. Validation must use
the current Cloud interface that owns this environment.

## Hosted authenticated probe

The existing hosted setup machine executed the diagnostic from exact commit
`3104b445d55219a5b89f6df1d2b8fa14976f1797` using a private temporary script,
preserving the managed HTTPS proxy and CA. Current runtime observations
reported both requested secrets present and `ready`.

- Cloudflare account-token verification: HTTP 200, verified.
- Cloudflare `guteneo-app` script settings: HTTP 200, verified; settings discarded.
- OpenAI, Cloudflare and Telnyx public documentation: HTTP 200.
- First Telnyx balance attempt: HTTP 401, `authentication_rejected`; retained
  as failure evidence, not relabelled as success after key replacement.

The temporary script was removed and checkout/HEAD remained unchanged. This
is actual Cloud authentication evidence for the successful GETs, but it uses
the existing setup machine, not a fresh task restored from the latest published
snapshot. The subsequent Telnyx probe is recorded when completed.

After the complete Telnyx value was saved and republished, the same Cloud
diagnostic reported `ok: true`: Cloudflare and Telnyx both `verified_get`,
HTTP 200; all three documentation sites HTTP 200. Both selected proxy
placeholders reported `containsAsterisk: false`, so the masked-key guard is
compatible with these runtime credentials. This second probe retained the
same setup-machine limitation. The shell tool reported exit code 1 despite
the successful JSON result and cleanup confirmations; the authenticated GET
GET evidence is valid; the inconsistent shell exit required a separate check.

A subsequent hosted execution used the hardened diagnostic from
`9a86fe65567cf1541e358c93a545d8772818c013`. It confirmed the SHA256
`2c612b31904421237060e3f0cae0ea1226d1c79ee088f7b52a718f107933a006`,
`ok: true`, all five service checks HTTP 200, and **Node exit code 0** captured
immediately and confirmed by the shell. The earlier shell exit discrepancy
remains unexplained; it is not used as successful command-exit proof.

The non-secret helper is retained at
`/workspace/.codex-cloud/guteneo-cloud-check.mjs` (directory 0700, file 0600),
outside Git, so the saved start skill can run it before this PR is merged.
No credential value is embedded in that helper.

The exact saved installation wrapper was then replayed on the hosted setup
machine: exit 0, dependency install, local migrations/fixtures and build passed.
It contained one `env -i`, no provider credentials passed to dependencies and
no commands after `LOCAL_SETUP`. One additional actual Chromium
login/import/PDF-preview scenario passed. Checkout and HEAD stayed unchanged.
This validates the saved commands and current provider access together, but
still does not prove restoration into a new task from the published snapshot.

The helper and amended start skill were finally saved and republished. The
configuration panel again displayed **Environment published** and **Published**.

## Remaining verification

Remaining work:

1. Verify helper availability, current secret readiness and the required API
   GETs in a fresh task restored from this final snapshot. The exact saved
   installation wrapper already passed on the setup machine.
2. Configure optional services only with their appropriate identities. Auth0,
   Pingen, Resend, AWS, Stripe, OpenAI inference and ElevenLabs are inventoried,
   not configured or qualified by this change.
3. Keep Telnyx profile/rate-deck qualification distinct. The current documented
   V2 outbound-profile response does not expose the associated rate-deck URL or
   version; the historical portal-derived association cannot be refreshed by
   rereading a public CSV or by authenticating `GET /v2/balance`.

No real communication, paid supplier provisioning, production deployment,
production migration, merge, channel activation or expert mandate occurred.
