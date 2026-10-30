import { describe, expect, it } from "vitest";
import {
  globeCountryCoordinate,
  globeCountryCounts,
  projectGlobePoint,
} from "../../apps/web/src/belvedere-globe";
import geography from "../../apps/web/src/belvedere-globe-data.json";

describe("Belvédère orthographic country geography", () => {
  it("centres a country and hides its antipode", () => {
    const paris = [2.35, 48.86] as const;
    const centre = projectGlobePoint(paris, paris);
    expect(centre.x).toBeCloseTo(0, 12);
    expect(centre.y).toBeCloseTo(0, 12);
    expect(centre.depth).toBeCloseTo(1, 12);
    const opposite = projectGlobePoint([-177.65, -48.86], paris);
    expect(opposite.x).toBeCloseTo(0, 12);
    expect(opposite.y).toBeCloseTo(0, 12);
    expect(opposite.depth).toBeCloseTo(-1, 12);
  });

  it("preserves east-right / north-up orientation and the visible limb", () => {
    const east = projectGlobePoint([90, 0], [0, 0]);
    expect(east.x).toBeCloseTo(1, 12);
    expect(east.depth).toBeCloseTo(0, 12);
    const west = projectGlobePoint([-90, 0], [0, 0]);
    expect(west.x).toBeCloseTo(-1, 12);
    expect(projectGlobePoint([0, 90], [0, 0]).y).toBeCloseTo(-1, 12);
    expect(projectGlobePoint([0, -90], [0, 0]).y).toBeCloseTo(1, 12);
  });

  it("wraps the antimeridian without discontinuity", () => {
    const positive = projectGlobePoint([180, 20], [179, 15]);
    const negative = projectGlobePoint([-180, 20], [179, 15]);
    expect(positive.x).toBeCloseTo(negative.x, 12);
    expect(positive.y).toBeCloseTo(negative.y, 12);
    expect(positive.depth).toBeCloseTo(negative.depth, 12);
  });

  it("preserves unit sphere geometry at poles and oblique camera angles", () => {
    for (const centre of [
      [13, 29],
      [179, -80],
      [-179, 90],
    ] as const) {
      for (let lon = -180; lon <= 180; lon += 30) {
        for (let lat = -90; lat <= 90; lat += 15) {
          const point = projectGlobePoint([lon, lat], centre);
          expect(point.x ** 2 + point.y ** 2 + point.depth ** 2).toBeCloseTo(
            1,
            12,
          );
          expect(point.x ** 2 + point.y ** 2).toBeLessThanOrEqual(1 + 1e-12);
        }
      }
    }
  });

  it.each([null, "ZZ", "XX", "__proto__", "constructor", "fr", "FRA", ""])(
    "never assigns an invented position to %s",
    (country) => expect(globeCountryCoordinate(country)).toBeNull(),
  );

  it("uses country representative positions including small countries", () => {
    for (const country of ["FR", "LU", "BE", "DE", "US", "JP", "SG"]) {
      expect(globeCountryCoordinate(country)).toEqual(
        (geography.countries as Record<string, number[]>)[country],
      );
    }
    const france = globeCountryCoordinate("FR")!;
    expect(france[0]).toBeGreaterThan(-5);
    expect(france[0]).toBeLessThan(9);
    expect(france[1]).toBeGreaterThan(42);
    expect(france[1]).toBeLessThan(51);
  });

  it("vendors bounded finite geography, preserving source provenance", () => {
    expect(geography.sourceCommit).toBe(
      "ca96624a56bd078437bca8184e78163e5039ad19",
    );
    expect(geography.land).toHaveLength(8051);
    expect(Object.keys(geography.countries)).toHaveLength(237);
    for (const [lon, lat] of [
      ...geography.land,
      ...Object.values(geography.countries),
    ]) {
      expect(Number.isFinite(lon)).toBe(true);
      expect(Number.isFinite(lat)).toBe(true);
      expect(Math.abs(lon!)).toBeLessThanOrEqual(180);
      expect(Math.abs(lat!)).toBeLessThanOrEqual(90);
    }
  });
});

describe("Belvédère country volume accounting", () => {
  it("combines duplicates without dropping unlocated or missing-country volume", () => {
    const result = globeCountryCounts([
      { country: "FR", connections: 9 },
      { country: null, connections: 4 },
      { country: "FR", connections: 3 },
      { country: "ZZ", connections: 2 },
      { country: "invalid", connections: 1 },
    ]);
    expect(result).toEqual([
      { country: "FR", connections: 12 },
      { country: null, connections: 5 },
      { country: "ZZ", connections: 2 },
    ]);
    expect(result.reduce((total, row) => total + row.connections, 0)).toBe(19);
    expect(result.filter((row) => globeCountryCoordinate(row.country))).toEqual(
      [{ country: "FR", connections: 12 }],
    );
  });

  it("sorts ties deterministically and ignores malformed counts", () => {
    expect(
      globeCountryCounts([
        { country: "US", connections: 3 },
        { country: "FR", connections: 3 },
        { country: null, connections: 3 },
        ...[0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map(
          (connections) => ({ country: "DE", connections }),
        ),
      ]),
    ).toEqual([
      { country: "FR", connections: 3 },
      { country: "US", connections: 3 },
      { country: null, connections: 3 },
    ]);
  });
});
