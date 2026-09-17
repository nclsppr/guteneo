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
