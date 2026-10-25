import { test, expect } from "@playwright/test";
import { fixtures, history, snapshot } from "./fixtures";

const headings = {
  fr: "État du service",
  en: "Service status",
  de: "Dienststatus",
  lb: "Servicestatus",
};
const available = {
  fr: "Les accès publics sont disponibles",
  en: "Public access is available",
  de: "Der öffentliche Zugang ist verfügbar",
  lb: "Den ëffentlechen Zougang ass disponibel",
};
const reportDirectory = process.env.STATUS_REVIEW_DIR;

for (const language of ["fr", "en", "de", "lb"] as const) {
  for (const theme of ["light", "dark"] as const) {
    for (const width of [1440, 390, 320]) {
      test(`${language} ${theme} at ${width}px shows availability and accessible real history`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ colorScheme: theme });
        const evidence = await fixtures(page, {
          history: (days) => history(days, true),
        });
        await page.goto(`/?lang=${language}`);
        await expect(page.locator("html")).toHaveAttribute("lang", language);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(page.locator("h1")).toHaveText(headings[language]);
        await expect(page.locator("#state-title")).toHaveText(
          available[language],
        );
        await expect(page.locator("#live-state")).toHaveAttribute(
          "data-state",
          "pass",
        );
        await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
          "content",
          "#2450db",
        );
        await expect(page.locator("#history-chart button")).toHaveCount(30);
        await expect(page.locator("#history-chart .unknown")).toHaveCount(29);
        await expect(
          page.locator("#history-chart .attention.partial"),
        ).toHaveCount(1);
        await expect(page.locator("#history-state")).not.toContainText(
          /\{\d+\}|undefined|NaN/,
        );
        await expect(page.locator("#checked-time")).toHaveAttribute(
          "datetime",
          /T/,
        );
        await expect(page.locator("#history-chart [tabindex='0']")).toHaveCount(
          1,
        );
        const control = page.locator("#history-chart button").last();
        const box = await control.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(width);
        await expect(page.locator(".service-list li")).toHaveCount(3);
        await expect(
          page.locator("#public-footer-nav .footer-group"),
        ).toHaveCount(4);
        await expect(page.locator("#public-footer-nav a")).toHaveCount(15);
        const stamp = page.locator(".status-footer .founding-stamp");
        await expect(stamp).toHaveAttribute(
          "src",
          "/assets/gutenberg-guteneo-stamp.webp",
        );
        await page.locator(".status-footer").scrollIntoViewIfNeeded();
        await stamp.evaluate((image) => (image as HTMLImageElement).decode());
        await expect(stamp).toHaveJSProperty("naturalWidth", 640);
        await expect(
          page.locator(".status-footer .founding-postmark"),
        ).toBeVisible();
        await expect(
          page.locator(
            'a[href="https://guteneo.com/legal/?lang=' + language + '"]',
          ),
        ).toBeVisible();
        await page.locator(".daily-details summary").click();
        await expect(page.locator("#history-rows tr")).toHaveCount(30);
        await page.locator(".daily-details summary").click();
        await expect(page.locator("body")).not.toContainText(
          /GitHub|Auth0|Stripe|provider|qualification|Qualification|GET https:|fingerprint|API|Cloudflare/,
        );
        if (reportDirectory && width !== 320)
          await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
        if (reportDirectory && width !== 320)
          await page.screenshot({
            path: `${reportDirectory}/status-${language}-${theme}-${width}.png`,
            fullPage: true,
          });
        expect(evidence.errors).toEqual([]);
        expect(evidence.external).toEqual([]);
      });
    }
  }
}

test("7/30/365 use actual samples, monthly year summaries and complete daily detail", async ({
  page,
}) => {
  await fixtures(page, { history: (days) => history(days, true) });
  await page.goto("/?lang=en");
  for (const days of [7, 30, 365]) {
    await page.locator(`[data-days="${days}"]`).click();
    await expect(page.locator("#history-chart")).not.toHaveAttribute(
      "aria-busy",
      "true",
    );
    await expect(page.locator("#history-rows tr")).toHaveCount(days);
    const buttons = page.locator("#history-chart button");
    if (days === 365) expect(await buttons.count()).toBeGreaterThanOrEqual(12);
    else await expect(buttons).toHaveCount(days);
    await expect(page.locator("#history-state")).toHaveText(
      "50% of recorded checks passed. 2 of 4 observations recorded.",
    );
    await buttons.last().focus();
    await page.keyboard.press("Home");
    await expect(buttons.first()).toBeFocused();
    await expect(buttons.first()).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#history-selection")).toContainText(
      "No observations recorded.",
    );
    await page.keyboard.press("End");
    await expect(buttons.last()).toBeFocused();
    await expect(page.locator("#history-selection")).toContainText(
      "50% of recorded checks passed.",
    );
    await page.keyboard.press("ArrowLeft");
    await expect(buttons.nth((await buttons.count()) - 2)).toBeFocused();
  }
});

