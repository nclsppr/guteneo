import { msg } from "./messages";
import { useEffect, useState } from "react";
import { Copy, LockKey, Check } from "@phosphor-icons/react";
import { api, date, money, type Dispatch } from "./api";
import {
  DateTimezone,
  ErrorNotice,
  Field,
  useAction,
  useResource,
} from "./components";

export type ProtectedDelivery = {
  hostingId: string;
  expiresAt: string;
  durationDays: number;
  hostingFeeMinor: number;
};

export function protectedDelivery(
  dispatch: Dispatch,
): ProtectedDelivery | undefined {
  try {
    const options =
      typeof dispatch.options_json === "string"
        ? JSON.parse(dispatch.options_json)
        : dispatch.options_json;
    return options?.emailDeliveryMode === "protected_link"
      ? options.protectedDocument
      : undefined;
  } catch {
    return undefined;
  }
}

export function ProtectedDocumentChoice({
  enabled,
  days,
  onEnabled,
  onDays,
}: {
  enabled: boolean;
  days: number;
  onEnabled: (enabled: boolean) => void;
  onDays: (days: 1 | 7 | 30) => void;
}) {
  return (
    <section
      className="protected-document-choice"
      aria-label={msg("PDF access")}
    >
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabled(event.target.checked)}
        />
        <span>
          {msg("Send a password-protected link")}
          <small className="sub-label">
            {msg("€1 per hosted document, in addition to the email dispatch.")}
          </small>
        </span>
      </label>
      {enabled && (
        <>
          <Field label={msg("Link expiry")}>
            <select
              value={days}
              onChange={(event) =>
                onDays(Number(event.target.value) as 1 | 7 | 30)
              }
            >
              <option value="1">{msg("After 1 day")}</option>
              <option value="7">{msg("After 7 days")}</option>
              <option value="30">{msg("After 30 days")}</option>
            </select>
          </Field>
          <p className="field-hint">
            {msg(
              "The email contains a link, with no attachment. The recipient enters the password without creating an account. You can copy this password at the next step and share it through another channel.",
            )}
          </p>
          <p className="field-hint">
            {msg(
              "Access is protected; this is not end-to-end encryption. A downloaded copy remains accessible after the link is revoked.",
            )}
          </p>
        </>
      )}
    </section>
  );
}

export function ProtectedDocumentSummary({
  dispatch,
  onUpdated,
  canManage = true,
  canRevoke = true,
}: {
  dispatch: Dispatch;
  onUpdated: () => void;
  canManage?: boolean;
  canRevoke?: boolean;
}) {
  const protection = protectedDelivery(dispatch);
  const action = useAction();
  const status = useResource<{
    status: "draft" | "active" | "expired" | "revoked";
    expiresAt: string;
    hostingFeeMinor: number;
  }>(
    protection
      ? `/dispatches/${encodeURIComponent(dispatch.id)}/protected-document`
      : null,
  );
  const [password, setPassword] = useState("");
  const [copied, setCopied] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  useEffect(() => {
    setPassword("");
    setCopied(false);
    setRevoked(false);
    setConfirmRevoke(false);
  }, [dispatch.id]);
  if (!protection) return null;
  const expired =
    status.data?.status === "expired" ||
    Date.parse(protection.expiresAt) <= Date.now();
  const accessRevoked = revoked || status.data?.status === "revoked";
  async function reveal() {
    await action.run(async () => {
      const response = await api<{ password: string }>(
        `/dispatches/${encodeURIComponent(dispatch.id)}/protected-document/password`,
        { method: "POST", body: {} },
      );
      setPassword(response.password);
    });
  }
  async function copy() {
    await action.run(async () => {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    });
  }
  async function revoke() {
    await action.run(async () => {
      await api(
        `/dispatches/${encodeURIComponent(dispatch.id)}/protected-document/revoke`,
        {
          method: "POST",
          body: {},
        },
      );
      setRevoked(true);
      setPassword("");
      setConfirmRevoke(false);
      status.refresh();
      onUpdated();
    });
  }
  return (
    <section
      className="protected-document-summary"
      aria-labelledby="protected-document-title"
    >
      <h2 id="protected-document-title">
        <LockKey size={20} aria-hidden="true" />
        {msg("Password-protected link")}
      </h2>
      <p>
        {protection.hostingFeeMinor === 0
          ? msg(
              "Hosting for this document is already paid: no new hosting charge.",
            )
          : msg(
              "Hosting this document: {0}, in addition to the email dispatch.",
              money(protection.hostingFeeMinor),
            )}{" "}
        {msg(
          "Hosting period: {0} day(s), until {1}.",
          protection.durationDays,
          date(protection.expiresAt),
        )}
      </p>
      <DateTimezone />
      <p className="field-hint">
        {msg(
          "The email contains a link, with no attachment. Share the password by phone or another messaging service.",
        )}
      </p>
      <p className="field-hint">
        {msg(
          "All recipients of this hosted document use the same link and password. Revoking access affects everyone.",
        )}
      </p>
      {protection.hostingFeeMinor > 0 && (
        <p className="field-hint">
          {msg(
            "Hosting is charged when activated for this period, even if the email later fails or is cancelled. Revoking it does not issue a refund.",
          )}
        </p>
      )}
      {status.data?.status === "draft" && !accessRevoked && !expired && (
        <p className="field-hint">
          {msg("The link will be accessible after the dispatch is confirmed.")}
        </p>
      )}
      {accessRevoked || expired ? (
        <p role="status">
          {accessRevoked
            ? msg("Access to this document has been revoked.")
            : msg("The link has expired.")}
        </p>
      ) : canManage ? (
        <>
          {!password ? (
            <button
              className="button"
              disabled={action.pending || status.loading || !!status.error}
              onClick={() => void reveal()}
            >
              {action.pending
                ? msg("Loading…")
                : msg("Show the password")}
            </button>
          ) : (
            <div className="protected-password">
              <code aria-label={msg("Document password")}>
                {password}
              </code>
              <button
                className="button small"
                onClick={() => void copy()}
                disabled={action.pending}
              >
                {copied ? <Check size={17} /> : <Copy size={17} />}
                {copied ? msg("Copied") : msg("Copy the password")}
              </button>
              <button
                className="text-button"
                onClick={() => {
                  setPassword("");
                  setCopied(false);
                }}
              >
                {msg("Hide")}
              </button>
              <span className="sr-only" role="status">
                {copied ? msg("Password copied.") : ""}
              </span>
            </div>
          )}
          {canRevoke &&
            (confirmRevoke ? (
              <div className="notice warning">
                <div>
                  <p>
                    {msg(
                      "Revoke access for all recipients of this hosted document? Copies already downloaded remain accessible.",
                    )}
                  </p>
                  <div className="button-group">
                    <button
                      className="button"
                      disabled={action.pending}
                      onClick={() => void revoke()}
                    >
                      {msg("Revoke document access")}
                    </button>
                    <button
                      className="text-button"
                      disabled={action.pending}
                      onClick={() => setConfirmRevoke(false)}
                    >
                      {msg("Keep access")}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p>
                <button
                  className="text-button"
                  onClick={() => setConfirmRevoke(true)}
                >
                  {msg("Revoke document access")}
                </button>
              </p>
            ))}
        </>
      ) : null}
      <ErrorNotice error={action.error ?? status.error} />
      <p className="field-hint">
        {msg(
          "This protection controls access to the PDF. The downloaded file is not protected by this password.",
        )}
      </p>
    </section>
  );
}
