import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyMainSource } from "./deploy-public.mjs";
import {
  validateEngineeringConfig,
  readEngineeringConfig,
  verifyEngineeringRelease,
} from "./engineering-release.mjs";

/** Inject execution only for local tests; the source/artifact guards always run. */
export async function deployEngineering(
  reviewedCommit,
  {
    root = fileURLToPath(new URL("../", import.meta.url)),
    execute = execFileSync,
  } = {},
) {
  if (!/^[a-f0-9]{40}$/.test(reviewedCommit))
    throw new Error("ENGINEERING_REVIEWED_COMMIT_REQUIRED");
  const requireReviewedMain = () => {
    if (verifyMainSource(root) !== reviewedCommit)
      throw new Error("ENGINEERING_REVIEWED_COMMIT_MISMATCH");
  };
  requireReviewedMain();
  const app = resolve(root, "apps/engineering");
  validateEngineeringConfig(
    await readEngineeringConfig(resolve(app, "wrangler.jsonc")),
  );
  await execute("npm", ["run", "docs:check"], { cwd: root, stdio: "inherit" });
  await execute("npm", ["run", "build:engineering"], {
    cwd: root,
    stdio: "inherit",
  });
  const built = await verifyEngineeringRelease(root, reviewedCommit);
  await execute("npm", ["run", "test:engineering"], {
    cwd: root,
    stdio: "inherit",
  });
  requireReviewedMain();
  await verifyEngineeringRelease(root, reviewedCommit, built);
  await execute("npx", ["--no-install", "wrangler", "deploy"], {
    cwd: app,
    stdio: "inherit",
  });
  await execute(
    "node",
    ["scripts/verify-engineering.mjs", "https://engineering.guteneo.com"],
    { cwd: root, stdio: "inherit" },
  );
  return { sourceCommit: reviewedCommit };
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
      "After explicit authorization, use npm run deploy:engineering -- --confirm-production --commit <reviewed-full-sha>.",
    );
  await deployEngineering(args[2]);
}
