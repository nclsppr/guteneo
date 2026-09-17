# Expert journey inside the assistant

Local candidate on 17 September 2026, based on `origin/main` at `2466eb6`.
No production deployment, database migration, mandate activation or real
communication was performed. This extends the PDF analysis recovery candidate.

## Delivered behavior

- `get_capabilities.approval.expert.connection` and `get_expert_status` describe
  the actual authenticated connection: active/expired/revoked/inactive mandate,
  required scopes, permitted channels, per-send cap, remaining UTC daily budget
  and count, expiry, and a concrete next action. Reading never grants authority.
- Pending PDF analysis retains the exact original and continues independently
  of the conversation. Bounded delayed status reads resume the same document;
  the normal waiting path does not require visiting the website.
- `read_document_pages` makes the ready original readable before any dispatch
  exists, including the postal preflight. It is read-only and issues no token.
- `review_dispatch` normally returns up to three full-page images at a time,
  with bounded text-layer extraction and a next-page pointer. Originals up to
  10 MiB and 100 pages use this path. All pages must be provided before a review
  token is issued; each step and the final insertion recheck current authority,
  the immutable dispatch/document and canonical scan evidence. The sent PDF
  remains the original. Explicit `format:"pdf"` preserves the existing exact
  embedded-PDF alternative for capable hosts, limited to 1 MiB.
- Errors return readable text and structured recovery. Expired reviews resume
  the same dispatch, missing rights prompt the correct reconnection/mandate
  action, and unknown outcomes never become a fresh send. Integrity errors stop
  approval; invalid PDFs are distinguished from expired attachment links.
- When an administrator must grant or renew authority, the link targets the
  exact connection, focuses its form, preserves renewal limits, and keeps the
  acknowledgment unchecked. Nothing submits automatically. The saved result
  tells the person how to continue in ChatGPT.

The renderer is private, isolated, has no network access, validates matching
original/scan hashes, and bounds input, pixel/image/text output and duration.
Images are returned only in MCP content, not duplicated in structured JSON.
Images, blobs, tokens and signed URLs are never logged. The text layer is not
OCR or evidence of what is visible. Unsupported forms, annotations and optional
layers are rejected explicitly; an unreadable image never counts as a model
having understood a page.

## Validation

The full Vitest run passed **54 files / 1,023 tests**, with no failures. Focused local evidence:

- `test-results/expert-journey-integration.json`: connection status and paginated
  review against real local D1/R2, signed OAuth identities and MCP transport.
- `test-results/expert-read-document-final.json`: 20 MCP integration cases,
  including standalone read-only access without a mandate or dispatch,
  revocation during rendering and isolation between organizations.
- `test-results/expert-chat-recovery-final.json`: 16 MCP integration contract
  cases, including concrete recovery for invalid PDFs and expired reviews.
- `test-results/expert-review-renderer-tests.json`: boundary and actual Chromium
  PDF.js rendering tests. `test-results/expert-review/synthetic-proof.json`
  records a 1,610,140-byte four-page original, unchanged SHA-256, batches 1–3
  and 4. Full-page 1131×1600 JPEGs were visually checked.
- `test-results/expert-onboarding-target-switch-report.json`: 15 browser cases
  across desktop Chromium, mobile Chromium and iPhone WebKit; no automatic
  mandate changes and safe focus/query switching. Screenshots were reviewed.
- `test-results/expert-chat-security.log`: 130 security tests passed.
- `test-results/expert-chat-migration.json`: 29 migrations, 199 equivalent schema
  objects, integrity check OK and no foreign-key violations.

Full-suite and build evidence is retained in `test-results/expert-chat-vitest.json`,
`test-results/expert-chat-vitest.log`, `test-results/expert-chat-build.log` and
`test-results/expert-chat-documents-build.log`. Application build and private
documents Worker dry-run passed. Typecheck, lint and diff checks passed. The
additional MCP recovery assertions and read-only document-page cases were run
after the full suite and are recorded separately above. CI now includes the
actual renderer test in the browser-equipped
job and bundles the private documents Worker during dry-run validation.

## Release and qualification still required

Apply migrations `0028_document_analysis.sql` and `0029_expert_review_pages.sql`
through the protected release process after reconciling the current applied
ledger. Migration 0027 belongs to the already merged Luxembourg route change;
the unreleased analysis migration was renumbered rather than modifying it.
Release the compatible scanner, private documents Worker and application,
record their exact source/version evidence, then refresh the host's MCP tools
and installed integration instructions.

Local tests and browser emulation do not prove ChatGPT iPhone image perception,
human consent display, an active mandate or real delivery. Qualify the installed
client with a synthetic multi-page PDF, cold scanner, repeated status reads,
page-by-page review, an interrupted conversation and renewed/expired authority.
A no-send recipe stops after review; actual submission requires its own explicit
authorization. Do not claim any provider outcome from these tests.

The normal expert path after an active mandate stays inside the conversation.
The initial grant and subsequent renewal still require an authenticated human
administrator in the browser, expire within 30 days, and cannot be delegated to
the assistant itself. Resume without re-entering recipient/cap is guaranteed
only within the same retained conversation or for an already persisted dispatch;
no pending send intent or notification service was introduced. Postal transfer
authority, credits, provider qualification and host confirmations still apply.
