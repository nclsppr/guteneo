import { generate } from "@pdfme/generator";
import { getDynamicTemplate } from "@pdfme/common";
import { getDynamicLayoutForSchema } from "@pdfme/schemas/dynamicLayout";
import {
  prepareTemplateRender,
  type TemplateEnvelope,
} from "../../../packages/contracts/src/templates";
import {
  templateFonts,
  templatePlugins,
} from "../../../packages/templates/pdfme";
import { openGuardedPdf } from "./pdf-viewer";

import {
  TEMPLATE_THUMBNAIL_LIMITS,
  templateThumbnailWithinLimits,
} from "./template-thumbnail-limits";

/** Tighter than generation limits: complex templates keep a quiet file glyph. */
export async function renderTemplateThumbnail(
  envelope: TemplateEnvelope,
  current: () => boolean,
): Promise<Blob | null> {
  if (!current() || !templateThumbnailWithinLimits(envelope)) return null;
  // Existing validation rejects external resources and uses embedded fonts.
  const prepared = prepareTemplateRender(envelope, envelope.sampleData);
  if (!current()) return null;
  const layout = await getDynamicTemplate({
    template: prepared.template,
    input: prepared.inputs[0],
    options: { font: templateFonts },
    _cache: new Map(),
    getDynamicHeights: getDynamicLayoutForSchema,
  });
  if (
    !current() ||
    layout.schemas.length > TEMPLATE_THUMBNAIL_LIMITS.outputPages
  )
    return null;
  const bytes = await generate({
    template: prepared.template,
    inputs: prepared.inputs,
    options: { font: templateFonts },
    plugins: templatePlugins,
  });
  if (!current() || bytes.length > TEMPLATE_THUMBNAIL_LIMITS.pdfBytes)
    return null;
  let loading: Awaited<ReturnType<typeof openGuardedPdf>> | undefined;
  try {
    loading = await openGuardedPdf(bytes);
    if (!current()) return null;
    const pdf = await loading.promise;
    if (!current()) return null;
    const page = await pdf.getPage(1);
    if (!current()) return null;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = 56 * ratio;
    const original = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: width / original.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context || !current()) return null;
    await page.render({
      canvas,
      canvasContext: context,
      viewport,
      background: "#ffffff",
    }).promise;
    if (!current()) return null;
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
  } finally {
    await loading?.destroy();
  }
}
