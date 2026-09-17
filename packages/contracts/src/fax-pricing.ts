/** Customer-facing fax estimate and settlement. Supplier accounting stays private. */
export type FaxPricing = {
  version: 3;
  currency: "EUR";
  basis: "qualified_usage_ex_tax";
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
  locale: "fr-FR";
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
  return `${whole},${fraction.replace(/0+$/, "").padEnd(2, "0")}`;
}

function faxPricingDisplay(pricing: FaxPricing): FaxPricingDisplay {
  const range = `${euroLabel(pricing.estimatedLowNanoeur)} à ${euroLabel(pricing.estimatedHighNanoeur)}`;
  const ceiling = decimal(BigInt(pricing.ceilingMinor), 2);
  return {
    locale: "fr-FR",
    creditUnit: "EUR_balance",
    estimate: {
      lowEur: decimal(BigInt(pricing.estimatedLowNanoeur), 9),
      highEur: decimal(BigInt(pricing.estimatedHighNanoeur), 9),
      label: `Environ ${range} € HT`,
      creditLabel: `Environ ${range} € de crédit`,
    },
    ceiling: {
      eur: ceiling,
      label: `Plafond ferme : ${ceiling.replace(".", ",")} € HT`,
      creditLabel: `Réservation à la confirmation : ${ceiling.replace(".", ",")} € de crédit`,
    },
    explanation:
      "L’estimation porte sur ce fax entier, transmission comprise, et varie avec la durée réelle, qui n’est pas garantie. Ce n’est ni un prix fixe par page ni un débit. Le plafond est réservé à la confirmation ; la consommation définitive est déterminée après vérification de l’usage et reste limitée à ce plafond. Les fractions de centime sont cumulées avant le débit du solde. Le statut settlement indique si la réserve est active, réglée ou libérée.",
    legacyEstimatedMinorMeaning: "rounded_up_estimated_high_centimes",
  };
}

export const FAX_OPERATOR_TEST_NOTICE =
  "Test Luxembourg autorisé par l’opérateur. La capacité Local Calling n’est pas confirmée ; le fournisseur peut refuser la transmission.";

/** Explicit projection also excludes accidental extra runtime accounting fields. */
export function customerFaxPricing(
  pricing: FaxPricing,
): FaxPricing & { display: FaxPricingDisplay } {
  return {
    version: pricing.version,
    currency: pricing.currency,
    basis: pricing.basis,
    ...(pricing.routeQualification === "operator_authorized_test"
      ? {
          routeQualification: "operator_authorized_test" as const,
          routeNotice: FAX_OPERATOR_TEST_NOTICE,
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
