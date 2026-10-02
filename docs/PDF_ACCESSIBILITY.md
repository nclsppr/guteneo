# Horizon PDF diagnostics — branch candidate

Prepared on 2 October 2026. **guteneo Horizon** costs **EUR30/month**, debited as
**3000 integer minor units** from available organization credits after explicit
recurring consent by the authenticated browser administrator. Members and
assistants cannot subscribe, cancel or manage billing. Insufficient credit
suspends renewal without debt or spending delivery reservations. Cancellation
preserves the paid period. Today's lifetime EUR50 promotional credit funds one
EUR30 period; replenishment remains unavailable. See [MONTHLY_PLAN.md](MONTHLY_PLAN.md).

The offer includes 100 diagnostic attempts per UTC calendar month, PDF/UA-1/-2
automated checks, PDF/A-1b/2b/3b/4 archival checks, document history, JSON export
and human-review guidance. Existing 10 MiB/100-page limits apply. No extra
per-check debit occurs. Engine errors consume an attempt without recording a
conformity verdict. Purchased reports remain readable within their tenant after
plan expiry.

| Locale | Offer name |
| --- | --- |
| French | Forfait Horizon |
| English | Horizon plan |
| German | Horizon-Tarif |
| Luxembourgish | Horizon-Abonnement |

## Web, REST and MCP

`POST /api/documents/:id/validation` and `validate_pdf` share one service.
Input is an explicit profile plus stable idempotency key; tenant and original
bytes come from authenticated membership and private R2. GET on that route and
`get_pdf_validation` read the last 50 completed reports. MCP requires
`documents:write` to run and `documents:read` to read. Subscription/cancellation
and billing are private browser operations, excluded from OAuth OpenAPI/tools.

Migration 0050 installs immutable recurring consent, atomic charges and
subscriptions, and a separate fictional simulation ledger. It preserves
dispatch/fractional settlement and hosting charges in the shared balance view.
0051 installs tenant-scoped attempts, quota/concurrency guards and immutable
complete reports. Apply the existing migration sequence through 0051; no applied
migration is edited.

The server verifies a ready document and its exact hash. Current browser session
or OAuth connection, expiry/scopes, membership and paid entitlement are checked
before validation and again before publication, with credential SQL fences at
the writes. Reports must match hash/profile, pinned veraPDF 1.30.2 and complete
rule totals. Time, stream bytes/chunks and findings are bounded. Idempotent
replay never starts a second engine run. Diagnostics never modify quarantine,
dispatch approvals or original PDF bytes.

The private CLI service runs without runtime network access on a temporary
original. Only standard/clause/test identifiers and counters enter reports;
PDF text, snippets, names and raw engine results do not enter logs or reports.
[PDF_VALIDATOR.md](PDF_VALIDATOR.md) records the pinned installer, licences,
exact rule inventory, offline synthetic proof and remaining hosted gates.

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

## Release and publicity

The public site prepares a forthcoming offer and sourced FAQ in all four
languages. [HORIZON_LAUNCH.md](HORIZON_LAUNCH.md) contains announcement drafts.
Plugin 0.3.2 includes the conditional diagnostic workflow and preserves its
identity; no marketplace replacement/resubmission is performed.

`HORIZON_ENABLED` is off/absent by default and `PDF_VALIDATOR` is unbound in the
application. Both require explicit hosted qualification before availability.
Public preview has no business bindings and cannot subscribe, debit or validate.
Production activation needs a separately authorized release, private-service
provisioning/binding, migrations and commercial tax/invoice decisions. No merge,
production migration/deployment, real charge, communication or marketplace action
was performed. See [HORIZON_PROOF.md](HORIZON_PROOF.md) for executed checks.
