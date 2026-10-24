import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  engineeringManifest,
  validateEngineeringConfig,
  readEngineeringConfig,
} from "./engineering-release.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const app = fileURLToPath(new URL("../apps/engineering/", import.meta.url));
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
const entries = await engineeringManifest(`${app}dist`);
const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const dirty = Boolean(
  execFileSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
);
await writeFile(
  `${app}dist/release.json`,
  JSON.stringify(
    { service: "guteneo-engineering", commit, dirty, assets: entries },
    null,
    2,
  ) + "\n",
);
console.log(
  `Engineering build verified: ${entries.length} static assets; source ${commit}${dirty ? " with local changes" : ""}.`,
);
