import { afterEach, describe, expect, it, vi } from "vitest";
import {
  catalogs,
  getLocale,
  initializeLocale,
  setLocale,
  t,
} from "../../apps/web/src/locale";
import { msg, messages } from "../../apps/web/src/messages";
import { nanoMoney, money, setSession } from "../../apps/web/src/api";
import { getCustomerPricing } from "../../apps/web/src/customer-pricing";

function leaves(value: unknown, prefix = ""): Record<string, string> {
  if (typeof value === "string") return { [prefix]: value };
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, item]) =>
      Object.entries(leaves(item, prefix ? `${prefix}.${key}` : key)),
    ),
  );
}
afterEach(() => {
  setSession(null);
  vi.unstubAllGlobals();
  setLocale("fr", false);
});
describe("complete product language catalogs", () => {
  for (const locale of ["en", "de", "lb"] as const) {
    it(`${locale} covers every French catalog leaf including array content`, () => {
      const source = leaves(catalogs.fr);
      const translated = leaves(catalogs[locale]);
      expect(Object.keys(translated).sort()).toEqual(
        Object.keys(source).sort(),
      );
      for (const value of Object.values(translated))
        expect(value.trim()).not.toBe("");
      expect(translated["landing.title"]).not.toEqual(source["landing.title"]);
      expect(translated["homepage.faq.items.1.answer"]).not.toEqual(
        source["homepage.faq.items.1.answer"],
      );
    });
  }
  it("supplemental copy includes all three translations and identical placeholders", () => {
    for (const [source, translations] of Object.entries(messages)) {
      expect(translations, source).toHaveLength(3);
      for (const value of translations) {
        expect(value.trim(), source).not.toBe("");
        expect((value.match(/\{\d+\}/g) ?? []).sort(), source).toEqual(
          (source.match(/\{\d+\}/g) ?? []).sort(),
        );
      }
    }
  });
  it("updates previously imported catalog bindings and render-time pricing", () => {
    const initial = t.landing.title;
    setLocale("de", false);
    expect(t.landing.title).not.toBe(initial);
    expect(getCustomerPricing().rates[2].prices[0].amount).toBe("Ab 2,50 €");
    setLocale("en", false);
    expect(msg("  Créer mon compte ")).toBe("  Create my account ");
    expect(getCustomerPricing().rates[2].prices[0].amount).toBe("From €2.50");
    expect(msg("Customer-supplied document title")).toBe(
      "Customer-supplied document title",
    );
  });
});
describe("language precedence and resilient preference storage", () => {
  function browser(stored: string | null, languages: string[], search = "") {
    const setItem = vi.fn();
    vi.stubGlobal("window", {
      location: { search },
      localStorage: { getItem: () => stored, setItem },
    });
    vi.stubGlobal("navigator", { languages });
    vi.stubGlobal("document", { documentElement: { lang: "fr" } });
    return setItem;
  }
  it("uses regional browser preferences with French fallback", () => {
    browser(null, ["es-ES", "de-AT"]);
    initializeLocale();
    expect(getLocale()).toBe("de");
    browser(null, ["es-ES"]);
    initializeLocale();
    expect(getLocale()).toBe("fr");
  });
  it("restores a saved explicit choice ahead of the browser, then the account", () => {
    browser("lb", ["en-US"]);
    initializeLocale();
    expect(getLocale()).toBe("lb");
    setSession({
      user: { id: "test", role: "member", name: "Test", preferredLocale: "de" },
      organization: { id: "test", name: "Test" },
      csrfToken: "",
      simulation: true,
    });
    expect(getLocale()).toBe("de");
  });
  it("keeps server preferences separate from the anonymous browser and other users", () => {
    const write = browser("lb", ["en-GB"]);
    initializeLocale();
    const base = {
      organization: { id: "org", name: "Example" },
      csrfToken: "",
      simulation: true,
    };
    setSession({
      ...base,
      user: {
        id: "first",
        name: "First",
        role: "member",
        preferredLocale: "de",
      },
    });
    expect(getLocale()).toBe("de");
    expect(write).not.toHaveBeenCalled();
    setSession(null);
    expect(getLocale()).toBe("lb");
    setSession({
      ...base,
      user: {
        id: "second",
        name: "Second",
        role: "member",
        preferredLocale: null,
      },
    });
    expect(getLocale()).toBe("lb");
    expect(write).not.toHaveBeenCalled();
  });
  it("supports shareable explicit choices but rejects unsupported query values", () => {
    const persist = browser("fr", ["de"], "?lang=en-GB");
    initializeLocale();
    expect(getLocale()).toBe("en");
    expect(persist).toHaveBeenCalledWith("guteneo.locale", "en");
    browser("lb", ["de"], "?lang=javascript:alert(1)");
    initializeLocale();
    expect(getLocale()).toBe("lb");
  });
  it("keeps language selection working when browser storage is unavailable", () => {
    browser(null, ["lb-LU"]);
    vi.stubGlobal("window", {
      location: { search: "" },
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });
    initializeLocale();
    expect(getLocale()).toBe("lb");
    setLocale("en");
    expect(getLocale()).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });
});
describe("localized money without changing financial precision", () => {
  it("keeps fractional quote precision and currency placement", () => {
    setLocale("en", false);
    expect(nanoMoney(1_234_567)).toBe("€0.001234567");
    expect(money(250)).toBe("€2.50");
    setLocale("de", false);
    expect(nanoMoney(1_234_567)).toBe("0,001234567\u00a0€");
    expect(money(250)).toBe("2,50\u00a0€");
  });
});
