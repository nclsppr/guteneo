import { build } from "esbuild";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFile, writeFile, realpath } from "node:fs/promises";

export async function buildMcpUiProbeResource({ check = true } = {}) {
  const repository = new URL("../", import.meta.url);
  const licenseRoot = new URL(
    "../apps/mcp-ui-probe/licenses/",
    import.meta.url,
  );
  const provenance = JSON.parse(
    await readFile(new URL("provenance.json", licenseRoot), "utf8"),
  );
  const sdkPackage = JSON.parse(
    await readFile(
      new URL(
        "../node_modules/@modelcontextprotocol/ext-apps/package.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  if (
    sdkPackage.name !== provenance.sdk.name ||
    sdkPackage.version !== provenance.sdk.version
  )
    throw new Error(
      "MCP UI SDK package changed; review bundled runtime notices.",
    );
  const sdk = await readFile(new URL(provenance.sdk.path, repository));
  if (
    sdk.length !== provenance.sdk.bytes ||
    createHash("sha256").update(sdk).digest("hex") !== provenance.sdk.sha256
  )
    throw new Error(
      "MCP UI SDK provenance changed; review bundled runtime notices.",
    );
  const notices = [];
  for (const notice of provenance.notices) {
    const bytes = await readFile(new URL(notice.file, licenseRoot));
    if (
      bytes.length !== notice.bytes ||
      createHash("sha256").update(bytes).digest("hex") !== notice.sha256
    )
      throw new Error(
        "MCP UI runtime notice integrity changed; review provenance.",
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
      new URL("../apps/mcp-ui-probe/client.ts", import.meta.url).pathname,
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
      "MCP UI runtime inputs changed; review bundled dependency notices.",
    );
  const code = result.outputFiles[0].text.replaceAll("</script", "<\\/script");
  // A data block preserves every complete notice byte without JS-comment rewriting.
  const noticeBlock = `<script type="text/plain" id="guteneo-third-party-notices">\n${notices.join("\n\n")}\n</script>`;
  const css = `:root{color-scheme:light dark}body{margin:0;padding:16px;color:var(--color-text-primary,#181b22);background:var(--color-background-primary,#f6f5ef);font:var(--font-text-sm-size,14px)/1.5 var(--font-sans,system-ui,sans-serif)}h1{font-size:1.125rem;margin:0 0 8px;text-wrap:balance}p{margin:8px 0;text-wrap:pretty}dl{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px 16px;margin:16px 0}dt,dd{margin:0}dd{font-variant-numeric:tabular-nums}button{font:inherit;color:inherit;background:transparent;border:1px solid currentColor;border-radius:4px;min-height:44px;padding:8px 12px;margin:0 8px 8px 0}button:disabled{opacity:.55}button:focus-visible{outline:2px solid currentColor;outline-offset:3px}[data-theme=dark]{--color-text-primary:#f6f5ef;--color-background-primary:#181b22}@media(prefers-color-scheme:dark){:root:not([data-theme=light]){--color-text-primary:#f6f5ef;--color-background-primary:#181b22}}`;
  const hash = (value) => createHash("sha256").update(value).digest("base64");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${hash(code)}'; style-src 'sha256-${hash(css)}'; connect-src 'none'; img-src 'none'; font-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><title>Guteneo host diagnostic</title><style>${css}</style></head><body><main><h1 data-copy="title">Host diagnostic</h1><p data-copy="note">No file is read or uploaded.</p><dl><dt data-copy="secure">Secure context</dt><dd id="secure"></dd><dt data-copy="input">File input API</dt><dd id="input"></dd><dt data-copy="picker">Picker API</dt><dd id="picker-api"></dd><dt data-copy="host">App connection</dt><dd id="host" data-copy="pending">Not checked</dd><dt data-copy="bridge">Tool bridge</dt><dd id="bridge" data-copy="pending">Not checked</dd></dl><button type="button" id="check" disabled data-copy="check">Check bridge</button><button type="button" id="picker" disabled data-copy="choose">Test picker · cancel</button><p id="picker-help" data-copy="cancel">Cancel the picker without choosing a file.</p><p id="picker-state" role="status"></p><input id="file" type="file" hidden aria-label="Diagnostic file picker" aria-describedby="picker-help"></main>${noticeBlock}<script>${code}</script></body></html>`;
  const text = html + "\n";
  const sha256 = createHash("sha256").update(text).digest("hex");
  const manifest = {
    path: "/mcp-ui-probe/v1.txt",
    bytes: Buffer.byteLength(text),
    sha256,
    resourceUri: `ui://guteneo/mcp-ui-probe/v1/${sha256}.html`,
  };
  const expected = JSON.stringify(manifest, null, 2) + "\n";
  const output = new URL(
    "../packages/contracts/src/mcp-ui-probe-resource.json",
    import.meta.url,
  );
  if (check) {
    if ((await readFile(output, "utf8")) !== expected)
      throw new Error(
        "MCP UI probe manifest is stale. Run node scripts/build-mcp-ui-probe.mjs.",
      );
  } else await writeFile(output, expected);
  return { text, manifest };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(await realpath(process.argv[1])).href
) {
  const { manifest } = await buildMcpUiProbeResource({
    check: process.argv.includes("--check"),
  });
  process.stdout.write(
    `MCP UI probe resource: ${manifest.bytes} bytes; ${process.argv.includes("--check") ? "checked" : "manifest generated"}.\n`,
  );
}
