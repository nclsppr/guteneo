import type { ReactNode } from "react";
import { ThemeSelect } from "./theme-select";

/** The same account preference controls serve personal and workshop contexts. */
export function AppearancePreferences({ language }: { language: ReactNode }) {
  return (
    <div className="account-display-preferences">
      <ThemeSelect />
      {language}
    </div>
  );
}
