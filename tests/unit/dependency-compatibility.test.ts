import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { PDFME_VERSION } from "../../packages/contracts/src/templates";
import { requireDependencyCompatibility } from "../../scripts/ci/check-dependencies";

async function actualDependencies() {
  const root = new URL("../../", import.meta.url);
  const [manifest, lockfile] = await Promise.all(
    ["package.json", "package-lock.json"].map(async (name) =>
      JSON.parse(await readFile(new URL(name, root), "utf8")),
    ),
  );
  return { manifest, lockfile };
}

describe("Dependency compatibility across automatic updates", () => {
  it("keeps the actual renderer contract, exact MCP peers and patched Miniflare transport consistent", async () => {
    const { manifest, lockfile } = await actualDependencies();
    requireDependencyCompatibility(manifest, lockfile);
  });

  it("refuses the pdfme update that would silently change the stored template engine", async () => {
    const { manifest, lockfile } = await actualDependencies();
    for (const name of ["common", "generator", "schemas", "ui"]) {
      manifest.dependencies[`@pdfme/${name}`] = "6.2.8";
      lockfile.packages[`node_modules/@pdfme/${name}`].version = "6.2.8";
    }
    expect(() => requireDependencyCompatibility(manifest, lockfile)).toThrow(
      `the public and stored envelope contract advertises ${PDFME_VERSION}`,
    );
  });

  it("refuses the SDK update while agents requires the earlier exact peer", async () => {
    const { manifest, lockfile } = await actualDependencies();
    manifest.dependencies["@modelcontextprotocol/client"] = "2.4.0";
    lockfile.packages["node_modules/@modelcontextprotocol/client"].version =
      "2.4.0";
    expect(() => requireDependencyCompatibility(manifest, lockfile)).toThrow(
      "peer required by agents",
    );
  });

  it("refuses absent or changed agents peer evidence instead of skipping validation", async () => {
    const { manifest, lockfile } = await actualDependencies();
    for (const mutate of [
      (packages: typeof lockfile.packages) => {
        delete packages["node_modules/agents"];
      },
      (packages: typeof lockfile.packages) => {
        delete packages["node_modules/agents"].peerDependencies;
      },
      (packages: typeof lockfile.packages) => {
        delete packages["node_modules/agents"].peerDependencies[
          "@modelcontextprotocol/server"
        ];
      },
      (packages: typeof lockfile.packages) => {
        packages["node_modules/agents"].peerDependencies[
          "@modelcontextprotocol/client"
        ] = "^2.0.0";
      },
    ]) {
      const altered = structuredClone(lockfile);
      mutate(altered.packages);
      expect(() => requireDependencyCompatibility(manifest, altered)).toThrow(
        /agents.*peer|peer.*agents/,
      );
    }
  });

  it("requires the direct locked Miniflare even when nested evidence remains", async () => {
    const { manifest, lockfile } = await actualDependencies();
    delete lockfile.packages["node_modules/miniflare"];
    lockfile.packages["node_modules/wrangler/node_modules/miniflare"] = {
      version: "5.20261019.2-beta",
    };
    expect(() => requireDependencyCompatibility(manifest, lockfile)).toThrow(
      "direct locked Miniflare package is required",
    );
    delete lockfile.packages["node_modules/wrangler/node_modules/miniflare"];
    expect(() => requireDependencyCompatibility(manifest, lockfile)).toThrow(
      "direct locked Miniflare package is required",
    );
  });

  it("keeps a future Wrangler's nested Miniflare under the same undici security override", async () => {
    const { manifest, lockfile } = await actualDependencies();
    lockfile.packages["node_modules/wrangler/node_modules/miniflare"] = {
      version: "5.20261019.2-beta",
    };
    lockfile.packages["node_modules/wrangler/node_modules/undici"] = {
      version: "7.29.1",
    };
    expect(() => requireDependencyCompatibility(manifest, lockfile)).toThrow(
      "cannot reintroduce the vulnerable nested copy",
    );
    lockfile.packages["node_modules/wrangler/node_modules/undici"].version =
      "7.30.1";
    expect(() =>
      requireDependencyCompatibility(manifest, lockfile),
    ).not.toThrow();
  });
});
