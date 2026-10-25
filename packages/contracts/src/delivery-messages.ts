import delivery from "./delivery-messages.json" with { type: "json" };
import type { SupportedLocale } from "./locale";

const englishMessages: Record<string, readonly string[]> = Object.fromEntries(
  Object.entries(delivery).map(([fr, [en, de, lb]]) => [en, [fr, de, lb]]),
);

/** Translate fixed delivery interface copy; never translate user content. */
export function deliveryText(source: string, locale: SupportedLocale): string {
  if (locale === "en") return source;
  return englishMessages[source]?.[{ fr: 0, de: 1, lb: 2 }[locale]] ?? source;
}

const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** UTC matches the hosting expiry; workerd can lack Luxembourgish Intl data. */
export function deliveryExpiryDate(
  value: string,
  locale: SupportedLocale,
): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new RangeError("Invalid delivery expiry");
  if (locale === "lb") {
    // Gregorian long-date pattern and month names follow Unicode CLDR lb.
    // https://unicode.org/cldr/charts/47/summary/lb.html
    const month = deliveryText(months[date.getUTCMonth()], locale);
    return `${date.getUTCDate()}. ${month} ${date.getUTCFullYear()}`;
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(date);
}
