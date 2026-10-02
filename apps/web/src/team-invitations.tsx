import { useRef, useState, type FormEvent } from "react";
import {
  WORKSPACE_ROLES,
  type WorkspaceRole,
} from "../../../packages/contracts/src/roles";
import { api, ApiError, date, type Page } from "./api";
import {
  ConfirmAction,
  ErrorNotice,
  LoadMore,
  Loading,
  RefreshButton,
  useAction,
  useResource,
} from "./components";
import {
  InvitationInputError,
  invitationRecipients,
  parseInvitationCsv,
  type InvitationRecipients,
} from "./invitation-csv";
import { msg } from "./messages";
import type { WorkspaceInvitation as Invitation } from "../../../packages/contracts/src/invitations";
import { roleDescription, roleLabel } from "./role-guide";

function inputError(error: unknown): Error {
  if (!(error instanceof InvitationInputError)) return error as Error;
  return new Error(
    error.reason === "email"
      ? msg("Adresse e-mail invalide à la ligne {0}.", error.line)
      : error.reason === "limit"
        ? msg("Une invitation groupée est limitée à 100 adresses différentes.")
        : error.reason === "empty"
          ? msg("Ajoutez au moins une adresse e-mail.")
          : error.reason === "header"
            ? msg("Le CSV doit contenir une colonne nommée email.")
            : msg(
                "Le CSV est mal formé à la ligne {0}. Vérifiez les colonnes et les guillemets.",
                error.line,
              ),
  );
}
function deliveryLabel(status: Invitation["deliveryStatus"]) {
  return (
    {
      sent: msg("Accepté par le service d’e-mail"),
      simulated: msg("Envoi simulé"),
      failed: msg("Échec de l’e-mail"),
      unknown: msg("Envoi non confirmé"),
      pending: msg("Envoi en attente"),
    }[status] ?? status
  );
}
function statusLabel(status: Invitation["status"]) {
  return (
    {
      pending: msg("En attente d’acceptation"),
      accepted: msg("Invitation acceptée"),
      revoked: msg("Invitation révoquée"),
      expired: msg("Invitation expirée"),
    }[status] ?? status
  );
}
export function TeamInvitations() {
  const resource = useResource<Page<Invitation>>("/admin/invitations");
  const action = useAction();
  const [mode, setMode] = useState("single");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("member");
  const [canApprove, setCanApprove] = useState(false);
  const [canReport, setCanReport] = useState(false);
  const [review, setReview] = useState<InvitationRecipients>();
  const [message, setMessage] = useState("");
  const [inputIssue, setInputIssue] = useState<Error>();
  const [uncertain, setUncertain] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  function resetReview() {
    setReview(undefined);
    setInputIssue(undefined);
    setMessage("");
    action.clear();
  }
  async function prepare(event: FormEvent) {
    event.preventDefault();
    resetReview();
    try {
      if (mode === "single") setReview(invitationRecipients([email]));
      else {
        const selected = file.current?.files?.[0];
        if (!selected) throw new Error(msg("Choisissez un fichier CSV."));
        if (selected.size > 1_000_000)
          throw new Error(msg("Le CSV doit faire moins de 1 Mo."));
        setReview(parseInvitationCsv(await selected.text()));
      }
      requestAnimationFrame(() => reviewHeading.current?.focus());
    } catch (error) {
      setInputIssue(inputError(error));
    }
  }
  async function send() {
    if (!review || uncertain) return;
    await action.run(async () => {
      try {
        await api("/admin/invitations", {
          method: "POST",
          body: {
            emails: review.emails,
            role,
            supervisorCanApprove: role === "supervisor" && canApprove,
            supervisorCanReport: role === "supervisor" && canReport,
          },
        });
        setReview(undefined);
        setEmail("");
        if (file.current) file.current.value = "";
        setMessage(
          msg(
            "Les invitations ont été traitées. Vérifiez leur état ci-dessous.",
          ),
        );
      } catch (error) {
        if (!(error instanceof ApiError) || error.status >= 500)
          setUncertain(true);
        throw error;
      } finally {
        resource.refresh();
      }
    });
  }
  async function revoke(id: string) {
    await action.run(async () => {
      await api(`/admin/invitations/${encodeURIComponent(id)}/revoke`, {
        method: "POST",
        body: {},
      });
      resource.refresh();
    });
  }
  return (
    <section
      className="form-panel team-invitations"
      aria-labelledby="team-invitations-title"
    >
      <h2 id="team-invitations-title">{msg("Inviter des membres")}</h2>
      <p className="field-hint">
        {msg(
          "La personne qui crée un atelier en devient administrateur. Invitez ensuite vos collaborateurs par e-mail, un par un ou depuis un CSV. Le rôle choisi s’applique à toutes les adresses de ce lot.",
        )}
      </p>
      <form
        onSubmit={(event) => void prepare(event)}
        aria-busy={action.pending}
      >
        <fieldset
          disabled={action.pending || uncertain}
          className="invitation-fields"
        >
          <legend className="sr-only">
            {msg("Destinataires et rôle des invitations")}
          </legend>
          <div className="field">
            <label htmlFor="invitation-mode">
              {msg("Ajouter des destinataires")}
            </label>
            <select
              id="invitation-mode"
              value={mode}
              onChange={(event) => {
                setMode(event.target.value);
                resetReview();
              }}
            >
              <option value="single">{msg("Une adresse e-mail")}</option>
              <option value="csv">{msg("Importer un CSV")}</option>
            </select>
          </div>
          {mode === "single" ? (
            <div className="field">
              <label htmlFor="invitation-email">
                {msg("Adresse e-mail à inviter")}
              </label>
              <input
                id="invitation-email"
                type="email"
                autoComplete="off"
                required
                maxLength={254}
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  resetReview();
                }}
              />
            </div>
          ) : (
            <div className="field">
              <label htmlFor="invitation-csv">
                {msg("Fichier CSV des membres")}
              </label>
              <input
                id="invitation-csv"
                type="file"
                accept=".csv,text/csv"
                ref={file}
                required
                aria-describedby="invitation-csv-help"
                onChange={resetReview}
              />
              <small id="invitation-csv-help">
                {msg(
                  "Colonne obligatoire : email. Virgule ou point-virgule accepté. 100 adresses différentes maximum ; les doublons sont retirés avant votre validation.",
                )}
              </small>
            </div>
          )}
          <div className="field">
            <label htmlFor="invitation-role">
              {msg("Rôle des nouveaux membres")}
            </label>
            <select
              id="invitation-role"
              value={role}
              aria-describedby="invitation-role-help"
              onChange={(event) => {
                setRole(event.target.value as WorkspaceRole);
                setCanApprove(false);
                setCanReport(false);
                resetReview();
              }}
            >
              {WORKSPACE_ROLES.map((value) => (
                <option value={value} key={value}>
                  {roleLabel(value)}
                </option>
              ))}
            </select>
            <small id="invitation-role-help">{roleDescription(role)}</small>
          </div>
          {role === "supervisor" && (
            <fieldset className="member-rights">
              <legend>{msg("Droits des superviseurs invités")}</legend>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={canApprove}
                  onChange={(event) => {
                    setCanApprove(event.target.checked);
                    resetReview();
                  }}
                />
                <span>{msg("Approuver et refuser les requêtes")}</span>
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={canReport}
                  onChange={(event) => {
                    setCanReport(event.target.checked);
                    resetReview();
                  }}
                />
                <span>{msg("Consulter les rapports")}</span>
              </label>
            </fieldset>
          )}
          <button className="button" type="submit">
            {msg("Vérifier les invitations")}
          </button>
        </fieldset>
      </form>
      <ErrorNotice error={inputIssue ?? action.error} />
      {uncertain && (
        <p className="notice warning" role="status">
          {msg(
            "La réponse n’a pas pu être confirmée. Actualisez la liste et vérifiez les invitations avant de recharger cette page. Aucun envoi ne sera relancé automatiquement.",
          )}
        </p>
      )}
      {review && (
        <section
          className="invitation-review"
          aria-labelledby="invitation-review-title"
        >
          <h3 id="invitation-review-title" ref={reviewHeading} tabIndex={-1}>
            {msg("Vérifier {0} invitation(s)", review.emails.length)}
          </h3>
          <p>
            {roleLabel(role)}. {roleDescription(role)}
          </p>
          {role === "supervisor" && (
            <p>
              {msg(
                "Approbation des requêtes : {0}. Rapports : {1}.",
                canApprove ? msg("autorisée") : msg("non autorisée"),
                canReport ? msg("accessibles") : msg("non accessibles"),
              )}
            </p>
          )}
          {review.duplicateCount > 0 && (
            <p>{msg("{0} doublon(s) retiré(s).", review.duplicateCount)}</p>
          )}
          <ul>
            {review.emails.map((address) => (
              <li key={address}>{address}</li>
            ))}
          </ul>
          <p>
            {msg(
              "Chaque personne recevra un lien personnel et devra se connecter avec cette adresse vérifiée pour rejoindre l’atelier.",
            )}
          </p>
          <button
            type="button"
            className="button primary"
            disabled={action.pending || uncertain}
            onClick={() => void send()}
          >
            {action.pending
              ? msg("Envoi des invitations…")
              : msg("Envoyer les invitations")}
          </button>
        </section>
      )}
      {message && <p role="status">{message}</p>}
      <div className="section-toolbar">
        <h3>{msg("Invitations de l’atelier")}</h3>
        <RefreshButton
          onClick={resource.refresh}
          disabled={resource.loading || action.pending}
        />
      </div>
      <ErrorNotice error={resource.error} retry={resource.refresh} />
      {resource.loading && !resource.data ? (
        <Loading />
      ) : !resource.data?.items.length ? (
        <p>{msg("Aucune invitation pour le moment.")}</p>
      ) : (
        <ul className="invitation-list">
          {resource.data.items.map((item) => (
            <li key={item.id}>
              <div>
                <strong>{item.email}</strong>
                <p>
                  {roleLabel(item.role)} · {statusLabel(item.status)} ·{" "}
                  {deliveryLabel(item.deliveryStatus)}
                </p>
                <p>{msg("Expire le {0}", date(item.expiresAt))}</p>
                {item.deliveryStatus === "unknown" && (
                  <p>
                    {msg(
                      "Ne renvoyez pas cette invitation tant que le résultat de l’e-mail n’a pas été vérifié.",
                    )}
                  </p>
                )}
              </div>
              {item.status === "pending" && (
                <ConfirmAction
                  label={msg("Révoquer l’invitation")}
                  question={msg(
                    "Révoquer l’invitation de {0} ? Ce lien ne permettra plus de rejoindre l’atelier.",
                    item.email,
                  )}
                  confirmLabel={msg("Révoquer l’invitation")}
                  onConfirm={() => void revoke(item.id)}
                  disabled={action.pending}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      <LoadMore
        path="/admin/invitations"
        data={resource.data}
        onLoaded={resource.setData}
      />
    </section>
  );
}
