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
    ["", "de"],
    ["?lang=unsupported", "de"],
    ["?lang=en&lang=de", "de"],
    ["?lang=en&lang=en", "de"],
  ])(
    "resolves public language %s consistently with the live Worker",
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
      expect(response.headers.get("Content-Language")).toBe(locale);
    },
  );

  it.each([
    ["?lang=de", "guteneo_locale=account.lb", "de", false],
    ["", "guteneo_locale=account.lb", "lb", true],
    ["?lang=invalid", "guteneo_locale=selection.fr", "fr", true],
    ["?lang=en&lang=de", "guteneo_locale=selection.lb", "lb", true],
    ["", "guteneo_locale=account.lb; guteneo_locale=selection.fr", "en", true],
  ] as const)(
    "uses the same URL, hint and browser precedence for %s and %s",
    async (query, cookie, locale, negotiated) => {
      const { env, fetch } = assetsEnv();
      const response = await worker.fetch(
        new Request(`https://preview.invalid/pricing/${query}`, {
          headers: { Cookie: cookie, "Accept-Language": "en-GB" },
        }),
        env,
      );
      const forwarded = fetch.mock.calls[0]?.[0] as Request;
      expect(new URL(forwarded.url).pathname).toBe(
        `${site.localizedPrefix}/${locale}/pricing/`,
      );
      expect(response.headers.get("Content-Language")).toBe(locale);
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
      expect(response.headers.get("Vary")).toBe(
        negotiated ? "Cookie, Accept-Language" : null,
      );
      expect(response.headers.get("Cache-Control")).toBe(
        negotiated
          ? "private, max-age=0, must-revalidate, no-transform"
          : "max-age=60",
      );
      expect(await response.text()).toBe("preview asset");
    },
  );

  it("retains the generic French page when neither a hint nor supported browser language is available", async () => {
    const { env, fetch } = assetsEnv();
    const response = await worker.fetch(
      new Request("https://preview.invalid/", {
        headers: { "Accept-Language": "es-ES" },
      }),
      env,
    );
    expect(new URL((fetch.mock.calls[0]?.[0] as Request).url).pathname).toBe(
      "/",
    );
    expect(response.headers.get("Content-Language")).toBe("fr");
    expect(response.headers.get("Vary")).toBe("Cookie, Accept-Language");
    expect(response.headers.get("Cache-Control")).toBe(
      "private, max-age=0, must-revalidate, no-transform",
    );
  });

  it("keeps negotiated GET, HEAD and conditional bytes private without changing their framing", async () => {
    for (const method of ["GET", "HEAD"]) {
      for (const status of [200, 304]) {
        const { env, fetch } = assetsEnv();
        const body = '<html lang="lb">Exact fixture</html>';
        fetch.mockResolvedValueOnce(
          new Response(status === 304 ? null : body, {
            status,
            headers: {
              "Content-Type": "text/html",
              ETag: '"fixture-lb"',
              "Content-Length": String(body.length),
              Vary: "Accept-Encoding, cookie",
              "Cache-Control": "max-age=3600",
            },
          }),
        );
        const response = await worker.fetch(
          new Request("https://preview.invalid/journal/", {
            method,
            headers: {
              Cookie: "guteneo_locale=account.lb",
              "If-None-Match": '"fixture-lb"',
            },
          }),
          env,
        );
        const forwarded = fetch.mock.calls[0]?.[0] as Request;
        expect(new URL(forwarded.url).pathname).toBe(
          `${site.localizedPrefix}/lb/journal/`,
        );
        expect(forwarded.method).toBe(method);
        expect(forwarded.headers.get("If-None-Match")).toBe('"fixture-lb"');
        expect(response.status).toBe(status);
        expect(response.headers.get("ETag")).toBe('"fixture-lb"');
        expect(response.headers.get("Content-Length")).toBe(
          String(body.length),
        );
        expect(response.headers.get("Content-Language")).toBe("lb");
        expect(response.headers.get("Vary")).toBe(
          "Accept-Encoding, cookie, Accept-Language",
        );
        expect(response.headers.get("Cache-Control")).toBe(
          "private, max-age=0, must-revalidate, no-transform",
        );
        expect(await response.text()).toBe(
          method === "HEAD" || status === 304 ? "" : body,
        );
      }
    }
  });

  it("protects negotiated ranges, attachments and errors without changing their protocol or bytes", async () => {
    for (const [status, requestHeaders, responseHeaders] of [
      [206, { Range: "bytes=0-4" }, { "Content-Range": "bytes 0-4/10" }],
      [200, { "If-Range": '"fixture"' }, {}],
      [200, {}, { "Content-Disposition": "attachment; filename=fixture.html" }],
      [404, {}, {}],
    ] as const) {
      const { env, fetch } = assetsEnv();
      fetch.mockResolvedValueOnce(
        new Response("exact", {
          status,
          headers: {
            "Content-Type": "text/html",
            "Cache-Control": "max-age=60",
            ...responseHeaders,
          },
        }),
      );
      const response = await worker.fetch(
        new Request("https://preview.invalid/", {
          headers: { Cookie: "guteneo_locale=selection.en", ...requestHeaders },
        }),
        env,
      );
      expect(response.status).toBe(status);
      expect(response.headers.get("Cache-Control")).toBe(
        status >= 400
          ? "no-store, no-transform"
          : "private, max-age=0, must-revalidate, no-transform",
      );
      expect(response.headers.get("Vary")).toBe("Cookie, Accept-Language");
      expect(response.headers.get("Content-Language")).toBeNull();
      for (const [name, value] of Object.entries(responseHeaders))
        expect(response.headers.get(name)).toBe(value);
      expect(await response.text()).toBe("exact");
    }
  });

  it("keeps private queries uncached after negotiation", async () => {
    const { env } = assetsEnv();
    const response = await worker.fetch(
      new Request("https://preview.invalid/?code=fixture", {
        headers: { Cookie: "guteneo_locale=selection.en" },
      }),
      env,
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(response.headers.get("Content-Language")).toBe("en");
    expect(response.headers.get("Vary")).toBe("Cookie, Accept-Language");
  });

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
    "/journal/from-gutenberg-to-digital/",
    "/journal/printing-history-luxembourg/",
    "/legal/",
    "/developers/",
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
    "/legal/",
    "/developers/",
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
