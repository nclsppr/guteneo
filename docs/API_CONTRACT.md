# API and MCP reference

Code inspected on 16 September 2026. This describes delivered routes, not a public
API stability commitment. REST, MCP and the interface share `DomainService` and
`DocumentService`. Later additions are dated explicitly; the 11 October appearance
candidate requires D1 migration `0053` before code and is no remote-availability proof.
The current [OpenAPI document](../apps/web/public/openapi.json), shared contracts
and topic references own later additive operations.

## Conventions and access

Base URL is `APP_ORIGIN`, for example `http://localhost:8787` locally. Business
responses are JSON except PDFs and authentication redirects. IDs are opaque,
dates ISO 8601 UTC, amounts integer EUR cents with `currency:"EUR"`.
`known_minor:null` means unknown provider cost. Retain `X-Correlation-ID` for
troubleshooting without copying document content.

- Browser session: `HttpOnly`, `SameSite=Lax`, secure outside development. Mutations require `Origin: APP_ORIGIN` and `X-CSRF-Token` from `GET /api/session`. Local login requires Origin before a CSRF session exists.
- Delegated bearer: `Authorization: Bearer …`, validated against configured Auth0 issuer/audience and recorded connection/membership. It can use business REST and `/mcp`, but cannot replace human browser approval.

Authenticated membership determines organization; client organization fields or
headers cannot switch tenants. Human roles are `admin`, `supervisor`, `member`,
`viewer`. Supervisor approval/reporting options are independent; operators prepare
without approving, confirming or cancelling; observers read without mutation.
[Roles](WORKSPACE_ROLES.md) and [feature matrix](FEATURE_MAP.md) are authoritative.
Organization administration is not platform-wide operator authority.

Authenticated REST/MCP share 180 business requests/organization/minute; excess is
`429 RATE_LIMITED`, `Retry-After:60`. Document/send quotas are separate.
Authentication, health and callback routes are outside this counter.

| Bearer REST route | Required scope |
| --- | --- |
| `GET /api/documents…` | `documents:read` |
| `/api/documents…` mutation | `documents:write` |
| Mutation ending `/confirm` or `/cancel` | `dispatches:send` |
| Other business read | `dispatches:read` |
| Other business mutation | `dispatches:prepare` |

Role/human-session restrictions also apply. `/api/session`, `/api/logout` and
`/api/connections` are browser-session-only. [Identity/MCP](IDENTITY_MCP.md) owns
Auth0 setup, consent, PKCE, verified-account policy, conditional MFA and real-client limits.

## Authentication and discovery

| Method/path | Input/result |
| --- | --- |
| `GET /auth/login` | Optional same-origin relative `returnTo`; Auth0 PKCE redirect; default `/#/app`. |
| `GET /auth/callback` | Checks/consumes `state` once, exchanges `code`, creates session, redirects. |
| `GET /api/session` | `{organization:{id,name},user:{id,name,role,…},csrfToken,simulation,mfa,verifiedAccount}`; appearance candidate adds `user.preferredDashboardAppearance:"classic"\|"v2"`. |
| `POST /api/logout` | Revokes current Guteneo session; `{signedOut:true}`, not global Auth0 logout. |
| `GET /api/connections` | `{items:[{id,client_id,organization_id,status,created_at,updated_at}]}`; current member/organization only, at most 100. |
| `POST /api/connections` | `{clientId}` binds client to current organization and invalidates prior tokens for that binding; `{bound:true,reconnectRequired:true}`. |
| `DELETE /api/connections/:id` | Immediately revokes the member's owned connection; `{revoked:true}`. Auth0 grant/refresh revocation is separate. |
| `GET /.well-known/oauth-protected-resource` | `/mcp` resource, Auth0 authorization server, scopes; same response at `/mcp` suffix; 503 without identity configuration. |
| `POST /api/dev/login` | `{organization:"atelier"\|"studio"}` returns session only in `local`/`simulation` on configured loopback origin. |
| `POST /api/dev/mcp-token` | Local session/CSRF; `{token,expiresAt,simulation:true}`; one-hour token unusable outside this mode; never log it. |

The initial signup contract created an organization without transport credit and
with disabled channels. Later [welcome-credit policy](WELCOME_CREDIT.md) supersedes
that dated initial balance. Browser multi-organization selection was not yet
provided. An OAuth connection is never dispatch approval.

