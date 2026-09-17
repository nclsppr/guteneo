import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectAssets,
  releaseProfiles,
  sha256,
  sourceSnapshot,
  liveReleaseSending,
} from "./release-source.mjs";

function fail(code) {
  throw new Error(code);
}
function git(root, args) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    }).trim();
  } catch {
    fail("RELEASE_GIT_CHECK_FAILED");
  }
}
function cleanMain(root) {
  if (git(root, ["symbolic-ref", "-q", "HEAD"]) !== "refs/heads/main")
    fail("RELEASE_MAIN_REQUIRED");
  if (git(root, ["status", "--porcelain=v1", "--untracked-files=all"]))
    fail("RELEASE_CLEAN_TREE_REQUIRED");
  // These index flags can hide changed tracked bytes from an otherwise clean status.
  if (
    git(root, ["ls-files", "-v", "-z"])
      .split("\0")
      .some((entry) => /^[a-zS] /.test(entry))
  )
    fail("RELEASE_CLEAN_TREE_REQUIRED");
  return git(root, ["rev-parse", "HEAD"]);
}
export function verifyMainSource(root) {
  cleanMain(root);
  // Never trust a stale remote-tracking ref; no local branch is reset or merged.
  git(root, [
    "fetch",
    "--no-tags",
    "--no-recurse-submodules",
    "origin",
    "+refs/heads/main:refs/remotes/origin/main",
  ]);
  const head = cleanMain(root);
  if (
    !/^[a-f0-9]{40}$/.test(head) ||
    head !== git(root, ["rev-parse", "refs/remotes/origin/main"])
  )
    fail("RELEASE_ORIGIN_MAIN_MISMATCH");
  return head;
}

export async function verifyLocalRelease(root, target, sourceCommit) {
  if (!Object.hasOwn(releaseProfiles, target)) fail("RELEASE_TARGET_INVALID");
  const profile = releaseProfiles[target];
  const output = join(root, profile.output);
  const sending = profile.publicPreview
    ? { liveSendsEnabled: false, liveSendChannels: undefined }
    : await liveReleaseSending(root);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(output, "release.json"), "utf8"));
  } catch {
    fail("RELEASE_MANIFEST_INVALID");
  }
  if (
    manifest.sourceCommit !== sourceCommit ||
    manifest.sourceDirty !== false ||
    manifest.mode !== profile.mode ||
    manifest.publicPreview !== profile.publicPreview ||
    manifest.liveSendsEnabled !== sending.liveSendsEnabled ||
    JSON.stringify(manifest.liveSendChannels) !==
      JSON.stringify(sending.liveSendChannels) ||
    JSON.stringify(manifest.sourceSnapshotScope) !==
      JSON.stringify(profile.scope)
  )
    fail("RELEASE_MANIFEST_MISMATCH");
  if (
    manifest.sourceSnapshotSha256 !==
    (await sourceSnapshot(root, profile.scope))
  )
    fail("RELEASE_SOURCE_DIGEST_MISMATCH");
  const assets = await collectAssets(
    output,
    profile.publicPreview
      ? ["/release.json", "/health.json"]
      : ["/release.json"],
  );
  if (
    !assets.length ||
    JSON.stringify(manifest.assets) !== JSON.stringify(assets) ||
    manifest.assetsSha256 !== sha256(JSON.stringify(assets))
  )
    fail("RELEASE_ASSETS_MISMATCH");
  if (profile.publicPreview) {
    if (manifest.sourceTree !== git(root, ["rev-parse", "HEAD^{tree}"]))
      fail("RELEASE_MANIFEST_MISMATCH");
    let health;
    try {
      health = JSON.parse(await readFile(join(output, "health.json"), "utf8"));
    } catch {
      fail("RELEASE_HEALTH_MISMATCH");
    }
    const expected = {
      status: "ok",
      mode: manifest.mode,
      liveSendsEnabled: false,
      sourceCommit,
      sourceSnapshotSha256: manifest.sourceSnapshotSha256,
      assetsSha256: manifest.assetsSha256,
      builtAt: manifest.builtAt,
    };
    if (JSON.stringify(health) !== JSON.stringify(expected))
      fail("RELEASE_HEALTH_MISMATCH");
  }
  return manifest;
}

/** Public publishing only. Dependency injection is for local tests, not CLI flags. */
export async function deployPublic(
  target,
  {
    root = fileURLToPath(new URL("../", import.meta.url)),
    execute = (command, args, options) => execFileSync(command, args, options),
  } = {},
) {
  if (!Object.hasOwn(releaseProfiles, target)) fail("RELEASE_TARGET_INVALID");
  const profile = releaseProfiles[target];
  const sourceCommit = verifyMainSource(root);
  await execute(process.execPath, [join(root, profile.build)], {
    cwd: root,
    stdio: "inherit",
  });
  if (verifyMainSource(root) !== sourceCommit) fail("RELEASE_SOURCE_CHANGED");
  await verifyLocalRelease(root, target, sourceCommit);
  // Recheck after reading artifacts too. Do not edit the checkout during publication.
  if (cleanMain(root) !== sourceCommit) fail("RELEASE_SOURCE_CHANGED");
  await execute(
    process.execPath,
    [
      join(root, "node_modules/wrangler/bin/wrangler.js"),
      "deploy",
      "--config",
      profile.config,
    ],
    { cwd: root, stdio: "inherit" },
  );
  return { target, sourceCommit };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (process.argv.length !== 3) fail("RELEASE_TARGET_INVALID");
    await deployPublic(process.argv[2]);
  } catch (error) {
    // No Git stderr (it can contain credential-bearing remote URLs) or process env.
    console.error(
      /^RELEASE_[A-Z_]+$/.test(error.message)
        ? error.message
        : "RELEASE_FAILED",
    );
    process.exitCode = 1;
  }
}
