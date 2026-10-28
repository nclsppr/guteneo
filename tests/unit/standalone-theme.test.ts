import { describe, expect, it } from "vitest";
import { themePreferenceFromCookie } from "../../packages/contracts/src/theme";
import { standaloneThemeAttributes } from "../../apps/api/src/standalone-theme";
import { protectedDocumentPage } from "../../apps/api/src/protected-document-page";
import { handleProtectedDocumentRoute } from "../../apps/api/src/protected-documents";
import { handleMobileReview } from "../../apps/api/src/mobile-review";
import type { Env } from "../../apps/api/src/env";
import type { DomainService } from "../../packages/domain/src/index";

const origin = "https://guteneo.com";
const request = (cookie?: string) =>
  new Request(`${origin}/share/invalid`, {
    headers: cookie === undefined ? {} : { Cookie: cookie },
  });

describe("presentation-only standalone theme", () => {
  it.each(["light", "dark", "system"] as const)(
    "accepts only the declared %s preference",
    (theme) => {
      expect(
        themePreferenceFromCookie(`other=value; guteneo_theme=${theme}`),
      ).toBe(theme);
      expect(standaloneThemeAttributes(request(`guteneo_theme=${theme}`))).toBe(
        theme === "system" ? "" : ` data-theme="${theme}"`,
      );
    },
  );

  it.each([
    null,
    "",
    "guteneo_theme=",
    "guteneo_theme=DARK",
    "guteneo_theme=%64ark",
    "guteneo_theme=dark=light",
    'guteneo_theme="dark"',
    "guteneo_theme=dark; guteneo_theme=light",
    "guteneo_theme=dark; guteneo_theme=dark",
    "other_guteneo_theme=dark",
    "__Host-guteneo_session=dark",
    `guteneo_theme=${"x".repeat(8192)}`,
    'guteneo_theme=dark\"><script>alert(1)</script>',
  ])(
    "uses the system for missing, malformed or unrelated cookie input",
    (cookie) => {
      expect(themePreferenceFromCookie(cookie)).toBe("system");
    },
  );

  it("keeps recipient forms script-free and private without granting document access", async () => {
    for (const theme of ["light", "dark", "system"]) {
      const response = protectedDocumentPage(
        "/share/fixture",
        "locked",
        undefined,
        "en",
        request(`guteneo_theme=${theme}`),
      );
      const html = await response.text();
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Security-Policy")).toBe(
        "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      );
      expect(response.headers.get("Cache-Control")).toBe(
        "private, no-store, max-age=0",
      );
      expect(response.headers.get("Set-Cookie")).toBeNull();
      expect(html).toContain('<meta name="theme-color" content="#2450db">');
      expect(html).toContain('method="post"');
      expect(html).toContain('name="password"');
      expect(html).not.toContain("/content?");
      expect(html).not.toMatch(/<script|<img|https:\/\//);
      expect(
        [...html.matchAll(/<link\b[^>]*href="([^"]+)"/g)].map(
          (match) => match[1],
        ),
      ).toEqual([
        "/favicon.ico",
        "/favicon.svg?brand=20260917",
        "/apple-touch-icon.png",
      ]);
    }
  });

  it("threads the current request into unavailable recipient pages without database access", async () => {
    const response = (await handleProtectedDocumentRoute(
      request("guteneo_theme=dark"),
      { APP_ORIGIN: origin } as Env,
    ))!;
    expect(response.status).toBe(404);
    const html = await response.text();
    expect(html).toContain('data-theme="dark"');
    expect(html).not.toContain('name="password"');
    expect(html).not.toContain("/content?");
  });

  it("cannot turn native credentials or an appearance cookie into browser review authority", async () => {
    const response = (await handleMobileReview(
      new Request(
        `${origin}/auth/mobile/review/dsp_00000000-0000-0000-0000-000000000001`,
        {
          headers: {
            Cookie: "guteneo_theme=dark",
            Authorization: "Bearer synthetic-fixture",
          },
        },
      ),
      { APP_ORIGIN: origin } as Env,
      {} as DomainService,
    ))!;
    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "default-src 'none'",
    );
    const html = await response.text();
    expect(html).toContain('data-theme="dark"');
    expect(html).toContain('<meta name="theme-color" content="#2450db">');
    expect(html).not.toContain("<form");
    expect(html).not.toContain("synthetic-fixture");
    expect(html).not.toContain("<script");
  });
});
