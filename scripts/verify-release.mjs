import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const [originArgument, manifestPath] = process.argv.slice(2);
if (!originArgument || !manifestPath)
  throw new Error("Pass a public origin and its local release.json manifest.");
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
const local = JSON.parse(await readFile(manifestPath, "utf8"));
if (local.sourceDirty || !/^[a-f0-9]{40}$/.test(local.sourceCommit))
  throw new Error("Final proof requires a clean committed local build.");
const fetchPublic = async (path) => {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes(".."))
    throw new Error("Invalid asset path.");
  const url = new URL(path, origin);
  if (url.origin !== origin.origin) throw new Error("Asset origin changed.");
  url.searchParams.set("release-proof", local.sourceCommit);
  const response = await fetch(url, {
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
await Promise.all(
  Array.from({ length: 4 }, async () => {
    for (;;) {
      const entry = files.shift();
      if (!entry) return;
      if (entry.path === "/_headers") {
        configurationFiles.push(entry.path);
        continue;
      }
      // Workers Static Assets canonicalizes /index.html to / with HTTP 307.
      // Verify the same document bytes at the canonical route without following
      // arbitrary redirects from a release manifest.
      const publicPath = entry.path === "/index.html" ? "/" : entry.path;
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
  !page.headers.get("content-security-policy")?.includes("frame-ancestors 'none'")
)
  throw new Error("Required public security headers are missing.");
console.log(
  JSON.stringify(
    {
      origin: origin.origin,
      sourceCommit: remote.sourceCommit,
      sourceDirty: remote.sourceDirty,
      sourceSnapshotSha256: remote.sourceSnapshotSha256,
      publicAssetsVerified: checked,
      configurationFiles,
      securityHeadersVerified: true,
      verifiedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
