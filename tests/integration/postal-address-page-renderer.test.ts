import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium } from "@playwright/test";
import puppeteer from "@cloudflare/puppeteer/internal/puppeteer-core.js";
import { PDFDocument } from "pdf-lib";
import { mkdir, writeFile } from "node:fs/promises";
import { loadPdfScripts } from "../../apps/documents/pdfjs-assets.mjs";
import { handlePostalAddressPage } from "../../apps/documents/src/postal-address-page";
import {
  handlePingenPreflight,
  type PostalPreflightReport,
} from "../../apps/documents/src/pingen-preflight";
import { validatePdf } from "../../packages/contracts/src/pdf";
import {
  postalAddressLines,
  POSTAL_ADDRESS_PAGE_VERSION,
} from "../../packages/contracts/src/postal-address-page";
import type { PingenPreflightOptions } from "../../packages/contracts/src/pingen-preflight";

const scripts = await loadPdfScripts();
const launch = () =>
  puppeteer.launch({
    executablePath: chromium.executablePath(),
    headless: true,
  });
let browser: Awaited<ReturnType<typeof launch>>;
let original: Uint8Array<ArrayBuffer>;
beforeAll(async () => {
  browser = await launch();
  const page = await browser.newPage();
  await page.setContent(`<style>@font-face{font-family:Fixture;src:url(data:font/ttf;base64,${scripts.addressFont})} @page{size:210mm 297mm;margin:0}body{margin:0;font:11pt Fixture}.sheet{width:210mm;height:297mm;position:relative;break-after:page}.text{position:absolute;left:25mm;top:110mm}.mark{position:absolute;left:80mm;top:150mm;width:20mm;height:10mm;background:#266}
  </style><div class="sheet"><div class="text">Original première page — Élodie Müller</div><div class="mark"></div></div><div class="sheet"><div class="text">Original seconde page — aucun remplacement</div></div>`);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  original = new Uint8Array(
    await page.pdf({ preferCSSPageSize: true, printBackground: true }),
  );
  await page.close();
});
afterAll(async () => {
  await browser?.close();
});
const lu = {
  name: "ÉLODIE MÜLLER",
  line1: "Rue du Test 12",
  postalCode: "L-1234",
  city: "LUXEMBOURG",
  country: "LU" as const,
};
const cases = [
  {
    key: "lu-simplex",
    recipient: lu,
    defaultCountry: "LU",
    addressPosition: "left",
    printMode: "simplex",
  },
  {
    key: "fr-duplex",
    recipient: {
      name: "ATELIER EXEMPLE",
      line1: "12 RUE DU TEST",
      postalCode: "75001",
      city: "PARIS",
      country: "FR" as const,
    },
    defaultCountry: "FR",
    addressPosition: "right",
    printMode: "duplex",
  },
  {
    key: "fr-de-international",
    recipient: {
      name: "ELISE MÜLLER",
      line1: "Teststraße 12",
      postalCode: "10115",
      city: "BERLIN",
      country: "DE" as const,
    },
    defaultCountry: "FR",
    addressPosition: "right",
    printMode: "simplex",
  },
] as const;
async function preflight(
  bytes: Uint8Array<ArrayBuffer>,
  options: PingenPreflightOptions,
) {
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
    { launch, scripts },
  );
  expect(response.status).toBe(200);
  return (await response.json()) as PostalPreflightReport;
}
async function compose(
  input: Omit<(typeof cases)[number], "key"> | Record<string, unknown>,
  source = original,
) {
  const hash = (await validatePdf(source)).sha256;
  return handlePostalAddressPage(
    new Request("https://documents.internal/postal-address-page", {
      method: "POST",
      body: source,
      headers: {
        "Content-Type": "application/pdf",
        "X-Guteneo-Source-Sha256": hash,
        "X-Guteneo-Scan-Sha256": hash,
        "X-Guteneo-Postal-Address-Page": encodeURIComponent(
          JSON.stringify(input),
        ),
      },
    }),
    { launch, fontBase64: scripts.addressFont },
  );
}
describe("Postal address page with actual local Chromium and PDF.js", () => {
  it("adds an extractable address to a one-page image-only original without OCR or changing its pixels", async () => {
    const page = await browser.newPage();
    const png = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 595;
      canvas.height = 842;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "white";
      context.fillRect(0, 0, 595, 842);
      context.fillStyle = "black";
      context.font = "16px Arial";
      context.fillText("Scanned original: preserved as an image", 70, 350);
      context.fillStyle = "#1746c2";
      context.fillRect(70, 390, 200, 35);
      return canvas.toDataURL("image/png").split(",")[1];
    });
    await page.close();
    const pdf = await PDFDocument.create();
    const image = await pdf.embedPng(Buffer.from(png, "base64"));
    const a4 = [(210 * 72) / 25.4, (297 * 72) / 25.4] as [number, number];
    pdf
      .addPage(a4)
      .drawImage(image, { x: 0, y: 0, width: a4[0], height: a4[1] });
    const source = new Uint8Array(await pdf.save());
    const { key: _key, ...input } = cases[0];
    const response = await compose(input, source);
    if (response.status !== 200) throw new Error(await response.text());
    const final = new Uint8Array(await response.arrayBuffer());
    expect((await validatePdf(final)).pages).toBe(2);
    const options: PingenPreflightOptions = {
      defaultCountry: input.defaultCountry,
      country: input.recipient.country,
      addressPosition: input.addressPosition,
      printMode: input.printMode,
      printSpectrum: "grayscale",
      deliveryProduct: "cheap",
    };
    const before = await preflight(source, options);
    const after = await preflight(final, options);
    expect(before.status).toBe("blocked");
    expect(before.address?.lines).toEqual([]);
    expect(after.status).toBe("review_required");
    expect(after.address?.lines).toEqual(
      postalAddressLines(input.recipient, input.defaultCountry),
    );
    expect(after.rendering.pages[1].rasterSha256).toBe(
      before.rendering.pages[0].rasterSha256,
    );
    await mkdir("test-results/postal-address-page/pdf", { recursive: true });
    await writeFile(
      "test-results/postal-address-page/pdf/address-page-scanned-original.pdf",
      final,
    );
  }, 90_000);
  it.each(cases)(
    "embeds a fixed $key address, preserves original raster content and passes full preflight",
    async ({ key, ...input }) => {
      const originalSnapshot = original.slice();
      const response = await compose(input);
      if (response.status !== 200) throw new Error(await response.text());
      const final = new Uint8Array(await response.arrayBuffer());
      const extra = input.printMode === "duplex" ? 2 : 1;
      const checked = await validatePdf(final);
      expect(checked.pages).toBe(2 + extra);
      expect(response.headers.get("X-Guteneo-Document-Sha256")).toBe(
        checked.sha256,
      );
      expect(response.headers.get("X-Guteneo-Added-Pages")).toBe(String(extra));
      expect(
        response.headers.get("X-Guteneo-Postal-Address-Page-Version"),
      ).toBe(POSTAL_ADDRESS_PAGE_VERSION);
      expect(original).toEqual(originalSnapshot);
      const options: PingenPreflightOptions = {
        defaultCountry: input.defaultCountry,
        country: input.recipient.country,
        addressPosition: input.addressPosition,
        printMode: input.printMode,
        printSpectrum: "grayscale",
        deliveryProduct: "cheap",
      };
      const before = await preflight(original, options);
      const after = await preflight(final, options);
      expect(after.status).toBe("review_required");
      expect(after.issues).toEqual([]);
      expect(after.rendering.complete).toBe(true);
      expect(after.address?.lines).toEqual(
        postalAddressLines(input.recipient, input.defaultCountry),
      );
      expect(after.address?.textVisibility).toBe("not_verified");
      expect(
        after.rendering.pages.slice(extra).map((page) => page.rasterSha256),
      ).toEqual(before.rendering.pages.map((page) => page.rasterSha256));
      if (extra === 2) {
        const pdf = await PDFDocument.load(final);
        expect(pdf.getPage(1).node.Contents()).toBeUndefined();
      }
      await mkdir("test-results/postal-address-page/pdf", { recursive: true });
      await writeFile(
        `test-results/postal-address-page/pdf/address-page-${key}.pdf`,
        final,
      );
      await writeFile(
        `test-results/postal-address-page/pdf/address-page-${key}-crop.png`,
        Buffer.from(after.address!.crop.pngBase64, "base64"),
      );
    },
    90_000,
  );
  it("rejects an overflowing recipient at fixed type size instead of wrapping, clipping or shrinking", async () => {
    const { key: _key, ...input } = cases[0];
    const response = await compose({
      ...input,
      recipient: { ...input.recipient, name: "W".repeat(70) },
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: { code: "POSTAL_ADDRESS_PAGE_ADDRESS_TOO_LONG" },
    });
  });
});
