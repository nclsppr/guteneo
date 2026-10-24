# Install Guteneo through MCP

Connect the assistant to Guteneo's MCP server, then sign in with your own Guteneo
account. This does not require a directory-published plugin. Public
[per-application guides](https://guteneo.com/assistants/) cover prerequisites,
setup, a first capability check and troubleshooting:

- [ChatGPT](https://guteneo.com/assistants/chatgpt/)
- [Claude](https://guteneo.com/assistants/claude/)
- [Grok](https://guteneo.com/assistants/grok/)
- [GitHub Copilot in VS Code or CLI](https://guteneo.com/assistants/copilot/)
- [Microsoft 365 Copilot administrator setup](https://guteneo.com/assistants/microsoft365/)
- [Cursor](https://guteneo.com/assistants/cursor/)

Server: **https://guteneo.com/mcp**. Connection and permission review happen in the
assistant. ChatGPT's Plugins menu also supports a custom MCP connection. After a
successful Guteneo tool call, open Assistants in your workspace to see the last
successful exchange timestamp.

## Directory plugins and direct use

No Guteneo directory plugin is currently claimed published; use the MCP guides.
The developer package supports manual installation. You may also
[prepare directly in Guteneo](https://guteneo.com/#/app/prepare?entry=direct).
Both journeys preserve document, recipient and cost checks. Expert mode is a
separate bounded, revocable administrator option. Public preview is isolated
fictional demonstration, without actual login, authority or communication.
Product logos identify their owners and imply no partnership.

## Claude.ai web and Desktop

1. Create your own account on https://guteneo.com, verify email and sign in once
   in the browser.
2. Copy the public client ID `IhJieRsvZBAnl1uJO125X2SPoIHxT8ed`.
3. Open [Connect to Claude](https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Guteneo&connectorUrl=https%3A%2F%2Fguteneo.com%2Fmcp),
   which prefills the name/server. Alternatively use Customize → Connectors →
   Add custom connector and enter Guteneo plus the server URL.
4. Select **Use your own OAuth client**, paste Client ID and leave Client secret
   empty. Add the connector, sign in to your own Guteneo account and review scopes.
5. Enable Guteneo in the conversation. Ask only for `get_capabilities` to verify
   connection without reading documents or sending.

The public ID is not a secret and grants no access to another account. No Auth0
application creation is required. The link prefills a form; it neither installs
nor grants permissions for you.

On Team/Enterprise, the owner first adds the connector to organization settings;
each member then connects their own Guteneo account. Remote MCP passes through
Anthropic infrastructure even from Desktop. Upload the original PDF yourself in
Guteneo, then retrieve it in conversation; implicit computer-file or attachment
access is not promised.

After expiry, reconnect through Claude's connector settings. After Guteneo
revocation, first rebind the assistant to your organization in Connect an
assistant, then reconnect in Claude. Claude Code configuration templates concern
the terminal client and do not install the Claude.ai connector.

Sources: [Claude install links](https://claude.com/docs/connectors/building/directory-vs-custom#share-an-install-link),
[custom remote connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).
