const backendPaths = [
  "/api",
  "/auth",
  "/oauth",
  "/mcp",
  "/webhooks",
  "/media",
  "/.well-known",
];

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

export default {
  async fetch(request: Request, env: PreviewEnv): Promise<Response> {
    const url = new URL(request.url);
    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return Response.json(
        { error: { code: "INVALID_PATH", message: "Invalid request path." } },
        { status: 400, headers: securityHeaders },
      );
    }

    if (
      !["GET", "HEAD"].includes(request.method) ||
      backendPaths.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
      )
    ) {
      return Response.json(
        {
          error: {
            code: "PREVIEW_ONLY",
            message:
              "This public design preview has no authentication, uploads, payments or sending API.",
          },
        },
        {
          status: 403,
          headers: { ...securityHeaders, "Cache-Control": "no-store" },
        },
      );
    }

    if (pathname === "/health") url.pathname = "/health.json";
    const response = await env.ASSETS.fetch(new Request(url, request));
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(securityHeaders))
      headers.set(key, value);
    if (["/release.json", "/health", "/health.json"].includes(pathname))
      headers.set("Cache-Control", "no-store");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
