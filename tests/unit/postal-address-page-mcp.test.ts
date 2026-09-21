import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import {
  createGuteneoMcpServer,
  type McpServices,
} from "../../apps/api/src/mcp";
import type { AuthEnv, McpIdentity } from "../../apps/api/src/auth";

const input = {
  documentId: "doc_original",
  recipient: {
    name: "ALICE EXEMPLE",
    line1: "Rue du Test 12",
    postalCode: "L-1234",
    city: "LUXEMBOURG",
    country: "LU",
  },
  printMode: "duplex",
  idempotencyKey: "cover-for-original-v1",
};

async function connected(
  scopes: string[],
  action: (client: Client, generate: ReturnType<typeof vi.fn>) => Promise<void>,
) {
  const identity: McpIdentity = {
    context: {
      organizationId: "org",
      userId: "user",
      role: "member",
      actor: "mcp",
    },
    scopes,
    clientId: "fixture",
    token: "fixture",
    expiresAt: 9999999999,
  };
  const generate = vi.fn(async () => ({
    document: {
      id: "doc_final",
      organization_id: "org",
      name: "lettre-avec-adresse.pdf",
      sha256: "b".repeat(64),
      size: 1234,
      pages: 3,
      status: "ready",
      source: "render",
      storage_key: "private-should-not-be-exposed",
      created_at: "2026-09-20T00:00:00.000Z",
    },
    provenance: {
      sourceDocumentId: "doc_original",
      generatedDocumentId: "doc_final",
      addedPages: 2,
      printMode: "duplex",
    },
    canSend: false,
  }));
  const server = createGuteneoMcpServer(
    identity,
    {
      APP_ORIGIN: "https://guteneo.example",
    } as AuthEnv,
    {
      domain: {},
      documents: {},
      capabilities: () => ({}),
      postal: { generateAddressPage: generate },
    } as unknown as McpServices,
  );
  const client = new Client({ name: "address-page-test", version: "1" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    await action(client, generate);
  } finally {
    await client.close();
    await server.close();
  }
}

describe("explicit postal address-page generation over MCP", () => {
  it("returns the new document to review, preserves the source identity and hides storage keys", async () => {
    await connected(["documents:write"], async (client, generate) => {
      const result = await client.callTool({
        name: "create_postal_address_page",
        arguments: input,
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        ok: true,
        data: {
          document: {
            id: "doc_final",
            pages: 3,
            previewUrl:
              "https://guteneo.example/api/documents/doc_final/content",
          },
          provenance: { sourceDocumentId: "doc_original", addedPages: 2 },
          canSend: false,
        },
      });
      expect(JSON.stringify(result)).not.toContain(
        "private-should-not-be-exposed",
      );
      expect(generate).toHaveBeenCalledWith(
        expect.objectContaining({ clientId: "fixture" }),
        {
          documentId: input.documentId,
          recipient: input.recipient,
          printMode: "duplex",
        },
        input.idempotencyKey,
      );
      const tools = await client.listTools();
      expect(
        tools.tools.find((tool) => tool.name === "create_postal_address_page"),
      ).toMatchObject({
        title: "Créer une page d’adresse postale",
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
        _meta: {
          securitySchemes: [{ type: "oauth2", scopes: ["documents:write"] }],
        },
      });
    });
  });

  it("requires document write access and cannot accept fabricated approval or profile", async () => {
    await connected(["documents:read"], async (client, generate) => {
      const result = await client.callTool({
        name: "create_postal_address_page",
        arguments: input,
      });
      expect(result.structuredContent).toMatchObject({
        ok: false,
        error: { code: "INSUFFICIENT_SCOPE" },
      });
      expect(generate).not.toHaveBeenCalled();
    });
    await connected(["documents:write"], async (client, generate) => {
      for (const extra of [
        { consentToTransfer: true },
        { organizationId: "other" },
        { defaultCountry: "FR" },
        { sha256: "a".repeat(64) },
      ]) {
        const result = await client.callTool({
          name: "create_postal_address_page",
          arguments: { ...input, ...extra },
        });
        expect(result.isError).toBe(true);
      }
      expect(generate).not.toHaveBeenCalled();
    });
  });
});
