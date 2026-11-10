import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  parseReleaseVerifyConcurrency,
  verifyRelease,
} from "../../scripts/verify-release.mjs";
import site from "../../packages/contracts/src/public-site.json" with { type: "json" };
import mcpUiProbeManifest from "../../packages/contracts/src/mcp-ui-probe-resource.json" with { type: "json" };
import mcpDocumentUploadManifest from "../../packages/contracts/src/mcp-document-upload-resource.json" with { type: "json" };

const primary = "https://guteneo.com";
const fallback = "https://guteneo-app.nclsppr.workers.dev";
// This fixture deliberately spells out the public policy instead of importing
// the generator: a permissive fallback or a blocked canonical site must fail.
const publicRobots =
  "User-agent: *\nAllow: /\nDisallow: /belvedere\nDisallow: /api\nDisallow: /auth\nDisallow: /oauth\nDisallow: /mcp\nDisallow: /webhooks\nDisallow: /media\nDisallow: /share\nDisallow: /.well-known\nSitemap: https://guteneo.com/sitemap.xml\n";
const privateRobots = "User-agent: *\nDisallow: /\n";
const html = "<!doctype html><html><main>Guteneo</main></html>";
const css = "body{color:#181b22}";
const asset = (path, body) => ({
  path,
  bytes: Buffer.byteLength(body),
  sha256: createHash("sha256").update(body).digest("hex"),
});
const manifest = {
  version: "1.0.0",
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
      assert.ok(options.method === undefined || options.method === "GET");
      assert.equal(options.body, undefined);
      assert.equal(new Headers(options.headers).has("Authorization"), false);
      assert.equal(new Headers(options.headers).has("Cookie"), false);
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

for (const appManifest of [mcpUiProbeManifest, mcpDocumentUploadManifest]) {
  test(`release proof requires inert headers and exact bytes for ${appManifest.path}`, async () => {
    const text = "<!doctype html><h1>Synthetic source text</h1>";
    const local = {
      ...manifest,
      assets: [...manifest.assets, asset(appManifest.path, text)],
    };
    const variants = [
      {
        type: "text/plain; charset=utf-8",
        nosniff: "nosniff",
        robots: "noindex, nofollow",
        text,
        passes: true,
      },
      { type: "text/html", nosniff: "nosniff", robots: "noindex", text },
      { type: "text/plain", nosniff: "", robots: "noindex", text },
      { type: "text/plain", nosniff: "nosniff", robots: "", text },
      {
        type: "text/plain",
        nosniff: "nosniff",
        robots: "noindex",
        text: text + "changed",
      },
    ];
    for (const value of variants) {
      const base = fixture(primary, { remote: local });
      const fetcher = (url, options) =>
        url.pathname === appManifest.path
          ? Promise.resolve(
              new Response(value.text, {
                headers: {
                  "Content-Type": value.type,
                  "X-Content-Type-Options": value.nosniff,
                  "X-Robots-Tag": value.robots,
                },
              }),
            )
          : base.fetcher(url, options);
      if (value.passes)
        assert.equal(
          (await verifyRelease(primary, local, fetcher)).publicAssetsVerified,
          3,
        );
      else await assert.rejects(verifyRelease(primary, local, fetcher));
    }
  });
}

for (const origin of [primary, fallback]) {
  test(`release proof verifies the complete robots policy and static hashes on ${origin}`, async () => {
    const f = fixture(origin);
    const result = await verifyRelease(origin, manifest, f.fetcher);
    assert.equal(result.publicAssetsVerified, 2);
    assert.deepEqual(result.configurationFiles, ["/_headers"]);
    assert.deepEqual(result.dynamicResources, ["/robots.txt"]);
    assert.equal(result.robotsPolicyVerified, true);
    assert.equal(result.downloadConcurrency, 4);
    assert.equal(result.requestDeadlineMs, 30_000);
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
    [primary, publicRobots.replace("Disallow: /share\n", "")],
  ]) {
    await assert.rejects(
      verifyRelease(origin, manifest, fixture(origin, { robots }).fetcher),
      /Host-specific robots policy differs/,
    );
  }
});

