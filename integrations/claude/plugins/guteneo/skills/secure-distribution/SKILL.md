---
name: secure-distribution
description: Prepare, track or revoke an account-protected Guteneo PDF distribution with a defined retention term, optional original download and authorized personal copy. Use when the user requests secure document delivery with a recipient account, distinct from the legacy password-protected email link.
---

Before using this skill, read the [Claude host contract](../../references/claude-host.md). Use the connected Guteneo tools and preserve the host’s permission prompts.

# Guteneo secure distribution

Use the connected Guteneo MCP and its current capabilities. This workflow
prepares distribution from a workspace; it never accesses the recipient’s
personal vault or claims to have verified their identity.

1. Read `get_capabilities`. If secure tools or the service are unavailable,
   explain the blocker without silently switching to a public link, password or
   attachment.
2. Respect the plugin’s document exclusions: PCI DSS payment-card data,
   protected health information, government identifiers, authentication secrets
   and sensitive personal data. Antivirus scanning does not qualify these
   categories. Use an existing ready PDF or the original actually supplied by
   the host. Never invent a file transfer or publish a document to import it.
3. Collect the recipient’s address and optional name, PDF, sharing term,
   optional original-download permission, then any authorization for a personal
   copy and its term. Explain that a delivered personal copy is independent of
   later revocation of the share.
4. Call `prepare_secure_distribution` with a stable key. Preparation sends
   nothing. For `preparing`, query `get_secure_distribution` with the same
   identifier; never create a second preparation. Present the exact EUR quote
   excluding tax: shared retention, any personal retention, notification and
   total. Never invent a price.
5. Before activation, explain that the funded term is non-refundable even if
   the workspace disables sharing before expiry. Have the person open
   `approvalUrl` to review content, recipient, rights and price in the Guteneo
   browser under the active document authentication policy. Neither chat consent
   nor an expert mandate replaces this specific approval.
6. After recorded browser approval, call `confirm_secure_distribution` with
   the identifier and a stable key, subject to host confirmations. After a lost
   or uncertain outcome, query the same identifier without a new command or
   automatic new sending. Preparation-only review accounts retain their
   restrictions.
7. Use `list_secure_distributions` or `get_secure_distribution` for tracking.
   Distinguish browser-reported display, requested download and started
   transmission. Do not claim complete reading, a file saved to disk, printing
   or detected screenshot capture.
8. If the person requests revocation, explain its effect and call
   `revoke_secure_distribution` in the current workspace. It blocks future
   share access; it neither recovers an exported copy, deletes a personal copy
   already delivered nor refunds funded retention.

Initial recipient binding and confirmation of an independent channel remain
in the workspace browser. Never request a passkey, password, email code or
account recovery in chat. Never list, claim, export or associate personal
documents through workspace tools. Installation grants no extra permission,
purchase, subscription or mandate.
