/** Customer-facing fax estimate and settlement. Supplier accounting stays private. */
export type FaxPricing = {
  version: 3;
  currency: "EUR";
  basis: "qualified_usage_ex_tax";
  executionScope?: "review_prepare_only";
  referenceBasis?:
    | "archived_review_reference"
    | "worldwide_catalog"
    | "last_known_reference"
    | "guteneo_continuity_v1";
  /** Explicit test authorization, not Telnyx Local Calling qualification. */
  routeQualification?: "operator_authorized_test";
  routeNotice?: string;
  estimatedLowNanoeur: number;
  estimatedHighNanoeur: number;
  ceilingMinor: number;
  /** Read-only presentation; never part of tariff, approval or settlement arithmetic. */
  display?: FaxPricingDisplay;
  fx: {
    numerator: number;
    denominator: number;
    date: string;
    source: string;
  };
  settlement: {
    status: "not_reserved" | "reserved" | "settled" | "released";
    customerNanoeur: number | null;
    chargedMinor: number | null;
    settledAt: string | null;
  };
};

export type FaxPricingDisplay = {
  locale: "en-GB";
  creditUnit: "EUR_balance";
  estimate: {
    lowEur: string;
    highEur: string;
    label: string;
    creditLabel: string;
  };
  ceiling: { eur: string; label: string; creditLabel: string };
  explanation: string;
  legacyEstimatedMinorMeaning: "rounded_up_estimated_high_centimes";
};

export const FAX_MAX_ESTIMATE_NANOEUR = 10_000_000_000_000;
export const FAX_MAX_ESTIMATE_NOTICE =
  "This estimate reaches Guteneo’s maximum price of €10,000 excluding tax per fax. Your approved ceiling still applies.";

export function isFaxEstimateAtMaximum(pricing?: {
  executionScope?: string;
  referenceBasis?: string;
  estimatedHighNanoeur?: number;
} | null): boolean {
  return (
    pricing?.executionScope !== "review_prepare_only" &&
    (pricing?.referenceBasis === "worldwide_catalog" ||
      pricing?.referenceBasis === "last_known_reference" ||
      pricing?.referenceBasis === "guteneo_continuity_v1") &&
    (pricing.estimatedHighNanoeur ?? 0) >= FAX_MAX_ESTIMATE_NANOEUR
  );
}

export function faxReferenceNotice(
  basis?: FaxPricing["referenceBasis"],
): string | undefined {
  if (basis === "last_known_reference")
    return "This estimate uses the last known rate for this destination.";
  if (basis === "guteneo_continuity_v1")
    return "Guteneo estimated this fax at €0.25 per page excluding tax because the destination rate was unavailable.";
}
/** Integer-only decimal formatting preserves nanoEUR; display never changes the quote. */
function decimal(value: bigint, places: number): string {
  const scale = 10n ** BigInt(places);
  const fraction = (value % scale).toString().padStart(places, "0");
  return `${value / scale}.${fraction}`;
}

function euroLabel(nanoeur: number): string {
  const rounded = (BigInt(nanoeur) + 50_000n) / 100_000n;
  // Keep tiny positive estimates visible instead of advertising a rounded zero.
  const value =
    rounded === 0n && nanoeur > 0
      ? decimal(BigInt(nanoeur), 9)
      : decimal(rounded, 4);
  const [whole, fraction] = value.split(".");
  return `${whole}.${fraction.replace(/0+$/, "").padEnd(2, "0")}`;
}

