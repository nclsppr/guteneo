import {
  PINGEN_ADDRESS_BLOCK_PREFLIGHT_VERSION,
  pingenPreflightVersion,
  type PingenPreflightOptions,
} from "./pingen-preflight";
import {
  PINGEN_LOCAL_PRINT_COUNTRIES,
  PINGEN_POSTAL_DESTINATIONS_SOURCE,
  postalCountryAliases,
  postalCountryLineRequired,
  postalCountryName,
  postalCountryNameLanguage,
  postalAddressRuleRoute,
} from "./postal-destinations";

const help = "https://help.pingen.com/en/templates-and-postal-requirements/";
/** The French account profile only supports right-window envelopes. */
export function postalAddressPositions(
  defaultCountry: string,
): ("left" | "right")[] {
  return defaultCountry === "FR" ? ["right"] : ["left", "right"];
}

const countries = { FR: "FRANCE", LU: "LUXEMBOURG", DE: "GERMANY" } as const;

/** Public instructions only: no account ID, document content or authority is returned. */
export function postalAddressGuidance(options: PingenPreflightOptions) {
  return pingenPreflightVersion(options) ===
    PINGEN_ADDRESS_BLOCK_PREFLIGHT_VERSION
    ? postalAddressBlockGuidance(options)
    : legacyPostalAddressGuidance(options);
}

