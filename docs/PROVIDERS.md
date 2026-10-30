# Provider connectors and setup

Initial documentation checked **16 September 2026**, setup updated **17 September**.
Implementation: `packages/providers/`; callbacks: `apps/api/src/webhooks.ts`.
Initial request/signature proof used fixtures/local D1. Later separate observations
qualified account reads, SNS confirmation, one created/deleted unsent synthetic
Pingen draft and four Pingen subscriptions. These do not qualify Guteneo business
delivery. Dated `LIVE_SENDS_ENABLED=false` observations remain historical; current
activation must be reread. See [release](LIVE_RELEASE.md), [SES](SES_STATUS.md),
[Telnyx](TELNYX_READINESS.md), [Pingen webhook](PINGEN_WEBHOOK_SETUP.md) evidence.

21 September Resend candidate supports no document, exact PDF attachment or protected
link at EUR1/hosted document, shared REST/MCP, browser-only password, atomic acceptance
and once-only billing. [PROTECTED_EMAIL.md](PROTECTED_EMAIL.md) owns this contract;
[RESEND_PROOF.md](RESEND_PROOF.md) owns publication evidence.

## Common contract and guarantees

`TelnyxFaxProvider`, `SesEmailProvider`, `PingenPostalProvider` expose capabilities,
validation, estimates, `submit`, `readStatus`, `cancel`, with unavailable capabilities
explicit. SES provides neither cancellation nor message-ID lookup here; events
support reconciliation. Unknown estimate `amount:null` is not zero. Known amounts
are integer minor units/currency.

Connectors grant no send authority. Before submit, domain must persist approved
final manifest/ceiling/reservation/outbox/attempt. One recipient per operation; no
fallback-channel selection. Network calls are bounded, reject redirects and never
internally retry. Lost response, 5xx, timeout, conflict or unreadable acknowledgement
after submission yields `submission_unknown`; missing response cannot release
quota. Certain rejection differs. Only HTTP 429 is explicitly transient; any retry
belongs to domain leases/bounds/deadlines, never parallel SDK/Queue retry.

Cancellation capabilities differ. Accepted cancellation requests are `requested`,
not `confirmed`; offer actual cancellation only after qualification. A deliberate
new send needs a new linked command.

## Telnyx fax

