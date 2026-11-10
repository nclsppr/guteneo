import { Field } from "./components";
import { useId, useRef, useState } from "react";
import {
  savedRecipientInput,
  type SavedRecipientInput,
  type SavedRecipientView,
} from "../../../packages/contracts/src/saved-recipients";
import { PINGEN_POSTAL_COUNTRY_CODES } from "../../../packages/contracts/src/postal-destinations";
import { api, recipientDisplayLines, type Channel, type Page } from "./api";
import { DataTable } from "./data-table";
import {
  EmptyState,
  ErrorNotice,
  go,
  Loading,
  LoadMore,
  PageHeading,
  useAction,
  useRefreshOnFocus,
  useResource,
} from "./components";
import { msg } from "./messages";
import { formatLocale, t } from "./locale";
import {
  isAuthorityRefusal,
  observeAuthorityRefusal,
} from "./client-authority-refusal";
import "./lifecycle-pages.css";

export default function RecipientPages({ route }: { route: string }) {
  const path = route.split("?")[0] ?? "";
  const id = path.slice("/app/recipients/".length);
  if (path === "/app/recipients") return <RecipientList />;
  if (id === "new") return <RecipientEditor />;
  return <RecipientDetail key={id} id={id} />;
}

function RecipientList() {
  const recipients = useResource<Page<SavedRecipientView>>(
    "/recipients?limit=100",
  );
  useRefreshOnFocus(recipients.refresh);
  return (
    <>
      <PageHeading
        title={msg("Saved recipients")}
        action={
          <a className="button" href="#/app/recipients/new">
            {msg("New recipient")}
          </a>
        }
      />
      <ErrorNotice error={recipients.error} retry={recipients.refresh} />
      {!recipients.data && recipients.loading && <Loading />}
      {recipients.data && !isAuthorityRefusal(recipients.error) && (
        <DataTable
          viewId="recipients"
          items={recipients.data.items}
          getRowKey={(item) => item.id}
          label={msg("Saved recipients")}
          empty={<EmptyState title={msg("No saved recipients.")} />}
          columns={[
            {
              id: "label",
              label: msg("Recipient label"),
              value: (item) => item.label,
              render: (item) => (
                <a href={`#/app/recipients/${item.id}`}>{item.label}</a>
              ),
            },
            {
              id: "channel",
              label: msg("Channel"),
              value: (item) => item.channel,
              render: (item) => t.channels[item.channel],
            },
            {
              id: "recipient",
              label: msg("Recipient"),
              value: (item) => recipientDisplayLines(item.recipient).join(", "),
            },
          ]}
        />
      )}
      <LoadMore
        path="/recipients?limit=100"
        data={recipients.data}
        onLoaded={recipients.setData}
      />
    </>
  );
}

function RecipientDetail({ id }: { id: string }) {
  const recipient = useResource<SavedRecipientView>(
    `/recipients/${encodeURIComponent(id)}`,
  );
  return (
    <>
      <ErrorNotice error={recipient.error} retry={recipient.refresh} />
      {!recipient.data && recipient.loading && <Loading />}
      {recipient.data && !isAuthorityRefusal(recipient.error) && (
        <RecipientEditor
          key={`${recipient.data.id}:${recipient.data.revision}`}
          entry={recipient.data}
          onReload={recipient.refresh}
        />
      )}
    </>
  );
}

