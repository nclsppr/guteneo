import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import {
  createGuteneoMcpServer,
  type McpServices,
} from "../../apps/api/src/mcp";
import {
  MCP_SCOPES,
  type AuthEnv,
  type McpIdentity,
} from "../../apps/api/src/auth";
import {
  DomainError,
  type DomainService,
} from "../../packages/domain/src/index";
import {
  secureDistributionQuote,
  type SecureDistributionView,
} from "../../packages/contracts/src/secure-distribution";

const identity: McpIdentity = {
  context: {
    organizationId: "org_fixture",
    userId: "user_fixture",
    role: "admin",
    actor: "mcp",
  },
  scopes: [...MCP_SCOPES],
  clientId: "synthetic-client",
  token: "synthetic-only",
  expiresAt: 0,
};
const policy = {
  retentionDays: 30 as const,
  allowOriginalDownload: false,
  allowVaultDeposit: true,
  personalRetentionDays: 365 as const,
};
const view: SecureDistributionView = {
  id: "sd_fixture",
  dispatchId: "dispatch_fixture",
  status: "prepared",
  title: "Original.pdf",
  source: {
    id: "doc_fixture",
    name: "Original.pdf",
    pages: 2,
    sha256: "a".repeat(64),
  },
  recipient: { address: "recipient@example.test", name: "Destinataire" },
  invitation: {
    subject: "Requested document",
    message: "Requested secure delivery",
  },
  policy,
  quote: secureDistributionQuote(policy, 1),
  expiresAt: null,
  approvalUrl: "https://guteneo.invalid/#/app/secure-distribution/sd_fixture",
  recipientUserId: "private_recipient_account",
  recipientBinding: "pending",
  approved: false,
  approval: null,
  pendingClaim: {
    recipientUserId: "private_pending_identity",
    name: "Private claimant",
    email: "private-claimant@example.test",
    createdAt: "2026-10-24T00:00:00.000Z",
  },
  audit: [
    {
      id: "event_fixture",
      type: "prepared",
      createdAt: "2026-10-24T00:00:00.000Z",
      provenance: "server",
    },
  ],
};
function serviceFixture() {
  return {
    prepare: vi.fn(async () => view),
    list: vi.fn(async () => ({ items: [view], nextCursor: null })),
    get: vi.fn(async () => view),
    confirm: vi.fn(async () => ({ ...view, status: "active" as const })),
    revoke: vi.fn(async () => ({ ...view, status: "revoked" as const })),
  };
}
async function connected(
  run: (
    client: Client,
    service: ReturnType<typeof serviceFixture>,
    after: ReturnType<typeof vi.fn>,
    legacyConfirm: ReturnType<typeof vi.fn>,
  ) => Promise<void>,
  options: {
    scopes?: string[];
    enabled?: boolean;
    status?: SecureDistributionView["status"];
  } = {},
) {
  const service = serviceFixture();
  if (options.status) {
    service.prepare.mockResolvedValue({ ...view, status: options.status });
  }
  const after = vi.fn(async () => {});
  const legacyConfirm = vi.fn(async () => {
    throw new Error(
      "Legacy acceptance must not bypass secure service authority",
    );
  });
  const server = createGuteneoMcpServer(
    { ...identity, scopes: options.scopes ?? identity.scopes },
    {
      APP_ORIGIN: "https://guteneo.invalid",
      ENVIRONMENT: "local",
      MODE: "simulation",
    } as AuthEnv,
    {
      domain: {
        getDispatch: async () => ({
          dispatch: {
            options_json: JSON.stringify({
              secureDistribution: { distributionId: view.id },
            }),
          },
        }),
        confirmDispatch: legacyConfirm,
      } as unknown as DomainService,
      documents: {
        importFile: async () => {
          throw new Error("Unexpected import");
        },
        render: async () => {
          throw new Error("Unexpected render");
        },
      },
      capabilities: () => ({}),
      afterConfirmation: after,
      ...(options.enabled === false
        ? {}
        : { secureDistribution: service as McpServices["secureDistribution"] }),
    },
  );
  const client = new Client({
    name: "secure-distribution-contract",
    version: "1",
  });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  await client.connect(ct);
  try {
    await run(client, service, after, legacyConfirm);
  } finally {
    await client.close();
    await server.close();
  }
}
const input = {
  documentId: "doc_fixture",
  recipient: { address: "recipient@example.test" },
  retentionDays: 30,
  allowOriginalDownload: false,
  allowVaultDeposit: true,
  personalRetentionDays: 365,
  subject: "Requested document",
  message: "Requested secure delivery",
  costCeilingMinor: 500,
};
const operations = [
  [
    "prepare_secure_distribution",
    { ...input, idempotencyKey: "prepare_fixture" },
    "dispatches:prepare",
    "prepare",
  ],
  ["list_secure_distributions", {}, "dispatches:read", "list"],
  [
    "get_secure_distribution",
    { distributionId: view.id },
    "dispatches:read",
    "get",
  ],
  [
    "confirm_secure_distribution",
    { distributionId: view.id, idempotencyKey: "confirm_fixture" },
    "dispatches:send",
    "confirm",
  ],
  [
    "revoke_secure_distribution",
    { distributionId: view.id },
    "dispatches:send",
    "revoke",
  ],
] as const;

