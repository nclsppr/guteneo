import { expect, test } from "@playwright/test";
import { fr } from "../../apps/web/src/locales/fr";
import { en } from "../../apps/web/src/locales/en";
import { de } from "../../apps/web/src/locales/de";
import { lb } from "../../apps/web/src/locales/lb";

const copies = { fr, en, de, lb };
for (const locale of ["fr", "en", "de", "lb"] as const) {
  for (const space of ["public", "workspace"] as const) {
    test(`${space} initial ${locale} loads only its active language without a fallback flash`, async ({
      page,
    }, testInfo) => {
      const apiReads: string[] = [];
      await page.route("**/api/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        apiReads.push(path);
        await route.fulfill({
          json:
            path === "/api/session"
              ? {
                  organization: {
                    id: "org_locale",
                    name: "Synthetic workspace",
                  },
                  user: {
                    id: "user_locale",
                    name: "Synthetic user",
                    role: "admin",
                    preferredLocale: locale,
                  },
                  csrfToken: "synthetic-only",
                  simulation: true,
                }
              : path === "/api/capabilities"
                ? {}
                : { items: [], nextCursor: null },
        });
      });
      await page.addInitScript(() => {
        const seen: { title: string; lang: string }[] = [];
        Object.assign(window, { __localeHeadings: seen });
        new MutationObserver(() => {
          const title = document.querySelector("main h1")?.textContent?.trim();
          if (
            title &&
            !seen.some(
              (item) =>
                item.title === title &&
                item.lang === document.documentElement.lang,
            )
          )
            seen.push({ title, lang: document.documentElement.lang });
        }).observe(document, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      });
      const started = Date.now();
      await page.goto(
        space === "workspace" ? "/#/app/documents" : `/pricing/?lang=${locale}`,
      );
      if (space === "workspace")
        await expect(
          page.getByRole("heading", {
            level: 1,
            name: copies[locale].documents.title,
            exact: true,
          }),
        ).toBeVisible();
      else {
        await expect(page.locator("main h1").first()).not.toBeEmpty();
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
      }
      const metrics = await page.evaluate(() => {
        const resources = performance.getEntriesByType(
          "resource",
        ) as PerformanceResourceTiming[];
        return {
          resources: resources.map((resource) => ({
            path: new URL(resource.name).pathname,
            transferredBytes: resource.transferSize,
            decodedBytes: resource.decodedBodySize,
          })),
          javascriptTransferredBytes: resources
            .filter((resource) =>
              /\.m?js$/.test(new URL(resource.name).pathname),
            )
            .reduce((sum, resource) => sum + resource.transferSize, 0),
          javascriptDecodedBytes: resources
            .filter((resource) =>
              /\.m?js$/.test(new URL(resource.name).pathname),
            )
            .reduce((sum, resource) => sum + resource.decodedBodySize, 0),
          firstContentfulPaintMs:
            performance.getEntriesByName("first-contentful-paint")[0]
              ?.startTime ?? null,
          headings: (
            window as unknown as {
              __localeHeadings: { title: string; lang: string }[];
            }
          ).__localeHeadings,
        };
      });
      await testInfo.attach("locale-loading", {
        contentType: "application/json",
        body: JSON.stringify(
          {
            locale,
            space,
            phase: process.env.GUTENEO_LOCALE_MEASUREMENT_PHASE ?? "candidate",
            firstUsefulContentMs: Date.now() - started,
            apiReads,
            ...metrics,
          },
          null,
          2,
        ),
      });
      for (const candidate of ["fr", "en", "de", "lb"]) {
        const asset = await page
          .locator(`meta[name="guteneo-locale-${candidate}"]`)
          .getAttribute("content");
        expect(asset).toBeTruthy();
        expect(
          metrics.resources.some((resource) => resource.path === asset),
          candidate,
        ).toBe(candidate === locale);
      }
      if (space === "workspace")
        expect(apiReads.filter((path) => path === "/api/session")).toHaveLength(
          1,
        );
      if (space === "workspace")
        expect(
          metrics.headings.every(
            (heading) => heading.title === copies[locale].documents.title,
          ),
        ).toBe(true);
      expect(metrics.headings.every((heading) => heading.lang === locale)).toBe(
        true,
      );
    });
  }
}
