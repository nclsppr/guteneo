import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { secureDistributionQuote } from "../../packages/contracts/src/secure-distribution";

test.use({ trace: "off" });

type Mode =
  | "normal"
  | "approved"
  | "approval_lost"
  | "activation_lost"
  | "activation_uncommitted";
async function fixture(page: Page, mode: Mode = "normal", simulation = false) {
  const preview = await readFile(
    new URL("../fixtures/secure-review.png", import.meta.url),
  );
  const writes: {
    operation: string;
    key: string | undefined;
    body: unknown;
  }[] = [];
  let approved = mode === "approved",
    active = false,
    reads = 0;
  const policy = {
    retentionDays: 30 as const,
    allowOriginalDownload: false,
    allowVaultDeposit: false,
    personalRetentionDays: 365 as const,
    recipientBinding: "verified_email" as const,
  };
  const publication = () => ({
    id: "sd_single_action",
    dispatchId: "dispatch_single_action",
    status: active ? "active" : "prepared",
    title: "Synthetic review.pdf",
    source: {
      id: "doc_single_action",
      name: "Synthetic review.pdf",
      pages: 1,
      sha256: "a".repeat(64),
    },
    recipient: { address: "synthetic-recipient@example.invalid" },
    invitation: {
      subject: "Synthetic requested document",
      message: "Synthetic invitation",
    },
    policy,
    quote: secureDistributionQuote(policy, 1),
    approved,
    approval: approved
      ? { fingerprint: "b".repeat(64), expiresAt: "2099-10-27T12:00:00Z" }
      : null,
    approvalUrl: null,
    recipientBinding: "pending",
    pendingClaim: null,
    recipientUserId: null,
    expiresAt: active ? "2099-11-27T12:00:00Z" : null,
    audit: [],
    renewal: {
      expiresAt: "2099-10-27T12:00:00Z",
      replacementId: null,
      available: !active,
    },
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (
      path === "/api/secure-distributions/sd_single_action" &&
      request.method() === "GET"
    ) {
      reads++;
      await route.fulfill({ json: publication() });
      return;
    }
    if (request.method() !== "GET") {
      const operation = path.split("/").at(-1)!;
      writes.push({
        operation,
        key: request.headers()["idempotency-key"],
        body: request.postDataJSON(),
      });
      if (operation === "approve") {
        approved = true;
        if (mode === "approval_lost" && writes.length === 1) {
          await route.abort("failed");
          return;
        }
      } else if (operation === "activate") {
        const attempt = writes.filter(
          (write) => write.operation === "activate",
        ).length;
        active = !(mode === "activation_uncommitted" && attempt === 1);
        if (
          (mode === "activation_lost" || mode === "activation_uncommitted") &&
          attempt === 1
        ) {
          await route.abort("failed");
          return;
        }
      } else throw new Error("Unexpected mutation in secure-send fixture");
      await route.fulfill({ json: publication() });
      return;
    }
    if (/\/preview\/1$/.test(path)) {
      await route.fulfill({ contentType: "image/png", body: preview });
      return;
    }
    await route.fulfill({
      json:
        path === "/api/session"
          ? {
              organization: {
                id: "org_single_action",
                name: "Synthetic workshop",
              },
              user: {
                id: "user_single_action",
                name: "Synthetic administrator",
                role: "admin",
                preferredLocale: "fr",
              },
              simulation,
              verifiedAccount: true,
              csrfToken: "synthetic-fixture-only",
            }
          : {},
    });
  });
  return { writes, reads: () => reads };
}

const send = (page: Page) =>
  page.getByRole("button", { name: /^Envoyer pour /u });
const checkStatus = (page: Page) =>
  page.getByRole("button", { name: "Vérifier le suivi", exact: true });
const activeShare = (page: Page) =>
  page.getByRole("button", { name: "Révoquer ce partage", exact: true });
async function review(page: Page) {
  const checkboxes = page.getByRole("checkbox");
  await expect(checkboxes).toHaveCount(2);
  await expect(send(page)).toBeDisabled();
  await checkboxes.nth(0).check();
  await expect(send(page)).toBeDisabled();
  await checkboxes.nth(1).check();
  await expect(send(page)).toBeEnabled();
}

