import { expect, type Locator } from "@playwright/test";

/** One input gesture, with no recovery that could hide a lost value. */
export async function enterInitialText(
  input: Locator,
  expected: string,
  hasTouch: boolean,
  phase: string,
) {
  if (hasTouch) {
    await input.tap();
    await input.pressSequentially(expected);
  } else await input.fill(expected);
  expect(
    await input.evaluate(
      (element: HTMLInputElement, value) =>
        element.value === value && document.activeElement === element,
      expected,
    ),
    `${phase}: the exact value must remain focused after one gesture`,
  ).toBe(true);
}
