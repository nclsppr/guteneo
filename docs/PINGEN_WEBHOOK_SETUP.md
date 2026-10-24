# Pingen notifications: private registration

This module inspects and registers notifications for the configured Pingen account
without a Guteneo user account, PDF, draft, credit or letter. Published source:
`44d1d5bb64418372c5174faa1ce5601681fcc813`. The real 17 September 2026 registration
is recorded below. It neither qualifies the user journey nor enables sending.

The published `/webhooks/pingen` receiver checks HMAC-SHA256 on unchanged bytes,
provider organization and `letters` channel. It durably records before positive
acknowledgement, deduplicates events and resumes interrupted projections through
cron. Code presence alone proves no subscription, installed secret or received
real notification. `issues` events remain metadata of an `unrecognized` receipt;
they do not automatically cause terminal failure.

## Verified registration — 17 September 2026

Initial private inspection read a complete list: all four categories absent,
without journals or local secret. A random 32-character hexadecimal key passed
directly to Wrangler stdin without a file, argument or displayed value. Cloudflare
reread confirmed the secret binding, version `7eb55d92-4434-4c0d-9701-4a4e8c348f87`
at 100% traffic and `LIVE_SENDS_ENABLED=false`; source remained `44d1d5b`.

Registration results were inspected individually: `issues`, `sent`, `undeliverable`,
then `delivered`. Final independent inspection found four `matched` categories and
four `registered` journals. The public receiver rejected unsigned content with
`401 WEBHOOK_REJECTED`. D1 user, organization, document, dispatch and Pingen-receipt
tables still contained zero rows.

This proves subscription configuration, not receipt of a Pingen-signed notification.
No provider test button was used, no letter created/sent and no credit purchased.
Signed transport and application journeys remain unqualified. Filtered reports:
`reports/pingen-webhook-registration-20260917.json`,
`reports/pingen-webhook-secret-20260917.json`,
`reports/pingen-webhook-public-checks-20260917.json`,
`reports/pingen-webhooks-d1-counts-20260917.json`. First-report timestamps are local
capture times rather than provider-internal creation dates.

## Contract and authority

`ProviderInspection.configurePingenWebhooks(input)` is private Cloudflare
service-binding RPC; `ProviderInspection.fetch()` remains 404. No application HTTP
endpoint, MCP tool or user role receives it. Only the operator authorized to
configure this Worker has that authority; a Guteneo account does not confer it.
Strict inputs are:

```json
{"action":"inspect"}
{"action":"register","category":"issues"}
{"action":"register","category":"sent"}
{"action":"register","category":"undeliverable"}
{"action":"register","category":"delivered"}
```

Additional fields are refused. The client controls no organization, subscription
ID, secret, URL, environment, OAuth scope or provider method. Existing bindings
supply account and credentials. The sole target is
`https://guteneo.com/webhooks/pingen`. No update, deletion, test notification,
upload, send or purchase path exists.

Both actions require `ENVIRONMENT=production`, `MODE=production`,
`PINGEN_SANDBOX=false` and configured Pingen credentials. Registration additionally
requires `LIVE_SENDS_ENABLED=false` and exactly 32 hexadecimal characters in
`PINGEN_WEBHOOK_SECRET`. A secure operator flow installs the random secret;
this RPC neither generates, returns nor installs it. Inspection works without it
and writes neither provider configuration nor R2.

## Complete inspection before creation

Every operation explicitly requests only OAuth `webhook`. Under RFC 6749 §5.1,
omission in the token response is accepted when the requested scope is unchanged;
different, broader or malformed advertised scope is rejected.

List the configured organization's subscriptions using `page[number]` and
`page[limit]=100`. Pagination must be coherent and complete: at most five pages,
500 entries, no duplicate identities, every object in the expected organization.
Never follow provider links. Incomplete, changed-account, malformed or excessive
responses block creation. Each request including body consumption is bounded by
eight seconds and 64 KiB; total network budget is 30 seconds.

Other URLs and `channel_subscriptions` are untouched. A canonical category may be
missing, match the configured secret, remain unverifiable without it, or conflict.
Duplicate target/category, a different secret or replaced recorded identity is a
conflict. Any category conflict blocks all creation. No implicit rotation or
destructive repair occurs.

Successful `configuration:unverified` proves existence only, not secret equality.
Secrets compare in memory using `timingSafeEqual`. Tokens, keys, received IDs/URLs
and provider messages are never returned or application-logged. A known
subscription ID alone may remain in the private journal.

## Concurrency and uncertainty