## Personal appearance — 11 October 2026 candidate

| Method/path | Input/result |
| --- | --- |
| `GET /api/account` | Browser session; `user.preferredDashboardAppearance` is `classic` or `v2`, alongside profile, permissions and current organization. |
| `PATCH /api/account` | Browser session/Origin/CSRF; existing strict JSON extended with optional `preferredDashboardAppearance:"classic"\|"v2"`; updated profile returned. |
| `GET /api/mobile/v1/session`, `GET /api/mobile/v1/account` | Additive read of the same user preference under authorized native session. |
| `PATCH /api/mobile/v1/account` | No appearance setter; rejects `preferredDashboardAppearance`. Native profile mutation remains `preferredLocale` and preserves appearance. |

`packages/contracts/src/dashboard-appearance.ts` owns the shared type.
`0053_user_dashboard_appearance.sql` adds
`users.preferred_dashboard_appearance TEXT NOT NULL DEFAULT 'classic'`, checked
against `classic`/`v2`. Existing/new accounts stay Classic until their user saves V2.
The authenticated user's preference is shared across workspaces/sessions/devices.
Session supplies user/workspace; targeting fields `userId`/`organizationId` are
refused. All four roles can change their own presentation without gaining authority.
Omission preserves the value for older name/language clients.

Invalid/unknown fields return `400 INVALID_INPUT`; bad CSRF returns
`403 CSRF_REJECTED`; session/membership revoked before mutation returns
`409 ACCESS_CHANGED`, without partial update. Profile mutation and `account.updated`
audit share existing transactional guards; audit exposes changed field names only.
Responses remain `no-store`. UI applies the preference after PATCH succeeds.
Browser `atelier=v2`/`atelier=classic` temporarily overrides without account writes.
No new endpoint, scope, MCP tool or preparation/approval/confirmation field is added.
OAuth assistants cannot use this browser contract; no native V2 setting is added.
See [DASHBOARD_V2.md](DASHBOARD_V2.md) for reconciliation, journeys and evidence.

## Capabilities and documents

| Method/path | Input/result |
| --- | --- |
| `GET /api/health` | Public `{status:"ok",mode}`; Worker response, not provider health certification. |
| `GET /api/capabilities` | Public `mode`, `simulation`, `channels`, `limits`, `documents`, `mcpUrl`, `identity`, `scanner`, `assistants`, `productionBlockers`, `humanApproval:"authenticated_browser"`, `liveSending:false` in the initial inspected contract. Read current flags rather than assuming historical values. |
| `GET /api/documents?cursor=…&limit=30` | `{items:Document[],nextCursor:string\|null}`. |
| `POST /api/documents` | Multipart binary `file`; `201 Document`, no dispatch. |
| `POST /api/documents/render` | Strict `{name,html}`; `201 Document`, `source:"render"`; new PDF from filtered HTML. |
| `GET /api/documents/:id/content` | Exact private PDF, `Content-Type:application/pdf`, `X-Document-SHA256`, `Cache-Control:private, no-store`; audited read. |

`Document` includes `id`, `organization_id`, `name`, `sha256`, `size`, `pages`,
`status`, `source`, `created_at` and the initially exposed `storage_key`. An internal
key grants no bucket access; use authenticated content routes. `source` is
`import|render`; `status` is `ready|quarantined|rejected|purged`.

Imports preserve bytes and tenant-deduplicate SHA-256; reuse a document across
dispatches. HTTP success may return `quarantined`; preview then returns
`423 DOCUMENT_QUARANTINED` and preparation is blocked. Outside local simulation,
exact scan and isolated validation are required for `ready`.

Bounds: 10 MiB/100-page PDF, 128 KiB UTF-8 HTML, 180-character render name. Rendering
removes scripts, user styles, images, SVG and external resources, then applies a
controlled A4 template; it is no faithful arbitrary-HTML converter. The original
URL-import allowlist was superseded by the dated [public HTTPS import
contract](PUBLIC_PDF_IMPORT.md); local/private URLs and redirects remain refused.

## Dispatch preparation, approval and acceptance

