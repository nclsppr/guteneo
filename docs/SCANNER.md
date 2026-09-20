# Private ClamAV scanner

20 September update: production version `8e0bffd1-43fd-4401-8663-1f4ecdb794a5`
was verified at 100% traffic with ClamAV 1.5.4, signature database 28129 dated
2026-09-20 06:26:26 UTC, clean/EICAR fixtures and exact hashes. The scanner remains
private and offline at runtime. A GitHub-hosted daily refresh workflow is prepared;
its dedicated credential and first successful hosted run are still required.
The local Codex maintenance task is paused. See [SCANNER_CI.md](SCANNER_CI.md)
for activation and evidence boundaries. The 16 September evidence below remains
historical.

The implementation in `apps/scanner/` runs a real ClamAV antivirus engine. It was deployed privately and qualified on Cloudflare on 2026-09-16. Its independent package and lockfile do not change the application dependency graph.

## Contract and isolation

`guteneo-scanner` exposes no custom domain, `workers.dev` URL or preview URL. The application reaches it through a Cloudflare service binding named `SCANNER`. The Worker accepts `POST /scan` with `Content-Type: application/pdf`, bounds the actual body to 10 MiB, hashes the unchanged bytes and forwards only those bytes to its private container. A successful response has the existing DocumentService contract:

```json
{
  "sha256": "the exact document SHA-256",
  "verdict": "clean",
  "engine": {
    "name": "ClamAV",
    "version": "1.5.4",
    "signatureVersion": 28125,
    "signatureDate": "2026-09-16T06:24:23+00:00"
  }
}
```

Only an exact matching hash and a `clean` verdict can release the document. Antivirus findings, including encrypted content and scan-limit heuristics, return a non-clean verdict. Unavailable engines, stale definitions, incomplete scans, excessive input, ambiguous responses and timeouts fail closed. The application must still validate the PDF separately through `DOCUMENT_RENDERER` before marking it ready.

The container uses the official ClamAV 1.5.4 image pinned to `sha256:9cb27d7660bdf66e9878c832cb433dd8aa152cfbe16f3c2c0084c80b04ae22b4`. FreshClam refreshes and tests signatures while building the image. The runtime runs as `clamav`, has Internet access disabled, logs neither requests nor engine findings, and streams document bytes over the local ClamAV socket without creating an application document file. ClamAV's own temporary files are disabled for retention. The Docker qualification also uses a read-only filesystem, a temporary `/tmp`, dropped capabilities and no network.

Cloudflare configuration selects one `standard-1` instance (4 GiB memory, 0.5 vCPU, 8 GB disk), restricts container placement to EU jurisdiction and sets `max_instances: 1`. One scan executes at a time; excess concurrent scans fail closed with a retryable unavailable status. The idle timeout is two minutes, after which the Container SDK can stop the instance. Routine health polling restarts or keeps compute awake and should not run continuously.

## Local evidence, 2026-09-16

The actual Docker image, with 4 GiB memory, 0.5 CPU and **no network**, produced:

| Check                            | Result                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------- |
| Engine                           | ClamAV 1.5.4                                                                           |
| Loaded signature database        | 28125, built 2026-09-16 at 06:24:23 UTC                                                |
| Clean PDF                        | `clean`; SHA-256 `680cde6bcc0a32b813f26deb4a36272a1f86f6e32b88114dde48945602e58231`    |
| Harmless EICAR antivirus fixture | `infected`; SHA-256 `275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f` |
| Empty and oversized payloads     | Rejected                                                                               |
| Document logs                    | None                                                                                   |
| Retained temporary files         | None                                                                                   |
| Cold time until engine ready     | 50.092 seconds                                                                         |
| Warm clean-PDF request           | 0.403 seconds                                                                          |

These times are local Linux amd64 execution under Docker emulation on this Mac, not Cloudflare performance measurements. The application's 30-second scanner deadline cannot be assumed to cover cold startup. `GET /health` starts the container and reports unavailable until the engine and fresh signatures are ready. The application source now includes administrator-triggered warmup and explicit document rescan routes. They retain quarantine on incomplete checks and require qualification in the coordinated application release; retrying a scan never implies automatic approval or sending.

Six Worker boundary tests and eight Python engine-protocol/freshness tests passed. These isolated tests exercise error paths; the Docker test above provides the separate real-engine evidence. Type checking and Wrangler's container-image/Worker dry-run passed. No test transferred a real customer document or sent a fax.

To repeat the checks:

```sh
cd apps/scanner
npm ci
npm run check
npm test
npm run refresh:definitions
```

## Signature maintenance

The runtime rejects signature databases older than 72 hours, or with implausibly future dates. Signature time comes from the running ClamAV daemon, before and after the scan. The daemon cannot update signatures at runtime because outbound Internet access is disabled.

Refresh, qualify and roll out the image daily. `npm run refresh:definitions` from `apps/scanner` forces a fresh signature layer, builds the local image and runs clean-PDF/EICAR qualification. Only after those checks pass does it update `containers[0].image_vars.SIGNATURE_REFRESH` with a new UTC build timestamp for the next coordinated deployment. The script does not deploy or schedule itself. `npm run refresh:definitions -- --check` is read-only and warns when the recorded refresh is more than 24 hours old; the private `/health` response remains the authority for the deployed signature date.

For manual local builds, pass the configured refresh value with `docker build --build-arg SIGNATURE_REFRESH=<value>`. Rebuilding with an unchanged value may reuse the Docker cache and does not count as an update. Do not increase the maximum signature age to make deployment pass.

