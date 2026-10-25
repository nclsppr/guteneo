import { describe, expect, it } from "vitest";
import { publicHttpError } from "../../apps/api/src/public-http-error";
import { servePublicAssets } from "../../apps/api/src/public-assets";
import type { Env } from "../../apps/api/src/env";

const origin = "https://guteneo.com";
const navigation = {
  Accept: "text/html",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
};
const statuses = [
  400, 401, 403, 404, 405, 408, 410, 413, 414, 415, 422, 429, 500, 501, 502,
  503, 504,
];
const locales = ["fr", "en", "de", "lb"] as const;
const environment = (fetch: (request: Request) => Promise<Response>) =>
  ({
    ENVIRONMENT: "production",
    MODE: "production",
    APP_ORIGIN: origin,
    ASSETS: { fetch },
  }) as unknown as Env;

describe("bounded public HTTP error documents", () => {
  it("uses only an allowlisted appearance cookie while preserving public error semantics", async () => {
    for (const [cookie, theme] of [
      ["guteneo_theme=dark", "dark"],
      ["guteneo_theme=light", "light"],
      ["guteneo_theme=system", null],
      ['guteneo_theme=dark\"><script>private-marker</script>', null],
    ] as const) {
      const response = publicHttpError(
        new Request(origin + "/missing?lang=en", {
          headers: { ...navigation, Cookie: cookie },
        }),
        "/missing",
        429,
        { protocolHeaders: new Headers({ "Retry-After": "120" }) },
      );
      const html = await response.text();
      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBe("120");
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(response.headers.get("Vary")).toContain("Cookie");
      expect(response.headers.get("Content-Length")).toBe(
        String(new TextEncoder().encode(html).byteLength),
      );
      expect(html).toContain('<meta name="theme-color" content="#2450db">');
      if (theme) expect(html).toContain(`data-theme="${theme}"`);
      else expect(html).not.toMatch(/<html[^>]*data-theme=/);
      expect(html).not.toContain("private-marker");
      expect(html).not.toContain("<script");
    }
  });
  it.each(locales)(
    "has localized copy and shared public destinations in %s for each supported status",
    async (locale) => {
      const titles = new Set<string>();
      for (const status of statuses) {
        const response = publicHttpError(
          new Request(`${origin}/missing?lang=${locale}`, {
            headers: navigation,
          }),
          "/missing",
          status,
        );
        const html = await response.text();
        expect(response.status).toBe(status);
        expect(response.headers.get("Content-Type")).toBe(
          "text/html; charset=utf-8",
        );
        expect(response.headers.get("Content-Language")).toBe(locale);
        expect(response.headers.get("Content-Security-Policy")).toContain(
          "object-src 'none'",
        );
        expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
        expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        expect(response.headers.get("Location")).toBeNull();
        expect(html).toContain(`<html lang="${locale}">`);
        expect(html).toContain(`HTTP ${status}`);
        expect(html).toContain("guteneo</span>");
        for (const path of ["/", "/assistants/", "/developers/", "/support/"])
          expect(html).toContain(`href="${origin}${path}?lang=${locale}"`);
        expect(html).toContain(
          `href="https://status.guteneo.com/?lang=${locale}"`,
        );
        expect(html).toContain(`/pdf-checks/?lang=${locale}`);
        expect(html).not.toContain("<script");
        const family = [401, 403].includes(status)
          ? "access"
          : status === 429 || status >= 500
            ? "service"
            : "navigation";
        expect(html).toContain(`/errors/illustration-${family}.webp`);
        titles.add(html.match(/<h1>([^<]+)<\/h1>/)![1]);
      }
      expect(titles.size).toBe(statuses.length);
    },
  );

  it.each([418, 451, 507, 599])(
    "preserves an unlisted error status %i with a bounded generic document",
    async (status) => {
      const response = publicHttpError(
        new Request(`${origin}/unknown?lang=en`, { headers: navigation }),
        "/unknown",
        status,
      );
      expect(response.status).toBe(status);
      const html = await response.text();
      expect(html).toContain(
        status >= 500
          ? "The service is unavailable"
          : "This request cannot be completed",
      );
      expect(html).toContain(`HTTP ${status}`);
    },
  );

  it.each([
    "/api/unknown",
    "/api/%ZZ",
    "/a%70i/%ZZ",
    "/auth/login",
    "/oauth/authorize",
    "/mcp",
    "/webhooks/unknown",
    "/media/file",
    "/.well-known/unknown",
    "/belvedere/private",
    "/app",
    "/app/unknown",
    "/invitation/",
    "/review/unknown",
    "/assets/unknown",
    "/errors/missing",
    "/missing.js",
  ])(
    "never replaces private or non-document error %s with HTML",
    async (path) => {
      const response = publicHttpError(
        new Request(origin + path, { headers: navigation }),
        path,
        503,
        { plainMessage: "Static content unavailable" },
      );
      expect(response.status).toBe(503);
      expect(response.headers.get("Content-Type")).toBe(
        "text/plain; charset=utf-8",
      );
      expect(await response.text()).toBe("Static content unavailable");
    },
  );

  it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])(
    "does not generate a browser document for %s",
    async (method) => {
      const response = publicHttpError(
        new Request(origin + "/unknown", { method, headers: navigation }),
        "/unknown",
        405,
      );
      expect(response.headers.get("Content-Type")).toBe(
        "text/plain; charset=utf-8",
      );
    },
  );

  it("keeps range/protocol reads non-HTML and respects HTML refusal", async () => {
    for (const headers of [
      { ...navigation, Range: "bytes=0-1" },
      { ...navigation, "If-Range": '"etag"' },
      { Accept: "application/json" },
      { Accept: "text/html;q=0,*/*;q=1" },
    ]) {
      const response = publicHttpError(
        new Request(origin + "/unknown", { headers }),
        "/unknown",
        503,
      );
      expect(response.headers.get("Content-Type")).toBe(
        "text/plain; charset=utf-8",
      );
    }
  });

  it("keeps HEAD empty, preserves challenge/backoff/method headers, and never reflects source data", async () => {
    const protocolHeaders = new Headers({
      "Retry-After": "120",
      Allow: "GET, HEAD",
      "WWW-Authenticate": 'Bearer realm="public-fixture"',
      "Content-Disposition": "attachment; filename=do-not-reflect",
      "Set-Cookie": "never-forward=fixture",
    });
    for (const method of ["GET", "HEAD"]) {
      const response = publicHttpError(
        new Request(
          `${origin}/%3Cscript%3Eprivate-path?lang=de&token=never-reflect`,
          { method, headers: navigation },
        ),
        "/<script>private-path",
        429,
        { protocolHeaders },
      );
      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBe("120");
      expect(response.headers.get("Allow")).toBe("GET, HEAD");
      expect(response.headers.get("WWW-Authenticate")).toBe(
        'Bearer realm="public-fixture"',
      );
      expect(response.headers.get("Content-Disposition")).toBeNull();
      expect(response.headers.get("Set-Cookie")).toBeNull();
      const body = await response.text();
      if (method === "HEAD") expect(body).toBe("");
      else {
        expect(body).toContain('<html lang="de">');
        for (const forbidden of [
          "private-path",
          "never-reflect",
          "public-fixture",
          "do-not-reflect",
          "<script>",
        ])
          expect(body).not.toContain(forbidden);
      }
    }
  });

  it("formats public malformed paths and fail-closed public configuration/fetch errors without changing their statuses", async () => {
    const env = environment(async () => {
      throw new Error("never expose upstream failure");
    });
    const malformed = (await servePublicAssets(
      new Request(`${origin}/broken/%ZZ`, { headers: navigation }),
      env,
    ))!;
    expect(malformed.status).toBe(400);
    expect(await malformed.text()).toContain("Adresse ou demande invalide");
    const malformedPrivate = (await servePublicAssets(
      new Request(`${origin}/a%70i/%ZZ`, { headers: navigation }),
      env,
    ))!;
    expect(malformedPrivate.status).toBe(400);
    expect(await malformedPrivate.text()).toBe("Invalid path");
    for (const current of [env, { ...env, MODE: "simulation" } as Env]) {
      const unavailable = (await servePublicAssets(
        new Request(origin + "/", { headers: navigation }),
        current,
      ))!;
      expect(unavailable.status).toBe(503);
      const html = await unavailable.text();
      expect(html).toContain("Service temporairement indisponible");
      expect(html).not.toContain("never expose upstream failure");
      expect(unavailable.headers.get("Cache-Control")).toBe("no-store");
    }
  });

  it.each(statuses)(
    "formats a public Static Assets%i only for document navigation and preserves machine representations",
    async (status) => {
      for (const accept of ["text/html", "application/json"]) {
        const body =
          accept === "text/html"
            ? "upstream-fixture"
            : '{"error":"upstream-fixture"}';
        const env = environment(
          async () =>
            new Response(body, {
              status,
              headers: {
                "Content-Type":
                  accept === "text/html"
                    ? "text/plain"
                    : "application/problem+json",
                "Retry-After": "120",
              },
            }),
        );
        const response = (await servePublicAssets(
          new Request(origin + "/unknown", { headers: { Accept: accept } }),
          env,
        ))!;
        expect(response.status).toBe(status);
        const actual = await response.text();
        if (accept === "text/html") {
          expect(response.headers.get("Content-Type")).toBe(
            "text/html; charset=utf-8",
          );
          expect(response.headers.get("Retry-After")).toBe("120");
          expect(actual).not.toContain("upstream-fixture");
        } else {
          expect(actual).toBe(body);
          expect(response.headers.get("Content-Type")).toBe(
            "application/problem+json",
          );
        }
      }
    },
  );

  it.each([
    "application/problem+json",
    "application/pdf",
    "application/octet-stream",
    "image/png",
    "text/event-stream",
  ])("never replaces a typed %s error body with HTML", async (type) => {
    for (const status of [404, 500]) {
      const bytes = new Uint8Array([0, 1, 2, 255]);
      const env = environment(
        async () =>
          new Response(bytes, {
            status,
            headers: { "Content-Type": type, "Content-Disposition": "inline" },
          }),
      );
      const response = (await servePublicAssets(
        new Request(origin + "/unknown", { headers: navigation }),
        env,
      ))!;
      expect(response.status).toBe(status);
      expect(response.headers.get("Content-Type")).toBe(type);
      expect(response.headers.get("Content-Disposition")).toBe("inline");
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    }
  });

  it("retains a public range error and its Content-Range without a document rewrite", async () => {
    const env = environment(
      async () =>
        new Response("range-error", {
          status: 416,
          headers: {
            "Content-Type": "text/plain",
            "Content-Range": "bytes */12",
          },
        }),
    );
    const response = (await servePublicAssets(
      new Request(origin + "/unknown", { headers: navigation }),
      env,
    ))!;
    expect(response.status).toBe(416);
    expect(response.headers.get("Content-Range")).toBe("bytes */12");
    expect(await response.text()).toBe("range-error");
  });

  it("preserves missing-resource range responses instead of normalizing their representation", async () => {
    for (const name of ["Range", "If-Range"]) {
      const headers = new Headers(navigation);
      headers.set(name, name === "Range" ? "bytes=0-1" : '"original-etag"');
      const env = environment(
        async () =>
          new Response("original-missing-resource", {
            status: 404,
            headers: {
              "Content-Type": "text/plain",
              ETag: '"original-etag"',
              "Content-Disposition": "inline",
            },
          }),
      );
      const response = (await servePublicAssets(
        new Request(origin + "/unknown", {
          headers,
        }),
        env,
      ))!;
      expect(response.status).toBe(404);
      expect(response.headers.get("Content-Type")).toBe("text/plain");
      expect(response.headers.get("ETag")).toBe('"original-etag"');
      expect(response.headers.get("Content-Disposition")).toBe("inline");
      expect(await response.text()).toBe("original-missing-resource");
    }
  });

  it.each([null, "text/plain", "text/html"])(
    "preserves an attachment error with %s MIME even on an extensionless URL",
    async (type) => {
      for (const status of [404, 500]) {
        for (const disposition of [
          "attachment; filename=error-download",
          "AtTaChMeNt ; filename=error-download",
        ]) {
          for (const method of ["GET", "HEAD"]) {
            const bytes = new Uint8Array([0, 1, 2, 255]);
            const headers = new Headers({
              "Content-Disposition": disposition,
              ETag: '"attachment-error"',
              "Content-Length": String(bytes.byteLength),
            });
            if (type !== null) headers.set("Content-Type", type);
            const env = environment(
              async () => new Response(bytes, { status, headers }),
            );
            const response = (await servePublicAssets(
              new Request(origin + "/download", {
                method,
                headers: navigation,
              }),
              env,
            ))!;
            expect(response.status).toBe(status);
            expect(response.headers.get("Content-Disposition")).toBe(
              disposition,
            );
            expect(response.headers.get("Content-Type")).toBe(type);
            expect(response.headers.get("ETag")).toBe('"attachment-error"');
            expect(response.headers.get("Content-Length")).toBe(
              String(bytes.byteLength),
            );
            expect(new Uint8Array(await response.arrayBuffer())).toEqual(
              method === "HEAD" ? new Uint8Array() : bytes,
            );
          }
        }
      }
    },
  );

  it.each([
    "legacy-download; filename=error-download",
    "LeGaCy-DoWnLoAd ; filename=error-download",
  ])(
    "preserves unknown download disposition %s as an attachment",
    async (disposition) => {
      for (const status of [404, 500]) {
        const env = environment(
          async () =>
            new Response("legacy-error-body", {
              status,
              headers: {
                "Content-Disposition": disposition,
                "Content-Type": "text/html",
                ETag: '"legacy-download"',
              },
            }),
        );
        const response = (await servePublicAssets(
          new Request(origin + "/download", { headers: navigation }),
          env,
        ))!;
        expect(response.status).toBe(status);
        expect(response.headers.get("Content-Disposition")).toBe(disposition);
        expect(response.headers.get("Content-Type")).toBe("text/html");
        expect(response.headers.get("ETag")).toBe('"legacy-download"');
        expect(await response.text()).toBe("legacy-error-body");
      }
    },
  );
});
