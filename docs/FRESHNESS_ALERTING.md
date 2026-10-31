# Operational freshness alerts

This candidate detects deadlines that current production mechanisms actually
consume. It changes no customer price, source evidence, provider configuration,
human authority, mandate, quote or dispatch. Migration 0068 installs empty
operational tables; source code and local fixtures establish no production
activation or notification receipt.

## Selection, dates and meaning

The collector owns proof of current use. A candidate must belong to a production
tenant, selected provider/account/route, verified sender and enabled mechanism.
Disabled channels, revoked policies, historical generations, informational dates
and continuous-review archived references do not become candidates. Failed reads
or unexplained guard loss cannot prove that a previously used binding is inactive.

| Consumed field                                        | Actual consumer                                            | Detection and renewal boundary                                                                                                                                                                                                                 |
| ----------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trusted_delivery_costs.expires_at`                   | `resolveDeliveryPrice` and `valid_live_delivery_quotes`    | Current qualified policy only; exact sender, provider, account, route and options. Pingen uses the latest generation's policy IDs and current sender declaration/profile, grouped rather than alerting separately for each printing option.    |
| `trusted_fax_usage_tariffs.expires_at`                | `resolveFaxUsageTariff` and quote validation               | Current exact live route only. Exclude `review_prepare_only`, including its archived source dates. Genuine source refresh can replace a technical pricing revision; it cannot extend the pilot authority.                                      |
| `fax_tariff_refresh_sources.authorization_expires_at` | Scheduled source selection and the new tariff's expiry cap | Current active, consumed registration only. This is an operator authority, never a renewable observation. When the effective tariff deadline is this cap, identify the authority cause rather than duplicate it as a technical source failure. |
| Effective automatic Resend qualification | `ensureEmailSender` automatic pricing | After a genuine successful refresh use `resend_policy_refresh_state.qualified_until`; before that retain the strict `RESEND_TARIFF_QUALIFIED_UNTIL` contract. An installed automatic policy retains its own immutable consumed deadline when its producer is disabled. An exact manual replacement suppresses the unused automatic setting. |
| `resend_send_limit_policies.expires_at_ms` | Atomic Resend provider admission | Monitor only while the acceptance mechanism is selected. Final-send suspension can stop this consumer while email preparation still consumes its price policy. Neither counters nor reserved/unknown holds are reset. |
| Current tariff/FX evidence                            | Parent pricing revision                                    | `tariffDate` and `fx_date` alone have no independent age limit in these gates. Never invent `date + N days`; use the deadline actually consumed by the mechanism.                                                                              |

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

The monitor query must preserve all previous failure conditions and add only
`FRESHNESS_AT_RISK` and `FRESHNESS_CHECK_FAILED` to its existing parenthesized OR
group. Keep the account/script restrictions, automatic one-minute evaluation
window, average `>=1`, existing email destination and hourly repeat. Do not add a
timestamp predicate in the platform's automatic-window mode. The separate
missing-heartbeat monitor is unchanged.

Application incidents are idempotent. Native notification deduplication is an
aggregate active-alarm episode with the configured hourly reminders; it is not
an exactly-once email per deadline. A sustained unresolved condition emits a
coarse signal on each normal collector pass. Once no risk or failed check remains,
the next successful window has no matching signal and the condition clears.
Existing log collection, sampling, provider delivery and scheduler availability
still limit notification coverage. No alert test sends a real notification.

## Reviewable native plan, no apply

There was no existing native-alerting script. `scripts/native-alerting-plan.mjs`
is a local plan builder, not a guessed Cloudflare API client. An authenticated
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

Retain all other observed settings as additional configuration properties. The
tool binds the full normalized snapshot and unchanged settings by SHA-256, checks
the existing account/monitor identity, requires a readback no older than fifteen
minutes, and accepts only the known original or already-extended query. Any other
query drift, threshold or channel change requires review rather than a blind
patch. The plan contains a query-only patch and private destination digest, never
the address. The output is created once with mode 0600, outside Git. Stdout is
limited to plan status, change flag and digest.

```sh
node scripts/native-alerting-plan.mjs /private/path/snapshot.json /private/path/plan.json
```

There is no apply command and no network operation. A later authorized change
must reread the actual native monitor, compare the full snapshot, apply only the
reviewed query change and reread unchanged settings. This plan alone establishes
neither that live mutation nor notification delivery.
