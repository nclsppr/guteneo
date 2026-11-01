# France/Germany fax reference maintenance

## Scope and qualification — 1 November 2026

The 1.1.25 runtime supports maintenance of one explicitly registered group of fourteen
existing France/Germany fixed-line fax bindings. It does not discover or grant
new sendable routes. Each anchor must already be a qualified live
`provider_verified` tariff with the same production tenant, verified Luxembourg
sender, Telnyx account, application, outbound profile, exact destination prefix
and canonical options. The group also binds the four existing more-specific
exclusions. Their `route_allowed=0` status and resolver priority stay unchanged.

This is separate from the Luxembourg local `+3524` operator-test pilot and its
independent authority deadline. The existing LU parser, registration and limits
are not widened. Unregistered manual tariffs remain operator-maintained, and
review-only archives remain permanently outside live renewal. The selected
commercial basis is a public reference, not a guaranteed negotiated supplier
price or an actual transmission/cost qualification.

Production 1.1.25 was published from clean `9503e6b0a5466f6c924f608eef50e3266383a80e`
at 100% traffic. Migration 0071 is applied: the 470 previous schema objects remain
unchanged, its 17 additions match the reviewed schema, 133 application tables
pass their checks and global foreign-key violations are zero. Main CI passed
24/24, public source-bound E2E passed 28/28 and 346 served assets passed exact
byte/hash/header verification. These checks do not establish production
registration, scheduled FR/DE renewal or delivery.

The first registration application stopped before writes with
`VERIFIED_FAX_REGISTRATION_CATALOG_INVALID`: its comparison used the timestamp
captured before the current provider reads. The 1.1.26 corrective candidate checks
the freshly observed catalog against the clock after those reads and retains
plan-expiry and final SQL-clock guards. No source date or permitted lifetime is
advanced to work around that error.

## Exact evidence and prefix rules

A scheduled attempt resolves the current Global Conversational catalog with the
existing fixed authenticated discovery GET. It reads the selected allowlisted
CSV once for the entire group, together with the official fax-page fee and a
current dated ECB conversion. It verifies current provider ownership and enabled
FR/DE destination permissions for the registered account/application/profile and
sender. A missing or changed association is not repaired by choosing another
account, sender, catalog, route or historical CSV.

The parser matches the Luxembourg origin as an exact token in the CSV's origin
prefix list and validates the applicable EEA meaning. A substring containing
`352` is not sufficient. For each registered destination it checks the complete
rate deck, applicable parent rows and every more-specific row. The longest-prefix
resolver and all four exclusions must still cover the resulting route map.
Duplicate/conflicting prices, unsupported categories or a newly uncovered
sub-prefix refuse the group; a cheap country-level row cannot hide an exception.
The tool cannot widen an existing prefix to `+33` or `+49`.

The supported price components retain their qualified page/minute/call meaning,
60/60-second billing, currency and canonical options. Empty source fields are not
new evidence of a free fee or a different exact-match policy. A changed or
ambiguous component fails inspection. Monetary parsing uses bounded integer
nanoUSD and the dated rational FX representation, preserving the existing
customer-cap calculation. Original source publication dates remain original;
new observation and verification times are recorded separately.

Complete valid evidence can qualify a new immutable revision for at most seven
days. The daily refresh target gives repeated opportunities before that bound;
it does not promise a particular provider or scheduler response time. A failed
GET or an unchanged old URL alone grants no lifetime extension. Every successful
attempt records the selected discovery/source byte counts and digests, matched
parent rates, pricing, FX and observation dates. Runtime evidence does not store
the full CSV; the preparatory CLI source copies remain private outside Git.

## State, replacement and concurrency

Migration 0071 adds only private operational tables:

| Table                             | Purpose                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| `verified_fax_reference_sets`     | Immutable group anchors and exclusions, exact provider binding and registration state |
| `verified_fax_reference_state`    | Bounded lease, due time, backoff and closed result of the group attempt               |
| `verified_fax_reference_tariffs`  | Exact group membership/provenance of installed tariff revisions                       |
| `verified_fax_reference_evidence` | Append-only source and predecessor evidence for a completed renewal                   |

The existing scheduler calls
`apps/api/src/verified-fax-reference-refresh.ts:refreshVerifiedFaxReferences`.
The scheduler gives the FR/DE path the first opportunity for due network work.
If it starts that work, the separate LU refresher waits for a later tick; if no
FR/DE network work is due, LU may run. This budgets one network group per
scheduler invocation, not one globally across overlapping Worker isolates.
Per-set leases still fence concurrent attempts. No new Worker, polling loop,
public endpoint, product permission, provider write or paid resource is introduced. Missing maintenance schema emits a failed control
without preventing unrelated safe outbox processing.

Replacement is atomic for the fourteen references: either all expected current
predecessors are retired and all fourteen new revisions are inserted, or none is
changed. The final transaction rechecks the complete registered set, current
provider/sender/channel binding, exact prior rows, exclusion fingerprints and
lease. A concurrent replacement or changed binding refuses the stale result.
A live quote or queued, submitting or uncertain dispatch defers the entire group
rather than invalidating the approved price it uses. Historical rows, quote
fingerprints and evidence are retained.

