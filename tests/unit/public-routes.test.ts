import { describe, expect, it, vi } from "vitest";
import site from "../../packages/contracts/src/public-site.json" with { type: "json" };
import {
  canonicalPublicFragment,
  canonicalPublicLocation,
  canonicalPublicPath,
  canonicalPublicAssetPath,
  PUBLIC_ROUTE_ALIASES,
} from "../../packages/contracts/src/public-routes";
import { servePublicAssets } from "../../apps/api/src/public-assets";
import preview from "../../apps/preview/src/index";
import type { Env } from "../../apps/api/src/env";

function assets() {
  const fetch = vi.fn(async () => new Response("fixture"));
  return {
    fetch,
    env: {
      ENVIRONMENT: "production",
      MODE: "production",
      APP_ORIGIN: site.origin,
      ASSETS: { fetch },
    } as unknown as Env,
  };
}

describe("English canonical public routes", () => {
  it("resolves public hash bookmarks without changing private application routes or query values", () => {
    for (const [alias, canonical] of Object.entries(PUBLIC_ROUTE_ALIASES)) {
      expect(
        canonicalPublicLocation("/", "?lang=de", `#${alias.slice(0, -1)}`),
      ).toBe(`${canonical}?lang=de`);
    }
    expect(
      canonicalPublicLocation(
        "/",
        "?lang=en&token=opaque%2Bvalue",
        "#/privacy?lang=en#droits",
      ),
    ).toBe("/privacy/?lang=en&token=opaque%2Bvalue#rights");
    for (const fragment of [
      "#/app/documents?cursor=opaque",
      "#/unknown/",
      "#//example.invalid/legal/",
    ])
      expect(canonicalPublicLocation("/", "?lang=fr", fragment)).toBe(
        `/?lang=fr${fragment}`,
      );
  });
  it.each(Object.entries(site.assetAliases))(
    "redirects the old download %s to %s without requiring an alias file",
    async (alias, canonical) => {
      expect(canonicalPublicAssetPath(alias)).toBe(canonical);
      expect(site.paths).not.toContain(canonical);
      for (const method of ["GET", "HEAD"]) {
        const request = new Request(`${site.origin}${alias}?lang=en`, {
          method,
        });
        for (const serve of [
          (env: Env) => servePublicAssets(request, env),
          (env: Env) => preview.fetch(request, env as unknown as PreviewEnv),
        ]) {
          const { env, fetch } = assets();
          const response = (await serve(env))!;
          expect(response.status).toBe(308);
          expect(response.headers.get("Location")).toBe(
            `${site.origin}${canonical}?lang=en`,
          );
          expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
          expect(response.headers.get("Cache-Control")).toBe("no-store");
          expect(await response.text()).toBe("");
          expect(fetch).not.toHaveBeenCalled();
        }
      }
    },
  );
  it.each(Object.entries(PUBLIC_ROUTE_ALIASES))(
    "keeps every old form of %s as an inbound alias for %s",
    async (alias, canonical) => {
      expect(site.paths).toContain(canonical);
      expect(site.paths).not.toContain(alias);
      for (const source of [alias, alias.slice(0, -1), `${alias}index.html`]) {
        expect(canonicalPublicPath(source)).toBe(canonical);
        for (const method of ["GET", "HEAD"]) {
          const { env, fetch } = assets();
          const request = new Request(`${site.origin}${source}?lang=de`, {
            method,
          });
          const response = (await servePublicAssets(request, env))!;
          expect(response.status).toBe(308);
          expect(response.headers.get("Location")).toBe(
            `${site.origin}${canonical}?lang=de`,
          );
          expect(response.headers.get("X-Robots-Tag")).toBe("noindex, follow");
          expect(await response.text()).toBe("");
          expect(fetch).not.toHaveBeenCalled();

          const fixture = assets();
          const previewResponse = await preview.fetch(
            request,
            fixture.env as unknown as PreviewEnv,
          );
          expect(previewResponse.status).toBe(308);
          expect(previewResponse.headers.get("Location")).toBe(
            response.headers.get("Location"),
          );
          expect(previewResponse.headers.get("X-Robots-Tag")).toBe(
            "noindex, nofollow",
          );
          expect(fixture.fetch).not.toHaveBeenCalled();
        }
      }
    },
  );

  it("preserves query data without caching or indexing private redirects", async () => {
    const { env, fetch } = assets();
    const response = (await servePublicAssets(
      new Request(`${site.origin}/developpeurs/?lang=en&code=private-fixture`),
      env,
    ))!;
    expect(response.headers.get("Location")).toBe(
      `${site.origin}/developers/?lang=en&code=private-fixture`,
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not redirect write requests, private endpoints or unknown pages", async () => {
    for (const pathname of [
      "/api/developpeurs/",
      "/app/about/",
      "/unknown/",
      "/__public-locales/en/developpeurs/",
    ])
      expect(canonicalPublicPath(pathname)).toBeNull();
    const { env, fetch } = assets();
    expect(
      await servePublicAssets(
        new Request(`${site.origin}/developpeurs/`, { method: "POST" }),
        env,
      ),
    ).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(canonicalPublicFragment("#tarifs")).toBe("#pricing");
    expect(canonicalPublicFragment("#/app/documents")).toBe("#/app/documents");
  });
});
