import site from "./public-site.json" with { type: "json" };

export const PUBLIC_PATHS: readonly string[] = Object.freeze(site.paths);
export const PUBLIC_ROUTE_ALIASES: Readonly<Record<string, string>> =
  Object.freeze(site.aliases);

/** Download aliases stay outside the indexed public-page registry. */
export function canonicalPublicAssetPath(pathname: string): string | null {
  return Object.hasOwn(site.assetAliases, pathname)
    ? (site.assetAliases as Record<string, string>)[pathname]
    : null;
}

/** One English canonical URL per page, independent of the display language. */
export function canonicalPublicPath(pathname: string): string | null {
  const normalized = pathname.endsWith("/index.html")
    ? pathname.slice(0, -"index.html".length)
    : pathname.endsWith("/")
      ? pathname
      : `${pathname}/`;
  return (
    PUBLIC_ROUTE_ALIASES[normalized] ??
    (PUBLIC_PATHS.includes(normalized) ? normalized : null)
  );
}

/** Keep bookmarked French fragments useful while emitting English anchors. */
export function canonicalPublicFragment(fragment: string): string {
  const aliases: Record<string, string> = {
    tarifs: "pricing",
    editeur: "publisher",
    responsable: "controller",
    donnees: "data",
    finalites: "purposes",
    destinataires: "recipients",
    conservation: "retention",
    droits: "rights",
    compte: "account",
    autorisation: "authorization",
    suivi: "tracking",
    assistance: "support",
    envoi: "dispatch",
    connexion: "connection",
    superviseur: "supervisor",
    choisir: "choose-role",
    "premiers-pas": "getting-started",
    authentification: "authentication",
    fiabilite: "reliability",
    limites: "limits",
  };
  const source = fragment.slice(1);
  return fragment.startsWith("#") && Object.hasOwn(aliases, source)
    ? `#${aliases[source]}`
    : fragment;
}

/** Retain old public hash bookmarks while private application hashes stay distinct. */
export function canonicalPublicLocation(
  pathname: string,
  search: string,
  fragment: string,
): string {
  if (fragment.startsWith("#/") && !fragment.startsWith("#//")) {
    const legacy = new URL(fragment.slice(1), "https://public.invalid");
    const canonical = canonicalPublicPath(legacy.pathname);
    if (legacy.origin === "https://public.invalid" && canonical) {
      const query = new URLSearchParams(search);
      for (const [key, value] of legacy.searchParams)
        if (!query.getAll(key).includes(value)) query.append(key, value);
      return (
        canonical +
        (query.size ? `?${query}` : "") +
        canonicalPublicFragment(legacy.hash)
      );
    }
  }
  return (
    (canonicalPublicPath(pathname) ?? pathname) +
    search +
    canonicalPublicFragment(fragment)
  );
}
