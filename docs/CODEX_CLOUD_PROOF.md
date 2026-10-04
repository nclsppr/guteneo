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
- `npm run test:cloud`: 12 tests passed. Covers credential/response redaction,
  stdin-only authorization, proxy preservation, fixed GET endpoints, redirect
  refusal, request bounds, Cloudflare token/resource verification, malformed
  provider responses and bootstrap credential filtering/temporary-directory
  cleanup, including its private npm cache. Responses containing fixture secrets and private data remain absent
  from reports.
- `npm run lint`, `npm run typecheck`, Node/bash syntax and `git diff --check`
  passed.
- `npm run cloud:check -- --network --require=openai-docs`: the official
  Cloudflare, Telnyx and OpenAI documentation pages returned HTTP 200. Telnyx and
  Cloudflare API credentials reported `not_configured`, not success.

Dependency installation reported three existing advisories (two moderate, one
high). Dependencies were not changed by this development-access work.

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

Publication completed: the configuration panel displayed **Environment
published** and **Published** after the saved configuration review. The published
snapshot has not yet been exercised by a fresh task; provider authentication
also remains unverified.

## Still required for authenticated autonomy

No provider secret was created, exported, copied, or installed. The environment
currently has no network secrets and no provider environment variables.
Connected desktop accounts are not proof that a Cloud process has machine
credentials.

The existing Telnyx browser session and Cloudflare Google sign-in were usable.
Creation forms are prepared but were not submitted:

- Cloudflare: `guteneo-codex-cloud-read`, only **Workers Metadata Read-Only**, on
  the current shared account; the UI scope is the entire account, not one Worker.
  Expiration shown: 3 January 2027 (90 days). This does not grant D1, R2, DNS,
  script-content access, or write permissions. Compatibility with the exact
  diagnostic GET remains to be tested after creation.
- Telnyx: `GUTENEO-CODEX-CLOUD-DEV`, expires 2 January 2027 at 23:59 UTC.
  The form exposes tags and expiration but no read-only permission scope.
  This is a dedicated key on the current account, not an isolated sandbox.

The browser's at-action confirmation requirement for new persistent access is
pending. Neither a filled form nor approval of that form constitutes provider
authentication evidence.

Remaining work:

1. Create/reuse reviewed development credentials with the scope described in
   `CODEX_CLOUD.md`, then save them as network secrets or suitable temporary
   identities. Review Telnyx's actual permissions: its public API-key contract
   does not establish a read-only key. Do not copy production delivery secrets.
2. Run the required API GET probes in a fresh task with those credentials and
   replay the saved installation wrapper. Check runtime readiness and actual
   permission failures separately.
3. Configure optional services only with their appropriate identities. Auth0,
   Pingen, Resend, AWS, Stripe, OpenAI inference and ElevenLabs are inventoried,
   not configured or qualified by this change.
4. Keep Telnyx profile/rate-deck qualification distinct. The current documented
   V2 outbound-profile response does not expose the associated rate-deck URL or
   version; the historical portal-derived association cannot be refreshed by
   rereading a public CSV or by authenticating `GET /v2/balance`.

No real communication, paid supplier provisioning, production deployment,
production migration, merge, channel activation or expert mandate occurred.
