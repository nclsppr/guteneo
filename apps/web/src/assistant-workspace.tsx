import { useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowClockwise,
  CheckCircle,
  PlugsConnected,
} from "@phosphor-icons/react";
import { api, date, isPublicPreview, type Session } from "./api";
import {
  ConfirmAction,
  ErrorNotice,
  Field,
  Loading,
  PageHeading,
  useAction,
  useResource,
} from "./components";
import { Diagnostics } from "./workspace-pages";
import { AssistantGuide, AssistantPicker } from "./assistant-guides";
import { getAssistant } from "./assistant-catalog";
import { useAssistantConnections, useDirectChoice } from "./assistant-state";
import { fr as t } from "./i18n";
import "./assistant-workspace.css";

function ConnectionDiagnostics() {
  const resource = useResource<Record<string, unknown>>("/capabilities");
  return (
    <>
      <ErrorNotice error={resource.error} retry={resource.refresh} />
      {resource.loading && !resource.data ? (
        <Loading />
      ) : (
        <Diagnostics value={resource.data} />
      )}
    </>
  );
}

export function OverviewAssistantStart({ session }: { session: Session }) {
  const connections = useAssistantConnections();
  const { direct, chooseDirect } = useDirectChoice(session);
  if (direct) return null;
  if (connections.loading && !connections.data)
    return (
      <p className="assistant-overview-status" role="status">
        Chargement de vos assistants…
      </p>
    );
  if (connections.error)
    return (
      <aside className="assistant-overview-status">
        <p>Impossible de vérifier vos assistants.</p>
        <a href="#/app/connection">Consulter mes connexions</a>
      </aside>
    );
  const active =
    connections.data?.items.filter((item) => item.status === "active") ?? [];
  if (active.length) {
    const verified = active.some(
      (item) =>
        item.verification === "verified" && item.last_successful_tool_at,
    );
    return (
      <aside className="assistant-overview-status">
        <PlugsConnected size={22} aria-hidden="true" />
        <p>
          {verified
            ? "Un échange avec votre assistant a été confirmé."
            : "Votre autorisation est enregistrée. Terminez la vérification dans votre assistant."}
        </p>
        <a className="text-link" href="#/app/connection">
          {verified ? "Gérer mes assistants" : "Terminer la connexion"}
          <ArrowRight size={17} aria-hidden="true" />
        </a>
      </aside>
    );
  }
  return (
    <section
      className="assistant-welcome"
      aria-labelledby="assistant-welcome-title"
    >
      <div className="assistant-welcome-heading">
        <div>
          <h2 id="assistant-welcome-title">
            Commencez dans votre assistant habituel.
          </h2>
          <p>
            Connectez-le à Guteneo pour préparer vos documents et retrouver vos
            envois ici.
          </p>
        </div>
        <a className="button primary" href="#/app/connection">
          Utiliser mon assistant <ArrowRight size={18} aria-hidden="true" />
        </a>
      </div>
      <div className="assistant-welcome-direct">
        <p>Vous pouvez aussi préparer votre envoi directement.</p>
        <a
          className="text-link"
          href="#/app/prepare?entry=direct"
          onClick={() => chooseDirect(true)}
        >
          Envoyer depuis Guteneo <ArrowRight size={17} aria-hidden="true" />
        </a>
      </div>
      <AssistantPicker
        basePath="#/app/connection/"
        label="Choisir un assistant pour commencer"
      />
    </section>
  );
}

