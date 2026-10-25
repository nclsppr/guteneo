import { test, expect } from "@playwright/test";
import { fixtures } from "./fixtures";

test("customer status reads only availability and history; internal proof cannot turn it green", async ({
  page,
}) => {
  const reads: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.pathname.startsWith("/api/") ||
      url.pathname === "/qualification.json"
    )
      reads.push(url.pathname);
  });
  const evidence = await fixtures(page, {
    http: 503,
    e2eStatus: { status: "passed" },
    qualification: { status: "passed" },
  });
  await page.goto("/?lang=en#verification");
  await expect(page.locator("#live-state")).toHaveAttribute(
    "data-state",
    "unknown",
  );
  await expect(page.locator("#history-chart button")).toHaveCount(30);
  expect(reads.sort()).toEqual(["/api/history", "/api/status"]);
  await expect(
    page.locator('[role="tab"], #coverage, #e2e-state, #qualification-state'),
  ).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(
    /GitHub|qualification|Qualification|Authenticated distribution|Technical view/,
  );
  expect(evidence.errors).toEqual([]);
});
