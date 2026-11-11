import { useState, type FormEvent } from "react";
import { api, isPublicPreview } from "./api";
import {
  ConfirmAction,
  ErrorNotice,
  Field,
  useAction,
  useResource,
} from "./components";
import { useCurrentClientView } from "./client-write-recovery";
import { msg } from "./messages";

type WebhookEndpoint = {
  id: string;
  url: string;
  enabled: boolean;
  created_at: string;
  recent: {
    id: string;
    status: string;
    state: "pending" | "delivered" | "abandoned";
    attempts: number;
    last_response: number | null;
    occurred_at: string;
  }[];
};

/**
 * Administrators register HTTPS addresses that receive a signed notice when a
 * dispatch changes status. A signing secret is shown once, after adding an
 * address or asking for a new one; it is never stored or shown again.
 */
export function WebhookSettings() {
  const resource = useResource<{
    available: boolean;
    endpoints: WebhookEndpoint[];
  }>("/admin/webhooks");
  const action = useAction();
  const currentView = useCurrentClientView("administration-webhooks");
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState<{ url: string; value: string }>();
  const available = !!resource.data?.available && !isPublicPreview;
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const isCurrent = currentView();
    await action.run(async () => {
      const created = await api<{
        endpoint: WebhookEndpoint;
        secret: string;
      }>("/admin/webhooks", { method: "POST", body: { url } });
      if (!isCurrent()) return;
      setSecret({ url: created.endpoint.url, value: created.secret });
      setUrl("");
      resource.refresh();
    });
  }
  async function change(
    endpoint: WebhookEndpoint,
    path: string,
    body: Record<string, unknown>,
    method = "POST",
  ) {
    const isCurrent = currentView();
    await action.run(async () => {
      const result = await api<{ secret?: string }>(
        `/admin/webhooks/${encodeURIComponent(endpoint.id)}${path}`,
        { method, body },
      );
      if (!isCurrent()) return;
      setSecret(
        result.secret ? { url: endpoint.url, value: result.secret } : undefined,
      );
      resource.refresh();
    });
  }
  const lastState = (endpoint: WebhookEndpoint) => {
    const last = endpoint.recent[0];
    if (!last) return msg("No notice sent yet");
    if (last.state === "delivered") return msg("Last notice delivered");
    if (last.state === "abandoned") return msg("Last notice abandoned");
    return msg("Last notice being retried");
  };
  return (
    <section
      className="form-panel administration-webhooks"
      aria-labelledby="administration-webhooks-title"
    >
      <h2 id="administration-webhooks-title">{msg("Webhooks")}</h2>
      <p className="field-hint">
        {msg(
          "Each status change of a dispatch is sent, signed, to these addresses. Notices name the dispatch, its channel and status only: never a recipient or content.",
        )}
      </p>
      <ErrorNotice
        error={action.error ?? resource.error}
        retry={resource.refresh}
      />
      {resource.data && !available && (
        <p className="field-hint">
          {msg("Webhooks are not configured on this server.")}
        </p>
      )}
      {secret && (
        <div className="notice info" role="status">
          <p>
            {msg(
              "Signing secret for {0}. Copy it now: it is not shown again.",
              secret.url,
            )}
          </p>
          <code className="webhook-secret">{secret.value}</code>
        </div>
      )}
      {resource.data?.endpoints.map((endpoint) => (
        <div className="webhook-endpoint" key={endpoint.id}>
          <div>
            <strong>{endpoint.url}</strong>
            <small>
              {endpoint.enabled ? msg("Active") : msg("Paused")} ·{" "}
              {lastState(endpoint)}
            </small>
          </div>
          {available && (
            <div className="button-group">
              <button
                type="button"
                className="button small"
                disabled={action.pending}
                onClick={() =>
                  void change(endpoint, "/enabled", {
                    enabled: !endpoint.enabled,
                  })
                }
              >
                {endpoint.enabled ? msg("Pause") : msg("Resume")}
              </button>
              <ConfirmAction
                disabled={action.pending}
                label={msg("New secret")}
                question={msg(
                  "Replace the signing secret? The current one stops working at once.",
                )}
                confirmLabel={msg("Replace")}
                onConfirm={() => void change(endpoint, "/rotate", {})}
              />
              <ConfirmAction
                disabled={action.pending}
                label={msg("Remove")}
                question={msg(
                  "Remove this address? Pending notices for it are dropped.",
                )}
                confirmLabel={msg("Remove")}
                onConfirm={() => void change(endpoint, "", {}, "DELETE")}
              />
            </div>
          )}
        </div>
      ))}
      {available && (
        <form className="webhook-form" onSubmit={(event) => void add(event)}>
          <Field label={msg("HTTPS address")}>
            <input
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://"
              value={url}
              maxLength={500}
              onChange={(event) => setUrl(event.target.value)}
              required
            />
          </Field>
          <button className="button" disabled={action.pending}>
            {msg("Add the address")}
          </button>
        </form>
      )}
    </section>
  );
}
