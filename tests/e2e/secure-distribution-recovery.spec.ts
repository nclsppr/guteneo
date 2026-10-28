import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  secureDistributionCatalog,
  secureDistributionQuote,
} from "../../packages/contracts/src/secure-distribution";

async function fixture(
  page: Page,
  mode: "expired" | "race" | "replacement" = "expired",
) {
  const preview = await readFile(
    new URL("../fixtures/secure-review.png", import.meta.url),
  );
  const writes: { path: string; body: unknown }[] = [];
  let renewed = mode === "replacement";
  let renewCalls = 0;
  const source = {
    id: "doc_recovery",
    name: "Correspondance.pdf",
    pages: 1,
    sha256: "a".repeat(64),
    size: 500,
    status: "ready",
    source: "upload",
    created_at: "2026-10-27T12:00:00Z",
  };
  const policy = {
    retentionDays: 30 as const,
    allowOriginalDownload: true,
    allowVaultDeposit: false,
    personalRetentionDays: 365 as const,
    recipientBinding: "verified_email" as const,
  };
  const publication = (replacement: boolean) => ({
    id: replacement ? "sd_renewed" : "sd_original",
    dispatchId: replacement ? "dispatch_renewed" : "dispatch_original",
    status: "prepared",
    title: source.name,
    source,
    recipient: { address: "recipient@example.invalid" },
    invitation: {
      subject: "Votre document",
      message: "Voici votre document demandé.",
    },
    policy,
    quote: secureDistributionQuote(policy, replacement ? 2 : 1),
    approved: false,
    approval: null,
    approvalUrl: null,
    recipientBinding: "unclaimed",
    pendingClaim: null,
    recipientUserId: null,
    expiresAt: null,
    audit: [],
    renewal: {
      expiresAt:
        replacement || mode === "race"
          ? "2099-10-27T12:00:00Z"
          : "2020-10-27T12:00:00Z",
      replacementId: !replacement && renewed ? "sd_renewed" : null,
      available: true,
    },
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== "GET")
      writes.push({ path, body: request.postDataJSON() });
    if (path.endsWith("/approve")) {
      await route.fulfill({
        status: 409,
        json: {
          error: {
            code: "LIVE_QUOTE_INVALID",
            message:
              "The quote expired or its configuration changed. Prepare a new dispatch.",
          },
        },
      });
      return;
    }
    if (path.endsWith("/renew")) {
      renewCalls++;
      if (mode === "race" && renewCalls === 1) {
        await route.fulfill({
          status: 503,
          json: {
            error: {
              code: "TEMPORARY_FAILURE",
              message: "Service temporarily unavailable.",
            },
          },
        });
        return;
      }
      renewed = true;
      await route.fulfill({ json: publication(true) });
      return;
    }
    if (/\/preview\/1$/.test(path)) {
      await route.fulfill({
        contentType: "image/png",
        body: preview,
      });
      return;
    }
    const json =
      path === "/api/session"
        ? {
            organization: { id: "org_recovery", name: "Atelier de contrôle" },
            user: {
              id: "user_recovery",
              name: "Camille",
              role: "admin",
              preferredLocale: "fr",
            },
            simulation: false,
            csrfToken: "fixture-only",
          }
        : path === "/api/capabilities"
          ? {}
          : path === "/api/secure-distributions/catalog"
            ? secureDistributionCatalog("verified_account")
            : path === "/api/secure-distributions"
              ? { items: [publication(false)], nextCursor: null }
              : path.startsWith("/api/secure-distributions/")
                ? publication(path.includes("sd_renewed"))
                : path === "/api/documents"
                  ? { items: [source], nextCursor: null }
                  : path === "/api/senders"
                    ? {
                        items: [
                          {
                            id: "sender_recovery",
                            channel: "email",
                            name: "Camille",
                            email: "sender@example.invalid",
                          },
                        ],
                      }
                    : {};
    await route.fulfill({ json });
  });
  return writes;
}

const approve = (page: Page) =>
  page.getByRole("button", { name: /^Envoyer pour /u });
const refreshQuote = (page: Page) =>
  page.getByRole("button", { name: "Actualiser le devis", exact: true });

