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

export const FAX_OPERATOR_TEST_NOTICE =
  "Test Luxembourg autorisé par l’opérateur. La capacité Local Calling n’est pas confirmée ; le fournisseur peut refuser la transmission.";

/** Explicit projection also excludes accidental extra runtime accounting fields. */
export function customerFaxPricing(pricing: FaxPricing): FaxPricing {
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