function legacyPostalAddressGuidance(options: PingenPreflightOptions) {
  const { country, defaultCountry } = options;
  const domestic = country === defaultCountry;
  const frenchLocal = country === "FR" && defaultCountry === "FR";
  const route =
    country === "FR"
      ? frenchLocal
        ? "la_poste"
        : "dhl_international"
      : country === "LU"
        ? "bpost_luxembourg"
        : "deutsche_post";
  const countryLine = domestic
    ? null
    : countries[country as keyof typeof countries];
  const exampleRecipient = {
    name: "SYNTHETIC RECIPIENT",
    line1:
      country === "FR"
        ? "12 RUE EXEMPLE"
        : country === "DE"
          ? "BEISPIELSTRASSE 12"
          : "RUE EXEMPLE 12",
    postalCode: country === "LU" ? "L-1234" : "12345",
    city: "EXEMPLE",
    country,
  };
  const typography = {
    recommendedFont: "Arial or Helvetica, embedded, regular",
    guteneoRecommendedSizePt: { min: 10, max: 12 },
    color: "black",
    alignment: "left",
    uniformFontAndSpacing: true,
    forbiddenStyles: [
      "italic",
      "decorative",
      "serif",
      "connected_letters",
      "shadow",
      "underlined",
      "framed",
    ],
    ...(country === "LU" || frenchLocal ? { boldAllowed: false } : {}),
    ...(country === "LU"
      ? { providerFontSizePt: { min: 8, max: 12 } }
      : {
          providerCapitalHeightMm: frenchLocal
            ? { min: 1.8, max: 5 }
            : { min: 2.3, max: 4.7 },
          characterGapMm: frenchLocal
            ? { min: 0.3, max: 2 }
            : { min: 0.2, max: 0.4 },
          wordGapMm: { min: 1, max: frenchLocal ? 2 : 4 },
          lineGapMm: { min: frenchLocal ? 1 : 0.5, max: 2.5 },
        }),
    verification: "manual_visual_review_required",
  };
  return {
    destination: country,
    route,
    recipientSchema: {
      fields: ["name", "line1", "postalCode", "city", "country"],
      renderedLines: countryLine ? 4 : 3,
      additionalAddressLinesSupported: false,
      maxCharactersPerPrintedLine: frenchLocal ? 38 : 160,
      lineOrder: [
        "recipient.name",
        "recipient.line1",
        "recipient.postalCode + space + recipient.city",
        ...(countryLine ? [countryLine] : []),
      ],
      limitations: [
        "The current schema accepts a name and a single street or post-office-box line. It cannot represent an additional department, building, floor or address-complement line.",
        "Never remove necessary information to fit this schema. Explain that the complete address format is unsupported and ask for a complete representable address without inventing content.",
        "The address must already be printed in the original PDF. MCP fields compare it; they do not add or move it.",
      ],
    },
    addressRules: {
      streetNumberOrder:
        country === "FR"
          ? "house_number_then_street"
          : "street_then_house_number",
      postcodeDigits: country === "LU" ? 4 : 5,
      postcodePrefix:
        country === "LU"
          ? "L- recommended; bare four digits also accepted"
          : "none; ISO country prefix forbidden",
      postcodeAndCitySeparator: "single space",
      countryLine: {
        required: !domestic,
        value: countryLine,
        domesticCountryLineForbidden: domestic,
      },
      blankLinesAllowed: false,
      additionalContentInsideAddressAreaAllowed: false,
      latinAlphabetAndArabicDigits: {
        scope:
          country === "LU" || country === "DE"
            ? "all_address_lines"
            : route === "dhl_international"
              ? "country_line_only"
              : "not_specified_here",
      },
      ...(frenchLocal
        ? {
            cityUppercaseRequired: true,
            maxCharactersPerLine: 38,
            streetAndPostcodePunctuationAllowed: false,
            providerAddressLines: { min: 3, max: 6 },
          }
        : { cityUppercaseRecommended: true }),
      ...(country === "LU"
        ? {
            forbiddenCharacters: [
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
            ],
            forbiddenStreetNumberMarkers: ["n°", "nr"],
            providerAddressLines: { min: 3, max: 6 },
          }
        : {}),
      ...(country === "DE"
        ? {
            houseNumberSupplementSeparator: "//",
            specialLargeRecipientAddressesSupported: false,
            providerMinimumNormalAddressLines: 3,
          }
        : {}),
      ...(route === "dhl_international"
        ? {
            countryNameLanguage: "English; Guteneo canonical spelling",
            providerMinimumLinesExcludingCountry: 2,
            guteneoMinimumLinesExcludingCountry: 3,
          }
        : {}),
    },
    typography,
    example: {
      fictional: true,
      deliverabilityVerified: false,
      recipient: exampleRecipient,
      printedLines: [
        exampleRecipient.name,
        exampleRecipient.line1,
        `${exampleRecipient.postalCode} ${exampleRecipient.city}`,
        ...(countryLine ? [countryLine] : []),
      ],
    },
    verification: {
      automatic: [
        "exact_private_pdf_hash_and_scan",
        "all_pages_rendered",
        "a4_dimensions_and_8mb_100page_limits",
        "embedded_fonts_and_no_active_content",
        "white_page_edges_and_reserved_zones",
        "address_present_inside_window",
        "approximate_text_bounds_and_overlap",
        "extracted_address_matches_recipient",
        "country_and_postcode_syntax",
        "supported_country_specific_syntax",
      ],
      manual: [
        "visible_recipient_matches_original_pdf",
        "font_style_black_color_and_size",
        "left_alignment_and_uniform_character_word_line_spacing",
        "no_visual_blank_lines_or_hidden_overlaid_text",
        "complete_deliverable_address_and_street_number_order",
        "return_address_and_all_page_content",
      ],
      provider: [
        "same_detected_address_and_country",
        "draft_analysis_complete_and_submit_ability_ok",
        "supported_paper_and_print_options",
        "current_exact_quote",
      ],
      provesAddressExists: false,
      provesDelivery: false,
      textVisibility: "not_verified",
      addressCropAccess: "authenticated_browser_session_only",
      mcpEmbeddedVisualEvidenceAvailable: false,
      visualReviewFallback:
        "MCP returns extracted text and private links, not an OAuth-readable image. Inspect the original PDF after checking its hash or use reviewUrl in Guteneo; never claim to have seen an inaccessible excerpt.",
    },
    workflow: [
      "get_postal_requirements",
      "import_document (exact PDF, then ready)",
      "preflight_postal_pdf",
      "get_postal_preflight (stop on blocked/failed/incomplete/mismatch)",
      "visual review of exact original",
      "browser transfer consent OR transfer_postal_draft under an existing separate expert mandate",
      "quote_postal_draft",
      "standard browser approval OR review_dispatch and approve_and_send_dispatch under an existing expert mandate",
    ],
    sources: [
      { title: "PDF standards", url: `${help}letter-standards` },
      {
        title: "Envelope window and reserved areas",
        url: `${help}${frenchLocal ? "layout-requirements-french-organisations" : "layout-requirements"}`,
      },
      {
        title: "Destination address requirements",
        url: `${help}${route === "bpost_luxembourg" ? "address-requirements-bpost-luxembourg" : route === "deutsche_post" ? "address-requirements-deutsche-post" : route === "la_poste" ? "address-requirements-la-poste" : "address-requirements-dhl-international"}`,
      },
      ...(country === "FR" && !frenchLocal
        ? [
            {
              title: "France from a non-French organisation uses DHL",
              url: `${help}address-requirements-la-poste`,
            },
          ]
        : []),
    ],
    sourcesVerifiedAt: "2026-09-17",
  };
}

