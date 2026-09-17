import { describe, expect, it } from "vitest";
import { degrees, PDFDocument, PDFName, StandardFonts } from "pdf-lib";
import {
  checkPingenAddress,
  checkPingenRaster,
  pingenLayout,
  preflightPingenPdf,
  PINGEN_MAX_BYTES,
  type PingenPreflightOptions,
} from "../../packages/contracts/src/pingen-preflight";

const options: PingenPreflightOptions = {
  defaultCountry: "LU",
  country: "LU",
  addressPosition: "left",
  printMode: "simplex",
  printSpectrum: "grayscale",
  deliveryProduct: "cheap",
};
const france = {
  ...options,
  defaultCountry: "FR",
  country: "FR",
  addressPosition: "right",
} satisfies PingenPreflightOptions;
const a4: [number, number] = [(210 * 72) / 25.4, (297 * 72) / 25.4];
async function pdf(change?: (doc: PDFDocument) => void | Promise<void>) {
  const document = await PDFDocument.create();
  document.addPage(a4);
  await change?.(document);
  return document.save();
}
function raster(page = 1) {
  const width = 1190,
    height = 1683;
  const rgba = new Uint8Array(width * height * 4).fill(255);
  const value = {
    width,
    height,
    rgba,
    page,
    expectedSha256: "a".repeat(64),
    sourceSha256: "a".repeat(64),
  };
  const mark = (x: number, y: number, grey = 0) => {
    const offset =
      (Math.floor((y * height) / 297) * width + Math.floor((x * width) / 210)) *
      4;
    rgba[offset] = rgba[offset + 1] = rgba[offset + 2] = grey;
  };
  return { value, mark };
}

describe("Pingen local preflight: no repair, no upload, no send authority", () => {
  it("uses actual PDF page geometry and exact-byte hash, retaining mandatory review", async () => {
    const bytes = await pdf((doc) => {
      doc.addPage(a4);
      doc.addPage(a4);
    });
    const original = bytes.slice();
    const result = await preflightPingenPdf(bytes, {
      ...options,
      printMode: "duplex",
    });
    expect(result).toMatchObject({
      status: "review_required",
      pages: 3,
      physicalSheets: 2,
      canSend: false,
      issues: [],
    });
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.requiredReviews).toContain("printed_recipient_matches");
    expect(result.requiredReviews).toContain("human_approval");
    expect(bytes).toEqual(original);
  });
  it("rejects non-PDF, truncated bytes and Pingen's stricter 8 MB limit", async () => {
    for (const bytes of [
      new Uint8Array(100),
      (await pdf()).slice(0, 100),
      new Uint8Array(PINGEN_MAX_BYTES + 1),
    ]) {
      expect((await preflightPingenPdf(bytes, options)).status).toBe("blocked");
    }
  });
  it("rejects a bad later page even when the first page is A4", async () => {
    const result = await preflightPingenPdf(
      await pdf((doc) => {
        doc.addPage([612, 792]);
      }),
      options,
    );
    expect(result.issues).toContainEqual({
      code: "POSTAL_A4_REQUIRED",
      page: 2,
    });
  });
  it("does not mistake rotation, crop and user-unit scaling for a safe A4 document", async () => {
    const result = await preflightPingenPdf(
      await pdf((doc) => {
        const page = doc.getPage(0);
        page.setRotation(degrees(90));
        page.setCropBox(10, 10, 500, 700);
        page.node.set(PDFName.of("UserUnit"), doc.context.obj(2));
      }),
      options,
    );
    expect(result.issues.map((x) => x.code)).toEqual(
      expect.arrayContaining([
        "POSTAL_CROP_UNSUPPORTED",
        "POSTAL_ROTATION_UNSUPPORTED",
        "POSTAL_USER_UNIT_UNSUPPORTED",
      ]),
    );
  });
  it("rejects interactive forms without flattening or discarding their values", async () => {
    const bytes = await pdf((doc) => {
      doc.getForm().createTextField("fixture").addToPage(doc.getPage(0));
    });
    const result = await preflightPingenPdf(bytes, options);
    expect(result.issues.map((x) => x.code)).toContain(
      "POSTAL_INTERACTIVE_FORM",
    );
    const reopened = await PDFDocument.load(bytes);
    expect(reopened.getForm().getFields()).toHaveLength(1);
  });
  it("rejects non-embedded fonts instead of assuming a successful render guarantees printing", async () => {
    const result = await preflightPingenPdf(
      await pdf(async (doc) => {
        const font = await doc.embedFont(StandardFonts.Helvetica);
        doc.getPage(0).drawText("FICTIONAL FIXTURE", { font });
      }),
      options,
    );
    expect(result.issues).toContainEqual({ code: "POSTAL_FONT_NOT_EMBEDDED" });
  });
  it("also inspects direct font dictionaries nested inside page resources", async () => {
    const result = await preflightPingenPdf(
      await pdf((doc) => {
        doc.getPage(0).node.set(
          PDFName.of("Resources"),
          doc.context.obj({
            Font: {
              InlineFont: {
                Type: "Font",
                Subtype: "Type1",
                BaseFont: "Helvetica",
              },
            },
          }),
        );
      }),
      options,
    );
    expect(result.issues).toContainEqual({ code: "POSTAL_FONT_NOT_EMBEDDED" });
  });
  it("keeps the existing 100-page Guteneo bound and rejects unknown options", async () => {
    const bytes = await pdf((doc) => {
      for (let i = 0; i < 100; i++) doc.addPage(a4);
    });
    expect((await preflightPingenPdf(bytes, options)).issues).toContainEqual({
      code: "POSTAL_PDF_INVALID",
    });
    expect(
      (
        await preflightPingenPdf(await pdf(), {
          ...options,
          deliveryProduct: "registered",
        } as unknown as PingenPreflightOptions)
      ).issues,
    ).toContainEqual({ code: "POSTAL_OPTIONS_INVALID" });
  });
});

