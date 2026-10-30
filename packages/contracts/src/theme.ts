export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";
export const themeStorageKey = "guteneo.theme";
export const themeCookieName = "guteneo_theme";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

/** Presentation only. Duplicate, oversized and malformed values use the system. */
export function themePreferenceFromCookie(
  header: string | null,
): ThemePreference {
  if (!header || header.length > 8192) return "system";
  const values = header.split(";").flatMap((entry) => {
    const separator = entry.indexOf("=");
    return entry.slice(0, separator).trim() === themeCookieName
      ? [entry.slice(separator + 1).trim()]
      : [];
  });
  return values.length === 1 && isThemePreference(values[0])
    ? values[0]
    : "system";
}

export function resolveTheme(
  preference: ThemePreference,
  systemDark: boolean,
): ResolvedTheme {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}
