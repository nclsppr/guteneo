# Application timezone

The five browser applications use **UTC** as one explicit time context. This is
the application policy for every user, not a saved IANA timezone preference.
Studio, Correspondence, My documents, Administration and Belvédère use it for
displayed instants, date filters, calendar-day labels, report buckets, exports and
date/time entry. The interface declares UTC once in the application frame.

[`APPLICATION_TIME_ZONE`](../packages/contracts/src/application-time.ts) owns the
policy. Shared calendar helpers keep inclusive date-only filters mapped to the
existing half-open interval from UTC midnight on `from` through UTC midnight
after `to`. The backend accepts absent or explicitly `UTC` `timeZone`/`timezone`
query declarations; another value, including a conflicting duplicate, fails with
the existing `INVALID_FILTERS` recovery. It never labels a locally interpreted
range as UTC. Browser `datetime-local` controls interpret their wall-clock fields
in this declared UTC context and serialize an explicit `Z` instant; the host
timezone cannot silently shift scheduling or mandate deadlines.

This correction aligns previously browser-local row timestamps with the UTC
report filters and calendar buckets. It does not regroup financial history,
change the ledger posting/confirmation basis, round a monetary value, change an
expiry or grant new approval authority. Regional daylight-saving changes do not
change a UTC calendar day's 24-hour duration. Date-only labels remain calendar
dates rather than being shifted through the device timezone.

The policy applies to the five browser applications and their report exports.
It does not rewrite user document/message content, stored absolute instants,
provider records, native device presentation, or the separate recipient-facing
notification-copy contracts. No account field, migration or selectable timezone
is advertised. A future IANA preference requires a separate contract covering
profile/session propagation, local-day filtering and DST-aware report buckets,
exports, entered instants and provider-report boundaries together.

`tests/unit/application-time.test.ts` covers the fixed policy, invalid dates,
reversed ranges, conflicting declarations, both report parsers and EU/US DST
transition days. It also checks default filters under four different host
timezones. Existing Administration export and financial-report suites retain
their original immutable-ledger assertions. The current execution record owns
actual test results and deployed evidence; authored coverage is not proof of a
production publication.
