import { loadPdfScripts } from "../../apps/documents/pdfjs-assets.mjs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import ts from "typescript";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { chromium } from "@playwright/test";
import puppeteer from "@cloudflare/puppeteer/internal/puppeteer-core.js";
import { PDFDocument, PDFName, StandardFonts } from "pdf-lib";
import {
  EXPERT_REVIEW_LIMITS,
  handleExpertReviewPages,
} from "../../apps/documents/src/expert-review";
import { reviewPagesSchema } from "../../packages/contracts/src/expert-review";
import { validatePdf } from "../../packages/contracts/src/pdf";

const scripts = await loadPdfScripts();
const launch = () =>
  puppeteer.launch({
    executablePath: chromium.executablePath(),
    headless: true,
  });
let fixtureBrowser: Awaited<ReturnType<typeof launch>>;
let source: Uint8Array<ArrayBuffer>;
let dense: Uint8Array<ArrayBuffer>;

async function fixture(content: string) {
  const page = await fixtureBrowser.newPage();
  try {
    await page.setContent(
      `<style>@page{size:A4;margin:0}body{margin:0;font-family:Arial}.sheet{box-sizing:border-box;height:297mm;padding:20mm;break-after:page}h1{font-size:22pt}p{font-size:12pt;line-height:1.6}pre{font-size:4pt;line-height:5pt;white-space:pre-wrap}</style>${content}`,
      { waitUntil: "load" },
    );
    return new Uint8Array(
      await page.pdf({ preferCSSPageSize: true, printBackground: true }),
    );
  } finally {
    await page.close();
  }
}
beforeAll(async () => {
  fixtureBrowser = await launch();
  const base = await fixture(
    [1, 2, 3, 4]
      .map(
        (number) =>
          `<section class="sheet"><h1>ORIGINAL PAGE ${number}</h1><p>Document fictif pour le contrôle visuel dans un assistant.<br>Destinataire fictif : TEST NON EXPEDIABLE<br>Référence de page : ${number} sur 4.</p><p>Chaque page conserve sa composition et sa couleur.</p><div style="width:160mm;height:10mm;background:${number % 2 ? "#2450db" : "#ac3427"}"></div></section>`,
      )
      .join(""),
  );
  const page = await fixtureBrowser.newPage();
  let png: string;
  try {
    png = await page.evaluate(() => {
      const canvas = globalThis.document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 512;
      const context = canvas.getContext("2d")!;
      const image = context.createImageData(canvas.width, canvas.height);
      let seed = 0x12345678;
      for (let i = 0; i < image.data.length; i += 4) {
        for (let channel = 0; channel < 3; channel++) {
          seed ^= seed << 13;
          seed ^= seed >>> 17;
          seed ^= seed << 5;
          image.data[i + channel] = seed & 255;
        }
        image.data[i + 3] = 255;
      }
      context.putImageData(image, 0, 0);
      return canvas.toDataURL("image/png").split(",")[1];
    });
  } finally {
    await page.close();
  }
  const document = await PDFDocument.load(base);
  const image = await document.embedPng(Buffer.from(png, "base64"));
  document
    .getPage(0)
    .drawImage(image, { x: 56, y: 100, width: 128, height: 64 });
  source = new Uint8Array(await document.save());
  dense = await fixture(
    `<section class="sheet"><h1>DENSE TEXT LAYER</h1><pre>${Array.from({ length: 125 }, (_, line) => `LINE ${String(line).padStart(3, "0")} ${"synthetic content ".repeat(5)}`).join("\n")}</pre></section>`,
  );
});
afterAll(async () => {
  await fixtureBrowser?.close();
});
async function run(
  bytes = source,
  startPage = 1,
  pageCount = 3,
  engine = launch,
  deadlineMs?: number,
  resources: Pick<typeof scripts, "pdf" | "worker" | "fonts"> = scripts,
) {
  const hash = (await validatePdf(bytes)).sha256;
  const response = await handleExpertReviewPages(
    new Request(
      `https://documents.internal/review-pages?startPage=${startPage}&pageCount=${pageCount}`,
      {
        method: "POST",
        body: bytes,
        headers: {
          "Content-Type": "application/pdf",
          "X-Guteneo-Source-Sha256": hash,
          "X-Guteneo-Scan-Sha256": hash,
        },
      },
    ),
    { launch: engine, scripts: resources, deadlineMs },
  );
  return { response, body: await response.json() };
}

