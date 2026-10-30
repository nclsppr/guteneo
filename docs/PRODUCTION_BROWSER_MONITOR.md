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

For these fixed destinations only, the Node driver requests
`Accept-Encoding: identity` and `Cache-Control: no-transform`. The collector still
compares received bytes and SHA-256 with the manifest: ignoring headers,
transforming a page or serving a variant cannot make a mismatch pass. No automatic
second attempt replaces a failed observation. On size/hash mismatch, CI logs
contain only a fixed public path, expected/observed sizes and hashes, and an
allowlisted encoding label. Response encoding is distinct from the decoded bytes
observed by Node. Diagnostics remain outside the unchanged signed-report schema.

The request alone cannot prevent a Cloudflare transformation. The
[compression documentation](https://developers.cloudflare.com/speed/optimization/content/compression/#content-length-header-handling)
requires `no-transform` in the **origin response**. The application candidate
therefore appends it to the existing `Cache-Control` of successful canonical
public HTML and its conditional 304 responses. It preserves other directives,
bytes, ETag, existing encodings and response framing. APIs, sessions, private
requests, JS/CSS/images/videos and fallback hosts gain no cache rule. No script
is stripped before comparison. The
[Web Analytics documentation](https://developers.cloudflare.com/web-analytics/get-started/#sites-proxied-through-cloudflare)
states that `public, no-transform` prevents automatic beacon injection and that
its EU-exclusion mode omits the beacon for European visitors. This guard requires
application publication; changing only the Node driver is insufficient. It may
also prevent CDN recompression of these HTML responses. Observe served bandwidth
and latency after publication rather than inferring a fixed bill or free use.

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
- `job_workflow_ref` and `job_workflow_sha` jointly absent in the legacy format,
  or an exact pair matching the canonical main workflow above and runner commit;
  foreign, partial, empty or null pairs are denied.
- A recent JWT and an observation bounded to ten minutes.

The audience includes the exact body's SHA-256, binding its nonce, results,
served version, and attempt. Changing any value after JWT issuance invalidates
the audience. Only one write is allowed per run/attempt; nonce and JWT identifier
are also unique. A new attempt cannot overwrite the previous failure. The schema
rejects unknown fields, missing checks, and free text. Reports admit no JWT,
account name, recipient, content, screenshot, or session state.

Policy reference: [GitHub OpenID Connect reference](https://docs.github.com/en/actions/reference/security/oidc).
Repository IDs were reread through the GitHub API on 24 October 2026.

A publication refusal remains failure. Diagnostics distinguish authorization
context, OIDC acquisition and ingestion, with an HTTP status and explicitly
allowlisted server code; every other response becomes `UNKNOWN`. Response reads
are byte-bounded and have a five-second deadline. Free-form errors, OIDC URLs,
JWTs, headers and upstream bodies are never printed. An artifact saved before
ingestion does not prove status stored the report.

Only after an actual `401 REPORT_REJECTED` may the driver emit a fixed-key OIDC
diagnostic: explicitly **unverified** boolean comparisons, followed by a closed
result from one invocation of the same verifier used by the server. GitHub public
key reads retain their five-second deadline; the complete diagnostic expires in
six seconds. It requests no new JWT, repeats no POST and changes no Worker
authority. The original rejection remains the final failure even when local
verification accepts. No claim value, JWT/JWK, URL, header, body or free-form
exception is published.

## First hosted observation — 24 October 2026

Status Worker `b0d2ed61-227c-47d3-8f09-57b0545fb568` was published from
`4f033e2f233ee2960a579eef839191531e6f8b8d`, with twenty public files and header
configuration verified. GitHub run
[`40128432279`, attempt 1](https://github.com/nclsppr/guteneo/actions/runs/40128432279)
failed overall: fourteen browser checks passed and seven HTTP page comparisons
reported `CONTENT_LENGTH_MISMATCH`, for **21/28 passing checks**. Sanitized report
SHA-256 was `ee8159896ada1b413a9e37d3c3d31bb511cba8b8da220ec47c2ca0fa167a9daf`.
Ingestion was not qualified; `latest` was null after that attempt. The exact
collector and encoding variants later passed on the Mac, which does not prove
the cause of the GitHub runner mismatch. The transport/diagnostic correction
requires a new authorized execution after review/CI; no production success is
inferred.

Local correction qualification: **117 targeted passing cases** (36 ingestion/
publication, 51 collector/history and 30 transport/privacy/deadlines), nine status
release-path cases, typecheck, scoped lint and generated atlas. A public Mac read
using the new transport passes 14/14 HTTP checks against application `4f033e2`;
it is neither another GitHub attempt nor hosted-ingestion proof. Tests also
simulate complete ingestion of an `attention` report with seven discrepancies,
using an audience bound to that exact body.

The second real observation,
[`40131421762`, attempt 1](https://github.com/nclsppr/guteneo/actions/runs/40131421762),
used runner `1d23931d37407d7fd9fcd5291cbd6dbc8e17f1ef` and application `4f033e2`.
It also failed at **21/28**: each of the seven HTML responses received as
`identity` contained exactly **367 additional bytes**. Report submission then
returned `401 REPORT_REJECTED`. Ingestion refusal is separate from the HTTP
mismatch. Automatic HTML transformation is a hypothesis consistent with the
documentation and EU/runner difference; the projection retains no HTML and cannot
identify the injected beacon on its own. The new origin guard still requires
publication and qualification from the runner. Locally, 94 asset-scope cases and
two real workerd/Static Assets cases pass, covering four languages, GET/HEAD/304,
bytes, ETag, existing directives and unchanged private/API cache boundaries.

An isolated branch GitHub diagnostic, run
[`40132056947`](https://github.com/nclsppr/guteneo/actions/runs/40132056947), then
verified the signature and bounded direct-job JWT predicates: `job_workflow_ref`
is present/equal to `workflow_ref`, and `job_workflow_sha` equals the job SHA.
That diagnostic made no production request and retained no JWT in its projection.
The previous guard rejected this form merely because `job_workflow_ref` existed.
The server correction accepts only joint absence or the exact production-main
workflow/expected-commit pair. Signature, body-bound audience, repository/IDs,
branch, event, freshness and replay checks remain mandatory. Foreign file/SHA,
partial pairs and null values are denied. This requires status Worker publication
too; a branch diagnostic proves no production ingestion. Application and status
must therefore be published and qualified separately; the report must establish
28/28 results and exact storage before success is claimed.

Targeted qualification of that rule and diagnostic passes **114/114 local cases**:
52 status integration, 32 OIDC diagnostic and 30 transport/projection cases.
These RS256 JWTs are synthetic and verified offline, not accounts, a new GitHub
execution or production ingestion. Final-head CI and publications remain separate.

These observations belong to their recorded source. PR 75's merge into main
`1d23931d37407d7fd9fcd5291cbd6dbc8e17f1ef` and its later reconciliation with this
engineering candidate do not retroactively qualify another run or publication.

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
