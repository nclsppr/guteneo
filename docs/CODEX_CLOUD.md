# Codex Cloud development access

Prepared 4 October 2026 for `nclsppr/guteneo`. This setup removes interactive
desktop plugins from the development prerequisites. It does not grant a Guteneo
expert mandate, authorize communications, or authorize production deployment.

## Reusable environment

Use the current **Codex Cloud**, not **Legacy Codex Cloud**, in
[settings](https://chatgpt.com/settings/codex-cloud). Environment name:
`guteneo-dev-autonome`; repository: `nclsppr/guteneo`; privacy: **Only me**.
The initial setup uses the repository's main branch. The scripts in this change
become available when the selected checkout contains this change; do not claim
they are installed merely because this document exists on a local branch.

Prerequisites: Node.js >=22.16, npm, Git, bash, curl, and the system libraries
needed by workerd. From the repository root:

```sh
npm run cloud:setup
npm run typecheck
npm run lint
npm run test:cloud
npm run cloud:check -- --network --require=openai-docs
```

The setup runs `npm ci`, local D1 migrations and fixtures, and the web build.
It passes a reduced environment to these commands, retaining proxy/CA settings
but excluding provider credentials and arbitrary Node/npm startup options.
It gives npm a private writable cache and Wrangler temporary writable
configuration/log directories, and does not create `.env` or `.dev.vars` files. Existing local credential files
must not be included in a published filesystem snapshot.

On Linux, `npm run cloud:setup -- --with-browser` extracts package-owned Chromium
for `GUTENEO_BUNDLED_CHROMIUM=1`. This does not install WebKit or system libraries
and does not qualify native SwiftUI/Xcode tests. Start simulation with `npm run
dev`; the default `wrangler.jsonc` uses local bindings and simulation. Preserve
the distinction between simulation, supplier sandbox, and real account evidence.

## Credentials and network

Current Cloud has **Network secrets**: the process receives a placeholder, and
the HTTPS proxy substitutes the real value only for allowed destinations on
port 443. These work during setup **and** agent tasks. This differs from Legacy
Cloud's setup-only secrets. Do not copy a setup-only secret into a file to work
around that boundary. [OpenAI environment documentation](https://learn.chatgpt.com/docs/environments/cloud-environments#environment-variables-and-secrets)

Save credentials in the environment or its personal vault; use one key per
provider, scoped to this environment. Request the same key in the environment:
vault entries alone are not injected. A proxy placeholder is not a missing or
invalid key. Keep the runtime proxy and CA settings; never use `--noproxy`,
disable certificate checks, or print the process environment when diagnosing it.

Use the **Package managers** network preset and add the exact domains needed:

- Core documentation: `developers.openai.com`, `learn.chatgpt.com`,
  `developers.cloudflare.com`, `developers.telnyx.com`.
- Core APIs: `api.cloudflare.com`, `api.telnyx.com`.
- GitHub API, when needed beyond the repository connection: `api.github.com`.
- Optional services: only their exact hosts from the table below when configured.

Saving environment-owned network secrets adds their domains to the network
policy. Personal secrets and plain variables do not do that automatically.
Review, save and publish the environment; then verify in a **new task**. An
existing task keeps its own state. Desktop login, saved settings, a nonempty
variable, and a local successful probe are not proof of access from that task.

## Service inventory and least privilege

| Service              | Autonomous access and configuration                                                                                                                                                                                                                                                         | Boundary                                                                                                                                                                                                                                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cloudflare           | `CLOUDFLARE_API_TOKEN` network secret for `api.cloudflare.com`; plain `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_TOKEN_OWNER=account` or `user`. Prefer an account-owned token with only required read permissions on the Guteneo account/resources.                                           | The check verifies the token, then reads script settings for `CLOUDFLARE_WORKER_NAME` (default `guteneo-app`), discarding the returned settings. A successful verification alone does not prove resource access. Write access to a separate development resource is a separate permission; do not give production edit rights just to make diagnostics pass.       |
| Telnyx               | Dedicated `TELNYX_API_KEY` network secret for `api.telnyx.com`. `TELNYX_CONNECTION_ID` and the relevant outbound profile identify the target application for later detailed inspection.                                                                                                     | The check makes only `GET /v2/balance` and discards the balance. The public key-creation documentation does not establish a native read-only scope. A domain-restricted secret can still call sending APIs if its underlying key permits them. Prefer an isolated development identity or an independently enforced read-only gateway before broad autonomous use. |
| OpenAI documentation | Public `https://developers.openai.com/mcp` and official HTTPS documentation. No API key needed.                                                                                                                                                                                             | The desktop OpenAI Developers plugin is optional. A public docs connection does not give API, billing, marketplace or organization administration.                                                                                                                                                                                                                 |
| OpenAI API / studio  | Optional dedicated project API key for `api.openai.com`. Generic tooling uses `OPENAI_API_KEY`; Guteneo's adapter expects `DATASET_OPENAI_API_KEY` and explicit `DATASET_OPENAI_MODEL`.                                                                                                     | Do not create two unrelated keys accidentally or copy another project's key. The studio's browser administrator policy and consent to data transfer remain required. This setup does not enable generation or make a billable test call.                                                                                                                           |
| GitHub               | Reuse the connected repository. If CLI actions require another identity, a `GH_TOKEN` network secret limited to this repository and `api.github.com` / `github.com`.                                                                                                                        | No personal account-wide token or automatic merge. The connected repository is not proof that `gh` API operations are authenticated.                                                                                                                                                                                                                               |
| Auth0                | Dedicated machine application on the correct development tenant; e.g. `AUTH0_MGMT_CLIENT_ID`, `AUTH0_MGMT_CLIENT_SECRET`, `AUTH0_DOMAIN`. Request only required Management API read scopes. Exact host for the existing tenant is `pieper.eu.auth0.com`.                                    | The existing browser/BFF client secret is not a Management API credential. The current tenant also hosts other products; do not give a general cloud task broad access to its users or clients.                                                                                                                                                                    |
| Pingen               | `PINGEN_CLIENT_ID`, `PINGEN_CLIENT_SECRET`, `PINGEN_ORGANIZATION_ID`, explicit `organisation_read` OAuth scope for read access. Use the supplier sandbox for development. Hosts `identity.pingen.com` / `api.pingen.com`, or the sandbox hosts actually selected by the adapter.            | Client-credential renewal can run without human login. Requesting no scope can grant all the client's scopes. Uploading a document, changing webhooks, and sending are separate operations.                                                                                                                                                                        |
| Resend               | `RESEND_API_KEY` network secret for `api.resend.com`, with exact `RESEND_ACCOUNT_ID` / `RESEND_DOMAIN_ID` where applicable.                                                                                                                                                                 | Existing Sending access keys may legitimately return 403 on domain reads. Report this restriction; do not widen to Full access automatically. Prefer sandbox/isolated development facilities for sending tests.                                                                                                                                                    |
| AWS SES/SNS          | Prefer temporary credentials/role limited to inspection (`eu-west-3` for the qualified Guteneo setup). `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, optional `AWS_SESSION_TOKEN`. Exact endpoints include `sts.eu-west-3.amazonaws.com` and `email.eu-west-3.amazonaws.com`. | SigV4 needs the real signing secret in the signing process; a substituted placeholder is not enough. Use supported OIDC/role access where available, or a separately controlled direct credential. Do not copy a sending principal. OIDC availability depends on the Cloud workspace.                                                                              |
| Stripe               | Optional restricted **test-mode** `STRIPE_API_KEY` for `api.stripe.com`; the runtime calls its mode `STRIPE_MODE`.                                                                                                                                                                          | The existing production setup form rejects test keys; it is not the Cloud development configuration flow. Billing activation, live keys and charges are outside setup.                                                                                                                                                                                             |
| ElevenLabs           | Optional dedicated `ELEVENLABS_API_KEY` for `api.elevenlabs.io`, if narration work requires it.                                                                                                                                                                                             | Existing video editing works with archived audio. `generate-narration.mjs` deliberately rejects the unqualified v4 adapter; having a key does not qualify or activate it.                                                                                                                                                                                          |

Do not copy webhook secrets, protected-document encryption keys, URL-signing
keys, customer documents, production cookies, or desktop OAuth token caches.
They do not fix missing Cloud plugins. Inventory is not a claim that each
provider above has been provisioned or verified.

## Plugin-independent workflow

For documentation, use official HTTPS pages directly when the docs MCP is absent.
For a client that supports MCP configuration, OpenAI's anonymous docs server is:

```toml
[mcp_servers.openaiDeveloperDocs]
url = "https://developers.openai.com/mcp"
```

This snippet is not a claim that the Cloud host imports local `config.toml` or
syncs desktop plugins. The documented fallback is direct HTTPS. Personal skills
on the desktop do not sync automatically; repository instructions do.

Use direct authenticated APIs or the installed Wrangler CLI for supported
provider work. Do not run `wrangler login` in an unattended cloud task. A missing
machine credential should block only the operation requiring that provider;
continue source changes, local simulation, builds and tests.

The existing `scripts/provider-readiness.mjs` calls private inspections without
exporting deployed supplier keys, but it is **not** the default Cloud fallback:
its `ProviderInspection` binding also exposes webhook configuration and a
synthetic Pingen mutation. Wrangler remote bindings create a preview session;
do not describe this capability as read-only or grant broader production rights
to obtain it. Its detailed response can include owned numbers and must not be
copied into general logs. A future strictly read-only gateway requires separate
implementation, deployment authority and qualification.

Telnyx tariff qualification remains separate: a successful API read does not
refresh the observed outbound-profile-to-rate-CSV association required by
`REVIEW_FAX_OPERATOR.md`. Do not relabel old evidence or extend its expiry.

## Redacted checks and proof

```sh
# Configuration only; no network, no credential values.
npm run cloud:check

# Fixed GETs, no redirects, no retries, no provider payloads in output.
npm run cloud:check -- --network --require=cloudflare,telnyx,openai-docs
```

The command reports missing configuration, unverified configuration, authentication
failure, access denial, network errors, and verified GETs separately. A 403 can
come from either a provider or the Cloud proxy; inspect the environment's network
policy and credential readiness before deciding which. Credentials enter curl
through stdin, not arguments or temporary files. A verified GET proves exactly
that read, not unrestricted provider functionality, scope safety, real delivery,
rate qualification, or OpenAI inference quota.

Before calling the environment autonomous, record all of the following:

1. Saved and published environment with the intended repository and privacy.
2. Requested secrets available in a fresh agent task, with current runtime
   readiness observations where supported.
3. Required provider GETs pass in that task; outputs contain no secret or private
   provider payload. Any intentionally unavailable service is identified.
4. Local simulation/build/tests pass without interactive provider login.
5. Provider permissions were reviewed independently of probe success.

Live setup progress and remaining steps are recorded in `CODEX_CLOUD_PROOF.md`.

## Primary references

- [Current Codex Cloud configuration](https://learn.chatgpt.com/docs/environments/cloud-environments)
- [OpenAI public documentation MCP](https://developers.openai.com/learn/docs-mcp)
- [Cloudflare account-owned tokens](https://developers.cloudflare.com/fundamentals/api/get-started/account-owned-tokens/)
- [Cloudflare script-settings GET and required read permission](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/settings/methods/get/)
- [Cloudflare Worker authorization roles](https://developers.cloudflare.com/workers/authorization/workers/)
- [Telnyx API key creation and GET verification](https://developers.telnyx.com/docs/development/api-fundamentals/create-api-keys)
