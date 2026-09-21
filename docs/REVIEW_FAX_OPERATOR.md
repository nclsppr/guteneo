# Private fax reference qualification for OpenAI review

This operator utility installs **preparation only** for the dedicated reviewer
tenant, its verified sender and the exact already-owned Luxembourg test number.
It never enables a channel, an expert mandate, an approval, a reservation or a
provider submission. The separate live pilot still ends on 24 September 2026.
Neither this procedure nor the presence of a real provider account qualifies
Local Calling or successful fax delivery.

The candidate requires migration `0035_review_fax_preparation.sql`. Do not deploy
the temporary local Wrangler configuration or publish its private evidence.
The CLI uses the existing authenticated Cloudflare remote bindings; it does not
read or export the Telnyx API key. Provider inspection invokes only the existing
read-only `ProviderInspection.inspectTelnyx` operation.

Apply migration 0035 **before deploying the application code**: the new runtime
reads its persisted-scope view during confirmation and processing, including
other channels. Bookmark D1 Time Travel first, then verify the migration list,
schema, foreign keys, integrity and preserved historical quotes. Only then
deploy the application and prepare/review the private operator plan. Applying
the reviewed plan is a separate authorized step. The migration alone grants no
authority or tariff; deploying the application first would cause missing-view
errors while the old schema remains active.

## Independent validity periods

- The operator's immutable authority is at most 30 days from its explicit start.
  For example, 21 September at 12:00 UTC to 21 October at 12:00 UTC is 30 days.
  A reference refresh cannot extend it. Creating another authority requires a
  separate operator decision; there is no automatic renewal or cron.
- Each tariff revision lasts at most 168 hours from the actual source read, and
  never beyond the authority or 168 hours after the actual profile/rate-deck
  association observation. An association already 167 hours old leaves at most
  one hour for a new revision; rereading the CSV does not refresh that association.
  The dated ECB reference must be no older than
  seven calendar days at the read. Future dates are rejected.
- Each prepared quote lasts at most 15 minutes, bounded by its enclosing tariff
  and authority. The ceiling is EUR2 and the maximum is seven pages. If the
  seven-page estimate exceeds that ceiling, qualification fails.

## Evidence and commercial meaning

The default command makes bounded HTTPS GETs to the official Telnyx fax price
page, the exact CSV previously observed in the account/profile's **View rates**
action, and the ECB daily XML. It refuses redirects and arbitrary origins. The
maximum bodies are 2 MB, 40 MiB and 128 KB respectively. Raw responses and their
SHA-256 digests are retained in a private directory, with actual observation time.
HTTP `Last-Modified` is recorded separately and is not treated as observation time.

The operator configuration must cite the private evidence linking that CSV to
the exact outbound profile. The provider API inspection independently rechecks
the account, active Fax application, outbound profile and exact active owned
number with T.38 enabled. A public CSV URL alone is not account association proof.
The single known `daily_spend_limit` response diagnostic may remain unknown if
all those ownership fields are present and exact. Every other partial/error
inspection is rejected. This exception qualifies neither a spending limit nor
permission to send.

The parser selects the longest matching Luxembourg **Local** prefix and accepts
one unambiguous row with 60/60-second intervals. The fax page component comes from
the current visible price row, excluding scripts and comments. USD-to-EUR uses
the reciprocal of the published USD-per-EUR rate, as reduced integers; no binary
floating-point money calculation is introduced.

This is a reference estimate excluding conditional supplier adjustments and tax.
The accepted empty CSV call-fee cell means **no additional component in this
reference calculation**, not proof that the supplier charges no fees. Telnyx
lists page pricing plus SIP transmission, while carrier adjustments and tax may
vary. Short-duration charges can depend on monthly traffic. The 30-second base
and 30–180 seconds per page are planning assumptions, not measurements or a hard
duration bound. These assumptions remain in the private plan and the public review notice states their limits. An unexpected
nonempty fee or exact-match field fails qualification for operator review.

