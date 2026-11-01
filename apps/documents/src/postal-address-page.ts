import type { HTTPRequest, Page } from "@cloudflare/puppeteer";
import { PDFDocument, PDFName } from "pdf-lib";
import {
  postalAddressPageRenderInputSchema,
  postalAddressLines,
  postalAddressPageVersion,
} from "../../../packages/contracts/src/postal-address-page";
import { isPostalAddressBlockRecipient } from "../../../packages/contracts/src/postal-recipient";
import { postalAddressRuleRoute } from "../../../packages/contracts/src/postal-destinations";
import {
  checkPingenAddress,
  PINGEN_MAX_BYTES,
  pingenLayout,
  preflightPingenPdf,
} from "../../../packages/contracts/src/pingen-preflight";
import { validatePdf } from "../../../packages/contracts/src/pdf";

type AddressPage = Pick<
  Page,
  | "setJavaScriptEnabled"
  | "setBypassServiceWorker"
  | "setRequestInterception"
  | "setOfflineMode"
  | "setDefaultTimeout"
  | "setContent"
  | "pdf"
> & {
  evaluate(callback: () => Promise<boolean>): Promise<boolean>;
  on(
    event: "request",
    callback: (request: Pick<HTTPRequest, "abort">) => void,
  ): unknown;
};
type AddressBrowser = {
  newPage(): Promise<AddressPage>;
  close(): Promise<void>;
};
export type PostalAddressPageDependencies = {
  launch: () => Promise<AddressBrowser>;
  /** Package-owned Liberation Sans, never selected or provided by the caller. */
  fontBase64: string;
  /** Test seam only. */
  deadlineMs?: number;
};
const A4 = [(210 * 72) / 25.4, (297 * 72) / 25.4] as [number, number];
const prefix = "POSTAL_ADDRESS_PAGE_";
const failures = new Set([
  "INPUT_INVALID",
  "PDF_SIZE",
  "HASH_MISMATCH",
  "SOURCE_UNSUPPORTED",
  "PAGE_LIMIT",
  "ADDRESS_INVALID",
  "GLYPH_UNSUPPORTED",
  "ADDRESS_TOO_LONG",
  "RENDER_TIMEOUT",
  "RENDER_FAILED",
]);
function fail(code: string, status: number) {
  return Response.json(
    { error: { code: prefix + code } },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
function stop(code: string): never {
  throw new Error(prefix + code);
}
function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char]!,
  );
}

