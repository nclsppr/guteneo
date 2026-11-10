import {
  validateTemplateImage,
  type TemplateEnvelope,
} from "../../../packages/contracts/src/templates";

export const TEMPLATE_THUMBNAIL_LIMITS = {
  sourcePages: 3,
  blocks: 40,
  envelopeBytes: 128 * 1024,
  sampleBytes: 8 * 1024,
  sampleArrayEntries: 25,
  outputPages: 4,
  decodedImagePixels: 4_000_000,
  pdfBytes: 2 * 1024 * 1024,
} as const;

/** Inspect resource metadata before pdfme can lay out or decode an image. */
export function templateThumbnailWithinLimits(envelope: TemplateEnvelope) {
  try {
    const limit = TEMPLATE_THUMBNAIL_LIMITS;
    const encoder = new TextEncoder();
    if (
      encoder.encode(JSON.stringify(envelope)).length > limit.envelopeBytes ||
      encoder.encode(JSON.stringify(envelope.sampleData)).length >
        limit.sampleBytes ||
      envelope.definition.schemas.length > limit.sourcePages
    )
      return false;
    const blocks = [
      ...envelope.definition.schemas.flat(),
      ...(envelope.definition.basePdf.staticSchema ?? []),
    ];
    if (blocks.length > limit.blocks) return false;
    let pixels = 0;
    for (const block of blocks) {
      if (block.type !== "image") continue;
      const dimensions = validateTemplateImage(block.content ?? "");
      // Static content repeats; charge every image on every permitted page.
      pixels += dimensions.width * dimensions.height * limit.outputPages;
      if (pixels > limit.decodedImagePixels) return false;
    }
    const pending: unknown[] = [envelope.sampleData];
    let entries = 0;
    while (pending.length) {
      const item = pending.pop();
      if (Array.isArray(item)) {
        entries += item.length;
        if (entries > limit.sampleArrayEntries) return false;
        pending.push(...item);
      } else if (item && typeof item === "object")
        pending.push(...Object.values(item));
    }
    return true;
  } catch {
    return false;
  }
}
