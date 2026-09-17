import { it, expect, vi } from "vitest";
import { assertConfiguration, type Env } from "../../apps/api/src/env";
import worker, { getCapabilities } from "../../apps/api/src/index";
it("refuses simulation production, remote dev and unconfigured identity", () => {
  const base = {
    ENVIRONMENT: "local",
    MODE: "simulation",
    APP_ORIGIN: "http://localhost:8787",
  } as Env;
  expect(() =>
    assertConfiguration(base, new Request("http://localhost:8787")),
  ).not.toThrow();
  expect(() =>
    assertConfiguration(base, new Request("https://public.example")),
  ).toThrow("LOCAL_HOST");
  expect(() =>
    assertConfiguration({ ...base, ENVIRONMENT: "production" }),
  ).toThrow("PRODUCTION_SIMULATION");
  expect(() =>
    assertConfiguration({
      ...base,
      ENVIRONMENT: "production",
      MODE: "production",
      APP_ORIGIN: "https://guteneo.com",
    }),
  ).toThrow("IDENTITY");
});

it("allows only a configured SES POST to reach its independent signature verifier", () => {
  const env = {
    ENVIRONMENT: "production",
    MODE: "production",
    APP_ORIGIN: "https://guteneo.com",
    SES_SNS_TOPIC_ARN: "arn:aws:sns:eu-west-1:123456789012:guteneo-test",
  } as Env;
  const callback = new Request("https://guteneo.com/webhooks/ses", {
    method: "POST",
  });
  expect(() => assertConfiguration(env, callback)).not.toThrow();
  expect(() =>
    assertConfiguration({ ...env, SES_SNS_TOPIC_ARN: undefined }, callback),
  ).toThrow("IDENTITY_NOT_CONFIGURED");
  for (const [path, method] of [
    ["/webhooks/ses", "GET"],
    ["/webhooks/ses", "PUT"],
    ["/webhooks/ses/", "POST"],
    ["/webhooks/telnyx", "POST"],
    ["/webhooks/stripe", "POST"],
    ["/api/documents", "POST"],
    ["/mcp", "POST"],
  ])
    expect(() =>
      assertConfiguration(
        env,
        new Request(`https://guteneo.com${path}`, { method }),
      ),
    ).toThrow("IDENTITY_NOT_CONFIGURED");
  expect(() =>
    assertConfiguration({ ...env, MODE: "simulation" }, callback),
  ).toThrow("PRODUCTION_SIMULATION_FORBIDDEN");
  expect(() =>
    assertConfiguration({ ...env, APP_ORIGIN: "http://guteneo.com" }, callback),
  ).toThrow("HTTPS_REQUIRED");
  expect(() =>
    assertConfiguration({ ...env, ENVIRONMENT: "local" }, callback),
  ).toThrow("LOCAL_HOST_REQUIRED");
});

it("allows only a configured Telnyx POST to reach its independent signature verifier", () => {
  const env = {
    ENVIRONMENT: "production",
    MODE: "production",
    APP_ORIGIN: "https://guteneo.com",
    TELNYX_PUBLIC_KEY: "fixture-public-key-verifier-still-required",
  } as Env;
  const callback = new Request("https://guteneo.com/webhooks/telnyx", {
    method: "POST",
  });
  expect(() => assertConfiguration(env, callback)).not.toThrow();
  for (const key of [undefined, ""])
    expect(() =>
      assertConfiguration({ ...env, TELNYX_PUBLIC_KEY: key }, callback),
    ).toThrow("IDENTITY_NOT_CONFIGURED");
  for (const [path, method] of [
    ["/webhooks/telnyx", "GET"],
    ["/webhooks/telnyx", "HEAD"],
    ["/webhooks/telnyx", "PUT"],
    ["/webhooks/telnyx", "OPTIONS"],
    ["/webhooks/telnyx/", "POST"],
    ["/webhooks/telnyx/other", "POST"],
    ["/webhooks/telnyx-other", "POST"],
    ["/webhooks/Telnyx", "POST"],
    ["/webhooks/%74elnyx", "POST"],
    ["/webhooks/ses", "POST"],
    ["/webhooks/pingen", "POST"],
    ["/webhooks/stripe", "POST"],
    ["/api/session", "GET"],
    ["/api/documents", "POST"],
    ["/mcp", "POST"],
  ])
    expect(() =>
      assertConfiguration(
        env,
        new Request(`https://guteneo.com${path}`, { method }),
      ),
    ).toThrow("IDENTITY_NOT_CONFIGURED");
  expect(() => assertConfiguration(env)).toThrow("IDENTITY_NOT_CONFIGURED");
  expect(() =>
    assertConfiguration({ ...env, MODE: "simulation" }, callback),
  ).toThrow("PRODUCTION_SIMULATION_FORBIDDEN");
  expect(() =>
    assertConfiguration({ ...env, APP_ORIGIN: "http://guteneo.com" }, callback),
  ).toThrow("HTTPS_REQUIRED");
  expect(() =>
    assertConfiguration({ ...env, ENVIRONMENT: "local" }, callback),
  ).toThrow("LOCAL_HOST_REQUIRED");
});

