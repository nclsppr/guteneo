# Expert journey inside the assistant

Published on 17 September 2026 at `649c0794c6c93619dd258a70cc839c941391f595`
through [PR #10](https://github.com/nclsppr/guteneo/pull/10). The exact merged
commit passed [main CI](https://github.com/nclsppr/guteneo/actions/runs/35227582669):
1,057 application tests, 130 security tests and 186 browser tests. Seven desktop
exclusions cover mobile-only scenarios that passed on their mobile projects.
The application, private renderer and scanner were released, all 29 migrations
were verified, and 58 public assets matched on both public origins. A synthetic
four-page PDF with embedded fonts passed private scan and paginated rendering.
No mandate was activated and no real communication was sent.

Release evidence is retained in `test-results/release/publication-649c079.json`
in the isolated release checkout. The additional standard-font correction is a
local follow-up described in [EXPERT_STANDARD_FONTS.md](EXPERT_STANDARD_FONTS.md).

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
- Expired fax quotes use the existing linked renewal after checking an exact
  server expiry, prepared status and an explicitly zero attempt count. The
  replacement needs a complete new review. A lost renewal reply can recover
  that same idempotent operation, including after the source became cancelled;
  it never authorizes a free new preparation or resending an uncertain fax.
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

## Earlier local validation

After reconciliation with `origin/main` at `d62ceef`, the complete Vitest run
passed **55 files / 1,056 tests**, with no failures. The final evidence is:

- `test-results/expert-chat-final-vitest.json` and `.log`: complete application,
  renderer, authenticated MCP, tenant isolation, authority and renewal tests.
- `test-results/expert-chat-final-browser.json`: **69/69 browser cases**, with
  no failure, flaky case or skip, covering PDF analysis, expert activation and
  quote renewal on desktop Chromium, mobile Chromium and iPhone WebKit.
  Onboarding screenshots were visually checked.
- `test-results/expert-chat-final-security.log`: **130/130 security tests**.
- `test-results/expert-chat-final-migration.json`: 29 migrations, 199 equivalent
  schema objects, integrity check OK and no foreign-key violations.
- `test-results/expert-chat-final-build.log` and
  `test-results/expert-chat-final-documents-build.log`: application build and
  both Workers' dry-run bundles passed. Typecheck, lint and diff checks passed.

Focused evidence is also retained in `test-results/expert-quote-recovery-final.json`
(31 MCP contract cases), `test-results/expert-read-document-final.json`
(20 paginated and standalone reading cases) and
`test-results/expert-journey-integration.json` (connection and authority behavior).
`test-results/expert-review/synthetic-proof.json` records a four-page original
larger than 1 MiB, unchanged SHA-256, batches 1–3 and 4, and bounded full-page
1131×1600 JPEGs. The images were visually checked. This proves private rendering
and MCP transport locally, not perception in a real ChatGPT session.

The old local simulation database retained the analysis migration's earlier
number. It was archived reversibly under
`test-results/expert-chat-final-state-backup/` before creating the clean browser
test database. No production database was touched. Generated restore evidence
is retained as `test-results/expert-chat-final-restore-proof.json`.
CI includes the actual renderer test in the browser-equipped job and bundles
the private documents Worker during dry-run validation.

## Published release and remaining client qualification

Migrations `0028_document_analysis.sql` and `0029_expert_review_pages.sql` are
applied in the published baseline. Migration 0027 is the Luxembourg route
change; the analysis migration was renumbered before its first release. The
compatible scanner, private renderer and application are published. Refresh
the host's MCP tools and installed integration instructions when qualifying
the client against that release.

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
