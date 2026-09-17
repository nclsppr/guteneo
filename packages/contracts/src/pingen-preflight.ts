import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFStream,
} from "pdf-lib";
import { z } from "zod";
import { validatePdf } from "./pdf";
import { LIMITS } from "./content";

/** Dated, deliberately narrower Guteneo beta policy; not a provider acceptance proof. */
export const PINGEN_PREFLIGHT_VERSION = "pingen-2026-09-17-v1";
export const PINGEN_MAX_BYTES = 8_000_000;
const configSchema = z
  .object({
    defaultCountry: z.string().regex(/^[A-Z]{2}$/),
    country: z.enum(["FR", "LU", "DE"]),
    addressPosition: z.enum(["left", "right"]),
    printMode: z.enum(["simplex", "duplex"]),
    printSpectrum: z.enum(["grayscale", "color"]),
    deliveryProduct: z.enum(["fast", "cheap"]),
  })
  .strict();
export type PingenPreflightOptions = z.infer<typeof configSchema>;
export type PingenIssue = { code: string; page?: number };
export type PingenRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export type PingenLayout = {
  profile: "general" | "france_domestic";
  address: PingenRect;
  postage: PingenRect;
  corner: PingenRect;
  edgeMm: 5;
};

/** All coordinates are millimetres from the TOP LEFT of the rendered A4 page. */
export function pingenLayout(options: PingenPreflightOptions): PingenLayout {
  const value = configSchema.parse(options);
  if (value.defaultCountry === "FR" && value.addressPosition !== "right")
    throw new Error("PINGEN_FRENCH_ORGANISATION_REQUIRES_RIGHT_WINDOW");
  if (value.defaultCountry === "FR" && value.country === "FR")
    return {
      profile: "france_domestic",
      address: { x: 110, y: 50, width: 80, height: 28 },
      postage: { x: 90, y: 30, width: 115, height: 64 },
      corner: { x: 190, y: 0, width: 20, height: 20 },
      edgeMm: 5,
    };
  return {
    profile: "general",
    address: {
      x: value.addressPosition === "left" ? 22 : 118,
      y: 60,
      width: 85.5,
      height: 25.5,
    },
    postage: {
      x: value.addressPosition === "left" ? 20 : 116,
      y: 40,
      width: 89.5,
      height: 47.5,
    },
    corner: { x: 0, y: 282, width: 15, height: 15 },
    edgeMm: 5,
  };
}

export type PingenPreflightResult = {
  version: typeof PINGEN_PREFLIGHT_VERSION;
  status: "blocked" | "review_required";
  sha256: string | null;
  pages: number | null;
  physicalSheets: number | null;
  layout: PingenLayout | null;
  issues: PingenIssue[];
  requiredReviews: readonly [
    "all_pages_rendered",
    "printed_recipient_matches",
    "return_address",
    "provider_draft",
    "exact_supplier_quote",
    "human_approval",
  ];
  canSend: false;
};

/** Run only AFTER the qualified malware scan in the isolated document service.
 * Reads immutable bytes without repair, saving, upload, OCR or network calls.
 * The result never authorizes transfer/send and does not certify address geometry. */
