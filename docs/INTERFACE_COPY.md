# Interface copy

This is the repository's review contract for user-facing interface text. It
applies to web, native, standalone server pages, transactional interfaces,
status and engineering-site controls. The external
[clean-copy guide](https://paste.rachel.systems/ukogokijaz.md) informed the review;
the inspected source has SHA-256
`a568ecd85c277768d7b6774d9d4864974f31eb03581bb2dd85397078d734648f`.

## Review the decision and its context

Read a string beside its actual heading, field, value, action and current state.
Remove a caption when those elements already explain it. Remove implementation
commentary and explanations left behind by a repaired bug. If a hint contributes
nothing, remove its element or optional prop as well as its translations.

Use the subject as a functional page heading: Documents, Campaigns and Senders
remain understandable when a redundant introduction is removed. Preserve useful
brand composition, including the approved homepage closing invitation defined by
[the brand contract](BRAND_IDENTITY.md).

Keep information needed to make the current choice: prices and spending caps,
approval, authentication and access requirements, actual destructive effects,
expiry, unsupported modes, units and formats. An empty state needs a useful next
action. An uncertain operation needs its actual recovery path. Put an explanation
that matters only after an error in that error state rather than on every visit.

Technical integration instructions and API errors serve a different reading
context from a form caption. Retain exact field formats, limits, scope, protocol
requirements and actionable recovery. Connected-assistant instructions continue
to enforce [workspace authority](WORKSPACE_ROLES.md), content restrictions and
human approval; a copy review grants no permissions or consent.

## Implementation and evidence

Update all four product languages through their source catalogs. Remove only
confirmed unused rows, then regenerate runtime locale packs and other generated
templates from their authoritative source. Preserve exact user-authored content,
external identifiers, canonical routes, accessible names and associations.

Review batches as `file:line`, the current text, `cut` or the replacement, and the
reason. Record retained explanations where their consequence or invisible scope
matters. Update existing positive test expectations when a heading changes;
preserve the same behavior, authority, accessibility and recovery assertions.
Search every test family, including standalone browser suites and native tests,
for removed text in all four languages. If an optional link is removed, assert
the remaining operational destinations positively. Check required localization
keys and formatting arguments rather than a minimum catalog size.

The [10 November review](CLEAN_COPY_AUDIT.md) records the inspected surfaces,
changes and qualification. Its source, local fixtures, hosted CI and actual
production publication remain separate evidence.
