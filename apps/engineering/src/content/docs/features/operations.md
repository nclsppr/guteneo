---
title: "Operations and reliability"
description: "25 capabilities in the operations branch of Guteneo."
sidebar:
  order: 20
---

<!-- Generated from docs/feature-map.json. Run npm run docs:build; do not edit this view. -->

**Access boundary:** Restricted operator authority required.

Implemented operational tooling; changes require explicit authority and exact-source proof.

**Surfaces:** Authorised operator/CI tooling and private services; anonymous monitoring has no workshop authority.

[Read the engineering guide](/engineering/security-and-reliability/) · [All features](/features/)

## Capabilities

<ol>
<li id="feature-1ed8bad43f18">Interactive/bulk queues, transactional outbox and idempotence</li>
<li id="feature-956a14c35607">Authenticated provider callbacks and logs without sensitive content</li>
<li id="feature-cbbefe486542">Private read-only Telnyx operator inspection reports bounded callback status/canonical-match booleans without raw URLs or credential extraction; fresh provider state requires separate proof</li>
<li id="feature-639f87168d5c">Reconciliation, bounded recovery and dead-letter queues</li>
<li id="feature-dacebda8c3c8">Ordered D1 migrations, integrity and restore bookmark</li>
<li id="feature-87f993395bed">Private scanner, renderer and validator releases from clean main; root-Wrangler loopback qualification bridge with temporary secret, Origin refusal and no secret transfer; deployment wrapper and hosted runner share strict production pdfValidation.available=false on canonical guteneo.com before container qualification; explicit private forced-stop recovery never replaces graceful idle proof, and runtime-private helpers cannot return a container stub</li>
<li id="feature-65604bd01772">Backend/security/browser suites and exhaustive CI. Dated 26 October main run 40254684422 on f94664ff77c532c0c6b352109f565f6768091c2b passed 22 jobs: 1,131 discovered browser identities, 1,112 passed and 19 declared skips, plus 2,802 unit/integration assertions; this establishes source/fixture qualification, not authenticated clients or business delivery. CI.md owns current execution and qualification limits. The standard-1 validator remains max 1 with 5-second idle; its separately dated hosted corpus covers 100 pages/9.887 MiB and does not establish an infrastructure bill</li>
<li id="feature-f6e751d0b366">Manual CI reruns retain all immutable artifacts; deterministic current-run metadata selection downloads the latest logical artifact by exact ID, with scoped read permission and unchanged complete-result gates; CI.md owns provenance, refusal and recovery</li>
<li id="feature-0860eb993dd2">Release from clean, synchronized, verified main</li>
<li id="feature-d35cb15a18d3">Release manifests contain canonical public assets with exact byte hashes; shared application/preview redirects preserve old page/download links without duplicate alias files; unexpected redirects fail served verification; retired workers.dev/preview closure has separate evidence</li>
<li id="feature-3ebafa0151f6">Local production monitor uses bounded anonymous canonical reads and retired-host refusal checks, page hashes, private-access refusal and 120-second staleness; partial feature proof, no sends or permanent task</li>
<li id="feature-2eb834115a08">Idempotent cursor-wrap purge with tenant-bound tombstones/success audit and R2/audit failure recovery without recounting completed purges</li>
<li id="feature-b3c8636a3f23">Targeted CI checkout preserves suites and published media; excludes immutable work archives and prefers official Ubuntu mirrors without dropping tests</li>
<li id="feature-b622d5386dba">Explicitly authorised daily antivirus maintenance and six-hour exact hosted-health/signature/token watchdog; visible failure without customer scans/sends; GitHub outage requires independent monitoring</li>
<li id="feature-3d7d712b8b1e">One source version with release comparison; dependency updates qualified by audit/tests/exact build without paid configuration</li>
<li id="feature-1217012ad371">Dated high/critical registry advisory gate via audit:dependencies does not guarantee unknown-defect absence</li>
<li id="feature-34ce16adfe4b">Repository standards and automated checks require English authored sources, valid English routes and synchronized feature/developer documentation</li>
<li id="feature-e16ee26106cc">Separate secure render/deposit queue work, bounded lease reconciliation and shared/personal retention cleanup; revocation, erasure, acquisition and immutable evidence remain distinct</li>
<li id="feature-9bdad62eb4b0">Documented provider/tariff maintenance separates official price, private account observation, immutable quote and actual outcome; expiry blocks new work without rewriting approved commitments</li>
<li id="feature-94f806220e30">Live deployment completes only after anonymous exact-release verification; a post-deploy verification failure remains a failed release without automatic redeploy or rollback</li>
<li id="feature-7ffa1272e943">Fixed secure-distribution and private page-render route labels plus one SECURE_PREPARATION_FAILED signal per durable preparation failure, including exhausted jobs; no content, recipients, business IDs or raw errors enter logs</li>
<li id="feature-978cb22613bb">Signed negative Resend/SES/Telnyx/Pingen receipts emit one fixed failure signal after the durable projection claim, including recovery after prior event application; receipt HTTP 200 does not hide the operational signal</li>
<li id="feature-3fed11c3ffea">Native Cloudflare failure and missing-cron Monitors were configured and reread on 27 October 2026 with an owner-designated email destination; configured delivery and actual receipt remain separate evidence</li>
<li id="feature-d6c63d9ceb1d">Prepared separate operator-only direct MCP Events incident schema and agent instructions define signed delivery, durable deduplication and bounded autonomous diagnosis/tests/draftPRs; no operator bridge, subscription, new permission or agent run is activated</li>
<li id="feature-157d08734bea">Chromium-dependent secure Resend journey runs once in the existing browser-equipped security job, outside ordinary Vitest shards; dependency-driven routing checks and aggregate inventory preserve complete coverage</li>
</ol>

## REST operations

- `GET /api/health`

Read the [REST integration guide](/integrations/rest-api/) for authentication, errors and contract discovery.
