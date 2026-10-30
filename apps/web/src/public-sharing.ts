import site from "../../../packages/contracts/src/public-site.json";
import cards from "../../../packages/contracts/src/social-cards.json";
import { requestedPublicLocale } from "../../../packages/contracts/src/public-locales";
import type { SupportedLocale } from "../../../packages/contracts/src/locale";
import { getPublicSocialCopy } from "./editorial/social-copy";
import editorial from "./locales/messages-editorial.json";
import shell from "./locales/messages-shell.json";
import { englishIndex, translateMessage } from "./message-catalog";
import type { getPublicPageMetadata } from "./public-page-metadata";
import { LOCALE_CHANGE_EVENT } from "./locale";

if (typeof window !== "undefined")
  window.addEventListener(LOCALE_CHANGE_EVENT, syncPublicSharing);

let resolvePageMetadata: typeof getPublicPageMetadata | undefined;
/** Register after catalogs initialize; the locale bootstrap must stay acyclic. */
export function registerPublicPageMetadata(
  resolver: typeof getPublicPageMetadata,
) {
  resolvePageMetadata = resolver;
}

const sharingMessages = { ...editorial, ...shell };
const sharingEnglish = englishIndex([editorial, shell]);
const translatePublicText = (source: string, locale: SupportedLocale) =>
  translateMessage(source, locale, sharingEnglish, sharingMessages, []);

const localeTags = { fr: "fr_FR", en: "en_GB", de: "de_DE", lb: "lb_LU" };

/** Shared by static rendering and selector updates; organization identities stay stable. */
export function localizePublicSchema(
  value: unknown,
  pathname: string,
  locale: SupportedLocale | null,
): unknown {
  const language = locale ?? "fr";
  const copy = getPublicSocialCopy(pathname, language);
  const publicPath = (value: unknown) => {
    if (typeof value !== "string" || !value.startsWith(site.origin + "/"))
      return null;
    const url = new URL(value);
    return url.origin === site.origin && site.paths.includes(url.pathname)
      ? url.pathname
      : null;
  };
  const urlFor = (path: string) =>
    `${site.origin}${path}${locale ? `?lang=${locale}` : ""}`;
  function visit(value: unknown, key = ""): unknown {
    if (key === "inLanguage") return language;
    if (["url", "item", "mainEntityOfPage"].includes(key)) {
      const path = publicPath(value);
      if (path) return urlFor(path);
    }
    if (Array.isArray(value)) return value.map((item) => visit(item));
    if (!value || typeof value !== "object") return value;
    const source = value as Record<string, unknown>;
    if (source["@type"] === "Organization") return source;
    const result = Object.fromEntries(
      Object.entries(source).map(([key, item]) => [key, visit(item, key)]),
    );
    if (copy && source["@type"] === "Article") {
      result.headline = copy.title.replace(/ \| Guteneo$/, "");
      result.description = copy.description;
    }
    if (copy && ["WebPage", "CollectionPage"].includes(String(source["@type"])))
      result.name = copy.title;
    if (source["@type"] === "ListItem") {
      const path = publicPath(source.item);
      const names: Record<string, string> = {
        "/": translatePublicText("Home", language),
        "/journal/": translatePublicText("The journal", language),
        "/assistants/": translatePublicText("Assistants", language),
        "/developers/": translatePublicText("Developers", language),
        "/assistants/chatgpt/": "ChatGPT",
        "/assistants/claude/": "Claude",
        "/assistants/grok/": "Grok",
        "/assistants/copilot/": "GitHub Copilot",
        "/assistants/microsoft365/": "Microsoft 365 Copilot",
        "/assistants/cursor/": "Cursor",
      };
      if (path)
        result.name =
          names[path] ??
          getPublicSocialCopy(path, language)?.title.replace(
            / \| Guteneo$/,
            "",
          ) ??
          source.name;
    }
    return result;
  }
  return visit(value);
}

/** Keep copied/opened internal links shareable after React replaces the SSR markup. */
export function syncPublicLinks() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const current = new URL(window.location.href);
  const locale = requestedPublicLocale(current.searchParams);
  if (
    !site.paths.includes(current.pathname) ||
    current.hash.startsWith("#/app")
  )
    return;
  for (const anchor of document.querySelectorAll<HTMLAnchorElement>(
    "#root a[href]",
  )) {
    const href = anchor.getAttribute("href")!;
    if (!href.startsWith("/") || href.startsWith("//")) continue;
    const target = new URL(href, current);
    if (
      !site.paths.includes(target.pathname) ||
      target.hash.startsWith("#/app")
    )
      continue;
    if (
      [...target.searchParams.keys()].some((key) =>
        /^(auth|code|state|token|access_token|refresh_token|id_token|session|ticket|error|error_description)$/i.test(
          key,
        ),
      )
    )
      continue;
    if (locale) target.searchParams.set("lang", locale);
    else target.searchParams.delete("lang");
    const next = target.pathname + target.search + target.hash;
    if (next !== href) anchor.setAttribute("href", next);
  }
}

