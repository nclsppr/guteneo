import { readFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = join(root, "docs/brand/social-card.html");
const output = join(root, "apps/web/public/social/guteneo-share-20261002.png");
let html = await readFile(source, "utf8");
// Embed the approved logo and pinned fonts: the renderer needs no server/network.
for (const [path, type] of [
  [
    "node_modules/@fontsource/eb-garamond/files/eb-garamond-latin-500-normal.woff2",
    "font/woff2",
  ],
  [
    "node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2",
    "font/woff2",
  ],
  ["apps/web/public/brand/guteneo-portrait.png", "image/png"],
]) {
  const bytes = await readFile(join(root, path));
  html = html.replaceAll(
    `../../${path}`,
    `data:${type};base64,${bytes.toString("base64")}`,
  );
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.route("**/*", (route) => route.abort());
  await page.setContent(html);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.decode()));
    if (
      !document.fonts.check('500 100px "EB Garamond"') ||
        !document.fonts.check('500 42px "IBM Plex Sans"')
    ) {
      throw new Error("Social card fonts did not load.");
    }
  });
  await mkdir(dirname(output), { recursive: true });
  await page.screenshot({ path: output, type: "png" });
  console.log(`Social card: ${output} (1200 × 630)`);
} finally {
  await browser.close();
}
