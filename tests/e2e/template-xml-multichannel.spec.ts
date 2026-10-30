import { mkdir } from "node:fs/promises";
import type { Locator } from "@playwright/test";
import { test, expect, type Page } from "./fixtures";
import type { Session } from "../../apps/web/src/api";
import type {
  DistributionInput,
  DistributionView,
  GenerationJobView,
  GenerationResultView,
  TemplateView,
} from "../../packages/contracts/src/template-workflow";
import { blankTemplate, textBlock } from "../../packages/templates/gallery";
import { documentAnalysis } from "../../packages/contracts/src/document-analysis";

async function login(page: Page) {
  await page.goto("/#/app");
  await page
    .getByRole("button", { name: "Entrer dans l’espace de travail" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Votre correspondance, au clair." }),
  ).toBeVisible();
  const session = (await (
    await page.request.get("/api/session")
  ).json()) as Session;
  expect(session.simulation).toBe(true);
  return { Origin: "http://localhost:8787", "X-CSRF-Token": session.csrfToken };
}

async function chooseModel(page: Page, id: string) {
  const select = page.getByLabel("Modèle à remplir", { exact: true });
  await expect
    .poll(async () => {
      if (await select.locator(`option[value="${id}"]`).count()) return true;
      const more = page
        .getByRole("group", { name: "Autres modèles disponibles", exact: true })
        .getByRole("button", { name: "Afficher la suite", exact: true });
      if (await more.count()) await more.click();
      return false;
    })
    .toBe(true);
  await select.selectOption(id);
}

async function checkKeyboardTable(
  page: Page,
  region: Locator,
  previousControl: Locator,
  browserName: string,
  mobile: boolean,
) {
  await expect(region).toHaveAttribute("tabindex", "0");
  await previousControl.focus();
  // WebKit follows the macOS full-keyboard-access setting for non-form targets.
  await page.keyboard.press(
    browserName === "webkit" && process.platform === "darwin"
      ? "Alt+Tab"
      : "Tab",
  );
  await expect(region).toBeFocused();
  expect(
    await region.evaluate((element) => getComputedStyle(element).outlineStyle),
  ).toBe("solid");
  expect(
    await region.evaluate((element) =>
      parseFloat(getComputedStyle(element).outlineWidth),
    ),
  ).toBeGreaterThanOrEqual(2);
  if (mobile) {
    expect(
      await region.evaluate(
        (element) => element.scrollWidth > element.clientWidth,
      ),
    ).toBe(true);
    const before = await region.evaluate((element) => element.scrollLeft);
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(() => region.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(before);
    await page.keyboard.press("ArrowLeft");
    await expect
      .poll(() => region.evaluate((element) => element.scrollLeft))
      .toBe(before);
  }
}

test("XML records determine each PDF channel and recipient without sending", async ({
  page,
  browserName,
  isMobile,
}, testInfo) => {
  test.setTimeout(150000);
  const headers = await login(page);
  const envelope = blankTemplate();
  envelope.name = `XML distribution ${crypto.randomUUID().slice(0, 8)}`;
  envelope.inputSchema = {
    type: "object",
    properties: {
      name: { type: "string" },
      delivery: {
        type: "object",
        properties: {
          channel: { type: "string" },
          phone: { type: "string" },
          email: { type: "string" },
        },
        required: ["channel", "phone", "email"],
      },
    },
    required: ["name", "delivery"],
  };
  envelope.sampleData = {
    name: "Client synthétique",
    delivery: {
      channel: "fax",
      phone: "+33123456789",
      email: "synthetic@example.com",
    },
  };
  envelope.definition.schemas = [
    [textBlock("name", "Client synthétique", 20, 35, 170)],
  ];
  envelope.bindings = [
    {
      block: "name",
      kind: "value",
      path: "name",
      format: "text",
      required: true,
    },
  ];
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

  const approvalCalls: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      /\/(approve|confirm|send|submit)$/.test(new URL(request.url()).pathname)
    )
      approvalCalls.push(request.url());
  });
  await page.goto("/#/app/studio/datasets");
  await page.getByText("Options XML", { exact: true }).click();
  await page
    .getByLabel("Chemin des enregistrements XML", { exact: true })
    .fill("/export/clients/client");
  await page.getByLabel("Fichier de données", { exact: true }).setInputFiles({
    name: "destinations.xml",
    mimeType: "application/xml",
    buffer: Buffer.from(
      "<export><metadata><source>Synthetic browser fixture</source></metadata><clients><client><id>0007</id><name>Alice XML</name><channel>fax</channel><phone>+33123456789</phone><email>alice@example.com</email></client><client><id>0008</id><name>Bob XML</name><channel>email</channel><phone>+33123456790</phone><email>bob@example.com</email></client></clients></export>",
    ),
  });
  const upload = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/datasets") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", {
      name: "Importer et reconnaître les données",
      exact: true,
    })
    .click();
  const uploaded = await upload;
  expect(uploaded.status(), await uploaded.text()).toBe(201);
  expect((await uploaded.json()).format).toBe("xml");
  await expect(
    page.getByRole("heading", {
      name: "destinations.xml",
      level: 1,
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("0007", { exact: true })).toBeVisible();
  await checkKeyboardTable(
    page,
    page.getByRole("region", {
      name: "Aperçu original — Data",
      exact: true,
    }),
    page.getByLabel("Feuille de l’aperçu", { exact: true }),
    browserName,
    isMobile,
  );
  await chooseModel(page, model.id);
  await page
    .getByLabel("Clé du document / client", { exact: true })
    .selectOption("id");
  for (const [target, source] of Object.entries({
    name: "name",
    "delivery.channel": "channel",
    "delivery.phone": "phone",
    "delivery.email": "email",
  })) {
    await page
      .getByLabel(`Colonne pour ${target}`, { exact: true })
      .selectOption(source);
  }
  await page
    .getByRole("button", { name: "Valider toutes les lignes", exact: true })
    .click();
  await expect(page.getByText(/Correspondance validée/)).toBeVisible();
  await page
    .getByRole("button", { name: "Générer 2 PDF sans envoi", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/app\/studio\/generation\/gen_/);
  const jobId = page.url().split("/generation/")[1];
  let generation: GenerationJobView | undefined;
  await expect
    .poll(
      async () => {
        const response = await page.request.get(
          `/api/generation-jobs/${jobId}`,
        );
        expect(response.status()).toBe(200);
        generation = (await response.json()) as GenerationJobView;
        return (
          generation.generated === 2 ||
          (generation.pending === 0 &&
            ["failed", "partial", "cancelled"].includes(generation.state))
        );
      },
      { timeout: 90000 },
    )
    .toBe(true);
  if (generation!.generated !== 2) {
    const results = await page.request.get(
      `/api/generation-jobs/${jobId}/results?limit=2`,
    );
    const errorCodes = new Set([
      "GENERATION_FAILED",
      "TEMPLATE_RENDER_FAILED",
      "CONTENT_QUOTA_EXCEEDED",
      "GENERATION_CANCELLED",
      "TEMPLATE_ARCHIVED",
      "FORBIDDEN",
      "GENERATION_RETRY_EXHAUSTED",
      "GENERATION_ARTIFACT_MISSING",
      "GENERATION_ARTIFACT_INTEGRITY",
    ]);
    const states = new Set([
      "queued",
      "running",
      "generated",
      "failed",
      "cancelled",
      "partial",
      "completed",
    ]);
    const boundedCount = (value: number) =>
      Number.isInteger(value) && value >= 0 && value <= 500 ? value : null;
    const records = results.ok()
      ? ((await results.json()) as { items: GenerationResultView[] }).items
          .slice(0, 2)
          .map((record, ordinal) => ({
            ordinal,
            state: states.has(record.state) ? record.state : "unknown",
            attempts: boundedCount(record.attempts),
            errorCode:
              record.errorCode === null
                ? null
                : errorCodes.has(record.errorCode)
                  ? record.errorCode
                  : "other",
          }))
      : [];
    const diagnostic = JSON.stringify({
      state: states.has(generation!.state) ? generation!.state : "unknown",
      generated: boundedCount(generation!.generated),
      failed: boundedCount(generation!.failed),
      pending: boundedCount(generation!.pending),
      resultsStatus: results.status(),
      records,
    });
    expect(
      generation!.generated,
      `Terminal generation outcome: ${diagnostic}`,
    ).toBe(2);
  }
  expect(generation!.generated).toBe(2);
  await page
    .getByRole("button", { name: "Actualiser le suivi", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "2 / 2 PDF générés", exact: true }),
  ).toBeVisible();
  const firstRecord = page
    .getByRole("checkbox", { name: /^Sélectionner record-/ })
    .first();
  // Progress and results refresh independently. Tab must wait for the result,
  // rather than skip a checkbox that still belongs to the earlier snapshot.
  await expect(firstRecord).toBeEnabled();
  await checkKeyboardTable(
    page,
    page.getByRole("region", {
      name: "Résultats de cette génération",
      exact: true,
    }),
    // Selecting and preparing sit just before the results table.
    page.getByRole("button", {
      name: "Sélectionner les PDF vérifiés affichés",
      exact: true,
    }),
    browserName,
    isMobile,
  );
  await page.keyboard.press(
    browserName === "webkit" && process.platform === "darwin"
      ? "Alt+Tab"
      : "Tab",
  );
  await expect(firstRecord).toBeFocused();
  await page.keyboard.press("Space");
  await expect(firstRecord).toBeChecked();
  await page
    .getByRole("button", {
      name: "Sélectionner les PDF vérifiés affichés",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Préparer une distribution (2)", exact: true })
    .click();
  // Several PDFs: the destination's documents are chosen explicitly.
  await page
    .getByLabel("Documents pour la destination 1", { exact: true })
    .selectOption("all");
  await page.getByLabel("Canal 1", { exact: true }).selectOption("data");
  await expect(page.getByLabel("Champ du canal", { exact: true })).toHaveValue(
    "delivery.channel",
  );
  const destination = page.getByRole("group", {
    name: "Destination 1",
    exact: true,
  });
  await destination.getByRole("checkbox", { name: "Fax", exact: true }).check();
  await destination
    .getByRole("checkbox", { name: "E-mail", exact: true })
    .check();
  await destination
    .getByLabel("Champ métier → Numéro international", { exact: true })
    .fill("delivery.phone");
  await destination
    .getByLabel("Champ métier → Adresse e-mail", { exact: true })
    .fill("delivery.email");
  await destination
    .getByLabel("Objet de l’e-mail", { exact: true })
    .fill("Document synthétique XML");
  await destination
    .getByLabel("Corps de l’e-mail", { exact: true })
    .fill("Fixture locale sans envoi.");
  await expect(
    page.getByRole("checkbox", { name: /Je demande explicitement/ }),
  ).toHaveCount(0);
  await mkdir("reports/templates-data", { recursive: true });
  await page.screenshot({
    path: `reports/templates-data/xml-data-channels-${testInfo.project.name}.png`,
    fullPage: true,
  });
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/distribution-plans") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", {
      name: "Préparer les associations et les devis",
      exact: true,
    })
    .click();
  const response = await responsePromise;
  expect(response.status(), await response.text()).toBe(201);
  const input = response.request().postDataJSON() as DistributionInput;
  expect(input.explicitMultichannel).toBe(false);
  expect(
    input.entries.every(
      (entry) => !entry.channel && entry.channelField === "delivery.channel",
    ),
  ).toBe(true);
  expect(input.entries[0].recipientFieldsByChannel).toEqual({
    fax: { phone: "delivery.phone" },
    email: { email: "delivery.email" },
  });
  const distribution = (await response.json()) as DistributionView;
  expect(distribution.entries.map((entry) => entry.channel).sort()).toEqual([
    "email",
    "fax",
  ]);
  const fax = distribution.entries.find((entry) => entry.channel === "fax")!;
  const email = distribution.entries.find(
    (entry) => entry.channel === "email",
  )!;
  expect(fax.recipient).toEqual(
    expect.objectContaining({ phone: "+33123456789" }),
  );
  expect(email.recipient).toEqual(
    expect.objectContaining({ email: "bob@example.com" }),
  );
  for (const entry of distribution.entries) {
    if (entry.dispatchId) {
      const dispatch = await (
        await page.request.get(`/api/dispatches/${entry.dispatchId}`)
      ).json();
      expect(dispatch.approval).toBeFalsy();
      expect(dispatch.attempts).toHaveLength(0);
    }
  }
  expect(approvalCalls).toEqual([]);
  await expect(
    page.getByRole("heading", { name: "Distribution préparée", exact: true }),
  ).toBeVisible();
});

test("a slower generation result read preserves focus until selection becomes available", async ({
  page,
  browserName,
}) => {
  await login(page);
  const id = "gen_keyboard_focus_fixture";
  const job: GenerationJobView = {
    id,
    templateId: "tpl_keyboard_focus_fixture",
    templateVersion: 1,
    datasetId: null,
    mappingId: null,
    mappingVersion: null,
    mode: "generate_only",
    state: "running",
    total: 1,
    generated: 0,
    failed: 0,
    pending: 1,
    cancelled: 0,
    createdAt: "2026-10-25T10:00:00Z",
    updatedAt: "2026-10-25T10:00:00Z",
  };
  const result: GenerationResultView = {
    recordId: "record-2",
    state: "running",
    attempts: 1,
    inputHash: "a".repeat(64),
    documentId: null,
    documentHash: null,
    documentStatus: null,
    documentAnalysis: null,
    documentUrl: null,
    errorCode: null,
  };
  let jobReads = 0;
  let resultReads = 0;
  let release!: () => void;
  let announceRead!: () => void;
  const resultsGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const resultsHeld = new Promise<void>((resolve) => {
    announceRead = resolve;
  });
  await page.route(`**/api/generation-jobs/${id}/record-context`, (route) =>
    route.fulfill({ json: { items: [] } }),
  );
  await page.route(`**/api/generation-jobs/${id}{,/results}`, async (route) => {
    expect(route.request().method()).toBe("GET");
    if (!new URL(route.request().url()).pathname.endsWith("/results")) {
      jobReads += 1;
      await route.fulfill({
        json:
          jobReads === 1
            ? job
            : { ...job, state: "completed", generated: 1, pending: 0 },
      });
      return;
    }
    resultReads += 1;
    if (resultReads === 1) {
      await route.fulfill({ json: { items: [result], nextCursor: null } });
      return;
    }
    announceRead();
    await resultsGate;
    await route.fulfill({
      json: {
        items: [
          {
            ...result,
            state: "generated",
            documentId: "doc_keyboard_focus_fixture",
            documentHash: "b".repeat(64),
            documentStatus: "ready",
            documentAnalysis: documentAnalysis("ready"),
          },
        ],
        nextCursor: null,
      },
    });
  });
  try {
    await page.goto(`/#/app/studio/generation/${id}`);
    const selection = page.getByRole("checkbox", {
      name: /^Sélectionner record-2(?: ·|$)/,
      exact: true,
    });
    await expect(selection).toBeDisabled();
    await page
      .getByRole("button", { name: "Actualiser le suivi", exact: true })
      .press("Enter");
    await resultsHeld;
    await expect(
      page.getByRole("heading", { name: "1 / 1 PDF générés", exact: true }),
    ).toBeVisible();
    await expect(selection).toBeDisabled();
    const region = page.getByRole("region", {
      name: "Résultats de cette génération",
      exact: true,
    });
    const tab =
      browserName === "webkit" && process.platform === "darwin"
        ? "Alt+Tab"
        : "Tab";
    await region.focus();
    await page.keyboard.press(tab);
    const provenance = region.getByRole("button", {
      name: "Voir la provenance",
      exact: true,
    });
    await expect(provenance).toBeFocused();
    release();
    await expect(selection).toBeEnabled();
    await expect(provenance).toBeFocused();
    await region.focus();
    await page.keyboard.press(tab);
    await expect(selection).toBeFocused();
    await page.keyboard.press("Space");
    await expect(selection).toBeChecked();
  } finally {
    release();
  }
});

test("account language changes in another tab preserve the studio title and unsaved edits", async ({
  page,
  isMobile,
}, testInfo) => {
  await login(page);
  const envelope = blankTemplate();
  envelope.name = "Créer un document";
  await page.route("**/api/templates/locale-studio", (route) =>
    route.fulfill({
      json: {
        id: "locale-studio",
        name: envelope.name,
        envelope,
        revision: 1,
        state: "draft",
        currentVersion: null,
        visibility: "private",
        permissions: { use: true, edit: true, publish: true, share: true },
        createdAt: "2026-10-02T00:00:00Z",
        updatedAt: "2026-10-02T00:00:00Z",
      },
    }),
  );
  await page.goto("/#/app/studio/template/locale-studio");
  async function changeAccountLanguage(locale: string) {
    const settings = await page.context().newPage();
    try {
      await settings.goto("/#/app/account");
      await expect(settings.locator('select[name="language"]')).toHaveCount(1);
      await settings
        .locator(".language-preference select")
        .selectOption(locale);
      await settings.locator('form.form-panel button[type="submit"]').click();
      await expect(settings.locator("html")).toHaveAttribute("lang", locale);
    } finally {
      await settings.close();
    }
    const rechecked = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/session" &&
        response.request().method() === "GET",
    );
    await expect
      .poll(async () => {
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        return page.locator("html").getAttribute("lang");
      })
      .toBe(locale);
    expect((await rechecked).status()).toBe(200);
    await expect(page.locator('select[name="language"]')).toHaveCount(0);
  }
  for (const [locale, label, save] of [
    ["en", "Template name", "Save draft"],
    ["de", "Vorlagenname", "Entwurf speichern"],
    ["lb", "Numm vun der Virlag", "Entworf späicheren"],
    ["fr", "Nom du modèle", "Enregistrer le brouillon"],
  ]) {
    await changeAccountLanguage(locale);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Créer un document",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByLabel(label, { exact: true })).toHaveValue(
      "Créer un document",
    );
    await expect(
      page.getByRole("button", { name: save, exact: true }),
    ).toBeDisabled();
  }
  if (!isMobile)
    await expect(page.locator(".studio-designer button").first()).toBeVisible({
      timeout: 30000,
    });
  await page
    .getByLabel("Nom du modèle", { exact: true })
    .fill("Brouillon conservé");
  await changeAccountLanguage("lb");
  await expect(
    page.getByLabel("Numm vun der Virlag", { exact: true }),
  ).toHaveValue("Brouillon conservé");
  await expect(page.locator("html")).toHaveAttribute("lang", "lb");
  await mkdir("reports/templates-data", { recursive: true });
  await page.screenshot({
    path: `reports/templates-data/studio-lb-${testInfo.project.name}.png`,
    fullPage: true,
  });
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator('a.back-link[href="#/app/studio/templates"]').click();
  await expect(page).toHaveURL(/#\/app\/studio\/template\/locale-studio$/);
  await expect(
    page.getByLabel("Numm vun der Virlag", { exact: true }),
  ).toHaveValue("Brouillon conservé");
});
