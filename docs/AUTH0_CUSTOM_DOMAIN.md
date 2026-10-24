# Auth0 browser custom domain

This candidate lets the existing browser login use `auth.guteneo.com` while
preserving the Auth0 tenant, Guteneo accounts, workspaces, account restrictions,
assistant connections and canonical MCP issuer. It introduces no new account,
OAuth client, scope, role, approval authority or delivery activation.

Implementation, verified Auth0/DNS configuration, production activation and actual
browser/assistant qualification are separate evidence. The existence of a custom
domain or a passing test does not establish an active login on that domain.

## Identity and endpoint contract

`AUTH0_DOMAIN=pieper.eu.auth0.com` remains the canonical issuer
`https://pieper.eu.auth0.com/`. Do not replace it as part of this browser change.
That namespace identifies the signed subject in `auth_identities`,
`restricted_delivery_identities`, `authorized_connections`, expert/postal authority
and `browser_identity_evidence`. It also controls MCP Bearer-token verification,
JWKS and Protected Resource discovery.

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

MCP discovery and validation continue to accept the canonical issuer only.
A custom-domain token presented as an MCP Bearer credential is rejected during
this first phase. Existing assistant registrations, refresh credentials and
public OpenAI plugin identity are not migrated or replaced by this change.
Custom-domain MCP support would require its own reviewed migration and actual
host qualification.

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
MCP continuity, custom Bearer rejection, invalid issuers/configurations and
incomplete or changed transaction namespaces. Existing authentication tests retain
nonce, PKCE, signature, audience, age, account verification, MFA, memberships,
revocation and session gates.

These are deterministic fixtures with mocked Auth0 network responses. They do
not qualify DNS propagation, TLS, Auth0 configuration, a received verification
email, an actual human login, a social provider callback, assistant refresh,
revocation or marketplace review. Record those dated production results outside
this candidate evidence; never present local test success as activation.

Primary references: [Auth0 custom domains](https://auth0.com/docs/customize/custom-domains),
[configure features to use a custom domain](https://auth0.com/docs/customize/custom-domains/configure-features-to-use-custom-domains),
[Auth0-managed certificates](https://auth0.com/docs/customize/custom-domains/auth0-managed-certificates).
