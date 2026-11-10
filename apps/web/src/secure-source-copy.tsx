import { useEffect, useRef, useState } from "react";
import { Copy, WarningCircle } from "@phosphor-icons/react";
import { api, ApiError, type DocumentRecord } from "./api";
import { ErrorNotice, useAction } from "./components";
import { msg } from "./messages";
import { useCurrentClientView } from "./client-write-recovery";
import {
  offerSecureSourceCopy,
  settleSecureSourceCopy,
  type SecureSourceCopyState,
} from "./secure-source-copy-state";

const sourceConflictCodes = new Set([
  "SECURE_SOURCE_LEGACY_LINK",
  "SECURE_SOURCE_LEGACY_DERIVATION",
  "SECURE_SOURCE_LEGACY_OUTBOUND",
]);

export function secureSourceCopyLabel(document: DocumentRecord) {
  return document.secure_copy_source_id
    ? msg("{0} — secure copy", document.name)
    : document.name;
}

export function useSecureSourceCopy(
  documentId: string,
  onCopied: (document: DocumentRecord) => void,
  enabled = true,
  identity = "",
) {
  const [state, setState] = useState<SecureSourceCopyState>({ phase: "idle" });
  const recovery =
    state.phase === "offered" || state.phase === "copying" ? state : undefined;
  const action = useAction();
  const clearError = action.clear;
  const current = useRef({ documentId, enabled, onCopied });
  current.current = { documentId, enabled, onCopied };
  const copying = useRef(false);
  const currentView = useCurrentClientView(
    JSON.stringify([identity, documentId, enabled]),
  );
  useEffect(() => {
    setState((value) => (value.phase === "idle" ? value : { phase: "idle" }));
    clearError();
  }, [identity, clearError]);
  useEffect(() => {
    setState((value) =>
      enabled && "documentId" in value && value.documentId === documentId
        ? value
        : value.phase === "idle"
          ? value
          : { phase: "idle" },
    );
    clearError();
  }, [documentId, enabled, clearError]);

  function offer(error: unknown, sourceId: string) {
    if (!(error instanceof ApiError) || !sourceConflictCodes.has(error.code))
      return false;
    if (!current.current.enabled || sourceId !== current.current.documentId)
      return true;
    setState((value) =>
      offerSecureSourceCopy(value, sourceId, () => crypto.randomUUID()),
    );
    return true;
  }

  async function createCopy() {
    if (!recovery || recovery.phase !== "offered" || copying.current) return;
    const isCurrent = currentView();
    copying.current = true;
    setState({ ...recovery, phase: "copying" });
    await action.run(async (view) => {
      try {
        const document = await view.wait(
          api<DocumentRecord>(
            `/documents/${encodeURIComponent(recovery.documentId)}/secure-copy`,
            { method: "POST", key: recovery.key, body: {} },
          ),
          (receipt) => ({
            kind: "saved",
            resourceId: receipt.id,
            route: "/app/documents",
          }),
        );
        if (
          !isCurrent() ||
          !current.current.enabled ||
          current.current.documentId !== recovery.documentId
        ) {
          setState((value) => settleSecureSourceCopy(value, recovery));
          return;
        }
        current.current.onCopied(document);
        setState((value) =>
          settleSecureSourceCopy(value, recovery, document.id),
        );
      } catch (error) {
        setState((value) => settleSecureSourceCopy(value, recovery));
        if (
          isCurrent() &&
          current.current.enabled &&
          current.current.documentId === recovery.documentId
        ) {
          throw error;
        }
      }
    });
    copying.current = false;
  }

  return {
    offer,
    createCopy,
    recovery:
      enabled && recovery?.documentId === documentId ? recovery : undefined,
    copied:
      enabled && state.phase === "copied" && state.documentId === documentId,
    pending: state.phase === "copying",
    error: action.error,
  };
}

export function SecureSourceCopyNotice({
  copy,
}: {
  copy: ReturnType<typeof useSecureSourceCopy>;
}) {
  const notice = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (copy.recovery) notice.current?.focus();
  }, [copy.recovery]);
  if (copy.copied)
    return (
      <p className="notice info" role="status">
        {msg("Copy selected. Prepare and review the share to continue.")}
      </p>
    );
  if (!copy.recovery) return null;
  return (
    <>
      <div className="notice warning" role="alert" tabIndex={-1} ref={notice}>
        <WarningCircle size={22} aria-hidden="true" />
        <div>
          <strong>{msg("Use a separate copy for this share")}</strong>
          <p>
            {msg(
              "This PDF is linked to another sending workflow, even if that workflow was cancelled or failed. Create an independent copy for this secure share.",
            )}
          </p>
          <p>
            {msg(
              "The copy contains the same PDF. It does not change earlier deliveries or recall copies already received.",
            )}
          </p>
          <button
            type="button"
            className="button"
            disabled={copy.pending}
            onClick={() => void copy.createCopy()}
          >
            <Copy size={18} aria-hidden="true" />
            {copy.pending
              ? msg("Creating copy…")
              : msg("Create a copy for this secure share")}
          </button>
        </div>
      </div>
      <ErrorNotice error={copy.error} />
    </>
  );
}
