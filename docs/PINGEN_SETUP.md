# Private Pingen connection

[Postal preflight](PINGEN_PREFLIGHT.md) owns PDF/address checks and the common
browser/REST/MCP journey. `POSTAL_DRAFTS_ENABLED` separately gates draft creation;
`LIVE_SENDS_ENABLED`, quote and approval still gate sending. Configured credentials
prove none of those activations.

17 September release `813dd717` at 02:28 UTC enabled drafts after remote renderer
qualification and a fresh EUR/LU/left-window profile plus exact upload-origin read.
Published configuration retained `LIVE_SENDS_ENABLED=false`. The application
allowed only explicit consented checked-PDF transfer to `auto_send:false` drafts.
The separate synthetic `5b91ad3` test below qualifies neither customer-document
upload, browser consent nor sending.

## Secure connection and inspection

Create a dedicated Guteneo **Client Credentials** application, then run
`node scripts/secure-setup.mjs pingen`. Its local form requires `PINGEN_CLIENT_ID`,
`PINGEN_CLIENT_SECRET`, `PINGEN_ORGANIZATION_ID` and sends values through Wrangler
stdin directly to Worker secrets, without credential files, value-bearing arguments
or output. [Secure configuration](SECURE_CONFIGURATION.md) owns this mechanism.
Installation changes no environment/activation flag and creates no webhook.
`PINGEN_WEBHOOK_SECRET` is not needed to authenticate/read an organization;
[webhook setup](PINGEN_WEBHOOK_SETUP.md) is separate.

After private entrypoint deployment, `node scripts/provider-readiness.mjs pingen`
calls Cloudflare `ProviderInspection`, which has no HTTP inspection route.
Credentials stay in Cloudflare; the local script receives filtered results only.
Exactly two calls occur: `client_credentials` requesting only `organisation_read`,
then `GET /organisations/{id}` for the configured account. Production hosts are
`identity.pingen.com`/`api.pingen.com`; `PINGEN_SANDBOX=true` chooses separate staging
hosts. For this private read only, absent sandbox flag selects production; the
sending adapter still requires explicit configuration.

Each request/body is bounded by eight seconds/64 KiB and refuses redirects.
Inspection never lists organizations or follows returned links, reads files,
creates drafts/quotes/purchases/letters. Output is limited to authentication,
configured-organization match, billing currency, default destination and window.
Errors show stage, fixed code and optional HTTP status; no name, address, balance,
ID, token or provider message. `ok` proves access to this organization only, not
credit, final price, printing or sending; `liveSendingVerified:false` always remains.

Primary sources checked 17 September 2026:
[Pingen OpenAPI](https://api.pingen.com/documentation/swagger-docs),
[OAuth/environments](https://www.postman.com/pingen/pingen-v2-public-workspace/collection/t9s7epw/endpoints),
[official organization SDK](https://github.com/pingencom/pingen2-sdk-go/blob/main/organisations/organisations.go),
[application creation/signed notifications](https://github.com/pingencom/n8n-nodes-pingen2).
Postman aliases `api.v2.pingen.com`/`api-staging.v2.pingen.com` did not resolve in
that public check. Current OpenAPI/SDK hosts responded directly 401 without auth
or redirect; the existing adapter already used them.

Synthetic intercepted tests cover scope, organization isolation, environments,
no shared cache, bounds, redirects, errors and private-data omission, without real
account/letter access.

## Separate upload-origin inspection

Drafts require explicit `PINGEN_SANDBOX=false` and an exact qualified
`PINGEN_UPLOAD_ORIGINS`. OpenAPI's fictitious `s3.example` cannot establish a real
origin. `node scripts/provider-readiness.mjs pingen-upload-origin` calls private
`inspectPingenUploadOrigin`: OAuth then `GET /file-upload`, returning HTTPS origin
only, never signed path/query/signature, and performing no PUT or allowlist write.
Do not broadly allow `*.amazonaws.com`, `*.cloudscale.ch` or a fictional origin.

The route declares `security:[{oauth2:[]}]`: token required, no additional business
scope. Explicitly request `organisation_read`, without `letter`/`webhook`, because
omitting scope gives all client scopes. Reject broadened OAuth response scope;
account refusal never triggers escalation.

Origin checks require HTTPS/public syntactically valid DNS, no credentials,
nonstandard port, fragment, control character, IP or local name. No network call
contacts storage. Observation proves neither jurisdiction, storage ownership nor
upload; qualify before explicit configuration. Discard ephemeral signed URLs/tokens.
Tests cover both environments, exact calls/scope, no PUT/link following, secret-free
origin projection, ambiguous/local URLs, excessive bodies and no retry on failure.

Postal operations request `letter`; webhook registration separately requests
`webhook`. Connection reading needs only `organisation_read`. Credentials never
replace PDF/address checks, final quote, signed notifications, funding or approval;
these utilities never activate sending.

## Verified connection — 17 September 2026

A dedicated Guteneo Client Credentials application was created in the authorized
Safari session. The private form installed the three Cloudflare credentials;
only presence was reread. OAuth/organization read succeeded: EUR, default LU,
left window. Portal balance was zero and no letters had been sent; no credit purchase.

Separate `/file-upload` read with only `organisation_read` returned
`https://pingen2-production-transfer.objects.rma.cloudscale.ch`; this exact origin
became the only `PINGEN_UPLOAD_ORIGINS` entry. `PINGEN_SANDBOX=false` represented the
real account; `LIVE_SENDS_ENABLED=false` stayed unchanged. Initial inspection
performed no PUT/draft/webhook/letter. Signed URLs/tokens stayed in Worker memory.
A later private read with Wrangler 4.133.0 also succeeded.

## Synthetic draft qualification — 17 September 2026

Published source `5b91ad312ec14b40fa3441382d69782cc6343c96` returned a **151 EUR-cent**
provider quote at 03:43:35 UTC for one normal-paper LU page, cheap/simplex/grayscale.
This is dated account/option calculator evidence, not a universal customer tariff,
tax qualification or invoice.

Only the embedded synthetic PDF was uploaded; `auto_send:false` draft creation
succeeded at 03:43:56. At 03:44:16, inspection confirmed one page, expected address/
country, normal paper and embedded fonts, without submission. Provider submit/delete
abilities confer no Guteneo authority. `/file` 302 was observed without following
Location or qualifying the final print preview. API deletion succeeded at 03:44:43;
durable `deleted` was reread at 03:45:22. This proves no immediate erasure of all
provider copies. No letter was sent; business user/organization/document/dispatch/
fax-v3 tables stayed empty. Only the private R2 technical journal remains.
`appJourneyVerified`, `liveSendingVerified`, `canSend` stayed false.
Reports: `reports/pingen-synthetic-qualification-20260917.json`,
`reports/pingen-synthetic-d1-counts-20260917.json`;
[synthetic protocol](PINGEN_SYNTHETIC_QUALIFICATION.md).

Four tracking subscriptions (`issues`, `sent`, `undeliverable`, `delivered`) were
later registered and signing configuration reread exactly. Unsigned notifications
are refused. No Pingen-generated test was yet received; see [webhook proof](PINGEN_WEBHOOK_SETUP.md).

Still separate: real signed notification, customer-document signup/browser consent,
final preview, active account/route tariff, provider credit and explicitly authorized
send. LU evidence does not qualify French La Poste, the app journey or delivery.
