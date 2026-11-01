import { z } from "zod";
import data from "./data/pingen-postal-destinations.json";

/** Provider-published spellings are not proof of current delivery availability. */
export const PINGEN_POSTAL_DESTINATIONS_SOURCE = Object.freeze(data.source);
export type PostalCountry = keyof typeof data.countries;
export const PINGEN_POSTAL_COUNTRY_CODES = Object.freeze(
  Object.keys(data.countries) as PostalCountry[],
);
export const postalCountrySchema = z.enum(PINGEN_POSTAL_COUNTRY_CODES);
const countrySet = new Set<string>(PINGEN_POSTAL_COUNTRY_CODES);
const aliasesByCountry = new Map(
  PINGEN_POSTAL_COUNTRY_CODES.map((country) => [
    country,
    Object.freeze([...data.countries[country].aliases]),
  ]),
);
const acceptedCountryLines = new Set(
  [...aliasesByCountry.values()].flatMap((aliases) =>
    aliases.map((alias) => alias.toUpperCase()),
  ),
);

/** Only these default-recipient countries can omit their domestic country line. */
export const PINGEN_LOCAL_PRINT_COUNTRIES = Object.freeze([
  "DE",
  "CH",
  "AT",
  "NL",
  "BE",
  "LU",
  "FR",
  "GB",
  "ES",
  "IN",
] as const);
const localPrintCountries = new Set<string>(PINGEN_LOCAL_PRINT_COUNTRIES);

export function isPingenPostalCountry(value: unknown): value is PostalCountry {
  return typeof value === "string" && countrySet.has(value);
}

function destination(country: string) {
  if (!isPingenPostalCountry(country))
    throw new Error("POSTAL_COUNTRY_UNSUPPORTED");
  return data.countries[country];
}

/** An accepted EN spelling, or the accepted DE spelling where EN is absent. */
export function postalCountryName(country: string): string {
  return destination(country).printName;
}

export function postalCountryNameLanguage(country: string): "en" | "de" {
  return destination(country).nameLanguage as "en" | "de";
}

export function postalCountryAliases(country: string): readonly string[] {
  destination(country);
  return aliasesByCountry.get(country as PostalCountry)!;
}

export function postalCountryLineRequired(
  country: string,
  defaultCountry: string,
): boolean {
  destination(country);
  return country !== defaultCountry || !localPrintCountries.has(country);
}

export type PostalAddressRuleRoute =
  | "la_poste"
  | "bpost_luxembourg"
  | "deutsche_post"
  | "dhl_international"
  | "provider_country_specific";

/** Address-rule selection only, never a promise of the actual delivery carrier. */
export function postalAddressRuleRoute(
  country: string,
  defaultCountry: string,
): PostalAddressRuleRoute {
  destination(country);
  if (country === "FR")
    return defaultCountry === "FR" ? "la_poste" : "dhl_international";
  if (country === "LU") return "bpost_luxembourg";
  if (country === "DE") return "deutsche_post";
  return localPrintCountries.has(country)
    ? "provider_country_specific"
    : "dhl_international";
}

/** Compare without changing the supplied printed line or accepting another country. */
export function isPostalCountryLine(line: string, country: string): boolean {
  return (
    line === line.trim() &&
    line === line.toUpperCase() &&
    postalCountryAliases(country).some((alias) => alias.toUpperCase() === line)
  );
}

export function isAnyPostalCountryLine(line: string): boolean {
  return line === line.trim() && acceptedCountryLines.has(line);
}
