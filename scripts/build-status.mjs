import { execFileSync } from "node:child_process";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectAssets, sha256, sourceSnapshot } from "./release-source.mjs";

export const statusScope = Object.freeze([
  "apps/status",
  "wrangler.status.jsonc",
  "scripts/build-status.mjs",
  "scripts/deploy-status.mjs",
  "scripts/release-source.mjs",
  "scripts/deploy-public.mjs",
  "package.json",
  "package-lock.json",
]);

export async function buildStatus(
  root = fileURLToPath(new URL("../", import.meta.url)),
) {
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const sourceCommit = git("rev-parse", "HEAD");
  const sourceDirty = !!git("status", "--porcelain", "--", ...statusScope);
  const sourceSnapshotSha256 = await sourceSnapshot(root, statusScope);
  const output = join(root, "dist/status");
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await cp(join(root, "apps/status/public"), output, { recursive: true });
  const assets = await collectAssets(output, ["/release.json"]);
  const manifest = {
    product: "Guteneo Status",
    mode: "production-observation",
    sourceCommit,
    sourceDirty,
    sourceSnapshotSha256,
    builtAt: new Date().toISOString(),
    assetsSha256: sha256(JSON.stringify(assets)),
    assets,
  };
  if (sourceSnapshotSha256 !== (await sourceSnapshot(root, statusScope)))
    throw new Error("STATUS_SOURCE_CHANGED");
  await writeFile(
    join(output, "release.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  return manifest;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const manifest = await buildStatus();
  console.log(
    `Status assets built from ${manifest.sourceCommit}${manifest.sourceDirty ? " (local changes)" : ""}.`,
  );
}
