export type UsageActivityDay = {
  date: string;
  amountMinor: number;
  dispatchCount: number;
  chargeCount: number;
};

export type UsageActivity = {
  year: number;
  currentYear: number;
  availableYears: number[];
  asOf: string;
  timeZone: "UTC";
  currency: "EUR";
  evidence: "production" | "simulation";
  days: UsageActivityDay[];
  totals: Omit<UsageActivityDay, "date"> & { activeDays: number };
};
