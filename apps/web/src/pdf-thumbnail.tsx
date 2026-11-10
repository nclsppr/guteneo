import { useEffect, useRef } from "react";
import { getDocumentContent } from "./api";
import { openGuardedPdf } from "./pdf-viewer";

const WIDTH = 44;

/**
 * First page of an exact PDF, drawn small. A thumbnail is decoration: a
 * failure leaves the glyph behind it in place and reports nothing. It goes
 * through the same guarded loader as the viewer and keeps nothing after
 * unmount.
 */
export default function PdfThumbnail({ id }: { id: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    let closed = false;
    let loading: Awaited<ReturnType<typeof openGuardedPdf>> | undefined;
    void (async () => {
      const bytes = await getDocumentContent(id, controller.signal);
      if (closed) return;
      loading = await openGuardedPdf(bytes);
      const pdf = await loading.promise;
      const page = await pdf.getPage(1);
      const element = canvas.current;
      if (closed || !element) return;
      const original = page.getViewport({ scale: 1 });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({
        scale: (WIDTH * ratio) / original.width,
      });
      element.width = Math.ceil(viewport.width);
      element.height = Math.ceil(viewport.height);
      const context = element.getContext("2d", { alpha: false });
      if (!context) return;
      await page.render({
        canvas: element,
        canvasContext: context,
        viewport,
        background: "#ffffff",
      }).promise;
      if (!closed) element.dataset.drawn = "";
    })()
      .catch(() => undefined)
      .finally(() => void loading?.destroy());
    return () => {
      closed = true;
      controller.abort();
    };
  }, [id]);
  return <canvas ref={canvas} />;
}
