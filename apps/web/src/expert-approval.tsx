import { msg } from "./messages";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  api,
  date,
  EURO_INPUT_PATTERN,
  euroToMinor,
  isPublicPreview,
  minorToEuroInput,
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

const getChannelNames = (): Record<Channel, string> => ({
  fax: msg("Fax"),
  email: msg("E-mail"),
  postal: msg("Courrier postal"),
});

function localDateTime(value: Date) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function ConnectionSettings({
  connection,
  canManage,
  selected,
  onUpdated,
}: {
  connection: ExpertApprovalConnection;
  canManage: boolean;
  selected: boolean;
  onUpdated: (data: ExpertApprovalSettings) => void;
}) {
  const id = useId();
  const policy = connection.policy;
  const expired = Boolean(
    policy?.enabled && new Date(policy.expiresAt).getTime() <= Date.now(),
  );
  const editable = canManage && connection.status === "active";
  const active =
    canManage &&
    connection.status === "active" &&
    policy?.enabled &&
    new Date(policy.expiresAt).getTime() > Date.now();
  const [editing, setEditing] = useState(selected && editable && !active);
  const heading = useRef<HTMLHeadingElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const noticeElement = useRef<HTMLParagraphElement>(null);
  const handledSelection = useRef(false);
  const [channels, setChannels] = useState<Channel[]>(
    policy?.channels ?? ["fax"],
  );
  const [perDispatch, setPerDispatch] = useState(
    minorToEuroInput(policy?.maxPerDispatchMinor ?? 500),
  );
  const [daily, setDaily] = useState(
    minorToEuroInput(policy?.maxDailyMinor ?? 2500),
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

  useEffect(() => {
    if (!selected) {
      handledSelection.current = false;
      return;
    }
    if (handledSelection.current) return;
    if (editable && !active) setEditing(true);
    const frame = requestAnimationFrame(() => {
      handledSelection.current = true;
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [selected, editable, active]);

  useEffect(() => {
    if (notice) noticeElement.current?.focus();
  }, [notice]);

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
    setPerDispatch(minorToEuroInput(policy?.maxPerDispatchMinor ?? 500));
    setDaily(minorToEuroInput(policy?.maxDailyMinor ?? 2500));
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
    // Same bounds as the server; a comma or a point marks the decimals.
    const perDispatchMinor = euroToMinor(perDispatch);
    const dailyMinor = euroToMinor(daily);
    if (
      perDispatchMinor === null ||
      perDispatchMinor < 1 ||
      perDispatchMinor > 10_000
    ) {
      setValidation(msg("Indiquez un plafond par envoi de 0,01 € à 100 €."));
      document.getElementById(`${id}-per-dispatch`)?.focus();
      return;
    }
    if (dailyMinor === null || dailyMinor < 1 || dailyMinor > 50_000) {
      setValidation(msg("Indiquez un plafond par jour de 0,01 € à 500 €."));
      document.getElementById(`${id}-daily`)?.focus();
      return;
    }
    if (dailyMinor < perDispatchMinor) {
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
            maxPerDispatchMinor: perDispatchMinor,
            maxDailyMinor: dailyMinor,
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
      setNotice(
        "Votre délégation a été enregistrée pour cette connexion. Revenez dans ChatGPT et dites « reprends l’envoi » pour poursuivre votre demande. Cette confirmation n’a déclenché aucun envoi.",
      );
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
          <h3 id={`${id}-title`} ref={heading} tabIndex={-1}>
            {selected
              ? msg("Connexion choisie dans ChatGPT")
              : msg("Connexion de l’assistant")}
          </h3>
          <p className="field-hint">
            {msg("Client OAuth : ")}
            <code>{connection.clientId}</code>
          </p>
        </div>
        <span className="expert-state">
          {connection.status === "revoked"
            ? msg("Connexion révoquée")
            : policy?.enabled && !canManage
              ? msg("Inactive · rôle administrateur requis")
              : active
                ? msg("Délégation active")
                : policy?.enabled
                  ? msg("Délégation expirée")
                  : msg("Désactivée")}
        </span>
      </div>
      {selected && editable && !active && (
        <p className="field-hint">
          {expired
            ? msg(
                "Cette délégation a expiré. Vérifiez ses limites et choisissez une nouvelle date pour reprendre vos envois dans ChatGPT.",
              )
            : msg(
                "Vérifiez les limites de cette connexion, puis confirmez vous-même l’activation pour poursuivre vos envois dans ChatGPT.",
              )}{" "}
          {msg("Ouvrir ce lien n’accorde aucune autorisation.")}
        </p>
      )}
      {policy && (
        <dl className="expert-summary">
          <div>
            <dt>{msg("Canaux autorisés")}</dt>
            <dd>
              {policy.channels
                .map((channel) => getChannelNames()[channel])
                .join(", ")}
            </dd>
          </div>
          <div>
            <dt>{msg("Plafond par envoi")}</dt>
            <dd>{money(policy.maxPerDispatchMinor)}</dd>
          </div>
          <div>
            <dt>{msg("Plafond journalier")}</dt>
            <dd>
              {money(policy.maxDailyMinor)} · {policy.maxDailyCount}{" "}
              {msg(" envois")}
            </dd>
          </div>
          <div>
            <dt>{msg("Expiration")}</dt>
            <dd>{date(policy.expiresAt)}</dd>
          </div>
        </dl>
      )}
      <p className="field-hint">
        {msg("Aujourd’hui (UTC) : ")}
        {connection.usage.count} {msg(" envoi")}
        {connection.usage.count === 1 ? "" : "s"} ·{" "}
        {money(connection.usage.ceilingMinor)}{" "}
        {msg(
          " de plafonds engagés par cette connexion. Les plafonds des envois acceptés restent comptés jusqu’à minuit UTC, même en cas d’annulation ou de modification de la délégation.",
        )}
      </p>
      {policy?.channels.includes("postal") && (
        <p className="field-hint">
          {msg(
            "Les préparations de courriers ont un compteur distinct, limité au même nombre par jour. Un dépôt ne constitue pas un envoi.",
          )}
        </p>
      )}
      {editable && !editing && (
        <div className="button-group">
          <button
            ref={editButton}
            type="button"
            className="button"
            onClick={startEditing}
            disabled={action.pending}
          >
            {active
              ? msg("Modifier la délégation")
              : expired
                ? msg("Renouveler la délégation")
                : msg("Configurer la délégation")}
          </button>
          {policy?.enabled && (
            <button
              type="button"
              className="button"
              onClick={() => void disable()}
              disabled={action.pending}
            >
              {action.pending
                ? msg("Désactivation…")
                : msg("Désactiver la délégation")}
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
            <legend>{msg("Canaux autorisés")}</legend>
            <div className="expert-channels">
              {(Object.keys(getChannelNames()) as Channel[]).map((channel) => (
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
                  {getChannelNames()[channel]}
                </label>
              ))}
            </div>
            <div className="expert-limits">
              <div className="field">
                <label htmlFor={`${id}-per-dispatch`}>
                  {msg("Plafond par envoi (€)")}
                </label>
                <input
                  id={`${id}-per-dispatch`}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  pattern={EURO_INPUT_PATTERN}
                  title={msg("Montant en euros, par exemple 5 ou 2,35.")}
                  required
                  value={perDispatch}
                  aria-describedby={validation ? `${id}-validation` : undefined}
                  onChange={(event) => {
                    changed();
                    setPerDispatch(event.target.value);
                  }}
                />
                <small>{msg("De 0,01 € à 100 €.")}</small>
              </div>
              <div className="field">
                <label htmlFor={`${id}-daily`}>
                  {msg("Plafond par jour (€)")}
                </label>
                <input
                  id={`${id}-daily`}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  pattern={EURO_INPUT_PATTERN}
                  title={msg("Montant en euros, par exemple 25 ou 12,50.")}
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
                <small>
                  {msg("De 0,01 € à 500 €, au moins le plafond par envoi.")}
                </small>
              </div>
              <div className="field">
                <label htmlFor={`${id}-count`}>
                  {msg("Nombre maximal d’envois par jour")}
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
                  {msg("Expiration de la délégation")}
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
                  {msg("Heure locale de cet appareil. Dans 30 jours au plus.")}
                </small>
              </div>
            </div>
            <p className="field-hint">
              {msg(
                "Les limites journalières se renouvellent à minuit UTC. Elles portent sur le nombre d’envois et leurs plafonds, même si le décompte final est inférieur. Le crédit et les autorisations des canaux restent nécessaires.",
              )}
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
                  {msg(
                    "J’autorise aussi cet assistant à transmettre le PDF à notre prestataire d’impression pour obtenir le devis postal, sans expédition à cette étape, puis à approuver l’envoi dans la conversation.",
                  )}
                </span>
              </label>
            )}
            <p className="expert-warning">
              {msg(
                "Ce mandat permet à l’assistant d’approuver dans la conversation, sans retour sur le site pour chaque envoi. Il ne constitue pas une preuve de votre accord humain à chaque appel. Les règles de ChatGPT, Claude ou de votre autre assistant restent applicables. Un accès compromis à cette connexion pourrait déclencher des envois dans ces limites.",
              )}
            </p>
            <label className="checkbox-label expert-agreement">
              <input
                type="checkbox"
                required
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              <span>
                {msg(
                  "J’autorise la délégation d’approbation à cet assistant, pour les canaux, limites et durée indiqués. Je peux la désactiver pour les nouveaux envois ; ceux déjà acceptés restent inchangés.",
                )}
              </span>
            </label>
            <p
              id={`${id}-validation`}
              className="expert-validation"
              aria-live="polite"
            >
              {msg(validation)}
            </p>
            <div className="button-group">
              <button type="submit" className="button primary">
                {action.pending
                  ? msg("Enregistrement…")
                  : active
                    ? msg("Confirmer la modification")
                    : expired
                      ? msg("Confirmer le renouvellement")
                      : msg("Confirmer l’activation")}
              </button>
              <button
                type="button"
                className="button"
                onClick={() => {
                  changed();
                  setEditing(false);
                  requestAnimationFrame(() => editButton.current?.focus());
                }}
              >
                {msg("Annuler")}
              </button>
            </div>
          </fieldset>
        </form>
      )}
      <ErrorNotice error={action.error} />
      <p className="field-hint" role="status" tabIndex={-1} ref={noticeElement}>
        {msg(notice)}
      </p>
    </article>
  );
}

export function ExpertApproval() {
  const selectedConnection = new URLSearchParams(
    window.location.hash.split("?")[1] ?? "",
  ).get("connection");
  const resource = useResource<ExpertApprovalSettings>(
    isPublicPreview ? null : "/account/expert-approval",
  );
  const unavailableNotice = useRef<HTMLParagraphElement>(null);
  const unavailable = Boolean(
    selectedConnection !== null &&
    resource.data &&
    !resource.data.connections.some(
      (connection) => connection.connectionId === selectedConnection,
    ),
  );
  useEffect(() => {
    if (unavailable) unavailableNotice.current?.focus();
  }, [unavailable, selectedConnection]);
  return (
    <section
      className="form-panel expert-settings"
      aria-labelledby="expert-approval-title"
    >
      <div className="expert-heading">
        <div>
          <p className="eyebrow">
            {msg("Option personnelle · désactivée par défaut")}
          </p>
          <h2 id="expert-approval-title">{msg("Mode expert")}</h2>
        </div>
        {!isPublicPreview && (
          <RefreshButton
            onClick={resource.refresh}
            disabled={resource.loading}
          />
        )}
      </div>
      <p>
        {msg(
          "Confiez à un assistant connecté l’approbation de vos envois, dans les limites que vous choisissez. Sans cette délégation, vous continuez à approuver chaque envoi sur le site.",
        )}
      </p>
      {isPublicPreview ? (
        <p className="notice info">
          {msg(
            "Aucune délégation n’est active dans cet aperçu. Dans votre compte, vous pourrez choisir une connexion d’assistant, ses canaux, ses plafonds et sa date d’expiration.",
          )}
        </p>
      ) : (
        <>
          <ErrorNotice error={resource.error} retry={resource.refresh} />
          {resource.loading && !resource.data && <Loading />}
          {resource.data && (
            <>
              {unavailable && (
                <p
                  className="notice info"
                  role="status"
                  tabIndex={-1}
                  ref={unavailableNotice}
                >
                  {msg(
                    "Cette connexion n’est pas disponible dans votre compte. Aucune autorisation n’a été modifiée. Choisissez l’une de vos connexions ci-dessous ou reconnectez votre assistant depuis ChatGPT.",
                  )}
                </p>
              )}
              {!resource.data.canManage && (
                <p className="notice info">
                  {msg(
                    "Seul un administrateur peut gérer la délégation de ses propres connexions. Vos autorisations sont affichées en lecture seule.",
                  )}
                </p>
              )}
              {resource.data.connections.length === 0 ? (
                <p className="empty-inline">
                  {msg("Vous n’avez pas encore de connexion d’assistant.")}{" "}
                  <a href="#/app/connection">{msg("Connecter un assistant")}</a>
                </p>
              ) : (
                resource.data.connections.map((connection) => (
                  <ConnectionSettings
                    key={`${connection.connectionId}:${connection.connectionId === selectedConnection}`}
                    connection={connection}
                    canManage={resource.data!.canManage}
                    selected={connection.connectionId === selectedConnection}
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
