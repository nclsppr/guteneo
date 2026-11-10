import { createContext, useContext, type ReactNode } from "react";
import {
  APPLICATION_TIME_ZONE,
  isApplicationDay,
} from "../../../packages/contracts/src/application-time";
import { formatLocale } from "./locale";

export { APPLICATION_TIME_ZONE } from "../../../packages/contracts/src/application-time";

const ApplicationTimeDeclared = createContext(false);

/** The frame declares UTC once; nested document/table notes stay suppressed. */
export function ApplicationTimeScope({ children }: { children: ReactNode }) {
  return (
    <ApplicationTimeDeclared.Provider value>
      {children}
    </ApplicationTimeDeclared.Provider>
  );
}
export function useApplicationTimeDeclared() {
  return useContext(ApplicationTimeDeclared);
}

/** API/SQLite timestamps without an offset are UTC, never the device timezone. */
export function parseApplicationTimestamp(value: string): Date | null {
  if (/^\d{4}-\d{2}-\d{2}/.test(value) && !isApplicationDay(value.slice(0, 10)))
    return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T00:00:00.000Z`
    : /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?$/.test(value)
      ? `${value.replace(" ", "T")}Z`
      : value;
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(normalized)) return null;
  const instant = new Date(normalized);
  return Number.isFinite(instant.getTime()) ? instant : null;
}

/** Locale controls language and units; the application timezone stays explicit. */
export function formatApplicationTimestamp(
  value: string,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  },
): string | null {
  const instant = parseApplicationTimestamp(value);
  return instant
    ? new Intl.DateTimeFormat(formatLocale(), {
        ...options,
        timeZone: APPLICATION_TIME_ZONE,
      }).format(instant)
    : null;
}

/** A datetime-local field is a UTC wall-clock value in all five applications. */
export function applicationDateTimeInput(
  value: Date | string | number,
): string {
  const instant =
    typeof value === "string"
      ? parseApplicationTimestamp(value)
      : new Date(value);
  return instant && Number.isFinite(instant.getTime())
    ? instant.toISOString().slice(0, 16)
    : "";
}

/** Reject impossible calendar dates rather than normalizing them into consent. */
export function applicationDateTimeInstant(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const instant = new Date(`${value}:00.000Z`);
  return Number.isFinite(instant.getTime()) &&
    instant.toISOString().slice(0, 16) === value
    ? instant.toISOString()
    : null;
}
