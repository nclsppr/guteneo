import { useSyncExternalStore } from "react";

/** "night" and "day" are the two lights of the same station. */
export type Light = "night" | "day";
export type LightChoice = Light | "system";

const STORAGE_KEY = "guteneo.experience.theme";
const listeners = new Set<() => void>();
const media =
  typeof matchMedia === "function"
    ? matchMedia("(prefers-color-scheme: dark)")
    : null;

function stored(): LightChoice {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "night" || value === "day" ? value : "system";
  } catch {
    return "system";
  }
}

let choice: LightChoice = stored();

function resolved(): Light {
  if (choice !== "system") return choice;
  return media?.matches === false ? "day" : "night";
}

function apply() {
  const light = resolved();
  document.documentElement.dataset.theme = light;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", light === "night" ? "#08090a" : "#dbd9cf");
  for (const listener of listeners) listener();
}

media?.addEventListener("change", () => {
  if (choice === "system") apply();
});

export function setLight(next: LightChoice) {
  choice = next;
  try {
    if (next === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // The choice still applies to this visit.
  }
  apply();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLight(): { light: Light; choice: LightChoice } {
  const light = useSyncExternalStore(subscribe, resolved);
  const current = useSyncExternalStore(subscribe, () => choice);
  return { light, choice: current };
}
