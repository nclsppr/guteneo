/**
 * Build-time configuration shared by the Vite build and its tests. The
 * experience is static: its only network peer is the Guteneo application
 * origin, which must itself list this site as its `EXPERIENCE_ORIGIN`.
 */
export function experienceApiOrigin(
  value: string | undefined,
  fallback: string,
): string {
  const candidate = (value ?? "").trim() || fallback;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error(`GUTENEO_API_ORIGIN is not a URL: ${candidate}`);
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.origin !== candidate)
    throw new Error("GUTENEO_API_ORIGIN must be an origin without a path");
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:"))
    throw new Error("GUTENEO_API_ORIGIN must use HTTPS");
  return url.origin;
}

/** Cloudflare static-asset `_headers` for every response of the experience. */
export function experienceHeaders(apiOrigin: string): string {
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    // The bundled PDF renderer runs in a same-origin worker.
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    // Private pages and documents are fetched with credentials, then shown
    // from memory: the API origin is never an image or frame source.
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${apiOrigin}`,
    "frame-src blob:",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
  return [
    "/*",
    "  Cache-Control: no-cache",
    `  Content-Security-Policy: ${policy}`,
    "  X-Content-Type-Options: nosniff",
    "  X-Robots-Tag: noindex, nofollow",
    "  Referrer-Policy: no-referrer",
    "  Strict-Transport-Security: max-age=31536000",
    "  Permissions-Policy: camera=(), microphone=(), geolocation=()",
    "  Cross-Origin-Opener-Policy: same-origin",
    "",
    "/assets/*",
    "  Cache-Control: public, max-age=31536000, immutable",
    "",
    "/index.html",
    "  Cache-Control: no-cache",
    "",
  ].join("\n");
}
