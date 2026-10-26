# Claude directory publication and resumption

This is the repository-only resumption record for Guteneo's remote MCP connector
submission. It does not publish the connector or grant release authority. The
[installation and MCP/package maintenance contract](LLM_SETUP.md),
[Claude qualification record](CLAUDE_QUALIFICATION.md) and
[main release procedure](MAIN_RELEASE.md) own their respective rules.

## Portal observation — 26 October 2026

The publisher's Pro account was verified in the actual Claude account. The
[developer portal](https://claude.ai/directory/manage) initially showed **zero
submissions**. The existing custom Guteneo connector was selected for a new
**MCP connector** entry rather than creating another private connector. It exposed
**75 tools and four prompts** during this observation. Conditional diagnostic
tools and local catalog tests are separate from that observed set.

| Step                        | Observed state                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Connection and tools        | Existing Guteneo custom connector selected. The scan showed one schema issue and 75 title suggestions; the [compatibility candidate](LLM_SETUP.md#directory-compatibility-candidate--26-october-2026) records the source response and limits.                                                                                                                      |
| Listing                     | Name, public copy, categories, documentation/privacy/support links and icon entered.                                                                                                                                                                                                                                                                               |
| Use cases                   | Three use cases and setup/access details entered.                                                                                                                                                                                                                                                                                                                  |
| Company                     | Guteneo and its public website entered, with the actual developer/maintainer as the primary contact. No Anthropic contact was invented.                                                                                                                                                                                                                            |
| Authentication              | Existing hosted-Claude public OAuth client ID entered; no client secret supplied. This does not qualify fresh consent, renewal or every tool.                                                                                                                                                                                                                      |
| Bounded actual-client proof | In Claude Pro on 26 October 2026, one `get_capabilities` call was approved with **Allow once**. Its expanded raw trace returned `{ "ok": true, "data": { "name": "Guteneo", "version": "1.1.5", "mode": "production", "simulation": false } }`. No document, sending, template or dataset tool was exercised. This does not qualify a newer catalog or every tool. |
| Data handling               | Own API; no sponsored content. Health-data handling selected **Other / depends on configuration**, with the explanation below.                                                                                                                                                                                                                                     |
| Test and launch             | Self-tested confirmation left unchecked. Complete Inspector/Claude evidence for the observed tools is missing. Reviewer access is still pending.                                                                                                                                                                                                                   |
| Compliance                  | All seven acknowledgments left unchecked; no claim of completed policy attestation.                                                                                                                                                                                                                                                                                |
| Submission and publication  | No submission, approval or public listing established by this observation.                                                                                                                                                                                                                                                                                         |

The health-data explanation describes a general-purpose private document service:
user-selected PDFs or supplied content can contain personal data, but the connector
does not identify, infer or validate health status and claims no healthcare workflow
or HIPAA qualification. Reviewer material must be synthetic. The privacy policy
describes handling and retention; this answer does not override the
[packaged content exclusions](../integrations/guteneo/README.md#features-and-access).

**Save and exit did not establish a backend-saved draft.** The portal explicitly
displayed “Draft kept in this tab until you close it”. Preserve that browser tab
and treat the filled fields as transient. A separate nonsecret JSON copy outside
the repository preserves the listing answers; it is a reconstruction aid, not
portal persistence or submission evidence.

## Reviewer-account preparation — 26 October 2026

The publisher explicitly authorized creation of a dedicated Guteneo account for
Claude reviewers. Auth0 CLI reauthentication completed, and an authenticated
`GET tenants/settings` confirmed access to the configured Guteneo tenant before
the account was created in `Guteneo-Accounts`. Its initial flags were
`email_verified: false` and `verify_email: false`.

A D1 `prepare_only` restriction was installed for the canonical issuer and exact
account subject, then read back with a matching count of one. No mandate, channel
or credit was granted. A subsequent Auth0 `verification_email` job completed,
and the confirmation email was observed in the publisher-owned review mailbox.
Address verification is still pending the publisher's confirmation action.

Two synthetic input fixtures are prepared outside the repository but have not
been uploaded. Workspace setup, sample seeding and actual reviewer access
qualification remain pending. No reviewer credentials have been shared with
Anthropic in this work. Keep credentials out of source control and listing
backups; use the portal's designated private reviewer fields only after the
account and access are qualified.

## Public links checked during preparation

These canonical public resources returned HTTP 200 on 26 October 2026. HTTP
availability does not prove the connector's authenticated runtime or directory
acceptance.

| Material        | Public URL                                       |
| --------------- | ------------------------------------------------ |
| Documentation   | <https://guteneo.com/assistants/claude/?lang=en> |
| Privacy         | <https://guteneo.com/privacy/?lang=en>           |
| Support         | <https://guteneo.com/support/?lang=en>           |
| Icon            | <https://guteneo.com/brand/guteneo-mark.png>     |
| Company website | <https://guteneo.com>                            |

## Ordered resumption checklist

1. **Recover the actual portal state.** Keep the current tab open. Inspect the
   portal for an existing entry before starting another submission; if its fields
   are lost, use the external nonsecret listing copy to reconstruct them. Never
   describe browser-tab retention as a backend-saved draft.
2. **Complete the source release prerequisites.** Review the combined MCP,
   package and documentation changes, open/update the source PR, and obtain
   exact-head CI evidence. Confirm explicit authorization for merge and production
   deployment before those actions, then follow the existing
   [release procedure](MAIN_RELEASE.md). Directory preparation does not bypass
   those independent gates.
3. **Resynchronize the released catalog.** Reconnect the exact live server in the
   portal and inspect its current titles, descriptions, input schemas and actual
   tool set. A local test or candidate archive does not prove that the served
   catalog changed or that the scan passed.
4. **Qualify isolated reviewer access.** Use a dedicated, populated review account
   with synthetic data and bounded authority. Complete the created account's
   pending address verification, workspace setup and synthetic sample seeding.
   Record each exposed tool's
   Inspector and Claude result, required setup and recovery. Preserve approval
   and provider gates; do not send a real communication or enable a mandate to
   complete a test checkbox. Historical partial host evidence does not replace
   this catalog-wide qualification.
5. **Complete private reviewer instructions.** Supply only the qualified review
   account and exact access steps in the designated portal fields. Verify the
   account can reach the promised sample data. Check the self-tested confirmation
   only when the recorded evidence supports its actual wording.
6. **Resolve policy attestations with the publisher.** Review the current seven
   acknowledgments and the [directory policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy)
   against the actual functionality and data handling. Obtain the publisher's
   confirmation for the legal acknowledgments; leave unsupported claims unchecked.
7. **Submit and verify the resulting state.** Review the exact completed form,
   submit under the authorized publication request, and capture the portal's
   returned record and status. Follow review feedback or the portal's publication
   step. Verify the exact public listing and its displayed details before saying
   Guteneo is published; distinguish submission, scan, approval and listing.

The official [submission guide](https://claude.com/docs/connectors/building/submission)
and [access requirements](https://claude.com/docs/directory/publish) were checked
on 26 October 2026. Recheck them and the live portal when resuming; this dated
record is not an alternative source of current policy.
