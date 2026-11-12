import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";
import {
  manualContext,
  qualifyManualRelease,
} from "./manual-application-release.mjs";
import { createValidationReader } from "./validation-proof.mjs";
import { verifyMainSource, verifyReleaseTag } from "../deploy-public.mjs";
import { deployExperience } from "../deploy-experience.mjs";

const sha = /^[a-f0-9]{40}$/;
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const gareFiles = new Set([
  ".github/workflows/manual-experience-release.yml",
  "apps/engineering/src/content/docs/engineering/design-system.mdx",
  "apps/engineering/src/content/docs/features/experience.md",
  "apps/engineering/src/content/docs/features/index.md",
  "docs/EXPERIENCE.md",
  "docs/FEATURE_MAP.html",
  "docs/FEATURE_MAP.md",
  "docs/feature-map.json",
  "playwright.experience.config.ts",
  "scripts/build-experience.mjs",
  "scripts/ci/manual-experience-release.mjs",
  "scripts/deploy-experience.mjs",
  "scripts/experience-release.mjs",
  "scripts/verify-experience.mjs",
  "tests/security/experience-deploy.test.mjs",
  "tests/unit/experience-board.test.ts",
]);
const releaseMetadata = new Set([
  "package.json",
  "package-lock.json",
  "integrations/guteneo/plugin.json",
  "integrations/guteneo/.claude-plugin/plugin.json",
  "integrations/guteneo/.cursor-plugin/plugin.json",
  "integrations/claude/plugins/guteneo/.claude-plugin/plugin.json",
  "integrations/guteneo/mcp-contract.json",
]);

function versionIndependentMetadata(path, data, version) {
  if (path === "integrations/guteneo/mcp-contract.json") {
    const { pluginVersion, packageSha256, ...rest } = data;
    if (pluginVersion === version && /^[a-f0-9]{64}$/.test(packageSha256))
      return rest;
  } else {
    const { version: actual, ...rest } = data;
    if (actual === version) {
      if (path !== "package-lock.json") return rest;
      if (rest.packages?.[""]?.version === version) {
        delete rest.packages[""].version;
        return rest;
      }
    }
  }
  throw new Error("EXPERIENCE_RELEASE_VERSION_METADATA_INVALID");
}

