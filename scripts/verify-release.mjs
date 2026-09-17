import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import site from "../packages/contracts/src/public-site.json" with { type: "json" };

export async function verifyRelease(originArgument, local, fetcher = fetch) {
  const origin = new URL(originArgument);
  if (
    origin.protocol !== "https:" ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password
  )
    throw new Error("A credential-free HTTPS origin is required.");
  if (local.sourceDirty || !/^[a-f0-9]{40}$/.test(local.sourceCommit))
    throw new Error("Final proof requires a clean committed local build.");
  const fetchPublic = async (path) => {
    if (!path.startsWith("/") || path.startsWith("//") || path.includes(".."))
      throw new Error("Invalid asset path.");
    const url = new URL(path, origin);
    if (url.origin !== origin.origin) throw new Error("Asset origin changed.");
    url.searchParams.set("release-proof", local.sourceCommit);
    const response = await fetcher(url, {
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
      headers: { "Cache-Control": "no-cache" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${path}`);
    return response;
  };
  const remote = await (await fetchPublic("/release.json")).json();
  for (const field of [
    "sourceCommit",
    "sourceDirty",
    "sourceSnapshotSha256",
    "assetsSha256",
    "mode",
    "publicPreview",
    "liveSendsEnabled",
  ])
    if (remote[field] !== local[field])
      throw new Error(`Deployed release mismatch: ${field}`);
  let checked = 0;
  const files = [...local.assets];
  const configurationFiles = [];
  const dynamicResources = [];
  if (!files.some((entry) => entry.path === "/robots.txt"))
    throw new Error("Release manifest is missing robots.txt.");
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (;;) {
        const entry = files.shift();
        if (!entry) return;
        if (entry.path === "/_headers") {
          configurationFiles.push(entry.path);
          continue;
        }
        if (entry.path === "/robots.txt") {
          // The same bundle intentionally serves a different policy on fallback hosts.
          // Check the entire generated policy, never waive verification of this route.
          const response = await fetchPublic(entry.path);
          const expected =
            origin.origin === site.origin
              ? `User-agent: *\nAllow: /\n${site.privatePrefixes.map((prefix) => `Disallow: /${prefix}`).join("\n")}\nSitemap: ${site.origin}/sitemap.xml\n`
              : "User-agent: *\nDisallow: /\n";
          if (
            (await response.text()) !== expected ||
            !response.headers.get("content-type")?.startsWith("text/plain") ||
            response.headers.get("x-content-type-options") !== "nosniff" ||
            !response.headers.get("x-robots-tag")?.includes("noindex")
          )
            throw new Error("Host-specific robots policy differs: /robots.txt");
          dynamicResources.push(entry.path);
          continue;
        }
        // Workers Static Assets canonicalizes /index.html to / with HTTP 307.
        // Verify the same document bytes at the canonical route without following
        // arbitrary redirects from a release manifest.
        const publicPath = entry.path.endsWith("/index.html")
          ? entry.path.slice(0, -"index.html".length)
          : entry.path;
        const bytes = new Uint8Array(
          await (await fetchPublic(publicPath)).arrayBuffer(),
        );
        const digest = createHash("sha256").update(bytes).digest("hex");
        if (digest !== entry.sha256 || bytes.length !== entry.bytes)
          throw new Error(`Served bytes differ: ${entry.path}`);
        checked++;
      }
    }),
  );
  const page = await fetchPublic("/");
  if (
    page.headers.get("x-content-type-options") !== "nosniff" ||
    !page.headers
      .get("content-security-policy")
      ?.includes("frame-ancestors 'none'")
  )
    throw new Error("Required public security headers are missing.");
  const pageRobots = page.headers.get("x-robots-tag") ?? "";
  if (
    origin.origin === site.origin
      ? /noindex|none/i.test(pageRobots)
      : !/noindex/i.test(pageRobots)
  )
    throw new Error("Public page indexing header does not match its host.");
  return {
    origin: origin.origin,
    sourceCommit: remote.sourceCommit,
    sourceDirty: remote.sourceDirty,
    sourceSnapshotSha256: remote.sourceSnapshotSha256,
    publicAssetsVerified: checked,
    configurationFiles,
    dynamicResources,
    robotsPolicyVerified: true,
    securityHeadersVerified: true,
    verifiedAt: new Date().toISOString(),
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [originArgument, manifestPath] = process.argv.slice(2);
  if (!originArgument || !manifestPath)
    throw new Error(
      "Pass a public origin and its local release.json manifest.",
    );
  const local = JSON.parse(await readFile(manifestPath, "utf8"));
  console.log(
    JSON.stringify(await verifyRelease(originArgument, local), null, 2),
  );
}
