import { useSyncExternalStore } from "react";
import {
  defaultLocale,
  isSupportedLocale,
  normalizeLocale,
  resolveLocale,
  type SupportedLocale,
} from "../../../packages/contracts/src/locale";
import { fr, type Copy } from "./i18n";
import { en } from "./locales/en";
import { de } from "./locales/de";
import { lb } from "./locales/lb";

export {
  supportedLocales,
  type SupportedLocale,
} from "../../../packages/contracts/src/locale";
export const localeNames: Record<SupportedLocale, string> = {
  fr: "Français",
  en: "English",
  de: "Deutsch",
  lb: "Lëtzebuergesch",
};
export const localeTags: Record<SupportedLocale, string> = {
  fr: "fr-FR",
  en: "en-GB",
  de: "de-DE",
  lb: "lb-LU",
};
export const catalogs: Record<SupportedLocale, Copy> = { fr, en, de, lb };
export const localeLabels = {
  fr: {
    language: "Langue",
    preference: "Langue préférée",
    hint: "Cette langue sera utilisée dans votre compte sur le site et dans l’application iOS.",
    saved: "Votre langue préférée a été enregistrée.",
    saving: "Enregistrement…",
    save: "Enregistrer la langue",
    browser:
      "Ce choix s’applique à ce navigateur. Connectez-vous pour enregistrer votre préférence dans votre profil.",
  },
  en: {
    language: "Language",
    preference: "Preferred language",
    hint: "Your account will use this language on the website and in the iOS app.",
    saved: "Your preferred language has been saved.",
    saving: "Saving…",
    save: "Save language",
    browser:
      "This choice applies to this browser. Sign in to save your preference in your profile.",
  },
  de: {
    language: "Sprache",
    preference: "Bevorzugte Sprache",
    hint: "Ihr Konto verwendet diese Sprache auf der Website und in der iOS-App.",
    saved: "Ihre bevorzugte Sprache wurde gespeichert.",
    saving: "Wird gespeichert…",
    save: "Sprache speichern",
    browser:
      "Diese Auswahl gilt für diesen Browser. Melden Sie sich an, um Ihre Einstellung im Profil zu speichern.",
  },
  lb: {
    language: "Sprooch",
    preference: "Bevirzuchte Sprooch",
    hint: "Äre Kont benotzt dës Sprooch op der Websäit an an der iOS-App.",
    saved: "Är bevirzuchte Sprooch gouf gespäichert.",
    saving: "Gëtt gespäichert…",
    save: "Sprooch späicheren",
    browser:
      "Dëse Choix gëllt fir dëse Browser. Mellt Iech un, fir Är Preferenz an Ärem Profil ze späicheren.",
  },
} satisfies Record<SupportedLocale, Record<string, string>>;
const storageKey = "guteneo.locale";
let current: SupportedLocale = defaultLocale;
export let t: Copy = catalogs[current];
const listeners = new Set<() => void>();
let selectionVersion = 0;
export const getLocaleSelectionVersion = () => selectionVersion;
export const getLocale = () => current;
// ICU versions without Luxembourgish use Luxembourg regional German formats.
export const formatLocale = () =>
  current === "lb" &&
  (!Intl.NumberFormat.supportedLocalesOf(["lb-LU"]).length ||
    !Intl.DateTimeFormat.supportedLocalesOf(["lb-LU"]).length)
    ? "de-LU"
    : localeTags[current];
export const languageCopy = () => localeLabels[current];
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function useLocale() {
  return useSyncExternalStore(subscribe, getLocale, () => defaultLocale);
}
export function setLocale(locale: SupportedLocale, persist = true) {
  if (!isSupportedLocale(locale)) return;
  if (persist) selectionVersion += 1;
  if (persist && typeof window !== "undefined") {
    if (window.history && window.location.href) {
      const url = new URL(window.location.href);
      if (url.searchParams.has("lang")) {
        url.searchParams.set("lang", locale);
        window.history.replaceState(window.history.state, "", url);
      }
    }
    try {
      window.localStorage.setItem(storageKey, locale);
    } catch {
      /* Private browsing can disable storage. */
    }
  }
  if (typeof document !== "undefined") document.documentElement.lang = locale;
  if (current === locale) return;
  current = locale;
  t = catalogs[locale];
  for (const listener of listeners) listener();
}
/** Run before first render. Account preference is applied after authentication. */
export function initializeLocale() {
  let stored: SupportedLocale | null = null;
  try {
    stored = normalizeLocale(window.localStorage.getItem(storageKey));
  } catch {
    /* Storage is optional. */
  }
  const requested = normalizeLocale(
    new URLSearchParams(window.location.search).get("lang"),
  );
  setLocale(
    requested ?? stored ?? resolveLocale(navigator.languages),
    !!requested,
  );
}