| Method/path | Input/result |
| --- | --- |
| `POST /api/dispatches` | Strict body below and `Idempotency-Key`; `201 Dispatch`, `prepared`. |
| `GET /api/dispatches?cursor=…&limit=30` | `{items:Dispatch[],nextCursor:string\|null}`; optional organization-wide `group` of `approval`, `in_progress`, `attention`, `done`; otherwise `400 INVALID_GROUP`. Shared groups: `packages/contracts/src/dispatch-groups.ts`. |
| `GET /api/dispatches/:id` | `{dispatch,events,attempts,approval}`. |
| `POST /api/dispatches/:id/approve` | Human browser/CSRF; strict hexadecimal SHA-256 `{fingerprint}`; returns `Dispatch`. |
| `POST /api/dispatches/:id/confirm` | Required `Idempotency-Key`; no body parameters used; durably accepted `Dispatch`. |
| `POST /api/dispatches/:id/cancel` | No body parameters used; cancelled `Dispatch` or `409 CANCELLATION_TOO_LATE`. |

Preparation is strict at the top level:

```ts
{
  channel: "fax" | "email" | "postal";
  recipient: Record<string, string>;
  documentId?: string;
  senderId?: string;
  subject?: string;
  html?: string;
  text?: string;
  options?: Record<string, unknown>;
  campaignId?: string;
  ceilingMinor?: number;
}
```

| Channel | Recipient/content |
| --- | --- |
| `fax` | International `{phone}`: remove spaces including nonbreaking, dots, parentheses/hyphens; remove `(0)` after country code. Allowed `+33`, `+352`, `+49`; remaining national 0 after code returns `INVALID_PHONE`. Ready `documentId` required; no real destination prefilled. |
| `email` | Lowercase-normalized `{email}`; subject/final sanitized HTML and explicit or derived text; optional ready PDF `documentId`; one recipient per dispatch. |
| `postal` | `{name,line1,postalCode,city,country}`, `FR|LU|DE`, ready PDF. One persisted street line; nonempty `line2` returns `ADDRESS_LINE_UNSUPPORTED`, never silent deletion. |

Sender must be verified for organization/channel/mode; omission selects an
existing verified profile. `options.kind:"marketing"` returns `MARKETING_NOT_ENABLED`
until unsubscribe integration is qualified. Simulated print options prove no
actual Pingen format qualification.

REST `Dispatch` includes `id`, `organization_id`, `campaign_id`, `channel`,
`recipient_json`, `document_id`, `sender_id`, `sender_address`, `subject`, `html`,
`text`, `options_json`, `status`, `mode`, `estimated_minor`, `ceiling_minor`,
`known_minor`, `currency`, `fingerprint`, `provider`, `provider_id`, `created_at`,
`updated_at`. `_json` fields are serialized strings. Internal tracking fields are
not writable through public routes.

Standard flow: prepare → inspect final content → human approval → confirm.
[Expert approval](EXPERT_APPROVAL.md) separately uses server review and delegated
acceptance. Standard approval binds fingerprint for at most 15 minutes; expert
review lasts five minutes within its mandate. `GET /api/dispatches/:id` returns
`approval:{fingerprint,expires_at}` only when current/unexpired, otherwise null.
Approval leaves `prepared`: never infer consent from local state or status alone.
Returned events/attempts are ordered and scoped to this dispatch.

Confirmation atomically reserves one send and `ceiling_minor`, changes state and
inserts outbox; Queue publication follows and failure does not undo acceptance.
Simulation prices are test values. The original production-fax gate required a
server-qualified immutable tariff quote or `409 LIVE_PRICING_REQUIRED`; later
channel activation is documented separately in [live activation](LIVE_ACTIVATION.md).
Secrets/channel flags alone never bypass pricing or approval.

Prepare and confirm each need a stable `Idempotency-Key`, 1–200 characters without
CR/LF/NUL, scoped to organization/operation. Same key/input retrieves the operation;
different input returns `409 IDEMPOTENCY_CONFLICT`. Duplicate confirmation cannot
reserve twice. Other creations, including campaigns, do not inherit this guarantee.
Approved content cannot be edited: create a new command/key and approval.

States: `prepared`, `queued`, `submitting`, `submission_unknown`, `accepted`,
`delivered`, `failed`, `cancelled`, `bounced`, `complained`, `printed`,
`handed_to_post`. Provider acceptance is not delivery; email delivery is not reading;
printed/handover is not postal delivery. Unknown submission retains reservation
and needs reconciliation, never automatic retry/channel switching. Public cancel
works only from `prepared|queued`; repeating `cancelled` sends nothing.

