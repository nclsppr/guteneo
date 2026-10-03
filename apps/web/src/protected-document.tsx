import { msg } from "./messages";
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
    <section
      className="protected-document-choice"
      aria-label={msg("Accès au PDF")}
    >
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabled(event.target.checked)}
        />
        <span>
          {msg("Envoyer un lien protégé par mot de passe")}
          <small className="sub-label">
            {msg("1 € par document hébergé, en plus de l’envoi de l’e-mail.")}
          </small>
        </span>
      </label>
      {enabled && (
        <>
          <Field label={msg("Expiration du lien")}>
            <select
              value={days}
              onChange={(event) =>
                onDays(Number(event.target.value) as 1 | 7 | 30)
              }
            >
              <option value="1">{msg("Après 1 jour")}</option>
              <option value="7">{msg("Après 7 jours")}</option>
              <option value="30">{msg("Après 30 jours")}</option>
            </select>
          </Field>
          <p className="field-hint">
            {msg(
              "L’e-mail contient un lien, sans pièce jointe. Le destinataire saisit le mot de passe sans créer de compte. Vous pourrez copier ce mot de passe à la prochaine étape et le transmettre par un autre canal.",
            )}
          </p>
          <p className="field-hint">
            {msg(
              "L’accès est protégé ; ce n’est pas un chiffrement de bout en bout. Une copie téléchargée reste accessible après révocation du lien.",
            )}
          </p>
        </>
      )}
    </section>
  );
}

export function ProtectedDocumentSummary({
  dispatch,
  onUpdated,
  canManage = true,
  canRevoke = true,
}: {
  dispatch: Dispatch;
  onUpdated: () => void;
  canManage?: boolean;
  canRevoke?: boolean;
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
        <LockKey size={20} aria-hidden="true" />
        {msg("Lien protégé par mot de passe")}
      </h2>
      <p>
        {protection.hostingFeeMinor === 0
          ? msg(
              "Hébergement déjà payé pour ce document : aucun nouveau frais d’hébergement.",
            )
          : msg(
              "Hébergement de ce document : {0}, en plus de l’envoi de l’e-mail.",
              money(protection.hostingFeeMinor),
            )}{" "}
        {msg(
          "Période d’hébergement : {0} jour(s), jusqu’au {1}.",
          protection.durationDays,
          date(protection.expiresAt),
        )}
      </p>
      <p className="field-hint">
        {msg(
          "L’e-mail contient un lien, sans pièce jointe. Transmettez le mot de passe par téléphone ou une autre messagerie.",
        )}
      </p>
      <p className="field-hint">
        {msg(
          "Le même lien et le même mot de passe servent à tous les destinataires de cet hébergement. Une révocation coupe l’accès pour tous.",
        )}
      </p>
      {protection.hostingFeeMinor > 0 && (
        <p className="field-hint">
          {msg(
            "L’hébergement est facturé à l’activation pour cette période, même si l’e-mail échoue ou est annulé ensuite. Sa révocation ne donne pas lieu à un remboursement.",
          )}
        </p>
      )}
      {status.data?.status === "draft" && !accessRevoked && !expired && (
        <p className="field-hint">
          {msg("Le lien sera accessible après confirmation de l’envoi.")}
        </p>
      )}
      {accessRevoked || expired ? (
        <p role="status">
          {accessRevoked
            ? msg("L’accès à ce document est révoqué.")
            : msg("Le lien a expiré.")}
        </p>
      ) : canManage ? (
        <>
          {!password ? (
            <button
              className="button"
              disabled={action.pending || status.loading || !!status.error}
              onClick={() => void reveal()}
            >
              {action.pending
                ? msg("Chargement…")
                : msg("Afficher le mot de passe")}
            </button>
          ) : (
            <div className="protected-password">
              <code aria-label={msg("Mot de passe du document")}>
                {password}
              </code>
              <button
                className="button small"
                onClick={() => void copy()}
                disabled={action.pending}
              >
                {copied ? <Check size={17} /> : <Copy size={17} />}
                {copied ? msg("Copié") : msg("Copier le mot de passe")}
              </button>
              <button
                className="text-button"
                onClick={() => {
                  setPassword("");
                  setCopied(false);
                }}
              >
                {msg("Masquer")}
              </button>
              <span className="sr-only" role="status">
                {copied ? msg("Mot de passe copié.") : ""}
              </span>
            </div>
          )}
          {canRevoke &&
            (confirmRevoke ? (
              <div className="notice warning">
                <div>
                  <p>
                    {msg(
                      "Révoquer l’accès pour tous les destinataires de cet hébergement ? Les copies déjà téléchargées restent accessibles.",
                    )}
                  </p>
                  <div className="button-group">
                    <button
                      className="button"
                      disabled={action.pending}
                      onClick={() => void revoke()}
                    >
                      {msg("Révoquer l’accès au document")}
                    </button>
                    <button
                      className="text-button"
                      disabled={action.pending}
                      onClick={() => setConfirmRevoke(false)}
                    >
                      {msg("Conserver l’accès")}
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
                  {msg("Révoquer l’accès au document")}
                </button>
              </p>
            ))}
        </>
      ) : null}
      <ErrorNotice error={action.error ?? status.error} />
      <p className="field-hint">
        {msg(
          "Cette protection contrôle l’accès au PDF. Le fichier téléchargé n’est pas protégé par ce mot de passe.",
        )}
      </p>
    </section>
  );
}
