---
name: secure-distribution
description: Prepare, track or revoke an account-protected Guteneo PDF distribution with a defined retention term, optional original download and authorized personal copy. Use when the user requests secure document delivery with a recipient account, distinct from the legacy password-protected email link.
---

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
4. Call `prepare_secure_distribution` with a stable key. Subject, message and HTML are optional: omitted content uses the V2 template and authenticated workspace name. A custom HTML anchor may use `href="{{document_url}}"` to position its own button. `recipientBinding` defaults to `verified_email`; choose `independent` only when separate workspace confirmation is intended. Preparation sends
   nothing. For `preparing`, query `get_secure_distribution` with the same
   identifier; never create a second preparation. Present the exact EUR quote
   excluding tax: shared retention, any personal retention, notification and
   total. Never invent a price.
5. Before activation, explain that the funded term is non-refundable even if
   the workspace disables sharing before expiry. Have the person open
   `approvalUrl` to review content, recipient, rights and price in the Guteneo
   browser. Under `verified_account`, the current verified session is reused; no
   separate document authentication is required while it remains valid. The
   explicit `strong` policy retains its step-up requirements. Neither chat consent
   nor an expert mandate replaces this specific approval. If the quote expires,
   direct the person to Refresh quote in that same browser review. Guteneo
   supersedes only an unsubmitted preparation and opens a replacement for fresh
   human review; use the replacement identifier afterwards. Never extend a quote,
   infer approval or recreate an uncertain or already accepted distribution.
6. The browser final **Send** action records human approval and activation.
   Query `get_secure_distribution` afterwards: if `active`, continue directly to
   tracking, without requesting another chat confirmation or sending command.
   Only if it remains `prepared` with recorded approval, use the compatibility
   `confirm_secure_distribution` operation with the identifier and a stable key,
   subject to host confirmations. After a lost
   or uncertain outcome, query the same identifier without a new command or
   automatic new sending. Preparation-only review accounts retain their
   restrictions.
7. Use `list_secure_distributions` or `get_secure_distribution` for tracking.
   Distinguish browser-reported display, requested download and started
   transmission. Do not claim complete reading, a file saved to disk, printing
   or detected screenshot capture. `recipientFeedback` records unsubscribe/report
   separately from delivery and access; it blocks future email from that workspace
   without revoking existing document rights. Never exercise mailbox controls or
   expose their URLs through tools.
8. If the person requests revocation, explain its effect and call
   `revoke_secure_distribution` in the current workspace. It blocks future
   share access; it neither recovers an exported copy, deletes a personal copy
   already delivered nor refunds funded retention.

The invitation opens **My documents**, with sign-in or signup when needed. Under `verified_email`, the server binds the matching verified address to the stable authenticated account at claim, without a separate document password. Historical policies without this field and explicit `independent` policies retain workspace-browser confirmation. This is verified address possession, never proof of physical identity. Never request a passkey, password, email code or
account recovery in chat. Never list, claim, export or associate personal
documents through workspace tools. Installation grants no extra permission,
purchase, subscription or mandate.
