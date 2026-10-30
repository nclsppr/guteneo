import { readdirSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "../../apps/web/src/locale";
import { messages, msg } from "../../apps/web/src/messages";

// The web shows a server error's message through msg(). A message without a
// catalog entry reaches French, German and Luxembourgish screens in English.
const sourceFolders = [
  "apps/api/src",
  "packages/contracts/src",
  "packages/domain/src",
];
// Messages these files throw never reach the web's catalogs.
const otherAudiences = new Set([
  // Belvédère translates through its own catalog.
  "apps/api/src/belvedere.ts",
  // Assistants read these through MCP, in English.
  "apps/api/src/mcp.ts",
  "apps/api/src/mcp-app-upload.ts",
  // Server-rendered review pages and the native app.
  "apps/api/src/expert-review-pages.ts",
  "apps/api/src/mobile.ts",
  // Operator configuration checks.
  "apps/api/src/resend-environment.ts",
  "apps/api/src/ses-environment.ts",
]);
const thrown =
  /(?:new (?:ContentError|AuthError|DomainError)|fail|error)\(\s*"[A-Z0-9_]+",\s*("(?:[^"\\]|\\.)+")/g;

function webSources() {
  return sourceFolders
    .flatMap((folder) =>
      readdirSync(new URL(`../../${folder}`, import.meta.url))
        .filter((name) => name.endsWith(".ts"))
        .map((name) => `${folder}/${name}`),
    )
    .filter((file) => !otherAudiences.has(file));
}

function webMessages() {
  return [
    ...new Set(
      webSources().flatMap((file) =>
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
  it("finds the server messages the web shows", () => {
    expect(webMessages().length).toBeGreaterThan(500);
  });
  for (const locale of ["fr", "de", "lb"] as const)
    it(`translates every server message the web shows into ${locale}`, () => {
      setLocale(locale, false);
      // A few older messages are thrown in French; French screens show them as is.
      const untranslated = webMessages().filter(
        (message) =>
          msg(message) === message &&
          !(locale === "fr" && Object.hasOwn(messages, message)),
      );
      expect(untranslated).toEqual([]);
    });
});
