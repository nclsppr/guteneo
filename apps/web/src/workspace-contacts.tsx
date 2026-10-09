import { useMemo } from "react";
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
import {
  MAX_WORKSPACE_CONTACTS,
  type WorkspaceContacts as WorkspaceContactsResponse,
} from "../../../packages/contracts/src/account-identity";
import { workspacePermissions } from "../../../packages/contracts/src/roles";
import "./workspace-contacts.css";

function isContactDirectory(
  value: unknown,
): value is WorkspaceContactsResponse {
  if (!value || typeof value !== "object") return false;
  const directory = value as Partial<WorkspaceContactsResponse>;
  return (
    typeof directory.hasMore === "boolean" &&
    Array.isArray(directory.items) &&
    directory.items.length <= MAX_WORKSPACE_CONTACTS &&
    directory.items.every(
      (contact) =>
        contact &&
        typeof contact.id === "string" &&
        typeof contact.name === "string" &&
        (contact.email === null || typeof contact.email === "string") &&
        (contact.role === "admin" || contact.role === "supervisor") &&
        contact.permissions &&
        Object.keys(workspacePermissions("admin")).every(
          (key) =>
            typeof contact.permissions[
              key as keyof typeof contact.permissions
            ] === "boolean",
        ),
    )
  );
}

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
  const contacts = useResource<unknown>(
    isPublicPreview ? null : "/account/contacts",
  );
  const data = isContactDirectory(contacts.data) ? contacts.data : undefined;
  const error = useMemo(
    () =>
      contacts.error ??
      (contacts.data !== undefined && !data
        ? new Error(
            "Impossible de vérifier les contacts de cet atelier. Réessayez leur consultation.",
          )
        : undefined),
    [contacts.error, contacts.data, data],
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
      <ErrorNotice error={error} retry={contacts.refresh} />
      {contacts.loading && !data ? (
        <Loading />
      ) : (
        !error &&
        data &&
        (data.items.length ? (
          <ul className="workspace-contact-list">
            {data.items.map((contact) => (
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
      {!error && data?.hasMore && (
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
