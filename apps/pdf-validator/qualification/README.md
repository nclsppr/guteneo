# Prelaunch private hosted qualification

This is an operator-only local probe. It never deploys a probe Worker or exposes
a public route. Wrangler runs the bridge on `127.0.0.1:8891`; its `remote: true`
service bindings call the **deployed** private `guteneo-pdf-validator` using the
operator's existing Cloudflare authentication and the explicit account
`39ac9fada6cba44d9ecf09d467609e69`. Do not use `--remote`, `--tunnel`, change the
listener address, or deploy this probe configuration.

The listener requires a fresh, unpredictable local credential for each run and
rejects **every** request carrying an `Origin` header, including a same-loopback
browser origin. Before starting Wrangler, the setup command below generates
32 random bytes in `qualification/.dev.vars` with owner-only permissions (0600).
The repository ignores `.dev.vars*`; this file must never be committed or sent
to Cloudflare. Setup rotates an existing valid probe credential, but refuses to
overwrite foreign settings, exposed files or symbolic links. Inspect and preserve
any such existing file before preparing a dedicated probe checkout.
Setup writes the current `PDF_VALIDATOR_QUALIFICATION_TOKEN` key and the runner
uses `X-PDF-Validator-Qualification-Token`. An exact owner-private credential file
from the previous format can be read only to rotate it safely; foreign settings,
exposed files and symlinks remain refused. Always run setup before starting the
bridge. The local bridge strips both current and previous credential headers
before any remote service request.

Wrangler and the runner read the same local file. The runner sends its credential
only to the selected loopback listener, refuses redirects, and the bridge removes
the credential header before any remote service fetch. Missing or incorrect
credentials are rejected before any binding or RPC access. Neither arguments,
logs nor qualification proofs contain the credential.

The separate `ValidatorQualification` named RPC entrypoint is unavailable unless
the operator temporarily deploys the validator with `QUALIFICATION_ENABLED=true`.
The normal HTTP service does not expose these RPC operations or container audit
paths. The qualification runner checks public production capabilities before
stopping the container and refuses whenever PDF verification is available to customers.
Use this only before opening the product; it includes three intentional container
stops to measure actual cold health, cold reference validation and cold large-file
validation.

After the exact main source passes CI, the publication owner executes:

```sh
npm ci --prefix apps/pdf-validator
npm run deploy:pdf-validator -- --qualification
```

Record the Cloudflare Worker version UUID printed by that guarded deployment.
In a separate terminal, from the same clean main checkout:

```sh
node apps/pdf-validator/scripts/setup-probe.mjs
node node_modules/wrangler/bin/wrangler.js dev \
  --config apps/pdf-validator/qualification/wrangler.jsonc \
  --ip 127.0.0.1 --port 8891 --log-level error
```

Then, supplying the exact source commit and actual deployed version UUID:

```sh
npm --prefix apps/pdf-validator run qualify:hosted -- \
  --source-commit FULL_MAIN_SHA \
  --worker-version DEPLOYED_WORKER_UUID \
  --proof /absolute/private/path/pdf-validator-hosted-proof.json
```

Run the bridge with the repository-root Wrangler, the same reviewed runtime used
by the deployment guard. The package-local Wrangler 4.132.0 cannot run this
configuration's 2 October 2026 compatibility date; root Wrangler 4.149.0 was
verified during the 25 October hosted attempt. Do not lower the compatibility
date or change the qualification assertions to accommodate an older local tool.

The private service reports the guarded `SOURCE_COMMIT` variable and actual
`CF_VERSION_METADATA.id`; both must match the supplied deployment evidence.
Each of the twelve unmodified official reference files is hashed before upload.
All six profiles need both a positive and negative result with the exact pinned
engine, counts and failed rule identities. The runner also checks concurrency
(`VALIDATOR_BUSY`, no replay), wrong profile/media/URL, oversize/empty/invalid and
incomplete PDF errors, sanitized responses, and zero remaining private temporary
directories. Its harmless Python subprocess self-test exercises the real process
group timeout/cleanup in the hosted image; it does **not** claim that a Java PDF
hit the forty-second engine timeout. Worker/body/engine deadlines stay unchanged.
It regenerates a deterministic, non-customer **100-page A4 PDF of 9.887 MiB**
with Python stdlib, verifies its pinned hash and tests all six profiles against
the real recorded oracle. A separate cold PDF/UA-2 request uses that large file
to check the complete forty-five-second request budget, rather than qualifying
only tiny references.
It also observes automatic sleep within 15 seconds after the final response,
using non-waking state RPC calls, and measures the next real wake-up. The
five-second idle policy never interrupts in-flight requests: the pinned
subclass counts each request from admission, including the complete readiness
wait before the SDK begins its own in-flight accounting. An idle callback
renews activity while such a request is active. The Container SDK then protects
response streaming and starts the idle window only after the body completes.
The Worker races the service operation against its forty-five-second abort
signal even if a service binding ignores cancellation. It discards any late
response without consuming a report or retrying the request; this is a response
deadline, not a claim to forcibly kill a remote engine. The separate process
deadline remains forty seconds.

