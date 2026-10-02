import { mkdir } from "node:fs/promises";
import type { Locator } from "@playwright/test";
import { test, expect, type Page } from "./fixtures";
import type { Session } from "../../apps/web/src/api";
import type {
  DistributionInput,
  DistributionView,
  GenerationJobView,
  TemplateView,
} from "../../packages/contracts/src/template-workflow";
import { blankTemplate, textBlock } from "../../packages/templates/gallery";

async function login(page: Page) {
  await page.goto("/#/app");
  await page.getByRole("button", { name: "Entrer dans l’Atelier" }).click();
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
  await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
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
  await page.goto("/#/app/datasets");
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
      name: "Aperçu original — Données",
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
  await expect(page).toHaveURL(/#\/app\/generation\/gen_/);
  const jobId = page.url().split("/generation/")[1];
  await expect
    .poll(
      async () =>
        (
          (await (
            await page.request.get(`/api/generation-jobs/${jobId}`)
          ).json()) as GenerationJobView
        ).generated,
      { timeout: 90000 },
    )
    .toBe(2);
  await page
    .getByRole("button", { name: "Actualiser le suivi", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "2 / 2 PDF générés", exact: true }),
  ).toBeVisible();
  await checkKeyboardTable(
    page,
    page.getByRole("region", {
      name: "Résultats de cette génération",
      exact: true,
    }),
    page.getByRole("button", { name: "Actualiser le suivi", exact: true }),
    browserName,
    isMobile,
  );
  await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
  const firstRecord = page
    .getByRole("checkbox", { name: /^Sélectionner record-/ })
    .first();
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

test("studio language changes preserve a customer title and unsaved edits", async ({
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
  await page.goto("/#/app/template/locale-studio");
  const language = page.locator('.workspace-language select[name="language"]');
  for (const [locale, label, save] of [
    ["en", "Template name", "Save draft"],
    ["de", "Vorlagenname", "Entwurf speichern"],
    ["lb", "Numm vun der Virlag", "Entworf späicheren"],
    ["fr", "Nom du modèle", "Enregistrer le brouillon"],
  ]) {
    await language.selectOption(locale);
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
  await language.selectOption("lb");
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
  await page.locator('a.back-link[href="#/app/templates"]').click();
  await expect(page).toHaveURL(/#\/app\/template\/locale-studio$/);
  await expect(
    page.getByLabel("Numm vun der Virlag", { exact: true }),
  ).toHaveValue("Brouillon conservé");
});
