# Postal status after network handover

Published on 17 September 2026 from
`44d1d5bb64418372c5174faa1ce5601681fcc813`, without migration or send activation.
Publication/CI proof is separate from local acceptance below; this change does
not qualify any real letter.

Signed Pingen `webhook_sent` produces `handed_to_post`; postal handover is not
delivery. Previously, shared `failed` ranked below handover: an
`webhook_undeliverable` could be retained and marked applied without showing failure,
and a late `sent` event could replace that failure.

Postal failure now outranks `printed` and `handed_to_post`, while explicit
`delivered` retains priority. Arrival order, concurrency and replay cannot restore
handover after non-delivery. Fax/email rules and signature/organization checks are
unchanged. Contradictory events do not erase journaled facts.

Postage already incurred remains consumed. This change refunds nothing, recreates
no reservation and submits nothing again. Refund evidence would need separate
financial processing outside this change.

## Local evidence

The three new postal scenarios failed before the fix with `handed_to_post` instead
of `failed`. Afterwards, **57 tests in three files passed in 43.42 seconds**:
welcome credit, business invariants and provider notifications. Postal cases use
HMAC-signed bodies through HTTP reception, durable receipt and real local D1
projection: normal/reversed order, concurrency, replay and a distinct late event.
They check one submission, 302 cents remaining consumed, one fractional debit and
explicit delivery retaining priority. Fax/email are checked in both delivery/failure orders.

Typecheck, focused lint and `git diff --check` passed. Separate reports:
`reports/postal-status-before.json` and `reports/postal-status-after.json` in the
correction worktree. No provider account, real letter or remote database was used.

## Publication evidence

[PR CI 35180968830](https://github.com/nclsppr/guteneo/actions/runs/35180968830) and
[push CI 35180966623](https://github.com/nclsppr/guteneo/actions/runs/35180966623)
both passed first attempt on this exact source: 675 Vitest tests in 41 files,
78 security tests, six Worker tests, eight scanner Python tests, 75 application
browser cases with three intentional exclusions and 30 preview cases with four
intentional exclusions. [TEST_RESULTS.md](TEST_RESULTS.md) links reports and logs.

`reports/published-44d1d5b-release-proof.json` records publication at 04:22:44 UTC,
Worker `bb332483-fd95-4b72-9b19-f967fbe492e0`, 100% application traffic. All 56
public assets matched on the then-canonical and fallback hosts; `/api/health`
returned production HTTP 200 with `liveSending:false`. Signed scenarios remain
local fixtures: publication proves no Pingen-originated notification, postage or
real delivery. The [current origin contract](MAIN_RELEASE.md) supersedes that
historical two-host arrangement.

The correction affects new projections. Historical events already marked applied
are not automatically rewritten; reconciliation must be explicit and preserve
financial history.
