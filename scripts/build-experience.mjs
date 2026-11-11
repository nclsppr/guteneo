import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  createExperienceRelease,
  experienceSourceSnapshot,
  readExperienceConfig,
  validateExperienceConfig,
} from "./experience-release.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const git = (...args) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const commit = git("rev-parse", "HEAD");
const snapshot = await experienceSourceSnapshot(root);
validateExperienceConfig(
  await readExperienceConfig(`${root}apps/experience/wrangler.jsonc`),
);
if (
  process.env.GUTENEO_API_ORIGIN &&
  process.env.GUTENEO_API_ORIGIN !== "https://guteneo.com"
)
  throw new Error(
    "EXPERIENCE_PRODUCTION_API_REQUIRED: use dev:experience for local simulation.",
  );
execFileSync(
  "npx",
  [
    "--no-install",
    "vite",
    "build",
    "--config",
    "apps/experience/vite.config.ts",
  ],
  {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, GUTENEO_API_ORIGIN: "https://guteneo.com" },
  },
);
if (git("rev-parse", "HEAD") !== commit)
  throw new Error("EXPERIENCE_SOURCE_CHANGED");
const manifest = await createExperienceRelease(root, {
  commit,
  snapshot,
  dirty: Boolean(git("status", "--porcelain")),
});
await writeFile(
  `${root}dist/experience/release.json`,
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  `Gare built: ${manifest.assets.length} static assets; source ${commit}${manifest.dirty ? " with local changes" : ""}.`,
);
