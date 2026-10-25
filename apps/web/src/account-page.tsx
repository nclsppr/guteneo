import { msg, msgIn } from "./messages";
import { useState, type FormEvent } from "react";
import {
  canAdminister,
  permissionsFor,
  setSession,
  api,
  ApiError,
  date,
  isPublicPreview,
  type Page,
  type Session,
} from "./api";
import {
  ConfirmAction,
  DateTimezone,
  ErrorNotice,
  LoadMore,
  Loading,
  PageHeading,
  RefreshButton,
  useAction,
  useResource,
} from "./components";
import {
  applyAccountLocale,
  languageCopy,
  type SupportedLocale,
} from "./locale";
import { LanguageSelect } from "./language-select";
import { AppearancePreferences } from "./appearance-preferences";
import {
  useDashboardAppearance,
  type DashboardAppearance,
} from "./dashboard-appearance";
import { ExpertApproval } from "./expert-approval";
import {
  WORKSPACE_ROLES,
  type WorkspaceRole,
} from "../../../packages/contracts/src/roles";
import { roleLabel, roleDescription, RolesOverview } from "./role-guide";
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
type Member = {
  id: string;
  name: string;
  email?: string | null;
  role: WorkspaceRole;
  supervisorCanApprove: boolean;
  supervisorCanReport: boolean;
  joinedAt: string;
  sessions: number;
  connections: number;
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

function WorkspaceSwitcher({ session, onUpdated }: Props) {
  const workspaces = useResource<{
    items: { id: string; name: string; current: boolean }[];
  }>(isPublicPreview ? null : "/account/workspaces");
  const action = useAction();
  const [selected, setSelected] = useState(session.organization.id);
  if (
    !Array.isArray(workspaces.data?.items) ||
    workspaces.data.items.length < 2
  )
    return null;
  async function change(event: FormEvent) {
    event.preventDefault();
    await action.run(async () => {
      const next = await api<Session>("/account/workspace", {
        method: "POST",
        body: { organizationId: selected },
      });
      setSession(next);
      await onUpdated();
    });
  }
  return (
    <form
      className="form-panel"
      onSubmit={(event) => void change(event)}
      aria-busy={action.pending}
    >
      <h2>{msgIn("workspace-account", "Switch workspace")}</h2>
      <div className="field">
        <label htmlFor="account-workspace">{msg("Active workspace")}</label>
        <select
          id="account-workspace"
          value={selected}
          disabled={action.pending}
          onChange={(event) => setSelected(event.target.value)}
        >
          {workspaces.data.items.map((item) => (
            <option value={item.id} key={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>
      <p className="field-hint">
        {msg(
          "Your documents and permissions depend on the selected workspace. Switching opens a new session in that workspace.",
        )}
      </p>
      <button
        className="button"
        disabled={action.pending || selected === session.organization.id}
      >
        {action.pending ? msg("Signing in…") : msg("Open this workspace")}
      </button>
      <ErrorNotice error={action.error} />
    </form>
  );
}

export function Account({ session, onUpdated }: Props) {
  const permissions = permissionsFor(session);
  const { appearance, setAppearance, saveAccountAppearance } =
    useDashboardAppearance();
  const [draftAppearance, setDraftAppearance] =
    useState<DashboardAppearance | null>(null);
  const selectedAppearance =
    draftAppearance ?? session.user.preferredDashboardAppearance ?? "classic";
  const appearanceChanged =
    draftAppearance !== null &&
    selectedAppearance !==
      (session.user.preferredDashboardAppearance ?? "classic");
  const [userName, setUserName] = useState(session.user.name);
  const [organizationName, setOrganizationName] = useState(
    session.organization.name,
  );
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
  const isAdmin = canAdminister(session);
  const changed =
    appearanceChanged ||
    (draftAppearance !== null && selectedAppearance !== appearance) ||
    (languageEdited && preferredLocale !== "") ||
    userName.trim() !== session.user.name ||
    (isAdmin && organizationName.trim() !== session.organization.name);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    await action.run(async () => {
      await api("/account", {
        method: "PATCH",
        body: {
          userName,
          ...(languageEdited && preferredLocale ? { preferredLocale } : {}),
          ...(appearanceChanged
            ? { preferredDashboardAppearance: selectedAppearance }
            : {}),
          ...(isAdmin ? { organizationName } : {}),
        },
      });
      if (languageEdited && preferredLocale)
        applyAccountLocale(preferredLocale);
      if (draftAppearance !== null)
        saveAccountAppearance(selectedAppearance, session.user.id);
      await onUpdated();
      setLanguageEdited(false);
      setDraftAppearance(null);
      setSaved(true);
    });
  }
  async function revoke(id: string) {
    await sessionAction.run(async () => {
      const result = await api<{ currentSession: boolean }>(
        `/account/sessions/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (result.currentSession) await onUpdated();
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
      <WorkspaceSwitcher session={session} onUpdated={onUpdated} />
      {isPublicPreview ? (
        <>
          <PreviewNotice />
          <section className="form-panel">
            <AppearancePreferences
              language={<LanguageSelect profile />}
              appearance={appearance}
              onAppearanceChange={setAppearance}
            />
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
            <div className="field">
              <label htmlFor="account-organization">
                {msg("Workspace name")}
              </label>
              <input
                id="account-organization"
                name="organization"
                autoComplete="organization"
                value={organizationName}
                onChange={(event) => {
                  setOrganizationName(event.target.value);
                  setSaved(false);
                  action.clear();
                }}
                maxLength={120}
                required
                disabled={!isAdmin || action.pending}
                aria-invalid={invalid || undefined}
                aria-describedby={`account-organization-help${invalid ? " account-form-error" : ""}`}
              />
              <small id="account-organization-help">
                {isAdmin
                  ? msg("All members of this workspace can see this name.")
                  : msg("Only an administrator can rename this workspace.")}
              </small>
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
              appearance={selectedAppearance}
              disabled={action.pending}
              onAppearanceChange={(next) => {
                setDraftAppearance(next);
                setSaved(false);
                action.clear();
              }}
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
                <div className="table-scroll">
                  <table className="responsive-table" role="table">
                    <thead role="rowgroup">
                      <tr role="row">
                        <th role="columnheader" scope="col">
                          {msg("Started")}
                        </th>
                        <th role="columnheader" scope="col">
                          {msg("Expiry")}
                        </th>
                        <th role="columnheader" scope="col">
                          {msg("Session")}
                        </th>
                        <th role="columnheader" scope="col">
                          {msg("Action")}
                        </th>
                      </tr>
                    </thead>
                    <tbody role="rowgroup">
                      {sessions.data.items.map((item) => (
                        <tr role="row" key={item.id}>
                          <td role="cell" className="date-cell">
                            <span
                              className="mobile-cell-label"
                              aria-hidden="true"
                            >
                              {msg("Started")}
                            </span>
                            {date(item.createdAt)}
                          </td>
                          <td role="cell" className="date-cell">
                            <span
                              className="mobile-cell-label"
                              aria-hidden="true"
                            >
                              {msg("Expiry")}
                            </span>
                            {date(item.expiresAt)}
                          </td>
                          <td role="cell">
                            <span
                              className="mobile-cell-label"
                              aria-hidden="true"
                            >
                              {msg("Session")}
                            </span>
                            {item.current
                              ? msg("This device")
                              : msg("Other session")}
                            {item.development
                              ? " · simulation"
                              : item.mfa
                                ? " · double authentification"
                                : ""}
                          </td>
                          <td role="cell">
                            <span
                              className="mobile-cell-label"
                              aria-hidden="true"
                            >
                              {msg("Action")}
                            </span>
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
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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

function MemberRow({
  member,
  memberLabel,
  currentUserId,
  disabled,
  onRole,
  onRevoke,
}: {
  member: Member;
  memberLabel: string;
  currentUserId: string;
  disabled: boolean;
  onRole: (
    rights: Pick<
      Member,
      "role" | "supervisorCanApprove" | "supervisorCanReport"
    >,
  ) => void;
  onRevoke: () => void;
}) {
  const [role, setRole] = useState(member.role);
  const [canApprove, setCanApprove] = useState(
    member.supervisorCanApprove ?? false,
  );
  const [canReport, setCanReport] = useState(
    member.supervisorCanReport ?? false,
  );
  const changed =
    role !== member.role ||
    (role === "supervisor" &&
      (canApprove !== (member.supervisorCanApprove ?? false) ||
        canReport !== (member.supervisorCanReport ?? false)));
  return (
    <tr role="row">
      <th scope="row" role="rowheader">
        <span className="mobile-cell-label" aria-hidden="true">
          {msg("Member")}
        </span>
        <span className="member-name">
          {member.name}
          {member.id === currentUserId ? msg(" (you)") : ""}
        </span>
        <span className="member-email">
          {member.email || msg("Sign-in email unavailable")}
        </span>
      </th>
      <td role="cell" className="member-role-cell">
        <span className="mobile-cell-label" aria-hidden="true">
          {msg("Role")}
        </span>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor={`member-role-${member.id}`} className="sr-only">
            {msg("Role of ")}
            {memberLabel}
          </label>
          <select
            id={`member-role-${member.id}`}
            value={role}
            onChange={(event) => {
              setRole(event.target.value as Member["role"]);
              setCanApprove(false);
              setCanReport(false);
            }}
            aria-describedby={`member-role-help-${member.id}`}
            disabled={disabled}
          >
            {WORKSPACE_ROLES.map((value) => (
              <option key={value} value={value}>
                {roleLabel(value)}
              </option>
            ))}
          </select>
          <p
            id={`member-role-help-${member.id}`}
            className="member-role-description"
          >
            {roleDescription(role)}
          </p>
          {role === "supervisor" && (
            <fieldset className="member-rights" disabled={disabled}>
              <legend>{msg("Permissions for {0}", memberLabel)}</legend>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={canApprove}
                  onChange={(event) => setCanApprove(event.target.checked)}
                />
                <span>{msg("Approve and reject requests")}</span>
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={canReport}
                  onChange={(event) => setCanReport(event.target.checked)}
                />
                <span>{msg("Read reports")}</span>
              </label>
            </fieldset>
          )}
        </div>
      </td>
      <td role="cell">
        <span className="mobile-cell-label" aria-hidden="true">
          {msg("Active access")}
        </span>
        {msg(
          member.sessions === 1 ? "{0} session" : "{0} sessions",
          member.sessions,
        )}
        <br />
        {msg(
          member.connections === 1
            ? "{0} assistant connection"
            : "{0} assistant connections",
          member.connections,
        )}
      </td>
      <td role="cell" className="member-actions-cell">
        <span className="mobile-cell-label" aria-hidden="true">
          {msg("Actions")}
        </span>
        <div className="member-actions">
          <button
            type="button"
            className="button small"
            disabled={disabled || !changed}
            onClick={() =>
              onRole({
                role,
                supervisorCanApprove: role === "supervisor" && canApprove,
                supervisorCanReport: role === "supervisor" && canReport,
              })
            }
            aria-label={msg("Save the role for {0}", memberLabel)}
          >
            {msg("Save role")}
          </button>
          <ConfirmAction
            className="text-button"
            disabled={disabled || (!member.sessions && !member.connections)}
            onConfirm={onRevoke}
            ariaLabel={msg("Sign {0} out of this workshop", memberLabel)}
            label={msg("Disconnect access")}
            question={
              member.id === currentUserId
                ? msg(
                    "Disconnect your own sessions and assistants? You will need to sign in again.",
                  )
                : msg(
                    "Disconnect {0}’s sessions and assistants? They remain a member and can sign in again.",
                    memberLabel,
                  )
            }
            confirmLabel={msg("Yes, disconnect")}
          />
        </div>
      </td>
    </tr>
  );
}

export function TeamAdmin({ session, onUpdated }: Props) {
  const members = useResource<Page<Member>>(
    isPublicPreview || !canAdminister(session) ? null : "/admin/members",
  );
  const action = useAction();
  const [message, setMessage] = useState("");
  async function change(
    member: Member,
    rights?: Pick<
      Member,
      "role" | "supervisorCanApprove" | "supervisorCanReport"
    >,
  ) {
    setMessage("");
    await action.run(async () => {
      const result = await api<{ self: boolean; sessionsRevoked: boolean }>(
        `/admin/members/${encodeURIComponent(member.id)}${rights ? "" : "/revoke-access"}`,
        { method: rights ? "PATCH" : "POST", body: rights ?? {} },
      );
      if (result.self && result.sessionsRevoked) await onUpdated();
      else {
        members.refresh();
        setMessage(
          rights
            ? "The role has been changed. This member must sign in again."
            : "Access has been disconnected. The member can sign in to their account again.",
        );
      }
    });
  }
  return (
    <section
      className="form-panel team-admin"
      aria-labelledby="team-admin-title"
    >
      <h2 id="team-admin-title">{msg("Workspace members")}</h2>
      <details className="role-guide-details">
        <summary>{msg("Understand roles")}</summary>
        <RolesOverview />
        <a href="/roles/">{msg("Read the roles and permissions guide")}</a>
      </details>
      {isPublicPreview ? (
        <PreviewNotice />
      ) : !canAdminister(session) ? (
        <p>
          {msg("Only administrators of this workspace can manage members.")}
        </p>
      ) : (
        <>
          <p className="field-hint">
            {msg(
              "Changing a role disconnects that member’s sessions and assistants. If you change your own role, you must sign in again. The workspace always retains at least one administrator.",
            )}
          </p>
          <p className="field-hint">
            {msg(
              "Disconnecting access does not remove membership: the person can sign in again.",
            )}
          </p>
          <RefreshButton
            onClick={members.refresh}
            disabled={members.loading || action.pending}
          />
          <ErrorNotice
            error={members.error ?? action.error}
            retry={members.refresh}
          />
          {message && <p role="status">{msg(message)}</p>}
          {members.loading && !members.data ? (
            <Loading />
          ) : (
            members.data && (
              <>
                <div className="table-scroll">
                  <table className="responsive-table" role="table">
                    <thead role="rowgroup">
                      <tr role="row">
                        <th role="columnheader" scope="col">
                          {msg("Member")}
                        </th>
                        <th role="columnheader" scope="col">
                          {msg("Role")}
                        </th>
                        <th role="columnheader" scope="col">
                          {msg("Active access")}
                        </th>
                        <th role="columnheader" scope="col">
                          {msg("Actions")}
                        </th>
                      </tr>
                    </thead>
                    <tbody role="rowgroup">
                      {members.data.items.map((member) => (
                        <MemberRow
                          key={`${member.id}-${member.role}-${member.supervisorCanApprove}-${member.supervisorCanReport}`}
                          member={member}
                          memberLabel={
                            (members.data?.items.filter(
                              (item) => item.name === member.name,
                            ).length ?? 0) > 1 && member.email
                              ? `${member.name} (${member.email})`
                              : member.name
                          }
                          currentUserId={session.user.id}
                          disabled={action.pending}
                          onRole={(role) => void change(member, role)}
                          onRevoke={() => void change(member)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
                <LoadMore
                  path="/admin/members"
                  data={members.data}
                  onLoaded={members.setData}
                />
              </>
            )
          )}
        </>
      )}
    </section>
  );
}
