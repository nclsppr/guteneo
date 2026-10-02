import { mkdir } from "node:fs/promises";
import { test, expect } from "./fixtures";
import type { Session } from "../../apps/web/src/api";
import type {
  DistributionInput,
  DistributionView,
  GenerationJobView,
  GenerationResultView,
  Page as ApiPage,
  TemplateView,
} from "../../packages/contracts/src/template-workflow";
import { letterTemplate } from "../../packages/templates/gallery";

test("web distribution assigns channels to selected records without a Cartesian recipient leak", async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  await page.goto("/#/app");
  await page.getByRole("button", { name: "Entrer dans l’Atelier" }).click();
  await expect(
    page.getByRole("heading", { name: "Votre correspondance, au clair." }),
  ).toBeVisible();
  const session = (await (
    await page.request.get("/api/session")
  ).json()) as Session;
  expect(session.simulation).toBe(true);
  const headers = {
    Origin: "http://localhost:8787",
    "X-CSRF-Token": session.csrfToken,
  };
  const envelope = letterTemplate();
  envelope.name += " distribution " + crypto.randomUUID().slice(0, 8);
  const create = await page.request.post("/api/templates", {
    headers,
    data: { envelope },
  });
  expect(create.status(), await create.text()).toBe(201);
  const model = (await create.json()) as TemplateView;
  const publish = await page.request.post(
    `/api/templates/${model.id}/publish`,
    { headers, data: { expectedRevision: model.revision } },
  );
  expect(publish.status(), await publish.text()).toBe(200);
  const generated = await page.request.post("/api/generation-jobs", {
    headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
    data: {
      mode: "generate_only",
      templateId: model.id,
      records: [
        {
          recordId: "client-a",
          data: { ...envelope.sampleData, subject: "Document A" },
        },
        {
          recordId: "client-b",
          data: { ...envelope.sampleData, subject: "Document B" },
        },
      ],
    },
  });
  expect(generated.status(), await generated.text()).toBe(202);
  const job = (await generated.json()) as GenerationJobView;
  await expect
    .poll(
      async () =>
        (
          (await (
            await page.request.get(`/api/generation-jobs/${job.id}`)
          ).json()) as GenerationJobView
        ).generated,
      { timeout: 90000 },
    )
    .toBe(2);
  const results = (await (
    await page.request.get(`/api/generation-jobs/${job.id}/results`)
  ).json()) as ApiPage<GenerationResultView>;
  expect(
    results.items.every((result) => result.documentStatus === "ready"),
  ).toBe(true);
  expect(new Set(results.items.map((result) => result.documentHash)).size).toBe(
    2,
  );
  await page.goto(`/#/app/generation/${job.id}`);
  await page
    .getByRole("button", { name: "Sélectionner les PDF vérifiés affichés" })
    .click();
  await page
    .getByRole("button", { name: "Préparer une distribution (2)" })
    .click();
  await page
    .getByLabel("Documents pour la destination 1", { exact: true })
    .selectOption("selection");
  const group1 = page.getByRole("group", {
    name: "Documents concernés par la destination 1",
    exact: true,
  });
  await group1
    .getByRole("checkbox", { name: "client-b", exact: true })
    .uncheck();
  const destination1 = page.getByRole("group", {
    name: "Destination 1",
    exact: true,
  });
  await destination1
    .getByLabel("Numéro international", { exact: true })
    .fill("+33123456789");
  await page
    .getByRole("button", { name: "Ajouter une destination ou un canal" })
    .click();
  await page
    .getByLabel("Documents pour la destination 2", { exact: true })
    .selectOption("selection");
  await page
    .getByRole("group", {
      name: "Documents concernés par la destination 2",
      exact: true,
    })
    .getByRole("checkbox", { name: "client-a", exact: true })
    .uncheck();
  await page.getByLabel("Canal 2", { exact: true }).selectOption("email");
  const destination2 = page.getByRole("group", {
    name: "Destination 2",
    exact: true,
  });
  await destination2
    .getByLabel("Adresse e-mail", { exact: true })
    .fill("client-b@example.test");
  await destination2
    .getByLabel("Objet de l’e-mail", { exact: true })
    .fill("Document de démonstration");
  await destination2
    .getByLabel("Corps de l’e-mail", { exact: true })
    .fill("Votre document synthétique.");
  await expect(
    page.getByRole("checkbox", { name: /Je demande explicitement/ }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Ajouter une destination ou un canal" })
    .click();
  await page
    .getByLabel("Documents pour la destination 3", { exact: true })
    .selectOption("selection");
  await page
    .getByRole("group", {
      name: "Documents concernés par la destination 3",
      exact: true,
    })
    .getByRole("checkbox", { name: "client-a", exact: true })
    .uncheck();
  await page
    .getByRole("group", { name: "Destination 3", exact: true })
    .getByLabel("Numéro international", { exact: true })
    .fill("+33123456790");
  const multichannel = page.getByRole("checkbox", {
    name: /Je demande explicitement/,
  });
  await expect(multichannel).toHaveAccessibleName(/pour 1 PDF/);
  await multichannel.check();
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/distribution-plans") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Préparer les associations et les devis" })
    .click();
  const response = await responsePromise;
  expect(response.status(), await response.text()).toBe(201);
  const submitted = response.request().postDataJSON() as DistributionInput;
  expect(submitted.explicitMultichannel).toBe(true);
  expect(
    submitted.entries.map((entry) => [entry.recordId, entry.channel]).sort(),
  ).toEqual([
    ["client-a", "fax"],
    ["client-b", "email"],
    ["client-b", "fax"],
  ]);
  const plan = (await response.json()) as DistributionView;
  expect(plan.entries).toHaveLength(3);
  for (const entry of plan.entries) {
    const record = results.items.find(
      (result) => result.recordId === entry.recordId,
    )!;
    expect(entry.documentId).toBe(record.documentId);
    expect(entry.documentHash).toBe(record.documentHash);
    if (entry.dispatchId) {
      const detail = await (
        await page.request.get(`/api/dispatches/${entry.dispatchId}`)
      ).json();
      expect(detail.approval).toBeFalsy();
      expect(detail.attempts).toHaveLength(0);
    }
  }
  await expect(
    page.getByRole("heading", { name: "Distribution préparée" }),
  ).toBeVisible();
  await mkdir("reports/templates-data", { recursive: true });
  await page.screenshot({
    path: `reports/templates-data/distribution-selection-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

test("multichannel intent remains available when two records reuse the same PDF artifact", async ({
  page,
}) => {
  await page.goto("/#/app");
  await page.getByRole("button", { name: "Entrer dans l’Atelier" }).click();
  await expect(
    page.getByRole("heading", { name: "Votre correspondance, au clair." }),
  ).toBeVisible();
  // Explicit UI fixture for an exact-byte deduplication outcome. No generation,
  // approval or distribution mutation is made by this scenario.
  const jobId = "synthetic-shared-artifact";
  await page.route(`**/api/generation-jobs/${jobId}`, (route) =>
    route.fulfill({
      json: {
        id: jobId,
        templateId: "synthetic-template",
        templateVersion: 1,
        datasetId: null,
        mappingId: null,
        mappingVersion: null,
        mode: "generate_only",
        state: "completed",
        total: 2,
        generated: 2,
        failed: 0,
        pending: 0,
        cancelled: 0,
        createdAt: "2026-09-21T00:00:00Z",
        updatedAt: "2026-09-21T00:00:00Z",
      },
    }),
  );
  await page.route(`**/api/generation-jobs/${jobId}/results`, (route) =>
    route.fulfill({
      json: {
        items: ["same-a", "same-b"].map((recordId) => ({
          recordId,
          state: "generated",
          attempts: 1,
          inputHash: "0".repeat(64),
          documentId: "synthetic-identical-document",
          documentHash: "1".repeat(64),
          documentStatus: "ready",
          documentUrl: null,
          errorCode: null,
        })),
        nextCursor: null,
      },
    }),
  );
  await page.goto(`/#/app/generation/${jobId}`);
  await page
    .getByRole("button", { name: "Sélectionner les PDF vérifiés affichés" })
    .click();
  await page
    .getByRole("button", { name: "Préparer une distribution (2)" })
    .click();
  await page
    .getByLabel("Documents pour la destination 1", { exact: true })
    .selectOption("selection");
  await page
    .getByRole("group", {
      name: "Documents concernés par la destination 1",
      exact: true,
    })
    .getByRole("checkbox", { name: "same-b", exact: true })
    .uncheck();
  await page
    .getByRole("button", { name: "Ajouter une destination ou un canal" })
    .click();
  await page.getByLabel("Canal 2", { exact: true }).selectOption("email");
  await page
    .getByLabel("Documents pour la destination 2", { exact: true })
    .selectOption("selection");
  await page
    .getByRole("group", {
      name: "Documents concernés par la destination 2",
      exact: true,
    })
    .getByRole("checkbox", { name: "same-a", exact: true })
    .uncheck();
  const confirmation = page.getByRole("checkbox", {
    name: /Je demande explicitement/,
  });
  await expect(confirmation).toHaveAccessibleName(/pour 1 PDF/);
  await expect(confirmation).not.toBeChecked();
  await expect(confirmation).toHaveAttribute("required", "");
});