function postalAddressBlockGuidance(options: PingenPreflightOptions) {
  const { country, defaultCountry } = options;
  const knownLegacyCountry = ["FR", "LU", "DE"].includes(country);
  const countryRequired = postalCountryLineRequired(country, defaultCountry);
  const legacy = legacyPostalAddressGuidance(
    knownLegacyCountry
      ? options
      : { ...options, country: "FR", defaultCountry: "LU" },
  );
  const localGuide: Partial<Record<string, string>> = {
    CH: "address-requirements-swiss-post",
    AT: "address-requirements-osterreichische-post",
    NL: "address-requirements-postnl",
    BE: "address-requirements-bpost",
    GB: "address-requirements-royal-mail",
    ES: "address-requirements-for-hispapost-correos-spain",
  };
  const localDestination = PINGEN_LOCAL_PRINT_COUNTRIES.some(
    (value) => value === country,
  );
  const route = postalAddressRuleRoute(country, defaultCountry);
  const typography =
    knownLegacyCountry || !localDestination
      ? legacy.typography
      : {
          recommendedFont: legacy.typography.recommendedFont,
          guteneoRecommendedSizePt: legacy.typography.guteneoRecommendedSizePt,
          color: legacy.typography.color,
          alignment: legacy.typography.alignment,
          uniformFontAndSpacing: true,
          forbiddenStyles: legacy.typography.forbiddenStyles,
          verification: "manual_visual_review_required",
        };
  const examples: Partial<Record<string, string[]>> = {
    US: ["SYNTHETIC RECIPIENT", "123 EXAMPLE STREET", "EXAMPLE CITY CA 12345"],
    GB: ["SYNTHETIC RECIPIENT", "12 EXAMPLE STREET", "EXAMPLE CITY", "AB1 2CD"],
    JP: [
      "SYNTHETIC RECIPIENT",
      "1-2-3 EXAMPLE",
      "EXAMPLE-SHI, EXAMPLE 123-4567",
    ],
    HK: ["SYNTHETIC RECIPIENT", "12 EXAMPLE STREET", "KOWLOON"],
    AE: ["SYNTHETIC RECIPIENT", "PO BOX 12345", "DUBAI"],
    XZ: ["SYNTHETIC RECIPIENT", "EXAMPLE STREET 12", "10000 EXAMPLE CITY"],
  };
  const printedLines = knownLegacyCountry
    ? [...legacy.example.printedLines]
    : [
        ...(examples[country] ?? [
          "SYNTHETIC RECIPIENT",
          "COMPLETE LOCAL ADDRESS",
          "COMPLETE LOCALITY LINE",
        ]),
        ...(countryRequired ? [postalCountryName(country)] : []),
      ];
  return {
    destination: country,
    route,
    recipientSchema: {
      fields: ["country", "addressLines"],
      renderedLines: null,
      minRenderedLines: countryRequired ? 3 : 2,
      maxRenderedLines: 6,
      additionalAddressLinesSupported: true,
      maxCharactersPerPrintedLine:
        country === "FR" && defaultCountry === "FR" ? 38 : 160,
      lineOrder: ["recipient.addressLines (complete printed block, unchanged)"],
      limitations: [
        "Supply the complete printed address, including the recipient name and the country line when required. Do not also supply legacy address fields.",
        "Guteneo preserves every supplied line. It does not translate, transliterate, reorder, truncate, complete or silently repair an address.",
        "Six printed lines are Guteneo's current input limit. The destination's own postal requirements and the actual envelope window may impose tighter limits.",
        "Country spellings do not prove current delivery availability. Current provider restrictions, document analysis and the exact calculator quote remain separate checks.",
        "The address must already be printed in the original PDF. These fields compare it; they do not add or move it.",
      ],
    },
    addressRules: {
      format: "complete_destination_formatted_block",
      postcodeValidation: knownLegacyCountry
        ? "supported_legacy_country_syntax"
        : "provider_and_human_review_required",
      countryLine: {
        required: countryRequired,
        value: countryRequired ? postalCountryName(country) : null,
        acceptedNames: postalCountryAliases(country),
        canonicalNameLanguage: postalCountryNameLanguage(country),
        domesticCountryLineForbidden: !countryRequired,
      },
      blankLinesAllowed: false,
      additionalContentInsideAddressAreaAllowed: false,
      latinAlphabetAndArabicDigits: {
        scope:
          country === "LU" || country === "DE"
            ? "all_address_lines"
            : route === "dhl_international"
              ? "country_line_only"
              : "provider_country_requirements",
      },
      ...(country === "FR" && defaultCountry === "FR"
        ? { cityUppercaseRequired: true, maxCharactersPerLine: 38 }
        : {}),
    },
    typography,
    example: {
      fictional: true,
      deliverabilityVerified: false,
      destinationFormattingVerified: false,
      recipient: { country, addressLines: printedLines },
      printedLines,
    },
    verification: {
      ...legacy.verification,
      automatic: [
        "exact_private_pdf_hash_and_scan",
        "all_pages_rendered",
        "a4_dimensions_and_8mb_100page_limits",
        "embedded_fonts_and_no_active_content",
        "white_page_edges_and_reserved_zones",
        "address_present_inside_window",
        "approximate_text_bounds_and_overlap",
        "extracted_address_matches_recipient",
        "accepted_country_code_and_country_line",
        ...(knownLegacyCountry ? ["supported_legacy_country_syntax"] : []),
      ],
      manual: [
        ...legacy.verification.manual,
        "complete_destination_specific_address_format_and_postcode",
      ],
    },
    workflow: legacy.workflow,
    sources: [
      { title: "PDF standards", url: `${help}letter-standards` },
      {
        title: "Envelope window and reserved areas",
        url: `${help}${defaultCountry === "FR" && country === "FR" ? "layout-requirements-french-organisations" : "layout-requirements"}`,
      },
      {
        title: "Accepted recipient country names",
        url: PINGEN_POSTAL_DESTINATIONS_SOURCE.url,
      },
      {
        title: "Destination address examples and UPU guidance",
        url: `${help}address-examples-for-all-countries`,
      },
      ...(knownLegacyCountry
        ? legacy.sources.filter((source) =>
            source.title.includes("address requirements"),
          )
        : [
            {
              title: "Destination postal address requirements",
              url: `${help}${localGuide[country] ?? (localDestination ? "letter-standards" : "address-requirements-dhl-international")}`,
            },
          ]),
    ],
    sourcesVerifiedAt: PINGEN_POSTAL_DESTINATIONS_SOURCE.observedAt.slice(
      0,
      10,
    ),
  };
}
