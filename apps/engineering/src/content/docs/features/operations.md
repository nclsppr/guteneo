---
title: "Operations and reliability"
description: "18 capabilities in the operations branch of Guteneo."
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
<li id="feature-749face2ff7c">Private scanner, renderer and validator releases from clean main; loopback qualification bridge with temporary secret, Origin refusal and no secret transfer; validator operators check Horizon closed on canonical guteneo.com only</li>
<li id="feature-c054fe8b17d6">Backend/security/browser suites and exhaustive CI; basic validator max 1, 5-second idle, qualified JVM corpus to 100 pages/9.887 MiB; measured local CPU savings do not prove hosted cost</li>
<li id="feature-0860eb993dd2">Release from clean, synchronized, verified main</li>
<li id="feature-5e71b53295e1">Release manifests, asset hashes and canonical remote health; retired workers.dev/preview closure has separate evidence</li>
<li id="feature-3ebafa0151f6">Local production monitor uses bounded anonymous canonical reads and retired-host refusal checks, page hashes, private-access refusal and 120-second staleness; partial feature proof, no sends or permanent task</li>
<li id="feature-2eb834115a08">Idempotent cursor-wrap purge with tenant-bound tombstones/success audit and R2/audit failure recovery without recounting completed purges</li>
<li id="feature-b3c8636a3f23">Targeted CI checkout preserves suites and published media; excludes immutable work archives and prefers official Ubuntu mirrors without dropping tests</li>
<li id="feature-b622d5386dba">Explicitly authorised daily antivirus maintenance and six-hour exact hosted-health/signature/token watchdog; visible failure without customer scans/sends; GitHub outage requires independent monitoring</li>
<li id="feature-3d7d712b8b1e">One source version with release comparison; dependency updates qualified by audit/tests/exact build without paid configuration</li>
<li id="feature-1217012ad371">Dated high/critical registry advisory gate via audit:dependencies does not guarantee unknown-defect absence</li>
<li id="feature-34ce16adfe4b">Repository standards and automated checks require English authored sources, valid English routes and synchronized feature/developer documentation</li>
<li id="feature-e16ee26106cc">Separate secure render/deposit queue work, bounded lease reconciliation and shared/personal retention cleanup; revocation, erasure, acquisition and immutable evidence remain distinct</li>
<li id="feature-9bdad62eb4b0">Documented provider/tariff maintenance separates official price, private account observation, immutable quote and actual outcome; expiry blocks new work without rewriting approved commitments</li>
</ol>

## REST operations

- `GET /api/health`

Read the [REST integration guide](/integrations/rest-api/) for authentication, errors and contract discovery.
