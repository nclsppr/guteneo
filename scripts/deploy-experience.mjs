import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyMainSource } from "./deploy-public.mjs";
import {
  verifyExperienceBackend,
  verifyExperienceRelease,
} from "./experience-release.mjs";

/** Publication is explicit and always checks the exact source and artifacts. */
export async function deployExperience(
  reviewedCommit,
  {
    root = fileURLToPath(new URL("../", import.meta.url)),
    execute = execFileSync,
    inspectBackend = verifyExperienceBackend,
  } = {},
) {
  if (!/^[a-f0-9]{40}$/.test(reviewedCommit))
    throw new Error("EXPERIENCE_REVIEWED_COMMIT_REQUIRED");
  const requireMain = () => {
    if (verifyMainSource(root) !== reviewedCommit)
      throw new Error("EXPERIENCE_REVIEWED_COMMIT_MISMATCH");
  };
  requireMain();
  for (const script of [
    "typecheck",
    "lint",
    "docs:check",
    "test:experience:release",
    "build:experience",
  ])
    await execute("npm", ["run", script], { cwd: root, stdio: "inherit" });
  const built = await verifyExperienceRelease(root, reviewedCommit);
  await execute("npm", ["run", "test:experience"], {
    cwd: root,
    stdio: "inherit",
  });
  await inspectBackend();
  requireMain();
  await verifyExperienceRelease(root, reviewedCommit, built);
  await execute(
    "npx",
    [
      "--no-install",
      "wrangler",
      "deploy",
      "--config",
      "apps/experience/wrangler.jsonc",
    ],
    {
      cwd: root,
      stdio: "inherit",
    },
  );
  await execute("node", ["scripts/verify-experience.mjs"], {
    cwd: root,
    stdio: "inherit",
  });
  return { sourceCommit: reviewedCommit, origin: "https://gare.guteneo.com" };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  if (
    args.length !== 3 ||
    args[0] !== "--confirm-production" ||
    args[1] !== "--commit"
  )
    throw new Error(
      "Use npm run deploy:experience -- --confirm-production --commit <reviewed-full-sha> after publication authorization.",
    );
  await deployExperience(args[2]);
}
