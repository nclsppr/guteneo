# Postal address page — 20 September 2026 candidate

The journey offers Use the document address or Add an address page. The latter
creates a separate immutable document. The original is retained and its pages are
copied without rasterization; their print checks still apply. The recipient text
is editable, while Guteneo controls placement and typography using the current
Pingen profile.

## Pagination and validation

- Simplex: one address page, then all original pages.
- Duplex: address page, blank verso, then all original pages. The separate sheet preserves original front/back pairs and starts the customer document on a recto.
- A one-page original produces two pages/two sheets in simplex or three pages/two sheets in duplex. Both are one PDF and one letter.
- The final PDF, including the blank verso, must fit 100 pages and 8,000,000 bytes. Its final quote supplies the price, without example pricing or local multiplication.
- An overlong line or unrenderable character is rejected; information is never truncated to fit the window.

Generation certifies neither address existence nor deliverability. The schema
retains three lines excluding country: name, street, postal code and city. Do not
remove a required address complement to satisfy that limit.

## Shared browser and assistant journey

`POST /api/postal/address-pages`, with `documents:write` and `Idempotency-Key`,
accepts `{documentId, recipient, printMode}`. Browser session and CSRF protection
remain. MCP `create_postal_address_page` calls the same service with a stable
`idempotencyKey`.

The service rereads the ready original, hash, scan evidence and provider profile.
The private renderer adds the address page. The new PDF passes immutable private
storage, antivirus and document validation again. A document under analysis cannot
be sent; consultation/recovery uses that document without regenerating it.

The response contains `document`, `provenance` and `canSend:false`. Once `ready`,
the client reads the final PDF and requests postal checks with its new identifier.
Checks, consented transfer, provider draft, quote and approval all bind this same
PDF. Recipient, print mode and profile remain bound to provenance; changing them
requires regeneration from the original. A Guteneo cover cannot recursively
receive another cover.

Generation sends nothing to Pingen and creates neither consent nor a dispatch.
Concurrent requests and retries sharing a key share one operation; different
content with the same key is rejected. Authority is checked before and after
private processing. Originals, recipients and metadata are not logged.

## Publication and evidence

This is candidate implementation evidence. Deployment must include migration
0033 and the private document renderer. Tests use no real letter or Pingen
transfer. Hosted qualification and a real letter test remain separate.

Sources: [Pingen layout](https://help.pingen.com/en/templates-and-postal-requirements/layout-requirements),
[window envelopes](https://help.pingen.com/en/templates-and-postal-requirements/letter-standards).
Generation is internal and does not depend on Pingen API PDF-correction operations.

## Local checks

- 17 composition tests, including five with real Chromium/PDF.js: LU, FR and FR-to-DE profiles, image-only originals, embedded fonts, overflow and missing characters. Original page raster hashes at 144 dpi match before/after composition.
- 18 new server tests and 74 existing document, invariant and postal tests passed: interruption recovery, concurrency, isolation, access withdrawal, quotas and scan evidence.
- Two new MCP tests: required write authority, no client-supplied consent/profile, separate result and no private storage key.
- 39 browser journeys: 18 new and 21 existing postal-review cases in Chromium, Android Chromium and iPhone WebKit, with capture inspection and 320 px checks.
- 148 Node security checks passed, including the standalone 26-operation OpenAPI contract and authentication/execution bounds.
- All 33 migrations checked locally: 216 normalized matching schema objects, `quick_check=ok`, no foreign-key violation.
- Typecheck, lint, application build and private renderer build passed without publication.

Server tests also cover concurrent recovery of produced bytes, access withdrawal
during generation, recipient/mode/profile changes, missing scan proof and absence
of provider upload. Local evidence: `test-results/address-page-*`; synthetic
PDF/PNG: `test-results/postal-address-page/pdf/`; interface captures:
`reports/screenshots/postal-address-page/`. Broad suites and branch CI are tracked
separately in the change proposal.
