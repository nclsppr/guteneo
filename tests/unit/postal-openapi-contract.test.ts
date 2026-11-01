import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/server/validators/ajv";
import {
  PINGEN_POSTAL_COUNTRY_CODES,
  PINGEN_LOCAL_PRINT_COUNTRIES,
} from "../../packages/contracts/src/postal-destinations";
import {
  postalRecipientSchema,
  type PostalRecipient,
} from "../../packages/contracts/src/postal-recipient";
import {
  PINGEN_PREFLIGHT_VERSION,
  PINGEN_ADDRESS_BLOCK_PREFLIGHT_VERSION,
  pingenPreflightVersion,
  pingenLayout,
  type PingenPreflightOptions,
} from "../../packages/contracts/src/pingen-preflight";
import {
  POSTAL_ADDRESS_PAGE_VERSION,
  POSTAL_ADDRESS_BLOCK_PAGE_VERSION,
} from "../../packages/contracts/src/postal-address-page";
import { postalReviewInputSchema } from "../../packages/contracts/src/postal-review";
import { postalAddressGuidance } from "../../packages/contracts/src/postal-requirements";
import { PINGEN_DESTINATION_RESTRICTIONS_URL } from "../../packages/providers/pingen-destination-availability";

const spec = JSON.parse(
  await readFile(
    new URL("../../apps/web/public/openapi.json", import.meta.url),
    "utf8",
  ),
);
const validator = new AjvJsonSchemaValidator();
const schema = (name: string) =>
  validator.getValidator({
    ...spec.components.schemas[name],
    components: spec.components,
  });
const options: PingenPreflightOptions = {
  country: "LU",
  defaultCountry: "LU",
  addressPosition: "left",
  printMode: "simplex",
  printSpectrum: "grayscale",
  deliveryProduct: "cheap",
};
const legacy: PostalRecipient = {
  name: "FICTIONAL RECIPIENT",
  line1: "RUE EXEMPLE 12",
  postalCode: "L-1234",
  city: "LUXEMBOURG",
  country: "LU",
};
const block: PostalRecipient = {
  country: "US",
  addressLines: [
    "FICTIONAL RECIPIENT",
    "EXAMPLE COMPANY",
    "SUITE 200",
    "123 EXAMPLE ROAD",
    "ANYTOWN CA 90210",
    "UNITED STATES OF AMERICA",
  ],
};
const destinations = {
  countries: [...PINGEN_POSTAL_COUNTRY_CODES],
  unavailableCountries: ["RU"],
  delayedCountries: ["NZ"],
  observedAt: "2026-11-01T12:00:00.000Z",
  expiresAt: "2026-11-01T12:05:00.000Z",
  sourceUrl: PINGEN_DESTINATION_RESTRICTIONS_URL,
  sourceSha256: "a".repeat(64),
};
function requirements(value: PingenPreflightOptions) {
  return {
    provider: "pingen",
    version: pingenPreflightVersion(value),
    qualified: true,
    country: value.country,
    destinations,
    profile: {
      defaultCountry: value.defaultCountry,
      addressPosition: value.addressPosition,
      addressPositions:
        value.defaultCountry === "FR" ? ["right"] : ["left", "right"],
    },
    layout: pingenLayout(value),
    addressGuidance: postalAddressGuidance(value),
    limits: {
      pdfBytes: 8_000_000,
      pages: 100,
      pageWidthMm: 210,
      pageHeightMm: 297,
      renderDpi: 144,
    },
    requirements: [
      "Fixture only: current provider and human review remain mandatory.",
    ],
    canSend: false,
  };
}

