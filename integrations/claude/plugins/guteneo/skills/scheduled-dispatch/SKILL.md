---
name: scheduled-dispatch
description: Prepare, inspect or cancel an explicitly requested future Guteneo fax or message-only email with a fixed spending cap. Future spending approval is always a separate human browser action.
---

Before using this skill, read the [Claude host contract](../../references/claude-host.md). Use the connected Guteneo tools and preserve the host’s permission prompts.

# Scheduled dispatch

Installation, chat agreement, an expert mandate and a host confirmation do not
create future spending authority. No assistant tool can approve a schedule,
extend its cap/window or activate the default-off automatic release service.
Use only currently exposed tools and the connected account's actual authority.
Preserve the content exclusions and original-file rules of `fax-pdf` or `email`.

1. Read `get_capabilities`. Scheduling supports ordinary fax and message-only
   email. Postal mail, PDF email, protected links and secure distribution retain
   their existing contemporaneous review, authentication and transfer controls.
   Explain an unsupported channel instead of replacing its delivery mode.
2. Obtain the intended exact recipient/content/sender/options, an unambiguous
   future instant with time zone, and the maximum total cost in EUR cents.
   Reuse values already provided. Ask for a missing cap or ambiguous time;
   never choose future spending authority on the person's behalf.
3. Prepare the ordinary dispatch without approving or sending it. Reuse its
   existing ID after uncertainty. For that exact source, call
   `prepare_dispatch_schedule` with `dispatchId`, ISO `executeAt`, integer
   `maxTotalMinor` and one stable `idempotencyKey`. The allowed horizon is one
   minute to 30 days. Creating a schedule holds the original immediate
   acceptance path but grants no spending approval.
4. Present the returned existing schedule and its browser review address
   `https://guteneo.com/#/app/schedules/{id}`. The human reviews the frozen source,
   cap and 15-minute acceptance window, then separately approves future spending
   in their authenticated browser. Required email-recipient attestation also
   belongs to that human action. A disabled release capability leaves a draft
   and cannot be enabled by the assistant.
5. Use `get_dispatch_schedule` or `list_dispatch_schedules` for status. At release,
   the server needs a fresh quote within the cap, current preparer/approver and
   source authority, ready provider/funding and atomic quota/outbox acceptance.
   The acceptance window does not promise provider invocation or delivery at
   that time. A released schedule links its ordinary dispatch for tracking.
6. Cancel only an explicitly selected schedule with
   `cancel_dispatch_schedule({scheduleId,expectedRevision})`. This revokes future
   authority before acceptance; an accepted command follows ordinary dispatch
   cancellation/reconciliation. Cancelling never restores the original source
   for immediate sending automatically.

After a lost response, read the same schedule and preserve its key. Never invent
a release command, approve it through ordinary tools, or retry an unknown
provider outcome. A terminal blocked/cancelled schedule exposes `canReschedule`
only when its exact source and all prior release preparations are known unsent.
A new schedule then needs an explicit new time/cap request and a fresh human
browser approval; no earlier grant carries forward. Authority loss and regrant
cannot revive old future approval.
