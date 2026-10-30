# Private PDF validator

3 October opening preparation: Nicolas authorizes private deployment and hosted
qualification before PDF verification activation on existing credits. The updated local
Docker qualification now includes twelve pinned official references: a positive
and negative case for each of the six profiles, exact counters and findings,
concurrency, rejection and temporary-file/log checks. The retained
[new offline proof](../apps/pdf-validator/tests/references/local-docker-proof.json)
is local evidence, not a hosted observation. The original synthetic proof below
remains historical. Publication and authenticated local-only hosted probe
commands are in [the qualification guide](../apps/pdf-validator/qualification/README.md)
and [the current individual-purchase release contract](PDF_VERIFICATION_PRICING.md).
The [activation checklist](PDF_VERIFICATION_ACTIVATION_RUNBOOK.md) covers the
current individual-purchase release. Retired monthly-subscription records remain
historical and must not be executed as an activation procedure.

The deployed service uses `standard-1` (0.5 vCPU / 4 GiB / 8 GB), one instance
and idle sleep after five seconds. The fresh 25 October native arm64 Docker run
passed all twelve official references and all six profiles of the 100-page
near-limit fixture. Cold health took 16.345 seconds; large-file checks took
13.191–13.922 seconds, with a 233,508,864-byte peak. The fresh `basic` run failed
a large-file process deadline. The earlier emulated amd64 `basic` run also failed
its initial version deadline; it does not establish hosted performance.

JVM startup tuning preserves the pinned binary, rules, 384 MiB heap and all
20/40/45-second version/process/request deadlines. The [3 October resource
comparison](../apps/pdf-validator/tests/benchmark-fixtures/local-resource-proof.json)
remains historical; its earlier `basic` selection does not override the fresh
failure. [The cost model](PDF_VERIFICATION_COSTS.md) records the allocation and
dated assumptions separately. Local measurements do not replace the hosted
qualification below or establish actual billing.

The new `apps/pdf-validator/` package wraps the unmodified veraPDF Greenfield CLI
**1.30.2**. It is independent of the antivirus and document renderer. A PDF/UA
diagnostic never changes a document's quarantine status or grants permission to
send it. Originals remain immutable; remediation must produce a new document
that passes the existing import and technical verification gates.

The first hosted attempt on 25 October 2026 created the explicitly authorized
private service. Cold engine health passed in 2960 ms, but the unchanged
twenty-second stop check failed before any reference PDF was processed: Python
as PID 1 ignored SIGTERM. That failed attempt does not qualify the hosted corpus
or idle behavior. The customer capability stayed closed during that attempt;
no customer PDF or purchase was used.

## Hosted qualification and activation — 25–26 October 2026

The later hosted suite passed on source
`03daa4136de8999cc79018f33f2a22038917c621`, qualification Worker
`cd24ab4e-b5e4-4502-9e97-2d39ac4c6f00`, completing at
**2026-10-25T20:03:01Z**. It processed all twelve official positive/negative
references and six profiles of the 100-page near-limit synthetic PDF. Cold health
took 3,818 ms, cold reference validation 13,389 ms and cold large-PDF validation
14,125 ms. Concurrency refusal, malformed-input rejection, bounded process
deadline and temporary-file cleanup passed. Automatic idle stop was observed at
5,603 ms; the subsequent wake returned ready in 10,702 ms. These are observations
of that hosted workload, not general latency or invoice guarantees.

Normal deployment then closed the temporary qualification RPC. Read-only provider
inventory at **2026-10-25T20:03:53Z** confirmed Worker
`6a2c1017-3d6f-4629-b179-477162d486e8` at 100% traffic,
`QUALIFICATION_ENABLED="false"`, 0.5 vCPU, 4,096 MiB memory, 8,000 MB disk and
maximum one EU instance, with no public route, custom domain, workers.dev or
preview endpoint. Runtime internet disablement and the five-second idle policy
remain exact-source controls; management inventory does not expose those
per-instance settings. Hosted stop/wake proof is separate from that inventory.

The guarded application release subsequently enabled individual checks after
migration 0060. The later **26 October 01:47Z** application observation on source
`f94664ff77c532c0c6b352109f565f6768091c2b` retained the enabled capability and
private bindings. Validator implementation and qualification sources are unchanged
between these application commits. This follow-up did not rerun the engine,
purchase a customer check or debit an account. See the
[unit-pricing release record](PDF_VERIFICATION_PRICING.md) for the application
configuration boundary. Preserve the earlier failed hosted attempt alongside the
successful suite; neither result promises future readiness or full accessibility.

## Local compiler and behavior checks

The private package uses TypeScript 7 for `tsc --noEmit`. Its Node behavior
suites execute the real Worker source after Node's `stripTypeScriptTypes`
removes type syntax; only the Cloudflare host classes are replaced by controlled
test doubles. Wrangler JSONC is parsed with the package's pinned `jsonc-parser`,
and every parse diagnostic fails the contract assertions. The tests do not rely
on the compiler API removed in TypeScript 7. Use the supported repository Node
runtime and a fresh package-local `npm ci` before `npm run typecheck` and
`npm test`. These checks do not run or redeploy the hosted veraPDF service.