The prepared GitHub Actions workflow removes this manual daily procedure once
its dedicated credential and first hosted qualification are complete. It uses
an ignored derived configuration instead of updating the tracked build timestamp
every day. Until activated, successful deployment alone does not establish an
operational recurring updater. Without a refreshed image, future scans deliberately
remain quarantined. See [SCANNER_CI.md](SCANNER_CI.md).

## Hosted evidence, 2026-09-16

`guteneo-scanner` version `c753afc4-9310-4738-b3f2-5110f55f611e` is deployed at 100% traffic. Container application `a03030c0-8135-4234-8e86-ec7016ec5e16` uses image digest `sha256:ac808d24fa8e937b18ce5ec8b86cd6e03c1b731b174b0fdb8819f62ca7ecd223`, EU jurisdiction, private networking, 4 GiB memory, 0.5 vCPU and a maximum of one instance. The observed running location was `cdg08`. Cloudflare's API verified both `workers.dev` and preview URLs disabled for scanner and renderer. No paid-plan upgrade or terms acceptance was needed.

The localhost-only qualification bridge in `tests/wrangler.remote.jsonc` uses authenticated remote service bindings. It was not deployed and has no public endpoint. `python3 tests/qualify_remote.py` passed against the hosted services:

| Check                                     | Hosted result                                                                       |
| ----------------------------------------- | ----------------------------------------------------------------------------------- |
| Actual engine                             | ClamAV 1.5.4, signature database 28125, dated 2026-09-16 06:24:23 UTC               |
| Clean fixture                             | `clean`, same exact SHA-256 as the Docker proof above                               |
| Harmless EICAR fixture                    | `infected`, same exact SHA-256 as the Docker proof above                            |
| Empty body / wrong media type             | 400 / 415                                                                           |
| Initial provisioning and engine readiness | 125.627 seconds, 12 fail-closed unavailable responses before readiness              |
| Warm clean-PDF scan                       | 0.054 seconds through the authenticated bridge                                      |
| Isolated PDF parser                       | Accepted one page and exact SHA-256; rejected invalid, truncated and active PDFs    |
| Hosted HTML renderer                      | Generated a 17,671-byte one-page PDF; isolated parser verified the same bytes       |
| Generated PDF antivirus                   | `clean`, SHA-256 `26d33d238973c8c38cce325393a7a652189cb8bd8c39a3c77b3f2f8fc626d53b` |

The renderer is private Worker `guteneo-documents`, version `f38ce894-066a-4fb2-8e9f-fc8145b576e0`, with Browser Run binding and a 30-second CPU limit. The application bindings can target `SCANNER → guteneo-scanner` and `DOCUMENT_RENDERER → guteneo-documents`. Binding installation and the main application release are coordinated separately. These tests used only synthetic content and the harmless antivirus fixture; no fax, customer document or message was sent.

To repeat hosted qualification, run `npx wrangler dev --config tests/wrangler.remote.jsonc` from `apps/scanner`, then `python3 tests/qualify_remote.py` in a second terminal. Stop the local bridge afterward. Do not deploy the qualification bridge or routinely poll scanner health: it would keep compute awake. HTML output hashes vary with browser-generated metadata; compare the bytes within each run.

## Cost estimate and scale to zero

Cloudflare's published rates checked on 2026-09-16 are $0.0000025 per GiB-second of provisioned memory, $0.00000007 per GB-second of provisioned disk and $0.000020 per active vCPU-second. Workers Paid is required; it includes monthly allowances shared with other account usage. [Container pricing](https://developers.cloudflare.com/containers/platform/pricing/)

At `standard-1`, before allowances:

| State                                      | Estimated container charge                      |
| ------------------------------------------ | ----------------------------------------------- |
| Stopped / scaled to zero                   | No running-container memory, disk or CPU charge |
| Running but CPU idle                       | $0.038016 per hour for memory and disk          |
| Running at the full 0.5 vCPU continuously  | Up to $0.074016 per hour                        |
| Two-minute idle tail after a burst         | Approximately $0.0012672 for memory and disk    |
| Continuously running for 30 days, CPU idle | Approximately $27.37 for memory and disk        |

This excludes Workers requests, Durable Objects, image storage, logs, network egress, taxes and the Workers plan. It is not a promised bill or an all-inclusive per-document price. Daily image builds and cold starts also consume resources. The two-minute idle policy allows scale to zero; there is no technical requirement to keep a minimum instance permanently running. After the hosted fixture scans stopped, Cloudflare reported the instance inactive at 21:06:24 UTC, consistent with the two-minute idle timeout. That verifies idle stop; ordinary later cold-start latency remains to be measured separately from initial deployment provisioning.

## Remaining activation

1. Release the prepared `SCANNER` and `DOCUMENT_RENDERER` bindings with the application warmup and rescan routes. Keep provider approval/pricing gates.
2. Activate and qualify the prepared GitHub Actions signature-image refresh before
   treating maintenance as unattended; see [SCANNER_CI.md](SCANNER_CI.md).
3. Verify the complete application's quarantine-to-ready path after deployment; the isolated proofs above do not establish successful account registration, checkout or fax delivery.

No paid-plan upgrade or external scanner subscription was performed. The private Cloudflare scanner and renderer were deployed using the existing account.

Official implementation references: [ClamAV Docker requirements](https://docs.clamav.net/manual/Installing/Docker.html), [ClamAV scanning](https://docs.clamav.net/manual/Usage/Scanning.html), [Cloudflare Container lifecycle](https://developers.cloudflare.com/containers/reference/container-class/), [EU placement](https://developers.cloudflare.com/containers/concepts/placement/).
