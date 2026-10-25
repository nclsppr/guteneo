import type { ReactNode } from "react";
import type { DashboardAppearance } from "./dashboard-appearance";
import { msg } from "./messages";
import { ThemeSelect } from "./theme-select";

/** The same account preference controls serve personal and workshop contexts. */
export function AppearancePreferences({
  appearance,
  onAppearanceChange,
  language,
  disabled = false,
}: {
  appearance: DashboardAppearance;
  onAppearanceChange: (appearance: DashboardAppearance) => void;
  language: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="account-display-preferences">
      <ThemeSelect />
      {language}
      <div className="field dashboard-appearance-control">
        <label htmlFor="dashboard-appearance">{msg("Interface version")}</label>
        <select
          id="dashboard-appearance"
          className="dashboard-appearance-select"
          value={appearance}
          disabled={disabled}
          onChange={(event) =>
            onAppearanceChange(
              event.currentTarget.value === "v2" ? "v2" : "classic",
            )
          }
        >
          <option value="classic">{msg("Classic")}</option>
          <option value="v2">V2</option>
        </select>
      </div>
    </div>
  );
}
