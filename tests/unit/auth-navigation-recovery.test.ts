import { afterEach, describe, expect, it, vi } from "vitest";
import {
  freshWorkspaceAuthenticationHref,
  workspaceAuthenticationRecoveryHref,
} from "../../apps/web/src/auth-navigation";
import { setLocale } from "../../apps/web/src/locale";

afterEach(() => {
  vi.unstubAllGlobals();
  setLocale("fr", false);
});

function returnTo(hash: string, pathname = "/", search = "") {
  vi.stubGlobal("window", { location: { hash, pathname, search } });
  return new URL(
    freshWorkspaceAuthenticationHref(),
    "https://guteneo.invalid",
  ).searchParams.get("returnTo");
}

describe("fresh browser authentication navigation", () => {
  it("retains the share without replaying approval or carrying query input", () => {
    expect(returnTo("#/app/secure-distribution/sd_fixture?view=approval")).toBe(
      "/#/app/secure-distribution/sd_fixture",
    );
    const href = new URL(
      freshWorkspaceAuthenticationHref(),
      "https://guteneo.invalid",
    );
    expect(href.pathname).toBe("/auth/login");
    expect(href.searchParams.get("fresh")).toBe("1");
    expect([...href.searchParams.keys()]).toEqual([
      "fresh",
      "locale",
      "returnTo",
    ]);
  });

  it("retains a direct application path without its query", () => {
    expect(
      returnTo("", "/app/secure-distribution/sd_fixture", "?view=approval"),
    ).toBe("/#/app/secure-distribution/sd_fixture");
  });

  it("drops invitation and private query or fragment values", () => {
    const hash =
      "#/app/secure-distribution/sd_fixture?invitation=secret&message=private#password";
    expect(returnTo(hash)).toBe("/#/app/secure-distribution/sd_fixture");
    expect(freshWorkspaceAuthenticationHref()).not.toMatch(
      /secret|private|password/,
    );
  });

  it("uses the same sanitized hosted recovery without forcing a fresh login", () => {
    vi.stubGlobal("window", {
      location: {
        hostname: "localhost",
        hash: "#/app/secure-distribution/sd_fixture?invitation=secret&message=private#password",
      },
    });
    const href = new URL(
      workspaceAuthenticationRecoveryHref(false),
      "https://guteneo.invalid",
    );
    expect(href.pathname).toBe("/auth/login");
    expect(href.searchParams.get("returnTo")).toBe(
      "/#/app/secure-distribution/sd_fixture",
    );
    expect([...href.searchParams.keys()]).toEqual(["locale", "returnTo"]);
    expect(href.href).not.toMatch(/secret|private|password|fresh/u);
    expect(workspaceAuthenticationRecoveryHref()).toBe(
      freshWorkspaceAuthenticationHref(),
    );
  });

  for (const path of [
    "#https://example.invalid/app",
    "#//example.invalid/app",
    "#/auth/login",
    "#/application",
    "#/app/\\example.invalid",
    "#/app/invalid path",
    "#/app/\ninvalid",
    `#/app/${"x".repeat(2048)}`,
  ]) {
    it(`rejects a non-application or invalid return target ${path.slice(0, 50)}`, () => {
      expect(returnTo(path)).toBe("/#/app");
      expect(
        new URL(
          workspaceAuthenticationRecoveryHref(false),
          "https://guteneo.invalid",
        ).searchParams.get("returnTo"),
      ).toBe("/#/app");
    });
  }
});
