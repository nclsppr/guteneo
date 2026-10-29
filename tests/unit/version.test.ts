import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GUTENEO_VERSION } from "../../packages/contracts/src/version";

describe("reported product version", () => {
  it("matches the package version so REST and MCP clients see one release", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    expect(GUTENEO_VERSION).toBe(manifest.version);
  });
});
