# Clean-copy review — 10 November 2026

## Source and scope

Candidate 1.2.1 starts from exact main
`31a43a3936bf20a099616b80591f4eaf3cd6d782`, the deployed 1.2.0 source. The user
requested the external clean-copy review across the codebase and authorized
subsequent merge and production deployment. The guide was inspected and installed
locally; [the repository copy contract](INTERFACE_COPY.md) owns its application.

The review covers user-facing product code in the web application, all four
language catalogs, native iPhone/iPad views, server-rendered access/review pages,
transactional and Auth0 email text, status and engineering controls, and agent
integration guidance. Backend/domain/provider diagnostics, technical field
contracts and integration permissions are reviewed for their actual audience;
they are not treated as disposable form hints. Historical reports, supplied
document content, third-party assets and licenses are not rewritten.

An earlier uncommitted copy-cleanup draft based on main `77a7570b` was read without
modification. Only individually reviewed decisions were recovered into current
source. Unrelated primary-checkout edits remain untouched.

## Decisions

- Remove descriptions that repeat visible controls or a nearby heading. Remove
  the corresponding element rather than retaining an empty hint.
- Name Documents, Campaigns and Senders directly in French, English, German and
  Luxembourgish. Their navigation and destinations are unchanged.
- Retain the actual approval consequence while cutting the repeated inventory of
  document, recipient and channel. The review checkbox and its consent remain.
- Preserve prices, units, scope, disabled/unsupported availability, account versus
  password access, expiry, destructive effects and uncertain-outcome recovery.
- Keep actionable protocol and assistant instructions, including current
  membership, human approval, content restrictions and stable-key recovery.

The [source-bound batch ledger](evidence/clean-copy-2026-11-10.json) records 47
app decisions, 28 public/engineering decisions, 34 native/API/email/status rows
and 44 core-locale decisions. The source scan indexes 798 tracked product-code
files; this is context review of copy-bearing surfaces, not manual or rendered
inspection of every line and state. The app slice scans 146 source files and
468 candidate paragraphs, introductions and hints. API review covers 92 source
files and 825 literal candidates. Native localization changes from 282 to 258
keys, with all 251 surviving original entries unchanged. Independent cross-review
retains all consent, cost, scope, recovery and accessibility facts. No schema, dependency, provider, credential, approval
or sending-policy change is intended. A related release-tool correction replaces
the previous operator-only serial workaround with a validated one-to-four worker
setting. Invalid live settings refuse publication before build or source checks,
and the selected count is frozen for the public verifier. The same 30-second
deadline and every byte/hash/source/header/robots check remain. Runtime locale packs and templates must be
regenerated from the reviewed sources before qualification.

## Qualification and publication

The complete application suite passes **4,058 assertions across 213 files**. The final complete Node security suite passes **732 cases, without skips**;
its 95 focused publisher/verifier cases also pass independently. Typecheck, full lint and
documentation checks pass. Local preview-browser qualification passes **94 cases
with four existing desktop exclusions**; account-email rendering passes **16
cases** (available/blocked images, four languages), and status passes **50 cases**.
Engineering documentation builds successfully and passes **30 browser cases**
across desktop Chromium, mobile Chromium and iPhone WebKit. These are synthetic
local checks, not live authenticated journeys. Swift parsing
and catalog placeholder checks pass; fresh native execution remains required.
Runtime locale packs and four Liquid account-email templates were regenerated. The first read-only Auth0 administration attempt
was refused for lack of a usable CLI token; no provider template was changed. This record does not claim a merge, new native
binary, Auth0 template publication, status publication or production rollout.
The existing release procedure requires a new immutable version tag, matching
human notes, portable test evidence and separately observed served proof.

## Rendered examples and loading observations

[Rendered examples](evidence/clean-copy-render-2026-11-10.json) bind the PNGs to
their local fixture build. Visual inspection found readable layouts and no
horizontal overflow. A single fresh-context loopback observation recorded
57 resources / 773,213 transferred bytes / 124 ms first contentful paint on the
developer page and 72 resources / 955,639 bytes / 218 ms on the responsive
documents page. Both made zero automatic network API reads. No throttling, hosted
measurement or before/after comparison was performed; these are diagnostics, not
a production speed claim. Local fictional navigation and all account-email
examples retain their own scope; an image is not delivery or publication proof.
