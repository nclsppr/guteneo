import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import type { PostalSetup } from "../../../packages/contracts/src/postal-setup";
import { api, isPublicPreview } from "./api";
import {
  ErrorNotice,
  Field,
  Loading,
  useAction,
  useResource,
} from "./components";
import { fr as t } from "./i18n";

export function PostalSetupPanel({
  onUpdated,
  onStatus,
}: {
  onUpdated: () => void;
  onStatus: (status: PostalSetup) => void;
}) {
  const resource = useResource<PostalSetup>(
    isPublicPreview ? null : "/postal/setup",
  );
  const [saved, setSaved] = useState(false);
  const result = useRef<HTMLHeadingElement>(null);
  const setup = resource.data;
  useEffect(() => {
    if (setup) onStatus(setup);
  }, [setup, onStatus]);
  useEffect(() => {
    if (saved) result.current?.focus();
  }, [saved]);
  if (isPublicPreview) return null;
  if (resource.error)
    return <ErrorNotice error={resource.error} retry={resource.refresh} />;
  if (!setup) return <Loading />;
  const restricted =
    setup.reason === "sender_disabled" ||
    setup.reason === "operator_review_required";
  const stopped =
    setup.reason === "channel_stopped" ||
    (setup.configured && !setup.channelEnabled);
  return (
    <section className="form-panel" aria-labelledby="postal-setup-title">
      <h2 id="postal-setup-title" ref={result} tabIndex={-1}>
        {setup.configured && !stopped && !restricted && setup.available
          ? t.postalSetup.ready
          : t.postalSetup.title}
      </h2>
      <p role="status" aria-live="polite">
        {saved && setup.configured && setup.channelEnabled
          ? t.postalSetup.saved
          : ""}
      </p>
      {!setup.available ? (
        <p>{t.postalSetup.unavailable}</p>
      ) : restricted ? (
        <p>{t.postalSetup.restricted}</p>
      ) : stopped ? (
        <>
          <p>{t.postalSetup.stopped}</p>
          <p className="field-hint">{t.postalSetup.stoppedBody}</p>
          {setup.canManage && (
            <a className="button" href="#/app/admin">
              {t.postalSetup.administration}
            </a>
          )}
        </>
      ) : setup.configured ? (
        <>
          {setup.sender && (
            <p>
              <strong>{setup.sender.name}</strong>
              {" · "}
              {setup.senderVerification === "administrator_declaration"
                ? t.postalSetup.declared
                : setup.senderVerification === "oauth_administrator_submission"
                  ? t.postalSetup.submittedInChat
                  : t.postalSetup.managed}
            </p>
          )}
          <p>{t.postalSetup.readyBody}</p>
          <a className="button primary" href="#/app/prepare?channel=postal">
            {t.postalSetup.prepare}
            <ArrowRight size={18} aria-hidden="true" />
          </a>
        </>
      ) : !setup.canManage ? (
        <p>{t.postalSetup.adminNeeded}</p>
      ) : (
        <PostalSetupForm
          key={setup.sender?.id ?? "new"}
          setup={setup}
          onSaved={(next) => {
            resource.setData(next);
            setSaved(true);
            onUpdated();
          }}
        />
      )}
    </section>
  );
}

function PostalSetupForm({
  setup,
  onSaved,
}: {
  setup: PostalSetup;
  onSaved: (status: PostalSetup) => void;
}) {
  const [name, setName] = useState(setup.sender?.name ?? "");
  const [address, setAddress] = useState(setup.sender?.address ?? "");
  const [authorized, setAuthorized] = useState(false);
  const action = useAction();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (action.pending || !authorized) return;
    await action.run(async () => {
      const next = await api<PostalSetup>("/postal/setup", {
        method: "POST",
        body: { name: name.trim(), address: address.trim(), authorized: true },
      });
      setAuthorized(false);
      onSaved(next);
    });
  }
  return (
    <form onSubmit={(event) => void submit(event)} aria-busy={action.pending}>
      <p>{t.postalSetup.intro}</p>
      <ErrorNotice error={action.error} />
      <Field label={t.postalSetup.name}>
        <input
          name="postalSenderName"
          autoComplete="organization"
          required
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
          readOnly={!!setup.sender}
          disabled={action.pending}
        />
      </Field>
      <Field label={t.postalSetup.address} hint={t.postalSetup.addressHint}>
        <textarea
          name="postalSenderAddress"
          autoComplete="street-address"
          required
          minLength={10}
          maxLength={500}
          rows={4}
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          readOnly={!!setup.sender}
          disabled={action.pending}
        />
      </Field>
      <label className="checkbox-label">
        <input
          type="checkbox"
          required
          checked={authorized}
          disabled={action.pending}
          onChange={(event) => setAuthorized(event.target.checked)}
        />
        <span>{t.postalSetup.declaration}</span>
      </label>
      <p className="field-hint">{t.postalSetup.declarationNote}</p>
      <p className="field-hint">{t.postalSetup.documentNote}</p>
      <button className="button primary" disabled={action.pending}>
        {action.pending
          ? t.postalSetup.submitting
          : setup.sender
            ? t.postalSetup.renew
            : t.postalSetup.submit}
        <ArrowRight size={18} aria-hidden="true" />
      </button>
      <p className="field-hint">{t.postalSetup.noSend}</p>
    </form>
  );
}
