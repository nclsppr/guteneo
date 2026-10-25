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
