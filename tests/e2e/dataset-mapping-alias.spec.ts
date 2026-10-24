import { expect, test } from "@playwright/test";
import type {
  DatasetProfileView,
  MappingView,
  TemplateView,
} from "../../packages/contracts/src/template-workflow";
import { profileDataset } from "../../packages/data";
import { blankTemplate } from "../../packages/templates/gallery";

test.use({ locale: "en-GB" });

test("reused XML joins display the resolved sheet and keep main-sheet grouping selectable", async ({
  page,
}) => {
  const now = "2026-10-25T12:00:00Z";
  const profile = await profileDataset(
    new TextEncoder().encode(
      "<records><record><id>001</id><items><item><name>First item</name></item><item><name>Second item</name></item></items></record></records>",
    ),
    "xml",
  );
  const value: DatasetProfileView = {
    dataset: {
      id: "xml-mapping-fixture",
      name: "Synthetic XML records.xml",
      format: "xml",
      sha256: "a".repeat(64),
      size: profile.sourceBytes,
      status: "ready",
      errorCode: null,
      structureHash: "b".repeat(64),
      createdAt: now,
      expiresAt: "2026-11-24T12:00:00Z",
      analysis: {
        attempts: 1,
        maxAttempts: 3,
        running: false,
        canRetry: false,
        retryAfterSeconds: 0,
      },
    },
    profile,
  };
  const envelope = blankTemplate();
  envelope.inputSchema = {
    type: "object",
    properties: {
      id: { type: "string" },
      items: {
        type: "array",
        items: { type: "object", properties: { name: { type: "string" } } },
      },
    },
  };
  const template: TemplateView = {
    id: "xml-template-fixture",
    name: "Synthetic item list",
    ownerId: "xml-mapping-user",
    state: "published",
    visibility: "organization",
    revision: 1,
    currentVersion: 1,
    permissions: { use: true, edit: true, publish: true, share: true },
    canDelete: true,
    envelope,
    createdAt: now,
    updatedAt: now,
  };
  const mapping: MappingView = {
    id: "legacy-xml-mapping",
    version: 1,
    name: "Saved XML item join",
    sourceDatasetId: value.dataset.id,
    structureHash: value.dataset.structureHash!,
    state: "draft",
    validation: null,
    createdAt: now,
    plan: {
      version: 1,
      name: "Saved XML item join",
      sourceSheet: "Données",
      headerRow: 1,
      recordKey: ["id"],
      fields: [{ source: "id", target: "id", type: "text" }],
      joins: [
        {
          sheet: "Données.items.item",
          headerRow: 1,
          parentKey: "__xml_record_id",
          childKey: "__xml_parent_id",
          target: "items",
          cardinality: "one-to-many",
          fields: [{ source: "name", target: "name", type: "text" }],
          expectedHeaders: ["__xml_parent_id", "name"],
          excludeRows: [],
        },
      ],
      excludeRows: [],
      includeHidden: false,
      formulaPolicy: "reject",
      expectedHeaders: ["__xml_record_id", "id"],
    },
  };
  const unexpected: string[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    let body: unknown;
    if (request.method() !== "GET") {
      unexpected.push(`${request.method()} ${path}`);
    } else if (path === "/api/session") {
      body = {
        organization: { id: "xml-mapping-workspace", name: "XML fixtures" },
        user: {
          id: "xml-mapping-user",
          name: "Synthetic account",
          role: "admin",
          preferredLocale: "en",
        },
        csrfToken: "synthetic-only",
        simulation: true,
      };
    } else if (path === "/api/capabilities") {
      body = { scanner: "disabled_in_local_simulation" };
    } else if (path === "/api/dataset-ai-policy") {
      body = {
        enabled: false,
        transferApproved: false,
        configured: false,
        dailyLimit: 0,
        usedToday: 0,
      };
    } else if (path === "/api/templates") {
      body = { items: [template], nextCursor: null };
    } else if (path === "/api/mappings") {
      body = { items: [mapping], nextCursor: null };
    } else if (path === `/api/datasets/${value.dataset.id}/profile`) {
      const sheet = url.searchParams.get("sheet") ?? profile.sheets[0].name;
      body = {
        ...value,
        pagination: {
          sheet,
          cursor: 0,
          limit: 30,
          totalRows: profile.sheets.find((entry) => entry.name === sheet)!.rows
            .length,
          nextCursor: null,
          sampleValuesTruncatedAt: 500,
          otherSheetsAreHeaderSamples: true,
        },
      };
    } else unexpected.push(`${request.method()} ${path}`);
    await route.fulfill(
      body === undefined
        ? {
            status: 404,
            json: { error: { code: "UNEXPECTED_FIXTURE_REQUEST" } },
          }
        : { json: body },
    );
  });

  await page.goto(`/#/app/dataset/${value.dataset.id}`);
  await page
    .getByLabel("Template to populate", { exact: true })
    .selectOption(template.id);
  await page
    .getByLabel("Reuse a saved mapping", { exact: true })
    .selectOption(mapping.id);

  const source = page.getByLabel("Source of table rows", { exact: true });
  await expect(source).toHaveValue("Data.items.item");
  await expect(source.locator("option:checked")).toHaveText(
    "Join sheet Data.items.item",
  );
  await expect(source.locator('option[value="Data"]')).toHaveCount(0);
  await expect(
    page.getByLabel("Key in the main sheet", { exact: true }),
  ).toHaveValue("__xml_record_id");
  await expect(
    page.getByLabel("Key in the linked sheet", { exact: true }),
  ).toHaveValue("__xml_parent_id");

  await source.selectOption("same");
  await expect(source).toHaveValue("same");
  await expect(source.locator("option:checked")).toHaveText(
    "Group the main sheet",
  );
  await expect(
    page.getByLabel("Key in the linked sheet", { exact: true }),
  ).toHaveCount(0);

  await source.selectOption("Data.items.item");
  await expect(source).toHaveValue("Data.items.item");
  await expect(
    page.getByLabel("Key in the linked sheet", { exact: true }),
  ).toBeVisible();
  expect(unexpected).toEqual([]);
});
