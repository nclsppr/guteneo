import { mkdir, writeFile } from "node:fs/promises";
import { loadPdfScripts } from "./pdfjs-assets.mjs";

// Package-owned, lockfile-pinned compatibility scripts; no CDN request or runtime
// code download. Browser Run lacks some APIs used by the modern build (notably
// Map.getOrInsertComputed); Mozilla's legacy build supplies its own polyfills.
const output = new URL("./dist/pdfjs/", import.meta.url);
await mkdir(output, { recursive: true });
const scripts = await loadPdfScripts();
for (const [name, source] of [
  ["pdf", scripts.pdf],
  ["pdf.worker", scripts.worker],
  ["standard-fonts", scripts.fonts],
  ["address-font", scripts.addressFont],
]) {
  await writeFile(new URL(`${name}.txt`, output), source);
}
