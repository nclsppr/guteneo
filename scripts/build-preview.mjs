import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { build } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "dist/preview");
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" });
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sourcePaths = [
  "apps/web",
  "apps/preview",
  "packages",
  "scripts/build-preview.mjs",
  "wrangler.preview.jsonc",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
];

async function sourceSnapshot() {
  const paths = git(
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
    "--",
    ...sourcePaths,
  )
    .split("\0")
    .filter(Boolean)
    .sort();
  const hash = createHash("sha256");
  for (const path of paths) {
    let bytes;
    try {
      bytes = await readFile(join(root, path));
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    hash.update(path).update("\0").update(bytes).update("\0");
  }
  return hash.digest("hex");
}

async function collectAssets(directory) {
  const assets = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) assets.push(...(await collectAssets(path)));
    else {
      const bytes = await readFile(path);
      assets.push({
        path: `/${relative(output, path).split("\\").join("/")}`,
        bytes: (await stat(path)).size,
        sha256: digest(bytes),
      });
    }
  }
  return assets.sort((left, right) => left.path.localeCompare(right.path));
}

const sourceCommit = git("rev-parse", "HEAD").trim();
const sourceTree = git("rev-parse", "HEAD^{tree}").trim();
const sourceDirty =
  git("status", "--porcelain", "--", ...sourcePaths).trim().length > 0;
const sourceSnapshotSha256 = await sourceSnapshot();
process.env.VITE_PUBLIC_PREVIEW = "true";
await build({
  configFile: join(root, "apps/web/vite.config.ts"),
  build: { outDir: output, emptyOutDir: true },
});
await writeFile(join(output, "robots.txt"), "User-agent: *\nDisallow: /\n");
if (sourceSnapshotSha256 !== (await sourceSnapshot()))
  throw new Error(
    "Source changed during the preview build. Rebuild before deployment.",
  );

const assets = await collectAssets(output);
const release = {
  product: "Guteneo",
  mode: "public-design-preview",
  publicPreview: true,
  liveSendsEnabled: false,
  sourceCommit,
  sourceTree,
  sourceDirty,
  sourceSnapshotSha256,
  sourceSnapshotScope: sourcePaths,
  builtAt: new Date().toISOString(),
  assetsSha256: digest(JSON.stringify(assets)),
  assets,
};
await writeFile(
  join(output, "release.json"),
  `${JSON.stringify(release, null, 2)}\n`,
);
await writeFile(
  join(output, "health.json"),
  `${JSON.stringify(
    {
      status: "ok",
      mode: release.mode,
      liveSendsEnabled: false,
      sourceCommit,
      sourceSnapshotSha256,
      assetsSha256: release.assetsSha256,
      builtAt: release.builtAt,
    },
    null,
    2,
  )}\n`,
);
console.log(
  `Public design preview built from ${sourceCommit}${sourceDirty ? " (working tree changes included)" : ""}.`,
);
