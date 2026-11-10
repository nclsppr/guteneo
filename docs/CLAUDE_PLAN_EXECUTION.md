# Frontend clarity plan execution — 10 November 2026

## Source and baseline

The user requested continuation of the Claude desktop session **Frontend
improvements from PR156**, including its plan and both authored audits:

- [Frontend UX audit](https://claude.ai/artifact/Q13adpKNUhfUquVoomWK1L).
- [Page-by-page design audit](https://claude.ai/artifact/GDy4kd9BtNhqatDkqHVhea).

Both documents were read in the desktop application. Their observations concern
the fixture preview at `77a7570b`, rather than the current production interface.
The plan is retained by Claude as `precious-soaring-harbor.md`.

The recovered branch is `worktree-trim-helper-copy-20261109`, originally ending at
`39375884`. An isolated local checkout replays its work on main `551ca4c8`.
Nineteen commits were preserved; the redundant command-palette commit was
superseded by main's authority-scoped implementation. Split dispatch, stylesheet
and Belvédère modules, session/navigation guards and all newer lifecycle features
remain intact. The original worktree and unrelated dirty checkout were preserved.

This document records implementation and local qualification. It grants no
publication, production migration, customer callback, communication or paid
infrastructure authority. Old Claude/main test results are historical evidence,
not successful verification of this combined candidate.

## Phase A — design reconciliation

| Lot | Result and deliberate limits                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A0  | Preserved the existing copy/title commit rather than inventing two historical commits. Functional titles, unknown-page recovery and the text floor remain.                                                                                                                                                                                                                                            |
| A1  | Shared text tokens, disclosures, meaningful empty states and StatTile variants; the three applications reuse the same statistic component. Loading placeholders have page, table, form and document shapes. Evidence labels remain where an individual record can have a different mode.                                                                                                              |
| A2  | Native row navigation, named loaded/page counts, one status filter, accurate chip totals from one parallel report-authorized aggregate read. Compact mode applies below five rows and retains active-filter recovery and scoped saved views; it does not pretend a loaded page is a complete collection. Studio library focus-refresh preserves unsent editor inputs.                                 |
| A3  | Progress row, copiable reference, sticky priced decision, natural bounded PDF reader, journal before the preview after approval, and a next step for uncertain outcomes. Exact-version review, required attestations and separate postal transfer authority remain.                                                                                                                                   |
| A4  | File drop zones, remembered channel, channel cards, qualified indicative prices before the spending cap, searchable countries and translated input errors. Indicative catalog prices are not represented as an actual provider quote; no provider read is added for decoration.                                                                                                                       |
| A5  | Three campaign steps, downloadable fictional CSV example and optional paste editor; independent sender cards; two main account cards with separate expert approval and an access disclosure; compact PDF offer with conditions folded and a bounded private check history.                                                                                                                            |
| A6  | User templates before compact examples, New template action, drop zones and localized empty states. Actual first-page template thumbnails render locally only on viewport entry through a serialized, bounded renderer; no preview mutation or remote resource is used. Ordinary public preview exposes deterministic, viewer-only Studio lists/details; writes are refused without backend fallback. |
| A7  | Debounced committed search with stale-intent cancellation, native title/row links, near-expiry badges, sticky reader controls and responsive history aside. Existing useful personal navigation remains.                                                                                                                                                                                              |
| A8  | Compact period control, activity column choices, useful chart thresholds, report rows with format selection, allowlisted audit descriptions, simpler billing and a separate administrator-only Operations page. Raw audit payloads and recipients remain excluded.                                                                                                                                    |
| A9  | Complete singular/plural phrases, single-value financial cells with optional breakdown, quiet missing values, shared statistics and mobile filter disclosure. Platform authority remains distinct from workspace administration.                                                                                                                                                                      |
| A10 | One telling of the home steps; the document/assistant start choices move into the hero while the existing installation fragment remains valid. Internal arrows use the normal direction. Pricing provenance remains available under Details, and Support gains a contact card without a response-time promise. Approved closing artwork and panorama remain.                                          |

## Phase B — frontend foundations

| Lot | Result and deliberate limits                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | Technical error codes are folded; only reviewed server messages are shown as product copy, with translated fallback otherwise. Recipient deletion, schedule cancellation and webhook secret rotation/revocation use explicit inline confirmation. Dirty application navigation uses a localized, cancel-focused dialog with immutable one-use continuation, exact route/authority/revision binding and deferred workspace preflight; independent hard vetoes still win. Browser beforeunload remains native because it cannot be localized by application code. |
| B2  | All five applications use one fixed UTC contract for displayed instants, date filters, report buckets and datetime-local schedule/mandate input. Frames declare it once. Non-UTC report query zones are rejected; existing financial aggregation is preserved. The provider's published postal cutoff retains its actual Paris timezone. Units retain their truthful byte basis.                                                                                                                                                                                |
| B3  | Preserved automated locale/theme accessibility checks and added named controls, distinct links and keyboard-native row actions. Automated and physical-device accessibility remain separate evidence.                                                                                                                                                                                                                                                                                                                                                           |
| B4  | Inherited main's default continuation fencing, synchronous action latch, canonical authority identity, monotonic navigation clock, visibility-aware polling and bounded authority/locale-scoped collection sharing. No parallel stores were introduced.                                                                                                                                                                                                                                                                                                         |
| B5  | Inherited main's generated active-language packs and dated before/after measurements. New copy regenerates the same packs; no fresh timing improvement is asserted without a browser measurement.                                                                                                                                                                                                                                                                                                                                                               |
| B6  | Inherited main's zero design/import exceptions and split dispatch, Belvédère and stylesheet modules. New files have explicit application ownership.                                                                                                                                                                                                                                                                                                                                                                                                             |

## Phase C — feature reconciliation

| Feature                    | Implementation                                                                                                                                                                                                                                                                                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 Attention queue         | Main already contains the authorized SQL-backed queue, pagination and source reread. Kept instead of Claude's first-page approximation.                                                                                                                                                                                                             |
| C2 Late outcomes           | Main's bounded, authority-scoped metadata tray is retained. Approval and quote-renewal receipts now publish confirmed late outcomes into it.                                                                                                                                                                                                        |
| C3 Request approval        | Browser preparers can record one request for an exact prepared version. Final SQL fences check live browser authority, membership, mode, fingerprint and absence of a schedule hold. It is an in-application signal, not approval, consent, a reservation, a notification email or a send. Migration 0081 avoids main's existing migration numbers. |
| C4 Saved recipients        | Already implemented on main with tenant and preparation authority. Preserved.                                                                                                                                                                                                                                                                       |
| C5 Scheduled sending       | Already implemented on main with distinct revocable capped future approval, fresh release quote and atomic acceptance. Existing channel restrictions and activation gates remain.                                                                                                                                                                   |
| C6 Customer webhooks       | Already implemented on main with minimal signed lifecycle metadata, protected secret handling and separate administrator browser authority. Activation remains independently gated.                                                                                                                                                                 |
| C7 Native drafts           | Already implemented on main with bounded, non-synchronizing device Keychain storage and recovery keys. Physical-device/distribution qualification remains separate.                                                                                                                                                                                 |
| C8 Palette and table views | Main's navigation-only palette and explicitly saved, authority-scoped table views are retained. Unscoped automatic localStorage defaults are not reintroduced.                                                                                                                                                                                      |

PDF check history additionally uses migration 0082's tenant chronological index.
Its browser-only metadata read follows current document-library visibility,
keyset bounds and the existing HTTP budget, with final authority rechecking and
no-store responses. It never purchases a check or creates sending authority.

## Phase D — qualification

The initial candidate verification receipt distinguishes completed checks from blocked execution. Its counts and built source snapshot below predate the subsequent UTC, localized navigation, public Studio and manual release additions. They are historical evidence, not the final combined-source result.
Implementation does not turn a blocked, skipped or historical check into proof.

| Check                                                           | Current evidence                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript, ESLint, application ownership and generated locales | Passed on the final changed source; 274 files owned, no new import/design exception.                                                                                                                                                                                                                                                |
| Repository/documentation                                        | Standards, atlas and projection checks passed: 28 domains, 519 capabilities, 57 journeys, 97 REST operations and 92 MCP tools.                                                                                                                                                                                                      |
| Web build and Worker bundle                                     | `npm run build` passed, including Wrangler dry run only. Final preview build passed; its content snapshot matches the current source. The SSR helper's refused development WebSocket does not prevent the static output.                                                                                                            |
| Plugin                                                          | Candidate 1.2.3 synchronized and ZIP rebuilt/validated; both MCP resource manifests checked. No new MCP tool, scope or permission.                                                                                                                                                                                                  |
| Native SQLite                                                   | Durable `node --import tsx tests/offline/clarity-sqlite.mts` passed 26 assertions using the actual services, 82 migrations and 2 synthetic engine calls; integrity ok, no foreign-key violations. This is not D1/workerd proof.                                                                                                     |
| Full Vitest sweep                                               | Final recorded run: 1,998 passed, 57 failed and 2,039 skipped across 215 files / 4,094 tests. Listener refusal causes most failures and setup skips; the renderer fails with the independently observed browser-launch restriction. No whole-suite green result is claimed.                                                         |
| Additional focused checks                                       | Thumbnail eligibility 4/4; Belvédère locale 8/8; shared table/foundation 34/34; OpenAPI 17/17. These are separate invocations, not counts added to one passing full run.                                                                                                                                                            |
| Engineering site                                                | Build, Astro check, authored-document lint and four site security checks passed after generating the local routes.                                                                                                                                                                                                                  |
| Security                                                        | Final serialized run completed: 733 tests, 702 passed, 31 failed, zero skips. The 31 failures are environment-bound (28 listener refusals, one blocked browser, one validator wrapper timeout with confirmed socket denial, one unproven offline-network probe). The six earlier dependency-path/projection failures are corrected. |
| Browser / visual / fresh loading metrics                        | Normal Chromium pipe launch fails macOS MachPortRendezvousServer permission; installed WebKit aborts before page creation. Loopback servers fail `listen EPERM`. Browser suites and fresh loading observations are unqualified; old-source passes are not substituted.                                                              |
| Native iOS                                                      | Full Xcode 27.2 was found without changing xcode-select. Unsigned device build failed at Icon Studio asset export after CoreSimulator service denial; no native test or distribution success is claimed.                                                                                                                            |

The two audit documents remain the original observations. This execution matrix
supersedes their old worktree status for the combined local candidate; the
UTC and localized dirty-navigation requirements are now implemented above. The earlier local qualification below remains historical until rerun on the combined source.

## Resume and review

The active checkout is
`/Users/nclsppr/Developer/guteneo/.claude/worktrees/claude-plan-reprise-20261110`,
on branch `worktree-trim-helper-copy-20261109`. It is an isolated local repository
because the original repository's Git metadata was not writable in this session.
Its main baseline is `551ca4c8`; the original Claude branch/worktree still holds
its original 20 commits. Use this checkout's branch and execution receipt when
resuming, rather than treating Claude's unchanged final chat summary as current.
Both original Claude audit documents contain the earlier dated execution update. This repository record supersedes their earlier timezone/dirty-navigation implementation status; hosted qualification is still separate.

The [machine-readable receipt](evidence/clarity-continuation-2026-11-10.json) owns exact counts, source snapshot, archive integrity and qualification limits.

## Completion pass after reconnection

The UTC contract, translated dirty-navigation dialog, safe public Studio fixture
access, focus-preserving Studio library refresh and PDF action deduplication are
implemented. Focused pure tests, TypeScript and scoped lint passed for these lots.
Browser cases now cover Back/Forward, cancelled/confirmed workspace changes,
unchanged unsent input and host DST independence; they await hosted execution.

A separate operator-triggered application release workflow qualifies exact current
main, its immutable version tag and complete successful CI. It permits only the
two reviewed additive index migrations after exact ledger/schema checks, records
D1 bookmarks, verifies constraints and integrity, and invokes the unchanged live
publication/served-byte verifier. It requires separate existing application and
D1 credentials; missing access fails before mutation. Its 109 focused release
guard tests pass. No new credential, broader permission or production action is
implied by that implementation.

The user supplied the macOS WebKit crash from 10 November 2026, 20:04:26 CET:
SIGABRT inside HIServices `_RegisterApplication`, before page creation. This is
consistent with the earlier local launch restriction, not an application test
result. Further local browser-launch probes are stopped. A normal browser read
confirmed production health and served version 1.2.1 at source `551ca4c8`; this
does not qualify the candidate.

The [completion-pass receipt](evidence/clarity-completion-2026-11-10.json) separates
the latest successful source builds, 102 focused UI/foundation assertions,
14 backend clock assertions and 109 release guard assertions from the original
whole-suite environment failures. These are separate test invocations.
