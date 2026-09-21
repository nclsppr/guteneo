import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import worker, { getCapabilities } from "../../apps/api/src/index";
import { createGuteneoMcpServer } from "../../apps/api/src/mcp";
import type { Env } from "../../apps/api/src/env";
import { DomainService } from "../../packages/domain/src/index";

const hosted = {
  ENVIRONMENT: "production",
  MODE: "production",
  APP_ORIGIN: "https://guteneo.com",
  AUTH0_DOMAIN: "identity.example",
  AUTH0_CLIENT_ID: "fixture-client",
  AUTH0_AUDIENCE: "https://guteneo.com/mcp",
  AUTH0_CLIENT_SECRET: "fixture-secret",
} as Env;

describe("truthful live transport capabilities", () => {
  it.each([
    [undefined, false],
    ["", false],
    ["false", false],
    ["TRUE", false],
    ["1", false],
    ["true", true],
  ] as const)(
    "reports the exact %s switch in health and capabilities",
    async (flag, enabled) => {
      const env = { ...hosted, LIVE_SENDS_ENABLED: flag };
      for (const path of ["/api/health", "/api/capabilities"]) {
        const response = await worker.fetch(
          new Request(`${env.APP_ORIGIN}${path}`),
          env,
          {} as ExecutionContext,
        );
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
          mode: "production",
          liveSending: enabled,
        });
      }
    },
  );

  it.each([
    [undefined, [true, true, true]],
    ["fax", [true, false, false]],
    ["email,postal", [false, true, true]],
    ["", [false, false, false]],
    ["fax,", [false, false, false]],
    ["fax,other", [false, false, false]],
    ["FAX", [false, false, false]],
  ] as const)(
    "reports channel transport restrictions for %s without declaring provider qualification",
    (channels, allowed) => {
      const capabilities = getCapabilities({
        ...hosted,
        LIVE_SENDS_ENABLED: "true",
        LIVE_SEND_CHANNELS: channels,
        TELNYX_API_KEY: "fixture-only",
      });
      expect(capabilities.liveSending).toBe(allowed.some(Boolean));
      expect(
        capabilities.channels.map((channel) => channel.liveSending),
      ).toEqual(allowed);
      expect(capabilities.channels[0].status).toBe(
        "configured_not_live_validated",
      );
      expect(capabilities.checksAtPreparation).toContain(
        "qualified_destination_and_tariff",
      );
      expect(capabilities.productionBlockers).not.toContain("verified_tariffs");
      expect(capabilities.productionBlockers).not.toContain(
        "funded_sending_budget",
      );
    },
  );

  it("does not present simulation, local transport or an unsafe origin as live", () => {
    for (const overrides of [
      { MODE: "simulation" },
      { ENVIRONMENT: "local", APP_ORIGIN: "http://localhost:8787" },
      { APP_ORIGIN: "http://guteneo.com" },
      { APP_ORIGIN: "https://guteneo.com/other" },
      { APP_ORIGIN: "not-a-url" },
    ] as Partial<Env>[]) {
      expect(
        getCapabilities({ ...hosted, LIVE_SENDS_ENABLED: "true", ...overrides })
          .liveSending,
      ).toBe(false);
    }
    expect(
      getCapabilities({
        ...hosted,
        ENVIRONMENT: "staging",
        LIVE_SENDS_ENABLED: "true",
      }).liveSending,
    ).toBe(true);
  });

  it.each(["false", "true"])(
    "returns the same live switch through the MCP tool (%s)",
    async (flag) => {
      const env = { ...hosted, LIVE_SENDS_ENABLED: flag };
      const server = createGuteneoMcpServer(
        {
          context: {
            organizationId: "fixture-org",
            userId: "fixture-user",
            role: "admin",
            actor: "mcp",
          },
          scopes: [],
          clientId: "fixture-client",
          token: "fixture-not-a-real-token",
          expiresAt: 0,
        },
        env,
        {
          domain: new DomainService(env.DB, { mode: "production" }),
          capabilities: () => getCapabilities(env),
          documents: {
            async importFile() {
              throw new Error("No import allowed in this read test");
            },
            async render() {
              throw new Error("No rendering allowed in this read test");
            },
          },
        },
      );
      const client = new Client({
        name: "read-only-capabilities-test",
        version: "1",
      });
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
      try {
        await server.connect(serverTransport);
        await client.connect(clientTransport);
        const result = await client.callTool({
          name: "get_capabilities",
          arguments: {},
        });
        expect(result.isError).not.toBe(true);
        expect(result.structuredContent).toMatchObject({
          ok: true,
          data: { mode: "production", liveSending: flag === "true" },
        });
      } finally {
        await client.close();
        await server.close();
      }
    },
  );
});