/** Require a Gare-only Git tree delta from the exact served backend ancestor. */
export function requireCompatibleExperienceBackend(
  root,
  { sourceCommit, backendCommit, version },
) {
  if (
    !sha.test(sourceCommit ?? "") ||
    !sha.test(backendCommit ?? "") ||
    sourceCommit === backendCommit ||
    !versionPattern.test(version ?? "")
  )
    throw new Error("EXPERIENCE_RELEASE_BACKEND_ANCESTOR_REQUIRED");

  const git = (...args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  try {
    git("merge-base", "--is-ancestor", backendCommit, sourceCommit);
  } catch {
    throw new Error("EXPERIENCE_RELEASE_BACKEND_ANCESTOR_REQUIRED");
  }
  const json = (commit, path) => JSON.parse(git("show", `${commit}:${path}`));
  const backendVersion = json(backendCommit, "package.json").version;
  if (!versionPattern.test(backendVersion ?? "") || backendVersion === version)
    throw new Error("EXPERIENCE_RELEASE_BACKEND_VERSION_REQUIRED");
  const changed = git(
    "diff",
    "--name-only",
    "-z",
    "--no-renames",
    backendCommit,
    sourceCommit,
    "--",
  )
    .split("\0")
    .filter(Boolean);
  for (const path of changed) {
    if (
      gareFiles.has(path) ||
      path.startsWith("apps/experience/") ||
      path.startsWith("tests/experience-e2e/") ||
      path === `docs/releases/${version}.md`
    )
      continue;
    if (
      !releaseMetadata.has(path) ||
      !isDeepStrictEqual(
        versionIndependentMetadata(
          path,
          json(backendCommit, path),
          backendVersion,
        ),
        versionIndependentMetadata(path, json(sourceCommit, path), version),
      )
    )
      throw new Error("EXPERIENCE_RELEASE_CANONICAL_CHANGE_REQUIRES_BACKEND");
  }
  return backendVersion;
}

export function requireServedExperienceBackend(
  manifest,
  { sourceCommit, backendCommit, backendVersion },
) {
  if (
    manifest?.sourceCommit !== (backendCommit ?? sourceCommit) ||
    manifest.sourceDirty !== false ||
    manifest.mode !== "production" ||
    manifest.publicPreview !== false ||
    (backendCommit && manifest.version !== backendVersion)
  )
    throw new Error("EXPERIENCE_RELEASE_EXACT_BACKEND_REQUIRED");
}

async function main(env) {
  const command = process.argv[2];
  if (!["qualify", "publish"].includes(command) || process.argv.length !== 3)
    throw new Error("EXPERIENCE_RELEASE_COMMAND_INVALID");
  if (
    env.GITHUB_WORKFLOW_REF !==
    "nclsppr/guteneo/.github/workflows/manual-experience-release.yml@refs/heads/main"
  )
    throw new Error("EXPERIENCE_RELEASE_TRUSTED_WORKFLOW_REQUIRED");
  const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, "utf8"));
  const context = manualContext(env, event);
  const backendCommit = event.inputs.backend_commit || undefined;
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const output = resolve(env.MANUAL_RELEASE_EVIDENCE_DIR);
  if (!output.startsWith(`${resolve(env.RUNNER_TEMP)}/`))
    throw new Error("EXPERIENCE_RELEASE_RUNNER_EVIDENCE_REQUIRED");
  await mkdir(output, { recursive: true, mode: 0o700 });
  const write = (name, value) =>
    writeFile(join(output, name), JSON.stringify(value, null, 2) + "\n");
  const qualify = async () => {
    if (verifyMainSource(root) !== context.sourceCommit)
      throw new Error("EXPERIENCE_RELEASE_CHECKOUT_COMMIT_MISMATCH");
    const checks = await qualifyManualRelease(
      context,
      createValidationReader({ token: env.GH_TOKEN }),
    );
    const anchor = await verifyReleaseTag(root, context.sourceCommit);
    const backendVersion = backendCommit
      ? requireCompatibleExperienceBackend(root, {
          ...context,
          backendCommit,
          version: anchor.version,
        })
      : anchor.version;
    const response = await fetch("https://guteneo.com/release.json", {
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error("EXPERIENCE_RELEASE_BACKEND_UNREACHABLE");
    const backend = await response.json();
    requireServedExperienceBackend(backend, {
      ...context,
      backendCommit,
      backendVersion,
    });
    const proof = {
      ...checks,
      version: anchor.version,
      tag: anchor.tag,
      backendSourceCommit: backend.sourceCommit,
      backendVersion,
      workflowRunId: env.GITHUB_RUN_ID,
      workflowRunAttempt: env.GITHUB_RUN_ATTEMPT,
    };
    await write("qualification.json", proof);
    return proof;
  };
  const qualification = await qualify();
  if (command === "qualify") return;
  if (!env.CLOUDFLARE_API_TOKEN)
    throw new Error("EXPERIENCE_RELEASE_CREDENTIAL_REQUIRED");
  await write("publication.json", {
    ...qualification,
    status: "publication-started",
  });
  const result = await deployExperience(context.sourceCommit, {
    root,
    beforePublish: qualify,
  });
  await write("publication.json", {
    ...qualification,
    ...result,
    status: "served-release-verified",
    verifiedAt: new Date().toISOString(),
  });
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await main(process.env);
  } catch (error) {
    console.error(
      /^(EXPERIENCE|MANUAL_RELEASE|DEPENDENCY_RELEASE|VALIDATION_PROOF|RELEASE)_[A-Z_0-9]+$/.test(
        error?.message ?? "",
      )
        ? error.message
        : "EXPERIENCE_RELEASE_FAILED",
    );
    process.exitCode = 1;
  }
}
