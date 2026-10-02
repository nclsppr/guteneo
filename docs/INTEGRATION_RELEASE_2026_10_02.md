# October 2026 integration and release boundary

The user authorized reviewing the outstanding branches, merging them into main,
and publishing the application on 2 October 2026. Integration was prepared in
isolated worktrees while preserving the original checkout and unfinished work.

## Source inventory

The candidate includes the complete ancestry of:

| Work | Original head |
| --- | --- |
| Four-language website and personal preference | `codex/multilingual` / `2f9d731` |
| Four-language native companion | `codex/multilingual-ios` / `384d0d0` |
| Adaptive native iPad UI and Icon Composer icon, PR 32 | `codex/native-ios` / `6ca9eb6` |
| Claude dashboard, counts, euro amounts, fax input and session fixes | `claude/dashboard-fixes` / `6201af3` |
| Claude installation and OAuth renewal tooling, PR 17 | `chore/claude-ai-connection` / `b8c25a9` |
| Resend transport and protected PDF links, PR 27 | `feat/resend-protected-delivery` / `09d16c4` |
| Plugin review packaging, PR 34 | `codex/plugin-resubmission-0.2.3` / `a08182f` |

The older postal, document recovery, branding, homepage film and assistant-guide
branches were already ancestors of main. The remaining scanner-refresh commit
was patch-equivalent to the already merged change.

Reconciliation keeps the current assistant guides, native adaptive navigation,
immutable approvals and tenant boundaries. New dashboard, session, video,
Claude-installation, email and recipient-screen copy must retain French, English,
German and Luxembourgish. Euro inputs use a bounded decimal parser and emit
integer minor units. Language selection cannot change a document, recipient,
provider option or approved fingerprint.

## Database and activation

A fresh production read found 36 migration ledger entries through
`0036_postal_window_options.sql`, no foreign-key violations and `quick_check=ok`.
The additive integration order is:

1. `0037_native_sessions.sql`
2. `0038_user_locale.sql`
3. `0039_resend_email_transport.sql`
4. `0040_protected_documents.sql`
5. `0041_prepare_only_accounts.sql`

Only the unpublished Resend filenames were renumbered. Applied migrations remain
unchanged. Before publication, compare the current ledger with this plan, retain
a fresh Time Travel bookmark, apply only the missing migrations atomically and
verify the resulting schema, ledger and integrity.

Application publication preserves `LIVE_SEND_CHANNELS=fax,postal` and sets
`RESEND_SENDS_ENABLED=false`. Merging Resend code does not qualify or activate
email delivery. OAuth renewal scripts are included but are not executed against
Auth0 as part of the application release. No assistant mandate is created or
extended, and no real communication is part of validation.

## Evidence and remaining boundaries

The final combined source requires typecheck, lint, migration transport proof,
application/preview builds and the complete GitHub checks before merging. Main
must then pass its own checks before the guarded `npm run deploy:live` command.
Public proof must compare the exact release manifest and every asset on both
`https://guteneo.com` and `https://guteneo-app.nclsppr.workers.dev`, read the active
Worker deployment/traffic and inspect public language controls in the browser.

Focused reconciliation evidence: 43 OAuth/security tests and 55 account/auth
unit tests passed; 53 Claude/domain/catalog tests passed; 41 Claude dashboard
and locale browser cases passed with one intentional desktop exclusion. The
native reconciliation passed 82 API/account/auth/locale tests, compiled the
application and all XCTest/UI targets, and preserves 252 four-language entries.
Direct XCTest execution on the reconciled native source then passed 25 unit
tests and 8 UI tests, with no failure or exclusion.
These are component checks, not a substitute for final combined CI.

The combined candidate also passed all 214 Node security cases. Production-style
public-page generation exposed an obsolete JavaScript removal rule: all public
routes now retain their language-aware entry while preserving readable server
HTML. The generator's seven cases and 24 locale boundary cases passed on desktop
Chromium, Android Chromium and iPhone WebKit. The latter visit every one of the
16 public routes and the account, preserve the anonymous choice and verify the
connected person's preference and actual sign-out behavior.
The native accessibility case also passed on iPhone 17e/iOS 26.5 with maximum
text size, profile identity and an actual change to German. Its tab helper now
waits for a hittable, enabled target and verifies native selection after one tap;
the previous CI capture showed Atelier still selected after the account tap.
The precise runtime cause was not reproduced locally. No product patch or reduced
text size is inferred from that observation, and combined native CI remains a gate.
The later combined native run exposed a separate, confirmed title refresh defect:
its XCTest hierarchy showed Luxembourgish profile content and selected language
while the navigation title still read German `Konto`. The profile title now uses
an explicitly resolved localized string so the same navigation stack updates
with the selected locale. The UI check retains both `Kont` and Luxembourgish
identity assertions, and waits for the real picker selection and menu dismissal.
Its privacy/PDF lifecycle check switches to the actual SpringBoard application
and verifies both SpringBoard foreground and Guteneo background states before
resuming, rather than depending on a synthesized hardware Home event alone.
The complete fictional public preview then passed 76 browser cases with six
intentional desktop-only profile exclusions. Restoring the public runtime also
exposed the shared router's unconditional scroll reset; it now resets workspace
navigation only, preserving native article fragment scrolling. All four strict
article checks pass. The documentation contract permits one checked anonymous
session read only on the real application for the person's language; the preview
continues to perform zero backend reads. Swagger remains lazy, credential-free
and unable to execute operations.

Native signup/authentication, physical-device behavior, signing, TestFlight and
App Store submission remain separate qualification. Account deletion currently
records a request receipt; its processor and provider erasure remain incomplete.
The official local native test script also reported incomplete Xcode first-launch
setup; the successful direct XCTest execution is separate from that script gate.
The full source/transport comparison passed 41 migrations and 266 schema objects,
with identical guards, no foreign-key violation and `quick_check=ok`.

The detached templates/data/distribution worktree is an unfinished, uncommitted
vertical slice with conflicting migration numbers 0033–0037. It is preserved and
excluded from this branch release. Other preserved local work includes video
source projects, the SES reconsideration draft and old Resend/provider-branding
edits; none is treated as reviewed deployable source merely because it is on disk.

Generated verification reports are retained outside the source tree under
`/Users/nclsppr/Developer/.artifacts/guteneo-release-20261002`; CI evidence remains
attached to the corresponding GitHub Actions runs. The published source is always
identified by the current public `/release.json`, not by an older dated document.
