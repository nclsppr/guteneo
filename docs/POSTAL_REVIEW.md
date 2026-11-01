# Postal review bound to the exact document

Server integration and review portal were published in 17 September release
`813dd717`; D1 migrations 0020, 0021 and 0022 were applied. Routes and portal alone
qualify neither Pingen nor sending authority. Drafts were enabled and sends remained
disabled in that dated release. See [release proof](LIVE_RELEASE.md) and separate
[renderer qualification](DOCUMENT_POSTAL_PREFLIGHT.md). The simplified browser
journey and window choice are in [POSTAL_STREAMLINED.md](POSTAL_STREAMLINED.md).

The unpublished 1.1.27 candidate adds [all Pingen postal destinations](POSTAL_WORLDWIDE.md).
Profile, fresh eligibility, transfer and send remain separate decisions; the new
shape grants no authority and proves no real delivery.

## Exposed journey

1. Read authenticated `GET /api/postal/destinations` for 250 recognized codes and fresh unavailable/delayed countries. `GET /api/postal/requirements?country=US&addressFormat=address_block` or `get_postal_requirements` combines that fixed public reference with the effective account profile read through OAuth `organisation_read`. It provides window/rectangles, limits and route-specific `addressGuidance` before PDF creation. Complete printed blocks preserve name, region, postcode/complements and any required country line; legacy FR/LU/DE fields keep their existing limits. `qualified:true` qualifies configuration reading only, not tariffs, funds, sending or geographic processing. Unknown/closed availability gives no qualified flow. Account IDs and secrets are withheld.
2. `POST /api/postal/preflights` with `Idempotency-Key`, or `preflight_postal_pdf`, accepts only `documentId`, `senderId`, `recipient`, print/delivery options, optional `options.addressPosition` and `ceilingMinor`. The server retrieves profile, window, fingerprint and scan proof. Responses include `/#/app/postal/:id`, all-page checks and expected/extracted addresses. No Pingen upload occurs.
3. `GET /api/postal/preflights/:id` reads evidence. The window image is private browser route `GET /api/postal/preflights/:id/address.png`, never a public file or signed URL. Extracted text does not prove visibility: `address.textVisibility: "not_verified"`, `cropAccess: "authenticated_browser_session_only"` and `mcpEmbeddedVisualEvidenceAvailable: false` remain explicit. Visual review of the exact original and return information remains mandatory; MCP cannot claim to have seen an inaccessible image.
4. Standard `POST /api/postal/preflights/:id/transfer` requires current browser session, Origin, CSRF and explicit `reviewed:true` plus `consentToTransfer:true`. Expert `transfer_postal_draft({preflightId,fingerprint})` needs a prior administrator-browser postal mandate explicitly covering transfer to Pingen. The server records delegated authority without claiming human review. Authorized upload preserves bytes and creates only a Pingen draft with `auto_send:false`.
5. `POST /api/postal/preflights/:id/quote` or `quote_postal_draft`, with `Idempotency-Key` and no client content, uses persisted document/recipient/options/ceiling only. `POSTAL_DRAFT_NOT_READY` means inspect later without reupload. Qualified tariffs produce the usual prepared `Dispatch`. Send approval and acceptance remain separate from upload: standard browser, or fresh `review_dispatch` then `approve_and_send_dispatch` under a valid expert mandate.

