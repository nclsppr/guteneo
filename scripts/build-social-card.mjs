import { readFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = join(root, "docs/brand/social-card.html");
const cards = JSON.parse(
  await readFile(
    join(root, "packages/contracts/src/social-cards.json"),
    "utf8",
  ),
);
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
  for (const [locale, card] of Object.entries(cards)) {
    const output = join(root, "apps/web/public", card.src);
    const page = await browser.newPage({
      viewport: { width: card.width, height: card.height },
      deviceScaleFactor: 1,
    });
    await page.route("**/*", (route) => route.abort());
    await page.setContent(html);
    await page.evaluate(
      async ({ locale, alt }) => {
        window.renderSocialCard(locale);
        document.querySelector(".stamp").alt = alt;
        await document.fonts.ready;
        await Promise.all([...document.images].map((image) => image.decode()));
        if (
          !document.fonts.check('500 100px "EB Garamond"') ||
          !document.fonts.check('500 42px "IBM Plex Sans"')
        ) {
          throw new Error("Social card fonts did not load.");
        }
        const stamp = document.querySelector(".stamp").getBoundingClientRect();
        for (const selector of [".wordmark", ".eyebrow", "h1 span"]) {
          for (const element of document.querySelectorAll(selector)) {
            if (element.hidden) continue;
            const bounds = element.getBoundingClientRect();
            if (bounds.right > stamp.left - 24 || bounds.bottom > 493) {
              throw new Error(
                `Social card ${locale}: ${selector} exceeds safe area.`,
              );
            }
          }
        }
        if (
          locale === "neutral" &&
          document.querySelector(".card").innerText.trim() !==
            "guteneo\n\nguteneo.com"
        ) {
          throw new Error("The neutral social card contains translated copy.");
        }
      },
      { locale, alt: card.alt },
    );
    await mkdir(dirname(output), { recursive: true });
    await page.screenshot({ path: output, type: "png" });
    await page.close();
    console.log(`Social card: ${output} (${card.width} × ${card.height})`);
  }
} finally {
  await browser.close();
}
