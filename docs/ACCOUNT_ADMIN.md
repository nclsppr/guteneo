# Account and organization administration

Implemented on 2026-09-16 in `apps/api/src/account.ts`, `apps/web/src/account-page.tsx` and migration `0011_account.sql`. This module manages authenticated Guteneo accounts and existing memberships. It does not create a universal operator role, send invitations, modify identity-provider credentials or claim external OAuth grant revocation.

## Routes

Mount `handleAccountRoute(request, env)` before the generic `/api/*` bearer middleware. It returns `null` for unrelated routes. It authenticates its own browser session, rejects bearer authorization, checks exact Origin and CSRF on every mutation, applies the shared organization request budget and sets `Cache-Control: no-store`.

| Route                                           | Rights                                       | Result                                                                                                                                                                                                                                  |
| ----------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/account`                              | Browser membership                           | Own profile name, current workspace name and role, MFA/simulation and administrative permissions. No email, token or secret.                                                                                                            |
| `PATCH /api/account`                            | Browser membership; admin for workspace name | Strict `{userName?, organizationName?}`. Names are trimmed, limited to 120 characters and refuse control characters. The user name is global to that user's workspaces; the workspace name affects only the authenticated organization. |
| `GET /api/account/sessions`                     | Browser membership                           | Own active sessions in the current organization: independent opaque ID, creation/expiry, MFA/development flags and whether it is the current session. Maximum 100, `hasMore` signals truncation.                                        |
| `DELETE /api/account/sessions/:id`              | Same user and organization                   | Revokes that local browser session; `currentSession` tells the UI to refresh authentication.                                                                                                                                            |
| `GET /api/admin/members`                        | Current organization admin                   | Paginated names, roles, join dates and active session/assistant counts; `limit` 1–50 and cursor by user ID.                                                                                                                             |
| `PATCH /api/admin/members/:userId`              | Current organization admin                   | Strict role: admin, member or viewer. Updates the role and revokes that member’s browser/assistant access atomically. Same-role requests are no-ops.                                                                                    |
| `POST /api/admin/members/:userId/revoke-access` | Current organization admin                   | Empty JSON body. Revokes access within this organization without deleting membership; the person can sign in again.                                                                                                                     |

Names, organizations, roles and user IDs cannot be injected through undeclared input fields. User and organization always come from authenticated membership. JSON mutation bodies are bounded to 4 KiB while reading.

## Concurrency and audit

Every mutation uses a D1 batch transaction. Its first statement writes a unique audit marker only if the current browser session is still active and the current membership still has the required role. Changes and revocations require that marker inside the same transaction. Consequently an administrator demoted or disconnected after the initial HTTP authentication cannot reuse stale authority to modify another member.

SQL triggers reject demotion or deletion of the last administrator. The check is serialized with the write, including simultaneous demotions from two separate administrator sessions. A rejected role change rolls back both its audit marker and every planned revocation. New test fixtures that demote their sole administrator must first add a second administrator; production guards are not relaxed for simulation.

Changing a role or explicitly disconnecting a member deletes their browser sessions and local development tokens in the current organization, and marks their authorized assistant connections revoked. Other organizations are unaffected. Existing Auth0 consent/refresh credentials are not claimed revoked at the provider. Membership remains; the member can enter a new hosted login, and the configured authentication policy is enforced again. The Auth0 Free beta requires persisted verified-account evidence for every role; real MFA remains informative. The default legacy policy still enforces admin MFA.

Audit details contain field names, the resulting role or an empty object, never names, emails, session secrets, CSRF values, recipients or document contents. Independent public session IDs are generated by a database trigger on new browser sessions and backfilled by migration. Token hashes never appear in account responses or audit entries.

## UI integration

`Account({session,onUpdated})` is the account page. `TeamAdmin({session,onUpdated})` is a section that can be placed inside the existing administration page. Both reuse Guteneo's styles, native labelled controls, table semantics, local error messages and status announcements. `onUpdated` refreshes `/api/session`; a 401 clears the frontend session after self-revocation or self-demotion.

The public static preview renders an explanatory unavailable state and issues no account/member requests. The live browser UI changes names, enumerates sessions, changes roles and disconnects members. This is not an invitation workflow and no email is sent.

## Validation and remaining limits

`npx vitest run tests/unit/account.test.ts` exercises actual migrations and D1: profile rights/strict schemas, browser-only origin/CSRF controls, pagination/isolation, independent session references, cross-tenant revocation, the distinction between disconnecting and removing membership, last-admin rollback, simultaneous demotions, authority revoked between authentication and commit, and legacy-policy MFA/development-session refusal. Verified-account policy tests are maintained with the authentication tests; changing policies does not turn an old session into verified evidence.

These are local service tests, not proof of a real Auth0 account or a hosted browser release. Apply migration 0011 before deploying these routes. The integrated local browser suite passed 30 cases across desktop Chromium, mobile Chromium and iPhone WebKit. The six public-preview cases also cover account/billing routes without network access. Invitations, membership removal, multi-workspace switching and identity-provider security management are separate increments.
