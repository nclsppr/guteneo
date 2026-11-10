import { afterEach, describe, expect, it } from "vitest";
import {
  APPLICATION_DAY_MS,
  APPLICATION_TIME_ZONE,
  applicationDay,
  applicationPeriodBounds,
  applicationTimeZoneQuerySupported,
  isApplicationDay,
} from "../../packages/contracts/src/application-time";
import { administrationFilters } from "../../apps/api/src/administration";
import { belvedereFilters } from "../../apps/api/src/belvedere";

const originalTimezone = process.env.TZ;
afterEach(() => {
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
});

const parsers = [administrationFilters, belvedereFilters];
const url = (query = "") => new URL(`https://example.invalid/report?${query}`);

describe("fixed UTC report contract", () => {
  it("owns one explicit clock and maps inclusive dates to a half-open interval", () => {
    expect(APPLICATION_TIME_ZONE).toBe("UTC");
    expect(applicationPeriodBounds("2026-11-01", "2026-11-10")).toEqual({
      start: "2026-11-01T00:00:00.000Z",
      end: "2026-11-11T00:00:00.000Z",
    });
    expect(applicationDay(new Date("2026-11-10T00:30:00Z"))).toBe("2026-11-10");
  });

  it.each(["2026-03-29", "2026-10-25", "2026-03-08", "2026-11-01"])(
    "keeps a UTC calendar day 24 hours through regional DST on %s",
    (day) => {
      const bounds = applicationPeriodBounds(day, day);
      expect(Date.parse(bounds.end) - Date.parse(bounds.start)).toBe(
        APPLICATION_DAY_MS,
      );
      for (const parse of parsers) {
        expect(parse(url(`from=${day}&to=${day}`))).toMatchObject(bounds);
      }
    },
  );

  it("rejects impossible or noncanonical dates and reversed periods", () => {
    expect(isApplicationDay("2024-02-29")).toBe(true);
    for (const day of ["2026-02-29", "2026-02-30", "2026-13-01", "2026-1-01"]) {
      expect(isApplicationDay(day)).toBe(false);
      expect(() => applicationPeriodBounds(day, day)).toThrow(
        "INVALID_APPLICATION_PERIOD",
      );
      for (const parse of parsers)
        expect(() => parse(url(`from=${day}&to=${day}`))).toThrowError(
          expect.objectContaining({ code: "INVALID_FILTERS", status: 400 }),
        );
    }
    expect(() => applicationPeriodBounds("2026-11-10", "2026-11-09")).toThrow(
      "INVALID_APPLICATION_PERIOD",
    );
    for (const parse of parsers)
      expect(() => parse(url("from=2026-11-10&to=2026-11-09"))).toThrowError(
        expect.objectContaining({ code: "INVALID_FILTERS", status: 400 }),
      );
  });

  it("permits absent or consistently explicit UTC declarations", () => {
    for (const query of [
      "",
      "timeZone=UTC",
      "timezone=UTC",
      "timeZone=UTC&timezone=UTC&timeZone=UTC",
    ]) {
      expect(
        applicationTimeZoneQuerySupported(new URLSearchParams(query)),
      ).toBe(true);
      for (const parse of parsers)
        expect(
          parse(url(`from=2026-01-01&to=2026-01-31&${query}`)),
        ).toMatchObject({
          start: "2026-01-01T00:00:00.000Z",
          end: "2026-02-01T00:00:00.000Z",
        });
    }
  });

  it.each([
    "timeZone=Europe%2FParis",
    "timezone=utc",
    "timeZone=UTC&timeZone=America%2FNew_York",
  ])("refuses unsupported or conflicting clock declarations: %s", (query) => {
    expect(applicationTimeZoneQuerySupported(new URLSearchParams(query))).toBe(
      false,
    );
    for (const parse of parsers)
      expect(() =>
        parse(url(`from=2026-01-01&to=2026-01-31&${query}`)),
      ).toThrow();
  });

  it.each([
    "Europe/Paris",
    "America/New_York",
    "Pacific/Honolulu",
    "Pacific/Kiritimati",
  ])(
    "uses UTC default periods independently of host timezone %s",
    (hostZone) => {
      process.env.TZ = hostZone;
      for (const parse of parsers) {
        expect(
          parse(url(), new Date("2026-11-01T00:30:00.000Z")),
        ).toMatchObject({
          from: "2026-10-03",
          to: "2026-11-01",
          start: "2026-10-03T00:00:00.000Z",
          end: "2026-11-02T00:00:00.000Z",
        });
      }
    },
  );
});
