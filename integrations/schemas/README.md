# Validation schemas

Unmodified Agent Plugins 1.0.0 JSON schemas retrieved on 2026-09-16:

- https://agent-plugins.org/schemas/1.0.0/plugin.schema.json
- https://agent-plugins.org/schemas/1.0.0/mcp.schema.json

`node integrations/build.mjs` validates the portable manifests with the MCP SDK's JSON Schema 2020-12 validator before producing the deterministic ZIP. Schema validity does not validate host account access, external OAuth setup, directory review or successful execution in a real host.
