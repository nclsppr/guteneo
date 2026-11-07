# Cloudflare alert noise — 7 November 2026

## Subsequent prevention implementation — authorized, execution pending

The native change recorded below reduces repeated reminders; it does not prevent
an authority from expiring. The subsequent local implementation adds an early
action lifecycle and dedicated operational-notification outbox using the existing
Cron. Operator decisions open at J-7, escalate at J-3/J-1 and expiry; automatic
references retain daily source renewal and escalate at 48/24 hours and expiry.
Durable per-task-occurrence/stage keys prevent repeated minute notifications.

The [authoritative preventive contract](FRESHNESS_ALERTING.md#preventive-deadline-lifecycle-and-operational-notices)
owns the exact schema, actions, strict reconciliation, private CLI, caps and
provider-outcome handling. The operator notification gate defaults off; no
customer dispatch, consent, quota, provider authority or pilot deadline is
changed. Merge, production release and operational notification activation were
explicitly authorized on 7 November, together with understandable French email
names and explanations. Additive migration 0074, the dependent runtime and
operational-email activation remain pending verified execution; genuine receipt
is separate proof. The
Luxembourg extension remains its separate draft PR and operator decision.

The approved notification activation selects French copy through
`PROVIDER_PREVENTION_EMAIL_LOCALE=fr`. Subjects and body explain the condition,
affected scope, action and human deadline in Paris time, with no CLI instruction
in recipient messages. English remains the default when no locale is selected;
invalid locale settings refuse a claim. The owner also selected three distinct,
readable French native names for technical problems, a date limit and an absent
service check. Their [exact labels and count interpretation](FRESHNESS_ALERTING.md#readable-recipient-names-and-copy)
are documented. Deployed French operational copy and actual recipient receipt remain pending proof.
The three native names and French problem/consequence/action descriptions were
subsequently saved and reread on **7 November 2026**. All three remain enabled
with email delivery configured, five-minute technical/deadline execution and
one-minute missing-check execution. Hourly technical and weekly deadline
reminders remain unchanged. This establishes the native rename; runtime release,
French operational-email activation and actual receipt still need separate proof.

Local validation exercises D1 milestones and fences in Miniflare, operational
claims/caps/terminal outcomes, twelve scheduled-flow cases and three private
CLI/RPC security cases. The additional native Workerd regression bundles the
actual sender with every external request intercepted. Its acknowledgement and
307-redirect phases verify no repeat submission or foreign forwarding. That
regression exposed the initial native incompatibility with `redirect:"error"`;
manual redirect handling corrected it. The later French copy passed 47 notifier
integration cases and one native Workerd case, including its French subject and
Paris-time deadline. These are local deterministic results,
not hosted runtime or real operational-email receipt. The [authoritative contract](FRESHNESS_ALERTING.md#preventive-deadline-lifecycle-and-operational-notices)
links the exact tests and release gates.

## Finding and current boundary

The repeated failure emails correspond to the same unresolved Luxembourg fax
pilot authority. They are not evidence of repeated customer delivery failures.
The authority expired on **3 November at 14:43:37.427 UTC**. It remains a genuine
operator deadline; this change neither renews it nor permits another fax.

At the start of this investigation, the native failure monitor combined technical
errors with persistent freshness incidents and repeated hourly. A lasting operator deadline therefore
occupies the technical failure alarm indefinitely. Extending this pilot would
postpone that symptom until another deadline. Separating the two alarm classes
lets technical incidents retain their own alert lifecycle.

**Applied native configuration, reread around 23:51 UTC:** the existing technical
monitor now uses the separated technical query with five-minute Automatic
execution, one-minute average `>=1` and hourly reminders. Freshness monitor
`1e199203cb9a4ee395ee29d30d965f41` is saved and reread with `alertClass >= 2`,
the same execution/threshold settings and 168-hour reminders. All three monitors
are enabled, including the unchanged maintenance-heartbeat monitor, and the
existing single email destination is preserved. The separate freshness monitor
was saved more than five minutes before the original query was changed.

Native SQL previews accepted the queries and showed freshness values of five to
six and technical zero. These are previews, not actual scheduled evaluation
results. A new freshness notification and the technical resolution email have
not yet been observed. Configuration application is verified; scheduled native
behavior and new receipt remain separate gaps. No application code was deployed,
production migration applied, pilot authority extended or PR merged.

The pending pilot extension remains [draft PR #142](https://github.com/nclsppr/guteneo/pull/142).
Its independent authority, runtime and migration requirements remain applicable.
See [fax tariff maintenance](FAX_TARIFF_MAINTENANCE.md) for that contract.

## Fresh evidence

Observations below were collected late on 6 November UTC, or early on
7 November in Paris. Production reads and synthetic local tests are separate.

| Observation | Verified result |
| --- | --- |
| Served application | HTTP 200, release **1.1.31**, source `4e238991dea3dd453e82f2c60bc67a284b927be3`, built 5 November at 12:22:44.008 UTC. |
| D1 incident inventory, 23:38:39 UTC | One open incident: `fax_authority`, `expired`, `operator`, deadline 3 November at 14:43:37.427 UTC. Fourteen historical `fax_tariff` incidents are resolved. |
| Live scheduled execution, 23:38:24.888 UTC | Worker `93718f6d-5c5b-4af2-98d7-747daf2fce7f`, `outcome=ok`, no exceptions. `FRESHNESS_AT_RISK` reports `freshnessAtRisk=0`, `freshnessExpired=1`, `freshnessChecksFailed=0`, `freshnessOpened=0`, `alertClass=3`, `alertFailure=1`; the same invocation completes Cron with `OK`. |
| Luxembourg source maintenance | Last success 3 November at 14:31:30.806 UTC, no error and failure count zero. Its expired independent authority prevents later renewal. |
| France/Germany references | Last success 6 November at 08:16:28.390 UTC, no error and failure count zero. |
| Resend qualification | Last success 6 November at 11:41:26.844 UTC, no error and failure count zero. |
| Business commitments | No production dispatch or attempt since 2 November 00:00 UTC and no older queued, submitting, submission-unknown, started or unknown commitment. This does not establish historical recipient delivery. |
| Notification API | The documented policy-list GET returned HTTP 403, code `10000`. This API result establishes no monitor setting. |
| Native operator inspection | Native Safari provided authenticated access. The complete inventory contained the original failure monitor and separate heartbeat monitor. The existing failure editor confirmed the combined query, Automatic five-minute execution range, one-minute average `>=1`, hourly reminder and unchanged existing destination. |
| Local planner regression | `node --test tests/security/native-alerting-plan.test.mjs`: **26 passed**, zero failed, skipped or cancelled. |

Every retained D1 result reports `rowsWritten=0` and `changedDb=false`. The
85-second tail retained only closed operational codes, numeric counters and the
Worker version. No raw logs, recipients, business identifiers, credentials or
private URLs were retained in the report.

Sanitized machine evidence remains outside Git at
`/Users/nclsppr/.codex/artifacts/guteneo-cloudflare-diagnosis-2026-11-07/runtime-readonly/`:
`d1-readonly-proof.json`, `tail-sanitized.jsonl`, `runtime-summary.json` and
`served-release.json`.

## Applied correction

The authoritative query, planning and operator procedure are in
[operational freshness alerts](FRESHNESS_ALERTING.md#separate-technical-failures-from-operational-deadlines).
The saved and reread configuration is:

| Monitor | Signal | Execution / repeat |
| --- | --- | --- |
| Existing application/delivery monitor | Original ten technical codes/four counters plus collector and tariff/postal/Resend refresh failures, independent of persistent freshness deadlines | Five minutes / one hour |
| Separate provider-freshness/deadline monitor | Server-derived `alertClass >= 2`, missing qualified coverage alarms, explicit healthy freshness required for recovery | Five minutes / **168 hours** |
| Existing maintenance-heartbeat monitor | Existing Cron completion signal | Unchanged |

The new freshness monitor has been saved, enabled and reread. It remained saved for more than five minutes before
its signal was removed from the combined monitor; the actual scheduled native
result still needs a separate observation. Its actual ID must come
from the native saved state. The existing destination is preserved and the
complete inventory is checked before creating anything, avoiding duplicates.

Cloudflare documents **168 hours as the maximum repeat interval**, not a
disable-reminders option. A continuously active freshness alarm can therefore
still send a weekly reminder. A newly triggered freshness alarm may send an
initial notification. This correction removes hourly deadline reminders without
silencing technical failures or pretending that the expired authority recovered.
[Cloudflare monitor frequencies](https://developers.cloudflare.com/notifications/monitors/#evaluation-and-notification-frequency).

Five-minute Automatic windows retain the prior prevention of false recovery
from empty one-minute ingestion windows. Missing freshness observations still
alarm; ordinary successful Cron/HTTP records cannot establish freshness health.
The native monitor is an aggregate incident signal, not a per-deadline queue or
exactly-once email mechanism. A second deadline appearing while the freshness
alarm is already active need not generate an independent initial email.

Saved configuration, subsequent evaluations and actual email receipt are
separate proof. No test notification or customer communication is required to
verify the configuration change.
