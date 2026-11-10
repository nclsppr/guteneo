import { useEffect, useState } from "react";
import { BookmarkSimple, FloppyDisk, Trash } from "@phosphor-icons/react";
import { msg } from "./messages";
import {
  cleanTablePresentation,
  maximumTableViews,
  readTableViews,
  writeTableViews,
  type SavedTableView,
  type TablePresentation,
  type TableViewSchema,
} from "./table-views";

export function TableViewControls({
  storageKey,
  schema,
  value,
  onApply,
}: {
  storageKey: string;
  schema: TableViewSchema;
  value: TablePresentation;
  onApply: (view: TablePresentation) => void;
}) {
  const [views, setViews] = useState<SavedTableView[]>(() => {
    try {
      return readTableViews(window.localStorage.getItem(storageKey), schema);
    } catch {
      return [];
    }
  });
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === storageKey)
        setViews(readTableViews(event.newValue, schema));
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [storageKey, schema]);
  function save(next: SavedTableView[]) {
    try {
      window.localStorage.setItem(storageKey, writeTableViews(next, schema));
      setViews(next);
      setError(false);
      return true;
    } catch {
      setError(true);
      return false;
    }
  }
  return (
    <details className="data-table__views">
      <summary className="button subtle small">
        <BookmarkSimple size={17} aria-hidden="true" />
        {msg("Saved views")}
      </summary>
      <div className="data-table__view-controls">
        <label>
          <span className="sr-only">{msg("Saved views")}</span>
          <select
            value={selected}
            onChange={(event) => {
              const view = views.find((item) => item.id === event.target.value);
              setSelected(view?.id ?? "");
              setName(view?.name ?? "");
              if (view) onApply(cleanTablePresentation(view, schema));
            }}
          >
            <option value="">{msg("Current view")}</option>
            {views.map((view) => (
              <option value={view.id} key={view.id}>
                {view.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">{msg("View name")}</span>
          <input
            value={name}
            maxLength={48}
            placeholder={msg("View name")}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="button subtle small"
          disabled={
            !name.trim() ||
            (!views.some((item) => item.name === name.trim()) &&
              views.length >= maximumTableViews)
          }
          onClick={() => {
            const existing = views.find((item) => item.name === name.trim());
            const view = {
              id: existing?.id ?? crypto.randomUUID(),
              name: name.trim(),
              ...cleanTablePresentation(value, schema),
            };
            if (save([view, ...views.filter((item) => item.id !== view.id)]))
              setSelected(view.id);
          }}
        >
          <FloppyDisk size={17} aria-hidden="true" />
          {msg("Save sort and filters")}
        </button>
        <button
          type="button"
          className="button subtle small"
          disabled={!selected}
          aria-label={msg("Delete view")}
          onClick={() => {
            if (save(views.filter((item) => item.id !== selected))) {
              setSelected("");
              setName("");
            }
          }}
        >
          <Trash size={17} aria-hidden="true" />
        </button>
        {error && (
          <p role="alert">{msg("This browser could not save the view.")}</p>
        )}
      </div>
    </details>
  );
}
