import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { documentAnalysis } from "../../packages/contracts/src/document-analysis";

test("refreshes postal restrictions without losing the address draft and stops retrying a failed reference", async ({
  page,
}) => {
  // All business requests are intercepted; no provider or real account is used.
  const controls = {
    now: Date.now(),
    unavailable: [] as string[],
    failed: false,
    reads: 0,
  };
  await page.clock.install({ time: new Date(controls.now) });
  const pdf = await PDFDocument.create();
  pdf.addPage([595.28, 841.89]);
  const bytes = Buffer.from(await pdf.save());
  const source = {
    id: "destination-ui-document",
    name: "Fictional postal document.pdf",
    pages: 1,
    size: bytes.length,
    sha256: "a".repeat(64),
    status: "ready",
    source: "import",
    analysis: documentAnalysis("ready"),
    created_at: "2026-11-01T10:00:00Z",
  };
  const mutations: string[] = [];
  const unmatched: string[] = [];
  const external: string[] = [];
  page.on("request", (request) => {
    const host = new URL(request.url()).hostname;
    if (!["localhost", "127.0.0.1"].includes(host))
      external.push(request.url());
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.slice(4);
    if (request.method() !== "GET") {
      mutations.push(path);
      return route.fulfill({
        status: 409,
        json: { error: { code: "NO_WRITE_FIXTURE" } },
      });
    }
    if (path === "/session")
      return route.fulfill({
        json: {
          organization: {
            id: "org-destination-ui",
            name: "Fictional postal workspace",
          },
          user: {
            id: "user-destination-ui",
            name: "Fictional administrator",
            role: "admin",
          },
          csrfToken: "fixture-csrf",
          simulation: false,
          verifiedAccount: true,
        },
      });
    if (path === "/capabilities")
      return route.fulfill({ json: { registration: { enabled: true } } });
    if (path === "/postal/destinations") {
      controls.reads++;
      if (controls.failed)
        return route.fulfill({
          status: 503,
          json: {
            error: { code: "POSTAL_DESTINATION_AVAILABILITY_UNAVAILABLE" },
          },
        });
      return route.fulfill({
        json: {
          countries: ["FR", "HK", "US"],
          unavailableCountries: controls.unavailable,
          delayedCountries: [],
          observedAt: new Date(controls.now).toISOString(),
          expiresAt: new Date(controls.now + 300_000).toISOString(),
          sourceUrl: "https://example.invalid/fictional-restrictions",
          sourceSha256: "b".repeat(64),
        },
      });
    }
    if (path === "/postal/requirements")
      return route.fulfill({
        json: {
          profile: {
            defaultCountry: "LU",
            addressPosition: "left",
            addressPositions: ["left", "right"],
          },
        },
      });
    if (path === "/senders")
      return route.fulfill({
        json: {
          items: [
            {
              id: "sender-destination-ui",
              name: "Fictional sender",
              channel: "postal",
              status: "verified",
            },
          ],
        },
      });
    if (path === "/documents")
      return route.fulfill({ json: { items: [source], nextCursor: null } });
    if (path === `/documents/${source.id}`)
      return route.fulfill({ json: source });
    if (path === `/documents/${source.id}/content`)
      return route.fulfill({ contentType: "application/pdf", body: bytes });
    unmatched.push(path);
    return route.fulfill({
      status: 404,
      json: { error: { code: "NO_FIXTURE" } },
    });
  });
  await page.goto(
    `/?lang=fr#/app/prepare?document=${source.id}&channel=postal`,
  );
  await page.getByLabel("Pays", { exact: true }).selectOption("HK");
  const lines = "Fictional Recipient\n12 Example Road, Kowloon\nHONG KONG";
  const address = page.getByLabel("Adresse complète à imprimer", {
    exact: true,
  });
  await address.fill(lines);
  await page.locator("details.postal-budget > summary").click();
  const budget = page.getByLabel("Budget maximum en euros", {
    exact: true,
  });
  await budget.fill("6,50");
  const prepare = page.getByRole("button", {
    name: "Préparer le courrier",
    exact: true,
  });
  await expect(prepare).toBeEnabled();
  const preservedDraft = async () => {
    await expect(address).toHaveValue(lines);
    await expect(budget).toHaveValue("6,50");
    await expect(page.getByLabel("Document", { exact: true })).toHaveValue(
      source.id,
    );
    await expect(page.getByLabel("Pays", { exact: true })).toHaveValue("HK");
  };
  const focus = async () => {
    controls.now += 1001;
    await page.clock.fastForward(1001);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  };
  controls.unavailable = ["HK"];
  await focus();
  await expect(page.locator('option[value="HK"]')).toBeDisabled();
  await expect(
    page.getByText(
      "L’envoi de courrier vers cette destination est temporairement indisponible.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(prepare).toBeDisabled();
  await preservedDraft();
  controls.unavailable = [];
  await focus();
  await expect(page.locator('option[value="HK"]')).toBeEnabled();
  await expect(prepare).toBeEnabled();
  await preservedDraft();
  controls.failed = true;
  controls.now += 300_051;
  await page.clock.fastForward(300_051);
  const retry = page.getByRole("button", { name: "Réessayer", exact: true });
  await expect(retry).toBeVisible();
  await expect(prepare).toBeDisabled();
  await preservedDraft();
  const failedReads = controls.reads;
  controls.now += 300_000;
  await page.clock.fastForward(300_000);
  expect(controls.reads).toBe(failedReads);
  controls.failed = false;
  await retry.click();
  await expect(prepare).toBeEnabled();
  await preservedDraft();
  expect(mutations).toEqual([]);
  expect(unmatched).toEqual([]);
  expect(external).toEqual([]);
});
