# Automatic fax tariff maintenance

## Worldwide mode — 28 November 2026 candidate

With worldwide mode enabled, new faxes from the verified production sender configured for the gateway can
use any supported international E.164 number. Guteneo freezes the applicable
Telnyx public catalog reference for the bound account, application, profile and
sender at preparation. The quote uses the destination-specific page, minute and
call rates, billed duration increments, and dated FX. An unseen or ambiguous
number receives Guteneo’s EUR 0.25 per page estimate excluding tax. If the cron
fails, the installed catalog remains usable. An existing matching tariff can
supply an archived reference before the first catalog is available or during a catalog read failure. A previously quoted worldwide rate can be recovered for its exact recipient.

An ordinary worldwide quote lasts up to fifteen minutes. It binds the document,
recipient, options, estimate, source and firm customer ceiling. Confirmation
reserves that ceiling. Verified usage settles within the ceiling, with excess
supplier cost borne by Guteneo. Worldwide customer estimates and ceilings have the existing EUR 10,000 per-dispatch maximum. The ledger records the verified supplier expense separately, including larger amounts. Document admission limits and the connector’s 350-page maximum apply.
The dedicated restricted reviewer continues to use its separate preparation-only
workflow. Previous pilot quotes retain their original approval and limits.

Migration 0083 installs the shared commercial catalog. Migration 0084 adds
worldwide terms to the tenant-scoped immutable fax ledger. Apply both before
enabling worldwide mode in the runtime. Provider acceptance depends on the
actual account, number and receiving equipment.

### Initialize the first catalogue after a release

The 02:17 UTC trigger populates the catalogue automatically. If a release misses that run, a Cloudflare operator authorized to initialize pricing may populate the first revision for the deployed provider account, application, profile and sender. Use the clean checkout of the exact published application after its schema and 100% rollout have been verified. The local helper binds privately to `WorldwideFaxCatalogOperator` in the existing application Worker. Keep that capability exclusive to the operator. The helper config has no public route, preview URL, D1 binding or provider secret.

```sh
node scripts/worldwide-fax-catalog-operator.mjs --status
node scripts/worldwide-fax-catalog-operator.mjs --initialize-production WORKER_VERSION_UUID
node scripts/worldwide-fax-catalog-operator.mjs --status
```

For the second command, use the Cloudflare version UUID verified by the release operator and returned by the first command. The CLI checks the clean local commit against the published release manifest. Both RPC methods take zero arguments. The Worker derives the scope from its installed configuration, reads the real supplier and ECB sources and uses the daily importer's bounded lease, completeness checks and atomic activation. The initialization claim also requires an empty active pointer, even when a scheduled refresh is due. An active catalogue returns immediately.

Read `active`, `observedAt`, `sourceRows`, `destinationGroups` and `buckets` together. The two named lookups report whether the pricing resolver found an unambiguous reference for a fixed North American and British example. They do not contact either number. A lookup can lack a match for one example while the catalogue is active. Status has no writes or supplier requests.

If a connection closes before a result arrives or the reported Worker version changes, read status again before any further action. `deferred` indicates the due date or a competing lease; `source_unavailable` retains the existing backoff. Inspect `nextDueAt` and `leaseUntil` before retrying. The next regular trigger can recover. Customer price fallback and every original approval remain available during recovery. Full qualification includes a live complete revision, matching deployed version and observed lookup results. Local fixtures establish the concurrency and existing-revision guards.

On 28 November 2026 a read-only inspection of the installed Telnyx account discovered the official deck. It contained 263,351 rows, 34,715,134 bytes and 224 destination groups, compiling to 2,157 buckets for the provider-owned fax number. The public page fee and the ECB reference dated 27 November parsed successfully. The earlier Worker reported an invalid `whitelisted_destinations` field on its profile read. This source observation did not initialize D1 or qualify the updated Worker’s profile or live delivery.

## Historical scoped contract — 30 October 2026 candidate

An explicitly registered fax route can refresh its dated commercial reference
without a recurring manual revalidation task. The existing scheduler runs a
bounded refresh stage independently of interactive identity availability.
Migration `0067_automatic_fax_tariffs.sql` creates the registration and scheduling
state; it registers no route, installs no price and activates no sending.
Production migration, registration, successful scheduled execution and actual
provider delivery require separate observations.

