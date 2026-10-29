import { Moon, Sun } from "@phosphor-icons/react";
import { msg } from "./messages";
import { useResolvedTheme } from "./theme";

/** A labelled instance also shows its action, for use inside a menu. */
export function ThemeToggle({ labelled = false }: { labelled?: boolean }) {
  const theme = useResolvedTheme();
  const lightAction = msg("Switch to light mode");
  const darkAction = msg("Switch to dark mode");
  const action = theme === "dark" ? lightAction : darkAction;

  return (
    <button
      className={
        labelled
          ? "theme-toggle theme-toggle-labelled"
          : "theme-toggle public-theme-toggle"
      }
      type="button"
      data-theme-toggle="true"
      data-theme-label-light={lightAction}
      data-theme-label-dark={darkAction}
      aria-label={action}
      title={action}
    >
      <Sun size={21} data-theme-icon="light" aria-hidden="true" />
      <Moon size={21} data-theme-icon="dark" aria-hidden="true" />
      {labelled && <span>{action}</span>}
    </button>
  );
}
