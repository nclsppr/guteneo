import type { PDFDocumentProxy } from "pdfjs-dist";
import type { ReviewPages } from "../../../packages/contracts/src/expert-review";

export type ExpertReviewPage = ReviewPages["pages"][number];

type BrowserState = typeof globalThis & {
  pdfjsLib: typeof import("pdfjs-dist");
  guteneoPdf?: PDFDocumentProxy;
  guteneoRenderWarning?: boolean;
};

/** Executes in the same isolated PDF.js page as openPostalPdf. Source bytes
 * are never modified; this is a bounded view of one complete original page.
 * Extracted text is the PDF text layer, not OCR or proof of visible text. */
export async function renderExpertReviewPage(input: {
  page: number;
  maxEdge: number;
  maxPixels: number;
  maxImageCharacters: number;
  maxTextCharacters: number;
}): Promise<ExpertReviewPage> {
  const state = globalThis as BrowserState;
  if (!state.guteneoPdf) throw new Error("PDF_NOT_OPEN");
  const page = await state.guteneoPdf.getPage(input.page);
  const canvas = document.createElement("canvas");
  try {
    // Reject annotations instead of silently omitting comments, signatures or
    // form appearances. Structural rejection also covers unrequested pages.
    if ((await page.getAnnotations()).length) throw new Error("ANNOTATIONS");
    const natural = page.getViewport({ scale: 1 });
    if (
      !Number.isFinite(natural.width) ||
      !Number.isFinite(natural.height) ||
      natural.width <= 0 ||
      natural.height <= 0
    )
      throw new Error("PAGE_SIZE");
    const scale = Math.min(
      2,
      input.maxEdge / Math.max(natural.width, natural.height),
      Math.sqrt(
        (input.maxPixels - input.maxEdge * 2 - 1) /
          (natural.width * natural.height),
      ),
    );
    const viewport = page.getViewport({ scale });
    const width = Math.ceil(viewport.width),
      height = Math.ceil(viewport.height);
    if (
      width < 1 ||
      height < 1 ||
      width > input.maxEdge ||
      height > input.maxEdge ||
      width * height > input.maxPixels
    )
      throw new Error("PAGE_SIZE");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("CANVAS_UNAVAILABLE");
    await page.render({
      canvas,
      canvasContext: context,
      viewport,
      intent: "print",
      annotationMode: state.pdfjsLib.AnnotationMode.DISABLE,
      background: "rgb(255,255,255)",
    }).promise;
    if (state.guteneoRenderWarning) throw new Error("PDF_RENDER_WARNING");
    let imageBase64 = "";
    // A small fixed encoding budget keeps dense pages within the MCP envelope
    // while preserving the full canvas dimensions and every rendered region.
    for (const quality of [0.85, 0.72, 0.6]) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (!dataUrl.startsWith("data:image/jpeg;base64,"))
        throw new Error("IMAGE_TYPE");
      imageBase64 = dataUrl.slice("data:image/jpeg;base64,".length);
      if (imageBase64.length <= input.maxImageCharacters) break;
    }
    if (!imageBase64.length || imageBase64.length > input.maxImageCharacters)
      throw new Error("REVIEW_RESULT_SIZE");
    const binary = atob(imageBase64);
    const encoded = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++)
      encoded[index] = binary.charCodeAt(index);
    const imageSha256 = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", encoded)),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
    const reader = page
      .streamTextContent({ disableNormalization: true })
      .getReader();
    let text = "",
      textTruncated = false,
      entries = 0;
    try {
      textLoop: for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        for (const entry of chunk.value.items) {
          if (++entries > 20_000) {
            textTruncated = true;
            break textLoop;
          }
          if (!("str" in entry)) continue;
          const value = entry.str + (entry.hasEOL ? "\n" : " ");
          const remaining = input.maxTextCharacters - text.length;
          if (value.length > remaining) {
            text += value.slice(0, remaining);
            textTruncated = true;
            break textLoop;
          }
          text += value;
        }
      }
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    if (state.guteneoRenderWarning) throw new Error("PDF_RENDER_WARNING");
    return {
      page: input.page,
      width,
      height,
      mimeType: "image/jpeg",
      imageBase64,
      imageSha256,
      text: text.trimEnd(),
      textTruncated,
    };
  } finally {
    canvas.width = canvas.height = 0;
    page.cleanup();
  }
}
