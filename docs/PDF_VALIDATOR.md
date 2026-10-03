# Private PDF validator candidate

3 October opening preparation: Nicolas authorizes private deployment and hosted
qualification before Horizon activation on existing credits. The updated local
Docker qualification now includes twelve pinned official references: a positive
and negative case for each of the six profiles, exact counters and findings,
concurrency, rejection and temporary-file/log checks. The retained
[new offline proof](../apps/pdf-validator/tests/references/local-docker-proof.json)
is local evidence, not a hosted observation. The original synthetic proof below
remains historical. Publication and authenticated local-only hosted probe
commands are in [the qualification guide](../apps/pdf-validator/qualification/README.md)
and [the application activation runbook](HORIZON_ACTIVATION_RUNBOOK.md).

The cost-qualified local candidate now uses `basic` (0.25 vCPU / 1 GiB / 4 GB),
one instance and idle sleep after five seconds. JVM startup tuning preserves the
pinned binary, rules, 384 MiB heap and all deadlines. The full reference and
100-page near-limit batch uses 47.25% less measured request CPU than the original
`standard-1` configuration. All six large-file verdicts and findings stay exact;
the maximum warm request is 20.289 seconds. Actual local `lite` testing failed
readiness. [Resource proofs](../apps/pdf-validator/tests/benchmark-fixtures/local-resource-proof.json)
and [cost model](HORIZON_COSTS.md) record the constraints and assumptions. Real
Cloudflare cold starts and five-second stop/wake still require the hosted run.

The new `apps/pdf-validator/` package wraps the unmodified veraPDF Greenfield CLI
**1.30.2**. It is independent of the antivirus and document renderer. A PDF/UA
diagnostic never changes a document's quarantine status or grants permission to
send it. Originals remain immutable; remediation must produce a new document
that passes the existing import and technical verification gates.

This is a local candidate. No service, paid infrastructure, production binding,
customer PDF transfer or public endpoint has been activated.

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

## Reproducible binary and notices

The Docker build pins its Java 21 base by digest and verifies both the allowed
release and archive checksum. Build arguments cannot select another release or
checksum without a reviewed source change.

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

The Docker qualification driver uses synthetic documents, a read-only root,
unprivileged user, no network, 512 MiB memory, one CPU, bounded PIDs and no
capabilities. It checks six failures, one real PDF/A-2b success, rejected profile,
URL parameter, content type, oversized declaration, invalid/incomplete PDF,
empty logs and temporary-file cleanup, then removes its temporary container.
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