## Campaigns, CSV and administration

| Method/path | Input/result |
| --- | --- |
| `POST /api/campaigns` | Strict `{name}` of 1–150 characters; `201 Campaign`, `draft`. |
| `GET /api/campaigns?cursor=…&limit=30` | `{items:Campaign[],nextCursor:string\|null}`. |
| `GET /api/campaigns/:id` | `{campaign,dispatches:Dispatch[]}`, at most 500 dispatches. |
| `POST /api/recipients/validate` | Strict `{csv}`; `{rows,errors,duplicates,valid}`; no dispatch creation. |
| `GET /api/senders` | Read-only `{items:[{id,channel,name,address,status,mode}]}`. |
| `GET /api/overview` | Browser-only `{documents,dispatches:{total,approval,in_progress,attention,done}}`; organization-wide counts, no page bound; OAuth gets `403 BROWSER_REQUIRED`. |
| `GET /api/usage` | `{items:[{channel,period,limit_count,reserved_count,confirmed_count,limit_minor,reserved_minor,confirmed_minor,currency}]}`, current UTC `YYYY-MM`. |
| `GET /api/admin` | `admin`; tenant-bounded `{states,outbox,uncertain,audit,controls,deadLetters,simulation,capabilities}`. |
| `POST /api/admin/channels/:channel` | Browser admin/CSRF; strict `{enabled:boolean}`; audited stop/resume; `{channel,enabled}`. |

Campaign fields: `id`, `organization_id`, `name`, `status`, `manifest_hash`,
`created_at`, `updated_at`. Prepare recipients individually with shared
`campaignId`/document. First approval freezes membership/manifest; later insertion
is refused. Each dispatch needs approval/confirmation; bulk acceptance and huge
asynchronous manifest materialization are not delivered.

CSV: 256 KiB UTF-8, 500 data rows; required `channel`; only
`channel,email,phone,name,line1,postalCode,city,country`. Rows are
`{line,channel,recipient}`, errors `{line,message}`, duplicates `{line,duplicateOf}`.
Header counts as line 1. Duplicates remain in `rows` and make `valid:false`; resolve
before preparation. Spreadsheet formulas are refused; no fallback channel is selected.

Opaque pagination defaults to 30, bounds 1–100, creation/ID descending; reuse
`nextCursor` without rebuilding it. Admin returns at most 100 uncertain items,
100 dead letters and 50 audit rows. No public credit-grant, sender-verification,
blind physical retry or cross-tenant-content operator route exists.

## Provider callbacks and retrieval

`POST /webhooks/telnyx`, `/webhooks/ses`, `/webhooks/pingen` need no user session.
They verify signatures on original bytes and expected account/application/topic,
with a 1,000,000-byte body limit. Verified normalized events or unrecognized-event
metadata are persisted/deduplicated before acknowledgement; projection is immediate
or bounded cron recovery. Typical `200 {received:true}`; deferred projection
`202 {received:true,projection:"pending"}`. Errors use `{error:{code}}`:
`401 WEBHOOK_REJECTED`, `413 WEBHOOK_TOO_LARGE`, `503 WEBHOOK_UNAVAILABLE`,
`503 WEBHOOK_STORAGE_UNAVAILABLE`. SNS never follows arbitrary `SubscribeURL`;
operator setup is documented in [PROVIDERS.md](PROVIDERS.md).

`GET /media/:token` is temporary Telnyx PDF retrieval only. Opaque tokens are issued
at real-attempt start for at most 45 minutes and bind tenant, exact document,
dispatch and active attempt. State/SHA-256 are rechecked. No cookie is needed:
the token is a sensitive capability and must never be logged. Without authorized
activation, after expiry or for invalid references, return 404 without disclosure.
User preview remains `/api/documents/:id/content`.

Internal `preparePostalDraft` needs separate transfer authority: standard browser
consent or prior postal expert mandate through `transfer_postal_draft`.
`auto_send:false` creates no letter send. Quote and send approval remain separate
under their effective gates; see [LIVE_ACTIVATION.md](LIVE_ACTIVATION.md).

## Streamable HTTP MCP

