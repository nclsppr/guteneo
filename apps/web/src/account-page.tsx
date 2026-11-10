import { DataTable, tableTimestamp } from "./data-table";
import { msg, msgIn } from "./messages";
import { useState, type FormEvent } from "react";
import {
  canAdminister,
  permissionsFor,
  api,
  ApiError,
  date,
  isPublicPreview,
  type Session,
} from "./api";
import {
  DateTimezone,
  ErrorNotice,
  Loading,
  PageHeading,
  RefreshButton,
  useAction,
  useResource,
} from "./components";
import {
  applyAccountLocale,
  t,
  languageCopy,
  type SupportedLocale,
} from "./locale";
import { LanguageSelect } from "./language-select";
import { AppearancePreferences } from "./appearance-preferences";
import { ExpertApproval } from "./expert-approval";
import { roleLabel, roleDescription } from "./role-guide";
import { WorkspaceContacts } from "./workspace-contacts";
import "./workspace-contacts.css";

type Props = { session: Session; onUpdated: () => void | Promise<void> };
type SessionItem = {
  id: string;
  createdAt: string;
  expiresAt: string;
  mfa: number;
  development: number;
  current: number;
};
function PreviewNotice() {
  return (
    <div className="notice info" role="note">
      <p>
        {msg(
          "Accounts and access in this preview are fictional. You can edit them in your signed-in workspace.",
        )}
      </p>
    </div>
  );
}

