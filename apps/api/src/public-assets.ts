import site from "../../../packages/contracts/src/public-site.json" with { type: "json" };
import {
  isPublicLocaleAssetPath,
  localizedPublicPath,
  requestedPublicLocale,
} from "../../../packages/contracts/src/public-locales";
import { assertBaseConfiguration, type Env } from "./env";
import { withPublicVideoRange } from "./public-video-range";

const publicPages = new Set(site.paths);
const securityHeaders = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=31536000",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};
const privateHeaders = {
  ...securityHeaders,
  "X-Robots-Tag": "noindex, nofollow",
  "Cache-Control": "no-store",
};
const hasPrivateQuery = (url: URL) =>
  [...url.searchParams.keys()].some((key) =>
    /^(auth|code|state|token|access_token|refresh_token|id_token|session|ticket|error|error_description)$/i.test(
      key,
    ),
  );

/** Static public bytes only. A null result leaves every API/auth/write gate to Hono. */
export async function servePublicAssets(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return new Response(request.method === "HEAD" ? null : "Invalid path", {
      status: 400,
      headers: privateHeaders,
    });
  }
  if (isPublicLocaleAssetPath(pathname))
    return new Response(request.method === "HEAD" ? null : "Not found", {
      status: 404,
      headers: privateHeaders,
    });
  if (!["GET", "HEAD"].includes(request.method)) return null;
  if (
    site.privatePrefixes.some(
      (prefix) =>
        pathname === `/${prefix}` || pathname.startsWith(`/${prefix}/`),
    )
  )
    return null;
  try {
    assertBaseConfiguration(env, request);
  } catch {
    return new Response(
      request.method === "HEAD" ? null : "Service configuration unavailable",
      { status: 503, headers: privateHeaders },
    );
  }

  if (
    pathname === "/invitation/" ||
    pathname === "/invitation" ||
    url.pathname === "/app" ||
    url.pathname === "/app/prepare" ||
    url.pathname === "/app/plan"
  ) {
    // Private browser entries share the root shell without forwarding URL data.
    // The invitation secret stays in the URL fragment and never reaches asset logs.
    const shellUrl = new URL("/", url);
    const response = await env.ASSETS.fetch(new Request(shellUrl, request));
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(privateHeaders))
      headers.set(key, value);
    return new Response(request.method === "HEAD" ? null : response.body, {
      status: response.status,
      headers,
    });
  }

  const privateQuery = hasPrivateQuery(url);
  // Match the full canonical origin, never Forwarded/Host headers or APP_ORIGIN input.
  const canonical = url.origin === site.origin && !privateQuery;
  if (pathname === "/robots.txt") {
    const robots = canonical
      ? `User-agent: *\nAllow: /\n${site.privatePrefixes.map((prefix) => `Disallow: /${prefix}`).join("\n")}\nSitemap: ${site.origin}/sitemap.xml\n`
      : "User-agent: *\nDisallow: /\n";
    return new Response(request.method === "HEAD" ? null : robots, {
      headers: {
        ...privateHeaders,
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }
  let response: Response;
  try {
    const localizedPath = localizedPublicPath(
      url.pathname,
      requestedPublicLocale(url.searchParams),
    );
    const assetUrl = new URL(url);
    if (localizedPath) assetUrl.pathname = localizedPath;
    const assetRequest = localizedPath
      ? new Request(assetUrl, request)
      : request;
    response = await withPublicVideoRange(
      assetRequest,
      await env.ASSETS.fetch(assetRequest),
    );
  } catch {
    return new Response(
      request.method === "HEAD" ? null : "Static content unavailable",
      { status: 503, headers: privateHeaders },
    );
  }
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders))
    headers.set(name, value);
  const indexable =
    canonical &&
    [200, 304].includes(response.status) &&
    (publicPages.has(url.pathname) ||
      headers.get("Content-Type")?.startsWith("image/"));
  if (indexable) headers.delete("X-Robots-Tag");
  else {
    let publicRedirect = false;
    if (
      canonical &&
      [301, 302, 307, 308].includes(response.status) &&
      headers.has("Location")
    ) {
      try {
        const target = new URL(headers.get("Location")!, url);
        publicRedirect =
          target.origin === site.origin &&
          (!target.search ||
            (requestedPublicLocale(target.searchParams) !== null &&
              [...target.searchParams.keys()].every(
                (key) => key === "lang",
              ))) &&
          !target.hash &&
          publicPages.has(target.pathname);
      } catch {
        /* An invalid or foreign redirect never becomes crawlable. */
      }
    }
    // Canonical aliases are not documents to index, but crawlers can follow the redirect.
    headers.set(
      "X-Robots-Tag",
      publicRedirect ? "noindex, follow" : "noindex, nofollow",
    );
  }
  if (
    privateQuery ||
    ["/release.json", "/health", "/health.json", "/sitemap.xml"].includes(
      pathname,
    )
  )
    headers.set("Cache-Control", "no-store");
  // Preserve asset bytes (or the selected video range), ETag, status and redirects.
  // Never rewrite HTML or cache across hosts.
  return new Response(request.method === "HEAD" ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
