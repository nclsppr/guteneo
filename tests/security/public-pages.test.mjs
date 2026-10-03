import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import {
  DEFAULT_SOCIAL_IMAGE,
  PUBLIC_LOCALES,
  PUBLIC_ORIGIN,
  PUBLIC_PATHS,
  publicPageDocument,
  writePublicPages,
} from "../../scripts/build-public-pages.mjs";

const template = `<!doctype html><html lang="fr"><head>
<title>Old title</title><meta name="description" content="Old description">
<meta name="robots" content="noindex"><link rel="canonical" href="https://old.invalid/">
<meta property="og:image" content="https://old.invalid/image.jpg"><meta property="og:image:width" content="400">
<meta property="og:image:height" content="400"><meta property="og:image:type" content="image/jpeg">
<meta property="og:image:alt" content="Old image"><meta name="twitter:image" content="https://old.invalid/image.jpg">
<link rel="stylesheet" href="/assets/main-hash.css"><link rel="modulepreload" href="/assets/shared.js">
<script type="module" src="/assets/main-hash.js"></script></head>
<body><div id="root"></div></body></html>`;
const page = (pathname, locale = null) => ({
  html: `<main><h1>Une histoire imprimée</h1><p>Contenu public ${pathname}</p><a href="/journal/">Journal</a></main>`,
  title: 'Imprimerie & Gutenberg <"édition">',
  description: 'Une histoire "documentée" & illustrée.',
  canonical: `${PUBLIC_ORIGIN}${pathname}${locale ? `?lang=${locale}` : ""}`,
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

function metadata(html, property) {
  return [
    ...html.matchAll(
      new RegExp(`(?:property|name)="${property}" content="([^"]*)"`, "g"),
    ),
  ].map((match) => match[1]);
}

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
  assert.deepEqual(metadata(html, "og:title"), ["guteneo"]);
  assert.deepEqual(metadata(html, "og:description"), ["guteneo.com"]);
  assert.deepEqual(metadata(html, "twitter:title"), ["guteneo"]);
  assert.deepEqual(metadata(html, "twitter:description"), ["guteneo.com"]);
  assert.deepEqual(metadata(html, "twitter:image"), [
    PUBLIC_ORIGIN + DEFAULT_SOCIAL_IMAGE.src,
  ]);
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

test("generic links share one language-neutral branded image even for articles", () => {
  for (const pathname of ["/", "/support/", "/journal/"]) {
    const html = publicPageDocument(template, pathname, page(pathname));
    for (const [property, content] of Object.entries({
      "og:image": PUBLIC_ORIGIN + DEFAULT_SOCIAL_IMAGE.src,
      "og:image:secure_url": PUBLIC_ORIGIN + DEFAULT_SOCIAL_IMAGE.src,
      "og:image:width": "1200",
      "og:image:height": "630",
      "og:image:type": "image/png",
      "twitter:card": "summary_large_image",
      "twitter:image": PUBLIC_ORIGIN + DEFAULT_SOCIAL_IMAGE.src,
    })) {
      assert.deepEqual(metadata(html, property), [content]);
    }
    for (const property of ["og:image:alt", "twitter:image:alt"]) {
      const descriptions = metadata(html, property);
      assert.equal(descriptions.length, 1);
      assert.match(descriptions[0], /guteneo\.com/);
    }
    assert.doesNotMatch(html, /old\.invalid/);
  }
});

test("explicit-language articles retain their own images and safely escaped descriptions", () => {
  const html = publicPageDocument(
    template,
    "/journal/",
    {
      ...page("/journal/", "fr"),
      image: "/journal/printing.webp?edition=1&lang=fr",
      imageWidth: 1536,
      imageHeight: 1024,
      imageType: "image/webp",
      imageAlt: 'Une presse "bleue" & son <papier>',
    },
    true,
    "fr",
  );
  assert.match(
    html,
    /property="og:image" content="https:\/\/guteneo.com\/journal\/printing.webp\?edition=1&amp;lang=fr"/,
  );
  assert.match(html, /property="og:image:width" content="1536"/);
  assert.match(html, /property="og:image:height" content="1024"/);
  assert.match(html, /property="og:image:type" content="image\/webp"/);
  for (const property of ["og:image:alt", "twitter:image:alt"]) {
    assert.ok(
      html.includes(
        `="${property}" content="Une presse &quot;bleue&quot; &amp; son &lt;papier&gt;"`,
      ),
    );
  }
  assert.equal((html.match(/property="og:image"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /guteneo-share|old\.invalid/);
});

test("explicit languages have matching canonical, social locale, copy and localized fallback cards", () => {
  const images = new Set();
  const tags = { fr: "fr_FR", en: "en_GB", de: "de_DE", lb: "lb_LU" };
  for (const locale of PUBLIC_LOCALES) {
    const current = {
      ...page("/support/", locale),
      title: `${locale} support`,
      description: `${locale} description`,
      image: undefined,
    };
    const html = publicPageDocument(
      template,
      "/support/",
      current,
      true,
      locale,
    );
    assert.match(html, new RegExp(`<html lang="${locale}">`));
    assert.ok(html.includes(`rel="canonical" href="${current.canonical}"`));
    assert.deepEqual(metadata(html, "og:url"), [current.canonical]);
    assert.deepEqual(metadata(html, "og:locale"), [tags[locale]]);
    assert.deepEqual(
      metadata(html, "og:locale:alternate").sort(),
      PUBLIC_LOCALES.filter((other) => other !== locale)
        .map((other) => tags[other])
        .sort(),
    );
    for (const kind of ["og", "twitter"]) {
      assert.deepEqual(metadata(html, `${kind}:title`), [current.title]);
      assert.deepEqual(metadata(html, `${kind}:description`), [
        current.description,
      ]);
    }
    const image = metadata(html, "og:image");
    assert.equal(image.length, 1);
    assert.notEqual(image[0], PUBLIC_ORIGIN + DEFAULT_SOCIAL_IMAGE.src);
    assert.deepEqual(metadata(html, "twitter:image"), image);
    assert.deepEqual(metadata(html, "og:image:width"), ["1200"]);
    assert.deepEqual(metadata(html, "og:image:height"), ["630"]);
    assert.deepEqual(metadata(html, "og:image:type"), ["image/png"]);
    images.add(image[0]);
  }
  assert.equal(images.size, 4);
});

test("generic and localized pages advertise the same five language alternatives", () => {
  for (const locale of [null, ...PUBLIC_LOCALES]) {
    const html = publicPageDocument(
      template,
      "/journal/",
      page("/journal/", locale),
      true,
      locale,
    );
    const links = [
      ...html.matchAll(/<link\b[^>]*hreflang="([^"]+)"[^>]*>/g),
    ].map((match) => {
      const href = /href="([^"]+)"/.exec(match[0])?.[1];
      assert.match(match[0], /rel="alternate"/);
      return [match[1], href];
    });
    assert.equal(links.length, 5);
    assert.deepEqual(Object.fromEntries(links), {
      "x-default": `${PUBLIC_ORIGIN}/journal/`,
      ...Object.fromEntries(
        PUBLIC_LOCALES.map((language) => [
          language,
          `${PUBLIC_ORIGIN}/journal/?lang=${language}`,
        ]),
      ),
    });
  }
});

test("every public page retains the language-aware app entry and built CSS", () => {
  for (const pathname of PUBLIC_PATHS) {
    const html = publicPageDocument(template, pathname, page(pathname));
    assert.match(html, /href="\/assets\/main-hash.css"/);
    assert.match(
      html,
      /<script type="module" src="\/assets\/main-hash.js"><\/script>/,
    );
    assert.match(html, /rel="modulepreload" href="\/assets\/shared.js"/);
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

test("localized publication rejects unsupported languages and mismatched canonicals", () => {
  for (const [locale, canonical] of [
    ["es", `${PUBLIC_ORIGIN}/?lang=es`],
    ["de", `${PUBLIC_ORIGIN}/`],
    [null, `${PUBLIC_ORIGIN}/?lang=de`],
    ["lb", `${PUBLIC_ORIGIN}/?lang=fr`],
  ]) {
    assert.throws(() =>
      publicPageDocument(
        template,
        "/",
        { ...page("/"), canonical },
        true,
        locale,
      ),
    );
  }
});

async function outputDirectory(t) {
  const output = await mkdtemp(join(tmpdir(), "guteneo-public-pages-"));
  t.after(() => rm(output, { recursive: true, force: true }));
  await writeFile(join(output, "index.html"), template);
  await writeFile(
    join(output, "_headers"),
    "/*\n  X-Content-Type-Options: nosniff\n  Content-Security-Policy: default-src 'self'; frame-ancestors 'none'\n",
  );
  return output;
}

test("all public pages and their four language variants are generated with canonical sitemap URLs", async (t) => {
  const output = await outputDirectory(t);
  await writePublicPages({ output, renderPublicPage: page, indexable: true });
  for (const pathname of PUBLIC_PATHS) {
    const html = await readFile(
      join(output, pathname.slice(1), "index.html"),
      "utf8",
    );
    assert.match(html, /Une histoire imprimée/);
    assert.ok(html.includes(`${PUBLIC_ORIGIN}${pathname}`));
    for (const locale of PUBLIC_LOCALES) {
      const localized = await readFile(
        join(
          output,
          "__public-locales",
          locale,
          pathname.slice(1),
          "index.html",
        ),
        "utf8",
      );
      assert.match(localized, new RegExp(`<html lang="${locale}">`));
      assert.ok(
        localized.includes(
          `rel="canonical" href="${PUBLIC_ORIGIN}${pathname}?lang=${locale}"`,
        ),
      );
    }
  }
  assert.match(
    await readFile(join(output, "_headers"), "utf8"),
    /X-Robots-Tag: noindex, nofollow/,
    "raw assets stay noindex until the canonical-host Worker approves the response",
  );
  const sitemap = await readFile(join(output, "sitemap.xml"), "utf8");
  assert.deepEqual(
    [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]).sort(),
    PUBLIC_PATHS.flatMap((path) => [
      `${PUBLIC_ORIGIN}${path}`,
      ...PUBLIC_LOCALES.map(
        (locale) => `${PUBLIC_ORIGIN}${path}?lang=${locale}`,
      ),
    ]).sort(),
  );
  assert.doesNotMatch(sitemap, /workers\.dev|#|\/app|\/api|__public-locales/);
  const robots = await readFile(join(output, "robots.txt"), "utf8");
  assert.match(robots, /Allow: \/\n/);
  assert.match(robots, /Sitemap: https:\/\/guteneo.com\/sitemap.xml/);
  assert.match(robots, /Disallow: \/api/);
});

test("an explicitly private build stays noindex in HTML and static response headers", async (t) => {
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
      renderPublicPage: (pathname, locale) =>
        pathname === "/journal/histoire-imprimerie-luxembourg/"
          ? null
          : page(pathname, locale),
    }),
    /Incomplete public page/,
  );
  assert.equal(await readFile(join(output, "index.html"), "utf8"), template);
});

test("a missing language variant rejects generation before replacing the homepage", async (t) => {
  const output = await outputDirectory(t);
  await assert.rejects(
    writePublicPages({
      output,
      indexable: true,
      renderPublicPage: (pathname, locale) =>
        pathname === "/support/" && locale === "lb"
          ? null
          : page(pathname, locale),
    }),
    /Incomplete public page/,
  );
  assert.equal(await readFile(join(output, "index.html"), "utf8"), template);
});

test("real Static Assets parsing retains noindex and security headers together", async (t) => {
  const output = await outputDirectory(t);
  await writePublicPages({ output, renderPublicPage: page, indexable: false });
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script:
        'export default {fetch(){return new Response("Not found",{status:404})}}',
      compatibilityDate: "2026-09-16",
      assets: {
        directory: output,
        assetConfig: {
          html_handling: "force-trailing-slash",
          not_found_handling: "none",
        },
      },
    }),
  );
  try {
    for (const path of [
      "/",
      "/journal/",
      "/mentions-legales/",
      "/confidentialite/",
      "/conditions/",
      "/support/",
      "/developpeurs/",
      "/assistants/",
      "/assistants/chatgpt/",
    ]) {
      const response = await mf.dispatchFetch(
        `http://backend-fixture.invalid${path}`,
      );
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.match(
        response.headers.get("content-security-policy") ?? "",
        /frame-ancestors 'none'/,
      );
    }
  } finally {
    await mf.dispose();
  }
});
