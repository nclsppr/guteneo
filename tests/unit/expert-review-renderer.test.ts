import { describe, expect, it, vi } from "vitest";
import { PDFDocument, PDFName } from "pdf-lib";
import {
  EXPERT_REVIEW_LIMITS,
  handleExpertReviewPages,
  type ExpertReviewBrowser,
} from "../../apps/documents/src/expert-review";
import { LIMITS } from "../../packages/contracts/src/content";
import { validatePdf } from "../../packages/contracts/src/pdf";

async function pdf(edit?: (doc: PDFDocument) => void | Promise<void>) {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  await edit?.(doc);
  return new Uint8Array(await doc.save());
}
async function request(
  bytes: Uint8Array<ArrayBuffer>,
  query = "",
  headers: Record<string, string> = {},
) {
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  return new Request(`https://documents.internal/review-pages${query}`, {
    method: "POST",
    body: bytes,
    headers: {
      "Content-Type": "application/pdf",
      "X-Guteneo-Source-Sha256": hash,
      "X-Guteneo-Scan-Sha256": hash,
      ...headers,
    },
  });
}
const dependencies = () => ({
  launch: vi.fn(async () => {
    throw new Error("must not launch");
  }),
  scripts: { pdf: "", worker: "" },
});

describe("Private immutable PDF review boundary", () => {
  it("requires a matching scan assertion and exact PDF content type before processing", async () => {
    const bytes = await pdf();
    for (const headers of [
      { "X-Guteneo-Scan-Sha256": "" },
      { "X-Guteneo-Scan-Sha256": "b".repeat(64) },
      { "Content-Type": "text/plain" },
    ] as Record<string, string>[]) {
      const deps = dependencies();
      const result = await handleExpertReviewPages(
        await request(bytes, "", headers),
        deps,
      );
      expect(result.status).toBe(400);
      expect(await result.json()).toEqual({
        error: { code: "REVIEW_INPUT_INVALID" },
      });
      expect(result.headers.get("Cache-Control")).toBe("no-store");
      expect(deps.launch).not.toHaveBeenCalled();
    }
  });
  it.each([
    "?startPage=0",
    "?startPage=-1",
    "?startPage=1.5",
    "?startPage=2",
    "?pageCount=0",
    "?pageCount=4",
    "?pageCount=2",
    "?pageCount=01",
    "?startPage=1&startPage=1",
    "?pageCount=1&pageCount=1",
    "?url=https://private.invalid",
    "?dpi=300",
  ])(
    "rejects invalid or out-of-document range %s without launching",
    async (query) => {
      const deps = dependencies();
      const result = await handleExpertReviewPages(
        await request(await pdf(), query),
        deps,
      );
      expect(result.status).toBe(400);
      expect(await result.json()).toEqual({
        error: { code: "REVIEW_PAGE_RANGE" },
      });
      expect(deps.launch).not.toHaveBeenCalled();
    },
  );
  it("recomputes original byte identity before launching the engine", async () => {
    const deps = dependencies();
    const result = await handleExpertReviewPages(
      await request(await pdf(), "", {
        "X-Guteneo-Source-Sha256": "a".repeat(64),
        "X-Guteneo-Scan-Sha256": "a".repeat(64),
      }),
      deps,
    );
    expect(await result.json()).toEqual({
      error: { code: "REVIEW_HASH_MISMATCH" },
    });
    expect(deps.launch).not.toHaveBeenCalled();
  });
  it("bounds body bytes even with absent or false Content-Length and never echoes a parser failure", async () => {
    for (const headers of [{}, { "Content-Length": "1" }] as Record<
      string,
      string
    >[]) {
      const deps = dependencies();
      const result = await handleExpertReviewPages(
        await request(new Uint8Array(LIMITS.pdfBytes + 1), "", headers),
        deps,
      );
      expect(result.status).toBe(413);
      expect(await result.json()).toEqual({
        error: { code: "REVIEW_PDF_SIZE" },
      });
      expect(deps.launch).not.toHaveBeenCalled();
    }
    for (const bytes of [
      new TextEncoder().encode("PRIVATE NOT PDF CONTENT MUST NEVER LEAK"),
      (await pdf()).slice(0, 100),
    ]) {
      const deps = dependencies();
      const result = await handleExpertReviewPages(await request(bytes), deps);
      expect(result.status).toBe(422);
      expect(await result.json()).toEqual({
        error: { code: "REVIEW_PDF_INVALID" },
      });
      expect(deps.launch).not.toHaveBeenCalled();
    }
  });
  it.each(["form", "annotation", "optional-content", "active-content"])(
    "rejects %s instead of removing source content",
    async (kind) => {
      const bytes = await pdf((doc) => {
        if (kind === "form")
          doc.getForm().createTextField("synthetic").addToPage(doc.getPage(0));
        if (kind === "annotation")
          doc
            .getPage(0)
            .node.set(
              PDFName.of("Annots"),
              doc.context.obj([
                { Type: "Annot", Subtype: "Text", Rect: [10, 10, 20, 20] },
              ]),
            );
        if (kind === "optional-content")
          doc.catalog.set(
            PDFName.of("OCProperties"),
            doc.context.obj({ OCGs: [] }),
          );
        if (kind === "active-content")
          doc.catalog.set(
            PDFName.of("OpenAction"),
            doc.context.obj({ S: "JavaScript", JS: "private content" }),
          );
      });
      const original = bytes.slice();
      const deps = dependencies();
      const result = await handleExpertReviewPages(await request(bytes), deps);
      expect(result.status).toBe(422);
      expect(await result.json()).toEqual({
        error: {
          code:
            kind === "active-content"
              ? "REVIEW_PDF_INVALID"
              : "REVIEW_UNSUPPORTED_CONTENT",
        },
      });
      expect(bytes).toEqual(original);
      expect(deps.launch).not.toHaveBeenCalled();
    },
  );
  it("rejects image decompression budgets on any page, including an unrequested page", async () => {
    const bytes = await pdf((doc) => {
      const later = doc.addPage([595, 842]);
      const stream = doc.context.stream(new Uint8Array([0]), {
        Type: "XObject",
        Subtype: "Image",
        Width: 100_000,
        Height: 100_000,
        BitsPerComponent: 8,
        ColorSpace: "DeviceRGB",
      });
      later.node.set(
        PDFName.of("Resources"),
        doc.context.obj({ XObject: { Im1: doc.context.register(stream) } }),
      );
    });
    const deps = dependencies();
    const result = await handleExpertReviewPages(await request(bytes), deps);
    expect(result.status).toBe(422);
    expect(await result.json()).toEqual({
      error: { code: "REVIEW_IMAGE_BUDGET" },
    });
    expect(deps.launch).not.toHaveBeenCalled();
  });
  it("cancels an unfinished request body on timeout", async () => {
    const base = await request(await pdf());
    const cancel = vi.fn();
    const input = new Request(base, {
      body: new ReadableStream({ cancel }),
      duplex: "half",
    } as RequestInit);
    const deps = dependencies();
    const result = await handleExpertReviewPages(input, {
      ...deps,
      deadlineMs: 10,
    });
    expect(result.status).toBe(504);
    expect(await result.json()).toEqual({
      error: { code: "REVIEW_RENDER_TIMEOUT" },
    });
    expect(cancel).toHaveBeenCalled();
    expect(deps.launch).not.toHaveBeenCalled();
  });
  it("does not treat a wrong method or route as a review", async () => {
    const deps = dependencies();
    expect(
      (
        await handleExpertReviewPages(
          new Request("https://documents.internal/review-pages"),
          deps,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await handleExpertReviewPages(
          new Request("https://documents.internal/other", { method: "POST" }),
          deps,
        )
      ).status,
    ).toBe(404);
    expect(deps.launch).not.toHaveBeenCalled();
  });
  it("rejects an invalid engine result and never includes partial pages or private diagnostics", async () => {
    const bytes = await pdf();
    const hash = (await validatePdf(bytes)).sha256;
    const evaluate = vi.fn().mockImplementation(async (fn: { name: string }) =>
      fn.name === "openPostalPdf"
        ? { sha256: hash, pages: 1 }
        : {
            page: 1,
            width: EXPERT_REVIEW_LIMITS.maxEdge + 1,
            height: 100,
            mimeType: "image/jpeg",
            imageBase64: "PRIVATE",
            imageSha256: hash,
            text: "PRIVATE EXTRACTED TEXT",
            textTruncated: false,
          },
    );
    const close = vi.fn(async () => undefined);
    const browser: ExpertReviewBrowser = {
      close,
      async newPage() {
        return {
          setDefaultTimeout() {},
          async setBypassServiceWorker() {},
          async setRequestInterception() {},
          on() {},
          async setOfflineMode() {},
          async goto() {},
          async addScriptTag() {},
          evaluate,
        };
      },
    };
    const result = await handleExpertReviewPages(await request(bytes), {
      launch: async () => browser,
      scripts: { pdf: "", worker: "" },
    });
    expect(result.status).toBe(422);
    expect(await result.json()).toEqual({
      error: { code: "REVIEW_RENDER_FAILED" },
    });
    expect(close).toHaveBeenCalled();
  });
});
