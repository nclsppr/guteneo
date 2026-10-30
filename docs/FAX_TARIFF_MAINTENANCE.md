# Automatic fax tariff maintenance

## Contract — 30 October 2026 candidate

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

## Current supported scope

This candidate supports only the existing local Luxembourg fixed `+3524`
operator-test route with canonical options `{}`, at most seven pages and a
200-cent ceiling. Its independently authorized pilot deadline remains
3 November 2026; daily source refresh does not extend that deadline. Other
prefixes, destinations, option combinations or normal provider-verified routes
are not implemented by this maintenance path and must not be registered as if
covered. Continuous archived reviewer preparation remains separate.

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

1. Review and apply the additive schema before the runtime that reads it.
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
