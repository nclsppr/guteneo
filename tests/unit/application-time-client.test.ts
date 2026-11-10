import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  APPLICATION_TIME_ZONE,
  ApplicationTimeScope,
  applicationDateTimeInput,
  applicationDateTimeInstant,
  formatApplicationTimestamp,
  parseApplicationTimestamp,
} from "../../apps/web/src/application-time";
import { date } from "../../apps/web/src/api";
import { dateTime, shortDate } from "../../apps/web/src/belvedere-data";
import { DateTimezone } from "../../apps/web/src/components";
import { formatLocale, setLocale } from "../../apps/web/src/locale";

const originalTimezone = process.env.TZ;
afterEach(() => {
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
  setLocale("fr", false);
});

describe("one explicit application clock", () => {
  it.each(["Europe/Paris", "America/New_York", "Pacific/Kiritimati"])(
    "keeps schedule and mandate inputs exact through device DST transitions in %s",
    (deviceZone) => {
      process.env.TZ = deviceZone;
      for (const input of [
        "2026-03-29T02:30",
        "2026-10-25T02:30",
        "2026-11-01T01:30",
      ]) {
        const instant = `${input}:00.000Z`;
        expect(applicationDateTimeInstant(input)).toBe(instant);
        expect(applicationDateTimeInput(instant)).toBe(input);
      }
      expect(applicationDateTimeInstant("2026-02-30T12:00")).toBeNull();
      expect(applicationDateTimeInstant("2026-11-10T24:00")).toBeNull();
      expect(applicationDateTimeInstant("2026-11-10T12:00+02:00")).toBeNull();
      expect(applicationDateTimeInstant("2026-11-10T12:00Z")).toBeNull();
    },
  );

  it.each(["fr", "en", "de", "lb"] as const)(
    "uses the same UTC instant for workspace and platform timestamps in %s",
    (locale) => {
      process.env.TZ = "America/Los_Angeles";
      setLocale(locale, false);
      const instant = "2026-03-29T00:30:00.000Z";
      const expected = new Intl.DateTimeFormat(formatLocale(), {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(new Date(instant));
      expect(APPLICATION_TIME_ZONE).toBe("UTC");
      expect(date(instant)).toBe(expected);
      expect(dateTime(instant)).toBe(expected);
      expect(date("2026-03-29 00:30:00")).toBe(expected);
      expect(
        formatApplicationTimestamp(instant, {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Pacific/Honolulu",
        }),
      ).toBe(expected);
      const calendarDate = new Intl.DateTimeFormat(formatLocale(), {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }).format(new Date("2026-03-29T12:00:00Z"));
      expect(shortDate("2026-03-29")).toBe(calendarDate);
      expect(parseApplicationTimestamp("2026-02-30 12:00:00")).toBeNull();
      expect(parseApplicationTimestamp("November 10 2026 12:00")).toBeNull();
    },
  );

  it("declares the clock once while suppressing nested table and document notes", () => {
    setLocale("en", false);
    const markup = renderToStaticMarkup(
      createElement(
        "div",
        null,
        createElement(DateTimezone),
        createElement(
          ApplicationTimeScope,
          null,
          createElement(DateTimezone),
          createElement(DateTimezone),
        ),
      ),
    );
    expect(markup.match(/id="application-time-context"/g)).toHaveLength(1);
    expect(markup).toContain("Times shown in: UTC");
  });
});
