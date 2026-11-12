import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Info, WarningCircle, X } from "@phosphor-icons/react";
import { ApiError } from "../api/client";
import { useT, type Translate } from "../i18n";
import type { Section } from "../sections";

/** The page sign: track number, the title, and the page's own actions. */
export function Sign({
  section,
  title,
  also,
  children,
}: {
  section?: Section;
  title: string;
  /** The same word in the station's other languages, as on a real board. */
  also?: string;
  children?: ReactNode;
}) {
  const t = useT();
  return (
    <header className="sign">
      {section ? (
        <div className="sign-track" aria-hidden="true">
          <small>{t("shell.track")}</small>
          <b>{section.track}</b>
        </div>
      ) : (
        <span />
      )}
      <div>
        <h1 className="sign-title">{title}</h1>
        {also && (
          <p className="sign-also" aria-hidden="true">
            {also}
          </p>
        )}
      </div>
      {children && <div className="sign-actions">{children}</div>}
    </header>
  );
}

/** Known server codes read in the reader's language; others keep the server text. */
export function errorMessage(error: unknown, t: Translate): string {
  if (error instanceof ApiError) {
    const key = `error.${error.code}`;
    const known = t(key);
    if (known !== key) return known;
    if (error.status === 403) return t("error.FORBIDDEN");
    if (error.status === 429) return t("error.RATE_LIMITED");
    if (error.status >= 500) return t("error.INTERNAL_ERROR");
    return error.message;
  }
  return error instanceof Error ? error.message : t("error.INTERNAL_ERROR");
}

export function ErrorNotice({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  const t = useT();
  if (!error) return null;
  return (
    <div className="notice is-danger" role="alert">
      <WarningCircle size={20} weight="bold" aria-hidden="true" />
      <span>{errorMessage(error, t)}</span>
      {retry && (
        <button className="link" type="button" onClick={retry}>
          {t("action.retry")}
        </button>
      )}
    </div>
  );
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "ok" | "danger";
  children: ReactNode;
}) {
  return (
    <div
      className={`notice${tone === "ok" ? " is-ok" : tone === "danger" ? " is-danger" : ""}`}
      role="status"
    >
      <Info size={20} weight="bold" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

/** A labelled control. The label is the first child of a real <label>. */
export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** A modal dialog with a yellow band, a focus trap and Escape to close. */
export function Dialog({
  title,
  onClose,
  wide,
  children,
  foot,
}: {
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
  foot?: ReactNode;
}) {
  const t = useT();
  const panel = useRef<HTMLDivElement>(null);
  const heading = useId();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = panel.current;
    const first = element?.querySelector<HTMLElement>(
      "[data-autofocus]," + FOCUSABLE,
    );
    (first ?? element)?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close.current();
        return;
      }
      if (event.key !== "Tab" || !element) return;
      const items = Array.from(element.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!items.length) return;
      const start = items[0];
      const end = items[items.length - 1];
      if (event.shiftKey && document.activeElement === start) {
        event.preventDefault();
        end.focus();
      } else if (!event.shiftKey && document.activeElement === end) {
        event.preventDefault();
        start.focus();
      }
    };
    document.addEventListener("keydown", key, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key, true);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);
  return (
    <div
      className="scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        className={`dialog${wide ? " is-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={heading}
        tabIndex={-1}
      >
        <div className="dialog-band">
          <h2 id={heading}>{title}</h2>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label={t("action.close")}
          >
            <X size={22} weight="bold" />
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {foot && <div className="dialog-foot">{foot}</div>}
      </div>
    </div>
  );
}

type Announcement = { id: number; text: string; tone: "info" | "danger" };
const AnnounceContext = createContext<
  (text: string, tone?: Announcement["tone"]) => void
>(() => {});

/** Short station announcements: outcomes of an action, read aloud politely. */
export function Announcer({ children }: { children: ReactNode }) {
  const t = useT();
  const [items, setItems] = useState<Announcement[]>([]);
  const next = useRef(1);
  const dismiss = useCallback(
    (id: number) => setItems((current) => current.filter((i) => i.id !== id)),
    [],
  );
  const announce = useCallback(
    (text: string, tone: Announcement["tone"] = "info") => {
      const id = next.current++;
      setItems((current) => [...current.slice(-2), { id, text, tone }]);
      // A failure stays until dismissed; a confirmation leaves on its own.
      if (tone === "info") setTimeout(() => dismiss(id), 5200);
    },
    [dismiss],
  );
  const value = useMemo(() => announce, [announce]);
  return (
    <AnnounceContext.Provider value={value}>
      {children}
      <div className="announcer" aria-live="polite" aria-atomic="false">
        {items.map((item) => (
          <div
            key={item.id}
            className={`announcement${item.tone === "danger" ? " is-danger" : ""}`}
            role={item.tone === "danger" ? "alert" : "status"}
          >
            <span className="led-dot" aria-hidden="true" />
            <span>{item.text}</span>
            <button
              className="icon-button"
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label={t("action.close")}
            >
              <X size={18} weight="bold" />
            </button>
          </div>
        ))}
      </div>
    </AnnounceContext.Provider>
  );
}

export function useAnnounce() {
  return useContext(AnnounceContext);
}

export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children}
    </div>
  );
}

export function LoadMore({
  visible,
  loading,
  onClick,
}: {
  visible: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  const t = useT();
  if (!visible) return null;
  return (
    <div className="cluster" style={{ justifyContent: "center" }}>
      <button
        className="button"
        type="button"
        disabled={loading}
        onClick={onClick}
      >
        {loading ? t("state.loading") : t("action.more")}
      </button>
    </div>
  );
}
