import { msg } from "./messages";
import { useDashboardAppearance } from "./dashboard-appearance";
import { DashboardArtwork } from "./dashboard-artwork";
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
  DateTimezone,
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
import { t } from "./locale";
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
  const { appearance } = useDashboardAppearance();
  const connections = useAssistantConnections();
  const { direct, chooseDirect } = useDirectChoice(session);
  if (direct) return null;
  if (connections.loading && !connections.data)
    return (
      <p className="assistant-overview-status" role="status">
        {msg("Loading your assistants…")}
      </p>
    );
  if (connections.error)
    return (
      <aside className="assistant-overview-status">
        <p>{msg("Unable to check your assistants.")}</p>
        <a href="#/app/connection">{msg("View my connections")}</a>
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
            ? msg("An exchange with your assistant has been confirmed.")
            : msg(
                "Your authorisation is saved. Finish the check in your assistant.",
              )}
        </p>
        <a className="text-link" href="#/app/connection">
          {verified
            ? msg("Manage my assistants")
            : msg("Finish connecting")}
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
            {msg("Start in your usual assistant.")}
          </h2>
          <p>
            {msg(
              "Connect it to Guteneo to prepare your documents and find your dispatches here.",
            )}
          </p>
        </div>
        <a
          className={appearance === "v2" ? "button" : "button primary"}
          href="#/app/connection"
        >
          {msg("Use my assistant ")}
          <ArrowRight size={18} aria-hidden="true" />
        </a>
      </div>
      <div className="assistant-welcome-direct">
        <p>{msg("You can also prepare your dispatch directly.")}</p>
        <a
          className="text-link"
          href="#/app/prepare?entry=direct"
          onClick={() => chooseDirect(true)}
        >
          {msg("Send from Guteneo ")}
          <ArrowRight size={17} aria-hidden="true" />
        </a>
      </div>
      <AssistantPicker
        basePath="#/app/connection/"
        label={msg("Choose an assistant to get started")}
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
        <h2 id="assistant-connections-title">{msg("My connections")}</h2>
        <button
          className="text-button"
          type="button"
          disabled={connections.loading}
          onClick={connections.refresh}
        >
          <ArrowClockwise size={17} aria-hidden="true" />
          {msg("Refresh")}
        </button>
      </div>
      <p>
        {msg(
          "After your first request in the assistant, return here to find the latest confirmed exchange.",
        )}
      </p>
      {isPublicPreview && (
        <p className="notice info">
          {msg(
            "Demo: no real connection is created or verified in this preview.",
          )}
        </p>
      )}
      <ErrorNotice
        error={connections.error ?? action.error}
        retry={connections.refresh}
      />
      {hasConnections && <DateTimezone />}
      {connections.loading && !connections.data ? (
        <Loading />
      ) : connections.error ? (
        <p role="status">
          {msg(
            "Unable to check your connections. Try again with Refresh.",
          )}
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
                  <h3>
                    {connection.display_name || msg("Authorised assistant")}
                  </h3>
                  <p className={verified ? "assistant-verified" : undefined}>
                    {verified && <CheckCircle size={18} aria-hidden="true" />}
                    {connection.status !== "active"
                      ? msg("Authorisation revoked")
                      : verified
                        ? msg("Connection verified")
                        : msg(
                            "Authorisation active · First exchange to be checked",
                          )}
                  </p>
                  {verified ? (
                    <p className="field-hint">
                      {msg("Last successful exchange:")}{" "}
                      {date(connection.last_successful_tool_at!)}
                      {msg(
                        ". Preparation and sending remain subject to their checks.",
                      )}
                    </p>
                  ) : connection.status === "active" ? (
                    <p className="field-hint">
                      {msg(
                        "Open your assistant with Guteneo enabled and use the guide’s verification prompt.",
                      )}
                    </p>
                  ) : null}
                  <details className="assistant-connection-reference">
                    <summary>{msg("Connection reference")}</summary>
                    <code>{connection.client_id}</code>
                    <p className="field-hint">
                      {msg("Authorisation created on ")}
                      {date(connection.created_at)}.
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
          {msg(
            "No assistants authorised for this account. Choose a guide to get started, or send directly from Guteneo.",
          )}
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
            {msg("All assistants")}
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
          <div className="dashboard-editorial-heading dashboard-editorial-heading-horizon">
            <PageHeading
              title={msg("Your assistants, your correspondence.")}
              intro={msg(
                "Connect your assistant to Guteneo via MCP, then find your connections here. Each guide walks you through without waiting for a published plugin.",
              )}
            />
            <DashboardArtwork scene="horizon" />
          </div>
          {assistantId && (
            <p className="notice info">
              {msg(
                "This guide does not exist. Choose an assistant below.",
              )}
            </p>
          )}
          {hasConnections && connectionList}
          <section
            className="assistant-selection"
            aria-labelledby="assistant-selection-title"
          >
            <h2 id="assistant-selection-title">
              {hasConnections
                ? msg("Add an assistant")
                : msg("Which assistant do you use?")}
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
          <h2 id="workspace-direct-title">
            {msg("You can also send directly.")}
          </h2>
          <p>
            {msg(
              "One document, one recipient, one check: your Guteneo workspace works without an assistant.",
            )}
          </p>
        </div>
        <a
          className="button"
          href="#/app/prepare?entry=direct"
          onClick={() => chooseDirect(true)}
        >
          {msg("Send from Guteneo ")}
          <ArrowRight size={18} aria-hidden="true" />
        </a>
        {direct && (
          <p className="assistant-preference">
            {msg("The getting-started invitation is hidden in this browser.")}{" "}
            <button
              type="button"
              className="text-button"
              onClick={() => chooseDirect(false)}
            >
              {msg("Show the invitation again")}
            </button>
          </p>
        )}
      </section>
      <details className="assistant-permissions">
        <summary>{msg("What you authorise")}</summary>
        <p>{t.connection.scopeBody}</p>
        <p>{t.connection.permissions}</p>
        <a href="#/app/account">{msg("Manage my account preferences")}</a>
      </details>
      <details className="technical-details assistant-advanced">
        <summary>{msg("Advanced configuration")}</summary>
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
          {bindingNotice && <p role="status">{msg(bindingNotice)}</p>}
        </form>
        {!isPublicPreview && (
          <p>
            <a href="/integrations/guteneo-plugin.zip" download>
              {msg("Download the plugin package (manual installation)")}
            </a>{" "}
            · <a href="/developers/">{msg("Developer documentation")}</a>
          </p>
        )}
      </details>
      <details
        className="technical-details assistant-advanced"
        onToggle={(event) => setDiagnosticsOpen(event.currentTarget.open)}
      >
        <summary>{msg("Service status")}</summary>
        {diagnosticsOpen && <ConnectionDiagnostics />}
      </details>
    </div>
  );
}
