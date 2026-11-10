import { expect, test, type Page } from "@playwright/test";
import { expectUnreviewedServerError } from "../helpers/browser-error-notice";
import type { SavedRecipientView } from "../../packages/contracts/src/saved-recipients";
import { en } from "../../apps/web/src/locales/en";

async function fixture(
  page: Page,
  options: { delay?: boolean; conflict?: boolean; role?: string } = {},
) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let workspace = "synthetic_workspace_a";
  let refuseWrites = false;
  const contacts: SavedRecipientView[] = [
    {
      id: "contact_a",
      label: "Alpha fictional contact",
      channel: "fax",
      recipient: { phone: "+35220000001" },
      revision: 1,
      createdAt: "2026-11-09T12:00:00Z",
      updatedAt: "2026-11-09T12:00:00Z",
    },
    {
      id: "contact_z",
      label: "Zulu fictional contact",
      channel: "email",
      recipient: { email: "fictional@example.invalid" },
      revision: 1,
      createdAt: "2026-11-09T12:00:00Z",
      updatedAt: "2026-11-09T12:00:00Z",
    },
  ];
  const writes: {
    path: string;
    method: string;
    key?: string;
    body: unknown;
  }[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname.slice(4);
    if (request.method() !== "GET") {
      const body = request.postDataJSON();
      writes.push({
        path,
        method: request.method(),
        key: request.headers()["idempotency-key"],
        body,
      });
      if (refuseWrites && path.startsWith("/recipients"))
        return route.fulfill({
          status: 403,
          json: {
            error: {
              code: "FORBIDDEN",
              message: "Synthetic preparation permission was removed.",
            },
          },
        });
      if (path === "/recipients" && request.method() === "POST") {
        if (options.delay) await gate;
        const saved = {
          ...body,
          id: "contact_new",
          revision: 1,
          createdAt: "2026-11-09T12:00:00Z",
          updatedAt: "2026-11-09T12:00:00Z",
        } as SavedRecipientView;
        contacts.push(saved);
        return route.fulfill({ status: 201, json: saved });
      }
      const index = contacts.findIndex(
        (item) => path === `/recipients/${item.id}`,
      );
      if (index >= 0 && request.method() === "PATCH") {
        if (options.conflict)
          return route.fulfill({
            status: 409,
            json: {
              error: {
                code: "RECIPIENT_CHANGED",
                message: "Synthetic newer revision; reload required.",
              },
            },
          });
        contacts[index] = {
          ...contacts[index],
          ...body.value,
          revision: contacts[index].revision + 1,
        };
        return route.fulfill({ json: contacts[index] });
      }
      if (index >= 0 && request.method() === "DELETE") {
        contacts.splice(index, 1);
        return route.fulfill({ json: { deleted: true } });
      }
      return route.fulfill({
        status: 400,
        json: {
          error: {
            code: "UNEXPECTED_WRITE",
            message: "Unexpected synthetic write.",
          },
        },
      });
    }
    const contact = contacts.find((item) => path === `/recipients/${item.id}`);
    return route.fulfill({
      json:
        path === "/session"
          ? {
              organization: { id: workspace, name: "Synthetic workspace" },
              user: {
                id: "synthetic_user",
                name: "Synthetic account",
                role: options.role ?? "admin",
                preferredLocale: "en",
              },
              csrfToken: "synthetic-only",
              simulation: true,
            }
          : path === "/capabilities"
            ? {}
            : (contact ??
              (path === "/attention"
                ? {
                    items: [
                      {
                        id: "unknown:synthetic_dispatch",
                        kind: "submission_unknown",
                        resourceId: "synthetic_dispatch",
                        route: "/app/dispatch/synthetic_dispatch",
                      },
                    ],
                    nextCursor: null,
                    observedAt: "2026-11-09T12:00:00Z",
                  }
                : {
                    items: path === "/recipients" ? contacts : [],
                    nextCursor: null,
                  })),
    });
  });
  return {
    contacts,
    writes,
    release,
    refuseWrites: () => {
      refuseWrites = true;
    },
    changeWorkspace: () => {
      workspace = "synthetic_workspace_b";
    },
  };
}

