import { getLocale } from "./locale";
import catalog from "./locales/messages-belvedere.json";

export const belvedereMessages: Record<string, readonly string[]> = catalog;

/** Source-owned interface copy only; values and business content stay untouched. */
export function bmsg(source: string, ...values: unknown[]): string {
  const locale = getLocale();
  const key = source.trim();
  const translation =
    locale === "fr"
      ? key
      : (belvedereMessages[key]?.[{ en: 0, de: 1, lb: 2 }[locale]] ?? key);
  const text =
    source.slice(0, source.length - source.trimStart().length) +
    translation +
    source.slice(source.trimEnd().length);
  return text.replace(/\{(\d+)\}/g, (placeholder, index: string) =>
    Number(index) >= values.length
      ? placeholder
      : String(values[Number(index)]),
  );
}
