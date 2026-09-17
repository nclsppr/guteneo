import { describe, expect, it, vi } from "vitest";
import { servePublicAssets } from "../../apps/api/src/public-assets";
import { type Env } from "../../apps/api/src/env";
import site from "../../packages/contracts/src/public-site.json" with { type: "json" };

function fixture(
  response = new Response("exact public bytes", {
    headers: {
      "Content-Type": "text/html",
      "X-Robots-Tag": "noindex, nofollow",
      ETag: '"asset-sha"',
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  }),
) {
  const fetch = vi.fn(async () => response);
  const env = {
    ENVIRONMENT: "production",
    MODE: "production",
    APP_ORIGIN: site.origin,
    ASSETS: { fetch },
  } as unknown as Env;
  return { env, fetch };
}

describe("production static crawl boundary", () => {
  it.each(site.paths)(
    "serves public %s independently of identity, without altering bytes",
    async (path) => {
      const { env, fetch } = fixture();
      const response = (await servePublicAssets(
        new Request(site.origin + path),
        env,
      ))!;
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("exact public bytes");
      expect(fetch).toHaveBeenCalledOnce();
      expect(response.headers.get("X-Robots-Tag")).toBeNull();
      expect(response.headers.get("ETag")).toBe('"asset-sha"');
      expect(response.headers.get("Cache-Control")).toBe(
        "public, max-age=0, must-revalidate",
      );
      expect(response.headers.get("Content-Security-Policy")).toContain(
        "frame-ancestors 'none'",
      );
    },
  );
  it.each([
    "https://guteneo-app.nclsppr.workers.dev",
    "https://future-host.invalid",
    "http://guteneo.com",
    "https://guteneo.com:8443",
  ])(
    "never grants indexing to %s or trusts spoofed forwarding headers",
    async (origin) => {
      const { env } = fixture();
      const response = (await servePublicAssets(
        new Request(origin + "/", {
          headers: {
            "X-Forwarded-Host": "guteneo.com",
            Forwarded: "host=guteneo.com;proto=https",
          },
        }),
        env,
      ))!;
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    },
  );
  it.each([
    "auth",
    "CODE",
    "state",
    "token",
    "access_token",
    "refresh_token",
    "id_token",
    "session",
    "ticket",
    "error",
    "error_description",
  ])("does not index or cache private query %s", async (key) => {
    const { env } = fixture();
    const response = (await servePublicAssets(
      new Request(`${site.origin}/?${key}=fixture`),
      env,
    ))!;
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("preserves conditional 304 and HEAD with crawl policy", async () => {
    for (const method of ["GET", "HEAD"]) {
      const { env } = fixture(
        new Response(null, {
          status: 304,
          headers: { ETag: '"same"', "X-Robots-Tag": "noindex, nofollow" },
        }),
      );
      const response = (await servePublicAssets(
        new Request(site.origin + "/journal/", { method }),
        env,
      ))!;
      expect(response.status).toBe(304);
      expect(response.headers.get("X-Robots-Tag")).toBeNull();
      expect(response.headers.get("ETag")).toBe('"same"');
      expect(await response.text()).toBe("");
    }
  });
  it("keeps unknown HTML, missing assets, JSON and failed public documents noindex", async () => {
    for (const [path, status, type] of [
      ["/other/", 200, "text/html"],
      ["/missing.css", 404, "text/html"],
      ["/openapi.json", 200, "application/json"],
      ["/", 500, "text/html"],
    ] as const) {
      const { env } = fixture(
        new Response("asset", { status, headers: { "Content-Type": type } }),
      );
      const response = (await servePublicAssets(
        new Request(site.origin + path),
        env,
      ))!;
      expect(response.status).toBe(status);
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    }
  });
  it("allows image discovery only on the canonical origin", async () => {
    for (const origin of [
      site.origin,
      "https://guteneo-app.nclsppr.workers.dev",
    ]) {
      const { env } = fixture(
        new Response("image bytes", {
          headers: { "Content-Type": "image/webp" },
        }),
      );
      const response = (await servePublicAssets(
        new Request(origin + "/editorial/art.webp"),
        env,
      ))!;
      expect(response.headers.get("X-Robots-Tag")).toBe(
        origin === site.origin ? null : "noindex, nofollow",
      );
    }
  });
  it("permits following only clean same-origin public canonical redirects", async () => {
    for (const location of [
      "/journal/",
      "https://foreign.invalid/journal/",
      "/auth/login",
      "/journal/?code=fixture",
    ]) {
      const { env } = fixture(
        new Response(null, { status: 308, headers: { Location: location } }),
      );
      const response = (await servePublicAssets(
        new Request(site.origin + "/journal/index.html"),
        env,
      ))!;
      expect(response.status).toBe(308);
      expect(response.headers.get("Location")).toBe(location);
      expect(response.headers.get("X-Robots-Tag")).toBe(
        location === "/journal/" ? "noindex, follow" : "noindex, nofollow",
      );
    }
  });
  it("delegates all private prefixes, encoded aliases and every write to the authenticated app", async () => {
    const { env, fetch } = fixture();
    for (const prefix of site.privatePrefixes) {
      for (const path of [`/${prefix}`, `/${prefix}/operation`])
        expect(
          await servePublicAssets(new Request(site.origin + path), env),
        ).toBeNull();
    }
    expect(
      await servePublicAssets(
        new Request(site.origin + "/api%2Fdocuments"),
        env,
      ),
    ).toBeNull();
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
      expect(
        await servePublicAssets(
          new Request(site.origin + "/", { method }),
          env,
        ),
      ).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("robots policy cannot leak from the primary origin to fallback or private query", async () => {
    const { env, fetch } = fixture();
    for (const method of ["GET", "HEAD"]) {
      const primary = (await servePublicAssets(
        new Request(site.origin + "/robots.txt", { method }),
        env,
      ))!;
      expect(primary.headers.get("Cache-Control")).toBe("no-store");
      expect(await primary.text()).toBe(
        method === "HEAD"
          ? ""
          : `User-agent: *\nAllow: /\n${site.privatePrefixes.map((p) => `Disallow: /${p}`).join("\n")}\nSitemap: ${site.origin}/sitemap.xml\n`,
      );
      for (const url of [
        "https://guteneo-app.nclsppr.workers.dev/robots.txt",
        site.origin + "/robots.txt?token=fixture",
      ]) {
        const fallback = (await servePublicAssets(
          new Request(url, { method }),
          env,
        ))!;
        expect(await fallback.text()).toBe(
          method === "HEAD" ? "" : "User-agent: *\nDisallow: /\n",
        );
      }
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it("retains base production safeguards and fails closed on malformed paths or asset failure", async () => {
    const { env, fetch } = fixture();
    const request = new Request(site.origin + "/");
    for (const invalid of [
      { ...env, MODE: "simulation" },
      { ...env, APP_ORIGIN: "http://guteneo.com" },
      { ...env, ENVIRONMENT: "local" },
    ]) {
      const response = (await servePublicAssets(request, invalid as Env))!;
      expect(response.status).toBe(503);
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(
      (await servePublicAssets(new Request(site.origin + "/%ZZ"), env))!.status,
    ).toBe(400);
    fetch.mockRejectedValueOnce(new Error("never expose this failure"));
    const failure = (await servePublicAssets(request, env))!;
    expect(failure.status).toBe(503);
    expect(await failure.text()).not.toContain("never expose");
    expect(failure.headers.get("Cache-Control")).toBe("no-store");
  });
});
