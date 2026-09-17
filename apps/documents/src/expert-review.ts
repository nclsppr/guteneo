import type { HTTPRequest } from "@cloudflare/puppeteer";
import { PDFArray, PDFDocument, PDFName, PDFNumber, PDFStream } from "pdf-lib";
import { LIMITS } from "../../../packages/contracts/src/content";
import { validatePdf } from "../../../packages/contracts/src/pdf";
import {
  REVIEW_PAGE_BATCH,
  REVIEW_RESULT_BYTES,
  reviewPageSchema,
  type ReviewPages,
} from "../../../packages/contracts/src/expert-review";
import { openPostalPdf } from "./pingen-browser";
import {
  renderExpertReviewPage,
  type ExpertReviewPage,
} from "./expert-review-browser";

export const EXPERT_REVIEW_LIMITS = {
  pagesPerRequest: REVIEW_PAGE_BATCH,
  maxEdge: 1600,
  maxPixels: 2_100_000,
  maxImageCharacters: 350 * 1024,
  maxTextCharacters: 8000,
  responseBytes: REVIEW_RESULT_BYTES,
  deadlineMs: 25_000,
} as const;

type ReviewPage = {
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
      fn: typeof renderExpertReviewPage,
      input: Parameters<typeof renderExpertReviewPage>[0],
    ): ReturnType<typeof renderExpertReviewPage>;
  };
};
export type ExpertReviewBrowser = {
  newPage(): Promise<ReviewPage>;
  close(): Promise<void>;
};
export type ExpertReviewDependencies = {
  launch: () => Promise<ExpertReviewBrowser>;
  scripts: { pdf: string; worker: string; fonts: string };
  /** Test-only seam, never an HTTP input. */
  deadlineMs?: number;
};
export type ExpertReviewReport = ReviewPages;
const failure = (code: string, status: number) =>
  Response.json(
    { error: { code } },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
function encode(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}
async function boundedPdf(request: Request, signal: AbortSignal) {
  const stated = request.headers.get("Content-Length");
  if (stated && (!/^\d+$/.test(stated) || Number(stated) > LIMITS.pdfBytes))
    throw new Error("REVIEW_PDF_SIZE");
  if (!request.body) throw new Error("REVIEW_PDF_SIZE");
  const reader = request.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (signal.aborted) throw new Error("REVIEW_RENDER_TIMEOUT");
      if (chunk.done) break;
      length += chunk.value.length;
      if (length > LIMITS.pdfBytes) throw new Error("REVIEW_PDF_SIZE");
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
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
async function assertRenderable(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes, {
    updateMetadata: false,
    throwOnInvalidObject: true,
  });
  if (
    pdf.catalog.has(PDFName.of("AcroForm")) ||
    pdf.catalog.has(PDFName.of("OCProperties"))
  )
    throw new Error("REVIEW_UNSUPPORTED_CONTENT");
  for (const page of pdf.getPages()) {
    const annotations = page.node.lookup(PDFName.of("Annots"));
    if (
      annotations !== undefined &&
      (!(annotations instanceof PDFArray) || annotations.size() > 0)
    )
      throw new Error("REVIEW_UNSUPPORTED_CONTENT");
  }
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
      throw new Error("REVIEW_IMAGE_BUDGET");
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
      throw new Error("REVIEW_IMAGE_BUDGET");
  }
}
async function assertRendered(page: ExpertReviewPage, number: number) {
  if (
    !reviewPageSchema.safeParse(page).success ||
    page.page !== number ||
    page.width * page.height > EXPERT_REVIEW_LIMITS.maxPixels ||
    page.imageBase64.length % 4 !== 0
  )
    throw new Error("REVIEW_RENDER_FAILED");
  const binary = atob(page.imageBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++)
    bytes[index] = binary.charCodeAt(index);
  if (
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes.at(-2) !== 0xff ||
    bytes.at(-1) !== 0xd9
  )
    throw new Error("REVIEW_RENDER_FAILED");
  const actual = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  if (actual !== page.imageSha256) throw new Error("REVIEW_HASH_MISMATCH");
}

/** Private service binding only. The API owns tenant/authority checks and passes
 * immutable ready bytes with a matching qualified scan. These headers are its
 * assertion, never a public approval or a request to execute PDF actions. */
