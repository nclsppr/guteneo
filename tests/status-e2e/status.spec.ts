import { test, expect } from "@playwright/test";
import { fixtures, history, qualification, snapshot } from "./fixtures";

for (const width of [1440, 390, 320]) {
  test(`three views, keyboard and filters at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const evidence = await fixtures(page);
    await page.goto("/");
    await expect(page.locator("#passed-count")).toHaveText("14");
    await expect(page.locator("#panel-service")).toBeVisible();
    await expect(page.locator("#state-title")).toContainText(
      "parcours métier à confirmer",
    );
    await expect(page.locator("#panel-service")).not.toContainText(
      /GET https:|\/api\/documents|dsp_|traceId|fingerprint/,
    );
    for (const tab of ["service", "verification", "operations"]) {
      await page.locator(`[data-tab="${tab}"]`).click();
      await expect(page.locator(`#panel-${tab}`)).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    }
    await page.locator('[data-tab="service"]').click();
    for (const [filter, count] of [
      ["disabled", 4],
      ["not_checked", 7],
      ["all", 11],
    ] as const) {
      await page.locator(`[data-filter="${filter}"]`).click();
      await expect(page.locator(".business-row")).toHaveCount(count);
    }
    await page.locator('[data-tab="verification"]').click();
    await page.locator("#check-search").fill("DOCUMENTS");
    await expect(page.locator(".scenario")).toHaveCount(1);
    await page.locator(".scenario > summary").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".scenario")).toHaveAttribute("open", "");
    await expect(page.locator(".scenario .detail-body")).toContainText(
      "HTTP 401",
    );
    await page.locator('[data-check-filter="fail"]').click();
    await expect(page.locator(".scenario")).toHaveCount(0);
    await page.locator("#check-search").fill("");
    await page.locator('[data-check-filter="pass"]').click();
    await expect(page.locator(".scenario")).toHaveCount(14);
    await page.locator("#qualification-detail > summary").click();
    await expect(page.locator("#qualification-scope li")).toHaveCount(1);
    await expect(page.locator("#qualification-state")).toHaveText(
      "4 tests · local",
    );
    await page.locator('[data-tab="service"]').focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator('[data-tab="verification"]')).toBeFocused();
    await page.keyboard.press("End");
    await expect(page.locator('[data-tab="operations"]')).toBeFocused();
    await page.keyboard.press("Home");
    await expect(page.locator('[data-tab="service"]')).toBeFocused();
    await page.locator(".status-footer").scrollIntoViewIfNeeded();
    await expect(page.locator(".status-landscape > img")).toHaveJSProperty(
      "complete",
      true,
    );
    expect(
      await page
        .locator(".status-landscape > img")
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    ).toBeGreaterThan(0);
    await expect(page.locator(".status-bird")).toHaveCount(3);
    const panorama = await page
      .locator(".status-landscape > img")
      .boundingBox();
    expect(panorama).not.toBeNull();
    expect(panorama!.width / panorama!.height).toBeCloseTo(2172 / 724, 2);
    await expect(page.locator("body")).not.toContainText(
      /Cucumber|ancien hôte|workers\.dev/,
    );
    expect(evidence.errors).toEqual([]);
    expect(evidence.external).toEqual([]);
  });
}

test("history periods, missing coverage and unavailable response stay honest", async ({
  page,
}) => {
  let measured = false,
    unavailable = false;
  await fixtures(page, {
    history: (days) => (unavailable ? {} : history(days, measured)),
  });
  await page.goto("/");
  await expect(page.locator("#history-availability")).toHaveText(
    "Aucune mesure",
  );
  await expect(page.locator(".bar-empty")).toHaveCount(7);
  measured = true;
  for (const days of [30, 365, 7]) {
    await page.locator(`[data-days="${days}"]`).click();
    await expect(page.locator("#history-rows tr")).toHaveCount(days);
    await expect(page.locator("#history-chart rect")).toHaveCount(days);
    await expect(page.locator(".bar-empty")).toHaveCount(days - 1);
    await expect(page.locator("#history-availability")).toHaveText("50 %");
    await expect(page.locator("#history-coverage")).toHaveText("2 / 4");
    await expect(page.locator("#history-state")).toContainText(
      "2 mesures attendues non reçues.",
    );
    await expect(
      page.locator("#history-chart rect").last().locator("title"),
    ).toContainText("50 % de réussite observée");
  }
  unavailable = true;
  await page.locator('[data-days="30"]').click();
  await expect(page.locator("#history-availability")).toHaveText("—");
  await expect(page.locator("#history-chart rect")).toHaveCount(0);
});

for (const state of ["stale", "missing", "offline", "future"] as const) {
  test(`${state} evidence cannot imply current success`, async ({ page }) => {
    const data = snapshot();
    if (state === "stale") {
      data.checkedAt = new Date(Date.now() - 1900000).toISOString();
      data.freshness = "stale";
    }
    if (state === "missing") {
      data.checkedAt = null;
      data.freshness = "missing";
      data.status = "unknown";
      data.checks = [];
    }
    if (state === "future")
      data.checkedAt = new Date(Date.now() + 61000).toISOString();
    const evidence = await fixtures(page, {
      status: state === "offline" ? {} : data,
      http: state === "future" ? 200 : 503,
    });
    await page.goto("/");
    await expect(page.locator("#live-state")).toHaveAttribute(
      "data-state",
      state === "future" ? "stale" : state === "missing" ? "unknown" : state,
    );
    await expect(page.locator("#summary-grid")).toHaveAttribute(
      "data-current",
      "false",
    );
    await expect(page.locator("#public-evidence-state")).not.toHaveClass(
      /success/,
    );
    expect(evidence.errors).toEqual([]);
  });
}

