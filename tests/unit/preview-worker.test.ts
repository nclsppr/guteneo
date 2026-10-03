import { describe, expect, it, vi } from "vitest";
import worker from "../../apps/preview/src/index";
import site from "../../packages/contracts/src/public-site.json" with { type: "json" };

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
    "/app",
    "/app/prepare?entry=direct&token=never-forward",
    "/app/plan?lang=en&token=never-forward",
  ])(
    "serves browser entry %s privately without opening a backend",
    async (path) => {
      for (const method of ["GET", "HEAD"]) {
        const { env, fetch } = assetsEnv();
        const response = await worker.fetch(
          new Request(`https://guteneo.com${path}`, { method }),
          env,
        );
        expect(response.status).toBe(200);
        expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(await response.text()).toBe(
          method === "HEAD" ? "" : "preview asset",
        );
        const forwarded = fetch.mock.calls[0]?.[0] as Request;
        expect(forwarded.url).toBe("https://guteneo.com/");
        expect(forwarded.method).toBe(method);
      }
      const { env, fetch } = assetsEnv();
      const response = await worker.fetch(
        new Request(`https://guteneo.com${path}`, { method: "POST" }),
        env,
      );
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        error: { code: "PREVIEW_ONLY" },
      });
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["?lang=fr-FR", "fr"],
    ["?lang=en", "en"],
    ["?lang=DE", "de"],
    ["?lang=lb-LU", "lb"],
    ["", null],
    ["?lang=unsupported", null],
    ["?lang=en&lang=de", null],
    ["?lang=en&lang=en", null],
  ])(
    "uses explicit public language %s consistently with the live Worker",
    async (query, locale) => {
      const { env, fetch } = assetsEnv();
      const response = await worker.fetch(
        new Request(`https://guteneo.com/journal/${query}`, {
          headers: { "Accept-Language": "de-DE", Cookie: "guteneo.locale=en" },
        }),
        env,
      );
      const forwarded = fetch.mock.calls[0]?.[0] as Request;
      expect(new URL(forwarded.url).pathname).toBe(
        locale ? `${site.localizedPrefix}/${locale}/journal/` : "/journal/",
      );
      expect(await response.text()).toBe("preview asset");
      expect(response.headers.get("X-Robots-Tag")).toBeNull();
    },
  );

  it("refuses direct internal locale URLs before assets or backend routing", async () => {
    const { env, fetch } = assetsEnv();
    for (const path of [
      site.localizedPrefix,
      `${site.localizedPrefix}/en/`,
      `${site.localizedPrefix}%2Fen/index.html`,
      "/%5f%5fpublic-locales/en/",
    ]) {
      for (const method of ["GET", "HEAD", "POST"]) {
        const response = await worker.fetch(
          new Request(`https://guteneo.com${path}`, { method }),
          env,
        );
        expect(response.status).toBe(404);
        expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        if (method === "HEAD") expect(await response.text()).toBe("");
      }
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps localized fallback and private-query responses private", async () => {
    for (const url of [
      "https://guteneo-preview.nclsppr.workers.dev/?lang=en",
      "https://guteneo.com/?lang=en&code=fixture",
    ]) {
      const { env, fetch } = assetsEnv();
      const response = await worker.fetch(new Request(url), env);
      const forwarded = fetch.mock.calls[0]?.[0] as Request;
      expect(new URL(forwarded.url).pathname).toBe(
        `${site.localizedPrefix}/en/`,
      );
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
      if (url.includes("code="))
        expect(response.headers.get("Cache-Control")).toBe("no-store");
    }
  });

  it("preserves absent variants, conditional requests and HEAD responses", async () => {
    for (const status of [200, 304, 404]) {
      const { env, fetch } = assetsEnv();
      fetch.mockResolvedValueOnce(
        new Response(status === 304 ? null : "asset", {
          status,
          headers: { ETag: '"localized"' },
        }),
      );
      const response = await worker.fetch(
        new Request("https://guteneo.com/?lang=de", {
          method: "HEAD",
          headers: { "If-None-Match": '"localized"' },
        }),
        env,
      );
      expect(response.status).toBe(status);
      expect(response.headers.get("ETag")).toBe('"localized"');
      expect(await response.text()).toBe("");
      expect(fetch).toHaveBeenCalledOnce();
      const forwarded = fetch.mock.calls[0]?.[0] as Request;
      expect(forwarded.method).toBe("HEAD");
      expect(forwarded.headers.get("If-None-Match")).toBe('"localized"');
      if (status === 404)
        expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    }
  });

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
    "/.well-known/openai-apps-challenge",
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
    "/assistants/",
    "/assistants/chatgpt/",
    "/assistants/claude/",
    "/assistants/grok/",
    "/assistants/copilot/",
    "/assistants/microsoft365/",
    "/assistants/cursor/",
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
    "/assistants/",
    "/assistants/chatgpt/",
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
