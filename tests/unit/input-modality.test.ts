import { describe, expect, it } from "vitest";
import { installInputModality } from "../../apps/web/src/input-modality";

function key(name: string) {
  return Object.assign(new Event("keydown"), { key: name });
}

describe("input modality", () => {
  it("records the last pointer or keyboard input for focus styling", () => {
    const root = { dataset: {} as DOMStringMap };
    const events = new EventTarget();
    installInputModality(root, events);
    expect(root.dataset.input).toBeUndefined();
    events.dispatchEvent(new Event("pointerdown"));
    expect(root.dataset.input).toBe("pointer");
    events.dispatchEvent(key("Enter"));
    expect(root.dataset.input).toBe("keyboard");
    events.dispatchEvent(new Event("pointerdown"));
    expect(root.dataset.input).toBe("pointer");
  });

  it("ignores modifier keys pressed alone, such as Command before a click", () => {
    const root = { dataset: {} as DOMStringMap };
    const events = new EventTarget();
    installInputModality(root, events);
    events.dispatchEvent(new Event("pointerdown"));
    for (const name of ["Meta", "Shift", "Control", "Alt"])
      events.dispatchEvent(key(name));
    expect(root.dataset.input).toBe("pointer");
  });
});
