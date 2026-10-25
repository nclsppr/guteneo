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
export function bmsgIn(
  context: string,
  source: string,
  ...values: unknown[]
): string {
  return translateMessage(
    source,
    getLocale(),
    belvedereMessages,
    legacy,
    values,
    context,
    contexts,
  );
}

/** Translate only the application's known financial explanations, never arbitrary data. */
export function belvedereNetResultReason(reason: string): string {
  const known = [
    "Promotional credits are not revenue. Supplier invoices, refunds, taxes and fixed costs have not all been reconciled.",
    "Supplier costs, Cloudflare invoices and complete receipts are unavailable.",
  ].find(
    (source) => reason === source || reason === belvedereMessages[source]?.[0],
  );
  return known
    ? bmsg(known)
    : reason ||
        bmsg(
          "The full costs have not been reconciled yet. Net profit cannot be calculated reliably.",
        );
}
