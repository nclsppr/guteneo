import type { PingenPreflightOptions } from "./pingen-preflight";

const help = "https://help.pingen.com/en/templates-and-postal-requirements/";
const countries = { FR: "FRANCE", LU: "LUXEMBOURG", DE: "GERMANY" } as const;

/** Public instructions only: no account ID, document content or authority is returned. */
export function postalAddressGuidance(options: PingenPreflightOptions) {
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
  const countryLine = domestic ? null : countries[country];
  const exampleRecipient = {
    name: "DESTINATAIRE FICTIF",
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
        "Le schéma actuel accepte un nom et une seule ligne de rue ou de boîte postale. Il ne permet pas de ligne supplémentaire pour un service, bâtiment, étage ou complément.",
        "Ne supprimez jamais une information nécessaire pour respecter ce schéma. Signalez que le format d’adresse complet n’est pas pris en charge et demandez une adresse complète représentable, sans inventer de contenu.",
        "L’adresse doit déjà être imprimée dans le PDF original. Les champs MCP servent à la comparer, pas à l’ajouter ou à la déplacer.",
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
        "Le MCP retourne le texte extrait et des liens privés, pas une image lisible avec OAuth. Examinez votre PDF original en vérifiant son empreinte ou utilisez reviewUrl dans Guteneo ; ne prétendez pas avoir vu un extrait inaccessible.",
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
