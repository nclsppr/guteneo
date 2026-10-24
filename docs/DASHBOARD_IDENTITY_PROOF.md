# Dashboard, identity and member integration — 9 October 2026

Candidate based on `619c8b4` (main), integrating Belvédère `a8ac638`.
The primary checkout and unrelated work are preserved. Administrative merge
is explicitly authorized; production and activation are not.

## Executed local evidence

| Check | Result |
| --- | --- |
| `npm ci` installation | Passed; locked versions unchanged |
| TypeScript, ESLint and `git diff --check` | Passed on final candidate |
| Technical feature map, permission matrix/journeys | Regenerated and checked |
| Migrations | 52 migrations, 362 objects, equivalent schema, `quickCheck: ok`, zero FK violations |
| Full local suite | 1,920 application and 242 security tests passed before telemetry fixes; final SHA checked in CI |
| Authentication, account, Belvédère/finance | 92 tests passed, including actual Horizon-debit D1 triggers and six telemetry regressions |
| Identity/profile/contacts/namesakes | 30 browser tests passed, three projects, four languages |
| Dashboard/account/billing/role regression | 75 passed, 3 intentional desktop skips |
| Belvédère navigation/finance | 20 passed on desktop and iPhone WebKit |
| Application build + Worker dry-run | Passed; no Worker published |
| Preview build | Passed; no publication |
| Public preview | First run: 145 passed, 6 skips, one unstable header measurement before fonts loaded. Font waiting added; all 6 iPhone navigation/language scenarios then pass. CI reruns the full suite. |

Thirty new scenarios cover persistent identity, saved profile/locale, read-only
email, independently configured supervisor options, contacts/rights, namesakes,
error/recovery, workspace switching, account switching in another active tab
and malformed contacts without profile loss. Every call is intercepted:
these are interface tests with fictional people, not hosted Auth0 qualification.
Backend tests exercise actual session, membership and D1 guards.

Belvédère finance includes Horizon debits by posting date, separately from
dispatch channels and without adding them to dispatch counts. Operational
overview/workspace views retain their period-created dispatch cohort. The
new Horizon index bounds debit-read cost. Session rereads on tab return
without periodic polling; focus/visibility events are deduplicated for one
second.

All 117 combined identity/language/assistant-guide/delegation scenarios pass
across three projects after contact-fixture correction. Consent/mutation
assertions are preserved. Malformed contact responses display a recoverable
local error and leave profile editing available.

Candidate `c645aba` passed complete CI `37906035678`: 561 application,
146 preview and 20 Belvédère scenarios with intentional skips and a successful
final completeness check. Telemetry fixes pass 92 combined tests: observation
failure without MCP/login/rotation refusal, deduplication/concurrency/TTL/
isolation and new-session/country/current-workspace behavior. Signed evidence
and old-cookie invalidation are verified; role/revocation checks stay current.
New CI is required on the exact fixes SHA.

PR 54 merged into `820b51c` after complete CI `37909805642` passed on `9ebbe18`:
1,926 application tests in 102 files, 242 security tests, 561 application,
146 preview and 20 Belvédère scenarios. Main CI `37912466748` passed eleven
jobs preceding final collection, but iPhone exceeded its total fifteen-minute
budget: 187 application and 76 preview tests had passed; ten Belvédère tests
could not start. GitHub annotation confirms that duration limit. Browser
budget becomes thirty minutes for checkout, installation and all suites,
without changing internal timeouts, assertions or coverage. The corrective
PR/main CI after merge provide complete evidence on exact SHAs.

The first corrective run `37914891327` on `2fbdac3`, still capped at twenty
minutes, measured ten minutes twenty-one seconds installing WebKit dependencies.
All 187 iPhone application tests then pass, but preview stops at 25 of 76
scenarios and Belvédère remains skipped. The same mobile Chromium CI reaches
postal-setup assertions, then screenshotting fails with
`Page.captureScreenshot: Unable to capture screenshot`; the other 186 tests
pass. These incomplete results remain separate from green runs. The
thirty-minute budget accounts for observed slow installation; screenshotting
keeps a required image and retries only that transient error, at most three
times. Security installs the same Chromium/WebKit dependencies; its budget
becomes twenty minutes for the same mirror before security tests. All 36
postal-setup scenarios pass with this screenshot behavior on desktop Chromium,
mobile Chromium and iPhone WebKit. TypeScript, ESLint, YAML/TypeScript formatting
and feature-map checks also pass on the correction.

Run `37921928774` on `ba6890a` confirms budget alone does not fix throughput:
APT receives 116 MB in 23 min 15 s (83.4 kB/s) from Azure; WebKit installation
takes 23 min 43 s. GitHub then interrupts iPhone at thirty minutes during
the application suite. Eleven other preceding jobs pass, but the result
remains incomplete. The fix prefers HTTPS Canonical archives already present
in GitHub's mirrorlist and retains Azure as fallback, changing only its
priority from 1 to 4 before Playwright installations. It verifies the active
reference and three expected entries, rejects unknown configuration without
mutation and rewrites nothing on a second run. Suites, signing keys and
sandbox remain unchanged. This follows the
[official GitHub mirrorlist](https://github.com/actions/runner-images/blob/c74a28e5f8943ae6a39cac7c3701dd6bd0a2ea51/images/ubuntu/scripts/build/configure-apt-sources.sh)
and [APT's documented selection order](https://manpages.debian.org/bookworm/apt/apt-transport-mirror.1.en.html#Fallback_order_for_mirrors).
Throughput improvement/completeness require new CI on the exact SHA.
Eighteen targeted checks pass on in-memory fixtures: deb822/legacy sources
with options, comment, disabled source, similar URI, duplicate, unexpected
priority, unknown URI, missing source, CRLF, idempotence, alternative disable
values and ambiguous Enabled field. They modify no system file and contact
no mirror.

## Merge and limits

The attached PR contains full-check results for its exact SHA and merge state.
Main CI must also be checked after merge. Older Belvédère evidence remains
historical and does not qualify this integration.

CI `37903261816` interrupted checks/fourth shard after ten minutes: repository
download, FFmpeg installation and sequential suites consumed the job budget.
Those jobs become twenty minutes; collection/verification becomes ten.
Internal test timeouts, discovered files and evidence requirements stay
unchanged.

Fictional captures reviewed outside the repository: `/tmp/guteneo-identity-ui/`;
results: `test-results/identity-final2/`; execution logs:
`/tmp/guteneo-identity-*.log`. They contain synthetic scenarios only.

No deployment, remote migration, Auth0/Cloudflare configuration, real dispatch,
paid provisioning or mandate activation occurs. Migration 0052 must precede
new-backend publication: it also holds signed Auth0 identity evidence required
at callback even with Belvédère disabled. Belvédère requires private server
configuration and a newly verified login for hosted qualification. Web contacts
add neither native/MCP directory nor workspace role. Hosted Auth0/social-provider
connections remain unqualified; Switch account requests reauthentication
without promising account selection at every provider. See
[Auth0 limits](https://auth0.com/docs/authenticate/login/max-age-reauthentication).
