# Shared clarity and recovery controls

This document records the remaining shared B1 work from the 9 November 2026 UX
and page-design audits, resumed on current main. It is a local implementation
candidate; production activation, hosted CI and physical-device qualification
remain separate.

## Error presentation

`ErrorNotice` retains its code-specific authentication, quote, postal, email and
document-recovery mappings. For any other `ApiError`, only an exact reviewed
message in the active locale projection may become its explanatory paragraph.
Unknown server messages receive the existing translated generic heading. Their
response text is not shown, even inside Details; the symbolic error code remains
in the closed support disclosure. An existing explicit read/retry action stays
available without an automatic request or a claim that a write did not happen.

The lookup uses the already loaded active-language projection, including its
string table because identity translations are omitted from the compact index.
It does not import every source catalogue. Local `Error` validation keeps its
existing translated, possibly interpolated field message. This distinction
preserves useful sheet/row validation while withholding unreviewed server bodies.
It changes no API contract, permission, tenant scope, content, approval or cost.

## Loading states

The shared `Loading` component has `page`, `table`, `form` and `document` shapes.
Decorative blocks stay outside the accessibility tree; the existing translated
loading status remains available. Table rows collapse on narrow screens, field
shapes reserve control space, document shapes reserve page space, and reduced
motion disables the opacity animation. Callers can choose a shape without adding
data reads, a dependency or a second loading controller.

These placeholders indicate pending presentation only. They do not establish
session authority or business readiness and cannot expose interactive controls.
There is no measured latency improvement claim for changing the placeholders.
The [frontend performance record](FRONTEND_PERFORMANCE.md) owns actual loading
measurements and environment limits.

## Consequential actions

Saved-recipient deletion, scheduled-dispatch cancellation and customer-webhook
secret replacement/revocation use shared inline `ConfirmAction`. The first
gesture opens the question; only the explicit confirmation invokes the existing
`useAction` controller and revision-bound API request. Dismissal or Escape sends
nothing and returns focus to the trigger. Existing current-view, authority,
unknown-result and private-secret guards remain mandatory.

The current membership permissions remain those in the [role matrix](WORKSPACE_ROLES.md).
The [recipient contract](ARCHITECTURE.md#lifecycle-experience-boundaries--9-november-2026-candidate), [schedule contract](SCHEDULED_DISPATCHES.md)
and [callback contract](CUSTOMER_WEBHOOKS.md) own the business journeys. Native,
REST and MCP surfaces receive no new action or authority from these web controls.

Unsaved template edits, per-record corrections, distribution preparation and
schedule creation use the shared localized navigation dialog. The router still
vetoes departure synchronously and restores its accepted address before showing
the question. Escape or Cancel preserves the draft and its current action. The
safe cancellation button receives initial focus; dismissal returns to the
connected visible trigger or the current main content. Native `beforeunload`
remains responsible for browser-tab close and full-document departure.

Discard resumes only the captured source/destination under the same authority,
navigation revision and editor scope. Its bypass is consumed once by the actual
router event. A later intent cannot replace the displayed first intent, borrow
its decision, or revive an abandoned action. Authority replacement, accepted
navigation, scope changes and unmount invalidate pending decisions. A real saved,
generated or prepared receipt permits its existing onward navigation without
another discard question; the dialog never invents that receipt.

Workspace changes collect deferred confirmation decisions without cancelling
the preflight event, so an independent synchronous veto always wins. App-level
switch exclusion prevents concurrent attempts; after the decision it rechecks
the initiating authority, address and navigation revision before the existing
membership-switch request. A cancelled switch makes no request and does not
abandon the current view. The local fictional-scenario control uses the same
preflight. No question or answer grants business consent, approves spending,
retries a write or changes browser/server authentication.

## Calendar and event time

[The application clock policy](APPLICATION_TIME.md) owns the shared UTC display,
calendar/filter boundaries, exports and entered instants across all five apps.
The frame declares this context once; nested table and document notes reuse it.
Financial day grouping retains its established basis, and no selectable timezone
preference is advertised.

## Qualification

`tests/unit/clarity-foundation.test.ts` covers reviewed server-message fallback,
unreviewed response suppression, mapped recovery precedence, interpolated local
validation and loading accessibility in four languages. The existing
`server-message-translations` suite continues to cover maintained server copy.
The schedule, recipient and webhook browser journeys assert that the first
gesture performs no mutation and final confirmation keeps exact revision-bound
requests. Final execution results belong to the overall reprise acceptance
record; authored tests alone are not execution proof.

`tests/unit/navigation-confirmation.test.ts` qualifies exact one-use route
resume, independent vetoes, concurrent workspace decisions, cancellation and
authority/revision/scope/address replacement. Together with the existing client
foundation tests, the focused local run passes 25/25. Updated browser journeys
exercise translated dirty editors, Escape/focus recovery, browser Back/Forward,
workspace-switch deferral and schedule-cap preservation. Their execution remains
separate from these pure-controller results.

Sources: `apps/web/src/components.tsx`, `styles-workspace.css`,
`recipient-pages.tsx`, `schedule-pages.tsx` and `customer-webhooks-page.tsx`.
Navigation sources: `client-navigation.ts`, `navigation-confirmation-state.ts`,
`navigation-confirmation.tsx`, `navigation-confirmation.css`, the workspace-switch
preflight in `App.tsx`, and the Studio/distribution/schedule editor call sites.
