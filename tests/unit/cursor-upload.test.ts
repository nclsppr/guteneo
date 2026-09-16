import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  link,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  truncate,
  writeFile,
} from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  CursorUploader,
  loadUploadConfig,
  MAX_PDF_BYTES,
  readProjectPdf,
  type UploadConfig,
} from "../../scripts/cursor-upload";

let temp: string;
let projectRoot: string;
let bytes: Uint8Array<ArrayBuffer>;
let config: UploadConfig;
beforeEach(async () => {
  temp = await mkdtemp(path.join(tmpdir(), "guteneo-cursor-"));
  projectRoot = path.join(temp, "project");
  await mkdir(path.join(projectRoot, "documents"), { recursive: true });
  const pdf = await PDFDocument.create();
  pdf.addPage([210, 297]);
  bytes = new Uint8Array(await pdf.save());
  await writeFile(path.join(projectRoot, "documents", "original.pdf"), bytes);
  config = {
    projectRoot,
    origin: "https://guteneo.example",
    accessToken: "secret-test-token",
  };
});
afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});
const envFor = (overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  GUTENEO_PROJECT_ROOT: projectRoot,
  GUTENEO_URL: config.origin,
  GUTENEO_ACCESS_TOKEN: config.accessToken,
  ...overrides,
});
function goodResponse(overrides: Record<string, unknown> = {}) {
  return Response.json({
    id: "doc_test",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    size: bytes.length,
    pages: 1,
    status: "quarantined",
    ...overrides,
  });
}

