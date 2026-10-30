import type { SupportedLocale } from "../../../packages/contracts/src/locale";
import copy from "./locales/mobile-review.json" with { type: "json" };

/** Translate fixed interface copy only; immutable approval data is never translated. */
export function mobileText(source: string, locale: SupportedLocale): string {
  if (locale === "en") return source;
  const translations = (copy as Record<string, readonly string[]>)[source];
  return translations?.[{ fr: 0, de: 1, lb: 2 }[locale]] ?? source;
}
