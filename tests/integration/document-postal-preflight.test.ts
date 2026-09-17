import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { chromium } from "@playwright/test";
import puppeteer from "@cloudflare/puppeteer/internal/puppeteer-core.js";
import { PDFDocument, PDFName } from "pdf-lib";
import {
  handlePingenPreflight,
  type PostalPreflightReport,
} from "../../apps/documents/src/pingen-preflight";
import { validatePdf } from "../../packages/contracts/src/pdf";
import { PINGEN_PREFLIGHT_VERSION } from "../../packages/contracts/src/pingen-preflight";

const options = {
  defaultCountry: "LU",
  country: "LU",
  addressPosition: "left",
  printMode: "simplex",
  printSpectrum: "grayscale",
  deliveryProduct: "cheap",
};
const scripts = {
  pdf: readFileSync("node_modules/pdfjs-dist/legacy/build/pdf.min.mjs", "utf8"),
  worker: readFileSync(
    "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    "utf8",
  ),
};
const launch = () =>
  puppeteer.launch({
    executablePath: chromium.executablePath(),
    headless: true,
  });
let fixtureBrowser: Awaited<ReturnType<typeof launch>>;
let clean: Uint8Array<ArrayBuffer>;
let lateCorner: Uint8Array<ArrayBuffer>;
let emptyAddress: Uint8Array<ArrayBuffer>;

