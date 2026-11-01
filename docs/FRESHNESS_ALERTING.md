# Operational freshness alerts

This mechanism detects deadlines that selected production operations actually
consume. It changes no customer price, source evidence, provider configuration,
human authority, mandate, quote or dispatch. API release 1.1.22 and additive
migrations 0068–0070 were deployed on 31 October. The legacy native extension was
saved and triggered/resolved email receipt was observed; those episodes did not
prove durable incident recovery. PR #131 merged the 1.1.23 compatibility changes; source
`afedd099081099fa83bf6bd9edaf6dcabacbea03` was published on 1 November. Read-only
post-deployment checks observed the new active postal binding and four additional
inactive forbidden-route bindings, with no pending or unknown business send. The 1.1.24 marker and SQL stabilization below is a
separate local candidate, not an applied monitor change or a new delivery
qualification. Native editor attempts on 1 November rejected JSON expressions
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

## Notification channel and honest deduplication

The previously authorized native Cloudflare failure monitor is the intended
channel. Its existing destination stays private and unchanged. This path needs
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

The 1 November 1.1.24 candidate derives two numeric fields on the server after
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
The fallback candidate therefore retains **Automatic** mode and changes the
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
the final saved monitor or notification behavior. Those remain unqualified.

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
