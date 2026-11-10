import { expect, test } from "@playwright/test";

test("public Studio exposes read-only libraries and details without business requests", async ({
  page,
}) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (
      request.method() !== "GET" ||
      /\/(api|auth|mcp)(\/|$)/.test(new URL(request.url()).pathname)
    )
      requests.push(`${request.method()} ${request.url()}`);
  });
  await page.goto("/?lang=en#/app");
  await page
    .getByRole("button", { name: "Application: Correspondence", exact: true })
    .click();
  const applications = page.getByRole("navigation", {
    name: "Applications",
    exact: true,
  });
  await expect(applications.getByRole("link")).toHaveCount(2);
  await applications.getByRole("link", { name: "Studio", exact: true }).click();
  await expect(page.locator("main h1")).toHaveText("Templates");
  const studioNavigation = page.getByRole("navigation", {
    name: "Studio navigation",
    exact: true,
    includeHidden: true,
  });
  const openStudioNavigation = () =>
    test.step("Open the current Studio navigation", async () => {
      // A pending application route is not a collapsed menu. Desktop hides
      // the toggle entirely; only mobile's closed native disclosure needs it.
      await expect(studioNavigation).toBeAttached();
      const disclosure = page.locator("details.workspace-navigation");
      if ((await disclosure.getAttribute("open")) === null) {
        const toggle = disclosure.locator(":scope > summary");
        await expect(toggle).toBeVisible();
        await toggle.click();
      }
      await expect(studioNavigation).toBeVisible();
    });
  await openStudioNavigation();
  await expect(studioNavigation.getByRole("link")).toHaveCount(3);
  for (const name of ["Templates", "Data", "Generations"])
    await expect(
      studioNavigation.getByRole("link", { name, exact: true }),
    ).toBeVisible();
  await expect(page.locator(".studio-template-row")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "New template", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('main input[type="file"]')).toHaveCount(0);
  const examples = page.locator(".studio-gallery > button");
  await expect(examples).toHaveCount(5);
  for (const example of await examples.all())
    await expect(example).toBeDisabled();
  await page.locator(".studio-template-row h3 a").first().click();
  await expect(
    page.getByRole("button", { name: "Save draft", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Publish version", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Data and generation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Check a PDF preview", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", {
      name: "Generate PDF without sending",
      exact: true,
    }),
  ).toBeDisabled();
  await openStudioNavigation();
  await studioNavigation
    .getByRole("link", { name: "Data", exact: true })
    .click();
  await expect(page.locator("main h1")).toHaveText("Data");
  await expect(page.locator(".studio-list-row")).toHaveCount(3);
  await expect(page.locator('main input[type="file"]')).toHaveCount(0);
  await page.locator(".studio-list-row h3 a").first().click();
  await expect(page.locator("main h1")).toContainText("Fictional records");
  await expect(page.locator("main form")).toHaveCount(0);
  await openStudioNavigation();
  await studioNavigation
    .getByRole("link", { name: "Generations", exact: true })
    .click();
  await expect(page.locator("main h1")).toHaveText("Generations");
  await expect(page.locator(".studio-list-row")).toHaveCount(3);
  await page.locator(".studio-list-row h3 a").first().click();
  await expect(page.locator("main h1")).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /Retry failed|Cancel generation|Prepare distribution/,
    }),
  ).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});
