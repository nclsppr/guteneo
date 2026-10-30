import { useSyncExternalStore } from "react";
import {
  isThemePreference,
  resolveTheme,
  themeCookieName,
  themePreferenceFromCookie,
  themeStorageKey,
  type ThemePreference,
  type ResolvedTheme,
} from "../../../packages/contracts/src/theme";

export { isThemePreference, resolveTheme, themeStorageKey };
export type { ThemePreference, ResolvedTheme };
export const themeChangeEvent = "guteneo-theme-change";

declare global {
  interface Window {
    /** The head script keeps appearance controls live while route code loads. */
    __guteneoTheme?: {
      setPreference: (preference: ThemePreference) => void;
    };
  }
}

export function readThemePreference(): ThemePreference {
  const current = document.documentElement.dataset.themePreference;
  if (isThemePreference(current)) return current;
  try {
    const stored = window.localStorage.getItem(themeStorageKey);
    if (isThemePreference(stored)) return stored;
  } catch {
    // The current page still works when browser storage is unavailable.
  }
  try {
    return themePreferenceFromCookie(document.cookie);
  } catch {
    return "system";
  }
}

function applyTheme(preference: ThemePreference) {
  const root = document.documentElement;
  const resolved = resolveTheme(
    preference,
    window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  root.dataset.theme = resolved;
  root.dataset.themePreference = preference;
  root.style.colorScheme = resolved;
  updateToggleLabels();
  try {
    document.cookie = `${themeCookieName}=${preference}; Path=/; Max-Age=31536000; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
  } catch {
    // Cookie blocking never prevents an in-page appearance choice.
  }
  window.dispatchEvent(
    new CustomEvent(themeChangeEvent, { detail: { preference, resolved } }),
  );
}

export function setThemePreference(preference: ThemePreference) {
  if (!isThemePreference(preference)) return;
  if (window.__guteneoTheme) {
    window.__guteneoTheme.setPreference(preference);
    return;
  }
  try {
    window.localStorage.setItem(themeStorageKey, preference);
  } catch {
    // In-memory changes remain available in private or restricted browsers.
  }
  applyTheme(preference);
}

let initialized = false;

function updateToggleLabels() {
  const next =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document
    .querySelectorAll<HTMLElement>("[data-theme-toggle]")
    .forEach((button) => {
      const label = button.getAttribute(`data-theme-label-${next}`);
      if (!label) return;
      button.setAttribute("aria-label", label);
      button.setAttribute("title", label);
    });
}

/** One browser subscription serves public, personal, workshop and private views. */
export function initializeTheme() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  // The pre-paint controller already owns the listeners, including early clicks.
  if (window.__guteneoTheme) return;
  applyTheme(readThemePreference());
  document.addEventListener("click", (event) => {
    const button =
      event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>("button[data-theme-toggle]")
        : null;
    if (!button || button.disabled || event.defaultPrevented) return;
    setThemePreference(
      document.documentElement.dataset.theme === "dark" ? "light" : "dark",
    );
  });
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      const preference = readThemePreference();
      if (preference === "system") applyTheme(preference);
    });
  window.addEventListener("storage", (event) => {
    if (event.key === themeStorageKey || event.key === null) {
      applyTheme(isThemePreference(event.newValue) ? event.newValue : "system");
    }
  });
}

function subscribe(listener: () => void) {
  window.addEventListener(themeChangeEvent, listener);
  return () => window.removeEventListener(themeChangeEvent, listener);
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, readThemePreference, () => "system");
}

export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(
    subscribe,
    () =>
      document.documentElement.dataset.theme === "dark" ? "dark" : "light",
    () => "light",
  );
}