describe("Cursor project-scoped local upload", () => {
  it("uploads the exact original PDF as authenticated multipart and returns only verified metadata", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      expect(String(url)).toBe("https://guteneo.example/api/documents");
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        "Bearer secret-test-token",
      );
      expect(init?.redirect).toBe("error");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      const request = new Request(url, init);
      const data = await request.formData();
      expect([...data.keys()]).toEqual(["file"]);
      const file = data.get("file") as File;
      expect(file.name).toBe("original.pdf");
      expect(file.type).toBe("application/pdf");
      expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes);
      const parsed = await PDFDocument.load(await file.arrayBuffer());
      expect(parsed.getPageCount()).toBe(1);
      return goodResponse({
        storage_key: "must-not-leak",
        organization_id: "must-not-leak",
      });
    });
    const result = await new CursorUploader(config, fetcher).upload(
      "documents/original.pdf",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      document_id: "doc_test",
      sha256: createHash("sha256").update(bytes).digest("hex"),
      size: bytes.length,
      pages: 1,
      status: "quarantined",
    });
  });

  it.each([
    "../outside.pdf",
    "documents/../../outside.pdf",
    "/etc/passwd",
    "C:\\private\\secret.pdf",
    "\\\\server\\share.pdf",
    "documents/../original.pdf",
    "documents\\original.pdf",
    "documents/original.pdf\n",
    "documents//original.pdf",
  ])(
    "blocks unsafe path %j before any network request",
    async (relativePath) => {
      const fetcher = vi.fn<typeof fetch>();
      await expect(
        new CursorUploader(config, fetcher).upload(relativePath),
      ).rejects.toMatchObject({ code: "PATH_DENIED" });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("blocks a file symlink outside the project", async () => {
    await writeFile(path.join(temp, "outside.pdf"), bytes);
    await symlink(
      path.join(temp, "outside.pdf"),
      path.join(projectRoot, "escape.pdf"),
    );
    await expect(
      readProjectPdf(projectRoot, "escape.pdf"),
    ).rejects.toMatchObject({ code: "SYMLINK_DENIED" });
  });

  it("blocks a parent directory symlink and even an internal symlink", async () => {
    await mkdir(path.join(temp, "outside"));
    await writeFile(path.join(temp, "outside", "secret.pdf"), bytes);
    await symlink(
      path.join(temp, "outside"),
      path.join(projectRoot, "escaped-directory"),
    );
    await expect(
      readProjectPdf(projectRoot, "escaped-directory/secret.pdf"),
    ).rejects.toMatchObject({ code: "SYMLINK_DENIED" });
    await symlink(
      path.join(projectRoot, "documents", "original.pdf"),
      path.join(projectRoot, "inside.pdf"),
    );
    await expect(
      readProjectPdf(projectRoot, "inside.pdf"),
    ).rejects.toMatchObject({ code: "SYMLINK_DENIED" });
  });

  it("blocks a hard-linked file outside the project", async () => {
    await writeFile(path.join(temp, "outside.pdf"), bytes);
    await link(
      path.join(temp, "outside.pdf"),
      path.join(projectRoot, "linked.pdf"),
    );
    await expect(
      readProjectPdf(projectRoot, "linked.pdf"),
    ).rejects.toMatchObject({ code: "FILE_TYPE_DENIED" });
  });

  it("rejects a directory, invalid magic and a file larger than 10 MiB", async () => {
    await expect(
      readProjectPdf(projectRoot, "documents"),
    ).rejects.toMatchObject({ code: "FILE_TYPE_DENIED" });
    await writeFile(
      path.join(projectRoot, "fake.pdf"),
      "<html>not a PDF</html>",
    );
    await expect(readProjectPdf(projectRoot, "fake.pdf")).rejects.toMatchObject(
      { code: "NOT_PDF" },
    );
    await writeFile(path.join(projectRoot, "huge.pdf"), "%PDF-");
    await truncate(path.join(projectRoot, "huge.pdf"), MAX_PDF_BYTES + 1);
    await expect(readProjectPdf(projectRoot, "huge.pdf")).rejects.toMatchObject(
      { code: "PDF_SIZE" },
    );
  });

  it.each([
    "http://guteneo.example",
    "https://user:pass@guteneo.example",
    "https://guteneo.example/api",
    "https://guteneo.example?token=hidden",
    "https://guteneo.example#fragment",
    "file:///tmp/guteneo",
  ])("rejects unsafe API origin %j", async (url) => {
    await expect(
      loadUploadConfig(envFor({ GUTENEO_URL: url })),
    ).rejects.toMatchObject({ code: "URL_INVALID" });
  });

  it("allows HTTPS and exact loopback development origins only", async () => {
    expect((await loadUploadConfig(envFor())).origin).toBe(config.origin);
    for (const origin of [
      "http://localhost:8787",
      "http://127.0.0.1:8787",
      "http://[::1]:8787",
    ]) {
      expect(
        (await loadUploadConfig(envFor({ GUTENEO_URL: origin }))).origin,
      ).toBe(origin);
    }
    await expect(
      loadUploadConfig(
        envFor({ GUTENEO_URL: "http://localhost.attacker.example" }),
      ),
    ).rejects.toMatchObject({ code: "URL_INVALID" });
  });

  it("requires an explicit narrow project root and a nonempty token", async () => {
    await expect(
      loadUploadConfig(envFor({ GUTENEO_PROJECT_ROOT: undefined })),
    ).rejects.toMatchObject({ code: "ROOT_REQUIRED" });
    await expect(
      loadUploadConfig(envFor({ GUTENEO_PROJECT_ROOT: "/" })),
    ).rejects.toMatchObject({ code: "ROOT_TOO_BROAD" });
    await expect(
      loadUploadConfig(envFor({ GUTENEO_PROJECT_ROOT: homedir() })),
    ).rejects.toMatchObject({ code: "ROOT_TOO_BROAD" });
    await expect(
      loadUploadConfig(envFor({ GUTENEO_ACCESS_TOKEN: "" })),
    ).rejects.toMatchObject({ code: "TOKEN_REQUIRED" });
    await expect(
      loadUploadConfig(
        envFor({ GUTENEO_ACCESS_TOKEN: "token\r\nInjected: yes" }),
      ),
    ).rejects.toMatchObject({ code: "TOKEN_REQUIRED" });
  });

  it("rejects a mismatched stored digest or size", async () => {
    for (const override of [
      { sha256: "0".repeat(64) },
      { size: bytes.length + 1 },
    ]) {
      const fetcher = vi.fn<typeof fetch>(async () => goodResponse(override));
      await expect(
        new CursorUploader(config, fetcher).upload("documents/original.pdf"),
      ).rejects.toMatchObject({ code: "INTEGRITY_MISMATCH" });
    }
  });

  it("does not auto-retry or disclose a token after an uncertain upload response", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new Error("network failure secret-test-token");
    });
    const result = new CursorUploader(config, fetcher).upload(
      "documents/original.pdf",
    );
    await expect(result).rejects.toMatchObject({ code: "UPLOAD_UNCONFIRMED" });
    await expect(result).rejects.not.toThrow("secret-test-token");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not expose an untrusted upstream error body", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response("private provider body", { status: 403 }),
    );
    await expect(
      new CursorUploader(config, fetcher).upload("documents/original.pdf"),
    ).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  });

  it("limits successful response bodies and rejects malformed receipts", async () => {
    for (const body of ["x".repeat(65537), "{}", "<html>bad</html>"]) {
      const fetcher = vi.fn<typeof fetch>(async () => new Response(body));
      await expect(
        new CursorUploader(config, fetcher).upload("documents/original.pdf"),
      ).rejects.toMatchObject({ code: "RESPONSE_INVALID" });
    }
  });

  it("serves initialize, tools/list and a rejected tools/call over real stdio without network", async () => {
    const processChild = spawn(
      process.execPath,
      ["--import", "tsx", "scripts/cursor-upload.ts"],
      {
        cwd: process.cwd(),
        env: { ...process.env, ...envFor() },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let buffered = "";
    let diagnostic = "";
    const pending = new Map<
      number,
      (message: Record<string, unknown>) => void
    >();
    processChild.stdout.on("data", (chunk: Buffer) => {
      buffered += chunk.toString();
      let newline;
      while ((newline = buffered.indexOf("\n")) >= 0) {
        const line = buffered.slice(0, newline);
        buffered = buffered.slice(newline + 1);
        if (line.trim()) {
          const message = JSON.parse(line) as Record<string, unknown>;
          if (typeof message.id === "number") {
            pending.get(message.id)?.(message);
            pending.delete(message.id);
          }
        }
      }
    });
    processChild.stderr.on("data", (chunk: Buffer) => {
      diagnostic += chunk.toString();
    });
    const request = (id: number, method: string, params: unknown) =>
      new Promise<Record<string, unknown>>((resolve) => {
        pending.set(id, resolve);
        processChild.stdin.write(
          `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`,
        );
      });
    try {
      const initialized = await request(1, "initialize", {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "guteneo-test", version: "1" },
      });
      expect(initialized.error).toBeUndefined();
      processChild.stdin.write(
        `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
      );
      const listed = await request(2, "tools/list", {});
      const listing = listed.result as {
        tools: {
          name: string;
          inputSchema: { additionalProperties?: boolean };
        }[];
      };
      expect(listing.tools.map((tool) => tool.name)).toEqual([
        "upload_local_pdf",
      ]);
      expect(listing.tools[0].inputSchema.additionalProperties).toBe(false);
      const called = await request(3, "tools/call", {
        name: "upload_local_pdf",
        arguments: { path: "../outside.pdf" },
      });
      expect(called.result).toMatchObject({ isError: true });
      expect(JSON.stringify(called.result)).toContain("PATH_DENIED");
      expect(`${JSON.stringify(called)}${diagnostic}`).not.toContain(
        config.accessToken,
      );
    } finally {
      processChild.kill();
    }
  }, 15000);
});
