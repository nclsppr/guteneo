import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { build } from "vite";
import { buildIntegrationPackage } from "../integrations/build.mjs";
import { buildPublicPages } from "./build-public-pages.mjs";

import {
  collectAssets,
  releaseProfiles,
  sha256 as hash,
  sourceSnapshot,
} from "./release-source.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, releaseProfiles.live.output);
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" });
const scope = releaseProfiles.live.scope;
const snapshot = () => sourceSnapshot(root, scope);
const sourceCommit = git("rev-parse", "HEAD").trim();
const sourceSnapshotSha256 = await snapshot();
const sourceDirty = Boolean(
  git("status", "--porcelain", "--", ...scope).trim(),
);
process.env.VITE_PUBLIC_PREVIEW = "false";
await build({
  configFile: join(root, "apps/web/vite.config.ts"),
  build: { outDir: output, emptyOutDir: true },
});
await buildIntegrationPackage(join(output, "integrations"));
// Runtime asset middleware permits indexing only on the canonical public origin.
await buildPublicPages({ root, output, indexable: true });
if ((await snapshot()) !== sourceSnapshotSha256)
  throw new Error(
    "Source changed during build. Build again before deployment.",
  );
const publishedAssets = await collectAssets(output);
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
