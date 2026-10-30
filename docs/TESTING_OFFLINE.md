# Local qualification without external network access

`npm run test:offline` runs a fixed selection of installed tests inside the macOS
network sandbox. It refuses to run on systems where that boundary is unavailable.
It never installs dependencies, downloads a browser or image, contacts a provider,
deploys a service or provisions a resource. Install and qualify the dependencies
separately before using this command.

```sh
npm run test:offline
npm run test:offline -- --with-pdf
npm run test:offline -- --with-pdf --report apps/status/public/qualification.json
```

The direct equivalent is `node scripts/test-offline.mjs`. Node 24 and the existing
repository dependencies were used for the local qualification. There is no `npx`,
package installation or automatic fallback to online execution. The optional PDF
case needs an already installed Playwright Chromium binary.

macOS cannot nest Chromium’s own seatbelt sandbox inside `sandbox-exec`. Only the
synthetic `scripts/pdfme-spike.ts` harness accepts the runner’s exact Darwin-only
marker and repeats the inherited-network denial probe before using Chromium’s
`--no-sandbox` option. The enclosing OS network restriction remains active for
Chromium and its children. A manually supplied marker without that proven
restriction fails the probe. Ordinary rendering and deployed services retain
their existing sandbox settings.

## What the network boundary proves

The macOS `sandbox-exec` profile denies `network-outbound` and allows only IP
loopback. The runner first opens a local TCP server and verifies that a client can
reach it. It then starts a child process that attempts to connect to the
documentation address `192.0.2.1`. Only an operating-system denial, `EPERM` or
`EACCES`, qualifies the boundary. A timeout, missing route or successful connection
does not count. The same profile starts the tests, so spawned Node, workerd and
Chromium processes inherit the restriction.

Loopback is necessary for Miniflare's local D1/R2 and the browser fixture. This is
a network boundary for trusted local test code, not a general-purpose hostile-code
sandbox: filesystem access and local services are still available. The runner
forwards a small environment allowlist and drops credentials, proxy variables,
remote-binding variables and Node preload options. Use the checked-in local
fixtures; never configure a local proxy or relay to forward their requests to a
remote account. No Miniflare remote binding is configured by this selection.

Linux and Windows currently return `OFFLINE_SANDBOX_UNAVAILABLE`. An equivalent
OS or container network boundary and its real denial probe must be implemented
and qualified before adding another platform. An environment variable such as
`npm_config_offline` alone is not proof that network access is blocked.

## Selected evidence

The default selection runs these complete files, without filters or skipped tests:

- `tests/integration/dispatch-validation.test.ts`: existing production-mode fax,
  email and postal quotes, private-document permissions, all four roles, expiry,
  revocation, unknown outcomes, HTTP authentication and absence of business writes.
- `tests/integration/trusted-fax-quotes.test.ts`: immutable trusted fax pricing and
  approval/acceptance guards against local D1.
- `tests/integration/live-delivery-quotes.test.ts`: email/postal quote, credit and
  migration contracts with synthetic provider responses.
- `tests/integration/resend-email.test.ts`: Resend request construction, protected
  links, provider guards and populated migrations with an injected transport.
- `tests/integration/protected-documents.test.ts`: local private R2, hosting,
  expiration, revocation and authorization.

`--with-pdf` adds `tests/integration/templates-renderer.test.ts`. It renders five
synthetic documents using the real local Chromium/pdfme engine, checks extracted
content, layout bounds and unwanted requests, and tests input/deadline guards.
It writes fixture artifacts under `reports/template-engine`; do not run another
renderer qualification against that directory concurrently.

Production **mode** here means the application executes its production rules on
local, fictitious records. It is not a request against the deployed application.
Provider responses, scan evidence and recipient consent in the fixtures are
synthetic. No result proves a real delivery, a production authentication journey,
the deployed scanner or the deployed PDF engine. The full backend, security,
browser and hosted checks remain separate evidence.

## Reports and failures

The default sanitized result is `reports/offline-qualification.json`. Use
`--report` to select another destination. The status page may publish
`apps/status/public/qualification.json` as a **local qualification** card, separate
from production health. Generating the file does not deploy it.

The report contains execution time, local/synthetic labels, verified network
evidence, exact test and test-file totals, selected scope and limitations. It
contains no request body, recipient, secret, internal path or raw test log.
`sourceCommit` remains `null` when the coordinated working tree has not been
qualified at a final commit; never invent a source SHA from an earlier run.

`sourceSnapshotSha256` identifies the exact tested source set even before that
commit exists. The runner hashes each relative path and its exact bytes, then
hashes the sorted manifest. It repeats the capture after the suites and refuses a
passing result if any file was modified, added or removed. The public report lists
the source scope and count; the detailed before/after manifests stay with the
private logs. The scope includes `apps/api`, `apps/documents`, `packages`,
migrations, test helpers/fixtures, selected test files, the runner, package
manifest/lock and TypeScript/Vitest configuration. PDF mode adds the renderer
qualification and DOCX fixture scripts. Generated `dist`, `.wrangler`, reports and
installed `node_modules` are excluded; installed dependency contents are not
revalidated against the lock by this command. The lockfile itself is hashed.

The runner verifies that the JSON test report contains exactly the selected
files and nonempty assertions. A failed assertion, skipped test, missing file,
nonzero exit or unproven network boundary prevents a passing result. If execution
cannot complete, it writes an explicit failed/unproven report rather than leaving
an old passing result at the requested destination. Exit status is nonzero.
Diagnostic logs are retained in a private temporary directory; only its local
path is printed to stderr, outside the sanitized JSON.

The focused guard tests are `node --test tests/security/test-offline.test.mjs`.
They include a real OS network-denial check on macOS. The check is explicitly
skipped on other platforms, where the runner itself still refuses execution.

## Optional Docker engine qualification

The existing scanner and PDF-validator Docker qualification scripts now use
`docker run --pull=never` and `--network none`. They require an already qualified
local image and never fetch a missing image. These scripts are separate from the
Node selection above; no fresh ClamAV or veraPDF result is implied by a passing
Node report. Expired antivirus signatures must fail qualification, not be
overridden or replaced by old evidence. The Docker daemon is a separate process,
so its container network restriction is required independently of the macOS
process sandbox.
