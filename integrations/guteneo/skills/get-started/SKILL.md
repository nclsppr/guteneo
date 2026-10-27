---
name: get-started
description: Explain how to connect Guteneo and which account features are available when first using the plugin or asking for help getting started. Check capabilities and guide the user to the chosen fax or postal workflow, without importing documents, configuring a sender, granting a mandate, or sending.
---

# Get started with Guteneo

Respect the person's explicit request and choices. Onboarding explains access and next steps; it authorizes no import, setup, transfer or sending.

1. When authentication is needed, offer the host's OAuth flow. Never request passwords, API keys or codes in the conversation. Account authentication and access remain separate from package installation.
2. Once connected, call `get_capabilities` and summarize only the relevant mode, available features and blockers. The call may record connection last use. General service capabilities do not establish this account's permissions.
3. Before requesting content, explain that this workflow excludes PCI DSS payment-card data, protected health information (PHI), government identifiers, authentication secrets and sensitive personal data. When such data is known to be present, do not request import, generation, reading or review, including existing Guteneo documents. Malware scanning does not qualify content under this rule. Ask the person to remove excluded data before sharing a version; never request the excluded values or offer web upload as a bypass. The [privacy policy](https://guteneo.com/privacy/?lang=en#data) explains processing and controls.
4. For preparation, preserve the person's fax or postal choice and read `fax-pdf` or `postal-pdf`; ask for the channel only when ambiguous. Use only available Guteneo tools. For an allowed original, follow the [private PDF transfer contract](references/original-pdf-transfer.md), including the optional explicit device-file picker when actually exposed. Never imply automatic access to a conversation attachment.
5. Explain the standard journey: the person reviews and approves document, recipient and quote in Guteneo. Expert mode requires a prior, bounded, expiring browser-administrator mandate for this OAuth connection. Never activate or extend it, or treat chat agreement as a mandate. Host confirmations and server controls remain mandatory. A `review_prepare_only` quote stops at presentation and cannot be approved or sent.
6. Use existing account access. Never sell subscriptions, services or credits, suggest top-ups/upgrades or create checkout. Explain unavailable authority or balance without opening a transaction. Offer status reading only when it answers the request; onboarding creates no automatic sending or notification.

For distribution through a recipient account with a retention term, use
`secure-distribution` when its tools are available. It requires browser approval
under the active document authentication policy even with an expert mandate.
Never implicitly replace it with the legacy password-protected email link.

For ChatGPT setup, the current ZIP declares Guteneo's public OAuth client in
`mcp.json`; use the host's Connect action and let the person sign in at
`auth.guteneo.com`. Do not ask the person to create an Auth0 application or supply
a secret. If a manually added MCP server or an older saved connection asks for a
client ID, direct them to the public ID and copy control in the
[ChatGPT guide](https://guteneo.com/assistants/chatgpt/?lang=en). The secret stays
empty. Updating a tool catalogue does not guarantee replacement of an older
connection's OAuth configuration. Do not claim open dynamic registration or
successful connection until the host completes OAuth and a read-only capability
call succeeds. A callback mismatch requires support with the exact displayed
callback, never a wildcard or another application's credentials.
