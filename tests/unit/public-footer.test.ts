import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { PublicFooter } from "../../apps/web/src/public-chrome";
import { setLocale, supportedLocales } from "../../apps/web/src/locale";
import footer from "../../packages/contracts/src/public-footer.json" with { type: "json" };

afterEach(() => setLocale("fr", false));

describe("shared public footer engineering destination", () => {
  it.each(supportedLocales)(
    "renders the localized %s label with the canonical English-site URL",
    (locale) => {
      setLocale(locale, false);
      const html = renderToStaticMarkup(createElement(PublicFooter));
      const engineering = footer.groups
        .flatMap((group) => group.links)
        .find((link) => link.href === "https://engineering.guteneo.com/")!;
      expect(html).toContain(
        `<a href="${engineering.href}">${engineering.labels[locale]}</a>`,
      );
      expect(html).not.toContain("https://engineering.guteneo.com/?");
      const navigation = html.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/)![1];
      expect(navigation.match(/<a\b/g)).toHaveLength(16);
    },
  );
});
