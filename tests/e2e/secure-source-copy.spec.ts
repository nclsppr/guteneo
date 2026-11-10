import { expect, test, type Page } from "@playwright/test";
import { expectUnreviewedServerError } from "../helpers/browser-error-notice";
import {
  secureDistributionCatalog,
  secureDistributionQuote,
} from "../../packages/contracts/src/secure-distribution";

const original = {
  id: "doc_original",
  name: "Correspondence.pdf",
  sha256: "a".repeat(64),
  size: 500,
  pages: 1,
  status: "ready",
  source: "upload",
  created_at: "2026-11-05T10:00:00Z",
};
const copied = {
  ...original,
  id: "doc_copy",
  secure_copy_source_id: original.id,
};
const other = { ...original, id: "doc_other", name: "Other.pdf" };
type Write = {
  path: string;
  body: Record<string, unknown>;
  key: string | null;
};
type Composer = "secure" | "email";

async function fixture(
  page: Page,
  options: {
    locale?: "fr" | "en" | "de" | "lb";
    code?: string;
    failedCopies?: number;
    copyFailureCode?: string;
    copyFailureMessage?: string;
    copyReady?: Promise<void>;
  } = {},
) {
  const writes: Write[] = [];
  const reads: string[] = [];
  let copyCalls = 0;
  const policy = {
    retentionDays: 90 as const,
    allowOriginalDownload: true,
    allowVaultDeposit: false,
    personalRetentionDays: 365 as const,
    recipientBinding: "verified_email" as const,
  };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET") reads.push(path);
    else
      writes.push({
        path,
        body: request.postDataJSON(),
        key: request.headers()["idempotency-key"] ?? null,
      });
    if (path.endsWith("/secure-copy")) {
      copyCalls++;
      if (copyCalls <= (options.failedCopies ?? 0)) {
        await route.fulfill({
          status: 503,
          json: {
            error: {
              code: options.copyFailureCode ?? "TEMPORARY_FAILURE",
              message:
                options.copyFailureMessage ??
                "Service temporarily unavailable.",
            },
          },
        });
        return;
      }
      await options.copyReady;
      await route.fulfill({ json: copied });
      return;
    }
    if (path === "/api/secure-distributions" && request.method() === "POST") {
      if (request.postDataJSON().documentId === original.id)
        await route.fulfill({
          status: 409,
          json: {
            error: {
              code: options.code ?? "SECURE_SOURCE_LEGACY_OUTBOUND",
              message: "Use a dedicated document.",
            },
          },
        });
      else await route.fulfill({ json: { id: "sd_copied" } });
      return;
    }
    const json =
      path === "/api/session"
        ? {
            organization: { id: "org_copy", name: "Copy workspace" },
            user: {
              id: "user_copy",
              name: "Camille",
              role: "admin",
              preferredLocale: options.locale ?? "en",
            },
            simulation: false,
            csrfToken: "fixture-only",
          }
        : path === "/api/capabilities"
          ? {}
          : path === "/api/documents"
            ? { items: [original, other], nextCursor: null }
            : path === "/api/secure-distributions/catalog"
              ? secureDistributionCatalog("verified_account")
              : path === "/api/senders"
                ? {
                    items: [
                      {
                        id: "sender_copy",
                        channel: "email",
                        email: "sender@example.invalid",
                        status: "verified",
                      },
                    ],
                  }
                : path === "/api/secure-distributions/sd_copied"
                  ? {
                      id: "sd_copied",
                      status: "preparing",
                      source: copied,
                      recipient: { address: "recipient@example.invalid" },
                      invitation: {
                        subject: "Invitation",
                        message: "Please review.",
                      },
                      policy,
                      quote: secureDistributionQuote(policy, 1),
                      approved: false,
                      approval: null,
                      approvalUrl: null,
                      recipientBinding: "unclaimed",
                      pendingClaim: null,
                      recipientUserId: null,
                      expiresAt: null,
                      audit: [],
                    }
                  : {};
    await route.fulfill({ json });
  });
  return { writes, reads };
}

function documentSelect(page: Page, composer: Composer) {
  return composer === "secure"
    ? page.getByLabel("Verified PDF", { exact: true })
    : page.locator(".prepare-fields select").first();
}
function prepareButton(page: Page, composer: Composer) {
  return page.getByRole("button", {
    name:
      composer === "secure" ? "Prepare and review share" : "Check and prepare",
    exact: true,
  });
}
const copyButton = (page: Page) =>
  page.getByRole("button", {
    name: "Create a copy for this secure share",
    exact: true,
  });

