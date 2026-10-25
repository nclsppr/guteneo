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
      documentUploads: { begin, get },
      capabilities: () => ({}),
    } as unknown as McpServices,
  );
  const client = new Client({ name: "private-upload-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  await client.connect(a);
  try {
    await run(client, begin, get);
  } finally {
    await client.close();
    await server.close();
  }
}
describe("private upload MCP contract", () => {
  it("advertises existing scope, explicit annotations and a bounded host-dependent binary journey", async () =>
    connected(["documents:write"], async (client) => {
      const { tools } = await client.listTools();
      for (const name of ["begin_document_upload", "get_document_upload"]) {
        const tool = tools.find((item) => item.name === name)!;
        expect(tool.annotations).toEqual({
          readOnlyHint: false,
          destructiveHint: name === "get_document_upload",
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
});