export function Account({ session, onUpdated }: Props) {
  const permissions = permissionsFor(session);
  const [userName, setUserName] = useState(session.user.name);
  const [preferredLocale, setPreferredLocale] = useState<SupportedLocale | "">(
    session.user.preferredLocale ?? "",
  );
  const [languageEdited, setLanguageEdited] = useState(false);
  const [saved, setSaved] = useState(false);
  const action = useAction();
  const sessionAction = useAction();
  const invalid =
    action.error instanceof ApiError && action.error.code === "INVALID_INPUT";
  const sessions = useResource<{ items: SessionItem[]; hasMore: boolean }>(
    isPublicPreview ? null : "/account/sessions",
  );
  // The workspace itself is managed in Administration, not in this profile.
  const canOpenAdministration =
    canAdminister(session) || permissions.viewReports;
  const changed =
    (languageEdited && preferredLocale !== "") ||
    userName.trim() !== session.user.name;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    await action.run(async (view) => {
      await view.wait(
        api("/account", {
          method: "PATCH",
          body: {
            userName,
            ...(languageEdited && preferredLocale ? { preferredLocale } : {}),
          },
        }),
      );
      if (languageEdited && preferredLocale)
        applyAccountLocale(preferredLocale);
      await view.wait(onUpdated());
      setLanguageEdited(false);
      setSaved(true);
    });
  }
  async function revoke(id: string) {
    await sessionAction.run(async (view) => {
      const result = await view.wait(
        api<{ currentSession: boolean }>(
          `/account/sessions/${encodeURIComponent(id)}`,
          { method: "DELETE" },
        ),
      );
      if (result.currentSession) await view.wait(onUpdated());
      else sessions.refresh();
    });
  }
  return (
    <>
      <PageHeading
        title={msg("My account")}
        intro={msg(
          "Your identity, assistant permissions and workspace sessions.",
        )}
      />
      <section
        className="form-panel account-identity"
        aria-labelledby="account-identity-title"
      >
        <h2 id="account-identity-title">{msg("Your account")}</h2>
        <dl className="account-identity-details">
          <div>
            <dt>{msg("Your name")}</dt>
            <dd>{session.user.name}</dd>
          </div>
          <div>
            <dt>{msg("Sign-in email")}</dt>
            <dd>{session.user.email || msg("Sign-in email unavailable")}</dd>
          </div>
          <div>
            <dt>{msg("Workshop")}</dt>
            <dd>{session.organization.name}</dd>
          </div>
          <div>
            <dt>{msg("Your role in this workshop")}</dt>
            <dd>{roleLabel(session.user.role)}</dd>
          </div>
        </dl>
        <p className="field-hint">
          {msg(
            "Your sign-in email comes from your identity account. It cannot be changed in Guteneo.",
          )}
        </p>
      </section>
      {isPublicPreview ? (
        <>
          <PreviewNotice />
          <section className="form-panel">
            <AppearancePreferences language={<LanguageSelect profile />} />
            <p className="field-hint">{languageCopy().browser}</p>
          </section>
        </>
      ) : (
        <>
          <form
            className="form-panel"
            onSubmit={(event) => void save(event)}
            aria-busy={action.pending}
          >
            <h2>{msg("My profile")}</h2>
            <p className="field-hint">
              {msg(
                "Your profile name is shared across your workspaces. Your sign-in address and security factors remain managed by your identity provider.",
              )}
            </p>
            <div className="field">
              <label htmlFor="account-name">{msg("Your name")}</label>
              <input
                id="account-name"
                name="name"
                autoComplete="name"
                value={userName}
                onChange={(event) => {
                  setUserName(event.target.value);
                  setSaved(false);
                  action.clear();
                }}
                maxLength={120}
                required
                disabled={action.pending}
                aria-invalid={invalid || undefined}
                aria-describedby={invalid ? "account-form-error" : undefined}
              />
            </div>
            <AppearancePreferences
              language={
                <LanguageSelect
                  profile
                  value={
                    languageEdited
                      ? preferredLocale
                      : (session.user.preferredLocale ?? "")
                  }
                  disabled={action.pending}
                  onChange={(locale) => {
                    setPreferredLocale(locale);
                    setLanguageEdited(true);
                    setSaved(false);
                    action.clear();
                  }}
                />
              }
            />
            <button
              className="button primary"
              type="submit"
              disabled={action.pending || !changed}
            >
              {action.pending ? msg("Saving…") : msg("Save changes")}
            </button>
            {saved && (
              <p role="status">{msg("Your profile has been saved.")}</p>
            )}
            <div id="account-form-error">
              <ErrorNotice error={action.error} />
            </div>
          </form>
          <section
            className="form-panel account-role"
            aria-labelledby="account-role-title"
          >
            <h2 id="account-role-title">{msg("Your workspace permissions")}</h2>
            <p>
              <strong>{roleLabel(session.user.role)}</strong> —{" "}
              {roleDescription(session.user.role)}
            </p>
            <dl className="account-permissions">
              <div>
                <dt>{msg("Documents and dispatches")}</dt>
                <dd>
                  {permissions.prepareDispatches
                    ? msg("Preparation allowed")
                    : msg("Read only")}
                </dd>
              </div>
              <div>
                <dt>{msg("Dispatch approval")}</dt>
                <dd>
                  {permissions.approveDispatches
                    ? msg("Allowed")
                    : msg("Not allowed")}
                </dd>
              </div>
              <div>
                <dt>{msg("Workshop reports")}</dt>
                <dd>
                  {permissions.viewReports
                    ? msgIn("access", "Available")
                    : msgIn("access", "Unavailable")}
                </dd>
              </div>
              <div>
                <dt>{msg("Members and billing")}</dt>
                <dd>
                  {permissions.manageMembers && permissions.manageBilling
                    ? msg("Management allowed")
                    : msg("Administrator required")}
                </dd>
              </div>
            </dl>
            {!permissions.manageMembers && (
              <p className="field-hint">
                {msg(
                  "To change your role or permissions, contact an administrator of this workshop.",
                )}
              </p>
            )}
            {canOpenAdministration && (
              <p>
                <a className="button" href="#/app/administration">
                  {permissions.manageMembers
                    ? msg("Manage this workspace in Administration")
                    : msg("Open workspace reports in Administration")}
                </a>
              </p>
            )}
            <a href="/roles/">{msg("Understand roles")}</a>
          </section>
          <WorkspaceContacts session={session} />
          <ExpertApproval />
          <section
            className="form-panel"
            aria-labelledby="account-sessions-title"
          >
            <h2 id="account-sessions-title">{msg("Your active sessions")}</h2>
            <p className="field-hint">
              {msg(
                "Sessions in this workspace expire after one hour. Revoking a session removes its access to Guteneo; it does not sign you out of your identity provider account.",
              )}
            </p>
            <RefreshButton
              onClick={sessions.refresh}
              disabled={sessions.loading}
            />
            <ErrorNotice error={sessions.error} retry={sessions.refresh} />
            <ErrorNotice error={sessionAction.error} />
            {!!sessions.data?.items.length && <DateTimezone />}
            {sessions.loading && !sessions.data ? (
              <Loading />
            ) : (
              sessions.data && (
                <DataTable viewId="active-sessions"
                  label={msg("Your active sessions")}
                  items={sessions.data.items}
                  getRowKey={(item) => item.id}
                  columns={[
                    {
                      id: "started",
                      label: msg("Started"),
                      value: (item) => tableTimestamp(item.createdAt),
                      searchValue: (item) => date(item.createdAt),
                      render: (item) => date(item.createdAt),
                      className: "date-cell",
                    },
                    {
                      id: "expiry",
                      label: msg("Expiry"),
                      value: (item) => tableTimestamp(item.expiresAt),
                      searchValue: (item) => date(item.expiresAt),
                      render: (item) => date(item.expiresAt),
                      className: "date-cell",
                    },
                    {
                      id: "session",
                      label: msg("Session"),
                      value: (item) =>
                        `${item.current ? msg("This device") : msg("Other session")}${item.development ? ` · ${t.simulation}` : item.mfa ? ` · ${msg("Two-factor authentication")}` : ""}`,
                    },
                    {
                      id: "actions",
                      label: msg("Action"),
                      value: () => "",
                      sortable: false,
                      render: (item) => (
                        <button
                          type="button"
                          className="button small"
                          disabled={action.pending || sessionAction.pending}
                          onClick={() => void revoke(item.id)}
                          aria-label={msg(
                            item.current
                              ? "Sign me out of the session opened on {0}"
                              : "Revoke the session opened on {0}",
                            date(item.createdAt),
                          )}
                        >
                          {item.current
                            ? msgIn("account-action", "Sign out")
                            : msg("Revoke")}
                        </button>
                      ),
                    },
                  ]}
                />
              )
            )}
            {sessions.data?.hasMore && (
              <p className="field-hint">
                {msg(
                  "The 100 most recent sessions are shown. Revoke some to display older ones.",
                )}
              </p>
            )}
          </section>
        </>
      )}
      {isPublicPreview && <ExpertApproval />}
    </>
  );
}
