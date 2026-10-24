import { useEffect, useState } from "react";
import { api } from "./api";
import { PublicFooter, PublicHeader } from "./public-chrome";
import { ErrorNotice, Loading, useAction } from "./components";
import { msg } from "./messages";
import { roleDescription, roleLabel } from "./role-guide";
import type { WorkspaceRole } from "../../../packages/contracts/src/roles";

type Preview = {
  organization: { name: string };
  role: WorkspaceRole;
  supervisorCanApprove: boolean;
  supervisorCanReport: boolean;
  maskedEmail: string;
  status: string;
  expiresAt: string;
};
export function InvitationPage() {
  const [token] = useState(() =>
    typeof window === "undefined"
      ? ""
      : (new URLSearchParams(window.location.hash.slice(1)).get("token") ?? ""),
  );
  const [preview, setPreview] = useState<Preview>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(Boolean(token));
  const action = useAction();
  useEffect(() => {
    document.title = `${msg("Invitation to join a workspace")} | Guteneo`;
    if (window.location.hash)
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    if (!token) return;
    const controller = new AbortController();
    api<Preview>("/invitations/preview", {
      method: "POST",
      body: { token },
      signal: controller.signal,
    })
      .then(setPreview)
      .catch((issue) => {
        if (!controller.signal.aborted) setError(issue as Error);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [token]);
  async function accept() {
    if (!token || preview?.status !== "pending") return;
    await action.run(async () => {
      const response = await fetch("/auth/invitation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ token }),
      });
      if (!response.ok)
        throw new Error(
          msg(
            "The invitation could not be accepted. Reopen the link you received or ask your administrator for a new invitation.",
          ),
        );
      const result = (await response.json()) as { loginUrl?: string };
      const login = new URL(result.loginUrl ?? "", window.location.origin);
      if (
        !result.loginUrl ||
        login.origin !== window.location.origin ||
        login.pathname !== "/auth/login"
      )
        throw new Error(
          msg("Sign-in is unavailable. Try again from your invitation."),
        );
      window.location.assign(result.loginUrl);
    });
  }
  return (
    <div className="legal-page">
      <a className="skip-link" href="#invitation-content">
        {msg("Skip to content")}
      </a>
      <PublicHeader showWorkspaceLink={false} />
      <main className="invitation-page" id="invitation-content" tabIndex={-1}>
        <h1>{msg("Invitation to join a workspace")}</h1>
        {loading ? (
          <Loading />
        ) : preview ? (
          <>
            <h2>{preview.organization.name}</h2>
            <p>{msg("This invitation is for {0}.", preview.maskedEmail)}</p>
            <p>
              <strong>{roleLabel(preview.role)}</strong> —{" "}
              {roleDescription(preview.role)}
            </p>
            {preview.role === "supervisor" && (
              <p>
                {msg(
                  "Request approval: {0}. Reports: {1}.",
                  preview.supervisorCanApprove
                    ? msg("allowed")
                    : msg("not allowed"),
                  preview.supervisorCanReport
                    ? msg("available")
                    : msg("unavailable"),
                )}
              </p>
            )}
            {preview.status === "pending" ? (
              <>
                <p>
                  {msg(
                    "Sign in or create your account with the email address that received the invitation. It must be verified. You will join this workspace with the stated role, even if you already have a Guteneo account.",
                  )}
                </p>
                <button
                  type="button"
                  className="button primary"
                  disabled={action.pending}
                  onClick={() => void accept()}
                >
                  {action.pending
                    ? msg("Signing in…")
                    : msg("Accept and sign in")}
                </button>
              </>
            ) : (
              <p role="status">
                {msg(
                  "This invitation is no longer available. Ask the workspace administrator for a new invitation.",
                )}
              </p>
            )}
          </>
        ) : (
          !error && (
            <p>
              {msg(
                "Open the complete link from your email to view your invitation.",
              )}
            </p>
          )
        )}
        <ErrorNotice error={error ?? action.error} />
        <p>
          <a href="/roles/">{msg("Understand roles")}</a>
        </p>
      </main>
      <PublicFooter />
    </div>
  );
}
