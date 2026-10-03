import site from "./public-site.json" with { type: "json" };
import {
  isSupportedLocale,
  normalizeLocale,
  type SupportedLocale,
} from "./locale";

export const PUBLIC_LOCALE_PREFIX = site.localizedPrefix;

/** Only one explicit language parameter selects a public HTML variant. */
export function requestedPublicLocale(
  searchParams: URLSearchParams,
): SupportedLocale | null {
  const values = searchParams.getAll("lang");
  return values.length === 1 ? normalizeLocale(values[0]) : null;
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
