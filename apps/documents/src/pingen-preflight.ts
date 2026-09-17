import type { HTTPRequest } from "@cloudflare/puppeteer";
import { PDFDocument, PDFName, PDFNumber, PDFStream } from "pdf-lib";
import {
  checkPingenAddress,
  checkPingenRaster,
  preflightPingenPdf,
  PINGEN_MAX_BYTES,
  type PingenPreflightOptions,
  type PingenPreflightResult,
} from "../../../packages/contracts/src/pingen-preflight";
import {
  openPostalPdf,
  renderPostalPage,
  POSTAL_DPI,
  POSTAL_MAX_PIXELS,
  type PostalPageEvidence,
} from "./pingen-browser";

export const POSTAL_PREFLIGHT_DEADLINE_MS = 25_000;
type PostalPage = {
  setDefaultTimeout(ms: number): void;
  setBypassServiceWorker(value: boolean): Promise<void>;
  setRequestInterception(value: boolean): Promise<void>;
  on(
    event: "request",
    listener: (
      request: Pick<
        HTTPRequest,
        "isNavigationRequest" | "method" | "url" | "respond" | "abort"
      >,
    ) => void,
  ): unknown;
  setOfflineMode(value: boolean): Promise<void>;
  goto(
    url: string,
    options: { timeout: number; waitUntil: "domcontentloaded" },
  ): Promise<unknown>;
  addScriptTag(options: { content: string; type: string }): Promise<unknown>;
  evaluate: {
    (
      fn: typeof openPostalPdf,
      input: Parameters<typeof openPostalPdf>[0],
    ): ReturnType<typeof openPostalPdf>;
    (
      fn: typeof renderPostalPage,
      input: Parameters<typeof renderPostalPage>[0],
    ): ReturnType<typeof renderPostalPage>;
  };
};
export type PostalBrowser = {
  newPage(): Promise<PostalPage>;
  close(): Promise<void>;
};
export type PostalPreflightDependencies = {
  launch: () => Promise<PostalBrowser>;
  scripts: { pdf: string; worker: string };
  /** Test seam only; the request cannot choose its own resource limits. */
  deadlineMs?: number;
};
export type PostalPreflightStage =
  | "read"
  | "structure"
  | "budget"
  | "launch"
  | "new_page"
  | "isolation"
  | "navigation"
  | "worker_script"
  | "pdf_script"
  | "open"
  | "open_library"
  | "open_worker"
  | "open_crypto"
  | "open_promise_resolvers"
  | "open_promise_try"
  | "open_map_insert"
  | "open_base64"
  | "render"
  | "raster"
  | "address";
export type PostalPreflightReport = PingenPreflightResult & {
  rendering: {
    dpi: 144;
    complete: boolean;
    pages: {
      page: number;
      width: number;
      height: number;
      rasterSha256: string;
    }[];
  };
  address: PostalPageEvidence["address"];
  /** Private, fixed-code failure location; never an engine message or PDF data. */
  diagnostic?: { stage: PostalPreflightStage };
};
const response = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
const failure = (code: string, status: number, stage?: PostalPreflightStage) =>
  response(
    {
      status: "blocked",
      canSend: false,
      issues: [{ code }],
      ...(stage ? { diagnostic: { stage } } : {}),
    },
    status,
  );

async function boundedPdf(
  request: Request,
  signal: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  const stated = request.headers.get("Content-Length");
  if (stated && (!/^\d+$/.test(stated) || Number(stated) > PINGEN_MAX_BYTES))
    throw new Error("POSTAL_PDF_SIZE");
  if (!request.body) throw new Error("POSTAL_PDF_SIZE");
  const reader = request.body.getReader();
  const abort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", abort, { once: true });
  request.signal.addEventListener("abort", abort, { once: true });
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (signal.aborted || request.signal.aborted)
        throw new Error("POSTAL_RENDER_TIMEOUT");
      if (chunk.done) break;
      length += chunk.value.length;
      if (length > PINGEN_MAX_BYTES) throw new Error("POSTAL_PDF_SIZE");
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes;
  } finally {
    await reader.cancel().catch(() => undefined);
    signal.removeEventListener("abort", abort);
    request.signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}
