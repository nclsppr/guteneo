import { useRef, useState, type FormEvent } from "react";
import { FileInput } from "./file-input";
import {
  WORKSPACE_ROLES,
  type WorkspaceRole,
} from "../../../packages/contracts/src/roles";
import { api, ApiError, date, type Page } from "./api";
import {
  ConfirmAction,
  DateTimezone,
  ErrorNotice,
  LoadMore,
  Loading,
  RefreshButton,
  useAction,
  useResource,
} from "./components";
import {
  InvitationInputError,
  invitationRecipients,
  parseInvitationCsv,
  type InvitationRecipients,
} from "./invitation-csv";
import { msg } from "./messages";
import type { WorkspaceInvitation as Invitation } from "../../../packages/contracts/src/invitations";
import { roleDescription, roleLabel } from "./role-guide";

function inputError(error: unknown): Error {
  if (!(error instanceof InvitationInputError)) return error as Error;
  return new Error(
    error.reason === "email"
      ? msg("Invalid email address on line {0}.", error.line)
      : error.reason === "limit"
        ? msg("A batch is limited to 100 different addresses.")
        : error.reason === "empty"
          ? msg("Add at least one email address.")
          : error.reason === "header"
            ? msg("The CSV must contain a column named email.")
            : msg(
                "The CSV is malformed on line {0}. Check the columns and quotation marks.",
                error.line,
              ),
  );
}
function deliveryLabel(status: Invitation["deliveryStatus"]) {
  return (
    {
      sent: msg("Accepted by the email service"),
      simulated: msg("Simulated delivery"),
      failed: msg("Email failed"),
      unknown: msg("Delivery unconfirmed"),
      pending: msg("Delivery pending"),
    }[status] ?? status
  );
}
function statusLabel(status: Invitation["status"]) {
  return (
    {
      pending: msg("Awaiting acceptance"),
      accepted: msg("Invitation accepted"),
      revoked: msg("Invitation revoked"),
      expired: msg("Invitation expired"),
    }[status] ?? status
  );
}
export function TeamInvitations() {
  const resource = useResource<Page<Invitation>>("/admin/invitations");
  const action = useAction();
  const [mode, setMode] = useState("single");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("member");
  const [canApprove, setCanApprove] = useState(false);
  const [canReport, setCanReport] = useState(false);
  const [review, setReview] = useState<InvitationRecipients>();
  const [message, setMessage] = useState("");
  const [inputIssue, setInputIssue] = useState<Error>();
  const [uncertain, setUncertain] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const [fileVersion, setFileVersion] = useState(0);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  function resetReview() {
    setReview(undefined);
    setInputIssue(undefined);
    setMessage("");
    action.clear();
  }
  async function prepare(event: FormEvent) {
    event.preventDefault();
    resetReview();
    try {
      if (mode === "single") setReview(invitationRecipients([email]));
      else {
        const selected = file.current?.files?.[0];
        if (!selected) throw new Error(msg("Choose a CSV file."));
        if (selected.size > 1_000_000)
          throw new Error(msg("The CSV must be smaller than 1 MB."));
        setReview(parseInvitationCsv(await selected.text()));
      }
      requestAnimationFrame(() => reviewHeading.current?.focus());
    } catch (error) {
      setInputIssue(inputError(error));
    }
  }
  async function send() {
    if (!review || uncertain) return;
    await action.run(async () => {
      try {
        await api("/admin/invitations", {
          method: "POST",
          body: {
            emails: review.emails,
            role,
            supervisorCanApprove: role === "supervisor" && canApprove,
            supervisorCanReport: role === "supervisor" && canReport,
          },
        });
        setReview(undefined);
        setEmail("");
        setFileVersion((version) => version + 1);
        setMessage(
          msg(
            "The invitations have been processed. Check their status below.",
          ),
        );
      } catch (error) {
        if (!(error instanceof ApiError) || error.status >= 500)
          setUncertain(true);
        throw error;
      } finally {
        resource.refresh();
      }
    });
  }
  async function revoke(id: string) {
    await action.run(async () => {
      await api(`/admin/invitations/${encodeURIComponent(id)}/revoke`, {
        method: "POST",
        body: {},
      });
      resource.refresh();
    });
  }
  return (
    <section
      className="form-panel team-invitations"
      aria-labelledby="team-invitations-title"
    >
      <h2 id="team-invitations-title">{msg("Invite members")}</h2>
      <p className="field-hint">
        {msg(
          "The person who creates a workspace becomes its administrator. Then invite colleagues by email, individually or from a CSV. The chosen role applies to every address in this batch.",
        )}
      </p>
      <form
        onSubmit={(event) => void prepare(event)}
        aria-busy={action.pending}
      >
        <fieldset
          disabled={action.pending || uncertain}
          className="invitation-fields"
        >
          <legend className="sr-only">
            {msg("Invitation recipients and role")}
          </legend>
          <div className="field">
            <label htmlFor="invitation-mode">
              {msg("Add recipients")}
            </label>
            <select
              id="invitation-mode"
              value={mode}
              onChange={(event) => {
                setMode(event.target.value);
                resetReview();
              }}
            >
              <option value="single">{msg("One email address")}</option>
              <option value="csv">{msg("Import a CSV")}</option>
            </select>
          </div>
          {mode === "single" ? (
            <div className="field">
              <label htmlFor="invitation-email">
                {msg("Email address to invite")}
              </label>
              <input
                id="invitation-email"
                type="email"
                autoComplete="off"
                required
                maxLength={254}
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  resetReview();
                }}
              />
            </div>
          ) : (
            <div className="field">
              <label htmlFor="invitation-csv">
                {msg("Members CSV file")}
              </label>
              <FileInput
                key={fileVersion}
                id="invitation-csv"
                accept=".csv,text/csv"
                ref={file}
                required
                aria-describedby="invitation-csv-help"
                onChange={resetReview}
              />
              <small id="invitation-csv-help">
                {msg(
                  "Required column: email. Comma or semicolon accepted. Up to 100 different addresses; duplicates are removed before your review.",
                )}
              </small>
            </div>
          )}
          <div className="field">
            <label htmlFor="invitation-role">
              {msg("New members’ role")}
            </label>
            <select
              id="invitation-role"
              value={role}
              aria-describedby="invitation-role-help"
              onChange={(event) => {
                setRole(event.target.value as WorkspaceRole);
                setCanApprove(false);
                setCanReport(false);
                resetReview();
              }}
            >
              {WORKSPACE_ROLES.map((value) => (
                <option value={value} key={value}>
                  {roleLabel(value)}
                </option>
              ))}
            </select>
            <small id="invitation-role-help">{roleDescription(role)}</small>
          </div>
          {role === "supervisor" && (
            <fieldset className="member-rights">
              <legend>{msg("Invited supervisors’ permissions")}</legend>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={canApprove}
                  onChange={(event) => {
                    setCanApprove(event.target.checked);
                    resetReview();
                  }}
                />
                <span>{msg("Approve and reject requests")}</span>
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={canReport}
                  onChange={(event) => {
                    setCanReport(event.target.checked);
                    resetReview();
                  }}
                />
                <span>{msg("Read reports")}</span>
              </label>
            </fieldset>
          )}
          <button className="button" type="submit">
            {msg("Review invitations")}
          </button>
        </fieldset>
      </form>
      <ErrorNotice error={inputIssue ?? action.error} />
      {uncertain && (
        <p className="notice warning" role="status">
          {msg(
            "The response could not be confirmed. Refresh the list and check the invitations before reloading this page. No delivery will be retried automatically.",
          )}
        </p>
      )}
      {review && (
        <section
          className="invitation-review"
          aria-labelledby="invitation-review-title"
        >
          <h3 id="invitation-review-title" ref={reviewHeading} tabIndex={-1}>
            {msg("Review {0} invitation(s)", review.emails.length)}
          </h3>
          <p>
            {roleLabel(role)}. {roleDescription(role)}
          </p>
          {role === "supervisor" && (
            <p>
              {msg(
                "Request approval: {0}. Reports: {1}.",
                canApprove ? msg("allowed") : msg("not allowed"),
                canReport ? msg("available") : msg("unavailable"),
              )}
            </p>
          )}
          {review.duplicateCount > 0 && (
            <p>{msg("{0} duplicate(s) removed.", review.duplicateCount)}</p>
          )}
          <ul>
            {review.emails.map((address) => (
              <li key={address}>{address}</li>
            ))}
          </ul>
          <p>
            {msg(
              "Each person will receive a personal link and must sign in with that verified address to join the workspace.",
            )}
          </p>
          <button
            type="button"
            className="button primary"
            disabled={action.pending || uncertain}
            onClick={() => void send()}
          >
            {action.pending
              ? msg("Sending invitations…")
              : msg("Send invitations")}
          </button>
        </section>
      )}
      {message && <p role="status">{message}</p>}
      <div className="section-toolbar">
        <h3>{msg("Workspace invitations")}</h3>
        <RefreshButton
          onClick={resource.refresh}
          disabled={resource.loading || action.pending}
        />
      </div>
      <ErrorNotice error={resource.error} retry={resource.refresh} />
      {!!resource.data?.items.length && <DateTimezone />}
      {resource.loading && !resource.data ? (
        <Loading />
      ) : !resource.data?.items.length ? (
        <p>{msg("No invitations yet.")}</p>
      ) : (
        <ul className="invitation-list">
          {resource.data.items.map((item) => (
            <li key={item.id}>
              <div>
                <strong>{item.email}</strong>
                <p>
                  {roleLabel(item.role)} · {statusLabel(item.status)} ·{" "}
                  {deliveryLabel(item.deliveryStatus)}
                </p>
                <p>{msg("Expires on {0}", date(item.expiresAt))}</p>
                {item.deliveryStatus === "unknown" && (
                  <p>
                    {msg(
                      "Do not resend this invitation until the email outcome has been verified.",
                    )}
                  </p>
                )}
              </div>
              {item.status === "pending" && (
                <ConfirmAction
                  label={msg("Revoke invitation")}
                  question={msg(
                    "Revoke the invitation for {0}? This link will no longer allow them to join the workspace.",
                    item.email,
                  )}
                  confirmLabel={msg("Revoke invitation")}
                  onConfirm={() => void revoke(item.id)}
                  disabled={action.pending}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      <LoadMore
        path="/admin/invitations"
        data={resource.data}
        onLoaded={resource.setData}
      />
    </section>
  );
}
