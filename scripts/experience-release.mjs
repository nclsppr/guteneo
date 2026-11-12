import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import ts from "typescript";
import { collectAssets, sha256, sourceSnapshot } from "./release-source.mjs";

export const experienceOrigin = "https://gare.guteneo.com";
export const experienceApiOrigin = "https://guteneo.com";
export const experienceSourceScope = Object.freeze([
  "apps/experience",
  // Include shared source/assets, even when a particular build tree-shakes them.
  "apps/web",
  "packages/contracts",
  "scripts/brand-icons.mjs",
  "scripts/build-experience.mjs",
  "scripts/experience-release.mjs",
  "scripts/deploy-experience.mjs",
  "scripts/ci/manual-experience-release.mjs",
  ".github/workflows/manual-experience-release.yml",
  "scripts/verify-experience.mjs",
  "scripts/deploy-public.mjs",
  "scripts/release-source.mjs",
  "playwright.experience.config.ts",
  "tests/experience-e2e",
  "tests/security/experience-deploy.test.mjs",
  "package.json",
  "package-lock.json",
]);

export const experienceSourceSnapshot = (root) =>
  sourceSnapshot(root, experienceSourceScope);

export async function readExperienceConfig(path) {
  const parsed = ts.parseConfigFileTextToJson(
    String(path),
    await readFile(path, "utf8"),
  );
  if (parsed.error) throw new Error("EXPERIENCE_CONFIG_INVALID");
  return parsed.config;
}

/** The station is an asset-only Worker, never a proxy or business runtime. */
export function validateExperienceConfig(config) {
  const allowed = new Set([
    "$schema",
    "name",
    "account_id",
    "compatibility_date",
    "workers_dev",
    "preview_urls",
    "routes",
    "assets",
  ]);
  if (
    Object.keys(config).some((key) => !allowed.has(key)) ||
    config.name !== "guteneo-gare" ||
    config.account_id !== "39ac9fada6cba44d9ecf09d467609e69" ||
    config.workers_dev !== false ||
    config.preview_urls !== false ||
    JSON.stringify(config.routes) !==
      JSON.stringify([{ pattern: "gare.guteneo.com", custom_domain: true }]) ||
    JSON.stringify(config.assets) !==
      JSON.stringify({
        directory: "../../dist/experience",
        html_handling: "none",
        not_found_handling: "single-page-application",
      })
  )
    throw new Error("EXPERIENCE_ASSET_ONLY_CONFIGURATION_REQUIRED");
}

