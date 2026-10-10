import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import puppeteer from "@cloudflare/puppeteer/internal/puppeteer-core.js";
import { chromium } from "@playwright/test";
import { loadTemplateScript } from "../apps/documents/template-assets.mjs";
import { loadPdfScripts } from "../apps/documents/pdfjs-assets.mjs";
import { handleTemplateRender } from "../apps/documents/src/template-render";
import { syntheticDocxFixture } from "./pdfme-docx-fixture";
import { importDocxTemplate } from "../packages/templates/docx";
import { invoiceTemplate, letterTemplate } from "../packages/templates/gallery";
import type { TemplateEnvelope } from "../packages/contracts/src/templates";
import { verifyInheritedNetworkBoundary } from "./test-offline.mjs";

const offlineSandbox =
  process.platform === "darwin" &&
  process.env.GUTENEO_OFFLINE_SANDBOX === "macos-network";
if (offlineSandbox) await verifyInheritedNetworkBoundary();

const directory = resolve("reports/template-engine");
await mkdir(directory, { recursive: true });
const script = await loadTemplateScript(),
  scripts = await loadPdfScripts();
const requests: string[] = [];
const launch = async () => {
  const browser = await puppeteer.launch({
    executablePath: chromium.executablePath(),
    headless: true,
    // macOS cannot nest Chromium's seatbelt inside sandbox-exec. Only synthetic
    // local qualification uses this branch, after a real inherited-network probe.
    ...(offlineSandbox ? { args: ["--no-sandbox"] } : {}),
  });
  browser.on("targetcreated", async (target) => {
    const page = await target.page();
    page?.on("request", (request) => {
      requests.push(request.url());
    });
  });
  return browser;
};
const cases: {
  name: string;
  envelope: TemplateEnvelope;
  data: Record<string, unknown>;
  expected: string[];
}[] = [1, 30, 200].map((count) => {
  const envelope = invoiceTemplate();
  const items = Array.from({ length: count }, (_, i) => ({
    description: `LIGNE-${String(i + 1).padStart(3, "0")} — préparation, étude française ; Ä Ö Ü ß €`,
    quantity: (i % 3) + 1,
    unitPriceMinor: 1250,
  }));
  return {
    name: `invoice-${count}`,
    envelope,
    data: { ...envelope.sampleData, items },
    expected: items.map((item) => item.description.slice(0, 9)),
  };
});
const letter = letterTemplate();
const paragraphs = Array.from(
  { length: 45 },
  (_, i) =>
    `PARAGRAPHE-${String(i + 1).padStart(3, "0")} : La préparation d’un courrier exige une pagination complète et lisible. Accents français : é è ê ç œ. Allemand : Ä Ö Ü ß. Montant : 125,00 €. ${"Ce texte vérifie les retours à la ligne et la conservation de chaque paragraphe. ".repeat(3)}`,
);
cases.push({
  name: "letter-long",
  envelope: letter,
  data: { ...letter.sampleData, body: paragraphs.join("\n\n") },
  expected: paragraphs.map((p) => p.slice(0, 14)),
});
const wordBytes = syntheticDocxFixture();
await writeFile(resolve(directory, "word-source.docx"), wordBytes);
const word = await importDocxTemplate(wordBytes, "word-source.docx");
await writeFile(
  resolve(directory, "word-import.json"),
  JSON.stringify(word, null, 2),
);
cases.push({
  name: "word-import",
  envelope: word.envelope,
  data: {},
  expected: ["WORD-PARAGRAPH-001", "WORD-ARTICLE-001"],
});
const report: Record<string, unknown>[] = [];
for (const fixture of cases) {
  const before = process.memoryUsage().rss,
    start = performance.now();
  const response = await handleTemplateRender(
    new Request("https://documents.internal/render/template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ envelope: fixture.envelope, data: fixture.data }),
    }),
    { launch, script },
  );
  if (!response.ok)
    throw new Error(`${fixture.name}: ${await response.text()}`);
  const bytes = new Uint8Array(await response.arrayBuffer()),
    elapsedMs = Math.round(performance.now() - start);
  await writeFile(resolve(directory, `${fixture.name}.pdf`), bytes);
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setContent(
      '<!doctype html><meta charset="utf-8"><canvas id="page"></canvas>',
    );
    await page.addScriptTag({ content: scripts.worker, type: "module" });
    await page.addScriptTag({ content: scripts.pdf, type: "module" });
    const details = await page.evaluate(async (base64) => {
      const global = globalThis as typeof globalThis & {
        pdfjsLib: typeof import("pdfjs-dist");
      };
      const pdf = await global.pdfjsLib.getDocument({
        data: Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
        useSystemFonts: false,
        disableFontFace: false,
      }).promise;
      let allText = "",
        outOfPage = 0;
      for (let number = 1; number <= pdf.numPages; number++) {
        const sheet = await pdf.getPage(number),
          viewport = sheet.getViewport({ scale: 1 });
        const text = await sheet.getTextContent();
        for (const item of text.items)
          if ("str" in item) {
            allText += `${item.str} `;
            if (
              item.str.trim() &&
              (item.transform[4] < -1 ||
                item.transform[5] < -1 ||
                item.transform[4] + item.width > viewport.width + 1 ||
                item.transform[5] > viewport.height + 1)
            )
              outOfPage++;
          }
      }
      const first = await pdf.getPage(1),
        canvas = document.querySelector("canvas")!,
        viewport = first.getViewport({ scale: 1.25 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await first.render({
        canvas,
        canvasContext: canvas.getContext("2d")!,
        viewport,
      }).promise;
      const image = canvas.toDataURL("image/png").split(",")[1];
      const last = await pdf.getPage(pdf.numPages);
      await last.render({
        canvas,
        canvasContext: canvas.getContext("2d")!,
        viewport: last.getViewport({ scale: 1.25 }),
      }).promise;
      return {
        pages: pdf.numPages,
        text: allText,
        outOfPage,
        image,
        lastImage: canvas.toDataURL("image/png").split(",")[1],
      };
    }, Buffer.from(bytes).toString("base64"));
    const missing = fixture.expected.filter(
      (value) => !details.text.includes(value),
    );
    if (missing.length || details.outOfPage)
      throw new Error(
        `${fixture.name}: missing=${missing.length} outOfPage=${details.outOfPage}`,
      );
    if (!details.text.includes("Ä Ö Ü ß") || !details.text.includes("€"))
      throw new Error("Missing accented glyphs");
    await writeFile(
      resolve(directory, `${fixture.name}.png`),
      Buffer.from(details.image, "base64"),
    );
    await writeFile(
      resolve(directory, `${fixture.name}-last.png`),
      Buffer.from(details.lastImage, "base64"),
    );
    report.push({
      fixture: fixture.name,
      pages: details.pages,
      pdfBytes: bytes.length,
      elapsedMs,
      hostRssDeltaBytes: Math.max(0, process.memoryUsage().rss - before),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      expectedMarkers: fixture.expected.length,
      missingMarkers: missing.length,
      textOutsidePage: details.outOfPage,
    });
  } finally {
    await browser.close();
  }
}
const envelope = invoiceTemplate();
envelope.definition.schemas[0].find((b) => b.name === "customer")!.position = {
  x: 20,
  y: 49,
};
const overflow = await handleTemplateRender(
  new Request("https://documents.internal/render/template", {
    method: "POST",
    body: JSON.stringify({ envelope, data: envelope.sampleData }),
  }),
  { launch, script },
);
if (
  overflow.status !== 422 ||
  !(await overflow.text()).includes("TEMPLATE_RENDER_OVERLAP")
)
  throw new Error("Overlap not rejected");
await writeFile(
  resolve(directory, "proof.json"),
  JSON.stringify(
    {
      qualification:
        "actual local Chromium through production private handler and bundled browser code; not Cloudflare remote",
      engine: "pdfme/6.1.13",
      scriptBytes: Buffer.byteLength(script),
      fixtures: report,
      overlapRejected: true,
      externalRequests: requests.filter(
        (url) => !url.startsWith("https://guteneo-documents.invalid/template"),
      ),
      note: "Host RSS is an approximate local process metric, excludes browser RSS; not Cloudflare CPU/memory proof. PDF hashes identify stored artefacts; byte-for-byte reproducibility not claimed.",
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(report));
