import type { Page, TestInfo } from "@playwright/test";

/** Failed synthetic browser fixtures only; never log entered recipient/content. */
export async function preparationDiagnostics(page: Page, testInfo: TestInfo) {
  if (testInfo.status === testInfo.expectedStatus || page.isClosed()) return;
  try {
    const state = await page.evaluate(() => ({
      route: location.hash,
      headings: Array.from(document.querySelectorAll("main h1")).map(
        (element) => element.textContent?.slice(0, 160),
      ),
      invalid: Array.from(
        document.querySelectorAll("main input, main select, main textarea"),
      ).flatMap((element) => {
        if (
          !(
            element instanceof HTMLInputElement ||
            element instanceof HTMLSelectElement ||
            element instanceof HTMLTextAreaElement
          ) ||
          !element.willValidate ||
          element.validity.valid
        )
          return [];
        return [
          {
            type: element.type,
            label: element.labels?.[0]?.textContent?.trim().slice(0, 120),
            valueMissing: element.validity.valueMissing,
            patternMismatch: element.validity.patternMismatch,
            typeMismatch: element.validity.typeMismatch,
            tooLong: element.validity.tooLong,
            rangeOverflow: element.validity.rangeOverflow,
          },
        ];
      }),
      errorCodes: Array.from(
        document.querySelectorAll(".error-details .mono"),
      ).map((element) => element.textContent?.slice(0, 80)),
      preparationBusy: document
        .querySelector(".prepare-layout")
        ?.getAttribute("aria-busy"),
      generatedStatus: document
        .getElementById("postal-generated-status")
        ?.textContent?.slice(0, 200),
    }));
    console.log("SYNTHETIC_PREPARATION_DIAGNOSTICS", JSON.stringify(state));
  } catch {
    console.log("SYNTHETIC_PREPARATION_DIAGNOSTICS unavailable");
  }
}
