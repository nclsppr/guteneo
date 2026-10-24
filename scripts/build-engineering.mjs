import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  createEngineeringRelease,
  engineeringSourceSnapshot,
  validateEngineeringConfig,
  readEngineeringConfig,
} from "./engineering-release.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const app = fileURLToPath(new URL("../apps/engineering/", import.meta.url));
const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const snapshot = await engineeringSourceSnapshot(root);
validateEngineeringConfig(await readEngineeringConfig(`${app}wrangler.jsonc`));
execFileSync("npm", ["run", "typecheck"], { cwd: app, stdio: "inherit" });
execFileSync("npm", ["run", "build"], { cwd: app, stdio: "inherit" });
execFileSync("npm", ["run", "lint:docs"], { cwd: app, stdio: "inherit" });
execFileSync("npm", ["run", "check", "--", "--json"], {
  cwd: app,
  stdio: "inherit",
});
execFileSync("node", ["--test", "tests/security/engineering-site.test.mjs"], {
  cwd: root,
  stdio: "inherit",
});
const finalCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
if (finalCommit !== commit) throw new Error("ENGINEERING_SOURCE_CHANGED");
const dirty = Boolean(
  execFileSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
);
const manifest = await createEngineeringRelease(root, {
  commit,
  dirty,
  snapshot,
});
await writeFile(
  `${app}dist/release.json`,
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  `Engineering build verified: ${manifest.assets.length} static assets; source ${commit}${dirty ? " with local changes" : ""}.`,
);