A registration binds the exact organization, verified sender, provider account,
Fax application, outbound profile, destination prefix and canonical options to a
selected `global_conversational` public commercial catalog. A separately authorized platform operator
reviews this binding once through `scripts/register-fax-tariff-refresh.mjs`.
Workspace roles, assistants, ordinary REST/MCP calls and a successful public GET
cannot create or broaden that registration. Sender ownership, route permission,
channel activation, available credit, immutable approval, actual sending and
expert mandates remain independent gates.

## Luxembourg pilot scope

This candidate supports only the existing local Luxembourg fixed `+3524`
operator-test route with canonical options `{}`. Refresh preserves the existing
live tariff's exact page limit, up to ten pages, and its 200-cent ceiling; it
cannot increase or decrease that limit. Its independently authorized pilot deadline remains
3 November 2026; daily source refresh does not extend that deadline. Other
prefixes, destinations, option combinations or normal provider-verified routes
are not implemented by this LU maintenance path and must not be registered as if
covered. The separate 1.1.25 [FR/DE reference-group candidate](FAX_EEA_REFERENCE_MAINTENANCE.md)
maintains fourteen existing provider-verified scopes under its own registration,
parser and evidence contract; it does not widen this pilot. Continuous archived reviewer preparation remains separate and retains
its seven-page maximum.

The registration utility requires an absolute regular `0600` configuration and
plan inside a `0700` private directory outside every Git working tree. Inspect
the default read-only plan, exact source/route and digest before an explicitly
authorized apply. Do not put its private binding or evidence in a repository,
public issue, plugin ZIP or public engineering page.

## Evidence and price meaning

Every successful refresh first resolves the current catalog with an authenticated
GET to `https://api.telnyx.com/v2/tariffs`, selecting only
`data.global_conversational.tariff_link`. It then makes genuine bounded reads of
the official fax page fee, that allowlisted public rate-deck CSV and dated ECB
exchange-rate source, and inspects the exact provider account/application/profile/owned sender. It
parses the original source bytes, retains their actual dates and digests, uses
the maintained longest-prefix route rules and integer monetary calculation,
and creates a new immutable tariff revision whose lifetime is at most 168 hours.
It never extends an old row merely by changing its observation timestamp.

The registration explicitly selects a **public commercial reference**. A public
CSV and a successful ownership inspection do not prove a current negotiated
supplier rate or a currently observed provider UI association between that CSV
and the profile. Historical association evidence retains its original date.
Conditional supplier adjustments, uncertain capabilities and actual invoice
costs remain distinct from the reference basis. Ambiguous rows, changed formats,
unqualified fees, missing or future-dated FX, unexpected identity or unavailable
sources refuse publication of a replacement.

The registered CSV URL is an initial reviewed anchor, not a permanent "latest"
alias. Telnyx publishes exports with versioned names: fetching the same old URL
again does not establish current pricing. Each refresh must obtain the current
link from the selected catalog and can follow a new export within the same
allowlisted catalog family. Missing/unauthorized discovery, an invalid link or a
foreign host closes the refresh without falling back to the initial export.
Immutable evidence binds the discovery response and actual CSV URL as well as
the fetched source bytes. The API credential is sent only to the fixed Telnyx API
host, never to the CSV download, public pricing page or ECB.