it("rejects unsafe scheduled environments before reading receipts", async () => {
  const prepare = vi.fn();
  const env = {
    DB: { prepare },
    ENVIRONMENT: "production",
    MODE: "simulation",
    APP_ORIGIN: "https://guteneo.com",
  } as unknown as Env;
  await expect(
    worker.scheduled({} as ScheduledController, env),
  ).rejects.toThrow("CRON_FAILED");
  await expect(
    worker.scheduled({} as ScheduledController, {
      ...env,
      MODE: "production",
      APP_ORIGIN: "http://guteneo.com",
    }),
  ).rejects.toThrow("CRON_FAILED");
  expect(prepare).not.toHaveBeenCalled();
});
it("allows only read-only readiness while identity is awaiting configuration", () => {
  const env = {
    ENVIRONMENT: "production",
    MODE: "production",
    APP_ORIGIN: "https://guteneo.com",
  } as Env;
  for (const path of ["/api/health", "/api/capabilities"])
    expect(() =>
      assertConfiguration(env, new Request(`https://guteneo.com${path}`)),
    ).not.toThrow();
  for (const path of ["/api/session", "/api/documents", "/mcp"])
    expect(() =>
      assertConfiguration(env, new Request(`https://guteneo.com${path}`)),
    ).toThrow("IDENTITY");
  expect(() =>
    assertConfiguration(
      env,
      new Request("https://guteneo.com/api/capabilities", { method: "POST" }),
    ),
  ).toThrow("IDENTITY");
});

it("keeps registration and health incomplete until every identity setting exists", async () => {
  const complete = {
    ENVIRONMENT: "production",
    MODE: "production",
    APP_ORIGIN: "https://guteneo.com",
    AUTH0_DOMAIN: "identity.example",
    AUTH0_CLIENT_ID: "fixture-client",
    AUTH0_AUDIENCE: "https://guteneo.com/mcp",
    AUTH0_CLIENT_SECRET: "fixture-secret",
  } as Env;
  for (const field of [
    "AUTH0_DOMAIN",
    "AUTH0_CLIENT_ID",
    "AUTH0_AUDIENCE",
    "AUTH0_CLIENT_SECRET",
  ] as const) {
    const partial = { ...complete, [field]: undefined };
    const response = await worker.fetch(
      new Request("https://guteneo.com/api/health"),
      partial,
      {} as ExecutionContext,
    );
    expect(await response.json()).toMatchObject({
      status: "configuration_required",
      liveSending: false,
    });
    expect(getCapabilities(partial).registration.enabled).toBe(false);
    expect(getCapabilities(partial).productionBlockers).toContain(
      "identity_configuration",
    );
  }
  expect(getCapabilities(complete).registration.enabled).toBe(true);
});

