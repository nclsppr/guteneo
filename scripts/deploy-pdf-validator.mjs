import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { verifyMainSource } from "./deploy-public.mjs";

const origins = [
  "https://guteneo.com",
  "https://guteneo-app.nclsppr.workers.dev",
];
async function publicCapabilities(origin) {
  const response = await fetch(`${origin}/api/capabilities`, {
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: { accept: "application/json" },
  });
  if (!response.ok)
    throw new Error("PDF_VALIDATOR_RELEASE_CLOSED_HORIZON_REQUIRED");
  return response.json();
}

/** Private service only; caller separately qualifies it before opening Horizon. */
export async function deployPdfValidator({
  root = fileURLToPath(new URL("../", import.meta.url)),
  qualification = false,
  readCapabilities = publicCapabilities,
  execute = (command, args, options) => execFileSync(command, args, options),
} = {}) {
  if (typeof qualification !== "boolean")
    throw new Error("PDF_VALIDATOR_RELEASE_ARGUMENTS_INVALID");
  const sourceCommit = verifyMainSource(root);
  const configPath = join(root, "apps/pdf-validator/wrangler.jsonc");
  const parsed = ts.parseConfigFileTextToJson(
    configPath,
    await readFile(configPath, "utf8"),
  );
  const config = parsed.config;
  if (
    parsed.error ||
    config?.name !== "guteneo-pdf-validator" ||
    config.account_id !== "39ac9fada6cba44d9ecf09d467609e69" ||
    config.version_metadata?.binding !== "CF_VERSION_METADATA" ||
    config.workers_dev !== false ||
    config.preview_urls !== false ||
    config.vars?.QUALIFICATION_ENABLED !== "false" ||
    !Array.isArray(config.routes) ||
    config.routes.length !== 0 ||
    config.observability?.enabled !== false ||
    config.containers?.length !== 1 ||
    config.containers[0].instance_type !== "basic" ||
    config.containers[0].max_instances !== 1 ||
    config.containers[0].constraints?.jurisdiction !== "eu"
  )
    throw new Error("PDF_VALIDATOR_RELEASE_PRIVATE_CONFIG_REQUIRED");
  if (qualification) {
    let capabilities;
    try {
      capabilities = await Promise.all(origins.map(readCapabilities));
    } catch {
      throw new Error("PDF_VALIDATOR_RELEASE_CLOSED_HORIZON_REQUIRED");
    }
    if (
      capabilities.some(
        (value) =>
          value?.mode !== "production" || value.horizon?.available !== false,
      )
    )
      throw new Error("PDF_VALIDATOR_RELEASE_CLOSED_HORIZON_REQUIRED");
  }
  if (verifyMainSource(root) !== sourceCommit)
    throw new Error("PDF_VALIDATOR_RELEASE_SOURCE_CHANGED");
  await execute(
    process.execPath,
    [
      join(root, "node_modules/wrangler/bin/wrangler.js"),
      "deploy",
      "--config",
      configPath,
      "--var",
      `QUALIFICATION_ENABLED:${qualification ? "true" : "false"}`,
      "--var",
      `SOURCE_COMMIT:${sourceCommit}`,
    ],
    { cwd: root, stdio: "inherit" },
  );
  return {
    sourceCommit,
    service: config.name,
    qualificationEnabled: qualification,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (
      process.argv.length > 3 ||
      (process.argv.length === 3 && process.argv[2] !== "--qualification")
    )
      throw new Error("PDF_VALIDATOR_RELEASE_ARGUMENTS_INVALID");
    await deployPdfValidator({
      qualification: process.argv[2] === "--qualification",
    });
  } catch (error) {
    // Do not expose Git stderr, credentials or Cloudflare response bodies.
    console.error(
      /^(?:PDF_VALIDATOR_RELEASE|RELEASE)_[A-Z_]+$/.test(error.message)
        ? error.message
        : "PDF_VALIDATOR_RELEASE_FAILED",
    );
    process.exitCode = 1;
  }
}
