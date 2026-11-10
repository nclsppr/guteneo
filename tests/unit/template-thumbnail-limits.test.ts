import { describe, expect, it } from "vitest";
import { blankTemplate } from "../../packages/templates/gallery";
import type { GraphicBlock } from "../../packages/contracts/src/templates";
import { templateThumbnailWithinLimits } from "../../apps/web/src/template-thumbnail-limits";

// Metadata-only synthetic PNG headers exercise bounds without decoding rasters.
function image(name: string, width: number, height: number): GraphicBlock {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes.set(new TextEncoder().encode("IHDR"), 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return {
    name,
    type: "image",
    position: { x: 10, y: 10 },
    width: 20,
    height: 20,
    content: `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`,
  };
}

describe("decorative template resource preflight", () => {
  it("counts static and variable blocks together", () => {
    const model = blankTemplate();
    const block = model.definition.schemas[0][0];
    model.definition.schemas = [
      Array.from({ length: 40 }, (_, index) => ({
        ...block,
        name: `block${index}`,
      })),
    ];
    model.definition.basePdf.staticSchema = [];
    expect(templateThumbnailWithinLimits(model)).toBe(true);
    model.definition.basePdf.staticSchema.push({
      ...block,
      name: "staticBlock",
    });
    expect(templateThumbnailWithinLimits(model)).toBe(false);
  });

  it("bounds aggregate raster decode including repeated static images", () => {
    const model = blankTemplate();
    model.definition.schemas = [[image("variable", 500, 500)]];
    model.definition.basePdf.staticSchema = Array.from(
      { length: 3 },
      (_, index) => image(`static${index}`, 500, 500),
    );
    const original = JSON.stringify(model);
    expect(templateThumbnailWithinLimits(model)).toBe(true);
    expect(JSON.stringify(model)).toBe(original);
    model.definition.basePdf.staticSchema.push(image("excess", 1, 1));
    expect(templateThumbnailWithinLimits(model)).toBe(false);
  });

  it("declines a legal four-megapixel original before decorative decoding", () => {
    const model = blankTemplate();
    model.definition.schemas = [[image("large", 2000, 2000)]];
    model.definition.basePdf.staticSchema = [];
    expect(templateThumbnailWithinLimits(model)).toBe(false);
  });

  it("rejects external and malformed raster resources", () => {
    const model = blankTemplate();
    model.definition.schemas = [
      [
        {
          ...image("external", 1, 1),
          content: "https://example.invalid/private.png",
        },
      ],
    ];
    expect(templateThumbnailWithinLimits(model)).toBe(false);
    model.definition.schemas[0][0].content = "data:image/png;base64,AAAA";
    expect(templateThumbnailWithinLimits(model)).toBe(false);
  });
});