function faxPricingDisplay(pricing: FaxPricing): FaxPricingDisplay {
  const range =
    pricing.estimatedLowNanoeur === pricing.estimatedHighNanoeur
      ? euroLabel(pricing.estimatedHighNanoeur)
      : `${euroLabel(pricing.estimatedLowNanoeur)} to ${euroLabel(pricing.estimatedHighNanoeur)}`;
  const ceiling = decimal(BigInt(pricing.ceilingMinor), 2);
  return {
    locale: "en-GB",
    creditUnit: "EUR_balance",
    estimate: {
      lowEur: decimal(BigInt(pricing.estimatedLowNanoeur), 9),
      highEur: decimal(BigInt(pricing.estimatedHighNanoeur), 9),
      label: `About EUR${range} excl. tax`,
      creditLabel: `About EUR${range} in credit`,
    },
    ceiling: {
      eur: ceiling,
      label: `Firm ceiling: EUR${ceiling} excl. tax`,
      creditLabel:
        pricing.executionScope === "review_prepare_only"
          ? "No credit is reserved or consumed."
          : `Reservation on confirmation: EUR${ceiling} in credit`,
    },
    explanation:
      pricing.executionScope === "review_prepare_only"
        ? pricing.referenceBasis === "archived_review_reference"
          ? FAX_CONTINUOUS_REVIEW_NOTICE
          : FAX_REVIEW_PREPARATION_NOTICE
        : [
            faxReferenceNotice(pricing.referenceBasis),
            isFaxEstimateAtMaximum(pricing) ? FAX_MAX_ESTIMATE_NOTICE : undefined,
            "The estimate covers this entire fax, including transmission, and varies with the actual duration, which is not guaranteed. It is neither a fixed per-page price nor a charge. The ceiling is reserved on confirmation; final consumption is determined after verified usage and remains bounded by that ceiling. Fractions of a cent accumulate before the balance is debited. The settlement status indicates whether the reservation is active, settled or released.",
          ]
            .filter(Boolean)
            .join(" "),
    legacyEstimatedMinorMeaning: "rounded_up_estimated_high_centimes",
  };
}

export const FAX_REVIEW_PREPARATION_NOTICE =
  "Preparation for review only. This reference range excluding tax uses real rates and assumed durations; it excludes unqualified conditional adjustments. This fax cannot be approved or sent, including in expert mode. No credit is reserved or deducted. Local Calling capability remains unconfirmed.";

export const FAX_CONTINUOUS_REVIEW_NOTICE =
  "Preparation for review only, using an archived rate and FX reference with assumed durations. This is not a current provider price or a sendable quote. This fax cannot be approved or sent, including in expert mode. No credit is reserved or deducted. Local Calling capability remains unconfirmed.";

export const FAX_OPERATOR_TEST_NOTICE =
  "Luxembourg test authorised by the operator. Local Calling capability is unconfirmed; the provider may reject transmission.";

/** Explicit projection also excludes accidental extra runtime accounting fields. */
export function customerFaxPricing(
  pricing: FaxPricing,
): FaxPricing & { display: FaxPricingDisplay } {
  return {
    version: pricing.version,
    currency: pricing.currency,
    basis: pricing.basis,
    ...(pricing.executionScope === "review_prepare_only"
      ? {
          executionScope: "review_prepare_only" as const,
          ...(pricing.referenceBasis === "archived_review_reference"
            ? { referenceBasis: "archived_review_reference" as const }
            : {}),
        }
      : {}),
    ...(pricing.executionScope !== "review_prepare_only" &&
    (pricing.referenceBasis === "worldwide_catalog" ||
      pricing.referenceBasis === "last_known_reference" ||
      pricing.referenceBasis === "guteneo_continuity_v1")
      ? { referenceBasis: pricing.referenceBasis }
      : {}),
    ...(pricing.routeQualification === "operator_authorized_test"
      ? {
          routeQualification: "operator_authorized_test" as const,
          routeNotice:
            pricing.executionScope === "review_prepare_only"
              ? pricing.referenceBasis === "archived_review_reference"
                ? FAX_CONTINUOUS_REVIEW_NOTICE
                : FAX_REVIEW_PREPARATION_NOTICE
              : FAX_OPERATOR_TEST_NOTICE,
        }
      : {}),
    estimatedLowNanoeur: pricing.estimatedLowNanoeur,
    estimatedHighNanoeur: pricing.estimatedHighNanoeur,
    ceilingMinor: pricing.ceilingMinor,
    display: faxPricingDisplay(pricing),
    fx: {
      numerator: pricing.fx.numerator,
      denominator: pricing.fx.denominator,
      date: pricing.fx.date,
      source: pricing.fx.source,
    },
    settlement: {
      status: pricing.settlement.status,
      customerNanoeur: pricing.settlement.customerNanoeur,
      chargedMinor: pricing.settlement.chargedMinor,
      settledAt: pricing.settlement.settledAt,
    },
  };
}