it("blocks hosted private routes and work until the confidential Auth0 client is complete", async () => {
  const prepare = vi.fn();
  const env = {
    DB: { prepare },
    ENVIRONMENT: "production",
    MODE: "production",
    APP_ORIGIN: "https://guteneo.com",
    AUTH0_DOMAIN: "identity.example",
    AUTH0_CLIENT_ID: "fixture-client",
    AUTH0_AUDIENCE: "https://guteneo.com/mcp",
  } as unknown as Env;
  for (const secret of [undefined, ""]) {
    const partial = { ...env, AUTH0_CLIENT_SECRET: secret };
    expect(() => assertConfiguration(partial)).toThrow(
      "IDENTITY_NOT_CONFIGURED",
    );
    for (const [path, method] of [
      ["/api/session", "GET"],
      ["/api/documents", "POST"],
      ["/mcp", "POST"],
    ]) {
      const response = await worker.fetch(
        new Request(`https://guteneo.com${path}`, { method }),
        partial,
        {} as ExecutionContext,
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        error: { code: "CONFIGURATION_INVALID" },
      });
    }
    for (const path of ["/api/health", "/api/capabilities"])
      expect(() =>
        assertConfiguration(partial, new Request(`https://guteneo.com${path}`)),
      ).not.toThrow();
  }
  expect(prepare).not.toHaveBeenCalled();
  expect(() =>
    assertConfiguration({
      ...env,
      AUTH0_CLIENT_SECRET: "fixture-confidential-client",
    }),
  ).not.toThrow();
});

for (const provider of ["pingen", "stripe"] as const) {
  it(`allows only the configured ${provider} POST during identity setup without weakening base guards`, () => {
    const providerConfig =
      provider === "pingen"
        ? {
            PINGEN_WEBHOOK_SECRET: "fixture-signature-key",
            PINGEN_ORGANIZATION_ID: "fixture-organisation",
          }
        : {
            STRIPE_WEBHOOK_SECRET: "whsec_fixture",
            STRIPE_API_KEY: "rk_live_fixture",
            STRIPE_MODE: "live" as const,
          };
    const env = {
      ENVIRONMENT: "production",
      MODE: "production",
      APP_ORIGIN: "https://guteneo.com",
      ...providerConfig,
    } as Env;
    const url = `https://guteneo.com/webhooks/${provider}`;
    const callback = new Request(url, { method: "POST" });
    expect(() => assertConfiguration(env, callback)).not.toThrow();
    for (const field of Object.keys(providerConfig))
      for (const value of [undefined, ""])
        expect(() =>
          assertConfiguration({ ...env, [field]: value }, callback),
        ).toThrow("IDENTITY_NOT_CONFIGURED");
    for (const method of ["GET", "HEAD", "PUT", "OPTIONS", "DELETE"])
      expect(() =>
        assertConfiguration(env, new Request(url, { method })),
      ).toThrow("IDENTITY_NOT_CONFIGURED");
    for (const path of [
      `/webhooks/${provider}/`,
      `/webhooks/${provider}/other`,
      `/webhooks/${provider}-other`,
      `/webhooks/${provider.toUpperCase()}`,
      `/webhooks/%${provider.charCodeAt(0).toString(16)}${provider.slice(1)}`,
      ...["ses", "telnyx", provider === "pingen" ? "stripe" : "pingen"].map(
        (name) => `/webhooks/${name}`,
      ),
      "/api/session",
      "/api/documents",
      "/api/billing/customer",
      "/mcp",
    ])
      expect(() =>
        assertConfiguration(
          env,
          new Request(`https://guteneo.com${path}`, { method: "POST" }),
        ),
      ).toThrow("IDENTITY_NOT_CONFIGURED");
    expect(() => assertConfiguration(env)).toThrow("IDENTITY_NOT_CONFIGURED");
    expect(() =>
      assertConfiguration({ ...env, MODE: "simulation" }, callback),
    ).toThrow("PRODUCTION_SIMULATION_FORBIDDEN");
    expect(() =>
      assertConfiguration(
        { ...env, APP_ORIGIN: "http://guteneo.com" },
        callback,
      ),
    ).toThrow("HTTPS_REQUIRED");
    expect(() =>
      assertConfiguration({ ...env, ENVIRONMENT: "local" }, callback),
    ).toThrow("LOCAL_HOST_REQUIRED");
    if (provider === "stripe")
      for (const changes of [
        { STRIPE_MODE: "test" as const, STRIPE_API_KEY: "rk_test_fixture" },
        { STRIPE_API_KEY: "rk_test_fixture" },
        { STRIPE_API_KEY: "invalid-key" },
      ])
        expect(() =>
          assertConfiguration({ ...env, ...changes }, callback),
        ).toThrow("IDENTITY_NOT_CONFIGURED");
  });
}
