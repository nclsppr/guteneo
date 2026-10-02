import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import puppeteer from "@cloudflare/puppeteer/internal/puppeteer-core.js";
import { chromium } from "@playwright/test";
import { loadTemplateScript } from "../apps/documents/template-assets.mjs";
import { loadPdfScripts } from "../apps/documents/pdfjs-assets.mjs";
import { handleTemplateRender } from "../apps/documents/src/template-render";
import { prepareTemplateRender } from "../packages/contracts/src/templates";
import {
  getTemplateExample,
  templateExampleCatalog,
} from "../packages/templates/authoring";

// This proof is independent of pdfme-spike.ts and its pagination fixtures.
// Pass an explicit external output directory to keep generated assets out of Git.
const outputArgument = process.argv[2];
assert(outputArgument, "Pass the output directory as the first argument");
const directory = resolve(outputArgument);
await mkdir(directory, { recursive: true });
const script = await loadTemplateScript();
const pdfScripts = await loadPdfScripts();
const expectedIds = [
  "letter",
  "invoice",
  "statement",
  "quote",
  "delivery-note",
];
const catalog = templateExampleCatalog();
assert.deepEqual(
  catalog.map((entry) => entry.id).sort(),
  [...expectedIds].sort(),
  "The authoring catalogue must expose exactly the five document demos",
);
let externalRequests = 0;
let isolatedNavigations = 0;
const launch = async () => {
  const browser = await puppeteer.launch({
    executablePath: chromium.executablePath(),
    headless: true,
  });
  browser.on("targetcreated", async (target) => {
    const page = await target.page();
    page?.on("request", (request) => {
      const url = request.url();
      if (url === "https://guteneo-documents.invalid/template")
        isolatedNavigations++;
      else if (!/^(?:about:|blob:|data:)/.test(url)) externalRequests++;
    });
  });
  return browser;
};
const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
const fixtures: Record<string, unknown>[] = [];

