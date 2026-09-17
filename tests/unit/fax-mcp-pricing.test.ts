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
import {
  customerFaxPricing,
  type FaxPricing,
} from "../../packages/contracts/src/fax-pricing";
import { readFileSync } from "node:fs";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/server/validators/ajv";

const openapi = JSON.parse(
  readFileSync(
    new URL("../../apps/web/public/openapi.json", import.meta.url),
    "utf8",
  ),
);
const validatePricing = new AjvJsonSchemaValidator().getValidator({
  ...openapi.components.schemas.FaxPricing,
  components: openapi.components,
});

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
        estimatedLowNanoeur: 50_273_036,
        estimatedHighNanoeur: 164_687_528,
        ceilingMinor: 200,
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
        estimated_minor: 17,
        ceiling_minor: 200,
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
            getDispatch: async () => ({
              dispatch,
              attempts: [{ id: "attempt_fixture" }],
            }),
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
              ceilingMinor: 200,
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
          if (name === "get_dispatch_status")
            expect(body.data).toMatchObject({
              attemptCount: 1,
              quoteExpiresAt: null,
            });
          const pricing =
            name === "list_dispatches"
              ? body.data.items?.[0].faxPricing
              : body.data.faxPricing;
          expect(pricing).toEqual({
            ...faxPricing,
            display: {
              locale: "fr-FR",
              creditUnit: "EUR_balance",
              estimate: {
                lowEur: "0.050273036",
                highEur: "0.164687528",
                label: "Environ 0,0503 à 0,1647 € HT",
                creditLabel: "Environ 0,0503 à 0,1647 € de crédit",
              },
              ceiling: {
                eur: "2.00",
                label: "Plafond ferme : 2,00 € HT",
                creditLabel: "Réservation à la confirmation : 2,00 € de crédit",
              },
              explanation: expect.stringContaining(
                "Ce n’est ni un prix fixe par page ni un débit",
              ),
              legacyEstimatedMinorMeaning: "rounded_up_estimated_high_centimes",
            },
          });
          expect(validatePricing(pricing).valid).toBe(true);
          expect(
            validatePricing({
              ...pricing,
              display: { ...pricing?.display, supplierCost: 1 },
            }).valid,
          ).toBe(false);
          expect(
            validatePricing({
              ...pricing,
              display: {
                ...pricing?.display,
                estimate: { ...pricing?.display?.estimate, lowEur: 0.05 },
              },
            }).valid,
          ).toBe(false);
          if (name !== "list_dispatches") {
            expect(body.data).toMatchObject({
              estimatedMinor: 17,
              ceilingMinor: 200,
            });
          }
          expect(response.content).toEqual([
            { type: "text", text: JSON.stringify(response.structuredContent) },
          ]);
          expect(JSON.stringify(response)).not.toMatch(
            /supplier|private-multiplier|guteneoAbsorbed|987654321|651391777/,
          );
        }
        const tools = await client.listTools();
        const prepare = tools.tools.find(
          (tool) => tool.name === "prepare_fax",
        )!;
        expect(prepare.description).toContain("borne haute arrondie");
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

describe("fax display precision", () => {
  const pricing: FaxPricing = {
    version: 3,
    currency: "EUR",
    basis: "qualified_usage_ex_tax",
    estimatedLowNanoeur: 1,
    estimatedHighNanoeur: 49_999,
    ceilingMinor: 1,
    fx: { numerator: 1, denominator: 1, date: "2026-09-17", source: "fixture" },
    settlement: {
      status: "not_reserved",
      customerNanoeur: null,
      chargedMinor: null,
      settledAt: null,
    },
  };
  it("does not round a tiny positive estimate to free or infer a settled charge", () => {
    const result = customerFaxPricing(pricing);
    expect(result.display.estimate).toEqual({
      lowEur: "0.000000001",
      highEur: "0.000049999",
      label: "Environ 0,000000001 à 0,000049999 € HT",
      creditLabel: "Environ 0,000000001 à 0,000049999 € de crédit",
    });
    expect(result.settlement).toEqual(pricing.settlement);
  });
  it("preserves whole euros and exact zero without inventing a debit", () => {
    const result = customerFaxPricing({
      ...pricing,
      estimatedLowNanoeur: 0,
      estimatedHighNanoeur: 1_000_000_000,
      ceilingMinor: 200,
    });
    expect(result.display.estimate.label).toBe("Environ 0,00 à 1,00 € HT");
    expect(result.display.ceiling.eur).toBe("2.00");
    expect(result.settlement.chargedMinor).toBeNull();
  });
});
