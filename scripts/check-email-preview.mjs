import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import {
  EMAIL_BRAND_IMAGE_WIDTH,
  EMAIL_BRAND_IMAGE_HEIGHT,
} from "../packages/contracts/src/email-branding.ts";

const directory = fileURLToPath(
  new URL("../reports/email-preview/", import.meta.url),
);
const manifest = JSON.parse(
  await readFile(join(directory, "manifest.json"), "utf8"),
);
const browser = await chromium.launch();
const remoteRequests = [];
const checks = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1370, height: 1050 },
  });
  await page.route(/^https?:\/\//, async (route) => {
    remoteRequests.push(route.request().url());
    await route.abort();
  });
  await page.goto(pathToFileURL(join(directory, "index.html")).href);
  await page
    .frameLocator("iframe")
    .getByRole("heading", { level: 1 })
    .waitFor();
  assert.equal(
    await page.locator("#subject").textContent(),
    manifest.previews.find((entry) => entry.name === "my_documents-fr").subject,
  );
  await page.screenshot({
    path: join(directory, "gallery-desktop.png"),
    fullPage: true,
  });
  checks.push("French correspondence is initially selected");

  await page.getByRole("button", { name: "Deutsch", exact: true }).click();
  await page
    .getByRole("button", { name: "Reset a password", exact: true })
    .click();
  await page
    .frameLocator("iframe")
    .getByRole("heading", {
      level: 1,
      name: "Setzen Sie Ihr Passwort zurück",
      exact: true,
    })
    .waitFor();
  assert.equal(
    await page.locator("#html-link").getAttribute("href"),
    "account-reset_email-de.html",
  );
  assert.equal(
    await page.locator("#eml-link").getAttribute("href"),
    "account-reset_email-de.eml",
  );
  assert.deepEqual(
    await page
      .frameLocator("iframe")
      .locator("img")
      .evaluate((image) => ({
        width: image.naturalWidth,
        height: image.naturalHeight,
      })),
    { width: EMAIL_BRAND_IMAGE_WIDTH, height: EMAIL_BRAND_IMAGE_HEIGHT },
  );
  checks.push(
    "Language and account template selection update HTML and native Mail links together",
  );

  await page.getByRole("button", { name: "320 px", exact: true }).click();
  assert.equal(
    Math.round((await page.locator("iframe").boundingBox()).width),
    320,
  );
  await page
    .getByRole("button", { name: "Lëtzebuergesch", exact: true })
    .click();
  await page
    .frameLocator("iframe")
    .getByRole("heading", {
      level: 1,
      name: "Setzt Äert Passwuert zréck",
      exact: true,
    })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Lëtzebuergesch", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Reset a password", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  checks.push("Mobile width and active template survive a locale change");

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: join(directory, `gallery-mobile-${width}.png`),
      fullPage: true,
    });
  }
  assert.deepEqual(remoteRequests, []);
  checks.push(
    "Gallery has no horizontal overflow at 320 or 390 pixels and makes no remote requests",
  );
} finally {
  await browser.close();
}
const report = {
  scope: "local Chromium gallery interaction only",
  checks,
  remoteRequests: remoteRequests.length,
  sendsPerformed: 0,
};
await writeFile(
  join(directory, "gallery-interaction.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
