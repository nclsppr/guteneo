import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "./release-source.mjs";
import {
  experienceOrigin,
  verifyExperienceBackend,
  verifyExperienceRelease,
} from "./experience-release.mjs";

/** Public GETs only. This is served-byte proof, never human-login/send proof. */
export async function verifyServedExperience({
  root = fileURLToPath(new URL("../", import.meta.url)),
  fetcher = fetch,
} = {}) {
  const local = JSON.parse(
    await readFile(resolve(root, "dist/experience/release.json"), "utf8"),
  );
  await verifyExperienceRelease(root, local.commit);
  const request = async (path) => {
    const response = await fetcher(`${experienceOrigin}${path}`, {
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`EXPERIENCE_ASSET_HTTP: ${path}`);
    if (
      response.headers.get("X-Robots-Tag") !== "noindex, nofollow" ||
      response.headers.get("X-Content-Type-Options") !== "nosniff"
    )
      throw new Error(`EXPERIENCE_SERVED_HEADERS: ${path}`);
    return response;
  };
  const remote = await (await request("/release.json")).json();
  if (JSON.stringify(remote) !== JSON.stringify(local))
    throw new Error("EXPERIENCE_SERVED_MANIFEST_MISMATCH");
  // Four bounded requests in parallel avoid a long serial asset waterfall.
  const queue = local.assets.filter(
    (asset) => !["/_headers", "/_redirects"].includes(asset.path),
  );
  await Promise.all(
    Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (queue.length) {
        const asset = queue.shift();
        const bytes = new Uint8Array(
          await (await request(asset.path)).arrayBuffer(),
        );
        if (bytes.length !== asset.bytes || sha256(bytes) !== asset.sha256)
          throw new Error(`EXPERIENCE_SERVED_ASSET_MISMATCH: ${asset.path}`);
      }
    }),
  );
  const index = local.assets.find((asset) => asset.path === "/index.html");
  for (const path of ["/", "/departures", "/documents", "/account"]) {
    const bytes = new Uint8Array(await (await request(path)).arrayBuffer());
    if (sha256(bytes) !== index.sha256)
      throw new Error(`EXPERIENCE_SPA_ROUTE: ${path}`);
  }
  await verifyExperienceBackend(fetcher);
  return {
    origin: experienceOrigin,
    commit: local.commit,
    assets: local.assets.length,
    proof: "public-served-bytes-only",
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(JSON.stringify(await verifyServedExperience(), null, 2));
