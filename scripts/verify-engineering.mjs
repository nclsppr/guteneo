import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const origin = process.argv[2];
if (origin !== "https://engineering.guteneo.com")
  throw new Error("Verify the dedicated engineering origin.");
const expected = JSON.parse(
  await readFile(
    new URL("../apps/engineering/dist/release.json", import.meta.url),
    "utf8",
  ),
);
const response = await fetch(`${origin}/release.json`, {
  cache: "no-store",
  signal: AbortSignal.timeout(20000),
});
if (!response.ok)
  throw new Error(`Engineering manifest returned ${response.status}`);
const actual = await response.json();
if (JSON.stringify(actual) !== JSON.stringify(expected) || actual.dirty)
  throw new Error(
    "Served engineering manifest differs from the clean local release.",
  );
for (const path of [
  "index.html",
  "features/index.html",
  "architecture/system/index.html",
  "llms.txt",
  "gutenberg/gutenberg-welcome.webp",
]) {
  const entry = expected.assets.find((asset) => asset.path === path);
  if (!entry) throw new Error(`Missing verification asset: ${path}`);
  const urlPath = path.endsWith("index.html") ? path.slice(0, -10) : path;
  const served = await fetch(`${origin}/${urlPath}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const hash = createHash("sha256")
    .update(Buffer.from(await served.arrayBuffer()))
    .digest("hex");
  if (!served.ok || hash !== entry.sha256)
    throw new Error(`Served engineering asset differs: ${path}`);
}
const missing = await fetch(`${origin}/__engineering_missing_page__/`, {
  signal: AbortSignal.timeout(20000),
});
if (missing.status !== 404)
  throw new Error("Unknown engineering routes must return HTTP 404.");
console.log(
  `Verified engineering.guteneo.com at ${actual.commit}: manifest, representative page/image/index bytes and 404.`,
);
