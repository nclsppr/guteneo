import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { packageFiles } from "./package-files.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
export const syncFile = "integrations/guteneo/mcp-contract.json";
const entrypoint = "apps/api/src/mcp.ts";
const manifests = [
  "package.json",
  "integrations/guteneo/plugin.json",
  "integrations/guteneo/.claude-plugin/plugin.json",
  "integrations/guteneo/.cursor-plugin/plugin.json",
  "integrations/claude/plugins/guteneo/.claude-plugin/plugin.json",
];
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const guidance =
  "Review the ChatGPT plugin instructions/configuration, increase the application release and all plugin manifest versions, " +
  "run npm run sync:integrations, then rebuild the downloadable archive.";

function versionParts(version) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version))
    throw new Error(
      "Integration versions must use stable SemVer (major.minor.patch).",
    );
  return version.split(".").map(BigInt);
}

function isNewer(version, previous) {
  const next = versionParts(version);
  const prior = versionParts(previous);
  for (let i = 0; i < next.length; i++) {
    if (next[i] !== prior[i]) return next[i] > prior[i];
  }
  return false;
}

// Track the MCP entrypoint and every direct local import, including newly added
// shared schemas and handlers. This intentionally does not traverse the whole
// application: indirect business/provider changes still require review.
async function sourceFiles(projectRoot) {
  const main = join(projectRoot, entrypoint);
  const files = new Set([entrypoint]);
  const imports = ts.preProcessFile(await readFile(main, "utf8")).importedFiles;
  for (const { fileName } of imports) {
    if (!fileName.startsWith(".")) continue;
    const base = resolve(dirname(main), fileName);
    let resolved;
    for (const candidate of [
      base,
      `${base}.ts`,
      `${base}.tsx`,
      `${base}.mjs`,
      `${base}.json`,
      join(base, "index.ts"),
    ]) {
      try {
        if ((await stat(candidate)).isFile()) {
          resolved = candidate;
          break;
        }
      } catch (error) {
        if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
      }
    }
    if (!resolved)
      throw new Error(`Cannot fingerprint MCP import: ${fileName}`);
    const name = relative(projectRoot, resolved).split(sep).join("/");
    if (name.startsWith("../"))
      throw new Error("MCP source is outside the repository.");
    files.add(name);
  }
  return [...files].sort();
}

async function fingerprint(projectRoot, files) {
  return Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [
        file,
        digest(await readFile(join(projectRoot, file))),
      ]),
    ),
  );
}

export async function integrationState(projectRoot = root) {
  const versions = await Promise.all(
    manifests.map(
      async (file) => (await json(join(projectRoot, file))).version,
    ),
  );
  versionParts(versions[0]);
  if (versions.some((version) => version !== versions[0]))
    throw new Error(
      `Application and integration manifest versions disagree. ${guidance}`,
    );
  const sources = await fingerprint(
    projectRoot,
    await sourceFiles(projectRoot),
  );
  const files = packageFiles
    .filter((file) => file !== "mcp-contract.json")
    .map((file) => `integrations/guteneo/${file}`)
    .sort();
  return {
    schemaVersion: 1,
    pluginVersion: versions[0],
    mcpSourceSha256: digest(JSON.stringify(sources)),
    packageSha256: digest(
      JSON.stringify(await fingerprint(projectRoot, files)),
    ),
    sources,
  };
}

export async function validateIntegrationSync(projectRoot = root) {
  const current = await integrationState(projectRoot);
  let saved;
  try {
    saved = await json(join(projectRoot, syncFile));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    throw new Error(
      `ChatGPT plugin synchronization record is missing. ${guidance}`,
    );
  }
  if (JSON.stringify(saved) !== JSON.stringify(current))
    throw new Error(
      `ChatGPT plugin is stale relative to the MCP or package files. ${guidance}`,
    );
  return current;
}

export async function syncIntegrationPackage(projectRoot = root) {
  const current = await integrationState(projectRoot);
  let previous;
  try {
    previous = await json(join(projectRoot, syncFile));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (
    previous &&
    JSON.stringify(previous) !== JSON.stringify(current) &&
    !isNewer(current.pluginVersion, previous.pluginVersion)
  )
    throw new Error(
      `Changed MCP/plugin content requires a higher plugin version. ${guidance}`,
    );
  await writeFile(
    join(projectRoot, syncFile),
    `${JSON.stringify(current, null, 2)}\n`,
  );
  return current;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.slice(2).some((arg) => arg !== "--check"))
    throw new Error("Usage: node integrations/sync.mjs [--check]");
  const state = process.argv.includes("--check")
    ? await validateIntegrationSync()
    : await syncIntegrationPackage();
  console.log(
    `Guteneo plugin ${state.pluginVersion}: MCP/package fingerprints match.`,
  );
}
