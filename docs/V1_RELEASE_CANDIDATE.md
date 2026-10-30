# Guteneo 1.0.0 — qualification candidate

This work prepares web, MCP and integration packages 1.0.0 from `5e4c758`.
Record executed proof/external limits before review; preparation is not publication.

## Version contract

Root `package.json` owns app version. HTTP capabilities, MCP `serverInfo` and
public build share `packages/contracts/src/release.ts`. MCP protocol version and
immutable source/package hashes remain separate. Release verification also compares
`release.json` version.

Build rejects portable-manifest/Claude/Cursor/application version divergence,
private app bindings in public-upload manifests and differing compatibility MCP
endpoint. Existing public OpenAI identity stays. Packages prove no production
server version.

## Quality scope

- Prevent stale web responses/resource display after path/account/workspace changes.
- Recheck current authority and AI data consent before returning model proposals.
- Qualify dependency security updates and bound MCP transport/validation input.
- Build reproducible ChatGPT/Claude archives with their own instructions and explicit prerequisites.

Four human roles, authenticated tenant, immutable approval/ceilings, closed
unqualified services and no automatic retry after unknown outcomes remain invariant.

## Dependencies and MCP protection

23 October npm audit prompted MCP client/server 2.3.1, compatibility SDK 1.32.1,
Agents 0.30.0, Hono 4.13.13, sanitize-html 2.18.1, plus DOMPurify, ip-address,
Vite/Vitest lockfile updates. Full post-update audit found no known vulnerability.
CI now rejects high/critical findings through `npm run audit:dependencies`; this
is dated registry-dependent evidence.

[MCP input advisory](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-46jr-4wx8-v453)
also requires explicit limits. Candidate bounds arguments to 120,000 elements,
retaining 100,000 business cells/rows/envelope, and MCP body to 2 MiB. Per-request
servers follow [SDK isolation advisory](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-jm63-cq47-j5jp).
Authentication/request budgets precede operations. No instance setting, activation
or free-cost assumption is added.

## Evidence and availability

Local synthetic tests prove no real send, OAuth renewal or post-release Claude/
ChatGPT journey. Preserve actual error/unexecuted/inactive states. Authorized
OpenAI 0.3.5 follow-up continues on its existing archive; 1.0.0 does not silently
replace it. Public OpenAI plugin still needs portal command restoration. Distinguish
hosted Claude.ai connector, Claude Code package and Anthropic directory publication.

## Executed local qualification — 23 October 2026

`npm test`: **2,125 Vitest cases/111 files and 328 Node security cases passed**, no
failure/skip. Typecheck, lint, 67-tool annotation audit, atlas synchronization and
application/Worker dry-run build passed. Nine focused browser regressions passed
across desktop Chromium, Android Chromium and iPhone WebKit with synthetic data.
Focused cases overlap these suites and are not added to totals. Final-commit CI
remains independent.

External qualification remains: existing OpenAI configuration, actual Claude Code
OAuth, served version, guarded channels/billing and remote backup restoration.
Local restore/archive preparation is no service acceptance proof. See
[tests](TEST_RESULTS.md), [Claude package](CLAUDE_PLUGIN.md), [release procedure](MAIN_RELEASE.md).

## Production transition

After review/exact-commit CI, obtain this candidate's merge/publication authority,
build clean `main` equal to fresh `origin/main`, publish normally and verify public
bytes/hashes. Then qualify each host with actually consented rights, without
implicit authority expansion or mandate activation.

Claude Code 2.1.309 strict format validation passed for both dedicated archives.
Anthropic-directory publication still needs owner license selection:
`LICENSE_MISSING`. No repository license was invented. Local loading/OAuth differ
from public submission.

Real communications, paid services, new access configuration and legal attestations
remain separate decisions. Automation guarantees neither zero defects nor directory
acceptance.
