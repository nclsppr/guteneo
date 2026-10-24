# Production browser observations

The `.github/workflows/production-e2e.yml` candidate runs an observation every
six hours, at minute 17, on `main`. Manual execution is available on that same
branch. GitHub scheduling may be delayed; it does not replace the existing
Cloudflare collector that runs every fifteen minutes.

Source implementation does not prove a GitHub execution, migration installation,
or deployed Worker. A local run installs no secrets, accounts, or paid
infrastructure and publishes nothing.

## Executed scope

The `e2e` 0.21.3 framework and `@e2e-dev/web` 0.15.3 engine open seven fixed
public pages in Chromium at widths of 1440 and 390 pixels. Checks cover visible
landmarks, language, and horizontal overflow. These viewports do not qualify a
physical phone. Fourteen independent HTTP reads also check page fingerprints,
the manifest, public contracts, and expected anonymous denials.

Each report contains exactly **28 checks**. The driver reads the served version
before and after the journey. A version change during execution produces an
unknown result. Missing results never become successes.

The engine rejects HTTP mutations, authentication, external destinations, and
resources outside the fixed public page/asset list. It clicks no business
button. It triggers no email, fax, postal mail, purchase, quotation, import,
hosted scan, or paid rendering. Telemetry and models are disabled. No screenshot,
video, or trace is requested. Raw framework evidence is ephemeral and deleted
before publication; only the strictly sanitized report enters the GitHub artifact.

For a one-off public observation without publication:

```sh
E2E_TELEMETRY_DISABLED=1 npx --no-install e2e-web install chromium
E2E_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1 node --import tsx scripts/production-e2e.ts
```

The local `test-results/production-e2e/sanitized-report.json` explicitly records
`execution: local_read_only_observation` and invents no GitHub run identifier.
It does not satisfy the signed ingestion contract.

## Repository authority and report integrity

`POST https://status.guteneo.com/api/e2e-reports` accepts only signed GitHub OIDC
proof, never a shared Cloudflare secret. Its policy requires:

- Issuer `https://token.actions.githubusercontent.com`, RS256 signatures, and
  GitHub public keys obtained from a fixed address.
- Repository `nclsppr/guteneo`, numeric ID **1373468624**, owner **9432084**.
- Workflow `.github/workflows/production-e2e.yml` on `refs/heads/main`.
- Event `schedule` or `workflow_dispatch`, running on a GitHub-hosted runner.
- Workflow SHA, runner SHA, run identifier, and attempt matching the report.
- A recent JWT and an observation bounded to ten minutes.

The audience includes the exact body's SHA-256, binding its nonce, results,
served version, and attempt. Changing any value after JWT issuance invalidates
the audience. Only one write is allowed per run/attempt; nonce and JWT identifier
are also unique. A new attempt cannot overwrite the previous failure. The schema
rejects unknown fields, missing checks, and free text. Reports admit no JWT,
account name, recipient, content, screenshot, or session state.

Policy reference: [GitHub OpenID Connect reference](https://docs.github.com/en/actions/reference/security/oidc).
Repository IDs were reread through the GitHub API on 24 October 2026.

## Public reads and retention

`GET /api/e2e-status` starts no tests. It returns the latest twenty summaries,
the latest report details, and a status limited to this scope. A report stays
fresh for eight hours. Its production SHA must match the latest Cron observation,
which must itself be less than thirty minutes old. Absence, delay, a version
change, or interrupted execution produces neutral `unknown`. An observed failure
on the current version remains `attention`.

Reports live in the separate status D1 database, through migration
`apps/status/migrations/0002_production_e2e.sql`, with 366-day retention and bounded
purging. They contain no related business event or customer document. Publication
uses the existing status deployment process and an authorized workflow merge.
Local tests perform neither action.

## Authenticated journeys

The `authenticated.status: blocked` result is independent of the 28 public checks
and the fourteen Cron probes. Dedicated test accounts, protected CI access, and
preapproved synthetic business fixtures still require qualification. The live
`verified_account` profile requires no passkey or additional MFA; their absence
is not the blocker for this suite.

An anonymous report cannot declare that authenticated cycle successful. A future
authenticated suite needs a protected job and separate evidence schema. It must
never publish JWTs, document screenshots, traces, session state, or account
details. See [production test accounts](PRODUCTION_TEST_ACCOUNTS.md) for the study.
