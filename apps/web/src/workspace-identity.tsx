import { ArrowRight, UserCircle } from "@phosphor-icons/react";
import { isPublicPreview, permissionsFor, type Session } from "./api";
import { getLocale } from "./locale";
import { msg } from "./messages";
import { roleLabel } from "./role-guide";
import "./workspace-identity.css";

export function WorkspaceIdentity({ session }: { session: Session }) {
  const returnTo = encodeURIComponent("/" + (window.location.hash || "#/app"));
  return (
    <section className="workspace-identity" aria-label={msg("Votre compte")}>
      <a className="workspace-identity-profile" href="#/app/account">
        <span className="workspace-identity-label">{msg("Connecté avec")}</span>
        <strong>{session.user.name}</strong>
        <span className="workspace-identity-email">
          {session.user.email || msg("Adresse de connexion indisponible")}
        </span>
        <span className="workspace-role">{roleLabel(session.user.role)}</span>
        <span className="workspace-identity-action">
          <UserCircle size={17} aria-hidden="true" />
          {msg("Mon profil et mes droits")}
          <ArrowRight size={15} aria-hidden="true" />
        </span>
      </a>
      {!isPublicPreview && (
        <a
          className="workspace-switch-account"
          href={`/auth/login?intent=switch-account&locale=${getLocale()}&returnTo=${returnTo}`}
        >
          {msg("Changer de compte")}
        </a>
      )}
    </section>
  );
}

export function DashboardIdentity({ session }: { session: Session }) {
  const permissions = permissionsFor(session);
  return (
    <section className="dashboard-identity" aria-label={msg("Votre rôle dans cet atelier")}>
      <div>
        <span className="workspace-identity-label">{session.organization.name}</span>
        <h2>{session.user.name}</h2>
        <p>
          <span className="workspace-role">{roleLabel(session.user.role)}</span>
          {permissions.manageMembers
            ? msg("Vous gérez les accès et pouvez valider les envois.")
            : permissions.approveDispatches
              ? msg("Vous pouvez préparer et valider les envois.")
              : permissions.prepareDispatches
                ? msg("Vous préparez les envois ; une personne habilitée les valide.")
                : msg("Vous consultez l’activité de cet atelier en lecture seule.")}
        </p>
      </div>
      <a className="text-link" href="#/app/account">
        {msg("Mon profil et mes droits")}
        <ArrowRight size={17} aria-hidden="true" />
      </a>
    </section>
  );
}
