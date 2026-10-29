import { test, expect } from "@playwright/test";
import type { PersonalSession } from "../../apps/web/src/personal-api";

const name = "Donaudampfschifffahrtsgesellschaftsverwaltung"
  .repeat(6)
  .slice(0, 240);
const email = "alexandrine-marguerite.muller-de-saint-exupery@example.invalid";

for (const variant of [
  { locale: "fr", width: 1440, height: 900, theme: "light" },
  { locale: "fr", width: 390, height: 540, theme: "light" },
  { locale: "de", width: 390, height: 540, theme: "dark" },
  { locale: "lb", width: 390, height: 540, theme: "dark" },
] as const) {
  test.describe(`${variant.locale} personal account ${variant.width}×${variant.height}`, () => {
    test.use({
      viewport: { width: variant.width, height: variant.height },
      isMobile: variant.width === 390,
      hasTouch: variant.width === 390,
    });

    test("keeps a long identity, all account actions and the document inside the viewport", async ({
      page,
    }, info) => {
      const writes: string[] = [];
      const session: PersonalSession = {
        user: {
          id: "long-name-reader",
          name,
          email,
          preferredLocale: variant.locale,
        },
        csrfToken: "synthetic-layout-csrf",
        simulation: false,
        mfa: false,
        strongAuthentication: false,
        documentAccessAllowed: true,
        documentAccessMode: "verified_account",
        authenticationPolicyVersion: "synthetic",
        amr: [],
        acr: null,
        verifiedAccount: true,
        authenticatedAt: Date.now(),
        workspaces: [],
      };
      await page.addInitScript(
        (preference) => localStorage.setItem("guteneo.theme", preference),
        variant.theme,
      );
      await page.route("**/api/**", (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (request.method() !== "GET")
          writes.push(`${request.method()} ${path}`);
        if (path === "/api/personal/session")
          return route.fulfill({ json: session });
        if (path === "/api/personal/documents")
          return route.fulfill({
            json: {
              items: [
                {
                  id: "layout-document",
                  title: "Synthetic layout document",
                  sender: "Maison Papier",
                  kind: "shared",
                  status: "active",
                  expiresAt: "2026-12-01T12:00:00.000Z",
                },
              ],
              nextCursor: null,
            },
          });
        return route.fulfill({ json: { items: [], nextCursor: null } });
      });
      await page.goto("/#/app/my-documents");
      await expect(
        page.getByRole("heading", {
          name: "Synthetic layout document",
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute(
        "lang",
        variant.locale,
      );
      const noOverflow = () =>
        page.evaluate(() => ({
          viewport: window.innerWidth,
          page: document.documentElement.scrollWidth,
          client: document.documentElement.clientWidth,
        }));
      const initial = await noOverflow();
      expect(initial.viewport).toBeLessThanOrEqual(variant.width + 1);
      expect(initial.page).toBeLessThanOrEqual(initial.client + 1);
      if (variant.width === 1440) {
        const sidebar = await page
          .locator(".personal-space-header")
          .boundingBox();
        const account = await page.locator(".sidebar-account").boundingBox();
        expect(sidebar!.width).toBe(258);
        expect(account!.x + account!.width).toBeLessThanOrEqual(
          sidebar!.x + sidebar!.width,
        );
      }
      const trigger = page.locator(".workspace-identity-trigger");
      await trigger.click();
      const menu = page.locator(".workspace-identity-menu");
      await expect(menu).toBeVisible();
      await expect(
        menu.locator(".workspace-identity-summary strong"),
      ).toHaveText(name);
      await expect(menu.locator(".workspace-identity-email")).toHaveText(email);
      const bounds = await menu.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(variant.width);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(variant.height);
      await menu.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      const logout = menu.locator(".workspace-sign-out");
      const logoutBounds = await logout.boundingBox();
      expect(logoutBounds!.y).toBeGreaterThanOrEqual(bounds!.y);
      expect(logoutBounds!.y + logoutBounds!.height).toBeLessThanOrEqual(
        bounds!.y + bounds!.height,
      );
      if (variant.width === 390) {
        const actions = await menu
          .locator("a,button")
          .evaluateAll((elements) =>
            elements.map((element) => element.getBoundingClientRect().height),
          );
        expect(actions.every((height) => height >= 44)).toBe(true);
      }
      await page.screenshot({
        path: info.outputPath("personal-account-bottom.png"),
      });
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      await expect(trigger).toBeFocused();
      const final = await noOverflow();
      expect(final.viewport).toBeLessThanOrEqual(variant.width + 1);
      expect(final.page).toBeLessThanOrEqual(final.client + 1);
      expect(writes).toEqual([]);
    });
  });
}