export async function handleExpertReviewPages(
  request: Request,
  deps: ExpertReviewDependencies,
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== "/review-pages")
    return new Response("Not found", { status: 404 });
  const sourceHash = request.headers.get("X-Guteneo-Source-Sha256");
  if (
    request.headers.get("Content-Type") !== "application/pdf" ||
    !sourceHash ||
    !/^[a-f0-9]{64}$/.test(sourceHash) ||
    request.headers.get("X-Guteneo-Scan-Sha256") !== sourceHash
  )
    return failure("REVIEW_INPUT_INVALID", 400);
  const start = url.searchParams.get("startPage") ?? "1",
    count = url.searchParams.get("pageCount") ?? "1";
  if (
    [...url.searchParams.keys()].some(
      (key) => !["startPage", "pageCount"].includes(key),
    ) ||
    url.searchParams.getAll("startPage").length > 1 ||
    url.searchParams.getAll("pageCount").length > 1 ||
    !/^[1-9]\d{0,2}$/.test(start) ||
    !/^[1-3]$/.test(count)
  )
    return failure("REVIEW_PAGE_RANGE", 400);
  const startPage = Number(start),
    pageCount = Number(count);
  if (startPage + pageCount - 1 > LIMITS.pages)
    return failure("REVIEW_PAGE_RANGE", 400);
  let browser: ExpertReviewBrowser | undefined;
  const cancellation = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectDeadline: (reason: Error) => void = () => undefined;
  const stop = () => {
    cancellation.abort();
    if (browser) void browser.close().catch(() => undefined);
    rejectDeadline(new Error("REVIEW_RENDER_TIMEOUT"));
  };
  const deadline = new Promise<never>((_, reject) => {
    rejectDeadline = reject;
    timer = setTimeout(
      stop,
      deps.deadlineMs ?? EXPERT_REVIEW_LIMITS.deadlineMs,
    );
  });
  request.signal.addEventListener("abort", stop, { once: true });
  const assertActive = () => {
    if (cancellation.signal.aborted || request.signal.aborted)
      throw new Error("REVIEW_RENDER_TIMEOUT");
  };
  const run = async (): Promise<ExpertReviewReport> => {
    assertActive();
    const bytes = await boundedPdf(request, cancellation.signal);
    assertActive();
    let structural: Awaited<ReturnType<typeof validatePdf>>;
    try {
      structural = await validatePdf(bytes);
    } catch {
      throw new Error("REVIEW_PDF_INVALID");
    }
    if (structural.sha256 !== sourceHash)
      throw new Error("REVIEW_HASH_MISMATCH");
    if (startPage + pageCount - 1 > structural.pages)
      throw new Error("REVIEW_PAGE_RANGE");
    await assertRenderable(bytes);
    assertActive();
    browser = await deps.launch();
    if (cancellation.signal.aborted || request.signal.aborted) {
      void browser.close().catch(() => undefined);
      throw new Error("REVIEW_RENDER_TIMEOUT");
    }
    const page = await browser.newPage();
    assertActive();
    page.setDefaultTimeout(5000);
    await page.setBypassServiceWorker(true);
    await page.setRequestInterception(true);
    const isolatedUrl = "https://guteneo-documents.invalid/review";
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
    await page.goto(isolatedUrl, {
      timeout: 5000,
      waitUntil: "domcontentloaded",
    });
    await page.addScriptTag({ content: deps.scripts.worker, type: "module" });
    await page.addScriptTag({ content: deps.scripts.pdf, type: "module" });
    await page.addScriptTag({ content: deps.scripts.fonts, type: "module" });
    assertActive();
    const loaded = await page.evaluate(openPostalPdf, {
      base64: encode(bytes),
      expectedPages: structural.pages,
    });
    if (loaded.failure) throw new Error("REVIEW_RENDER_FAILED");
    if (loaded.sha256 !== sourceHash || loaded.pages !== structural.pages)
      throw new Error("REVIEW_HASH_MISMATCH");
    const pages: ExpertReviewPage[] = [];
    for (let number = startPage; number < startPage + pageCount; number++) {
      assertActive();
      const rendered = await page.evaluate(renderExpertReviewPage, {
        page: number,
        ...EXPERT_REVIEW_LIMITS,
      });
      assertActive();
      await assertRendered(rendered, number);
      pages.push(rendered);
    }
    return {
      sha256: sourceHash,
      totalPages: structural.pages,
      startPage,
      pageCount,
      nextPage:
        startPage + pageCount > structural.pages ? null : startPage + pageCount,
      pages,
      rendering: { complete: true },
    };
  };
  try {
    const report = await Promise.race([run(), deadline]);
    const body = JSON.stringify(report);
    if (
      new TextEncoder().encode(body).byteLength >
      EXPERT_REVIEW_LIMITS.responseBytes
    )
      return failure("REVIEW_RESULT_SIZE", 413);
    return new Response(body, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const statuses: Record<string, number> = {
      REVIEW_PAGE_RANGE: 400,
      REVIEW_PDF_SIZE: 413,
      REVIEW_PDF_INVALID: 422,
      REVIEW_UNSUPPORTED_CONTENT: 422,
      REVIEW_IMAGE_BUDGET: 422,
      REVIEW_HASH_MISMATCH: 422,
      REVIEW_RENDER_TIMEOUT: 504,
      REVIEW_RESULT_SIZE: 413,
    };
    const code =
      error instanceof Error && Object.hasOwn(statuses, error.message)
        ? error.message
        : "REVIEW_RENDER_FAILED";
    return failure(code, statuses[code] ?? 422);
  } finally {
    if (timer) clearTimeout(timer);
    request.signal.removeEventListener("abort", stop);
    if (browser) {
      let closeTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          browser.close().catch(() => undefined),
          new Promise<void>((resolve) => {
            closeTimer = setTimeout(resolve, 2000);
          }),
        ]);
      } finally {
        if (closeTimer) clearTimeout(closeTimer);
      }
    }
  }
}