async function fill(page: Page, composer: Composer) {
  await page.goto(
    composer === "secure"
      ? "/#/app/secure-distributions/new"
      : "/#/app/prepare?channel=email",
  );
  await expect(documentSelect(page, composer)).toBeVisible();
  const firstUsefulFormMs = await page.evaluate(() => performance.now());
  await documentSelect(page, composer).selectOption(original.id);
  await page
    .getByLabel(
      composer === "secure" ? "Recipient email address" : "Email address",
      { exact: true },
    )
    .fill("recipient@example.invalid");
  if (composer === "secure")
    await page.getByLabel("Recipient name", { exact: true }).fill("Alex");
  await page
    .getByLabel("Subject (optional)", { exact: true })
    .fill("Invitation");
  await page
    .getByLabel("Message (optional)", { exact: true })
    .fill("Please review the document.");
  await page
    .getByLabel(
      composer === "secure" ? "Shared access term" : "Access period",
      { exact: true },
    )
    .selectOption("90");
  await page
    .getByRole("checkbox", { name: /^Allow download of the original PDF/u })
    .check();
  await page.locator(".email-advanced summary").click();
  await page
    .getByLabel("HTML version", { exact: true })
    .fill('<p>Custom invitation.</p><a href="{{document_url}}">Open</a>');
  return { firstUsefulFormMs };
}

