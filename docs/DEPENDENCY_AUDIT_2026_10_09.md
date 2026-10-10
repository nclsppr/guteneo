# Dependency audit — 9 October 2026

This candidate updates the application workspace's development/runtime tooling and
one transitive source-map parser. It does not deploy production or alter sending,
identity, tenant, document or approval authority. The scanner and PDF-validator
subprojects have their own lockfiles and are outside this update.

## Changes and evidence

| Package | Before | Candidate | Purpose |
| --- | --- | --- | --- |
| Wrangler | 4.133.0 | 4.149.0 | Use the upstream release with the corrected Miniflare dependency set. |
| Miniflare | 5.20260916.0-alpha | 5.20261006.1-alpha | Match Wrangler exactly, including its workerd runtime. |
| sharp, through Miniflare | 0.35.4 | 0.35.5 | Includes the librsvg security correction. |
| undici, through Miniflare | 7.29.0 | 7.29.1 | Includes the upstream network-client security corrections. |
| source-map-js | 1.2.1 | 1.2.2 | Corrects indexed source-map offset handling. |

Wrangler and Miniflare use explicit matching versions. The lockfile includes
Wrangler's required Workers types peer update and removes the duplicate esbuild
0.28.1 tree because Wrangler now shares the existing 0.28.2 package. No forced
major upgrade, package downgrade or advisory suppression was used.

`npm audit --json` changed from **8 high-severity package entries to 3** in this
workspace. This is a dependency inventory count, not eight separately exploitable
production vulnerabilities. The three remaining entries all derive from the same
MCP OAuth-client advisory; they remain visible to the audit.

Executed on this candidate:

- 57 passing tests across content sanitization, MCP integration and expert status,
  including concurrent acceptance and remaining-budget behavior.
- 3 passing Miniflare tests covering populated D1 migration rollback, postal-window
  migration preservation and dataset runtime behavior.
- TypeScript validation passed. Wrangler 4.149.0 bundled the application Worker
  in a dry run using a temporary static fixture (3,948.13 KiB raw / 880.45 KiB
  gzip). This verifies Worker bundling, not the final web asset release.

The final candidate's complete checks and publication evidence belong in the
release report; these focused results do not establish live supplier delivery,
remote scanner health or production deployment.

## Remaining MCP advisory and reachability

[The SDK's upstream advisory](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-6qxp-vccf-f47h)
concerns OAuth **clients** that connect to a malicious or compromised MCP server
while retaining credentials. It explicitly excludes MCP servers and stdio clients.
The minimum fixed client is `@modelcontextprotocol/client` 2.2.0; the minimum
fixed SDK v1 is `@modelcontextprotocol/sdk` 1.31.0.

In the inspected source, Guteneo's production entry at `apps/api/src/mcp.ts`
imports only `agents/mcp/server` and `@modelcontextprotocol/server`. The Agents
stateless wrapper imports the MCP server transport and no OAuth client. Imports
of `@modelcontextprotocol/client` occur in tests using the in-memory transport;
no direct SDK v1 import or production OAuth-client credential store was found.
This supports **no currently identified production reachability for this
advisory**, not a general statement that the packages are vulnerability-free.

Agents 0.23.0 pins peers to client/server 2.0.0 and SDK 1.30.0. At inspection time,
Agents 0.28.0 retained the same pins. A blind audit fix proposes an Agents
downgrade and does not establish compatibility. Preserve the existing validated
transport in this candidate. A follow-up can qualify updated upstream peer
support or a separately tested migration to the official server handler, with
legacy/stateless transport, OAuth rejection, CORS/host checks, stream teardown,
all tools and assistant-host behavior covered before publication. Do not add a
remote OAuth client without first addressing issuer binding and these versions.

## Runtime distinction

`sharp` and `undici` are development dependencies through Miniflare/Wrangler;
no application import was found. This candidate still patches them because local
and CI runtimes process input and deserve the same dependency hygiene.

`source-map-js` is reachable through PostCSS and `sanitize-html` in the dependency
graph. The observed sanitizer discards customer style attributes and PostCSS's
style parser uses `map: false`; its previous-map constructor exits before loading
a map in that mode. No customer-supplied indexed source-map path was identified.
The compatible 1.2.2 patch is applied regardless.

References checked on 9 October 2026:

- [Wrangler 4.149.0 release](https://github.com/cloudflare/workers-sdk/releases/tag/wrangler%404.149.0)
- [sharp/librsvg advisory](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w)
- [undici WebSocket advisory](https://github.com/nodejs/undici/security/advisories/GHSA-rfgv-xxqx-mfg5)
- [source-map-js 1.2.2 release](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2)
