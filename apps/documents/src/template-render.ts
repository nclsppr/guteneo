import type { HTTPRequest } from "@cloudflare/puppeteer";
import {
  prepareTemplateRender,
  TemplateError,
  TEMPLATE_LIMITS,
} from "../../../packages/contracts/src/templates";
import { validatePdf } from "../../../packages/contracts/src/pdf";
import type {
  BrowserTemplateInput,
  generateTemplatePdf,
} from "./template-browser";

type TemplatePage = {
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
  evaluate(
    fn: typeof runTemplateInBrowser,
    input: BrowserTemplateInput,
  ): ReturnType<typeof runTemplateInBrowser>;
};
export type TemplateBrowser = {
  newPage(): Promise<TemplatePage>;
  close(): Promise<void>;
};
export type TemplateRenderDependencies = {
  launch(): Promise<TemplateBrowser>;
  script: string;
  deadlineMs?: number;
};
// Explicit named function survives both Wrangler bundling and Puppeteer serialization.
export async function runTemplateInBrowser(input: BrowserTemplateInput) {
  return (
    globalThis as typeof globalThis & {
      guteneoTemplateRender: typeof generateTemplatePdf;
    }
  ).guteneoTemplateRender(input);
}
async function readBounded(
  request: Request,
  signal: AbortSignal,
): Promise<unknown> {
  const limit = TEMPLATE_LIMITS.bytes + TEMPLATE_LIMITS.inputBytes + 1024;
  if (
    Number(request.headers.get("Content-Length") ?? 0) > limit ||
    !request.body
  )
    throw new TemplateError(
      "TEMPLATE_REQUEST_LIMIT",
      "Requête trop volumineuse.",
    );
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = [];
  let length = 0;
  let abort = () => {};
  const aborted = new Promise<never>((_, reject) => {
    abort = () => reject(new Error("TEMPLATE_RENDER_TIMEOUT"));
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
  try {
    for (;;) {
      const next = await Promise.race([reader.read(), aborted]);
      if (next.done) break;
      length += next.value.length;
      if (length > limit)
        throw new TemplateError(
          "TEMPLATE_REQUEST_LIMIT",
          "Requête trop volumineuse.",
        );
      chunks.push(next.value);
    }
  } finally {
    await Promise.race([reader.cancel().catch(() => undefined), aborted]).catch(
      () => undefined,
    );
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(joined));
}
export async function handleTemplateRender(
  request: Request,
  deps: TemplateRenderDependencies,
): Promise<Response> {
  if (
    request.method !== "POST" ||
    new URL(request.url).pathname !== "/render/template"
  )
    return new Response("Not found", { status: 404 });
  let browser: TemplateBrowser | undefined,
    timer: ReturnType<typeof setTimeout> | undefined;
  let ended = false;
  const cancellation = new AbortController();
  let rejectDeadline: (reason: Error) => void = () => undefined;
  const stop = () => {
    ended = true;
    cancellation.abort();
    if (browser) void browser.close().catch(() => undefined);
    rejectDeadline(new Error("TEMPLATE_RENDER_TIMEOUT"));
  };
  const deadline = new Promise<never>((_, reject) => {
    rejectDeadline = reject;
    timer = setTimeout(stop, deps.deadlineMs ?? 25_000);
  });
  request.signal.addEventListener("abort", stop, { once: true });
  const run = async () => {
    if (request.signal.aborted) throw new Error("TEMPLATE_RENDER_TIMEOUT");
    const raw = (await readBounded(request, cancellation.signal)) as {
      envelope?: unknown;
      data?: unknown;
    };
    const prepared = prepareTemplateRender(raw.envelope, raw.data);
    browser = await deps.launch();
    if (ended) {
      await browser.close();
      throw new Error("TEMPLATE_RENDER_TIMEOUT");
    }
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    await page.setBypassServiceWorker(true);
    await page.setRequestInterception(true);
    const isolatedUrl = "https://guteneo-documents.invalid/template";
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
    await page.addScriptTag({ content: deps.script, type: "text/javascript" });
    const rendered = await page.evaluate(runTemplateInBrowser, {
      template: prepared.template,
      inputs: prepared.inputs,
    });
    if (rendered.base64.length > 14 * 1024 * 1024)
      throw new Error("TEMPLATE_PDF_LIMIT");
    const bytes = Uint8Array.from(atob(rendered.base64), (c) =>
      c.charCodeAt(0),
    );
    const verified = await validatePdf(bytes);
    if (verified.pages !== rendered.pages)
      throw new Error("TEMPLATE_PAGE_MISMATCH");
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Guteneo-Pages": String(verified.pages),
        "X-Guteneo-Sha256": verified.sha256,
        "X-Guteneo-Renderer": `pdfme/${prepared.metadata.engineVersion}; adapter/1`,
      },
    });
  };
  try {
    return await Promise.race([run(), deadline]);
  } catch (error) {
    const allowed = [
      "TEMPLATE_RENDER_TIMEOUT",
      "TEMPLATE_PAGE_LIMIT",
      "TEMPLATE_RENDER_OVERFLOW",
      "TEMPLATE_RENDER_OVERLAP",
      "TEMPLATE_PDF_LIMIT",
      "TEMPLATE_PAGE_MISMATCH",
      "TEMPLATE_GLYPH_UNSUPPORTED",
    ];
    const message = error instanceof Error ? error.message : "";
    const code =
      error instanceof TemplateError
        ? error.code
        : (allowed.find((name) => message.includes(name)) ??
          "TEMPLATE_RENDER_FAILED");
    return Response.json(
      {
        error: {
          code,
          message:
            error instanceof TemplateError
              ? error.message
              : code === "TEMPLATE_GLYPH_UNSUPPORTED"
                ? "Le texte contient un caractère absent de la police intégrée. Remplacez-le avant de générer le PDF."
                : "Le rendu du modèle a échoué. Vérifiez les blocs et leurs dimensions.",
          ...(error instanceof TemplateError ? { details: error.details } : {}),
        },
      },
      {
        status:
          code === "TEMPLATE_RENDER_TIMEOUT"
            ? 504
            : code.includes("LIMIT")
              ? 413
              : 422,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } finally {
    ended = true;
    if (timer) clearTimeout(timer);
    request.signal.removeEventListener("abort", stop);
    if (browser) {
      let closing: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          browser.close().catch(() => undefined),
          new Promise<void>((resolve) => {
            closing = setTimeout(resolve, 2000);
          }),
        ]);
      } finally {
        if (closing) clearTimeout(closing);
      }
    }
  }
}
