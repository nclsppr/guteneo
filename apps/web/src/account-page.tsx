import { useState, type FormEvent } from "react";
import {
  canAdminister,
  api,
  ApiError,
  date,
  isPublicPreview,
  type Page,
  type Session,
} from "./api";
import {
  ConfirmAction,
  ErrorNotice,
  LoadMore,
  Loading,
  PageHeading,
  RefreshButton,
  useAction,
  useResource,
} from "./components";
import { ExpertApproval } from "./expert-approval";

type Props = { session: Session; onUpdated: () => void | Promise<void> };
type SessionItem = {
  id: string;
  createdAt: string;
  expiresAt: string;
  mfa: number;
  development: number;
  current: number;
};
type Member = {
  id: string;
  name: string;
  role: "admin" | "member" | "viewer";
  joinedAt: string;
  sessions: number;
  connections: number;
};
const roles = {
  admin: "Administrateur",
  member: "Membre",
  viewer: "Lecture seule",
};

function PreviewNotice() {
  return (
    <div className="notice info" role="note">
      <p>
        Dans cet aperçu, les comptes et les accès sont fictifs. Leur
        modification sera disponible dans votre atelier connecté.
      </p>
    </div>
  );
}

export function Account({ session, onUpdated }: Props) {
  const [userName, setUserName] = useState(session.user.name);
  const [organizationName, setOrganizationName] = useState(
    session.organization.name,
  );
  const [saved, setSaved] = useState(false);
  const action = useAction();
  const sessionAction = useAction();
  const invalid =
    action.error instanceof ApiError && action.error.code === "INVALID_INPUT";
  const sessions = useResource<{ items: SessionItem[]; hasMore: boolean }>(
    isPublicPreview ? null : "/account/sessions",
  );
  const isAdmin = canAdminister(session);
  const changed =
    userName.trim() !== session.user.name ||
    (isAdmin && organizationName.trim() !== session.organization.name);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    await action.run(async () => {
      await api("/account", {
        method: "PATCH",
        body: { userName, ...(isAdmin ? { organizationName } : {}) },
      });
      await onUpdated();
      setSaved(true);
    });
  }
  async function revoke(id: string) {
    await sessionAction.run(async () => {
      const result = await api<{ currentSession: boolean }>(
        `/account/sessions/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (result.currentSession) await onUpdated();
      else sessions.refresh();
    });
  }
  return (
    <>
      <PageHeading
        title="Mon compte"
        intro="Votre identité, les autorisations de vos assistants et vos sessions dans l’atelier."
      />
      {isPublicPreview ? (
        <PreviewNotice />
      ) : (
        <>
          <form
            className="form-panel"
            onSubmit={(event) => void save(event)}
            aria-busy={action.pending}
          >
            <h2>Profil et atelier</h2>
            <p className="field-hint">
              Votre nom de profil est partagé entre vos ateliers. Votre adresse
              de connexion et vos facteurs de sécurité restent gérés par le
              fournisseur d’identité.
            </p>
            <div className="field">
              <label htmlFor="account-name">Votre nom</label>
              <input
                id="account-name"
                name="name"
                autoComplete="name"
                value={userName}
                onChange={(event) => {
                  setUserName(event.target.value);
                  setSaved(false);
                  action.clear();
                }}
                maxLength={120}
                required
                disabled={action.pending}
                aria-invalid={invalid || undefined}
                aria-describedby={invalid ? "account-form-error" : undefined}
              />
            </div>
            <div className="field">
              <label htmlFor="account-organization">Nom de l’atelier</label>
              <input
                id="account-organization"
                name="organization"
                autoComplete="organization"
                value={organizationName}
                onChange={(event) => {
                  setOrganizationName(event.target.value);
                  setSaved(false);
                  action.clear();
                }}
                maxLength={120}
                required
                disabled={!isAdmin || action.pending}
                aria-invalid={invalid || undefined}
                aria-describedby={`account-organization-help${invalid ? " account-form-error" : ""}`}
              />
              <small id="account-organization-help">
                {isAdmin
                  ? "Ce nom sera visible par tous les membres de cet atelier."
                  : "Seul un administrateur peut renommer cet atelier."}
              </small>
            </div>
            <p className="field-hint">
              Votre rôle :{" "}
              {roles[session.user.role as keyof typeof roles] ??
                session.user.role}
              .
            </p>
            <button
              className="button primary"
              type="submit"
              disabled={action.pending || !changed}
            >
              {action.pending
                ? "Enregistrement…"
                : "Enregistrer les modifications"}
            </button>
            {saved && <p role="status">Votre profil a été enregistré.</p>}
            <div id="account-form-error">
              <ErrorNotice error={action.error} />
            </div>
          </form>
          <ExpertApproval />
          <section
            className="form-panel"
            aria-labelledby="account-sessions-title"
          >
            <h2 id="account-sessions-title">Vos sessions actives</h2>
            <p className="field-hint">
              Les sessions de cet atelier expirent après une heure. Révoquer une
              session coupe son accès à Guteneo ; cela ne déconnecte pas votre
              compte du fournisseur d’identité.
            </p>
            <RefreshButton
              onClick={sessions.refresh}
              disabled={sessions.loading}
            />
            <ErrorNotice error={sessions.error} retry={sessions.refresh} />
            <ErrorNotice error={sessionAction.error} />
            {sessions.loading && !sessions.data ? (
              <Loading />
            ) : (
              sessions.data && (
                <div className="table-scroll">
                  <table className="responsive-table" role="table">
                    <thead role="rowgroup">
                      <tr role="row">
                        <th role="columnheader" scope="col">
                          Ouverture
                        </th>
                        <th role="columnheader" scope="col">
                          Expiration
                        </th>
                        <th role="columnheader" scope="col">
                          Session
                        </th>
                        <th role="columnheader" scope="col">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody role="rowgroup">
                      {sessions.data.items.map((item) => (
                        <tr role="row" key={item.id}>
                          <td role="cell" className="date-cell">
                            <span
                              className="mobile-cell-label"
                              aria-hidden="true"
                            >
                              Ouverture
                            </span>
                            {date(item.createdAt)}
                          </td>
                          <td role="cell" className="date-cell">
                            <span
                              className="mobile-cell-label"
                              aria-hidden="true"
                            >
                              Expiration
                            </span>
                            {date(item.expiresAt)}
                          </td>
                          <td role="cell">
                            <span
                              className="mobile-cell-label"
                              aria-hidden="true"
                            >
                              Session
                            </span>
                            {item.current ? "Cet appareil" : "Autre session"}
                            {item.development
                              ? " · simulation"
                              : item.mfa
                                ? " · double authentification"
                                : ""}
                          </td>
                          <td role="cell">
                            <span
                              className="mobile-cell-label"
                              aria-hidden="true"
                            >
                              Action
                            </span>
                            <button
                              type="button"
                              className="button small"
                              disabled={action.pending || sessionAction.pending}
                              onClick={() => void revoke(item.id)}
                              aria-label={`${item.current ? "Me déconnecter de" : "Révoquer"} la session ouverte le ${date(item.createdAt)}`}
                            >
                              {item.current ? "Me déconnecter" : "Révoquer"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
            {sessions.data?.hasMore && (
              <p className="field-hint">
                Les 100 sessions les plus récentes sont affichées. Révoquez-en
                pour afficher les suivantes.
              </p>
            )}
          </section>
        </>
      )}
      {isPublicPreview && <ExpertApproval />}
    </>
  );
}

function MemberRow({
  member,
  currentUserId,
  disabled,
  onRole,
  onRevoke,
}: {
  member: Member;
  currentUserId: string;
  disabled: boolean;
  onRole: (role: Member["role"]) => void;
  onRevoke: () => void;
}) {
  const [role, setRole] = useState(member.role);
  return (
    <tr role="row">
      <th scope="row" role="rowheader">
        <span className="mobile-cell-label" aria-hidden="true">
          Membre
        </span>
        {member.name}
        {member.id === currentUserId ? " (vous)" : ""}
      </th>
      <td role="cell">
        <span className="mobile-cell-label" aria-hidden="true">
          Rôle
        </span>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor={`member-role-${member.id}`} className="sr-only">
            Rôle de {member.name}
          </label>
          <select
            id={`member-role-${member.id}`}
            value={role}
            onChange={(event) => setRole(event.target.value as Member["role"])}
            disabled={disabled}
          >
            {Object.entries(roles).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </td>
      <td role="cell">
        <span className="mobile-cell-label" aria-hidden="true">
          Accès actifs
        </span>
        {member.sessions} session{member.sessions > 1 ? "s" : ""}
        <br />
        {member.connections} connexion{member.connections > 1 ? "s" : ""}{" "}
        assistant
      </td>
      <td role="cell">
        <span className="mobile-cell-label" aria-hidden="true">
          Actions
        </span>
        <button
          type="button"
          className="button small"
          disabled={disabled || role === member.role}
          onClick={() => onRole(role)}
          aria-label={`Enregistrer le rôle de ${member.name}`}
        >
          Enregistrer le rôle
        </button>
        <ConfirmAction
          className="text-button"
          disabled={disabled || (!member.sessions && !member.connections)}
          onConfirm={onRevoke}
          ariaLabel={`Déconnecter ${member.name} de cet atelier`}
          label="Déconnecter les accès"
          question={
            member.id === currentUserId
              ? "Déconnecter vos propres sessions et assistants ? Vous devrez vous reconnecter."
              : `Déconnecter les sessions et assistants de ${member.name} ? La personne reste membre et pourra se reconnecter.`
          }
          confirmLabel="Oui, déconnecter"
        />
      </td>
    </tr>
  );
}

export function TeamAdmin({ session, onUpdated }: Props) {
  const members = useResource<Page<Member>>(
    isPublicPreview || !canAdminister(session) ? null : "/admin/members",
  );
  const action = useAction();
  const [message, setMessage] = useState("");
  async function change(member: Member, role?: Member["role"]) {
    setMessage("");
    await action.run(async () => {
      const result = await api<{ self: boolean; sessionsRevoked: boolean }>(
        `/admin/members/${encodeURIComponent(member.id)}${role ? "" : "/revoke-access"}`,
        { method: role ? "PATCH" : "POST", body: role ? { role } : {} },
      );
      if (result.self && result.sessionsRevoked) await onUpdated();
      else {
        members.refresh();
        setMessage(
          role
            ? "Le rôle a été modifié. Ce membre doit se reconnecter."
            : "Les accès ont été déconnectés. Le membre peut se reconnecter à son compte.",
        );
      }
    });
  }
  return (
    <section className="form-panel" aria-labelledby="team-admin-title">
      <h2 id="team-admin-title">Membres de l’atelier</h2>
      {isPublicPreview ? (
        <PreviewNotice />
      ) : !canAdminister(session) ? (
        <p>
          La gestion des membres est réservée aux administrateurs de cet
          atelier.
        </p>
      ) : (
        <>
          <p className="field-hint">
            Un changement de rôle déconnecte les sessions et les assistants du
            membre concerné. Si vous modifiez votre propre rôle, vous devrez
            vous reconnecter. L’atelier conserve toujours au moins un
            administrateur.
          </p>
          <p className="field-hint">
            Déconnecter les accès ne retire pas la qualité de membre : la
            personne pourra se reconnecter. Aucun email d’invitation n’est
            envoyé depuis cet écran.
          </p>
          <RefreshButton
            onClick={members.refresh}
            disabled={members.loading || action.pending}
          />
          <ErrorNotice
            error={members.error ?? action.error}
            retry={members.refresh}
          />
          {message && <p role="status">{message}</p>}
          {members.loading && !members.data ? (
            <Loading />
          ) : (
            members.data && (
              <>
                <div className="table-scroll">
                  <table className="responsive-table" role="table">
                    <thead role="rowgroup">
                      <tr role="row">
                        <th role="columnheader" scope="col">
                          Membre
                        </th>
                        <th role="columnheader" scope="col">
                          Rôle
                        </th>
                        <th role="columnheader" scope="col">
                          Accès actifs
                        </th>
                        <th role="columnheader" scope="col">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody role="rowgroup">
                      {members.data.items.map((member) => (
                        <MemberRow
                          key={`${member.id}-${member.role}`}
                          member={member}
                          currentUserId={session.user.id}
                          disabled={action.pending}
                          onRole={(role) => void change(member, role)}
                          onRevoke={() => void change(member)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
                <LoadMore
                  path="/admin/members"
                  data={members.data}
                  onLoaded={members.setData}
                />
              </>
            )
          )}
        </>
      )}
    </section>
  );
}
