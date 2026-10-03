# Prelaunch private hosted qualification

This is an operator-only local probe. It never deploys a probe Worker or exposes
a public route. Wrangler runs the bridge on `127.0.0.1:8891`; its `remote: true`
service bindings call the **deployed** private `guteneo-pdf-validator` using the
operator's existing Cloudflare authentication and the explicit account
`39ac9fada6cba44d9ecf09d467609e69`. Do not use `--remote`, `--tunnel`, change the
listener address, or deploy this probe configuration.

The separate `ValidatorQualification` named RPC entrypoint is unavailable unless
the operator temporarily deploys the validator with `QUALIFICATION_ENABLED=true`.
The normal HTTP service does not expose these RPC operations or container audit
paths. The qualification runner checks public production capabilities before
stopping the container and refuses whenever Horizon is available to customers.
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
apps/pdf-validator/node_modules/.bin/wrangler dev \
  --config apps/pdf-validator/qualification/wrangler.jsonc \
  --ip 127.0.0.1 --port 8891 --log-level error
```

Then, supplying the exact source commit and actual deployed version UUID:

```sh
npm --prefix apps/pdf-validator run qualify:hosted -- \
  --source-commit FULL_MAIN_SHA \
  --worker-version DEPLOYED_WORKER_UUID \
  --proof /absolute/private/path/horizon-validator-hosted-proof.json
```

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

The candidate uses the **basic** instance (0.25 vCPU, 1 GiB memory, 4 GB
provisioned disk), one instance maximum, a five-second idle window and the
unchanged 384 MiB heap. Serial GC, one active processor and level-one tiered
compilation reduce per-document JVM startup work without changing veraPDF's
binary or rule inventory. See the exact local resource comparison and excluded
lite result in [`local-resource-proof.json`](../tests/benchmark-fixtures/local-resource-proof.json).
These Docker observations do not substitute for this hosted qualification.

A failed check writes a private `status: failed` proof and exits nonzero. Keep
that evidence and resolve the cause; do not loosen assertions or enable Horizon.
Positive reference machine checks do not replace human accessibility assessment.
No real customer PDF, subscription or communication is performed by this probe.

After qualification passes, stop the local probe and close the RPC gate with the
normal guarded deployment from the same clean main source:

```sh
npm run deploy:pdf-validator
```

This imposes `QUALIFICATION_ENABLED=false`. Record the new deployment version,
briefly restart the loopback probe and verify `GET /release`, `GET /state`,
`GET /privacy`, `POST /stop` and `POST /process-deadline` all return status 503
with `{ "code": "PRIVATE_PROBE_UNAVAILABLE" }`, while `GET /health` still reports
veraPDF 1.30.2 ready.
Stop the probe again before enabling the application. Production activation and
the browser credit journey are controlled by the root activation runbook, not by
this package.

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
