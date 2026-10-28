import {
  standaloneThemeAttributes,
  standaloneThemeMetadata,
  standaloneThemeStyles,
} from "./standalone-theme";
import { handleAuthRoute, AuthError } from "./auth";
import {
  authorizeBelvedere,
  belvedereBasePath,
  handleBelvedereRoute,
} from "./belvedere";
import { BELVEDERE_ORIGIN } from "./belvedere-policy";
import type { Env } from "./env";
import {
  localeFromAcceptLanguage,
  normalizeLocale,
} from "../../../packages/contracts/src/locale";
import messages from "../../web/src/locales/messages-belvedere.json" with { type: "json" };
import icons from "../../../packages/contracts/src/brand-icons.json" with { type: "json" };

const privateHeaders = {
  "Cache-Control": "no-store, private",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Strict-Transport-Security": "max-age=31536000",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};
const absent = () =>
  new Response("Not found", { status: 404, headers: privateHeaders });
const assets =
  /^\/assets\/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:js|css|woff2?|ttf|webp|png|svg)$/;
const iconPaths = new Set(icons.files.map((name) => `/${name}`));
const favicon = new URL(icons.faviconUrl);

function protect(response: Response, head = false): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(privateHeaders))
    headers.set(name, value);
  return new Response(head ? null : response.body, {
    status: response.status,
    headers,
  });
}

function recovery(request: Request): Response {
  const url = new URL(request.url);
  const locale =
    normalizeLocale(url.searchParams.get("locale")) ??
    localeFromAcceptLanguage(request.headers.get("Accept-Language"));
  const index = { en: 0, de: 1, lb: 2 };
  const text = (key: "Accès refusé" | "Réessayer") =>
    locale === "fr" ? key : messages[key][index[locale]];
  return new Response(
    `<!doctype html><html lang="${locale}"${standaloneThemeAttributes(request)}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${standaloneThemeMetadata}<title>Belvédère — guteneo</title><style>${standaloneThemeStyles}body{font:17px/1.6 system-ui,sans-serif;max-width:42rem;margin:12vh auto;padding:24px}h1{font:400 2.7rem/1.1 Georgia,serif}a{color:var(--blue);text-underline-offset:4px;display:inline-flex;min-height:44px;align-items:center}</style></head><body><main><h1>${text("Accès refusé")}</h1><p><a href="/auth/login?fresh=1&amp;locale=${locale}">${text("Réessayer")}</a></p></main></body></html>`,
    {
      status: 403,
      headers: {
        ...privateHeaders,
        "Content-Type": "text/html; charset=utf-8",
      },
    },
  );
}

/** Isolated platform host: no customer routing or OAuth bearer authority. */
export async function handleBelvedereHost(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.hostname !== "belvedere.guteneo.com") return null;
  if (
    url.origin !== BELVEDERE_ORIGIN ||
    env.APP_ORIGIN !== "https://guteneo.com" ||
    !belvedereBasePath(env)
  )
    return absent();
  const authNavigation =
    request.method === "GET" &&
    ["/auth/login", "/auth/callback"].includes(url.pathname);
  // Auth0 returns through a cross-site top-level navigation; PKCE/state and the
  // host-only browser cookie authenticate it, never an OAuth bearer header.
  if (
    request.headers.has("Authorization") ||
    (!authNavigation &&
      request.headers.get("Sec-Fetch-Site") === "cross-site") ||
    (request.headers.has("Origin") &&
      request.headers.get("Origin") !== BELVEDERE_ORIGIN)
  )
    return absent();
  const head = request.method === "HEAD";
  const read = request.method === "GET" || head;
  const selected = { ...env, APP_ORIGIN: BELVEDERE_ORIGIN };
  if (read && url.pathname === "/robots.txt")
    return new Response(head ? null : "User-agent: *\nDisallow: /\n", {
      headers: {
        ...privateHeaders,
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  const icon =
    iconPaths.has(url.pathname) &&
    (!url.search ||
      (url.pathname === favicon.pathname && url.search === favicon.search));
  if (
    read &&
    (icon ||
      (!url.search &&
        (assets.test(url.pathname) ||
          url.pathname === "/brand/guteneo-mark-128.webp" ||
          url.pathname === "/brand/guteneo-portrait-128.webp" ||
          url.pathname === "/brand/guteneo-portrait-192.webp" ||
          url.pathname === "/theme-init.js" ||
          url.pathname === "/locale-init.js")))
  ) {
    try {
      const response = await env.ASSETS.fetch(
        new Request(new URL(url.pathname, BELVEDERE_ORIGIN), {
          method: request.method,
        }),
      );
      if (
        !response.ok ||
        response.headers.get("Content-Type")?.startsWith("text/html")
      )
        return absent();
      return protect(response, head);
    } catch {
      return new Response("Service unavailable", {
        status: 503,
        headers: privateHeaders,
      });
    }
  }
  try {
    if (request.method === "GET" && url.pathname === "/auth/login") {
      const login = new URL("/auth/login", BELVEDERE_ORIGIN);
      login.searchParams.set("returnTo", "/");
      const locale = normalizeLocale(url.searchParams.get("locale"));
      if (locale) login.searchParams.set("locale", locale);
      if (url.searchParams.get("fresh") === "1")
        login.searchParams.set("fresh", "1");
      const headers = new Headers(request.headers);
      // Platform sign-in never accepts an invitation or creates workshop authority.
      const cookies = (headers.get("Cookie") ?? "")
        .split(";")
        .filter(
          (value) => !value.trim().startsWith("__Host-guteneo_invitation="),
        );
      headers.set("Cookie", cookies.join(";"));
      return protect(
        (await handleAuthRoute(new Request(login, { headers }), selected)) ??
          absent(),
      );
    }
    if (request.method === "GET" && url.pathname === "/auth/callback") {
      const response = await handleAuthRoute(request, selected);
      if (!response) return absent();
      const headers = new Headers(response.headers);
      if (response.status === 302)
        headers.set("Location", `${BELVEDERE_ORIGIN}/`);
      return protect(
        new Response(response.body, { status: response.status, headers }),
      );
    }
    if (
      (request.method === "GET" && url.pathname === "/api/session") ||
      (request.method === "POST" && url.pathname === "/api/logout")
    ) {
      if (!(await authorizeBelvedere(request, selected))) return absent();
      return protect((await handleAuthRoute(request, selected)) ?? absent());
    }
    if (read && (url.pathname === "/" || url.pathname.startsWith("/api/"))) {
      const response = await handleBelvedereRoute(
        head ? new Request(request, { method: "GET" }) : request,
        selected,
      );
      return protect(response ?? absent(), head);
    }
    return absent();
  } catch (error) {
    if (error instanceof AuthError)
      return ["/auth/login", "/auth/callback"].includes(url.pathname)
        ? recovery(request)
        : absent();
    return new Response("Service unavailable", {
      status: 503,
      headers: privateHeaders,
    });
  }
}
