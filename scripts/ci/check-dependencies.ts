import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PDFME_VERSION } from "../../packages/contracts/src/templates";

type LockedPackage = {
  version?: string;
  peerDependencies?: Record<string, string>;
};
type Manifest = {
  dependencies?: Record<string, string>;
  overrides?: Record<string, unknown>;
};
type Lockfile = { packages: Record<string, LockedPackage> };

function resolvedDependency(
  packages: Lockfile["packages"],
  parent: string,
  dependency: string,
): LockedPackage | undefined {
  let cursor = parent;
  while (true) {
    const found =
      packages[`${cursor ? `${cursor}/` : ""}node_modules/${dependency}`];
    if (found) return found;
    if (!cursor) return undefined;
    const ancestor = cursor.lastIndexOf("/node_modules/");
    cursor = ancestor < 0 ? "" : cursor.slice(0, ancestor);
  }
}

export function requireDependencyCompatibility(
  manifest: Manifest,
  lockfile: Lockfile,
  engineVersion = PDFME_VERSION,
): void {
  const packages = lockfile.packages;
  for (const name of ["common", "generator", "schemas", "ui"]) {
    const dependency = `@pdfme/${name}`;
    assert.equal(
      manifest.dependencies?.[dependency],
      engineVersion,
      `${dependency} requires a reviewed template engine migration: the public and stored envelope contract advertises ${engineVersion}`,
    );
    assert.equal(
      packages[`node_modules/${dependency}`]?.version,
      engineVersion,
      `${dependency} must resolve to the advertised template engine version`,
    );
  }
  const pdfLib = manifest.dependencies?.["@pdfme/pdf-lib"];
  assert.match(
    pdfLib ?? "",
    /^\d+\.\d+\.\d+$/,
    "@pdfme/pdf-lib must be an explicit exact dependency so grouped updates cannot retain an incompatible wildcard transitive version",
  );
  assert.equal(packages["node_modules/@pdfme/pdf-lib"]?.version, pdfLib);

  const agents = packages["node_modules/agents"];
  for (const name of ["client", "server", "sdk"]) {
    const dependency = `@modelcontextprotocol/${name}`;
    const peer = agents?.peerDependencies?.[dependency];
    if (!peer || !/^\d+\.\d+\.\d+$/.test(peer)) continue;
    assert.equal(
      manifest.dependencies?.[dependency],
      peer,
      `${dependency} must retain the exact ${peer} peer required by agents; qualify an aligned agents/SDK update together`,
    );
    assert.equal(packages[`node_modules/${dependency}`]?.version, peer);
  }

  assert.deepEqual(
    manifest.overrides?.miniflare,
    { undici: "7.30.1" },
    "The undici security override must cover every Miniflare version, including the next Wrangler dependency",
  );
  for (const path of Object.keys(packages).filter((path) =>
    /(?:^|\/)node_modules\/miniflare$/.test(path),
  )) {
    assert.equal(
      resolvedDependency(packages, path, "undici")?.version,
      "7.30.1",
      `${path} must resolve the qualified patched undici version; a Wrangler update cannot reintroduce the vulnerable nested copy`,
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const root = new URL("../../", import.meta.url);
  const [manifest, lockfile] = await Promise.all(
    ["package.json", "package-lock.json"].map(async (name) =>
      JSON.parse(await readFile(new URL(name, root), "utf8")),
    ),
  );
  requireDependencyCompatibility(manifest, lockfile);
  console.log(
    "Dependency compatibility passed: template engine, exact MCP peers and patched Miniflare transport.",
  );
}
