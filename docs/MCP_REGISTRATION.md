# Automatic OAuth registration for MCP clients

24 October 2026: **candidate configuration, not activated**. A Claude connection
without a preconfigured client currently fails because the canonical Auth0
discovery documents advertise neither `registration_endpoint` nor CIMD support.
This is separate from the OpenAI submission portal's unavailable configuration.
Neither a healthy MCP endpoint nor this candidate restores that portal binding.

## Contract and intended journey

Use Auth0's native Dynamic Client Registration (DCR), not a new authorization
server or a shared browser credential. The MCP issuer remains
`https://pieper.eu.auth0.com/`; the protected resource remains
`https://guteneo.com/mcp`. The current [custom-domain trust and discovery contract](AUTH0_CUSTOM_DOMAIN.md)
owns the independently selected browser/MCP domains. This controller retains the
canonical API audience and identity keys; it does not select or migrate issuers.

Once the provider configuration and the particular host have been qualified, a
person adds `https://guteneo.com/mcp` in a DCR-capable client, leaving its optional
OAuth client fields empty. The host discovers Auth0, registers its own client,
starts authorization-code + S256 PKCE, and sends the person through Auth0 login
and consent. The Worker then validates the token and resolves the current
membership and OAuth connection as before. Multiple memberships still require
an explicit connection binding in the authenticated Guteneo browser.

Registration creates an OAuth application, **not account access or send
approval**. The person must authenticate and consent. Roles, tenant scoping,
resource ownership, per-tool scopes, reviewer `prepare_only`, disabled delivery
channels, immutable human approval and separately expiring expert mandates remain
enforced. An assistant cannot enable or extend a mandate. A successful refresh
does not renew one or recreate a revoked Guteneo connection.

Existing preconfigured clients and callbacks remain intact and are a fallback
for hosts that need them. No existing client becomes third-party, gains scopes,
changes its refresh policy or loses its current grant through this candidate.
The iOS application retains its separate first-party browser and mobile session
flow; it does not register as an MCP client.

## Provider configuration to review

The narrow controller is `scripts/enable-mcp-registration.mjs`. Its default
inspection uses GET requests only and returns a sanitized plan and fingerprint.
Applying requires a fresh, reviewed fingerprint and explicit production
authorization. It checks the exact tenant, resource, connection, current clients,
draft and deployed Actions, their bindings and existing grants. Unknown source,
pending edits, an active incompatible legacy extension, missing inspection
authority or configuration drift prevents activation.

The proposed sequence is:

1. Deploy the reviewed pair of verified-identity Actions. Preserve the static
   initial-login and refresh-client lists. Opt in to refresh for Auth0-assigned
   strict third-party `tpc_` clients only, with the exact MCP audience,
   Guteneo account connection and still-verified identity. Keep S256 PKCE for
   initial authorization. Do not issue OIDC ID-token claims for strict clients.
2. Promote only the existing `Guteneo-Accounts` database connection to domain
   level, preserving its identity, options and first-party associations.
3. Create the exact default API grant below for user-delegated access.
4. Select strict DCR mode and enable native open DCR last. Reinspect the full
   state; do not automatically replay a mutation whose outcome is unknown.

The default grant is `default_for: third_party_clients`,
`subject_type: user`, `audience: https://guteneo.com/mcp`, with this explicit
existing scope ceiling:

```text
documents:read documents:write
dispatches:prepare dispatches:send dispatches:read
templates:read templates:write templates:publish templates:share
datasets:read datasets:write
generations:read generations:write
```

This ceiling permits a client to request those permissions with user consent;
it does not bypass consent or Guteneo authorization. No wildcard, machine-to-
machine default, Management API grant or new permission is added. Auth0's strict
clients cannot use DCR to obtain `client_credentials` access. The provider, not
Guteneo, issues any client credential directly to the registering host; the
controller neither creates a client nor retrieves, prints or stores its secret.

The `tpc_` classification comes from trusted `event.client.client_id` in an Auth0
Action, not an HTTP body, claimed application name or client-supplied metadata.
It identifies all strict third-party clients, including manually created clients;
it does not authenticate a brand such as Claude or prove DCR provenance.

Strict third-party refresh credentials have finite absolute and idle expiration
under Auth0's policy. Public SPA/native clients have rotation by default. The
existing selected hosted clients keep their separate 30-day idle / 90-day
absolute rotating policy. Do not claim those exact bounds or rotation for every
new DCR client: inspect its actual provider configuration and qualify a real
refresh in the host. No refresh-token store or keep-alive timer is introduced in
the Worker.

## Open registration and resource bounds

Auth0 DCR is open registration: anyone can create a third-party client after it
is enabled. Promoting the account connection makes it available to third-party
clients, subject to their API grants and user consent. This is the material
production access change requiring explicit review; a client name or callback
that resembles a known host must never imply trust.

Auth0 documents a tenant-wide registration rate limit of five requests/second.
That rate limit is not a bound on the total client inventory. Claude documents
that a fresh connection can register a new client. Inspect current plan limits
and client growth before rollout, reuse host-managed registrations where the
host supports it, and observe growth after rollout. Do not automatically delete
old clients, revoke active users, buy a plan, create an ACL or widen an access
token. Those are separate decisions. CIMD can reduce registration growth, but
this candidate does not enable or advertise CIMD support.

