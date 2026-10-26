# Recipient feedback on document email

26 October 2026 source candidate. This is the authoritative contract for the
email footer controls and lifecycle projection. It does not establish deployment,
provider delivery or an actual recipient action.

## Journey and authority

A document email has a small **Discover guteneo** link and **Unsubscribe or report
this email** link. Default messages also quote the frozen document name; the
sender reviews this recipient-visible title with the exact message before sending.
The account invitation and preference link are distinct capabilities.

1. Open the preference link. A non-indexed `/#/email-preferences` fragment route
   uses the shared public header/footer, all four languages and no sign-in or
   workspace bootstrap. Its token stays out of HTTP URLs and is removed from the
   visible fragment after capture. Reopen the received link after a refresh.
2. Choose **Unsubscribe** or **Report an unwanted email**. Merely loading the page
   changes nothing; scanners following links cannot opt anyone out.
3. One explicit, same-origin POST to `/api/email-preferences` supplies the opaque
   token and action. A maximum 1 KiB streamed JSON body and strict schema apply.
   The server derives the workspace, dispatch and normalized recipient from the
   immutable token mapping. The browser cannot select another recipient or scope.
4. The transaction updates the existing workspace suppression, records the
   delivery's recipient response and appends idempotent lifecycle/audit events.
   Reporting also blocks further email from that workspace. Every mutation and
   the final state read recheck the same token, tenant, recipient and eligible
   dispatch inside that transaction; cancellation between lookup and commit
   produces no suppression or receipt. A later unsubscribe replay cannot
   downgrade a recorded complaint. Repeating an already satisfied response
   preserves the dispatch's update timestamp.
5. The sender sees **Unsubscribed** or **Email reported** separately from provider
   delivery and document access. Existing received documents/copies remain
   accessible under their original rights; no refund, deletion or revocation is
   implied by email preferences.

This mailbox capability can reduce only the originating workspace's sending
rights. It grants no document, account or global cross-workspace authority. The
same normalized address in another workspace is unaffected. A global preference
would require independently verified recipient authority, since senders review
these URLs too. This feature does not enable marketing or a subscription.

| Actor | Authority and operation |
| --- | --- |
| Holder of the received preference link | Explicit unsubscribe/report for its originating workspace and address; no account needed |
| Workspace sender/current reviewer | Existing document and dispatch visibility; read the recorded response for their own accessible delivery |
| Assistant/OAuth client | Read recipientFeedback under current resource permissions; cannot exercise recipient controls or lift a suppression |
| Recipient account owner | Existing document rights remain independent of email preferences |
| Platform operator | Investigate durable audit under existing operational authority; no inferred right to re-enable email |

## Storage and lifecycle

Migration `0062_email_recipient_feedback.sql` adds a write-once hashed token
mapping and nullable `dispatches.recipient_feedback` (`unsubscribed`, `reported`).
It preserves existing dispatch status, immutable content/fingerprint and provider
history. Secure-distribution views project `recipientFeedback`; their server audit
contains `recipient_email_unsubscribed` or `recipient_email_reported`. These are
link-holder actions, not proof of physical identity or confirmed document reading.

A separate 256-bit random token is minted during document email preparation,
hashed at rest in the mapping, and inserted in the final HTML/text before approval.
Token insertion shares the dispatch transaction; a lost/replayed preparation keeps
the same frozen email. A draft or cancelled message cannot exercise the capability.
The link remains useful independently of the document's retention; it grants only
reduced email rights. Private message bodies already contain the approved URLs;
never log either capability or include them in standard MCP summaries.

The existing suppression guards apply before preparation, acceptance and provider
submission, including SQL transaction guards. Secure preparation also refuses a
suppressed address before starting renderer work. An already uncertain provider
outcome is reconciled, never automatically resent. An external submission already
in progress cannot be recalled by a preference change.

## Failure, recovery and maintenance

Invalid tokens, drafts and cancelled messages return the same unavailable response
without exposing addresses or document titles. GET is read-only/405 at the API;
foreign origins and malformed/oversized bodies are refused. A failed POST stays on
the page with retry/reopen recovery. Repeating an accepted action creates no second
receipt. To investigate an accidental block, use authenticated support and the
recorded suppression; no sender tool or mailbox link silently restores permission.

The shared footer is frozen before provider transport; no provider key, service,
external alert or extra email is created by this feature. Operators can correlate
`recipient.email_unsubscribed`/`recipient.email_reported` audit actions to their
workspace dispatch without publishing recipient data. Keep provider complaints,
mailbox-link reports and delivery evidence distinct.

Web provides confirmation and lifecycle labels. REST/MCP expose scoped status;
they do not expose a recipient action tool. Native clients may open the received
browser link; native composer/status UI is not newly qualified. Fragment routes
are declared in the public route registry but deliberately excluded from the
indexed sitemap; the root has existing FR/EN/DE/LB variants.

Tests: `secure-distribution-core.test.ts` checks scoped blocking, replay,
non-downgrade, prepared acceptance refusal, untouched document access and other
workspace isolation. `email-preferences.spec.ts` checks explicit confirmation,
no background API request, fragment cleanup and shared footer. Email runtime and
Resend fixtures check frozen sanitized content; all transport is synthetic.
Performance and visual evidence belong in `FRONTEND_PERFORMANCE.md` and
`DASHBOARD_V2.md`. Actual inbox rendering and production need separate proof.
