import { z } from "zod";
import type { Template } from "@pdfme/common";

export const PDFME_VERSION = "6.1.13" as const;
export const TEMPLATE_FONT_FILE = "Roboto-Regular.ttf" as const;
export const TEMPLATE_FONT_SHA256 =
  "7277cfb805def6410f317129b8e1f78bdd47d1a4e24c233077d06e88a36e57ae" as const;
export const TEMPLATE_LIMITS = {
  bytes: 512 * 1024,
  blocks: 100,
  inputBytes: 512 * 1024,
  rows: 500,
  columns: 20,
  text: 50_000,
  pages: 100,
} as const;
export class TemplateError extends Error {
  constructor(
    public code: string,
    message: string,
    public details: { field?: string; block?: string } = {},
  ) {
    super(message);
  }
}
const key = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/);
const path = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*){0,7}$/)
  .max(256)
  .refine(
    (value) =>
      !value
        .split(".")
        .some((part) =>
          ["__proto__", "prototype", "constructor"].includes(part),
        ),
    "Chemin de champ interdit.",
  );
const jsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string().max(TEMPLATE_LIMITS.text),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValue).max(500),
    z.record(z.string().max(128), jsonValue),
  ]),
);
export type BusinessField = {
  type: "string" | "integer" | "number" | "boolean" | "object" | "array";
  title?: string;
  format?: "date" | "email";
  properties?: Record<string, BusinessField>;
  required?: string[];
  items?: BusinessField;
  default?: unknown;
  enum?: (string | number | boolean)[];
  maxLength?: number;
  maxItems?: number;
};
export const BusinessFieldSchema: z.ZodType<BusinessField> = z.lazy(() =>
  z
    .object({
      type: z.enum([
        "string",
        "integer",
        "number",
        "boolean",
        "object",
        "array",
      ]),
      title: z.string().max(100).optional(),
      format: z.enum(["date", "email"]).optional(),
      properties: z.record(key, BusinessFieldSchema).optional(),
      required: z.array(key).max(100).optional(),
      items: BusinessFieldSchema.optional(),
      default: jsonValue.optional(),
      enum: z
        .array(z.union([z.string(), z.number().finite(), z.boolean()]))
        .max(100)
        .optional(),
      maxLength: z.number().int().min(1).max(TEMPLATE_LIMITS.text).optional(),
      maxItems: z.number().int().min(0).max(TEMPLATE_LIMITS.rows).optional(),
    })
    .strict(),
);
const FormatSchema = z.enum(["text", "integer", "decimal", "date", "money"]);
const ConditionSchema = z
  .object({
    path,
    equals: z.union([z.string(), z.number().finite(), z.boolean(), z.null()]),
  })
  .strict();
export const TemplateColumnSchema = z
  .object({
    title: z.string().min(1).max(100),
    path,
    format: FormatSchema.default("text"),
    currency: z.enum(["EUR", "CHF", "GBP", "USD"]).optional(),
    multiplyBy: path.optional(),
    required: z.boolean().default(true),
  })
  .strict();
export const TemplateBindingSchema = z
  .object({
    block: key,
    kind: z.enum(["value", "table", "sum"]),
    path,
    format: FormatSchema.default("text"),
    currency: z.enum(["EUR", "CHF", "GBP", "USD"]).optional(),
    columns: z
      .array(TemplateColumnSchema)
      .min(1)
      .max(TEMPLATE_LIMITS.columns)
      .optional(),
    valuePath: path.optional(),
    multiplyBy: path.optional(),
    required: z.boolean().default(true),
    default: z
      .union([
        z.string().max(TEMPLATE_LIMITS.text),
        z.number().finite(),
        z.boolean(),
      ])
      .optional(),
    when: ConditionSchema.optional(),
    prefix: z.string().max(200).optional(),
    suffix: z.string().max(200).optional(),
  })
  .strict();
// Engine details stay serializable and round-trip through Designer. A second
// validation pass below restricts execution-capable and resource-bearing keys.
const GraphicBlockSchema = z
  .object({
    name: key,
    type: z.enum(["text", "table", "line", "rectangle", "ellipse", "image"]),
    position: z
      .object({
        x: z.number().finite().min(0).max(420),
        y: z.number().finite().min(0).max(594),
      })
      .strict(),
    width: z.number().finite().positive().max(420),
    height: z.number().finite().positive().max(594),
    content: z.string().max(350_000).optional(),
    readOnly: z.boolean().optional(),
  })
  .catchall(jsonValue);