Official sources: [fax price](https://telnyx.com/pricing/fax),
[billing increments](https://support.telnyx.com/en/articles/1130659-billing-increments),
[short-duration charges](https://support.telnyx.com/en/articles/1130707-what-are-short-duration-calls),
[ECB daily rates](https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml).
No unavailable pricing API is replaced with invented prices or a relabelled
historical observation.

## Operator input and plan

Use a directory outside **every Git working tree**, with mode `0700`. The input
must be a regular file with no group/other permissions (`0600`). Never paste its
phone number, account identifiers or raw evidence into a public issue or PR.

The strict JSON input has these fields. Supply real inspected values; the
descriptions below are a field guide, not an executable production fixture.

| Field                                                               | Value and evidence                                                                   |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `version`                                                           | `1`                                                                                  |
| `organizationId`, `senderId`, `reviewerUserId`                      | Exact dedicated reviewer membership and verified production fax sender               |
| `reviewerEmail`                                                     | Exact email of the explicitly provisioned reviewer, stored only in private input     |
| `recipientPhone`                                                    | Exact authorized owned test number, E.164; the sender's stored number must match     |
| `accountId`                                                         | Existing `telnyx-key-sha256:…` account namespace returned by private inspection      |
| `connectionId`, `outboundProfileId`                                 | Exact numeric provider application and profile IDs                                   |
| `authority.id`                                                      | Unique immutable operator-authority ID; reuse it for reference refreshes             |
| `authority.validFrom`, `authority.expiresAt`                        | Explicit UTC ISO timestamps with milliseconds, at most 30 days apart                 |
| `authority.reference`, `authority.sourceSha256`                     | Reference and digest of the actual private authorization record                      |
| `rateDeckAssociation.url`                                           | Exact observed `https://portal.telnyx.com/downloads/global_conversational/….csv` URL |
| `rateDeckAssociation.profileId`                                     | Same outbound profile ID                                                             |
| `rateDeckAssociation.observedAt`                                    | Actual account/profile inspection timestamp                                          |
| `rateDeckAssociation.reference`, `rateDeckAssociation.sourceSha256` | Private account/profile-to-CSV evidence reference and digest                         |
| `commercialBasis`                                                   | `reference_estimate_excluding_conditional_fees`                                      |
| `callFeeBasis`                                                      | `no_additional_reference_component_blank_is_not_zero_supplier_cost`                  |

If the reviewer already has the earlier live-scope operator-test tariff, first
produce a read-only reconciliation report. This mode also works before migration
0035, normalizing its three added columns to their migration defaults:

```sh
node scripts/qualify-review-fax.mjs --inspect-legacy \
  --config /absolute/private-directory/review-fax-input.json \
  --output /absolute/private-directory/review-fax-legacy.json
```

It accepts only one legacy LU Local `operator_test` tariff for this exact
tenant/sender/account/application/profile and recipient prefix, bounded by the
original 24 September deadline. It records the entire row privately, without
changing it. To authorize narrowing this exact row, add `transitionFromLive`
with its exact `id` and `rowSha256` from that report to the private configuration.
The digest includes every field, normalized to the original `qualified` status;
only its later revocation is permitted. A different ID, changed field, additional
live tariff, wrong account or unexplained state fails. Retain this exact binding
for subsequent reference refreshes; it cannot authorize another legacy row.

Create a fresh filename for each plan. Existing plans and raw evidence cannot be
overwritten by the command:

```sh
node scripts/qualify-review-fax.mjs \
  --config /absolute/private-directory/review-fax-input.json \
  --output /absolute/private-directory/review-fax-plan.json
```

This is the default **read-only remote mode**. It writes only local private
evidence. It verifies the dedicated tenant has exactly one member, the expected
reviewer is its administrator, fax is disabled, no expert policy is enabled, and
no execution attempt, approval, outbox entry or reservation exists. A live-scope
tariff is forbidden unless it is the one explicitly reviewed legacy transition.
An unexpected state
requires reconciliation; the script never clears it or changes the account to
make qualification pass.

The stdout summary contains the plan digest, expiries and fixed limits. The
private JSON includes the exact proposed immutable authority/tariff and the
previous review tariff ID and any exact legacy transition. Three `0600` files in `<plan>.sources/` retain the
public response bytes. The digest binds that plan; it is not a human consent
signature and is never recorded as approval to send.

## Explicit application after review

First review the complete private plan, exact scope, actual source files and
commercial assumptions. Only then, with explicit operator authorization:

```sh
node scripts/qualify-review-fax.mjs \
  --apply /absolute/private-directory/review-fax-plan.json \
  --reviewed-plan-sha256 THE_EXACT_REVIEWED_PLAN_DIGEST
```

Application rehashes the saved evidence, reconstructs the plan, refuses altered
or expired material, repeats provider ownership inspection and rechecks the
tenant. It does not pretend that this later read refreshes the tariff evidence.
One D1 batch rechecks target guards, installs or matches the immutable authority,
revokes only the expected previous **review** revision and, when explicitly
bound by ID and row digest, the single legacy operator-test tariff, then inserts
the new review tariff. Historical dispatches and their immutable quotes are
preserved byte-for-byte; no preparation is cancelled or rewritten by this
installation. Failure rolls the whole batch back. Exact successful replay is harmless;
unexpected or partially changed state is rejected. Sending, expert mode, credits,
documents and approvals are never changed by this batch.

The task implementing this candidate did **not** run the remote application step.
Automated tests use isolated D1 with synthetic references and numbers. Source
fetch success, local tests, migration, deployment, operator installation and real
ChatGPT preparation remain separate evidence levels.
