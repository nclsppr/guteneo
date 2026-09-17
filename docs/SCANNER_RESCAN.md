# Explicit document re-analysis

Local follow-up candidate, 17 September: [recoverable PDF verification](DOCUMENT_ANALYSIS_RECOVERY.md)
adds durable bounded retries for transient service failures, separate from manual
retry quotas. The sections below describe the previously released behavior;
the candidate adds `analysis` to document reads and keeps all safety gates.

Implemented 2026-09-16. Apply `0012_document_rescan.sql` before exposing the new operations. The implementation is in `DocumentService.rescan(context, documentId)` and `DocumentService.warmScanner(context)`; the API/router and browser controls are integrated separately.

## Manual rescan

`rescan` requires the existing domain write permission and current organization membership. It looks up the document inside the authenticated organization. An already-ready document is an idempotent read; rejected or purged documents cannot be rescanned. A quarantined document needs both the configured SCANNER and isolated DOCUMENT_RENDERER bindings.

The service retrieves the existing private R2 object, verifies the organization storage prefix, exact size and SHA-256 against the immutable document record, and submits those exact bytes to the private `/scan` endpoint. Only a matching hash with an explicit `clean` verdict allows the same bytes to reach the isolated `/validate` endpoint. The validator must return the same hash and an integer page count within the existing PDF limits. JSON responses are bounded to 4 KiB. No PDF is parsed inside the main API during this process.

The operation uses a single hard 30-second deadline across retrieval, scanning, response reading and isolated validation. It also races the underlying promises against cancellation, so a binding that ignores its AbortSignal cannot later lift quarantine. Scanner timeout, unavailable service, infected verdict, wrong hash, oversized/malformed JSON or invalid validation result leave the document quarantined. Missing or changed original bytes produce an explicit error without contacting the scanner.

Successful promotion updates only `status` and the newly verified page count on the original row. The document ID, original name, hash, private object key, bytes and creation time remain unchanged. No upload, duplicate object or original rewrite occurs. Current membership is checked again before promotion; the SQL write also checks it. Status promotion, the `document.rescan_verified`/document-ID audit and the canonical `document.scan_verified`/SHA-256 proof commit in the same fenced D1 batch. The latter is required by live provider preflight; a failed audit insertion also rolls back readiness. An original purged while scanning is never revived.

`rescan` returns the current `DocumentRecord`. A `ready` result means this attempt or an already-completed qualified analysis permits viewing. A `quarantined` result remains blocked and can be presented as “L’analyse n’a pas abouti. Vous pourrez réessayer.” It does not create approval, prepare a dispatch or send a document.

## Limits and concurrency

Explicit retries use `document_scan_usage`, separately from upload/render budgets. Each organization can make at most 10 manual rescan attempts per UTC day. Failed attempts count because they may consume storage/scanner resources. Missing bindings, inaccessible tenants, already-ready records and concurrent attempts rejected before budget reservation do not count. The SQL increment is atomic across requests and organizations are isolated.

An organization/document-scoped 45-second lease prevents duplicate concurrent scans of the same original. Its random token fences promotion; an expired worker cannot write through a replacement lease or delete its successor's lock. The lock is released after completion/failure. Expired locks can be reclaimed by another explicit retry.

The default allowance is for re-analysis only. It grants no original uploads, rendering credits, monetary credit, delivery approval or sending quota. Existing new-account upload restrictions are unchanged by this module.

## Preparing a cold scanner

`warmScanner` is an explicit browser-administrator operation; assistants cannot invoke it. It sends only a GET to private `/health`, with no document, destination or other user content. Warm requests have the same hard 30-second deadline and a separate limit of 3 requests per organization per UTC day.

The result is `{ status: "ready", retryAfterSeconds: 0 }` only when the health contract explicitly reports readiness. Otherwise it is `{ status: "not_ready", retryAfterSeconds: 15 }`. This means readiness is unconfirmed: it does not promise that the container started or schedule an automatic retry. The browser can offer the user a later manual retry. Health alone never marks a PDF clean.

The current ClamAV container can require longer than 30 seconds to start cold. This path allows the user to prepare the service and retry analysis of the retained original later. No automatic scan loop, approval or send is added.

## Router integration

Expose a browser/authenticated document mutation such as `POST /api/documents/:id/rescan`, using the existing CSRF and organization quota middleware and the shared `documents:write` scope if REST assistant credentials are allowed. Pass the authenticated actor to `new DocumentService(env, domain).rescan(actor, id)`; never accept an organization or storage key from the request.

Expose warmup under an explicit admin/browser POST route using normal CSRF protection. The service additionally enforces administrator/browser identity itself. Both operations take no provider URL, body PDF, hash or claimed scan result from the caller. Existing content and sending gates remain enforced.

## Evidence

`npx vitest run tests/unit/document-rescan.test.ts` passed 23 tests with real Miniflare D1 and private R2, actual generated PDF bytes and intercepted scanner/validator bindings. They cover exact original retention, unchanged upload budgets, tenant/write boundaries, ready idempotency, purged state, missing configuration, changed/missing bytes, infected/malformed/oversized/wrong-hash responses, invalid page counts, hard timeout with a late response, concurrent requests and lease fencing, purge and membership removal during analysis, separate organization retry quotas, administrator-only content-free warmup, warmup limits, canonical proof isolation for identical bytes across organizations, and rollback if the canonical audit fails.

These are deterministic adapter fixtures. They do not replace separate deployed ClamAV qualification, current signature database verification or real cold-start measurements. Source migration and broader application tests remain separate from this focused proof.
