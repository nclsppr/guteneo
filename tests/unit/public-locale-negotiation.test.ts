import { describe, expect, it } from "vitest";
import {
  parsePublicLocaleCookie,
  publicLocaleCookieMaxAge,
  publicLocaleCookieName,
  resolvePublicRequestLocale,
} from "../../packages/contracts/src/public-locales";
import { supportedLocales } from "../../packages/contracts/src/locale";

describe("public locale presentation hint", () => {
  it("has one bounded cookie contract shared by browser and HTTP rendering", () => {
    expect(publicLocaleCookieName).toBe("guteneo_locale");
    expect(publicLocaleCookieMaxAge).toBe(31_536_000);
  });

  it.each(supportedLocales)(
    "reads supported %s hints without identity data",
    (locale) => {
      for (const source of ["selection", "account"] as const) {
        expect(
          parsePublicLocaleCookie(
            `unrelated=value; ${publicLocaleCookieName}=${source}.${locale}; another=value`,
          ),
        ).toEqual({ source, locale });
      }
    },
  );

  it.each([
    null,
    undefined,
    "",
    "guteneo.locale=en",
    "guteneo_locale",
    "guteneo_locale=",
    "guteneo_locale=en",
    "guteneo_locale=account.en-GB",
    "guteneo_locale=account.EN",
    "guteneo_locale=account.es",
    "guteneo_locale=browser.en",
    "guteneo_locale=administrator.en",
    'guteneo_locale="account.en"',
    "guteneo_locale=account%2Een",
    "guteneo_locale=account.en=extra",
    "guteneo_locale=selection.en; guteneo_locale=selection.en",
    "guteneo_locale=selection.en; guteneo_locale=account.fr",
    "guteneo_locale=selection.en; guteneo_locale",
    `unrelated=${"x".repeat(8192)}; guteneo_locale=account.en`,
  ])("rejects unsupported or ambiguous header %s", (header) => {
    expect(parsePublicLocaleCookie(header)).toBeNull();
  });

  it("never negotiates private namespaces or arbitrary assets", () => {
    for (const path of [
      "/api/session",
      "/app/account",
      "/share/fixture",
      "/assets/app.js",
      "/__public-locales/en/",
    ])
      expect(
        resolvePublicRequestLocale(
          new URL(`https://guteneo.com${path}?lang=en`),
          new Headers({
            Cookie: "guteneo_locale=account.lb",
            "Accept-Language": "de-DE",
          }),
        ),
      ).toBeNull();
  });
});
