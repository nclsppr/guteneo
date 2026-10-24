import { getLocale } from "./locale";
import { englishMessages, translateMessage } from "./message-catalog";
import catalog from "./locales/messages-belvedere.json";
import contexts from "./locales/message-contexts.json";

const legacy: Record<string, readonly string[]> = catalog;
export const belvedereMessages = englishMessages(legacy);

/** Source-owned interface copy only; values and business content stay untouched. */
export function bmsg(source: string, ...values: unknown[]): string {
  return translateMessage(
    source,
    getLocale(),
    belvedereMessages,
    legacy,
    values,
  );
}

/** Preserve plural agreement when an English label is unchanged. */
export function bmsgIn(context: string, source: string, ...values: unknown[]): string {
  return translateMessage(source, getLocale(), belvedereMessages, legacy, values, context, contexts);
}