test("saved recipients have revision-checked create, edit and delete without sending", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/#/app/recipients/new");
  await page
    .getByLabel("Recipient label", { exact: true })
    .fill("Fictional new contact");
  await page.getByLabel("Fax number", { exact: true }).fill("+35220000002");
  await page
    .getByRole("button", { name: "Save recipient", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/app\/recipients\/contact_new$/);
  await expect(page.getByLabel("Recipient label", { exact: true })).toHaveValue(
    "Fictional new contact",
  );
  await page
    .getByLabel("Recipient label", { exact: true })
    .fill("Renamed fictional contact");
  await page
    .getByRole("button", { name: "Save recipient", exact: true })
    .click();
  await expect
    .poll(
      () => state.contacts.find((item) => item.id === "contact_new")?.revision,
    )
    .toBe(2);
  await page
    .getByRole("button", { name: "Delete recipient", exact: true })
    .click();
  expect(state.writes).toHaveLength(2);
  await page
    .getByRole("group", {
      name: "Delete this saved recipient? Prepared dispatches keep their original recipient.",
      exact: true,
    })
    .getByRole("button", { name: "Delete recipient", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/app\/recipients$/);
  expect(state.writes.map((item) => item.method)).toEqual([
    "POST",
    "PATCH",
    "DELETE",
  ]);
  expect(state.writes[0].key).toBeTruthy();
  expect(state.writes[1].body).toMatchObject({ expectedRevision: 1 });
  expect(state.writes[2].body).toEqual({ expectedRevision: 2 });
});

test("a saved recipient conflict preserves edits and requires explicit reload", async ({
  page,
}) => {
  const state = await fixture(page, { conflict: true });
  await page.goto("/#/app/recipients/contact_a");
  await page
    .getByLabel("Recipient label", { exact: true })
    .fill("Unsaved fictional edit");
  await page
    .getByRole("button", { name: "Save recipient", exact: true })
    .click();
  await expectUnreviewedServerError(
    page.getByRole("alert"),
    "RECIPIENT_CHANGED",
    "Synthetic newer revision; reload required.",
  );
  await expect(page.getByLabel("Recipient label", { exact: true })).toHaveValue(
    "Unsaved fictional edit",
  );
  expect(state.writes).toHaveLength(1);
});

test("a departed action reports a receipt without navigating back and clears with workspace authority", async ({
  page,
}) => {
  const state = await fixture(page, { delay: true });
  await page.goto("/#/app/recipients/new");
  await page
    .getByLabel("Recipient label", { exact: true })
    .fill("Fictional background contact");
  await page.getByLabel("Fax number", { exact: true }).fill("+35220000003");
  await page
    .getByRole("button", { name: "Save recipient", exact: true })
    .click();
  await expect.poll(() => state.writes.length).toBe(1);
  await page.evaluate(() => {
    window.location.hash = "/app/documents";
  });
  await expect(
    page.getByRole("heading", { name: en.nav.documents, exact: true }),
  ).toBeVisible();
  state.release();
  const tray = page.locator(".action-outcomes");
  await expect(tray.locator("summary")).toHaveAccessibleName(
    "Action outcomes 1",
  );
  await tray.locator("summary").click();
  await expect(tray.getByRole("link")).toContainText("Recipient saved");
  await expect(page).toHaveURL(/#\/app\/documents$/);
  state.changeWorkspace();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(tray.locator("summary")).toHaveAccessibleName(
    "Action outcomes 0",
  );
});

test("command search navigates with the keyboard and honors the current navigation veto", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/#/app/recipients");
  await page.getByRole("button", { name: "Commands", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Search commands", exact: true })
    .fill("Documents");
  await page.evaluate(() =>
    window.addEventListener(
      "guteneo:before-workspace-navigation",
      (event) => event.preventDefault(),
      { once: true },
    ),
  );
  await page
    .getByRole("combobox", { name: "Search commands", exact: true })
    .press("Enter");
  await expect(page).toHaveURL(/#\/app\/recipients$/);
  await page.getByRole("button", { name: "Commands", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Search commands", exact: true })
    .fill("Documents");
  await page
    .getByRole("combobox", { name: "Search commands", exact: true })
    .press("Enter");
  await expect(page).toHaveURL(/#\/app\/documents$/);
  await expect(page.locator("#main-content")).toBeFocused();
  expect(state.writes).toHaveLength(0);
});

test("observer commands exclude preparation, saved recipients and administration", async ({
  page,
}) => {
  const state = await fixture(page, { role: "viewer" });
  await page.goto("/#/app/documents");
  await page.getByRole("button", { name: "Commands", exact: true }).click();
  const search = page.getByRole("combobox", {
    name: "Search commands",
    exact: true,
  });
  for (const query of [
    "Saved recipients",
    "Scheduled dispatches",
    "Customer webhooks",
  ]) {
    await search.fill(query);
    await expect(page.getByRole("dialog").getByRole("status")).toContainText(
      "No matching commands.",
    );
  }
  expect(state.writes).toHaveLength(0);
});

test("saved table views survive reload but store no search text or recipient rows", async ({
  page,
}) => {
  const state = await fixture(page);
  // Exercise search privacy on a list large enough to offer search controls.
  for (let index = 0; index < 3; index++)
    state.contacts.push({
      ...state.contacts[0],
      id: `contact_extra_${index}`,
      label: `Additional fictional contact ${index + 1}`,
      channel: "fax",
      recipient: { phone: `+3522000000${index + 5}` },
    });
  await page.goto("/#/app/recipients");
  const views = page.locator(".data-table__views");
  await views.locator("summary").click();
  await views
    .getByLabel("View name", { exact: true })
    .fill("Fictional preferred ordering");
  await views
    .getByRole("button", { name: "Save sort and filters", exact: true })
    .click();
  await page.getByRole("searchbox").fill("fictional@example.invalid");
  const saved = await page.evaluate(() =>
    Object.entries(localStorage).filter(([key]) =>
      key.startsWith("guteneo.table-views.v1:"),
    ),
  );
  expect(saved).toHaveLength(1);
  expect(saved[0][1]).not.toContain("fictional@example.invalid");
  expect(saved[0][1]).not.toContain("+35220000001");
  expect(saved[0][1]).not.toContain("Alpha fictional contact");
  await page.reload();
  await views.locator("summary").click();
  await expect(
    views.getByRole("option", {
      name: "Fictional preferred ordering",
      exact: true,
    }),
  ).toHaveCount(1);
  await expect(page.getByRole("searchbox")).toHaveValue("");
});

test("a refused contact edit immediately hides private fields and action controls", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/#/app/recipients/contact_a");
  await expect(page.getByLabel("Fax number", { exact: true })).toHaveValue(
    "+35220000001",
  );
  state.refuseWrites();
  await page
    .getByRole("button", { name: "Save recipient", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("FORBIDDEN");
  await expect(page.getByLabel("Fax number", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Save recipient", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Delete recipient", exact: true }),
  ).toHaveCount(0);
  expect(state.writes).toHaveLength(1);
});

test("keyboard command dismissal returns to the same editing field without changing it", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto("/#/app/recipients/new");
  const label = page.getByLabel("Recipient label", { exact: true });
  await label.fill("Synthetic unfinished label");
  await label.focus();
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("combobox", { name: "Search commands", exact: true })
    .fill("No matching synthetic command");
  await expect(page.getByRole("dialog").getByRole("status")).toHaveText(
    "No matching commands.",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(label).toBeFocused();
  await expect(label).toHaveValue("Synthetic unfinished label");
  expect(state.writes).toHaveLength(0);
});

test("renaming a saved legacy postal recipient preserves the exact recipient fields", async ({
  page,
}) => {
  const state = await fixture(page);
  const recipient = {
    name: "Synthetic postal reader",
    line1: "12 Fictional Street",
    postalCode: "L-1234",
    city: "Luxembourg",
    country: "LU" as const,
  };
  state.contacts.push({
    id: "contact_legacy",
    label: "Original fictional postal label",
    channel: "postal",
    recipient,
    revision: 1,
    createdAt: "2026-11-09T12:00:00Z",
    updatedAt: "2026-11-09T12:00:00Z",
  });
  await page.goto("/#/app/recipients/contact_legacy");
  await page
    .getByLabel("Recipient label", { exact: true })
    .fill("Renamed fictional postal label");
  await page
    .getByRole("button", { name: "Save recipient", exact: true })
    .click();
  await expect.poll(() => state.writes.length).toBe(1);
  expect(state.writes[0].body).toEqual({
    expectedRevision: 1,
    value: {
      label: "Renamed fictional postal label",
      channel: "postal",
      recipient,
    },
  });
});
