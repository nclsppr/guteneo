# Non-sending fax preparation for marketplace review

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

## Authority and validity

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

## No execution path

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

## Real reference requalification

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

## Verification boundary

Isolated database tests cover the historical migration, real calculation path,
post-pilot preparation, exact-recipient isolation, expiry/revocation, immutable
scope/authority, capped revisions, renewal and rejection of sending paths with
zero provider requests and zero financial or outbox records. Browser fixtures
check the estimate and absence of approval controls. These tests use synthetic
identities and do not qualify real fax delivery or a marketplace submission.
