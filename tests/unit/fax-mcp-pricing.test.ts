import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { createGuteneoMcpServer } from "../../apps/api/src/mcp";
import {
  MCP_SCOPES,
  type AuthEnv,
  type McpIdentity,
} from "../../apps/api/src/auth";
import type { DomainService, Dispatch } from "../../packages/domain/src/index";
import type { FaxPricing } from "../../packages/contracts/src/fax-pricing";

const identity: McpIdentity = {
  context: {
    organizationId: "org_fixture",
    userId: "user_fixture",
    role: "admin",
    actor: "mcp",
  },
  scopes: [...MCP_SCOPES],
  clientId: "fixture-only",
  token: "fixture-only",
  expiresAt: 0,
};

describe("fax pricing through the official MCP transport", () => {
  it.each(["not_reserved", "reserved", "settled", "released"] as const)(
    "preserves %s without publishing supplier accounting",
    async (status) => {
      const faxPricing: FaxPricing = {
        version: 3,
        currency: "EUR",
        basis: "qualified_usage_ex_tax",
        estimatedLowNanoeur: 10_000_001,
        estimatedHighNanoeur: 20_000_009,
        ceilingMinor: 100,
        fx: {
          numerator: 9,
          denominator: 10,
          date: "2026-09-17",
          source: "https://www.ecb.europa.eu/",
        },
        settlement: {
          status,
          customerNanoeur: status === "settled" ? 3_000_001 : null,
          chargedMinor: status === "settled" ? 0 : null,
          settledAt: status === "settled" ? "2026-09-17T10:15:00.000Z" : null,
        },
      };
      const dispatch = {
        id: "dispatch_fixture",
        channel: "fax",
        status: "delivered",
        mode: "production",
        recipient_json: '{"phone":"+33123456789"}',
        document_id: "document_fixture",
        campaign_id: null,
        fingerprint: "a".repeat(64),
        estimated_minor: 3,
        ceiling_minor: 100,
        known_minor: null,
        currency: "EUR",
        updated_at: "2026-09-17T10:00:00.000Z",
        quote_supplier_nanoeur: 651391777,
        faxPricing: {
          ...faxPricing,
          priceRule: "private-multiplier",
          supplierNanoeur: 651391777,
          settlement: {
            ...faxPricing.settlement,
            guteneoAbsorbedNanoeur: 987654321,
          },
        },
      } as unknown as Dispatch;
      const server = createGuteneoMcpServer(
        identity,
        { APP_ORIGIN: "https://guteneo.invalid" } as AuthEnv,
        {
          domain: {
            getDispatch: async () => ({ dispatch }),
            listDispatches: async () => ({
              items: [dispatch],
              nextCursor: null,
            }),
            prepareDispatch: async () => dispatch,
          } as unknown as DomainService,
          documents: {
            importFile: async () => {
              throw new Error("No upload in contract test");
            },
            render: async () => {
              throw new Error("No rendering in contract test");
            },
          },
          capabilities: () => ({ mode: "production", liveSendsEnabled: false }),
        },
      );
      const client = new Client({ name: "fax-pricing-contract", version: "1" });
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      try {
        for (const [name, args] of [
          ["get_dispatch_status", { dispatchId: dispatch.id }],
          ["list_dispatches", {}],
          [
            "prepare_fax",
            {
              documentId: "document_fixture",
              phone: "+33123456789",
              ceilingMinor: 100,
              idempotencyKey: "fixture",
            },
          ],
        ] as const) {
          const response = await client.callTool({ name, arguments: args });
          expect(response.isError).not.toBe(true);
          const body = response.structuredContent as {
            ok: boolean;
            data: {
              faxPricing?: FaxPricing;
              items?: { faxPricing: FaxPricing }[];
            };
          };
          expect(body.ok).toBe(true);
          expect(
            name === "list_dispatches"
              ? body.data.items?.[0].faxPricing
              : body.data.faxPricing,
          ).toEqual(faxPricing);
          expect(JSON.stringify(response)).not.toMatch(
            /supplier|private-multiplier|guteneoAbsorbed|987654321|651391777/,
          );
        }
        const tools = await client.listTools();
        expect(
          tools.tools.some((tool) => /settle|price|cost/.test(tool.name)),
        ).toBe(false);
      } finally {
        await client.close();
        await server.close();
      }
    },
  );
});
