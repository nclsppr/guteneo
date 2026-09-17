import site from "../../../packages/contracts/src/public-site.json" with { type: "json" };
import { assertBaseConfiguration, type Env } from "./env";

const publicPages = new Set(site.paths);
const securityHeaders = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
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
  if (!["GET", "HEAD"].includes(request.method)) return null;
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
    response = await env.ASSETS.fetch(request);
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
          !target.search &&
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
  // Preserve every asset byte, ETag, status and redirect. Never rewrite HTML or cache across hosts.
  return new Response(request.method === "HEAD" ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
