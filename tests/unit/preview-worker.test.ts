import { describe, expect, it, vi } from "vitest";
import worker from "../../apps/preview/src/index";

function assetsEnv() {
  const fetch = vi.fn(
    async (_request: Request | string | URL) =>
      new Response("preview asset", {
        headers: { "Content-Type": "text/html", "Cache-Control": "max-age=60" },
      }),
  );
  const env: PreviewEnv = {
    ASSETS: {
      fetch,
      connect() {
        throw new Error("Preview must not open sockets.");
      },
    },
  };
  return { env, fetch };
}

describe("public preview boundary", () => {
  it.each([
    "/api",
    "/api/session",
    "/api/documents/import",
    "/auth/login",
    "/oauth/authorize",
    "/mcp",
    "/mcp/tools",
    "/webhooks/provider",
    "/media/document.pdf",
    "/.well-known/oauth-authorization-server",
    "/api%2Fdocuments",
  ])("rejects backend endpoint %s before accessing assets", async (path) => {
    const { env, fetch } = assetsEnv();
    const response = await worker.fetch(
      new Request(`https://guteneo.com${path}`),
      env,
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "PREVIEW_ONLY" },
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])(
    "rejects %s requests even outside API paths",
    async (method) => {
      const { env, fetch } = assetsEnv();
      const response = await worker.fetch(
        new Request("https://guteneo.com/", { method }),
        env,
      );
      expect(response.status).toBe(403);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    "/",
    "/journal/",
    "/journal/de-gutenberg-au-numerique/",
    "/journal/histoire-imprimerie-luxembourg/",
    "/mentions-legales/",
    "/developpeurs/",
  ])(
    "serves canonical public HTML at %s without noindex on the primary domain",
    async (path) => {
      const { env, fetch } = assetsEnv();
      const response = await worker.fetch(
        new Request(`https://guteneo.com${path}`),
        env,
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("preview asset");
      expect(fetch).toHaveBeenCalledOnce();
      expect(response.headers.get("x-robots-tag")).toBeNull();
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    },
  );

  it.each([
    "/",
    "/journal/",
    "/mentions-legales/",
    "/developpeurs/",
    "/image.webp",
  ])("keeps fallback workers.dev URL %s out of the index", async (path) => {
    const { env } = assetsEnv();
    const response = await worker.fetch(
      new Request(`https://guteneo-preview.nclsppr.workers.dev${path}`),
      env,
    );
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("does not turn missing pages into the homepage", async () => {
    const { env, fetch } = assetsEnv();
    fetch.mockResolvedValueOnce(new Response("Not found", { status: 404 }));
    const response = await worker.fetch(
      new Request("https://guteneo.com/journal/not-an-article/"),
      env,
    );
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("keeps conditional 304 responses indexable on a public canonical page", async () => {
    const { env, fetch } = assetsEnv();
    fetch.mockResolvedValueOnce(new Response(null, { status: 304 }));
    const response = await worker.fetch(
      new Request("https://guteneo.com/journal/", {
        headers: { "If-None-Match": '"fixture"' },
      }),
      env,
    );
    expect(response.status).toBe(304);
    expect(response.headers.get("x-robots-tag")).toBeNull();
  });

  it.each(["auth", "code", "state", "access_token"])(
    "keeps private %s query variants out of the index and cache",
    async (key) => {
      const { env } = assetsEnv();
      const response = await worker.fetch(
        new Request(`https://guteneo.com/?${key}=fixture`),
        env,
      );
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      expect(response.headers.get("cache-control")).toBe("no-store");
    },
  );

  it("serves private-host robots without forwarding the public sitemap policy", async () => {
    const { env, fetch } = assetsEnv();
    const response = await worker.fetch(
      new Request("https://guteneo-preview.nclsppr.workers.dev/robots.txt"),
      env,
    );
    expect(await response.text()).toBe("User-agent: *\nDisallow: /\n");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["/health", "/health.json", "/release.json"])(
    "serves uncached build evidence from %s",
    async (path) => {
      const { env, fetch } = assetsEnv();
      const response = await worker.fetch(
        new Request(`https://guteneo.com${path}`),
        env,
      );
      expect(response.headers.get("cache-control")).toBe("no-store");
      const forwarded = fetch.mock.calls[0]?.[0] as Request | undefined;
      expect(new URL(forwarded!.url).pathname).toBe(
        path === "/health" ? "/health.json" : path,
      );
    },
  );
});