function RecipientEditor({
  entry,
  onReload,
}: {
  entry?: SavedRecipientView;
  onReload?: () => void;
}) {
  const id = useId();
  const [label, setLabel] = useState(entry?.label ?? "");
  const [channel, setChannel] = useState<Channel>(entry?.channel ?? "fax");
  const [phone, setPhone] = useState(
    entry?.channel === "fax" ? entry.recipient.phone : "",
  );
  const [email, setEmail] = useState(
    entry?.channel === "email" ? entry.recipient.email : "",
  );
  const postal = entry?.channel === "postal" ? entry.recipient : undefined;
  const [country, setCountry] = useState(postal?.country ?? "FR");
  const originalPostalAddress = postal
    ? "addressLines" in postal
      ? postal.addressLines.join("\n")
      : [postal.name, postal.line1, `${postal.postalCode} ${postal.city}`].join(
          "\n",
        )
    : "";
  const [address, setAddress] = useState(originalPostalAddress);
  const action = useAction(`${entry?.id ?? "new"}:${entry?.revision ?? 0}`);
  const [refusal, setRefusal] = useState<Error>();
  const request = useRef<{ body: string; key: string } | undefined>(undefined);
  const save = () =>
    void action.run(async (view) => {
      const raw = {
        label,
        channel,
        recipient:
          channel === "fax"
            ? { phone }
            : channel === "email"
              ? { email }
              : postal &&
                  !("addressLines" in postal) &&
                  address === originalPostalAddress &&
                  ["FR", "LU", "DE"].includes(country)
                ? { ...postal, country }
                : { country, addressLines: address.split(/\r?\n/) },
      };
      const parsed = savedRecipientInput.safeParse(raw);
      if (!parsed.success) throw new Error(msg("Check the recipient details."));
      const body: SavedRecipientInput = parsed.data;
      const serialized = JSON.stringify(body);
      if (request.current?.body !== serialized)
        request.current = { body: serialized, key: crypto.randomUUID() };
      const saved = await view.wait(
        observeAuthorityRefusal(
          api<SavedRecipientView>(
            entry ? `/recipients/${entry.id}` : "/recipients",
            {
              method: entry ? "PATCH" : "POST",
              key: request.current.key,
              body: entry
                ? { expectedRevision: entry.revision, value: body }
                : body,
            },
          ),
          view,
          setRefusal,
        ),
        (result) => ({
          kind: "recipient_saved",
          resourceId: result.id,
          route: `/app/recipients/${result.id}`,
        }),
      );
      go(`/app/recipients/${saved.id}`);
      onReload?.();
    });
  if (refusal)
    return (
      <>
        <PageHeading title={msg("Saved recipients")} />
        <ErrorNotice error={refusal} />
        <a href="#/app">{msg("Overview")}</a>
      </>
    );
  return (
    <>
      <PageHeading
        title={entry ? msg("Edit recipient") : msg("New recipient")}
      />
      <form
        className="form-panel panel lifecycle-form"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <fieldset disabled={action.pending}>
          <Field label={msg("Recipient label")}>
            <input
              id={`${id}-label`}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              required
              maxLength={160}
              autoComplete="off"
            />
          </Field>
          <Field label={msg("Channel")}>
            <select
              id={`${id}-channel`}
              value={channel}
              onChange={(event) => setChannel(event.target.value as Channel)}
            >
              {(["fax", "email", "postal"] as const).map((value) => (
                <option key={value} value={value}>
                  {t.channels[value]}
                </option>
              ))}
            </select>
          </Field>
          {channel === "fax" && (
            <Field label={msg("Fax number")}>
              <input
                id={`${id}-phone`}
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                required
                maxLength={80}
                autoComplete="off"
              />
            </Field>
          )}
          {channel === "email" && (
            <Field label={msg("Email address")}>
              <input
                id={`${id}-email`}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                maxLength={320}
                autoComplete="off"
              />
            </Field>
          )}
          {channel === "postal" && (
            <>
              <Field label={msg("Country")}>
                <select
                  id={`${id}-country`}
                  value={country}
                  onChange={(event) =>
                    setCountry(event.target.value as typeof country)
                  }
                >
                  {PINGEN_POSTAL_COUNTRY_CODES.map((value) => (
                    <option key={value} value={value}>
                      {new Intl.DisplayNames(formatLocale(), {
                        type: "region",
                      }).of(value) ?? value}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={msg("Postal address, one line per line")}>
                <textarea
                  id={`${id}-address`}
                  rows={6}
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  required
                  maxLength={966}
                  autoComplete="off"
                />
              </Field>
            </>
          )}
          <div className="actions">
            <button type="submit" className="button">
              {action.pending ? t.loading : msg("Save recipient")}
            </button>
            <a className="button subtle" href="#/app/recipients">
              {msg("Cancel")}
            </a>
          </div>
        </fieldset>
        <ErrorNotice error={action.error} />
        {action.error && onReload && (
          <button type="button" className="button subtle" onClick={onReload}>
            {msg("Reload recipient")}
          </button>
        )}
      </form>
      {entry && (
        <button
          type="button"
          className="button danger"
          disabled={action.pending}
          onClick={() => {
            if (
              !window.confirm(
                msg(
                  "Delete this saved recipient? Prepared dispatches keep their original recipient.",
                ),
              )
            )
              return;
            void action.run(async (view) => {
              await view.wait(
                observeAuthorityRefusal(
                  api(`/recipients/${entry.id}`, {
                    method: "DELETE",
                    body: { expectedRevision: entry.revision },
                  }),
                  view,
                  setRefusal,
                ),
              );
              go("/app/recipients");
            });
          }}
        >
          {msg("Delete recipient")}
        </button>
      )}
    </>
  );
}
