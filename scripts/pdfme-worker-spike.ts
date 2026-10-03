import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { writeFile } from "node:fs/promises";
import { invoiceTemplate } from "../packages/templates/gallery";
import { prepareTemplateRender } from "../packages/contracts/src/templates";
const bundle = await build({
  stdin: {
    contents: `import { generateTemplatePdf } from './apps/documents/src/template-browser.ts'; export default { async fetch(request) { try { return Response.json(await generateTemplatePdf(await request.json())); } catch(error) { return Response.json({error: String(error)}, {status: 422}); } } }`,
    resolveDir: process.cwd(),
    sourcefile: "worker-spike.ts",
    loader: "ts",
  },
  bundle: true,
  platform: "browser",
  target: "es2022",
  format: "esm",
  minify: true,
  write: false,
});
const runtime = new Miniflare(
  convertV4MiniflareOptions({
    name: "pdfme-spike",
    modules: true,
    script: bundle.outputFiles[0].text,
    compatibilityDate: "2026-09-16",
    compatibilityFlags: ["nodejs_compat"],
  }),
);
try {
  const envelope = invoiceTemplate(),
    prepared = prepareTemplateRender(envelope, envelope.sampleData),
    start = performance.now();
  const response = await runtime.dispatchFetch("https://spike.invalid", {
    method: "POST",
    body: JSON.stringify({
      template: prepared.template,
      inputs: prepared.inputs,
    }),
  });
  const data = (await response.json()) as {
    base64?: string;
    pages?: number;
    error?: string;
  };
  const report = {
    qualification: "local workerd/Miniflare only; not hosted Cloudflare",
    status: response.status,
    elapsedMs: Math.round(performance.now() - start),
    bundleBytes: bundle.outputFiles[0].contents.length,
    pages: data.pages,
    pdfBytes: data.base64
      ? Buffer.from(data.base64, "base64").length
      : undefined,
    error: data.error,
    decision:
      "Production template renderer uses the existing private Browser Run service. Direct Worker success alone does not qualify hosted CPU/memory, all fixtures, or browser editor parity.",
  };
  await writeFile(
    "reports/template-engine/workerd-spike.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  await runtime.dispose();
}
