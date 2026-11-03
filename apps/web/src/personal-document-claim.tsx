import { useState } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import { ApiError } from "./api";
import { ErrorNotice, PageHeading, go, useAction } from "./components";
import { msg } from "./messages";
import { personalApi, type PersonalSession } from "./personal-api";
import { PersonalSecurityNotice } from "./personal-space";
import {
  clearPendingDocumentInvitation,
  pendingDocumentInvitation,
} from "./document-invitation";
import { needsAuthentication } from "./personal-document-status";

export function ClaimDocumentInvitation({
  token,
  session,
  onDismiss,
}: {
  token: string;
  session: PersonalSession;
  onDismiss: () => void;
}) {
  const action = useAction();
  const [pending, setPending] = useState(false);
  async function claim() {
    await action.run(async () => {
      if (pendingDocumentInvitation() !== token)
        throw new ApiError(
          "INVITATION_HANDOFF_EXPIRED",
          msg(
            "The sign-in time limit for this invitation has expired. Reopen the received link to continue.",
          ),
          410,
        );
      const result = await personalApi<{ id: string; status: string }>(
        "/personal/documents/claim",
        session,
        { method: "POST", body: { token }, key: crypto.randomUUID() },
      );
      clearPendingDocumentInvitation();
      // Invitation secrets are only exchanged in the request body and removed
      // from history before opening the account-bound document identifier.
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${window.location.search}#/app/my-documents`,
      );
      if (result.id) go(`/app/my-documents/${encodeURIComponent(result.id)}`);
      else setPending(true);
    });
  }
  return (
    <div className="secure-document-layout">
      <PageHeading
        title={msg("A document has been sent to you")}
        intro={msg(
          "Use the account matching the address that received this email.",
        )}
      />
      <section className="secure-document-panel">
        <h2>{msg("Signed in as {0}", session.user.email)}</h2>
        {!(session.documentAccessAllowed ?? session.strongAuthentication) ? (
          <PersonalSecurityNotice mode={session.documentAccessMode} />
        ) : pending ? (
          <p role="status">
            {msg(
              "Your access request is awaiting confirmation from the workspace.",
            )}
          </p>
        ) : (
          <button
            type="button"
            className="button primary"
            disabled={action.pending}
            onClick={() => void claim()}
          >
            {action.pending ? msg("Verifying…") : msg("Open my document")}
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        )}
        {needsAuthentication(action.error) ? (
          <PersonalSecurityNotice mode={session.documentAccessMode} />
        ) : (
          <ErrorNotice error={action.error} />
        )}
      </section>
      <a className="text-link" href="#/app/my-documents" onClick={onDismiss}>
        {msg("Back to my documents")}
      </a>
    </div>
  );
}