describe("Exact paginated PDF review with actual local Chromium and pinned PDF.js", () => {
  it("executes the real Wrangler browser callbacks with their bundled standard-font assets", async () => {
    const output = "test-results/standard-fonts/worker";
    execFileSync(
      process.execPath,
      [
        "node_modules/wrangler/bin/wrangler.js",
        "deploy",
        "--dry-run",
        "--config",
        "apps/documents/wrangler.jsonc",
        "--outdir",
        `../../${output}`,
      ],
      { timeout: 60_000, stdio: "pipe" },
    );
    const bundle = ts.createSourceFile(
      "index.js",
      readFileSync(`${output}/index.js`, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    );
    const callbacks = new Map<string, string>();
    const resources = { pdf: "", worker: "", fonts: "", addressFont: "" };
    for (const node of bundle.statements) {
      if (
        ts.isFunctionDeclaration(node) &&
        node.name &&
        ["openPostalPdf", "renderExpertReviewPage"].includes(node.name.text)
      )
        callbacks.set(node.name.text, node.getText(bundle));
      if (
        !ts.isImportDeclaration(node) ||
        !ts.isStringLiteral(node.moduleSpecifier)
      )
        continue;
      const filename = node.moduleSpecifier.text;
      for (const [key, suffix] of [
        ["pdf", "-pdf.txt"],
        ["worker", "-pdf.worker.txt"],
        ["fonts", "-standard-fonts.txt"],
        ["addressFont", "-address-font.txt"],
      ] as const)
        if (filename.endsWith(suffix))
          resources[key] = readFileSync(resolve(output, filename), "utf8");
    }
    expect(callbacks.size).toBe(2);
    expect(resources).toEqual(scripts);
    for (const callback of callbacks.values())
      expect(callback).not.toContain("__name");
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595.28, 841.89]);
    for (const [index, name] of [
      StandardFonts.Helvetica,
      StandardFonts.TimesRoman,
      StandardFonts.Courier,
    ].entries()) {
      const font = await pdf.embedFont(name);
      page.drawText(`${name}: BUNDLED ORIGINAL`, {
        font,
        x: 50,
        y: 750 - index * 80,
        size: 18,
      });
    }
    const original = new Uint8Array(await pdf.save());
    const requests: string[] = [];
    const evaluated: string[] = [];
    const engine = async () => {
      const browser = await launch();
      const newPage = browser.newPage.bind(browser);
      vi.spyOn(browser, "newPage").mockImplementation(async () => {
        const page = await newPage();
        page.on("request", (request) => requests.push(request.url()));
        const evaluate = page.evaluate.bind(page);
        vi.spyOn(page, "evaluate").mockImplementation(async (fn, ...args) => {
          if (typeof fn === "function" && callbacks.has(fn.name)) {
            evaluated.push(fn.name);
            // Only our locally built Worker code is evaluated. Its browser
            // callbacks must work without the Worker's surrounding helpers.
            const compiled = new Function(
              `return (${callbacks.get(fn.name)});`,
            )() as typeof fn;
            return evaluate(compiled, ...args);
          }
          return evaluate(fn, ...args);
        });
        return page;
      });
      return browser;
    };
    const { response, body } = await run(
      original,
      1,
      1,
      engine,
      undefined,
      resources,
    );
    expect(response.status).toBe(200);
    const report = reviewPagesSchema.parse(body);
    expect(report.sha256).toBe(
      createHash("sha256").update(original).digest("hex"),
    );
    expect(report.rendering.complete).toBe(true);
    for (const name of [
      StandardFonts.Helvetica,
      StandardFonts.TimesRoman,
      StandardFonts.Courier,
    ])
      expect(report.pages[0].text.replace(/\s+/g, " ")).toContain(
        `${name}: BUNDLED ORIGINAL`,
      );
    expect(evaluated).toEqual(["openPostalPdf", "renderExpertReviewPage"]);
    expect(requests).toEqual(["https://guteneo-documents.invalid/review"]);
  }, 90_000);

  it.each([
    [
      "Helvetica",
      [
        StandardFonts.Helvetica,
        StandardFonts.HelveticaBold,
        StandardFonts.HelveticaOblique,
        StandardFonts.HelveticaBoldOblique,
      ],
    ],
    [
      "Times",
      [
        StandardFonts.TimesRoman,
        StandardFonts.TimesRomanBold,
        StandardFonts.TimesRomanItalic,
        StandardFonts.TimesRomanBoldItalic,
      ],
    ],
    [
      "Courier",
      [
        StandardFonts.Courier,
        StandardFonts.CourierBold,
        StandardFonts.CourierOblique,
        StandardFonts.CourierBoldOblique,
      ],
    ],
    ["Symbols", [StandardFonts.Symbol, StandardFonts.ZapfDingbats]],
  ] as const)(
    "renders the unembedded %s standard fonts from bundled bytes without resource requests",
    async (family, names) => {
      const pdf = await PDFDocument.create();
      const page = pdf.addPage([595.28, 841.89]);
      for (const [index, name] of names.entries()) {
        const font = await pdf.embedFont(name);
        const text =
          family === "Symbols"
            ? font
                .getCharacterSet()
                .filter((code) => code > 32)
                .slice(0, 20)
                .map((code) => String.fromCodePoint(code))
                .join("")
            : `${name}: ORIGINAL ABCDEF 0123456789`;
        page.drawText(text, { font, x: 50, y: 760 - index * 80, size: 18 });
      }
      const original = new Uint8Array(await pdf.save());
      const retained = original.slice();
      const requests: string[] = [];
      const engine = async () => {
        const browser = await launch();
        const newPage = browser.newPage.bind(browser);
        vi.spyOn(browser, "newPage").mockImplementation(async () => {
          const page = await newPage();
          page.on("request", (request) => requests.push(request.url()));
          return page;
        });
        return browser;
      };
      const { response, body } = await run(original, 1, 1, engine);
      expect(response.status).toBe(200);
      const report = reviewPagesSchema.parse(body);
      expect(report).toMatchObject({
        totalPages: 1,
        sha256: createHash("sha256").update(retained).digest("hex"),
        rendering: { complete: true },
      });
      expect(original).toEqual(retained);
      expect(report.pages[0]).toMatchObject({ width: 1132, height: 1600 });
      if (family !== "Symbols")
        for (const name of names)
          expect(report.pages[0].text.replace(/\s+/g, " ")).toContain(
            `${name}: ORIGINAL`,
          );
      expect(requests).toEqual(["https://guteneo-documents.invalid/review"]);
      mkdirSync("test-results/standard-fonts", { recursive: true });
      writeFileSync(
        `test-results/standard-fonts/${family}.jpg`,
        Buffer.from(report.pages[0].imageBase64, "base64"),
      );
    },
  );

  it("keeps incomplete standard-font assets fail closed instead of substituting a system font", async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    pdf.addPage().drawText("Original Helvetica", { font, x: 50, y: 700 });
    const { response, body } = await run(
      new Uint8Array(await pdf.save()),
      1,
      1,
      launch,
      undefined,
      {
        ...scripts,
        fonts: `${scripts.fonts}\nglobalThis.guteneoStandardFonts = Object.freeze({});`,
      },
    );
    expect(response.status).toBe(422);
    expect(body).toEqual({ error: { code: "REVIEW_RENDER_FAILED" } });
  });

  it("restricts the offline factory to package fonts and returns fresh bytes without fetching", async () => {
    const page = await fixtureBrowser.newPage();
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    try {
      await page.addScriptTag({ content: scripts.fonts, type: "module" });
      const result = await page.evaluate(async () => {
        const state = globalThis as typeof globalThis & {
          guteneoStandardFonts: Readonly<Record<string, string>>;
          guteneoBinaryDataFactory: new () => {
            fetch(input: {
              kind: string;
              filename: string;
            }): Promise<Uint8Array>;
          };
        };
        const factory = new state.guteneoBinaryDataFactory();
        const forbidden = [
          { kind: "wasmUrl", filename: "LiberationSans-Regular.ttf" },
          { kind: "cMapUrl", filename: "FoxitFixed.pfb" },
          {
            kind: "standardFontDataUrl",
            filename: "https://example.invalid/font.ttf",
          },
          {
            kind: "standardFontDataUrl",
            filename: "../LiberationSans-Regular.ttf",
          },
          { kind: "standardFontDataUrl", filename: "constructor" },
          { kind: "standardFontDataUrl", filename: "__proto__" },
        ];
        const rejected = await Promise.all(
          forbidden.map(async (input) => {
            try {
              await factory.fetch(input);
              return false;
            } catch {
              return true;
            }
          }),
        );
        const input = {
          kind: "standardFontDataUrl",
          filename: "LiberationSans-Regular.ttf",
        };
        const first = await factory.fetch(input);
        const original = first[0];
        first[0] ^= 0xff;
        const second = await factory.fetch(input);
        return {
          files: Object.keys(state.guteneoStandardFonts).length,
          immutableTable: Object.isFrozen(state.guteneoStandardFonts),
          rejected,
          originalPreserved: second[0] === original,
          bytes: second.length,
        };
      });
      expect(result).toEqual({
        files: 14,
        immutableTable: true,
        rejected: [true, true, true, true, true, true],
        originalPreserved: true,
        bytes: 139512,
      });
      expect(requests).toEqual([]);
    } finally {
      await page.close();
    }
  });

  it("renders a >1MiB four-page original as bounded readable page images and text without changing its bytes", async () => {
    const original = source.slice();
    expect(source.byteLength).toBeGreaterThan(1024 * 1024);
    const first = await run();
    expect(first.response.status).toBe(200);
    const report = reviewPagesSchema.parse(first.body);
    expect(report).toMatchObject({
      totalPages: 4,
      startPage: 1,
      pageCount: 3,
      nextPage: 4,
      rendering: { complete: true },
    });
    expect(report.pages.map((page) => page.page)).toEqual([1, 2, 3]);
    expect(report.sha256).toBe((await validatePdf(original)).sha256);
    expect(source).toEqual(original);
    expect(Buffer.byteLength(JSON.stringify(report))).toBeLessThan(
      EXPERT_REVIEW_LIMITS.responseBytes,
    );
    for (const page of report.pages) {
      expect(page.width).toBeGreaterThan(1000);
      expect(page.height).toBe(1600);
      expect(page.imageBase64.length).toBeLessThanOrEqual(
        EXPERT_REVIEW_LIMITS.maxImageCharacters,
      );
      expect(page.imageSha256).toBe(
        createHash("sha256")
          .update(Buffer.from(page.imageBase64, "base64"))
          .digest("hex"),
      );
      expect(page.text).toContain(`ORIGINAL PAGE ${page.page}`);
      expect(page.textTruncated).toBe(false);
    }
    const last = await run(source, 4, 1);
    expect(last.response.status).toBe(200);
    const final = reviewPagesSchema.parse(last.body);
    expect(final).toMatchObject({
      totalPages: 4,
      startPage: 4,
      pageCount: 1,
      nextPage: null,
      sha256: report.sha256,
    });
    expect(final.pages[0].text).toContain("ORIGINAL PAGE 4");
    mkdirSync("test-results/expert-review", { recursive: true });
    writeFileSync(
      "test-results/expert-review/page-1.jpg",
      Buffer.from(report.pages[0].imageBase64, "base64"),
    );
    writeFileSync(
      "test-results/expert-review/page-4.jpg",
      Buffer.from(final.pages[0].imageBase64, "base64"),
    );
    writeFileSync(
      "test-results/expert-review/synthetic-proof.json",
      JSON.stringify(
        {
          evidence: "local Chromium only; no provider or ChatGPT session",
          sourceBytes: source.length,
          sourceSha256: report.sha256,
          totalPages: report.totalPages,
          batches: [[1, 2, 3], [4]],
          imageDimensions: report.pages.map(({ width, height }) => ({
            width,
            height,
          })),
          responseBytes: [
            Buffer.byteLength(JSON.stringify(report)),
            Buffer.byteLength(JSON.stringify(final)),
          ],
        },
        null,
        2,
      ),
    );
  });
  it("marks a truncated PDF text layer explicitly while retaining the full-page image", async () => {
    const { response, body } = await run(dense, 1, 1);
    expect(response.status).toBe(200);
    const report = reviewPagesSchema.parse(body);
    expect(report.pages[0].text.length).toBeLessThanOrEqual(8000);
    expect(report.pages[0].textTruncated).toBe(true);
    expect(report.pages[0].imageBase64).toMatch(/^\/9j/);
    expect(report.rendering.complete).toBe(true);
  });
  it("rejects annotation content even outside the requested page batch", async () => {
    const document = await PDFDocument.load(source);
    document.getPage(3).node.set(
      PDFName.of("Annots"),
      document.context.obj([
        {
          Type: "Annot",
          Subtype: "Text",
          Rect: [10, 10, 20, 20],
          Contents: "Synthetic visible note",
        },
      ]),
    );
    const engine = vi.fn(launch);
    const { response, body } = await run(
      new Uint8Array(await document.save()),
      1,
      3,
      engine,
    );
    expect(response.status).toBe(422);
    expect(body).toEqual({ error: { code: "REVIEW_UNSUPPORTED_CONTENT" } });
    expect(engine).not.toHaveBeenCalled();
  });
  it("does not return any page if a later page fails, and closes the browser", async () => {
    let closed = false;
    const engine = async () => {
      const browser = await launch();
      const close = browser.close.bind(browser);
      vi.spyOn(browser, "close").mockImplementation(async () => {
        closed = true;
        await close();
      });
      const newPage = browser.newPage.bind(browser);
      vi.spyOn(browser, "newPage").mockImplementation(async () => {
        const page = await newPage();
        const evaluate = page.evaluate.bind(page);
        vi.spyOn(page, "evaluate").mockImplementation(async (fn, ...args) => {
          if (
            typeof fn === "function" &&
            fn.name === "renderExpertReviewPage" &&
            (args[0] as { page?: number }).page === 2
          )
            throw new Error("PRIVATE ORIGINAL CONTENT MUST NOT LEAK");
          return evaluate(fn, ...args);
        });
        return page;
      });
      return browser;
    };
    const { response, body } = await run(source, 1, 3, engine);
    expect(response.status).toBe(422);
    expect(body).toEqual({ error: { code: "REVIEW_RENDER_FAILED" } });
    expect(closed).toBe(true);
  });
  it("blocks external network access from the isolated page", async () => {
    let requests = 0,
      blocked = false;
    const server = createServer((_req, response) => {
      requests++;
      response.end("must never arrive");
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("fixture server unavailable");
    const engine = async () => {
      const browser = await launch();
      const newPage = browser.newPage.bind(browser);
      vi.spyOn(browser, "newPage").mockImplementation(async () => {
        const page = await newPage();
        const evaluate = page.evaluate.bind(page);
        vi.spyOn(page, "evaluate").mockImplementation(async (fn, ...args) => {
          if (typeof fn === "function" && fn.name === "openPostalPdf")
            blocked = await evaluate(async (url) => {
              try {
                await fetch(url);
                return false;
              } catch {
                return true;
              }
            }, `http://127.0.0.1:${address.port}/synthetic-network`);
          return evaluate(fn, ...args);
        });
        return page;
      });
      return browser;
    };
    try {
      const { response } = await run(source, 1, 1, engine);
      expect(response.status).toBe(200);
      expect(blocked).toBe(true);
      expect(requests).toBe(0);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
  it("fails closed on PDF.js lost-content warnings", async () => {
    const engine = async () => {
      const browser = await launch();
      const newPage = browser.newPage.bind(browser);
      vi.spyOn(browser, "newPage").mockImplementation(async () => {
        const page = await newPage();
        const evaluate = page.evaluate.bind(page);
        vi.spyOn(page, "evaluate").mockImplementation(async (fn, ...args) => {
          if (typeof fn === "function" && fn.name === "renderExpertReviewPage")
            await evaluate(() =>
              console.warn("Synthetic incomplete image rendering"),
            );
          return evaluate(fn, ...args);
        });
        return page;
      });
      return browser;
    };
    const { response, body } = await run(source, 1, 1, engine);
    expect(response.status).toBe(422);
    expect(body).toEqual({ error: { code: "REVIEW_RENDER_FAILED" } });
  });
  it("closes a browser launched after the deadline without opening a PDF page", async () => {
    const browser = await launch();
    const close = vi.spyOn(browser, "close"),
      newPage = vi.spyOn(browser, "newPage");
    try {
      const { response, body } = await run(
        source,
        1,
        1,
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return browser;
        },
        35,
      );
      expect(response.status).toBe(504);
      expect(body).toEqual({ error: { code: "REVIEW_RENDER_TIMEOUT" } });
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(close).toHaveBeenCalled();
      expect(newPage).not.toHaveBeenCalled();
    } finally {
      await browser.close();
    }
  });
});