async function readPdf(request: Request, signal: AbortSignal) {
  const stated = request.headers.get("Content-Length");
  if (stated && (!/^\d+$/.test(stated) || Number(stated) > PINGEN_MAX_BYTES))
    stop("PDF_SIZE");
  if (!request.body) stop("PDF_SIZE");
  const reader = request.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", cancel, { once: true });
  request.signal.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      if (signal.aborted || request.signal.aborted) stop("RENDER_TIMEOUT");
      const next = await reader.read();
      if (signal.aborted || request.signal.aborted) stop("RENDER_TIMEOUT");
      if (next.done) break;
      length += next.value.byteLength;
      if (length > PINGEN_MAX_BYTES) stop("PDF_SIZE");
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes;
  } finally {
    signal.removeEventListener("abort", cancel);
    request.signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** Read the pinned TrueType font's Unicode cmap, so a browser fallback cannot
 * silently replace missing glyphs. The supported font uses BMP format 4. */
export function addressFontSupports(
  fontBase64: string,
  lines: string[],
): boolean {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(fontBase64) || fontBase64.length > 350_000)
    return false;
  try {
    const binary = atob(fontBase64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    const tableCount = view.getUint16(4);
    if (tableCount > 128) return false;
    let cmap = -1;
    for (let index = 0; index < tableCount; index++) {
      const record = 12 + index * 16;
      if (view.getUint32(record) === 0x636d6170)
        cmap = view.getUint32(record + 8);
    }
    if (cmap < 0) return false;
    const count = view.getUint16(cmap + 2);
    if (count > 128) return false;
    let subtable = -1;
    for (let index = 0; index < count; index++) {
      const record = cmap + 4 + index * 8;
      const platform = view.getUint16(record),
        encoding = view.getUint16(record + 2);
      const offset = cmap + view.getUint32(record + 4);
      if (
        (platform === 0 || (platform === 3 && encoding === 1)) &&
        view.getUint16(offset) === 4
      )
        subtable = offset;
    }
    if (subtable < 0) return false;
    const segments = view.getUint16(subtable + 6) / 2;
    const end = subtable + 14,
      start = end + segments * 2 + 2;
    const delta = start + segments * 2,
      range = delta + segments * 2;
    if (!Number.isInteger(segments) || segments < 1 || segments > 8192)
      return false;
    for (const char of lines.join("")) {
      const code = char.codePointAt(0)!;
      if (code > 0xffff) return false;
      let glyph = 0;
      for (let segment = 0; segment < segments; segment++) {
        if (code > view.getUint16(end + segment * 2)) continue;
        const first = view.getUint16(start + segment * 2);
        if (code < first) break;
        const adjustment = view.getInt16(delta + segment * 2);
        const rangeOffset = view.getUint16(range + segment * 2);
        if (!rangeOffset) glyph = (code + adjustment) & 0xffff;
        else {
          glyph = view.getUint16(
            range + segment * 2 + rangeOffset + (code - first) * 2,
          );
          if (glyph) glyph = (glyph + adjustment) & 0xffff;
        }
        break;
      }
      if (!glyph) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function renderCover(
  page: AddressPage,
  lines: string[],
  layout: ReturnType<typeof pingenLayout>,
  fontBase64: string,
  compact: boolean,
  ruleRoute: ReturnType<typeof postalAddressRuleRoute>,
) {
  const box = layout.address;
  // This is a separate fixed layout for complete five/six-line blocks. It is
  // never selected by content width and never shrinks an address to make it fit.
  const fontSizePt = compact ? 10 : 11,
    lineHeightPt = compact ? 11.5 : 14,
    insetY = compact ? 0.5 : 2;
  const width = box.width - 4,
    height = box.height - insetY * 2;
  await page.setJavaScriptEnabled(false);
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    void request.abort("blockedbyclient");
  });
  await page.setOfflineMode(true);
  page.setDefaultTimeout(10_000);
  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'"><style>
    @font-face{font-family:GuteneoPostal;src:url(data:font/ttf;base64,${fontBase64}) format('truetype');font-style:normal;font-weight:400;font-display:block${compact ? ';font-feature-settings:"liga" 0,"clig" 0,"calt" 0' : ""}}
    @page{size:210mm 297mm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;width:210mm;height:297mm;background:white;color:black}
    #address{position:absolute;left:${box.x + 2}mm;top:${box.y + insetY}mm;width:${width}mm;height:${height}mm;font:400 ${fontSizePt}pt/${lineHeightPt}pt GuteneoPostal;letter-spacing:0;word-spacing:0;font-variant-ligatures:none}
    .line{display:block;width:max-content;white-space:pre;height:${lineHeightPt}pt;line-height:${lineHeightPt}pt}
    ${compact ? ".line{font-kerning:none}.baseline{display:inline-block;width:0;height:0;padding:0;margin:0;border:0;vertical-align:baseline}" : ""}
  </style></head><body><div id="address"${compact ? ` data-compact="true" data-rule-route="${ruleRoute}"` : ""}>${lines.map((line) => (compact ? `<div class="line"><span>${escapeHtml(line)}</span><i class="baseline"></i></div>` : `<div class="line">${escapeHtml(line)}</div>`)).join("")}</div></body></html>`,
    { waitUntil: "domcontentloaded", timeout: 10_000 },
  );
  const fits = await page.evaluate(async () => {
    await document.fonts.ready;
    const element = document.getElementById("address")!;
    const compact = element.dataset.compact === "true";
    if (!document.fonts.check(`${compact ? 10 : 11}pt GuteneoPostal`))
      return false;
    // The named face must actually be loaded, not a successful fallback check.
    const faces = Array.from(document.fonts.values());
    if (
      !faces.some(
        (face) => face.family === "GuteneoPostal" && face.status === "loaded",
      )
    )
      return false;
    const address = element.getBoundingClientRect();
    const lines = Array.from(document.querySelectorAll<HTMLElement>(".line"));
    if (
      !lines.every((line) => {
        const rect = line.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.left >= address.left &&
          rect.top >= address.top &&
          rect.right <= address.right + 0.1 &&
          rect.bottom <= address.bottom + 0.1
        );
      })
    )
      return false;
    if (!compact) return true;
    // Canvas metrics refer to the exact loaded face. Zero-size inline markers
    // locate actual CSS baselines without drawing or adding PDF text. Checking
    // each ink box catches combining marks/descenders that a line box can hide.
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return false;
    context.font = "400 10pt GuteneoPostal";
    context.fontKerning = "none";
    const mm = 25.4 / 96;
    const french = element.dataset.ruleRoute === "la_poste";
    const dhlOrGerman =
      element.dataset.ruleRoute === "dhl_international" ||
      element.dataset.ruleRoute === "deutsche_post";
    const capital = context.measureText("H");
    const capHeight =
      (capital.actualBoundingBoxAscent + capital.actualBoundingBoxDescent) * mm;
    if (
      !Number.isFinite(capHeight) ||
      capHeight <= 0 ||
      ((french || dhlOrGerman) &&
        (capHeight < (french ? 1.8 : 2.3) || capHeight > (french ? 5 : 4.7)))
    )
      return false;
    let previousBottom: number | undefined;
    for (const line of lines) {
      const baseline = line
        .querySelector(".baseline")
        ?.getBoundingClientRect().top;
      const metrics = context.measureText(line.textContent ?? "");
      const rect = line.getBoundingClientRect();
      if (
        baseline === undefined ||
        !Number.isFinite(baseline) ||
        !Number.isFinite(metrics.actualBoundingBoxAscent) ||
        !Number.isFinite(metrics.actualBoundingBoxDescent) ||
        !Number.isFinite(metrics.actualBoundingBoxLeft) ||
        !Number.isFinite(metrics.actualBoundingBoxRight) ||
        !Number.isFinite(metrics.width) ||
        Math.abs(metrics.width - rect.width) > 0.2
      )
        return false;
      const top = baseline - metrics.actualBoundingBoxAscent;
      const bottom = baseline + metrics.actualBoundingBoxDescent;
      const left = rect.left - metrics.actualBoundingBoxLeft;
      const right = rect.left + metrics.actualBoundingBoxRight;
      if (
        top < address.top - 0.1 ||
        bottom > address.bottom + 0.1 ||
        left < address.left - 0.1 ||
        right > address.right + 0.1
      )
        return false;
      if (previousBottom !== undefined) {
        const gap = (top - previousBottom) * mm;
        // Other local printers have distinct typography rules. Retain mandatory
        // visual/provider review instead of certifying them with DHL's values.
        if (
          gap < (french ? 1 : dhlOrGerman ? 0.5 : 0) ||
          ((french || dhlOrGerman) && gap > 2.5)
        )
          return false;
      }
      previousBottom = bottom;
    }
    return true;
  });
  if (!fits) stop("ADDRESS_TOO_LONG");
  return new Uint8Array(
    await page.pdf({
      format: "A4",
      preferCSSPageSize: true,
      printBackground: true,
      displayHeaderFooter: false,
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
      timeout: 10_000,
    }),
  );
}

/** Service binding only. The API proves current tenant access and the source
 * scan. This produces a new document; it never stores, transfers or sends it. */
export async function handlePostalAddressPage(
  request: Request,
  deps: PostalAddressPageDependencies,
): Promise<Response> {
  if (
    request.method !== "POST" ||
    new URL(request.url).pathname !== "/postal-address-page"
  )
    return new Response("Not found", { status: 404 });
  const sourceHash = request.headers.get("X-Guteneo-Source-Sha256");
  const metadata = request.headers.get("X-Guteneo-Postal-Address-Page") ?? "";
  if (
    request.headers.get("Content-Type") !== "application/pdf" ||
    !sourceHash ||
    !/^[a-f0-9]{64}$/.test(sourceHash) ||
    request.headers.get("X-Guteneo-Scan-Sha256") !== sourceHash ||
    metadata.length > 8192
  )
    return fail("INPUT_INVALID", 400);
  let input: ReturnType<typeof postalAddressPageRenderInputSchema.parse>;
  try {
    input = postalAddressPageRenderInputSchema.parse(
      JSON.parse(decodeURIComponent(metadata)),
    );
  } catch {
    return fail("INPUT_INVALID", 400);
  }
  const options = {
    ...input,
    country: input.recipient.country,
    printSpectrum: "grayscale" as const,
    deliveryProduct: "cheap" as const,
  };
  // Do not spread private composition fields into the strict layout contract.
  const postalOptions = {
    defaultCountry: options.defaultCountry,
    country: options.country,
    addressPosition: options.addressPosition,
    printMode: options.printMode,
    printSpectrum: options.printSpectrum,
    deliveryProduct: options.deliveryProduct,
    ...(isPostalAddressBlockRecipient(input.recipient)
      ? { addressFormat: "address_block" as const }
      : {}),
  };
  let browser: AddressBrowser | undefined;
  const cancellation = new AbortController();
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      expired = true;
      cancellation.abort();
      if (browser) void browser.close().catch(() => undefined);
      reject(new Error(prefix + "RENDER_TIMEOUT"));
    }, deps.deadlineMs ?? 25_000);
  });
  try {
    return await Promise.race([
      deadline,
      (async () => {
        const bytes = await readPdf(request, cancellation.signal);
        const structural = await preflightPingenPdf(bytes, postalOptions);
        if (structural.sha256 && structural.sha256 !== sourceHash)
          stop("HASH_MISMATCH");
        if (
          structural.status === "blocked" ||
          !structural.layout ||
          structural.pages === null
        )
          stop("SOURCE_UNSUPPORTED");
        const addedPages = input.printMode === "duplex" ? 2 : 1;
        if (structural.pages + addedPages > 100) stop("PAGE_LIMIT");
        const original = await PDFDocument.load(bytes, {
          updateMetadata: false,
          throwOnInvalidObject: true,
        });
        if (original.catalog.has(PDFName.of("OCProperties")))
          stop("SOURCE_UNSUPPORTED");
        const lines = postalAddressLines(input.recipient, input.defaultCountry);
        if (checkPingenAddress(lines, postalOptions).length)
          stop("ADDRESS_INVALID");
        if (!addressFontSupports(deps.fontBase64, lines))
          stop("GLYPH_UNSUPPORTED");
        if (expired) stop("RENDER_TIMEOUT");
        browser = await deps.launch();
        if (expired) {
          await browser.close();
          stop("RENDER_TIMEOUT");
        }
        const coverBytes = await renderCover(
          await browser.newPage(),
          lines,
          structural.layout,
          deps.fontBase64,
          isPostalAddressBlockRecipient(input.recipient) && lines.length > 4,
          postalAddressRuleRoute(input.recipient.country, input.defaultCountry),
        );
        const cover = await PDFDocument.load(coverBytes, {
          updateMetadata: false,
          throwOnInvalidObject: true,
        });
        if (cover.getPageCount() !== 1) stop("RENDER_FAILED");
        const result = await PDFDocument.create();
        result.setProducer("Guteneo postal address page");
        const [coverPage] = await result.copyPages(cover, [0]);
        result.addPage(coverPage);
        if (addedPages === 2) result.addPage(A4);
        for (const page of await result.copyPages(
          original,
          original.getPageIndices(),
        ))
          result.addPage(page);
        const output = new Uint8Array(
          await result.save({
            addDefaultPage: false,
            updateFieldAppearances: false,
          }),
        );
        if (output.byteLength > PINGEN_MAX_BYTES) stop("PDF_SIZE");
        const checked = await validatePdf(output);
        const finalStructure = await preflightPingenPdf(output, postalOptions);
        if (
          finalStructure.status === "blocked" ||
          checked.pages !== structural.pages + addedPages
        )
          stop("RENDER_FAILED");
        if (expired || request.signal.aborted) stop("RENDER_TIMEOUT");
        return new Response(output, {
          headers: {
            "Content-Type": "application/pdf",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "X-Guteneo-Source-Sha256": sourceHash,
            "X-Guteneo-Document-Sha256": checked.sha256,
            "X-Guteneo-Document-Pages": String(checked.pages),
            "X-Guteneo-Added-Pages": String(addedPages),
            "X-Guteneo-Postal-Address-Page-Version": postalAddressPageVersion(
              input.recipient,
            ),
          },
        });
      })(),
    ]);
  } catch (error) {
    const suffix =
      error instanceof Error && error.message.startsWith(prefix)
        ? error.message.slice(prefix.length)
        : "RENDER_FAILED";
    const code = failures.has(suffix) ? suffix : "RENDER_FAILED";
    return fail(code, code === "PDF_SIZE" ? 413 : 422);
  } finally {
    if (timer) clearTimeout(timer);
    cancellation.abort();
    if (browser) await browser.close().catch(() => undefined);
  }
}
