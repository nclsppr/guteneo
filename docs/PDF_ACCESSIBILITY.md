# PDF verification

The 25 October 2026 branch candidate replaces the retired monthly PDF verification
subscription with an individual purchase for each PDF/profile verification. This
is source implementation, not proof of a deployed offer or a real account debit.
The current price, cost assumptions and release qualification are owned by
[the unit-pricing contract](PDF_VERIFICATION_PRICING.md).

New subscriptions and automatic renewals are closed. Existing subscription actions,
paid periods and financial charges remain immutable historical evidence; they are
not converted into new purchases or silently refunded. See
[the retired subscription record](MONTHLY_PLAN.md).

## Purchase and authority

The caller reads `GET /api/pdf-validation/pricing` before purchase. The response
provides the integer EUR price, excluding-tax basis, immutable terms version,
account-credit payment source, readiness, current purchase authority and evidence.
Only a current authenticated browser administrator can purchase a new verification,
after explicitly accepting its price for the exact original PDF and selected
profile. The browser uses its existing same-origin session and CSRF protections.
Assistants, native callers and other membership roles cannot create that purchase
consent. A grant, installation, scope or assistant statement is not approval.

`POST /api/documents/:id/validation` runs the purchased verification against a ready,
accessible immutable original. Its stable idempotency key binds that purchase and
recovers an uncertain response without purchasing or running the engine twice.
A new independent verification needs a new purchase. Reservations protect available
account credit; insufficient credit refuses the purchase before engine work.

The POST body binds `profile` and `purchase` with `confirmed: true`, the exact
`documentSha256`, integer `priceMinor`, `currency` and current `termsVersion`.
The server checks those values against its pricing source and ready original;
a caller cannot submit a different price, currency, terms version or file hash
and silently purchase a substitute. `Idempotency-Key` remains the operation key.

Additive migration `0060_pdf_validation_per_check.sql` preserves all applied
migrations and legacy financial journals, closes new recurring debits, and extends
the shared balance with pending verification holds and completed purchases.
`apps/api/src/pdf-validation-pricing.ts` owns the unit-purchase price/status API.

A complete valid report is billable even when conformance rules fail. An unavailable
engine, timeout, malformed or incomplete output is an operational failure, not a
conformance verdict; it does not create a settled verification charge. Production,
simulation and browser-only preview evidence remain explicitly distinct.

## Reports, privacy and failure recovery

`GET /api/documents/:id/validation` and `get_pdf_validation` retain current document
access checks for existing reports. Report reads do not require a subscription,
make a new purchase or inherit another caller's authority. A private generated
PDF remains private to its owner. Historical reports stay linked to their exact
original hash and profile; changed bytes require a new immutable document.

The server checks the ready document, original hash, session or OAuth connection,
scopes, membership and operation authority before execution and before publication.
Time, stream bytes/chunks and findings remain bounded. Reports must match the
requested hash/profile, pinned veraPDF 1.30.2 and complete rule totals. Diagnostics
never modify quarantine, dispatch approvals or original PDF bytes.

The private validator operates on a temporary exact original without runtime
network access. Reports retain allowed standard/clause/test identifiers and
counters, excluding PDF text, snippets, names and raw engine output. No content,
recipient, token or signed URL enters logs. See [the validator contract](PDF_VALIDATOR.md).

## Scope of the checks and European rules

**PDF/A concerns archival conformance; PDF/UA concerns accessibility.** veraPDF
checks only machine-verifiable PDF/UA requirements. Even a favourable result
requires human review of reading order with a screen reader, alternative text,
contrast and keyboard navigation. Reports keep `manualReviewRequired: true`
and `certification: false`; the assistant cannot assert human review. A corrected
version must be imported and scanned as a new immutable original.
[veraPDF scope](https://docs.verapdf.org/validation/),
[W3C reading order](https://www.w3.org/WAI/WCAG22/Techniques/pdf/PDF3),
[W3C alternative text](https://www.w3.org/WAI/WCAG22/Techniques/pdf/PDF1).

Directive **2019/882**, the European Accessibility Act, applies from **28 June
2025** to specified consumer products/services, including e-commerce, e-books
and consumer banking. Service microenterprises and some older content have
exceptions; national transposition determines concrete duties. It does not make
every business PDF universally subject to PDF/UA certification.
[EUR-Lex official scope](https://eur-lex.europa.eu/EN/legal-content/summary/accessibility-of-products-and-services.html).

Directive **2016/2102** covers public-sector websites/mobile apps. Its exclusion
for office files published before 23 September 2018 has an exception for active
administrative processes. EN 301 549 includes requirements beyond WCAG alone.
A Guteneo report is not an EAA, WCAG or EN 301 549 certificate.
[Directive scope](https://eur-lex.europa.eu/legal-content/en/LSU/?uri=CELEX%3A32016L2102),
[Commission standards guidance](https://digital-strategy.ec.europa.eu/en/policies/web-accessibility-directive-standards-and-harmonisation).

## Release and historical evidence

`PDF_VALIDATION_ENABLED="true"`, the private `PDF_VALIDATOR` binding
and required production scanner must all be ready. Missing configuration fails
closed and cannot produce a conformity verdict or settled charge. Public preview
has no business bindings and cannot purchase, debit or validate.

Release requires the final source checks, migration and private-engine qualification,
then separately authorized merge and production publication. Public capability
checks, authenticated purchases, real financial entries and live engine execution
need distinct evidence. This documentation records no new production debit,
communication, merge, deployment or marketplace action.

The [2 October proof](PDF_VERIFICATION_PROOF.md),
[3 October opening decision](PDF_VERIFICATION_OPENING_2026_10_03.md) and
[archived launch preparation](PDF_VERIFICATION_LAUNCH_ARCHIVE.md) preserve historical
observations. Their retired monthly terms and previous authorization are not a
current recurring offer or standing permission to debit accounts.

The browser entry is `/app/pdf-checks`; the old `/app/plan` bookmark can resolve
only through the supported compatibility route. Diagnostics and financial history
remain private, with no-store responses and the existing document access gates.
