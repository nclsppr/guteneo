import { mkdir, readFile, writeFile } from "node:fs/promises";

// Package-owned, lockfile-pinned compatibility scripts; no CDN request or runtime
// code download. Browser Run lacks some APIs used by the modern build (notably
// Map.getOrInsertComputed); Mozilla's legacy build supplies its own polyfills.
const output = new URL("./dist/pdfjs/", import.meta.url);
await mkdir(output, { recursive: true });
for (const name of ["pdf", "pdf.worker"]) {
  const source = await readFile(
    new URL(
      `../../node_modules/pdfjs-dist/legacy/build/${name}.min.mjs`,
      import.meta.url,
    ),
    "utf8",
  );
  await writeFile(new URL(`${name}.txt`, output), source);
}
