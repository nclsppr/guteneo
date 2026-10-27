import site from "./public-site.json" with { type: "json" };
import {
  defaultLocale,
  isSupportedLocale,
  localeFromAcceptLanguage,
  normalizeLocale,
  type SupportedLocale,
} from "./locale";

export const PUBLIC_LOCALE_PREFIX = site.localizedPrefix;
export const publicLocaleCookieName = "guteneo_locale";
export const publicLocaleCookieMaxAge = 31_536_000;
export type PublicLocaleHint = {
  source: "selection" | "account";
  locale: SupportedLocale;
};

/** Presentation only: this hint grants no identity, membership or authority. */
export function parsePublicLocaleCookie(
  header: string | null | undefined,
): PublicLocaleHint | null {
  if (!header || header.length > 8192) return null;
  const values = header.split(";").flatMap((entry) => {
    const separator = entry.indexOf("=");
    const name = (separator < 0 ? entry : entry.slice(0, separator)).trim();
    if (name !== publicLocaleCookieName) return [];
    return [separator < 0 ? "" : entry.slice(separator + 1).trim()];
  });
  if (values.length !== 1) return null;
  const match = /^(selection|account)\.(fr|en|de|lb)$/.exec(values[0]);
  return match
    ? {
        source: match[1] as PublicLocaleHint["source"],
        locale: match[2] as SupportedLocale,
      }
    : null;
}

/** Only one explicit language parameter selects a public HTML variant. */
export function requestedPublicLocale(
  searchParams: URLSearchParams,
): SupportedLocale | null {
  const values = searchParams.getAll("lang");
  return values.length === 1 ? normalizeLocale(values[0]) : null;
}

export type PublicRequestLocale = {
  locale: SupportedLocale | null;
  explicit: boolean;
};

/** Live and preview select the same immutable HTML, without a session lookup. */
export function resolvePublicRequestLocale(
  url: URL,
  headers: Pick<Headers, "get">,
): PublicRequestLocale | null {
  if (!site.paths.includes(url.pathname)) return null;
  const requested = requestedPublicLocale(url.searchParams);
  if (requested) return { locale: requested, explicit: true };
  const browser = localeFromAcceptLanguage(headers.get("Accept-Language"));
  return {
    locale:
      parsePublicLocaleCookie(headers.get("Cookie"))?.locale ??
      (browser === defaultLocale ? null : browser),
    explicit: false,
  };
}

/** Protect all negotiated representations; label only ordinary public HTML. */
export function applyPublicLocaleHeaders(
  headers: Headers,
  selection: PublicRequestLocale | null,
  options: { status: number; protocolError: boolean; privateQuery: boolean },
): boolean {
  if (!selection) return false;
  if (!selection.explicit) {
    // A missing variant, partial response or download still depends on the
    // request's language. None may enter a shared cache under the bare URL.
    const vary = (headers.get("Vary") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (!vary.includes("*")) {
      for (const name of ["Cookie", "Accept-Language"])
        if (!vary.some((value) => value.toLowerCase() === name.toLowerCase()))
          vary.push(name);
      headers.set("Vary", vary.join(", "));
    }
    const noStore =
      options.status >= 400 ||
      headers
        .get("Cache-Control")
        ?.split(",")
        .some((value) => value.trim().toLowerCase() === "no-store");
    headers.set(
      "Cache-Control",
      options.privateQuery
        ? "no-store"
        : noStore
          ? "no-store, no-transform"
          : "private, max-age=0, must-revalidate, no-transform",
    );
  }
  const type = (headers.get("Content-Type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (
    options.protocolError ||
    !(
      (options.status === 200 && type === "text/html") ||
      (options.status === 304 && ["", "text/html"].includes(type))
    )
  )
    return false;
  headers.set("Content-Language", selection.locale ?? defaultLocale);
  return true;
}

export function localizedPublicPath(
  pathname: string,
  locale: SupportedLocale | null,
): string | null {
  return isSupportedLocale(locale) && site.paths.includes(pathname)
    ? `${PUBLIC_LOCALE_PREFIX}/${locale}${pathname}`
    : null;
}

/** Call with the decoded request pathname before accessing Static Assets. */
export function isPublicLocaleAssetPath(pathname: string): boolean {
  return (
    pathname === PUBLIC_LOCALE_PREFIX ||
    pathname.startsWith(`${PUBLIC_LOCALE_PREFIX}/`)
  );
}
