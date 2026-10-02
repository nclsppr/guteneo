import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import site from "../../packages/contracts/src/public-site.json" with { type: "json" };
import { collectAssets, sha256 } from "../../scripts/release-source.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));

test(
  "real preview manifest advertises only accessible assets and live retains its challenge",
  { timeout: 120000 },
  async () => {
    // Build the actual products; no deployment, remote API or communication occurs.
    for (const mode of ["preview", "live"])
      execFileSync(process.execPath, [`scripts/build-${mode}.mjs`], {
        cwd: root,
        timeout: 60000,
        stdio: "pipe",
      });
    const preview = join(root, "dist/preview");
    const release = JSON.parse(
      await readFile(join(preview, "release.json"), "utf8"),
    );
    const assets = await collectAssets(preview, [
      "/release.json",
      "/health.json",
    ]);
    assert.deepEqual(release.assets, assets);
    assert.equal(release.assetsSha256, sha256(JSON.stringify(assets)));
    for (const prefix of ["review", ...site.privatePrefixes]) {
      assert.ok(
        !assets.some(
          ({ path }) => path === `/${prefix}` || path.startsWith(`/${prefix}/`),
        ),
        `Preview advertises inaccessible /${prefix} assets`,
      );
      await assert.rejects(access(join(preview, prefix)), { code: "ENOENT" });
    }
    const challengePath = "/.well-known/openai-apps-challenge";
    const source = await readFile(join(root, "apps/web/public", challengePath));
    const live = join(root, "dist/web");
    assert.deepEqual(await readFile(join(live, challengePath)), source);
    const liveRelease = JSON.parse(
      await readFile(join(live, "release.json"), "utf8"),
    );
    assert.deepEqual(
      liveRelease.assets.find(({ path }) => path === challengePath),
      {
        path: challengePath,
        bytes: source.length,
        sha256: sha256(source),
      },
    );
  },
);
