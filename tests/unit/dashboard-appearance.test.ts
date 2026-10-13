import { describe, expect, it } from "vitest";
import {
  dashboardAppearanceStorageKey,
  dashboardAppearanceUrl,
  initialDashboardAppearance,
} from "../../apps/web/src/dashboard-appearance";
import dashboardMessages from "../../apps/web/src/locales/messages-dashboard-v2.json";

function storage(initial?: string) {
  const entries = new Map<string, string>();
  if (initial !== undefined)
    entries.set(dashboardAppearanceStorageKey, initial);
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
  };
}

describe("dashboard appearance browser fallback", () => {
  it("keeps the current interface by default and ignores unknown values", () => {
    expect(initialDashboardAppearance("")).toBe("classic");
    expect(
      initialDashboardAppearance("?atelier=other", storage("corrupt")),
    ).toBe("classic");
  });

  it("remembers an explicit V2 choice before sign-in and restores it on return", () => {
    const saved = storage("classic");
    expect(initialDashboardAppearance("?atelier=v2", saved)).toBe("v2");
    expect(saved.getItem(dashboardAppearanceStorageKey)).toBe("v2");
    expect(initialDashboardAppearance("", saved)).toBe("v2");
  });

  it("lets an explicit classic link override the browser V2 preference", () => {
    const saved = storage("v2");
    expect(initialDashboardAppearance("?atelier=classic", saved)).toBe(
      "classic",
    );
    expect(initialDashboardAppearance("", saved)).toBe("classic");
  });

  it("preserves a valid browser preference when the query is unrelated or unknown", () => {
    expect(initialDashboardAppearance("?lang=de", storage("v2"))).toBe("v2");
    expect(initialDashboardAppearance("?atelier=unknown", storage("v2"))).toBe(
      "v2",
    );
  });

  it("continues when storage is unavailable, throws on access, or rejects writes", () => {
    const blocked = {
      getItem: () => {
        throw new Error("Storage disabled");
      },
      setItem: () => {
        throw new Error("Storage full");
      },
    };
    expect(initialDashboardAppearance("", blocked)).toBe("classic");
    expect(initialDashboardAppearance("?atelier=v2", blocked)).toBe("v2");
    expect(initialDashboardAppearance("?atelier=v2")).toBe("v2");
  });

  it("changes only appearance while preserving the route and other query parameters", () => {
    const changed = dashboardAppearanceUrl(
      "https://guteneo.com/?lang=de&atelier=v2#/app/prepare?document=doc_42",
      "classic",
    );
    expect(changed).toBe(
      "/?lang=de&atelier=classic#/app/prepare?document=doc_42",
    );
    expect(
      dashboardAppearanceUrl(
        "https://guteneo.com/?lang=fr#/app/dispatches?group=attention",
        "v2",
      ),
    ).toBe("/?lang=fr&atelier=v2#/app/dispatches?group=attention");
  });

  it("provides every appearance message in English, German, and Luxembourgish", () => {
    for (const [source, translations] of Object.entries(dashboardMessages)) {
      expect(source.trim()).not.toBe("");
      expect(translations).toHaveLength(3);
      expect(translations.every((text) => text.trim().length > 0)).toBe(true);
    }
  });
});