export function Connection({
  session,
  assistantId,
}: {
  session: Session;
  assistantId?: string;
}) {
  const connections = useAssistantConnections();
  const { direct, chooseDirect } = useDirectChoice(session);
  const action = useAction();
  const [clientId, setClientId] = useState("");
  const [bindingNotice, setBindingNotice] = useState("");
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const assistant = getAssistant(assistantId);
  async function revoke(id: string) {
    await action.run(async () => {
      await api(`/connections/${encodeURIComponent(id)}`, { method: "DELETE" });
      connections.refresh();
    });
  }
  async function bind(event: FormEvent) {
    event.preventDefault();
    await action.run(async () => {
      await api("/connections", { method: "POST", body: { clientId } });
      setBindingNotice(t.connection.rebound);
      connections.refresh();
    });
  }
  const items = connections.data?.items ?? [];
  const hasConnections = items.length > 0;
  const connectionList = (
    <section
      className="assistant-connections"
      aria-labelledby="assistant-connections-title"
    >
      <div className="section-toolbar">
        <h2 id="assistant-connections-title">Mes connexions</h2>
        <button
          className="text-button"
          type="button"
          disabled={connections.loading}
          onClick={connections.refresh}
        >
          <ArrowClockwise size={17} aria-hidden="true" />
          Actualiser
        </button>
      </div>
      <p>
        Après votre première demande dans l’assistant, revenez ici pour
        retrouver le dernier échange confirmé.
      </p>
      {isPublicPreview && (
        <p className="notice info">
          Démonstration : aucune connexion réelle n’est créée ou vérifiée dans
          cet aperçu.
        </p>
      )}
      <ErrorNotice
        error={connections.error ?? action.error}
        retry={connections.refresh}
      />
      {connections.loading && !connections.data ? (
        <Loading />
      ) : connections.error ? (
        <p role="status">
          Impossible de vérifier vos connexions. Réessayez avec « Actualiser ».
        </p>
      ) : hasConnections ? (
        <ul className="assistant-connection-list">
          {items.map((connection) => {
            const verified =
              connection.status === "active" &&
              connection.verification === "verified" &&
              !!connection.last_successful_tool_at;
            return (
              <li key={connection.id}>
                <div className="assistant-connection-description">
                  <h3>{connection.display_name || "Assistant autorisé"}</h3>
                  <p className={verified ? "assistant-verified" : undefined}>
                    {verified && <CheckCircle size={18} aria-hidden="true" />}
                    {connection.status !== "active"
                      ? "Autorisation révoquée"
                      : verified
                        ? "Connexion vérifiée"
                        : "Autorisation active · Premier échange à vérifier"}
                  </p>
                  {verified ? (
                    <p className="field-hint">
                      Dernier échange réussi :{" "}
                      {date(connection.last_successful_tool_at!)}. La
                      préparation et l’envoi restent soumis à leurs
                      vérifications.
                    </p>
                  ) : connection.status === "active" ? (
                    <p className="field-hint">
                      Ouvrez votre assistant avec Guteneo activé et utilisez la
                      demande de vérification du guide.
                    </p>
                  ) : null}
                  <details className="assistant-connection-reference">
                    <summary>Référence de la connexion</summary>
                    <code>{connection.client_id}</code>
                    <p className="field-hint">
                      Autorisation créée le {date(connection.created_at)}.
                    </p>
                  </details>
                </div>
                {connection.status === "active" && (
                  <ConfirmAction
                    className="text-button"
                    disabled={action.pending || isPublicPreview}
                    label={t.connection.revoke}
                    question={t.connection.revokeQuestion}
                    confirmLabel={t.connection.revokeConfirm}
                    onConfirm={() => void revoke(connection.id)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="assistant-no-connections">
          Aucun assistant autorisé pour ce compte. Choisissez un guide pour
          commencer, ou envoyez directement depuis Guteneo.
        </p>
      )}
    </section>
  );
  return (
    <div className="assistant-workspace">
      {assistant ? (
        <>
          <a className="back-link" href="#/app/connection">
            <ArrowLeft size={18} aria-hidden="true" />
            Tous les assistants
          </a>
          <AssistantGuide
            key={assistant.id}
            assistantId={assistant.id}
            inDashboard
          />
          {connectionList}
        </>
      ) : (
        <>
          <PageHeading
            title="Vos assistants, votre correspondance."
            intro="Connectez votre assistant à Guteneo par MCP, puis retrouvez vos connexions ici. Chaque guide vous accompagne sans attendre un plugin publié."
          />
          {assistantId && (
            <p className="notice info">
              Ce guide n’existe pas. Choisissez un assistant ci-dessous.
            </p>
          )}
          {hasConnections && connectionList}
          <section
            className="assistant-selection"
            aria-labelledby="assistant-selection-title"
          >
            <h2 id="assistant-selection-title">
              {hasConnections
                ? "Ajouter un assistant"
                : "Quel assistant utilisez-vous ?"}
            </h2>
            <AssistantPicker basePath="#/app/connection/" />
          </section>
          {!hasConnections && connectionList}
        </>
      )}
      <section
        className="assistant-direct-route"
        aria-labelledby="workspace-direct-title"
      >
        <div>
          <h2 id="workspace-direct-title">Envoyez aussi directement.</h2>
          <p>
            Un document, un destinataire, une vérification : votre espace
            Guteneo fonctionne sans assistant.
          </p>
        </div>
        <a
          className="button"
          href="#/app/prepare?entry=direct"
          onClick={() => chooseDirect(true)}
        >
          Envoyer depuis Guteneo <ArrowRight size={18} aria-hidden="true" />
        </a>
        {direct && (
          <p className="assistant-preference">
            L’invitation de démarrage est masquée sur ce navigateur.{" "}
            <button
              type="button"
              className="text-button"
              onClick={() => chooseDirect(false)}
            >
              Réafficher l’invitation
            </button>
          </p>
        )}
      </section>
      <details className="assistant-permissions">
        <summary>Ce que vous autorisez</summary>
        <p>{t.connection.scopeBody}</p>
        <p>{t.connection.permissions}</p>
        <a href="#/app/account">Gérer les préférences de mon compte</a>
      </details>
      <details className="technical-details assistant-advanced">
        <summary>Configuration avancée</summary>
        <form onSubmit={(event) => void bind(event)}>
          <h3>{t.connection.bind}</h3>
          <p>{t.connection.bindHelp}</p>
          <Field label={t.connection.clientId}>
            <input
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              required
              maxLength={200}
            />
          </Field>
          <button
            className="button"
            disabled={action.pending || isPublicPreview}
          >
            {t.connection.bind}
          </button>
          {bindingNotice && <p role="status">{bindingNotice}</p>}
        </form>
        {!isPublicPreview && (
          <p>
            <a href="/integrations/guteneo-plugin.zip" download>
              Télécharger le paquet du plugin (installation manuelle)
            </a>{" "}
            · <a href="/developpeurs/">Documentation développeurs</a>
          </p>
        )}
      </details>
      <details
        className="technical-details assistant-advanced"
        onToggle={(event) => setDiagnosticsOpen(event.currentTarget.open)}
      >
        <summary>État du service</summary>
        {diagnosticsOpen && <ConnectionDiagnostics />}
      </details>
    </div>
  );
}
