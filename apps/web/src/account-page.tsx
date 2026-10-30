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
  t,
  languageCopy,
  type SupportedLocale,
} from "./locale";
import { LanguageSelect } from "./language-select";
import { AppearancePreferences } from "./appearance-preferences";
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

type MemberRights = Pick<
  Member,
  "role" | "supervisorCanApprove" | "supervisorCanReport"
>;
const memberRightsKey = (member: Member) =>
  `${member.role}-${member.supervisorCanApprove}-${member.supervisorCanReport}`;
function memberDisplayLabel(member: Member, members: readonly Member[]) {
  return members.filter((item) => item.name === member.name).length > 1 &&
    member.email
    ? `${member.name} (${member.email})`
    : member.name;
}

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
          ...(isAdmin ? { organizationName } : {}),
        },
      });
      if (languageEdited && preferredLocale)
        applyAccountLocale(preferredLocale);
      await onUpdated();
      setLanguageEdited(false);
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
                <DataTable
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

function MemberRoleEditor({
  member,
  memberLabel,
  disabled,
  rights,
  onDraft,
  onRole,
}: {
  member: Member;
  memberLabel: string;
  disabled: boolean;
  rights: MemberRights;
  onDraft: (rights: MemberRights) => void;
  onRole: (rights: MemberRights) => void;
}) {
  const {
    role,
    supervisorCanApprove: canApprove,
    supervisorCanReport: canReport,
  } = rights;
  const changed =
    role !== member.role ||
    (role === "supervisor" &&
      (canApprove !== (member.supervisorCanApprove ?? false) ||
        canReport !== (member.supervisorCanReport ?? false)));
  return (
    <>
      <div className="field" style={{ marginBottom: 0 }}>
        <label htmlFor={`member-role-${member.id}`} className="sr-only">
          {msg("Role of ")}
          {memberLabel}
        </label>
        <select
          id={`member-role-${member.id}`}
          value={role}
          onChange={(event) => {
            onDraft({
              role: event.target.value as Member["role"],
              supervisorCanApprove: false,
              supervisorCanReport: false,
            });
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
                onChange={(event) =>
                  onDraft({
                    ...rights,
                    supervisorCanApprove: event.target.checked,
                  })
                }
              />
              <span>{msg("Approve and reject requests")}</span>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={canReport}
                onChange={(event) =>
                  onDraft({
                    ...rights,
                    supervisorCanReport: event.target.checked,
                  })
                }
              />
              <span>{msg("Read reports")}</span>
            </label>
          </fieldset>
        )}
      </div>
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
    </>
  );
}

export function TeamAdmin({ session, onUpdated }: Props) {
  const members = useResource<Page<Member>>(
    isPublicPreview || !canAdminister(session) ? null : "/admin/members",
  );
  const action = useAction();
  const [message, setMessage] = useState("");
  const [memberDrafts, setMemberDrafts] = useState<
    Record<string, { baseline: string; rights: MemberRights }>
  >({});

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
                <DataTable
                  label={msg("Workspace members")}
                  items={members.data.items}
                  getRowKey={(member) => member.id}
                  columns={[
                    {
                      id: "member",
                      label: msg("Member"),
                      value: (member) => `${member.name} ${member.email ?? ""}`,
                      render: (member) => (
                        <>
                          <span className="member-name">
                            {member.name}
                            {member.id === session.user.id ? msg(" (you)") : ""}
                          </span>
                          <span className="member-email">
                            {member.email || msg("Sign-in email unavailable")}
                          </span>
                        </>
                      ),
                    },
                    {
                      id: "role",
                      label: msg("Role"),
                      value: (member) => roleLabel(member.role),
                      className: "member-role-cell",
                      cardSpan: "full",
                      render: (member) => (
                        <MemberRoleEditor
                          key={`${member.id}-${member.role}-${member.supervisorCanApprove}-${member.supervisorCanReport}`}
                          member={member}
                          memberLabel={memberDisplayLabel(
                            member,
                            members.data?.items ?? [],
                          )}
                          disabled={action.pending}
                          rights={
                            memberDrafts[member.id]?.baseline ===
                            memberRightsKey(member)
                              ? memberDrafts[member.id].rights
                              : {
                                  role: member.role,
                                  supervisorCanApprove:
                                    member.supervisorCanApprove,
                                  supervisorCanReport:
                                    member.supervisorCanReport,
                                }
                          }
                          onDraft={(rights) =>
                            setMemberDrafts((current) => ({
                              ...current,
                              [member.id]: {
                                baseline: memberRightsKey(member),
                                rights,
                              },
                            }))
                          }
                          onRole={(role) => void change(member, role)}
                        />
                      ),
                    },
                    {
                      id: "access",
                      label: msg("Active access"),
                      value: (member) => member.sessions + member.connections,
                      render: (member) => (
                        <>
                          {msg(
                            member.sessions === 1
                              ? "{0} session"
                              : "{0} sessions",
                            member.sessions,
                          )}
                          <br />
                          {msg(
                            member.connections === 1
                              ? "{0} assistant connection"
                              : "{0} assistant connections",
                            member.connections,
                          )}
                        </>
                      ),
                    },
                    {
                      id: "actions",
                      label: msg("Actions"),
                      value: () => "",
                      sortable: false,
                      className: "member-actions-cell",
                      render: (member) => (
                        <ConfirmAction
                          className="text-button"
                          disabled={
                            action.pending ||
                            (!member.sessions && !member.connections)
                          }
                          onConfirm={() => void change(member)}
                          ariaLabel={msg(
                            "Sign {0} out of this workshop",
                            memberDisplayLabel(
                              member,
                              members.data?.items ?? [],
                            ),
                          )}
                          label={msg("Disconnect access")}
                          question={
                            member.id === session.user.id
                              ? msg(
                                  "Disconnect your own sessions and assistants? You will need to sign in again.",
                                )
                              : msg(
                                  "Disconnect {0}’s sessions and assistants? They remain a member and can sign in again.",
                                  memberDisplayLabel(
                                    member,
                                    members.data?.items ?? [],
                                  ),
                                )
                          }
                          confirmLabel={msg("Yes, disconnect")}
                        />
                      ),
                    },
                  ]}
                  filters={[
                    {
                      id: "role",
                      label: msg("Role"),
                      value: (member) => member.role,
                      options: WORKSPACE_ROLES.map((role) => ({
                        value: role,
                        label: roleLabel(role),
                      })),
                    },
                  ]}
                />
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
