---
name: saved-recipients
description: Find, save, revise or remove a Guteneo workspace recipient when explicitly requested. Reuse a saved fax, email or postal destination without treating it as consent to communicate.
---

Before using this skill, read the [Claude host contract](../../references/claude-host.md). Use the connected Guteneo tools and preserve the host’s permission prompts.

# Saved recipients

Use only tools actually exposed by the connected Guteneo server. Read
`get_capabilities` and preserve the current account, workspace, membership and
consented scopes. This workflow excludes payment-card data covered by PCI DSS,
protected health information, government identifiers, authentication secrets and
sensitive personal data. Explain that limit before requesting data; never read
known excluded content or suggest another import path as a bypass.

1. On a request to find an existing destination, use `list_saved_recipients`
   with bounded pagination and `get_saved_recipient` for the selected ID. Ask
   the person to choose when labels are ambiguous. Do not enumerate unrelated
   contacts or infer an address from a person's name.
2. Save a contact only on an explicit request to save it. Call `save_recipient`
   with `value:{label,channel,recipient}` and one stable `idempotencyKey` for
   those exact values. Channels are fax, email and postal. Saving creates no
   dispatch, recipient consent or approval. Preserve exact printed postal lines.
3. For an explicitly requested correction, read the selected contact and call
   `update_saved_recipient` with its `recipientId`, `expectedRevision` and complete
   `value`. A revision conflict requires a fresh read and review of the intended
   correction; do not silently overwrite a concurrent edit.
4. Delete only an explicitly selected contact with `delete_saved_recipient`
   and its current `expectedRevision`. An old creation key cannot resurrect a
   deleted contact. Deleting or changing a contact never changes an already
   prepared dispatch or its immutable approval.
5. For preparation, copy the selected current destination into the ordinary
   fax, email or postal workflow. Confirm an ambiguous choice. A saved entry
   proves neither that this recipient requested an email nor that a human
   approved its contents, options or cost. Keep browser review, provider gates,
   expert mandate bounds and host confirmations in their existing workflows.

After uncertainty, keep the same key and exact creation values or reread the
same selected contact/revision. Do not create duplicates to bypass a conflict.
Report only the relevant contact result; never put the directory, recipients,
tokens or private URLs into diagnostic logs.
