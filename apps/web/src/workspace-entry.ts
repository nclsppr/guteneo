import { isWorkspaceInvitationToken } from "../../../packages/contracts/src/workspace-invitation-token";

/** Keep invitation secrets in the fragment and reuse the existing acceptance page. */
export function workspaceInvitationPath(
  value: string,
  origin: string,
): string | null {
  try {
    const url = new URL(value.trim());
    if (
      url.origin !== origin ||
      url.username ||
      url.password ||
      url.pathname !== "/invitation/" ||
      url.search
    )
      return null;
    const fragment = new URLSearchParams(url.hash.slice(1));
    const token = fragment.get("token");
    if ([...fragment.keys()].length !== 1 || !isWorkspaceInvitationToken(token))
      return null;
    return `/invitation/#token=${token}`;
  } catch {
    return null;
  }
}
