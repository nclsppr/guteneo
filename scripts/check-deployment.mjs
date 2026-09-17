import { readFileSync } from "node:fs";
const file = process.argv[2];
if (!file)
  throw new Error(
    "Pass a reviewed JSON environment configuration path. No deployment is performed.",
  );
const raw = readFileSync(file, "utf8");
const config = JSON.parse(raw);
const errors = [];
if (/REPLACE|local-only|localhost|127\.0\.0\.1/.test(raw))
  errors.push("Local/placeholder resources remain");
if (!["staging", "production"].includes(config.vars?.ENVIRONMENT))
  errors.push("Explicit remote environment required");
if (
  config.vars?.ENVIRONMENT === "production" &&
  config.vars?.MODE !== "production"
)
  errors.push("Production simulation forbidden");
if (!config.vars?.APP_ORIGIN?.startsWith("https://"))
  errors.push("HTTPS origin required");
if (config.r2_buckets?.some((b) => b.jurisdiction !== "eu"))
  errors.push("R2 EU jurisdiction required");
if (!config.d1_databases?.[0]?.database_id)
  errors.push("Actual reviewed D1 ID required");
if (config.workers_dev !== false)
  errors.push("Unreviewed public workers.dev disabled");
if (config.vars?.LIVE_SENDS_ENABLED !== "false")
  errors.push("Initial deployment must leave live sends disabled");
if (!config.services?.some((s) => s.binding === "SCANNER"))
  errors.push("Qualified scanner service binding missing");
if (!config.services?.some((s) => s.binding === "DOCUMENT_RENDERER"))
  errors.push("Isolated document service missing");
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    "Static configuration checks passed. Still requires EU D1 account evidence, secrets, real-client/provider qualification and explicit deployment approval.",
  );