`/mcp` uses `createMcpHandler` without durable MCP sessions. Bearer is required;
anonymous requests receive OAuth challenge/resource metadata. Jobs survive the
conversation. Strict tool inputs return `structuredContent` plus JSON text:
`{ok:true,data}` or `{ok:false,error:{code,message}}` with `isError:true`.
Protocol/authentication errors may occur before business results.

| Tool | Main input | Scope |
| --- | --- | --- |
| `get_capabilities` | `{}` | Authentication only |
| `import_document` | `{file:{download_url,file_id,mime_type?,file_name?}}` | `documents:write` |
| `render_pdf` | `{name,html}` | `documents:write` |
| `prepare_dispatch` | Preparation fields, `idempotencyKey` | `dispatches:prepare` |
| `confirm_dispatch` | `{dispatchId,idempotencyKey}` | `dispatches:send` |
| `get_dispatch_status` | `{dispatchId}` | `dispatches:read` |
| `list_dispatches` | `{cursor?,limit?,group?}`, default 20/max 50; REST groups | `dispatches:read` |
| `cancel_dispatch` | `{dispatchId}` | `dispatches:send` |

`import_document` declares `_meta["openai/fileParams"]:["file"]`; only
`download_url`/`file_id` are mandatory among its four file properties. Import bytes
before returning a durable ID, never a remote disk path. Actual ChatGPT-generated
PDF transfer remains separately unverified; see [IDENTITY_MCP.md](IDENTITY_MCP.md)
and [CURSOR.md](CURSOR.md).

CamelCase summaries: document
`{id,name,sha256,size,pages,status,source,createdAt,previewUrl,simulation}`; dispatch
`{id,channel,status,mode,recipient,documentId,campaignId,fingerprint,estimatedMinor,ceilingMinor,knownMinor,currency,updatedAt,approvalUrl,nextActions}`.
`get_dispatch_status` returns this summary, not full timeline or REST `approval`.
Approval URL `/#/app/dispatch/:id` needs human login; `user_confirmed:true` is refused.
Expert `review_dispatch`, `approve_and_send_dispatch`, `transfer_postal_draft` need
a prior default-off mandate from an administrator browser for this connection.
Delegated authority is separately audited. [EXPERT_APPROVAL.md](EXPERT_APPROVAL.md)
owns inputs/scopes/five-minute review/transfer boundaries. Initial MCP options
`kind`, `color`, `duplex` were narrower than REST; consult current schemas for additions.

## Errors and available proof

REST business errors use `{error:{code,message}}`, optionally
`fields:[{path,message}]` for `VALIDATION_ERROR`. Handle `code`, not display text.
API messages are English under [repository standards](REPOSITORY_STANDARDS.md).
Remote-import diagnostics may append `Source domain: <public hostname>.` after
hostname sanitization. Private URL paths, query parameters and signed credentials
are discarded; observations retain only the bounded source category/known host.

| Status | Examples/recovery |
| --- | --- |
| 400 | `VALIDATION_ERROR`, `IDEMPOTENCY_REQUIRED`, `INVALID_CURSOR`, `SOURCE_NOT_ALLOWED`: correct input. |
| 401/403 | Invalid session/token, insufficient scope/role, refused Origin/CSRF: reauthenticate/correct authority; never choose tenant client-side. |
| 404 | `NOT_FOUND`, `DOCUMENT_UNAVAILABLE`: absent or inaccessible in this tenant. |
| 409 | `IDEMPOTENCY_CONFLICT`, `APPROVAL_REQUIRED`, `FINGERPRINT_MISMATCH`, `QUOTA_EXCEEDED`, `CHANNEL_DISABLED`, `CAMPAIGN_FROZEN`, `RECIPIENT_SUPPRESSED`, `LIVE_PRICING_REQUIRED`, `LIVE_QUOTE_INVALID`: resolve business condition first. |
| 413/423 | Excessive content or quarantined document. |
| 429 | `RATE_LIMITED` HTTP rate or `CONTENT_QUOTA_EXCEEDED` document budget. |
| 500/503 | `INTERNAL_ERROR`, `CONFIGURATION_INVALID`, `RENDERER_NOT_CONFIGURED`: retain correlation. After lost confirmation, reread/replay the same key, never create another command. |

