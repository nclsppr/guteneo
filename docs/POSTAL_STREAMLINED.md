# Streamlined postal journey — 21 September 2026 candidate

## Proposed experience

Starting with an imported PDF and configured sender, the journey has three explicit actions:

1. **Prepare letter:** recipient, left/right window and options. Optional address-page creation and final PDF checking continue without a second button. The original stays intact. An administrator can declare a missing sender on the same page.
2. **Review document and get price:** inspect pages, window and return address. Button copy and explanation carry both review and transfer declarations; separate checkboxes are removed, while the server still requires `reviewed:true` and `consentToTransfer:true`. This transfers the document for analysis only, without printing or sending.
3. **Send for the exact displayed price:** the browser approves the fingerprint and requests acceptance with stable key `web-confirm:<dispatchId>`. Reservation and queue insertion remain atomic. Price, validity and saved options are visible before this action. Fax and email retain their own journeys.

Quote follow-up retries only explicit `POSTAL_DRAFT_NOT_READY`, at most 20 times
three seconds apart. `web-postal-quote:<preflightPath>` survives back navigation
and reload. Any other error stops polling; uncertain transfers or sends never
automatically retry. Editing fields during scanning stops continuation and
requires new preparation.

Ordinary portal, MCP, tracking and skill copy names Guteneo or the print provider.
Legal/privacy disclosures and internal identifiers, sources and technical evidence
retain the actual provider name.

## Per-letter window

`PostalReviewInput.options.addressPosition` and
`PostalAddressPageInput.addressPosition` optionally accept `left|right`; omission
uses the qualified default. `GET /api/postal/requirements` and
`get_postal_requirements` accept the same choice; `profile.addressPositions` lists
available sides. LU/DE profiles allow both; the FR provider profile allows only
right. This depends on organization profile, not destination country alone.

The side binds the request, derived PDF, frozen profile, raster check, draft and
quote. Changing it never moves an address inside an original PDF. A derived PDF
for one side cannot be checked or sent with the other.

Verified technical sources: [letter creation API](https://api.pingen.com/documentation/swagger-docs),
[general layout](https://help.pingen.com/en/templates-and-postal-requirements/layout-requirements),
[French profile](https://help.pingen.com/en/templates-and-postal-requirements/layout-requirements-french-organisations).
No provider-account global default changes. The provider draft side is reread and
compared during quotation and immediately before sending. External changes stop
continuation without changing historical price-fingerprint serialization.

## Compatibility and migration

`0036_postal_window_options.sql` accepts generations of eight or sixteen policies.
Configured non-French profiles create sixteen combinations; French profiles keep eight.
Existing complete current qualified generations extend to both sides with the
same dates, evidence and states. Eight historical policies and old quotes remain.
Revoked policies copy as revoked; manual qualification for the other side is not
overwritten. Migration never extends an expired generation; its existing explicit
renewal creates sixteen combinations. Mandates, quotas, credits, senders and
channel shutdowns are unchanged.

## Evidence and limits

Tests use synthetic organizations/PDFs, local D1/R2 and intercepted provider calls.
They cover both sides, provenance, fingerprints, active/expired/revoked generations,
automatic preparation, back/reload, interruption and final exact-price sending.
The real local renderer also checks a right-window LU cover.

Publication, remote migration and ChatGPT/Claude qualification remain separate.
No real letter is sent for this validation. [LIVE_RELEASE.md](LIVE_RELEASE.md)
records actually verified publication.
