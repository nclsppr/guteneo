import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/server/validators/ajv";

const root = dirname(fileURLToPath(import.meta.url));
export const packageFiles = [
  ".claude-plugin/plugin.json",
  ".cursor-plugin/plugin.json",
  ".mcp.json",
  "README.md",
  "assets/guteneo-composer.png",
  "assets/guteneo-mark.png",
  "mcp.json",
  "plugin.json",
  "skills/email/SKILL.md",
  "skills/fax-pdf/SKILL.md",
  "skills/postal-pdf/SKILL.md",
];
const configFiles = [
  "cursor-mcp.json",
  "cursor-static-oauth.json",
  "claude-static-oauth.json",
  "copilot-vscode-mcp.json",
  "copilot-cli-mcp.json",
];

export async function validateIntegrationPackage() {
  const validator = new AjvJsonSchemaValidator();
  for (const name of ["plugin", "mcp"]) {
    const schema = JSON.parse(
      await readFile(join(root, "schemas", `${name}.schema.json`), "utf8"),
    );
    const value = JSON.parse(
      await readFile(join(root, "guteneo", `${name}.json`), "utf8"),
    );
    const result = validator.getValidator(schema)(value);
    if (!result.valid)
      throw new Error(`Invalid ${name}.json: ${result.errorMessage}`);
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
    archive: "guteneo-plugin.zip",
    sha256: createHash("sha256").update(archive).digest("hex"),
    bytes: archive.length,
    files: packageFiles,
    hostQualification: "pending",
    publishedToDirectories: false,
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
