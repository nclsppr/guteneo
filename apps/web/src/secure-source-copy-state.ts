type Recovery = { documentId: string; key: string };
export type SecureSourceCopyState =
  | { phase: "idle" }
  | ({ phase: "offered" | "copying" } & Recovery)
  | { phase: "copied"; documentId: string };

export function offerSecureSourceCopy(
  state: SecureSourceCopyState,
  documentId: string,
  key: () => string,
): SecureSourceCopyState {
  if (
    (state.phase === "offered" || state.phase === "copying") &&
    state.documentId === documentId
  )
    return state;
  return { phase: "offered", documentId, key: key() };
}

export function settleSecureSourceCopy(
  state: SecureSourceCopyState,
  recovery: Recovery,
  copiedId?: string,
): SecureSourceCopyState {
  if (
    state.phase !== "copying" ||
    state.documentId !== recovery.documentId ||
    state.key !== recovery.key
  )
    return state;
  return copiedId
    ? { phase: "copied", documentId: copiedId }
    : { phase: "offered", ...recovery };
}
