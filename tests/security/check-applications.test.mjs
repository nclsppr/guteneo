import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

function check(manifest) {
  return spawnSync(
    process.execPath,
    ["scripts/check-applications.mjs", ...(manifest ? [manifest] : [])],
    { encoding: "utf8" },
  );
}

test("the web applications pass their boundary and design rules", () => {
  const result = check();
  assert.equal(result.status, 0, result.stderr);
});

test("a cross-application import, an eager load and design drift are refused", () => {
  const result = check("tests/fixtures/applications/manifest.json");
  assert.equal(result.status, 1);
  const lines = result.stderr.trim().split("\n");
  assert.deepEqual(lines.sort(), [
    "main.tsx (host) imports studio.tsx (studio). Load an application with import() so it stays in its own chunk.",
    "studio.css: 1 font-family (allowed 0). Use the design-system tokens and shared frame.",
    "studio.css: 1 raw-color (allowed 0). Use the design-system tokens and shared frame.",
    "studio.css: 1 shell-selector (allowed 0). Use the design-system tokens and shared frame.",
    "studio.css: 1 token-override (allowed 0). Use the design-system tokens and shared frame.",
    "studio.tsx (studio) imports personal.tsx (personal). Applications share code only through the shared layer.",
  ]);
});