for (const composer of ["secure", "email"] as const) {
  test(`${composer} creates a separate source only on request and preserves the complete share draft`, async ({
    page,
  }, testInfo) => {
    const { writes, reads } = await fixture(page);
    const { firstUsefulFormMs } = await fill(page, composer);
    const readsBeforeRecovery = [...reads];
    expect(writes).toEqual([]);
    await prepareButton(page, composer).click();
    await expect(copyButton(page)).toBeVisible();
    await expect(
      page.getByText(
        "The copy contains the same PDF. It does not change earlier deliveries or recall copies already received.",
        { exact: true },
      ),
    ).toBeVisible();
    expect(writes).toHaveLength(1);
    await testInfo.attach(`${composer}-copy-recovery`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
    await copyButton(page).click();
    await expect(documentSelect(page, composer)).toHaveValue(copied.id);
    await expect(
      documentSelect(page, composer).locator("option:checked"),
    ).toContainText("Correspondence.pdf — secure copy");
    await expect(
      page.getByText(
        "Copy selected. Prepare and review the share to continue.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByLabel("Subject (optional)", { exact: true }),
    ).toHaveValue("Invitation");
    await expect(
      page.getByLabel("Message (optional)", { exact: true }),
    ).toHaveValue("Please review the document.");
    expect(writes.map((write) => write.path)).toEqual([
      "/api/secure-distributions",
      `/api/documents/${original.id}/secure-copy`,
    ]);
    expect(reads).toEqual(readsBeforeRecovery);
    await expect(page).toHaveURL(
      /\/app\/(secure-distributions\/new|prepare\?channel=email)$/,
    );
    await testInfo.attach(`${composer}-copy-selected`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
    const metrics = await page.evaluate(() => {
      const entries = performance.getEntriesByType(
        "resource",
      ) as PerformanceResourceTiming[];
      const javascript = entries.filter((entry) =>
        new URL(entry.name).pathname.endsWith(".js"),
      );
      return {
        resourceCount: entries.length,
        javascriptEncodedBytes: javascript.reduce(
          (sum, entry) => sum + entry.encodedBodySize,
          0,
        ),
        javascriptTransferredBytes: javascript.reduce(
          (sum, entry) => sum + entry.transferSize,
          0,
        ),
        firstContentfulPaintMs:
          performance.getEntriesByName("first-contentful-paint")[0]
            ?.startTime ?? null,
      };
    });
    await testInfo.attach(`${composer}-copy-performance`, {
      body: JSON.stringify(
        {
          ...metrics,
          firstUsefulFormMs,
          readsBeforeRecovery,
          readsAfterCopy: reads,
          writesBeforeExplicitPreparation: writes.map((write) => write.path),
        },
        null,
        2,
      ),
      contentType: "application/json",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await prepareButton(page, composer).click();
    await expect(page).toHaveURL(/\/app\/secure-distribution\/sd_copied$/);
    expect(writes).toHaveLength(3);
    expect(writes[2]?.body).toEqual({
      ...writes[0]!.body,
      documentId: copied.id,
    });
    expect(writes[2]?.key).not.toBe(writes[0]?.key);
    expect(writes[1]?.body).toEqual({});
  });
}

test("copy failure retries the same operation and blocks duplicate clicks", async ({
  page,
}) => {
  let releaseCopy!: () => void;
  const ready = new Promise<void>((resolve) => {
    releaseCopy = resolve;
  });
  const { writes } = await fixture(page, { failedCopies: 1, copyReady: ready });
  await fill(page, "secure");
  await prepareButton(page, "secure").click();
  await copyButton(page).click();
  await expectUnreviewedServerError(
    page.getByRole("alert").filter({ hasText: "TEMPORARY_FAILURE" }),
    "TEMPORARY_FAILURE",
    "Service temporarily unavailable.",
  );
  await expect(copyButton(page)).toBeEnabled();
  await copyButton(page).evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(
    page.getByRole("button", { name: "Creating copy…", exact: true }),
  ).toBeDisabled();
  await expect(prepareButton(page, "secure")).toBeDisabled();
  await expect.poll(() => writes.length).toBe(3);
  expect(writes[1]?.key).toBeTruthy();
  expect(writes[2]?.key).toBe(writes[1]?.key);
  releaseCopy();
  await expect(documentSelect(page, "secure")).toHaveValue(copied.id);
  expect(writes).toHaveLength(3);
});

test("changing the source discards recovery and an in-flight copy never replaces the new selection", async ({
  page,
}) => {
  let releaseCopy!: () => void;
  const { writes } = await fixture(page, {
    copyReady: new Promise<void>((resolve) => {
      releaseCopy = resolve;
    }),
  });
  await fill(page, "secure");
  await prepareButton(page, "secure").click();
  await copyButton(page).click();
  await expect.poll(() => writes.length).toBe(2);
  await documentSelect(page, "secure").selectOption(other.id);
  await expect(
    page.getByText("Use a separate copy for this share", { exact: true }),
  ).toHaveCount(0);
  releaseCopy();
  await expect(prepareButton(page, "secure")).toBeEnabled();
  await expect(documentSelect(page, "secure")).toHaveValue(other.id);
  await expect(
    page.getByText("Copy selected. Prepare and review the share to continue.", {
      exact: true,
    }),
  ).toHaveCount(0);
  expect(writes).toHaveLength(2);
});

test("switching email delivery mode clears copy recovery and its previous error", async ({
  page,
}) => {
  const { writes } = await fixture(page, { failedCopies: 1 });
  await fill(page, "email");
  await prepareButton(page, "email").click();
  await copyButton(page).click();
  const copyFailure = page
    .getByRole("alert")
    .filter({ hasText: "TEMPORARY_FAILURE" });
  await expectUnreviewedServerError(
    copyFailure,
    "TEMPORARY_FAILURE",
    "Service temporarily unavailable.",
  );
  await page
    .getByLabel("Document access", { exact: true })
    .selectOption("attachment");
  await expect(copyButton(page)).toHaveCount(0);
  await expect(copyFailure).toHaveCount(0);
  await expect(documentSelect(page, "email")).toHaveValue(original.id);
  expect(writes).toHaveLength(2);
});

for (const [locale, label, unavailable] of [
  [
    "fr",
    "Créer une copie pour ce partage sécurisé",
    "La copie sécurisée n’est pas encore disponible. Réessayez après la mise à jour de l’application.",
  ],
  [
    "en",
    "Create a copy for this secure share",
    "Secure document copying is not available yet. Try again after the application update.",
  ],
  [
    "de",
    "Kopie für diese sichere Freigabe erstellen",
    "Das Erstellen sicherer Dokumentkopien ist noch nicht verfügbar. Versuchen Sie es nach der Aktualisierung der Anwendung erneut.",
  ],
  [
    "lb",
    "Eng Kopie fir dëst séchert Deelen erstellen",
    "D’Erstelle vu sécheren Dokumentkopien ass nach net disponibel. Probéiert et no der Aktualiséierung vun der Applikatioun nach eng Kéier.",
  ],
] as const) {
  test(`secure source recovery is localized in ${locale}`, async ({ page }) => {
    await fixture(page, {
      locale,
      code:
        locale === "fr"
          ? "SECURE_SOURCE_LEGACY_LINK"
          : "SECURE_SOURCE_LEGACY_DERIVATION",
      failedCopies: 1,
      copyFailureCode: "SECURE_COPY_NOT_AVAILABLE",
      copyFailureMessage:
        "Secure document copying is not available yet. Try again after the application update.",
    });
    await page.goto("/#/app/secure-distributions/new");
    await page
      .locator(".secure-distribution-composer select")
      .first()
      .selectOption(original.id);
    await page
      .locator('.secure-distribution-composer input[type="email"]')
      .fill("recipient@example.invalid");
    await page
      .locator('.secure-distribution-composer button[type="submit"]')
      .click();
    await expect(
      page.getByRole("button", { name: label, exact: true }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByText("Use a dedicated document.", { exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(page.getByText(unavailable, { exact: true })).toBeVisible();
  });
}
