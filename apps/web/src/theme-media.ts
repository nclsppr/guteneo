import { useResolvedTheme, useThemePreference } from "./theme";

/** Native picture selection also follows the system theme before JavaScript. */
export function useDarkImageMedia() {
  const preference = useThemePreference();
  const resolved = useResolvedTheme();
  return preference === "system"
    ? "(prefers-color-scheme: dark)"
    : resolved === "dark"
      ? "all"
      : "not all";
}