`canTransfer` describes the browser journey only. `transferPolicy.canTransferMeaning`
explains this; `expertEligibilityEvaluated:false` means no mandate evaluation
occurred. Version 2 and migration 0026 invalidate historical v1 evidence for
external effects. The worldwide candidate retains legacy v2, adds a shape-selected
v3 block and requires schema-first 0072 without rewriting historical quotes;
see [worldwide compatibility](POSTAL_WORLDWIDE.md#compatibility-and-rollout).

MCP reads require `documents:read`; creation requires both **`documents:write`
and `dispatches:prepare`**, advertised together in discovery and OAuth challenges.
Quotes require `dispatches:prepare`; expert transfer also requires `dispatches:send`.
Tools create neither mandates nor human consent. Expert mandates are off by default
and bounded by channel, ceiling, daily count and expiry; see [EXPERT_APPROVAL.md](EXPERT_APPROVAL.md).

## Evidence and atomic commitment

A document belongs to the authenticated organization, is `ready`, has canonical
`document.scan_verified` audit proof for its hash in that organization, and exactly
matches reread/rehashed private R2 bytes. The reread Pingen account must match
installed configuration, use EUR, expose country/window and agree with
`PINGEN_DEFAULT_COUNTRY`. This account/layout setting is not a destination
allowlist. Profile/version freezes with options, the unchanged normalized legacy
recipient or complete ordered block, verified sender, document and ceiling.

Fresh official destination eligibility is independent of the frozen price and
is rechecked before preflight, transfer, quote, acceptance and send. Closed or
unreadable source evidence never becomes a free/available destination.
Availability failure before external mutation is not evidence that a letter was
submitted. Accepted historical replays remain readable without a new country decision.

Evidence insertion and analysis consumption share one SQL transaction using
existing daily `content_limits.renders_per_day`. No quota increases. Double clicks
or concurrent same-key calls render and consume once; different content with the
same key is refused. Failures/interruption consume work already started, authorize
nothing and trigger no automatic retry. Client render deadline is 30 seconds;
the Worker has its own bound. Abandoned `processing` becomes unusable after 90 seconds.

Renderer proof checks fingerprint, exact page count, complete order, 144 dpi,
dimensions and rasters, retaining `canSend:false`. Address mismatch blocks upload.
Matching text still needs visual inspection for invisible text, overlays and
approximate glyph bounds: human in the standard journey or mandate responsibility
in expert mode. Extracted text and model assertions do not prove infallible geometry.

Request identity remains ephemeral; raw OAuth tokens/cookies are not persisted.
Authority factories check session/connection, role, organization, expiry,
verification policy and revocation. Reauthentication follows relevant awaits;
evidence creation/finalization and transfer authorization also fence writes in
SQL against current session/connection. Initial role must stay unchanged. Address
and image responses recheck authority immediately before return.

Immutable transfer-only consent binds the server-manifest fingerprint. Atomic
`preparing` prevents a concurrent second upload. Authority, profile and bytes are
rechecked before external PUT and letter creation. Revocation after a call starts
cannot retract bytes already sent: retain the outcome or mark `unknown`, without
implicit retry. Session refusal does not expose the private result.

`valid_postal_draft_reviews` joins proof, consent, draft, document, scan and sender.
SQL transitions to `queued`/`submitting` require this evidence and tariff account.
The bridge rechecks before/after pricing and immediately before send PATCH. An
old provider ID or browser-fabricated proof never replaces the binding.

## States, limits and retention

- Analysis: `processing`, `review_required`, `blocked`, `failed`.
- Transfer: `not_started`, `preparing`, `prepared`, `unknown`. `prepared` means provider draft recorded only. Abandoned `preparing` appears uncertain after 120 seconds and never automatically becomes available again.
- `POSTAL_DRAFTS_ENABLED` separately gates consented uploads/quotes; `LIVE_SENDS_ENABLED` still gates real communication. The dated publication enabled drafts only after renderer and account/upload-origin qualification. Real sending remains separate evidence.
- Evidence expires after 24 hours; replay extends nothing. Images/extracts are private, unlogged and `no-store`. Cron deletes expired derived reports or reports whose original was purged in batches of 100; immutable request/consent metadata remains for audit/idempotence.
- Responses always retain `canSend:false`. Account authority, verified sender, funds, exact tariff, approval and send gates retain their separate responsibilities.

## Validation

`tests/unit/postal.test.ts` uses real local D1/R2, synthetic PDFs and intercepted
renderer/provider calls. It covers concurrency/idempotence/quota, isolation,
hash/scan, incomplete proof, wrong address, timeout, post-await revocation,
private reads, CSRF, forged input, consent, profile changes, byte integrity,
upload without sending, uncertainty and derived-data removal.
`postal-authority.test.ts` also uses signed RS256 fixture JWTs; `postal-mcp.test.ts`
covers transport and standard scopes. Delegation checks must also prove refusal
without mandate, wrong fingerprint, revocation and limits; documentation alone
is no real-host qualification.

Quote/bridge fixtures record explicitly qualified synthetic evidence for their
scenarios, proving no real upload. All 22 migrations checked locally with an
equivalent schema, `quick_check=ok` and no foreign-key violation. No local test
calls Pingen. Remote migration was subsequently applied and verified at release
without a real PDF upload or draft.
