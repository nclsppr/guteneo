import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createServer } from "vite";

import site from "../packages/contracts/src/public-site.json" with { type: "json" };
import cards from "../packages/contracts/src/social-cards.json" with { type: "json" };

export const PUBLIC_ORIGIN = site.origin;
export const PUBLIC_PATHS = Object.freeze(site.paths);
export const PUBLIC_LOCALES = Object.freeze(site.locales);
export const DEFAULT_SOCIAL_IMAGE = Object.freeze(cards.neutral);
const localeTags = { fr: "fr_FR", en: "en_GB", de: "de_DE", lb: "lb_LU" };
const publicUrl = (pathname, locale) =>
  `${PUBLIC_ORIGIN}${pathname}${locale ? `?lang=${locale}` : ""}`;

/** Preserve the explicit language through ordinary no-JavaScript navigation. */
function localizeLinks(html, locale) {
  if (!locale) return html;
  return html.replace(/\bhref="([^"]*)"/g, (original, href) => {
    if (!href.startsWith("/") || href.startsWith("//")) return original;
    const url = new URL(href.replaceAll("&amp;", "&"), PUBLIC_ORIGIN);
    if (!PUBLIC_PATHS.includes(url.pathname) || url.hash.startsWith("#/app"))
      return original;
    url.searchParams.set("lang", locale);
    return `href="${escapeHtml(url.pathname + url.search + url.hash)}"`;
  });
}

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
const jsonForHtml = (value) =>
  JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");

