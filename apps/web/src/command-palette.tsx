import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowRight, MagnifyingGlass, X } from "@phosphor-icons/react";
import { msg } from "./messages";
import { useLocale } from "./locale";
import { normalizeTableSearch } from "./data-table-model";
import "./workspace-tools.css";

export type NavigationCommand = {
  id: string;
  label: string;
  route: string;
  keywords?: string[];
};

/** Commands navigate only. Authority and unsaved-work guards remain in the router. */
export function CommandPalette({
  commands,
}: {
  commands: readonly NavigationCommand[];
}) {
  useLocale();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const matches = useMemo(() => {
    const words = normalizeTableSearch(query.trim())
      .split(/\s+/)
      .filter(Boolean);
    const normalizedQuery = normalizeTableSearch(query.trim());
    const rank = (item: NavigationCommand) => {
      const label = normalizeTableSearch(item.label);
      return label === normalizedQuery
        ? 0
        : label.startsWith(normalizedQuery)
          ? 1
          : 2;
    };
    return commands
      .filter((item) => {
        if (!/^\/app(?:\/[A-Za-z0-9_-]+)*$/.test(item.route)) return false;
        const text = normalizeTableSearch(
          [item.label, ...(item.keywords ?? [])].join(" "),
        );
        return words.every((word) => text.includes(word));
      })
      .sort((a, b) => rank(a) - rank(b))
      .slice(0, 30);
  }, [commands, query]);
  const active = Math.min(selected, Math.max(0, matches.length - 1));
  const openPalette = useCallback(() => {
    returnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setQuery("");
    setSelected(0);
    setOpen(true);
  }, []);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        !event.isComposing &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        if (!event.repeat) {
          if (open) setOpen(false);
          else openPalette();
        }
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [open, openPalette]);
  useEffect(() => {
    if (open) {
      if (!dialog.current?.open) dialog.current?.showModal();
      search.current?.focus();
    } else if (dialog.current?.open) {
      dialog.current.close();
      (returnFocus.current?.isConnected
        ? returnFocus.current
        : trigger.current
      )?.focus();
    }
  }, [open]);
  useEffect(() => {
    if (open && matches[active])
      document
        .getElementById(`${id}-${matches[active].id}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [open, matches, active, id]);
  const choose = (item: NavigationCommand | undefined) => {
    if (!item) return;
    dialog.current?.close();
    setOpen(false);
    window.location.hash = item.route;
  };
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="button subtle small"
        aria-label={msg("Commands")}
        aria-keyshortcuts="Control+K Meta+K"
        onClick={openPalette}
      >
        <MagnifyingGlass size={20} aria-hidden="true" />
        <span>{msg("Commands")}</span>
      </button>
      <dialog
        ref={dialog}
        className="command-palette"
        aria-labelledby={`${id}-title`}
        onCancel={(event) => {
          event.preventDefault();
          setOpen(false);
        }}
        onClose={(event) => {
          if (!event.currentTarget.open) setOpen(false);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
      >
        <div className="command-palette__heading">
          <h2 id={`${id}-title`}>{msg("Commands")}</h2>
          <button
            type="button"
            className="button subtle small"
            aria-label={msg("Close commands")}
            onClick={() => setOpen(false)}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <label className="command-palette__search field">
          <span className="sr-only">{msg("Search commands")}</span>
          <MagnifyingGlass size={20} aria-hidden="true" />
          <input
            ref={search}
            type="search"
            role="combobox"
            aria-autocomplete="list"
            aria-controls={`${id}-results`}
            aria-expanded={open}
            aria-activedescendant={
              matches[active] ? `${id}-${matches[active].id}` : undefined
            }
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
              } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                if (matches.length)
                  setSelected(
                    (active +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      matches.length) %
                      matches.length,
                  );
              } else if (event.key === "Enter") {
                event.preventDefault();
                choose(matches[active]);
              }
            }}
          />
        </label>
        <ul
          id={`${id}-results`}
          role="listbox"
          aria-label={msg("Commands")}
          hidden={!matches.length}
        >
          {matches.map((item, index) => (
            <li
              key={item.id}
              id={`${id}-${item.id}`}
              role="option"
              aria-selected={active === index}
              onPointerMove={() => setSelected(index)}
              onClick={() => choose(item)}
            >
              {item.label}
              <ArrowRight size={18} aria-hidden="true" />
            </li>
          ))}
        </ul>
        {!matches.length && <p role="status">{msg("No matching commands.")}</p>}
      </dialog>
    </>
  );
}
