import {
  WORKSPACE_ROLES,
  type WorkspaceRole,
} from "../../../packages/contracts/src/roles";
import { msg } from "./messages";
import { RolesFilm } from "./homepage-film";
import "./role-guide.css";

export function roleLabel(role: string): string {
  const labels: Record<WorkspaceRole, string> = {
    admin: msg("Administrator"),
    supervisor: msg("Supervisor"),
    member: msg("Operator"),
    viewer: msg("Observer"),
  };
  return labels[role as WorkspaceRole] ?? role;
}

export function roleDescription(role: string): string {
  const descriptions: Record<WorkspaceRole, string> = {
    admin: msg(
      "Manages the workspace, members, billing and delegations. Prepares and approves dispatches and reads all reports.",
    ),
    supervisor: msg(
      "Prepares documents and dispatches. The administrator separately chooses their approval rights and access to reports.",
    ),
    member: msg(
      "Imports documents and prepares dispatches. An administrator or authorized supervisor must approve them.",
    ),
    viewer: msg(
      "Reads workspace documents, recipients and dispatch tracking without changing them.",
    ),
  };
  return descriptions[role as WorkspaceRole] ?? "";
}

export function RolesOverview() {
  return (
    <dl className="role-guide-list">
      {WORKSPACE_ROLES.map((role) => (
        <div key={role}>
          <dt>{roleLabel(role)}</dt>
          <dd>{roleDescription(role)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function RolePermissionNotice({
  reports = false,
}: {
  reports?: boolean;
}) {
  return (
    <div className="notice info" role="note">
      <p>
        {reports
          ? msg(
              "Your role does not provide access to workspace reports. An administrator can change your permissions.",
            )
          : msg(
              "Your role does not allow this action. An administrator can change your permissions.",
            )}{" "}
        <a href="#/app/account">{msg("Contact someone in charge")}</a>
        {" · "}
        <a href="/roles/">{msg("Understand roles")}</a>
      </p>
    </div>
  );
}

export function getRoleGuide() {
  return {
    label: msg("Roles and permissions"),
    title: msg("A clear role for every member."),
    description: msg(
      "Choose who prepares correspondence, who authorizes dispatches and who reads your workspace reports.",
    ),
    updated: msg("Updated on 2 October 2026"),
    sections: [
      {
        id: "roles",
        label: msg("The four roles"),
        content: (
          <>
            <RolesFilm />
            <h2>{msg("The four roles")}</h2>
            <RolesOverview />
            <p>
              {msg(
                "Each person has a separate role in each workspace. All roles can access that workspace’s documents, recipients and tracking: the Observer role does not hide sensitive content.",
              )}
            </p>
          </>
        ),
      },
      {
        id: "supervisor",
        label: msg("Supervisor permissions"),
        content: (
          <>
            <h2>{msg("Supervisor permissions")}</h2>
            <p>
              {msg(
                "Two independent options, both off by default, let you adapt this role to your team.",
              )}
            </p>
            <dl className="role-guide-list">
              <div>
                <dt>{msg("Approve and reject requests")}</dt>
                <dd>
                  {msg(
                    "Allows review and transfer of postal PDFs, approval of content and cost, dispatch confirmation, and cancellation before submission to the provider. Approval can trigger a dispatch and consume workspace credit.",
                  )}
                </dd>
              </div>
              <div>
                <dt>{msg("Read reports")}</dt>
                <dd>
                  {msg(
                    "Provides access to overview metrics and detailed usage. This option does not grant access to invoices, payments or member management.",
                  )}
                </dd>
              </div>
            </dl>
            <p>
              {msg(
                "Without these options, a supervisor prepares dispatches like an operator. Reports alone allow activity monitoring without authorizing dispatches; approval alone allows validating requests without reading reports.",
              )}
            </p>
          </>
        ),
      },
      {
        id: "choose-role",
        label: msg("Choose and change a role"),
        content: (
          <>
            <h2>{msg("Choose and change a role")}</h2>
            <p>
              {msg(
                "The person who creates a workspace becomes its administrator. They can then invite members with an email address or a CSV file, review the recipients and role, and send the invitations. Each invitee joins by creating an account or signing in with the verified address that received their personal link.",
              )}
            </p>
            <p>
              {msg(
                "Start with Observer for reading, Operator for preparation and Supervisor for approval or reporting responsibilities. Reserve Administrator for people who actually manage the workspace.",
              )}
            </p>
            <p>
              {msg(
                "In your workspace, open Administration → Workspace members. Choose the role, set the two supervisor options, then save. Changing permissions disconnects the member’s sessions and assistants; they must sign in again. The last administrator cannot give up their role.",
              )}
            </p>
            <p>
              {msg(
                "Existing operators keep preparation rights but must now leave approval to an administrator or authorized supervisor. Report access must also be explicitly granted through the Supervisor role.",
              )}
            </p>
          </>
        ),
      },
      {
        id: "assistants",
        label: msg("Assistants and limits"),
        content: (
          <>
            <h2>{msg("Assistants and limits")}</h2>
            <p>
              {msg(
                "Assistant connections remain limited by the member’s current rights and the permissions granted to the connection. An assistant cannot change roles or grant itself a delegation.",
              )}
            </p>
            <p>
              {msg(
                "Expert mode remains separate: only an administrator signed in through the browser can give a time-limited mandate to one of their connections. A supervisor’s approval right does not allow them to create this mandate.",
              )}
            </p>
            <p>
              {msg(
                "A role does not activate a delivery channel. Document, recipient, cost and provider checks still apply. A request can only be cancelled before submission to the provider; mail already sent cannot be recalled.",
              )}
            </p>
            <p>
              {msg(
                "Billing remains restricted to administrators. No separate accounting role or custom roles are currently available.",
              )}
            </p>
          </>
        ),
      },
    ],
  };
}
