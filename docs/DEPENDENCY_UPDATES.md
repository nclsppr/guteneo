# Dependency updates and application redelivery

## Diagnosis on 29 October 2026

The first weekly Dependabot batch exposed separate failures; they are not failed
production releases. Keep the original runs and qualify each corrected revision.

| Pull request                                       | Observed failure                                                                                                                                | Correction                                                                                                                                                     |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [103](https://github.com/nclsppr/guteneo/pull/103) | Installation rejects MCP client/server 2.4.0 and legacy SDK 1.32.2 because Agents 0.30.1 requires exact peers 2.3.1 and 1.32.1.                 | Hold all three unsupported SDK versions until a reviewed Agents/SDK train supports them. Grouping cannot override peer constraints.                            |
| [104](https://github.com/nclsppr/guteneo/pull/104) | New Miniflare no longer matches the old version-qualified override and reintroduces vulnerable Undici. The high-severity audit correctly fails. | Keep patched Undici effective for supported Miniflare updates; retain the audit.                                                                               |
| [105](https://github.com/nclsppr/guteneo/pull/105) | Nested manifests are treated as feature changes requiring product documentation.                                                                | Exclude exact package/lock filenames from feature classification. Source/workflow edits retain normal documentation requirements. Print actual findings in CI. |
| [109](https://github.com/nclsppr/guteneo/pull/109) | PDFme schemas 6.2.8 imports `parseFont`, absent from the retained transitive PDF library.                                                       | Make the existing PDF library explicit; group the family. Hold engine upgrades for compatibility review because stored templates declare engine 6.1.13.        |
| [111](https://github.com/nclsppr/guteneo/pull/111) | TypeScript 7 conflicts with typescript-eslint's supported range below 6.1.0.                                                                    | Routine version updates remain minor/patch; major toolchain changes require coordinated migration.                                                             |

The scanner, PDF-validator and engineering TypeScript major proposals also need
their own compiler/tooling qualification. A successful dependency-update generator
does not mean its proposed application passes CI.

## Routine maintenance policy

`.github/dependabot.yml` checks all four npm packages and workflow actions weekly.
MCP, Cloudflare and PDFme are separate coupled families. The minor/patch catchall
excludes them; separate security groups retain these same family boundaries.
A seven-day cooldown lets new routine releases settle without delaying security
updates. Routine npm version updates permit minor and patch changes;
security updates remain eligible for major versions under that `allow` rule.
See [GitHub's option contract](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference#update-types-allow).

Explicit MCP and PDFme `ignore` ranges represent current compatibility constraints.
They also affect automated security fixes, as documented by
[GitHub](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/manage-your-dependency-security/controlling-dependencies-updated#ignoring-specific-dependencies).
Keep alerts and the high/critical npm audit enabled. A security advisory in a held
family requires a reviewed compatibility migration and removal of the relevant
hold; the hold is not evidence that the old version is safe. Never use
`--force`, `--legacy-peer-deps`, skipped suites or weaker audit thresholds to make
an unsupported update appear successful.

Update Agents and all three exact SDK peer pins together. For PDFme, review stored
envelope compatibility, the declared engine version and all family packages
before removing holds. For TypeScript, qualify the compiler, linter and each
independently locked application together. No configuration can promise that
every future upstream release is compatible; full CI decides eligibility.

## Automatic application release after a dependency merge

The separate `dependency-release.yml` workflow listens for completed
`Guteneo checks` runs. It qualifies only successful `push` runs on current `main`,
with all required jobs successful, including aggregate evidence verification and
scanner tests. It verifies a genuinely merged Dependabot PR and restricts its
files to the four maintained projects' dependency manifests. SHA-pinned manifest
comparison permits only existing dependency version changes; scripts, engines,
overrides, package identity and other configuration must remain unchanged. A root package change makes application release
eligible. Service-only and workflow-action updates do not publish the application;
service releases retain separate qualification procedures. No pull-request source
executes with production release credentials.

MCP dependency changes in `agents` or `@modelcontextprotocol/*`, including
lockfile-only changes, return an explicit synchronization-required result instead
of automatic publication. They require the reviewed shared application/plugin
version and rebuilt archive under [LLM_SETUP.md](LLM_SETUP.md#mandatory-mcp-plugin-and-archive-synchronization).
The current integration fingerprint checks local MCP sources and shared version;
it does not itself detect external SDK dependency changes. Full green CI alone
therefore cannot authorize the ordinary dependency-release path for this family.

Only `CLOUDFLARE_APP_RELEASE_API_TOKEN` authorizes application publication.
Use a dedicated least-privilege token for the existing application and asset
upload; never reuse the scanner-maintenance token or a personal OAuth session.
Missing credentials leave release visibly inactive. Creating or installing that
credential is a separate operator step. On 29 October, after explicit operator
authorization, `guteneo-app-release-github` was created with Workers Scripts Edit
for the selected account and Workers Routes Edit plus Zone Read for `guteneo.com`
only. It expires on 27 January 2027. GitHub confirmed the dedicated Actions secret
at `2026-10-29T03:15:18Z`; no secret value was logged or committed. This verifies
creation and storage, not successful hosted publication with that credential.
Renew before expiry; authentication failure must stop redelivery. The scanner
credential remains separate.

Eligible releases are serialized without cancelling a publication already in
progress. The workflow rechecks current-main provenance, then calls existing
`npm run deploy:live` from a clean `main` checkout. That command fetches fresh
`origin/main`, rebuilds, checks exact source/asset fingerprints and verifies the
canonical served release. Verification evidence is retained. Failed tests,
superseded commits, uncertain metadata or failed public verification block success.
There is no automatic merge, test retry, provider send, schema migration or
rollback. Inspect failed publication before another release attempt.

Application manifests identify the exact source commit even when the product
version does not change. Plugin instructions, OAuth registrations, provider
configuration and private service publication retain their own gates. Read
[MAIN_RELEASE.md](MAIN_RELEASE.md) for publication requirements and [CI.md](CI.md)
for test inventory and immutable artifact verification.

## Qualification boundary

Local regression tests use synthetic GitHub metadata and intercepted release
operations. They prove eligibility/refusal behavior, not GitHub credentials,
Cloudflare publication, real Auth0 login or business delivery. The correction
still needs full exact-source PR CI, authorized merge, merged-main CI and the
first verified hosted dependency release before
it can be described as operational automatic redelivery.

Local qualification on 29 October: 149 Vitest files with 3,161 passed assertions
and 474 Node security tests passed. Subsequent hardening passed its focused
regressions separately. Typecheck, lint, generated documentation, actual Chromium
rendering and build/dry-run evidence remain local; hosted PR CI is separate.

## Qualified main proof reuse

The canonical main workflow may complete through the strict identical-source PR
proof route defined in [CI.md](CI.md#validate-once-and-qualify-an-identical-main-merge).
The release selector still requires that exact current-main run and its successful
`qualification`, fresh `dependencies`, `scanner` and `verify` gates. It accepts only
the exact canonical skipped-family pattern in that mode; arbitrary skipped,
foreign, cancelled or failed work remains refused. Evidence records `validationMode`
as `full` or `reused`. The first CI-policy/toolchain change falls back to full;
actual hosted reuse and a genuine subsequent Dependabot release remain separate
qualification observations. Merge, publication and credentials retain their
existing boundaries.