The current candidate uses the **standard-1** instance (0.5 vCPU, 4 GiB memory,
8 GB provisioned disk), one instance maximum, a five-second idle window and the
unchanged 384 MiB heap. Serial GC, one active processor and level-one tiered
compilation reduce per-document JVM startup work without changing veraPDF's
binary or rule inventory. The 25 October native local run passed the full corpus
on this tier; `basic` failed the near-limit 100-page fixture. Earlier comparisons
in [`local-resource-proof.json`](../tests/benchmark-fixtures/local-resource-proof.json)
are dated historical evidence. The hosted proof labels the expected configured
tier; verify the actual allocation in provider inventory against the reviewed
deployment. These Docker observations do not substitute for hosted qualification.

A failed check writes a private `status: failed` proof and exits nonzero. Keep
that evidence and resolve the cause; do not loosen assertions or enable PDF verification.
Positive reference machine checks do not replace human accessibility assessment.
No real customer PDF, subscription or communication is performed by this probe.

The 25 October first hosted run from `1d905ff2729e579cd6dc017ccfb422ba9cf985fe`
observed cold veraPDF 1.30.2 health in 2960 ms, then failed the unchanged
twenty-second graceful-stop check before processing any reference PDF. Python
running as PID 1 ignored the default signal. This failure is not corpus,
idle-sleep or production-readiness evidence. The lifecycle correction must pass
fresh graceful stop/start and automatic idle checks before activation.

The Python entrypoint handles SIGTERM/SIGINT explicitly, stops admitting new
work and lets bounded body/process cancellation and cleanup finish. An explicit
operator recovery request, `POST /stop?force=true`, asks the temporary private
RPC to call SDK `destroy()` for a stuck prelaunch instance. It requires the same
local credential, Origin refusal and enabled qualification gate. Reconfirm the
canonical feature closed and the exact private release/application/instance
before using it. Poll a terminal state afterwards; an acknowledgement is not
physical-stop evidence. Forced recovery never substitutes for the normal
SIGTERM cold-start or automatic-idle qualification assertions and is never
exposed by the customer service.

After qualification passes, keep PDF verification closed and physically stop the
container while the qualification gate is still enabled. This also ensures that
the Python process cannot retain its previous qualification environment across
the normal deployment. Check PDF verification only on the canonical production origin;
the closed application `workers.dev` host is not a prerequisite for this cleanup.
From the repository root, with the probe still running:

```sh
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { assertPdfVerificationClosed, createProbeFetch, readProbeCredential } from './apps/pdf-validator/scripts/probe-credentials.mjs';
const response = await fetch('https://guteneo.com/api/capabilities', {
  redirect: 'error', signal: AbortSignal.timeout(15000),
});
assert.equal(response.status, 200);
const capabilities = await response.json();
assertPdfVerificationClosed(capabilities);
const call = createProbeFetch('http://127.0.0.1:8891', readProbeCredential());
const stopped = await call('/stop', { method: 'POST', signal: AbortSignal.timeout(48000) });
assert.equal(stopped.status, 200);
await stopped.json();
// SIGTERM can return before shutdown completes. Only a terminal state below
// confirms that the private container has physically stopped.
const deadline = performance.now() + 20000;
for (;;) {
  const response = await call('/state', { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200);
  const state = await response.json();
  if (['stopped', 'stopped_with_code'].includes(state.status)) break;
  assert.ok(performance.now() < deadline, 'Container did not stop');
  await new Promise(resolve => setTimeout(resolve, 250));
}
console.log('PDF verification closed; private container stopped before normal deployment.');
NODE
```

Then stop the local probe and close the RPC gate with the normal guarded
deployment from the same clean main source:

```sh
npm run deploy:pdf-validator
```

This imposes `QUALIFICATION_ENABLED=false`. Record the new deployment version,
run the setup command again before restarting Wrangler with the command above,
then execute this closure check from the repository root. It reads the credential
directly from the local file; no credential appears in arguments or output.

```sh
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { createProbeFetch, readProbeCredential } from './apps/pdf-validator/scripts/probe-credentials.mjs';
const call = createProbeFetch('http://127.0.0.1:8891', readProbeCredential());
for (const [method, path] of [
  ['GET', '/release'], ['GET', '/state'], ['GET', '/privacy'],
  ['POST', '/stop'], ['POST', '/stop?force=true'], ['POST', '/process-deadline'],
]) {
  const response = await call(path, { method, signal: AbortSignal.timeout(48000) });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: 'PRIVATE_PROBE_UNAVAILABLE' });
}
const health = await call('/health', { signal: AbortSignal.timeout(48000) });
assert.equal(health.status, 200);
assert.deepEqual(await health.json(), {
  status: 'ready', engine: { name: 'veraPDF', version: '1.30.2' },
});
console.log('Private qualification RPC closed; veraPDF 1.30.2 ready.');
NODE
```

Stop the probe again before enabling the application. Production activation and
the browser credit journey are controlled by the root activation runbook, not by
this package.
Delete the local `apps/pdf-validator/qualification/.dev.vars` after qualification.
Rotating the file requires stopping and restarting Wrangler so that both local
processes use the new credential; never rotate it during a running suite.

The offline prerequisite uses the same corpus and a network-disabled, read-only,
non-root Docker runtime:

```sh
docker build --tag guteneo-pdf-validator:local apps/pdf-validator
python3 -B apps/pdf-validator/tests/qualify_docker.py
```

For a managed environment whose HTTPS proxy uses an injected CA, pass its public
combined trust bundle as the optional BuildKit secret `proxy_ca`; TLS verification
remains enabled, and the certificate does not persist in image layers:

```sh
docker build --secret id=proxy_ca,src=/etc/ssl/certs/ca-certificates.crt \
  --tag guteneo-pdf-validator:local apps/pdf-validator
```