test("stale, missing, failed and contradictory observations never retain a green summary", async ({
  page,
}) => {
  const data = snapshot();
  await fixtures(page, { status: () => data });
  await page.goto("/?lang=en");
  await expect(page.locator("#live-state")).toHaveAttribute(
    "data-state",
    "pass",
  );
  data.checkedAt = new Date(Date.now() - 3600000).toISOString();
  await page.locator("#refresh").click();
  await expect(page.locator("#live-state")).toHaveAttribute(
    "data-state",
    "unknown",
  );
  await expect(page.locator(".service-state.success")).toHaveCount(0);
  await expect(page.locator("#state-detail")).toContainText("old");
  data.checkedAt = new Date().toISOString();
  data.status = "attention";
  await page.locator("#refresh").click();
  await expect(page.locator("#live-state")).toHaveAttribute(
    "data-state",
    "unknown",
  );
  data.checks[0].status = "fail";
  await page.locator("#refresh").click();
  await expect(page.locator("#service-pages-state")).toHaveText(
    "Issue detected",
  );
  await expect(page.locator("#service-api-state")).toHaveText("Responding");
  data.checkedAt = null;
  data.checks = [];
  data.freshness = "missing";
  data.status = "unknown";
  await page.locator("#refresh").click();
  await expect(page.locator("#live-state")).toHaveAttribute(
    "data-state",
    "unknown",
  );
  await expect(page.locator("#checked-time")).toHaveText("No observation yet");
});

test("refresh failures preserve dated evidence while making the current state unknown", async ({
  page,
}) => {
  await fixtures(page);
  await page.goto("/?lang=en");
  await expect(page.locator("#live-state")).toHaveAttribute(
    "data-state",
    "pass",
  );
  const observed = await page.locator("#checked-time").getAttribute("datetime");
  await page.route("**/api/status", (route) =>
    route.fulfill({ status: 502, body: "unavailable" }),
  );
  await page.locator("#refresh").click();
  await expect(page.locator("#live-state")).toHaveAttribute(
    "data-state",
    "unknown",
  );
  await expect(page.locator("#checked-time")).toHaveAttribute(
    "datetime",
    observed!,
  );
  await expect(page.locator("#state-detail")).toContainText("Try refreshing");
  await expect(page.locator(".service-state.success")).toHaveCount(0);
});

test("invalid status and inconsistent history fail closed", async ({
  page,
}) => {
  const data = snapshot();
  data.checks[0].httpStatus = 503;
  await fixtures(page, {
    status: data,
    history: (days) => {
      const value = history(days, true);
      value.buckets.at(-1)!.availabilityPercent = 100;
      return value;
    },
  });
  await page.goto("/?lang=en");
  await expect(page.locator("#live-state")).toHaveAttribute(
    "data-state",
    "unknown",
  );
  await expect(page.locator("#history-state")).toHaveText(
    "History could not be loaded. Try refreshing.",
  );
  await expect(page.locator("#history-chart button")).toHaveCount(0);
  await expect(page.locator("#history-rows tr")).toHaveCount(0);
});

test("query, saved choice, browser list and French fallback follow public language priority", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "languages", {
      get: () =>
        location.search.includes("unsupported=1")
          ? ["es-ES"]
          : ["es-ES", "de-AT", "en-GB"],
    });
  });
  await fixtures(page);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await page.locator("#status-language").selectOption("lb");
  await expect(page.locator("html")).toHaveAttribute("lang", "lb");
  await page.goto("/?lang=fr-CA");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await page.goto("/?lang=en&lang=de");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await page.goto("/?lang=not%20valid");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await page.locator("#status-language").selectOption("auto");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page).not.toHaveURL(/lang=/);
  await page.goto("/?unsupported=1");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
});

