import { useEffect, useState } from "react";
import { getDocumentContent } from "./api";
import { openGuardedPdf } from "./pdf-viewer";

const WIDTH = 44;

/**
 * First page of an exact PDF, drawn small. A thumbnail is decoration: a
 * failure leaves the glyph behind it in place and reports nothing. It goes
 * through the same guarded loader as the viewer, draws off screen and shows
 * an image, so the page keeps one PDF canvas: the viewer's. The image address
 * is revoked on unmount and nothing else is kept.
 */
export default function PdfThumbnail({ id }: { id: string }) {
  const [source, setSource] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    let closed = false;
    let address: string | undefined;
    let loading: Awaited<ReturnType<typeof openGuardedPdf>> | undefined;
    void (async () => {
      const bytes = await getDocumentContent(id, controller.signal);
      if (closed) return;
      loading = await openGuardedPdf(bytes);
      const pdf = await loading.promise;
      const page = await pdf.getPage(1);
      if (closed) return;
      const original = page.getViewport({ scale: 1 });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({
        scale: (WIDTH * ratio) / original.width,
      });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) return;
      await page.render({
        canvas,
        canvasContext: context,
        viewport,
        background: "#ffffff",
      }).promise;
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (closed || !blob) return;
      address = URL.createObjectURL(blob);
      setSource(address);
    })()
      .catch(() => undefined)
      .finally(() => void loading?.destroy());
    return () => {
      closed = true;
      controller.abort();
      if (address) URL.revokeObjectURL(address);
    };
  }, [id]);
  return source ? <img src={source} alt="" /> : null;
}
