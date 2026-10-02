import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { createGuteneoMcpServer } from "../../apps/api/src/mcp";
import {
  MCP_SCOPES,
  type AuthEnv,
  type McpIdentity,
} from "../../apps/api/src/auth";
import type { DomainService } from "../../packages/domain/src/index";
import { dispatchGroupNames } from "../../packages/contracts/src/dispatch-groups";

const identity: McpIdentity = {
  context: {
    organizationId: "org_fixture",
    userId: "user_fixture",
    role: "member",
    actor: "mcp",
  },
  scopes: [...MCP_SCOPES],
  clientId: "fixture-only",
  token: "fixture-only",
  expiresAt: 0,
};

async function connect() {
  const calls: unknown[][] = [];
  const server = createGuteneoMcpServer(
    identity,
    { APP_ORIGIN: "https://guteneo.invalid" } as AuthEnv,
    {
      domain: {
        listDispatches: async (...args: unknown[]) => {
          calls.push(args);
          return { items: [], nextCursor: null };
        },
      } as unknown as DomainService,
      documents: {
        importFile: async () => {
          throw new Error("No upload in contract test");
        },
        render: async () => {
          throw new Error("No rendering in contract test");
        },
      },
      capabilities: () => ({ mode: "simulation", liveSendsEnabled: false }),
    },
  );
  const client = new Client({ name: "dispatch-groups", version: "1" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, calls };
}

describe("list_dispatches status groups", () => {
  it("passes the shared server-side group and nothing else", async () => {
    const { client, calls } = await connect();
    try {
      const tool = (await client.listTools()).tools.find(
        (candidate) => candidate.name === "list_dispatches",
      )!;
      const group = (
        tool.inputSchema.properties as Record<string, { enum?: string[] }>
      ).group;
      expect(group.enum).toEqual(dispatchGroupNames);
      expect(tool.inputSchema.required ?? []).not.toContain("group");

      const filtered = await client.callTool({
        name: "list_dispatches",
        arguments: { group: "attention", limit: 5 },
      });
      expect(filtered.isError).not.toBe(true);
      const all = await client.callTool({
        name: "list_dispatches",
        arguments: {},
      });
      expect(all.isError).not.toBe(true);
      expect(calls).toEqual([
        [identity.context, undefined, 5, "attention"],
        [identity.context, undefined, 20, undefined],
      ]);

      // Raw statuses or SQL-shaped values never reach the domain.
      for (const group of ["prepared", "attention' OR 1=1 --"]) {
        const refused = await client.callTool({
          name: "list_dispatches",
          arguments: { group },
        });
        expect(refused.isError).toBe(true);
      }
      expect(calls).toHaveLength(2);
    } finally {
      await client.close();
    }
  });
});
