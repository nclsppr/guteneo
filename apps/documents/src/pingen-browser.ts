import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PingenRect } from "../../../packages/contracts/src/pingen-preflight";

export const POSTAL_DPI = 144;
export const POSTAL_MAX_PIXELS = 2_100_000;
export type AddressTextItem = {
  text: string;
  boundsMm: PingenRect;
  baselineMm: number;
  fontSizePt: number;
  geometry: "approximate";
};
export type PostalPageEvidence = {
  page: number;
  width: number;
  height: number;
  rgbaBase64: string;
  rasterSha256: string;
  address: null | {
    items: AddressTextItem[];
    lines: string[];
    issues: string[];
    textVisibility: "not_verified";
    crop: {
      pngBase64: string;
      width: number;
      height: number;
      boundsMm: PingenRect;
    };
  };
};

type BrowserState = typeof globalThis & {
  pdfjsLib: typeof import("pdfjs-dist");
  guteneoPdf?: PDFDocumentProxy;
  guteneoRenderWarning?: boolean;
};

// These functions execute inside a fresh isolated browser page. Only package-owned
// PDF.js runs as JavaScript; the source PDF is data and never executes its actions.
export async function openPostalPdf(input: {
  base64: string;
  expectedPages: number;
}) {
  const state = globalThis as BrowserState;
  // Fixed capability names only: never return an exception, document data or
  // user agent. The pinned PDF.js compatibility build supplies these browser APIs.
  if (typeof state.pdfjsLib?.getDocument !== "function")
    return { failure: "open_library" as const };
  if (
    typeof (state as unknown as { pdfjsWorker?: { WorkerMessageHandler?: unknown } })
      .pdfjsWorker?.WorkerMessageHandler !== "function"
  )
    return { failure: "open_worker" as const };
  if (typeof state.crypto?.subtle?.digest !== "function")
    return { failure: "open_crypto" as const };
  if (
    typeof (Promise as unknown as { withResolvers?: unknown }).withResolvers !==
    "function"
  )
    return { failure: "open_promise_resolvers" as const };
  if (typeof (Promise as unknown as { try?: unknown }).try !== "function")
    return { failure: "open_promise_try" as const };
  if (
    typeof (Map.prototype as unknown as { getOrInsertComputed?: unknown })
      .getOrInsertComputed !== "function"
  )
    return { failure: "open_map_insert" as const };
  if (
    typeof (Uint8Array as unknown as { fromBase64?: unknown }).fromBase64 !==
    "function"
  )
    return { failure: "open_base64" as const };
  state.guteneoRenderWarning = false;
  // PDF.js sometimes reports a skipped/undecodable image as a warning rather
  // than rejecting RenderTask. Such a page must never look falsely compliant.
  console.warn = (...args: unknown[]) => {
    if (args.length !== 1 || args[0] !== "Warning: Setting up fake worker.")
      state.guteneoRenderWarning = true;
  };
  console.error = () => {
    state.guteneoRenderWarning = true;
  };
  console.log = console.info = () => undefined;
  const binary = atob(input.base64);
  const data = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++)
    data[index] = binary.charCodeAt(index);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const sha256 = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  state.guteneoPdf = await state.pdfjsLib.getDocument({
    data,
    verbosity: 1,
    stopAtErrors: true,
    useSystemFonts: false,
    useWasm: false,
    isOffscreenCanvasSupported: false,
    maxImageSize: 10_000_000,
    canvasMaxAreaInBytes: 40_000_000,
    disableAutoFetch: true,
    disableStream: true,
    disableRange: true,
  }).promise;
  if (state.guteneoRenderWarning) throw new Error("PDF_RENDER_WARNING");
  if (state.guteneoPdf.numPages !== input.expectedPages)
    throw new Error("PAGE_COUNT_MISMATCH");
  return { sha256, pages: state.guteneoPdf.numPages };
}

