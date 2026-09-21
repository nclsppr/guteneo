import { execFileSync } from "node:child_process";
import { rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { build } from "vite";
import { buildPublicPages } from "./build-public-pages.mjs";

import {
  collectAssets,
  releaseProfiles,
  sha256 as digest,
  sourceSnapshot,
} from "./release-source.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, releaseProfiles.preview.output);
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" });
const sourcePaths = releaseProfiles.preview.scope;
const sourceCommit = git("rev-parse", "HEAD").trim();
const sourceTree = git("rev-parse", "HEAD^{tree}").trim();
const sourceDirty =
  git("status", "--porcelain", "--", ...sourcePaths).trim().length > 0;
const sourceSnapshotSha256 = await sourceSnapshot(root, sourcePaths);
process.env.VITE_PUBLIC_PREVIEW = "true";
await build({
  configFile: join(root, "apps/web/vite.config.ts"),
  build: { outDir: output, emptyOutDir: true },
});
// Real review evidence belongs only to the production application.
await rm(join(output, "review"), { recursive: true, force: true });
await buildPublicPages({ root, output, indexable: true });
if (sourceSnapshotSha256 !== (await sourceSnapshot(root, sourcePaths)))
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