This discovery route was observed on 30 October 2026 in the
[official portal client](https://portal.telnyx.com/version-3521/assets/index-C4VoV0Cl.js).
An anonymous request returned 401; no public stable API contract was found. The
standard server API key's acceptance and actual selected response remain a
mandatory hosted qualification before registration/activation. A changed or
withdrawn vendor endpoint must fail closed and requires integration maintenance;
it must not be replaced with a guessed or archived "current" rate.

Automatic freshness does not extend an operator-test route's independently
bounded authorization, pilot deadline, page limit or monetary ceiling. It grants
no new destination. The old immutable source, quote and authority records remain
available for audit; a new revision cannot alter an already approved cost.
Continuous reviewer access uses its separately labelled archived reference and
[permanent no-send boundary](REVIEW_FAX_PREPARATION.md), not this live-price
refresh mechanism.

## Scheduling and atomic replacement

The daily refresh target is separate from each tariff's maximum lifetime. One
route is considered per scheduled execution, using a bounded lease and retry
backoff. No new polling loop, worker, paid resource or provider mutation is
introduced. A still-active quote defers replacement rather than revoking the
price that its approval binds. The exact previous tariff and registration are
rechecked before one atomic replacement inserts the new immutable revision and
retires only the expected prior row.

A changed registration, ownership failure, source error, lost lease or concurrent
replacement aborts the write. The previous reference remains unchanged; it may
continue serving only while its own existing validity and all live gates hold.
Once it expires, new sendable preparation fails closed. A later scheduled attempt
rereads sources and guards; it never replays an uncertain provider communication
or fabricates a successful refresh. Revoked registrations do not reactivate
through a timer.

Scheduler results expose only coarse refreshed, failed and deferred counts.
Logs and public status must not contain recipients, content, account identifiers,
credentials, raw source bodies or signed URLs. Private evidence and the operator
configuration stay outside the repository and downloadable plugins.

## Installation and verification

The operator utility accepts this strict configuration; identifiers and private
plans must never enter Git or a public package.

| Field                    | Required value                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| `version`                | `1`                                                                                        |
| `sourceId`               | New immutable registration identifier                                                      |
| `organizationId`         | Exact production organization from the reviewed binding                                    |
| `initialTariffId`        | Exact qualified live tariff for the supported route                                        |
| `tariffCatalog`          | `global_conversational`                                                                    |
| `rateDeckUrl`            | Initial reviewed official CSV anchor; current link resolved independently on every refresh |
| `authorizationExpiresAt` | Future millisecond UTC timestamp within the existing pilot deadline                        |
| `authorizationReference` | Explicit operator authorization for this exact source binding                              |
| `commercialBasis`        | `public_reference_not_negotiated`                                                          |

Use absolute config/plan paths outside every Git checkout, with a private `0700`
parent and regular `0600` files. File symlinks are refused. Planning performs
database reads only; it does not fetch, qualify or install a provider price.

```sh
node scripts/register-fax-tariff-refresh.mjs --config /private/config.json --output /private/plan.json
node scripts/register-fax-tariff-refresh.mjs --apply /private/plan.json --reviewed-plan-sha256 REVIEWED_SHA256
```

The first command prints the plan digest. Inspect the private exact binding and
obtain the necessary production authority before applying that reviewed digest.
Application rechecks the complete current binding atomically. Repeating the same
successful plan is idempotent; a revoked or changed source is never reactivated.

1. Follow the [compatible runtime-first rollout](REVIEW_FAX_OPERATOR.md#safe-runtime-and-schema-rollout),
   drain prior in-flight work, then apply both additive migrations before registration.
2. Qualify the fixed catalog endpoint with the actual server key, current selected
   link, bounded CSV and provider ownership without installing a price or sending.
   After the authorized runtime release, run
   `node scripts/provider-readiness.mjs telnyx-fax-tariffs` through the existing
   authenticated same-account service binding. It performs a bounded catalog GET
   with the server-held key and exposes no key, database write or public endpoint.
   Use the registration utility's read-only plan mode, inspect its exact route,
   source basis and fingerprint, and apply only under explicit operator authority.
3. Verify the saved registration and original tariff without changing any quote,
   approval, channel, balance or mandate.
4. Observe an actual scheduled refresh, confirm genuinely reread source dates,
   the newly inserted revision, lease/backoff results and preserved historical
   quotes. Check the expected no-write outcomes for drift and active quotes.
5. Continue monitoring scheduled failure/defer results and source compatibility.
   An alert does not grant authority to guess a price or reopen a closed gate.

The source implementation is `apps/api/src/fax-tariff-refresh.ts`, invoked by the
existing scheduled handler. Isolated source/parser and D1 integration tests cover
automatic replacement, deferral, concurrent guards and source failures. These
fixtures prove neither a production registration nor a current provider read.
Record exact-source checks, deployed release, authorized registration and hosted
scheduled outcomes separately, following [the release procedure](MAIN_RELEASE.md).
