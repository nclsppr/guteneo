/**
 * The separately hosted experience is a second first-party browser front-end.
 * It keeps no session of its own: it calls this application's `/api` routes
 * with the existing host-only session cookie, so every request still passes
 * the same membership, CSRF and approval gates as the main web application.
 *
 * Trust is one exact, server-configured origin on the application's own site.
 * Nothing here is learned from a request; an unset or unusable value keeps
 * the feature off. See docs/EXPERIENCE.md.
 */
export interface ExperienceEnv {
  ENVIRONMENT: string;
  APP_ORIGIN: string;
  EXPERIENCE_ORIGIN?: string;
}

const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];
/** The platform host keeps its own isolated authority and is never an alias. */
const RESERVED_HOSTS = ["belvedere"];
const RETURN_PATH = "/auth/experience";
const MAX_RETURN_PATH = 512;

/** The exact trusted origin, or null when the experience is not configured. */
export function experienceOrigin(env: ExperienceEnv): string | null {
  const value = env.EXPERIENCE_ORIGIN;
  if (!value) return null;
  let candidate: URL;
  let application: URL;
  try {
    candidate = new URL(value);
    application = new URL(env.APP_ORIGIN);
  } catch {
    return null;
  }
  // Only a serialized origin is accepted: no path, query, credentials or
  // trailing slash, so a later string comparison cannot be widened.
  if (candidate.origin !== value || candidate.origin === application.origin)
    return null;
  if (env.ENVIRONMENT === "local")
    return candidate.protocol === "http:" &&
      LOOPBACK_HOSTS.includes(candidate.hostname) &&
      candidate.hostname === application.hostname
      ? value
      : null;
  // A strict subdomain keeps the session cookie same-site, which is what lets
  // the browser attach it without weakening its host-only scope.
  const suffix = `.${application.hostname}`;
  if (
    candidate.protocol !== "https:" ||
    application.protocol !== "https:" ||
    candidate.port ||
    !candidate.hostname.endsWith(suffix)
  )
    return null;
  const label = candidate.hostname.slice(0, -suffix.length);
  return RESERVED_HOSTS.includes(label) ? null : value;
}

export function isExperienceOrigin(
  origin: string | null | undefined,
  env: ExperienceEnv,
): boolean {
  const trusted = experienceOrigin(env);
  return trusted !== null && origin === trusted;
}

/**
 * Cross-origin reads are limited to the JSON and document API. Sign-in,
 * assistant, callback, media and recipient pages stay same-origin, and the
 * upload capability route never accepts ambient browser credentials.
 */
function corsPath(pathname: string): boolean {
  return (
    pathname.startsWith("/api/") &&
    !pathname.startsWith("/api/document-uploads/")
  );
}

const ALLOWED_METHODS = "GET, HEAD, POST, PUT, PATCH, DELETE";
// `Authorization` is deliberately absent: the experience has browser authority
// only and cannot present an assistant or developer token.
const ALLOWED_HEADERS = "Content-Type, X-CSRF-Token, Idempotency-Key";
const EXPOSED_HEADERS = "X-Correlation-ID, Retry-After, Content-Disposition";

function grant(headers: Headers, origin: string): void {
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  const vary = headers.get("Vary");
  if (!vary) headers.set("Vary", "Origin");
  else if (
    !vary
      .split(",")
      .some((item) => ["origin", "*"].includes(item.trim().toLowerCase()))
  )
    headers.set("Vary", `${vary}, Origin`);
}

export interface ExperienceCors {
  /** Answer to a preflight; the request never reaches a route or a session. */
  preflight?: Response;
  /** Adds the grant to the application's own response, errors included. */
  apply(response: Response): Response;
}

/** Null for every request that is not the trusted experience calling `/api`. */
export function experienceCors(
  request: Request,
  env: ExperienceEnv,
): ExperienceCors | null {
  const origin = request.headers.get("Origin");
  if (!origin || !isExperienceOrigin(origin, env)) return null;
  const url = new URL(request.url);
  // Only the application origin itself grants access; an isolated host served
  // by the same Worker never inherits this trust.
  if (url.origin !== env.APP_ORIGIN || !corsPath(url.pathname)) return null;
  const apply = (response: Response) => {
    const granted = new Response(response.body, response);
    grant(granted.headers, origin);
    granted.headers.set("Access-Control-Expose-Headers", EXPOSED_HEADERS);
    return granted;
  };
  if (
    request.method !== "OPTIONS" ||
    !request.headers.has("Access-Control-Request-Method")
  )
    return { apply };
  const headers = new Headers({
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    // Browsers cap this value; a long life keeps repeated writes to one path
    // from each costing an extra billed request.
    "Access-Control-Max-Age": "7200",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  grant(headers, origin);
  headers.append("Vary", "Access-Control-Request-Method");
  headers.append("Vary", "Access-Control-Request-Headers");
  return { preflight: new Response(null, { status: 204, headers }), apply };
}

/**
 * A path inside the experience, never an arbitrary URL: it must stay on the
 * configured origin once resolved and carry no fragment or backslash.
 */
export function experienceReturnPath(value: string | null): string {
  if (
    !value ||
    value.length > MAX_RETURN_PATH ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000- #]/.test(value)
  )
    return "/";
  const parsed = new URL(value, "https://experience.invalid");
  return parsed.origin === "https://experience.invalid"
    ? `${parsed.pathname}${parsed.search}`
    : "/";
}

/** True when sign-in was started from the experience return bridge. */
export function isExperienceReturn(returnTo: string | null | undefined) {
  return (
    !!returnTo &&
    (returnTo === RETURN_PATH || returnTo.startsWith(`${RETURN_PATH}?`))
  );
}

/**
 * Sign-in always completes on the application origin, where the session
 * cookie lives. This bridge then hands the browser back to the experience.
 * The destination origin is configuration, so this is not an open redirect.
 */
export function handleExperienceReturn(
  request: Request,
  env: ExperienceEnv,
): Response | null {
  const url = new URL(request.url);
  if (url.pathname !== RETURN_PATH || !["GET", "HEAD"].includes(request.method))
    return null;
  const origin = experienceOrigin(env);
  if (!origin) return null;
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${origin}${experienceReturnPath(url.searchParams.get("path"))}`,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

/** Where a failed sign-in started from the experience explains itself. */
export function experienceFailureRedirect(
  env: ExperienceEnv,
  returnTo: string | null | undefined,
  code: string,
  locale: string,
): string | null {
  const origin = experienceOrigin(env);
  if (!origin || !isExperienceReturn(returnTo)) return null;
  const destination = new URL("/", origin);
  destination.searchParams.set("auth", code);
  destination.searchParams.set("lang", locale);
  return destination.href;
}
