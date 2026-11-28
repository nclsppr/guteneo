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
  FAX_MAX_ESTIMATE_NANOEUR,
  FAX_MAX_ESTIMATE_NOTICE,
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
              phone: "+6831234",
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
              locale: "en-GB",
              creditUnit: "EUR_balance",
              estimate: {
                lowEur: "0.050273036",
                highEur: "0.164687528",
                label: "About EUR0.0503 to 0.1647 excl. tax",
                creditLabel: "About EUR0.0503 to 0.1647 in credit",
              },
              ceiling: {
                eur: "2.00",
                label: "Firm ceiling: EUR2.00 excl. tax",
                creditLabel: "Reservation on confirmation: EUR2.00 in credit",
              },
              explanation: expect.stringContaining(
                "It is neither a fixed per-page price nor a charge",
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
        expect(prepare.description).toContain("upper bound rounded up");
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
      label: "About EUR0.000000001 to 0.000049999 excl. tax",
      creditLabel: "About EUR0.000000001 to 0.000049999 in credit",
    });
    expect(result.settlement).toEqual(pricing.settlement);
  });
  it.each([
    "worldwide_catalog",
    "last_known_reference",
    "guteneo_continuity_v1",
  ] as const)(
    "publishes the worldwide quote basis %s and its separate firm ceiling",
    (referenceBasis) => {
      const quote = customerFaxPricing({
        ...pricing,
        referenceBasis,
        estimatedLowNanoeur: 250_000_000,
        estimatedHighNanoeur: 250_000_000,
        ceilingMinor: 200,
      });
      expect(quote.referenceBasis).toBe(referenceBasis);
      expect(quote.executionScope).toBeUndefined();
      expect(quote.display.estimate.label).toBe("About EUR0.25 excl. tax");
      expect(quote.display.ceiling.label).toBe(
        "Firm ceiling: EUR2.00 excl. tax",
      );
      expect(validatePricing(quote).valid).toBe(true);
      if (referenceBasis === "guteneo_continuity_v1")
        expect(quote.display.explanation).toContain(
          "€0.25 per page excluding tax",
        );
    },
  );
  it("discloses the maximum only on worldwide estimates that reach it", () => {
    const expensive = {
      ...pricing,
      referenceBasis: "worldwide_catalog" as const,
      estimatedHighNanoeur: FAX_MAX_ESTIMATE_NANOEUR,
      ceilingMinor: 200,
    };
    const seen = customerFaxPricing(expensive).display;
    expect(seen.explanation).toContain(FAX_MAX_ESTIMATE_NOTICE);
    expect(seen.ceiling.eur).toBe("2.00");
    for (const variant of [
      { estimatedHighNanoeur: FAX_MAX_ESTIMATE_NANOEUR - 1 },
      { referenceBasis: undefined },
      { executionScope: "review_prepare_only" as const },
    ]) {
      expect(customerFaxPricing({ ...expensive, ...variant }).display.explanation)
        .not.toContain(FAX_MAX_ESTIMATE_NOTICE);
    }
  });
  it("preserves whole euros and exact zero without inventing a debit", () => {
    const result = customerFaxPricing({
      ...pricing,
      estimatedLowNanoeur: 0,
      estimatedHighNanoeur: 1_000_000_000,
      ceilingMinor: 200,
    });
    expect(result.display.estimate.label).toBe(
      "About EUR0.00 to 1.00 excl. tax",
    );
    expect(result.display.ceiling.eur).toBe("2.00");
    expect(result.settlement.chargedMinor).toBeNull();
  });
});

it("carries archived reviewer pricing through strict MCP and OpenAPI output schemas", async () => {
  const pricing: FaxPricing = {
    version: 3,
    currency: "EUR",
    basis: "qualified_usage_ex_tax",
    executionScope: "review_prepare_only",
    referenceBasis: "archived_review_reference",
    routeQualification: "operator_authorized_test",
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
      status: "not_reserved",
      customerNanoeur: null,
      chargedMinor: null,
      settledAt: null,
    },
  };
  const dispatch = {
    id: "continuous_review_fixture",
    channel: "fax",
    status: "prepared",
    mode: "production",
    recipient_json: '{"phone":"+35220000000"}',
    document_id: "document_fixture",
    campaign_id: null,
    fingerprint: "a".repeat(64),
    estimated_minor: 17,
    ceiling_minor: 200,
    known_minor: null,
    currency: "EUR",
    updated_at: "2027-02-01T10:00:00.000Z",
    quote_expires_at: "2027-02-01T10:15:00.000Z",
    faxPricing: pricing,
    review_access_id: "private-access-should-not-leak",
  } as unknown as Dispatch;
  const server = createGuteneoMcpServer(
    identity,
    { APP_ORIGIN: "https://guteneo.invalid" } as AuthEnv,
    {
      domain: {
        getDispatch: async () => ({ dispatch, attempts: [] }),
        listDispatches: async () => ({ items: [dispatch], nextCursor: null }),
        prepareDispatch: async () => dispatch,
      } as unknown as DomainService,
      documents: {
        importFile: async () => {
          throw new Error("No import in transport regression");
        },
        render: async () => {
          throw new Error("No render in transport regression");
        },
      },
      capabilities: () => ({ mode: "production", liveSendsEnabled: false }),
    },
  );
  const client = new Client({
    name: "continuous-review-pricing-contract",
    version: "1",
  });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  await client.connect(ct);
  try {
    const { tools } = await client.listTools(),
      validator = new AjvJsonSchemaValidator();
    for (const [name, args] of [
      [
        "prepare_fax",
        {
          documentId: "document_fixture",
          phone: "+35220000000",
          ceilingMinor: 200,
          idempotencyKey: "continuous_fixture",
        },
      ],
      ["get_dispatch_status", { dispatchId: dispatch.id }],
      ["list_dispatches", {}],
    ] as const) {
      const response = await client.callTool({ name, arguments: args });
      expect(response.isError).not.toBe(true);
      const tool = tools.find((entry) => entry.name === name)!;
      expect(tool.outputSchema).toBeDefined();
      expect(
        validator.getValidator(tool.outputSchema!)(response.structuredContent)
          .valid,
      ).toBe(true);
      const body = response.structuredContent as {
        ok: boolean;
        data: {
          faxPricing?: FaxPricing;
          items?: { faxPricing: FaxPricing }[];
          attemptCount?: number;
          nextActions?: string[];
        };
      };
      expect(body.ok).toBe(true);
      const projected =
        name === "list_dispatches"
          ? body.data.items?.[0].faxPricing
          : body.data.faxPricing;
      expect(projected).toMatchObject({
        executionScope: "review_prepare_only",
        referenceBasis: "archived_review_reference",
        fx: { date: "2026-09-17" },
        display: {
          explanation: expect.stringContaining("not a current provider price"),
        },
        settlement: { status: "not_reserved", chargedMinor: null },
      });
      expect(validatePricing(projected).valid).toBe(true);
      expect(
        validatePricing({
          ...projected,
          referenceBasis: "current_provider_price",
        }).valid,
      ).toBe(false);
      if (name !== "list_dispatches") {
        expect(body.data.nextActions?.join(" ")).toContain(
          "no periodic tariff revalidation is required",
        );
        if (name === "get_dispatch_status")
          expect(body.data.attemptCount).toBe(0);
      }
      expect(JSON.stringify(response)).not.toContain(
        "private-access-should-not-leak",
      );
      expect(response.content).toEqual([
        { type: "text", text: JSON.stringify(response.structuredContent) },
      ]);
    }
  } finally {
    await client.close();
    await server.close();
  }
});
