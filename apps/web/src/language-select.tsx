import { useEffect, useId, useRef, useState } from "react";
import { CaretDown, Globe } from "@phosphor-icons/react";
import {
  isSupportedLocale,
  resolveLocale,
} from "../../../packages/contracts/src/locale";
import {
  languageCopy,
  localeNames,
  setAutomaticLocale,
  setLocale,
  supportedLocales,
  useLocale,
  useLocaleSource,
  type SupportedLocale,
} from "./locale";
import "./language-select.css";

export function LanguageSelect({
  value,
  onChange,
  disabled,
  profile = false,
  automatic = false,
}: {
  value?: SupportedLocale | "";
  onChange?: (locale: SupportedLocale) => void;
  disabled?: boolean;
  profile?: boolean;
  automatic?: boolean;
}) {
  const id = useId();
  const locale = useLocale();
  const source = useLocaleSource();
  const copy = languageCopy();
  const browserLocale = resolveLocale(
    typeof navigator === "undefined"
      ? []
      : navigator.languages?.length
        ? navigator.languages
        : [navigator.language],
  );
  return (
    <div
      className={
        profile
          ? "field language-preference"
          : `language-selector${automatic ? " language-selector-automatic" : ""}`
      }
    >
      <label htmlFor={id}>
        {!profile && <Globe size={18} aria-hidden="true" />}
        <span>{profile ? copy.preference : copy.language}</span>
      </label>
      <select
        id={id}
        name="language"
        value={value ?? (automatic && source === "browser" ? "auto" : locale)}
        disabled={disabled}
        aria-describedby={profile || automatic ? `${id}-hint` : undefined}
        onChange={(event) => {
          const selected = event.target.value;
          if (automatic && selected === "auto") setAutomaticLocale();
          else if (isSupportedLocale(selected))
            (onChange ?? setLocale)(selected);
        }}
      >
        {automatic && (
          <option value="auto">
            {copy.automatic} — {localeNames[browserLocale]}
          </option>
        )}
        {profile && value === "" && (
          <option value="" disabled>
            {copy.choose}
          </option>
        )}
        {supportedLocales.map((code) => (
          <option key={code} value={code} lang={code}>
            {localeNames[code]}
          </option>
        ))}
      </select>
      {profile && <small id={`${id}-hint`}>{copy.hint}</small>}
      {!profile && automatic && (
        <small id={`${id}-hint`}>{copy.automaticHint}</small>
      )}
    </div>
  );
}

/** Compact public control; the homepage puts the mobile selector in its menu. */
export function LanguageMenu() {
  const locale = useLocale();
  const copy = languageCopy();
  const details = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    function closeOutside(event: Event) {
      if (
        event.target instanceof Node &&
        !details.current?.contains(event.target)
      ) {
        if (details.current) details.current.open = false;
      }
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("focusin", closeOutside);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("focusin", closeOutside);
    };
  }, [open]);
  return (
    <details
      className="language-menu"
      ref={details}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && event.currentTarget.open) {
          event.preventDefault();
          event.currentTarget.open = false;
          summary.current?.focus();
        }
      }}
    >
      <summary
        ref={summary}
        aria-label={`${copy.language} : ${localeNames[locale]}`}
      >
        <Globe size={20} aria-hidden="true" />
        <span lang={locale}>{localeNames[locale]}</span>
        <CaretDown
          className="language-menu-caret"
          size={14}
          aria-hidden="true"
        />
      </summary>
      <div className="language-menu-panel">
        <LanguageSelect automatic />
      </div>
    </details>
  );
}
