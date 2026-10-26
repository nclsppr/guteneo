import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import {
  createGuteneoMcpServer,
  MCP_LIMITS,
  type McpServices,
} from "../../apps/api/src/mcp";
import type { McpIdentity } from "../../apps/api/src/auth";
import type { DocumentRecord } from "../../packages/domain/src/index";
import { ContentError } from "../../packages/contracts/src/content";

const uploadId = "upl_11111111-1111-4111-8111-111111111111";
const input = {
  idempotencyKey: "private_fixture",
  fileName: "synthetic.pdf",
  size: 100,
  sha256: "a".repeat(64),
};
async function connected(
  scopes: string[],
  run: (
    client: Client,
    begin: ReturnType<typeof vi.fn>,
    get: ReturnType<typeof vi.fn>,
    inline: ReturnType<typeof vi.fn>,
  ) => Promise<void>,
) {
  const identity = {
    context: {
      organizationId: "org",
      userId: "user",
      role: "admin",
      actor: "mcp",
    },
    clientId: "client",
    scopes,
    token: "synthetic-not-a-real-token",
    expiresAt: 0,
  } as McpIdentity;
  const begin = vi.fn(async () => ({
    uploadId,
    status: "reserved" as const,
    expiresAt: "2026-10-25T22:00:00.000Z",
    nextAction: "upload_exact_bytes" as const,
    upload: {
      method: "PUT" as const,
      url: `https://guteneo.com/api/document-uploads/${uploadId}/content`,
      capabilityHeader: "X-Guteneo-Upload-Capability" as const,
      capability: "b".repeat(64),
      client: {
        language: "python3",
        sha256: "c".repeat(64),
        code: "# synthetic client",
      },
    },
  }));
  const get = vi.fn(async () => ({
    uploadId,
    status: "complete" as const,
    expiresAt: "2026-10-25T22:00:00.000Z",
    nextAction: "get_document" as const,
    document: {
      id: "doc_synthetic",
      name: "synthetic.pdf",
      sha256: input.sha256,
      size: 100,
      pages: 1,
      status: "ready",
      storage_key: "internal-must-not-leak",
      organization_id: "org",
      access_owner_id: "user",
    } as DocumentRecord,
  }));
  const inline = vi.fn(async () => get());
  const server = createGuteneoMcpServer(
    identity,
    {
      APP_ORIGIN: "https://guteneo.com",
      MODE: "simulation",
      ENVIRONMENT: "local",
    } as never,
    {
      domain: {},
      documents: {},
      documentUploads: { begin, get, importInlinePdf: inline },
      capabilities: () => ({}),
    } as unknown as McpServices,
  );
  const client = new Client({ name: "private-upload-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  await client.connect(a);
  try {
    await run(client, begin, get, inline);
  } finally {
    await client.close();
    await server.close();
  }
}
describe("private upload MCP contract", () => {
  it("advertises existing scope, explicit annotations and a bounded host-dependent binary journey", async () =>
    connected(["documents:write"], async (client) => {
      const { tools } = await client.listTools();
      for (const name of [
        "begin_document_upload",
        "get_document_upload",
        "import_inline_pdf",
      ]) {
        const tool = tools.find((item) => item.name === name)!;
        expect(tool.annotations).toEqual({
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
        });
        expect(tool._meta).toMatchObject({
          securitySchemes: [{ type: "oauth2", scopes: ["documents:write"] }],
        });
      }
      expect(
        tools.find((item) => item.name === "begin_document_upload")!
          .description,
      ).toContain("POSIX Python 3.9+");
      expect(MCP_LIMITS.requestBytes).toBe(2 * 1024 * 1024);
    }));
  it("passes trusted identity separately, preserves only a write grant and sanitizes document status receipts", async () =>
    connected(["documents:write"], async (client, begin, get) => {
      const started = await client.callTool({
        name: "begin_document_upload",
        arguments: input,
      });
      expect(started.isError).not.toBe(true);
      expect(begin.mock.calls[0][1]).toEqual(input);
      expect(JSON.stringify(started)).not.toContain(
        "synthetic-not-a-real-token",
      );
      const result = await client.callTool({
        name: "get_document_upload",
        arguments: { uploadId },
      });
      expect(result.isError).not.toBe(true);
      expect(get).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(result)).not.toContain("internal-must-not-leak");
      expect(JSON.stringify(result)).not.toContain('"capability"');
      expect(result.structuredContent).toMatchObject({
        ok: true,
        data: {
          uploadId,
          status: "complete",
          document: { id: "doc_synthetic", sha256: input.sha256 },
        },
      });
    }));
  it("refuses absent scope and forged destinations, principals, byte strings or oversized originals before services", async () => {
    await connected([], async (client, begin) => {
      const result = await client.callTool({
        name: "begin_document_upload",
        arguments: input,
      });
      expect(result.isError).toBe(true);
      expect(begin).not.toHaveBeenCalled();
    });
    await connected(["documents:write"], async (client, begin) => {
      for (const args of [
        { ...input, size: 10485761 },
        { ...input, fileName: "../synthetic.pdf" },
        { ...input, sha256: "forged" },
        { ...input, organizationId: "other" },
        { ...input, downloadUrl: "https://evil.example" },
        { ...input, base64: "not-a-transport" },
      ]) {
        const result = await client.callTool({
          name: "begin_document_upload",
          arguments: args,
        });
        expect(result.isError).toBe(true);
      }
      expect(begin).not.toHaveBeenCalled();
    });
  });
  it("imports a bounded original in one scoped SDK invocation, forwards cancellation and exposes only a sanitized receipt", async () => {
    const value = {
      ...input,
      base64: Buffer.from("%PDF-" + ".".repeat(95)).toString("base64"),
    };
    await connected(
      ["documents:write"],
      async (client, _begin, _get, inline) => {
        const { tools } = await client.listTools();
        const tool = tools.find((item) => item.name === "import_inline_pdf")!;
        expect(tool.inputSchema.properties?.size).toMatchObject({
          maximum: 65536,
        });
        expect(tool.inputSchema.properties?.base64).toMatchObject({
          maxLength: 87384,
        });
        const result = await client.callTool({
          name: tool.name,
          arguments: value,
        });
        expect(result.isError).not.toBe(true);
        expect(inline.mock.calls[0][1]).toEqual(value);
        expect(inline.mock.calls[0][2]).toBeInstanceOf(AbortSignal);
        const wire = JSON.stringify(result);
        for (const forbidden of [
          value.base64,
          "internal-must-not-leak",
          '"upload"',
          '"capability"',
        ])
          expect(wire).not.toContain(forbidden);
        expect(result.structuredContent).toMatchObject({
          ok: true,
          data: {
            uploadId,
            status: "complete",
            document: { id: "doc_synthetic" },
          },
        });
        for (const args of [
          { ...value, size: 65537 },
          { ...value, base64: "A".repeat(87388) },
          { ...value, organizationId: "other" },
          { ...value, chunks: [value.base64] },
        ])
          expect(
            (await client.callTool({ name: tool.name, arguments: args }))
              .isError,
          ).toBe(true);
        expect(inline).toHaveBeenCalledTimes(1);
      },
    );
    await connected([], async (client, _begin, _get, inline) => {
      expect(
        (await client.callTool({ name: "import_inline_pdf", arguments: value }))
          .isError,
      ).toBe(true);
      expect(inline).not.toHaveBeenCalled();
    });
  });
  it("keeps lost post-effect receipts and refused originals on the private-upload recovery path", async () => {
    const value = {
      ...input,
      base64: Buffer.from("%PDF-" + ".".repeat(95)).toString("base64"),
    };
    await connected(["documents:write"], async (client, begin, get, inline) => {
      const persisted = vi.fn(async () => ({ id: "doc_synthetic" }));
      inline.mockImplementationOnce(async () => {
        await persisted();
        throw Error("synthetic lost final receipt");
      });
      const lost = await client.callTool({
        name: "import_inline_pdf",
        arguments: value,
      });
      expect(persisted).toHaveBeenCalledTimes(1);
      expect(lost.structuredContent).toMatchObject({
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          recovery: {
            action: "check_document_upload",
            tool: "get_document_upload",
            retry: "never_resend",
          },
        },
      });
      const recovery = (
        lost.structuredContent as {
          error: { recovery: Record<string, unknown> };
        }
      ).error.recovery;
      expect(recovery.message).toContain(
        "strictly the same idempotencyKey, fileName, size and SHA-256",
      );
      expect(recovery).not.toHaveProperty("arguments");
      for (const secret of [
        value.base64,
        '"capability"',
        "get_dispatch_status",
        "check_dispatch",
      ])
        expect(JSON.stringify(lost)).not.toContain(secret);
      for (const [name, stub, args] of [
        ["begin_document_upload", begin, input],
        ["get_document_upload", get, { uploadId }],
      ] as const) {
        stub.mockRejectedValueOnce(Error("synthetic lost upload state"));
        expect(
          (await client.callTool({ name, arguments: args })).structuredContent,
        ).toMatchObject({
          ok: false,
          error: {
            recovery: {
              tool: "get_document_upload",
              action: "check_document_upload",
              retry: "never_resend",
            },
          },
        });
      }
      for (const code of [
        "INLINE_PDF_ENCODING_INVALID",
        "INLINE_PDF_INTEGRITY_MISMATCH",
        "INLINE_PDF_NOT_PDF",
      ]) {
        inline.mockRejectedValueOnce(
          new ContentError(code, "Original refused.", 422),
        );
        expect(
          (
            await client.callTool({
              name: "import_inline_pdf",
              arguments: value,
            })
          ).structuredContent,
        ).toMatchObject({
          ok: false,
          error: {
            recovery: {
              action: "check_document_upload",
              tool: null,
              retry: "after_change",
            },
          },
        });
      }
    });
  });
});
