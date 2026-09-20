import { expect, test, type Page } from "@playwright/test";
import { evidencePath } from "./evidence";

const assistants = [
  ["chatgpt", "ChatGPT"],
  ["claude", "Claude"],
  ["grok", "Grok"],
  ["copilot", "GitHub Copilot"],
  ["microsoft365", "Microsoft 365 Copilot"],
  ["cursor", "Cursor"],
] as const;

function observeServiceCalls(page: Page) {
  const calls: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() !== "GET" ||
      /^\/(api|mcp|auth|oauth)(\/|$)/.test(new URL(request.url()).pathname)
    )
      calls.push(`${request.method()} ${request.url()}`);
  });
  return calls;
}

async function capturePublicPage(page: Page, path: string) {
  await page.getByRole("contentinfo").scrollIntoViewIfNeeded();
  await page
    .getByRole("contentinfo")
    .locator("img")
    .evaluateAll(async (images) => {
      await Promise.all(
        images.map((image) => (image as HTMLImageElement).decode()),
      );
    });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: await evidencePath(path), fullPage: true });
}

async function expectPublicNavigation(page: Page) {
  const navigation = page.getByRole("navigation", {
    name: "Navigation principale",
  });
  await expect(
    navigation.getByRole("link", { name: "Assistants", exact: true }),
  ).toBeVisible();
  await expect(
    navigation.getByRole("link", { name: "Tarifs", exact: true }),
  ).toBeVisible();
  const header = await page.locator(".assistants-header").boundingBox();
  expect(header).not.toBeNull();
  for (const link of await navigation.getByRole("link").all()) {
    const bounds = await link.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.y).toBeGreaterThanOrEqual(header!.y);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
      header!.y + header!.height,
    );
  }
}

test("the public assistant directory supports keyboard navigation without an account", async ({
  page,
}, info) => {
  const calls = observeServiceCalls(page);
  await page.goto("/assistants/");
  await expect(page.locator("main h1")).toBeVisible();
  await expectPublicNavigation(page);
  const originalViewport = page.viewportSize()!;
  await page.setViewportSize({ width: 320, height: originalViewport.height });
  await expectPublicNavigation(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320,
  );
  await page.setViewportSize(originalViewport);
  for (const [id, name] of assistants) {
    await expect(
      page.locator("main").getByRole("link", { name, exact: true }),
    ).toHaveAttribute("href", `/assistants/${id}/`);
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  await capturePublicPage(
    page,
    `assistants/directory-${info.project.name}.png`,
  );
  await page
    .locator("main")
    .getByRole("link", { name: "ChatGPT", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/assistants\/chatgpt\/$/);
  await expect(
    page.getByRole("heading", {
      name: "Ajouter Guteneo à ChatGPT",
      exact: true,
    }),
  ).toBeVisible();
  expect(calls).toEqual([]);
});

for (const [id, name] of assistants) {
  test(`public ${name} guide is directly accessible and copying never connects an account`, async ({
    page,
  }, info) => {
    const calls = observeServiceCalls(page);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() =>
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (value: string) => {
            document.documentElement.dataset.copied = value;
          },
        },
      }),
    );
    const response = await page.goto(`/assistants/${id}/`);
    expect(response?.status()).toBe(200);
    await expectPublicNavigation(page);
    await expect(
      page.getByRole("heading", {
        name: `Ajouter Guteneo à ${name}`,
        exact: true,
      }),
    ).toBeVisible();
    for (const heading of [
      "Avant de commencer",
      "Vérifier la connexion",
      "Besoin d’aide ?",
    ]) {
      await expect(
        page.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
    }
    await page
      .getByRole("button", { name: "Copier l’adresse", exact: true })
      .click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-copied",
      "https://guteneo.com/mcp",
    );
    await page
      .getByRole("button", {
        name: "Copier la demande de vérification",
        exact: true,
      })
      .click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-copied",
      /Guteneo/,
    );
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: /Connexion vérifiée|Connexion active|Connecté/ }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
    if (id === "chatgpt" || id === "microsoft365") {
      await capturePublicPage(
        page,
        `assistants/${id}-${info.project.name}.png`,
      );
    }
    expect(calls).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("Copilot variants and editor downloads keep their distinct configurations", async ({
  page,
  request,
}) => {
  const calls = observeServiceCalls(page);
  await page.goto("/assistants/copilot/");
  const versions = page.getByRole("group", {
    name: "Choisir la version de GitHub Copilot",
  });
  await expect(
    versions.getByRole("button", { name: "VS Code", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("link", { name: "Configuration VS Code", exact: true }),
  ).toHaveAttribute("href", "/guides/copilot-vscode-mcp.json");
  expect(
    await (await request.get("/guides/copilot-vscode-mcp.json")).json(),
  ).toEqual({
    servers: { guteneo: { type: "http", url: "https://guteneo.com/mcp" } },
  });
  await versions
    .getByRole("button", { name: "Copilot CLI", exact: true })
    .click();
  await expect(
    versions.getByRole("button", { name: "Copilot CLI", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    versions.getByRole("button", { name: "VS Code", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(
    page.getByRole("link", { name: "Configuration Copilot CLI", exact: true }),
  ).toHaveAttribute("href", "/guides/copilot-cli-mcp.json");
  expect(
    await (await request.get("/guides/copilot-cli-mcp.json")).json(),
  ).toEqual({
    mcpServers: {
      guteneo: { type: "http", url: "https://guteneo.com/mcp", tools: ["*"] },
    },
  });
  await page.goto("/assistants/cursor/");
  await expect(
    page.getByRole("link", {
      name: "Télécharger la configuration Cursor",
      exact: true,
    }),
  ).toHaveAttribute("href", "/guides/cursor-mcp.json");
  expect(await (await request.get("/guides/cursor-mcp.json")).json()).toEqual({
    mcpServers: { guteneo: { url: "https://guteneo.com/mcp" } },
  });
  await page.goto("/assistants/microsoft365/");
  const microsoftVersions = page.getByRole("group", {
    name: "Choisir la version de Microsoft 365 Copilot",
  });
  await microsoftVersions
    .getByRole("button", { name: "Copilot Studio", exact: true })
    .click();
  await expect(
    microsoftVersions.getByRole("button", {
      name: "Copilot Studio",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    microsoftVersions.getByRole("button", {
      name: "Microsoft 365",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "false");
  expect(calls).toEqual([]);
});

test("assistant pages remain readable and linked with JavaScript disabled", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL,
  });
  try {
    const page = await context.newPage();
    await page.goto("/assistants/");
    await page
      .locator("main")
      .getByRole("link", { name: "Claude", exact: true })
      .click();
    await expect(page).toHaveURL(/\/assistants\/claude\/$/);
    await expect(
      page.getByRole("heading", {
        name: "Ajouter Guteneo à Claude",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Avant de commencer", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Vérifier la connexion", exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