[Send API](https://developers.telnyx.com/api-reference/programmable-fax-commands/send-a-fax):
`POST https://api.telnyx.com/v2/faxes`, Bearer key, `connection_id`, `from`, `to`,
`media_url`, `client_state`. The latter holds only opaque command reference, no
organization/content. `store_media`/`store_preview` are false. 202 means command
accepted; `fax.delivered` supplies transmission outcome.

An independent Guteneo account needs:

1. Server key, fax app/connection, authorized sender number/outbound profile. No demo number in config; numeric fixtures are never submitted.
2. Outbound countries, spend/concurrency caps; qualify LU/FR/DE separately with exact authorized recipient. Prefix allowlisting does not prove successful calls.
3. Canonical `/webhooks/telnyx`, account Ed25519 public key and expected connection.
4. Private temporary HTTPS PDF access created only at submission for approved document. Explicit server-origin allowlist and at least twenty minutes residual validity are required. This is a guard, not a Telnyx queue guarantee; qualify operational TTL/retrieval under load. Never log URLs.

Config: `TELNYX_API_KEY`, `TELNYX_PUBLIC_KEY`, `TELNYX_CONNECTION_ID`, `TELNYX_FROM`;
constructor also receives `webhookUrl`, `mediaOrigins`, `allowedDestinationPrefixes`.
Status uses `GET /v2/faxes/{id}`;
[cancel](https://developers.telnyx.com/api-reference/programmable-fax-commands/cancel-a-fax)
uses `POST /v2/faxes/{id}/actions/cancel`. DELETE removes data, not cancellation.
Connector provider bounds: 50 MB/350 pages; Guteneo may be stricter. Verify PDF/scan
before media access. Exact stored bytes do not mean a PDF digital signature survives
fax transport.

[Fax webhooks](https://developers.telnyx.com/docs/programmable-fax/receiving-webhooks)
may duplicate/reorder. Verify Ed25519 over `timestamp + "|" + original_body`,
`telnyx-signature-ed25519`/`telnyx-timestamp`, 300-second window and fax application;
retain orphan references. [Signature mechanism](https://support.telnyx.com/en/articles/4334722-how-to-leverage-webhooks).
Synchronize clocks/qualify real callback delays/replay.

Some Telnyx commands document `command_id`, but inspected fax-create schema did not.
**No Telnyx-create idempotency is claimed** or arbitrary header sent. Unknown submit
needs read/reconciliation/operator action, never automatic resend.
Dated [public fax price](https://telnyx.com/pricing/fax): USD0.007/page **plus SIP
transport**; number/destination/duration/tax/contract may add cost. Estimate remains
unknown without qualified tariff. [Prerequisites](https://developers.telnyx.com/docs/programmable-fax/get-started),
[send guide](https://developers.telnyx.com/docs/programmable-fax/send-a-fax-api).

## Amazon SES v2

`SesEmailProvider` signs JSON with `aws4fetch` SigV4/service `ses`, then one fetch to
`https://email.<region>.amazonaws.com/v2/email/outbound-emails`, without SMTP/Node-only
SDK. [SendEmail v2](https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html)
accepts Simple HTML/text/subject/attachments. MessageId proves acceptance, not delivery/read.
One recipient, correlation tags/configuration set; max five PDF/PNG/JPEG attachments,
20 MB combined raw bytes, stricter than SES 40 MB/message. Approved bytes use
RawContent base64 plus `ContentTransferEncoding:BASE64`; scan/type-check upstream.
[Attachments](https://docs.aws.amazon.com/ses/latest/dg/attachments.html).

Setup:

1. Explicit available EU region; identities/sandbox are regional. Verify domain/DKIM/SPF/MAIL FROM/DMARC; only server `authorizedSenders`.
2. Configuration set events Send/Delivery/Bounce/Complaint/Reject/Rendering Failure; opening/click tracking off. Separate marketing/transactional reputation. Current connector uses one set/instance; separate policies need separate instances before marketing activation.
3. IAM principal limited to `ses:SendEmail`, exact region/sender identities/set and `ses:FromAddress`; verify exact resources with IAM Simulator. No `ses:*`/admin key. Identity/SNS provisioning authority is separate.
4. Server-only `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `SES_CONFIGURATION_SET`, optional temporary `sessionToken`; never Vite/browser secrets.
5. Leave sandbox only after operational validation. Sandbox: 200 messages/24 h, 1/s, verified identities/mailbox simulator. SES simulator may bill and is not free local simulation. [Production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html).

[SES events](https://docs.aws.amazon.com/ses/latest/dg/monitor-using-event-publishing.html)
use dedicated exact-ARN `SES_SNS_TOPIC_ARN` and `/webhooks/ses`. Validate SNS before
SES payload, requiring **SignatureVersion 2** explicitly on topic (SNS default 1).
Certificate fetch permits exact HTTPS `sns.<region>.amazonaws.com` and bounded official
path only, without redirects/query/credentials/arbitrary URL. `jose` imports X509;
WebCrypto verifies RSA-SHA256 official concatenation including final newline.
Certificate fetch outage returns 503; invalid signature is rejected before storage.

Certificate trust uses official-host TLS, not an independent PKIX validator.
Local crypto/URL tests use a **self-signed test certificate**, not remote SNS proof.
Public `fixtures/sns-test-key.pem`/`sns-test-cert.pem` grant no account access.
Signed subscription confirmation is an `unrecognized` receipt with topic/token,
never SubscribeURL/client content; no automatic link following. Authorized account/
D1 operator confirms exact configured topic using
`aws sns confirm-subscription --region <region> --topic-arn <expected_topic> --token <verified_token>`,
then clears token. Never expose raw receipts in ordinary admin/exports/logs.
[SNS verification](https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html),
[canonical order](https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message-verify-message-signature.html),
[version 2](https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message-configure-message-signature.html).

Normalizer retains bounceType; only hard bounce/complaint causes durable tenant
suppression. Delivery is recipient-server handover; later complaint remains separate.
Retained callback metadata excludes contacts. Marketing requires approved HTML **and**
text HTTPS unsubscribe URL; connector adds corresponding List-Unsubscribe/One-Click.
Final manifest must include policy/headers, plus actual endpoint/reputation qualification
before activation. Headers alone perform no unsubscribe. No verified SES idempotency
or automatic unknown replay.

Dated [SES pricing](https://aws.amazon.com/ses/pricing/): new accounts or account/
regions inactive since 1 June 2025 begin Essentials from 21 July 2026, advertised
USD0.16/1,000; pay-as-you-go USD0.10/1,000 plus USD0.12/GB attachments. Qualify actual
account plan; SNS/data/options are not implicitly included. No Guteneo tariff follows
from this page alone. Detailed pricing authority lives in [LIVE_DELIVERY_QUOTES.md](LIVE_DELIVERY_QUOTES.md)
and [SES_TEXT_ONLY_QUOTE.md](SES_TEXT_ONLY_QUOTE.md).

## Postal provider choice

| Candidate | Verified official-source facts | Decision |
| --- | --- | --- |
| [Pingen](https://www.pingen.com/en/post-api/) | OAuth/public API, no-send staging, preaddressed PDF, per-letter quotes, signed callbacks, 24 h idempotency; named FR/DE/LU delivery | First connector |
| [LetterXpress v3](https://www.letterxpress.de/versandwege/api) | base64 PDF/MD5, test/live, 50 MB, 120 requests/min; some GET auth bodies fit Workers fetch poorly | Alternative; qualify FR/LU |
| [Stannp](https://www.stannp.com/uk/direct-mail-api/letters) | EU API, no-print testing, PDF creation/overlay options, [HMAC callbacks](https://www.stannp.com/uk/direct-mail-api/webhooks) | Alternative; qualify LU/exact-original preservation |

[Pingen delivery options](https://www.pingen.com/en/print-delivery-options/)
name France/La Poste, Germany/Deutsche Post, Luxembourg/bpost: advertised supply,
not actual account/destination qualification. Timings are indicative.
[Security](https://www.pingen.com/en/trust-security/) includes Swiss Cloudscale hosting;
never call postal processing exclusively EU.

### Inspected Pingen contract

[OpenAPI](https://api.pingen.com/documentation/swagger-docs), discovered through
[ReDoc](https://api.pingen.com/documentation), is normative. Some marketing examples
omit `/deliveries`; follow OpenAPI.

| Operation | Contract |
| --- | --- |
| Token | POST `https://identity.pingen.com/auth/access-tokens`, form client_credentials/client ID/secret, `letter` |
| Staging | `https://identity-staging.pingen.com`, `https://api-staging.pingen.com` |
| Upload request | GET `/file-upload` → URL/signature/expiry |
| Transfer | PUT exact PDF bytes, no Bearer |
| Draft | POST `/organisations/{id}/deliveries/letters`, JSON:API `letters`, name/URL/signature/address_position, **auto_send:false** |
| Read | GET `/organisations/{id}/deliveries/letters/{letterId}` |
| Quote | POST `/organisations/{id}/deliveries/letters/price-calculator`, type `letter_price_calculator`, country/paper/options; 202 incomplete |
| Send | PATCH `/organisations/{id}/deliveries/letters/{letterId}/send`, final JSON:API options |
| Cancel | PATCH `/organisations/{id}/deliveries/letters/{letterId}/cancel`, 202 request received |

Documented POST/PATCH `Idempotency-Key`: 1–64 characters, responses retained 24 h,
`Idempotent-Replayed`. Stable creation/send keys claim no beyond-window guarantee
and authorize no unknown replay.

`prepareDocument` preserves preaddressed original bytes, creates unsent draft and
returns remote ID. Persist it/wait for provider analysis before approval. Submit
rereads country/extracted address, submit ability/paper/approved price; changes need
new approval. **Never silently overlay an address in exact-PDF mode.** Explicit
rendering can create a new corrected document.

Initial FR/LU/DE restrictions: normal paper, simplex/duplex, gray/color, fast/cheap;
no registered/QR/custom-envelope/delivery guarantee. Qualify print region, format,
margins/fonts/returns/product. Initial connector upload bound was 20 MB; the later
[current postal preflight](PINGEN_PREFLIGHT.md) restricts it to 8,000,000 bytes.
Exact account-provided `uploadOrigins` is required; no broad list/arbitrary URL or
secret sent to storage. Config: `PINGEN_CLIENT_ID`, `PINGEN_CLIENT_SECRET`,
`PINGEN_ORGANIZATION_ID`, `PINGEN_WEBHOOK_SECRET`; first qualification used explicit
sandbox plus allowed origins. [PINGEN_SETUP.md](PINGEN_SETUP.md) owns actual setup.

Callback verifies hex HMAC-SHA256 `Signature` over original bytes, organization and
`deliverable.type===letters`. Sent means `handed_to_post`, not delivered. Explicit
letter-bound signed delivered facts may be retained without promising availability
for ordinary products. Undeliverable fails; issues remain unprojected metadata,
not invented terminal failure. Raw status remains readable; no complete code list
assumed. Authenticated calculator price is required; 202/missing tariff never means
free. No unqualified catalog price is installed.

## Durable callbacks and reconciliation

`handleWebhook(request,env,domain)` runs before browser auth at
`/webhooks/{telnyx|ses|pingen}`. Max 1 MB; signature/account check precedes idempotent
`provider_receipts`. Store normalized event/minimal metadata, never HTML/PDF/contact
lists. Invalid signatures never reach D1; storage failure is 503, never 2xx.
Post-storage projection failure returns 202/pending.

`reconcileWebhookReceipts(db,domain,limit)` handles at most 100 indexed receipts/cron,
without sending. Projected means durably in business journal, possibly still orphaned,
never delivered. Business events deduplicate then match provider/command IDs.
Never derive tenant from URL/model input. Unknown-body omission limits later
reinterpretation; new normalization may need authorized provider read/replay.

Before live activation, separately qualify SNS reads/certificate rotation, provider
concurrency/quota, scanner, final accounting, transport budget and callback latency.
Admin should expose pending/orphan/unknown/dead-letter attention. SNS confirmation
tokens are temporary/operator-restricted, excluded from customer metadata export.

## Executed checks and remaining proof

```sh
npx vitest run tests/unit/providers.test.ts tests/unit/providers-webhooks.test.ts --reporter=default --reporter=json --outputFile=reports/providers-vitest.json
npx eslint packages/providers apps/api/src/webhooks.ts tests/unit/providers*.test.ts
npm run typecheck
```

Tests inspect constructed SigV4/one-recipient/exact-attachment/unsent-draft requests,
no storage token leakage, address/cost guards and no retry after response loss.
Real Ed25519/HMAC/RSA signed tests tamper body/account/cert/time. HTTP D1/Miniflare
checks persistence-before-ACK/dedupe/projection recovery/prestorage rejection/503.
Initial report `reports/providers-vitest.json` qualifies injected local transport,
not remote account acceptance. Later Pingen used a real **production** account,
synthetic PDF/auto_send:false, never staging. Registered subscriptions still needed
actual Pingen-signed reception proof. Real fax/email/postal tests need exact supplied
authorized destinations and channel gates. Record IDs/date/cost/outcome/limits
separately from local simulation metrics.
