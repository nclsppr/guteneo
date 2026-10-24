import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

export const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 64 * 1024;

export class UploadError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
function fail(code: string, message: string): never {
  throw new UploadError(code, message);
}
function inside(root: string, filename: string): boolean {
  const relative = path.relative(root, filename);
  return (
    relative !== "" &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  );
}

export interface UploadConfig {
  /** Canonical project path pinned at startup by loadUploadConfig. */
  projectRoot: string;
  origin: string;
  accessToken: string;
}
export async function loadUploadConfig(
  env: NodeJS.ProcessEnv = process.env,
): Promise<UploadConfig> {
  const configuredRoot = env.GUTENEO_PROJECT_ROOT;
  if (!configuredRoot || !path.isAbsolute(configuredRoot))
    fail(
      "ROOT_REQUIRED",
      "GUTENEO_PROJECT_ROOT must identify an absolute project directory.",
    );
  let projectRoot: string;
  try {
    projectRoot = await realpath(configuredRoot);
    if (!(await stat(projectRoot)).isDirectory())
      fail("ROOT_INVALID", "The project directory is invalid.");
  } catch {
    fail("ROOT_INVALID", "The project directory is inaccessible.");
  }
  if (
    projectRoot === path.parse(projectRoot).root ||
    projectRoot === (await realpath(homedir()))
  ) {
    fail(
      "ROOT_TOO_BROAD",
      "Choose a project directory, not the disk root or your home directory.",
    );
  }
  let url: URL;
  try {
    url = new URL(env.GUTENEO_URL ?? "");
  } catch {
    fail("URL_INVALID", "GUTENEO_URL must be an explicit HTTPS origin.");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    fail(
      "URL_INVALID",
      "Use an HTTPS origin without credentials or a path; HTTP is restricted to localhost.",
    );
  }
  const accessToken = env.GUTENEO_ACCESS_TOKEN ?? "";
  if (!accessToken || accessToken.length > 16384 || /\s/.test(accessToken))
    fail(
      "TOKEN_REQUIRED",
      "GUTENEO_ACCESS_TOKEN is required and must be a valid token.",
    );
  return { projectRoot, origin: url.origin, accessToken };
}

/** All components are checked, including directories; no symbolic-link traversal is allowed. */
async function checkedPath(root: string, input: string): Promise<string> {
  if (
    !input ||
    input.length > 2048 ||
    path.isAbsolute(input) ||
    path.win32.isAbsolute(input) ||
    /[\\\x00-\x1f\x7f]/.test(input)
  ) {
    fail(
      "PATH_DENIED",
      "The PDF path must be relative to the authorised project.",
    );
  }
  const parts = input.split("/");
  if (
    parts.some(
      (part) => !part || part === "." || part === ".." || part.includes(":"),
    )
  )
    fail("PATH_DENIED", "The path contains a forbidden segment.");
  const target = path.resolve(root, ...parts);
  if (!inside(root, target))
    fail("PATH_DENIED", "The file is outside the authorised project.");
  let current = root;
  try {
    if ((await realpath(root)) !== root)
      fail(
        "PATH_CHANGED",
        "The project directory changed; restart the connection.",
      );
    for (let index = 0; index < parts.length; index++) {
      current = path.join(current, parts[index]);
      const entry = await lstat(current);
      if (entry.isSymbolicLink())
        fail("SYMLINK_DENIED", "Symbolic links are not allowed.");
      if (index < parts.length - 1 && !entry.isDirectory())
        fail("PATH_DENIED", "The path does not identify a project file.");
    }
    if ((await realpath(target)) !== target)
      fail("SYMLINK_DENIED", "Symbolic links are not allowed.");
  } catch (error) {
    if (error instanceof UploadError) throw error;
    fail(
      "FILE_UNAVAILABLE",
      "The file is inaccessible within the authorised project.",
    );
  }
  return target;
}

export async function readProjectPdf(
  root: string,
  input: string,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; name: string; sha256: string }> {
  const target = await checkedPath(root, input);
  let handle;
  try {
    handle = await open(
      target,
      constants.O_RDONLY |
        (constants.O_NOFOLLOW ?? 0) |
        (constants.O_NONBLOCK ?? 0),
    );
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.nlink !== 1n)
      fail(
        "FILE_TYPE_DENIED",
        "A regular file without hard links is required.",
      );
    if (before.size < 5n || before.size > BigInt(MAX_PDF_BYTES))
      fail("PDF_SIZE", "The PDF must contain at most 10 MiB.");
    // On Linux, inspect the opened descriptor as well as the path to resist parent-directory swaps.
    if (process.platform === "linux") {
      const openedPath = await realpath(`/proc/self/fd/${handle.fd}`);
      if (openedPath !== target || !inside(root, openedPath))
        fail("PATH_CHANGED", "The file changed while being opened.");
    }
    const bytes = new Uint8Array(Number(before.size));
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (!bytesRead)
        fail(
          "FILE_CHANGED",
          "The file changed during reading. Retry after generation finishes.",
        );
      offset += bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    await checkedPath(root, input);
    const current = await stat(target, { bigint: true });
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      current.dev !== after.dev ||
      current.ino !== after.ino
    ) {
      fail(
        "FILE_CHANGED",
        "The file changed during reading. Retry after generation finishes.",
      );
    }
    if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-")
      fail("NOT_PDF", "File content does not start with a PDF signature.");
    return {
      bytes,
      name: path.basename(target),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  } catch (error) {
    if (error instanceof UploadError) throw error;
    return fail(
      "FILE_UNAVAILABLE",
      "The PDF is inaccessible or changed during reading.",
    );
  } finally {
    await handle?.close();
  }
}

