import { it, expect } from "vitest";
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
    }),
  ).toThrow("IDENTITY");
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
