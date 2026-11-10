/** One explicit display, date-filter and report context for the five web apps. */
export const APPLICATION_TIME_ZONE = "UTC" as const;
export const APPLICATION_DAY_MS = 86_400_000;

export function applicationDay(instant: number | Date = Date.now()): string {
  return new Date(instant instanceof Date ? instant.getTime() : instant)
    .toISOString()
    .slice(0, 10);
}

export function isApplicationDay(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    applicationDay(Date.parse(value)) === value
  );
}

/** Inclusive calendar dates map to the existing half-open UTC report interval. */
export function applicationPeriodBounds(from: string, to: string) {
  if (!isApplicationDay(from) || !isApplicationDay(to) || from > to)
    throw new Error("INVALID_APPLICATION_PERIOD");
  return {
    start: `${from}T00:00:00.000Z`,
    end: new Date(Date.parse(to) + APPLICATION_DAY_MS).toISOString(),
  };
}

/** A client cannot silently reinterpret UTC report dates as another zone. */
export function applicationTimeZoneQuerySupported(
  query: URLSearchParams,
): boolean {
  return [...query.getAll("timeZone"), ...query.getAll("timezone")].every(
    (value) => value === APPLICATION_TIME_ZONE,
  );
}
