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

  it("serves navigation with preview privacy headers", async () => {
    const { env, fetch } = assetsEnv();
    const response = await worker.fetch(
      new Request("https://guteneo.com/documents"),
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("preview asset");
    expect(fetch).toHaveBeenCalledOnce();
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
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