for (const id of expectedIds) {
  const example = getTemplateExample(id);
  assert(example, `${id}: catalogue entry must have an executable example`);
  const { envelope } = example;
  const original = JSON.stringify(envelope);
  const prepared = prepareTemplateRender(envelope, envelope.sampleData);
  const markers = new Set<string>();
  for (const binding of envelope.bindings) {
    const value = prepared.inputs[0][binding.block];
    if (value === undefined) continue;
    const values: string[] =
      binding.kind === "table"
        ? (JSON.parse(value) as string[][]).flat()
        : [value];
    for (const marker of values.map(normalize))
      if (marker.length >= 3) markers.add(marker);
  }
  for (const block of prepared.template.schemas.flat())
    if (block.type === "text" && block.readOnly && block.content)
      markers.add(normalize(block.content));
  assert(markers.size >= 3, `${id}: expected meaningful business markers`);

  const started = performance.now();
  const response = await handleTemplateRender(
    new Request("https://documents.internal/render/template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ envelope, data: envelope.sampleData }),
    }),
    { launch, script },
  );
  if (!response.ok) {
    const error = (await response.json()) as { error?: { code?: string } };
    throw new Error(
      `${id}: render failed with ${error.error?.code ?? response.status}`,
    );
  }
  assert.equal(response.headers.get("Content-Type"), "application/pdf");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const bytes = new Uint8Array(await response.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  assert.equal(response.headers.get("X-Guteneo-Sha256"), sha256);
  assert.equal(
    JSON.stringify(envelope),
    original,
    `${id}: rendering mutated its example`,
  );
  await writeFile(resolve(directory, `${id}.pdf`), bytes);

  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setOfflineMode(true);
    await page.setContent(
      '<!doctype html><meta charset="utf-8"><canvas></canvas>',
    );
    await page.addScriptTag({ content: pdfScripts.worker, type: "module" });
    await page.addScriptTag({ content: pdfScripts.pdf, type: "module" });
    const details = await page.evaluate(async (base64) => {
      const global = globalThis as typeof globalThis & {
        pdfjsLib: typeof import("pdfjs-dist");
      };
      const pdf = await global.pdfjsLib.getDocument({
        data: Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
        useSystemFonts: false,
        disableFontFace: false,
      }).promise;
      let text = "";
      let textOutsidePage = 0;
      const pageSizes: { width: number; height: number }[] = [];
      for (let number = 1; number <= pdf.numPages; number++) {
        const sheet = await pdf.getPage(number);
        const viewport = sheet.getViewport({ scale: 1 });
        pageSizes.push({ width: viewport.width, height: viewport.height });
        const content = await sheet.getTextContent();
        for (const item of content.items) {
          if (!("str" in item)) continue;
          text += `${item.str} `;
          if (
            item.str.trim() &&
            (item.transform[4] < -1 ||
              item.transform[5] < -1 ||
              item.transform[4] + item.width > viewport.width + 1 ||
              item.transform[5] > viewport.height + 1)
          )
            textOutsidePage++;
        }
      }
      const first = await pdf.getPage(1);
      const viewport = first.getViewport({ scale: 1.5 });
      const canvas = document.querySelector("canvas")!;
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d")!;
      await first.render({ canvas, canvasContext: context, viewport }).promise;
      const pixels = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data;
      let inkPixels = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (
          pixels[i + 3] > 0 &&
          Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) < 245
        )
          inkPixels++;
      return {
        pages: pdf.numPages,
        pageSizes,
        text,
        textOutsidePage,
        image: canvas.toDataURL("image/png").split(",")[1],
        imageWidth: canvas.width,
        imageHeight: canvas.height,
        inkPixels,
      };
    }, Buffer.from(bytes).toString("base64"));
    const text = normalize(details.text);
    const missingMarkers = [...markers].filter(
      (marker) => !text.includes(marker),
    );
    assert.equal(
      missingMarkers.length,
      0,
      `${id}: ${missingMarkers.length} business markers missing`,
    );
    assert.equal(details.textOutsidePage, 0, `${id}: text outside a PDF page`);
    assert(
      details.pages >= 1 && details.pages <= 10,
      `${id}: unexpected sample page count`,
    );
    assert.equal(
      Number(response.headers.get("X-Guteneo-Pages")),
      details.pages,
    );
    for (const size of details.pageSizes) {
      assert(
        Math.abs(size.width - (envelope.definition.basePdf.width * 72) / 25.4) <
          0.5,
      );
      assert(
        Math.abs(
          size.height - (envelope.definition.basePdf.height * 72) / 25.4,
        ) < 0.5,
      );
    }
    assert(details.inkPixels > 1000, `${id}: first-page preview is blank`);
    const image = Buffer.from(details.image, "base64");
    assert.equal(image.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    await writeFile(resolve(directory, `${id}.png`), image);
    fixtures.push({
      id,
      pages: details.pages,
      pageSizes: details.pageSizes,
      pdfBytes: bytes.length,
      sha256,
      elapsedMs: Math.round(performance.now() - started),
      expectedMarkers: markers.size,
      missingMarkers: missingMarkers.length,
      textOutsidePage: details.textOutsidePage,
      preview: {
        width: details.imageWidth,
        height: details.imageHeight,
        inkPixels: details.inkPixels,
      },
      sampleDataUnchanged: true,
    });
  } finally {
    await browser.close();
  }
}

assert.equal(externalRequests, 0, "Demo rendering attempted external egress");
assert.equal(
  isolatedNavigations,
  expectedIds.length,
  "Every demo must use the isolated private handler",
);
const proof = {
  qualification:
    "Actual local Chromium through the private handler with unchanged synthetic sampleData; not hosted runtime or communication delivery",
  fixtures,
  externalRequests,
  isolatedNavigations,
  visualInspection: "pending manual inspection of the five first-page PNGs",
};
await writeFile(
  resolve(directory, "proof.json"),
  JSON.stringify(proof, null, 2),
);
console.log(
  JSON.stringify({
    fixtures: fixtures.map((fixture) => fixture.id),
    externalRequests,
    proof: resolve(directory, "proof.json"),
  }),
);
