import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";

// Accessibility is checked, not assumed: the automated WCAG 2 A/AA rules run
// on the main Correspondence and read-only Studio pages in every language and both themes. A
// critical violation fails the suite; lower impacts are reviewed by hand.
const pages = [
  "/#/app",
  "/#/app/dispatches",
  "/#/app/prepare",
  "/#/app/documents",
  "/#/app/senders",
  "/#/app/studio/templates",
  "/#/app/studio/datasets",
  "/#/app/studio/generations",
];

for (const locale of ["fr", "en", "de", "lb"] as const)
  for (const scheme of ["light", "dark"] as const)
    test(`workspace pages have no critical accessibility violation (${locale}, ${scheme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.addInitScript(
        (value) => localStorage.setItem("guteneo.locale", value),
        locale,
      );
      const critical: string[] = [];
      for (const path of pages) {
        await page.goto(path);
        await expect(page.locator("main h1")).toBeVisible();
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa"])
          .analyze();
        for (const violation of results.violations)
          if (violation.impact === "critical")
            critical.push(`${path} ${violation.id}`);
      }
      expect(critical).toEqual([]);
    });
