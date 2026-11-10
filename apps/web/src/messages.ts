import { getLocale } from "./locale";
import type { SupportedLocale } from "./locale";
import { legacyMessages, peekLocaleData } from "./locale-data";

// Source tooling/SSR retain the complete compatibility catalogs. Browser code
// receives only the active locale's precompiled lookup, never all translations.
export const messages = legacyMessages;
export function translateLocaleMessage(
  source: string,
  locale: SupportedLocale,
  values: unknown[] = [],
  context?: string,
): string {
  const key = source.trim();
  const data = peekLocaleData(locale);
  const contextual = context
    ? data?.contexts[`${context}\u0004${key}`]
    : undefined;
  const indexed =
    data && Object.hasOwn(data.messages, key) ? data.messages[key] : undefined;
  const translation =
    contextual ??
    (typeof indexed === "number" ? data?.strings[indexed] : indexed) ??
    key;
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
/** Source-owned interface copy only. Never pass user-authored document content. */
export function msg(source: string, ...values: unknown[]): string {
  return translateLocaleMessage(source, getLocale(), values);
}
/** Context keeps grammatical variants distinct when English labels coincide. */
export function msgIn(
  context: string,
  source: string,
  ...values: unknown[]
): string {
  return translateLocaleMessage(source, getLocale(), values, context);
}
