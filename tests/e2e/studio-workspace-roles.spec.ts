import { expect, test, type BrowserContext } from "@playwright/test";
import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { letterTemplate } from "../../packages/templates/gallery";
import {
  workspacePermissions,
  type WorkspaceRole,
} from "../../packages/contracts/src/roles";
import type {
  DatasetProfileView,
  DistributionInput,
  DistributionView,
  GenerationJobView,
  GenerationResultView,
  TemplateView,
} from "../../packages/contracts/src/template-workflow";

// Browser HTTP fixtures, like workspace-roles.spec.ts. The integration tests
// exercise real membership/tenant/private-document authorization. These fixtures
// never fall through to an API, provider, approval, confirmation or AI request.
const now = "2026-10-02T10:00:00Z";
const ids = {
  template: "studio-role-template",
  dataset: "studio-role-dataset",
  job: "studio-role-generation",
  record: "studio-role-record",
  document: "studio-role-private-pdf",
  distribution: "studio-role-distribution",
  dispatch: "studio-role-dispatch",
};
const reviewNotice =
  "La préparation rend les PDF sélectionnés consultables par les approbateurs de cet atelier pour examiner ces demandes. Elle ne déclenche aucun envoi.";

async function studioFixture(context: BrowserContext, role: WorkspaceRole) {
  const pdf = await PDFDocument.create();
  pdf.addPage([595, 842]).drawText("PRIVATE STUDIO REVIEW PDF 001");
  const bytes = Buffer.from(await pdf.save());
  const hash = createHash("sha256").update(bytes).digest("hex");
  const state = {
    role,
    canApprove: false,
    prepared: role === "viewer",
    writes: [] as { path: string; body: DistributionInput }[],
    unexpected: [] as string[],
    contentReads: [] as { role: WorkspaceRole; dispatchId: string | null }[],
  };
  const envelope = letterTemplate();
  const template: TemplateView = {
    id: ids.template,
    name: "Modèle consultable du studio",
    ownerId: "studio-operator",
    state: "published",
    visibility: "organization",
    revision: 2,
    currentVersion: 1,
    // Workspace read-only permissions must still win over an existing template
    // capability (in particular `use`, which also permits consultation).
    permissions: { use: true, edit: true, publish: true, share: true },
    canDelete: true,
    envelope,
    createdAt: now,
    updatedAt: now,
  };
  const profile: DatasetProfileView & {
    pagination: {
      sheet: string;
      cursor: number;
      limit: number;
      totalRows: number;
      nextCursor: null;
      sampleValuesTruncatedAt: number;
      otherSheetsAreHeaderSamples: boolean;
    };
  } = {
    dataset: {
      id: ids.dataset,
      name: "Données fictives du studio.csv",
      format: "csv",
      sha256: "a".repeat(64),
      size: 24,
      status: "ready",
      errorCode: null,
      structureHash: "b".repeat(64),
      createdAt: now,
      expiresAt: "2026-11-01T10:00:00Z",
      analysis: {
        attempts: 1,
        maxAttempts: 3,
        running: false,
        canRetry: false,
        retryAfterSeconds: 0,
      },
    },
    profile: {
      version: 1,
      format: "csv",
      sourceBytes: 24,
      issues: [],
      sheets: [
        {
          name: "Données",
          hidden: false,
          headerCandidates: [1],
          merges: [],
          rows: ["Référence", "DEMO-001"].map((raw, index) => ({
            rowNumber: index + 1,
            hidden: false,
            cells: [{ column: 1, address: `A${index + 1}`, raw, kind: "text" }],
          })),
        },
      ],
    },
    pagination: {
      sheet: "Données",
      cursor: 0,
      limit: 30,
      totalRows: 2,
      nextCursor: null,
      sampleValuesTruncatedAt: 500,
      otherSheetsAreHeaderSamples: true,
    },
  };
  const job: GenerationJobView = {
    id: ids.job,
    templateId: ids.template,
    templateVersion: 1,
    datasetId: ids.dataset,
    mappingId: "studio-role-mapping",
    mappingVersion: 1,
    mode: "generate_only",
    state: role === "viewer" ? "running" : "completed",
    total: role === "viewer" ? 3 : 1,
    generated: 1,
    failed: role === "viewer" ? 1 : 0,
    pending: role === "viewer" ? 1 : 0,
    cancelled: 0,
    createdAt: now,
    updatedAt: now,
  };
  const result: GenerationResultView = {
    recordId: ids.record,
    state: "generated",
    attempts: 1,
    inputHash: "c".repeat(64),
    documentId: ids.document,
    documentHash: hash,
    documentStatus: "ready",
    documentUrl: `/api/documents/${ids.document}/content`,
    errorCode: null,
  };
  const plan: DistributionView = {
    id: ids.distribution,
    jobId: ids.job,
    manifestHash: "d".repeat(64),
    createdAt: now,
    pendingCount: role === "viewer" ? 1 : 0,
    errorCount: role === "viewer" ? 1 : 0,
    entries: [
      {
        entryId: "record-0-destination-0",
        recordId: ids.record,
        channel: "fax",
        recipient: { phone: "+33123456789" },
        documentId: ids.document,
        documentHash: hash,
        templateId: ids.template,
        templateVersion: 1,
        dispatchId: ids.dispatch,
        errorCode: null,
      },
    ],
  };
  if (role === "viewer") {
    plan.entries.push({
      ...plan.entries[0],
      entryId: "postal-awaiting-review",
      channel: "postal",
      recipient: { name: "Entreprise fictive" },
      dispatchId: null,
    });
  }
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.slice(4);
    const method = request.method();
    let body: unknown;
    if (
      method === "POST" &&
      path === "/distribution-plans" &&
      state.role === "member"
    ) {
      const input = request.postDataJSON() as DistributionInput;
      state.writes.push({ path, body: input });
      state.prepared = true;
      body = plan;
    } else if (method !== "GET") {
      state.unexpected.push(`${method} ${path}`);
    } else if (path === "/session") {
      body = {
        organization: {
          id: "studio-role-workspace",
          name: "Atelier des rôles",
        },
        user: {
          id:
            state.role === "supervisor" ? "studio-approver" : "studio-operator",
          name: "Camille Exemple",
          role: state.role,
          supervisorCanApprove: state.canApprove,
          supervisorCanReport: false,
        },
        permissions: workspacePermissions(state.role, {
          canApprove: state.canApprove,
        }),
        csrfToken: "studio-role-ui-fixture",
        simulation: true,
      };
    } else if (path === "/capabilities")
      body = { scanner: "disabled_in_local_simulation" };
    else if (path === "/dataset-ai-policy")
      body = {
        enabled: false,
        transferApproved: false,
        configured: false,
        dailyLimit: 0,
        usedToday: 0,
      };
    else if (path === "/templates")
      body = { items: [template], nextCursor: null };
    else if (path === `/templates/${ids.template}`) body = template;
    else if (path === "/datasets")
      body = { items: [profile.dataset], nextCursor: null };
    else if (path === `/datasets/${ids.dataset}/profile`) body = profile;
    else if (path === "/generation-jobs")
      body = { items: [job], nextCursor: null };
    else if (path === `/generation-jobs/${ids.job}`) body = job;
    else if (path === `/generation-jobs/${ids.job}/results`)
      body = { items: [result], nextCursor: null };
    else if (path === "/senders") body = { items: [], nextCursor: null };
    else if (
      path === `/distribution-plans/${ids.distribution}` &&
      state.prepared
    )
      body = plan;
    else if (path === `/dispatches/${ids.dispatch}` && state.prepared)
      body = {
        dispatch: {
          id: ids.dispatch,
          document_id: ids.document,
          channel: "fax",
          recipient_json: plan.entries[0].recipient,
          status: "prepared",
          mode: "simulation",
          estimated_minor: 10,
          ceiling_minor: 200,
          currency: "EUR",
          fingerprint: "studio-review-immutable-version",
          created_at: now,
          updated_at: now,
        },
        events: [],
        attempts: [],
        approval: null,
      };
    else if (path === `/documents/${ids.document}/content`) {
      const dispatchId = url.searchParams.get("dispatchId");
      state.contentReads.push({ role: state.role, dispatchId });
      // A supervisor's read in this UI fixture succeeds only with the exact
      // dispatch context. A missing or stale context makes PDF.js fail visibly.
      if (
        state.role === "supervisor" &&
        (!state.canApprove || !state.prepared || dispatchId !== ids.dispatch)
      ) {
        await route.fulfill({
          status: 404,
          json: { error: { code: "NOT_FOUND" } },
        });
        return;
      }
      await route.fulfill({
        body: bytes,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'inline; filename="document.pdf"',
          "Cache-Control": "private, no-store",
          "X-Document-SHA256": hash,
        },
      });
      return;
    } else state.unexpected.push(`${method} ${path}`);
    await route.fulfill(
      body === undefined
        ? {
            status: 404,
            json: { error: { code: "UNEXPECTED_FIXTURE_REQUEST" } },
          }
        : { status: 200, json: body },
    );
  });
  return { state, hash };
}

