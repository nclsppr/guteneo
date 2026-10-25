import { useId } from "react";
import { Monitor, Moon, Sun } from "@phosphor-icons/react";
import { msg } from "./messages";
import {
  isThemePreference,
  setThemePreference,
  useThemePreference,
} from "./theme";

export function ThemeSelect({ compact = false }: { compact?: boolean }) {
  const id = useId();
  const preference = useThemePreference();
  const Icon =
    preference === "dark" ? Moon : preference === "light" ? Sun : Monitor;
  return (
    <div className={`theme-control${compact ? " theme-control-compact" : ""}`}>
      <label htmlFor={id} className={compact ? "sr-only" : undefined}>
        {msg("Appearance")}
      </label>
      <div className="theme-select-wrap">
        <Icon size={17} aria-hidden="true" />
        <select
          id={id}
          value={preference}
          onChange={(event) => {
            if (isThemePreference(event.target.value))
              setThemePreference(event.target.value);
          }}
        >
          <option value="system">{msg("System")}</option>
          <option value="light">{msg("Light")}</option>
          <option value="dark">{msg("Dark")}</option>
        </select>
      </div>
    </div>
  );
}
