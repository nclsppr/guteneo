import { expect, test, type Page } from "@playwright/test";
import {
  FUTURE_SPENDING_ACKNOWLEDGEMENT,
  type DispatchScheduleView,
} from "../../packages/contracts/src/dispatch-schedules";

// Synthetic browser/API responses only; these tests neither activate nor send.
async function fixture(
  page: Page,
  options: {
    enabled?: boolean;
    conflict?: boolean;
    unsupported?: boolean;
    delayCreate?: boolean;
    held?: boolean;
    expired?: boolean;
  } = {},
) {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const writes: {
    path: string;
    key: string | undefined;
    body: Record<string, unknown>;
  }[] = [];
  const source = {
    id: "dsp_schedule_ui",
    channel: "email",
    mode: "simulation",
    status: "prepared",
    document_id: options.unsupported ? "doc_pdf_ui" : null,
    recipient_json: JSON.stringify({ email: "fictional@example.invalid" }),
    sender_id: "sender_ui",
    sender_address: "sender@example.invalid",
    subject: "Synthetic future message",
    html: "<p>Exact synthetic frozen content.</p>",
    text: "Exact synthetic frozen content.",
    options_json: "{}",
    activeSchedule: options.held
      ? {
          id: "sch_ui",
          status: "draft" as const,
          executeAt: new Date(Date.now() + 86400_000).toISOString(),
          maxTotalMinor: 235,
        }
      : undefined,
    estimated_minor: 1,
    ceiling_minor: 235,
    currency: "EUR",
    fingerprint: "a".repeat(64),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  let schedule: DispatchScheduleView = {
    id: "sch_ui",
    dispatchId: source.id,
    releaseDispatchId: null,
    channel: "email",
    status: "draft",
    revision: 1,
    snapshotHash: "b".repeat(64),
    executeAt: new Date(Date.now() + 86400_000).toISOString(),
    releaseUntil: new Date(Date.now() + 86400_000 + 900_000).toISOString(),
    maxTotalMinor: 235,
    currency: "EUR",
    approvalKind: null,
    approvedAt: null,
    approvedBy: null,
    errorCode: null,
    releaseEnabled: options.enabled !== false,
    canReschedule: false,
    createdAt: new Date().toISOString(),
  };
  if (options.expired) {
    schedule.executeAt = new Date(Date.now() - 16 * 60_000).toISOString();
    schedule.releaseUntil = new Date(Date.now() - 60_000).toISOString();
  }
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (request.method() !== "GET") {
      const body = request.postDataJSON() as Record<string, unknown>;
      writes.push({ path, key: request.headers()["idempotency-key"], body });
      if (path === "/api/dispatch-schedules") {
        if (options.delayCreate) await pending;
        schedule = {
          ...schedule,
          executeAt: String(body.executeAt),
          releaseUntil: new Date(
            Date.parse(String(body.executeAt)) + 900_000,
          ).toISOString(),
          maxTotalMinor: Number(body.maxTotalMinor),
        };
        await route.fulfill({ status: 201, json: schedule });
        return;
      }
      if (path.endsWith("/approve")) {
        if (options.conflict) {
          await route.fulfill({
            status: 409,
            json: {
              error: {
                code: "SCHEDULE_CHANGED",
                message: "Synthetic schedule changed; refresh required.",
              },
            },
          });
          return;
        }
        source.status = "cancelled";
        schedule = {
          ...schedule,
          revision: 2,
          status: "approved",
          approvalKind: "future_browser",
          approvedAt: new Date().toISOString(),
          approvedBy: "user_schedule",
        };
        await route.fulfill({ json: schedule });
        return;
      }
      if (path.endsWith("/cancel")) {
        schedule = {
          ...schedule,
          revision: schedule.revision + 1,
          status: "cancelled",
        };
        await route.fulfill({ json: schedule });
        return;
      }
    }
    await route.fulfill({
      json:
        path === "/api/session"
          ? {
              organization: {
                id: "org_schedule",
                name: "Synthetic schedule workspace",
              },
              user: {
                id: "user_schedule",
                name: "Synthetic administrator",
                role: "admin",
                preferredLocale: "en",
              },
              csrfToken: "synthetic-only",
              simulation: true,
            }
          : path === "/api/capabilities"
            ? {
                mode: "simulation",
                simulation: true,
                scheduledDispatches: {
                  enabled: options.enabled !== false,
                  supported: ["fax", "message_only_email"],
                  unsupported: [
                    "postal",
                    "pdf_email",
                    "protected_link",
                    "secure_distribution",
                  ],
                  horizonDays: 30,
                  releaseWindowMinutes: 15,
                  approvalKind: "future_browser",
                  approvalSurface: "browser_only",
                },
              }
            : path === `/api/dispatches/${source.id}`
              ? {
                  dispatch: source,
                  events: [],
                  attempts: [],
                  ...(source.activeSchedule
                    ? { activeSchedule: source.activeSchedule }
                    : {}),
                  approval: null,
                }
              : path === "/api/dispatches"
                ? { items: [source], nextCursor: null }
                : path === "/api/dispatch-schedules/sch_ui"
                  ? schedule
                  : path === "/api/dispatch-schedules"
                    ? { items: [schedule], nextCursor: null }
                    : { items: [], nextCursor: null },
    });
  });
  return { writes, release, source, schedule: () => schedule };
}
async function fillSchedule(page: Page) {
  const time = await page.evaluate(() => {
    const date = new Date(Date.now() + 86400_000);
    date.setSeconds(0, 0);
    const value = date.toISOString().slice(0, 16);
    return { value, instant: new Date(`${value}:00.000Z`).toISOString() };
  });
  await page.getByLabel("Dispatch time", { exact: true }).fill(time.value);
  await page
    .getByLabel("Maximum total cost in euros excluding tax", { exact: true })
    .fill("2.35");
  return time.instant;
}

