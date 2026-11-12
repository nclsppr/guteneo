import { expect, test, type Page } from "@playwright/test";
import { stationFixture } from "./fixtures";

/**
 * The station's signature presentation: split-flap boards, the franked ticket
 * and the announcement strip. Synthetic transport only; these checks prove
 * that the decoration never replaces the readable facts underneath it.
 */
const headers = {
  "Access-Control-Allow-Origin": "http://127.0.0.1:8850",
  "Access-Control-Allow-Credentials": "true",
};
const dispatch = (
  id: string,
  channel: "fax" | "email" | "postal",
  status: string,
  recipient: Record<string, string>,
) => ({
  id,
  channel,
  recipient_json: JSON.stringify(recipient),
  document_id: null,
  sender_address: "sender@example.invalid",
  subject: channel === "email" ? "Synthetic subject" : null,
  text: channel === "email" ? "Synthetic message." : null,
  html: null,
  options_json: "{}",
  status,
  mode: "production",
  estimated_minor: 60,
  ceiling_minor: 500,
  known_minor: null,
  currency: "EUR",
  fingerprint: "0123456789abcdef".repeat(4),
  quote_customer_nanoeur: null,
  quote_expires_at: null,
  created_at: "2026-11-11T10:05:00.000Z",
  updated_at: "2026-11-11T10:06:00.000Z",
});
const rows = [
  {
    ...dispatch("dsp-sig-email", "email", "delivered", {
      email: "recipient@example.invalid",
    }),
    quote_customer_nanoeur: 605_123_456,
    updated_at: "2026-11-12T10:06:00.000Z",
  },
  dispatch("dsp-sig-fax", "fax", "prepared", { phone: "+35226000000" }),
  dispatch("dsp-sig-postal", "postal", "cancelled", {
    name: "Synthetic Office",
    city: "Luxembourg",
    country: "LU",
  }),
];

async function serve(page: Page, path: string, body: unknown) {
  await page.route(
    (url) => url.pathname === `/api${path}`,
    (route) =>
      route.request().method() === "GET"
        ? route.fulfill({ headers, json: body })
        : route.fallback(),
  );
}

/** What a row of flaps currently spells, without its padding cells. */
const spelled = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((row) =>
      Array.from(row.children, (cell) => (cell as HTMLElement).dataset.glyph)
        .join("")
        .trim(),
    );

test("the departures board spells each row on flaps and keeps the exact facts as text", async ({
  page,
}) => {
  const fixture = await stationFixture(page);
  await serve(page, "/dispatches", { items: rows, nextCursor: null });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/departures?lang=fr");
  await expect(page.getByRole("row")).toHaveCount(rows.length + 1);
  await expect(
    page.getByRole("link", { name: "recipient@example.invalid", exact: true }),
  ).toBeVisible();
  // The exact product status is the text; the flaps carry its board spelling.
  const first = page.locator("tbody tr").nth(0);
  await expect(first.locator(".board-state")).toContainText(
    "Accepté par le serveur",
  );
  await expect(first.locator(".board-full-destination")).toBeVisible();
  await expect(first.locator(".traffic-fare .data")).toHaveText(/0,605123456/);
  await expect(first.locator(".traffic-fare .flaps")).toHaveCount(0);
  expect(await spelled(page, "tbody tr:nth-child(1) .board-state .flaps")).toBe(
    "ACCEPTÉ SERVEUR",
  );
  expect(
    await spelled(page, "tbody tr:nth-child(1) .traffic-destination .flaps"),
  ).toBe("RECIPIENT@EXAMPLE.I…");
  expect(await spelled(page, "tbody tr:nth-child(2) .board-state .flaps")).toBe(
    "À APPROUVER",
  );
  await expect(page.locator("tbody tr").nth(2)).toContainText("Annulé");
  // Flaps are decoration for assistive technology.
  await expect(
    page.locator(".traffic-flapboard .flaps").first(),
  ).toHaveAttribute("aria-hidden", "true");
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  fixture.assertReadOnly();
});