test("one priced action records review and sends without an intermediate refresh or modal", async ({
  page,
}, testInfo) => {
  const f = await fixture(page);
  await page.goto("/?appearance=v2#/app/secure-distribution/sd_single_action");
  await expect(send(page)).toHaveText(/Envoyer pour 1,00\s*€ HT/u);
  await expect(page.locator(".secure-document-page img")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(f.writes).toEqual([]);
  const firstUsefulContentMs = await page.evaluate(() => performance.now());
  await review(page);
  await testInfo.attach("secure-send-review", {
    contentType: "image/png",
    body: await page.screenshot({ fullPage: true }),
  });
  await send(page).click();
  await expect(activeShare(page)).toBeVisible();
  await expect(send(page)).toHaveCount(0);
  expect(f.writes).toEqual([
    {
      operation: "approve",
      key: "sd_single_action:approve",
      body: { reviewed: true, recipientRequested: true },
    },
    { operation: "activate", key: "sd_single_action:activate", body: {} },
  ]);
  expect(f.reads()).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const resources = await page.evaluate(() => {
    const requests = performance.getEntriesByType(
      "resource",
    ) as PerformanceResourceTiming[];
    return {
      requests: requests.length,
      transferredBytes: requests.reduce(
        (sum, request) => sum + request.transferSize,
        0,
      ),
    };
  });
  await testInfo.attach("secure-send-local-performance", {
    contentType: "application/json",
    body: JSON.stringify({
      environment: "local intercepted API; real built web application",
      firstUsefulContentMs,
      ...resources,
      mutations: f.writes.length,
      detailReads: f.reads(),
    }),
  });
});

test("a legacy browser-approved preparation retains its PDF review and sends in one explicit action", async ({
  page,
}) => {
  const f = await fixture(page, "approved");
  await page.goto(
    "/?appearance=classic#/app/secure-distribution/sd_single_action",
  );
  await expect(page.locator(".secure-document-page img")).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(send(page)).toBeEnabled();
  expect(f.writes).toEqual([]);
  await send(page).click();
  await expect(activeShare(page)).toBeVisible();
  await expect(send(page)).toHaveCount(0);
  expect(f.writes.map((write) => write.operation)).toEqual(["activate"]);
});

test("an uncertain approval requires a status read and never records approval twice", async ({
  page,
}) => {
  const f = await fixture(page, "approval_lost");
  await page.goto("/?appearance=v2#/app/secure-distribution/sd_single_action");
  await review(page);
  await send(page).click();
  await expect(checkStatus(page)).toBeVisible();
  await expect(send(page)).toBeDisabled();
  expect(f.writes.map((write) => write.operation)).toEqual(["approve"]);
  await checkStatus(page).click();
  await expect(checkStatus(page)).toHaveCount(0);
  await expect(send(page)).toBeEnabled();
  expect(f.writes.map((write) => write.operation)).toEqual(["approve"]);
  await send(page).click();
  await expect(activeShare(page)).toBeVisible();
  await expect(send(page)).toHaveCount(0);
  expect(f.writes.map((write) => write.operation)).toEqual([
    "approve",
    "activate",
  ]);
});

test("an accepted activation with a lost reply is recovered by reading status without a second send", async ({
  page,
}) => {
  const f = await fixture(page, "activation_lost");
  await page.goto("/?appearance=v2#/app/secure-distribution/sd_single_action");
  await review(page);
  await send(page).click();
  await expect(checkStatus(page)).toBeVisible();
  await expect(send(page)).toBeDisabled();
  await checkStatus(page).click();
  await expect(activeShare(page)).toBeVisible();
  await expect(checkStatus(page)).toHaveCount(0);
  await expect(send(page)).toHaveCount(0);
  await page.reload();
  await expect(activeShare(page)).toBeVisible();
  await expect(send(page)).toHaveCount(0);
  expect(f.writes.map((write) => write.operation)).toEqual([
    "approve",
    "activate",
  ]);
});

test("an uncommitted activation resumes explicitly with the same idempotency key after checking status", async ({
  page,
}) => {
  const f = await fixture(page, "activation_uncommitted");
  await page.goto("/?appearance=v2#/app/secure-distribution/sd_single_action");
  await review(page);
  await send(page).click();
  await expect(checkStatus(page)).toBeVisible();
  await checkStatus(page).click();
  await expect(send(page)).toBeEnabled();
  expect(f.writes.map((write) => write.operation)).toEqual([
    "approve",
    "activate",
  ]);
  await send(page).click();
  await expect(activeShare(page)).toBeVisible();
  await expect(send(page)).toHaveCount(0);
  const activations = f.writes.filter(
    (write) => write.operation === "activate",
  );
  expect(activations).toHaveLength(2);
  expect(activations[0].key).toBe("sd_single_action:activate");
  expect(activations[1]).toEqual(activations[0]);
});

test("the simulation action stays explicitly labelled and never submits on page refresh", async ({
  page,
}) => {
  const f = await fixture(page, "normal", true);
  await page.goto("/?appearance=v2#/app/secure-distribution/sd_single_action");
  await expect(
    page.getByRole("button", { name: /^Simuler l’envoi pour /u }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByRole("button", { name: /^Simuler l’envoi pour /u }),
  ).toBeDisabled();
  expect(f.writes).toEqual([]);
});