export function observePublicLinks(root: HTMLElement) {
  const observer = new MutationObserver(syncPublicLinks);
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["href"],
  });
  syncPublicLinks();
  return () => observer.disconnect();
}

export function publicSocialImage(
  path: string,
  locale: SupportedLocale | null,
) {
  if (!locale || !path.startsWith("/journal/"))
    return cards[locale ?? "neutral"];
  const luxembourg = path === "/journal/printing-history-luxembourg/";
  const description = luxembourg
    ? "A printing press, movable type and books before an illustrated view of Luxembourg’s rooftops and valley, engraved in blue."
    : "Illustration bringing together an old printing press, letters, a fax machine and a computer around printed pages.";
  return {
    src: luxembourg
      ? "/editorial/luxembourg-printing.webp"
      : "/editorial/gutenberg-to-digital.webp",
    width: 1536,
    height: 1024,
    type: "image/webp",
    alt: translatePublicText(description, locale),
  };
}

/** Browser metadata follows the shareable URL, independently of account preferences. */
export function syncPublicSharing() {
  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    !document.head
  )
    return;
  const url = new URL(window.location.href);
  if (!site.paths.includes(url.pathname) || url.hash.startsWith("#/app"))
    return;
  const locale = requestedPublicLocale(url.searchParams);
  const copy = locale
    ? getPublicSocialCopy(url.pathname, locale)
    : { title: "guteneo", description: "guteneo.com" };
  if (!copy) return;
  syncPublicLinks();
  const image = publicSocialImage(url.pathname, locale);
  const canonical = `${site.origin}${url.pathname}${locale ? `?lang=${locale}` : ""}`;
  function meta(key: string, value: string | null) {
    const attribute = key.startsWith("og:") ? "property" : "name";
    let node = document.head.querySelector<HTMLMetaElement>(
      `meta[${attribute}="${key}"]`,
    );
    if (value === null) {
      node?.remove();
      return;
    }
    if (!node) {
      node = document.createElement("meta");
      node.setAttribute(attribute, key);
      document.head.appendChild(node);
    }
    node.content = value;
  }
  meta("og:title", copy.title);
  meta("twitter:title", copy.title);
  meta("og:description", copy.description);
  meta("twitter:description", copy.description);
  meta("og:url", canonical);
  meta("og:locale", locale ? localeTags[locale] : null);
  meta("og:image", site.origin + image.src);
  meta("og:image:secure_url", site.origin + image.src);
  meta("twitter:image", site.origin + image.src);
  for (const key of ["width", "height", "type", "alt"] as const)
    meta(`og:image:${key}`, String(image[key]));
  meta("twitter:image:alt", image.alt);
  const page = resolvePageMetadata?.(url.pathname);
  const sourceSchemas = () =>
    Array.from(
      document.head.querySelectorAll('script[type="application/ld+json"]'),
      (node) => {
        try {
          return JSON.parse(node.textContent ?? "null") as Record<
            string,
            unknown
          >;
        } catch {
          return null;
        }
      },
    ).filter((item): item is Record<string, unknown> => item !== null);
  const structuredData = resolvePageMetadata
    ? page && "structuredData" in page
      ? (page.structuredData ?? [])
      : []
    : sourceSchemas();
  meta(
    "og:type",
    structuredData.some((item) => item["@type"] === "Article")
      ? "article"
      : "website",
  );
  document.head
    .querySelector<HTMLLinkElement>('link[rel="canonical"]')
    ?.setAttribute("href", canonical);
  for (const alternate of document.head.querySelectorAll<HTMLLinkElement>(
    'link[rel="alternate"][hreflang]',
  )) {
    const code = alternate.hreflang;
    alternate.href = `${site.origin}${url.pathname}${code === "x-default" ? "" : `?lang=${code}`}`;
  }
  for (const node of document.head.querySelectorAll(
    'meta[property="og:locale:alternate"]',
  ))
    node.remove();
  for (const [code, tag] of Object.entries(localeTags)) {
    if (code === locale) continue;
    const node = document.createElement("meta");
    node.setAttribute("property", "og:locale:alternate");
    node.content = tag;
    document.head.appendChild(node);
  }
  {
    for (const node of document.head.querySelectorAll(
      'script[type="application/ld+json"]',
    ))
      node.remove();
    for (const item of structuredData) {
      const node = document.createElement("script");
      node.type = "application/ld+json";
      node.textContent = JSON.stringify(
        localizePublicSchema(item, url.pathname, locale),
      )
        .replaceAll("<", "\\u003c")
        .replaceAll(">", "\\u003e")
        .replaceAll("&", "\\u0026");
      document.head.appendChild(node);
    }
  }
}
