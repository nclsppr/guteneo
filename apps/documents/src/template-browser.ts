import fontCoverage from "../../../packages/templates/font-coverage.json";
import { generate } from "@pdfme/generator";
import { getDynamicTemplate, type Template } from "@pdfme/common";
import { getDynamicLayoutForSchema } from "@pdfme/schemas/dynamicLayout";
import {
  templateFonts,
  templatePlugins,
} from "../../../packages/templates/pdfme";

export type BrowserTemplateInput = {
  template: Template;
  inputs: Record<string, string>[];
};
/** Runs only in the isolated browser, with package-owned code and embedded fonts. */
export async function generateTemplatePdf(
  input: BrowserTemplateInput,
): Promise<{ base64: string; pages: number }> {
  const glyphs = new Set(fontCoverage.codePoints);
  const verifyText = (value: string) => {
    for (const character of value)
      if (
        !"\n\r\t".includes(character) &&
        !glyphs.has(character.codePointAt(0)!)
      )
        throw new Error("TEMPLATE_GLYPH_UNSUPPORTED");
  };
  for (const value of Object.values(input.inputs[0] ?? {})) verifyText(value);
  for (const block of [
    ...input.template.schemas.flat(),
    ...(typeof input.template.basePdf === "object" &&
    "staticSchema" in input.template.basePdf
      ? (input.template.basePdf.staticSchema ?? [])
      : []),
  ])
    if (block.type !== "image") {
      verifyText(block.content ?? "");
      if (Array.isArray(block.head))
        block.head.forEach((value) => verifyText(String(value)));
    }
  if (input.inputs.length !== 1) throw new Error("TEMPLATE_RECORD_COUNT");
  const layout = await getDynamicTemplate({
    template: input.template,
    input: input.inputs[0],
    options: { font: templateFonts },
    _cache: new Map(),
    getDynamicHeights: getDynamicLayoutForSchema,
  });
  if (layout.schemas.length > 100) throw new Error("TEMPLATE_PAGE_LIMIT");
  if (typeof layout.basePdf !== "object" || !("width" in layout.basePdf))
    throw new Error("TEMPLATE_PAGE_INVALID");
  const base = layout.basePdf;
  for (const blocks of layout.schemas) {
    for (const block of blocks) {
      if (
        block.position.x < 0 ||
        block.position.y < base.padding[0] - 0.1 ||
        block.position.x + block.width > base.width + 0.1 ||
        block.position.y + block.height > base.height - base.padding[2] + 0.1
      )
        throw new Error("TEMPLATE_RENDER_OVERFLOW");
    }
    const content = blocks.filter((block) =>
      ["text", "table", "image"].includes(block.type),
    );
    for (let i = 0; i < content.length; i++)
      for (let j = i + 1; j < content.length; j++) {
        const a = content[i],
          b = content[j];
        const width =
          Math.min(a.position.x + a.width, b.position.x + b.width) -
          Math.max(a.position.x, b.position.x);
        const height =
          Math.min(a.position.y + a.height, b.position.y + b.height) -
          Math.max(a.position.y, b.position.y);
        if (width > 0.2 && height > 0.2)
          throw new Error("TEMPLATE_RENDER_OVERLAP");
      }
  }
  const pdf = await generate({
    ...input,
    options: { font: templateFonts },
    plugins: templatePlugins,
  });
  if (pdf.length > 10 * 1024 * 1024) throw new Error("TEMPLATE_PDF_LIMIT");
  let binary = "";
  for (let offset = 0; offset < pdf.length; offset += 8192)
    binary += String.fromCharCode(...pdf.subarray(offset, offset + 8192));
  return { base64: btoa(binary), pages: layout.schemas.length };
}
(
  globalThis as typeof globalThis & {
    guteneoTemplateRender: typeof generateTemplatePdf;
  }
).guteneoTemplateRender = generateTemplatePdf;