export async function preflightPingenPdf(
  bytes: Uint8Array,
  options: PingenPreflightOptions,
): Promise<PingenPreflightResult> {
  const result: PingenPreflightResult = {
    version: PINGEN_PREFLIGHT_VERSION,
    status: "blocked",
    sha256: null,
    pages: null,
    physicalSheets: null,
    layout: null,
    issues: [],
    requiredReviews: [
      "all_pages_rendered",
      "printed_recipient_matches",
      "return_address",
      "provider_draft",
      "exact_supplier_quote",
      "human_approval",
    ],
    canSend: false,
  };
  if (!configSchema.safeParse(options).success) {
    result.issues.push({ code: "POSTAL_OPTIONS_INVALID" });
    return result;
  }
  try {
    result.layout = pingenLayout(options);
  } catch {
    result.issues.push({ code: "POSTAL_LAYOUT_UNSUPPORTED" });
    return result;
  }
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > PINGEN_MAX_BYTES) {
    result.issues.push({ code: "POSTAL_PDF_SIZE" });
    return result;
  }
  try {
    const checked = await validatePdf(bytes);
    result.sha256 = checked.sha256;
    result.pages = checked.pages;
    result.physicalSheets =
      options.printMode === "duplex"
        ? Math.ceil(checked.pages / 2)
        : checked.pages;
    const pdf = await PDFDocument.load(bytes, {
      ignoreEncryption: false,
      throwOnInvalidObject: true,
      updateMetadata: false,
    });
    if (pdf.catalog.has(PDFName.of("AcroForm")))
      result.issues.push({ code: "POSTAL_INTERACTIVE_FORM" });
    const near = (a: number, b: number) =>
      Number.isFinite(a) && Math.abs(a - b) <= (0.25 * 72) / 25.4;
    pdf.getPages().forEach((page, index) => {
      const pageNo = index + 1;
      const media = page.getMediaBox();
      const crop = page.getCropBox();
      if (
        !near(media.width, (210 * 72) / 25.4) ||
        !near(media.height, (297 * 72) / 25.4)
      )
        result.issues.push({ code: "POSTAL_A4_REQUIRED", page: pageNo });
      if (
        !near(media.x, 0) ||
        !near(media.y, 0) ||
        ["x", "y", "width", "height"].some(
          (k) =>
            !near(crop[k as keyof typeof crop], media[k as keyof typeof media]),
        )
      )
        result.issues.push({ code: "POSTAL_CROP_UNSUPPORTED", page: pageNo });
      if (page.getRotation().angle % 360 !== 0)
        result.issues.push({
          code: "POSTAL_ROTATION_UNSUPPORTED",
          page: pageNo,
        });
      const unit = page.node.lookup(PDFName.of("UserUnit"));
      if (
        unit !== undefined &&
        (!(unit instanceof PDFNumber) || unit.asNumber() !== 1)
      )
        result.issues.push({
          code: "POSTAL_USER_UNIT_UNSUPPORTED",
          page: pageNo,
        });
      const annotations = page.node.lookup(PDFName.of("Annots"));
      if (
        annotations !== undefined &&
        (!(annotations instanceof PDFArray) || annotations.size() > 0)
      )
        result.issues.push({
          code: "POSTAL_ANNOTATIONS_UNSUPPORTED",
          page: pageNo,
        });
    });
    // Fonts inside form XObjects are also inspected, not just direct page resources.
    let unembedded = false;
    let unsupported = false;
    const seen = new Set<unknown>();
    const inspectFont = (object: unknown) => {
      if (object === undefined || seen.has(object)) return;
      seen.add(object);
      if (seen.size > 100_000) throw new Error("PDF_COMPLEXITY");
      if (object instanceof PDFArray)
        for (const child of object.asArray()) inspectFont(child);
      if (object instanceof PDFStream) inspectFont(object.dict);
      if (!(object instanceof PDFDict)) return;
      for (const [, child] of object.entries()) inspectFont(child);
      if (object.get(PDFName.of("Type"))?.toString() !== "/Font") return;
      const subtype = object.get(PDFName.of("Subtype"))?.toString();
      if (subtype === "/Type0") {
        const descendants = object.lookup(PDFName.of("DescendantFonts"));
        if (!(descendants instanceof PDFArray) || descendants.size() === 0)
          unsupported = true;
        else
          for (let i = 0; i < descendants.size(); i++) {
            const child = descendants.lookup(i);
            if (
              !(child instanceof PDFDict) ||
              child.get(PDFName.of("Type"))?.toString() !== "/Font"
            )
              unsupported = true;
            inspectFont(child);
          }
        return;
      }
      if (
        !["/TrueType", "/Type1", "/CIDFontType0", "/CIDFontType2"].includes(
          subtype ?? "",
        )
      )
        unsupported = true;
      const descriptor = object.lookup(PDFName.of("FontDescriptor"));
      if (
        !(descriptor instanceof PDFDict) ||
        !["FontFile", "FontFile2", "FontFile3"].some(
          (key) => descriptor.lookup(PDFName.of(key)) instanceof PDFStream,
        )
      )
        unembedded = true;
    };
    for (const [, object] of pdf.context.enumerateIndirectObjects())
      inspectFont(object);
    if (unembedded) result.issues.push({ code: "POSTAL_FONT_NOT_EMBEDDED" });
    if (unsupported) result.issues.push({ code: "POSTAL_FONT_UNSUPPORTED" });
    result.status = result.issues.length ? "blocked" : "review_required";
  } catch {
    // Never return parser messages, PDF text, addresses or bytes in diagnostics.
    result.issues.push({ code: "POSTAL_PDF_INVALID" });
  }
  return result;
}

/** Conservative beta syntax check on extracted/confirmed lines, not postal existence
 * or PDF text extraction. Does not rewrite, uppercase or silently repair an address. */
