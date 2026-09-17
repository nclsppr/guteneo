import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { verifyRelease } from "../../scripts/verify-release.mjs";

const primary = "https://guteneo.com";
const fallback = "https://guteneo-app.nclsppr.workers.dev";
// This fixture deliberately spells out the public policy instead of importing
// the generator: a permissive fallback or a blocked canonical site must fail.
const publicRobots =
  "User-agent: *\nAllow: /\nDisallow: /api\nDisallow: /auth\nDisallow: /oauth\nDisallow: /mcp\nDisallow: /webhooks\nDisallow: /media\nDisallow: /.well-known\nSitemap: https://guteneo.com/sitemap.xml\n";
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
