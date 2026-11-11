# Scheduled sending

An approver reviews a prepared fax or email in the browser and chooses when it
is accepted. This page owns the rules. Status: local source candidate of
11 November 2026 (release 1.1.38); it requires CI, staging and publication
evidence, and the production fax renewal path has no automated test yet.

## What the approver consents to

Scheduling is an approval. The `scheduled_releases` row (migration
`0081_scheduled_releases.sql`) records who consented, when, for which dispatch
and which reviewed version (`fingerprint`). That version fixes the PDF,
recipient, sender, message, options and spending ceiling. The ceiling is the
cost bound the approver accepts, as for any fax approval ("I accept variable
usage, up to …"): the reservation made at acceptance equals the ceiling.

Only an individual fax or email can be scheduled. Postal letters bind an exact
quoted price and transfer a draft to the printer; campaign members, secure
distributions and expert-delegated approvals keep their own paths.

## Authority

- Scheduling and cancelling: a human browser session of an Administrator or of
  a Supervisor with the approval option (`approveDispatches`), the same
  authority as an approval. Operators, Observers, assistants, REST OAuth and the
  native applications cannot.
- Reading the schedule of a dispatch: anyone who may read that dispatch, in the
  browser.
- The release time is between five minutes and thirty days ahead. One open
  schedule per dispatch.

## Release

The existing one-minute scheduled handler releases at most ten due schedules
per tick, before the outbox is published so a released dispatch leaves in the
same tick:

1. The schedule is claimed (`scheduled` → `releasing`).
2. The approver's current membership must still allow approval; otherwise the
   release is refused with `APPROVER_NOT_AUTHORIZED`.
3. A dispatch that is no longer awaiting approval (cancelled, approved and sent
   by hand) closes the schedule as `cancelled` (`DISPATCH_NOT_PREPARED`).
4. A valid quote keeps the reviewed dispatch. An expired production fax quote
   is renewed with the existing renewal, which refuses any change of PDF,
   recipient, sender or ceiling; a renewed quote whose high estimate exceeds the
   ceiling is refused (`QUOTE_ABOVE_CEILING`) and the renewal stays for a
   person to review. Any other expired quote is refused (`QUOTE_EXPIRED`).
5. The scheduler writes an ordinary browser approval for the version being
   accepted, by the approver, with `approvals.scheduled_release_id` naming the
   schedule, then runs the usual atomic acceptance (approval, channel, quota,
   reservation and outbox triggers all apply).
6. A refused acceptance withdraws that approval. A refusal is final. An
   unexpected failure marks the schedule `uncertain`; it is never retried
   automatically, and the dispatch page asks a person to check it.

Every step is in the audit log: `dispatch.scheduled`,
`dispatch.schedule_cancelled`, `dispatch.schedule_released`,
`dispatch.schedule_refused` and `dispatch.schedule_uncertain`. Customer
webhooks report the resulting status changes like any other.

## Interface

On a fax or email awaiting approval, the approval panel offers "Send later"
under the approve button: the same consent boxes, a local date and time, and
"Approve and schedule". The dispatch page then shows when it leaves and who
scheduled it, with "Cancel the schedule" for approvers, and explains a refused
or uncertain release.

## API

- `GET /api/dispatches/:id/schedule` → `{schedule}` (latest, or `null`).
- `POST /api/dispatches/:id/schedule` with strict
  `{fingerprint, releaseAt, recipientRequested?}` → `201 {schedule}`; refusals:
  `403 FORBIDDEN`, `403 HUMAN_APPROVAL_REQUIRED`, `409 SCHEDULE_UNSUPPORTED`,
  `409 INVALID_STATE`, `409 VERSION_CHANGED`, `400 SCHEDULE_OUT_OF_RANGE`,
  `409 ALREADY_SCHEDULED`.
- `DELETE /api/dispatches/:id/schedule` → `{schedule}` or `409 NOT_SCHEDULED`.

## Evidence

`tests/integration/workspace-roles.test.ts` covers role refusals, the time
window, version mismatch, duplicate schedules, tenant isolation, a single
release at its time with the approval naming the schedule, refusal after the
approver loses approval rights, and cancellation of the schedule or of the
dispatch. The production fax renewal branch (step 4) is exercised by the
existing renewal tests only, not through a scheduled release.
