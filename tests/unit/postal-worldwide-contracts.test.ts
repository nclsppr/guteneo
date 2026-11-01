import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../../packages/domain/src/index";
import {
  validateCsv,
  validateRecipient,
} from "../../packages/contracts/src/content";
import {
  PINGEN_LOCAL_PRINT_COUNTRIES,
  PINGEN_POSTAL_COUNTRY_CODES,
  PINGEN_POSTAL_DESTINATIONS_SOURCE,
  isPingenPostalCountry,
  isPostalCountryLine,
  postalAddressRuleRoute,
  postalCountryAliases,
  postalCountryLineRequired,
  postalCountryName,
  postalCountryNameLanguage,
} from "../../packages/contracts/src/postal-destinations";
import { postalRecipientSchema } from "../../packages/contracts/src/postal-recipient";
import { postalReviewInputSchema } from "../../packages/contracts/src/postal-review";
import {
  POSTAL_ADDRESS_PAGE_VERSION,
  POSTAL_ADDRESS_BLOCK_PAGE_VERSION,
  postalAddressLines,
  postalAddressPageVersion,
} from "../../packages/contracts/src/postal-address-page";
import {
  PINGEN_PREFLIGHT_VERSION,
  PINGEN_ADDRESS_BLOCK_PREFLIGHT_VERSION,
  checkPingenAddress,
  pingenPreflightVersion,
  type PingenPreflightOptions,
} from "../../packages/contracts/src/pingen-preflight";
import { postalAddressGuidance } from "../../packages/contracts/src/postal-requirements";
import { distributionEntrySchema } from "../../packages/contracts/src/template-workflow";

const options: PingenPreflightOptions = {
  country: "LU",
  defaultCountry: "LU",
  addressPosition: "left",
  printMode: "simplex",
  printSpectrum: "grayscale",
  deliveryProduct: "cheap",
};
const legacy = {
  name: "FIXTURE RECIPIENT",
  line1: "1 RUE EXEMPLE",
  postalCode: "L-1234",
  city: "LUXEMBOURG",
  country: "LU" as const,
};
const blockExamples = [
  {
    country: "US",
    addressLines: [
      "Fixture Recipient",
      "123 Example Street",
      "Example City CA 12345",
      "UNITED STATES",
    ],
  },
  {
    country: "GB",
    addressLines: [
      "Fixture Recipient",
      "12 Example Street",
      "Example City",
      "AB1 2CD",
      "UNITED KINGDOM",
    ],
  },
  {
    country: "JP",
    addressLines: [
      "Fixture Recipient",
      "1-2-3 Example",
      "Example-shi, Example 123-4567",
      "JAPAN",
    ],
  },
  {
    country: "HK",
    addressLines: [
      "Fixture Recipient",
      "12 Example Street",
      "Kowloon",
      "HONG KONG",
    ],
  },
  {
    country: "AE",
    addressLines: [
      "Fixture Recipient",
      "PO Box 12345",
      "Dubai",
      "UNITED ARAB EMIRATES",
    ],
  },
  {
    country: "XZ",
    addressLines: [
      "Fixture Recipient",
      "Example Street 12",
      "10000 Example City",
      "KOSOVO",
    ],
  },
] as const;

