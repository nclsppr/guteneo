import assert from "node:assert/strict";
import { mkdtemp, readFile, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "vite";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import {
  PUBLIC_ORIGIN,
  PUBLIC_PATHS,
  writePublicPages,
} from "../../scripts/build-public-pages.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));

test("real Static Assets applies primary/fallback crawl policy after _headers, including aliases, HEAD and 304", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "guteneo-asset-policy-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const directory = join(temp, "assets");
  await mkdir(directory);
  await writeFile(
    join(directory, "index.html"),
    '<!doctype html><html><head><title>fixture</title></head><body><div id="root"></div></body></html>',
  );
  await writeFile(
    join(directory, "_headers"),
    await readFile(join(root, "apps/web/public/_headers")),
  );
  await writeFile(
    join(directory, "art.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg"/>',
  );
  await writeFile(join(directory, "release.json"), '{"fixture":true}');
  await writePublicPages({
    output: directory,
    indexable: true,
    renderPublicPage: (pathname) => ({
      html: `<main><h1>Public ${pathname}</h1></main>`,
      title: `Public ${pathname}`,
      description: "Static SEO fixture",
      canonical: PUBLIC_ORIGIN + pathname,
    }),
  });
  // Compile the actual production entry into a temporary directory, never shared dist.
  await build({
    configFile: false,
    logLevel: "silent",
    ssr: { target: "webworker", noExternal: true },
    build: {
      ssr: join(root, "apps/api/src/worker.ts"),
      outDir: join(temp, "compiled"),
      emptyOutDir: true,
      target: "es2022",
      rolldownOptions: {
        external: [/^cloudflare:/, /^node:/],
        output: { entryFileNames: "worker.js" },
      },
    },
  });
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "public-crawl-fixture",
      modules: true,
      script: await readFile(join(temp, "compiled/worker.js"), "utf8"),
      compatibilityDate: "2026-09-16",
      compatibilityFlags: ["nodejs_compat"],
      bindings: {
        ENVIRONMENT: "production",
        MODE: "production",
        APP_ORIGIN: PUBLIC_ORIGIN,
      },
      assets: {
        directory,
        binding: "ASSETS",
        run_worker_first: true,
        routerConfig: {
          has_user_worker: true,
          invoke_user_worker_ahead_of_assets: true,
        },
        assetConfig: {
          html_handling: "force-trailing-slash",
          not_found_handling: "none",
        },
      },
    }),
  );
  t.after(() => mf.dispose());
  const fallbackOrigin = "https://guteneo-app.nclsppr.workers.dev";
  for (const path of PUBLIC_PATHS) {
    const response = await mf.dispatchFetch(PUBLIC_ORIGIN + path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("X-Robots-Tag"), null, path);
    assert.match(
      response.headers.get("Content-Security-Policy"),
      /frame-ancestors 'none'/,
    );
    const expected = await readFile(
      join(directory, path.slice(1), "index.html"),
      "utf8",
    );
    assert.equal(
      await response.text(),
      expected,
      "asset bytes must not change",
    );
    assert.match(expected, /name="robots" content="index, follow/);
    const etag = response.headers.get("ETag");
    assert.ok(etag);
    const conditional = await mf.dispatchFetch(PUBLIC_ORIGIN + path, {
      headers: { "If-None-Match": etag },
    });
    assert.equal(conditional.status, 304);
    assert.equal(conditional.headers.get("X-Robots-Tag"), null);
    const head = await mf.dispatchFetch(PUBLIC_ORIGIN + path, {
      method: "HEAD",
    });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get("X-Robots-Tag"), null);
    assert.equal(await head.text(), "");
    // Alternate hosts must not inherit a primary response's policy from the asset cache.
    const fallback = await mf.dispatchFetch(fallbackOrigin + path);
    assert.equal(fallback.status, 200);
    assert.equal(fallback.headers.get("X-Robots-Tag"), "noindex, nofollow");
    assert.equal(await fallback.text(), expected);
    const primaryAgain = await mf.dispatchFetch(PUBLIC_ORIGIN + path);
    assert.equal(primaryAgain.headers.get("X-Robots-Tag"), null);
    for (const alias of path === "/"
      ? ["/index.html"]
      : [path.slice(0, -1), path + "index.html"]) {
      const redirect = await mf.dispatchFetch(PUBLIC_ORIGIN + alias, {
        redirect: "manual",
      });
      assert.ok([301, 302, 307, 308].includes(redirect.status));
      assert.equal(
        new URL(redirect.headers.get("Location"), PUBLIC_ORIGIN).pathname,
        path,
      );
      assert.equal(redirect.headers.get("X-Robots-Tag"), "noindex, follow");
      const fallbackRedirect = await mf.dispatchFetch(fallbackOrigin + alias, {
        redirect: "manual",
      });
      assert.equal(
        fallbackRedirect.headers.get("X-Robots-Tag"),
        "noindex, nofollow",
      );
    }
  }
  for (const path of [
    "/does-not-exist/",
    "/journal/unpublished/",
    "/missing.css",
  ]) {
    const missing = await mf.dispatchFetch(PUBLIC_ORIGIN + path);
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get("X-Robots-Tag"), "noindex, nofollow");
  }
  const privateQuery = await mf.dispatchFetch(PUBLIC_ORIGIN + "/?code=fixture");
  assert.equal(privateQuery.headers.get("X-Robots-Tag"), "noindex, nofollow");
  assert.equal(privateQuery.headers.get("Cache-Control"), "no-store");
  for (const origin of [PUBLIC_ORIGIN, fallbackOrigin]) {
    const robots = await mf.dispatchFetch(origin + "/robots.txt");
    const text = await robots.text();
    if (origin === PUBLIC_ORIGIN) {
      assert.match(text, /Allow: \/\n/);
      assert.match(text, /Disallow: \/api/);
      assert.match(text, /Sitemap: https:\/\/guteneo.com\/sitemap.xml/);
    } else assert.equal(text, "User-agent: *\nDisallow: /\n");
    assert.equal(robots.headers.get("Cache-Control"), "no-store");
  }
  const sitemap = await mf.dispatchFetch(PUBLIC_ORIGIN + "/sitemap.xml");
  assert.deepEqual(
    [...(await sitemap.text()).matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]),
    PUBLIC_PATHS.map((p) => PUBLIC_ORIGIN + p),
  );
  assert.equal(
    (await mf.dispatchFetch(PUBLIC_ORIGIN + "/art.svg")).headers.get(
      "X-Robots-Tag",
    ),
    null,
  );
  assert.equal(
    (await mf.dispatchFetch(fallbackOrigin + "/art.svg")).headers.get(
      "X-Robots-Tag",
    ),
    "noindex, nofollow",
  );
  const release = await mf.dispatchFetch(PUBLIC_ORIGIN + "/release.json");
  assert.equal(release.headers.get("Cache-Control"), "no-store");
  assert.equal(release.headers.get("X-Robots-Tag"), "noindex, nofollow");
  const health = await mf.dispatchFetch(PUBLIC_ORIGIN + "/api/health");
  assert.equal(health.status, 200);
  assert.equal(health.headers.get("X-Robots-Tag"), "noindex, nofollow");
  assert.equal((await health.json()).status, "configuration_required");
  for (const [path, method] of [
    ["/api/session", "GET"],
    ["/api/documents", "POST"],
    ["/mcp", "POST"],
    ["/", "POST"],
  ]) {
    const privateResponse = await mf.dispatchFetch(PUBLIC_ORIGIN + path, {
      method,
    });
    assert.equal(privateResponse.status, 503);
    assert.equal(
      (await privateResponse.json()).error.code,
      "CONFIGURATION_INVALID",
    );
    assert.equal(
      privateResponse.headers.get("X-Robots-Tag"),
      "noindex, nofollow",
    );
  }
  const signup = await mf.dispatchFetch(PUBLIC_ORIGIN + "/auth/signup", {
    redirect: "manual",
  });
  assert.equal(signup.status, 302);
  assert.equal(signup.headers.get("X-Robots-Tag"), "noindex, nofollow");
  assert.ok(
    signup.headers.get("Location").startsWith(PUBLIC_ORIGIN + "/?auth="),
  );
});

test("production routing cannot bypass the host-aware asset policy", async () => {
  const config = await readFile(join(root, "wrangler.live.jsonc"), "utf8");
  assert.match(config, /"run_worker_first": true/);
  assert.match(config, /"not_found_handling": "none"/);
  const liveBuild = await readFile(
    join(root, "scripts/build-live.mjs"),
    "utf8",
  );
  assert.match(
    liveBuild,
    /buildPublicPages\(\{ root, output, indexable: true \}\)/,
  );
});
