# Customer webhooks

Workspace administrators register HTTPS addresses that receive a signed notice
each time one of the workspace's dispatches changes status. This page owns the
contract, the security rules and the operating procedure. Status: local source
candidate of 11 November 2026 (release 1.1.38); it requires CI, staging and
publication evidence before any activation.

## Activation and authority

- Off by default. A workspace sends nothing until an administrator adds an
  address, and the server delivers nothing while `WEBHOOK_SIGNING_KEY` is
  missing or shorter than 32 characters; adding an address then answers
  `503 WEBHOOKS_UNAVAILABLE`.
- Only a current browser administrator session (role `admin`, verified on every
  write against `browser_sessions` and `memberships`) lists, adds, pauses,
  resumes, rotates or removes addresses. Supervisors, Operators, Observers,
  assistants, REST OAuth clients and the native applications cannot.
- A workspace keeps at most five addresses.

## Accepted addresses

`https://` on the default port, a public DNS name containing a dot, no user
name, password or fragment, at most 500 characters. IP literals, `localhost`
and private suffixes (`.local`, `.internal`, `.lan`, `.home.arpa`, `.test`,
`.invalid`, `.example` and similar) are refused with `400 WEBHOOK_URL_INVALID`.
Redirects are not followed.

## Notice

`POST` with `content-type: application/json`, `user-agent: Guteneo-Webhooks/1`
and:

```json
{
  "id": "whd_…",
  "type": "dispatch.status_changed",
  "created_at": "2026-11-11T09:30:00.000Z",
  "data": { "dispatch_id": "dsp_…", "channel": "fax", "status": "delivered" }
}
```

A notice never carries a recipient, subject, message, document, amount, quote
or provider reference. Read the dispatch through the authenticated API when
more is needed.

## Verifying a notice

Headers:

- `Guteneo-Delivery`: the notice id. Delivery is at least once: deduplicate on
  this value.
- `Guteneo-Signature`: `t=<unix seconds>,v1=<hex>`, where `<hex>` is the
  HMAC-SHA256 of `<t>.<raw body>` keyed with the address's signing secret
  (`whsec_…`). Compare in constant time and reject a `t` older than five
  minutes.

The signing secret is shown once, when the address is added or its secret is
replaced. It is derived from `WEBHOOK_SIGNING_KEY`, the address id and a
rotation counter, so Guteneo never stores it. Replacing it invalidates the
previous one at once.

## Delivery and recovery

1. A database trigger (migration `0080_customer_webhooks.sql`) inserts one
   `webhook_deliveries` row per enabled address in the same transaction as the
   dispatch status change. The insert reads only columns a dispatch always has,
   so it cannot make the status change fail.
2. The existing one-minute scheduled handler delivers at most 20 due notices
   per tick after the outbox stage, with a five-second timeout each. Each notice
   is claimed by moving its next attempt one minute ahead before sending.
3. A `2xx` answer marks the notice delivered. Any other answer, a timeout or a
   network failure schedules a new attempt after 1, 5, 30, 120 and 360
   minutes; the sixth failure abandons the notice. Abandoned notices are never
   retried automatically.
4. Pausing an address abandons its pending notices at their next due time and
   queues no new ones; removing it deletes its notices.

Response bodies are not read. Addresses, secrets and bodies are never logged;
the scheduler records only the counters `webhooksDelivered`, `webhooksFailed`
and `webhooksAbandoned`. Administration → Settings shows each address with the
state of its last notice.

## Operation

- Provision: `npx wrangler secret put WEBHOOK_SIGNING_KEY` with at least 32
  random characters per environment. Never reuse another secret.
- Rotating `WEBHOOK_SIGNING_KEY` changes every derived secret at once: every
  receiver must then be given a new secret (Replace in Administration).
- Cost: one outbound subrequest per attempt inside the existing cron; no new
  trigger, queue or instance.

## Evidence

`tests/integration/workspace-roles.test.ts` covers address validation,
administrator-only writes, the unavailable state, tenant isolation, the
trigger, signature verification, the retry schedule, abandonment, pausing and
removal. No real receiver has been called.
