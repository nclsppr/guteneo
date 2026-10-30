import {
  TemplateError,
  validateTemplateImage,
  type TemplateEnvelope,
} from "../contracts/src/templates";

type Definition = TemplateEnvelope["definition"];

/** Embed the original raster in the current page; never fetch a remote asset. */
export function addDesignerImage(
  source: Definition,
  content: string,
  pageIndex: number,
) {
  const image = validateTemplateImage(content);
  if (!Number.isInteger(pageIndex) || !source.schemas[pageIndex])
    throw new TemplateError(
      "TEMPLATE_IMAGE_PAGE_INVALID",
      "The selected page no longer exists. Choose your image again.",
    );
  const definition = structuredClone(source);
  const names = new Set([
    ...definition.schemas.flat().map((block) => block.name),
    ...(definition.basePdf.staticSchema ?? []).map((block) => block.name),
  ]);
  let name = "image";
  for (let suffix = 2; names.has(name); suffix += 1) name = `image_${suffix}`;
  const { width, height, padding } = definition.basePdf;
  const position = {
    x: Math.min(padding[3], width / 4),
    y: Math.min(padding[0], height / 4),
  };
  const scale = Math.min(
    Math.min(50, width - position.x - Math.min(padding[1], width / 4)) /
      image.width,
    Math.min(35, height - position.y - Math.min(padding[2], height / 4)) /
      image.height,
  );
  definition.schemas[pageIndex].push({
    name,
    type: "image",
    content,
    position,
    width: image.width * scale,
    height: image.height * scale,
    readOnly: true,
  });
  return { definition, name, pageIndex };
}