const documentResponse = z
  .object({
    id: z.string().min(1).max(200),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    size: z.number().int().positive().max(MAX_PDF_BYTES),
    // Hosted uploads stay unparsed until a trusted scan, so quarantine has no page count yet.
    pages: z.number().int().nonnegative(),
    status: z.enum(["ready", "quarantined"]),
  })
  .refine((document) => document.status !== "ready" || document.pages > 0);
export type UploadResult = {
  document_id: string;
  sha256: string;
  size: number;
  pages: number;
  status: "ready" | "quarantined";
};
export class CursorUploader {
  constructor(
    private readonly config: UploadConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  async upload(relativePath: string): Promise<UploadResult> {
    const { bytes, name, sha256 } = await readProjectPdf(
      this.config.projectRoot,
      relativePath,
    );
    const body = new FormData();
    body.set("file", new File([bytes], name, { type: "application/pdf" }));
    let response: Response;
    try {
      response = await this.fetcher(
        new URL("/api/documents", this.config.origin),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.accessToken}`,
            Accept: "application/json",
          },
          body,
          redirect: "error",
          signal: AbortSignal.timeout(30000),
        },
      );
    } catch {
      fail(
        "UPLOAD_UNCONFIRMED",
        "The import response was not received. Check Guteneo documents before retrying.",
      );
    }
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 401 || response.status === 403)
        fail(
          "AUTH_REQUIRED",
          "Reconnect your account with the documents:write scope.",
        );
      fail(
        "UPLOAD_REJECTED",
        `Guteneo refused the import (HTTP ${response.status}). Check the dashboard.`,
      );
    }
    const reader = response.body?.getReader();
    if (!reader)
      fail(
        "RESPONSE_INVALID",
        "Guteneo returned no verifiable document reference.",
      );
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        length += result.value.length;
        if (length > MAX_RESPONSE_BYTES)
          fail(
            "RESPONSE_INVALID",
            "The import response exceeds the allowed size.",
          );
        chunks.push(result.value);
      }
    } finally {
      await reader.cancel();
    }
    const joined = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.length;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(joined));
    } catch {
      fail("RESPONSE_INVALID", "The import response is invalid.");
    }
    const result = documentResponse.safeParse(parsed);
    if (!result.success)
      fail(
        "RESPONSE_INVALID",
        "Guteneo returned no verifiable document reference.",
      );
    if (result.data.sha256 !== sha256 || result.data.size !== bytes.length)
      fail(
        "INTEGRITY_MISMATCH",
        "The imported document’s hash or size does not match the local PDF.",
      );
    return {
      document_id: result.data.id,
      sha256,
      size: result.data.size,
      pages: result.data.pages,
      status: result.data.status,
    };
  }
}

export function createCursorServer(uploader: CursorUploader): McpServer {
  const server = new McpServer({
    name: "guteneo-local-documents",
    version: "0.1.0",
  });
  server.registerTool(
    "upload_local_pdf",
    {
      title: "Import an exact PDF from this project",
      description:
        "Transfer exact local PDF bytes to Guteneo without reconstruction. The path is relative to the single authorised project. Return a durable reference, hash and quarantine status. This tool prepares, confirms and sends no dispatch.",
      inputSchema: z
        .object({
          path: z
            .string()
            .min(1)
            .max(2048)
            .describe(
              "Project-relative path, for example documents/letter.pdf; no symbolic links.",
            ),
        })
        .strict(),
      outputSchema: z
        .object({
          document_id: z.string(),
          sha256: z.string(),
          size: z.number().int(),
          pages: z.number().int(),
          status: z.enum(["ready", "quarantined"]),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ path: relativePath }) => {
      try {
        const result = await uploader.upload(relativePath);
        return {
          structuredContent: result,
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      } catch (error) {
        const safe =
          error instanceof UploadError
            ? error
            : new UploadError(
                "UPLOAD_FAILED",
                "Import failed. No dispatch was prepared.",
              );
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: { code: safe.code, message: safe.message },
              }),
            },
          ],
        };
      }
    },
  );
  return server;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  loadUploadConfig()
    .then((config) => {
      // stdout is reserved for MCP messages. Diagnostic text never includes configuration or secrets.
      serveStdio(() => createCursorServer(new CursorUploader(config)), {
        onerror: () =>
          process.stderr.write("Guteneo: erreur de transport MCP.\n"),
      });
    })
    .catch((error) => {
      const code = error instanceof UploadError ? error.code : "STARTUP_FAILED";
      process.stderr.write(
        `Guteneo: configuration refused (${code}). See docs/CURSOR.md.\n`,
      );
      process.exitCode = 1;
    });
}
