import { afterEach, describe, expect, it } from "vitest";
import { bmsg } from "../../apps/web/src/belvedere-i18n";
import { setLocale } from "../../apps/web/src/locale";
import { msg, msgIn } from "../../apps/web/src/messages";
import terminology from "../../apps/web/src/locales/workspace-terminology.json";

afterEach(() => setLocale("fr", false));

describe("reviewed workspace terminology compatibility", () => {
  it.each([
    [
      "fr",
      "Espaces de travail",
      "Créer mon espace de travail",
      "Changer d’espace de travail",
    ],
    ["en", "Workspaces", "Create my workspace", "Switch workspace"],
    [
      "de",
      "Arbeitsbereiche",
      "Meinen Arbeitsbereich erstellen",
      "Arbeitsbereich wechseln",
    ],
    [
      "lb",
      "Aarbechtsberäicher",
      "Mäin Aarbechtsberäich erstellen",
      "Aarbechtsberäich wiesselen",
    ],
  ] as const)(
    "preserves English and legacy French keys in %s",
    (locale, plural, create, change) => {
      setLocale(locale, false);
      expect(bmsg("Workshops")).toBe(plural);
      expect(bmsg("Ateliers")).toBe(plural);
      expect(msg("Create my workspace")).toBe(create);
      expect(msg("Créer mon atelier")).toBe(create);
      expect(msgIn("workspace-account", "Switch workspace")).toBe(change);
    },
  );

  it("keeps interpolation, whitespace, customer names and historical printing copy intact", () => {
    setLocale("fr", false);
    expect(msg("  Sign {0} out of this workshop ", "Atelier Gutenberg")).toBe(
      "  Déconnecter Atelier Gutenberg de cet espace de travail ",
    );
    expect(msg("Workshop file from my customer")).toBe(
      "Workshop file from my customer",
    );
    expect(msg("Stories from the workspace")).toBe(
      "Les histoires de l’atelier",
    );
  });

  it("retains every placeholder and restricts revisions to complete authored labels", () => {
    for (const [source, locales] of Object.entries(terminology)) {
      expect(source.trim()).toBe(source);
      for (const copy of Object.values(locales)) {
        expect(copy.trim(), source).not.toBe("");
        expect((copy.match(/\{\d+\}/g) ?? []).sort(), source).toEqual(
          (source.match(/\{\d+\}/g) ?? []).sort(),
        );
        expect(copy, source).not.toMatch(/atelier|workshop|werkstatt/i);
      }
    }
  });

  it.each(["fr", "en", "de", "lb"] as const)(
    "translates correction and replacement actions in %s",
    (locale) => {
      setLocale(locale, false);
      for (const source of [
        "Replace the data file",
        "Corrected data file",
        "Import and keep my mapping",
        "Correct and create a new version",
        "Correct source data",
        "Correct this document’s data",
        "← Original generation",
        "Use this version with the same data",
      ]) {
        expect(msg(source).trim()).not.toBe("");
        if (locale !== "en") expect(msg(source), source).not.toBe(source);
      }
    },
  );
});
