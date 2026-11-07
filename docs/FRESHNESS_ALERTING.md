# Operational freshness alerts

The [7 November 2026 investigation](CLOUDFLARE_ALERT_NOISE_2026_11_07.md) freshly
observed production 1.1.31 and one expired operator fax authority. The native
[separation](#separate-technical-failures-from-operational-deadlines) is now saved
and reread: technical failures retain hourly reminders; the separate freshness
monitor uses 168-hour reminders. All three monitors are enabled, with unchanged
existing destination and heartbeat. SQL previews validated; actual scheduled
native results and new freshness/resolution email receipts remain unobserved.
The older rollout and receipt statements below retain their dated scope.

The subsequent preventive lifecycle and dedicated operational-notification outbox
are **local implementation candidates**, not deployed or activated. They add
early operator action and durable milestone deduplication; the native cadence
change alone does not prevent an expiry. See [prevention and activation](#preventive-deadline-lifecycle-and-operational-notices).

At the 1 November handoff, production is 1.1.26 with the alert/reference
corrections. Separately authorized Resend Full-access source inspection now
passes; genuine scheduled renewal and incident recovery still await the 11:37 UTC
Cron evidence. This does not establish a new notification or business-email
receipt. The dated rollout observations below remain separate evidence.

This mechanism detects deadlines that selected production operations actually
consume. It changes no customer price, source evidence, provider configuration,
human authority, mandate, quote or dispatch. API release 1.1.22 and additive
migrations 0068–0070 were deployed on 31 October. The legacy native extension was
saved and triggered/resolved email receipt was observed; those episodes did not
prove durable incident recovery. PR #131 merged the 1.1.23 compatibility changes; source
`afedd099081099fa83bf6bd9edaf6dcabacbea03` was published on 1 November. Read-only
post-deployment checks observed the new active postal binding and four additional
inactive forbidden-route bindings, with no pending or unknown business send. Production 1.1.24 and the final saved Automatic/300-second native monitor
configuration were subsequently deployed and verified on 1 November. This
establishes neither every provider renewal nor a new notification receipt. Native editor attempts on 1 November rejected JSON expressions
inside conditional aggregates and an expression nesting depth above ten; none
of those attempts saved a replacement query.
Production source access and each provider's genuine renewal remain distinct
from runtime/schema deployment and native email receipt.

## Selection, dates and meaning

The collector owns proof of current use. A candidate must belong to a production
tenant, selected provider/account/route, verified sender and enabled mechanism.
Disabled channels, revoked policies, historical generations, informational dates
and continuous-review archived references do not become candidates. Failed reads
or unexplained guard loss cannot prove that a previously used binding is inactive.
An explicitly forbidden fax route is not a consumed price-expiry gate, although
its preparation refusal remains enforced. The candidate's narrowly proven
historical postal-window chain avoids confusing a later generation timestamp
with an older, unchanged price start. The exact lineage and unknown-result
boundaries are owned by [provider freshness](PROVIDER_FRESHNESS.md#historical-postal-window-generations).

| Consumed field                                        | Actual consumer                                            | Detection and renewal boundary                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trusted_delivery_costs.expires_at`                   | `resolveDeliveryPrice` and `valid_live_delivery_quotes`    | Current qualified policy only; exact sender, provider, account, route and options. Pingen uses the latest generation's policy IDs and current sender declaration/profile, grouped rather than alerting separately for each printing option.                                                                                                 |
| `trusted_fax_usage_tariffs.expires_at`                | `resolveFaxUsageTariff` and quote validation               | Current exact live route only. Exclude `review_prepare_only`, including its archived source dates. Genuine source refresh can replace a technical pricing revision; it cannot extend the pilot authority.                                                                                                                                   |
| `fax_tariff_refresh_sources.authorization_expires_at` | Scheduled source selection and the new tariff's expiry cap | Current active, consumed registration only. This is an operator authority, never a renewable observation. When the effective tariff deadline is this cap, identify the authority cause rather than duplicate it as a technical source failure.                                                                                              |
| Effective automatic Resend qualification              | `ensureEmailSender` automatic pricing                      | After a genuine successful refresh use `resend_policy_refresh_state.qualified_until`; before that retain the strict `RESEND_TARIFF_QUALIFIED_UNTIL` contract. An installed automatic policy retains its own immutable consumed deadline when its producer is disabled. An exact manual replacement suppresses the unused automatic setting. |
| `resend_send_limit_policies.expires_at_ms`            | Atomic Resend provider admission                           | Monitor only while the acceptance mechanism is selected. Final-send suspension can stop this consumer while email preparation still consumes its price policy. Neither counters nor reserved/unknown holds are reset.                                                                                                                       |
| Current tariff/FX evidence                            | Parent pricing revision                                    | `tariffDate` and `fx_date` alone have no independent age limit in these gates. Never invent `date + N days`; use the deadline actually consumed by the mechanism.                                                                                                                                                                           |

Normal short quote TTLs, preflight/approval/session/token expiry and voluntarily
bounded expert delegation are outside this initial detector. None is prolonged
automatically. Families are closed: `fax_tariff`, `delivery_policy`,
`fax_authority`, `resend_tariff`, `resend_send_limits`; adding a family requires a
documented real consumer, selection rule and test. The collector establishes the
last two families' actual configured gates rather than inferring them from an
unrelated rate or account plan.

Scanner maintenance remains separate. Its existing daily refresh and six-hour
watchdog check the actually qualified private runtime; signatures fail after
72 hours. The watchdog now warns at 42 hours on the actually loaded engine,
after validating current runtime identity. Six hours of normal scheduling leaves
a 24–30-hour lead; GitHub delays can reduce this and no exact notification time is
guaranteed. The shared qualification remains 48 hours, and runtime refusal remains
72 hours. The watchdog also requires a successful qualification within 30 hours
and warns on maintenance credentials within 14 days. These are distinct deadlines.
The pricing registry does not invent scanner health or make additional health or
network calls. Scanner failures use the existing GitHub Actions notification
settings; their receipt is separate from the native Cloudflare email route.

## Durable reconciliation and exact J-1

The collector in `apps/api/src/provider-freshness.ts` performs local reads only.
Six durable cursors cover registered fax sources, current manual fax v3 rates,
legacy guaranteed-total fax rates, grouped Pingen setups, effective Resend gates
and manual email/postal policies. Each inventory inspects at most six targets per
pass, producing at most 48 evaluations; progress survives a new Worker instance.
Unknown targets do not hold the cursor forever and remain observable failures.
This is bounded fair inspection, not a claim that an arbitrarily large inventory
is checked in one minute. Cursor timestamps describe inspection, not successful
notification or incident commitment. A later failed reconciliation emits its own
control-failure signal.

Manual policies receive `mode=operator` warnings only and never become registered
automatic sources. A manual Resend policy replacing the default automatic sender
suppresses that unused automatic qualification setting, including when absent or
expired; its actual immutable policy deadline remains monitored. Account limits
have their own independently verified status. Preparation and acceptance are
selected independently: turning off final sending does not prove a price used by
preparation is inactive. Domain/binding contradictions affect both consumers;
capacity affects acceptance, and commercial-price drift affects automatic pricing
rather than an exact qualified manual override. The legacy fax fallback is relevant
only while no v3 row has ever owned the same tenant/sender/account/application;
a revoked v3 row still fences that fallback, matching the actual resolver.
Review-only references, obsolete pilot rates and disabled/revoked policies do not
become active candidates. Pingen policies remain one grouped current generation,
with their contract's country-dependent option count, selected by the postal
preparation consumer. Final-send switches and a disabled send channel alone do not
deselect that consumer or close its freshness incident.
Revoking a fax refresh registration stops that refresher, but does not revoke an
already qualified tariff. Its actual consumed expiry remains monitored in
operator mode until the tariff or channel itself is explicitly suspended; the
unused registration authority is no longer an active candidate.

`reconcileFreshnessAlerts(db, evaluations, now)` receives only explicitly inspected
bindings. Each evaluation supplies tenant, closed family, binding SHA-256,
`active`, and current immutable revision/deadline/mode candidates. A proved
deselection, suspension or revocation uses `active:false` with no candidates.
An active binding with unknown candidates is rejected; omit an uninspected
binding and report the failed check separately.

J-1 means exactly 86,400 seconds before the consumed UTC deadline, inclusive,
without local-calendar rounding. An incident is expired at the deadline itself.
Its private key hashes tenant, family, binding, immutable revision, actual deadline,
renewal mode and the fixed threshold. Raw business identifiers do not reach logs.

One D1 transaction updates evaluation fences and incidents. Repeated or overlapping
evaluations create no duplicate. Older evaluations, and conflicting evidence at
the same instant, cannot resolve or reopen newer state; each rejected evaluation
increments `freshnessChecksFailed` rather than implying a newly successful check.
A fresh replacement
resolves only the exact inspected binding; absence from a bounded page resolves
nothing. Aggregates include all unresolved incidents across pages, and compare
their deadlines with the current clock even when those bindings were not revisited.
Explicit re-enablement can reopen its same incident, with a counted transition,
without inventing a second deadline. Original identity/deadline/first observation
remain immutable. The tables contain only operational metadata and cascade when
their tenant is deleted.

## Preventive deadline lifecycle and operational notices

The 7 November candidate adds migration
`0074_provider_freshness_prevention.sql` and
`apps/api/src/freshness-prevention.ts`. It reuses the existing bounded collector
and minute Cron. Technical renewal already attempts registered fax references
and Resend qualification daily; postal renewal starts within seven days of its
90-day policy expiry. Fax/postal transient failures use capped retry backoff,
while Resend retries hourly. Those source checks do not extend independent
operator authority. The new lifecycle exposes a needed decision before it becomes
an expired J-1 incident, rather than trying to cure expiry by changing reminders.

| Current selected candidate | Preventive stages | Operator action |
| --- | --- | --- |
| Operator-managed authority or manual policy | Exactly seven days, three days and one day before expiry, then expiry | Explicitly renew or retire the authority; review a manual policy under its own qualification contract |
| Registered automatic technical evidence | Exactly 48 hours and 24 hours before expiry, then expiry | Repair genuine source renewal, check the lease/binding and preserve active commitments |

All boundaries use elapsed UTC time and are inclusive. Automatic references
have a seven-day lifetime; opening their action at seven days would create a
permanent false warning immediately after every successful renewal. The
48-hour threshold instead indicates that normal daily renewal has not maintained
its expected runway. When a candidate is first observed late, only its current
most urgent stage is queued; earlier stages are not backfilled into a burst.

The existing J-1 incident table, its immutable 86,400-second threshold and its
strict failed-check/expired counters remain unchanged. The scheduler obtains one
explicit evaluation time and uses it for collection, existing incident
reconciliation and preventive reconciliation, in that order. The existing
tenant/family/binding evaluation hash fences each preventive write. An omitted
page, failed inspection or stale conflicting evaluation cannot resolve a task.
A genuine replacement or proved deactivation resolves only its exact binding.
Source and business records are never extended or changed by prevention.

Two additional operational tables retain a task and a notification ledger:

- A task key binds tenant, family, binding, immutable revision, real deadline and
  renewal mode. Stage only escalates within one occurrence. Explicit
  re-enablement creates a new counted occurrence of the same retained task.
- A notification key uniquely binds that task occurrence and stage. Concurrent
  or repeated minute observations cannot create another copy. An older pending
  stage is superseded when a higher stage is selected, or when the task is
  genuinely resolved. Terminal provider attempts remain retained.

This is a dedicated **operational** outbox, separate from customer dispatches,
approvals, quota reservations, campaign work and provider delivery receipts.
It grants no ordinary REST, MCP, browser, native or workspace-role authority.
An assistant cannot turn it on through an OAuth scope or expert mandate.

### Bounded notification processing

`processPreventionNotifications` runs at most once in the same pre-identity Cron
stage, only after collection and both reconciliations complete without failed
checks or stale fences. Partial or failed inspection leaves pending notices
unattempted. Both the atomic claim and post-claim read additionally require a
currently active binding whose evaluation time matches the task's latest
evaluation; a stale active task cannot stand in for current selection.
The sender remains **off unless explicitly activated** with
`PROVIDER_PREVENTION_EMAILS_ENABLED=true` in a production/production environment.
Activation additionally requires the existing Resend sending switch/key and
verified domain, an exact operator-approved sender and recipient in
`PROVIDER_PREVENTION_EMAIL_FROM` / `PROVIDER_PREVENTION_EMAIL_TO`, and a valid
`PROVIDER_PREVENTION_EMAIL_DAILY_LIMIT`.

The default daily limit is **four attempted notifications per UTC day**; an
explicit limit can be one through twenty. A hard account-wide guard permits
**at most one new attempt per rolling hour**, irrespective of tenant, stage or
provider result. One Cron invocation claims at most one notice. Claims, including
failed or ambiguous attempts, consume these guards. This bounds outgoing volume
and cost exposure without claiming free email or a fixed bill. No new Worker,
paid infrastructure or provider account is provisioned.

The fixed provider endpoint receives only the configured operator envelope and
a closed family/stage/deadline message with a concrete recovery instruction.
No customer content, recipient, tenant/source identifier, document, credential
or private URL enters the operational body or logs. The existing service-binding
inspection command is the recovery entry point; a notice is not business-send
approval or evidence that a customer communication failed.

A committed claim permits exactly one application submission attempt for that
notification. The stable provider idempotency key supplements that constraint.
There is **no automatic retry after claiming**, including a crash before the
request, a known provider refusal or an unknown outcome. An interrupted
two-minute sending lease becomes `unknown`; it never returns to `pending`.
A replacement stage may later create its own different notice under the same
hourly/daily caps.

The status contract is explicit:

| Status | Meaning |
| --- | --- |
| `pending` | Unique current-stage notice awaiting its bounded first claim |
| `sending` | Durable claim exists; one provider attempt may be in progress |
| `sent` | Provider returned success with an admissible reference and that acknowledgement was persisted; recipient delivery is not established |
| `unknown` | Request/result/acknowledgement persistence is ambiguous, malformed or interrupted; operator reconciliation required |
| `failed` | Known refusal or a changed task prevented submission; no automated retry |
| `superseded` | Still-unclaimed stage became obsolete through escalation or real resolution |

Notification failures and unknown outcomes contribute to
`freshnessChecksFailed`, preserving the independently hourly technical monitor.
The same applies to prevention storage/migration failures. Early preventive
actions alone do not fabricate a J-1 failure or unhealthy Cron. Current expiry
still emits `FRESHNESS_AT_RISK`; a completed Cron cannot clear it. The scheduler
continues unrelated callback, outbox and document maintenance after a preventive
failure, and this stage runs before interactive identity availability is checked.
Failed/unknown notification counters describe retained current-task outcomes;
repeated observations are not additional provider attempts or delivered emails.

### Private operator report and release order

An existing authenticated same-account `ProviderInspection` service binding
provides `inspectProviderPrevention()`. Its HTTP entrypoint still returns 404.
The method performs aggregate reads only. The existing operator CLI exposes it
as:

```sh
node scripts/provider-readiness.mjs freshness-prevention
```

The report contains at most 25 action groups, an explicit `truncated` flag, active
task count and the six closed notification-status counts. Each action group has
only family, mode, stage, real deadline, count and one recovery action:
`renew_or_retire_authority`, `review_manual_policy` or
`repair_automatic_renewal`. It exposes no tenant, task, binding, source, recipient
or provider-reference identifier. Errors are closed messages. A missing schema
does not become an empty healthy report.

Release requires a separately authorized production change. Apply additive
migration 0074 before the dependent runtime. The old runtime tolerates these
unused tables; the new runtime reports a missing migration as a control failure
while continuing unrelated safe maintenance. Publish and verify the exact runtime
with the email gate still off, inspect real task selection and the private report,
then separately authorize and configure the exact operational envelope and caps.
Observe a genuine scheduled claim and provider acknowledgement, then qualify
actual receipt separately. No deployment, migration, operational email, pilot
extension or business send follows from the local implementation/tests.

The Luxembourg February extension remains a distinct draft PR and operator
activation. A preventive task can request that decision but cannot make it.
Native persistent monitoring remains the fallback for missing coverage and real
unresolved conditions; the operational outbox supplies durable per-stage notice
deduplication that an aggregate native monitor cannot provide.

Local qualification covers real D1 migration/constraint execution in Miniflare,
milestone boundaries, concurrent reconciliation, replacement/re-enablement,
notification claims/caps/unknown holds, strict current-binding refusal, Cron
deferral and private inspection. The native Workerd regression bundles the actual
sender without a fetch dependency override and intercepts all outbound traffic.
It verifies provider acknowledgement, no repeat submission and a 307 redirect
that remains unknown without forwarding to its foreign location. This caught a
native fetch incompatibility in the initial `redirect:"error"` draft; the
corrected transport uses manual redirect handling. Node-only injected fetch
results did not establish that native behavior. No test contacts a real provider
or proves hosted execution, operational email receipt or customer delivery.

Relevant commands are:

```sh
npx vitest run tests/integration/freshness-prevention.test.ts tests/integration/provider-prevention-notifications.test.ts tests/unit/provider-prevention-cron.test.ts
node --test tests/security/provider-prevention-inspection.test.mjs tests/security/provider-prevention-runtime.test.mjs
```

## Persistent Cloudflare channel and honest deduplication

The separately verified native Cloudflare freshness monitor retains persistent
condition coverage. Its existing destination stays private and unchanged. This path needs
no Resend email, business communication, new Worker or monitoring service.
The historical configuration/receipt evidence in `OPERATIONS.md` is dated; it
does not replace a fresh readback or prove the newly extended condition delivered.

The application emits a separate closed observation:

- `event=freshness`, `route=maintenance`, `stage=freshness`;
- `FRESHNESS_AT_RISK` while any known incident is at risk or expired;
- `FRESHNESS_CHECK_FAILED` when the collector or reconciliation cannot complete;
- only the coarse integer counters `freshnessAtRisk`, `freshnessExpired`,
  `freshnessOpened`, `freshnessResolved`, `freshnessChecksFailed`.

The ordinary Cron `complete` heartbeat remains independent. A valid price close
to expiry is not `CONFIGURATION_INVALID`, and its warning does not stop unrelated
safe maintenance or the outbox. Unknown control results never become healthy
zero counts. Logs contain no tenant/binding/revision key, recipient, content,
URL, credential or free-form exception.

### Native recovery requires fresh evidence

The deployed 1.1.24 implementation derives two numeric fields on the server after
closed-field observation projection. Callers cannot supply or override them.
The shared `packages/observability/native-alert-signals.json` owns the ten
historical failure codes and four counters used by both runtime and plan.

| `alertClass` | Meaning                                                            | `alertFailure` |
| ------------ | ------------------------------------------------------------------ | -------------- |
| `0`          | Ordinary observation without a historical failure                  | `0`            |
| `1`          | Any original failure code or positive original failure counter     | `1`            |
| `2`          | Qualified healthy application freshness observation                | `0`            |
| `3`          | Freshness failure, malformed envelope or incomplete/nonzero health | `1`            |

Freshness classification takes precedence when a freshness observation also
contains an original failure. Class 2 requires the application component,
`event=freshness`, `route=maintenance`, `stage=freshness`, `code=OK` and all three
`freshnessAtRisk`, `freshnessExpired`, `freshnessChecksFailed` counters explicitly
zero. A positive original failure counter prevents health. HTTP success and
completed Cron records cannot supply freshness coverage. Unrecognized or
incomplete freshness observations stay class 3. The two fields carry only these
closed numeric states, never an identifier, raw response, credential or URL.

The inspected native editor exposes no Manual time-range selector and rejects
explicit SQL timestamp predicates because its request supplies `time_range`.
The separately verified final configuration retains **Automatic** mode and changes the
existing monitor's SQL plus execution interval from sixty to **300 seconds**.
Cloudflare supplies the corresponding preceding five-minute range externally;
the SQL contains no timestamp expression or range-mode workaround.

The query keeps account/Worker filters and selects `alertClass >= 1`. Its only
conditional is `if(COUNT(*) = 0, 1.0, SUM(attributes['alertFailure']))`: JSON is an
immediate aggregate argument or comparison, not nested inside a conditional.
Exact SQL is exported as `nativeFreshnessMonitorQuery` by the plan script. Prior
conditional-JSON, excessive-depth and timestamp attempts saved no replacement;
a probe using an existing numeric counter was accepted after changing the
missing-row branch from integer `1` to floating-point `1.0`. The native type
checker requires a Float64 branch compatible with numeric JSON `SUM`; the
integer branch had produced a type error. This qualifies that aggregate/type
shape against existing observations, not the new marker fields, their deployment,
the final saved monitor or notification behavior. The later runtime publication
and final saved native readback were separately verified on 1 November; no new
notification receipt is inferred.

This is an explicit operational tradeoff. All original ten-code/four-counter
failures and freshness failures now remain in the same five-minute range,
conservatively extending the original one-minute failure lookback. The nominal
next-evaluation delay increases from at most one to at most five minutes;
ingestion, scheduling and notification delays can add more, so five minutes is
not a delivery or detection SLA. The sixty-second average, `>=1` threshold,
hourly reminders, existing destination and independent minute heartbeat remain
unchanged. No authentication, approval, sending, provider or application safety
gate changes. This is the delivery/maintenance monitor, not a replacement for
security enforcement or the separate heartbeat.

An empty selection returns one, so missing telemetry cannot fabricate recovery.
Any class 1 or 3 failure holds an alarm in the supplied five-minute range. Class 2
permits zero only when no selected failure remains. Recovery waits for the last
failure to age out and the next successful scheduled evaluation. Coverage loss
can also overlap the independent missing-heartbeat alarm; neither signal
extends a business deadline or proves D1 health independently.

Deploy and verify the marker-producing runtime before changing the native query.
Retain the legacy query while at least five minutes of current marker-bearing
observations accumulate. Legacy records have no markers and supply no healthy
coverage; the new query is not a decoder for old log formats. Verify original
failure classification and freshness coverage on the exact active deployment
before applying the reviewed SQL and 300-second interval. Signal arrival and
healthy coverage age bound visibility; exactly-once email is not promised.

Do not close D1 incidents, raise the threshold, change reminders or disable the
monitor to hide an ingestion gap. The classifier adds two numeric fields to
existing events. Fewer native executions and a five-minute range do not prove
lower cost: qualify hosted ingestion, query latency and account billing evidence
without claiming unchanged scan volume or available headroom.

[Cloudflare's monitor contract](https://developers.cloudflare.com/notifications/monitors/#custom-sql)
states that Automatic mode supplies the execution-interval range. The inspected
editor's timestamp refusal is retained as a failed attempt, not bypassed through
an invented mode field. The
[SQL functions reference](https://developers.cloudflare.com/analytics/sql-api/sql-reference/functions/)
lists `SUM` and `if`; local SQLite tests do not qualify the actual native JSON
parser. There is no subquery, join, `CASE`, `countIf`, new dataset, resource,
credential, destination or business-operation change.

Application incidents remain idempotent and untouched by the plan. Native
notification deduplication still follows the aggregate alarm episode and its
hourly reminders. Tests use synthetic event timelines and send no notification.

## Separate technical failures from operational deadlines

The 7 November native configuration changes notification behavior without
changing runtime classification or business authority. An expired operator deadline is a
real blocked condition that can persist for days. Keeping it inside the same
hourly aggregate as application failures makes repeated reminders look like new
delivery failures and prevents that technical alarm from recovering separately.
Never extend authority, close an incident or invent healthy evidence to stop
those emails.

The existing application/delivery monitor retains its identity, threshold,
one-minute average, five-minute Automatic execution range and hourly reminder.
Its `nativeSeparatedTechnicalMonitorQuery` preserves the original ten-code/four-counter
coverage and additionally matches `FRESHNESS_CHECK_FAILED`, positive
`freshnessChecksFailed`, `tariffRefreshFailed`, `postalPolicyRefreshFailed` or
`resendPolicyRefreshFailed`. A lasting operator deadline therefore cannot mask
a new collector or source-refresh failure. Ordinary expiry/risk and deferred
refresh counters alone do not trigger this technical monitor. A second
monitor named `[Guteneo] Provider freshness and operational deadlines` uses
`nativeSeparatedFreshnessMonitorQuery`:

```sql
SELECT if(COUNT(*) = 0, 1.0,
  SUM(attributes['alertFailure'])) AS value
FROM logs.workersLogs
WHERE accountTag = '39ac9fada6cba44d9ecf09d467609e69'
  AND scriptName = 'guteneo-app'
  AND attributes['alertClass'] >= 2
```

Freshness keeps the five-minute Automatic execution range, one-minute average
and `>=1` threshold. Its reminder interval is **168 hours**, the documented
maximum, rather than hourly. This is a weekly reminder while the aggregate
remains active, not reminder suppression or exactly-once delivery. An initial
notification may occur when the new monitor first enters alarm. A further
deadline while it remains active is not guaranteed an independent email. The
existing private destination is copied exactly; the heartbeat monitor remains
untouched. No application deployment, provider activation, destination change,
paid service or business send is part of this plan.

The freshness query excludes class 1: a technical error cannot stand in for
missing freshness coverage. No qualifying records returns one; any class 3
failure in the supplied window holds the alarm. Only class 2 healthy observations
and no remaining class 3 records permit recovery. The five-minute lookback and
explicit health requirement preserve protection against the earlier empty-window
false resolutions. Technical failure recovery independently means no original or added technical
failure remains in its five-minute window. Neither recovery closes a D1 incident
or prolongs an expired authority.

Generate an explicit review-only plan using a freshly read, complete normalized
snapshot of the existing combined monitor:

```sh
node scripts/native-alerting-plan.mjs --separate /private/path/snapshot.json /private/path/separation-plan.json
```

Both paths must be absolute, outside every Git working tree, inside a mode-0700
directory; the input must be a regular mode-0600 file with no file symlink and
the output must not already exist. The existing snapshot normalization contract
below applies, including exact account/monitor identity, full observed settings,
known query, Automatic range and a readback no older than fifteen minutes.
The observed stabilized editor form is accepted only with the exact current
authenticated account/dataset scope. Unknown SQL or missing scope is refused.
The plan binds full configuration and destination digests; it emits no address.
Its second monitor ID deliberately remains unbound until actual native inventory
and saved-state readback provide one.

Apply under the operator's authorization in this order:

1. Reread the complete account monitor inventory. Reuse exactly one matching
   freshness monitor, or create one only after verifying there are zero. Stop on
   incomplete inventory, duplicate matches or unrecognized configuration.
2. Validate the separate freshness SQL in Cloudflare. Save or reuse it enabled,
   then reread its actual ID, query, Automatic range, five-minute execution,
   one-minute average, threshold, 168-hour reminder and unchanged destination.
   Preserve the combined monitor until that independent coverage is verified.
3. Reread the original combined configuration and compare its full digest with
   the reviewed snapshot. Drift or a readback older than fifteen minutes requires
   a new plan. Only after step 2 succeeds, validate and save the original technical
   query on that existing monitor, preserving all unrelated settings.
4. Reread both saved configurations and their evaluations. Confirm the technical
   alarm can resolve independently while the genuine deadline remains alarming.
   Recheck the unchanged heartbeat and destination. Actual email receipt is a
   separate observation; provoke no customer failure or send to obtain it.

The CLI has no apply action and makes no network request. Its historical
two-argument stabilization behavior is retained; separation must be explicit.
The 26 local planner regressions cover original signal retention, independent
freshness health, persistent deadlines, ingestion gaps, unexpected snapshots,
staleness, private files, immutable digests and no apply path. They qualify local
planning and synthetic timelines, not Cloudflare's saved configuration or mail
delivery. [Cloudflare's frequency contract](https://developers.cloudflare.com/notifications/monitors/#evaluation-and-notification-frequency)
defines the two intervals and the maximum repeat range.

## Reviewable native plan, no apply

`scripts/native-alerting-plan.mjs` is a local plan builder, not a guessed Cloudflare API client. An authenticated
operator first rereads the existing native monitor, then saves its complete
normalized configuration outside Git in a private directory/file. The input
normalization contract is explicit and does not claim to be a native API schema:

```json
{
  "version": 1,
  "observedAt": "2026-10-30T10:00:00.000Z",
  "accountId": "existing account ID",
  "monitorId": "existing failure monitor ID",
  "configuration": {
    "enabled": true,
    "query": "exact current native query",
    "timeRangeMode": "automatic",
    "evaluation": {
      "intervalSeconds": 60,
      "windowSeconds": 60,
      "aggregation": "average",
      "operator": ">=",
      "threshold": 1
    },
    "notifications": {
      "repeatSeconds": 3600,
      "destinations": [
        { "type": "email", "recipients": ["existing private destination"] }
      ]
    }
  }
}
```

Two known legacy dashboard query strings omit the literal account filter because
their authenticated monitor-edit route already supplies it. The plan accepts
only those exact byte-pinned strings in Automatic mode, and only when
`configuration.datasetScope` contains exactly `accountId` for the reviewed
account, `dataset: "logs.workersLogs"` and
`evidence: "authenticated_monitor_edit_route"`. The operator must establish that
scope from the current authenticated route; the tool never infers it from an
arbitrary query. Unknown variants and invented Manual-mode dashboard forms stay
refused. The raw query text has its own `previousQueryTextSha256`, distinct from
the retained canonical-value `previousQuerySha256`. Scope is bound into the full
snapshot, unchanged-settings and proposed-configuration digests. These are local
normalization fields, not a claimed Cloudflare API representation.

Retain all other observed settings as additional configuration properties. The
tool binds the full normalized snapshot and unchanged settings by SHA-256, checks
the existing account/monitor identity, requires a readback no older than fifteen
minutes, and accepts only the known original or deployed legacy extension in
Automatic mode at sixty seconds, or the exact stabilized query in Automatic
mode at 300 seconds. Missing or mismatched mode,
query drift, threshold or channel changes require review rather than a blind
patch. `timeRangeMode` is an explicit operator-normalized field, not a claimed
Cloudflare API field name. The version-two plan contains only the query/execution-interval
patch and private destination digest, never the address. Automatic range mode
and every other evaluation/notification setting remain bound as unchanged. The output is created
once with mode 0600, outside Git. Stdout is limited to plan status, change flag and digest.

```sh
node scripts/native-alerting-plan.mjs /private/path/snapshot.json /private/path/plan.json
```

There is no apply command and no network operation. A later authorized change
must reread the actual native monitor, compare the full snapshot, apply only the
reviewed SQL and 300-second execution interval, validate them in the native
editor, then reread the saved query, Automatic range, interval and every
preserved setting. If native SQL validation fails,
stop without changing the monitor or substituting a weaker query. Run the preview
for syntax/data checks; it is not proof of future ingestion or email receipt.
This plan alone establishes neither live mutation nor notification delivery.

Local regression execution evaluates the exact exported expression against an
in-memory SQLite log table after applying server marker classification and
modelling the external Automatic range. It translates the dataset name and JSON
accessor, covering every original code/counter, five-minute boundaries, longer
detection cadence, ingestion gaps, malformed observations,
explicit healthy recovery and foreign account/Worker data. This is separate from
qualification of Cloudflare's actual parser/backend and saved configuration.