/** Keep Vite's hashed assets so every public page can apply the visitor's language. */
export function publicPageDocument(
  template,
  pathname,
  page,
  indexable = true,
  locale = null,
) {
  if (
    !PUBLIC_PATHS.includes(pathname) ||
    (locale !== null && !PUBLIC_LOCALES.includes(locale)) ||
    !page ||
    typeof page.html !== "string" ||
    !page.html.trim() ||
    typeof page.title !== "string" ||
    !page.title.trim() ||
    typeof page.description !== "string" ||
    !page.description.trim() ||
    page.canonical !== publicUrl(pathname, locale)
  )
    throw new Error(`Incomplete public page: ${pathname}`);
  const root = /<div\s+id=["']root["']\s*>\s*<\/div>/;
  if (!root.test(template)) throw new Error("Built HTML has no empty root.");
  const imageDetails =
    locale && page.image
      ? {
          src: page.image,
          width: page.imageWidth,
          height: page.imageHeight,
          type: page.imageType,
          alt: page.imageAlt,
        }
      : cards[locale ?? "neutral"];
  const image = new URL(imageDetails.src, PUBLIC_ORIGIN);
  if (
    image.protocol !== "https:" ||
    image.username ||
    image.password ||
    [imageDetails.width, imageDetails.height].some(
      (dimension) =>
        dimension !== undefined &&
        (!Number.isInteger(dimension) || dimension <= 0),
    ) ||
    (imageDetails.type !== undefined &&
      (typeof imageDetails.type !== "string" ||
        !/^image\/[a-z0-9.+-]+$/i.test(imageDetails.type))) ||
    (imageDetails.alt !== undefined &&
      (typeof imageDetails.alt !== "string" || !imageDetails.alt.trim()))
  )
    throw new Error(`Invalid public image: ${pathname}`);
  const structuredData = page.structuredData ?? [];
  if (!Array.isArray(structuredData))
    throw new Error(`Invalid structured data: ${pathname}`);
  const article = structuredData.some((item) =>
    ["Article", "BlogPosting", "NewsArticle"].includes(item?.["@type"]),
  );
  const socialTitle = locale ? page.title : "guteneo";
  const socialDescription = locale ? page.description : "guteneo.com";
  const metadata = [
    `<title>${escapeHtml(page.title)}</title>`,
    `<meta name="description" content="${escapeHtml(page.description)}">`,
    `<meta name="robots" content="${indexable ? "index, follow, max-image-preview:large" : "noindex, nofollow"}">`,
    `<link rel="canonical" href="${escapeHtml(page.canonical)}">`,
    ...[["x-default", null], ...PUBLIC_LOCALES.map((code) => [code, code])].map(
      ([language, code]) =>
        `<link rel="alternate" hreflang="${language}" href="${escapeHtml(publicUrl(pathname, code))}">`,
    ),
    `<meta property="og:site_name" content="guteneo">`,
    ...(locale
      ? [`<meta property="og:locale" content="${localeTags[locale]}">`]
      : []),
    ...PUBLIC_LOCALES.filter((code) => code !== locale).map(
      (code) =>
        `<meta property="og:locale:alternate" content="${localeTags[code]}">`,
    ),
    `<meta property="og:type" content="${article ? "article" : "website"}">`,
    `<meta property="og:title" content="${escapeHtml(socialTitle)}">`,
    `<meta property="og:description" content="${escapeHtml(socialDescription)}">`,
    `<meta property="og:url" content="${escapeHtml(page.canonical)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(socialTitle)}">`,
    `<meta name="twitter:description" content="${escapeHtml(socialDescription)}">`,
    `<meta property="og:image" content="${escapeHtml(image.href)}">`,
    `<meta property="og:image:secure_url" content="${escapeHtml(image.href)}">`,
    ...["width", "height", "type", "alt"]
      .filter((key) => imageDetails[key] !== undefined)
      .map(
        (key) =>
          `<meta property="og:image:${key}" content="${escapeHtml(imageDetails[key])}">`,
      ),
    `<meta name="twitter:image" content="${escapeHtml(image.href)}">`,
    ...(imageDetails.alt !== undefined
      ? [
          `<meta name="twitter:image:alt" content="${escapeHtml(imageDetails.alt)}">`,
        ]
      : []),
    ...structuredData.map(
      (item) =>
        `<script type="application/ld+json">${jsonForHtml(item)}</script>`,
    ),
  ].join("\n    ");
  const html = template
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, "")
    .replace(
      /<meta\b[^>]*(?:name|property)=["'](?:description|robots|og:[^"']*|twitter:[^"']*)["'][^>]*>/gi,
      "",
    )
    .replace(/<link\b[^>]*rel=["'](?:canonical|alternate)["'][^>]*>/gi, "")
    .replace(
      /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi,
      "",
    );
  return html
    .replace(/<html\b[^>]*>/i, `<html lang="${locale ?? "fr"}">`)
    .replace(
      root,
      () => `<div id="root">${localizeLinks(page.html, locale)}</div>`,
    )
    .replace("</head>", () => `    ${metadata}\n  </head>`);
}

/** Used by both build modes before their source check and asset manifest. */
export async function writePublicPages({
  output,
  renderPublicPage,
  indexable,
}) {
  const template = await readFile(join(output, "index.html"), "utf8");
  // SSR catalogs use scoped module state. Await each render before changing
  // language, and validate every variant before replacing any output document.
  const pages = [];
  for (const pathname of PUBLIC_PATHS) {
    for (const locale of [null, ...PUBLIC_LOCALES]) {
      const page = await renderPublicPage(pathname, locale);
      pages.push({
        pathname: locale
          ? `${site.localizedPrefix}/${locale}${pathname}`
          : pathname,
        html: publicPageDocument(template, pathname, page, indexable, locale),
      });
    }
  }
  for (const { pathname, html } of pages) {
    const directory = join(output, pathname.slice(1));
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "index.html"), html);
  }
  await writeFile(
    join(output, "robots.txt"),
    indexable
      ? `User-agent: *\nAllow: /\n${site.privatePrefixes.map((path) => `Disallow: /${path}`).join("\n")}\nSitemap: ${PUBLIC_ORIGIN}/sitemap.xml\n`
      : "User-agent: *\nDisallow: /\n",
  );
  await writeFile(
    join(output, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${PUBLIC_PATHS.flatMap((pathname) => [null, ...PUBLIC_LOCALES].map((locale) => `  <url><loc>${escapeHtml(publicUrl(pathname, locale))}</loc></url>`)).join("\n")}\n</urlset>\n`,
  );
  const path = join(output, "_headers");
  const headers = await readFile(path, "utf8");
  const globalRule = /^\/\*[ \t]*\r?\n/gm;
  if ([...headers.matchAll(globalRule)].length !== 1)
    throw new Error("The asset policy requires one global header rule.");
  // Assets fail closed if served without the host-aware Worker. Remove noindex
  // only on explicitly permitted responses after ASSETS.fetch, never in _headers.
  if (!/^  X-Robots-Tag: noindex, nofollow$/m.test(headers))
    await writeFile(
      path,
      headers.replace(
        globalRule,
        (rule) => `${rule}  X-Robots-Tag: noindex, nofollow\n`,
      ),
    );
}

export async function buildPublicPages({ root, output, indexable }) {
  const vite = await createServer({
    configFile: join(root, "apps/web/vite.config.ts"),
    mode: "production",
    appType: "custom",
    server: { middlewareMode: true, hmr: false, watch: null },
  });
  try {
    const { renderPublicPage } = await vite.ssrLoadModule(
      "/src/editorial/ssr.tsx",
    );
    if (typeof renderPublicPage !== "function")
      throw new Error("The public SSR module must export renderPublicPage.");
    await writePublicPages({ output, renderPublicPage, indexable });
  } finally {
    await vite.close();
  }
}
