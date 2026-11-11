import { useState } from "react";
import { AddressBook } from "@phosphor-icons/react";
import { api, isPublicPreview, type SavedRecipient } from "./api";
import {
  ConfirmAction,
  EmptyState,
  ErrorNotice,
  Field,
  Loading,
  PageHeading,
  useAction,
  useResource,
  validityMessage,
} from "./components";
import { DataTable } from "./data-table";
import { useCurrentClientView } from "./client-write-recovery";
import { t } from "./locale";
import { msg } from "./messages";

/**
 * Fax numbers and email addresses this workspace reuses. Every member reads
 * the list; members who prepare dispatches add and remove entries. A saved
 * address only fills a field: each dispatch is still prepared, reviewed and
 * approved on its own.
 */
export function SavedRecipients({ canPrepare }: { canPrepare: boolean }) {
  const resource = useResource<{ items: SavedRecipient[] }>(
    "/saved-recipients",
  );
  const action = useAction();
  const currentView = useCurrentClientView("saved-recipients");
  const [channel, setChannel] = useState<SavedRecipient["channel"]>("email");
  const [address, setAddress] = useState("");
  const editable = canPrepare && !isPublicPreview;
  async function save(event: React.FormEvent) {
    event.preventDefault();
    const isCurrent = currentView();
    await action.run(async () => {
      await api("/saved-recipients", {
        method: "POST",
        body: { channel, address },
      });
      if (!isCurrent()) return;
      setAddress("");
      resource.refresh();
    });
  }
  async function remove(id: string) {
    const isCurrent = currentView();
    await action.run(async () => {
      await api(`/saved-recipients/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (isCurrent()) resource.refresh();
    });
  }
  const items = resource.data?.items ?? [];
  return (
    <>
      <PageHeading title={msg("Recipients")} />
      <ErrorNotice
        error={action.error ?? resource.error}
        retry={resource.refresh}
      />
      {editable && (
        <form className="saved-recipient-form" onSubmit={(e) => void save(e)}>
          <Field label={t.channel}>
            <select
              value={channel}
              onChange={(event) =>
                setChannel(event.target.value as SavedRecipient["channel"])
              }
            >
              <option value="email">{t.channels.email}</option>
              <option value="fax">{t.channels.fax}</option>
            </select>
          </Field>
          <Field
            label={channel === "fax" ? t.dispatch.phone : t.dispatch.email}
          >
            <input
              type={channel === "fax" ? "tel" : "email"}
              autoComplete="off"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              {...validityMessage(
                channel === "fax"
                  ? msg(
                      "Use the international format, for example +352 26 00 00 00.",
                    )
                  : msg(
                      "Enter a full email address, for example name@example.com.",
                    ),
              )}
              required
            />
          </Field>
          <button className="button primary" disabled={action.pending}>
            {msg("Save the recipient")}
          </button>
        </form>
      )}
      {resource.loading && !resource.data ? (
        <Loading />
      ) : items.length ? (
        <DataTable
          label={msg("Recipients")}
          items={items}
          getRowKey={(item) => item.id}
          columns={[
            {
              id: "address",
              label: msg("Address"),
              value: (item) => item.address,
            },
            {
              id: "channel",
              label: t.channel,
              value: (item) => t.channels[item.channel],
            },
            ...(editable
              ? [
                  {
                    id: "remove",
                    label: msg("Remove"),
                    sortable: false,
                    value: () => "",
                    render: (item: SavedRecipient) => (
                      <ConfirmAction
                        className="text-button"
                        disabled={action.pending}
                        label={msg("Remove")}
                        question={msg(
                          "Remove {0} from the recipients?",
                          item.address,
                        )}
                        confirmLabel={msg("Remove")}
                        onConfirm={() => void remove(item.id)}
                      />
                    ),
                  },
                ]
              : []),
          ]}
        />
      ) : (
        resource.data && (
          <EmptyState
            icon={<AddressBook size={36} weight="light" aria-hidden="true" />}
            title={msg("No saved recipients")}
            text={
              editable
                ? msg(
                    "Save a fax number or an email address here, or when you prepare a dispatch.",
                  )
                : undefined
            }
          />
        )
      )}
    </>
  );
}
