import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "../../apps/web/src/locale";
import { msg } from "../../apps/web/src/messages";

// The web shows a server error's message through msg(). A message without a
// catalog entry reaches French, German and Luxembourgish screens in English.
const studioSources = [
  "apps/api/src/template-workflow.ts",
  "apps/api/src/generation-context.ts",
  "packages/contracts/src/templates.ts",
];
const thrown =
  /(?:new (?:ContentError|AuthError|DomainError)|fail)\(\s*"[A-Z0-9_]+",\s*("(?:[^"\\]|\\.)+")/g;

function studioMessages() {
  return [
    ...new Set(
      studioSources.flatMap((file) =>
        [
          ...readFileSync(
            new URL(`../../${file}`, import.meta.url),
            "utf8",
          ).matchAll(thrown),
        ].map((match) => JSON.parse(match[1]) as string),
      ),
    ),
  ];
}

afterEach(() => setLocale("fr", false));

describe("server messages shown by the web", () => {
  it("finds the Studio server messages", () => {
    expect(studioMessages().length).toBeGreaterThan(50);
  });
  for (const locale of ["fr", "de", "lb"] as const)
    it(`translates every Studio server message into ${locale}`, () => {
      setLocale(locale, false);
      const untranslated = studioMessages().filter(
        (message) => msg(message) === message,
      );
      expect(untranslated).toEqual([]);
    });
});
