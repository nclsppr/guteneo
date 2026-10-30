import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import worker, { getCapabilities } from "../../apps/api/src/index";
import { createGuteneoMcpServer } from "../../apps/api/src/mcp";
import type { Env } from "../../apps/api/src/env";
import { DomainService } from "../../packages/domain/src/index";
import release from "../../package.json" with { type: "json" };

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
    [undefined, "account_and_fresh_strong_authentication"],
    ["strong", "account_and_fresh_strong_authentication"],
    ["verified_account", "verified_account_session"],
  ] as const)(
    "reports the selected document authentication policy %s",
    (mode, authentication) => {
      expect(
        getCapabilities({ ...hosted, SENSITIVE_DOCUMENT_AUTHENTICATION: mode })
          .secureDistribution.authentication,
      ).toBe(authentication);
    },
  );

  it("does not announce document capabilities for an unknown authentication policy", () => {
    expect(() =>
      getCapabilities({
        ...hosted,
        SENSITIVE_DOCUMENT_AUTHENTICATION: "unknown",
      }),
    ).toThrow("INVALID_SENSITIVE_DOCUMENT_AUTHENTICATION");
  });

  it("announces the application release through the public capability endpoint", async () => {
    const response = await worker.fetch(
      new Request("https://guteneo.com/api/capabilities"),
      hosted,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ version: release.version });
  });

  it("advertises email defaults and the safe placeholder without enabling delivery", () => {
    const email = getCapabilities(hosted).channels.find(
      (channel) => channel.id === "email",
    );
    expect(email).toMatchObject({
      liveSending: false,
      status: "not_configured",
      content: {
        documentDefaults: "localized_authenticated_workspace",
        messageOnlyRequires: ["subject", "text_or_html"],
        documentHtmlPresentation: "branded_template_unless_custom_html",
        customHtml: "safe_inline_email_css",
        protectedLinkPlaceholder: "{{document_url}}",
        protectedLinkPlaceholderContext: "exact_anchor_href_only",
        contentBinding: "final_sanitized_content_before_fingerprint",
      },
    });
  });

  it("reports individual PDF-verification readiness consistently with its production gates", () => {
    const validator = {
      fetch: async () => new Response("fixture"),
    } as unknown as Fetcher;
    const scanner = {
      fetch: async () => new Response("fixture"),
    } as unknown as Fetcher;
    const ready = {
      ...hosted,
      PDF_VALIDATION_ENABLED: "true",
      PDF_VALIDATOR: validator,
      SCANNER: scanner,
    };
    const cases: [Partial<Env>, boolean][] = [
      [{}, true],
      [{ PDF_VALIDATION_ENABLED: undefined }, false],
      [{ PDF_VALIDATION_ENABLED: "false" }, false],
      [{ PDF_VALIDATION_ENABLED: "TRUE" }, false],
      [{ PDF_VALIDATOR: undefined }, false],
      [{ SCANNER: undefined }, false],
      [{ MODE: "simulation" }, false],
      [{ ENVIRONMENT: "local", MODE: "simulation", SCANNER: undefined }, true],
    ];
    for (const [overrides, available] of cases) {
      const capabilities = getCapabilities({ ...ready, ...overrides });
      expect(capabilities.pdfValidation.available).toBe(available);
      expect(capabilities.documents.validation.available).toBe(available);
      expect(capabilities.documents.validation).toMatchObject({
        requiresMonthlyPlan: false,
        paidPerCheck: true,
      });
      expect(capabilities.billing.requiresMonthlyPlan).toBe(false);
      expect(capabilities.pdfValidation).toMatchObject({
        priceMinor: 10,
        currency: "EUR",
        taxBasis: "excluding_tax",
        purchase: "administrator_browser_only",
        unit: "completed_check",
      });
    }
  });

  it("keeps paid PDF-verification activation independent of configured antivirus scanning", () => {
    const scanner = {
      fetch: async () => new Response("fixture"),
    } as unknown as Fetcher;
    const validator = {
      fetch: async () => new Response("fixture"),
    } as unknown as Fetcher;
    const closed = getCapabilities({
      ...hosted,
      SCANNER: scanner,
      PDF_VALIDATOR: validator,
    });
    expect(closed.scanner).toBe("connected");
    expect(closed.pdfValidation.available).toBe(false);
    expect(closed.documents.validation.available).toBe(false);
    const opened = getCapabilities({
      ...hosted,
      SCANNER: scanner,
      PDF_VALIDATOR: validator,
      PDF_VALIDATION_ENABLED: "true",
    });
    expect(opened.scanner).toBe("connected");
    expect(opened.pdfValidation.available).toBe(true);
  });

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