test("optional browser storage cannot block locale or system theme selection", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error("blocked");
    };
    Storage.prototype.setItem = () => {
      throw new Error("blocked");
    };
    Storage.prototype.removeItem = () => {
      throw new Error("blocked");
    };
  });
  await page.emulateMedia({ colorScheme: "dark" });
  const evidence = await fixtures(page);
  await page.goto("/?lang=lb");
  await expect(page.locator("html")).toHaveAttribute("lang", "lb");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.locator("#status-theme").selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.locator("#status-language").selectOption("de");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  expect(evidence.errors).toEqual([]);
});

test("theme preference persists, follows system changes and synchronizes across tabs", async ({
  page,
  context,
}) => {
  await fixtures(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/?lang=en");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.locator("#status-theme").selectOption("light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme-preference",
    "light",
  );
  const other = await context.newPage();
  await fixtures(other);
  await other.goto("/?lang=en");
  await other.locator("#status-theme").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("#status-theme")).toHaveValue("dark");
  await page.locator("#status-theme").selectOption("system");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("forced colors and reduced motion retain readable keyboard history", async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  const evidence = await fixtures(page, {
    history: (days) => history(days, true),
  });
  await page.goto("/?lang=de");
  await page.locator("#history-chart button").last().focus();
  await page.keyboard.press("Home");
  await expect(page.locator("#history-chart button").first()).toBeFocused();
  expect(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollBehavior,
    ),
  ).toBe("auto");
  expect(evidence.errors).toEqual([]);
});

for (const language of ["fr", "en", "de", "lb"] as const) {
  test(`${language} localizes attention, missing measurements and history errors`, async ({
    page,
  }) => {
    const data = snapshot();
    const evidence = await fixtures(page, {
      status: () => data,
      history: () => ({ invalid: true }),
    });
    data.checks[0].status = "fail";
    data.status = "attention";
    await page.goto(`/?lang=${language}`);
    await expect(page.locator("#live-state")).toHaveAttribute(
      "data-state",
      "attention",
    );
    const attention = {
      fr: "Certains contrôles demandent une vérification",
      en: "Some checks need attention",
      de: "Einige Prüfungen erfordern Aufmerksamkeit",
      lb: "E puer Kontrolle mussen iwwerpréift ginn",
    };
    await expect(page.locator("#state-title")).toHaveText(attention[language]);
    const unknown = {
      fr: "Disponibilité actuelle inconnue",
      en: "Current availability is unknown",
      de: "Aktuelle Verfügbarkeit unbekannt",
      lb: "Aktuell Disponibilitéit onbekannt",
    };
    data.checkedAt = null;
    data.checks = [];
    data.status = "unknown";
    data.freshness = "missing";
    await page.locator("#refresh").click();
    await expect(page.locator("#state-title")).toHaveText(unknown[language]);
    if (language !== "en") {
      await expect(page.locator("#history-state")).not.toContainText(
        "History could not be loaded",
      );
      await expect(page.locator("#state-detail")).not.toContainText(
        "No recent observation",
      );
      await expect(page.locator("#checked-time")).not.toHaveText(
        "No observation yet",
      );
    }
    expect(evidence.errors).toEqual([]);
  });
}

