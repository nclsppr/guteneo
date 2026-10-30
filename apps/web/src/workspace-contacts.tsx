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
            "The contacts for this workshop could not be verified. Try loading them again.",
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
        <h2 id={titleId}>{msg("Who can help in this workshop?")}</h2>
        <RefreshButton onClick={contacts.refresh} disabled={contacts.loading} />
      </div>
      <p className="field-hint">
        {msg(
          "An administrator manages access and billing. To approve a dispatch, contact someone whose approval permission is listed below.",
        )}
      </p>
      <ErrorNotice
        error={error}
        retry={contacts.refresh}
        focusOnError={false}
      />
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
                        "Email {0} at {1}",
                        contact.name,
                        contact.email,
                      )}
                    >
                      {contact.email}
                    </a>
                  ) : (
                    <span>{msg("Sign-in email unavailable")}</span>
                  )}
                </div>
                <ul
                  className="workspace-contact-rights"
                  aria-label={msg("Permissions for {0}", contact.name)}
                >
                  {contact.permissions.manageMembers && (
                    <li>{msg("Manages access and members")}</li>
                  )}
                  {contact.permissions.manageBilling && (
                    <li>{msg("Manages billing")}</li>
                  )}
                  <li>
                    {contact.permissions.approveDispatches
                      ? msg("Can approve dispatches")
                      : msg("Cannot approve dispatches")}
                  </li>
                  {contact.permissions.viewReports && (
                    <li>{msg("Can view reports")}</li>
                  )}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <p>
            {msg(
              "There are no other administrators or supervisors in this workshop.",
            )}
            {session.user.role === "admin" && (
              <>
                {" "}
                {msg(
                  "You can invite someone or assign these roles in Administration.",
                )}{" "}
                <a href="#/app/admin">
                  {msg("Manage members and invitations")}
                </a>
              </>
            )}
          </p>
        ))
      )}
      {!error && data?.hasMore && (
        <p className="field-hint">
          {msg(
            "The first 50 contacts are shown. An administrator can view all members in Administration.",
          )}
        </p>
      )}
      {compact && (
        <a className="workspace-contact-profile-link" href="#/app/account">
          {msg("View my profile and permissions")}
        </a>
      )}
    </section>
  );
}
