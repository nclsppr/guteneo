import { msg } from "./messages";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  api,
  date,
  EURO_INPUT_PATTERN,
  euroToMinor,
  isPublicPreview,
  minorToEuroInput,
  money,
  type Channel,
  type ExpertApprovalConnection,
  type ExpertApprovalSettings,
} from "./api";
import {
  DateTimezone,
  ErrorNotice,
  Loading,
  RefreshButton,
  useAction,
  useResource,
} from "./components";
import "./expert-approval.css";

const getChannelNames = (): Record<Channel, string> => ({
  fax: msg("Fax"),
  email: msg("Email"),
  postal: msg("Post"),
});

function localDateTime(value: Date) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function ConnectionSettings({
  connection,
  canManage,
  selected,
  onUpdated,
}: {
  connection: ExpertApprovalConnection;
  canManage: boolean;
  selected: boolean;
  onUpdated: (data: ExpertApprovalSettings) => void;
}) {
  const id = useId();
  const policy = connection.policy;
  const expired = Boolean(
    policy?.enabled && new Date(policy.expiresAt).getTime() <= Date.now(),
  );
  const editable = canManage && connection.status === "active";
  const active =
    canManage &&
    connection.status === "active" &&
    policy?.enabled &&
    new Date(policy.expiresAt).getTime() > Date.now();
  const [editing, setEditing] = useState(selected && editable && !active);
  const heading = useRef<HTMLHeadingElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const noticeElement = useRef<HTMLParagraphElement>(null);
  const handledSelection = useRef(false);
  const [channels, setChannels] = useState<Channel[]>(
    policy?.channels ?? ["fax"],
  );
  const [perDispatch, setPerDispatch] = useState(
    minorToEuroInput(policy?.maxPerDispatchMinor ?? 500),
  );
  const [daily, setDaily] = useState(
    minorToEuroInput(policy?.maxDailyMinor ?? 2500),
  );
  const [count, setCount] = useState(String(policy?.maxDailyCount ?? 20));
  const [expires, setExpires] = useState(
    localDateTime(
      new Date(
        active && policy ? policy.expiresAt : Date.now() + 7 * 86_400_000,
      ),
    ),
  );
  const [acknowledged, setAcknowledged] = useState(false);
  const [postalAcknowledged, setPostalAcknowledged] = useState(false);
  const [validation, setValidation] = useState("");
  const [notice, setNotice] = useState("");
  const action = useAction();

  useEffect(() => {
    if (!selected) {
      handledSelection.current = false;
      return;
    }
    if (handledSelection.current) return;
    if (editable && !active) setEditing(true);
    const frame = requestAnimationFrame(() => {
      handledSelection.current = true;
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [selected, editable, active]);

  useEffect(() => {
    if (notice) noticeElement.current?.focus();
  }, [notice]);

  function changed() {
    setAcknowledged(false);
    setPostalAcknowledged(false);
    setValidation("");
    setNotice("");
    action.clear();
  }

  function startEditing() {
    changed();
    setChannels(policy?.channels ?? ["fax"]);
    setPerDispatch(minorToEuroInput(policy?.maxPerDispatchMinor ?? 500));
    setDaily(minorToEuroInput(policy?.maxDailyMinor ?? 2500));
    setCount(String(policy?.maxDailyCount ?? 20));
    setExpires(
      localDateTime(
        new Date(
          active && policy ? policy.expiresAt : Date.now() + 7 * 86_400_000,
        ),
      ),
    );
    setEditing(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editable || action.pending) return;
    if (channels.length === 0) {
      setValidation("Choose at least one channel for this delegation.");
      document.getElementById(`${id}-fax`)?.focus();
      return;
    }
    // Same bounds as the server; a comma or a point marks the decimals.
    const perDispatchMinor = euroToMinor(perDispatch);
    const dailyMinor = euroToMinor(daily);
    if (
      perDispatchMinor === null ||
      perDispatchMinor < 1 ||
      perDispatchMinor > 10_000
    ) {
      setValidation(msg("Enter a per-dispatch limit from €0.01 to €100."));
      document.getElementById(`${id}-per-dispatch`)?.focus();
      return;
    }
    if (dailyMinor === null || dailyMinor < 1 || dailyMinor > 50_000) {
      setValidation(msg("Enter a daily limit from €0.01 to €500."));
      document.getElementById(`${id}-daily`)?.focus();
      return;
    }
    if (dailyMinor < perDispatchMinor) {
      setValidation(
        "The daily cap must be at least as high as the per-delivery cap.",
      );
      document.getElementById(`${id}-daily`)?.focus();
      return;
    }
    if (!acknowledged || (channels.includes("postal") && !postalAcknowledged))
      return;
    await action.run(async () => {
      const result = await api<ExpertApprovalSettings>(
        `/account/expert-approval/${encodeURIComponent(connection.connectionId)}`,
        {
          method: "PUT",
          body: {
            enabled: true,
            channels,
            maxPerDispatchMinor: perDispatchMinor,
            maxDailyMinor: dailyMinor,
            maxDailyCount: Number(count),
            expiresAt: new Date(expires).toISOString(),
            acknowledgement: "delegate-approval-v1",
          },
        },
      );
      onUpdated(result);
      setEditing(false);
      setAcknowledged(false);
      setPostalAcknowledged(false);
      setNotice(
        "Your delegation has been saved for this connection. Return to ChatGPT and say “resume sending” to continue your request. This confirmation did not send anything.",
      );
    });
  }

  async function disable() {
    if (!editable || action.pending) return;
    await action.run(async () => {
      onUpdated(
        await api<ExpertApprovalSettings>(
          `/account/expert-approval/${encodeURIComponent(connection.connectionId)}`,
          { method: "PUT", body: { enabled: false } },
        ),
      );
      setEditing(false);
      setAcknowledged(false);
      setPostalAcknowledged(false);
      setNotice(
        "Delegation disabled. Deliveries already accepted remain unchanged.",
      );
    });
  }

  return (
    <article className="expert-connection" aria-labelledby={`${id}-title`}>
      <div className="expert-connection-heading">
        <div>
          <h3 id={`${id}-title`} ref={heading} tabIndex={-1}>
            {selected
              ? msg("Connection selected in ChatGPT")
              : msg("Assistant connection")}
          </h3>
          <p className="field-hint">
            {msg("OAuth client: ")}
            <code>{connection.clientId}</code>
          </p>
        </div>
        <span className="expert-state">
          {connection.status === "revoked"
            ? msg("Connection revoked")
            : policy?.enabled && !canManage
              ? msg("Inactive · administrator role required")
              : active
                ? msg("Delegation active")
                : policy?.enabled
                  ? msg("Delegation expired")
                  : msg("Disabled")}
        </span>
      </div>
      {selected && editable && !active && (
        <p className="field-hint">
          {expired
            ? msg(
                "This delegation has expired. Review its limits and choose a new date to resume sending in ChatGPT.",
              )
            : msg(
                "Review this connection’s limits, then personally confirm activation to continue sending in ChatGPT.",
              )}{" "}
          {msg("Opening this link does not grant any authorisation.")}
        </p>
      )}
      {policy && (
        <dl className="expert-summary">
          <div>
            <dt>{msg("Allowed channels")}</dt>
            <dd>
              {policy.channels
                .map((channel) => getChannelNames()[channel])
                .join(", ")}
            </dd>
          </div>
          <div>
            <dt>{msg("Cap per delivery")}</dt>
            <dd>{money(policy.maxPerDispatchMinor)}</dd>
          </div>
          <div>
            <dt>{msg("Daily cap")}</dt>
            <dd>
              {money(policy.maxDailyMinor)} · {policy.maxDailyCount}{" "}
              {msg(" deliveries")}
            </dd>
          </div>
          <div>
            <dt>{msg("Expiry")}</dt>
            <dd>{date(policy.expiresAt)}</dd>
          </div>
        </dl>
      )}
      {policy && <DateTimezone />}
      <p className="field-hint">
        {msg("Today (UTC): ")}
        {connection.usage.count} {msg(" delivery")}
        {connection.usage.count === 1 ? "" : "s"} ·{" "}
        {money(connection.usage.ceilingMinor)}{" "}
        {msg(
          " in caps committed by this connection. Caps for accepted deliveries remain counted until midnight UTC, even if cancelled or if the delegation changes.",
        )}
      </p>
      {policy?.channels.includes("postal") && (
        <p className="field-hint">
          {msg(
            "Letter preparations have a separate counter with the same daily count limit. Submitting a draft is not sending a letter.",
          )}
        </p>
      )}
      {editable && !editing && (
        <div className="button-group">
          <button
            ref={editButton}
            type="button"
            className="button"
            onClick={startEditing}
            disabled={action.pending}
          >
            {active
              ? msg("Edit delegation")
              : expired
                ? msg("Renew delegation")
                : msg("Set up delegation")}
          </button>
          {policy?.enabled && (
            <button
              type="button"
              className="button"
              onClick={() => void disable()}
              disabled={action.pending}
            >
              {action.pending ? msg("Disabling…") : msg("Disable delegation")}
            </button>
          )}
        </div>
      )}
      {editing && editable && (
        <form
          className="expert-form"
          onSubmit={(event) => void save(event)}
          aria-busy={action.pending}
        >
          <fieldset disabled={action.pending}>
            <legend>{msg("Allowed channels")}</legend>
            <div className="expert-channels">
              {(Object.keys(getChannelNames()) as Channel[]).map((channel) => (
                <label
                  className="checkbox-label"
                  key={channel}
                  htmlFor={`${id}-${channel}`}
                >
                  <input
                    id={`${id}-${channel}`}
                    type="checkbox"
                    checked={channels.includes(channel)}
                    aria-describedby={
                      validation ? `${id}-validation` : undefined
                    }
                    onChange={(event) => {
                      changed();
                      setChannels(
                        event.target.checked
                          ? [...channels, channel]
                          : channels.filter((value) => value !== channel),
                      );
                    }}
                  />
                  {getChannelNames()[channel]}
                </label>
              ))}
            </div>
            <div className="expert-limits">
              <div className="field">
                <label htmlFor={`${id}-per-dispatch`}>
                  {msg("Cap per delivery (€)")}
                </label>
                <input
                  id={`${id}-per-dispatch`}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  pattern={EURO_INPUT_PATTERN}
                  title={msg("Amount in euros, for example 5 or 2.35.")}
                  required
                  value={perDispatch}
                  aria-describedby={validation ? `${id}-validation` : undefined}
                  onChange={(event) => {
                    changed();
                    setPerDispatch(event.target.value);
                  }}
                />
                <small>{msg("From €0.01 to €100.")}</small>
              </div>
              <div className="field">
                <label htmlFor={`${id}-daily`}>{msg("Daily cap (€)")}</label>
                <input
                  id={`${id}-daily`}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  pattern={EURO_INPUT_PATTERN}
                  title={msg("Amount in euros, for example 25 or 12.50.")}
                  required
                  value={daily}
                  aria-invalid={
                    validation && channels.length > 0 ? true : undefined
                  }
                  aria-describedby={validation ? `${id}-validation` : undefined}
                  onChange={(event) => {
                    changed();
                    setDaily(event.target.value);
                  }}
                />
                <small>
                  {msg("From €0.01 to €500, at least the per-delivery cap.")}
                </small>
              </div>
              <div className="field">
                <label htmlFor={`${id}-count`}>
                  {msg("Maximum deliveries per day")}
                </label>
                <input
                  id={`${id}-count`}
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="1000"
                  step="1"
                  required
                  value={count}
                  onChange={(event) => {
                    changed();
                    setCount(event.target.value);
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor={`${id}-expires`}>
                  {msg("Delegation expiry")}
                </label>
                <input
                  id={`${id}-expires`}
                  type="datetime-local"
                  min={localDateTime(new Date())}
                  max={localDateTime(new Date(Date.now() + 30 * 86_400_000))}
                  required
                  value={expires}
                  aria-describedby={`${id}-expires-help`}
                  onChange={(event) => {
                    changed();
                    setExpires(event.target.value);
                  }}
                />
                <small id={`${id}-expires-help`}>
                  {msg(
                    "This device’s local time. No more than 30 days from now.",
                  )}
                </small>
              </div>
            </div>
            <p className="field-hint">
              {msg(
                "Daily limits reset at midnight UTC. They cover the number of deliveries and their caps, even if the final charge is lower. Credit and channel permissions are still required.",
              )}
            </p>
            {channels.includes("postal") && (
              <label className="checkbox-label expert-agreement">
                <input
                  type="checkbox"
                  required
                  checked={postalAcknowledged}
                  onChange={(event) =>
                    setPostalAcknowledged(event.target.checked)
                  }
                />
                <span>
                  {msg(
                    "I also authorise this assistant to transfer the PDF to our printing provider to obtain the postal quote, with no dispatch at this stage, and then to approve sending in the conversation.",
                  )}
                </span>
              </label>
            )}
            <p className="expert-warning">
              {msg(
                "This mandate lets the assistant approve within the conversation without returning to the website for each delivery. It is not evidence of your human consent for each call. ChatGPT, Claude or your other assistant’s rules still apply. Compromised access to this connection could trigger deliveries within these limits.",
              )}
            </p>
            <label className="checkbox-label expert-agreement">
              <input
                type="checkbox"
                required
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              <span>
                {msg(
                  "I authorise approval delegation to this assistant for the channels, limits and duration shown. I can disable it for new deliveries; those already accepted remain unchanged.",
                )}
              </span>
            </label>
            <p
              id={`${id}-validation`}
              className="expert-validation"
              aria-live="polite"
            >
              {msg(validation)}
            </p>
            <div className="button-group">
              <button type="submit" className="button primary">
                {action.pending
                  ? msg("Saving…")
                  : active
                    ? msg("Confirm change")
                    : expired
                      ? msg("Confirm renewal")
                      : msg("Confirm activation")}
              </button>
              <button
                type="button"
                className="button"
                onClick={() => {
                  changed();
                  setEditing(false);
                  requestAnimationFrame(() => editButton.current?.focus());
                }}
              >
                {msg("Cancel")}
              </button>
            </div>
          </fieldset>
        </form>
      )}
      <ErrorNotice error={action.error} />
      <p className="field-hint" role="status" tabIndex={-1} ref={noticeElement}>
        {msg(notice)}
      </p>
    </article>
  );
}

export function ExpertApproval() {
  const selectedConnection = new URLSearchParams(
    window.location.hash.split("?")[1] ?? "",
  ).get("connection");
  const resource = useResource<ExpertApprovalSettings>(
    isPublicPreview ? null : "/account/expert-approval",
  );
  const unavailableNotice = useRef<HTMLParagraphElement>(null);
  const unavailable = Boolean(
    selectedConnection !== null &&
    resource.data &&
    !resource.data.connections.some(
      (connection) => connection.connectionId === selectedConnection,
    ),
  );
  useEffect(() => {
    if (unavailable) unavailableNotice.current?.focus();
  }, [unavailable, selectedConnection]);
  return (
    <section
      className="form-panel expert-settings"
      aria-labelledby="expert-approval-title"
    >
      <div className="expert-heading">
        <div>
          <p className="eyebrow">{msg("Personal option · off by default")}</p>
          <h2 id="expert-approval-title">{msg("Expert mode")}</h2>
        </div>
        {!isPublicPreview && (
          <RefreshButton
            onClick={resource.refresh}
            disabled={resource.loading}
          />
        )}
      </div>
      <p>
        {msg(
          "Delegate delivery approval to a connected assistant within limits you choose. Without this delegation, you continue to approve each delivery on the website.",
        )}
      </p>
      {isPublicPreview ? (
        <p className="notice info">
          {msg(
            "No delegation is active in this preview. In your account, you can choose an assistant connection, its channels, caps and expiry date.",
          )}
        </p>
      ) : (
        <>
          <ErrorNotice error={resource.error} retry={resource.refresh} />
          {resource.loading && !resource.data && <Loading />}
          {resource.data && (
            <>
              {unavailable && (
                <p
                  className="notice info"
                  role="status"
                  tabIndex={-1}
                  ref={unavailableNotice}
                >
                  {msg(
                    "This connection is not available in your account. No permissions have changed. Choose one of your connections below or reconnect your assistant from ChatGPT.",
                  )}
                </p>
              )}
              {!resource.data.canManage && (
                <p className="notice info">
                  {msg(
                    "Only an administrator can manage delegation for their own connections. Your permissions are shown read-only.",
                  )}
                </p>
              )}
              {resource.data.connections.length === 0 ? (
                <p className="empty-inline">
                  {msg("You do not have an assistant connection yet.")}{" "}
                  <a href="#/app/connection">{msg("Connect an assistant")}</a>
                </p>
              ) : (
                resource.data.connections.map((connection) => (
                  <ConnectionSettings
                    key={`${connection.connectionId}:${connection.connectionId === selectedConnection}`}
                    connection={connection}
                    canManage={resource.data!.canManage}
                    selected={connection.connectionId === selectedConnection}
                    onUpdated={resource.setData}
                  />
                ))
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