describe("secure distribution through the shared MCP transport", () => {
  it("discovers all five workshop tools with explicit effect annotations and no personal capabilities", async () => {
    await connected(async (client) => {
      const tools = (await client.listTools()).tools;
      for (const [name] of operations) {
        const tool = tools.find((tool) => tool.name === name)!;
        expect(tool).toBeDefined();
        expect(tool.annotations).toMatchObject({
          readOnlyHint: false,
          idempotentHint: false,
          destructiveHint:
            name.startsWith("confirm") || name.startsWith("revoke"),
          openWorldHint: name.startsWith("confirm"),
        });
      }
      expect(
        tools
          .map((tool) => tool.name)
          .filter((name) => /personal|vault|claim|binding/.test(name)),
      ).toEqual([]);
      expect(
        tools.find((tool) => tool.name === "confirm_secure_distribution")!
          .description,
      ).toContain("expert mandate");
      expect(
        (await client.listPrompts()).prompts.map((prompt) => prompt.name),
      ).toContain("secure_distribution");
      const prompt = await client.getPrompt({ name: "secure_distribution" });
      expect(JSON.stringify(prompt)).toContain("non-refundable");
    });
  });
  it("omits optional distribution tools when their service is not wired", async () => {
    await connected(
      async (client) => {
        const tools = (await client.listTools()).tools;
        expect(
          tools.some((tool) => tool.name.includes("secure_distribution")),
        ).toBe(false);
      },
      { enabled: false },
    );
  });
  it.each(operations)(
    "routes %s through its scoped shared service and excludes private claims",
    async (name, args, _scope, method) => {
      await connected(async (client, service) => {
        const result = await client.callTool({ name, arguments: args });
        expect(result.isError).not.toBe(true);
        expect(result.structuredContent).toMatchObject({ ok: true });
        expect(service[method]).toHaveBeenCalledOnce();
        const serialized = JSON.stringify(result);
        for (const privateValue of [
          "private_recipient_account",
          "private_pending_identity",
          "private-claimant@example.test",
          "Private claimant",
        ])
          expect(serialized).not.toContain(privateValue);
        if (method === "prepare")
          expect(service.prepare).toHaveBeenCalledWith(
            identity,
            { ...input, notificationLocale: "fr" },
            "prepare_fixture",
          );
        if (method === "list")
          expect(service.list).toHaveBeenCalledWith(identity, { limit: 20 });
        if (method === "confirm")
          expect(service.confirm).toHaveBeenCalledWith(
            identity,
            view.id,
            "confirm_fixture",
          );
      });
    },
  );
  it.each(operations)(
    "rejects insufficient scopes for %s before its service runs",
    async (name, args, scope) => {
      await connected(
        async (client, service) => {
          const result = await client.callTool({ name, arguments: args });
          expect(result.isError).toBe(true);
          expect(result.structuredContent).toMatchObject({
            error: { code: "INSUFFICIENT_SCOPE" },
          });
          for (const handler of Object.values(service))
            expect(handler).not.toHaveBeenCalled();
        },
        { scopes: identity.scopes.filter((value) => value !== scope) },
      );
    },
  );
  it("keeps asynchronous preparation on the same immutable identifier", async () => {
    await connected(
      async (client, service) => {
        const result = await client.callTool({
          name: "prepare_secure_distribution",
          arguments: { ...input, idempotencyKey: "one_preparation" },
        });
        expect(result.structuredContent).toMatchObject({
          data: { id: view.id, status: "preparing" },
        });
        expect(JSON.stringify(result)).toContain("do not recreate");
        expect(service.confirm).not.toHaveBeenCalled();
      },
      { status: "preparing" },
    );
  });
  it("cannot manufacture a browser approval even for a fully scoped administrator", async () => {
    await connected(async (client, service, after) => {
      service.confirm.mockRejectedValue(
        new DomainError(
          "APPROVAL_REQUIRED",
          "L’approbation navigateur est requise.",
          409,
        ),
      );
      const result = await client.callTool({
        name: "confirm_secure_distribution",
        arguments: {
          distributionId: view.id,
          idempotencyKey: "same_confirmation",
        },
      });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({
        error: { code: "APPROVAL_REQUIRED" },
      });
      expect(after).not.toHaveBeenCalled();
      expect(service.prepare).not.toHaveBeenCalled();
    });
  });
  it("routes the legacy confirmation tool through the secure credential-fenced adapter", async () => {
    await connected(async (client, service, _after, legacyConfirm) => {
      service.confirm.mockRejectedValue(
        new DomainError(
          "APPROVAL_REQUIRED",
          "L’approbation forte reste requise.",
          409,
        ),
      );
      const result = await client.callTool({
        name: "confirm_dispatch",
        arguments: {
          dispatchId: "legacy_secure_dispatch",
          idempotencyKey: "legacy_stable_key",
        },
      });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({
        error: { code: "APPROVAL_REQUIRED" },
      });
      expect(service.confirm).toHaveBeenCalledExactlyOnceWith(
        identity,
        view.id,
        "legacy_stable_key",
      );
      expect(legacyConfirm).not.toHaveBeenCalled();
    });
  });
  it("does not turn durable acceptance into a new command after notification publication fails", async () => {
    await connected(async (client, service, after) => {
      after.mockRejectedValue(new Error("Synthetic publication unavailable"));
      const result = await client.callTool({
        name: "confirm_secure_distribution",
        arguments: {
          distributionId: view.id,
          idempotencyKey: "durable_confirmation",
        },
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        data: { status: "active", quote: { nonRefundable: true } },
      });
      expect(service.confirm).toHaveBeenCalledOnce();
    });
  });
  it.each([
    [
      "prepare_secure_distribution",
      { ...input, idempotencyKey: "bad", organizationId: "foreign" },
    ],
    [
      "prepare_secure_distribution",
      { ...input, idempotencyKey: "bad", recipientUserId: "guessed" },
    ],
    [
      "confirm_secure_distribution",
      { distributionId: view.id, idempotencyKey: "bad", approved: true },
    ],
    ["list_secure_distributions", { limit: 51 }],
  ] as const)(
    "rejects extra authority and oversized bounds for %s",
    async (name, args) => {
      await connected(async (client, service) => {
        const result = await client.callTool({ name, arguments: args });
        expect(result.isError).toBe(true);
        for (const handler of Object.values(service))
          expect(handler).not.toHaveBeenCalled();
      });
    },
  );
});
