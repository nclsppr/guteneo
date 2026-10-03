import { afterEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import {
  catalogs,
  getLocale,
  getLocaleSelectionVersion,
  getLocaleSource,
  initializeLocale,
  setAutomaticLocale,
  setLocale,
  t,
  useLocaleSource,
  useLocale,
} from "../../apps/web/src/locale";
import { msg, messages } from "../../apps/web/src/messages";
import { nanoMoney, money, setSession } from "../../apps/web/src/api";
import { getCustomerPricing } from "../../apps/web/src/customer-pricing";
import { getPublicSocialCopy } from "../../apps/web/src/editorial/social-copy";
import publicSite from "../../packages/contracts/src/public-site.json";

vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof React>();
  return {
    ...react,
    useSyncExternalStore: vi.fn(react.useSyncExternalStore),
  };
});

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
  it("provides page-specific metadata for every public route in all four languages", () => {
    for (const path of publicSite.paths) {
      const french = getPublicSocialCopy(path, "fr");
      expect(french?.title).toContain("Guteneo");
      for (const locale of ["en", "de", "lb"] as const) {
        const translated = getPublicSocialCopy(path, locale);
        expect(translated?.title.trim()).toBeTruthy();
        expect(translated?.description.trim()).toBeTruthy();
        expect(translated?.description).not.toBe(french?.description);
      }
    }
    expect(getPublicSocialCopy("/unknown/", "en")).toBeNull();
    setLocale("lb", false);
    expect(getPublicSocialCopy("/", "de")?.title).toBe(
      "Guteneo · Damit Ihre Worte weiterkommen.",
    );
  });
  it("server rendering uses the selected build language rather than resetting to French", () => {
    function ServerLanguage() {
      return React.createElement("span", null, useLocale());
    }
    for (const locale of ["fr", "en", "de", "lb"] as const) {
      setLocale(locale, false);
      expect(renderToString(React.createElement(ServerLanguage))).toBe(
        `<span>${locale}</span>`,
      );
    }
  });
});
describe("language precedence and resilient preference storage", () => {
  function browser(
    stored: string | null,
    languages: string[] | undefined,
    search = "",
    language = languages?.[0] ?? "fr",
    path = "/",
  ) {
    const setItem = vi.fn();
    const location = new URL(path, "https://guteneo.com");
    location.search = search;
    vi.stubGlobal("window", {
      location,
      history: {
        state: null,
        replaceState: vi.fn(
          (_state: unknown, _title: string, url?: string | URL | null) => {
            if (url) location.href = new URL(url, location).href;
          },
        ),
      },
      localStorage: { getItem: () => stored, setItem, removeItem: vi.fn() },
    });
    vi.stubGlobal("navigator", { languages, language });
    vi.stubGlobal("document", { documentElement: { lang: "fr" } });
    return setItem;
  }
  it("uses regional browser preferences with French fallback", () => {
    browser(null, ["es-ES", "de-AT"]);
    initializeLocale();
    expect(getLocale()).toBe("de");
    expect(getLocaleSource()).toBe("browser");
    browser(null, ["es-ES"]);
    initializeLocale();
    expect(getLocale()).toBe("fr");
  });
  it("falls back to navigator.language when the language list is unavailable", () => {
    browser(null, undefined, "", "lb-LU");
    initializeLocale();
    expect(getLocale()).toBe("lb");
    expect(getLocaleSource()).toBe("browser");
    browser(null, [], "", "en-US");
    initializeLocale();
    expect(getLocale()).toBe("en");
  });
  it("restores a saved explicit choice ahead of the browser, then the account", () => {
    browser("lb", ["en-US"]);
    initializeLocale();
    expect(getLocale()).toBe("lb");
    expect(getLocaleSource()).toBe("selection");
    setSession({
      user: { id: "test", role: "member", name: "Test", preferredLocale: "de" },
      organization: { id: "test", name: "Test" },
      csrfToken: "",
      simulation: true,
    });
    expect(getLocale()).toBe("de");
    expect(getLocaleSource()).toBe("account");
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
    // The restored ?lang=lb may be persisted again; an account's "de" must never leak into it.
    for (const call of write.mock.calls) {
      expect(call).toEqual(["guteneo.locale", "lb"]);
    }
  });
  it("supports shareable explicit choices but rejects unsupported query values", () => {
    const persist = browser("fr", ["de"], "?lang=en-GB");
    initializeLocale();
    expect(getLocale()).toBe("en");
    expect(getLocaleSource()).toBe("selection");
    expect(persist).toHaveBeenCalledWith("guteneo.locale", "en");
    browser("lb", ["de"], "?lang=javascript:alert(1)");
    initializeLocale();
    expect(getLocale()).toBe("lb");
  });
  it("resets saved and URL choices while preserving navigation state", () => {
    let stored: string | null = "lb";
    const url = new URL("https://guteneo.com/?example=1&lang=lb#pricing");
    const state = { route: "pricing" };
    const replaceState = vi.fn();
    const setItem = vi.fn();
    const removeItem = vi.fn(() => {
      stored = null;
    });
    vi.stubGlobal("window", {
      location: url,
      history: { state, replaceState },
      localStorage: { getItem: () => stored, setItem, removeItem },
    });
    vi.stubGlobal("navigator", { languages: ["es-ES", "en-GB"] });
    vi.stubGlobal("document", { documentElement: { lang: "fr" } });
    initializeLocale();
    setItem.mockClear();
    replaceState.mockClear();
    const version = getLocaleSelectionVersion();
    setAutomaticLocale();
    expect(getLocaleSelectionVersion()).toBe(version + 1);
    expect(removeItem).toHaveBeenCalledWith("guteneo.locale");
    expect(setItem).not.toHaveBeenCalled();
    expect(getLocale()).toBe("en");
    expect(getLocaleSource()).toBe("browser");
    expect(document.documentElement.lang).toBe("en");
    expect(replaceState).toHaveBeenCalledOnce();
    expect(replaceState.mock.calls[0][0]).toBe(state);
    const replacement = new URL(String(replaceState.mock.calls[0][2]));
    expect(replacement.href).toBe("https://guteneo.com/?example=1#pricing");
    vi.stubGlobal("window", {
      location: replacement,
      localStorage: { getItem: () => stored, setItem, removeItem },
    });
    initializeLocale();
    expect(getLocale()).toBe("en");
    expect(getLocaleSource()).toBe("browser");
  });
  it("notifies language-source consumers even when the language stays the same", () => {
    browser("fr", ["fr-FR"]);
    initializeLocale();
    const listener = vi.fn();
    let unsubscribe = () => {};
    const hook = vi
      .mocked(React.useSyncExternalStore)
      .mockImplementationOnce((subscribe, getSnapshot) => {
        unsubscribe = subscribe(listener);
        return getSnapshot();
      });
    try {
      expect(useLocaleSource()).toBe("selection");
      setAutomaticLocale();
      expect(getLocale()).toBe("fr");
      expect(getLocaleSource()).toBe("browser");
      expect(listener).toHaveBeenCalledTimes(1);
      setLocale("fr", false);
      expect(getLocaleSource()).toBe("account");
      expect(listener).toHaveBeenCalledTimes(2);
    } finally {
      unsubscribe();
      hook.mockReset();
    }
  });
  it("adds a shareable public language choice and removes it when returning to automatic", () => {
    browser(null, ["fr"], "?campaign=journal", undefined, "/journal/");
    initializeLocale();
    expect(window.location.search).toBe("?campaign=journal");
    setLocale("de");
    const url = new URL(window.location.href);
    expect(url.pathname).toBe("/journal/");
    expect(url.searchParams.get("campaign")).toBe("journal");
    expect(url.searchParams.getAll("lang")).toEqual(["de"]);
    setAutomaticLocale();
    expect(window.location.search).toBe("?campaign=journal");
    expect(getLocale()).toBe("fr");
    expect(getLocaleSource()).toBe("browser");
  });
  it("restores an explicit saved language in the URL without making browser inference shareable", () => {
    browser("lb", ["de"], "", undefined, "/support/");
    initializeLocale();
    expect(window.location.search).toBe("?lang=lb");
    browser(null, ["de"], "", undefined, "/support/");
    initializeLocale();
    expect(getLocale()).toBe("de");
    expect(window.location.search).toBe("");
  });
  it("does not select the first value from conflicting language parameters", () => {
    browser("lb", ["fr"], "?lang=en&lang=de");
    initializeLocale();
    expect(getLocale()).toBe("lb");
  });
  it("does not add sharing parameters to authenticated, private-query or unknown routes", () => {
    for (const [path, search] of [
      ["/#/app", ""],
      ["/oauth/authorize", "?client_id=example"],
      ["/", "?code=private-code&state=private-state"],
      ["/unknown/", ""],
    ]) {
      browser(null, ["fr"], search, undefined, path);
      const before = window.location.href;
      setLocale("de");
      expect(getLocale()).toBe("de");
      expect(window.location.href).toBe(before);
    }
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
        removeItem: () => {
          throw new Error("blocked");
        },
      },
    });
    initializeLocale();
    expect(getLocale()).toBe("lb");
    setLocale("en");
    expect(getLocale()).toBe("en");
    expect(document.documentElement.lang).toBe("en");
    setAutomaticLocale();
    expect(getLocale()).toBe("lb");
    expect(getLocaleSource()).toBe("browser");
    expect(document.documentElement.lang).toBe("lb");
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