export function checkPingenAddress(
  lines: string[],
  options: PingenPreflightOptions,
): PingenIssue[] {
  if (
    !configSchema.safeParse(options).success ||
    !Array.isArray(lines) ||
    lines.length > 7 ||
    lines.some(
      (line) =>
        typeof line !== "string" ||
        line.length > 160 ||
        !line.trim() ||
        /[\u0000-\u001f\u007f]/u.test(line),
    )
  )
    return [{ code: "POSTAL_ADDRESS_INVALID" }];
  const errors: PingenIssue[] = [];
  const names = { FR: "FRANCE", LU: "LUXEMBOURG", DE: "GERMANY" };
  const lastIsCountry = lines.at(-1) === names[options.country];
  const domestic = options.defaultCountry === options.country;
  if (!domestic && !lastIsCountry)
    errors.push({ code: "POSTAL_COUNTRY_LINE_REQUIRED" });
  if (domestic && lastIsCountry)
    errors.push({ code: "POSTAL_DOMESTIC_COUNTRY_LINE" });
  const address = lastIsCountry ? lines.slice(0, -1) : lines;
  if (address.length < 3 || address.length > 6)
    errors.push({ code: "POSTAL_ADDRESS_LINE_COUNT" });
  const postcode = address.at(-1) ?? "";
  const pattern =
    options.country === "LU"
      ? /^(?:L-)?\d{4} [\p{L}\p{M}][\p{L}\p{M} '\-]*$/u
      : /^\d{5} [\p{L}\p{M}][\p{L}\p{M}\d '\-]*$/u;
  if (!pattern.test(postcode))
    errors.push({ code: "POSTAL_POSTCODE_LINE_INVALID" });
  if (options.defaultCountry === "FR" && options.country === "FR") {
    if (lines.some((line) => Array.from(line).length > 38))
      errors.push({ code: "POSTAL_ADDRESS_LINE_TOO_LONG" });
    if (postcode !== postcode.toLocaleUpperCase("fr-FR"))
      errors.push({ code: "POSTAL_CITY_UPPERCASE_REQUIRED" });
    if (/[\p{P}\p{S}]/u.test(postcode))
      errors.push({ code: "POSTAL_POSTCODE_PUNCTUATION" });
  }
  return errors;
}

/** Trusted isolated-renderer output only. Client/LLM-supplied pixels and hashes are
 * not evidence. A white result still does not prove OCR, fonts or recipient identity. */
export function checkPingenRaster(
  input: {
    rgba: Uint8Array | Uint8ClampedArray;
    width: number;
    height: number;
    page: number;
    sourceSha256: string;
    expectedSha256: string;
  },
  options: PingenPreflightOptions,
): PingenIssue[] {
  let layout: PingenLayout;
  try {
    layout = pingenLayout(options);
  } catch {
    return [{ code: "POSTAL_LAYOUT_UNSUPPORTED" }];
  }
  if (
    !/^[a-f0-9]{64}$/.test(input.expectedSha256) ||
    input.sourceSha256 !== input.expectedSha256
  )
    return [{ code: "POSTAL_RENDER_HASH_MISMATCH" }];
  const { width, height, rgba, page } = input;
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > LIMITS.pages ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1190 ||
    height < 1683 ||
    width * height > 10_000_000 ||
    Math.abs(width / height - 210 / 297) > 0.001 ||
    !(rgba instanceof Uint8Array || rgba instanceof Uint8ClampedArray) ||
    rgba.length !== width * height * 4
  )
    return [{ code: "POSTAL_RENDER_INVALID", page }];
  const inRect = (x: number, y: number, r: PingenRect) =>
    x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;
  let edge = false,
    corner = false,
    postage = false,
    addressInk = false,
    translucent = false;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      if (rgba[offset + 3] !== 255) {
        translucent = true;
        continue;
      }
      // Fail closed for any non-white pixel, including light-grey template guides.
      if (
        rgba[offset] === 255 &&
        rgba[offset + 1] === 255 &&
        rgba[offset + 2] === 255
      )
        continue;
      const mmX = ((x + 0.5) * 210) / width,
        mmY = ((y + 0.5) * 297) / height;
      if (mmX < 5 || mmX >= 205 || mmY < 5 || mmY >= 292) edge = true;
      if (inRect(mmX, mmY, layout.corner)) corner = true;
      if (page === 1) {
        if (inRect(mmX, mmY, layout.address)) addressInk = true;
        else if (inRect(mmX, mmY, layout.postage)) postage = true;
      }
    }
  return [
    ...(edge ? [{ code: "POSTAL_EDGE_CONTENT", page }] : []),
    ...(corner ? [{ code: "POSTAL_CORNER_CONTENT", page }] : []),
    ...(postage ? [{ code: "POSTAL_POSTAGE_CONTENT", page }] : []),
    ...(page === 1 && !addressInk
      ? [{ code: "POSTAL_ADDRESS_EMPTY", page }]
      : []),
    ...(translucent ? [{ code: "POSTAL_RENDER_NOT_FLATTENED", page }] : []),
  ];
}
