import type { WorkspacePermissions } from "./roles";

/** Browser-only help contacts from the person's current workshop. */
export interface WorkspaceContact {
  id: string;
  name: string;
  email: string | null;
  role: "admin" | "supervisor";
  permissions: WorkspacePermissions;
}

export interface WorkspaceContacts {
  items: WorkspaceContact[];
  hasMore: boolean;
}

export const MAX_WORKSPACE_CONTACTS = 50;

/** Legacy accounts may have no usable address; never invent a contact address. */
export function accountEmail(value: string | null | undefined): string | null {
  const email = value?.trim();
  return email && email.length <= 320 && !/[\u0000-\u0020\u007f]/.test(email)
    ? email
    : null;
}
