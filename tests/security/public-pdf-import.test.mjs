import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";

const root = new URL("../../", import.meta.url);

function apiConfigurations() {
  const configurations = [];
  for (const file of readdirSync(root).filter((name) =>
    /^wrangler(?:\..+)?\.json(?:c|\.example)?$/.test(name),
  )) {
    const { config, error } = ts.parseConfigFileTextToJson(
      file,
      readFileSync(new URL(file, root), "utf8"),
    );
    assert.equal(error, undefined, file);
    for (const [environment, overrides] of [
      [undefined, {}],
      ...Object.entries(config.env ?? {}),
    ]) {
      const effective = { ...config, ...overrides };
      if (!/^(?:\.\/)?apps\/api\//.test(effective.main ?? "")) continue;
      configurations.push({
        label: environment ? `${file}:env.${environment}` : file,
        config: effective,
      });
    }
  }
  assert.ok(
    configurations.some(({ label }) => label === "wrangler.live.jsonc"),
    "the released API configuration must be inspected",
  );
  assert.ok(configurations.length >= 4, "inspect API templates and local config");
  return configurations;
}

// This verifies the deployment contract, not runtime DNS or rebinding behavior.
test("every API configuration explicitly requires strictly public global fetch", () => {
  for (const { label, config } of apiConfigurations()) {
    assert.ok(
      config.compatibility_flags?.includes("global_fetch_strictly_public"),
      `${label} must not bypass zone security to reach its private origin`,
    );
    assert.ok(
      !config.compatibility_flags.includes("global_fetch_private_origin"),
      `${label} must not disable strictly public fetch`,
    );
  }
});

test("no API deployment retains a provider-domain PDF allowlist", () => {
  for (const { label, config } of apiConfigurations()) {
    assert.ok(
      !Object.hasOwn(config.vars ?? {}, "IMPORT_ALLOWED_HOSTS"),
      `${label} must accept public PDF domains without operator additions`,
    );
  }
});
