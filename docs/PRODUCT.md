# Guteneo product contract

21 September candidate: postal preparation collects missing sender details in
the assistant conversation. An authenticated OAuth administrator with preparation
rights can configure the sender through MCP; the account records this source
separately from a browser declaration and does not claim physical verification.
The standard document review and final send approval remain in Guteneo. See
[MCP_POSTAL_JOURNEY.md](MCP_POSTAL_JOURNEY.md) for the workflow and proof boundary.

Candidate, 20 September: an explicit optional postal address page creates a separate immutable PDF while preserving the source. Simplex adds one page; duplex adds a cover and blank verso to preserve original page pairs. The final document is scanned and reviewed again, and its exact pages feed the existing quote/approval flow. This candidate is not deployed; see [POSTAL_ADDRESS_PAGE.md](POSTAL_ADDRESS_PAGE.md).

20 September postal opening: every existing or future verified account can use
the authenticated administrator setup in **Expéditeurs**. It records the sender's
declared authority, not physical-address verification, and installs account-bound
EUR calculator policies for all eight print/delivery combinations. Postal quotes
explicitly use prices excluding tax, without FX. Individual PDF transfer and
send approval remain separate. The user will conduct the first real letter test
after publication. See [POSTAL_ACTIVATION.md](POSTAL_ACTIVATION.md); older dated
release statements below describe their historical state.

Local candidate, 17 September: hosted PDF imports no longer require a
provider-specific domain entry. Public HTTPS downloads retain network, size,
time and exact-file verification limits; local URL import remains disabled.
A source refusal before download never reaches the antivirus, while a separately
generated PDF must pass its own verification. This does not qualify every
assistant's file transfer or the reported document's current status. See
[PUBLIC_PDF_IMPORT.md](PUBLIC_PDF_IMPORT.md) for release and evidence boundaries.

Local candidate, 17 September: the expert assistant journey now exposes the
current connection's mandate and remaining limits, reads immutable PDFs as
bounded page images in the conversation (including before postal preparation),
and returns explicit recovery actions. The paginated review covers every page
before issuing an approval token. Human administrator activation/renewal remains
explicit, with a direct connection link and return-to-chat guidance. See
[EXPERT_CHAT_JOURNEY.md](EXPERT_CHAT_JOURNEY.md) for proof and release boundaries.

Local candidate, 17 September: document verification now has a readable progress
and recovery contract, with automatic bounded retries of temporary scanner
failures on the same original. This does not automate preparation, approval or
sending. Migration and production qualification remain pending; see
[DOCUMENT_ANALYSIS_RECOVERY.md](DOCUMENT_ANALYSIS_RECOVERY.md).

Guteneo implements document delivery by fax (Telnyx), email (SES) and physical post (Pingen). Published release `118ce087` includes these contracts with production sending still disabled; provider and account qualification remain open. REST, MCP and the French dashboard invoke the same domain operations. One dispatch means one recipient and channel. No automatic channel substitution.

Accepted journeys: (A) exact immutable imported PDF; (B) explicitly generated PDF from standalone HTML; (C) sanitized HTML plus text email; (D) named multichannel campaign referencing shared documents and validated CSV recipients. By default a human reviews content, destinations, options and bounded cost in Guteneo before durable acceptance. An administrator may instead explicitly delegate approval to one of their own OAuth connections in account settings, with channels, per-send/daily limits and expiry. This expert mode starts off and never bypasses host confirmation rules or provider gates; the assistant reviews and accepts the exact command under recorded delegated authority. Revocation stops new acceptance, not already accepted communications. See [EXPERT_APPROVAL.md](EXPERT_APPROVAL.md). Simulation is always labelled and consumes a separate test ledger.

Welcome offer: each production organization receives one non-renewing EUR50 promotional balance, shared by fax, email and post. Acceptance atomically reserves the approved ceiling; unknown supplier outcomes retain it. Fixed delivery quotes settle once on qualified supplier acceptance. Fax v3 instead keeps the reservation until separately verified terminal usage is reconciled, even after confirmed delivery. Exhaustion blocks new acceptance. Top-up is visible but disabled pending Stripe. The public preview uses a separate fictional balance. Pricing is explicit per channel. SES text-only quotes use the qualified published price excluding tax, doubled with a dated commercial FX frozen in the quote. Postal and historical fax v2 retain their qualified fixed-price contracts. Fax v3 presents an estimated range excluding tax and a firm customer cap; verified usage determines the final consumption within that cap, with any supplier overrun retained by Guteneo. Supplier accounting and the commercial multiplier remain private. Fractional consumption is accumulated before the organization’s centime debit, never rounded up independently for each small send. No illustrative or unqualified rate can unlock a production channel. See WELCOME_CREDIT.md and LIVE_FAX_QUOTES.md. Production sending remains disabled until sender, scanning, identity, supplier and operational checks are completed and authorized.

First vertical: two isolated local fictional organizations, PDF import/render, preparation, authenticated browser approval, atomic reservation/outbox, at-least-once-safe simulated processing, per-channel outcome and timeline. Subsequent modules add real adapter contracts and deployment operations. Live assistant compatibility requires actual client evidence.

The operator-authorized Luxembourg pilot is an explicit, bounded exception to provider route qualification, not to sender/scan/approval/funding requirements. It keeps Local Calling unverified and labels that uncertainty in the quote. Migration 0027 extends the initial fixed +3524 test to separately installed, priced LU prefixes, including explicit mobile, NGN and freephone categories. Unpriced prefixes stay closed; longest-prefix selection never drops a revoked specific route to a cheaper general tariff. The global limits remain ten pages, seven days, the 24 September 2026 09:00:01.620 UTC deadline, and EUR2 maximum per fax; route-specific page limits keep the estimate within that cap; existing shared credits and provider-outcome rules remain unchanged. See [TELNYX_READINESS.md](TELNYX_READINESS.md).
