import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { packageFiles } from "./package-files.mjs";
import { buildSkillCatalog, skillCatalogFile } from "./mcp-skills.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
export const syncFile = "integrations/guteneo/mcp-contract.json";
const entrypoint = "apps/api/src/mcp.ts";
const pluginFile = "integrations/guteneo/plugin.json";
const manifests = [
  "package.json",
  pluginFile,
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

async function updatedPublicationManifest(projectRoot, version) {
  const notes = await readFile(
    join(projectRoot, "docs/releases", `${version}.md`),
    "utf8",
  );
  const paragraph = notes
    .replace(/^#{1,6} +.*$/gm, "")
    .split(/\r?\n\s*\r?\n/)
    .map((block) => block.trim())
    .find((block) => block && !/^(?:[-*]\s|!\[)/.test(block))
    ?.replace(/\s+/g, " ");
  if (!paragraph)
    throw new Error(`Missing release summary in docs/releases/${version}.md`);
  const versionMention = new RegExp(`\\b${version.replaceAll(".", "\\.")}\\b`);
  const notesForPortal = versionMention.test(paragraph)
    ? paragraph
    : `Guteneo ${version}. ${paragraph}`;
  const plugin = await json(join(projectRoot, pluginFile));
  const publication = plugin.extensions["com.openai"].publication;
  if (publication.release_notes === notesForPortal) return null;
  publication.release_notes = notesForPortal;
  return `${JSON.stringify(plugin, null, 2)}\n`;
}

async function integrationSnapshot(projectRoot) {
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
  const skillCatalog = `${JSON.stringify(await buildSkillCatalog(projectRoot), null, 2)}\n`;
  sources[skillCatalogFile] = digest(skillCatalog);
  const files = packageFiles
    .filter((file) => file !== "mcp-contract.json")
    .map((file) => `integrations/guteneo/${file}`)
    .sort();
  const packageHashes = await fingerprint(projectRoot, files);
  const updatedManifest = await updatedPublicationManifest(
    projectRoot,
    versions[0],
  );
  if (updatedManifest !== null)
    packageHashes[pluginFile] = digest(updatedManifest);
  const contract = {
    schemaVersion: 1,
    pluginVersion: versions[0],
    mcpSourceSha256: digest(JSON.stringify(sources)),
    packageSha256: digest(JSON.stringify(packageHashes)),
    sources,
  };
  return { contract, skillCatalog, updatedManifest };
}

export async function integrationState(projectRoot = root) {
  return (await integrationSnapshot(projectRoot)).contract;
}

export async function validateIntegrationSync(projectRoot = root) {
  const {
    contract: current,
    skillCatalog,
    updatedManifest,
  } = await integrationSnapshot(projectRoot);
  let saved;
  try {
    saved = await json(join(projectRoot, syncFile));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    throw new Error(
      `ChatGPT plugin synchronization record is missing. ${guidance}`,
    );
  }
  if (updatedManifest !== null)
    throw new Error(
      "ChatGPT publication notes are stale. Run npm run sync:integrations.",
    );
  if (JSON.stringify(saved) !== JSON.stringify(current))
    throw new Error(
      `ChatGPT plugin is stale relative to the MCP or package files. ${guidance}`,
    );
  if (
    (await readFile(join(projectRoot, skillCatalogFile), "utf8")) !==
    skillCatalog
  )
    throw new Error(`MCP skill catalog is stale. ${guidance}`);
  return current;
}

export async function syncIntegrationPackage(projectRoot = root) {
  const {
    contract: current,
    skillCatalog,
    updatedManifest,
  } = await integrationSnapshot(projectRoot);
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
  if (updatedManifest !== null)
    await writeFile(join(projectRoot, pluginFile), updatedManifest);
  await writeFile(join(projectRoot, skillCatalogFile), skillCatalog);
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