test("failed control, preserved detail and network recovery", async ({
  page,
}) => {
  const data = snapshot();
  data.checks[10].status = "fail";
  data.checks[10].httpStatus = 200;
  let offline = false;
  await fixtures(page, {
    status: () =>
      offline ? {} : { ...data, checkedAt: new Date().toISOString() },
  });
  await page.goto("/");
  await page.locator('[data-shortcut="fail"]').click();
  await expect(page.locator(".scenario")).toHaveCount(1);
  const summary = page.locator(".scenario > summary");
  await summary.click();
  await expect(page.locator(".scenario .detail-body")).toContainText(
    "HTTP 401 attendu ; http 200 observé.",
  );
  await summary.focus();
  await page.evaluate(() => document.getElementById("refresh")?.click());
  await expect(page.locator("#refresh")).toBeEnabled();
  await expect(summary).toBeFocused();
  await expect(page.locator(".scenario")).toHaveAttribute("open", "");
  offline = true;
  await page.locator("#refresh").click();
  await expect(page.locator("#live-state")).toHaveAttribute(
    "data-state",
    "offline",
  );
  await expect(page.locator("#passed-count")).toHaveText("13");
  await expect(page.locator("#summary-grid")).toHaveAttribute(
    "data-current",
    "false",
  );
  offline = false;
  await page.locator("#refresh").click();
  await expect(page.locator("#live-state")).toHaveAttribute(
    "data-state",
    "attention",
  );
  await expect(page.locator("#summary-grid")).toHaveAttribute(
    "data-current",
    "true",
  );
});

for (const reason of [
  "network",
  "skipped",
  "sourceChanged",
  "missingHash",
  "failure",
] as const) {
  test(`local proof stays incomplete when ${reason}`, async ({ page }) => {
    const data = qualification();
    if (reason === "network") data.networkPolicy = "unproven";
    if (reason === "skipped") data.counts.testsSkipped = 1;
    if (reason === "sourceChanged") data.sourceUnchangedDuringRun = false;
    if (reason === "missingHash") data.sourceSnapshotSha256 = "";
    if (reason === "failure") data.status = "failed";
    await fixtures(page, { qualification: data });
    await page.goto("/");
    await expect(page.locator("#qualification-state")).toHaveText(
      "Qualification incomplète",
    );
    await expect(page.locator("#qualification-state")).not.toHaveClass(
      /success/,
    );
  });
}

test("reduced motion is honored even if the saved preference is on", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("guteneo.status.motion", "on"),
  );
  await fixtures(page);
  await page.goto("/");
  await expect(page.locator("#motion-toggle")).toBeDisabled();
  await expect(page.locator("#season-canvas")).toHaveAttribute(
    "data-running",
    "false",
  );
});

for (const [season, month] of [
  ["autumn", 9],
  ["winter", 0],
] as const) {
  test(`${season} animation is bounded, pauses and preserves off preference`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.addInitScript((value) => {
      Date.prototype.getMonth = () => value;
    }, month);
    const evidence = await fixtures(page);
    await page.goto("/");
    const canvas = page.locator("#season-canvas");
    await expect(canvas).toHaveAttribute("data-running", "true");
    await expect(canvas).toHaveAttribute("data-season", season);
    expect(
      Number(await canvas.getAttribute("data-particles")),
    ).toBeLessThanOrEqual(24);
    expect(
      await canvas.evaluate(
        (element: HTMLCanvasElement) => element.width * element.height,
      ),
    ).toBeLessThanOrEqual(2000000);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        get: () => true,
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(canvas).toHaveAttribute("data-running", "false");
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        get: () => false,
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(canvas).toHaveAttribute("data-running", "true");
    await page.locator("#motion-toggle").click();
    await expect(canvas).toHaveAttribute("data-running", "false");
    await page.reload();
    await expect(page.locator("#motion-toggle")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(evidence.errors).toEqual([]);
    expect(evidence.external).toEqual([]);
  });
}

for (const bad of [
  "duplicate",
  "incomplete",
  "falseHttp",
  "missingCoverage",
] as const) {
  test(`inconsistent public contract ${bad} cannot be green`, async ({
    page,
  }) => {
    const data = snapshot();
    if (bad === "duplicate")
      data.checks = Array.from({ length: 14 }, () => ({ ...data.checks[0] }));
    if (bad === "incomplete") data.checks.pop();
    if (bad === "falseHttp") data.checks[10].httpStatus = 200;
    if (bad === "missingCoverage") data.coverage = [];
    await fixtures(page, { status: data });
    await page.goto("/");
    await expect(page.locator("#live-state")).toHaveAttribute(
      "data-state",
      "offline",
    );
    await expect(page.locator("#summary-grid")).toHaveAttribute(
      "data-current",
      "false",
    );
  });
}
for (const bad of ["ratio", "coverage"] as const) {
  test(`inconsistent historical ${bad} is discarded`, async ({ page }) => {
    await fixtures(page, {
      history: (days) => {
        const data = history(days, true);
        if (bad === "ratio") data.buckets[days - 1].availabilityPercent = 100;
        else data.buckets[days - 1].unknownSamples = 0;
        return data;
      },
    });
    await page.goto("/");
    await expect(page.locator("#history-availability")).toHaveText("—");
    await expect(page.locator("#history-state")).toContainText(
      "Historique indisponible",
    );
  });
}
