import { useEffect, useState } from "react";
import { api } from "./api";
import { Brand } from "./brand";
import { ErrorNotice, Loading, useAction } from "./components";
import { LanguageMenu } from "./language-select";
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
    document.title = `${msg("Invitation à rejoindre un atelier")} | Guteneo`;
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
            "L’invitation n’a pas pu être acceptée. Rouvrez le lien reçu ou demandez une nouvelle invitation à votre administrateur.",
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
          msg(
            "La connexion n’est pas disponible. Réessayez depuis votre invitation.",
          ),
        );
      window.location.assign(result.loginUrl);
    });
  }
  return (
    <div className="legal-page">
      <header className="site-header">
        <Brand />
        <LanguageMenu />
      </header>
      <main className="invitation-page">
        <h1>{msg("Invitation à rejoindre un atelier")}</h1>
        {loading ? (
          <Loading />
        ) : preview ? (
          <>
            <h2>{preview.organization.name}</h2>
            <p>
              {msg("Cette invitation est destinée à {0}.", preview.maskedEmail)}
            </p>
            <p>
              <strong>{roleLabel(preview.role)}</strong> —{" "}
              {roleDescription(preview.role)}
            </p>
            {preview.role === "supervisor" && (
              <p>
                {msg(
                  "Approbation des requêtes : {0}. Rapports : {1}.",
                  preview.supervisorCanApprove
                    ? msg("autorisée")
                    : msg("non autorisée"),
                  preview.supervisorCanReport
                    ? msg("accessibles")
                    : msg("non accessibles"),
                )}
              </p>
            )}
            {preview.status === "pending" ? (
              <>
                <p>
                  {msg(
                    "Connectez-vous ou créez votre compte avec l’adresse e-mail qui a reçu l’invitation. Elle doit être vérifiée. Vous rejoindrez cet atelier avec le rôle indiqué, même si vous avez déjà un compte Guteneo.",
                  )}
                </p>
                <button
                  type="button"
                  className="button primary"
                  disabled={action.pending}
                  onClick={() => void accept()}
                >
                  {action.pending
                    ? msg("Connexion en cours…")
                    : msg("Accepter et me connecter")}
                </button>
              </>
            ) : (
              <p role="status">
                {msg(
                  "Cette invitation n’est plus disponible. Demandez une nouvelle invitation à l’administrateur de l’atelier.",
                )}
              </p>
            )}
          </>
        ) : (
          !error && (
            <p>
              {msg(
                "Ouvrez le lien complet reçu par e-mail pour consulter votre invitation.",
              )}
            </p>
          )
        )}
        <ErrorNotice error={error ?? action.error} />
        <p>
          <a href="/roles/">{msg("Comprendre les rôles")}</a>
        </p>
      </main>
    </div>
  );
}
