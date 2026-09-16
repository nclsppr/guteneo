import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { build } from "vite";
import { buildIntegrationPackage } from "../integrations/build.mjs";
import { buildPublicPages } from "./build-public-pages.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "dist/web");
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" });
const hash = (value) => createHash("sha256").update(value).digest("hex");
const scope = [
  "apps/api",
  "apps/web",
  "packages",
  "migrations",
  "integrations",
  "scripts/build-live.mjs",
  "scripts/build-public-pages.mjs",
  "scripts/verify-release.mjs",
  "wrangler.live.jsonc",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
];
async function snapshot() {
  const paths = git(
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
    "--",
    ...scope,
  )
    .split("\0")
    .filter(Boolean)
    .sort();
  const digest = createHash("sha256");
  for (const path of paths) {
    try {
      digest
        .update(path)
        .update("\0")
        .update(await readFile(join(root, path)))
        .update("\0");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return digest.digest("hex");
}
async function assets(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await assets(path)));
    else {
      const bytes = await readFile(path);
      result.push({
        path: `/${relative(output, path).split("\\").join("/")}`,
        bytes: bytes.length,
        sha256: hash(bytes),
      });
    }
  }
  return result.sort((a, b) => a.path.localeCompare(b.path));
}
const sourceCommit = git("rev-parse", "HEAD").trim();
const sourceSnapshotSha256 = await snapshot();
const sourceDirty = Boolean(
  git("status", "--porcelain", "--", ...scope).trim(),
);
delete process.env.VITE_PUBLIC_PREVIEW;
await build({
  configFile: join(root, "apps/web/vite.config.ts"),
  build: { outDir: output, emptyOutDir: true },
});
await buildIntegrationPackage(join(output, "integrations"));
await buildPublicPages({ root, output, indexable: false });
if ((await snapshot()) !== sourceSnapshotSha256)
  throw new Error(
    "Source changed during build. Build again before deployment.",
  );
const publishedAssets = await assets(output);
await writeFile(
  join(output, "release.json"),
  JSON.stringify(
    {
      product: "Guteneo",
      version: "0.2.0",
      mode: "production",
      publicPreview: false,
      liveSendsEnabled: false,
      sourceCommit,
      sourceDirty,
      sourceSnapshotSha256,
      sourceSnapshotScope: scope,
      builtAt: new Date().toISOString(),
      assetsSha256: hash(JSON.stringify(publishedAssets)),
      assets: publishedAssets,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Production bundle ${sourceCommit}${sourceDirty ? " (uncommitted candidate)" : ""}, ${publishedAssets.length} assets`,
);
