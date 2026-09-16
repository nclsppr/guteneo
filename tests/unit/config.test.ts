import { it, expect } from "vitest";
import { assertConfiguration, type Env } from "../../apps/api/src/env";
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
