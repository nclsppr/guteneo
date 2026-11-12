import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  manualContext,
  qualifyManualRelease,
} from "./manual-application-release.mjs";
import { createValidationReader } from "./validation-proof.mjs";
import { verifyMainSource, verifyReleaseTag } from "../deploy-public.mjs";
import { deployExperience } from "../deploy-experience.mjs";

export function requireServedExperienceBackend(manifest, context) {
  if (
    manifest?.sourceCommit !== context.sourceCommit ||
    manifest.sourceDirty !== false ||
    manifest.mode !== "production" ||
    manifest.publicPreview !== false
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
    const response = await fetch("https://guteneo.com/release.json", {
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error("EXPERIENCE_RELEASE_BACKEND_UNREACHABLE");
    const backend = await response.json();
    requireServedExperienceBackend(backend, context);
    const proof = {
      ...checks,
      version: anchor.version,
      tag: anchor.tag,
      backendSourceCommit: backend.sourceCommit,
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
