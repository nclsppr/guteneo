import { useEffect, useState } from "react";
import { Copy, LockKey, Check } from "@phosphor-icons/react";
import { api, date, money, type Dispatch } from "./api";
import { ErrorNotice, Field, useAction, useResource } from "./components";

export type ProtectedDelivery = {
  hostingId: string;
  expiresAt: string;
  durationDays: number;
  hostingFeeMinor: number;
};

export function protectedDelivery(
  dispatch: Dispatch,
): ProtectedDelivery | undefined {
  try {
    const options =
      typeof dispatch.options_json === "string"
        ? JSON.parse(dispatch.options_json)
        : dispatch.options_json;
    return options?.emailDeliveryMode === "protected_link"
      ? options.protectedDocument
      : undefined;
  } catch {
    return undefined;
  }
}

export function ProtectedDocumentChoice({
  enabled,
  days,
  onEnabled,
  onDays,
}: {
  enabled: boolean;
  days: number;
  onEnabled: (enabled: boolean) => void;
  onDays: (days: 1 | 7 | 30) => void;
}) {
  return (
    <section className="protected-document-choice" aria-label="Accès au PDF">
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabled(event.target.checked)}
        />
        <span>
          Envoyer un lien protégé par mot de passe
          <small className="sub-label">
            1 € par document hébergé, en plus de l’envoi de l’e-mail.
          </small>
        </span>
      </label>
      {enabled && (
        <>
          <Field label="Expiration du lien">
            <select
              value={days}
              onChange={(event) =>
                onDays(Number(event.target.value) as 1 | 7 | 30)
              }
            >
              <option value="1">Après 1 jour</option>
              <option value="7">Après 7 jours</option>
              <option value="30">Après 30 jours</option>
            </select>
          </Field>
          <p className="field-hint">
            L’e-mail contient un lien, sans pièce jointe. Le destinataire saisit
            le mot de passe sans créer de compte. Vous pourrez copier ce mot de
            passe à la prochaine étape et le transmettre par un autre canal.
          </p>
          <p className="field-hint">
            L’accès est protégé ; ce n’est pas un chiffrement de bout en bout.
            Une copie téléchargée reste accessible après révocation du lien.
          </p>
        </>
      )}
    </section>
  );
}

export function ProtectedDocumentSummary({
  dispatch,
  onUpdated,
}: {
  dispatch: Dispatch;
  onUpdated: () => void;
}) {
  const protection = protectedDelivery(dispatch);
  const action = useAction();
  const status = useResource<{
    status: "draft" | "active" | "expired" | "revoked";
    expiresAt: string;
    hostingFeeMinor: number;
  }>(
    protection
      ? `/dispatches/${encodeURIComponent(dispatch.id)}/protected-document`
      : null,
  );
  const [password, setPassword] = useState("");
  const [copied, setCopied] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  useEffect(() => {
    setPassword("");
    setCopied(false);
    setRevoked(false);
    setConfirmRevoke(false);
  }, [dispatch.id]);
  if (!protection) return null;
  const expired =
    status.data?.status === "expired" ||
    Date.parse(protection.expiresAt) <= Date.now();
  const accessRevoked = revoked || status.data?.status === "revoked";
  async function reveal() {
    await action.run(async () => {
      const response = await api<{ password: string }>(
        `/dispatches/${encodeURIComponent(dispatch.id)}/protected-document/password`,
        { method: "POST", body: {} },
      );
      setPassword(response.password);
    });
  }
  async function copy() {
    await action.run(async () => {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    });
  }
  async function revoke() {
    await action.run(async () => {
      await api(
        `/dispatches/${encodeURIComponent(dispatch.id)}/protected-document/revoke`,
        {
          method: "POST",
          body: {},
        },
      );
      setRevoked(true);
      setPassword("");
      setConfirmRevoke(false);
      status.refresh();
      onUpdated();
    });
  }
  return (
    <section
      className="protected-document-summary"
      aria-labelledby="protected-document-title"
    >
      <h2 id="protected-document-title">
        <LockKey size={20} aria-hidden="true" /> Lien protégé par mot de passe
      </h2>
      <p>
        {protection.hostingFeeMinor === 0
          ? "Hébergement déjà payé pour ce document : aucun nouveau frais d’hébergement."
          : `Hébergement de ce document : ${money(protection.hostingFeeMinor)}, en plus de l’envoi de l’e-mail.`}{" "}
        Période d’hébergement : {protection.durationDays} jour
        {protection.durationDays > 1 ? "s" : ""}, jusqu’au{" "}
        {date(protection.expiresAt)}.
      </p>
      <p className="field-hint">
        L’e-mail contient un lien, sans pièce jointe. Transmettez le mot de
        passe par téléphone ou une autre messagerie.
      </p>
      <p className="field-hint">
        Le même lien et le même mot de passe servent à tous les destinataires de
        cet hébergement. Une révocation coupe l’accès pour tous.
      </p>
      {protection.hostingFeeMinor > 0 && (
        <p className="field-hint">
          L’hébergement est facturé à l’activation pour cette période, même si
          l’e-mail échoue ou est annulé ensuite. Sa révocation ne donne pas lieu
          à un remboursement.
        </p>
      )}
      {status.data?.status === "draft" && !accessRevoked && !expired && (
        <p className="field-hint">
          Le lien sera accessible après confirmation de l’envoi.
        </p>
      )}
      {accessRevoked || expired ? (
        <p role="status">
          {accessRevoked
            ? "L’accès à ce document est révoqué."
            : "Le lien a expiré."}
        </p>
      ) : (
        <>
          {!password ? (
            <button
              className="button"
              disabled={action.pending || status.loading || !!status.error}
              onClick={() => void reveal()}
            >
              {action.pending ? "Chargement…" : "Afficher le mot de passe"}
            </button>
          ) : (
            <div className="protected-password">
              <code aria-label="Mot de passe du document">{password}</code>
              <button
                className="button small"
                onClick={() => void copy()}
                disabled={action.pending}
              >
                {copied ? <Check size={17} /> : <Copy size={17} />}
                {copied ? "Copié" : "Copier le mot de passe"}
              </button>
              <button
                className="text-button"
                onClick={() => {
                  setPassword("");
                  setCopied(false);
                }}
              >
                Masquer
              </button>
              <span className="sr-only" role="status">
                {copied ? "Mot de passe copié." : ""}
              </span>
            </div>
          )}
          {confirmRevoke ? (
            <div className="notice warning">
              <div>
                <p>
                  Révoquer l’accès pour tous les destinataires de cet
                  hébergement ? Les copies déjà téléchargées restent
                  accessibles.
                </p>
                <div className="button-group">
                  <button
                    className="button"
                    disabled={action.pending}
                    onClick={() => void revoke()}
                  >
                    Révoquer l’accès au document
                  </button>
                  <button
                    className="text-button"
                    disabled={action.pending}
                    onClick={() => setConfirmRevoke(false)}
                  >
                    Conserver l’accès
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <p>
              <button
                className="text-button"
                onClick={() => setConfirmRevoke(true)}
              >
                Révoquer l’accès au document
              </button>
            </p>
          )}
        </>
      )}
      <ErrorNotice error={action.error ?? status.error} />
      <p className="field-hint">
        Cette protection contrôle l’accès au PDF. Le fichier téléchargé n’est
        pas protégé par ce mot de passe.
      </p>
    </section>
  );
}