test("light and dark text colors meet WCAG contrast", async ({ page }) => {
  await fixtures(page);
  await page.goto("/?lang=en");
  for (const theme of ["light", "dark"]) {
    await page.locator("#status-theme").selectOption(theme);
    const pairs = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const value = (name: string) => style.getPropertyValue(name).trim();
      return [
        ["--ink", "--paper"],
        ["--muted", "--paper"],
        ["--blue", "--paper"],
        ["--success", "--success-wash"],
        ["--attention", "--attention-wash"],
        ["--unknown", "--unknown-wash"],
      ].map(([foreground, background]) => [
        value(foreground),
        value(background),
      ]);
    });
    const luminance = (color: string) => {
      const channels = [1, 3, 5]
        .map((start) => parseInt(color.slice(start, start + 2), 16) / 255)
        .map((value) =>
          value <= 0.04045
            ? value / 12.92
            : Math.pow((value + 0.055) / 1.055, 2.4),
        );
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    for (const [foreground, background] of pairs) {
      const values = [luminance(foreground), luminance(background)].sort(
        (a, b) => b - a,
      );
      expect(
        (values[0] + 0.05) / (values[1] + 0.05),
        `${theme}: ${foreground} on ${background}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test("changing language preserves the current history, disclosure and page without another read", async ({
  page,
}) => {
  const reads: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/")) reads.push(request.url());
  });
  await fixtures(page, { history: (days) => history(days, true) });
  await page.goto("/?lang=en#content");
  await page.locator('[data-days="365"]').click();
  await expect(page.locator("#history-rows tr")).toHaveCount(365);
  await page.locator(".daily-details summary").click();
  await page.locator("#history-chart button").first().click();
  const before = reads.length;
  const loadedAt = await page.evaluate(() => performance.timeOrigin);
  await page.locator("#status-language").focus();
  await page.locator("#status-language").selectOption("fr");
  await expect(page.locator("h1")).toHaveText("État du service");
  await expect(page.locator('[data-days="365"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".daily-details")).toHaveAttribute("open", "");
  await expect(page.locator("#history-chart button").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#status-language")).toBeFocused();
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(loadedAt);
  expect(reads).toHaveLength(before);
});

test("a previously successful observation becomes unknown when its freshness expires", async ({
  page,
}) => {
  await page.clock.install({ time: Date.now() });
  await fixtures(page);
  await page.goto("/?lang=en");
  await expect(page.locator("#live-state")).toHaveAttribute(
    "data-state",
    "pass",
  );
  await page.clock.fastForward(31 * 60 * 1000);
  await expect(page.locator("#live-state")).toHaveAttribute(
    "data-state",
    "unknown",
  );
  await expect(page.locator(".service-state.success")).toHaveCount(0);
});

for (const language of ["fr", "en", "de", "lb"] as const) {
  test(`${language}: future and server-unknown observations use neutral recovery, while old observations retain history detail`, async ({
    page,
  }) => {
    const data = snapshot();
    await fixtures(page, { status: () => data });
    await page.goto(`/?lang=${language}`);
    await expect(page.locator("#live-state")).toHaveAttribute(
      "data-state",
      "pass",
    );
    const neutral = {
      fr: "La disponibilité actuelle n’a pas pu être confirmée. Essayez d’actualiser.",
      en: "Current availability could not be confirmed. Try refreshing.",
      de: "Die aktuelle Verfügbarkeit konnte nicht bestätigt werden. Bitte aktualisieren.",
      lb: "Déi aktuell Disponibilitéit konnt net bestätegt ginn. Probéiert ze aktualiséieren.",
    };
    data.checkedAt = new Date(Date.now() + 60000).toISOString();
    await page.locator("#refresh").click();
    await expect(page.locator("#live-state")).toHaveAttribute(
      "data-state",
      "unknown",
    );
    await expect(page.locator("#state-detail")).toHaveText(neutral[language]);
    await expect(page.locator(".service-state.success")).toHaveCount(0);
    data.checkedAt = new Date().toISOString();
    data.status = "unknown";
    await page.locator("#refresh").click();
    await expect(page.locator("#state-detail")).toHaveText(neutral[language]);
    await expect(page.locator(".service-state.success")).toHaveCount(0);
    data.status = "public_checks_passed";
    data.checkedAt = new Date(Date.now() - 3600000).toISOString();
    await page.locator("#refresh").click();
    await expect(page.locator("#state-detail")).not.toHaveText(
      neutral[language],
    );
    await expect(page.locator("#live-state")).toHaveAttribute(
      "data-state",
      "unknown",
    );
  });
}

test("status static content follows system dark without JavaScript", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    colorScheme: "dark",
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto(baseURL!);
  expect(
    await page
      .locator("html")
      .evaluate((root) => getComputedStyle(root).colorScheme),
  ).toBe("dark");
  expect(
    await page
      .locator(".brand")
      .evaluate((brand) => getComputedStyle(brand).color),
  ).toBe("rgb(246, 245, 239)");
  expect(
    await page
      .locator(".brand")
      .evaluate((brand) => getComputedStyle(brand).backgroundColor),
  ).toBe("rgba(0, 0, 0, 0)");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await context.close();
});