test("observer consults studio routes while all preparation controls stay unavailable", async ({
  page,
  context,
}) => {
  const { state } = await studioFixture(context, "viewer");
  await page.goto("/#/app/templates?new=blank");
  await expect(
    page.getByRole("heading", {
      name: "Modèles de démonstration",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Modèle consultable du studio",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Créer un document", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('main input[type="file"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Supprimer/ })).toHaveCount(0);
  const copies = page.getByRole("button", {
    name: /^Créer ma copie privée de/,
  });
  await expect(copies).toHaveCount(5);
  for (const button of await copies.all()) await expect(button).toBeDisabled();

  await page.goto(`/#/app/template/${ids.template}`);
  await expect(
    page.getByRole("heading", {
      name: "Modèle consultable du studio",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Nom du modèle", { exact: true }),
  ).toBeDisabled();
  for (const name of [
    "Enregistrer le brouillon",
    "Publier la version",
    "Dupliquer le modèle",
    "Archiver",
    "Partage",
  ])
    await expect(
      page.getByRole("button", { name, exact: true }),
    ).toBeDisabled();
  await expect(page.getByRole("button", { name: /Supprimer/ })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Données et génération", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Créer votre PDF", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Vérifier un aperçu PDF", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", {
      name: "Générer le PDF sans envoi",
      exact: true,
    }),
  ).toBeDisabled();
  for (const input of await page
    .locator("main form input, main form textarea")
    .all())
    await expect(input).toBeDisabled();

  await page.goto("/#/app/datasets");
  await expect(
    page.getByRole("heading", { name: "Mes données", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Données fictives du studio.csv",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator('main input[type="file"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Importer/ })).toHaveCount(0);
  await page.goto(`/#/app/dataset/${ids.dataset}`);
  await expect(
    page.getByRole("region", {
      name: "Aperçu original — Données",
      exact: true,
    }),
  ).toContainText("DEMO-001");
  await expect(
    page.getByRole("button", {
      name: /Valider|Enregistrer|Générer|Analyser à nouveau/,
    }),
  ).toHaveCount(0);
  await expect(page.locator("main form")).toHaveCount(0);

  await page.goto("/#/app/generations");
  await expect(
    page.getByRole("heading", { name: "Générations", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Créer un document", exact: true }),
  ).toHaveCount(0);
  await page.goto(`/#/app/generation/${ids.job}`);
  await expect(
    page.getByRole("region", {
      name: "Résultats de cette génération",
      exact: true,
    }),
  ).toContainText(ids.record);
  await expect(
    page.getByRole("checkbox", {
      name: `Sélectionner ${ids.record}`,
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", {
      name: /Annuler les éléments|Reprendre les échecs|Préparer une distribution|Sélectionner les PDF/,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Voir le PDF", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Voir la provenance", exact: true }),
  ).toBeEnabled();

  await page.goto(`/#/app/distribution/${ids.distribution}`);
  await expect(
    page.getByRole("heading", { name: "Distribution préparée", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Distribution préparée", exact: true }),
  ).toContainText(ids.record);
  await expect(
    page.getByRole("button", {
      name: /Préparer|Réessayer|Vérifier le PDF postal/,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /approuver|poursuivre/ }),
  ).toHaveCount(0);
  await expect(
    page.locator(`a[href="#/app/dispatch/${ids.dispatch}"]`),
  ).toHaveText("Ouvrir");
  expect(state.writes).toEqual([]);
  expect(state.unexpected).toEqual([]);
});

test("operator discloses review access before preparation and approver opens the exact private PDF with dispatch context", async ({
  page,
  context,
}) => {
  const { state, hash } = await studioFixture(context, "member");
  await page.goto(`/#/app/generation/${ids.job}`);
  await page
    .getByRole("checkbox", { name: `Sélectionner ${ids.record}`, exact: true })
    .check();
  await page
    .getByRole("button", { name: "Préparer une distribution (1)", exact: true })
    .click();
  const submit = page.getByRole("button", {
    name: "Préparer les associations et les devis",
    exact: true,
  });
  const disclosure = page.getByText(reviewNotice, { exact: true });
  await expect(disclosure).toBeVisible();
  expect(
    await disclosure.evaluate((element) => {
      const submitButton = element
        .closest("form")
        ?.querySelector("button.primary");
      return (
        !!submitButton &&
        !!(
          element.compareDocumentPosition(submitButton) &
          Node.DOCUMENT_POSITION_FOLLOWING
        )
      );
    }),
  ).toBe(true);
  expect(state.writes).toEqual([]);
  await page
    .getByLabel("Numéro international", { exact: true })
    .fill("+33123456789");
  await submit.click();
  await expect(page).toHaveURL(
    new RegExp(`#/app/distribution/${ids.distribution}$`),
  );
  await expect(
    page.getByRole("heading", { name: "Distribution préparée", exact: true }),
  ).toBeVisible();
  expect(state.writes).toEqual([
    {
      path: "/distribution-plans",
      body: {
        jobId: ids.job,
        entries: [
          {
            entryId: "record-0-destination-0",
            recordId: ids.record,
            channel: "fax",
            recipient: { phone: "+33123456789" },
            ceilingMinor: 200,
          },
        ],
        explicitMultichannel: false,
      },
    },
  ]);
  await page.locator(`a[href="#/app/dispatch/${ids.dispatch}"]`).click();
  await expect(page.locator(".dispatch-reference")).toContainText(ids.dispatch);
  await expect(page.locator(".approval-panel")).toHaveCount(0);
  await expect(page.locator(".cancel-button")).toHaveCount(0);

  // A separate authenticated session is represented by a reload, as in the
  // existing role fixtures; no test grants rights through an application API.
  state.role = "supervisor";
  state.canApprove = true;
  await page.reload();
  await expect(page.locator(".approval-panel")).toBeVisible();
  await expect(
    page.locator(".approval-panel input[type=checkbox]"),
  ).not.toBeChecked();
  await expect(page.locator(".approval-panel button")).toBeDisabled();
  const preview = page.locator(".pdf-preview");
  await expect(preview.getByRole("img")).toBeVisible();
  await expect(preview.locator(".pdf-canvas-wrap")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(preview.locator(".sr-only")).toContainText(
    "PRIVATE STUDIO REVIEW PDF 001",
  );
  await expect(preview.getByRole("alert")).toHaveCount(0);
  const pdfLink = preview.getByRole("link", {
    name: "Ouvrir le PDF",
    exact: true,
  });
  const contentPath = `/api/documents/${ids.document}/content?dispatchId=${ids.dispatch}`;
  await expect(pdfLink).toHaveAttribute("href", contentPath);
  await expect(pdfLink).toHaveAttribute("target", "_blank");
  // The preview link deliberately opens an inline PDF. Fetch its actual href in
  // the browser to check the downloadable bytes without depending on the
  // built-in PDF reader UI, which differs across Chromium and WebKit.
  const downloaded = await pdfLink.evaluate(async (link: HTMLAnchorElement) => {
    const response = await fetch(link.href);
    return {
      status: response.status,
      hash: response.headers.get("X-Document-SHA256"),
      contentType: response.headers.get("Content-Type"),
      bytes: Array.from(new Uint8Array(await response.arrayBuffer())),
    };
  });
  expect(downloaded.status).toBe(200);
  expect(downloaded.contentType).toBe("application/pdf");
  expect(downloaded.hash).toBe(hash);
  expect(
    createHash("sha256").update(Buffer.from(downloaded.bytes)).digest("hex"),
  ).toBe(hash);
  expect(
    state.contentReads.filter((read) => read.role === "supervisor"),
  ).toEqual([
    { role: "supervisor", dispatchId: ids.dispatch },
    { role: "supervisor", dispatchId: ids.dispatch },
  ]);
  expect(state.writes).toHaveLength(1);
  expect(state.unexpected).toEqual([]);
});
