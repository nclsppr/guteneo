import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  PUBLIC_ORIGIN,
  PUBLIC_PATHS,
  publicPageDocument,
  writePublicPages,
} from "../../scripts/build-public-pages.mjs";

const template = `<!doctype html><html lang="fr"><head>
<title>Old title</title><meta name="description" content="Old description">
<meta name="robots" content="noindex"><link rel="canonical" href="https://old.invalid/">
<link rel="stylesheet" href="/assets/main-hash.css"><link rel="modulepreload" href="/assets/shared.js">
<script type="module" src="/assets/main-hash.js"></script></head>
<body><div id="root"></div></body></html>`;
const page = (pathname) => ({
  html: `<main><h1>Une histoire imprimée</h1><p>Contenu public ${pathname}</p><a href="/journal/">Journal</a></main>`,
  title: 'Imprimerie & Gutenberg <"édition">',
  description: 'Une histoire "documentée" & illustrée.',
  canonical: `${PUBLIC_ORIGIN}${pathname}`,
  image: "/journal/printing.webp",
  structuredData: [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "</script><script>alert(1)</script>",
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [],
    },
  ],
});

test("initial document contains readable content, canonical metadata and safely encoded structured data", () => {
  const html = publicPageDocument(template, "/journal/", page("/journal/"));
  assert.match(html, /<h1>Une histoire imprimée<\/h1>/);
  assert.match(html, /href="\/journal\/"/);
  assert.match(
    html,
    /<title>Imprimerie &amp; Gutenberg &lt;&quot;édition&quot;&gt;<\/title>/,
  );
  assert.equal((html.match(/rel="canonical"/g) ?? []).length, 1);
  assert.match(html, /rel="canonical" href="https:\/\/guteneo.com\/journal\/"/);
  assert.match(
    html,
    /name="robots" content="index, follow, max-image-preview:large"/,
  );
  assert.match(html, /property="og:type" content="article"/);
  assert.match(
    html,
    /name="twitter:image" content="https:\/\/guteneo.com\/journal\/printing.webp"/,
  );
  assert.doesNotMatch(html, /<script>alert/);
  const schemas = [
    ...html.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    ),
  ].map((match) => JSON.parse(match[1]));
  assert.equal(
    schemas[0].headline,
    page("/journal/").structuredData[0].headline,
  );
  assert.deepEqual(
    schemas.map((item) => item["@type"]),
    ["Article", "BreadcrumbList"],
  );
});

test("only the homepage retains the app entry; every static page reuses built CSS", () => {
  for (const pathname of PUBLIC_PATHS) {
    const html = publicPageDocument(template, pathname, page(pathname));
    assert.match(html, /href="\/assets\/main-hash.css"/);
    assert.equal(html.includes('type="module"'), pathname === "/");
    assert.equal(html.includes('rel="modulepreload"'), pathname === "/");
    assert.equal(html.includes('type="application/ld+json"'), true);
  }
});

test("missing markup, foreign canonicals and missing build outlet stop publication", () => {
  for (const invalid of [
    null,
    { ...page("/"), html: "" },
    { ...page("/"), canonical: "https://foreign.invalid/" },
  ])
    assert.throws(
      () => publicPageDocument(template, "/", invalid),
      /Incomplete public page/,
    );
  assert.throws(
    () =>
      publicPageDocument(
        template.replace('<div id="root"></div>', ""),
        "/",
        page("/"),
      ),
    /no empty root/,
  );
});

async function outputDirectory(t) {
  const output = await mkdtemp(join(tmpdir(), "guteneo-public-pages-"));
  t.after(() => rm(output, { recursive: true, force: true }));
  await writeFile(join(output, "index.html"), template);
  await writeFile(
    join(output, "_headers"),
    "/*\n  X-Content-Type-Options: nosniff\n",
  );
  return output;
}

test("all five public pages and only canonical primary URLs enter the sitemap", async (t) => {
  const output = await outputDirectory(t);
  await writePublicPages({ output, renderPublicPage: page, indexable: true });
  for (const pathname of PUBLIC_PATHS) {
    const html = await readFile(
      join(output, pathname.slice(1), "index.html"),
      "utf8",
    );
    assert.match(html, /Une histoire imprimée/);
    assert.ok(html.includes(`${PUBLIC_ORIGIN}${pathname}`));
  }
  const sitemap = await readFile(join(output, "sitemap.xml"), "utf8");
  assert.deepEqual(
    [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]),
    PUBLIC_PATHS.map((path) => `${PUBLIC_ORIGIN}${path}`),
  );
  assert.doesNotMatch(sitemap, /workers\.dev|#|\/app|\/api/);
  const robots = await readFile(join(output, "robots.txt"), "utf8");
  assert.match(robots, /Allow: \/\n/);
  assert.match(robots, /Sitemap: https:\/\/guteneo.com\/sitemap.xml/);
  assert.match(robots, /Disallow: \/api/);
});

test("backend build stays noindex in HTML and static response headers", async (t) => {
  const output = await outputDirectory(t);
  await writePublicPages({ output, renderPublicPage: page, indexable: false });
  const html = await readFile(join(output, "journal/index.html"), "utf8");
  assert.match(html, /name="robots" content="noindex, nofollow"/);
  assert.equal(
    await readFile(join(output, "robots.txt"), "utf8"),
    "User-agent: *\nDisallow: /\n",
  );
  assert.match(
    await readFile(join(output, "_headers"), "utf8"),
    /X-Robots-Tag: noindex, nofollow/,
  );
});

test("an absent article rejects the generation before replacing the built homepage", async (t) => {
  const output = await outputDirectory(t);
  await assert.rejects(
    writePublicPages({
      output,
      indexable: true,
      renderPublicPage: (pathname) =>
        pathname === "/journal/histoire-imprimerie-luxembourg/"
          ? null
          : page(pathname),
    }),
    /Incomplete public page/,
  );
  assert.equal(await readFile(join(output, "index.html"), "utf8"), template);
});
