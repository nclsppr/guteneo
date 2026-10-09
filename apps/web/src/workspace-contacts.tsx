import { type Session, isPublicPreview } from "./api";
import {
  ErrorNotice,
  Loading,
  RefreshButton,
  useRefreshOnFocus,
  useResource,
} from "./components";
import { msg } from "./messages";
import { roleLabel } from "./role-guide";
import type { WorkspaceContacts as WorkspaceContactsResponse } from "../../../packages/contracts/src/account-identity";
import "./workspace-contacts.css";

/** Contacts describe current authority; a supervisor title alone never grants approval. */
export function WorkspaceContacts({
  session,
  compact = false,
}: {
  session: Session;
  compact?: boolean;
}) {
  return (
    <WorkspaceContactDirectory
      key={`${session.organization.id}:${session.user.id}`}
      session={session}
      compact={compact}
    />
  );
}

function WorkspaceContactDirectory({
  session,
  compact,
}: {
  session: Session;
  compact: boolean;
}) {
  const contacts = useResource<WorkspaceContactsResponse>(
    isPublicPreview ? null : "/account/contacts",
  );
  useRefreshOnFocus(contacts.refresh, !isPublicPreview);
  if (isPublicPreview) return null;
  const titleId = compact
    ? "overview-contacts-title"
    : "account-contacts-title";
  return (
    <section
      className={`form-panel workspace-contacts${compact ? " workspace-contacts-compact" : ""}`}
      aria-labelledby={titleId}
      aria-busy={contacts.loading}
    >
      <div className="workspace-contacts-heading">
        <h2 id={titleId}>{msg("Qui contacter dans cet atelier ?")}</h2>
        <RefreshButton onClick={contacts.refresh} disabled={contacts.loading} />
      </div>
      <p className="field-hint">
        {msg(
          "Un administrateur gère vos accès et la facturation. Pour valider un envoi, contactez une personne dont le droit d’approbation est indiqué ci-dessous.",
        )}
      </p>
      <ErrorNotice error={contacts.error} retry={contacts.refresh} />
      {contacts.loading && !contacts.data ? (
        <Loading />
      ) : (
        !contacts.error &&
        contacts.data &&
        (contacts.data.items.length ? (
          <ul className="workspace-contact-list">
            {contacts.data.items.map((contact) => (
              <li key={contact.id}>
                <div className="workspace-contact-identity">
                  <strong>{contact.name}</strong>
                  <span>{roleLabel(contact.role)}</span>
                  {contact.email ? (
                    <a
                      href={`mailto:${encodeURIComponent(contact.email)}`}
                      aria-label={msg(
                        "Contacter {0} par e-mail à {1}",
                        contact.name,
                        contact.email,
                      )}
                    >
                      {contact.email}
                    </a>
                  ) : (
                    <span>{msg("Adresse de connexion indisponible")}</span>
                  )}
                </div>
                <ul
                  className="workspace-contact-rights"
                  aria-label={msg("Droits de {0}", contact.name)}
                >
                  {contact.permissions.manageMembers && (
                    <li>{msg("Gère les accès et les membres")}</li>
                  )}
                  {contact.permissions.manageBilling && (
                    <li>{msg("Gère la facturation")}</li>
                  )}
                  <li>
                    {contact.permissions.approveDispatches
                      ? msg("Peut approuver les envois")
                      : msg("Ne peut pas approuver les envois")}
                  </li>
                  {contact.permissions.viewReports && (
                    <li>{msg("Peut consulter les rapports")}</li>
                  )}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <p>
            {msg("Aucun autre administrateur ou superviseur dans cet atelier.")}
            {session.user.role === "admin" && (
              <>
                {" "}
                {msg(
                  "Vous pouvez inviter une personne ou attribuer ces rôles dans Administration.",
                )}{" "}
                <a href="#/app/admin">
                  {msg("Gérer les membres et les invitations")}
                </a>
              </>
            )}
          </p>
        ))
      )}
      {!contacts.error && contacts.data?.hasMore && (
        <p className="field-hint">
          {msg(
            "Les 50 premiers contacts sont affichés. Un administrateur peut consulter tous les membres dans Administration.",
          )}
        </p>
      )}
      {compact && (
        <a className="workspace-contact-profile-link" href="#/app/account">
          {msg("Voir mon profil et mes droits")}
        </a>
      )}
    </section>
  );
}
