import { describe, expect, it } from "vitest";
import {
  blankTemplate,
  letterTemplate,
} from "../../packages/templates/gallery";
import { addDesignerImage } from "../../packages/templates/designer-images";
import { reconcileDesignerChange } from "../../packages/templates/designer";
import { validateTemplateEnvelope } from "../../packages/contracts/src/templates";

const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/J0AAAAASUVORK5CYII=";

describe("local image insertion in the visual template editor", () => {
  it("embeds original bytes on the selected page, fits its aspect ratio and preserves business bindings", () => {
    const source = letterTemplate();
    source.definition.schemas.push([]);
    const result = addDesignerImage(source.definition, png, 1);
    const block = result.definition.schemas[1][0];
    expect(block).toMatchObject({
      name: "image",
      type: "image",
      content: png,
      readOnly: true,
    });
    expect(block.width).toBe(block.height);
    expect(block.width).toBe(35);
    expect(source.definition.schemas[1]).toEqual([]);
    expect(result.definition.schemas[0]).toEqual(source.definition.schemas[0]);
    const envelope = reconcileDesignerChange(source, result.definition);
    expect(envelope.bindings).toEqual(source.bindings);
    expect(() => validateTemplateEnvelope(envelope)).not.toThrow();
  });
  it("uses unique names across pages and fixed page content", () => {
    const source = blankTemplate().definition;
    const first = addDesignerImage(source, png, 0);
    first.definition.basePdf.staticSchema!.push({
      ...first.definition.schemas[0][0],
      name: "image_2",
    });
    const second = addDesignerImage(first.definition, png, 0);
    expect(second.name).toBe("image_3");
  });
  it("rejects missing pages and non-embedded or unsupported image content", () => {
    const source = blankTemplate().definition;
    expect(() => addDesignerImage(source, png, 1)).toThrow(
      "selected page no longer exists",
    );
    expect(() => addDesignerImage(source, png, -1)).toThrow();
    for (const content of [
      "https://example.test/logo.png",
      "data:image/svg+xml;base64,PHN2Zz4=",
      "data:image/png;base64,YQ==",
    ])
      expect(() => addDesignerImage(source, content, 0)).toThrow();
    expect(source.schemas[0]).toEqual([]);
  });
});
