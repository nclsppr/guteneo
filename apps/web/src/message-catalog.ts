import type { SupportedLocale } from "./locale";

export type MessageCatalog = Record<string, readonly string[]>;

/** English source keys share translations; legacy inputs remain readable for API errors. */
export function englishMessages(catalog: MessageCatalog): MessageCatalog {
  const result: MessageCatalog = Object.create(null);
  for (const [french, [english, german, luxembourgish]] of Object.entries(
    catalog,
  )) {
    if (!Object.hasOwn(result, english))
      result[english] = [french, german, luxembourgish];
  }
  return result;
}

export function translateMessage(
  source: string,
  locale: SupportedLocale,
  english: MessageCatalog,
  legacy: MessageCatalog,
  values: unknown[],
  context?: string,
  contexts: MessageCatalog = {},
): string {
  const key = source.trim();
  const contextual = context ? contexts[`${context}\u0004${key}`] : undefined;
  const translated = contextual ?? english[key];
  const old = Object.hasOwn(legacy, key) ? legacy[key] : undefined;
  const translation = translated
    ? locale === "en"
      ? key
      : translated[{ fr: 0, de: 1, lb: 2 }[locale]]
    : old
      ? locale === "fr"
        ? key
        : old[{ en: 0, de: 1, lb: 2 }[locale]]
      : key;
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