[reports/http-smoke.json](../reports/http-smoke.json) records
`node scripts/http-smoke.mjs --with-server` after README install/migration/seed/build.
It uses local Wrangler/workerd/D1/R2/Queues, adds 15 simulated emails to `org_studio`,
preserves existing data and grants no extra credit. It attests 28 checks and
21.01 ms p95 for 15 sequential local confirmations including D1 acceptance/Queue
publication attempt, excluding upload/render/preparation/human review. First
simulated-result observation p95 was 1,018.61 ms, including queue and post-batch
polling. This measures neither callback ingestion, staging, target load, monthly
availability nor real delivery. Real Auth0, assistant and provider accounts were
not qualified by this report.

## Account, billing and v0.2 integrations

[ACCOUNT_ADMIN.md](ACCOUNT_ADMIN.md) owns profile/session/team routes;
[BILLING.md](BILLING.md) owns billing/Stripe webhook. Both require browser session
and current workspace authority; assistant tokens cannot access these settings.

`POST /api/documents/:id/rescan` needs `documents:write` or a CSRF-protected browser.
`POST /api/admin/scanner/warm` is browser-administrator-only. Ready requires clean
scan, equal hash and isolated PDF validation; see [SCANNER_RESCAN.md](SCANNER_RESCAN.md).
MCP document reading, simplified fax preparation and `rescan_document` retain
scopes and cannot grant human approval. [LLM_SETUP.md](LLM_SETUP.md) owns host limits;
[LIVE_FAX_QUOTES.md](LIVE_FAX_QUOTES.md) owns fax price/expiry/source.

## Shared welcome credit

`GET /api/billing` and `/api/usage` share `welcomeCredit`: `kind`, `currency`,
`grantedMinor`, `reservedMinor`, `spentMinor`, `availableMinor`, `grantedAt`, `status`,
`renewal:"none"`, `topUpAvailable:false`. Production grants 5,000 EUR minor units
once per organization. Local simulation is no real grant; preview balance is
fictional. Confirmation atomically reserves approved ceiling with acceptance and
outbox; see [WELCOME_CREDIT.md](WELCOME_CREDIT.md).

### Fax v3 quote presentation

MCP `estimatedMinor` remains compatible as the range's upper bound rounded up to
cents, never fixed price or debit. Show `faxPricing.display.estimate.label` and
`creditLabel`, then separate `display.ceiling`/`display.explanation`. Credit is a
euro balance (`creditUnit=EUR_balance`). `estimate.lowEur`/`highEur` retain exact
nine-decimal strings; labels are rounded estimates. REST/expert review share the
projection. NanoEUR, fingerprints, approved ceiling and settlement retain their
roles; no client price is accepted. See [customer quote presentation](LIVE_FAX_QUOTES.md#customer-quote-presentation-17-september-2026).

## Document studio contracts (local candidate)

The additive templates, datasets, mappings, generation-jobs and
distribution-plans routes are specified in `apps/web/public/openapi.json`.
The shared TypeScript/Zod contracts live in `packages/contracts/src/` and the
[MCP/API/web parity matrix](TEMPLATES_DATA_DISTRIBUTION.md#interface-parity)
lists the actual operations and scopes. Examples with delegated OAuth are in
`examples/template-workflow/`; executed local development bearer evidence is
separate from production machine-authentication qualification.

Authoring discovery requires `templates:read`: `GET /api/templates/authoring-guide`
returns the current envelope/binding/patch JSON schemas, semantic rules, bounds
and a complete minimal envelope. `GET /api/templates/examples` returns five
synthetic example descriptors; `GET /api/templates/examples/{exampleId}` returns
`{id,envelope}` without saving anything. MCP equivalents are
`get_template_authoring_guide`, `list_template_examples` and
`get_template_example`. The same `create_template`/`POST /api/templates`
operation saves a private editable copy. No internal OpenAI call is required.

`DELETE /api/templates/{id}` accepts `{expectedRevision}` and requires
`templates:write` plus current ownership and a non-viewer membership. The MCP
equivalent `delete_template` takes `{id,expectedRevision}` and is annotated as
destructive. `TemplateView.canDelete` describes this separate ownership right;
edit/publish/share grants cannot confer it. Success returns `{id,deleted:true}`.
The model then disappears for all users, and its direct template reads return
404. Existing PDF and generation-history access rules are preserved. This is
library removal, not erasure of historical documents. Migration 0049 is required.
