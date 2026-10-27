# Auth0 browser and MCP custom domain

The browser login can use `auth.guteneo.com` while
preserving the Auth0 tenant, Guteneo accounts, workspaces, account restrictions,
assistant connections and canonical identity namespace. It introduces no new account,
OAuth client, scope, role, approval authority or delivery activation.

Implementation, verified Auth0/DNS configuration, production activation and actual
browser/assistant qualification are separate evidence. The existence of a custom
domain or a passing test does not establish an active login on that domain.

## Identity and endpoint contract

`AUTH0_DOMAIN=pieper.eu.auth0.com` remains the canonical issuer
`https://pieper.eu.auth0.com/`. Do not replace it as part of this browser change.
That namespace identifies the signed subject in `auth_identities`,
`restricted_delivery_identities`, `authorized_connections`, expert/postal authority
and `browser_identity_evidence`. It remains the server-owned MCP signing-key
source. MCP discovery and additional token trust have separate explicit settings
below; neither changes these data keys.

The optional server setting `AUTH0_BROWSER_DOMAIN=auth.guteneo.com` changes only
new browser authorization requests. This is an explicit, code-reviewed alias for
that one canonical Auth0 tenant. No arbitrary domain, request parameter, email,
unverified `iss` claim or discovered JWKS URL can create an alias. An unsupported
setting fails before starting a browser transaction. Leaving the setting absent
retains the current canonical login.

New browser authorization transactions bind two server-owned fields:

- `authorization_issuer`: exact issuer used for `/authorize`, `/oauth/token`,
  browser ID/access-token verification and the matching JWKS endpoint.
- `identity_issuer`: canonical namespace used only after both tokens have passed
  signature and claim verification.

Both browser tokens must be RS256-signed by the selected issuer, have the existing
exact audience, required subject/issued-at/expiry and maximum age, and agree on
subject. The ID token must carry the transaction nonce. Existing verified-email,
verified-account, administrator MFA, membership and session rules still apply.
A matching email never links two subjects. Browser access tokens remain confined
to this login exchange; they are not stored or returned to the browser.

The callback stores/reuses the exact signed subject under the canonical namespace,
including evidence consumed by Belvédère. Reconnecting through the custom domain
does not create a second user or welcome-credit grant. A reviewer restriction
installed before the first login still joins the resulting canonical identity.
Existing application browser sessions remain usable until their normal expiry.
Auth0's own SSO cookies belong to their provider domain, so switching domains may
require a fresh provider login.

The browser setting alone leaves MCP discovery and validation canonical.
Custom-domain MCP tokens require the independent opt-in described below.
Existing assistant registrations, refresh credentials and public OpenAI plugin
identity are neither replaced nor automatically reauthorized.

Public developer documentation identifies the preferred custom authorization
endpoints and directs clients to served resource discovery; historical canonical
clients remain compatible. The native application enters through the server-owned
`/auth/mobile/authorize` path on `guteneo.com`; it embeds no Auth0 hostname.
Management scripts, canonical identity records and historical evidence must not
undergo a global hostname replacement. Auth0 email
and phone-notification domain selection is a separate provider setting; it is
not changed by this browser opt-in. Its separately applied configuration and
qualification are recorded below.

## Browser and email activation — 27 October 2026

The production release configuration now explicitly sets
`AUTH0_BROWSER_DOMAIN=auth.guteneo.com`. The missing browser setting explained why
new browser sign-ins still selected the canonical tenant even though MCP
discovery already used the custom domain. Keep `AUTH0_DOMAIN` unchanged: the
existing issuer-bound transactions, canonical identities and legacy MCP tokens
retain the contract above. This source setting takes effect only through the
normal reviewed production release.

The authorized Auth0 maintenance separately set
`flags.enable_custom_domain_in_emails=true` after a fresh Management API read
confirmed that `auth.guteneo.com` was the ready, primary, Auth0-managed domain.
The API readback confirmed the flag and preservation of all previous tenant
flags. This is a **tenant-wide email-link setting**, not a per-template rewrite:
it also affects other applications still using this tenant. Existing verification
email templates retain Auth0's generated `{{ url | escape }}` value; never replace
its hostname manually or reconstruct its signed ticket. No template, sender,
provider credential or real email was changed or sent by this operation.

For maintenance, inspect `GET custom-domains` and `GET tenants/settings` through
the authenticated Auth0 CLI for `pieper.eu.auth0.com`; never infer live access
from the saved tenant name. The minimal email patch is
`{"flags":{"enable_custom_domain_in_emails":true}}`. Reread the setting and
domain after a write. A missing/unready primary domain, permission refusal or
uncertain response stops further changes; inspect before retrying. Reverting
the email flag is separate from browser/MCP discovery rollback and does not
rewrite already-issued email links.

