import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  validateEngineeringConfig,
  readEngineeringConfig,
} from "./engineering-release.mjs";

const args = process.argv.slice(2);
if (
  args.length !== 3 ||
  args[0] !== "--confirm-production" ||
  args[1] !== "--commit" ||
  !/^[a-f0-9]{40}$/.test(args[2])
)
  throw new Error(
    "After explicit authorization, use npm run deploy:engineering -- --confirm-production --commit <reviewed-full-sha>.",
  );
const root = fileURLToPath(new URL("../", import.meta.url));
const app = fileURLToPath(new URL("../apps/engineering/", import.meta.url));
const git = (...parameters) =>
  execFileSync("git", parameters, { cwd: root, encoding: "utf8" }).trim();
if (git("status", "--porcelain") || git("rev-parse", "HEAD") !== args[2])
  throw new Error(
    "Publish only the explicitly reviewed commit from a clean checkout.",
  );
validateEngineeringConfig(await readEngineeringConfig(`${app}wrangler.jsonc`));
execFileSync("npm", ["run", "docs:check"], { cwd: root, stdio: "inherit" });
execFileSync("npm", ["run", "build:engineering"], {
  cwd: root,
  stdio: "inherit",
});
execFileSync("npm", ["run", "test:engineering"], {
  cwd: root,
  stdio: "inherit",
});
if (git("status", "--porcelain") || git("rev-parse", "HEAD") !== args[2])
  throw new Error("Source changed during engineering release validation.");
execFileSync("npx", ["--no-install", "wrangler", "deploy"], {
  cwd: app,
  stdio: "inherit",
});
execFileSync(
  "node",
  ["scripts/verify-engineering.mjs", "https://engineering.guteneo.com"],
  { cwd: root, stdio: "inherit" },
);
