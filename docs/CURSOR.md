# Cursor: exact local PDF upload

`scripts/cursor-upload.ts` is a local MCP server exposing one tool, `upload_local_pdf`. It reads the original bytes from one explicitly authorized project and uploads them to the same authenticated `POST /api/documents` endpoint used by Guteneo. It returns the durable document ID, SHA-256, byte length, page count and `ready` or `quarantined` status. It neither renders a replacement PDF nor approves an expedition.

The remote Guteneo MCP server remains responsible for preparing and following dispatches. A local filesystem path is never sent to that remote server as though it could read the user's disk.

## Install and configure

Requirements: the repository's Node version, `npm ci`, a running Guteneo instance, and a valid short-lived Guteneo delegated bearer token with `documents:write`. No token is embedded in this repository. Identity and token issuance must first be configured; the adapter does not invent a development token or bypass the server's authorization. It currently requires manually supplying a token acquired through the configured OAuth client and does not refresh it automatically. After expiry, reconnect and update the local environment; a 401/403 produces `AUTH_REQUIRED`.

Set these variables in the environment inherited by Cursor:

| Variable               | Meaning                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| `GUTENEO_PROJECT_ROOT` | Absolute path to the sole authorized document project, ideally a dedicated export folder.            |
| `GUTENEO_URL`          | HTTPS origin of the configured Guteneo instance, without a path, query, fragment or URL credentials. |
| `GUTENEO_ACCESS_TOKEN` | Valid delegated bearer token; never paste it into a shared configuration or commit it.               |

HTTP is accepted only for the exact loopback hostnames `localhost`, `127.0.0.1` and `[::1]` for local development. No production domain is presumed deployed.

Add this entry to the project's `.cursor/mcp.json`, replacing the two absolute installation paths with the local checkout paths. The adapter installation and the allowed document folder may be different directories.

```json
{
  "mcpServers": {
    "guteneo-local-documents": {
      "type": "stdio",
      "command": "node",
      "args": [
        "--import",
        "/ABSOLUTE/PATH/TO/guteneo/node_modules/tsx/dist/loader.mjs",
        "/ABSOLUTE/PATH/TO/guteneo/scripts/cursor-upload.ts"
      ],
      "env": {
        "GUTENEO_PROJECT_ROOT": "${env:GUTENEO_PROJECT_ROOT}",
        "GUTENEO_URL": "${env:GUTENEO_URL}",
        "GUTENEO_ACCESS_TOKEN": "${env:GUTENEO_ACCESS_TOKEN}"
      }
    }
  }
}
```

Restart the MCP entry after changing its environment. In Cursor, inspect the tool arguments and approve the upload. Example request: `Utilise upload_local_pdf pour importer documents/lettre.pdf, puis prépare un fax avec la référence obtenue.` A generated PDF must first be fully written inside the authorized project; an in-memory chat attachment is not a local path. Any dispatch still follows Guteneo's separate human approval flow.

For direct startup from the checkout, with the three variables already configured:

```sh
node --import tsx scripts/cursor-upload.ts
```

The process writes MCP messages only to stdout. Configuration failures write a fixed error code to stderr without the token, path, recipient or document contents.

## Restrictions and integrity

- Only project-relative paths are accepted. Absolute paths, `..`, backslashes, control characters, Windows drive/UNC forms and empty segments are rejected.
- The configured directory is resolved canonically once. Disk root and home-directory root are refused. Every path component is checked; symbolic links, even internal ones, and hard-linked files are refused.
- Only regular files from 5 bytes through 10 MiB are read. PDF magic is required. The API performs full PDF validation and scanning/quarantine; this local check is not an antivirus verdict.
- Reads are bounded and use `O_NOFOLLOW` where available. Device/inode, size and modification metadata are checked before and after reading. Linux additionally resolves the open file descriptor. This is an application boundary, not an operating-system sandbox against another malicious process running as the same user; restrict OS and Cursor permissions accordingly.
- The upload destination comes only from trusted process configuration, never tool arguments. Redirects are forbidden. The request has a 30-second timeout; receipt parsing is bounded to 64 KiB.
- The server receipt's SHA-256 and size must match the exact local bytes. Returned metadata is allowlisted; internal storage keys are not exposed.
- There is no automatic retry after a network failure. An import may already exist; inspect the document list. No physical dispatch occurs in this tool.

## Executed evidence and remaining client validation

On 2026-09-16, `npx vitest run tests/unit/cursor-upload.test.ts --reporter=default` passed **27 tests**. These include an actual child-process stdio initialization, tool discovery and rejected tool invocation with the official SDK; exact valid-PDF multipart bytes through intercepted fetch; symlink/hard-link/path escape cases; size/magic checks; URL and credential validation; integrity mismatch; bounded responses; and absence of token leakage in failures. No live network or paid transport was used.

The adapter and its tests also passed `npx eslint scripts/cursor-upload.ts tests/unit/cursor-upload.test.ts` and strict isolated type checking with `npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --types node --lib ES2022,DOM,DOM.Iterable --strict --skipLibCheck --ignoreConfig scripts/cursor-upload.ts tests/unit/cursor-upload.test.ts`. Whole-project verification is tracked in the central test report. The documented absolute-path `tsx/dist/loader.mjs` entry was resolved successfully in Node.

The fixture creates a real PDF with `pdf-lib` and parses the bytes recovered from the multipart request. The stdio test negotiates the supported legacy revision `2025-11-25`; the adapter's official `serveStdio` entry point also handles current-era opening messages, but current-era interoperability has not been independently exercised in this test.

**Cursor itself has not been opened or authenticated in this environment.** Manual token setup, the actual desktop configuration, macOS/Windows filesystem behavior, a PDF generated by Cursor, and end-to-end authenticated upload to staging still require client qualification. Passing a local MCP protocol test does not establish that qualification.

## Verified references

Checked 2026-09-16:

- [Cursor MCP documentation](https://cursor.com/docs/mcp): local stdio configuration, environment interpolation and tool invocation. The documented transport is implemented; live client behavior is unverified.
- [Official TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk): installed `@modelcontextprotocol/server` **2.0.0**, with package exports and type declarations inspected locally. The code uses `McpServer` from `@modelcontextprotocol/server` and `serveStdio` from `@modelcontextprotocol/server/stdio`. There is no guessed `/node` stdio import.
- SDK deep links for `v2/serving/stdio` and `v2/servers/tools` were inaccessible through the documentation browser during this execution; the installed official README, package exports, type declarations and executed stdio test supply the import/API evidence.