The reviewed controller retains the current Free-plan ceiling of ten
applications as a conservative deployment policy. Nine or more existing applications
produce `capacity_requires_review`, before any write. Having two available
slots is only the controller's minimum headroom, not a production capacity
guarantee: open registration can still exhaust a finite inventory. A plan change
does not silently relax the controller; review its policy and evidence first.
The inventory also includes Auth0's legacy global client. Only an explicit
provider `global: false` classifies a row as an ordinary application for this
counter; a missing or non-boolean classification fails closed. The global row
is still retained in the configuration fingerprint. A display name such as
"All Applications" is never used to classify or exclude a client.
Auth0 also counts dynamic CIMD clients toward the ordinary Applications limit,
in addition to its separate dynamic-CIMD limit. CIMD is therefore not a bypass
of the Free-plan ceiling. Dynamic CIMD has a separate eligibility/terms gate;
neither its trial terms nor a paid upgrade is accepted by this candidate.

No Worker route, database migration, container, additional secret, scheduled
task or per-request network call is added. Provider configuration and control-
plane inspection use existing Auth0 infrastructure. No cost or latency saving,
free service guarantee, paid-plan eligibility or fixed total bill is claimed.
Existing application/scanner resource limits remain unchanged. Record actual
provider plan limits and host timing separately before activation.

## Host interoperability and qualification

Claude's current documentation supports DCR and obtains API scopes from the
protected-resource metadata, adding `offline_access` if Auth0 advertises it.
ChatGPT also documents DCR and may prefer CIMD if advertised. Other clients need
their own protocol and callback qualification; this candidate does not claim
universal host compatibility.

One known compatibility gate is explicit: Auth0 strict third-party clients do
not currently support OIDC scopes/ID tokens or `/userinfo`. Auth0's canonical
discovery still advertises OIDC scopes for its first-party clients, and OpenAI
documents that ChatGPT requests advertised OIDC scopes by default. A real
ChatGPT DCR connection therefore needs separate qualification. Do not change
the issuer, publish false metadata, use permissive mode, remove security checks
or replace a working private/public registration to hide this difference.

Required evidence, recorded without tokens, authorization codes, state, nonce,
cookies, signed URLs, document contents or recipients:

- Fresh public discovery: exact resource/issuer and an actual Auth0 registration
  endpoint. Merely adding a field to a resource document is insufficient.
- One authorized real registration in each target host. Inspect the actual
  returned client type, strict mode, exact callbacks, supported grants and
  refresh settings privately; retain only non-secret metadata and hashes.
- Successful human login and consent, account/workspace continuity, a raw
  authenticated tool catalogue and a read-only `get_capabilities` call.
- Refusal of missing/wrong PKCE, unregistered callback, wrong audience, wrong
  account connection, unverified identity, ungranted scope and revoked Guteneo
  connection. Fixture refusals and provider refusals are distinct evidence.
- A real refresh and a controlled revocation using a separately authorized test
  connection; preserve the active reviewer connection. No real communication,
  paid provisioning, channel activation or expert mandate is needed.

## Operations and recovery

```sh
node scripts/enable-mcp-registration.mjs --inspect
```

Review the proposed changes and blockers, obtain authorization, then apply only
the exact fresh fingerprint with the controller's documented `--apply --expect`
mode. The general setup and older targeted renewal tools intentionally reject
the new source/connection policy rather than overwrite it; do not run them as a
repair shortcut. Reinspection is mandatory after interruption or a concurrent
administrator change. Auth0 does not provide a transaction across these writes.

Disabling open registration only prevents new registrations; it does not revoke
existing clients, grants or access. Revocation or restoration of the former
connection/default-grant/Action policy can disrupt existing users and needs a
separate reviewed, explicitly authorized plan. Never auto-delete clients or
revoke the reviewer's active connection as rollback. Record a partial result
honestly and stop before further writes if state cannot be reconciled.

## Official references

Verified on 24 October 2026:

- [Auth0 DCR](https://auth0.com/docs/get-started/applications/dynamic-client-registration)
- [Auth0 third-party configuration and default grants](https://auth0.com/docs/get-started/applications/third-party-applications/configure-third-party-applications)
- [Auth0 strict controls and refresh policy](https://auth0.com/docs/get-started/applications/third-party-applications/security-controls)
- [Auth0 DCR security mode](https://auth0.com/docs/get-started/applications/third-party-applications/permissive-mode#dynamic-client-registration-in-permissive-mode)
- [Auth0 entity limits](https://auth0.com/docs/troubleshoot/customer-support/operational-policies/entity-limit-policy)
- [Auth0 legacy global client](https://support.auth0.com/center/s/article/Global-client-ID-and-secret)
- [Auth0 CIMD and its application-count limit](https://auth0.com/docs/get-started/auth0-overview/create-applications/cimd-overview)
- [Auth0 post-login event](https://auth0.com/docs/actions/reference/post-login/post-login-event-object)
- [Claude connector authentication](https://claude.com/docs/connectors/building/authentication)
- [OpenAI authentication and registration](https://developers.openai.com/plugins/build/auth)
- [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)

Local tests, CI, provider activation, a real host journey and marketplace
submission remain separate evidence. Preparation is not activation or approval.

## Current-source review — 30 October 2026

Reconciled with current main and its verified-account recovery changes. Local
registration/setup/identity-Action fixtures pass on the combined source; this
review performs no live Auth0 inspection or mutation. The 24 October provider
observations above remain dated evidence and must be rechecked before activation.