The same maintenance enabled the Auth0 top-level
`authorization_response_iss_parameter_supported` property and added the exact
stable OpenAI callback to the existing public ChatGPT client, preserving its
previous callback, grant types and authentication method. Both custom and
canonical OIDC discovery documents then advertised issuer identification.
Anonymous `prompt=none` probes to both registered ChatGPT callbacks on both
domains returned `login_required` and the exact matching `iss`, without an
authorization code. The [assistant setup contract](LLM_SETUP.md) owns the
preconfigured plugin client and installation behavior.

The Google social connection was not enabled for the Guteneo browser or ChatGPT
clients at inspection; its developer-key configuration therefore does not qualify
Google sign-in and was left unchanged. Auth0 configuration readback and anonymous
redirects are provider evidence only. Receipt of a newly issued verification
email, successful browser callback and a real ChatGPT token exchange remain
separate qualification steps; no such success is implied by these checks.

## Independent MCP trust and discovery

The 25 October MCP migration uses two server settings. They are not browser
parameters, OAuth scopes, tenant-admin changes or client-registration controls.

| Setting                    | Default                       | Accepted configuration                                                     |
| -------------------------- | ----------------------------- | -------------------------------------------------------------------------- |
| `AUTH0_MCP_TRUSTED_DOMAIN` | Absent: canonical tokens only | `auth.guteneo.com`, only with canonical `AUTH0_DOMAIN=pieper.eu.auth0.com` |
| `AUTH0_MCP_DISCOVERY`      | `canonical`                   | `canonical` or `custom`; `custom` requires the valid trusted domain        |

An unknown choice, malformed URL, foreign tenant/domain or missing trusted alias
with custom discovery fails closed before discovery or production token
authentication. `AUTH0_BROWSER_DOMAIN` cannot activate MCP trust. New clients
discover `https://auth.guteneo.com/` only when the explicit custom choice is
active; its OAuth metadata must return that exact issuer including trailing slash.
Audience/resource stays `https://guteneo.com/mcp`; `/authorize` and `/oauth/token`
remain on the issuer selected by the host's own discovered metadata.

When trust is configured, access tokens from both exact issuers are checked with
RS256 against the canonical tenant's cached JWKS, the unchanged audience,
required subject/issued-at/expiry and one-hour maximum age/lifetime. The approved
alias belongs to that same tenant and uses its signing keys. No token claim,
request, metadata URL or arbitrary issuer can choose another JWKS endpoint.
`McpIdentity.verifiedTokenIssuer` records the actual issuer only after validation;
it does not rewrite the JWT. Current verified-account/MFA policy and consented
scopes still apply. Authentication adds no second signing-key request for the alias.

After verification, identity/connection/revocation/not-before lookups keep the
canonical issuer and exact signed subject/client. Postal SQL fences and expert
status compare the JWT to the verified issuer snapshot while querying the same
canonical connection and mandate. The four membership roles and independent
supervisor options keep their existing permissions. An assistant remains a
separate OAuth actor: domain selection grants no scope, membership, human
approval, personal-vault access or expert/postal mandate. Browser/native sign-in
and all browser-only consent/purchase controls retain their contracts.

Release order is reviewed code/tests/CI first, then explicit deployment of both
MCP settings after checking TLS, both issuers and their signing keys. No new Auth0
client, grant, DCR/CIMD setting, callback, audience, social provider or paid feature
is required by this application change. Cached legacy client metadata and
canonical refresh endpoints remain valid. A host that rediscovers the custom
domain may need a fresh Auth0 login because provider SSO cookies are domain-bound.

For a discovery rollback, set only `AUTH0_MCP_DISCOVERY=canonical`; retain
`AUTH0_MCP_TRUSTED_DOMAIN` so already-connected custom clients can continue using
their issued/refreshed credentials. Removing trusted-domain configuration is a
separate deliberate trust revocation and rejects custom tokens, not a safe
discovery rollback. Do not rewrite records or replace/revoke existing reviewer
connections to manufacture evidence. Actual host consent, renewal and revocation
need bounded connected qualification; metadata and synthetic JWT tests do not
prove those journeys.

## Additive migration and configuration order

Migration `0054_auth_transaction_issuers.sql` adds two nullable fields to
`auth_transactions`; it rewrites no identities, restrictions, sessions,
connections or business records. Apply this additive migration through the
normal authorized release process before activating the new application code.
Old code can continue inserting rows while the new nullable fields exist.

A legacy transaction with both issuer fields NULL uses the canonical domain,
even if browser custom-domain login has since been enabled. A newly bound
canonical transaction also completes at the canonical endpoint after opt-in.
A bound custom-domain transaction completes at the custom endpoint if the
browser setting is removed. An incomplete pair, unknown endpoint or changed
canonical namespace fails before token exchange. State/browser-cookie binding,
600-second expiry, single-use deletion, PKCE and nonce remain mandatory.

Production activation requires a separate authorization and these checks:

