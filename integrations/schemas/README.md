# Validation schemas

Unmodified Agent Plugins 1.0.0 JSON schemas retrieved on 2026-09-16:

- https://agent-plugins.org/schemas/1.0.0/plugin.schema.json
- https://agent-plugins.org/schemas/1.0.0/mcp.schema.json

`node integrations/build.mjs` validates the portable manifests with the MCP SDK's JSON Schema 2020-12 validator before producing the deterministic ZIP. Schema validity does not validate host account access, external OAuth setup, directory review or successful execution in a real host.

The upstream MCP schema still rejects server `extensions` as of 27 October 2026.
OpenAI nevertheless documents `extensions["com.openai"].auth` in its
[plugin authentication contract](https://developers.openai.com/plugins/build/plugins#configure-mcp-authentication).
The build validates that object separately with the repository-owned
`openai-mcp-extension.schema.json`, then validates the remaining portable object
against the unchanged upstream schema. The local policy permits only the reviewed
public client, branded endpoints and OAuth scopes matching the compatibility
configuration. It rejects embedded credentials, arbitrary extensions and
unqualified dynamic registration modes. This is no claim of upstream schema
support or actual host compatibility.
