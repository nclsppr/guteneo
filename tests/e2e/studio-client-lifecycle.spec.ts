import { expect, test, type Page } from "@playwright/test";
import {
  profileDataset,
  suggestDatasetSchemaWithOpenAI,
} from "../../packages/data";
import { blankTemplate } from "../../packages/templates/gallery";

// Every response is a local fixture. No inference provider or real account is used.
async function fixture(
  page: Page,
  options: { mappingReady?: Promise<void>; failTemplateOnce?: boolean } = {},
) {
  const profile = await profileDataset(
    new TextEncoder().encode("Name\nSynthetic Customer\n"),
    "csv",
  );
  const sheet = profile.sheets[0];
  const proposed = await suggestDatasetSchemaWithOpenAI(profile, {
    apiKey: "synthetic-not-a-secret",
    model: "synthetic-contract-model",
    organizationConsent: true,
    remainingCalls: 1,
    fetch: async () =>
      Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  name: "Synthetic document",
                  sourceSheet: sheet.name,
                  headerRow: 1,
                  recordKey: ["Name"],
                  fields: [
                    {
                      source: "Name",
                      target: "customerName",
                      type: "text",
                      required: true,
                      dateOrder: null,
                      decimalSeparator: null,
                      scale: null,
                    },
                  ],
                  group: null,
                  joins: [],
                  ambiguities: [],
                }),
              },
            ],
          },
        ],
      }),
  });
  const writes: string[] = [];
  let templates = 0;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== "GET") writes.push(path);
    if (path === "/api/mappings" && request.method() === "POST") {
      await options.mappingReady;
      await route.fulfill({
        json: { id: "map_saved", version: 1, plan: proposed.mapping },
      });
    } else if (path === "/api/templates" && request.method() === "POST") {
      templates++;
      await route.fulfill(
        options.failTemplateOnce && templates === 1
          ? { status: 503, json: { error: { code: "INTERNAL_ERROR" } } }
          : { json: { id: "tpl_created" } },
      );
    } else if (path.endsWith("/analyze")) {
      const { records, ...validation } = proposed.validation;
      await route.fulfill({
        json: {
          ...proposed,
          validation: { ...validation, examples: records.slice(0, 3) },
        },
      });
    } else
      await route.fulfill({
        json:
          path === "/api/session"
            ? {
                organization: { id: "org_studio", name: "Synthetic workshop" },
                user: {
                  id: "user_studio",
                  role: "admin",
                  name: "Synthetic administrator",
                  preferredLocale: "en",
                },
                csrfToken: "synthetic-only",
                simulation: true,
              }
            : path === "/api/dataset-ai-policy"
              ? {
                  enabled: true,
                  configured: true,
                  transferApproved: true,
                  dailyLimit: 10,
                  usedToday: 0,
                }
              : path === "/api/datasets/ds_fixture/profile"
                ? {
                    dataset: {
                      id: "ds_fixture",
                      name: "Synthetic.csv",
                      format: "csv",
                      status: "ready",
                      size: 30,
                      sha256: "a".repeat(64),
                      structureHash: "b".repeat(64),
                      createdAt: "2026-11-08T00:00:00Z",
                      expiresAt: "2099-11-08T00:00:00Z",
                      errorCode: null,
                      analysis: {
                        attempts: 1,
                        maxAttempts: 3,
                        running: false,
                        canRetry: false,
                        retryAfterSeconds: 0,
                      },
                    },
                    profile,
                    pagination: {
                      sheet: sheet.name,
                      cursor: 0,
                      limit: 30,
                      totalRows: 2,
                      nextCursor: null,
                      sampleValuesTruncatedAt: 200,
                      otherSheetsAreHeaderSamples: true,
                    },
                  }
                : path === "/api/templates" || path === "/api/mappings"
                  ? { items: [], nextCursor: null }
                  : path === "/api/templates/tpl_created"
                    ? null
                    : {},
      });
  });
  return writes;
}

async function reviewProposal(page: Page) {
  await page.goto("/#/app/studio/dataset/ds_fixture");
  await page
    .getByRole("button", {
      name: "Propose a new template with AI",
      exact: true,
    })
    .click();
  await page
    .getByLabel("I have reviewed the proposed fields and tables.", {
      exact: true,
    })
    .check();
}
const adopt = (page: Page) =>
  page.getByRole("button", {
    name: "Create the private draft and its mapping",
    exact: true,
  });

test("partial schema adoption retries only the missing private draft", async ({
  page,
}) => {
  const writes = await fixture(page, { failTemplateOnce: true });
  await reviewProposal(page);
  await adopt(page).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(adopt(page)).toBeEnabled();
  await adopt(page).click();
  await expect(page).toHaveURL(/\/app\/studio\/template\/tpl_created$/);
  expect(writes).toEqual([
    "/api/datasets/ds_fixture/analyze",
    "/api/mappings",
    "/api/templates",
    "/api/templates",
  ]);
});

test("a mapping response after A to B to A cannot create the proposed private draft", async ({
  page,
}) => {
  let release!: () => void;
  const mappingReady = new Promise<void>((resolve) => {
    release = resolve;
  });
  const writes = await fixture(page, { mappingReady });
  await reviewProposal(page);
  await adopt(page).click();
  await expect.poll(() => writes.length).toBe(2);
  await page.evaluate(() => {
    const original = location.hash;
    location.hash = "#/app/studio/templates";
    location.hash = original;
  });
  release();
  await expect(adopt(page)).toBeEnabled();
  expect(writes).toEqual(["/api/datasets/ds_fixture/analyze", "/api/mappings"]);
  await expect(page).toHaveURL(/\/app\/studio\/dataset\/ds_fixture$/);
});

test("a delayed generation result cannot navigate a departed template after A to B to A", async ({
  page,
}) => {
  const writes = await fixture(page);
  const envelope = blankTemplate();
  envelope.name = "Synthetic template";
  await page.route("**/api/templates/tpl_fixture", (route) =>
    route.fulfill({
      json: {
        id: "tpl_fixture",
        name: envelope.name,
        ownerId: "user_studio",
        state: "published",
        visibility: "private",
        revision: 1,
        currentVersion: 1,
        permissions: { use: true, edit: true, publish: true, share: true },
        canDelete: true,
        envelope,
        createdAt: "2026-11-08T00:00:00Z",
        updatedAt: "2026-11-08T00:00:00Z",
      },
    }),
  );
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/generation-jobs", async (route) => {
    writes.push("/api/generation-jobs");
    await ready;
    await route.fulfill({ json: { id: "gen_delayed" } });
  });
  await page.goto("/#/app/studio/template/tpl_fixture");
  await page
    .getByRole("button", { name: "Data and generation", exact: true })
    .click();
  const generate = page.getByRole("button", {
    name: "Generate PDF without sending",
    exact: true,
  });
  await generate.click();
  await expect.poll(() => writes.length).toBe(1);
  await page.evaluate(() => {
    const original = location.hash;
    location.hash = "#/app/studio/templates";
    location.hash = original;
  });
  release();
  await expect(generate).toBeEnabled();
  await expect(page).toHaveURL(/\/app\/studio\/template\/tpl_fixture$/);
  expect(writes).toEqual(["/api/generation-jobs"]);
});
