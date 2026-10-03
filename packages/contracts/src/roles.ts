/** Workspace membership is authoritative; OAuth scopes never grant extra rights. */
export const WORKSPACE_ROLES = [
  "admin",
  "supervisor",
  "member",
  "viewer",
] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];
export type WorkspacePermissions = {
  readWorkspace: boolean;
  prepareDispatches: boolean;
  approveDispatches: boolean;
  viewReports: boolean;
  manageOrganization: boolean;
  manageMembers: boolean;
  manageBilling: boolean;
  manageExpertDelegation: boolean;
};

export function workspacePermissions(
  role: string,
  options: { canApprove?: boolean; canReport?: boolean } = {},
): WorkspacePermissions {
  const admin = role === "admin";
  const supervisor = role === "supervisor";
  return {
    readWorkspace: (WORKSPACE_ROLES as readonly string[]).includes(role),
    prepareDispatches: admin || supervisor || role === "member",
    approveDispatches: admin || (supervisor && options.canApprove === true),
    viewReports: admin || (supervisor && options.canReport === true),
    manageOrganization: admin,
    manageMembers: admin,
    manageBilling: admin,
    manageExpertDelegation: admin,
  };
}
