# Async hot-path audit — current-main port, 3 November 2026

The original audit inventoried runtime TypeScript, React and native Swift sources under
`apps/`, `packages/` and `ios/Guteneo/`: 158 files, including 90 containing
`await`. Its TypeScript AST pass highlighted functions with multiple awaits;
dependency review then distinguished independent work from authorization,
validation, cursor, resource and mutation ordering. Hot paths are identified from
request handlers and application flows, without production traffic profiling.

The original audit was committed as `46c812dc` on the older `ca028d13` checkout.
This candidate ports only that change onto `92070104`, without its obsolete
security/version parents. It is then rebased onto the recovered MCP read-only
candidate `e971b0ac`, retaining its 36 read-only annotations. The original source
inventory and historical results remain dated observations; this port is
validated separately below.

Reconciliation retains the current account appearance, canonical invitation-token
validation, transaction-bound Auth0 issuer and callback-error recovery, sensitive
source fence, secure-distribution request hash, requested usage period and
continuous fax-review authority. The old email sender/source hash overlap is
omitted: current main derives the qualified rate through sender-scoped policy
reads, so those computations are no longer independent.

## Independent work now overlaps

| Path                           | Independent operations                                                 | Required ordering retained                                                                                             |
| ------------------------------ | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Account profile                | User and organization reads                                            | Authenticated session first                                                                                            |
| Billing overview               | Organization, customer, subscriptions, usage and credit reads          | Current browser administrator check first                                                                              |
| Document list                  | At most two analysis-query chunks for a 100-document page              | Authenticated tenant list first; IDs, order and SQL bind limits preserved                                              |
| Browser login/callback         | PKCE/state/browser/invitation hashes; ID and access token verification | Configuration, one-use transaction and token exchange first; nonce, subject, account and session checks still required |
| Native session exchange        | Code hash, PKCE challenge and new session-token hash                   | Input validation first; existing atomic one-use exchange retained                                                      |
| Native browser review          | Preferred locale and tenant dispatch reads                             | Browser authentication first; unavailable dispatch still produces localized 404                                        |
| Protected-document preparation | Secret sealing, password verifier and token digest                     | Current document/authority and password validation first; one atomic write afterwards                                  |
| SES denial diagnostics         | Usage and policy reads                                                 | Atomic send reservation and active-attempt check first; diagnostic reads cannot grant a send                           |
| Postal review                  | Document and address-page provenance reads                             | Tenant-bound review authority lookup first                                                                             |
| Dispatch preparation           | Immutable request digest and idempotency lookup                        | Permission, organization and input checks first; replay conflict still checked before insertion                        |
| Usage report                   | Welcome credit and monthly channel usage                               | Reporting permission, organization and requested-period selection first                                                                      |
| Dispatch consumer              | Channel control, suppression, sender and document readiness reads      | Conditional claim first; every check completes before quote validation or provider submission                          |
| Fax usage tariff               | Tariff and sender reads                                                | V3 ownership and outbound-profile validation first                                                                     |
| Fax usage settlement           | Proof digest and replay lookup; quote and dispatch reads               | Proof validation first; exact integrity and atomic settlement remain required                                          |
| Telnyx readiness               | Outbound-profile inspection and ordered phone-number pagination        | Validated application first; bounded pagination and stable partial-error ordering retained                             |
| Browser PDF viewer             | Canvas rendering and accessible text extraction                        | Loaded page and geometry bounds first; stale effects cannot publish results                                            |
| Private document evidence      | Image/raster digest and bounded page-text extraction                   | Rendering gates first; both operations settle before page cleanup, including on failure                                |
| Public preview initialization  | Two independent fixture PDF/hash pipelines                             | Results applied in original deterministic order; fixtures have no business bindings                                    |
| Document maintenance           | Both cursor states fetched in one query                                | Purge decision, object deletion, audit insertion and cursor advancement stay ordered                                   |

## Reviewed sequences retained

- REST, MCP and native routes retain authentication before tenant data, human or
  delegated approval before acceptance, and immutable quote/content checks.
- Upload/rescan/recovery retains bounded input, quota/lease acquisition, exact
  bytes, scan and final membership/state fencing. Scanner streaming respects
  backpressure and abort deadlines.
- Queue messages, provider submissions, callback projection and outbox
  publication keep their existing ordering, idempotency and uncertainty handling.
  Unknown provider outcomes are not retried by this patch.
- Postal rendering and expert review keep annotation/structure/geometry/resource
  gates, isolated-browser setup and bounded sequential page rendering. PDF.js
  input hashing still precedes opening the original buffer, which may be
  transferred by the renderer.
- Retention mutation/deletion/audit chains, foreign-key-dependent session cleanup,
  campaign fail-stop preparation, cursor pagination and polling remain ordered.
- Native `AppModel.refresh()` already uses `async let` for its six independent
  reads; sibling React resource hooks and Swagger asset loading already overlap.
- Build, deployment and operator qualification scripts are outside runtime hot
  paths. Their release gates are unchanged.

## Evidence and limits

Deterministic deferred-promise tests exercise actual service/component code,
checking overlap before either branch resolves, result association, cancellation,
authorization gates, provider preflight, resource cleanup and partial-error
ordering. Port regressions also preserve appearance and both explicit/latest
usage selection. Existing Miniflare integration tests exercise local D1/R2 and
atomic business guards. Current commands, counts and limits are recorded in
[executed verification](TEST_RESULTS.md#async-hot-path-port--3-november-2026).

This is local and deterministic fixture evidence. It includes no production
benchmark, measured customer latency improvement, real provider communication,
remote migration, merge or deployment. Browser/device and exact-commit CI
qualification remain separate.
