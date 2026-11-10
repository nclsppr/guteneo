# Dispatch preparation and review design

## 10 November 2026 local candidate

This continuation applies the remaining dispatch-page design from Claude's
9 November audit on top of current main. It changes browser presentation only;
[the product contract](PRODUCT.md), [human roles](WORKSPACE_ROLES.md),
[postal consent](MCP_POSTAL_JOURNEY.md) and
[future dispatch authority](SCHEDULED_DISPATCHES.md) remain authoritative.

### Preparation

Channel cards describe their existing public indicative rate, including the unit.
The selected channel's dated public examples and qualifications precede the
spending limit. These are not an operational quote. No provider is called to
manufacture an early estimate: a postal price still requires the existing explicit
PDF/address transfer consent, and the exact immutable quote is reviewed later.
The source is `customer-pricing.ts`; this design neither updates nor independently
qualifies its dated prices. The cap remains an integer-cent API input.

Postal-country search uses the current interface language's country names and
ISO code, ignoring case and diacritics. Searching preserves the selected country,
address, unavailable-country exclusion and the original 250-code catalogue.
Clearing search restores the full list. It adds no request or persistence.

The preparation form uses existing browser validity constraints with translated
inline feedback and focus on the first invalid field. It sets `aria-invalid` and
`aria-errormessage` for that control and clears the feedback on new input. Invalid
fields cannot invoke preparation. Budget, destination, sender and exact-document
checks in the service remain independent gates.

### Review

Email, fax and postal final approval retain their existing confirmation sequence,
checkboxes and email recipient attestation. Approval/confirmation buttons include
the frozen price or variable-fax cap. Postal PDF transfer remains a separate
explicit authorization to obtain a quote, not an authorization to send.

The final review renders one guarded PDF page at its natural bounded canvas size,
with the existing page controls and authenticated exact-byte download. There is
no inner vertical viewport and no eager rendering of all pages. Desktop decisions
remain sticky next to the document; the postal preflight uses the same approval
panel vocabulary while retaining address-image and transfer gates.

A pointer gesture on a decision is rejected if the control moved between
pointer-down and click. This protects intentional consent when a natural PDF page
or late content changes layout. Keyboard activation remains available. The log
moves above the preview after approval or acceptance. A copy action exposes only
the already-visible dispatch reference and is fenced against an obsolete view.

### Authority and surfaces

No migration, REST/MCP/native capability, provider activation, new permission or
consent record is introduced by this design. Existing authenticated tenant and
exact-source policies apply. New fields store no recipients or content; the
last-channel preference remains presentation-only. The ordinary review stays
unavailable while an active future schedule holds its source.

### Qualification

The targeted preview regression covers four languages on desktop and iPhone,
country/address preservation, translated invalid-input refusal and zero business
requests. The authenticated protected-email regression covers delayed/failed PDF
rendering, natural page navigation, moved-pointer rejection, unchanged recipient
attestation and no approval/confirmation writes. Actual executed results and
performance measurements belong to the continuation ledger and
[frontend performance record](FRONTEND_PERFORMANCE.md); authored tests alone do
not establish a passing run or deployed proof.
