import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "../../apps/web/src/locale";
import { galleryCopy } from "../../apps/web/src/template-gallery-copy";
import {
  blankTemplate,
  templateGallery,
} from "../../packages/templates/gallery";
import { validateTemplateEnvelope } from "../../packages/contracts/src/templates";

const demos = [
  ...templateGallery(),
  { id: "blank", envelope: blankTemplate() },
];

// Readable text a person sees in the Studio or on the PDF; references and
// dates such as EX-001 or 2026-09-21 are not words.
const copyKeys = /\.(content|head(\[\d+\])?|title|default|prefix|suffix)$/;
function readable(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string")
    return /[a-z]/.test(value) &&
      !value.startsWith("[") &&
      (copyKeys.test(path) ||
        path.startsWith(".sampleData") ||
        path === ".name" ||
        path === ".description")
      ? [[path, value]]
      : [];
  if (Array.isArray(value))
    return value.flatMap((item, index) => readable(item, `${path}[${index}]`));
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, item]) =>
    readable(item, `${path}.${key}`),
  );
}

// Words German writes the same way as English.
const sameInGerman = new Set(["Status"]);

afterEach(() => setLocale("fr", false));

describe("demo template copies", () => {
  for (const locale of ["fr", "de", "lb"] as const)
    it(`creates valid ${locale} copies`, () => {
      setLocale(locale, false);
      for (const { envelope } of demos) {
        const copy = galleryCopy(envelope);
        expect(() => validateTemplateEnvelope(copy)).not.toThrow();
        expect(copy.locale).toBe(locale === "fr" ? "fr-FR" : "de-DE");
        expect(copy.inputSchema.required).toEqual(
          envelope.inputSchema.required,
        );
        expect(copy.bindings.map((binding) => binding.path)).toEqual(
          envelope.bindings.map((binding) => binding.path),
        );
        expect(JSON.stringify(copy.definition.basePdf)).toContain(
          "{currentPage} / {totalPages}",
        );
      }
    });

  it("leaves no English words in a German copy", () => {
    setLocale("de", false);
    for (const { envelope } of demos) {
      const original = new Map(readable(envelope));
      const english = readable(galleryCopy(envelope)).filter(
        ([path, text]) =>
          original.get(path) === text && !sameInGerman.has(text),
      );
      expect(english).toEqual([]);
    }
  });

  it("names a French copy as the gallery shows it", () => {
    setLocale("fr", false);
    const quote = demos.find(({ id }) => id === "quote")!.envelope;
    const copy = galleryCopy(quote);
    expect(copy.name).toBe("Devis de démonstration");
    expect(copy.inputSchema.properties?.validUntil).toMatchObject({
      title: "Valable jusqu’au",
    });
    expect(
      copy.bindings.find((binding) => binding.block === "total"),
    ).toMatchObject({
      prefix: "Total proposé : ",
    });
  });

  it("keeps the original demo untouched", () => {
    setLocale("de", false);
    const envelope = templateGallery()[0].envelope;
    const before = JSON.stringify(envelope);
    galleryCopy(envelope);
    expect(JSON.stringify(envelope)).toBe(before);
  });
});