export const TemplateEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(1),
    engine: z.literal("pdfme"),
    engineVersion: z.literal(PDFME_VERSION),
    name: z.string().trim().min(1).max(160),
    description: z.string().max(2000).default(""),
    locale: z.enum(["fr-FR", "de-DE", "en-GB"]).default("fr-FR"),
    definition: z
      .object({
        basePdf: z
          .object({
            width: z.number().min(100).max(420),
            height: z.number().min(100).max(594),
            padding: z.tuple([
              z.number().min(5).max(60),
              z.number().min(5).max(60),
              z.number().min(5).max(60),
              z.number().min(5).max(60),
            ]),
            staticSchema: z.array(GraphicBlockSchema).max(10).optional(),
          })
          .strict(),
        schemas: z
          .array(z.array(GraphicBlockSchema).max(TEMPLATE_LIMITS.blocks))
          .min(1)
          .max(10),
        pdfmeVersion: z.literal(PDFME_VERSION).optional(),
      })
      .strict(),
    inputSchema: BusinessFieldSchema,
    bindings: z.array(TemplateBindingSchema).max(TEMPLATE_LIMITS.blocks),
    sampleData: z.record(z.string(), jsonValue).default({}),
    sampleDataSynthetic: z.literal(true).default(true),
    // Remote assets and unverified uploads cannot bypass the document scan gate.
    resources: z.array(z.never()).max(0).default([]),
  })
  .strict();
export type TemplateEnvelope = z.infer<typeof TemplateEnvelopeSchema>;
export type TemplateBinding = z.infer<typeof TemplateBindingSchema>;
export type TemplateColumn = z.infer<typeof TemplateColumnSchema>;
export type GraphicBlock =
  TemplateEnvelope["definition"]["schemas"][number][number];