test("CLI concurrency accepts only literal 1 through 4 and defaults only when absent", () => {
  assert.equal(parseReleaseVerifyConcurrency(undefined), 4);
  for (const value of ["1", "2", "3", "4"])
    assert.equal(parseReleaseVerifyConcurrency(value), Number(value));
  for (const value of [
    "",
    "0",
    "5",
    "1.5",
    "4.0",
    "01",
    "+1",
    "-1",
    "1e0",
    " 1",
    "1 ",
    "1\n",
    "\n1",
    "Infinity",
    "NaN",
    1,
    null,
    true,
  ])
    assert.throws(
      () => parseReleaseVerifyConcurrency(value),
      /GUTENEO_RELEASE_VERIFY_CONCURRENCY/,
    );
});

test("invalid programmatic concurrency fails before any fetch", async () => {
  let requests = 0;
  for (const concurrency of [0, 5, -1, 1.5, NaN, Infinity, "1", null, true])
    await assert.rejects(
      verifyRelease(
        primary,
        manifest,
        () => {
          requests++;
          throw new Error("Unexpected request");
        },
        { concurrency },
      ),
      /Download concurrency/,
    );
  assert.equal(requests, 0);
});

for (const concurrency of [1, 4])
  test(`concurrency ${concurrency} verifies every asset with the same request deadline`, async (t) => {
    const deadlines = [];
    t.mock.method(AbortSignal, "timeout", (milliseconds) => {
      deadlines.push(milliseconds);
      return new AbortController().signal;
    });
    const additional = Array.from({ length: 8 }, (_, index) => ({
      path: `/videos/synthetic-${index}.mp4`,
      body: `Synthetic video bytes ${index}`,
    }));
    const local = {
      ...manifest,
      assets: [
        ...manifest.assets,
        ...additional.map(({ path, body }) => asset(path, body)),
      ],
    };
    const base = fixture(primary, { remote: local });
    const requests = [];
    let active = 0,
      peak = 0;
    const fetcher = async (url, options) => {
      requests.push(url.pathname);
      const entry = additional.find((item) => item.path === url.pathname);
      const response = entry
        ? new Response(entry.body)
        : await base.fetcher(url, options);
      const read = response.arrayBuffer.bind(response);
      response.arrayBuffer = async () => {
        active++;
        peak = Math.max(peak, active);
        assert.ok(active <= concurrency);
        try {
          // Keep the complete body read pending across one event-loop turn.
          await new Promise((resolve) => setImmediate(resolve));
          return await read();
        } finally {
          active--;
        }
      };
      return response;
    };
    const result = await verifyRelease(primary, local, fetcher, {
      concurrency,
    });
    assert.equal(peak, concurrency);
    assert.equal(active, 0);
    assert.equal(result.publicAssetsVerified, 2 + additional.length);
    assert.deepEqual(result.configurationFiles, ["/_headers"]);
    assert.deepEqual(result.dynamicResources, ["/robots.txt"]);
    assert.equal(result.robotsPolicyVerified, true);
    assert.equal(result.securityHeadersVerified, true);
    assert.equal(result.downloadConcurrency, concurrency);
    assert.equal(result.requestDeadlineMs, 30_000);
    assert.equal(deadlines.length, requests.length);
    assert.ok(deadlines.every((value) => value === 30_000));
    for (const entry of additional)
      assert.equal(requests.filter((path) => path === entry.path).length, 1);
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
  await assert.rejects(
    verifyRelease(
      primary,
      manifest,
      fixture(primary, { remote: { ...manifest, version: "0.3.5" } }).fetcher,
    ),
    /Deployed release mismatch: version/,
  );
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
