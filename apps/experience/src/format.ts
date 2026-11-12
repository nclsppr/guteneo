import { APPLICATION_TIME_ZONE } from "../../../packages/contracts/src/application-time";
import { intlLocale, type SupportedLocale } from "./i18n";
import type { Dispatch } from "./api/types";

/**
 * Station time is one time for everyone: the product's declared UTC context.
 * Every instant shown here uses it, so a row reads the same in this
 * experience and in the main application's reports and exports.
 */
export const STATION_TIME_ZONE = APPLICATION_TIME_ZONE;

function instant(value: string | number | Date | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function formatTime(
  value: string | number | Date | null | undefined,
  locale: SupportedLocale,
): string {
  const date = instant(value);
  if (!date) return "--:--";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: STATION_TIME_ZONE,
  }).format(date);
}

export function formatDay(
  value: string | number | Date | null | undefined,
  locale: SupportedLocale,
  style: "short" | "long" = "short",
): string {
  const date = instant(value);
  if (!date) return "";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "2-digit",
    month: style === "short" ? "2-digit" : "long",
    ...(style === "long" ? { year: "numeric" } : {}),
    timeZone: STATION_TIME_ZONE,
  }).format(date);
}

export function formatDateTime(
  value: string | number | Date | null | undefined,
  locale: SupportedLocale,
): string {
  const date = instant(value);
  if (!date) return "";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: STATION_TIME_ZONE,
  }).format(date);
}

/** UTC calendar day of an instant, for grouping rows under a date. */
export function stationDay(value: string | number | Date): string {
  const date = instant(value);
  return date ? date.toISOString().slice(0, 10) : "";
}

/** Integer minor units in, never a float amount. */
export function formatMoney(
  minor: number | null | undefined,
  locale: SupportedLocale,
  currency = "EUR",
): string {
  if (minor === null || minor === undefined || !Number.isFinite(minor))
    return "";
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency,
  }).format(minor / 100);
}

/** The frozen quote keeps the precision of the shared fractional ledger. */
export function formatNanoEuro(nano: number, locale: SupportedLocale): string {
  if (!Number.isSafeInteger(nano) || nano < 0) return "";
  const amount = BigInt(nano);
  const parts = new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).formatToParts(amount / 1_000_000_000n);
  const fraction = (amount % 1_000_000_000n)
    .toString()
    .padStart(9, "0")
    .replace(/0+$/, "")
    .padEnd(2, "0");
  return parts
    .map((part) => (part.type === "fraction" ? fraction : part.value))
    .join("");
}

/** The price a person is asked to accept for this exact dispatch. */
export function dispatchFare(dispatch: Dispatch, locale: SupportedLocale) {
  const nano = dispatch.quote_customer_nanoeur;
  if (
    dispatch.currency === "EUR" &&
    typeof nano === "number" &&
    Number.isSafeInteger(nano) &&
    nano >= 0
  ) {
    const options = parseJson(dispatch.options_json);
    const protectedLink = options.emailDeliveryMode === "protected_link";
    const hosting = protectedLink
      ? (options.protectedDocument as { hostingFeeMinor?: number } | undefined)
          ?.hostingFeeMinor
      : 0;
    if (!protectedLink || hosting === 0 || hosting === 100)
      return formatNanoEuro(nano + (hosting ?? 0) * 10_000_000, locale);
  }
  return formatMoney(dispatch.estimated_minor, locale, dispatch.currency);
}

export function formatBytes(size: number, locale: SupportedLocale): string {
  const units =
    locale === "fr" ? ["octets", "Ko", "Mo"] : ["B", "KB", "MB"];
  const index = size < 1024 ? 0 : size < 1024 * 1024 ? 1 : 2;
  const value = new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: index ? 1 : 0,
    maximumFractionDigits: index ? 1 : 0,
  }).format(size / 1024 ** index);
  return `${value} ${units[index]}`;
}

export function formatCount(value: number, locale: SupportedLocale): string {
  return new Intl.NumberFormat(intlLocale(locale)).format(value);
}

export function parseJson(
  value: string | Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!value) return {};
  if (typeof value !== "string") return value;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export type RecipientView = {
  email?: string;
  phone?: string;
  name?: string;
  line1?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  addressLines?: string[];
};

export function recipientOf(dispatch: Pick<Dispatch, "recipient_json">) {
  const value = parseJson(dispatch.recipient_json);
  const view: RecipientView = {};
  for (const key of [
    "email",
    "phone",
    "name",
    "line1",
    "postalCode",
    "city",
    "country",
  ] as const)
    if (typeof value[key] === "string") view[key] = value[key];
  if (
    Array.isArray(value.addressLines) &&
    value.addressLines.every((line) => typeof line === "string")
  )
    view.addressLines = value.addressLines as string[];
  return view;
}

/** The destination as it reads on a board row: one short line. */
export function destinationLabel(dispatch: Pick<Dispatch, "recipient_json">) {
  const recipient = recipientOf(dispatch);
  return (
    recipient.email ??
    recipient.phone ??
    (recipient.addressLines
      ? [recipient.addressLines[0], recipient.country]
      : [recipient.name, recipient.city, recipient.country]
    )
      .filter(Boolean)
      .join(", ")
  );
}

/** Every line of the destination, for a ticket or an address window. */
export function destinationLines(dispatch: Pick<Dispatch, "recipient_json">) {
  const recipient = recipientOf(dispatch);
  if (recipient.email) return [recipient.email];
  if (recipient.phone) return [recipient.phone];
  if (recipient.addressLines)
    return [...recipient.addressLines, recipient.country ?? ""].filter(Boolean);
  return [
    recipient.name,
    recipient.line1,
    [recipient.postalCode, recipient.city].filter(Boolean).join(" "),
    recipient.country,
  ].filter((line): line is string => Boolean(line));
}

/** A short public reference: the last characters of an opaque identifier. */
export function shortRef(id: string, length = 6): string {
  return id.replace(/[^a-zA-Z0-9]/g, "").slice(-length).toUpperCase();
}