describe("provider-published postal country contract", () => {
  it("retains all 250 codes and 557 aliases as spellings rather than availability", () => {
    expect(PINGEN_POSTAL_COUNTRY_CODES).toHaveLength(250);
    expect(new Set(PINGEN_POSTAL_COUNTRY_CODES).size).toBe(250);
    expect(
      PINGEN_POSTAL_COUNTRY_CODES.reduce(
        (n, c) => n + postalCountryAliases(c).length,
        0,
      ),
    ).toBe(557);
    expect(
      createHash("sha256")
        .update(
          JSON.stringify(
            PINGEN_POSTAL_COUNTRY_CODES.map((country) => [
              country,
              postalCountryAliases(country),
            ]),
          ),
        )
        .digest("hex"),
    ).toBe("9972d98b45c7121a43a6597b91d2b28c82f19adb6e8567a2a3075e7556472e97");
    expect(isPingenPostalCountry("XZ")).toBe(true);
    expect(isPingenPostalCountry("XK")).toBe(false);
    expect(isPingenPostalCountry("ZZ")).toBe(false);
    expect(isPingenPostalCountry("us")).toBe(false);
    expect(PINGEN_POSTAL_DESTINATIONS_SOURCE).toMatchObject({
      url: "https://help.pingen.com/en/templates-and-postal-requirements/supported-country-names",
      snapshotSha256:
        "8b001521cd1fa030f1797ddcff154be87486199b93376648ca57ee7aaa8bdcd1",
    });
    expect(PINGEN_POSTAL_DESTINATIONS_SOURCE.meaning).toContain(
      "not delivery availability",
    );
  });

  it("prints only source-accepted names, with explicit German exceptions", () => {
    for (const country of PINGEN_POSTAL_COUNTRY_CODES) {
      expect(isPostalCountryLine(postalCountryName(country), country)).toBe(
        true,
      );
      expect(["en", "de"]).toContain(postalCountryNameLanguage(country));
    }
    expect(postalCountryName("TR")).toBe("TURKEY");
    expect(postalCountryName("CI")).toBe("IVORY COAST");
    expect(postalCountryName("FJ")).toBe("FIDSCHI");
    expect(postalCountryNameLanguage("FJ")).toBe("de");
    expect(postalCountryName("UZ")).toBe("USBEKISTAN");
    expect(postalCountryNameLanguage("UZ")).toBe("de");
    expect(isPostalCountryLine("United States", "US")).toBe(false);
    expect(isPostalCountryLine("CANADA", "US")).toBe(false);
  });

  it("omits a domestic country line only for the ten local-print defaults", () => {
    expect(PINGEN_LOCAL_PRINT_COUNTRIES).toHaveLength(10);
    for (const country of PINGEN_LOCAL_PRINT_COUNTRIES)
      expect(postalCountryLineRequired(country, country)).toBe(false);
    expect(postalCountryLineRequired("PL", "PL")).toBe(true);
    expect(postalCountryLineRequired("US", "US")).toBe(true);
    expect(postalCountryLineRequired("GB", "LU")).toBe(true);
    expect(postalAddressRuleRoute("CH", "LU")).toBe(
      "provider_country_specific",
    );
    expect(postalAddressRuleRoute("US", "LU")).toBe("dhl_international");
  });
});