describe("Pingen destination and organisation-dependent layout", () => {
  it("distinguishes domestic France, France via a non-French account, and international French-account mail", () => {
    expect(pingenLayout(france)).toMatchObject({
      profile: "france_domestic",
      address: { x: 110, y: 50, width: 80, height: 28 },
    });
    expect(pingenLayout({ ...options, country: "FR" }).profile).toBe("general");
    expect(pingenLayout({ ...france, country: "DE" })).toMatchObject({
      profile: "general",
      address: { x: 118, y: 60 },
    });
    expect(() =>
      pingenLayout({ ...france, addressPosition: "left" }),
    ).toThrow();
  });
  it("accepts a Luxembourg postcode syntax without treating it as deliverability evidence", () => {
    expect(
      checkPingenAddress(
        ["TEST NON EXPEDIABLE", "RUE FICTIVE 1", "L-1234 LUXEMBOURG"],
        options,
      ),
    ).toEqual([]);
    expect(
      checkPingenAddress(
        [
          "TEST NON EXPEDIABLE",
          "RUE FICTIVE 1",
          "L-1234 LUXEMBOURG",
          "LUXEMBOURG",
        ],
        options,
      ),
    ).toContainEqual({ code: "POSTAL_DOMESTIC_COUNTRY_LINE" });
  });
  it("requires the international country line and rejects country codes embedded in French/German postcodes", () => {
    const international = {
      ...options,
      country: "DE",
    } satisfies PingenPreflightOptions;
    expect(
      checkPingenAddress(
        ["FICTIONAL TEST", "FIKTIVE STRASSE 1", "12345 BERLIN"],
        international,
      ),
    ).toContainEqual({ code: "POSTAL_COUNTRY_LINE_REQUIRED" });
    expect(
      checkPingenAddress(
        ["FICTIONAL TEST", "FIKTIVE STRASSE 1", "DE-12345 BERLIN", "GERMANY"],
        international,
      ),
    ).toContainEqual({ code: "POSTAL_POSTCODE_LINE_INVALID" });
    expect(
      checkPingenAddress(
        ["FICTIONAL TEST", "FIKTIVE STRASSE 1", "12345 BERLIN", "GERMANY"],
        international,
      ),
    ).toEqual([]);
  });
  it.each([
    '"',
    "“",
    "”",
    "«",
    "»",
    "(",
    ")",
    "[",
    "]",
    "!",
    "?",
    "/",
    "#",
    "&",
    "§",
  ])(
    "rejects the documented Luxembourg character %s without rewriting the address",
    (character) => {
      const lines = [
        "DESTINATAIRE FICTIF",
        `RUE EXEMPLE ${character}12`,
        "L-1234 LUXEMBOURG",
      ];
      const original = [...lines];
      expect(checkPingenAddress(lines, options)).toContainEqual({
        code: "POSTAL_ADDRESS_CHARACTERS_UNSUPPORTED",
      });
      expect(lines).toEqual(original);
    },
  );
  it.each(["n°12", "N° 12", "nr 12", "Nr. 12"])(
    "rejects Luxembourg street-number marker %s",
    (marker) => {
      expect(
        checkPingenAddress(
          ["DESTINATAIRE FICTIF", `RUE EXEMPLE ${marker}`, "L-1234 LUXEMBOURG"],
          options,
        ),
      ).toContainEqual({ code: "POSTAL_ADDRESS_NUMBER_MARKER_UNSUPPORTED" });
    },
  );
  it.each(["LU", "DE"] as const)(
    "requires Latin letters and 0–9 digits for %s, while preserving accents",
    (country) => {
      const config = { ...options, country, defaultCountry: country };
      const postcode = country === "LU" ? "L-1234 LUXEMBOURG" : "12345 MÜNCHEN";
      for (const recipient of ["ИВАН", "EXEMPLE ١٢"])
        expect(
          checkPingenAddress([recipient, "RUE EXEMPLE 12", postcode], config),
        ).toContainEqual({ code: "POSTAL_ADDRESS_LATIN_REQUIRED" });
      expect(
        checkPingenAddress(
          ["ÉLODIE O'NEILL", "RUE SAINT-ÉTIENNE 12", postcode],
          config,
        ),
      ).toEqual([]);
    },
  );
  it("checks French-local street punctuation without applying it to names or DHL routes", () => {
    const lines = ["ÉLODIE O'NEILL", "12, RUE D'EXEMPLE", "12345 EXEMPLE"];
    expect(checkPingenAddress(lines, france)).toContainEqual({
      code: "POSTAL_STREET_PUNCTUATION",
    });
    expect(
      checkPingenAddress([lines[0], "12 RUE EXEMPLE", lines[2]], france),
    ).toEqual([]);
    expect(
      checkPingenAddress([...lines, "FRANCE"], { ...options, country: "FR" }),
    ).toEqual([]);
  });
  it("retains the documented German house-number supplement and optional Luxembourg prefix", () => {
    expect(
      checkPingenAddress(
        [
          "FIKTIVER EMPFÄNGER",
          "BEISPIELSTRASSE 12 // WOHNUNG 3",
          "12345 MÜNCHEN",
          "GERMANY",
        ],
        { ...options, country: "DE" },
      ),
    ).toEqual([]);
    expect(
      checkPingenAddress(
        ["NR EXEMPLE", "RUE EXEMPLE 12", "1234 LUXEMBOURG"],
        options,
      ),
    ).toEqual([]);
  });
  it("rejects blank/injected lines and domestic French lowercase city or overlong lines", () => {
    expect(
      checkPingenAddress(["TEST", "", "12345 PARIS"], france),
    ).toContainEqual({ code: "POSTAL_ADDRESS_INVALID" });
    expect(
      checkPingenAddress(
        ["TEST\nSECOND", "1 RUE FICTIVE", "12345 PARIS"],
        france,
      ),
    ).toContainEqual({ code: "POSTAL_ADDRESS_INVALID" });
    expect(
      checkPingenAddress(
        ["X".repeat(39), "1 RUE FICTIVE", "12345 Paris"],
        france,
      ).map((x) => x.code),
    ).toEqual(
      expect.arrayContaining([
        "POSTAL_ADDRESS_LINE_TOO_LONG",
        "POSTAL_CITY_UPPERCASE_REQUIRED",
      ]),
    );
  });
});

