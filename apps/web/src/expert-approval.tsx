import { useId, useState, type FormEvent } from "react";
import {
  api,
  date,
  isPublicPreview,
  money,
  type Channel,
  type ExpertApprovalConnection,
  type ExpertApprovalSettings,
} from "./api";
import {
  ErrorNotice,
  Loading,
  RefreshButton,
  useAction,
  useResource,
} from "./components";
import "./expert-approval.css";

const channelNames: Record<Channel, string> = {
  fax: "Fax",
  email: "E-mail",
  postal: "Courrier postal",
};

function localDateTime(value: Date) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function toMinor(value: string) {
  return Math.round(Number(value) * 100);
}

function ConnectionSettings({
  connection,
  canManage,
  onUpdated,
}: {
  connection: ExpertApprovalConnection;
  canManage: boolean;
  onUpdated: (data: ExpertApprovalSettings) => void;
}) {
  const id = useId();
  const policy = connection.policy;
  const active =
    connection.status === "active" &&
    policy?.enabled &&
    new Date(policy.expiresAt).getTime() > Date.now();
  const [editing, setEditing] = useState(false);
  const [channels, setChannels] = useState<Channel[]>(
    policy?.channels ?? ["fax"],
  );
  const [perDispatch, setPerDispatch] = useState(
    String((policy?.maxPerDispatchMinor ?? 500) / 100),
  );
  const [daily, setDaily] = useState(
    String((policy?.maxDailyMinor ?? 2500) / 100),
  );
  const [count, setCount] = useState(String(policy?.maxDailyCount ?? 20));
  const [expires, setExpires] = useState(
    localDateTime(
      new Date(
        active && policy ? policy.expiresAt : Date.now() + 7 * 86_400_000,
      ),
    ),
  );
  const [acknowledged, setAcknowledged] = useState(false);
  const [postalAcknowledged, setPostalAcknowledged] = useState(false);
  const [validation, setValidation] = useState("");
  const [notice, setNotice] = useState("");
  const action = useAction();
  const editable = canManage && connection.status === "active";

  function changed() {
    setAcknowledged(false);
    setPostalAcknowledged(false);
    setValidation("");
    setNotice("");
    action.clear();
  }

  function startEditing() {
    changed();
    setChannels(policy?.channels ?? ["fax"]);
    setPerDispatch(String((policy?.maxPerDispatchMinor ?? 500) / 100));
    setDaily(String((policy?.maxDailyMinor ?? 2500) / 100));
    setCount(String(policy?.maxDailyCount ?? 20));
    setExpires(
      localDateTime(
        new Date(
          active && policy ? policy.expiresAt : Date.now() + 7 * 86_400_000,
        ),
      ),
    );
    setEditing(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editable || action.pending) return;
    if (channels.length === 0) {
      setValidation("Choisissez au moins un canal pour cette délégation.");
      document.getElementById(`${id}-fax`)?.focus();
      return;
    }
    if (toMinor(daily) < toMinor(perDispatch)) {
      setValidation(
        "Le plafond journalier doit être au moins égal au plafond par envoi.",
      );
      document.getElementById(`${id}-daily`)?.focus();
      return;
    }
    if (!acknowledged || (channels.includes("postal") && !postalAcknowledged))
      return;
    await action.run(async () => {
      const result = await api<ExpertApprovalSettings>(
        `/account/expert-approval/${encodeURIComponent(connection.connectionId)}`,
        {
          method: "PUT",
          body: {
            enabled: true,
            channels,
            maxPerDispatchMinor: toMinor(perDispatch),
            maxDailyMinor: toMinor(daily),
            maxDailyCount: Number(count),
            expiresAt: new Date(expires).toISOString(),
            acknowledgement: "delegate-approval-v1",
          },
        },
      );
      onUpdated(result);
      setEditing(false);
      setAcknowledged(false);
      setPostalAcknowledged(false);
      setNotice("Votre délégation a été enregistrée pour cette connexion.");
    });
  }

  async function disable() {
    if (!editable || action.pending) return;
    await action.run(async () => {
      onUpdated(
        await api<ExpertApprovalSettings>(
          `/account/expert-approval/${encodeURIComponent(connection.connectionId)}`,
          { method: "PUT", body: { enabled: false } },
        ),
      );
      setEditing(false);
      setAcknowledged(false);
      setPostalAcknowledged(false);
      setNotice(
        "Délégation désactivée. Les envois déjà acceptés restent inchangés.",
      );
    });
  }

  return (
    <article className="expert-connection" aria-labelledby={`${id}-title`}>
      <div className="expert-connection-heading">
        <div>
          <h3 id={`${id}-title`}>Connexion de l’assistant</h3>
          <p className="field-hint">
            Client OAuth : <code>{connection.clientId}</code>
          </p>
        </div>
        <span className="expert-state">
          {connection.status === "revoked"
            ? "Connexion révoquée"
            : active
              ? "Délégation active"
              : policy?.enabled
                ? "Délégation expirée"
                : "Désactivée"}
        </span>
      </div>
      {policy && (
        <dl className="expert-summary">
          <div>
            <dt>Canaux autorisés</dt>
            <dd>
              {policy.channels
                .map((channel) => channelNames[channel])
                .join(", ")}
            </dd>
          </div>
          <div>
            <dt>Plafond par envoi</dt>
            <dd>{money(policy.maxPerDispatchMinor)}</dd>
          </div>
          <div>
            <dt>Plafond journalier</dt>
            <dd>
              {money(policy.maxDailyMinor)} · {policy.maxDailyCount} envois
            </dd>
          </div>
          <div>
            <dt>Expiration</dt>
            <dd>{date(policy.expiresAt)}</dd>
          </div>
        </dl>
      )}
      <p className="field-hint">
        Aujourd’hui (UTC) : {connection.usage.count} envoi
        {connection.usage.count === 1 ? "" : "s"} ·{" "}
        {money(connection.usage.ceilingMinor)} de plafonds engagés par cette
        connexion.
      </p>
      {editable && !editing && (
        <div className="button-group">
          <button
            type="button"
            className="button"
            onClick={startEditing}
            disabled={action.pending}
          >
            {active ? "Modifier la délégation" : "Configurer la délégation"}
          </button>
          {policy?.enabled && (
            <button
              type="button"
              className="button"
              onClick={() => void disable()}
              disabled={action.pending}
            >
              {action.pending ? "Désactivation…" : "Désactiver la délégation"}
            </button>
          )}
        </div>
      )}
      {editing && editable && (
        <form
          className="expert-form"
          onSubmit={(event) => void save(event)}
          aria-busy={action.pending}
        >
          <fieldset disabled={action.pending}>
            <legend>Canaux autorisés</legend>
            <div className="expert-channels">
              {(Object.keys(channelNames) as Channel[]).map((channel) => (
                <label
                  className="checkbox-label"
                  key={channel}
                  htmlFor={`${id}-${channel}`}
                >
                  <input
                    id={`${id}-${channel}`}
                    type="checkbox"
                    checked={channels.includes(channel)}
                    aria-describedby={
                      validation ? `${id}-validation` : undefined
                    }
                    onChange={(event) => {
                      changed();
                      setChannels(
                        event.target.checked
                          ? [...channels, channel]
                          : channels.filter((value) => value !== channel),
                      );
                    }}
                  />
                  {channelNames[channel]}
                </label>
              ))}
            </div>
            <div className="expert-limits">
              <div className="field">
                <label htmlFor={`${id}-per-dispatch`}>
                  Plafond par envoi (€)
                </label>
                <input
                  id={`${id}-per-dispatch`}
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  max="100"
                  step="0.01"
                  required
                  value={perDispatch}
                  onChange={(event) => {
                    changed();
                    setPerDispatch(event.target.value);
                  }}
                />
                <small>De 0,01 € à 100 €.</small>
              </div>
              <div className="field">
                <label htmlFor={`${id}-daily`}>Plafond par jour (€)</label>
                <input
                  id={`${id}-daily`}
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  max="500"
                  step="0.01"
                  required
                  value={daily}
                  aria-invalid={
                    validation && channels.length > 0 ? true : undefined
                  }
                  aria-describedby={validation ? `${id}-validation` : undefined}
                  onChange={(event) => {
                    changed();
                    setDaily(event.target.value);
                  }}
                />
                <small>De 0,01 € à 500 €, au moins le plafond par envoi.</small>
              </div>
              <div className="field">
                <label htmlFor={`${id}-count`}>
                  Nombre maximal d’envois par jour
                </label>
                <input
                  id={`${id}-count`}
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="1000"
                  step="1"
                  required
                  value={count}
                  onChange={(event) => {
                    changed();
                    setCount(event.target.value);
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor={`${id}-expires`}>
                  Expiration de la délégation
                </label>
                <input
                  id={`${id}-expires`}
                  type="datetime-local"
                  min={localDateTime(new Date())}
                  max={localDateTime(new Date(Date.now() + 30 * 86_400_000))}
                  required
                  value={expires}
                  aria-describedby={`${id}-expires-help`}
                  onChange={(event) => {
                    changed();
                    setExpires(event.target.value);
                  }}
                />
                <small id={`${id}-expires-help`}>
                  Heure locale de cet appareil. Dans 30 jours au plus.
                </small>
              </div>
            </div>
            <p className="field-hint">
              Les limites journalières se renouvellent à minuit UTC. Elles
              portent sur le nombre d’envois et leurs plafonds, même si le
              décompte final est inférieur. Le crédit et les autorisations des
              canaux restent nécessaires.
            </p>
            {channels.includes("postal") && (
              <label className="checkbox-label expert-agreement">
                <input
                  type="checkbox"
                  required
                  checked={postalAcknowledged}
                  onChange={(event) =>
                    setPostalAcknowledged(event.target.checked)
                  }
                />
                <span>
                  J’autorise aussi cet assistant à déposer le PDF chez Pingen en
                  brouillon non envoyé pour obtenir le devis postal, puis à
                  approuver l’envoi dans la conversation.
                </span>
              </label>
            )}
            <p className="expert-warning">
              Ce mandat permet à l’assistant d’approuver dans la conversation,
              sans retour sur le site pour chaque envoi. Il ne constitue pas une
              preuve de votre accord humain à chaque appel. Les règles de
              ChatGPT, Claude ou de votre autre assistant restent applicables.
              Un accès compromis à cette connexion pourrait déclencher des
              envois dans ces limites.
            </p>
            <label className="checkbox-label expert-agreement">
              <input
                type="checkbox"
                required
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              <span>
                J’autorise la délégation d’approbation à cet assistant, pour les
                canaux, limites et durée indiqués. Je peux la désactiver pour
                les nouveaux envois ; ceux déjà acceptés restent inchangés.
              </span>
            </label>
            <p
              id={`${id}-validation`}
              className="expert-validation"
              aria-live="polite"
            >
              {validation}
            </p>
            <div className="button-group">
              <button type="submit" className="button primary">
                {action.pending
                  ? "Enregistrement…"
                  : active
                    ? "Confirmer la modification"
                    : "Confirmer l’activation"}
              </button>
              <button
                type="button"
                className="button"
                onClick={() => {
                  changed();
                  setEditing(false);
                }}
              >
                Annuler
              </button>
            </div>
          </fieldset>
        </form>
      )}
      <ErrorNotice error={action.error} />
      <p className="field-hint" aria-live="polite">
        {notice}
      </p>
    </article>
  );
}

export function ExpertApproval() {
  const resource = useResource<ExpertApprovalSettings>(
    isPublicPreview ? null : "/account/expert-approval",
  );
  return (
    <section
      className="form-panel expert-settings"
      aria-labelledby="expert-approval-title"
    >
      <div className="expert-heading">
        <div>
          <p className="eyebrow">Option personnelle · désactivée par défaut</p>
          <h2 id="expert-approval-title">Mode expert</h2>
        </div>
        {!isPublicPreview && (
          <RefreshButton
            onClick={resource.refresh}
            disabled={resource.loading}
          />
        )}
      </div>
      <p>
        Confiez à un assistant connecté l’approbation de vos envois, dans les
        limites que vous choisissez. Sans cette délégation, vous continuez à
        approuver chaque envoi sur le site.
      </p>
      {isPublicPreview ? (
        <p className="notice info">
          Aucune délégation n’est active dans cet aperçu. Dans votre compte,
          vous pourrez choisir une connexion d’assistant, ses canaux, ses
          plafonds et sa date d’expiration.
        </p>
      ) : (
        <>
          <ErrorNotice error={resource.error} retry={resource.refresh} />
          {resource.loading && !resource.data && <Loading />}
          {resource.data && (
            <>
              {!resource.data.canManage && (
                <p className="notice info">
                  Seul un administrateur peut gérer la délégation de ses propres
                  connexions. Vos autorisations sont affichées en lecture seule.
                </p>
              )}
              {resource.data.connections.length === 0 ? (
                <p className="empty-inline">
                  Vous n’avez pas encore de connexion d’assistant.{" "}
                  <a href="#/app/connection">Connecter un assistant</a>
                </p>
              ) : (
                resource.data.connections.map((connection) => (
                  <ConnectionSettings
                    key={connection.connectionId}
                    connection={connection}
                    canManage={resource.data!.canManage}
                    onUpdated={resource.setData}
                  />
                ))
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