const forbiddenNames = new Set(["__proto__", "prototype", "constructor"]);
export const TEMPLATE_GRAPHIC_PROPERTIES = [
  "name",
  "type",
  "position",
  "width",
  "height",
  "content",
  "readOnly",
  "required",
  "fontName",
  "fontSize",
  "fontColor",
  "color",
  "backgroundColor",
  "alignment",
  "verticalAlignment",
  "lineHeight",
  "characterSpacing",
  "rotate",
  "opacity",
  "strikethrough",
  "underline",
  "overflow",
  "dynamicFontSize",
  "showHead",
  "repeatHead",
  "head",
  "headWidthPercentages",
  "tableStyles",
  "headStyles",
  "bodyStyles",
  "columnStyles",
  "borderColor",
  "borderWidth",
  "radius",
  "editable",
  "id",
  "hide",
  "split",
  "__splitRange",
  "__isSplit",
  "__isFirstSplit",
  "__isLastSplit",
  "showLabel",
  "borderRadius",
  "padding",
  "textFormat",
  "fontVariants",
  "fontVariantFallback",
] as const;
const allowedGraphicKeys = new Set<string>(TEMPLATE_GRAPHIC_PROPERTIES);
function fail(
  code: string,
  message: string,
  field?: string,
  block?: string,
): never {
  throw new TemplateError(code, message, { field, block });
}
function safeTree(value: unknown, depth = 0): void {
  if (depth > 14) fail("TEMPLATE_COMPLEXITY", "Structure trop profonde.");
  if (Array.isArray(value)) {
    for (const v of value) safeTree(v, depth + 1);
    return;
  }
  if (value && typeof value === "object")
    for (const [name, item] of Object.entries(value)) {
      if (forbiddenNames.has(name))
        fail("TEMPLATE_UNSAFE_KEY", "Clé interdite.", name);
      safeTree(item, depth + 1);
    }
}
function validateBusinessSchema(schema: BusinessField, depth = 0): void {
  if (depth > 8)
    fail("TEMPLATE_SCHEMA_DEPTH", "Le schéma dépasse huit niveaux.");
  if (schema.type === "object") {
    if (!schema.properties || Object.keys(schema.properties).length > 100)
      fail("TEMPLATE_SCHEMA_INVALID", "Déclarez les propriétés de l’objet.");
    for (const required of schema.required ?? [])
      if (!Object.hasOwn(schema.properties, required))
        fail(
          "TEMPLATE_SCHEMA_INVALID",
          "Champ requis absent du schéma.",
          required,
        );
    Object.values(schema.properties).forEach((v) =>
      validateBusinessSchema(v, depth + 1),
    );
  } else if (schema.type === "array") {
    if (!schema.items)
      fail("TEMPLATE_SCHEMA_INVALID", "Déclarez les éléments du tableau.");
    validateBusinessSchema(schema.items, depth + 1);
  } else if (schema.items || schema.properties || schema.required)
    fail("TEMPLATE_SCHEMA_INVALID", "Structure incompatible avec le type.");
}
function schemaAt(
  schema: BusinessField,
  field: string,
): BusinessField | undefined {
  let current: BusinessField | undefined = schema;
  for (const part of field.split("."))
    current =
      current?.type === "object" ? current.properties?.[part] : undefined;
  return current;
}
/** Self-contained rasters only: no URL, SVG, metadata-sourced fetch or script. */
export function validateTemplateImage(content: string): {
  mimeType: string;
  bytes: number;
  width: number;
  height: number;
} {
  const match =
    /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/.exec(content);
  if (!match || match[2].length % 4 !== 0 || match[2].length > 342_000)
    fail(
      "TEMPLATE_IMAGE_INVALID",
      "Choisissez une image PNG ou JPEG de moins de 250 Ko.",
    );
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
  } catch {
    return fail("TEMPLATE_IMAGE_INVALID", "Image base64 invalide.");
  }
  if (bytes.length > 250 * 1024)
    fail("TEMPLATE_IMAGE_LIMIT", "L’image dépasse 250 Ko.");
  const view = new DataView(bytes.buffer);
  let width = 0,
    height = 0;
  if (match[1] === "image/png") {
    if (
      bytes.length < 33 ||
      Array.from(bytes.slice(0, 8)).join(",") !== "137,80,78,71,13,10,26,10" ||
      new TextDecoder().decode(bytes.slice(12, 16)) !== "IHDR"
    )
      fail("TEMPLATE_IMAGE_INVALID", "Signature PNG invalide.");
    width = view.getUint32(16);
    height = view.getUint32(20);
  } else {
    if (
      bytes[0] !== 255 ||
      bytes[1] !== 216 ||
      bytes.at(-2) !== 255 ||
      bytes.at(-1) !== 217
    )
      fail("TEMPLATE_IMAGE_INVALID", "Signature JPEG invalide.");
    let offset = 2;
    while (offset + 9 <= bytes.length) {
      if (bytes[offset] !== 255) break;
      const marker = bytes[offset + 1];
      if (marker === 0xda || marker === 0xd9) break;
      const size = view.getUint16(offset + 2);
      if (size < 2 || offset + 2 + size > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        height = view.getUint16(offset + 5);
        width = view.getUint16(offset + 7);
        break;
      }
      offset += size + 2;
    }
  }
  if (
    !width ||
    !height ||
    width > 4000 ||
    height > 4000 ||
    width * height > 4_000_000
  )
    fail(
      "TEMPLATE_IMAGE_DIMENSIONS",
      "L’image doit rester sous 4 millions de pixels et 4 000 pixels par côté.",
    );
  return { mimeType: match[1], bytes: bytes.length, width, height };
}
function validateGraphicValues(value: unknown, key = ""): void {
  if (key === "content") return;
  if (key === "textFormat" && value !== "plain")
    fail(
      "TEMPLATE_TEXT_FORMAT",
      "Le texte enrichi actif n’est pas pris en charge ; utilisez du texte simple.",
    );
  if (
    typeof value === "number" &&
    (!Number.isFinite(value) || Math.abs(value) > 10_000)
  )
    fail("TEMPLATE_STYLE_INVALID", "Valeur graphique hors limites.");
  if (key === "fontName" && value !== "GuteneoSans")
    fail("TEMPLATE_FONT_UNAVAILABLE", "Police non disponible.");
  if (
    typeof value === "string" &&
    /^(?:https?:|data:|javascript:|blob:)/i.test(value)
  )
    fail(
      "TEMPLATE_RESOURCE_FORBIDDEN",
      "Ressource graphique externe interdite.",
    );
  if (Array.isArray(value))
    value.forEach((item) => validateGraphicValues(item));
  else if (value && typeof value === "object")
    for (const [name, item] of Object.entries(value))
      validateGraphicValues(item, name);
}
export function validateTemplateEnvelope(raw: unknown): TemplateEnvelope {
  if (
    new TextEncoder().encode(JSON.stringify(raw)).length > TEMPLATE_LIMITS.bytes
  )
    fail("TEMPLATE_TOO_LARGE", "Le modèle dépasse 512 Ko.");
  safeTree(raw);
  const parsed = TemplateEnvelopeSchema.safeParse(raw);
  if (!parsed.success)
    fail(
      "TEMPLATE_INVALID",
      parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .slice(0, 5)
        .join("; "),
    );
  const envelope = parsed.data;
  if (envelope.inputSchema.type !== "object")
    fail(
      "TEMPLATE_SCHEMA_INVALID",
      "Les données métier doivent être un objet.",
    );
  validateBusinessSchema(envelope.inputSchema);
  const base = envelope.definition.basePdf;
  if (
    base.padding[1] + base.padding[3] >= base.width ||
    base.padding[0] + base.padding[2] >= base.height
  )
    fail("TEMPLATE_PAGE_INVALID", "Marges incompatibles avec la page.");
  const names = new Set<string>();
  let blocks = 0;
  for (const block of [
    ...envelope.definition.schemas.flat(),
    ...(base.staticSchema ?? []),
  ]) {
    if (++blocks > TEMPLATE_LIMITS.blocks || names.has(block.name))
      fail(
        "TEMPLATE_BLOCK_INVALID",
        "Les noms de blocs doivent être uniques.",
        undefined,
        block.name,
      );
    names.add(block.name);
    for (const name of Object.keys(block))
      if (!allowedGraphicKeys.has(name))
        fail(
          "TEMPLATE_UNSUPPORTED_PROPERTY",
          `Propriété graphique non prise en charge : ${name}.`,
          undefined,
          block.name,
        );
    if (
      block.position.x + block.width > base.width + 0.1 ||
      block.position.y + block.height > base.height + 0.1
    )
      fail(
        "TEMPLATE_OVERFLOW",
        "Le bloc dépasse la page ; déplacez-le ou réduisez-le.",
        undefined,
        block.name,
      );
    if (block.type === "text" && block.overflow && block.overflow !== "expand")
      fail(
        "TEMPLATE_OVERFLOW_MODE",
        "Les textes utilisent le débordement dynamique expand.",
        undefined,
        block.name,
      );
    if (
      typeof block.fontSize === "number" &&
      (block.fontSize < 6 || block.fontSize > 72)
    )
      fail(
        "TEMPLATE_FONT_SIZE",
        "La taille de police doit être comprise entre 6 et 72 points.",
        undefined,
        block.name,
      );
    if (block.fontName && block.fontName !== "GuteneoSans")
      fail(
        "TEMPLATE_FONT_UNAVAILABLE",
        "Seule la police intégrée GuteneoSans est qualifiée.",
        undefined,
        block.name,
      );
    // pdfme expressions are intentionally not an authoring surface. Fixed page
    // counters are handled after rendering by our own bounded adapter.
    if (
      block.content
        ?.replace(/\{(?:currentPage|totalPages)\}/g, "")
        .includes("{")
    )
      fail(
        "TEMPLATE_EXPRESSION_FORBIDDEN",
        "Utilisez les liaisons déclaratives pour les variables.",
        undefined,
        block.name,
      );
    if (block.type === "image") validateTemplateImage(block.content ?? "");
    if (
      block.type !== "image" &&
      (block.content?.length ?? 0) > TEMPLATE_LIMITS.text
    )
      fail("TEMPLATE_TEXT_LIMIT", "Contenu trop long.", undefined, block.name);
    validateGraphicValues(block);
    if (block.type === "table") {
      if (
        !Array.isArray(block.head) ||
        block.head.length < 1 ||
        block.head.length > TEMPLATE_LIMITS.columns ||
        !block.head.every((v) => typeof v === "string" && v.length <= 100)
      )
        fail(
          "TEMPLATE_TABLE_INVALID",
          "En-têtes de tableau invalides.",
          undefined,
          block.name,
        );
      for (const styleKey of ["headStyles", "bodyStyles"]) {
        const style = block[styleKey];
        if (
          style &&
          typeof style === "object" &&
          !Array.isArray(style) &&
          "fontName" in style &&
          style.fontName !== "GuteneoSans"
        )
          fail(
            "TEMPLATE_FONT_UNAVAILABLE",
            "Police de tableau non disponible.",
            undefined,
            block.name,
          );
      }
    }
  }
  const bound = new Set<string>();
  for (const binding of envelope.bindings) {
    if (bound.has(binding.block))
      fail(
        "TEMPLATE_BINDING_DUPLICATE",
        "Un bloc possède plusieurs liaisons.",
        binding.path,
        binding.block,
      );
    bound.add(binding.block);
    const block = envelope.definition.schemas
      .flat()
      .find((b) => b.name === binding.block);
    if (!block)
      fail(
        "TEMPLATE_BINDING_INVALID",
        "Bloc lié absent de la définition.",
        binding.path,
        binding.block,
      );
    const field = schemaAt(envelope.inputSchema, binding.path);
    if (!field)
      fail(
        "TEMPLATE_BINDING_INVALID",
        "Champ lié absent du schéma métier.",
        binding.path,
        binding.block,
      );
    if (binding.kind === "table") {
      if (
        block.type !== "table" ||
        field.type !== "array" ||
        !field.items ||
        !binding.columns?.length
      )
        fail(
          "TEMPLATE_BINDING_INVALID",
          "Une liaison tableau attend un bloc tableau et un tableau métier.",
          binding.path,
          binding.block,
        );
      for (const column of binding.columns)
        if (!schemaAt(field.items, column.path))
          fail(
            "TEMPLATE_BINDING_INVALID",
            "Colonne absente du schéma métier.",
            column.path,
            binding.block,
          );
      if ((block.head as unknown[]).length !== binding.columns.length)
        fail(
          "TEMPLATE_TABLE_COLUMNS",
          "Les colonnes graphiques et métier doivent correspondre.",
          binding.path,
          binding.block,
        );
    } else if (block.type !== "text")
      fail(
        "TEMPLATE_BINDING_INVALID",
        "Une liaison valeur attend un bloc texte.",
        binding.path,
        binding.block,
      );
    if (
      binding.kind === "sum" &&
      (field.type !== "array" ||
        !field.items ||
        !binding.valuePath ||
        !schemaAt(field.items, binding.valuePath))
    )
      fail(
        "TEMPLATE_BINDING_INVALID",
        "Un total attend un tableau et une valeur déclarée.",
        binding.path,
        binding.block,
      );
    if (binding.when && !schemaAt(envelope.inputSchema, binding.when.path))
      fail(
        "TEMPLATE_BINDING_INVALID",
        "Condition absente du schéma.",
        binding.when.path,
        binding.block,
      );
  }
  return envelope;
}
export function getTemplateValue(data: unknown, field: string): unknown {
  let current = data;
  for (const part of field.split(".")) {
    if (
      forbiddenNames.has(part) ||
      !current ||
      typeof current !== "object" ||
      Array.isArray(current) ||
      !Object.hasOwn(current, part)
    )
      return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
function normalize(
  schema: BusinessField,
  value: unknown,
  field: string,
  required: boolean,
): unknown {
  if (value === undefined || value === null || value === "") {
    if (schema.default !== undefined) value = schema.default;
    else if (required)
      fail("TEMPLATE_REQUIRED_FIELD", "Valeur obligatoire manquante.", field);
    else return undefined;
  }
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value))
      fail("TEMPLATE_FIELD_TYPE", "Objet attendu.", field);
    const output: Record<string, unknown> = {};
    for (const [name, child] of Object.entries(schema.properties ?? {})) {
      const normalized = normalize(
        child,
        (value as Record<string, unknown>)[name],
        field ? `${field}.${name}` : name,
        (schema.required ?? []).includes(name),
      );
      if (normalized !== undefined) output[name] = normalized;
    }
    return output;
  }
  if (schema.type === "array") {
    if (
      !Array.isArray(value) ||
      value.length > (schema.maxItems ?? TEMPLATE_LIMITS.rows)
    )
      fail("TEMPLATE_ARRAY_LIMIT", "Tableau absent ou trop volumineux.", field);
    return value.map((item, i) =>
      normalize(schema.items!, item, `${field}[${i}]`, true),
    );
  }
  if (
    schema.type === "integer"
      ? !Number.isSafeInteger(value)
      : typeof value !== schema.type
  )
    fail("TEMPLATE_FIELD_TYPE", `Valeur ${schema.type} attendue.`, field);
  if (typeof value === "number" && !Number.isFinite(value))
    fail("TEMPLATE_FIELD_TYPE", "Nombre fini attendu.", field);
  if (typeof value === "string") {
    if (value.length > (schema.maxLength ?? TEMPLATE_LIMITS.text))
      fail("TEMPLATE_TEXT_LIMIT", "Texte trop long.", field);
    if (
      schema.format === "date" &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        Number.isNaN(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value)
    )
      fail(
        "TEMPLATE_DATE_AMBIGUOUS",
        "Utilisez une date valide au format AAAA-MM-JJ.",
        field,
      );
    if (schema.format === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
      fail("TEMPLATE_FIELD_TYPE", "Adresse e-mail invalide.", field);
  }
  if (schema.enum && !schema.enum.includes(value as string | number | boolean))
    fail("TEMPLATE_FIELD_ENUM", "Valeur hors des choix autorisés.", field);
  return value;
}
export function validateTemplateData(
  envelope: TemplateEnvelope,
  data: unknown,
): Record<string, unknown> {
  if (
    new TextEncoder().encode(JSON.stringify(data)).length >
    TEMPLATE_LIMITS.inputBytes
  )
    fail("TEMPLATE_INPUT_LIMIT", "Les données dépassent 512 Ko.");
  safeTree(data);
  return normalize(envelope.inputSchema, data, "", true) as Record<
    string,
    unknown
  >;
}
function safeInteger(value: unknown, field: string): bigint {
  if (!Number.isSafeInteger(value))
    fail(
      "TEMPLATE_INTEGER_REQUIRED",
      "Un entier exact est requis pour le calcul.",
      field,
    );
  return BigInt(value as number);
}
function exactNumber(value: bigint, field: string): number {
  if (
    value > BigInt(Number.MAX_SAFE_INTEGER) ||
    value < BigInt(Number.MIN_SAFE_INTEGER)
  )
    fail(
      "TEMPLATE_AMOUNT_OVERFLOW",
      "Le résultat dépasse la précision autorisée.",
      field,
    );
  return Number(value);
}
export function formatTemplateValue(
  value: unknown,
  format: TemplateBinding["format"],
  locale: TemplateEnvelope["locale"],
  currency = "EUR",
  field = "",
): string {
  if (value === undefined || value === null) return "";
  if (format === "money") {
    const amount = safeInteger(value, field),
      negative = amount < 0n,
      absolute = negative ? -amount : amount;
    const whole = absolute / 100n,
      cents = String(absolute % 100n).padStart(2, "0");
    const decimal = locale === "en-GB" ? "." : ",";
    return `${negative ? "−" : ""}${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(whole).replace(/[\u202f\u00a0]/g, " ")}${decimal}${cents} ${currency === "EUR" ? "€" : currency}`;
  }
  if (format === "integer")
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })
      .format(exactNumber(safeInteger(value, field), field))
      .replace(/[\u202f\u00a0]/g, " ");
  if (format === "decimal") {
    // Dataset normalization preserves decimals as exact strings. Group the
    // integer part with BigInt and retain every supplied fractional digit.
    if (
      typeof value === "string" &&
      /^[+-]?\d{1,40}(\.\d{1,20})?$/.test(value)
    ) {
      const negative = value.startsWith("-"),
        [whole, fraction] = value.replace(/^[+-]/, "").split(".");
      const grouped = new Intl.NumberFormat(locale, {
        maximumFractionDigits: 0,
      })
        .format(BigInt(whole))
        .replace(/[\u202f\u00a0]/g, " ");
      return `${negative ? "−" : ""}${grouped}${fraction === undefined ? "" : (locale === "en-GB" ? "." : ",") + fraction}`;
    }
    if (typeof value !== "number" || !Number.isFinite(value))
      fail("TEMPLATE_FIELD_TYPE", "Nombre attendu.", field);
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 6 })
      .format(value)
      .replace(/[\u202f\u00a0]/g, " ");
  }
  if (format === "date") {
    if (
      typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value
    )
      fail("TEMPLATE_DATE_AMBIGUOUS", "Date AAAA-MM-JJ requise.", field);
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value}T12:00:00Z`));
  }
  if (typeof value === "object")
    fail("TEMPLATE_FIELD_TYPE", "Une valeur simple est attendue.", field);
  return String(value);
}
export function prepareTemplateRender(
  rawEnvelope: unknown,
  rawData: unknown,
): {
  template: Template;
  inputs: Record<string, string>[];
  metadata: {
    engine: "pdfme";
    engineVersion: typeof PDFME_VERSION;
    adapterVersion: "1";
    locale: string;
    font: "GuteneoSans";
    fontFile: typeof TEMPLATE_FONT_FILE;
    fontSha256: typeof TEMPLATE_FONT_SHA256;
  };
} {
  const envelope = validateTemplateEnvelope(rawEnvelope),
    data = validateTemplateData(envelope, rawData);
  const template = structuredClone(envelope.definition) as unknown as Template;
  const input: Record<string, string> = {};
  for (const blocks of template.schemas)
    for (const block of blocks) {
      if (block.type === "text") {
        block.fontName = "GuteneoSans";
        block.overflow = "expand";
      }
      if (!envelope.bindings.some((binding) => binding.block === block.name))
        input[block.name] = block.content ?? "";
    }
  for (const binding of envelope.bindings) {
    const block = template.schemas
      .flat()
      .find((b) => b.name === binding.block)!;
    if (
      binding.when &&
      (getTemplateValue(data, binding.when.path) ?? null) !==
        binding.when.equals
    ) {
      // A false condition hides the entire block, including table headings.
      template.schemas = template.schemas.map((page) =>
        page.filter((candidate) => candidate.name !== binding.block),
      );
      delete input[binding.block];
      continue;
    }
    let value = getTemplateValue(data, binding.path) ?? binding.default;
    if (value === undefined && binding.required)
      fail(
        "TEMPLATE_REQUIRED_FIELD",
        "Valeur liée manquante.",
        binding.path,
        binding.block,
      );
    if (binding.kind === "table") {
      if (!Array.isArray(value)) {
        if (value === undefined && !binding.required) value = [];
        else
          fail(
            "TEMPLATE_FIELD_TYPE",
            "Tableau attendu.",
            binding.path,
            binding.block,
          );
      }
      const rows = (value as unknown[]).map((row, i) =>
        binding.columns!.map((column) => {
          let cell = getTemplateValue(row, column.path);
          const field = `${binding.path}[${i}].${column.path}`;
          if (cell === undefined && column.required)
            fail(
              "TEMPLATE_REQUIRED_FIELD",
              "Cellule obligatoire manquante.",
              field,
              binding.block,
            );
          if (column.multiplyBy && cell !== undefined)
            cell = exactNumber(
              safeInteger(cell, field) *
                safeInteger(
                  getTemplateValue(row, column.multiplyBy),
                  `${binding.path}[${i}].${column.multiplyBy}`,
                ),
              field,
            );
          return formatTemplateValue(
            cell,
            column.format,
            envelope.locale,
            column.currency,
            field,
          );
        }),
      );
      input[binding.block] = JSON.stringify(rows);
      block.head = binding.columns!.map((column) => column.title);
    } else {
      if (binding.kind === "sum") {
        if (!Array.isArray(value))
          fail(
            "TEMPLATE_FIELD_TYPE",
            "Tableau requis pour le total.",
            binding.path,
            binding.block,
          );
        const total = value.reduce<bigint>(
          (sum, row) =>
            sum +
            safeInteger(
              getTemplateValue(row, binding.valuePath!),
              binding.valuePath!,
            ) *
              (binding.multiplyBy
                ? safeInteger(
                    getTemplateValue(row, binding.multiplyBy),
                    binding.multiplyBy,
                  )
                : 1n),
          0n,
        );
        value = exactNumber(total, binding.path);
      }
      input[binding.block] =
        `${binding.prefix ?? ""}${formatTemplateValue(value, binding.format, envelope.locale, binding.currency, binding.path)}${binding.suffix ?? ""}`;
    }
    block.readOnly = false;
  }
  return {
    template,
    inputs: [input],
    metadata: {
      engine: "pdfme",
      engineVersion: PDFME_VERSION,
      adapterVersion: "1",
      locale: envelope.locale,
      font: "GuteneoSans",
      fontFile: TEMPLATE_FONT_FILE,
      fontSha256: TEMPLATE_FONT_SHA256,
    },
  };
}
export const TemplatePatchSchema = z.discriminatedUnion("op", [
  z
    .object({
      op: z.literal("move_block"),
      block: key,
      x: z.number().min(0).max(420),
      y: z.number().min(0).max(594),
    })
    .strict(),
  z
    .object({
      op: z.literal("set_text"),
      block: key,
      text: z.string().max(TEMPLATE_LIMITS.text),
    })
    .strict(),
  z
    .object({ op: z.literal("set_binding"), binding: TemplateBindingSchema })
    .strict(),
  z
    .object({
      op: z.literal("add_table_column"),
      block: key,
      column: TemplateColumnSchema,
      field: BusinessFieldSchema.optional(),
    })
    .strict(),
  z.object({ op: z.literal("remove_block"), block: key }).strict(),
]);
export function applyTemplatePatch(
  raw: unknown,
  patch: unknown,
): TemplateEnvelope {
  safeTree(patch);
  const envelope = structuredClone(validateTemplateEnvelope(raw)),
    change = TemplatePatchSchema.parse(patch);
  if (change.op === "set_binding") {
    envelope.bindings = envelope.bindings.filter(
      (b) => b.block !== change.binding.block,
    );
    envelope.bindings.push(change.binding);
  } else {
    const block = envelope.definition.schemas
      .flat()
      .find((b) => b.name === change.block);
    if (!block)
      fail(
        "TEMPLATE_BLOCK_NOT_FOUND",
        "Bloc introuvable.",
        undefined,
        change.block,
      );
    if (change.op === "move_block")
      block.position = { x: change.x, y: change.y };
    if (change.op === "set_text") {
      block.content = change.text;
      block.readOnly = true;
      envelope.bindings = envelope.bindings.filter(
        (b) => b.block !== change.block,
      );
    }
    if (change.op === "remove_block") {
      envelope.definition.schemas = envelope.definition.schemas.map((page) =>
        page.filter((b) => b.name !== change.block),
      );
      envelope.bindings = envelope.bindings.filter(
        (b) => b.block !== change.block,
      );
    }
    if (change.op === "add_table_column") {
      const binding = envelope.bindings.find(
        (b) => b.block === change.block && b.kind === "table",
      );
      if (!binding?.columns)
        fail(
          "TEMPLATE_BINDING_INVALID",
          "Liez ce tableau aux données avant d’ajouter une colonne.",
          undefined,
          change.block,
        );
      if (change.field) {
        const array = schemaAt(envelope.inputSchema, binding.path);
        if (array?.type !== "array" || array.items?.type !== "object")
          fail(
            "TEMPLATE_BINDING_INVALID",
            "Un objet métier par ligne est requis.",
            binding.path,
            change.block,
          );
        const parts = change.column.path.split(".");
        let parent = array.items;
        for (const part of parts.slice(0, -1)) {
          parent.properties ??= {};
          let child = parent.properties[part];
          if (!child) {
            child = { type: "object", properties: {} };
            parent.properties[part] = child;
          }
          if (child.type !== "object")
            fail(
              "TEMPLATE_SCHEMA_CONFLICT",
              "Le chemin traverse un champ qui n’est pas un objet.",
              change.column.path,
              change.block,
            );
          if (change.column.required)
            parent.required = [...new Set([...(parent.required ?? []), part])];
          parent = child;
        }
        const name = parts.at(-1)!;
        parent.properties ??= {};
        if (Object.hasOwn(parent.properties, name))
          fail(
            "TEMPLATE_SCHEMA_CONFLICT",
            "Le champ existe déjà ; réutilisez-le sans redéclarer son type.",
            change.column.path,
            change.block,
          );
        parent.properties[name] = change.field;
        if (change.column.required)
          parent.required = [...new Set([...(parent.required ?? []), name])];
      }
      binding.columns.push(change.column);
      block.head = binding.columns.map((c) => c.title);
      block.headWidthPercentages = binding.columns.map(
        () => 100 / binding.columns!.length,
      );
    }
  }
  return validateTemplateEnvelope(envelope);
}
