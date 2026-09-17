import { describe, it, expect, vi } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import {
  createGuteneoMcpServer,
  type McpServices,
} from "../../apps/api/src/mcp";
import {
  MCP_SCOPES,
  type McpIdentity,
  type AuthEnv,
} from "../../apps/api/src/auth";
import type { PostalReview } from "../../packages/contracts/src/postal-review";
import { postalAddressGuidance } from "../../packages/contracts/src/postal-requirements";
const input = {
  documentId: "doc_owned",
  senderId: "sender_owned",
  recipient: {
    name: "EXAMPLE",
    line1: "Rue du Test 12",
    postalCode: "L-1234",
    city: "LUXEMBOURG",
    country: "LU",
  },
  options: {
    deliveryProduct: "cheap",
    printMode: "simplex",
    printSpectrum: "grayscale",
  },
  ceilingMinor: 500,
  idempotencyKey: "stable-review",
} as const;
const result: PostalReview = {
  id: "pp_owned",
  document: {
    id: "doc_owned",
    name: "fixture.pdf",
    sha256: "a".repeat(64),
    pages: 1,
    previewUrl: "https://guteneo.example/api/documents/doc_owned/content",
  },
  recipient: input.recipient,
  options: { ...input.options, addressPosition: "left" },
  ceilingMinor: input.ceilingMinor,
  checks: {
    complete: true,
    dpi: 144,
    pages: [{ page: 1, width: 1191, height: 1684 }],
    issues: [],
  },
  draftId: null,
  canSend: false,
  reviewUrl: "https://guteneo.example/#/app/postal/pp_owned",
  status: "review_required",
  transferStatus: "not_started",
  canTransfer: false,
  address: {
    expectedLines: [],
    extractedLines: [],
    matches: false,
    textVisibility: "not_verified",
    cropAccess: "authenticated_browser_session_only",
    mcpEmbeddedVisualEvidenceAvailable: false,
    cropUrl:
      "https://guteneo.example/api/postal/preflights/pp_owned/address.png",
  },
  transferPolicy: {
    canTransferMeaning: "browser_session_only",
    expertTool: "transfer_postal_draft",
    expertAuthority: "separate_active_postal_transfer_mandate_required",
    expertEligibilityEvaluated: false,
    requiresVisualReview: true,
  },
};
async function connected(
  scopes: string[],
  action: (client: Client, create: ReturnType<typeof vi.fn>) => Promise<void>,
) {
  const principal: McpIdentity = {
    context: {
      organizationId: "org",
      userId: "user",
      role: "member",
      actor: "mcp",
    },
    scopes,
    clientId: "fixture",
    token: "not-used-outside-fixture",
    expiresAt: 9999999999,
  };
  const create = vi.fn(async () => result);
  const server = createGuteneoMcpServer(
    principal,
    { APP_ORIGIN: "https://guteneo.example" } as AuthEnv,
    {
      domain: {},
      documents: {},
      capabilities: () => ({}),
      postal: {
        requirements: async (
          _authority: unknown,
          country: "FR" | "LU" | "DE",
        ) => ({
          provider: "pingen",
          qualified: true,
          addressGuidance: postalAddressGuidance({
            country,
            defaultCountry: "LU",
            addressPosition: "left",
            deliveryProduct: "cheap",
            printMode: "simplex",
            printSpectrum: "grayscale",
          }),
          canSend: false,
        }),
        create,
        get: async () => result,
        quote: async () => {
          throw new Error("not needed");
        },
      },
    } as unknown as McpServices,
  );
  const client = new Client({ name: "postal-contract-test", version: "1" });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await server.connect(s);
  await client.connect(c);
  try {
    await action(client, create);
  } finally {
    await client.close();
    await server.close();
  }
}
describe("postal tools over MCP transport", () => {
  it("provides requirements read-only with documents:read before any preparation", async () => {
    await connected(["documents:read"], async (client, create) => {
      const response = await client.callTool({
        name: "get_postal_requirements",
        arguments: { country: "LU" },
      });
      expect(response.structuredContent).toMatchObject({
        ok: true,
        data: {
          provider: "pingen",
          qualified: true,
          canSend: false,
          addressGuidance: {
            destination: "LU",
            route: "bpost_luxembourg",
            recipientSchema: {
              renderedLines: 3,
              additionalAddressLinesSupported: false,
            },
            verification: {
              textVisibility: "not_verified",
              mcpEmbeddedVisualEvidenceAvailable: false,
            },
          },
        },
      });
      expect(create).not.toHaveBeenCalled();
    });
    await connected([], async (client) => {
      const response = await client.callTool({
        name: "get_postal_requirements",
        arguments: { country: "LU" },
      });
      expect(response.structuredContent).toMatchObject({
        ok: false,
        error: { code: "INSUFFICIENT_SCOPE" },
      });
    });
  });

  it("preserves visual-evidence and browser-only availability limits over MCP", async () => {
    await connected(["documents:read"], async (client) => {
      const response = await client.callTool({
        name: "get_postal_preflight",
        arguments: { preflightId: "pp_owned" },
      });
      expect(response.structuredContent).toMatchObject({
        ok: true,
        data: {
          canTransfer: false,
          address: {
            textVisibility: "not_verified",
            cropAccess: "authenticated_browser_session_only",
            mcpEmbeddedVisualEvidenceAvailable: false,
          },
          transferPolicy: {
            canTransferMeaning: "browser_session_only",
            expertEligibilityEvaluated: false,
            requiresVisualReview: true,
          },
        },
      });
      expect(response.content).not.toContainEqual(
        expect.objectContaining({ type: "image" }),
      );
    });
  });

  it.each(["documents:write", "dispatches:prepare"])(
    "requires and challenges both permissions when %s is absent",
    async (missing) => {
      await connected(
        MCP_SCOPES.filter((scope) => scope !== missing),
        async (client, create) => {
          const response = await client.callTool({
            name: "preflight_postal_pdf",
            arguments: input,
          });
          expect(response.isError).toBe(true);
          expect(response.structuredContent).toMatchObject({
            ok: false,
            error: { code: "INSUFFICIENT_SCOPE" },
          });
          expect(JSON.stringify(response._meta)).toContain(
            'scope=\\"documents:write dispatches:prepare\\"',
          );
          expect(create).not.toHaveBeenCalled();
          const tools = await client.listTools();
          expect(
            tools.tools.find((tool) => tool.name === "preflight_postal_pdf")
              ?._meta?.securitySchemes,
          ).toEqual([
            {
              type: "oauth2",
              scopes: ["documents:write", "dispatches:prepare"],
            },
          ]);
        },
      );
    },
  );
  it("returns the server review URL and never exposes a browser consent tool", async () => {
    await connected([...MCP_SCOPES], async (client, create) => {
      const response = await client.callTool({
        name: "preflight_postal_pdf",
        arguments: input,
      });
      expect(response.isError).not.toBe(true);
      expect(response.structuredContent).toMatchObject({
        ok: true,
        data: result,
      });
      expect(create).toHaveBeenCalledTimes(1);
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).not.toContain(
        "transfer_postal_document",
      );
      expect(
        tools.tools.some(
          (tool) =>
            /consent|transfer/.test(tool.name) ||
            tool.name === "approve_dispatch",
        ),
      ).toBe(false);
      const forged = await client.callTool({
        name: "preflight_postal_pdf",
        arguments: { ...input, canSend: true, reviewed: true },
      });
      expect(forged.isError).toBe(true);
      expect(create).toHaveBeenCalledTimes(1);
    });
  });
});
