import { useEffect, useId, useMemo, useRef, useState } from "react";
import { go } from "./components";
import { msg } from "./messages";

export type CommandItem = { label: string; path: string };

/**
 * Keyboard access to the pages of the current application (Ctrl or ⌘ + K).
 * It only lists entries the menu already shows for the signed-in role, so it
 * grants nothing; a guarded page still refuses an unauthorized action.
 */
export function CommandPalette({ items }: { items: readonly CommandItem[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  useEffect(() => {
    const open = (event: KeyboardEvent) => {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.shiftKey ||
        event.key.toLowerCase() !== "k"
      )
        return;
      const element = dialog.current;
      if (!element) return;
      event.preventDefault();
      if (element.open) return;
      setQuery("");
      setActive(0);
      element.showModal();
    };
    window.addEventListener("keydown", open);
    return () => window.removeEventListener("keydown", open);
  }, []);
  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle
      ? items.filter((item) => item.label.toLocaleLowerCase().includes(needle))
      : items;
  }, [items, query]);
  const current = Math.min(active, Math.max(0, matches.length - 1));
  const choose = (item?: CommandItem) => {
    if (!item) return;
    dialog.current?.close();
    go(item.path);
  };
  return (
    <dialog
      ref={dialog}
      className="command-palette"
      aria-label={msg("Go to a page")}
      onClick={(event) => {
        // A click on the backdrop reaches the dialog itself.
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <input
        type="search"
        role="combobox"
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={
          matches.length ? `${listId}-${current}` : undefined
        }
        aria-label={msg("Go to a page")}
        placeholder={msg("Go to a page")}
        autoComplete="off"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive(Math.min(current + 1, matches.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive(Math.max(current - 1, 0));
          } else if (event.key === "Enter") {
            event.preventDefault();
            choose(matches[current]);
          }
        }}
      />
      <ul id={listId} role="listbox" aria-label={msg("Go to a page")}>
        {matches.map((item, index) => (
          <li
            key={item.path}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === current}
            onMouseEnter={() => setActive(index)}
            onClick={() => choose(item)}
          >
            {item.label}
          </li>
        ))}
      </ul>
      {!matches.length && (
        <p className="command-palette-empty" role="status">
          {msg("No matching page")}
        </p>
      )}
    </dialog>
  );
}