Four private non-business R2 objects at
`configuration/pingen/webhooks/v1/{category}.json` store account/client hash,
category, timestamp, revision, state and optional known provider ID. They contain
no signing key, token, client credentials or received URL. No D1/user-organization
write occurs.

Before the only creation POST, conditional R2 `etagDoesNotMatch:*` durably claims
the category, preventing concurrent double creation. Later transitions require
exact ETags. States are `claimed`, `registered`, `unknown`, `rejected`. Lost R2
responses, crashes before/after POST, ambiguous HTTP, expiry or invalid 201 never
restore creation authority. There is no retry-enabling expiring lease.

Unambiguous 4xx leaves `rejected`, still without automatic retry. 408/409/425/429,
redirects and 5xx remain unknown. The provider may have created a subscription
before response loss; another POST is unsafe even if the next list cannot find it.

Later inspection may find one exact match while the journal remains `claimed` or
`unknown`; inspection does not mutate it. A subsequent explicit `register` can CAS
finalize that observation without another POST. An existing matching subscription
without a journal is recognized without mutation or attribution to this tool.
Disappearance or identity changes require a separate operator decision; the tool
never deletes locks to repair automatically.

This guards operations through the journal. Direct concurrent provider-admin
changes cannot be transactional with R2; avoid them during registration and reread
final state.

## Filtered driver result

```ts
type Category = "issues" | "sent" | "undeliverable" | "delivered";
type Result = {
  provider: "pingen";
  environment: "production";
  mode: "webhook_setup";
  action: "inspect" | "register" | null;
  status: "ok" | "error";
  secretPresent: boolean;
  secretValid: boolean;
  listComplete: boolean;
  categories: Record<
    Category,
    {
      configuration:
        "unknown" | "missing" | "matched" | "unverified" | "conflict";
      journal: "none" | "claimed" | "registered" | "unknown" | "rejected";
    }
  >;
  notificationsVerified: false;
  canSend: false;
  error?: { code: Code; httpStatus?: number };
};
```

Codes are limited to `input_invalid`, `configuration_invalid`, `secret_required`,
`secret_invalid`, `request_failed`, `request_timeout`, `response_invalid`,
`http_error`, `scope_mismatch`, `list_incomplete`, `webhook_conflict`,
`journal_invalid`, `journal_unavailable`, `journal_conflict`,
`registration_pending`, `registration_rejected`. Optional HTTP status is numeric;
no free-text error passes through. All four categories are always present, even
after initial failure.

The driver bounds connection/RPC time, refilters results and never retries
registration after expiry. Timeout before RPC means no creation; after invocation,
state may be unknown and the next action is `inspect` only.

## Required post-publication proof

The dedicated driver executes one category at a time:

```sh
node scripts/setup-pingen-webhooks.mjs --inspect
node scripts/setup-pingen-webhooks.mjs --register issues
node scripts/setup-pingen-webhooks.mjs --register sent
node scripts/setup-pingen-webhooks.mjs --register undeliverable
node scripts/setup-pingen-webhooks.mjs --register delivered
node scripts/setup-pingen-webhooks.mjs --inspect
```

This is not a batch to run without examining every result. Register only after
initial inspection and authorized secret installation:

1. Inspect without a secret and examine conflicts.
2. When configuration allows and the operator authorizes, install a random 32-character hexadecimal secret without value-bearing files, arguments or output.
3. Explicitly register each missing category, then inspect all four exact matches; retain filtered results only.
4. Separately qualify a real Pingen-signed notification through its official **Send test webhook** button, without a letter. Observed OpenAPI operations for `requests/send-test`, `requests` and `retry` were empty; invent no calls. Local fabricated notifications are not provider proof.

Registration 201 or `matched` proves configuration, not a notification. Even after
transport testing, actual letter correlation, tracking transitions, funding,
tariff, user account and consent remain separate. This tool always returns
`notificationsVerified:false` and `canSend:false`.

Primary sources consulted 17 September 2026: [Pingen OpenAPI](https://api.pingen.com/documentation/swagger-docs)
(`GET/POST /organisations/{organisationId}/webhooks`, `webhook`, 20–32-character key),
[official n8n integration](https://github.com/pingencom/n8n-nodes-pingen2),
[RFC 6749 §5.1](https://www.rfc-editor.org/rfc/rfc6749#section-5.1),
[conditional R2 writes](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).
Official documentation is no account-execution evidence.

Local unit proof uses real Miniflare conditional R2 writes and synthetic provider
transport: concurrency, unknown outcome, crash/write loss, pagination, foreign
keys/accounts, strict inputs, timeout and no leakage. Separate report:
`test-results/pingen-webhook-setup-vitest.json`, distinct from release totals.
Tests use no real provider or remote configuration.
