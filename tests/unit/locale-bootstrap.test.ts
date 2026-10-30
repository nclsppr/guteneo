import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(
  new URL("../../apps/web/public/locale-init.js", import.meta.url),
  "utf8",
);

function boot({
  path = "/pricing/",
  stored = "lb",
  cookie = "",
  language = "fr",
  publicPage = true,
  publicPath = "",
  privateAccount = false,
  blocked = false,
} = {}) {
  const replace = vi.fn();
  const location = Object.assign(new URL(path, "https://guteneo.com"), {
    replace,
  });
  runInNewContext(source, {
    URL,
    location,
    document: {
      querySelector: () => (privateAccount ? {} : null),
      documentElement: {
        dataset: publicPage
          ? {
              publicLocale: language,
              publicPath: publicPath || location.pathname,
            }
          : {},
        style: {},
      },
      cookie,
    },
    localStorage: {
      getItem: () => {
        if (blocked) throw new Error("Storage unavailable");
        return stored;
      },
    },
  });
  return replace;
}

describe("public locale before first paint", () => {
  it("migrates an old device-only choice once while preserving the route and fragment", () => {
    const replace = boot({ path: "/pricing/?example=1#pdf-checks" });
    expect(replace).toHaveBeenCalledExactlyOnceWith(
      "https://guteneo.com/pricing/?example=1&lang=lb#pdf-checks",
    );
    expect(boot({ path: "/pricing/?lang=lb" })).not.toHaveBeenCalled();
  });
  it.each(["fr", "en-GB", "de", "lb"])(
    "keeps an explicit %s URL ahead of another saved device language",
    (locale) => {
      expect(boot({ path: `/pricing/?lang=${locale}` })).not.toHaveBeenCalled();
    },
  );
  it.each(["selection.en", "account.de"])(
    "trusts the server-selected presentation hint %s over older device storage",
    (hint) => {
      expect(boot({ cookie: `guteneo_locale=${hint}` })).not.toHaveBeenCalled();
    },
  );
  it.each([
    "guteneo_locale=account.en; guteneo_locale=selection.de",
    "guteneo_locale; guteneo_locale=account.en",
    "guteneo_locale=account.es",
  ])("ignores an ambiguous or invalid cookie %s", (cookie) => {
    expect(boot({ cookie })).toHaveBeenCalledOnce();
  });
  it.each([
    "/?lang=fr#/app/account",
    "/?token=private",
    "/?code=private&state=private",
    "/?error=authentication_failed",
  ])("never replays a private entry or authentication URL %s", (path) => {
    expect(boot({ path })).not.toHaveBeenCalled();
  });
  it("keeps matching HTML, non-public shells and blocked storage usable", () => {
    expect(boot({ language: "lb" })).not.toHaveBeenCalled();
    expect(boot({ publicPage: false })).not.toHaveBeenCalled();
    expect(boot({ blocked: true })).not.toHaveBeenCalled();
  });
  it.each(["/belvedere/private-entry", "/invitation/", "/app"])(
    "never treats the reused root shell at %s as a public document",
    (path) => {
      expect(boot({ path, publicPath: "/" })).not.toHaveBeenCalled();
    },
  );
  it("does not migrate a guarded platform page sharing the root pathname", () => {
    expect(
      boot({ path: "/", publicPath: "/", privateAccount: true }),
    ).not.toHaveBeenCalled();
  });
});