for (const appearance of ["classic", "v2"] as const) {
  test(`${appearance} expired secure quote resumes with fresh unchecked approval`, async ({
    page,
  }) => {
    const writes = await fixture(page);
    await page.goto(
      `/?appearance=${appearance}#/app/secure-distribution/sd_original`,
    );
    await expect(refreshQuote(page)).toBeVisible();
    await expect(approve(page)).toBeDisabled();
    await expect(
      page.getByText("LIVE_QUOTE_INVALID", { exact: true }),
    ).toHaveCount(0);
    await refreshQuote(page).click();
    await expect(page).toHaveURL(/#\/app\/secure-distribution\/sd_renewed$/);
    await expect(page.getByRole("checkbox")).toHaveCount(2);
    for (const checkbox of await page.getByRole("checkbox").all())
      await expect(checkbox).not.toBeChecked();
    await expect(approve(page)).toBeDisabled();
    await expect(refreshQuote(page)).toHaveCount(0);
    expect(writes).toEqual([
      { path: "/api/secure-distributions/sd_original/renew", body: {} },
    ]);
  });
}

test("secure quote expiry during approval permits a failed renewal to be retried without sending", async ({
  page,
}) => {
  const writes = await fixture(page, "race");
  await page.goto("/?appearance=v2#/app/secure-distribution/sd_original");
  await expect(page.getByRole("checkbox")).toHaveCount(2);
  for (const checkbox of await page.getByRole("checkbox").all())
    await checkbox.check();
  await approve(page).click();
  await expect(refreshQuote(page)).toBeVisible();
  await expect(
    page.getByText("LIVE_QUOTE_INVALID", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      "The quote expired or its configuration changed. Prepare a new dispatch.",
    ),
  ).toHaveCount(0);
  for (const checkbox of await page.getByRole("checkbox").all())
    await expect(checkbox).not.toBeChecked();
  await refreshQuote(page).click();
  await expect(refreshQuote(page)).toBeEnabled();
  await refreshQuote(page).click();
  await expect(page).toHaveURL(/sd_renewed$/);
  expect(writes.map((write) => write.path)).toEqual([
    "/api/secure-distributions/sd_original/approve",
    "/api/secure-distributions/sd_original/renew",
    "/api/secure-distributions/sd_original/renew",
  ]);
});

test("an existing replacement resumes its review with no new write", async ({
  page,
}) => {
  const writes = await fixture(page, "replacement");
  await page.goto("/?appearance=v2#/app/secure-distribution/sd_original");
  const resume = page.locator('a[href="#/app/secure-distribution/sd_renewed"]');
  await expect(resume).toBeVisible();
  await resume.click();
  await expect(page).toHaveURL(/sd_renewed$/);
  expect(writes).toEqual([]);
});

for (const theme of ["light", "dark"] as const) {
  test(`V2 secure distribution uses shared surfaces in ${theme}`, async ({
    page,
  }, testInfo) => {
    await fixture(page);
    await page.emulateMedia({ colorScheme: theme });
    for (const route of [
      "secure-distributions",
      "secure-distributions/new",
      "secure-distribution/sd_original",
    ]) {
      await page.goto("about:blank");
      await page.goto(`/?appearance=v2#${"/app/" + route}`);
      await expect(
        page.locator(".workspace-v2 .secure-document-layout"),
      ).toBeVisible();
      await expect(page.locator(".secure-document-layout h1")).toBeVisible();
      await expect(
        page.locator(".secure-document-layout .loading"),
      ).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await expect(
        page.locator(".secure-document-panel, .secure-document-list").first(),
      ).toBeVisible();
      const firstUsefulContentMs = await page.evaluate(() => performance.now());
      const headings = page.locator(".secure-document-panel h2");
      for (const heading of await headings.all()) {
        const computed = await heading.evaluate((node) => ({
          size: getComputedStyle(node).fontSize,
          family: getComputedStyle(node).fontFamily,
          body: getComputedStyle(document.body)
            .getPropertyValue("--font-body")
            .trim(),
        }));
        expect(parseFloat(computed.size)).toBeLessThanOrEqual(20);
        expect(computed.family.toLowerCase()).not.toContain("garamond");
      }
      if (route.endsWith("sd_original"))
        await expect(page.locator(".secure-document-page img")).toBeVisible();
      if (route.endsWith("/new")) {
        await expect(
          page.frameLocator(".email-preview").locator("body"),
        ).toContainText(
          "Atelier de contrôle vous a adressé un document dans Guteneo.",
        );
        await page.locator(".email-preview").scrollIntoViewIfNeeded();
      }
      const resources = await page.evaluate(() =>
        performance.getEntriesByType("resource").map((entry) => {
          const item = entry as PerformanceResourceTiming;
          return {
            path: new URL(item.name).pathname,
            bytes: item.transferSize,
            decoded: item.decodedBodySize,
          };
        }),
      );
      await testInfo.attach(
        `${theme}-${route.replaceAll("/", "-")}-loading.json`,
        {
          contentType: "application/json",
          body: JSON.stringify({
            environment: "Local Chromium/WebKit with intercepted synthetic API",
            firstUsefulContentMs,
            requests: resources.length,
            transferredBytes: resources.reduce(
              (sum, item) => sum + item.bytes,
              0,
            ),
            resources,
          }),
        },
      );
      await testInfo.attach(`${theme}-${route.replaceAll("/", "-")}.png`, {
        contentType: "image/png",
        body: await page.screenshot({ fullPage: true }),
      });
    }
  });
}