function encode(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}
function decode(base64: string) {
  // Avoid Uint8Array.from(string): its iterable may materialize millions of boxed
  // values and exceed a Worker's memory limit for a single 8 MiB RGBA page.
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}
async function renderBudget(bytes: Uint8Array): Promise<string | null> {
  const pdf = await PDFDocument.load(bytes, {
    updateMetadata: false,
    throwOnInvalidObject: true,
  });
  if (pdf.catalog.has(PDFName.of("OCProperties")))
    return "POSTAL_OPTIONAL_CONTENT_UNSUPPORTED";
  let imagePixels = 0;
  for (const [, object] of pdf.context.enumerateIndirectObjects()) {
    if (
      !(object instanceof PDFStream) ||
      object.dict.get(PDFName.of("Subtype"))?.toString() !== "/Image"
    )
      continue;
    const width = object.dict.lookup(PDFName.of("Width")),
      height = object.dict.lookup(PDFName.of("Height"));
    if (!(width instanceof PDFNumber) || !(height instanceof PDFNumber))
      return "POSTAL_IMAGE_BUDGET";
    const w = width.asNumber(),
      h = height.asNumber();
    if (
      !Number.isSafeInteger(w) ||
      !Number.isSafeInteger(h) ||
      w <= 0 ||
      h <= 0 ||
      w * h > 10_000_000 ||
      (imagePixels += w * h) > 20_000_000
    )
      return "POSTAL_IMAGE_BUDGET";
  }
  return null;
}

/** Private binding only. The calling API must independently establish tenant,
 * current authorization, immutable private bytes and a qualified matching scan.
 * Headers carry that caller's assertion, not a user-supplied approval token. */
