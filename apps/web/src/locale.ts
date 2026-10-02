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
    automatic: "Automatique",
    automaticHint:
      "La langue du navigateur est utilisée par défaut. Votre choix est conservé sur cet appareil.",
    preference: "Langue préférée",
    choose: "Choisissez une langue",
    hint: "Cette langue sera utilisée dans votre compte sur le site et dans l’application iOS.",
    saved: "Votre langue préférée a été enregistrée.",
    saving: "Enregistrement…",
    save: "Enregistrer la langue",
    browser:
      "Ce choix s’applique à ce navigateur. Connectez-vous pour enregistrer votre préférence dans votre profil.",
  },
  en: {
    language: "Language",
    automatic: "Automatic",
    automaticHint:
      "Your browser language is used by default. Your choice is saved on this device.",
    preference: "Preferred language",
    choose: "Choose a language",
    hint: "Your account will use this language on the website and in the iOS app.",
    saved: "Your preferred language has been saved.",
    saving: "Saving…",
    save: "Save language",
    browser:
      "This choice applies to this browser. Sign in to save your preference in your profile.",
  },
  de: {
    language: "Sprache",
    automatic: "Automatisch",
    automaticHint:
      "Standardmäßig wird die Sprache Ihres Browsers verwendet. Ihre Auswahl wird auf diesem Gerät gespeichert.",
    preference: "Bevorzugte Sprache",
    choose: "Sprache auswählen",
    hint: "Ihr Konto verwendet diese Sprache auf der Website und in der iOS-App.",
    saved: "Ihre bevorzugte Sprache wurde gespeichert.",
    saving: "Wird gespeichert…",
    save: "Sprache speichern",
    browser:
      "Diese Auswahl gilt für diesen Browser. Melden Sie sich an, um Ihre Einstellung im Profil zu speichern.",
  },
  lb: {
    language: "Sprooch",
    automatic: "Automatesch",
    automaticHint:
      "Standardméisseg gëtt d'Sprooch vun Ärem Browser benotzt. Äre Choix gëtt op dësem Apparat gespäichert.",
    preference: "Bevirzuchte Sprooch",
    choose: "Wielt eng Sprooch",
    hint: "Äre Kont benotzt dës Sprooch op der Websäit an an der iOS-App.",
    saved: "Är bevirzuchte Sprooch gouf gespäichert.",
    saving: "Gëtt gespäichert…",
    save: "Sprooch späicheren",
    browser:
      "Dëse Choix gëllt fir dëse Browser. Mellt Iech un, fir Är Preferenz an Ärem Profil ze späicheren.",
  },
} satisfies Record<SupportedLocale, Record<string, string>>;
const storageKey = "guteneo.locale";
export type LocaleSource = "browser" | "selection" | "account";
let current: SupportedLocale = defaultLocale;
let currentSource: LocaleSource = "browser";
export let t: Copy = catalogs[current];
const listeners = new Set<() => void>();
let selectionVersion = 0;
export const getLocaleSelectionVersion = () => selectionVersion;
export const getLocale = () => current;
export const getLocaleSource = () => currentSource;
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
export function useLocaleSource() {
  return useSyncExternalStore(
    subscribe,
    getLocaleSource,
    () => "browser" as const,
  );
}
export function setLocale(
  locale: SupportedLocale,
  persist = true,
  source: LocaleSource = persist ? "selection" : "account",
) {
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
  if (current === locale && currentSource === source) return;
  current = locale;
  currentSource = source;
  t = catalogs[locale];
  for (const listener of listeners) listener();
}
function browserLocale() {
  if (typeof navigator === "undefined") return defaultLocale;
  const languages = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];
  return resolveLocale(languages);
}
/** Reset this browser's choice without changing the account preference. */
export function setAutomaticLocale() {
  selectionVersion += 1;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* Private browsing can disable storage. */
    }
    if (window.history && window.location.href) {
      const url = new URL(window.location.href);
      if (url.searchParams.has("lang")) {
        url.searchParams.delete("lang");
        window.history.replaceState(window.history.state, "", url);
      }
    }
  }
  setLocale(browserLocale(), false, "browser");
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
    requested ?? stored ?? browserLocale(),
    !!requested,
    requested || stored ? "selection" : "browser",
  );
}