describe("worldwide postal OpenAPI contract", () => {
  it("publishes exactly the server's 250 country codes and the XZ provider spelling", () => {
    expect(spec.components.schemas.PostalCountry.enum).toEqual(
      PINGEN_POSTAL_COUNTRY_CODES,
    );
    const country = schema("PostalCountry");
    for (const code of PINGEN_POSTAL_COUNTRY_CODES)
      expect(country(code)).toMatchObject({ valid: true });
    for (const code of ["XK", "XX", "us", "USA"])
      expect(country(code).valid).toBe(false);
  });

  it("keeps the legacy shape and strict block arrays consistent with server Zod validation", () => {
    const recipient = schema("PostalRecipient");
    expect(spec.components.schemas.LegacyPostalRecipient.required).toEqual([
      "name",
      "line1",
      "postalCode",
      "city",
      "country",
    ]);
    for (const value of [legacy, block]) {
      expect(recipient(value)).toMatchObject({ valid: true });
      expect(postalRecipientSchema.parse(value)).toEqual(value);
    }
    for (const value of [
      { ...block, name: "MIXED" },
      { ...legacy, addressLines: ["RECIPIENT", "STREET", "USA"] },
      { ...block, addressLines: '["RECIPIENT","STREET","USA"]' },
      { ...block, addressLines: ["RECIPIENT", ""] },
      { ...block, addressLines: [" RECIPIENT", "STREET"] },
      { ...block, addressLines: ["RECIPIENT", "STREET\nHIDDEN LINE"] },
      { ...block, addressLines: Array(7).fill("LINE") },
      { ...block, country: "XK" },
      { ...legacy, country: "US" },
    ]) {
      expect(postalRecipientSchema.safeParse(value).success).toBe(false);
      expect(recipient(value).valid).toBe(false);
    }
    const input = {
      documentId: "document",
      senderId: "sender",
      recipient: block,
      options: {
        deliveryProduct: "cheap",
        printMode: "simplex",
        printSpectrum: "grayscale",
      },
      ceilingMinor: 500,
    };
    expect(schema("PostalPreflightInput")(input)).toMatchObject({
      valid: true,
    });
    expect(postalReviewInputSchema.parse(input)).toEqual(input);
    const pricingFlag = {
      ...input,
      options: { ...input.options, addressFormat: "address_block" },
    };
    expect(schema("PostalPreflightInput")(pricingFlag).valid).toBe(false);
    expect(postalReviewInputSchema.safeParse(pricingFlag).success).toBe(false);
  });

  it("accepts actual guidance for all country blocks and preserves each legacy guidance branch", () => {
    const guidance = schema("PostalAddressGuidance");
    for (const country of PINGEN_POSTAL_COUNTRY_CODES) {
      const value = postalAddressGuidance({
        ...options,
        country,
        addressFormat: "address_block",
      });
      expect(guidance(value), country).toMatchObject({ valid: true });
      expect(value.recipientSchema).toMatchObject({
        renderedLines: null,
        maxRenderedLines: 6,
      });
    }
    for (const country of ["FR", "LU", "DE"] as const)
      for (const defaultCountry of ["FR", "LU", "DE"] as const)
        expect(
          guidance(
            postalAddressGuidance({
              ...options,
              country,
              defaultCountry,
              addressPosition: defaultCountry === "FR" ? "right" : "left",
            }),
          ),
        ).toMatchObject({ valid: true });
    for (const country of PINGEN_LOCAL_PRINT_COUNTRIES)
      expect(
        guidance(
          postalAddressGuidance({
            ...options,
            country,
            defaultCountry: country,
            addressPosition: country === "FR" ? "right" : "left",
            addressFormat: "address_block",
          }),
        ),
      ).toMatchObject({ valid: true });
  });

  it("requires complete source observations and couples requirements versions to the address shape", () => {
    const validate = schema("PostalRequirements");
    for (const country of [
      "LU",
      "FR",
      "US",
      "GB",
      "JP",
      "HK",
      "AE",
      "XZ",
      "FJ",
      "UZ",
    ] as const)
      for (const addressFormat of [undefined, "address_block"] as const) {
        const value = requirements({
          ...options,
          country,
          ...(addressFormat ? { addressFormat } : {}),
        });
        expect(validate(value), `${country}:${addressFormat}`).toMatchObject({
          valid: true,
        });
        expect(
          validate({
            ...value,
            version:
              value.version === PINGEN_PREFLIGHT_VERSION
                ? PINGEN_ADDRESS_BLOCK_PREFLIGHT_VERSION
                : PINGEN_PREFLIGHT_VERSION,
          }).valid,
        ).toBe(false);
      }
    const validateDestinations = schema("PostalDestinations");
    expect(validateDestinations(destinations)).toMatchObject({ valid: true });
    for (const value of [
      { ...destinations, countries: destinations.countries.slice(1) },
      {
        ...destinations,
        countries: [...destinations.countries.slice(1), "US"],
      },
      { ...destinations, unavailableCountries: ["XK"] },
      { ...destinations, sourceSha256: "bad" },
      { ...destinations, observedAt: "not a timestamp" },
      { ...destinations, accountId: "private-account" },
    ])
      expect(validateDestinations(value).valid).toBe(false);
  });

  it("keeps page versions and preflight profile versions bound to their immutable recipient form", () => {
    const validate = schema("PostalAddressPageProvenance");
    const base = {
      id: "page",
      sourceDocumentId: "source",
      sourceSha256: "a".repeat(64),
      generatedDocumentId: "final",
      generatedSha256: "b".repeat(64),
      addressMode: "generated_address_page",
      printMode: "simplex",
      addedPages: 1,
    };
    for (const [recipient, version, profileVersion] of [
      [legacy, POSTAL_ADDRESS_PAGE_VERSION, PINGEN_PREFLIGHT_VERSION],
      [
        block,
        POSTAL_ADDRESS_BLOCK_PAGE_VERSION,
        PINGEN_ADDRESS_BLOCK_PREFLIGHT_VERSION,
      ],
    ] as const) {
      const value = {
        ...base,
        recipient,
        version,
        profile: {
          defaultCountry: "LU",
          addressPosition: "left",
          version: profileVersion,
        },
      };
      expect(validate(value)).toMatchObject({ valid: true });
      expect(
        validate({ ...value, recipient: recipient === legacy ? block : legacy })
          .valid,
      ).toBe(false);
      expect(
        validate({
          ...value,
          profile: {
            ...value.profile,
            version:
              profileVersion === PINGEN_PREFLIGHT_VERSION
                ? PINGEN_ADDRESS_BLOCK_PREFLIGHT_VERSION
                : PINGEN_PREFLIGHT_VERSION,
          },
        }).valid,
      ).toBe(false);
    }
  });

  it("publishes destinations under document-read authority and keeps format out of pricing options", () => {
    const read = spec.paths["/api/postal/destinations"].get;
    expect(read.security).toEqual([{ GuteneoOAuth: ["documents:read"] }]);
    expect(read.requestBody).toBeUndefined();
    expect(read.responses["200"].content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/PostalDestinations",
    });
    const fields = spec.paths["/api/postal/requirements"].get.parameters;
    expect(
      fields.find((field: { name: string }) => field.name === "country").schema,
    ).toEqual({ $ref: "#/components/schemas/PostalCountry" });
    expect(
      fields.find((field: { name: string }) => field.name === "addressFormat"),
    ).toMatchObject({ required: false, schema: { enum: ["address_block"] } });
    expect(
      spec.components.schemas.PostalPrintOptions.properties,
    ).not.toHaveProperty("addressFormat");
  });
});
