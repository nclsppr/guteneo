const modifierKeys = new Set(["Alt", "Control", "Meta", "Shift"]);

/**
 * Page changes focus their new container so keyboard and screen-reader users
 * continue from it. Safari reports that script focus as :focus-visible even
 * after a click, so styles read the last input modality from the root instead.
 */
export function installInputModality(
  root: { dataset: DOMStringMap } = document.documentElement,
  events: EventTarget = document,
) {
  const update = (modality: "keyboard" | "pointer") => {
    if (root.dataset.input !== modality) root.dataset.input = modality;
  };
  events.addEventListener(
    "keydown",
    (event) => {
      if (!modifierKeys.has((event as KeyboardEvent).key)) update("keyboard");
    },
    true,
  );
  events.addEventListener("pointerdown", () => update("pointer"), true);
}
