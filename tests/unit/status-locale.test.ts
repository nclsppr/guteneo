import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const context = {
  window: {} as { STATUS_MESSAGES?: Record<string, string[]> },
};
runInNewContext(
  readFileSync("apps/status/public/locales/messages.js", "utf8"),
  context,
);
const messages = context.window.STATUS_MESSAGES!;
const parameters = (value: string) =>
  [...value.matchAll(/\{\d+\}/g)].map((match) => match[0]).sort();

describe("customer status localization", () => {
  it("uses a complete shared footer catalog with canonical public destinations", () => {
    const footer = JSON.parse(
      readFileSync("packages/contracts/src/public-footer.json", "utf8"),
    );
    const site = JSON.parse(
      readFileSync("packages/contracts/src/public-site.json", "utf8"),
    );
    for (const group of footer.groups) {
      for (const language of ["fr", "en", "de", "lb"]) {
        expect(group.labels[language]).toBeTruthy();
        for (const link of group.links)
          expect(link.labels[language]).toBeTruthy();
      }
      for (const link of group.links)
        if (link.href.startsWith("/")) expect(site.paths).toContain(link.href);
    }
    expect(
      footer.groups.flatMap((group: { links: unknown[] }) => group.links),
    ).toHaveLength(16);
    const resources = footer.groups.find(
      (group: { id: string }) => group.id === "resources",
    );
    const developers = resources.links.findIndex(
      (link: { href: string }) => link.href === "/developers/",
    );
    expect(resources.links[developers + 1]).toEqual({
      href: "https://engineering.guteneo.com/",
      labels: {
        fr: "Documentation technique",
        en: "Engineering documentation",
        de: "Technische Dokumentation",
        lb: "Technesch Dokumentatioun",
      },
    });
  });
  it("provides complete French, German and Luxembourgish values with source placeholders", () => {
    expect(Object.keys(messages).length).toBeGreaterThan(50);
    for (const [source, values] of Object.entries(messages)) {
      expect(values, source).toHaveLength(3);
      for (const value of values) {
        expect(value.trim().length, source).toBeGreaterThan(0);
        expect(parameters(value), source).toEqual(parameters(source));
      }
    }
  });
  it("covers static content, metadata, accessible names and literal dynamic messages", () => {
    const html = readFileSync("apps/status/public/index.html", "utf8");
    const app = readFileSync("apps/status/public/app.js", "utf8");
    const keys = [
      ...html.matchAll(/data-i18n(?:-aria|-content)?="([^"]+)"/g),
      ...app.matchAll(/statusText\(\s*"([^"]+)"/g),
    ];
    for (const match of keys)
      expect(Object.hasOwn(messages, match[1]), match[1]).toBe(true);
  });
});
