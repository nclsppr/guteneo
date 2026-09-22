import { useId } from "react";
import { Globe } from "@phosphor-icons/react";
import {
  languageCopy,
  localeNames,
  setLocale,
  supportedLocales,
  useLocale,
  type SupportedLocale,
} from "./locale";
import "./language-select.css";

export function LanguageSelect({
  value,
  onChange,
  disabled,
  profile = false,
}: {
  value?: SupportedLocale;
  onChange?: (locale: SupportedLocale) => void;
  disabled?: boolean;
  profile?: boolean;
}) {
  const id = useId();
  const locale = useLocale();
  const copy = languageCopy();
  return (
    <div
      className={profile ? "field language-preference" : "language-selector"}
    >
      <label htmlFor={id}>
        {!profile && <Globe size={18} aria-hidden="true" />}
        <span>{profile ? copy.preference : copy.language}</span>
      </label>
      <select
        id={id}
        name="language"
        value={value ?? locale}
        disabled={disabled}
        aria-describedby={profile ? `${id}-hint` : undefined}
        onChange={(event) =>
          (onChange ?? setLocale)(event.target.value as SupportedLocale)
        }
      >
        {supportedLocales.map((code) => (
          <option key={code} value={code} lang={code}>
            {localeNames[code]}
          </option>
        ))}
      </select>
      {profile && <small id={`${id}-hint`}>{copy.hint}</small>}
    </div>
  );
}
