import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../../apps/web/public/locale-init.js", import.meta.url),
  "utf8",
);

function bootstrap(
  href: string,
  {
    cookie = "",
    stored = null,
  }: { cookie?: string; stored?: string | null } = {},
) {
  const url = new URL(href);
  const root = {
    dataset: { publicLocale: "fr", publicPath: url.pathname } as Record<
      string,
      string
    >,
    style: {} as Record<string, string>,
  };
  const preloads: Array<{ href: string; rel: string }> = [];
  const redirects: string[] = [];
  runInNewContext(source, {
    URL,
    location: {
      href,
      pathname: url.pathname,
      hash: url.hash,
      replace: (target: string) => redirects.push(target),
    },
    localStorage: { getItem: () => stored },
    document: {
      documentElement: root,
      cookie,
      querySelector: (selector: string) => {
        const locale = /guteneo-locale-(fr|en|de|lb)/.exec(selector)?.[1];
        return locale ? { content: `/assets/${locale}-synthetic.js` } : null;
      },
      createElement: () => ({}),
      head: {
        appendChild: (element: { href: string; rel: string }) =>
          preloads.push(element),
      },
    },
  });
  return { root, preloads, redirects };
}

describe("pre-paint public locale bootstrap", () => {
  it("suppresses the public fallback on a private hash without preloading a public language", () => {
    const result = bootstrap("https://synthetic.invalid/#/app/documents");
    expect(result.root.dataset.publicBootstrapPending).toBe("true");
    expect(result.preloads).toEqual([]);
    expect(result.redirects).toEqual([]);
  });

  it("preloads only an explicit public language even when static HTML is French", () => {
    const result = bootstrap("https://synthetic.invalid/pricing/?lang=en");
    expect(result.root.dataset.publicBootstrapPending).toBe("true");
    expect(result.preloads.map((item) => item.href)).toEqual([
      "/assets/en-synthetic.js",
    ]);
    expect(result.redirects).toEqual([]);
  });

  it("keeps matching server text visible and preloads its language", () => {
    const result = bootstrap("https://synthetic.invalid/pricing/?lang=fr");
    expect(result.root.dataset.publicBootstrapPending).toBeUndefined();
    expect(result.preloads.map((item) => item.href)).toEqual([
      "/assets/fr-synthetic.js",
    ]);
  });

  it("respects a bounded account cookie without fetching the old server language", () => {
    const result = bootstrap("https://synthetic.invalid/pricing/", {
      cookie: "guteneo_locale=account.de",
    });
    expect(result.root.dataset.publicBootstrapPending).toBe("true");
    expect(result.preloads.map((item) => item.href)).toEqual([
      "/assets/de-synthetic.js",
    ]);
    expect(result.redirects).toEqual([]);
  });

  it("canonicalizes a legacy visitor choice once and suppresses the superseded document", () => {
    const result = bootstrap("https://synthetic.invalid/pricing/#costs", {
      stored: "lb",
    });
    expect(result.root.style.visibility).toBe("hidden");
    expect(result.redirects).toEqual([
      "https://synthetic.invalid/pricing/?lang=lb#costs",
    ]);
    expect(result.preloads).toEqual([]);
  });

  it("never replays authentication query parameters into a locale redirect", () => {
    const result = bootstrap("https://synthetic.invalid/?code=synthetic", {
      stored: "en",
    });
    expect(result.redirects).toEqual([]);
    expect(result.preloads.map((item) => item.href)).toEqual([
      "/assets/en-synthetic.js",
    ]);
  });
});