The new revisions preserve each anchor's route permission, origin/category,
page limit, duration model, quote TTL, options and authority classification.
The four forbidden-route records are not rewritten. The operation changes no
recipient, document, approval, reservation, credit, hold, outbox or provider
submission, and never retries an uncertain communication. A later prepared fax
still needs its ordinary exact-content quote and approval under current gates.

A durable mapping ties revisions to the registered group. Freshness follows the
actually consumed current revision; a genuine inspected replacement can resolve
its predecessor's warning. Missing inventory pages, unavailable credentials and
failed reads never imply recovery. Other manual references and independent
operator authority retain their own warning semantics.

## Operator workflow and surfaces

Only a separately authorized platform operator may register the exact existing
set through the private utility
`scripts/register-verified-fax-reference-refresh.mjs`. Ordinary workspace roles,
browser/REST/MCP/native callers and assistants receive no new configuration
capability. Registration grants only bounded technical maintenance; it creates
no route, channel, consent, expert mandate or sending approval.

Use a private configuration and reviewed plan outside every Git checkout, with
regular owner-private files inside a private directory. The plan must bind all
fourteen anchors and four exclusions, their current identities/fingerprints and
the existing public-reference basis. Plan inspection and digest-bound application
remain distinct. Application must recheck the exact predecessor state; it cannot
reactivate a revoked set or silently add a new destination. Credentials, sender
numbers and private plan contents never enter Git, stdout, a plugin archive or a
public engineering page.

The configuration has only these fields:

| Field                | Contract                                                          |
| -------------------- | ----------------------------------------------------------------- |
| `version`            | `1`                                                               |
| `sourceId`           | New immutable technical-set identifier                            |
| `organizationId`     | Exact existing production tenant                                  |
| `initialTariffIds`   | Exactly fourteen distinct current provider-verified route anchors |
| `exclusionTariffIds` | Exactly four distinct existing forbidden-route records            |
| `commercialBasis`    | `public_reference_not_negotiated`                                 |

The registered binding also preserves a private hash of the exact sender
address. A later sender/address, provider account/application/profile, exclusion
or route change is a binding failure, not permission to move the registration.

```sh
node scripts/register-verified-fax-reference-refresh.mjs --config /private/config.json --output /private/plan.json
node scripts/register-verified-fax-reference-refresh.mjs --apply /private/plan.json --reviewed-plan-sha256 REVIEWED_SHA256
```

The first command performs bounded read-only source/provider qualification and
prepares a plan valid for fifteen minutes. It keeps the inspected public source
bytes beside the plan in a private `.sources` directory; preserve those files
for digest/byte verification during application. No secret is exported there.
The second command applies only the exact reviewed registration after current
state, source-byte and current ownership revalidation. Registration itself
installs no replacement price: the first scheduled attempt must obtain genuine
sources before creating fourteen new revisions. A plan digest is not a human
sending approval or a grant of new provider access.

Catalog freshness is evaluated after the revalidation reads complete. A catalog
observed during those reads may be later than the command start, but must not be
later than that new clock observation or outside its fifteen-minute freshness
window. An expired plan still fails before any registration write.

Before registration, verify compatible deployed runtime and the additive empty
schema. The exact migration/code ordering follows their compatibility review;
this change adds no quote field or quote-hash migration. Then privately review
and apply the exact registration, observe a genuine scheduled renewal and verify
all fourteen replacements, unchanged exclusions and independent Cron completion.
No manually advanced expiry or artificial provider success may stand in for that
observation. A later genuine failure preserves history, reports its closed cause
and leaves expired preparation unavailable.

## Validation and operational recovery

Validation must cover exact EEA token parsing, all applicable parent/sub-prefix
rows, exclusions, duplicates, rates/fees/intervals, source failures and FX bounds.
Isolated D1 evidence must cover fourteen-or-zero replacement, unchanged historical
quotes and exclusions, quote/dispatch deferral, stale leases, changed bindings,
concurrent attempts, revoked registrations and missing-schema compatibility.
The dedicated suites are `tests/unit/fax-eea-reference.test.ts`,
`tests/unit/verified-fax-reference-registration.test.ts`,
`tests/integration/verified-fax-reference-refresh.test.ts` and
`tests/integration/provider-freshness-collector.test.ts`. Listed coverage and
source implementation are not claims that these suites passed or that the
hosted path was qualified; record executed results against the final source.

After authorized publication, independently inspect registration, actual selected
sources, the scheduled result, new immutable evidence, unchanged caps/permissions
and the resulting freshness observations. Keep provider inspection, renewal,
native notification receipt and real fax delivery separate. The
[provider freshness contract](PROVIDER_FRESHNESS.md) owns incident semantics; the
[LU maintenance contract](FAX_TARIFF_MAINTENANCE.md) owns the separate pilot.
