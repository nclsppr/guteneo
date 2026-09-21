// Reference hours by recipient country, checked 2026-09-21.
// Provenance and exceptions: docs/POSTAL_CUTOFFS.md. These are not delivery SLAs.
export type PostalCutoffRule = {
  id: string;
  countries: readonly string[];
  hour: number;
  fridayHour?: number;
  handover: "sameDay" | "nextDay" | "twoDays";
};

export const POSTAL_CUTOFF_SCHEDULE: readonly PostalCutoffRule[] = [
  { id: "benelux", countries: ["BE", "LU"], hour: 1, handover: "sameDay" },
  { id: "india", countries: ["IN"], hour: 6, handover: "nextDay" },
  { id: "default", countries: [], hour: 10, handover: "sameDay" },
  {
    id: "midday",
    countries: ["FR", "CH", "DE", "NL"],
    hour: 12,
    handover: "sameDay",
  },
  {
    id: "austria",
    countries: ["AT"],
    hour: 12,
    fridayHour: 10,
    handover: "sameDay",
  },
  { id: "spain", countries: ["ES"], hour: 12, handover: "twoDays" },
  { id: "uk", countries: ["GB"], hour: 16, handover: "sameDay" },
];

export const formatCutoffHour = (hour: number) =>
  `${String(hour).padStart(2, "0")} h 00`;

export function postalCutoffForCountry(country: string | undefined) {
  const code = country?.trim().toUpperCase();
  if (!code || !/^[A-Z]{2}$/.test(code)) return undefined;
  return (
    POSTAL_CUTOFF_SCHEDULE.find((rule) => rule.countries.includes(code)) ??
    POSTAL_CUTOFF_SCHEDULE.find((rule) => rule.id === "default")
  );
}
