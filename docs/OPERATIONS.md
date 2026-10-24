# Production operations

This locally tested instrumentation is not deployment proof. Verify Cloudflare
version/published settings after each release. These tools send nothing, make no
payment, activate no channel and provision no infrastructure.

## 9 October 2026 review and monitor

[Production review](PRODUCTION_REVIEW_2026_10_09.md) records actual observations,
corrections and proposed canaries. `npm run monitor:prod:live` serves a local view
at `http://127.0.0.1:8796`: minute-by-minute public measurements, partial per-feature
qualification and 120-second visible expiry. No permanent monitoring, external
notification or communication is activated. Private dashboards/canaries are separate.

## Quick inspection

`node scripts/production-status.mjs` makes only three anonymous canonical reads:
`/api/health`, `/api/capabilities`, `/release.json`. It accepts no arguments/secret
files, refuses redirects and prints bounded availability/source/identity/scanner/
send-switch projections. Attention exits 1. OK proves neither real login, provider
journey, Queues nor cron; `deliveryQualification:not_checked`. It requires configured
identity/scanner binding, closed simulation and send flags matching manifest, but
does not inspect signature freshness.

Authorized Cloudflare operators use Observability for logs, Metrics for errors/
CPU/requests and Deployments for version:

- [Application](https://dash.cloudflare.com/39ac9fada6cba44d9ecf09d467609e69/workers/services/view/guteneo-app/production).
- [Private documents](https://dash.cloudflare.com/39ac9fada6cba44d9ecf09d467609e69/workers/services/view/guteneo-documents/production).
- [Private scanner metrics/deployments](https://dash.cloudflare.com/39ac9fada6cba44d9ecf09d467609e69/workers/services/view/guteneo-scanner/production), persistent logs disabled.

Public summary grants no internal data/incident history access. No third-party
alerting, log export or additional permanent monitor is configured.

## Reading signals

Application JSON events use `schema:1`, `component`, `event`, `correlationId`,
`versionId`, `route`, `code`, `durationMs`, and relevant `method`, `status`, `stage`
plus integer counters. Version comes from `WRANGLER_VERSION_METADATA`; unavailable
means absent/invalid binding, never an assumed SHA. Correlate Deployments/release
proof; response `X-Correlation-ID` locates the event.

| Signal | Meaning/first action |
| --- | --- |
| `event=mcp_tool_error` | Tool failed even with HTTP 200. Code separates authority/business/internal errors; no arguments/exception text collected. |
| `event=http`, status ≥500 | Technical/configuration failure; filter correlation/version and fixed route code. |
| `CONFIGURATION_INVALID` | Configuration guard closed route, including preauthentication early exits. |
| `event=cron`, `stage=complete` | Maintenance completed. No completion for five minutes calls for cron/deployment inspection; initial operator threshold, not measured SLO. |
| `CRON_FAILED` | Cloudflare still sees cron failure; stage names first interrupted task without serializing exception. |
| `IDENTITY_NOT_CONFIGURED`, `stage=identity` | Verified callbacks reconciled, then remaining cron stopped under existing protection. |
| `event=queue`, `retried>0` | Queue rerequests, including 300-second wait while sending closed; no new send authority. |
| `deadLetters>0` | Invalid/dead-letter messages persisted before acknowledgement; inspect private register, never auto-reinject. |
| `unknown>0` / `uncertain>0` | Unknown provider outcome/expired lease; reconcile before action, no automatic resubmission. |
| `OUTBOX_DEFERRED` | Acceptance/outbox persisted; cron will publish. Never recreate dispatch. |
| Cron `pending>0` | Some bounded-batch callbacks remain; not total backlog size. |
| `component=documents`, status ≥500 | Private-service failure; quarantine guards remain. For scanner use document errors/Cloudflare metrics; persistent collection stays closed. |

One summary per queue batch/cron uses existing counters without D1 statistical
reads. Published counts outbox publication, acked counts processed messages, never
deliveries/unique billing volume; replay may recur. HTTP duration ends at response,
not complete client stream. Each Worker/batch has its own UUID without new distributed
or content/recipient correlation.

## Data and cost

Events exclude full requests/responses, bodies, recipient/user/organization/document
IDs, content, tokens, cookies, URLs/query strings, free exceptions/stacks. Routes
are closed codes; only known paths/expected opaque IDs are logged. Unknown paths
and `/media/:token` stay silent; successful public assets do not each log. Existing
SNS fixed-code diagnostics remain.

Hosted app/documents request `observability.enabled=true`, `head_sampling_rate=1`,
`logs.persist=true`, `invocation_logs=false`, `redact_query_string=true`, traces off.
Local variants persist nothing. Scanner explicitly uses `observability.enabled=false`:
Containers SDK can emit raw errors before wrapper. Instrumentation exists but
persistent collection remains unqualified/disabled. No bucket/Logpush/Tail Worker/
external service is created. Auth/quota/quote/approval/send transitions are unchanged.

Dated 17 September 2026 prices: Workers Free 200,000 events/day, three-day retention;
Paid twenty million/month then USD0.60/million, seven days. Account-shared inclusion
proves no remaining quota. Minute cron gives approximately 43,200 events/30 days
before HTTP/Queues/errors/documents. 100% sampling suits initial qualification;
monitor before scale. Lower sampling can lose errors. Logs are neither backup nor
durable audit; no EU log residency claimed.
[Official Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/).

Safe projection covers our messages, not every platform metadata field.
`redact_query_string` supplements OAuth-code protection; `invocation_logs=false`
disables automatic invocation events. Uncatchable CPU/memory failures remain
platform events. Remote privacy qualification must inspect synthetic markers in
both platform metadata and JSON; never use actual secrets/login codes/signed URLs.
Libraries may log: Containers 0.3.7 proxy diagnostics are separate from subclass
`onError` mapping to `SCANNER_CONTAINER_ERROR`. That wrapper does not qualify
collection; it stays off. Container requests use fixed `/scan`/`/health` paths
without credentials/external URLs. Enable no Puppeteer/SDK debug or raw capture.

## Verifying publication

1. Compare published/versioned settings: app/doc invocation logs/traces off, query redaction; scanner observability off; private Workers without public routes/workers.dev.
2. Rerun summary, inspect a known-route event/correlation/version and recent complete cron; provoke no send/business error to get logs.
3. Inspect synthetic privacy markers in both JSON and platform fields.
4. Incident records retain only code/time/version/correlation UUID, never raw console export/callback body/business table.

Local tests cover closed projections, early identity errors, OAuth markers, private
exceptions, consumer acknowledgements/retries, uncertainty without retry, cron stages
and privacy settings. They prove no remote collection/actual account retention.
[Version metadata](https://developers.cloudflare.com/workers/runtime-apis/bindings/version-metadata/),
[Wrangler observability](https://developers.cloudflare.com/workers/wrangler/configuration/#observability).
