# Cloudflare alert diagnosis — 3 November 2026

## Finding

The recurring `Application and delivery failures` emails are driven by one
unresolved **Luxembourg operator-test fax authority**, not a failed technical
tariff renewal. Its registered authorization and current live tariff both end
at **2026-11-03T14:43:37.427Z**, or **15:43:37 CET**. The J-1 incident opened at
2026-11-02T14:44:35.879Z, about 58 seconds after the warning boundary.

At the read-only production snapshot completed at **13:53:30 UTC on 3 November**,
the incident remained `at_risk`, in `family=fax_authority` and
`renewal_mode=operator`. This is an actionable authorization deadline. Daily
commercial-source maintenance cannot extend it. At the deadline, the current
tariff expires and the affected live preparation/acceptance must fail closed.
The [existing pilot contract](FAX_TARIFF_MAINTENANCE.md#luxembourg-pilot-scope)
owns that boundary.

## Evidence and limits

| Observation | Verified result |
| --- | --- |
| Native Apple Mail | Repeated emails for the same existing failure monitor, including 3 November at 09:47, 10:47, 11:47, 12:47 and 13:52 CET. The latest opened message reports `5 >= 1`, evaluated at 12:49:16 UTC. A 2 November message reports `4 >= 1`, evaluated at 14:49:16 UTC. No exhaustive mailbox count is claimed. |
| Production D1 incidents | One open `fax_authority` incident; fourteen historical `fax_tariff` incidents remain resolved. No other open incident appears in this snapshot. |
| Selected pilot | One active registration, created 30 October. Its current live tariff is `operator_test`, Luxembourg fixed, at most ten pages and a 200-cent ceiling. Both validity caps are the exact deadline above. |
| Pilot technical renewal | Last success 2 November at 14:30:27 UTC; no error, failure count zero. The next daily attempt is due 3 November at 14:30:27 UTC and cannot extend the independent authority. |
| France/Germany reference maintenance | Last success 3 November at 08:13:26 UTC; no error, failure count zero. |
| Resend qualification maintenance | Last success 3 November at 11:39:28 UTC; no error, failure count zero. |
| Live Worker observations | Four Cron invocations from 13:47:25 through 13:50:25 UTC, all `outcome=ok`, with zero exceptions. Each emits `FRESHNESS_AT_RISK`, one at-risk item, zero expired items and zero failed freshness checks, followed by a separate successful completion heartbeat. |
| Business operations | No production dispatch or attempt created since 2 November 00:00 UTC. No queued, submitting or submission-unknown dispatch, and no started or unknown attempt, including older records. This does not qualify historical recipient delivery. |
| Served release and public checks | Application 1.1.28, source `9207010451037533a6e2f7150635c223c965f307`, Worker `94d9e413-5fe3-4fd8-a396-054b58432b66`. Health responds 200; the public status snapshot is fresh with partial qualification. These checks do not test authenticated delivery. |

Every retained D1 evidence statement reports `rows_written=0` and
`changed_db=false`. The bounded tail retains only closed operational fields;
message contents, recipients, credentials and private URLs are excluded.

The count of four or five in the emails is consistent with repeated minute
observations of the same risk within the five-minute query exported by
`scripts/native-alerting-plan.mjs`. This aggregation explanation is an inference:
the current native SQL and reminder configuration were not freshly reread.
Local browser access is disabled, and the available Wrangler session does not
advertise notification-read permission. Native email receipt, runtime signals
and the D1 incident are fresh observations independent of that limitation.
[Cloudflare's monitor documentation](https://developers.cloudflare.com/notifications/monitors/#evaluation-and-notification-frequency)
distinguishes scheduled evaluation from repeat notifications while an alarm
remains active. The historical monitoring-window incident does not establish
the cause of this new episode.

Production still serves 1.1.28. The diagnostic branch starts from current
`origin/main`, `c898ad20741524ed136bcca9c6d0aa1eb7114062`; newer source commits
are not evidence of a newer deployed application.

## Proposed correction — not applied

1. **Close the pilot if the test is finished.** Prepare a private, reviewed,
   tenant-scoped operator plan for the exact Luxembourg registration and its
   selected live tariff. Recheck current fingerprints, refresh leases, active
   quotes and queued/submitting/unknown commitments immediately before any
   authorized transaction. Revoke the exact registration and live tariff
   together, retaining immutable history and audit. Keep other fax routes and
   archived reviewer access outside that transaction. Revoking only the
   refresher leaves its consumed tariff monitored in operator mode; it does not
   complete retirement.
2. **If Luxembourg live sending must continue, qualify a production route.**
   Obtain explicit operator authority and actual provider eligibility for the
   exact route. Review a new immutable registration/policy and the required
   schema, runtime and operator-tool changes together. The existing registration,
   database guard, registration utility and live-domain guard retain an
   independently bounded November 3 pilot; changing one date cannot establish
   ongoing production qualification. Technical source renewal, cost ceilings,
   current membership and per-dispatch approval remain separate controls.
3. **Make the next alert actionable.** Prepare a separate diagnostic improvement
   that identifies the closed incident family, operator-versus-automatic action,
   state and deadline in private read-only inspection. Review a clearer name for
   the existing aggregate monitor that includes operational deadlines. Any
   future runtime/native-query change must preserve the current failure signal,
   explicit healthy recovery and missing-heartbeat coverage, then receive its
   own authorization and qualification. No such change is implemented here.

After an authorized pilot retirement or newly qualified replacement, let normal
collection reconcile the exact inspected binding. Verify the D1 transition,
fresh healthy observations, native alarm recovery and the actual resolution
email separately. Keep the current risk visible until its underlying consumed
authority or route has genuinely changed.

## Local validation and deliverable

The relevant existing regressions were rerun on the diagnostic branch:

- Native alert planning and recovery: **19 passed**.
- Provider freshness: **3 selected tests passed**, covering separate authority,
  authority-capped tariffs and retained tariff monitoring after source revocation.
- Incident reconciliation: **1 selected test passed**, covering expiry without
  automatic authority extension.

The other integration cases were deliberately excluded by the focused test
filters. These synthetic local tests do not prove a production mutation or real
send. The branch contains this dated analysis and its index/handoff links;
application code, authorization, prices and native monitor configuration are
unchanged.

Sanitized machine evidence and test outputs are retained locally outside Git at
`/Users/nclsppr/.codex/artifacts/guteneo-cloudflare-diagnosis-2026-11-03/`:
`readonly-proof.json`, `tail-sanitized.jsonl`, `focused-provider-freshness.json`,
`focused-authority-expiry.json` and `native-alerting-tests.txt`.
