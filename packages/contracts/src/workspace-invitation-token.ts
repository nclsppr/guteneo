/** Raw 32-byte base64url secret, distinct from its stored SHA-256 hex hash. */
export function isWorkspaceInvitationToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}