1. Keep the existing `pieper` Auth0 tenant and browser client. Verify the custom
   domain and managed certificate in Auth0; keep its required DNS record for
   certificate renewal. A Cloudflare CNAME must remain DNS-only when using
   Auth0-managed TLS. Do not enable a paid or self-managed certificate feature.
2. Check HTTPS, OIDC issuer/endpoints and signing keys at the custom domain against
   that same tenant. Preserve the API audience and canonical application
   callback `https://guteneo.com/auth/callback`, allowed origins and logout URLs.
   The application remains available only at `https://guteneo.com`.
3. Inspect every enabled social identity provider before activation: a provider
   needs its own approved `https://auth.guteneo.com/login/callback` URI and
   suitable provider keys. Auth0 developer keys cannot qualify this path. Do not
   remove the existing canonical callbacks. Custom Auth0 email links are a
   separate setting; this candidate does not change them.
4. Complete exact-source tests, review, CI and the authorized main release before
   setting the optional `AUTH0_BROWSER_DOMAIN`. Keep `AUTH0_DOMAIN`, audience,
   client ID/secret and all delivery gates unchanged.
5. Qualify actual browser login, callback, same account/workspace and preferences,
   session/logout/account switching, and the native browser entry separately.
   Check an existing assistant connection and reviewer restriction using bounded
   operations. A successful reconnection is not refresh-token proof; capture
   actual refresh and revocation evidence separately without revoking the active
   review connection merely to produce a test.

To roll back endpoint selection, remove only `AUTH0_BROWSER_DOMAIN` while keeping
the new code and additive migration. Already initiated flows retain their exact
endpoint for at most their 10-minute lifetime. A code rollback to the older
callback handler must wait until custom-domain transactions have expired; that
older code does not understand their issuer binding. Keep DNS and the verified
domain available for in-flight flows and future certificate renewal. Do not
rewrite identity issuers or create new OAuth registrations as a rollback.

## Automated evidence and remaining live gates

`tests/unit/auth.test.ts` executes real signed RSA tokens against the actual D1
migrations in isolated Miniflare. Cases cover canonical/custom account continuity,
one welcome grant, saved name/language, existing browser sessions, canonical
Belvédère evidence, a reviewer restriction installed before first login,
separate same-email subjects, canonical/legacy/rollback transactions, canonical
MCP continuity, browser-only custom Bearer rejection, invalid issuers/configurations and
incomplete or changed transaction namespaces. Existing authentication tests retain
nonce, PKCE, signature, audience, age, account verification, MFA, memberships,
revocation and session gates.

These are deterministic fixtures with mocked Auth0 network responses. They do
not qualify DNS propagation, TLS, Auth0 configuration, a received verification
email, an actual human login, a social provider callback, assistant refresh,
revocation or marketplace review. Record those dated production results outside
this candidate evidence; never present local test success as activation.

`tests/unit/mcp-auth0-domain.test.ts` adds signed legacy/custom tokens, strict
official-SDK discovery, independent rollback, unsupported settings, foreign
issuer/key/audience/algorithm, expiry/lifetime, signed account evidence, unchanged
MFA/scopes, current connection revocation/not-before, canonical postal fences and
existing bounded expert-mandate continuity/revocation. These fixtures perform no
real communication or provider configuration. On 25 October, anonymous public
GETs observed valid tenant/custom OIDC and OAuth metadata with identical public
signing keys; Guteneo's then-served discovery still advertised the tenant. That
observation is not deployment or connected-host proof for this candidate.

Primary references: [Auth0 custom domains](https://auth0.com/docs/customize/custom-domains),
[configure features to use a custom domain](https://auth0.com/docs/customize/custom-domains/configure-features-to-use-custom-domains),
[Auth0-managed certificates](https://auth0.com/docs/customize/custom-domains/auth0-managed-certificates).

## Dependency audit during this candidate

The first PR CI run failed its existing dependency security gate on newly indexed
advisories. The bounded correction raises Zod to 4.6.6, refreshes compatible
body-parser/fast-uri resolutions and adds the exact override
`miniflare@5.20261006.1-alpha → undici@7.30.1`. Wrangler 4.149.0, Miniflare and
workerd stay at their existing versions: the newer available Wrangler/Miniflare
manifests still select vulnerable undici 7.29.1, so changing that toolchain would
add drift without resolving the advisory. There is no global undici override,
major-version migration or new beta toolchain.

Remove this scoped exception only after an adopted upstream Miniflare version
natively resolves a patched undici, followed by clean installation, dependency
audit, representative MCP/D1/domain tests and a Worker dry build. Never remove it
by restoring the vulnerable resolution. On 24 October 2026, the root dependency
audit after clean installation reported zero known advisories of any severity;
233 representative fixture tests and the local Worker dry build passed. This is
local evidence for the root lockfile at that time. It neither qualifies other
package roots nor guarantees absence of future advisories. Complete CI against
the updated commit and authorized production qualification remain separate gates.