export async function handlePingenPreflight(
  request: Request,
  deps: PostalPreflightDependencies,
): Promise<Response> {
  if (
    request.method !== "POST" ||
    new URL(request.url).pathname !== "/preflight/pingen"
  )
    return new Response("Not found", { status: 404 });
  const sourceHash = request.headers.get("X-Guteneo-Source-Sha256");
  const scanHash = request.headers.get("X-Guteneo-Scan-Sha256");
  const rawOptions = request.headers.get("X-Guteneo-Pingen-Options") ?? "";
  if (
    request.headers.get("Content-Type") !== "application/pdf" ||
    !sourceHash ||
    !/^[a-f0-9]{64}$/.test(sourceHash) ||
    scanHash !== sourceHash ||
    rawOptions.length > 512
  )
    return failure("POSTAL_PREFLIGHT_INPUT_INVALID", 400);
  let options: PingenPreflightOptions;
  try {
    options = JSON.parse(rawOptions);
  } catch {
    return failure("POSTAL_OPTIONS_INVALID", 400);
  }
  let browser: PostalBrowser | undefined;
  let report: PostalPreflightReport | undefined;
  let stage: PostalPreflightStage = "read";
  let expired = false;
  const cancellation = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      expired = true;
      cancellation.abort();
      // Closing the isolated engine interrupts PDF.js even if its own event loop
      // is blocked by hostile content. A late launch is closed below as well.
      if (browser) void browser.close().catch(() => undefined);
      reject(new Error("POSTAL_RENDER_TIMEOUT"));
    }, deps.deadlineMs ?? POSTAL_PREFLIGHT_DEADLINE_MS);
  });
  const run = async () => {
    const bytes = await boundedPdf(request, cancellation.signal);
    if (expired) throw new Error("POSTAL_RENDER_TIMEOUT");
    stage = "structure";
    const structural = await preflightPingenPdf(bytes, options);
    report = {
      ...structural,
      rendering: { dpi: POSTAL_DPI, complete: false, pages: [] },
      address: null,
    };
    if (structural.sha256 && structural.sha256 !== sourceHash) {
      report.status = "blocked";
      report.issues.push({ code: "POSTAL_RENDER_HASH_MISMATCH" });
    }
    if (report.status === "blocked" || !report.layout || !report.pages)
      return report;
    stage = "budget";
    const budgetIssue = await renderBudget(bytes);
    if (budgetIssue) {
      report.status = "blocked";
      report.issues.push({ code: budgetIssue });
      return report;
    }
    stage = "launch";
    browser = await deps.launch();
    if (expired) {
      await browser.close();
      throw new Error("POSTAL_RENDER_TIMEOUT");
    }
    stage = "new_page";
    const page = await browser.newPage();
    stage = "isolation";
    page.setDefaultTimeout(5_000);
    await page.setBypassServiceWorker(true);
    await page.setRequestInterception(true);
    const isolatedUrl = "https://guteneo-documents.invalid/preflight";
    const shell =
      "<!doctype html><meta charset=\"utf-8\"><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline'; font-src data: blob:; img-src data: blob:; connect-src 'none'; worker-src 'none'; style-src 'unsafe-inline'\">";
    page.on("request", (req) => {
      if (
        req.isNavigationRequest() &&
        req.method() === "GET" &&
        req.url() === isolatedUrl
      )
        void req
          .respond({ status: 200, contentType: "text/html", body: shell })
          .catch(() => undefined);
      else void req.abort("blockedbyclient").catch(() => undefined);
    });
    await page.setOfflineMode(true);
    // Intercepted synthetic HTTPS origin enables WebCrypto, without DNS/egress.
    stage = "navigation";
    await page.goto(isolatedUrl, {
      timeout: 5_000,
      waitUntil: "domcontentloaded",
    });
    // PDF.js detects the package-owned worker module and uses its in-page fake
    // worker. No remote script, web worker, font, image or CMap fetch is allowed.
    stage = "worker_script";
    await page.addScriptTag({ content: deps.scripts.worker, type: "module" });
    stage = "pdf_script";
    await page.addScriptTag({ content: deps.scripts.pdf, type: "module" });
    stage = "open";
    const loaded = await page.evaluate(openPostalPdf, {
      base64: encode(bytes),
      expectedPages: report.pages,
    });
    if (loaded.failure) {
      stage = loaded.failure;
      throw new Error("POSTAL_RENDER_FAILED");
    }
    if (loaded.sha256 !== sourceHash || loaded.pages !== report.pages)
      throw new Error("POSTAL_RENDER_HASH_MISMATCH");
    for (let number = 1; number <= report.pages; number++) {
      if (expired || request.signal.aborted)
        throw new Error("POSTAL_RENDER_TIMEOUT");
      stage = "render";
      const rendered = await page.evaluate(renderPostalPage, {
        page: number,
        address: report.layout.address,
        crop: report.layout.postage,
        dpi: POSTAL_DPI,
        maxPixels: POSTAL_MAX_PIXELS,
      });
      if (expired || request.signal.aborted)
        throw new Error("POSTAL_RENDER_TIMEOUT");
      if (
        rendered.page !== number ||
        rendered.width * rendered.height > POSTAL_MAX_PIXELS ||
        rendered.rgbaBase64.length > 11_200_000 ||
        !/^[a-f0-9]{64}$/.test(rendered.rasterSha256)
      )
        throw new Error("POSTAL_RENDER_INVALID");
      stage = "raster";
      const rgba = decode(rendered.rgbaBase64);
      report.issues.push(
        ...checkPingenRaster(
          {
            rgba,
            width: rendered.width,
            height: rendered.height,
            page: number,
            sourceSha256: loaded.sha256,
            expectedSha256: sourceHash,
          },
          options,
        ),
      );
      report.rendering.pages.push({
        page: number,
        width: rendered.width,
        height: rendered.height,
        rasterSha256: rendered.rasterSha256,
      });
      if (number === 1) {
        stage = "address";
        report.address = rendered.address;
        if (!report.address)
          throw new Error("POSTAL_ADDRESS_EXTRACTION_MISSING");
        report.issues.push(
          ...report.address.issues.map((code) => ({ code, page: 1 })),
          ...checkPingenAddress(report.address.lines, options).map((issue) => ({
            ...issue,
            page: 1,
          })),
        );
      }
      // Only bounded evidence and one crop survive the loop, never full rasters.
    }
    report.rendering.complete = report.rendering.pages.length === report.pages;
    report.status = report.issues.length ? "blocked" : "review_required";
    return report;
  };
  try {
    return response(await Promise.race([run(), deadline]));
  } catch (error) {
    const known =
      error instanceof Error &&
      [
        "POSTAL_PDF_SIZE",
        "POSTAL_RENDER_TIMEOUT",
        "POSTAL_RENDER_HASH_MISMATCH",
      ].includes(error.message)
        ? error.message
        : "POSTAL_RENDER_FAILED";
    if (report) {
      report.status = "blocked";
      report.rendering.complete = false;
      report.issues.push({ code: known });
      report.diagnostic = { stage };
      return response(report, 422);
    }
    return failure(known, known === "POSTAL_PDF_SIZE" ? 413 : 422, stage);
  } finally {
    if (timer) clearTimeout(timer);
    if (browser) {
      let closeTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          browser.close().catch(() => undefined),
          new Promise<void>((resolve) => {
            closeTimer = setTimeout(resolve, 2_000);
          }),
        ]);
      } finally {
        if (closeTimer) clearTimeout(closeTimer);
      }
    }
  }
}
