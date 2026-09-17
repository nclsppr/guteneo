/** Customer-facing fax estimate and settlement. Supplier accounting stays private. */
export type FaxPricing = {
  version: 3;
  currency: "EUR";
  basis: "qualified_usage_ex_tax";
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

/** Explicit projection also excludes accidental extra runtime accounting fields. */
export function customerFaxPricing(pricing: FaxPricing): FaxPricing {
  return {
    version: pricing.version,
    currency: pricing.currency,
    basis: pricing.basis,
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
