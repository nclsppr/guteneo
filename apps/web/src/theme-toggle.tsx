import { Moon, Sun } from "@phosphor-icons/react";
import { msg } from "./messages";
import { useResolvedTheme } from "./theme";

export function ThemeToggle() {
  const theme = useResolvedTheme();
  const lightAction = msg("Switch to light mode");
  const darkAction = msg("Switch to dark mode");
  const action = theme === "dark" ? lightAction : darkAction;

  return (
    <button
      className="theme-toggle public-theme-toggle"
      type="button"
      data-theme-toggle="true"
      data-theme-label-light={lightAction}
      data-theme-label-dark={darkAction}
      aria-label={action}
      title={action}
    >
      <Sun size={21} data-theme-icon="light" aria-hidden="true" />
      <Moon size={21} data-theme-icon="dark" aria-hidden="true" />
    </button>
  );
}
