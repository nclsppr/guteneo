import { Field } from "./components";
import { useState } from "react";
import type { SavedRecipientView } from "../../../packages/contracts/src/saved-recipients";
import { type Channel, type Page } from "./api";
import { ErrorNotice, LoadMore, useResource } from "./components";
import { msg } from "./messages";
import "./lifecycle-pages.css";

/** Choosing copies a recipient into the draft; later contact edits never alter it. */
export function SavedRecipientPicker({
  channel,
  onChoose,
}: {
  channel: Channel;
  onChoose: (recipient: SavedRecipientView) => void;
}) {
  const [open, setOpen] = useState(false);
  const recipients = useResource<Page<SavedRecipientView>>(
    open ? "/recipients?limit=100" : null,
  );
  const items =
    recipients.data?.items.filter((item) => item.channel === channel) ?? [];
  return (
    <details
      className="saved-recipient-picker"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>{msg("Choose a saved recipient")}</summary>
      <ErrorNotice
        error={recipients.error}
        retry={recipients.refresh}
        focusOnError={false}
      />
      <Field label={msg("Saved recipients")}>
        <select
          value=""
          disabled={recipients.loading && !recipients.data}
          onChange={(event) => {
            const selected = items.find(
              (item) => item.id === event.currentTarget.value,
            );
            if (selected) onChoose(selected);
          }}
        >
          <option value="">{msg("Choose a saved recipient")}</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </Field>
      {recipients.data && !items.length && (
        <p className="muted">{msg("No saved recipients.")}</p>
      )}
      <LoadMore
        path="/recipients?limit=100"
        data={recipients.data}
        onLoaded={recipients.setData}
      />
      <a href="#/app/recipients">{msg("Saved recipients")}</a>
    </details>
  );
}