describe("immutable legacy and complete international address contracts", () => {
  it("preserves the legacy normalized JSON, hash, lines and versions exactly", () => {
    const recipient = validateRecipient("postal", legacy);
    expect(recipient).toEqual(legacy);
    expect(Object.keys(recipient)).toEqual([
      "name",
      "line1",
      "postalCode",
      "city",
      "country",
    ]);
    const json = canonicalJson(recipient);
    expect(json).toBe(
      '{"city":"LUXEMBOURG","country":"LU","line1":"1 RUE EXEMPLE","name":"FIXTURE RECIPIENT","postalCode":"L-1234"}',
    );
    expect(createHash("sha256").update(json).digest("hex")).toBe(
      "48b7201711825e659171c7d70ea0a57ca721a88182d19a77bd3fe9cd8bfab087",
    );
    expect(postalAddressLines(recipient, "LU")).toEqual([
      "FIXTURE RECIPIENT",
      "1 RUE EXEMPLE",
      "L-1234 LUXEMBOURG",
    ]);
    expect(postalAddressLines(recipient, "DE")).toEqual([
      "FIXTURE RECIPIENT",
      "1 RUE EXEMPLE",
      "L-1234 LUXEMBOURG",
      "LUXEMBOURG",
    ]);
    expect(postalAddressPageVersion(recipient)).toBe(
      POSTAL_ADDRESS_PAGE_VERSION,
    );
    expect(pingenPreflightVersion(options)).toBe(PINGEN_PREFLIGHT_VERSION);
    expect(postalReviewInputSchema.shape.recipient.parse(legacy)).toEqual(
      legacy,
    );
  });

  it.each(blockExamples)(
    "preserves every $country printed line without imposing five postcode digits",
    (input) => {
      const original = JSON.stringify(input);
      const recipient = postalRecipientSchema.parse(input);
      expect(validateRecipient("postal", input)).toEqual(input);
      expect(postalAddressLines(recipient, "LU")).toEqual(input.addressLines);
      expect(JSON.stringify(input)).toBe(original);
      const config = {
        ...options,
        country: input.country,
        addressFormat: "address_block" as const,
      };
      expect(checkPingenAddress([...input.addressLines], config)).toEqual([]);
      expect(postalAddressPageVersion(recipient)).toBe(
        POSTAL_ADDRESS_BLOCK_PAGE_VERSION,
      );
      expect(pingenPreflightVersion(config)).toBe(
        PINGEN_ADDRESS_BLOCK_PREFLIGHT_VERSION,
      );
      expect(
        pingenPreflightVersion({ ...options, country: input.country }),
      ).toBe(PINGEN_ADDRESS_BLOCK_PREFLIGHT_VERSION);
    },
  );

  it("keeps accepted alias spelling in a German address block while checking its syntax", () => {
    const addressLines = [
      "Fixture Recipient",
      "Example Street 12",
      "12345 Berlin",
      "DEUTSCHLAND",
    ];
    const recipient = postalRecipientSchema.parse({
      country: "DE",
      addressLines,
    });
    expect(
      checkPingenAddress(addressLines, {
        ...options,
        country: "DE",
        addressFormat: "address_block",
      }),
    ).toEqual([]);
    expect(postalAddressLines(recipient, "LU")).toEqual(addressLines);
    expect(
      pingenPreflightVersion({
        ...options,
        country: "DE",
        addressFormat: "address_block",
      }),
    ).toBe(PINGEN_ADDRESS_BLOCK_PREFLIGHT_VERSION);
  });

  it("refuses wrong, missing or unneeded country lines", () => {
    const us = { ...options, country: "US" as const };
    expect(
      checkPingenAddress(["Fixture", "Complete address", "CANADA"], us),
    ).toContainEqual({ code: "POSTAL_COUNTRY_LINE_REQUIRED" });
    expect(
      checkPingenAddress(["Fixture", "Complete address"], us),
    ).toContainEqual({ code: "POSTAL_COUNTRY_LINE_REQUIRED" });
    expect(
      checkPingenAddress(
        ["Fixture", "Example Street 12", "12345 Berlin", "GERMANY"],
        {
          ...options,
          country: "DE",
          defaultCountry: "DE",
          addressFormat: "address_block",
        },
      ),
    ).toContainEqual({ code: "POSTAL_DOMESTIC_COUNTRY_LINE" });
    expect(
      checkPingenAddress(["Fixture", "Complete address", "UNITED STATES"], {
        ...us,
        defaultCountry: "US",
      }),
    ).toEqual([]);
    expect(
      checkPingenAddress(["Fixture", "Complete address", "GERMANY"], {
        ...options,
        country: "CH",
        defaultCountry: "CH",
      }),
    ).toContainEqual({ code: "POSTAL_COUNTRY_LINE_MISMATCH" });
  });

  it("rejects mixed forms, control characters, outer whitespace and seventh lines", () => {
    const valid = {
      country: "US",
      addressLines: ["Fixture", "Complete address", "UNITED STATES"],
    };
    for (const input of [
      { ...legacy, addressLines: valid.addressLines },
      { ...valid, line1: "Do not silently discard me" },
      { ...valid, addressLines: ["Fixture", " ", "UNITED STATES"] },
      {
        ...valid,
        addressLines: [" Fixture", "Complete address", "UNITED STATES"],
      },
      {
        ...valid,
        addressLines: ["Fixture", "Complete\naddress", "UNITED STATES"],
      },
      {
        ...valid,
        addressLines: [
          "One",
          "Two",
          "Three",
          "Four",
          "Five",
          "Six",
          "UNITED STATES",
        ],
      },
    ]) {
      expect(postalRecipientSchema.safeParse(input).success).toBe(false);
      expect(() => validateRecipient("postal", input)).toThrow();
    }
  });

  it("accepts a complete JSON addressLines CSV column without dropping mixed address data", () => {
    const addressLines = ["Fixture", "Complete address", "UNITED STATES"];
    const quote = (s: string) => `"${s.replaceAll('"', '""')}"`;
    const csv = `channel,country,addressLines\npostal,US,${quote(JSON.stringify(addressLines))}`;
    const parsed = validateCsv(csv);
    expect(parsed.valid).toBe(true);
    expect(parsed.rows[0].recipient).toEqual({ country: "US", addressLines });
    const mixed = `channel,country,name,addressLines\npostal,US,Required information,${quote(JSON.stringify(addressLines))}`;
    expect(validateCsv(mixed)).toMatchObject({ valid: false, rows: [] });
  });

  it("preserves legacy CSV rows under a shared addressLines header while keeping blocks strict", () => {
    const addressLines = ["Fixture", "Complete address", "UNITED STATES"];
    const quote = (s: string) => `"${s.replaceAll('"', '""')}"`;
    const oldRow = `postal,LU,${legacy.name},${legacy.line1},${legacy.postalCode},${legacy.city}`;
    const old = validateCsv(
      `channel,country,name,line1,postalCode,city\n${oldRow}`,
    );
    const shared = validateCsv(
      `channel,country,name,line1,postalCode,city,addressLines\n${oldRow},\npostal,US,,,,,${quote(JSON.stringify(addressLines))}\n${oldRow},   `,
    );
    expect(old.valid).toBe(true);
    expect(shared.rows[0]).toEqual(old.rows[0]);
    expect(shared.rows[1].recipient).toEqual({ country: "US", addressLines });
    expect(shared.errors).toEqual([]);
    expect(shared.duplicates).toEqual([{ line: 4, duplicateOf: 2 }]);
    expect(shared.rows[2].recipient).toEqual(old.rows[0].recipient);
    expect(canonicalJson(shared.rows[0].recipient)).toBe(
      canonicalJson(old.rows[0].recipient),
    );

    for (const country of ["FR", "US"])
      for (const empty of ["", "   ", "[]"])
        expect(
          validateCsv(
            `channel,country,name,line1,postalCode,city,addressLines\npostal,${country},,,,,${quote(empty)}`,
          ),
        ).toMatchObject({ valid: false, rows: [], errors: [{ line: 2 }] });
    // Empty block values in JSON are not CSV placeholders, even with legacy fields.
    expect(() =>
      validateRecipient("postal", { ...legacy, addressLines: "" }),
    ).toThrow();
  });

  it("describes variable address blocks and keeps unverified national formatting explicit", () => {
    const guidance = postalAddressGuidance({ ...options, country: "US" });
    expect(guidance.recipientSchema).toMatchObject({
      fields: ["country", "addressLines"],
      renderedLines: null,
      maxRenderedLines: 6,
      additionalAddressLinesSupported: true,
    });
    expect(guidance.addressRules).toMatchObject({
      postcodeValidation: "provider_and_human_review_required",
      countryLine: { value: "UNITED STATES", required: true },
    });
    expect(guidance.verification.automatic).not.toContain(
      "country_and_postcode_syntax",
    );
    expect(guidance.example).toMatchObject({
      fictional: true,
      deliverabilityVerified: false,
      destinationFormattingVerified: false,
    });
    expect(
      checkPingenAddress(guidance.example.printedLines, {
        ...options,
        country: "US",
      }),
    ).toEqual([]);
  });

  it("preserves a common postal block and its field mappings without stringifying lines", () => {
    const common = distributionEntrySchema.parse({
      entryId: "postal-common",
      recordId: "fixture-record",
      channel: "postal",
      recipient: blockExamples[0],
    });
    expect(common.recipient).toEqual(blockExamples[0]);
    expect(Array.isArray(common.recipient?.addressLines)).toBe(true);
    const mapped = distributionEntrySchema.parse({
      entryId: "postal-mapped",
      recordId: "fixture-record",
      channel: "postal",
      recipientFields: {
        country: "person.country",
        addressLines: "person.addressLines",
      },
    });
    expect(mapped.recipientFields).toEqual({
      country: "person.country",
      addressLines: "person.addressLines",
    });
  });

  it("refuses a postal block assigned to another explicit channel or mixed with legacy fields", () => {
    for (const input of [
      { channel: "email", recipient: blockExamples[0] },
      {
        channel: "postal",
        recipient: { ...blockExamples[0], name: "Never discard this value" },
      },
    ])
      expect(
        distributionEntrySchema.safeParse({
          entryId: "invalid-common",
          recordId: "fixture-record",
          ...input,
        }).success,
      ).toBe(false);
  });
});
