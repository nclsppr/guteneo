import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parse } from "jsonc-parser";

const directory = fileURLToPath(new URL("../", import.meta.url));
const configPath = new URL("../wrangler.jsonc", import.meta.url);
const parseErrors = [];
const config = parse(readFileSync(configPath, "utf8"), parseErrors, {
  allowTrailingComma: true,
});
if (parseErrors.length)
  throw new Error("Scanner configuration contains invalid JSONC.");
const previousRefresh = config.containers[0].image_vars.SIGNATURE_REFRESH;

if (process.argv.includes("--check")) {
  const ageHours = (Date.now() - Date.parse(previousRefresh)) / 3_600_000;
  console.log(`Recorded image refresh: ${previousRefresh}.`);
  if (!Number.isFinite(ageHours) || ageHours >= 24) {
    console.error(
      "WARNING: daily image refresh is due. Runtime refuses loaded antivirus signatures older than 72 hours.",
    );
    process.exitCode = 1;
  }
  console.log(
    "Inspect the private /health response for the actual deployed signature date; a build timestamp does not prove deployment freshness.",
  );
} else if (process.argv.length !== 2) {
  console.error(
    "Use npm run refresh:definitions to refresh and qualify locally, or append -- --check for a read-only reminder.",
  );
  process.exitCode = 1;
} else {
  const refresh = new Date().toISOString();
  console.log(
    "Refreshing the local antivirus image and testing clean PDF/EICAR fixtures. No cloud deployment is performed.",
  );
  for (const [command, args] of [
    [
      "docker",
      [
        "build",
        "--platform",
        "linux/amd64",
        "--build-arg",
        `SIGNATURE_REFRESH=${refresh}`,
        "-t",
        "guteneo-scanner:local",
        ".",
      ],
    ],
    ["python3", ["tests/qualify_docker.py"]],
  ]) {
    const result = spawnSync(command, args, {
      cwd: directory,
      stdio: "inherit",
    });
    if (result.error || result.status !== 0) {
      console.error(
        "Refresh failed. The deployed configuration was not changed; do not relax quarantine or signature-age checks.",
      );
      process.exit(result.status ?? 1);
    }
  }
  config.containers[0].image_vars.SIGNATURE_REFRESH = refresh;
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  console.log(
    `Qualified local signature image recorded with refresh ${refresh}.`,
  );
  console.log(
    "Deployment is still required. After the coordinated rollout, verify private /health and repeat byte/hash/antivirus tests on Cloudflare.",
  );
  console.log(
    "No recurring updater was created. Run this daily; signatures older than 72 hours fail closed.",
  );
}
