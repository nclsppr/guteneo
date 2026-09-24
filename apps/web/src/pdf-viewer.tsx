import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, WarningCircle } from "@phosphor-icons/react";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type PDFDocumentLoadingTask,
  type RenderTask,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { PDFDocument, PDFName, PDFNumber, PDFStream } from "pdf-lib";
import { fr as t } from "./i18n";
import { getDocumentContent } from "./api";

// Library and worker are bundled from the same pinned dependency; no CDN or
// document-controlled URL enters the renderer. The legacy build carries the
// polyfills for recent built-ins (for example Map.prototype.getOrInsertComputed)
// that the modern build calls directly: without them the exact-PDF preview
// fails on browsers that are only a few releases old. Canvas only: no PDF scripting,
// annotations, forms or XFA execution. The original bytes are never rewritten.
GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_IMAGE_PIXELS = 16_000_000;

async function preflightImageDimensions(bytes: Uint8Array) {
  // Inspect image dictionaries without decoding their pixel data. PDF.js can
  // silently omit an oversized XObject even with stopAtErrors, so its own cap
  // alone is insufficient to claim that the preview contains the whole page.
  const parsed = await PDFDocument.load(bytes, {
    ignoreEncryption: false,
    throwOnInvalidObject: true,
    updateMetadata: false,
  });
  for (const [, object] of parsed.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFStream)) continue;
    if (object.dict.lookup(PDFName.of("Subtype")) !== PDFName.of("Image"))
      continue;
    const width = object.dict.lookup(PDFName.of("Width"));
    const height = object.dict.lookup(PDFName.of("Height"));
    if (!(width instanceof PDFNumber) || !(height instanceof PDFNumber))
      throw new Error(t.documents.previewUnavailable);
    const w = width.asNumber();
    const h = height.asNumber();
    if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w < 1 || h < 1)
      throw new Error(t.documents.previewUnavailable);
    if (w > MAX_IMAGE_PIXELS / h)
      throw new Error("Image exceeded maximum allowed size");
  }
}

export default function PdfViewer({ id }: { id: string }) {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy>();
  const [pageNumber, setPageNumber] = useState(1);
  const [pageText, setPageText] = useState("");
  const [error, setError] = useState<Error>();
  const [rendering, setRendering] = useState(true);
  const [width, setWidth] = useState(560);

  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry)
        setWidth(
          Math.max(
            150,
            Math.min(900, Math.floor(entry.contentRect.width - 28)),
          ),
        );
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let loading: PDFDocumentLoadingTask | undefined;
    let closed = false;
    setDocument(undefined);
    setPageNumber(1);
    setError(undefined);
    setRendering(true);
    void (async () => {
      const bytes = await getDocumentContent(id, controller.signal);
      await preflightImageDimensions(bytes);
      if (closed) return;
      loading = getDocument({
        data: bytes,
        enableXfa: false,
        useWorkerFetch: false,
        useWasm: false,
        useSystemFonts: true,
        stopAtErrors: true,
        // A second resource bound, in addition to the explicit metadata check.
        // 16 MP accommodates an A4 scan at 300 dpi (roughly 8.7 MP).
        maxImageSize: MAX_IMAGE_PIXELS,
        disableAutoFetch: true,
        disableRange: true,
        disableStream: true,
        isOffscreenCanvasSupported: false,
      });
      const pdf = await loading.promise;
      if (!closed) setDocument(pdf);
    })().catch((failure: unknown) => {
      if (!closed) {
        setError(
          failure instanceof Error
            ? failure
            : new Error(t.documents.previewUnavailable),
        );
        setRendering(false);
      }
    });
    return () => {
      closed = true;
      controller.abort();
      void loading?.destroy();
    };
  }, [id]);

  useEffect(() => {
    if (!document || !canvas.current) return;
    let task: RenderTask | undefined;
    let cancelled = false;
    setRendering(true);
    setPageText("");
    setError(undefined);
    void (async () => {
      const page = await document.getPage(pageNumber);
      if (cancelled || !canvas.current) return;
      const original = page.getViewport({ scale: 1 });
      const cssScale = Math.min(width / original.width, 1200 / original.height);
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const safeScale = Math.min(
        cssScale * pixelRatio,
        Math.sqrt(4_000_000 / (original.width * original.height)),
      );
      const viewport = page.getViewport({ scale: safeScale });
      const element = canvas.current;
      element.width = Math.ceil(viewport.width);
      element.height = Math.ceil(viewport.height);
      element.style.width = `${original.width * cssScale}px`;
      element.style.height = `${original.height * cssScale}px`;
      const context = element.getContext("2d", { alpha: false });
      if (!context) throw new Error(t.documents.previewUnavailable);
      task = page.render({
        canvas: element,
        canvasContext: context,
        viewport,
        background: "#ffffff",
      });
      await task.promise;
      if (cancelled) return;
      const text = await page.getTextContent();
      if (!cancelled) {
        setPageText(
          text.items.map((item) => ("str" in item ? item.str : "")).join(" "),
        );
        setRendering(false);
      }
    })().catch((failure: unknown) => {
      if (!cancelled) {
        setError(
          failure instanceof Error
            ? failure
            : new Error(t.documents.previewUnavailable),
        );
        setRendering(false);
      }
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [document, pageNumber, width]);

  return (
    <div className="pdf-viewer">
      <div className="pdf-canvas-wrap" ref={container} aria-busy={rendering}>
        {rendering && (
          <p className="pdf-loading" role="status">
            {t.loading}
          </p>
        )}
        {error && (
          <div className="notice warning" role="alert">
            <WarningCircle size={20} />
            <p>
              {error.message.includes("Image exceeded maximum allowed size")
                ? t.documents.imageTooLarge
                : t.documents.previewUnavailable}
            </p>
          </div>
        )}
        <canvas
          ref={canvas}
          aria-label={`${t.preview} · ${t.documents.page} ${pageNumber}`}
          role="img"
          style={{ visibility: rendering || error ? "hidden" : "visible" }}
        />
        <p className="sr-only">{pageText}</p>
      </div>
      {document && (
        <div className="pdf-navigation">
          <button
            type="button"
            className="icon-link"
            disabled={pageNumber <= 1 || rendering}
            onClick={() => setPageNumber((p) => p - 1)}
            aria-label={t.documents.previousPage}
          >
            <ArrowLeft size={17} />
          </button>
          <span>
            {t.documents.page} {pageNumber} / {document.numPages}
          </span>
          <button
            type="button"
            className="icon-link"
            disabled={pageNumber >= document.numPages || rendering}
            onClick={() => setPageNumber((p) => p + 1)}
            aria-label={t.documents.nextPage}
          >
            <ArrowRight size={17} />
          </button>
        </div>
      )}
    </div>
  );
}