test("an unsaved schedule requires discard before navigation and Escape preserves its cap", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/#/app/schedules/new?dispatch=dsp_schedule_ui");
  await fillSchedule(page);
  const leave = () =>
    page.evaluate(() => {
      window.location.hash = "/app/schedules/sch_ui";
    });
  await leave();
  const dialog = page.locator("dialog.navigation-confirmation");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  expect(state.writes).toEqual([]);
  await dialog.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(
    page.getByLabel("Maximum total cost in euros excluding tax", {
      exact: true,
    }),
  ).toHaveValue("2.35");
  await leave();
  await dialog.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(page).toHaveURL(/#\/app\/schedules\/sch_ui$/);
  expect(state.writes).toEqual([]);
});

test("creates an exact future-cap draft then requires both human attestations before separate approval", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/#/app/schedules/new?dispatch=dsp_schedule_ui");
  const instant = await fillSchedule(page);
  await page
    .getByRole("button", { name: "Create schedule", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/app\/schedules\/sch_ui$/);
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0]).toMatchObject({
    path: "/api/dispatch-schedules",
    key: expect.any(String),
    body: {
      dispatchId: state.source.id,
      executeAt: instant,
      maxTotalMinor: 235,
    },
  });
  const approve = page.getByRole("button", {
    name: "Approve scheduled spending",
    exact: true,
  });
  await expect(approve).toBeDisabled();
  await approve.evaluate((element) => (element as HTMLButtonElement).click());
  expect(state.writes).toHaveLength(1);
  await page
    .getByLabel(FUTURE_SPENDING_ACKNOWLEDGEMENT, { exact: true })
    .check();
  await expect(approve).toBeDisabled();
  await page
    .getByLabel("The recipient explicitly requested this email.", {
      exact: true,
    })
    .check();
  await approve.click();
  await expect(
    page.getByRole("heading", {
      name: "Scheduled spending approved",
      exact: true,
    }),
  ).toBeVisible();
  expect(state.writes[1]).toMatchObject({
    path: "/api/dispatch-schedules/sch_ui/approve",
    body: {
      expectedRevision: 1,
      snapshotHash: "b".repeat(64),
      acknowledgement: FUTURE_SPENDING_ACKNOWLEDGEMENT,
      recipientRequested: true,
    },
  });
  expect(state.writes.some((write) => write.path.includes("/confirm"))).toBe(
    false,
  );
});

test("keeps future spending unapproved when runtime activation is disabled", async ({
  page,
}) => {
  const state = await fixture(page, { enabled: false });
  await page.goto("/#/app/schedules/sch_ui");
  await expect(
    page.getByText("Automatic release is not enabled.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Approve scheduled spending",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    page.getByLabel(FUTURE_SPENDING_ACKNOWLEDGEMENT, { exact: true }),
  ).toBeDisabled();
  expect(state.writes).toEqual([]);
});

test("shows revision/hash conflict without pretending approval succeeded or retrying automatically", async ({
  page,
}) => {
  const state = await fixture(page, { conflict: true });
  await page.goto("/#/app/schedules/sch_ui");
  await page
    .getByLabel(FUTURE_SPENDING_ACKNOWLEDGEMENT, { exact: true })
    .check();
  await page
    .getByLabel("The recipient explicitly requested this email.", {
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Approve scheduled spending", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "The operation could not be completed",
  );
  await expect(page.getByRole("alert")).not.toContainText(
    "Synthetic schedule changed; refresh required.",
  );
  await expect(
    page.getByRole("heading", { name: "Waiting for approval", exact: true }),
  ).toBeVisible();
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].body).toMatchObject({
    expectedRevision: 1,
    snapshotHash: "b".repeat(64),
  });
});