test("a ticket carries the stamp and fingerprint bars, and is cancelled only once it has left", async ({
  page,
}) => {
  const fixture = await stationFixture(page);
  await serve(page, "/dispatches/dsp-sig-fax", {
    dispatch: rows[1],
    events: [],
    attempts: [],
    approval: null,
    approvalRequest: null,
  });
  await serve(page, "/dispatches/dsp-sig-email", {
    dispatch: rows[0],
    events: [
      {
        id: "evt-2",
        kind: "delivered",
        occurred_at: "2026-11-11T10:06:00.000Z",
      },
      {
        id: "evt-1",
        kind: "accepted",
        occurred_at: "2026-11-11T10:05:30.000Z",
      },
    ],
    attempts: [],
    approval: null,
    approvalRequest: null,
  });
  await page.goto("/departures/dsp-sig-fax?lang=fr");
  const ticket = page.locator(".traffic-ticket");
  await expect(ticket.locator(".ticket-franking img")).toBeVisible();
  await expect(ticket.locator(".barcode rect").first()).toBeAttached();
  await expect(ticket.locator(".postmark")).toHaveCount(0);
  await page.goto("/departures/dsp-sig-email?lang=fr");
  await expect(ticket.locator(".postmark")).toHaveCount(1);
  await expect(ticket.locator(".postmark")).toContainText("11.11.2026");
  await expect(page.locator(".traffic-timeline li")).toHaveCount(2);
  // The franking is ornament: the status stays one readable line.
  await expect(ticket.locator(".ticket-franking")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await expect(page.locator("main .traffic-status")).toHaveText(
    "Accepté par le serveur",
  );
  fixture.assertReadOnly();
});

test("the hall announces what waits for a person and lists the latest departures", async ({
  page,
}) => {
  const fixture = await stationFixture(page);
  await serve(page, "/overview", {
    documents: 2,
    dispatches: {
      total: 3,
      approval: 2,
      in_progress: 0,
      attention: 1,
      done: 0,
    },
  });
  await serve(page, "/dispatches", { items: rows, nextCursor: null });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?lang=fr");
  const announcements = page.getByRole("region", { name: "Annonces" });
  await expect(announcements).toContainText(
    "2 départs attendent une approbation",
  );
  await expect(announcements).toContainText("1 départ demande votre attention");
  // Reduced motion: nothing cycles, so no pause control is offered.
  await expect(announcements.getByRole("button")).toHaveCount(0);
  const latest = page.getByRole("region", { name: "Derniers départs" });
  await expect(latest.getByRole("link")).toHaveCount(rows.length);
  await expect(latest.getByRole("link").first()).toContainText(
    "recipient@example.invalid",
  );
  fixture.assertReadOnly();
});

test("the announcement pause persists after moving focus and the pointer", async ({
  page,
}) => {
  const fixture = await stationFixture(page, { signedIn: false });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/?lang=fr");
  const announcements = page.getByRole("region", { name: "Annonces" });
  const toggle = announcements.getByRole("button");
  await toggle.click();
  await page.getByRole("heading", { level: 1 }).click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  fixture.assertReadOnly();
});

test("a board with active dispatches keeps the last appended page", async ({
  page,
}) => {
  const fixture = await stationFixture(page);
  let firstPageReads = 0;
  await page.route(
    (url) => url.pathname === "/api/dispatches",
    (route) => {
      const cursor = new URL(route.request().url()).searchParams.get("cursor");
      if (cursor)
        return route.fulfill({
          headers,
          json: { items: [rows[1]], nextCursor: null },
        });
      firstPageReads++;
      return route.fulfill({
        headers,
        json: { items: [{ ...rows[0], status: "queued" }], nextCursor: "next" },
      });
    },
  );
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/departures?lang=en");
  await expect(page.getByRole("row")).toHaveCount(2);
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByRole("row")).toHaveCount(3);
  await page.clock.runFor(9000);
  await expect(page.getByRole("row")).toHaveCount(3);
  expect(firstPageReads).toBe(1);
  fixture.assertReadOnly();
});
