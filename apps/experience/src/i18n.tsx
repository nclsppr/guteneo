import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  isSupportedLocale,
  supportedLocales,
  type SupportedLocale,
} from "../../../packages/contracts/src/locale";

export { supportedLocales, type SupportedLocale };

type Catalog = Record<string, string>;
type Values = Record<string, string | number>;

// One catalog per language, loaded on demand: a visitor only ever downloads
// the language they read.
const loaders: Record<SupportedLocale, () => Promise<{ default: Catalog }>> = {
  fr: () => import("virtual:experience-locale/fr"),
  en: () => import("virtual:experience-locale/en"),
  de: () => import("virtual:experience-locale/de"),
  lb: () => import("virtual:experience-locale/lb"),
};

const STORAGE_KEY = "guteneo.experience.locale";
const catalogs = new Map<SupportedLocale, Catalog>();

export async function loadCatalog(locale: SupportedLocale): Promise<Catalog> {
  const known = catalogs.get(locale);
  if (known) return known;
  const catalog = (await loaders[locale]()).default;
  catalogs.set(locale, catalog);
  return catalog;
}

export function initialLocale(): SupportedLocale {
  const declared = document.documentElement.lang;
  return isSupportedLocale(declared) ? declared : "fr";
}

/** Fill `{name}` placeholders; an unknown placeholder stays visible. */
export function interpolate(template: string, values?: Values): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : match,
  );
}

export type Translate = (key: string, values?: Values) => string;

/**
 * Plural keys follow `key.one` / `key.other`; a count of zero uses `key.zero`
 * when the catalog provides it. The count is available as `{count}`.
 */
export function translator(catalog: Catalog, locale: SupportedLocale) {
  const rules = new Intl.PluralRules(intlLocale(locale));
  const translate: Translate = (key, values) => {
    let template = catalog[key];
    if (template === undefined && values && typeof values.count === "number") {
      const count = values.count;
      template =
        (count === 0 ? catalog[`${key}.zero`] : undefined) ??
        catalog[`${key}.${rules.select(count)}`] ??
        catalog[`${key}.other`];
    }
    return template === undefined ? key : interpolate(template, values);
  };
  return translate;
}

const intlTags: Record<SupportedLocale, string> = {
  fr: "fr-LU",
  en: "en-GB",
  de: "de-LU",
  lb: "lb-LU",
};

/** ICU builds without Luxembourgish use Luxembourg regional German formats. */
export function intlLocale(locale: SupportedLocale): string {
  if (
    locale === "lb" &&
    (!Intl.NumberFormat.supportedLocalesOf(["lb-LU"]).length ||
      !Intl.DateTimeFormat.supportedLocalesOf(["lb-LU"]).length)
  )
    return "de-LU";
  return intlTags[locale];
}

type I18n = {
  locale: SupportedLocale;
  t: Translate;
  setLocale: (locale: SupportedLocale) => Promise<void>;
};

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({
  locale: startLocale,
  catalog: startCatalog,
  children,
}: {
  locale: SupportedLocale;
  catalog: Catalog;
  children: ReactNode;
}) {
  const [state, setState] = useState({
    locale: startLocale,
    catalog: startCatalog,
  });
  const setLocale = useCallback(async (locale: SupportedLocale) => {
    const catalog = await loadCatalog(locale);
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // The choice still applies to this visit.
    }
    setState({ locale, catalog });
  }, []);
  useEffect(() => {
    document.documentElement.lang = state.locale;
  }, [state.locale]);
  const value = useMemo<I18n>(
    () => ({
      locale: state.locale,
      t: translator(state.catalog, state.locale),
      setLocale,
    }),
    [state, setLocale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error("I18nProvider is missing");
  return value;
}

export function useT(): Translate {
  return useI18n().t;
}

export const localeNames: Record<SupportedLocale, string> = {
  fr: "Français",
  en: "English",
  de: "Deutsch",
  lb: "Lëtzebuergesch",
};
