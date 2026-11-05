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

/** Where a person without an active workspace session may continue. */
export type WorkspaceDestination =
  "prepare" | "share" | "administration" | "workspace";
// Known paths keep their query (document or period identifiers); each page
// rechecks those identifiers under the workspace session it opens with.
const query = "(\\?[^#\\s]*)?$";
const destinations: [RegExp, WorkspaceDestination][] = [
  [new RegExp(`^/app/prepare${query}`), "prepare"],
  [new RegExp(`^/app/secure-distributions/new${query}`), "share"],
  [
    new RegExp(
      `^/app/administration(/(activity|consumption|reports|members|connections|audit|billing|settings))?${query}`,
    ),
    "administration",
  ],
  [/^\/app(\/studio\/templates)?$/, "workspace"],
];

/**
 * A requested in-app destination, limited to known workspace entries; any
 * other path is refused so the workspace bridge cannot be steered elsewhere.
 */
export function workspaceDestination(
  next: string | null | undefined,
): { path: string; kind: WorkspaceDestination } | null {
  if (!next || next.length > 200) return null;
  const match = destinations.find(([pattern]) => pattern.test(next));
  return match ? { path: next, kind: match[1] } : null;
}

/** The workspace bridge for an application home that needs a workspace. */
export function workspaceBridgeRoute(home: string) {
  return workspaceDestination(home)
    ? `/app/services?next=${encodeURIComponent(home)}`
    : "/app/services";
}
