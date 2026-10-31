import { describe, expect, it } from "vitest";
import { previewCountsForVolume } from "../../apps/web/src/local-preview-controls";

describe("local scenario volume presets", () => {
  it("keeps the legacy scenario interactive and reproduces five bounded counts per seed", () => {
    expect(previewCountsForVolume("default", "example")).toBeNull();
    for (const [preset, minimum, maximum] of [
      ["small", 10, 50],
      ["large", 10_000, 100_000],
      ["huge", 100_000, 1_000_000],
      ["extreme", 1_000_000, 1_000_000_000],
    ] as const) {
      const first = previewCountsForVolume(preset, "first seed")!;
      expect(Object.keys(first).sort()).toEqual([
        "datasets",
        "dispatches",
        "documents",
        "generations",
        "templates",
      ]);
      expect(previewCountsForVolume(preset, "first seed")).toEqual(first);
      expect(previewCountsForVolume(preset, "second seed")).not.toEqual(first);
      for (const count of Object.values(first)) {
        expect(Number.isSafeInteger(count)).toBe(true);
        expect(count).toBeGreaterThanOrEqual(minimum);
        expect(count).toBeLessThanOrEqual(maximum);
      }
    }
  });
});
