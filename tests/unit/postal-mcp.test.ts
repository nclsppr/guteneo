import { describe, it, expect, vi } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import {
  createGuteneoMcpServer,
  POSTAL_WORKFLOW,
  type McpServices,
} from "../../apps/api/src/mcp";
import {
  MCP_SCOPES,
  AuthError,
  type McpIdentity,
  type AuthEnv,
} from "../../apps/api/src/auth";
import type { PostalReview } from "../../packages/contracts/src/postal-review";
import type { PostalSetup } from "../../packages/contracts/src/postal-setup";
import { ContentError } from "../../packages/contracts/src/content";
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
const setupResult: PostalSetup = {
  available: true,
  canManage: true,
  configured: false,
  channelEnabled: false,
  senderVerification: null,
  pricingBasis: "public_list_price_ex_tax",
  defaultCountry: "LU",
  reason: "setup_required",
};
const senderInput = {
  name: "Atelier Exemple",
  address: "12 rue du Test\nL-1234 Luxembourg\nLuxembourg",
};
async function connected(
  scopes: string[],
  action: (
    client: Client,
    create: ReturnType<typeof vi.fn>,
    setup: {
      getSetup: ReturnType<typeof vi.fn>;
      configureSender: ReturnType<typeof vi.fn>;
      importFile: ReturnType<typeof vi.fn>;
    },
  ) => Promise<void>,
  overrides: Partial<NonNullable<McpServices["postal"]>> = {},
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
  const getSetup = vi.fn(async () => setupResult);
  const configureSender = vi.fn(
    async (_identity: McpIdentity, value: typeof senderInput) => ({
      ...setupResult,
      configured: true,
      channelEnabled: true,
      sender: { id: "sender_owned", ...value, status: "verified" },
      senderVerification: "oauth_administrator_submission",
      reason: undefined,
    }),
  );
  const importFile = vi.fn(async () => ({
    id: "doc_owned",
    name: "fixture.pdf",
    sha256: "a".repeat(64),
    pages: 1,
    size: 1024,
    status: "ready",
    source: "upload",
    created_at: "2026-09-21T00:00:00.000Z",
  }));
  const server = createGuteneoMcpServer(
    principal,
    { APP_ORIGIN: "https://guteneo.example" } as AuthEnv,
    {
      domain: {},
      documents: { importFile },
      capabilities: () => ({}),
      postal: {
        getSetup,
        configureSender,
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
        ...overrides,
      },
    } as unknown as McpServices,
  );
  const client = new Client({ name: "postal-contract-test", version: "1" });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await server.connect(s);
  await client.connect(c);
  try {
    await action(client, create, { getSetup, configureSender, importFile });
  } finally {
    await client.close();
    await server.close();
  }
}
describe("postal tools over MCP transport", () => {
  it("imports once, collects the sender through tools and returns the standard browser review without an expert mandate", async () => {
    await connected(
      ["documents:read", "documents:write", "dispatches:prepare"],
      async (client, create, setup) => {
        const file = {
          download_url: "https://files.example/original.pdf",
          file_id: "original-exact-bytes",
          file_name: "fixture.pdf",
        };
        const imported = await client.callTool({
          name: "import_document",
          arguments: { file },
        });
        expect(imported.structuredContent).toMatchObject({
          ok: true,
          data: { id: input.documentId, analysis: { state: "ready" } },
        });
        expect(setup.importFile).toHaveBeenCalledWith(
          expect.objectContaining({ organizationId: "org", actor: "mcp" }),
          file,
        );
        const state = await client.callTool({
          name: "get_postal_setup",
          arguments: {},
        });
        expect(state.structuredContent).toEqual({
          ok: true,
          data: setupResult,
        });
        expect(setup.configureSender).not.toHaveBeenCalled();
        const configured = await client.callTool({
          name: "configure_postal_sender",
          arguments: senderInput,
        });
        expect(configured.structuredContent).toMatchObject({
          ok: true,
          data: {
            configured: true,
            sender: { ...senderInput, id: input.senderId },
            senderVerification: "oauth_administrator_submission",
          },
        });
        expect(setup.configureSender).toHaveBeenCalledWith(
          expect.objectContaining({
            clientId: "fixture",
            context: expect.objectContaining({ organizationId: "org" }),
          }),
          senderInput,
        );
        const review = await client.callTool({
          name: "preflight_postal_pdf",
          arguments: input,
        });
        expect(review.structuredContent).toMatchObject({
          ok: true,
          data: { id: result.id, reviewUrl: result.reviewUrl, canSend: false },
        });
        expect(create).toHaveBeenCalledWith(
          expect.objectContaining({ clientId: "fixture" }),
          expect.objectContaining({
            documentId: input.documentId,
            senderId: input.senderId,
          }),
          input.idempotencyKey,
        );
        expect(setup.importFile).toHaveBeenCalledTimes(1);
      },
    );
  });

  it.each([
    ["get_postal_setup", "documents:read", {}],
    ["configure_postal_sender", "dispatches:prepare", senderInput],
  ] as const)(
    "exposes %s honestly but challenges its missing %s scope before calling the service",
    async (name, scope, args) => {
      await connected(
        MCP_SCOPES.filter((value) => value !== scope),
        async (client, _create, setup) => {
          const listed = (await client.listTools()).tools.find(
            (tool) => tool.name === name,
          );
          expect(listed?._meta?.securitySchemes).toEqual([
            { type: "oauth2", scopes: [scope] },
          ]);
          expect(listed?.annotations).toMatchObject({
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
          });
          const response = await client.callTool({ name, arguments: args });
          expect(response.structuredContent).toMatchObject({
            ok: false,
            error: {
              code: "INSUFFICIENT_SCOPE",
              recovery: { action: "reconnect", tool: null },
            },
          });
          expect(JSON.stringify(response._meta)).toContain(scope);
          expect(setup.getSetup).not.toHaveBeenCalled();
          expect(setup.configureSender).not.toHaveBeenCalled();
        },
      );
    },
  );

  it.each([
    { authorized: true },
    { reviewed: true },
    { organizationId: "other-org" },
    { senderId: "other-sender" },
    { clientId: "other-client" },
    { address: "short" },
    { name: "Injected\nName" },
  ])("rejects forged or malformed sender input %j", async (extra) => {
    await connected(["dispatches:prepare"], async (client, _create, setup) => {
      const response = await client.callTool({
        name: "configure_postal_sender",
        arguments: { ...senderInput, ...extra },
      });
      expect(response.isError).toBe(true);
      expect(setup.configureSender).not.toHaveBeenCalled();
    });
  });

  it("preserves backend administrator refusal and never pretends configuration approved an action", async () => {
    const configureSender = vi.fn(async () => {
      throw new AuthError(
        "POSTAL_SENDER_ADMIN_REQUIRED",
        "Un administrateur doit reprendre cette configuration.",
        403,
      );
    });
    await connected(
      ["dispatches:prepare"],
      async (client, create) => {
        const response = await client.callTool({
          name: "configure_postal_sender",
          arguments: senderInput,
        });
        expect(response.structuredContent).toMatchObject({
          ok: false,
          error: {
            code: "POSTAL_SENDER_ADMIN_REQUIRED",
            recovery: {
              action: "check_postal_setup",
              tool: "get_postal_setup",
            },
          },
        });
        expect(configureSender).toHaveBeenCalledTimes(1);
        expect(create).not.toHaveBeenCalled();
      },
      { configureSender },
    );
  });

  it("keeps expired pricing reads inert and repeats only an explicit exact sender request", async () => {
    const expired = {
      ...setupResult,
      sender: {
        ...senderInput,
        id: "sender_owned",
        status: "verified" as const,
      },
      reason: "pricing_expired" as const,
    };
    await connected(
      ["documents:read", "dispatches:prepare"],
      async (client, create, setup) => {
        const state = await client.callTool({ name: "get_postal_setup" });
        expect(state.structuredContent).toEqual({ ok: true, data: expired });
        expect(setup.configureSender).not.toHaveBeenCalled();
        const first = await client.callTool({
          name: "configure_postal_sender",
          arguments: senderInput,
        });
        const replay = await client.callTool({
          name: "configure_postal_sender",
          arguments: senderInput,
        });
        expect(replay.structuredContent).toEqual(first.structuredContent);
        expect(setup.configureSender).toHaveBeenCalledTimes(2);
        expect(create).not.toHaveBeenCalled();
      },
      { getSetup: async () => expired },
    );
  });

  it("publishes the postal prompt with chat setup and the two unchanged approval paths", async () => {
    await connected([], async (client) => {
      const prompts = await client.listPrompts();
      expect(prompts.prompts.map((prompt) => prompt.name)).toContain(
        "postal_pdf",
      );
      const prompt = await client.getPrompt({ name: "postal_pdf" });
      expect(prompt.messages[0]?.content).toEqual({
        type: "text",
        text: POSTAL_WORKFLOW,
      });
      for (const required of [
        "get_postal_setup",
        "configure_postal_sender({name,address})",
        "uniquement les champs manquants",
        "aucun réimport postal",
        "pricing_expired",
        "reviewUrl",
        "approvalUrl",
        "mandat postal déjà enregistré",
        "submission_unknown",
      ])
        expect(POSTAL_WORKFLOW).toContain(required);
      expect(POSTAL_WORKFLOW).toContain("ne doit jamais activer ou étendre");
    });
  });

  it.each([
    ["SENDER_NOT_CONFIGURED", "preflight_postal_pdf", "get_postal_setup"],
    ["POSTAL_DRAFT_NOT_READY", "quote_postal_draft", "get_postal_preflight"],
    ["POSTAL_PREFLIGHT_EXPIRED", "quote_postal_draft", "get_postal_preflight"],
  ] as const)(
    "recovers %s through the postal state instead of a nonexistent dispatch",
    async (code, name, tool) => {
      const fail = async () => {
        throw new ContentError(code, "Postal fixture refusal");
      };
      await connected(
        [...MCP_SCOPES],
        async (client) => {
          const response = await client.callTool({
            name,
            arguments:
              name === "preflight_postal_pdf"
                ? input
                : { preflightId: result.id, idempotencyKey: "same-quote" },
          });
          expect(response.structuredContent).toMatchObject({
            ok: false,
            error: { code, recovery: { tool } },
          });
          expect(JSON.stringify(response.structuredContent)).not.toContain(
            "get_dispatch_status",
          );
        },
        { create: fail, quote: fail },
      );
    },
  );

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
