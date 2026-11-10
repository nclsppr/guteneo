import { getLocale } from "./locale";
import {
  legacyBelvedereMessages,
  readBelvedereLocaleData,
  readLocaleData,
} from "./locale-data";

/** Complete compatibility catalog for source tooling/SSR; browser data is selected-language only. */
export const belvedereMessages = legacyBelvedereMessages;
function message(source: string, values: unknown[], context?: string) {
  const key = source.trim();
  const locale = getLocale();
  const data = readBelvedereLocaleData(locale);
  const contextual = context
    ? readLocaleData(locale).contexts[`${context}\u0004${key}`]
    : undefined;
  const translation =
    contextual ??
    (Object.hasOwn(data.messages, key) ? data.messages[key] : key);
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
/** Source-owned interface copy only; values and business content stay untouched. */
export function bmsg(source: string, ...values: unknown[]): string {
  return message(source, values);
}
/** Preserve plural agreement when an English label is unchanged. */
export function bmsgIn(
  context: string,
  source: string,
  ...values: unknown[]
): string {
  return message(source, values, context);
}
/** Translate only known financial explanations, never arbitrary business data. */
export function belvedereNetResultReason(reason: string): string {
  const french = readBelvedereLocaleData(getLocale()).sourceFrench;
  const known = Object.keys(french).find(
    (source) => reason === source || reason === french[source],
  );
  return known
    ? bmsg(known)
    : reason ||
        bmsg(
          "The full costs have not been reconciled yet. Net profit cannot be calculated reliably.",
        );
}
