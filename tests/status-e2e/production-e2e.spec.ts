import { test, expect } from "@playwright/test";
import { fixtures } from "./fixtures";

function report() {
  const pages = [
    "home_fr",
    "home_en",
    "home_de",
    "home_lb",
    "roles",
    "developers",
    "chatgpt",
  ];
  const paths = [
    "/",
    "/?lang=en",
    "/?lang=de",
    "/?lang=lb",
    "/roles/",
    "/developpeurs/",
    "/assistants/chatgpt/",
    "/release.json",
    "/api/health",
    "/api/capabilities",
    "/api/documents",
    "/api/dispatches",
    "/api/overview",
    "/mcp",
  ];
  const ids = [
    ...["desktop", "phone"].flatMap((target) =>
      pages.map((id) => `browser:${target}:${id}`),
    ),
    ...paths.map((path) => `http:${path}`),
  ];
  const latest = {
    runId: "101",
    attempt: 1,
    runUrl: "https://github.com/nclsppr/guteneo/actions/runs/101/attempts/1",
    completedAt: new Date().toISOString(),
    runnerCommit: "a".repeat(40),
    testedReleaseCommit: "b".repeat(40) as string | null,
    status: "passed",
    checks: ids.map((id) => ({
      id,
      status: "pass",
      code: "OK",
      durationMs: 25,
      httpStatus: null as number | null,
    })),
  };
  return {
    schema: 1,
    generatedAt: new Date().toISOString(),
    status: "passed",
    freshness: "fresh",
    staleAfterSeconds: 28800,
    releaseState: "current",
    currentReleaseCommit: "b".repeat(40),
    latest,
    authenticated: {
      status: "blocked",
      code: "DEDICATED_AUTHENTICATED_FIXTURES_NOT_CONFIGURED",
    },
    history: [
      {
        runId: latest.runId,
        attempt: latest.attempt,
        completedAt: latest.completedAt,
        status: latest.status,
        testedReleaseCommit: latest.testedReleaseCommit,
      },
    ],
  };
}

for (const width of [1440, 390, 320]) {
  test(`public browser report and neutral authenticated coverage at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const evidence = await fixtures(page, { e2eStatus: report() });
    await page.goto("/");
    await expect(page.locator("#e2e-title")).toHaveText(
      "Parcours publics vérifiés dans le navigateur",
    );
    await expect(page.locator("#e2e-state")).toHaveClass(/success/);
    await expect(page.locator("#e2e-authenticated")).toHaveClass(/historical/);
    await expect(page.locator("#e2e-authenticated")).toHaveText("À qualifier");
    await expect(page.locator("#e2e-tested-release")).toHaveText(
      "b".repeat(12),
    );
    await expect(page.locator("#e2e-run-link")).toHaveAttribute(
      "href",
      "https://github.com/nclsppr/guteneo/actions/runs/101/attempts/1",
    );
    await expect(page.locator("#e2e-checks li")).toHaveCount(28);
    await expect(page.locator("#e2e-counts")).toContainText(
      "28 contrôles réussis",
    );
    await expect(page.locator("#passed-count")).toHaveText("14");
    await expect(page.locator("#live-state")).toHaveAttribute(
      "data-state",
      "pass",
    );
    await page.locator("#e2e-check-details summary").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#e2e-check-details")).toHaveAttribute(
      "open",
      "",
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.locator(".browser-panel").screenshot({
      path: `test-results/status/public-browser-report-${width}.png`,
    });
    expect(evidence.errors).toEqual([]);
    expect(evidence.external).toEqual([]);
  });
}

test("the browser report uses English source copy and reads historical developer checks", async ({
  page,
}) => {
  const evidence = await fixtures(page, { e2eStatus: report() });
  await page.goto("/?lang=en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("#browser-title")).toHaveText(
    "Public browser journeys",
  );
  await expect(page.locator("#e2e-title")).toHaveText(
    "Public journeys verified in the browser",
  );
  await expect(page.locator("#e2e-counts")).toContainText("28 checks passed");
  await page.locator("#e2e-check-details summary").click();
  await expect(page.locator("#e2e-checks")).toContainText(
    "Public contract · Developer guide",
  );
  await expect(page.locator("#e2e-authenticated")).toHaveText(
    "Qualification pending",
  );
  expect(evidence.errors).toEqual([]);
  expect(evidence.external).toEqual([]);
});

test("missing browser evidence leaves the availability result positive", async ({
  page,
}) => {
  const evidence = await fixtures(page);
  await page.goto("/");
  await expect(page.locator("#e2e-title")).toHaveText(
    "Aucun rapport de navigateur reçu",
  );
  await expect(page.locator("#e2e-state")).toHaveClass(/historical/);
  await expect(page.locator("#e2e-run")).toBeHidden();
  await expect(page.locator("#live-state")).toHaveAttribute(
    "data-state",
    "pass",
  );
  await expect(page.locator("#passed-count")).toHaveText("14");
  expect(evidence.errors).toEqual([]);
});

for (const scenario of [
  "stale",
  "changed",
  "failure",
  "blocked",
  "inconsistent",
  "unsafe-link",
] as const) {
  test(`browser report handles ${scenario} independently`, async ({ page }) => {
    const data = report();
    let expected = "";
    if (scenario === "stale") {
      data.latest.completedAt = new Date(
        Date.now() - 9 * 3600000,
      ).toISOString();
      data.freshness = "stale";
      data.status = "unknown";
      expected = "Rapport ancien — situation actuelle inconnue";
    } else if (scenario === "changed") {
      data.currentReleaseCommit = "c".repeat(40);
      data.releaseState = "changed";
      data.status = "unknown";
      expected = "Une nouvelle version a été publiée depuis ce rapport";
    } else if (scenario === "failure") {
      data.latest.checks[0].status = "fail";
      data.latest.checks[0].code = "BROWSER_ASSERTION_FAILED";
      data.latest.status = "attention";
      data.status = "attention";
      expected = "Des parcours publics sont à examiner";
    } else if (scenario === "blocked") {
      data.latest.checks[0].status = "blocked";
      data.latest.checks[0].code = "EXECUTION_UNAVAILABLE";
      data.latest.status = "unknown";
      data.status = "unknown";
      expected = "L’exécution des parcours publics est incomplète";
    } else if (scenario === "inconsistent") {
      data.freshness = "stale";
      expected = "Rapport de navigateur indisponible";
    } else {
      data.latest.runUrl = "https://example.invalid/private-report";
      expected = "Rapport de navigateur indisponible";
    }
    const evidence = await fixtures(page, { e2eStatus: data });
    await page.goto("/");
    await expect(page.locator("#e2e-title")).toHaveText(expected);
    await expect(page.locator("#e2e-state")).toHaveClass(
      scenario === "failure" ? /failure/ : /historical/,
    );
    await expect(page.locator("#e2e-authenticated")).toHaveClass(/historical/);
    await expect(page.locator("#live-state")).toHaveAttribute(
      "data-state",
      "pass",
    );
    await expect(page.locator("#passed-count")).toHaveText("14");
    if (scenario === "unsafe-link")
      await expect(page.locator("#e2e-run-link")).not.toHaveAttribute("href");
    expect(evidence.errors).toEqual([]);
    expect(evidence.external).toEqual([]);
  });
}
