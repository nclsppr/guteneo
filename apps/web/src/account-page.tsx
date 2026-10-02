import { msg } from "./messages";
import { useState, type FormEvent } from "react";
import {
  canAdminister,
  permissionsFor,
  setSession,
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
import { setLocale, languageCopy, type SupportedLocale } from "./locale";
import { LanguageSelect } from "./language-select";
import { ExpertApproval } from "./expert-approval";
import {
  WORKSPACE_ROLES,
  type WorkspaceRole,
} from "../../../packages/contracts/src/roles";
import { roleLabel, roleDescription, RolesOverview } from "./role-guide";

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
  role: WorkspaceRole;
  supervisorCanApprove: boolean;
  supervisorCanReport: boolean;
  joinedAt: string;
  sessions: number;
  connections: number;
};

function PreviewNotice() {
  return (
    <div className="notice info" role="note">
      <p>
        {msg(
          "Dans cet aperçu, les comptes et les accès sont fictifs. Leur modification sera disponible dans votre atelier connecté.",
        )}
      </p>
    </div>
  );
}

function WorkspaceSwitcher({ session, onUpdated }: Props) {
  const workspaces = useResource<{
    items: { id: string; name: string; current: boolean }[];
  }>(isPublicPreview ? null : "/account/workspaces");
  const action = useAction();
  const [selected, setSelected] = useState(session.organization.id);
  if (
    !Array.isArray(workspaces.data?.items) ||
    workspaces.data.items.length < 2
  )
    return null;
  async function change(event: FormEvent) {
    event.preventDefault();
    await action.run(async () => {
      const next = await api<Session>("/account/workspace", {
        method: "POST",
        body: { organizationId: selected },
      });
      setSession(next, false);
      await onUpdated();
    });
  }
  return (
    <form
      className="form-panel"
      onSubmit={(event) => void change(event)}
      aria-busy={action.pending}
    >
      <h2>{msg("Changer d’atelier")}</h2>
      <div className="field">
        <label htmlFor="account-workspace">{msg("Atelier actif")}</label>
        <select
          id="account-workspace"
          value={selected}
          disabled={action.pending}
          onChange={(event) => setSelected(event.target.value)}
        >
          {workspaces.data.items.map((item) => (
            <option value={item.id} key={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>
      <p className="field-hint">
        {msg(
          "Vos documents et vos droits dépendent de l’atelier choisi. Le changement ouvre une nouvelle session dans cet atelier.",
        )}
      </p>
      <button
        className="button"
        disabled={action.pending || selected === session.organization.id}
      >
        {action.pending
          ? msg("Connexion en cours…")
          : msg("Ouvrir cet atelier")}
      </button>
      <ErrorNotice error={action.error} />
    </form>
  );
}

export function Account({ session, onUpdated }: Props) {
  const permissions = permissionsFor(session);
  const [userName, setUserName] = useState(session.user.name);
  const [organizationName, setOrganizationName] = useState(
    session.organization.name,
  );
  const [preferredLocale, setPreferredLocale] = useState<SupportedLocale | "">(
    session.user.preferredLocale ?? "",
  );
  const [languageEdited, setLanguageEdited] = useState(false);
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
    (languageEdited && preferredLocale !== "") ||
    userName.trim() !== session.user.name ||
    (isAdmin && organizationName.trim() !== session.organization.name);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    await action.run(async () => {
      await api("/account", {
        method: "PATCH",
        body: {
          userName,
          ...(languageEdited && preferredLocale ? { preferredLocale } : {}),
          ...(isAdmin ? { organizationName } : {}),
        },
      });
      if (languageEdited && preferredLocale) setLocale(preferredLocale, false);
      await onUpdated();
      setLanguageEdited(false);
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
        title={msg("Mon compte")}
        intro={msg(
          "Votre identité, les autorisations de vos assistants et vos sessions dans l’atelier.",
        )}
      />
      <WorkspaceSwitcher session={session} onUpdated={onUpdated} />
      {isPublicPreview ? (
        <>
          <PreviewNotice />
          <section className="form-panel">
            <LanguageSelect profile />
            <p className="field-hint">{languageCopy().browser}</p>
          </section>
        </>
      ) : (
        <>
          <form
            className="form-panel"
            onSubmit={(event) => void save(event)}
            aria-busy={action.pending}
          >
            <h2>{msg("Profil et atelier")}</h2>
            <p className="field-hint">
              {msg(
                "Votre nom de profil est partagé entre vos ateliers. Votre adresse de connexion et vos facteurs de sécurité restent gérés par le fournisseur d’identité.",
              )}
            </p>
            <div className="field">
              <label htmlFor="account-name">{msg("Votre nom")}</label>
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
              <label htmlFor="account-organization">
                {msg("Nom de l’atelier")}
              </label>
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
                  ? msg(
                      "Ce nom sera visible par tous les membres de cet atelier.",
                    )
                  : msg("Seul un administrateur peut renommer cet atelier.")}
              </small>
            </div>
            <LanguageSelect
              profile
              value={preferredLocale}
              disabled={action.pending}
              onChange={(locale) => {
                setPreferredLocale(locale);
                setLanguageEdited(true);
                setSaved(false);
                action.clear();
              }}
            />
            <p className="field-hint">
              {msg("Votre rôle :")} {roleLabel(session.user.role)}.
            </p>
            <button
              className="button primary"
              type="submit"
              disabled={action.pending || !changed}
            >
              {action.pending
                ? msg("Enregistrement…")
                : msg("Enregistrer les modifications")}
            </button>
            {saved && (
              <p role="status">{msg("Votre profil a été enregistré.")}</p>
            )}
            <div id="account-form-error">
              <ErrorNotice error={action.error} />
            </div>
          </form>
          <section
            className="form-panel account-role"
            aria-labelledby="account-role-title"
          >
            <h2 id="account-role-title">
              {msg("Vos droits dans cet atelier")}
            </h2>
            <p>
              <strong>{roleLabel(session.user.role)}</strong> —{" "}
              {roleDescription(session.user.role)}
            </p>
            <p>
              {msg(
                "Approbation des requêtes : {0}. Rapports : {1}.",
                permissions.approveDispatches
                  ? msg("autorisée")
                  : msg("non autorisée"),
                permissions.viewReports
                  ? msg("accessibles")
                  : msg("non accessibles"),
              )}
            </p>
            <a href="/roles/">{msg("Comprendre les rôles")}</a>
          </section>
          <ExpertApproval />
          <section
            className="form-panel"
            aria-labelledby="account-sessions-title"
          >
            <h2 id="account-sessions-title">{msg("Vos sessions actives")}</h2>
            <p className="field-hint">
              {msg(
                "Les sessions de cet atelier expirent après une heure. Révoquer une session coupe son accès à Guteneo ; cela ne déconnecte pas votre compte du fournisseur d’identité.",
              )}
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
                          {msg("Ouverture")}
                        </th>
                        <th role="columnheader" scope="col">
                          {msg("Expiration")}
                        </th>
                        <th role="columnheader" scope="col">
                          {msg("Session")}
                        </th>
                        <th role="columnheader" scope="col">
                          {msg("Action")}
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
                              {msg("Ouverture")}
                            </span>
                            {date(item.createdAt)}
                          </td>
                          <td role="cell" className="date-cell">
                            <span
                              className="mobile-cell-label"
                              aria-hidden="true"
                            >
                              {msg("Expiration")}
                            </span>
                            {date(item.expiresAt)}
                          </td>
                          <td role="cell">
                            <span
                              className="mobile-cell-label"
                              aria-hidden="true"
                            >
                              {msg("Session")}
                            </span>
                            {item.current
                              ? msg("Cet appareil")
                              : msg("Autre session")}
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
                              {msg("Action")}
                            </span>
                            <button
                              type="button"
                              className="button small"
                              disabled={action.pending || sessionAction.pending}
                              onClick={() => void revoke(item.id)}
                              aria-label={msg(
                                item.current
                                  ? "Me déconnecter de la session ouverte le {0}"
                                  : "Révoquer la session ouverte le {0}",
                                date(item.createdAt),
                              )}
                            >
                              {item.current
                                ? msg("Me déconnecter")
                                : msg("Révoquer")}
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
                {msg(
                  "Les 100 sessions les plus récentes sont affichées. Révoquez-en pour afficher les suivantes.",
                )}
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
  onRole: (
    rights: Pick<
      Member,
      "role" | "supervisorCanApprove" | "supervisorCanReport"
    >,
  ) => void;
  onRevoke: () => void;
}) {
  const [role, setRole] = useState(member.role);
  const [canApprove, setCanApprove] = useState(
    member.supervisorCanApprove ?? false,
  );
  const [canReport, setCanReport] = useState(
    member.supervisorCanReport ?? false,
  );
  const changed =
    role !== member.role ||
    (role === "supervisor" &&
      (canApprove !== (member.supervisorCanApprove ?? false) ||
        canReport !== (member.supervisorCanReport ?? false)));
  return (
    <tr role="row">
      <th scope="row" role="rowheader">
        <span className="mobile-cell-label" aria-hidden="true">
          {msg("Membre")}
        </span>
        {member.name}
        {member.id === currentUserId ? msg(" (vous)") : ""}
      </th>
      <td role="cell" className="member-role-cell">
        <span className="mobile-cell-label" aria-hidden="true">
          {msg("Rôle")}
        </span>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor={`member-role-${member.id}`} className="sr-only">
            {msg("Rôle de ")}
            {member.name}
          </label>
          <select
            id={`member-role-${member.id}`}
            value={role}
            onChange={(event) => {
              setRole(event.target.value as Member["role"]);
              setCanApprove(false);
              setCanReport(false);
            }}
            aria-describedby={`member-role-help-${member.id}`}
            disabled={disabled}
          >
            {WORKSPACE_ROLES.map((value) => (
              <option key={value} value={value}>
                {roleLabel(value)}
              </option>
            ))}
          </select>
          <p
            id={`member-role-help-${member.id}`}
            className="member-role-description"
          >
            {roleDescription(role)}
          </p>
          {role === "supervisor" && (
            <fieldset className="member-rights" disabled={disabled}>
              <legend>{msg("Droits de {0}", member.name)}</legend>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={canApprove}
                  onChange={(event) => setCanApprove(event.target.checked)}
                />
                <span>{msg("Approuver et refuser les requêtes")}</span>
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={canReport}
                  onChange={(event) => setCanReport(event.target.checked)}
                />
                <span>{msg("Consulter les rapports")}</span>
              </label>
            </fieldset>
          )}
        </div>
      </td>
      <td role="cell">
        <span className="mobile-cell-label" aria-hidden="true">
          {msg("Accès actifs")}
        </span>
        {msg(
          member.sessions === 1 ? "{0} session" : "{0} sessions",
          member.sessions,
        )}
        <br />
        {msg(
          member.connections === 1
            ? "{0} connexion d’assistant"
            : "{0} connexions d’assistant",
          member.connections,
        )}
      </td>
      <td role="cell" className="member-actions-cell">
        <span className="mobile-cell-label" aria-hidden="true">
          {msg("Actions")}
        </span>
        <div className="member-actions">
          <button
            type="button"
            className="button small"
            disabled={disabled || !changed}
            onClick={() =>
              onRole({
                role,
                supervisorCanApprove: role === "supervisor" && canApprove,
                supervisorCanReport: role === "supervisor" && canReport,
              })
            }
            aria-label={msg("Enregistrer le rôle de {0}", member.name)}
          >
            {msg("Enregistrer le rôle")}
          </button>
          <ConfirmAction
            className="text-button"
            disabled={disabled || (!member.sessions && !member.connections)}
            onConfirm={onRevoke}
            ariaLabel={msg("Déconnecter {0} de cet atelier", member.name)}
            label={msg("Déconnecter les accès")}
            question={
              member.id === currentUserId
                ? msg(
                    "Déconnecter vos propres sessions et assistants ? Vous devrez vous reconnecter.",
                  )
                : msg(
                    "Déconnecter les sessions et assistants de {0} ? La personne reste membre et pourra se reconnecter.",
                    member.name,
                  )
            }
            confirmLabel={msg("Oui, déconnecter")}
          />
        </div>
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
  async function change(
    member: Member,
    rights?: Pick<
      Member,
      "role" | "supervisorCanApprove" | "supervisorCanReport"
    >,
  ) {
    setMessage("");
    await action.run(async () => {
      const result = await api<{ self: boolean; sessionsRevoked: boolean }>(
        `/admin/members/${encodeURIComponent(member.id)}${rights ? "" : "/revoke-access"}`,
        { method: rights ? "PATCH" : "POST", body: rights ?? {} },
      );
      if (result.self && result.sessionsRevoked) await onUpdated();
      else {
        members.refresh();
        setMessage(
          rights
            ? "Le rôle a été modifié. Ce membre doit se reconnecter."
            : "Les accès ont été déconnectés. Le membre peut se reconnecter à son compte.",
        );
      }
    });
  }
  return (
    <section
      className="form-panel team-admin"
      aria-labelledby="team-admin-title"
    >
      <h2 id="team-admin-title">{msg("Membres de l’atelier")}</h2>
      <details className="role-guide-details">
        <summary>{msg("Comprendre les rôles")}</summary>
        <RolesOverview />
        <a href="/roles/">{msg("Lire le guide des rôles et droits")}</a>
      </details>
      {isPublicPreview ? (
        <PreviewNotice />
      ) : !canAdminister(session) ? (
        <p>
          {msg(
            "La gestion des membres est réservée aux administrateurs de cet atelier.",
          )}
        </p>
      ) : (
        <>
          <p className="field-hint">
            {msg(
              "Un changement de rôle déconnecte les sessions et les assistants du membre concerné. Si vous modifiez votre propre rôle, vous devrez vous reconnecter. L’atelier conserve toujours au moins un administrateur.",
            )}
          </p>
          <p className="field-hint">
            {msg(
              "Déconnecter les accès ne retire pas la qualité de membre : la personne pourra se reconnecter.",
            )}
          </p>
          <RefreshButton
            onClick={members.refresh}
            disabled={members.loading || action.pending}
          />
          <ErrorNotice
            error={members.error ?? action.error}
            retry={members.refresh}
          />
          {message && <p role="status">{msg(message)}</p>}
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
                          {msg("Membre")}
                        </th>
                        <th role="columnheader" scope="col">
                          {msg("Rôle")}
                        </th>
                        <th role="columnheader" scope="col">
                          {msg("Accès actifs")}
                        </th>
                        <th role="columnheader" scope="col">
                          {msg("Actions")}
                        </th>
                      </tr>
                    </thead>
                    <tbody role="rowgroup">
                      {members.data.items.map((member) => (
                        <MemberRow
                          key={`${member.id}-${member.role}-${member.supervisorCanApprove}-${member.supervisorCanReport}`}
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
