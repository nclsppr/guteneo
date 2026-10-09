import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildStatus,
  statusScope,
  verifyQualificationSource,
} from "./build-status.mjs";
import { verifyMainSource } from "./deploy-public.mjs";
import { collectAssets, sha256, sourceSnapshot } from "./release-source.mjs";

async function verifyStatusBytes(root, manifest) {
  const saved = JSON.parse(
    await readFile(join(root, "dist/status/release.json"), "utf8"),
  );
  if (
    JSON.stringify(saved) !== JSON.stringify(manifest) ||
    manifest.sourceSnapshotSha256 !==
      (await sourceSnapshot(root, statusScope)) ||
    manifest.assetsSha256 !==
      sha256(
        JSON.stringify(
          await collectAssets(join(root, "dist/status"), ["/release.json"]),
        ),
      )
  )
    throw new Error("STATUS_RELEASE_MISMATCH");
  await verifyQualificationSource(root, manifest.qualificationSource);
}

export async function deployStatus({
  root = fileURLToPath(new URL("../", import.meta.url)),
  execute = execFileSync,
} = {}) {
  const sourceCommit = verifyMainSource(root);
  const manifest = await buildStatus(root);
  if (
    manifest.sourceCommit !== sourceCommit ||
    manifest.sourceDirty ||
    manifest.sourceSnapshotSha256 !==
      (await sourceSnapshot(root, statusScope)) ||
    manifest.assetsSha256 !==
      sha256(
        JSON.stringify(
          await collectAssets(join(root, "dist/status"), ["/release.json"]),
        ),
      ) ||
    verifyMainSource(root) !== sourceCommit
  )
    throw new Error("STATUS_RELEASE_MISMATCH");
  await verifyQualificationSource(root, manifest.qualificationSource);
  const wrangler = join(root, "node_modules/wrangler/bin/wrangler.js");
  // This migration directory belongs exclusively to the public status database.
  execute(
    process.execPath,
    [
      wrangler,
      "d1",
      "migrations",
      "apply",
      "guteneo-status",
      "--remote",
      "--config",
      "wrangler.status.jsonc",
    ],
    { cwd: root, stdio: "inherit" },
  );
  if (verifyMainSource(root) !== sourceCommit)
    throw new Error("STATUS_SOURCE_CHANGED");
  // dist is ignored by Git; migration may have taken long enough for another
  // build to replace it. Recheck the manifest and every published byte.
  await verifyStatusBytes(root, manifest);
  execute(
    process.execPath,
    [wrangler, "deploy", "--config", "wrangler.status.jsonc"],
    { cwd: root, stdio: "inherit" },
  );
  return { sourceCommit };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await deployStatus();
  } catch (error) {
    console.error(
      /^(STATUS|RELEASE)_[A-Z_]+$/.test(error.message)
        ? error.message
        : "STATUS_RELEASE_FAILED",
    );
    process.exitCode = 1;
  }
}