async function fixture(extra = "", address = true, street = "Rue du Test 12") {
  const page = await fixtureBrowser.newPage();
  try {
    await page.setContent(
      `<style>@page{size:210mm 297mm;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Arial}.sheet{position:relative;width:210mm;height:297mm;break-after:page}.address{position:absolute;left:25mm;top:62mm;font-size:11pt;line-height:14pt}.body{position:absolute;left:25mm;top:110mm;font-size:11pt}</style><div class="sheet">${address ? `<div class="address">ATELIER EXEMPLE<br>${street}<br>L-1234 LUXEMBOURG</div>` : ""}<div class="body">Synthetic postal fixture</div></div><div class="sheet">${extra}</div>`,
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
  clean = await fixture();
  lateCorner = await fixture(
    '<div style="position:absolute;left:9mm;top:285mm;width:1mm;height:1mm;background:#aaa"></div>',
  );
  emptyAddress = await fixture("", false);
});
afterAll(async () => {
  await fixtureBrowser?.close();
});

async function run(bytes = clean, engine = launch, deadlineMs?: number) {
  const hash = (await validatePdf(bytes)).sha256;
  const response = await handlePingenPreflight(
    new Request("https://documents.internal/preflight/pingen", {
      method: "POST",
      body: bytes,
      headers: {
        "Content-Type": "application/pdf",
        "X-Guteneo-Source-Sha256": hash,
        "X-Guteneo-Scan-Sha256": hash,
        "X-Guteneo-Pingen-Options": JSON.stringify(options),
      },
    }),
    { launch: engine, scripts, deadlineMs },
  );
  return { response, report: (await response.json()) as PostalPreflightReport };
}

describe("Postal preflight with actual local Chromium and exact PDF.js bytes", () => {
  it("the pinned compatibility scripts render when the remote browser lacks Map insertion APIs", async () => {
    const engine = async () => {
      const browser = await launch();
      const newPage = browser.newPage.bind(browser);
      vi.spyOn(browser, "newPage").mockImplementation(async () => {
        const page = await newPage();
        await page.evaluateOnNewDocument(() => {
          Reflect.deleteProperty(Map.prototype, "getOrInsertComputed");
          Reflect.deleteProperty(WeakMap.prototype, "getOrInsertComputed");
        });
        return page;
      });
      return browser;
    };
    const { report, response } = await run(clean, engine);
    expect(response.status).toBe(200);
    expect(report.status).toBe("review_required");
    expect(report.rendering.complete).toBe(true);
    expect(report.rendering.pages).toHaveLength(2);
    expect(report.issues).toEqual([]);
    expect(report.canSend).toBe(false);
  });
  it.each([
    ["promise_try", "open_promise_try"],
    ["map_insert", "open_map_insert"],
    ["library", "open_library"],
  ])("reports only a fixed capability stage when %s is missing", async (missing, stage) => {
    const engine = async () => {
      const browser = await launch();
      const newPage = browser.newPage.bind(browser);
      vi.spyOn(browser, "newPage").mockImplementation(async () => {
        const page = await newPage();
        const evaluate = page.evaluate.bind(page);
        vi.spyOn(page, "evaluate").mockImplementation(async (fn, ...args) => {
          if (typeof fn === "function" && fn.name === "openPostalPdf")
            await evaluate((capability) => {
              if (capability === "promise_try") Reflect.deleteProperty(Promise, "try");
              if (capability === "map_insert") Reflect.deleteProperty(Map.prototype, "getOrInsertComputed");
              if (capability === "library") Reflect.deleteProperty(globalThis, "pdfjsLib");
            }, missing);
          return evaluate(fn, ...args);
        });
        return page;
      });
      return browser;
    };
    const { report, response } = await run(clean, engine);
    expect(response.status).toBe(422);
    expect(report.diagnostic).toEqual({ stage });
    expect(report.rendering).toMatchObject({ complete: false, pages: [] });
    expect(report.issues).toEqual([{ code: "POSTAL_RENDER_FAILED" }]);
    expect(report.canSend).toBe(false);
  });
  it("renders every original page at 144dpi, extracts the window and retains mandatory human review", async () => {
    const original = clean.slice();
    const { report, response } = await run();
    expect(response.status).toBe(200);
    expect(report).toMatchObject({
      status: "review_required",
      canSend: false,
      pages: 2,
      issues: [],
      rendering: { dpi: 144, complete: true },
    });
    expect(report.rendering.pages.map((page) => page.page)).toEqual([1, 2]);
    for (const page of report.rendering.pages) {
      expect(page.width).toBeGreaterThanOrEqual(1190);
      expect(page.height).toBeGreaterThanOrEqual(1683);
      expect(page.rasterSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(page).not.toHaveProperty("rgbaBase64");
    }
    expect(report.address?.lines).toEqual([
      "ATELIER EXEMPLE",
      "Rue du Test 12",
      "L-1234 LUXEMBOURG",
    ]);
    expect(report.address?.textVisibility).toBe("not_verified");
    expect(report.address?.crop.pngBase64).toMatch(/^iVBOR/);
    expect(
      report.address?.items.every((item) => item.geometry === "approximate"),
    ).toBe(true);
    expect(clean).toEqual(original);
    expect(report.sha256).toBe((await validatePdf(original)).sha256);
    expect(report.requiredReviews).toContain("printed_recipient_matches");
  });
  it("blocks the actual rendered/extracted Luxembourg address under v2 without changing its bytes", async () => {
    const invalid = await fixture("", true, "Rue du Test #12");
    const original = invalid.slice();
    const { report } = await run(invalid);
    expect(report).toMatchObject({
      version: PINGEN_PREFLIGHT_VERSION,
      status: "blocked",
      canSend: false,
      rendering: { complete: true },
    });
    expect(report.address?.lines).toContain("Rue du Test #12");
    expect(report.issues).toContainEqual({
      code: "POSTAL_ADDRESS_CHARACTERS_UNSUPPORTED",
      page: 1,
    });
    expect(report.address?.textVisibility).toBe("not_verified");
    expect(invalid).toEqual(original);
    expect(report.sha256).toBe((await validatePdf(original)).sha256);
  });
  it("rejects nonwhite content in a reserved corner on a later page", async () => {
    const { report } = await run(lateCorner);
    expect(report.status).toBe("blocked");
    expect(report.rendering.complete).toBe(true);
    expect(report.issues).toContainEqual({
      code: "POSTAL_CORNER_CONTENT",
      page: 2,
    });
  });
  it("does not mistake a rendered document without an address for postal readiness", async () => {
    const { report } = await run(emptyAddress);
    expect(report.status).toBe("blocked");
    expect(report.issues).toContainEqual({
      code: "POSTAL_ADDRESS_EMPTY",
      page: 1,
    });
    expect(report.address?.lines).toEqual([]);
  });
  it("rejects an oversized image rather than silently approving a page with omitted ink", async () => {
    const document = await PDFDocument.load(clean);
    const png = await document.embedPng(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    document.getPage(0).drawImage(png, { x: 10, y: 10, width: 10, height: 10 });
    await document.flush();
    const stream = document.context.lookup(png.ref);
    if (!stream || !("dict" in stream))
      throw new Error("fixture image missing");
    const imageDict = stream.dict as import("pdf-lib").PDFDict;
    imageDict.set(PDFName.of("Width"), document.context.obj(100_000));
    imageDict.set(PDFName.of("Height"), document.context.obj(100_000));
    const { report, response } = await run(
      new Uint8Array(await document.save()),
    );
    expect(response.status).toBe(200);
    expect(report.status).toBe("blocked");
    expect(report.rendering.complete).toBe(false);
    expect(report.issues).toContainEqual({ code: "POSTAL_IMAGE_BUDGET" });
  });
  it("never returns a complete result after a later-page engine failure and closes its browser", async () => {
    let closed = false;
    const engine = async () => {
      const browser = await launch();
      const originalClose = browser.close.bind(browser);
      vi.spyOn(browser, "close").mockImplementation(async () => {
        closed = true;
        await originalClose();
      });
      const newPage = browser.newPage.bind(browser);
      vi.spyOn(browser, "newPage").mockImplementation(async () => {
        const page = await newPage();
        const evaluate = page.evaluate.bind(page);
        vi.spyOn(page, "evaluate").mockImplementation(async (fn, ...args) => {
          if (
            typeof fn === "function" &&
            fn.name === "renderPostalPage" &&
            (args[0] as { page?: number }).page === 2
          )
            throw new Error("PRIVATE CONTENT MUST NOT LEAK");
          return evaluate(fn, ...args);
        });
        return page;
      });
      return browser;
    };
    const { report, response } = await run(clean, engine);
    expect(response.status).toBe(422);
    expect(report.rendering.pages).toHaveLength(1);
    expect(report.rendering.complete).toBe(false);
    expect(report.diagnostic).toEqual({ stage: "render" });
    expect(report.canSend).toBe(false);
    expect(JSON.stringify(report)).not.toContain("PRIVATE CONTENT");
    expect(closed).toBe(true);
  });
  it("blocks browser network access even for an injected fetch from the trusted test harness", async () => {
    let requests = 0;
    const server = createServer((_req, res) => {
      requests++;
      res.end("must never arrive");
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("fixture server unavailable");
    let blocked = false;
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
            }, `http://127.0.0.1:${address.port}/network-fixture`);
          return evaluate(fn, ...args);
        });
        return page;
      });
      return browser;
    };
    try {
      const { report } = await run(clean, engine);
      expect(blocked).toBe(true);
      expect(requests).toBe(0);
      expect(report.status).toBe("review_required");
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
  it("fails closed when PDF.js warns about lost content instead of rejecting a render", async () => {
    const engine = async () => {
      const browser = await launch();
      const newPage = browser.newPage.bind(browser);
      vi.spyOn(browser, "newPage").mockImplementation(async () => {
        const page = await newPage();
        const evaluate = page.evaluate.bind(page);
        vi.spyOn(page, "evaluate").mockImplementation(async (fn, ...args) => {
          if (typeof fn === "function" && fn.name === "renderPostalPage")
            await evaluate(() => {
              console.warn("Warning: synthetic image decoder rejected content");
            });
          return evaluate(fn, ...args);
        });
        return page;
      });
      return browser;
    };
    const { report } = await run(clean, engine);
    expect(report.status).toBe("blocked");
    expect(report.rendering.complete).toBe(false);
    expect(report.issues).toContainEqual({ code: "POSTAL_RENDER_FAILED" });
  });
  it("closes a late browser launch after the bounded deadline without parsing PDF content", async () => {
    const browser = await launch();
    const close = vi.spyOn(browser, "close");
    const newPage = vi.spyOn(browser, "newPage");
    const engine = async () => {
      await new Promise((resolve) => setTimeout(resolve, 70));
      return browser;
    };
    const { report } = await run(clean, engine, 15);
    expect(report.status).toBe("blocked");
    expect(report.issues).toContainEqual({ code: "POSTAL_RENDER_TIMEOUT" });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(close).toHaveBeenCalled();
    expect(newPage).not.toHaveBeenCalled();
    await browser.close();
  });
});
