# Worldwide postal destinations — 1 November 2026 candidate

The 1.1.27 source candidate accepts all **250 country codes recognized by
Pingen**: the 249 ISO codes in its published table and Kosovo's provider code
`XZ`. Recognition, current service availability, account qualification, price,
transfer consent and sending authority are separate decisions. This candidate is
not deployed. Production remains 1.1.26 at this handoff; neither publication nor
the local fixtures establish real sending to these destinations.

The postal expansion does not change fax destinations, tariff references or
route authority. The fourteen FR/DE fax references are a separate mechanism.

## Native Worker callback qualification

The 1.1.28 corrective candidate invokes the stored fetch callback without binding
it to the reader. Real workerd tests cover this native-runtime boundary; Node
fetch mocks alone did not qualify it. The first 1.1.27 application publication was
restored to 1.1.26 after the real requirements read caught the failure. Schema
0072 and the private renderer remain installed and compatible. No availability
rule, source, parser, cache or approval is relaxed. Cloudflare source access and
authenticated requirements metadata still need actual hosted evidence.

## Country reference and current availability

The versioned country/alias reference comes from Pingen's
[accepted country names](https://help.pingen.com/en/templates-and-postal-requirements/supported-country-names),
checked on 1 November. A recognized code is not evidence that letters can
currently be sent there. The fixed official
[restricted and delayed delivery reference](https://help.pingen.com/en/templates-and-postal-requirements/countries-with-delayed-or-restricted-mail-delivery)
is read independently from prices. At the dated inspection it listed eleven
unavailable codes (`BY`, `RU`, `UA`, `CU`, `KP`, `MM`, `IR`, `SD`, `SY`, `YE`,
`TD`) and no delayed destinations. This is an observation, not a permanent
runtime exclusion list. The public calculator alone is not an eligibility source.

Authenticated `GET /api/postal/destinations` returns recognized `countries`,
`unavailableCountries`, `delayedCountries`, `observedAt`, `expiresAt`, `sourceUrl`
and `sourceSha256`. Postal requirements return the same `destinations` object.
The catalogue contains no provider account identifier or price; the account's
`defaultCountry` remains in `requirements.profile` and is not a destination
allowlist. MCP `get_postal_requirements` reads this fixed public reference as
well as the configured account, so its `openWorldHint` is true.

One in-memory snapshot and single-flight read per trusted fetcher/clock lasts at
most **300 seconds**. The source body is bounded to 256 KiB and the operation to
eight seconds. Both complete restriction/delay tables must parse against known,
unambiguous country aliases; missing sections, unknown countries, contradictory
statuses, changed structure, redirects, invalid encoding or transport failure
close availability. The body hash records provenance, not equality with an older
article. The observation clock follows the actual read, parsing and hash. There
is no expired snapshot fallback or durable country-price cache.

Availability is checked for new postal requirements/preflight, before claiming
transfer state, when quoting, centrally before production acceptance reserves
credit/quota and inserts the outbox, and before the physical provider PATCH.
Already accepted/idempotent historical replays do not receive a new country
decision. Delays remain distinct from closures. `POSTAL_DESTINATION_UNAVAILABLE`
is a confirmed restriction; `POSTAL_DESTINATION_AVAILABILITY_UNAVAILABLE` means
current availability cannot be verified and grants no permission. A failed
public read before the physical send PATCH never becomes a fabricated
`submission_unknown`. Existing draft-transfer progress retains its conservative
unknown/reconciliation behavior and cannot be reset with a new key. A response
lost after a send invocation remains unknown and must never be automatically resent.

## Complete printed address contract

New recipients use the strict shape:

```json
{
  "country": "US",
  "addressLines": [
    "FICTIONAL RECIPIENT",
    "123 EXAMPLE STREET",
    "EXAMPLE CITY NY 10001",
    "UNITED STATES OF AMERICA"
  ]
}
```

`addressLines` is the **entire printed block**, including the recipient name and
the final country line when required. Guteneo's internal limit is two to six
total nonblank lines, including the country line, at most 160 characters per
line; it is not a claim that every postal operator accepts every such block.
No mixed legacy fields, controls, outer whitespace or automatic completion are
accepted. Order, case and punctuation remain supplied data. Postcodes, regions,
building/floor and delivery references occupy their actual printed lines;
there is no invented universal postcode pattern or mandatory postcode field.
Route-specific syntax and visual/provider review still apply.

The ten local print destinations are `DE`, `CH`, `AT`, `NL`, `BE`, `LU`, `FR`,
`GB`, `ES` and `IN`. Omit a final country line only when the effective account
default matches a qualified local-print destination. Other destinations still
need that line even if equal to a nonlocal account default. The domestic French
profile applies only to a French account and French destination; France from a
Luxembourg account follows DHL/general rules. These rules do not manufacture an
available route or price.

An imported PDF retains its exact bytes and accepted printed country spelling.
An explicitly requested new address page also preserves every supplied line,
including accepted English/German country aliases. Guidance and the UI may suggest
the reference's canonical recognized spelling before validation; generation does
not replace it in an accepted block. Generation rejects overflow and unsupported
glyphs. It never shrinks text until it fits,
truncates information or transliterates an address. Separate bounded five/six-line
typography stays inside the configured window. Address existence, actual visible
identity and delivery remain separate from extraction and generated geometry.

The legacy FR/LU/DE `{name,line1,postalCode,city,country}` form stays accepted with
its original normalization, JSON and fingerprints. It retains its one-street-line
limits; never discard an address complement to force that representation. New
FR/LU/DE recipients may also choose the complete block. Server-derived renderer
`addressFormat` follows the frozen recipient shape; it is not a new persisted
pricing option or a client assertion of qualification.

For generation distributions, a shared complete recipient requires an actual
array. Only an explicit postal `recipientFields.addressLines` mapping may turn
a multiline CSV cell into ordered lines; JSON data can supply a text array
directly. No generic JSON parsing, joining or stringifying of arrays is used.
Other recipient mappings retain string/number values and reject objects/arrays
with `RECIPIENT_FIELD_INVALID`. Record hashes and the resolved immutable manifest
remain intact. Mapping paths such as `customer.country` are not country codes.

## Exact calculator price and preserved authority

Each analyzed, separately consented `auto_send:false` draft is priced through
Pingen's authenticated
[`letter_price_calculator`](https://api.pingen.com/documentation/swagger-docs)
with its actual country, detected paper and approved print/delivery options.
Only a calculable EUR result supplies the price; 202/missing/unsupported results
remain closed or pending. Guteneo retains integer minor units, the existing
twice-supplier customer calculation and the short **300-second** postal quote.
The exact quote and current policy are rechecked before the send PATCH. There
is no fixed country tariff, public-calculator eligibility shortcut or extension
of historical prices/approvals.

The four persisted pricing options remain `addressPosition`, `deliveryProduct`,
`printMode` and `printSpectrum`. Current tenant membership, verified sender,
canonical scan, exact PDF/hash, profile, transfer consent, quote, ceiling,
approval or separately bounded expert mandate and send gates remain mandatory.
An assistant cannot create human consent or enable its own delegation.

## Compatibility and rollout

Legacy preflight version `pingen-2026-09-17-v2` and address-page version
`postal-address-page-2026-09-20-v1` remain unchanged. Complete blocks use
`pingen-2026-11-01-address-block-v3` and
`postal-address-page-2026-11-01-address-block-v2`, selected by recipient shape.
Historical v1 preflight evidence remains readable and cannot authorize new
external effects. No global quote-version bump or default JSON field is added.

Migration **0072_worldwide_postal_addresses.sql must precede the new runtime**.
It recreates only `require_postal_review_on_commit` and
`postal_address_page_preflight_guard`. Legacy v2/v1 objects keep their existing
guard path; the new branches require the strict block shape and matching new
versions. Tenant, draft, content/PDF hash, consent, recipient, profile, options,
page count and current pricing guards remain effective. No record, quote,
approval, policy, reservation or financial history is rewritten. The old 1.1.26
runtime remains compatible after applying 0072; deploy the qualified private
renderer and 1.1.27 application before advertising the new flow as available.

Local tests cover all country names/aliases, bounded fresh source parsing,
calculator requests for international codes, refusal before send invocation,
post-read expiry, exact legacy quote preservation, new-version SQL refusal
before migration and acceptance afterward, derived-page drift, isolated tenants,
mapping arrays/CSV and unchanged frozen record data. All 72 migrations applied
in an empty native SQLite check with `quick_check=ok` and zero foreign-key
violations. These observations establish neither final-head CI/publication nor
real international delivery, mailbox receipt or a host/native client journey.

Related contracts: [postal review](POSTAL_REVIEW.md),
[preflight](PINGEN_PREFLIGHT.md), [address pages](POSTAL_ADDRESS_PAGE.md),
[conversation journey](MCP_POSTAL_JOURNEY.md) and
[live quotes](LIVE_DELIVERY_QUOTES.md).
