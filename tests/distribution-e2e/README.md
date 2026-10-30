# Secure distribution browser tests

This suite uses the requested [TesterArmy e2e framework](https://github.com/tester-army/e2e), with exact locators and assertions. It configures no model, subscription, API key, hosted browser or cloud report store. The wrapper disables telemetry before the CLI starts. The browser fixture blocks requests outside `http://localhost:8787`.

Use Node.js 22.22.3 or newer on the 22 line, or 24.8 or newer. Dependencies are pinned to `e2e@0.21.3` and `@e2e-dev/web@0.15.3`. The framework's transitive Zod version is overridden to the patched 4.6.6 version used by the application.

```sh
npm ci
npx --no-install playwright install chromium
E2E_TELEMETRY_DISABLED=1 npx --no-install e2e-web install chromium
npm run test:distribution
```

On Linux CI, install browser operating-system dependencies with `e2e-web install chromium --with-deps`. The local PDF renderer uses the application's existing Playwright Chromium, while the TesterArmy engine uses its own browser revision. Install both as shown above. Existing Playwright tests continue to run through `npm run test:e2e`.

To run one scenario file or viewport:

```sh
npm run test:distribution -- tests/distribution-e2e/personal-account.e2e.ts --target desktop
```

The test launcher builds the application, applies migrations and seeds only the fictional local simulation data. It starts the local renderer and Worker on ports 8788 and 8787. Each run receives fresh D1/R2 state under `.wrangler/distribution-e2e-<uuid>`, with its location recorded in `test-results/distribution-e2e-state.json`. An existing server on these ports causes a failure; no external environment may substitute for the local fixture.

The charge-inspection fixture executes a fixed, tenant-scoped, read-only `SELECT`
against that isolated local D1 state. A completed Wrangler process reporting an
explicit SQLite busy error may be retried at most twice, after 250 and 500 ms,
within the original 15-second total read budget. Each attempt opens a new local
read; a persistent lock, timeout, unrelated process error or malformed result
fails the test. Browser actions, approvals, billing mutations and assertions are
never retried by this helper. Preserve failed-run evidence separately from any
later successful run; this local database recovery is not provider retry policy.

Reports, JUnit XML, explicit screenshots, downloads and synthetic PDF inputs remain in the ignored `test-results/` directory. Browser traces are disabled because their raw network payloads could retain an invitation POST body. The engine's public `startAttempt` extension sanitizes incoming-fragment navigation events before they reach a reporter; the event and its outcome remain visible with the invitation masked. The wrapper also buffers console lines across stream chunks and masks 64-character hex values before stdout/stderr reach CI, including error messages; source hashes remain in the checked report. After every finished run, the wrapper independently verifies in memory that none of the generated invitation secrets appear in any report file or the local server log. CI additionally checks its captured stdout before allowing an upload. An interrupted wrapper without a current privacy marker cannot upload artifacts. The fixed fictional recipient account and the explicit strong-authentication simulation fixture are local test instruments; they do not qualify the live identity provider's authentication methods, passkeys, recovery or enrollment. The invitation regression exercises the real local login redirect and same-tab reload, then uses that server fixture solely as the callback stand-in before an explicit claim.

The `phone` target checks a narrow responsive viewport. It does not prove touch input or a physical mobile device. A local simulated invitation is separate from provider delivery, a deployed Cloudflare service, or a real assistant host's OAuth consent and marketplace installation.

The lifecycle also returns through **Copies conservées**, cancels then confirms deletion of its existing personal copy, and checks immediate removal from the list and refusal of page, text and PDF delivery. Known-owner metadata remains readable with no pages. The workshop's audit and paid commitment must stay unchanged; physical storage cleanup has separate service tests. The same lifecycle checks the secure detail route's navigation selection, keeping the suite at fourteen desktop/phone results.

The existing recovery scenario first displays a fictional list row and a next-page cursor, then injects a 401 and a 403 on pagination. Each refusal must remove the loaded title, sender and pagination, retain an explicit recovery action and produce no automatic authentication or repeated list reads. This is a scoped UI fault injection; the personal session remains a real local fixture session.

The ordinary verified-account policy has a separate desktop/phone run, preserving all fourteen default strict results:

```sh
npm run test:distribution -- --config e2e.verified-account.config.ts
```

It starts only the isolated local Worker with `SENSITIVE_DOCUMENT_AUTHENTICATION=verified_account` and `AUTH0_AUTH_POLICY=verified_email`. The fixture explicitly sets the isolated `secure_document_authentication_policy` singleton to the same mode; application code never changes that operator policy automatically. A Node-side fixture persists fictional Auth0 identities and normal sessions with current authentication timestamps, verified accounts and emails, `amr=["pwd"]`, `mfa=0`, `strong_authentication=0`, `authentication_policy_version=NULL` and `is_development=0`. It installs genuine HttpOnly browser cookies. No application test endpoint, intercepted authorization response or client-side boolean supplies access; the browser exercises the normal session, identity, membership, CSRF and final SQL guards. Cookie/CSRF fixture secrets stay in a private `0600` ledger under the isolated state directory; the wrapper independently refuses publication if they appear in reports or the server log.

This scenario covers browser preparation/review/activation, the invitation claim remaining unreadable until independent workshop association, page viewing, refusal of the shared original, permitted copy and exact-byte export, a different account's refusal, workshop revocation and continued ownership of the acquired copy without another charge. These are synthetic persisted session fixtures: signed Auth0 callback parsing has separate unit coverage, and no live Auth0 enrollment, authentication or production delivery is claimed.

## Isolate concurrent local runs

Optional `GUTENEO_DISTRIBUTION_E2E_PORT` and `GUTENEO_LOCAL_RENDERER_PORT` select
distinct integer ports 1024–65535; defaults remain 8787/8788. The shared test helper
always derives an HTTP localhost origin, and local-only egress checks/cookies
use that exact origin. It accepts no hostname, URL, credential or production
configuration. This permits separate test checkouts without reusing or stopping
another task's server. Use an independent persisted fixture directory as usual.
