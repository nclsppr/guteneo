import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import site from "../../packages/contracts/src/public-site.json" with { type: "json" };
import mcpUiProbeManifest from "../../packages/contracts/src/mcp-ui-probe-resource.json" with { type: "json" };
import { collectAssets, sha256 } from "../../scripts/release-source.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));

async function assertCanonicalPublicAssets(output, release) {
  const paths = new Set(release.assets.map(({ path }) => path));
  const diagnostic = await readFile(join(output, mcpUiProbeManifest.path));
  assert.deepEqual(
    release.assets.find(({ path }) => path === mcpUiProbeManifest.path),
    {
      path: mcpUiProbeManifest.path,
      bytes: mcpUiProbeManifest.bytes,
      sha256: mcpUiProbeManifest.sha256,
    },
  );
  assert.equal(diagnostic.length, mcpUiProbeManifest.bytes);
  assert.equal(sha256(diagnostic), mcpUiProbeManifest.sha256);
  for (const [alias, canonical] of Object.entries(site.assetAliases)) {
    assert.ok(
      !paths.has(alias),
      `Manifest advertises redirected asset ${alias}`,
    );
    await assert.rejects(access(join(output, alias)), { code: "ENOENT" });
    const source = await readFile(join(root, "apps/web/public", canonical));
    assert.deepEqual(await readFile(join(output, canonical)), source);
    assert.deepEqual(
      release.assets.find(({ path }) => path === canonical),
      { path: canonical, bytes: source.length, sha256: sha256(source) },
    );
  }
  for (const prefix of [
    "",
    ...site.locales.map((locale) => `${site.localizedPrefix}/${locale}`),
  ]) {
    for (const [alias, canonical] of Object.entries(site.aliases)) {
      for (const path of [
        `${prefix}${alias.slice(0, -1)}`,
        `${prefix}${alias.slice(0, -1)}.html`,
        `${prefix}${alias}index.html`,
      ]) {
        assert.ok(
          !paths.has(path),
          `Manifest advertises redirected page ${path}`,
        );
        await assert.rejects(access(join(output, path)), { code: "ENOENT" });
      }
      assert.ok(
        paths.has(`${prefix}${canonical}index.html`),
        `Manifest is missing canonical page ${prefix}${canonical}`,
      );
    }
  }
}

test(
  "real preview and live manifests contain canonical public assets and retain their access boundaries",
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
    await assertCanonicalPublicAssets(preview, release);
    await assertCanonicalPublicAssets(live, liveRelease);
    const archivePath = "integrations/guteneo-plugin.zip";
    const archive = await readFile(join(live, archivePath));
    assert.deepEqual(await readFile(join(preview, archivePath)), archive);
    for (const output of [live, preview]) {
      const manifest = JSON.parse(
        await readFile(join(output, "integrations/manifest.json"), "utf8"),
      );
      assert.equal(manifest.bytes, archive.length);
      assert.equal(manifest.sha256, sha256(archive));
    }
    assert.ok(assets.some(({ path }) => path === `/${archivePath}`));
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
