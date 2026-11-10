import { useAdministrationResource } from "./administration-data";
import { DataTable } from "./data-table";
import { msg } from "./messages";
import { useState } from "react";
import {
  api,
  canAdminister,
  isPublicPreview,
  type Page,
  type Session,
} from "./api";
import {
  ConfirmAction,
  ErrorNotice,
  LoadMore,
  Loading,
  RefreshButton,
  useAction,
} from "./components";
import {
  WORKSPACE_ROLES,
  type WorkspaceRole,
} from "../../../packages/contracts/src/roles";
import { roleLabel, roleDescription } from "./role-guide";

type Props = { session: Session; onUpdated: () => void | Promise<void> };
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
  const members = useAdministrationResource<Page<Member>>(
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
    await action.run(async (view) => {
      const result = await view.wait(
        api<{ self: boolean; sessionsRevoked: boolean }>(
          `/admin/members/${encodeURIComponent(member.id)}${rights ? "" : "/revoke-access"}`,
          { method: rights ? "PATCH" : "POST", body: rights ?? {} },
        ),
      );
      if (result.self && result.sessionsRevoked) await view.wait(onUpdated());
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
                  viewId="workspace-members"
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