export async function renderPostalPage(input: {
  page: number;
  address: PingenRect;
  crop: PingenRect;
  dpi: number;
  maxPixels: number;
}): Promise<PostalPageEvidence> {
  const state = globalThis as BrowserState;
  if (!state.guteneoPdf) throw new Error("PDF_NOT_OPEN");
  const page = await state.guteneoPdf.getPage(input.page);
  const canvas = document.createElement("canvas");
  const cropCanvas = document.createElement("canvas");
  try {
    const viewport = page.getViewport({ scale: input.dpi / 72 });
    const width = Math.ceil(viewport.width),
      height = Math.ceil(viewport.height);
    if (
      width < 1190 ||
      height < 1683 ||
      width * height > input.maxPixels ||
      Math.abs(width / height - 210 / 297) > 0.001
    )
      throw new Error("RENDER_SIZE");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", {
      alpha: false,
      willReadFrequently: true,
    });
    if (!context) throw new Error("CANVAS_UNAVAILABLE");
    // print intent includes printing content; forms/annotations were rejected by
    // structural preflight, and annotations are disabled defensively here too.
    await page.render({
      canvas,
      canvasContext: context,
      viewport,
      intent: "print",
      annotationMode: state.pdfjsLib.AnnotationMode.DISABLE,
      background: "rgb(255,255,255)",
    }).promise;
    const rgba = context.getImageData(0, 0, width, height).data;
    const hash = await crypto.subtle.digest("SHA-256", rgba);
    const rasterSha256 = Array.from(new Uint8Array(hash), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    let binary = "";
    for (let offset = 0; offset < rgba.length; offset += 8192)
      binary += String.fromCharCode(...rgba.subarray(offset, offset + 8192));
    const rgbaBase64 = btoa(binary);
    let address: PostalPageEvidence["address"] = null;
    if (input.page === 1) {
      const content = await page.getTextContent({ disableNormalization: true });
      if (content.items.length > 20_000) throw new Error("TEXT_LIMIT");
      const items: AddressTextItem[] = [];
      const issues = new Set<string>();
      let characters = 0;
      const mm = 25.4 / 72;
      for (const entry of content.items) {
        if (!("str" in entry) || !entry.str.trim()) continue;
        const item = entry;
        if ((characters += item.str.length) > 128_000)
          throw new Error("TEXT_LIMIT");
        if (
          item.transform.length !== 6 ||
          item.transform.some((n) => !Number.isFinite(n)) ||
          !Number.isFinite(item.width) ||
          item.width < 0
        )
          throw new Error("TEXT_GEOMETRY");
        // The structural check fixes A4/crop/rotation/user-unit. Text metrics are
        // approximate, not glyph outlines: retain that fact for the human review.
        const [a, b, c, d, x, y] = item.transform;
        const size = Math.hypot(a, b);
        const style = content.styles[item.fontName];
        const ascent = Number.isFinite(style?.ascent) ? style.ascent : 1;
        const descent = Number.isFinite(style?.descent) ? style.descent : -0.25;
        const boundsMm = {
          x: x * mm,
          y: 297 - (y + size * ascent) * mm,
          width: item.width * mm,
          height: size * (ascent - descent) * mm,
        };
        const r = input.address;
        if (
          boundsMm.x + boundsMm.width < r.x ||
          boundsMm.x > r.x + r.width ||
          boundsMm.y + boundsMm.height < r.y ||
          boundsMm.y > r.y + r.height
        )
          continue;
        if (items.length >= 200 || item.str.length > 1000)
          throw new Error("ADDRESS_TEXT_LIMIT");
        if (
          Math.abs(b) > 0.01 ||
          Math.abs(c) > 0.01 ||
          a <= 0 ||
          d <= 0 ||
          style?.vertical
        )
          issues.add("POSTAL_ADDRESS_TEXT_GEOMETRY_REVIEW");
        if (
          boundsMm.x < r.x ||
          boundsMm.y < r.y ||
          boundsMm.x + boundsMm.width > r.x + r.width ||
          boundsMm.y + boundsMm.height > r.y + r.height
        )
          issues.add("POSTAL_ADDRESS_TEXT_CLIPPED");
        items.push({
          text: item.str,
          boundsMm,
          baselineMm: 297 - y * mm,
          fontSizePt: size,
          geometry: "approximate",
        });
      }
      items.sort((a, b) =>
        Math.abs(a.baselineMm - b.baselineMm) < 0.5
          ? a.boundsMm.x - b.boundsMm.x
          : a.baselineMm - b.baselineMm,
      );
      const rows: { y: number; right: number; text: string }[] = [];
      for (const item of items) {
        const row = rows.at(-1);
        if (row && Math.abs(item.baselineMm - row.y) < 0.5) {
          if (item.boundsMm.x < row.right - 0.2)
            issues.add("POSTAL_ADDRESS_TEXT_OVERLAP");
          row.text +=
            (item.boundsMm.x - row.right > 0.5 ? " " : "") + item.text;
          row.right = item.boundsMm.x + item.boundsMm.width;
        } else
          rows.push({
            y: item.baselineMm,
            right: item.boundsMm.x + item.boundsMm.width,
            text: item.text,
          });
      }
      const x = Math.floor((input.crop.x * width) / 210),
        y = Math.floor((input.crop.y * height) / 297);
      cropCanvas.width = Math.ceil((input.crop.width * width) / 210);
      cropCanvas.height = Math.ceil((input.crop.height * height) / 297);
      cropCanvas
        .getContext("2d", { alpha: false })!
        .drawImage(
          canvas,
          x,
          y,
          cropCanvas.width,
          cropCanvas.height,
          0,
          0,
          cropCanvas.width,
          cropCanvas.height,
        );
      const pngBase64 = cropCanvas.toDataURL("image/png").split(",")[1];
      if (pngBase64.length > 1_000_000) throw new Error("CROP_LIMIT");
      address = {
        items,
        lines: rows.map((row) => row.text),
        issues: [...issues],
        textVisibility: "not_verified",
        crop: {
          pngBase64,
          width: cropCanvas.width,
          height: cropCanvas.height,
          boundsMm: input.crop,
        },
      };
    }
    if (state.guteneoRenderWarning) throw new Error("PDF_RENDER_WARNING");
    return {
      page: input.page,
      width,
      height,
      rgbaBase64,
      rasterSha256,
      address,
    };
  } finally {
    canvas.width = canvas.height = cropCanvas.width = cropCanvas.height = 0;
    page.cleanup();
  }
}
