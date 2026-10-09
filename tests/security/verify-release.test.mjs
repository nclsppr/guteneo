import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { verifyRelease } from "../../scripts/verify-release.mjs";
import site from "../../packages/contracts/src/public-site.json" with { type: "json" };

const primary = "https://guteneo.com";
const fallback = "https://guteneo-app.nclsppr.workers.dev";
// This fixture deliberately spells out the public policy instead of importing
// the generator: a permissive fallback or a blocked canonical site must fail.
const publicRobots =
  "User-agent: *\nAllow: /\nDisallow: /belvedere\nDisallow: /api\nDisallow: /auth\nDisallow: /oauth\nDisallow: /mcp\nDisallow: /webhooks\nDisallow: /media\nDisallow: /.well-known\nSitemap: https://guteneo.com/sitemap.xml\n";
const privateRobots = "User-agent: *\nDisallow: /\n";
const html = "<!doctype html><html><main>Guteneo</main></html>";
const css = "body{color:#181b22}";
const asset = (path, body) => ({
  path,
  bytes: Buffer.byteLength(body),
  sha256: createHash("sha256").update(body).digest("hex"),
});
const manifest = {
  sourceCommit: "a".repeat(40),
  sourceDirty: false,
  sourceSnapshotSha256: "b".repeat(64),
  assetsSha256: "c".repeat(64),
  mode: "production",
  publicPreview: false,
  liveSendsEnabled: false,
  assets: [
    asset("/index.html", html),
    asset("/assets/site.css", css),
    asset("/robots.txt", publicRobots),
    asset("/_headers", "/*\n"),
  ],
};

function fixture(origin, overrides = {}) {
  const requests = [];
  return {
    requests,
    async fetcher(url, options) {
      requests.push(url.pathname);
      assert.equal(url.origin, origin);
      assert.equal(
        url.searchParams.get("release-proof"),
        manifest.sourceCommit,
      );
      assert.equal(options.redirect, "error");
      assert.equal(options.headers["Cache-Control"], "no-cache");
      if (url.pathname === "/release.json")
        return Response.json(overrides.remote ?? manifest);
      const headers = new Headers({
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'",
      });
      if (url.pathname === "/robots.txt") {
        headers.set("Content-Type", "text/plain; charset=utf-8");
        headers.set("X-Robots-Tag", "noindex, nofollow");
        if (overrides.unsafeRobotsHeaders)
          headers.delete("X-Content-Type-Options");
        return new Response(
          overrides.robots ??
            (origin === primary ? publicRobots : privateRobots),
          { headers },
        );
      }
      if (origin !== primary) headers.set("X-Robots-Tag", "noindex, nofollow");
      if (overrides.pageNoindex === true)
        headers.set("X-Robots-Tag", "noindex, nofollow");
      if (overrides.pageNoindex === false) headers.delete("X-Robots-Tag");
      if (url.pathname === "/")
        return new Response(overrides.html ?? html, { headers });
      if (url.pathname === "/assets/site.css")
        return new Response(overrides.css ?? css, { headers });
      throw new Error(`Unexpected public path: ${url.pathname}`);
    },
  };
}

for (const origin of [primary, fallback]) {
  test(`release proof verifies the complete robots policy and static hashes on ${origin}`, async () => {
    const f = fixture(origin);
    const result = await verifyRelease(origin, manifest, f.fetcher);
    assert.equal(result.publicAssetsVerified, 2);
    assert.deepEqual(result.configurationFiles, ["/_headers"]);
    assert.deepEqual(result.dynamicResources, ["/robots.txt"]);
    assert.equal(result.robotsPolicyVerified, true);
    assert.ok(!f.requests.includes("/index.html"));
    assert.ok(!f.requests.includes("/_headers"));
  });
}

test("release proof rejects permissive fallback robots and blocked canonical robots", async () => {
  for (const [origin, robots] of [
    [fallback, publicRobots],
    [primary, privateRobots],
    [primary, publicRobots.replace("Disallow: /api\n", "")],
    [primary, publicRobots.replace("Disallow: /belvedere\n", "")],
  ]) {
    await assert.rejects(
      verifyRelease(origin, manifest, fixture(origin, { robots }).fetcher),
      /Host-specific robots policy differs/,
    );
  }
});