export async function experienceManifest(directory) {
  const assets = await collectAssets(directory, ["/release.json"]);
  for (const asset of assets) {
    if (
      /(?:^|\/)(?:docs|reports|archive|node_modules|\.git|\.env)(?:\/|$)|FEATURE_MAP|feature-map\.json|\.map$|\.(?:pem|key|log)$/.test(
        asset.path,
      )
    )
      throw new Error(`EXPERIENCE_PRIVATE_ASSET: ${asset.path}`);
    if (/\.(?:html|txt|json|xml|js|css|svg)$/.test(asset.path)) {
      const text = await readFile(
        resolve(directory, asset.path.slice(1)),
        "utf8",
      );
      if (
        /(?:\/Users\/|\/home\/runner\/|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|cloudflare_api_token\s*[=:]\s*["']?[a-zA-Z0-9_-]{30})/i.test(
          text,
        ) ||
        /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?/i.test(text)
      )
        throw new Error(`EXPERIENCE_PRIVATE_OR_LOCAL_ASSET: ${asset.path}`);
    }
  }
  for (const required of ["/index.html", "/boot.js", "/_headers"])
    if (!assets.some((asset) => asset.path === required))
      throw new Error(`EXPERIENCE_MISSING_ASSET: ${required}`);
  const headers = await readFile(resolve(directory, "_headers"), "utf8");
  for (const directive of [
    `connect-src 'self' ${experienceApiOrigin}`,
    "frame-ancestors 'none'",
    "X-Robots-Tag: noindex, nofollow",
    "Referrer-Policy: no-referrer",
    "X-Content-Type-Options: nosniff",
  ])
    if (!headers.includes(directive))
      throw new Error("EXPERIENCE_SECURITY_HEADERS_REQUIRED");
  return assets;
}

export async function createExperienceRelease(
  root,
  { commit, dirty, snapshot },
) {
  if (snapshot !== (await experienceSourceSnapshot(root)))
    throw new Error("EXPERIENCE_SOURCE_CHANGED");
  const assets = await experienceManifest(resolve(root, "dist/experience"));
  return {
    service: "guteneo-gare",
    origin: experienceOrigin,
    apiOrigin: experienceApiOrigin,
    mode: "production",
    commit,
    dirty,
    sourceSnapshotScope: experienceSourceScope,
    sourceSnapshotSha256: snapshot,
    assetsSha256: sha256(JSON.stringify(assets)),
    assets,
  };
}

export async function verifyExperienceRelease(root, reviewedCommit, expected) {
  validateExperienceConfig(
    await readExperienceConfig(resolve(root, "apps/experience/wrangler.jsonc")),
  );
  const manifest = JSON.parse(
    await readFile(resolve(root, "dist/experience/release.json"), "utf8"),
  );
  if (
    manifest.service !== "guteneo-gare" ||
    manifest.origin !== experienceOrigin ||
    manifest.apiOrigin !== experienceApiOrigin ||
    manifest.mode !== "production" ||
    manifest.commit !== reviewedCommit ||
    manifest.dirty !== false ||
    JSON.stringify(manifest.sourceSnapshotScope) !==
      JSON.stringify(experienceSourceScope) ||
    manifest.sourceSnapshotSha256 !== (await experienceSourceSnapshot(root))
  )
    throw new Error("EXPERIENCE_MANIFEST_SOURCE_MISMATCH");
  const assets = await experienceManifest(resolve(root, "dist/experience"));
  if (
    JSON.stringify(manifest.assets) !== JSON.stringify(assets) ||
    manifest.assetsSha256 !== sha256(JSON.stringify(assets)) ||
    (expected && JSON.stringify(manifest) !== JSON.stringify(expected))
  )
    throw new Error("EXPERIENCE_RELEASE_ASSETS_MISMATCH");
  return manifest;
}

/** Anonymous reads/preflights only; this grants no session and sends nothing. */
export async function verifyExperienceBackend(fetcher = fetch) {
  const timeout = () => AbortSignal.timeout(20_000);
  const capabilities = await fetcher(
    `${experienceApiOrigin}/api/capabilities`,
    {
      headers: { Origin: experienceOrigin },
      redirect: "error",
      signal: timeout(),
    },
  );
  const data = await capabilities.json();
  if (
    !capabilities.ok ||
    data.mode !== "production" ||
    data.simulation !== false ||
    capabilities.headers.get("Access-Control-Allow-Origin") !==
      experienceOrigin ||
    capabilities.headers.get("Access-Control-Allow-Credentials") !== "true"
  )
    throw new Error("EXPERIENCE_PRODUCTION_BACKEND_NOT_READY");
  const preflight = await fetcher(`${experienceApiOrigin}/api/session`, {
    method: "OPTIONS",
    redirect: "error",
    signal: timeout(),
    headers: {
      Origin: experienceOrigin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers":
        "content-type,x-csrf-token,idempotency-key",
    },
  });
  if (
    preflight.status !== 204 ||
    preflight.headers.get("Access-Control-Allow-Origin") !== experienceOrigin ||
    preflight.headers.get("Access-Control-Allow-Credentials") !== "true" ||
    !preflight.headers
      .get("Access-Control-Allow-Headers")
      ?.toLowerCase()
      .includes("x-csrf-token")
  )
    throw new Error("EXPERIENCE_BROWSER_ORIGIN_NOT_READY");
  const unrelated = await fetcher(`${experienceApiOrigin}/api/session`, {
    headers: { Origin: "https://untrusted.invalid" },
    redirect: "error",
    signal: timeout(),
  });
  if (
    unrelated.status !== 401 ||
    unrelated.headers.has("Access-Control-Allow-Origin")
  )
    throw new Error("EXPERIENCE_BACKEND_AUTHORITY_NOT_CLOSED");
  return {
    apiOrigin: experienceApiOrigin,
    experienceOrigin,
    mode: "production",
  };
}
