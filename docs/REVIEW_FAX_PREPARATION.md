# Non-sending fax preparation for marketplace review

## Continuous reviewer preparation — 30 October 2026 candidate

An operator can install one revocable, non-expiring preparation access record for
the dedicated OpenAI reviewer. This removes the weekly tariff and thirty-day
authority revalidation from that review journey. It neither enables sending nor
extends a live provider authorization. Migration
`0066_continuous_review_preparation.sql` installs the schema only; deployment,
explicit access installation and actual host qualification remain separate.

The access record binds one organization, its exact restricted reviewer, one
archived `review_prepare_only` tariff and its original authority. The historical
recipient, provider/account/application/profile, source dates, amounts, exchange
rate and hashes remain immutable. The returned pricing notice identifies an
archived reference for review; it makes no claim about current provider pricing,
negotiated supplier rates, route availability or delivery. This is a production
preparation with a durable no-send boundary, not deterministic simulation.

`fax_review_preparation_access` has no expiry and can be revoked irreversibly.
The server accepts it only while the exact reviewer remains a `prepare_only`
identity, the current sole administrator member of its organization, the fax
channel remains disabled, no expert policy is enabled, the verified sender still
matches the authority's exact recipient and the bound tariff/authority retain
valid immutable relationships. A lost guard or revoked access closes preparation
and validation. A registered tariff never falls back to the historical bounded
path when continuous access becomes invalid.

Each new quote remains an exact-PDF, tenant-scoped immutable preparation with a
maximum lifetime of 900 seconds, seven pages and a 200-cent ceiling. Its hashed
`review_access_id` binds the precise continuous access record. The previous
quote is not extended or repriced: after expiry, an explicitly requested eligible
renewal creates a new quote from the same exact inputs. Existing historical
quotes and fingerprints remain unchanged.

## Authority, surfaces and recovery

Only a separately authorized platform operator can install this access through
the [private operator procedure](REVIEW_FAX_OPERATOR.md). No workspace role,
REST/MCP request, browser account setting or assistant mandate creates, extends
or restores it. The current reviewer may import its synthetic original and
prepare/track the exact review fax through the shared web/REST/MCP domain;
native preparation and tracking keep their normal credential boundaries.

The immutable `review_prepare_only` scope continues to block browser approval,
confirmation, expert review/acceptance, provider execution, attempts, outbox,
reservations, financial settlements and media grants in both domain code and
SQL. The account's independent `prepare_only` delivery restriction remains in
force across all channels. Revocation never grants a replacement authority.
Wrong account/tenant, membership drift, a missing scan, a changed sender or
recipient, an enabled channel/expert policy or a revoked source must be
reconciled explicitly; do not bypass them or relabel a historical source as fresh.

The account creation script does not schedule account/password expiration.
Normal authentication, session expiry, OAuth refresh, revocation and sign-in
remain separate from preparation access. Verify the actual registered OAuth
client used by the saved submission; a renewal policy configured for another
client is not evidence for this one. Keep credentials solely in private storage
and OpenAI's secure reviewer fields, never the ZIP, repository or public guide.

## Verification and activation boundary

Isolated database/domain tests exercise preparation after the archived tariff
and authority dates, quote TTL and renewal, irreversible revocation, account and
tenant drift, unchanged historical fingerprints and refusal of every sending
path without provider or financial effects. Source and local tests do not prove
production migration, installed access, an authenticated host conversation or
OpenAI review. Apply migration before the runtime that reads its views, then
review/install the exact private plan and verify its current guards separately.

Real sendable tariff maintenance is a different contract: registered commercial
references can be [refreshed automatically](FAX_TARIFF_MAINTENANCE.md). Continuous
review access does not turn an archived reference into a live sendable tariff.

The following dated description remains the history and contract of bounded
review authorities that have not opted into continuous access.

## Historical bounded review preparation — 21 September 2026

Candidate, 21 September 2026. This change is not a production activation or a
claim that a fax was delivered. Migration 0035 installs no reviewer authority,
sender, tariff, channel control or funding. The existing Luxembourg live
pilot retains its 24 September 2026 09:00:01.620 UTC deadline unchanged.

