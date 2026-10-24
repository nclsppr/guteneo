export const documentInvitationStorageKey =
  "guteneo.pending-document-invitation.v1";
const maximumAgeMs = 10 * 60 * 1000;
let volatileInvitation: { token: string; expiresAt: number } | null = null;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleExpiry(expiresAt: number) {
  clearTimeout(expiryTimer);
  expiryTimer = setTimeout(
    clearPendingDocumentInvitation,
    Math.max(0, expiresAt - Date.now()),
  );
}
const validToken = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);

export function clearPendingDocumentInvitation() {
  volatileInvitation = null;
  clearTimeout(expiryTimer);
  expiryTimer = undefined;
  try {
    window.sessionStorage.removeItem(documentInvitationStorageKey);
  } catch {
    /* Unavailable storage never grants access. */
  }
}

/** The fragment is never sent to the HTTP server. Remove the invitation before
 * constructing any authentication URL, retaining it only in this tab briefly.
 * This is an invitation handoff, not a login or content authorization token. */
export function captureDocumentInvitation(): { storageBlocked: boolean } {
  const [path, search = ""] = window.location.hash.slice(1).split("?");
  const params = new URLSearchParams(search);
  if (!params.has("invitation")) return { storageBlocked: false };
  const invitation = params.get("invitation");
  params.delete("invitation");
  const cleanHash = `${path}${params.size ? `?${params.toString()}` : ""}`;
  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${window.location.search}#${cleanHash}`,
  );
  clearPendingDocumentInvitation();
  if (!validToken(invitation)) return { storageBlocked: false };
  volatileInvitation = {
    token: invitation,
    expiresAt: Date.now() + maximumAgeMs,
  };
  scheduleExpiry(volatileInvitation.expiresAt);
  try {
    const pending = JSON.stringify(volatileInvitation);
    window.sessionStorage.setItem(documentInvitationStorageKey, pending);
    if (window.sessionStorage.getItem(documentInvitationStorageKey) !== pending)
      return { storageBlocked: true };
    return { storageBlocked: false };
  } catch {
    return { storageBlocked: true };
  }
}

export function pendingDocumentInvitation(): string | null {
  try {
    const raw = window.sessionStorage.getItem(documentInvitationStorageKey);
    if (!raw)
      return volatileInvitation && volatileInvitation.expiresAt > Date.now()
        ? volatileInvitation.token
        : null;
    const pending = JSON.parse(raw) as { token?: unknown; expiresAt?: unknown };
    if (
      !validToken(pending.token) ||
      typeof pending.expiresAt !== "number" ||
      !Number.isSafeInteger(pending.expiresAt) ||
      pending.expiresAt <= Date.now() ||
      pending.expiresAt > Date.now() + maximumAgeMs
    ) {
      clearPendingDocumentInvitation();
      return null;
    }
    volatileInvitation = { token: pending.token, expiresAt: pending.expiresAt };
    scheduleExpiry(pending.expiresAt);
    return pending.token;
  } catch {
    return volatileInvitation && volatileInvitation.expiresAt > Date.now()
      ? volatileInvitation.token
      : null;
  }
}

/** Only the personal route and its non-sensitive category survive a login.
 * Search terms, invitation secrets and arbitrary private parameters stay out. */
export function personalAuthenticationReturnTo(hash = window.location.hash) {
  const [rawPath, search = ""] = hash.replace(/^#/u, "").split("?");
  const path =
    /^\/app\/(my-documents(?:\/(?:sd|pd)_[a-f0-9]{32})?|services|personal-account)$/u.test(
      rawPath ?? "",
    )
      ? rawPath
      : "/app/my-documents";
  const kind = new URLSearchParams(search).get("kind");
  return `/#${path}${path === "/app/my-documents" && kind === "personal" ? "?kind=personal" : ""}`;
}
