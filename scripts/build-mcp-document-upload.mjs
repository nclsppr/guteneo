import { build } from "esbuild";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFile, writeFile, realpath } from "node:fs/promises";

export async function buildMcpDocumentUploadResource({ check = true } = {}) {
  const repository = new URL("../", import.meta.url);
  // The diagnostic already owns the reviewed SDK/copy-code license provenance.
  const licenseRoot = new URL(
    "../apps/mcp-ui-probe/licenses/",
    import.meta.url,
  );
  const provenance = JSON.parse(
    await readFile(new URL("provenance.json", licenseRoot), "utf8"),
  );
  const hash = (bytes, encoding = "hex") =>
    createHash("sha256").update(bytes).digest(encoding);
  const sdkPackage = JSON.parse(
    await readFile(
      new URL(
        "node_modules/@modelcontextprotocol/ext-apps/package.json",
        repository,
      ),
      "utf8",
    ),
  );
  const sdk = await readFile(new URL(provenance.sdk.path, repository));
  if (
    sdkPackage.name !== provenance.sdk.name ||
    sdkPackage.version !== provenance.sdk.version ||
    sdk.length !== provenance.sdk.bytes ||
    hash(sdk) !== provenance.sdk.sha256
  )
    throw new Error(
      "MCP App SDK provenance changed; review bundled runtime notices.",
    );
  const notices = [];
  for (const notice of provenance.notices) {
    const bytes = await readFile(new URL(notice.file, licenseRoot));
    if (bytes.length !== notice.bytes || hash(bytes) !== notice.sha256)
      throw new Error(
        "MCP App runtime notice integrity changed; review provenance.",
      );
    const text = bytes.toString("utf8");
    if (/<\/script/i.test(text))
      throw new Error(
        "Runtime notice requires a different lossless distribution boundary.",
      );
    notices.push(`${notice.label}\n\n${text}`);
  }
  const result = await build({
    absWorkingDir: fileURLToPath(repository),
    entryPoints: [
      new URL("apps/mcp-document-upload/client.ts", repository).pathname,
    ],
    bundle: true,
    write: false,
    minify: true,
    format: "iife",
    target: "es2022",
    legalComments: "inline",
    metafile: true,
  });
  const runtimeInputs = Object.keys(result.metafile.inputs)
    .filter((path) => path.startsWith("node_modules/"))
    .sort();
  if (
    JSON.stringify(runtimeInputs) !==
    JSON.stringify([...provenance.runtimeInputs].sort())
  )
    throw new Error(
      "MCP App runtime inputs changed; review bundled dependency notices.",
    );
  const script = result.outputFiles[0].text.replaceAll(
    "</script",
    "<\\/script",
  );
  const style = await readFile(
    new URL("apps/mcp-document-upload/styles.css", repository),
    "utf8",
  );
  const template = await readFile(
    new URL("apps/mcp-document-upload/index.html", repository),
    "utf8",
  );
  const replacements = {
    SCRIPT_HASH: hash(script, "base64"),
    STYLE_HASH: hash(style, "base64"),
    STYLE_TAG: `<style>${style}</style>`,
    NOTICES: `<script type="text/plain" id="guteneo-third-party-notices">\n${notices.join("\n\n")}\n</script>`,
    SCRIPT_TAG: `<script>${script}</script>`,
  };
  for (const key of Object.keys(replacements)) {
    if (template.split(`{{${key}}}`).length !== 2)
      throw new Error(
        `MCP App template requires exactly one ${key} placeholder.`,
      );
  }
  const text = template.replace(
    /\{\{(SCRIPT_HASH|STYLE_HASH|STYLE_TAG|NOTICES|SCRIPT_TAG)\}\}/g,
    (_match, key) => replacements[key],
  );
  if (/\{\{[A-Z_]+\}\}/.test(text))
    throw new Error("MCP App template has an unresolved build placeholder.");
  if (Buffer.byteLength(text) > 700_000)
    throw new Error("MCP App exceeds the reviewed resource byte limit.");
  const sha256 = hash(text);
  const manifest = {
    path: "/mcp-document-upload/v1.txt",
    bytes: Buffer.byteLength(text),
    sha256,
    resourceUri: `ui://guteneo/mcp-document-upload/v1/${sha256}.html`,
  };
  const expected = JSON.stringify(manifest, null, 2) + "\n";
  const output = new URL(
    "packages/contracts/src/mcp-document-upload-resource.json",
    repository,
  );
  if (check) {
    if ((await readFile(output, "utf8")) !== expected)
      throw new Error(
        "MCP document upload manifest is stale. Run node scripts/build-mcp-document-upload.mjs.",
      );
  } else await writeFile(output, expected);
  return { text, manifest };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(await realpath(process.argv[1])).href
) {
  const { manifest } = await buildMcpDocumentUploadResource({
    check: process.argv.includes("--check"),
  });
  process.stdout.write(
    `MCP document upload resource: ${manifest.bytes} bytes; ${process.argv.includes("--check") ? "checked" : "manifest generated"}.\n`,
  );
}
