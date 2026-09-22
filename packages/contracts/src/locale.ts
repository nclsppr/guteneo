/** Interface languages shared by the website, authenticated account and iOS. */
export const supportedLocales = ["fr", "en", "de", "lb"] as const;
export type SupportedLocale = (typeof supportedLocales)[number];
export const defaultLocale: SupportedLocale = "fr";

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return (
    typeof value === "string" &&
    (supportedLocales as readonly string[]).includes(value)
  );
}

/** Convert a browser/device language tag to a supported base language. */
export function normalizeLocale(value: unknown): SupportedLocale | null {
  if (typeof value !== "string" || value.length > 64) return null;
  const tag = value.trim().replaceAll("_", "-").toLowerCase();
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(tag)) return null;
  const language = tag.split("-")[0];
  return isSupportedLocale(language) ? language : null;
}

export function resolveLocale(
  languages: readonly string[],
  fallback: SupportedLocale = defaultLocale,
): SupportedLocale {
  for (const language of languages) {
    const locale = normalizeLocale(language);
    if (locale) return locale;
  }
  return fallback;
}

/** Bounded HTTP negotiation; a q=0 language is never selected. */
export function localeFromAcceptLanguage(
  header: string | null,
): SupportedLocale {
  const languages = (header ?? "")
    .slice(0, 1024)
    .split(",")
    .slice(0, 20)
    .map((entry) => {
      const [tag, ...parameters] = entry.trim().split(";");
      const quality = parameters.find((value) => value.trim().startsWith("q="));
      const value = quality === undefined ? 1 : Number(quality.trim().slice(2));
      return {
        tag,
        quality: Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0,
      };
    })
    .filter((entry) => entry.quality > 0)
    .sort((left, right) => right.quality - left.quality)
    .map((entry) => entry.tag);
  return resolveLocale(languages);
}