describe("deterministic reserved-area check of trusted final raster", () => {
  it("accepts ink inside address/body but checks postage separately, including pale ink", () => {
    const image = raster();
    image.mark(25, 64);
    image.mark(30, 120);
    expect(checkPingenRaster(image.value, options)).toEqual([]);
    image.mark(25, 45, 254);
    expect(checkPingenRaster(image.value, options)).toContainEqual({
      code: "POSTAL_POSTAGE_CONTENT",
      page: 1,
    });
  });
  it("checks edge and corner on later pages without requiring another address", () => {
    const image = raster(2);
    image.mark(30, 120);
    expect(checkPingenRaster(image.value, options)).toEqual([]);
    image.mark(10, 287);
    image.mark(209, 140);
    expect(checkPingenRaster(image.value, options)).toEqual(
      expect.arrayContaining([
        { code: "POSTAL_CORNER_CONTENT", page: 2 },
        { code: "POSTAL_EDGE_CONTENT", page: 2 },
      ]),
    );
  });
  it("checks the French safe zone and top-right corner, not the general bottom-left corner", () => {
    const image = raster();
    image.mark(115, 55);
    image.mark(10, 287);
    expect(checkPingenRaster(image.value, france)).toEqual([]);
    image.mark(195, 10);
    image.mark(95, 40);
    expect(checkPingenRaster(image.value, france)).toEqual(
      expect.arrayContaining([
        { code: "POSTAL_CORNER_CONTENT", page: 1 },
        { code: "POSTAL_POSTAGE_CONTENT", page: 1 },
      ]),
    );
  });
  it("rejects blank address, hash substitution, insufficient resolution and unflattened alpha", () => {
    const image = raster();
    expect(checkPingenRaster(image.value, options)).toContainEqual({
      code: "POSTAL_ADDRESS_EMPTY",
      page: 1,
    });
    expect(
      checkPingenRaster(
        { ...image.value, sourceSha256: "b".repeat(64) },
        options,
      ),
    ).toEqual([{ code: "POSTAL_RENDER_HASH_MISMATCH" }]);
    expect(
      checkPingenRaster({ ...image.value, width: 210, height: 297 }, options),
    ).toEqual([{ code: "POSTAL_RENDER_INVALID", page: 1 }]);
    image.value.rgba[3] = 0;
    expect(checkPingenRaster(image.value, options)).toContainEqual({
      code: "POSTAL_RENDER_NOT_FLATTENED",
      page: 1,
    });
  });
});