test("release proof rejects an indexed fallback or a noindex canonical page", async () => {
  for (const [origin, pageNoindex] of [
    [primary, true],
    [fallback, false],
  ])
    await assert.rejects(
      verifyRelease(origin, manifest, fixture(origin, { pageNoindex }).fetcher),
      /indexing header does not match/,
    );
});

test("runtime robots verification never weakens other assets or release identity", async () => {
  for (const overrides of [{ html: html + " " }, { css: css + " " }])
    await assert.rejects(
      verifyRelease(fallback, manifest, fixture(fallback, overrides).fetcher),
      /Served bytes differ/,
    );
  await assert.rejects(
    verifyRelease(
      fallback,
      manifest,
      fixture(fallback, {
        remote: { ...manifest, sourceCommit: "d".repeat(40) },
      }).fetcher,
    ),
    /Deployed release mismatch: sourceCommit/,
  );
  await assert.rejects(
    verifyRelease(
      fallback,
      { ...manifest, sourceDirty: true },
      fixture(fallback).fetcher,
    ),
    /clean committed local build/,
  );
});

test("missing robots evidence or missing response security headers fails proof", async () => {
  await assert.rejects(
    verifyRelease(
      fallback,
      {
        ...manifest,
        assets: manifest.assets.filter((item) => item.path !== "/robots.txt"),
      },
      fixture(fallback).fetcher,
    ),
    /missing robots.txt/,
  );
  await assert.rejects(
    verifyRelease(
      fallback,
      manifest,
      fixture(fallback, { unsafeRobotsHeaders: true }).fetcher,
    ),
    /Host-specific robots policy differs/,
  );
});

test("localized release assets are verified byte-for-byte at explicit public language URLs on both hosts", async () => {
  const variants = site.locales.flatMap((locale) =>
    ["/", "/journal/"].map((pathname) => ({
      publicPath: `${pathname}?lang=${locale}`,
      body: `<main>${locale}: ${pathname}</main>`,
      path: `${site.localizedPrefix}/${locale}${pathname}index.html`,
    })),
  );
  const local = {
    ...manifest,
    assets: [
      ...manifest.assets,
      ...variants.map(({ path, body }) => asset(path, body)),
    ],
  };
  for (const origin of [primary, fallback]) {
    const f = fixture(origin, { remote: local });
    const localizedRequests = [];
    const fetcher = async (url, options) => {
      assert.ok(!url.pathname.startsWith(site.localizedPrefix));
      if (url.searchParams.has("lang")) {
        const publicPath = `${url.pathname}?lang=${url.searchParams.get("lang")}`;
        const variant = variants.find((item) => item.publicPath === publicPath);
        assert.ok(variant, publicPath);
        assert.equal(url.searchParams.get("release-proof"), local.sourceCommit);
        assert.equal(options.redirect, "error");
        localizedRequests.push(publicPath);
        return new Response(variant.body);
      }
      return f.fetcher(url, options);
    };
    const result = await verifyRelease(origin, local, fetcher);
    assert.equal(result.publicAssetsVerified, 2 + variants.length);
    assert.deepEqual(
      localizedRequests.sort(),
      variants.map((item) => item.publicPath).sort(),
    );
    await assert.rejects(
      verifyRelease(origin, local, async (url, options) =>
        url.searchParams.has("lang")
          ? new Response(html)
          : fetcher(url, options),
      ),
      /Served bytes differ/,
    );
  }
});

test("release proof refuses unknown internal languages and routes rather than skipping their hashes", async () => {
  for (const path of [
    site.localizedPrefix,
    `${site.localizedPrefix}/es/index.html`,
    `${site.localizedPrefix}/en/missing/index.html`,
    `${site.localizedPrefix}/en/index.html?lang=de`,
    `${site.localizedPrefix}/en/journal.html`,
  ]) {
    const local = {
      ...manifest,
      assets: [...manifest.assets, asset(path, html)],
    };
    await assert.rejects(
      verifyRelease(
        primary,
        local,
        fixture(primary, { remote: local }).fetcher,
      ),
      /Invalid localized asset path/,
    );
  }
});
