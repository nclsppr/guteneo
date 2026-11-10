import type { SupportedLocale } from "../../../packages/contracts/src/locale";
import type { Copy } from "./i18n";

export type LocaleData = {
  copy: Copy;
  messages: Record<string, string | number>;
  strings: string[];
  contexts: Record<string, string>;
};
// SSR and unit tooling keep synchronous access to every catalog. The browser
// build removes this branch and the source catalogs entirely.
const server = import.meta.env.SSR
  ? await import("./locale-data-server")
  : undefined;
const loaded = new Map<SupportedLocale, LocaleData>(
  Object.entries(server?.localeData ?? {}) as [SupportedLocale, LocaleData][],
);
export const legacyMessages = server?.legacyMessages ?? {};
export const legacyBelvedereMessages = server?.legacyBelvedereMessages ?? {};
const pending = new Map<SupportedLocale, Promise<void>>();
const loaders = {
  fr: () => import("./locales/runtime/fr.json"),
  en: () => import("./locales/runtime/en.json"),
  de: () => import("./locales/runtime/de.json"),
  lb: () => import("./locales/runtime/lb.json"),
};
export function hasLocaleData(locale: SupportedLocale) {
  return loaded.has(locale);
}
export function loadLocaleData(locale: SupportedLocale): Promise<void> {
  if (loaded.has(locale)) return Promise.resolve();
  let request = pending.get(locale);
  if (!request) {
    request = Promise.all([
      loaders[locale](),
      import.meta.env.DEV
        ? import(`./locales/runtime/development-${locale}.json`)
        : undefined,
    ])
      .then(([module, development]) => {
        const data = module.default as LocaleData;
        loaded.set(locale, {
          ...data,
          messages: { ...data.messages, ...(development?.default ?? {}) },
        });
      })
      .finally(() => pending.delete(locale));
    pending.set(locale, request);
  }
  return request;
}
export function readLocaleData(locale: SupportedLocale): LocaleData {
  const data = loaded.get(locale);
  if (!data) throw loadLocaleData(locale);
  return data;
}
export const peekLocaleData = (locale: SupportedLocale) => loaded.get(locale);

type BelvedereLocaleData = {
  messages: Record<string, string>;
  sourceFrench: Record<string, string>;
};
const belvedereLoaded = new Map<SupportedLocale, BelvedereLocaleData>(
  Object.entries(server?.belvedereLocaleData ?? {}) as [
    SupportedLocale,
    BelvedereLocaleData,
  ][],
);
const belvederePending = new Map<SupportedLocale, Promise<void>>();
const belvedereLoaders = {
  fr: () => import("./locales/runtime/belvedere-fr.json"),
  en: () => import("./locales/runtime/belvedere-en.json"),
  de: () => import("./locales/runtime/belvedere-de.json"),
  lb: () => import("./locales/runtime/belvedere-lb.json"),
};
export const hasBelvedereLocaleData = (locale: SupportedLocale) =>
  belvedereLoaded.has(locale);
export function loadBelvedereLocaleData(
  locale: SupportedLocale,
): Promise<void> {
  if (belvedereLoaded.has(locale)) return Promise.resolve();
  let request = belvederePending.get(locale);
  if (!request) {
    request = belvedereLoaders[locale]()
      .then((module) => {
        belvedereLoaded.set(locale, module.default);
      })
      .finally(() => belvederePending.delete(locale));
    belvederePending.set(locale, request);
  }
  return request;
}
export function readBelvedereLocaleData(
  locale: SupportedLocale,
): BelvedereLocaleData {
  const data = belvedereLoaded.get(locale);
  if (!data) throw loadBelvedereLocaleData(locale);
  return data;
}
