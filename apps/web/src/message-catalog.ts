import type { SupportedLocale } from "./locale";
import workspaceTerminology from "./locales/workspace-terminology.json";

export type MessageCatalog = Record<string, readonly string[]>;
const revisedLabels: Record<
  string,
  Readonly<Partial<Record<SupportedLocale, string>>>
> = workspaceTerminology;

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

/**
 * English index of several catalogs, the first catalog winning per English
 * source. Built per catalog, so two catalogs that share a French key with
 * different English sources both stay translatable.
 */
export function englishIndex(
  catalogs: readonly MessageCatalog[],
): MessageCatalog {
  const result: MessageCatalog = Object.create(null);
  for (const catalog of catalogs)
    for (const [english, translations] of Object.entries(
      englishMessages(catalog),
    ))
      if (!Object.hasOwn(result, english)) result[english] = translations;
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
  // Only reviewed complete source labels have compatibility copy. Interpolated
  // names, document content and historical printing workshops are never rewritten.
  const revised = Object.hasOwn(revisedLabels, key)
    ? revisedLabels[key]
    : old && Object.hasOwn(revisedLabels, old[0])
      ? revisedLabels[old[0]]
      : undefined;
  const translation =
    revised?.[locale] && !contextual
      ? revised[locale]
      : translated
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
