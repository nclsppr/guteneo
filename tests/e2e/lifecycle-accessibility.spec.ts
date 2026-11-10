import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

type Locale = "fr" | "en" | "de" | "lb";
type Theme = "light" | "dark";
type RuntimeLocale = {
  copy: { overview: { title: string } };
  messages: Record<string, number | string>;
  strings: string[];
};
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const now = "2026-11-09T12:00:00.000Z";

function copy(locale: Locale) {
  const data = JSON.parse(
    readFileSync(
      new URL(
        `../../apps/web/src/locales/runtime/${locale}.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  ) as RuntimeLocale;
  return {
    overview: data.copy.overview.title,
    message(source: string) {
      const value = data.messages[source];
      const translated =
        typeof value === "number"
          ? data.strings[value]
          : (value ?? (locale === "en" ? source : undefined));
      if (!translated)
        throw new Error(`The ${locale} runtime catalog lacks ${source}`);
      return translated;
    },
  };
}

async function fixture(page: Page, locale: Locale, theme: Theme) {
  await page.emulateMedia({ colorScheme: theme });
  await page.addInitScript((preference) => {
    localStorage.setItem("guteneo.theme", preference);
  }, theme);
  const dispatch = {
    id: "dispatch_accessibility",
    channel: "email",
    recipient_json: { email: "synthetic-reader@example.invalid" },
    sender_address: "synthetic-sender@example.invalid",
    subject: "Synthetic frozen subject",
    text: "Synthetic frozen message for interface accessibility checks.",
    status: "prepared",
    mode: "production",
    estimated_minor: 24,
    ceiling_minor: 500,
    currency: "EUR",
    fingerprint: "a".repeat(64),
    created_at: now,
    updated_at: now,
  };
  const recipient = {
    id: "recipient_accessibility",
    label: "Synthetic saved recipient",
    channel: "email",
    recipient: { email: "synthetic-reader@example.invalid" },
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
  const recipients = [recipient];
  const endpoints: Record<string, unknown>[] = [];
  let releaseRecipient!: () => void,
    recipientPending = false;
  const recipientGate = new Promise<void>((resolve) => {
    releaseRecipient = resolve;
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (path === "/api/session") {
      await route.fulfill({
        json: {
          organization: {
            id: "org_accessibility",
            name: "Synthetic accessibility workspace",
          },
          user: {
            id: "user_accessibility",
            name: "Synthetic administrator",
            email: "synthetic-admin@example.invalid",
            role: "admin",
            preferredLocale: locale,
          },
          csrfToken: "synthetic-only",
          simulation: false,
          verifiedAccount: true,
        },
      });
      return;
    }
    if (path === "/api/capabilities") {
      await route.fulfill({
        json: {
          version: "1",
          mode: "production",
          simulation: false,
          channels: [],
        },
      });
      return;
    }
    if (path === "/api/account/contacts") {
      await route.fulfill({ json: { items: [], hasMore: false } });
      return;
    }
    if (path === "/api/overview") {
      await route.fulfill({
        json: {
          documents: 0,
          dispatches: {
            total: 2,
            approval: 1,
            in_progress: 0,
            attention: 1,
            done: 0,
          },
        },
      });
      return;
    }
    if (path === "/api/attention") {
      await route.fulfill({
        json: {
          items: [
            {
              id: "attention_accessibility",
              kind: "submission_unknown",
              resourceId: "dispatch_unknown",
              route: "/app/dispatch/dispatch_unknown",
              channel: "email",
            },
            {
              id: "attention_expiry",
              kind: "quote_expiring",
              resourceId: dispatch.id,
              route: `/app/dispatch/${dispatch.id}`,
              expiresAt: new Date(Date.now() + 3600_000).toISOString(),
              channel: "email",
            },
          ],
          observedAt: now,
          nextCursor: null,
        },
      });
      return;
    }
    if (path === "/api/dispatches") {
      await route.fulfill({
        json: {
          items: [
            dispatch,
            {
              ...dispatch,
              id: "dispatch_unknown",
              status: "submission_unknown",
            },
          ],
          nextCursor: null,
        },
      });
      return;
    }
    if (path === `/api/dispatches/${dispatch.id}`) {
      await route.fulfill({
        json: { dispatch, events: [], attempts: [], approval: null },
      });
      return;
    }
    if (path === "/api/recipients" && request.method() === "GET") {
      await route.fulfill({ json: { items: recipients, nextCursor: null } });
      return;
    }
    if (path === "/api/recipients" && request.method() === "POST") {
      recipientPending = true;
      const value = {
        ...request.postDataJSON(),
        id: "recipient_saved_accessibility",
        revision: 1,
        createdAt: now,
        updatedAt: now,
      };
      recipients.push(value);
      await recipientGate;
      await route.fulfill({ json: value });
      return;
    }
    if (path.startsWith("/api/recipients/")) {
      await route.fulfill({
        json:
          recipients.find((entry) => path.endsWith(`/${entry.id}`)) ??
          recipient,
      });
      return;
    }
    if (path === "/api/dispatch-schedules/schedule_accessibility") {
      const executeAt = new Date(Date.now() + 86400_000).toISOString();
      await route.fulfill({
        json: {
          id: "schedule_accessibility",
          dispatchId: dispatch.id,
          releaseDispatchId: null,
          channel: "email",
          status: "draft",
          revision: 1,
          snapshotHash: "a".repeat(64),
          executeAt,
          releaseUntil: new Date(
            Date.parse(executeAt) + 15 * 60_000,
          ).toISOString(),
          maxTotalMinor: 500,
          currency: "EUR",
          approvalKind: null,
          approvedAt: null,
          approvedBy: null,
          errorCode: null,
          releaseEnabled: true,
          canReschedule: false,
          createdAt: now,
        },
      });
      return;
    }
    if (path === "/api/customer-webhooks" && request.method() === "GET") {
      await route.fulfill({
        json: {
          items: endpoints,
          capabilities: {
            configured: true,
            enabled: true,
            reason: null,
            endpointLimit: 5,
            pendingLimit: 500,
          },
        },
      });
      return;
    }
    if (path === "/api/customer-webhooks" && request.method() === "POST") {
      const value = {
        ...request.postDataJSON(),
        id: "webhook_accessibility",
        status: "active",
        enabled: false,
        revision: 1,
        createdAt: now,
        updatedAt: now,
        overflowCount: 0,
        deliveryCounts: {
          pending: 0,
          sending: 0,
          sent: 0,
          failed: 0,
          unknown: 1,
          superseded: 0,
        },
      };
      endpoints.push(value);
      await route.fulfill({
        json: {
          endpoint: value,
          signingSecret: "cwhsec_synthetic_accessibility_fixture_only",
        },
      });
      return;
    }
    if (path.endsWith("/deliveries")) {
      await route.fulfill({
        json: {
          items: [
            {
              id: "delivery_accessibility",
              eventId: "event_accessibility",
              endpointRevision: 1,
              dispatchId: dispatch.id,
              dispatchStatus: "submission_unknown",
              status: "unknown",
              occurredAt: now,
              finishedAt: now,
              responseStatus: null,
              errorCode: "transport_outcome_unknown",
            },
          ],
          nextCursor: null,
        },
      });
      return;
    }
    if (request.method() !== "GET") {
      await route.fulfill({
        status: 503,
        json: {
          error: {
            code: "SYNTHETIC_WRITE_NOT_EXPECTED",
            message:
              "This accessibility fixture does not execute that operation.",
          },
        },
      });
      return;
    }
    await route.fulfill({ json: { items: [], nextCursor: null } });
  });
  return { recipientPending: () => recipientPending, releaseRecipient };
}

async function navigate(page: Page, path: string, heading: string) {
  await page.evaluate((next) => {
    location.hash = `#${next}`;
  }, path);
  await expect(
    page.getByRole("heading", { name: heading, exact: true }).first(),
  ).toBeVisible();
  await expect(page.locator("main h1")).toHaveCount(1);
}

async function scan(
  page: Page,
  info: TestInfo,
  surface: string,
  locale: Locale,
  theme: Theme,
) {
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  await expect(page.locator("main [aria-busy=true]")).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  expect
    .soft(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
      `${locale}/${theme}: ${surface} stays within the viewport`,
    )
    .toBe(true);
  // Optional local visual review uses only the intercepted fictional fixture.
  if (
    process.env.GUTENEO_LIFECYCLE_VISUAL === "true" &&
    locale === "en" &&
    theme === "light"
  ) {
    await info.attach(`${surface}-visual`, {
      contentType: "image/png",
      body: await page.screenshot({ fullPage: true }),
    });
  }
  const result = await new AxeBuilder({ page }).withTags(tags).analyze();
  // Diagnostics retain rule names/selectors, never captured user values or HTML.
  const violations = result.violations.map((rule) => ({
    id: rule.id,
    impact: rule.impact,
    description: rule.description,
    targets: rule.nodes.map((node) => node.target),
  }));
  await info.attach(`${locale}-${theme}-${surface}-axe`, {
    contentType: "application/json",
    body: Buffer.from(
      JSON.stringify(
        {
          tags,
          violations,
          manualReviewRules: [
            ...new Set(result.incomplete.map((rule) => rule.id)),
          ],
        },
        null,
        2,
      ),
    ),
  });
  expect.soft(violations, `${locale}/${theme}: ${surface}`).toEqual([]);
}

for (const locale of ["fr", "en", "de", "lb"] as const) {
  for (const theme of ["light", "dark"] as const) {
    test(`${locale} ${theme}: lifecycle screens and active controls meet automated WCAG A/AA checks`, async ({
      page,
    }, info) => {
      test.setTimeout(180_000);
      const messages = copy(locale),
        state = await fixture(page, locale, theme);
      const message = messages.message;
      try {
        await page.goto("/#/app");
        await expect(
          page.getByRole("heading", { name: messages.overview, exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("heading", {
            name: message("Needs attention"),
            exact: true,
          }),
        ).toBeVisible();
        await scan(page, info, "overview-attention", locale, theme);

        await navigate(page, "/app/recipients", message("Saved recipients"));
        await expect(
          page.getByText("Synthetic saved recipient", { exact: true }),
        ).toBeVisible();
        await page.locator(".data-table__views > summary").click();
        await page
          .getByRole("textbox", { name: message("View name"), exact: true })
          .fill("Accessible sorting");
        await page
          .getByRole("button", {
            name: message("Save sort and filters"),
            exact: true,
          })
          .click();
        await scan(page, info, "recipients-saved-views", locale, theme);

        await navigate(page, "/app/recipients/new", message("New recipient"));
        await page
          .getByLabel(message("Recipient label"), { exact: true })
          .fill("Synthetic accessible contact");
        await page
          .getByLabel(message("Fax number"), { exact: true })
          .fill("+35242123456");
        await scan(page, info, "recipient-new-fax", locale, theme);
        await page
          .getByRole("combobox", { name: message("Channel"), exact: true })
          .selectOption("email");
        await page
          .getByLabel(message("Email address"), { exact: true })
          .fill("synthetic-accessibility@example.invalid");
        await scan(page, info, "recipient-new-email", locale, theme);
        await page
          .getByRole("combobox", { name: message("Channel"), exact: true })
          .selectOption("postal");
        await page
          .getByLabel(message("Postal address, one line per line"), {
            exact: true,
          })
          .fill("Synthetic reader\n12 Synthetic Street\nL-1234 Luxembourg");
        await scan(page, info, "recipient-new-postal", locale, theme);

        // A real departed-view completion populates the actual outcome tray.
        await page
          .getByRole("button", { name: message("Save recipient"), exact: true })
          .click();
        await expect.poll(state.recipientPending).toBe(true);
        await navigate(page, "/app/recipients", message("Saved recipients"));
        state.releaseRecipient();
        await expect(page.locator(".action-outcomes__count")).toHaveText("1");
        await page.locator(".action-outcomes > summary").click();
        await expect(page.locator(".action-outcomes__panel")).toBeVisible();
        await scan(page, info, "action-outcome-tray", locale, theme);
        await page.locator(".action-outcomes > summary").click();
        await page
          .locator("button[aria-keyshortcuts='Control+K Meta+K']")
          .click();
        await expect(page.locator("dialog.command-palette")).toBeVisible();
        await expect(
          page.locator(".command-palette [role=option]").first(),
        ).toBeVisible();
        await scan(page, info, "command-palette", locale, theme);
        await page.keyboard.press("Escape");
        await expect(page.locator("dialog.command-palette")).not.toBeVisible();

        await navigate(
          page,
          "/app/schedules/schedule_accessibility",
          message("Scheduled dispatches"),
        );
        await expect(
          page.getByRole("heading", {
            name: message("Frozen dispatch"),
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByRole("heading", {
            name: message("Separate future approval"),
            exact: true,
          }),
        ).toBeVisible();
        const checks = page.locator(".lifecycle-form input[type=checkbox]");
        await checks.nth(0).check();
        await checks.nth(1).check();
        await expect(
          page.getByRole("button", {
            name: message("Approve scheduled spending"),
            exact: true,
          }),
        ).toBeEnabled();
        await scan(page, info, "schedule-future-approval", locale, theme);

        await navigate(
          page,
          "/app/administration/webhooks",
          message("Customer webhooks"),
        );
        const form = page.locator("section").filter({
          has: page.getByRole("heading", {
            name: message("New endpoint"),
            exact: true,
          }),
        });
        await form
          .getByLabel(message("Endpoint name"), { exact: true })
          .fill("Callback accessibility");
        await form
          .getByLabel(message("HTTPS endpoint"), { exact: true })
          .fill("https://callback.synthetic-customer.org/events");
        await form
          .getByRole("button", {
            name: message("Create endpoint and show signing secret"),
            exact: true,
          })
          .click();
        await expect(page.locator(".lifecycle-secret input")).toHaveValue(
          "cwhsec_synthetic_accessibility_fixture_only",
        );
        await expect(
          page.getByRole("heading", {
            name: "Callback accessibility",
            exact: true,
          }),
        ).toBeVisible();
        await page.locator(".lifecycle-endpoint details > summary").click();
        await page
          .getByRole("button", {
            name: message("Webhook deliveries"),
            exact: true,
          })
          .click();
        await expect(
          page.getByText(message("Unknown outcome, review required"), {
            exact: true,
          }),
        ).toBeVisible();
        await scan(
          page,
          info,
          "webhook-secret-controls-history",
          locale,
          theme,
        );
      } finally {
        state.releaseRecipient();
      }
    });
  }
}
