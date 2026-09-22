import site from "../../../packages/contracts/src/public-site.json" with { type: "json" };
import { withPublicVideoRange } from "../../api/src/public-video-range";

const backendPaths = site.privatePrefixes.map((prefix) => `/${prefix}`);

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};
const privateHeaders = {
  ...securityHeaders,
  "X-Robots-Tag": "noindex, nofollow",
};
const publicPages = new Set(site.paths);

export default {
  async fetch(request: Request, env: PreviewEnv): Promise<Response> {
    const url = new URL(request.url);
    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return Response.json(
        { error: { code: "INVALID_PATH", message: "Invalid request path." } },
        { status: 400, headers: privateHeaders },
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
          headers: { ...privateHeaders, "Cache-Control": "no-store" },
        },
      );
    }

    if (pathname === "/robots.txt" && url.hostname !== "guteneo.com")
      return new Response(
        request.method === "HEAD" ? null : "User-agent: *\nDisallow: /\n",
        {
          headers: {
            ...privateHeaders,
            "Content-Type": "text/plain; charset=utf-8",
          },
        },
      );
    if (pathname === "/health") url.pathname = "/health.json";
    const assetRequest = new Request(url, request);
    const response = await withPublicVideoRange(
      assetRequest,
      await env.ASSETS.fetch(assetRequest),
    );
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(securityHeaders))
      headers.set(key, value);
    // Only canonical public HTML and image assets are indexable on the real domain.
    // The fallback workers.dev hostname never inherits the primary site's policy.
    const privateQuery = [...url.searchParams.keys()].some((key) =>
      /^(auth|code|state|token|access_token|refresh_token|id_token|session|ticket|error|error_description)$/i.test(
        key,
      ),
    );
    const indexable =
      url.hostname === "guteneo.com" &&
      !privateQuery &&
      [200, 304].includes(response.status) &&
      (publicPages.has(pathname) ||
        headers.get("Content-Type")?.startsWith("image/"));
    if (indexable) headers.delete("X-Robots-Tag");
    else headers.set("X-Robots-Tag", "noindex, nofollow");
    if (
      privateQuery ||
      ["/release.json", "/health", "/health.json"].includes(pathname)
    )
      headers.set("Cache-Control", "no-store");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