A production quote may have immutable `execution_scope=review_prepare_only`.
It uses the ordinary exact-PDF scan, provider identity, longest-prefix rate
selection, integer reference-cost calculation, frozen quote and 15-minute
maximum lifetime. It is not simulation. The response explicitly says that the
quote cannot be approved or sent and that no credit is reserved or consumed.
The legacy consultation URL displays the quote without approval controls.

### Authority and validity

A private server operator installs an immutable
`fax_review_preparation_authorities` record. It binds the exact reviewer tenant,
verified sender, provider account, Fax application, outbound voice profile and
one complete Luxembourg E.164 recipient. A priced prefix is only a calculation
input; it does not authorize any other recipient under that prefix. The number
is private and never appears in a tracked fixture or public example.

The initial requested authority is 30 days starting 21 September 2026, with exact
UTC boundaries supplied in operator configuration. SQL limits any authority to
30 days. Its dates and identity cannot be changed; revocation cannot be undone.
A later authority is a distinct explicit operator decision. No browser or OAuth
MCP operation creates or extends this authority, and it grants no expert mandate.

Each review revision remains `operator_test`, with Local Calling unconfirmed,
at most 7 pages, a ceiling at most 200 EUR centimes, a qualified source hash and
observed timestamp, and a tariff lifetime no longer than 168 hours from that
observation. Operator qualification also clips expiry to 168 hours after the
actual profile/rate-deck association observation; a fresh CSV read does not
renew that older proof. The FX date cannot be future-dated or older than 7 days relative to
observation. The tariff cannot outlive its fixed authority. Quote expiry is the
minimum of the tariff expiry and creation plus its configured lifetime, no more
than 900 seconds; the authority bound therefore also applies to every quote.
A reviewer fax channel must remain disabled and no enabled expert policy may
exist for the tenant for a review tariff to qualify.

A stale tariff is not silently renewed, and an old quote never adopts new
prices. Manual requalification installs a new immutable tariff revision; an
expired unsubmitted quote can then be renewed with the same exact inputs. A
still-valid quote retains `QUOTE_STILL_VALID`. Authority expiry or revocation
blocks preparation instead of falling back to live pricing.

### No execution path

The persisted tariff scope is checked independently of expiry or channel state.
Browser approval, direct confirmation, expert review/acceptance, domain queue
processing and the final provider bridge reject it with
`FAX_REVIEW_PREPARATION_ONLY`. The provider bridge checks before document media
grants, attempt claims or provider requests.

Dedicated SQL guards also reject approval insertion/update, any transition to
queued or submitting, attempts, outbox entries, reservations, expert review
records, usage settlements and media grants. A review quote can only attach to
a prepared dispatch with no prior approval, attempt, outbox or reservation. The
scope and its authority binding cannot be changed to live. Historical tariff
fields and quote hashes are preserved by the forward migration.

### Real reference requalification

See [the operator procedure](REVIEW_FAX_OPERATOR.md). There is no automatic
refresh or cron. A reviewer may encounter a closed preparation gate after a
reference expires until the operator performs the next weekly requalification.
Thirty days of authority does not mean thirty days of fresh pricing.

The sources are the authenticated Telnyx application/number/profile inspection,
the actual profile-linked CSV, the official published fax page fee and dated
ECB FX. On 21 September the CSV was reread successfully with the existing hash
`ec4e3baeb5e26ba40024d99ffac022e95b22573cdbe6af008fb1c6193e0949c7`;
the ECB daily XML contained the 18 September rate, 1 EUR = 1.1460 USD. These are dated
observations, not permanent constants or negotiated account prices.

The [Telnyx fax pricing page](https://telnyx.com/pricing/fax) publishes a page
charge plus SIP transmission usage. Its advertised public pricing API returned
HTTP 404 during this qualification; the manual workflow therefore uses actual
HTTP source documents and operator review. A source content hash is an integrity
reference, not a provider signature. Missing CSV per-call fees are not proof of
zero actual supplier fees; the documented commercial reference basis excludes
unqualified conditional charges and never authorizes transmission.

### Verification boundary

Isolated database tests cover the historical migration, real calculation path,
post-pilot preparation, exact-recipient isolation, expiry/revocation, immutable
scope/authority, capped revisions, renewal and rejection of sending paths with
zero provider requests and zero financial or outbox records. Browser fixtures
check the estimate and absence of approval controls. These tests use synthetic
identities and do not qualify real fax delivery or a marketplace submission.
