import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/server/validators/ajv";
import { postalAddressGuidance } from "../../packages/contracts/src/postal-requirements";
import {
  checkPingenAddress,
  type PingenPreflightOptions,
} from "../../packages/contracts/src/pingen-preflight";

const openapi = JSON.parse(
  readFileSync(
    new URL("../../apps/web/public/openapi.json", import.meta.url),
    "utf8",
  ),
);
const validateGuidance = new AjvJsonSchemaValidator().getValidator({
  ...openapi.components.schemas.PostalAddressGuidance,
  components: openapi.components,
});
function guidanceFor(options: PingenPreflightOptions) {
  const guidance = postalAddressGuidance(options);
  expect(validateGuidance(guidance)).toMatchObject({ valid: true });
  return guidance;
}

const options: PingenPreflightOptions = {
  defaultCountry: "LU",
  country: "LU",
  addressPosition: "left",
  printMode: "simplex",
  printSpectrum: "grayscale",
  deliveryProduct: "cheap",
};

describe("postal instructions for the actual recipient/account route", () => {
  it.each(["LU", "FR", "DE"] as const)(
    "returns a usable but explicitly fictional %s example for an LU organisation",
    (country) => {
      const config = { ...options, country };
      const guidance = guidanceFor(config);
      expect(guidance.example).toMatchObject({
        fictional: true,
        deliverabilityVerified: false,
      });
      expect(checkPingenAddress(guidance.example.printedLines, config)).toEqual(
        [],
      );
      expect(guidance.recipientSchema.additionalAddressLinesSupported).toBe(
        false,
      );
      expect(guidance.example.printedLines).toHaveLength(
        country === "LU" ? 3 : 4,
      );
      expect(guidance.addressRules.countryLine).toMatchObject({
        required: country !== "LU",
        value:
          country === "LU" ? null : country === "FR" ? "FRANCE" : "GERMANY",
      });
      expect(
        guidance.sources.every(
          (source) => new URL(source.url).hostname === "help.pingen.com",
        ),
      ).toBe(true);
    },
  );

  it("keeps domestic French punctuation/font rules separate from DHL France", () => {
    const domestic = guidanceFor({
      ...options,
      country: "FR",
      defaultCountry: "FR",
      addressPosition: "right",
    });
    const international = guidanceFor({ ...options, country: "FR" });
    expect(domestic).toMatchObject({
      route: "la_poste",
      recipientSchema: { renderedLines: 3 },
      addressRules: {
        cityUppercaseRequired: true,
        maxCharactersPerLine: 38,
        streetAndPostcodePunctuationAllowed: false,
      },
      typography: { providerCapitalHeightMm: { min: 1.8, max: 5 } },
    });
    expect(
      domestic.sources.some((source) =>
        source.url.endsWith("layout-requirements-french-organisations"),
      ),
    ).toBe(true);
    expect(international).toMatchObject({
      route: "dhl_international",
      addressRules: {
        latinAlphabetAndArabicDigits: { scope: "country_line_only" },
      },
      typography: { providerCapitalHeightMm: { min: 2.3, max: 4.7 } },
    });
    expect(international.addressRules).not.toHaveProperty(
      "maxCharactersPerLine",
    );
    expect(
      international.sources.some((source) =>
        source.url.endsWith("layout-requirements"),
      ),
    ).toBe(true);
  });

  it("uses the general geometry guidance for a French account sending to Germany", () => {
    const guidance = guidanceFor({
      ...options,
      country: "DE",
      defaultCountry: "FR",
      addressPosition: "right",
    });
    expect(guidance).toMatchObject({
      route: "deutsche_post",
      addressRules: {
        streetNumberOrder: "street_then_house_number",
        postcodeDigits: 5,
        houseNumberSupplementSeparator: "//",
      },
    });
    expect(
      guidance.sources.some((source) =>
        source.url.endsWith("layout-requirements"),
      ),
    ).toBe(true);
    expect(
      guidance.sources.some((source) =>
        source.url.endsWith("layout-requirements-french-organisations"),
      ),
    ).toBe(false);
  });

  it("never promotes text extraction or a private crop link into visual/delivery proof", () => {
    const guidance = guidanceFor(options);
    expect(guidance.verification).toMatchObject({
      textVisibility: "not_verified",
      addressCropAccess: "authenticated_browser_session_only",
      mcpEmbeddedVisualEvidenceAvailable: false,
      provesAddressExists: false,
      provesDelivery: false,
    });
    expect(guidance.verification.manual).toContain(
      "visible_recipient_matches_original_pdf",
    );
    expect(guidance.verification.manual).toContain(
      "complete_deliverable_address_and_street_number_order",
    );
    expect(guidance.typography.verification).toBe(
      "manual_visual_review_required",
    );
    expect(guidance.verification.automatic).not.toContain(
      "visible_recipient_matches_original_pdf",
    );
  });
});
