import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createServer } from "vite";

export const PUBLIC_ORIGIN = "https://guteneo.com";
export const PUBLIC_PATHS = Object.freeze([
  "/",
  "/journal/",
  "/journal/de-gutenberg-au-numerique/",
  "/journal/histoire-imprimerie-luxembourg/",
  "/mentions-legales/",
]);

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

/** Keep Vite's actual hashed CSS; only the homepage needs the application entry. */
export function publicPageDocument(template, pathname, page, indexable = true) {
  if (
    !PUBLIC_PATHS.includes(pathname) ||
    !page ||
    typeof page.html !== "string" ||
    !page.html.trim() ||
    typeof page.title !== "string" ||
    !page.title.trim() ||
    typeof page.description !== "string" ||
    !page.description.trim() ||
    page.canonical !== `${PUBLIC_ORIGIN}${pathname}`
  )
    throw new Error(`Incomplete public page: ${pathname}`);
  const root = /<div\s+id=["']root["']\s*>\s*<\/div>/;
  if (!root.test(template)) throw new Error("Built HTML has no empty root.");
  const image = page.image ? new URL(page.image, PUBLIC_ORIGIN) : null;
  if (
    image &&
    (image.protocol !== "https:" || image.username || image.password)
  )
    throw new Error(`Invalid public image: ${pathname}`);
  const structuredData = page.structuredData ?? [];
  if (!Array.isArray(structuredData))
    throw new Error(`Invalid structured data: ${pathname}`);
  const article = structuredData.some((item) =>
    ["Article", "BlogPosting", "NewsArticle"].includes(item?.["@type"]),
  );
  const metadata = [
    `<title>${escapeHtml(page.title)}</title>`,
    `<meta name="description" content="${escapeHtml(page.description)}">`,
    `<meta name="robots" content="${indexable ? "index, follow, max-image-preview:large" : "noindex, nofollow"}">`,
    `<link rel="canonical" href="${escapeHtml(page.canonical)}">`,
    `<meta property="og:site_name" content="Guteneo">`,
    `<meta property="og:locale" content="fr_FR">`,
    `<meta property="og:type" content="${article ? "article" : "website"}">`,
    `<meta property="og:title" content="${escapeHtml(page.title)}">`,
    `<meta property="og:description" content="${escapeHtml(page.description)}">`,
    `<meta property="og:url" content="${escapeHtml(page.canonical)}">`,
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">`,
    `<meta name="twitter:title" content="${escapeHtml(page.title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(page.description)}">`,
    ...(image
      ? [
          `<meta property="og:image" content="${escapeHtml(image.href)}">`,
          `<meta name="twitter:image" content="${escapeHtml(image.href)}">`,
        ]
      : []),
    ...structuredData.map(
      (item) =>
        `<script type="application/ld+json">${jsonForHtml(item)}</script>`,
    ),
  ].join("\n    ");
  let html = template
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, "")
    .replace(
      /<meta\b[^>]*(?:name|property)=["'](?:description|robots|og:[^"']*|twitter:[^"']*)["'][^>]*>/gi,
      "",
    )
    .replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, "")
    .replace(
      /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi,
      "",
    );
  if (pathname !== "/") {
    html = html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<link\b[^>]*rel=["']modulepreload["'][^>]*>/gi, "");
  }
  return html
    .replace(root, () => `<div id="root">${page.html}</div>`)
    .replace("</head>", () => `    ${metadata}\n  </head>`);
}

/** Used by both build modes before their source check and asset manifest. */
export async function writePublicPages({
  output,
  renderPublicPage,
  indexable,
}) {
  const template = await readFile(join(output, "index.html"), "utf8");
  // Render all routes before writing any: missing content must fail the build.
  const pages = await Promise.all(
    PUBLIC_PATHS.map(async (pathname) => ({
      pathname,
      html: publicPageDocument(
        template,
        pathname,
        await renderPublicPage(pathname),
        indexable,
      ),
    })),
  );
  for (const { pathname, html } of pages) {
    const directory = join(output, pathname.slice(1));
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "index.html"), html);
  }
  await writeFile(
    join(output, "robots.txt"),
    indexable
      ? `User-agent: *\nAllow: /\n${["api", "auth", "oauth", "mcp", "webhooks", "media", ".well-known"].map((path) => `Disallow: /${path}`).join("\n")}\nSitemap: ${PUBLIC_ORIGIN}/sitemap.xml\n`
      : "User-agent: *\nDisallow: /\n",
  );
  await writeFile(
    join(output, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${PUBLIC_PATHS.map((pathname) => `  <url><loc>${PUBLIC_ORIGIN}${pathname}</loc></url>`).join("\n")}\n</urlset>\n`,
  );
  if (!indexable) {
    const path = join(output, "_headers");
    const headers = await readFile(path, "utf8");
    const globalRule = /^\/\*[ \t]*\r?\n/gm;
    if ([...headers.matchAll(globalRule)].length !== 1)
      throw new Error(
        "The backend asset policy requires one global header rule.",
      );
    // Static Assets replaces duplicate path rules rather than merging them.
    // Add noindex inside the existing rule so CSP/nosniff remain in force.
    await writeFile(
      path,
      headers.replace(
        globalRule,
        (rule) => `${rule}  X-Robots-Tag: noindex, nofollow\n`,
      ),
    );
  }
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