## Supported checks and limits

The initially qualified repertoire is deliberately explicit:

| API profile | veraPDF profile       | Fixed rule count |
| ----------- | --------------------- | ---------------: |
| `ua1`       | PDF/UA-1              |              106 |
| `ua2`       | PDF/UA-2 + Tagged PDF |             1727 |
| `1b`        | PDF/A-1b              |              129 |
| `2b`        | PDF/A-2b              |              144 |
| `3b`        | PDF/A-3b              |              146 |
| `4`         | PDF/A-4               |              109 |

Other veraPDF profiles require an explicit implementation and qualification
change. Auto detection is unused: absent XMP declarations must not silently turn
an accessibility check into PDF/A-1b validation. The UA2 profile also includes
fixed ISO 32005:2023 tag-relationship rules, whose clauses include references such
as `Table 5. Annot-Aside`.
[Official CLI documentation](https://docs.verapdf.org/cli/validation/),
[official profile repository](https://github.com/veraPDF/veraPDF-validation-profiles).

PDF/A checks support preservation; PDF/UA checks support accessibility. For
PDF/UA veraPDF evaluates only machine-verifiable requirements. A passing machine
report does not certify full accessibility or compliance with European law.
Reading order, useful image descriptions and interaction still require human
assessment. [Official validation scope](https://docs.verapdf.org/validation/),
[W3C reading-order technique](https://www.w3.org/WAI/WCAG22/Techniques/pdf/PDF3),
[W3C alternative-text technique](https://www.w3.org/WAI/WCAG22/Techniques/pdf/PDF1).

## Private transport

`GET /health` returns `{status:"ready",engine:{name:"veraPDF",version:"1.30.2"}}`
only after the actual installed binary reports the pinned version. Its initial
version probe is bounded to 20 seconds. An unready engine returns a fixed 503
error and cannot produce a validation report.

`POST /validate?profile=ua1` accepts `application/pdf`, at most **10 MiB**,
and precisely one supported profile parameter. The Worker reads bounded bytes,
accepts at most 4096 nonempty chunks per request or response stream,
hashes them, and forwards a fixed internal request with no user headers or URLs.
The container permits one body/process at a time and rejects concurrent work
with `VALIDATOR_BUSY`; it performs no automatic retry. Body reading is bounded
to five seconds and the CLI process to forty seconds. The Worker has a 45-second
overall budget, which includes its body read and service request.

The response is restricted to:

```json
{
  "sha256": "64 lowercase hexadecimal characters",
  "profile": "ua1",
  "engine": { "name": "veraPDF", "version": "1.30.2" },
  "compliant": false,
  "passedRules": 99,
  "failedRules": 7,
  "failedChecks": 7,
  "truncated": false,
  "findings": [
    {
      "specification": "ISO 14289-1:2014",
      "clause": "7.1",
      "testNumber": 3,
      "failedChecks": 1
    }
  ]
}
```

The example abbreviates the findings; a non-truncated response includes every
failed rule. At most 100 rule findings leave the service, while totals retain
every checked rule. `truncated` denotes omitted **rule findings**, not early
termination of validation. No passing partial report is accepted.

The parser consumes the observed 1.30.2 JSON schema: `report.jobs[].validationResult[]`,
`jobEndStatus`, `profileName`, `details.ruleSummaries` and `batchSummary`. It requires
one complete job, the exact profile, matching file size and binary components,
all fixed profile rules evaluated, consistent counts, and zero parse/encryption,
memory or engine failures. Normal noncompliance uses CLI exit 1; compliance uses
exit 0. Every other exit is an incomplete validation. Duplicate JSON keys, NaN,
missing or inconsistent fields, mismatched versions and unknown rule identities
fail closed.

Rule identities are allowlisted against `container/rules.json`, extracted from
the checksum-verified archive's embedded profiles. Descriptions, document names,
object paths, error arguments, extracted text and raw engine logs never leave
the service. The process receives an exact private file with mode 0600 in its own
temporary directory, removed after both success and failure. Stdout is bounded
to 2 MiB; stderr is discarded. Timeout/overflow kills the process group. Java
heap is capped at 384 MiB. Request and exception logs are disabled.

The Container class sets `enableInternet=false`. Wrangler has no routes,
`workers_dev=false`, `preview_urls=false`, disabled observability, one instance,
and EU container jurisdiction. These are deployment constraints, not evidence
about all Guteneo processing or a hosted cold start. The SDK's own transient error
behavior requires hosted review before enabling any persisted observability.

The Python entrypoint explicitly handles SIGTERM/SIGINT, stops new admission and
drains its bounded handlers while the existing subprocess/temp-file cleanup
finishes. The normal SDK stop and five-second idle policy remain graceful; no
automatic force-kill or longer process/request budget is introduced. An explicit
`stop({ force: true })` exists only on the temporary qualification RPC, behind
its exact enabled flag and authenticated loopback bridge, for a stuck prelaunch
instance. It calls SDK `destroy()` and still requires a terminal-state check.
Forced recovery is not proof of graceful stop or automatic sleep. The internal
container helper is an ECMAScript `#` private method and cannot return a DO stub
through the RPC surface. Normal deployment refuses every qualification operation,
including the forced stop variant.

## Reproducible binary and notices

The Docker build pins its Java 21 base by digest and verifies both the allowed
release and archive checksum. Build arguments cannot select another release or
checksum without a reviewed source change.
The official installer download allows at most 300 seconds per attempt and two
retries for transient build-network failures. TLS and the exact archive digest
remain mandatory. These build limits do not change the 40-second engine or
45-second request deadlines.

- Archive: [official 1.30.2 Greenfield installer](https://software.verapdf.org/releases/1.30/verapdf-greenfield-1.30.2-installer.zip).
- Archive SHA-256: `6cc6341cb1af644044054b81f00a6590a7918abb18f762243de115258bcad838`.
- Base: `eclipse-temurin:21-jre-alpine@sha256:51ab5e3302e7141ce665ca3ea85e8b5cd648eafbc3c0c90dd79d6537684e4555`.
- Source: [veraPDF apps tag v1.30.2](https://github.com/veraPDF/veraPDF-apps/tree/v1.30.2).

The unmodified binary is dual-licensed GPLv3+ / MPLv2+. Both license texts and
source references ship in `apps/pdf-validator/licenses/` and in the image;
Guteneo uses the MPLv2+ alternative. Rule-reference extraction retains the
upstream CC BY 4.0 attribution. [Official licensing](https://verapdf.org/home/).

To reproduce the rule inventory from an already verified installed JAR:

```sh
python3 -B apps/pdf-validator/scripts/extract_rules.py /path/to/cli-1.30.2.jar /tmp/rules.json
cmp /tmp/rules.json apps/pdf-validator/container/rules.json
```

## Local verification and release gates

The private validator's Wrangler/Miniflare build and qualification dependencies
use scoped `undici` 7.30.1 and `sharp` 0.35.5 overrides for the pinned Miniflare
version. These are development/operation tools, separate from the deployed
container's Python/Java engine. Full and runtime-only npm audits on 25 October
2026 reported zero vulnerabilities after this update; future dependency changes
need a fresh audit and the same qualification checks.

The `pdf-validator` CI job runs type and unit checks. The real Docker corpus and
hosted qualification are separate operator checks; passing CI alone does not
prove either engine execution or production readiness.

```sh
npm ci --prefix apps/pdf-validator
npm run typecheck --prefix apps/pdf-validator
node --test tests/security/pdf-validator.test.mjs
docker build --tag guteneo-pdf-validator:local apps/pdf-validator
python3 -B apps/pdf-validator/tests/qualify_docker.py
```

The root security suite runs the Python report/process checks through its Node
test. Fixtures record the actual CLI's six noncompliant reports and one compliant
synthetic PDF/A-2b report. Parser mutation tests cover partial jobs, wrong profile,
wrong byte size/version, count inconsistencies, unknown/duplicate rules and
private-field suppression. Real process tests cover timeout, stdout overflow,
stderr suppression and exact temporary-file cleanup. The Worker independently
checks bytes, fixed version/profile/counts, bounded findings and private errors.

The current Docker qualification driver uses synthetic and pinned official
documents, a read-only root, unprivileged user, no network, bounded PIDs and no
capabilities. The default `standard-1` allocation is 0.5 vCPU and 4 GiB memory without
swap. It checks the twelve official references and all six profiles of the
100-page synthetic PDF, concurrency refusal, a synthetic process deadline,
rejected profile, URL parameter, content type, oversized declaration,
invalid/incomplete PDF, empty logs and temporary-file cleanup, then removes its
temporary container. The dated 2 October observation below used the earlier
one-CPU, 512 MiB allocation.
This proves a local private engine path; it does not prove a hosted integration,
full PDF/UA accessibility or legal certification.

Executed on **2 October 2026 at 17:03 UTC**: the offline Docker batch passed all
six noncompliant profiles, the compliant synthetic PDF/A-2b (144 rules passed,
zero failures), and all six rejection cases. The container had no remaining
temporary document directories and emitted no stdout/stderr logs. The saved
[local synthetic proof](../apps/pdf-validator/tests/fixtures/local-docker-proof.json)
identifies the exact local image. Eleven Node security tests and fifteen Python
tests passed, together with the independent TypeScript check, ESLint and exact
rule-inventory reproduction. The first local startup probe was too short at five
seconds under a single CPU; the bounded twenty-second startup probe was then
qualified. The validation process and Worker limits remained forty and forty-five
seconds respectively.

Before publication, explicit authorization is required to deploy/provision the
private service, qualify hosted limits and cold starts, and add its service
binding to the application (`PDF_VALIDATOR` → `guteneo-pdf-validator`). Missing
binding must keep the feature unavailable. The public design preview never
receives this binding. Scanner refresh, production migrations and native-client
qualification remain separate workflows.