test("cancels only the selected schedule after explicit confirmation", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/#/app/schedules/sch_ui");
  await page
    .getByRole("button", { name: "Cancel schedule", exact: true })
    .click();
  const confirmation = page.getByRole("group", {
    name: "Cancel this schedule? An already accepted dispatch must be reviewed separately.",
    exact: true,
  });
  await expect(confirmation).toBeVisible();
  expect(state.writes).toEqual([]);
  await confirmation.press("Escape");
  await expect(confirmation).toBeHidden();
  expect(state.writes).toEqual([]);
  await page
    .getByRole("button", { name: "Cancel schedule", exact: true })
    .click();
  await confirmation
    .getByRole("button", { name: "Cancel schedule", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Schedule cancelled", exact: true }),
  ).toBeVisible();
  expect(state.writes).toEqual([
    {
      path: "/api/dispatch-schedules/sch_ui/cancel",
      key: undefined,
      body: { expectedRevision: 1 },
    },
  ]);
});

test("refuses a PDF email before offering schedule creation or approval", async ({
  page,
}) => {
  const state = await fixture(page, { unsupported: true });
  await page.goto("/#/app/schedules/new?dispatch=dsp_schedule_ui");
  await expect(
    page.getByRole("heading", { name: "New schedule", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create schedule", exact: true }),
  ).toBeDisabled();
  expect(state.writes).toEqual([]);
});

test("one queued double-submit owns one stable creation key", async ({
  page,
}) => {
  const state = await fixture(page, { delayCreate: true });
  await page.goto("/#/app/schedules/new?dispatch=dsp_schedule_ui");
  await fillSchedule(page);
  await page.locator("form.lifecycle-form").evaluate((form) => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  await expect.poll(() => state.writes.length).toBe(1);
  state.release();
  await expect(page).toHaveURL(/#\/app\/schedules\/sch_ui$/);
  expect(state.writes[0].key).toBeTruthy();
});

test("a late draft receipt cannot navigate an abandoned view", async ({
  page,
}) => {
  const state = await fixture(page, { delayCreate: true });
  await page.goto("/#/app/schedules/new?dispatch=dsp_schedule_ui");
  await fillSchedule(page);
  await page
    .getByRole("button", { name: "Create schedule", exact: true })
    .click();
  await expect.poll(() => state.writes.length).toBe(1);
  await page.evaluate(() => {
    location.hash = "#/app/documents";
  });
  const response = page.waitForResponse(
    (result) =>
      new URL(result.url()).pathname === "/api/dispatch-schedules" &&
      result.request().method() === "POST",
  );
  state.release();
  await response;
  await expect(page).toHaveURL(/#\/app\/documents$/);
  expect(state.writes).toHaveLength(1);
});

test("an expired future approval stays closed without cancelling or approving the original", async ({
  page,
}) => {
  const state = await fixture(page, { expired: true });
  await page.goto("/#/app/schedules/sch_ui");
  await expect(
    page.getByRole("button", {
      name: "Approve scheduled spending",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    page.getByLabel(FUTURE_SPENDING_ACKNOWLEDGEMENT, { exact: true }),
  ).toBeDisabled();
  expect(state.writes).toHaveLength(0);
});

test("a held original points to its schedule and offers no ordinary approval, cancellation or duplicate schedule", async ({
  page,
}) => {
  const state = await fixture(page, { held: true });
  await page.goto("/#/app/dispatch/dsp_schedule_ui");
  await expect(
    page.getByRole("link", { name: "Open schedule", exact: true }),
  ).toHaveAttribute("href", "#/app/schedules/sch_ui");
  await expect(
    page.getByRole("link", { name: "Schedule this dispatch", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator(".dispatch-review-actions .approval-panel"),
  ).toHaveCount(0);
  await expect(page.locator(".cancel-button")).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
  await page.goto("/#/app/dispatches?group=in_progress");
  await expect(
    page
      .getByText("Waiting for scheduled spending approval", { exact: true })
      .first(),
  ).toBeVisible();
});

test.describe("explicit application time on a different device clock", () => {
  test.use({ timezoneId: "America/New_York" });
  test("submits the UTC field value without a device offset and declares it once", async ({
    page,
  }) => {
    const state = await fixture(page);
    await page.goto("/#/app/schedules/new?dispatch=dsp_schedule_ui");
    await expect(page.locator(".timestamp-context")).toHaveCount(1);
    await expect(page.locator(".timestamp-context")).toHaveText(
      "Times shown in: UTC",
    );
    const instant = await fillSchedule(page);
    await page
      .getByRole("button", { name: "Create schedule", exact: true })
      .click();
    await expect(page).toHaveURL(/#\/app\/schedules\/sch_ui$/);
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0].body.executeAt).toBe(instant);
    expect(state.writes[0].path).toBe("/api/dispatch-schedules");
  });
});
