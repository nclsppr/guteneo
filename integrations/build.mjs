import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { packageFiles } from "./package-files.mjs";
import { validateIntegrationSync } from "./sync.mjs";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/server/validators/ajv";
import {
  claudeMarketplaceRoot,
  claudePluginRoot,
  claudeMarketplaceFiles,
  claudePluginFiles,
  validateClaudePackage,
} from "./claude/package.mjs";

const root = dirname(fileURLToPath(import.meta.url));
export { packageFiles } from "./package-files.mjs";
const configFiles = [
  "cursor-mcp.json",
  "cursor-static-oauth.json",
  "claude-static-oauth.json",
  "copilot-vscode-mcp.json",
  "copilot-cli-mcp.json",
];

export async function validateIntegrationPackage(
  packageDirectory = join(root, "guteneo"),
) {
  const validator = new AjvJsonSchemaValidator();
  const extensionSchema = JSON.parse(
    await readFile(
      join(root, "schemas/openai-mcp-extension.schema.json"),
      "utf8",
    ),
  );
  const values = {};
  for (const name of ["plugin", "mcp"]) {
    const schema = JSON.parse(
      await readFile(join(root, "schemas", `${name}.schema.json`), "utf8"),
    );
    const value = JSON.parse(
      await readFile(join(packageDirectory, `${name}.json`), "utf8"),
    );
    const portable = structuredClone(value);
    if (name === "mcp") {
      for (const server of Object.values(portable.mcpServers ?? {})) {
        const extensionResult = validator.getValidator(extensionSchema)(
          server.extensions,
        );
        if (!extensionResult.valid)
          throw new Error(
            `Invalid OpenAI MCP authentication: ${extensionResult.errorMessage}`,
          );
        // The unchanged Agent Plugins 1.0.0 schema predates this documented
        // OpenAI server extension. Validate both contracts independently.
        delete server.extensions;
      }
    }
    const result = validator.getValidator(schema)(portable);
    if (!result.valid)
      throw new Error(`Invalid ${name}.json: ${result.errorMessage}`);
    values[name] = value;
  }
  const release = JSON.parse(
    await readFile(join(root, "../package.json"), "utf8"),
  );
  if (values.plugin.version !== release.version)
    throw new Error("Plugin and application release versions differ");
  for (const filename of [
    "plugin.json",
    ".claude-plugin/plugin.json",
    ".cursor-plugin/plugin.json",
  ]) {
    const manifest = JSON.parse(
      await readFile(join(packageDirectory, filename), "utf8"),
    );
    if (manifest.version !== release.version)
      throw new Error(`Release version differs: ${filename}`);
    if (
      manifest.apps != null ||
      manifest.extensions?.["com.openai"]?.apps != null
    )
      throw new Error("Public upload must not include private app bindings");
  }
  const compatibility = JSON.parse(
    await readFile(join(packageDirectory, ".mcp.json"), "utf8"),
  );
  const serverNames = Object.keys(values.mcp.mcpServers).sort();
  if (
    JSON.stringify(serverNames) !==
      JSON.stringify(Object.keys(compatibility.mcpServers ?? {}).sort()) ||
    serverNames.some(
      (name) =>
        values.mcp.mcpServers[name].url !== compatibility.mcpServers[name].url,
    )
  )
    throw new Error("Portable and compatibility MCP connections differ");
  for (const name of serverNames) {
    const scopes =
      values.mcp.mcpServers[name].extensions["com.openai"].auth.baseScopes;
    const compatibilityScopes = compatibility.mcpServers[name].oauth?.scopes;
    if (
      typeof compatibilityScopes !== "string" ||
      JSON.stringify([...scopes].sort()) !==
        JSON.stringify(compatibilityScopes.split(" ").sort())
    )
      throw new Error("OpenAI and compatibility OAuth scopes differ");
  }
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Small, uncompressed ZIP with fixed DOS timestamps, a fixed allowlist and no host paths.
// No shell command, environment interpolation or extra dependency is needed to package it.
export function deterministicZip(entries) {
  const locals = [];
  const directory = [];
  let offset = 0;
  for (const { name, bytes } of entries) {
    if (
      !/^[a-zA-Z0-9_.\-/]+$/.test(name) ||
      name.startsWith("/") ||
      name.split("/").includes("..")
    )
      throw new Error("Unsafe archive path");
    const filename = Buffer.from(name);
    const data = Buffer.from(bytes);
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(33, 12); // 1980-01-01, midnight
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(filename.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(33, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(header, filename, data);
    directory.push(central, filename);
    offset += header.length + filename.length + data.length;
  }
  const centralBytes = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBytes, end]);
}

export async function buildIntegrationPackage(
  outputDirectory = resolve(root, "../dist/integrations"),
) {
  await validateIntegrationSync();
  await validateIntegrationPackage();
  const entries = await Promise.all(
    packageFiles.map(async (name) => ({
      name,
      bytes: await readFile(join(root, "guteneo", name)),
    })),
  );
  const archive = deterministicZip(entries);
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(join(outputDirectory, "guteneo-plugin.zip"), archive);
  const claudeIdentity = await validateClaudePackage();
  const claude = {};
  for (const [kind, source, files, filename] of [
    ["plugin", claudePluginRoot, claudePluginFiles, "guteneo-claude-code.zip"],
    [
      "marketplace",
      claudeMarketplaceRoot,
      claudeMarketplaceFiles,
      "guteneo-claude-marketplace.zip",
    ],
  ]) {
    const bytes = deterministicZip(
      await Promise.all(
        files.map(async (name) => ({
          name,
          bytes: await readFile(join(source, name)),
        })),
      ),
    );
    await writeFile(join(outputDirectory, filename), bytes);
    claude[kind] = {
      ...claudeIdentity,
      archive: filename,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
      files,
      hostQualification: "pending",
      publishedToDirectories: false,
    };
  }
  for (const file of configFiles)
    await writeFile(
      join(outputDirectory, file),
      await readFile(join(root, "config", file)),
    );
  const plugin = JSON.parse(
    await readFile(join(root, "guteneo", "plugin.json"), "utf8"),
  );
  const result = {
    name: plugin.name,
    version: plugin.version,
    endpoint: "https://guteneo.com/mcp",
    mcpSourceSha256: JSON.parse(
      entries.find((entry) => entry.name === "mcp-contract.json").bytes,
    ).mcpSourceSha256,
    archive: "guteneo-plugin.zip",
    sha256: createHash("sha256").update(archive).digest("hex"),
    bytes: archive.length,
    files: packageFiles,
    hostQualification: "pending",
    publishedToDirectories: false,
    claude,
  };
  await writeFile(
    join(outputDirectory, "manifest.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  return result;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = await buildIntegrationPackage(
    process.argv[2] ? resolve(process.argv[2]) : undefined,
  );
  console.log(
    `Guteneo plugin ${result.version}: ${result.bytes} bytes; SHA-256 ${result.sha256}`,
  );
}
