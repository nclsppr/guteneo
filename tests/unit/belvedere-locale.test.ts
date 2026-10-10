import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { bmsg, belvedereMessages } from "../../apps/web/src/belvedere-i18n";
import { formatLocale, setLocale } from "../../apps/web/src/locale";
import {
  channelName,
  countryName,
  dateTime,
  money,
  number,
  roleName,
  shortDate,
  statusName,
} from "../../apps/web/src/belvedere-data";
import { BelvedereGlobe } from "../../apps/web/src/belvedere-globe";

afterEach(() => setLocale("fr", false));

describe("Belvédère account-language interface", () => {
  it("covers every explicit interface message with identical interpolation parameters", () => {
    for (const [source, translations] of Object.entries(belvedereMessages)) {
      expect(translations, source).toHaveLength(3);
      for (const translation of translations) {
        expect(translation.trim(), source).not.toBe("");
        expect((translation.match(/\{\d+\}/g) ?? []).sort(), source).toEqual(
          (source.match(/\{\d+\}/g) ?? []).sort(),
        );
      }
    }
    for (const file of [
      "belvedere.tsx",
      "belvedere-globe.tsx",
      "belvedere-data.ts",
    ]) {
      const text = readFileSync(
        new URL(`../../apps/web/src/${file}`, import.meta.url),
        "utf8",
      );
      const source = ts.createSourceFile(
        file,
        text,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      const visit = (node: ts.Node) => {
        if (
          ts.isCallExpression(node) &&
          node.expression.getText(source) === "bmsg"
        ) {
          const message = node.arguments[0];
          if (message && ts.isStringLiteral(message))
            expect(
              belvedereMessages,
              `${file}: ${message.text}`,
            ).toHaveProperty(message.text.trim());
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
      expect(text).not.toContain('NumberFormat("fr-FR"');
      expect(text).not.toContain('DateTimeFormat("fr-FR"');
      expect(text).not.toContain('DisplayNames("fr"');
      expect(text).not.toContain("bmsg(error.message)");
    }
  });

  it.each(["fr", "en", "de", "lb"] as const)(
    "formats values and the accessible globe in %s",
    (locale) => {
      setLocale(locale, false);
      const tag = formatLocale();
      expect(number(1234567.8)).toBe(
        new Intl.NumberFormat(tag).format(1234567.8),
      );
      expect(money(123456, "USD")).toBe(
        new Intl.NumberFormat(tag, {
          style: "currency",
          currency: "USD",
        }).format(1234.56),
      );
      expect(money(null)).toBe(bmsg("Non disponible"));
      expect(dateTime("2026-01-09 13:45:00")).toBe(
        new Intl.DateTimeFormat(tag, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date("2026-01-09T13:45:00Z")),
      );
      expect(shortDate("2026-01-09")).toBe(
        new Intl.DateTimeFormat(tag, {
          day: "numeric",
          month: "short",
          timeZone: "UTC",
        }).format(new Date("2026-01-09T12:00:00Z")),
      );
      expect(countryName("DE")).toBe(
        new Intl.DisplayNames([tag], { type: "region" }).of("DE"),
      );
      expect(countryName(null)).toBe(bmsg("Pays non renseigné"));
      expect(countryName("T1")).toBe(bmsg("Pays non renseigné"));
      expect(roleName("admin")).toBe(bmsg("Administrateur"));
      expect(channelName("postal")).toBe(bmsg("Courrier postal"));
      expect(statusName("delivered")).toBe(bmsg("Livré"));
      const html = renderToStaticMarkup(
        createElement(BelvedereGlobe, {
          connections: [
            { country: "DE", connections: 1234 },
            { country: null, connections: 3 },
          ],
          distribution: [],
        }),
      );
      expect(html).toContain(bmsg("Le monde de guteneo."));
      expect(html).toContain(countryName("DE"));
      expect(html).toContain(bmsg("Tourner le globe vers l’ouest"));
      expect(html).toContain(number(1234));
      expect(html).toContain(bmsg("Pays non renseigné"));
    },
  );

  it.each(["en", "de", "lb"] as const)(
    "changes copy at render time while leaving business values intact in %s",
    (locale) => {
      const sourceName = "Synthèse {1}";
      setLocale(locale, false);
      expect(bmsg("Synthèse")).not.toBe("Synthèse");
      expect(bmsg("Consulter {0}", sourceName)).toContain(sourceName);
      expect(bmsg("{0} pages", "12345")).toContain("12345");
      expect(roleName("custom_role_id")).toBe("custom_role_id");
      expect(channelName("provider-channel-id")).toBe("provider-channel-id");
      setLocale("fr", false);
      expect(bmsg("Synthèse")).toBe("Synthèse");
    },
  );
});
