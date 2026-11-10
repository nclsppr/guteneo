import { Field } from "./components";
import { useEffect, useRef, useState } from "react";
import type {
  CustomerWebhookCapabilities,
  CustomerWebhookDelivery,
  CustomerWebhookDeliveryStatus,
  CustomerWebhookEndpoint,
} from "../../../packages/contracts/src/customer-webhooks";
import { api, date, type Page } from "./api";
import { DataTable, tableTimestamp } from "./data-table";
import {
  EmptyState,
  ErrorNotice,
  Loading,
  LoadMore,
  PageHeading,
  useAction,
  useRefreshOnFocus,
  useResource,
} from "./components";
import { msg } from "./messages";
import { t } from "./locale";
import {
  isAuthorityRefusal as authorityRefused,
  observeAuthorityRefusal as authorityAware,
} from "./client-authority-refusal";
import "./lifecycle-pages.css";

type Configuration = {
  items: CustomerWebhookEndpoint[];
  capabilities: CustomerWebhookCapabilities;
};
type SecretResult = {
  endpoint: CustomerWebhookEndpoint;
  signingSecret: string | null;
};
type Refuse = (error: Error) => void;

export function CustomerWebhooksPage() {
  const config = useResource<Configuration>("/customer-webhooks");
  useRefreshOnFocus(config.refresh);
  const [secret, setSecret] = useState<SecretResult | null>(null);
  const [deliveriesId, setDeliveriesId] = useState("");
  const [refusal, setRefusal] = useState<Error>();
  const denied =
    refusal ?? (authorityRefused(config.error) ? config.error : undefined);
  useEffect(() => {
    if (denied) {
      setSecret(null);
      setDeliveriesId("");
    }
  }, [denied]);
  if (denied)
    return (
      <>
        <PageHeading title={msg("Customer webhooks")} />
        <ErrorNotice error={denied} />
        <button
          type="button"
          className="button subtle"
          onClick={() => window.location.reload()}
        >
          {msg("Reload")}
        </button>
      </>
    );
  return (
    <>
      <PageHeading
        title={msg("Customer webhooks")}
        intro={msg(
          "Notifications contain identifiers and states, never the document or recipient.",
        )}
        action={
          <button
            type="button"
            className="button subtle"
            onClick={config.refresh}
            disabled={config.loading}
          >
            {msg("Refresh")}
          </button>
        }
      />
      <ErrorNotice error={config.error} retry={config.refresh} />
      {!config.data && config.loading && <Loading />}
      {config.data && (
        <>
          {!config.data.capabilities.enabled && (
            <p className="notice info">
              {msg(
                "Webhook delivery is not enabled. Existing endpoints stay visible; enabling an endpoint requires operational configuration.",
              )}
            </p>
          )}
          {secret?.signingSecret && (
            <section
              className="notice lifecycle-secret"
              role="status"
              aria-label={msg("Signing secret")}
            >
              <strong>{msg("This secret is shown only once.")}</strong>
              <Field label={msg("Signing secret")}>
                <input
                  value={secret.signingSecret}
                  readOnly
                  autoComplete="off"
                  spellCheck={false}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </Field>
              <button
                type="button"
                className="button subtle"
                onClick={() => setSecret(null)}
              >
                {msg("Dismiss secret")}
              </button>
            </section>
          )}
          {secret && !secret.signingSecret && (
            <p className="notice info">
              {msg(
                "This endpoint already exists. Replace its signing secret if the first response was lost.",
              )}
            </p>
          )}
          {!config.data.items.length && (
            <EmptyState title={msg("No configured webhooks.")} />
          )}
          {config.data.items.map((endpoint) => (
            <EndpointEditor
              key={`${endpoint.id}:${endpoint.revision}`}
              endpoint={endpoint}
              canEnable={config.data!.capabilities.enabled}
              onSaved={config.refresh}
              onSecret={setSecret}
              onRefusal={setRefusal}
              onDeliveries={() => setDeliveriesId(endpoint.id)}
            />
          ))}
          {config.data.capabilities.configured ? (
            <NewEndpoint
              onRefusal={setRefusal}
              disabled={
                config.data.items.filter((item) => item.status === "active")
                  .length >= config.data.capabilities.endpointLimit
              }
              onSaved={(result) => {
                setSecret(result);
                config.refresh();
              }}
            />
          ) : (
            <p className="notice info">
              {msg("Webhook configuration is unavailable.")}
            </p>
          )}
          <p className="field-hint">
            {msg(
              "New endpoints are paused. Save the signing secret in your receiving service before enabling delivery. Changes to the address or secret pause delivery again.",
            )}
          </p>
          {deliveriesId && (
            <DeliveryHistory
              key={deliveriesId}
              id={deliveriesId}
              onRefusal={setRefusal}
            />
          )}
        </>
      )}
    </>
  );
}

function NewEndpoint({
  disabled,
  onSaved,
  onRefusal,
}: {
  disabled: boolean;
  onSaved: (result: SecretResult) => void;
  onRefusal: Refuse;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const action = useAction("new-webhook");
  const request = useRef<{ body: string; key: string } | undefined>(undefined);
  return (
    <section className="form-panel panel lifecycle-form">
      <h2>{msg("New endpoint")}</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(async (view) => {
            const body = { name, url, revealSigningSecret: true },
              serialized = JSON.stringify(body);
            if (request.current?.body !== serialized)
              request.current = { body: serialized, key: crypto.randomUUID() };
            const result = await view.wait(
              authorityAware(
                api<SecretResult>("/customer-webhooks", {
                  method: "POST",
                  key: request.current.key,
                  body,
                }),
                view,
                onRefusal,
              ),
              (receipt) => ({
                kind: "webhook_saved",
                resourceId: receipt.endpoint.id,
                route: "/app/administration/webhooks",
              }),
            );
            setName("");
            setUrl("");
            request.current = undefined;
            onSaved(result);
          });
        }}
      >
        <fieldset disabled={disabled || action.pending}>
          <Field label={msg("Endpoint name")}>
            <input
              value={name}
              required
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              autoComplete="off"
            />
          </Field>
          <Field label={msg("HTTPS endpoint")}>
            <input
              type="url"
              value={url}
              required
              maxLength={2048}
              pattern="https://.*"
              onChange={(event) => setUrl(event.target.value)}
              autoComplete="off"
            />
          </Field>
          <button type="submit" className="button">
            {action.pending
              ? t.loading
              : msg("Create endpoint and show signing secret")}
          </button>
        </fieldset>
        <ErrorNotice error={action.error} />
      </form>
    </section>
  );
}

function EndpointEditor({
  endpoint,
  canEnable,
  onSaved,
  onSecret,
  onDeliveries,
  onRefusal,
}: {
  endpoint: CustomerWebhookEndpoint;
  canEnable: boolean;
  onSaved: () => void;
  onSecret: (value: SecretResult | null) => void;
  onDeliveries: () => void;
  onRefusal: Refuse;
}) {
  const [name, setName] = useState(endpoint.name),
    [url, setUrl] = useState(endpoint.url);
  const action = useAction(`${endpoint.id}:${endpoint.revision}`);
  const update = (body: { name?: string; url?: string; enabled?: boolean }) =>
    void action.run(async (view) => {
      await view.wait(
        authorityAware(
          api<CustomerWebhookEndpoint>(`/customer-webhooks/${endpoint.id}`, {
            method: "PATCH",
            body: { revision: endpoint.revision, ...body },
          }),
          view,
          onRefusal,
        ),
        (result) => ({
          kind: "webhook_saved",
          resourceId: result.id,
          route: "/app/administration/webhooks",
        }),
      );
      onSaved();
    });
  return (
    <section className="form-panel panel lifecycle-endpoint">
      <h2>{endpoint.name}</h2>
      <p className="lifecycle-endpoint-url">{endpoint.url}</p>
      <p>
        {endpoint.status === "revoked"
          ? msg("Endpoint revoked")
          : endpoint.enabled
            ? msg("Endpoint enabled")
            : msg("Endpoint paused")}
      </p>
      {endpoint.overflowCount > 0 && (
        <p className="notice warning">
          {msg(
            "The pending notification limit was reached. Some events were omitted. Reconcile dispatch tracking before relying on this stream.",
          )}{" "}
          ({endpoint.overflowCount})
        </p>
      )}
      {endpoint.status === "active" && (
        <>
          <details>
            <summary>{msg("Edit endpoint")}</summary>
            <form
              className="lifecycle-form"
              onSubmit={(event) => {
                event.preventDefault();
                update({ name, url });
              }}
            >
              <fieldset disabled={action.pending}>
                <Field label={msg("Endpoint name")}>
                  <input
                    value={name}
                    required
                    maxLength={80}
                    autoComplete="off"
                    onChange={(event) => setName(event.target.value)}
                  />
                </Field>
                <Field label={msg("HTTPS endpoint")}>
                  <input
                    type="url"
                    value={url}
                    required
                    pattern="https://.*"
                    maxLength={2048}
                    autoComplete="off"
                    onChange={(event) => setUrl(event.target.value)}
                  />
                </Field>
                <button className="button" type="submit">
                  {msg("Save endpoint")}
                </button>
              </fieldset>
            </form>
          </details>
          <div className="actions">
            <button
              className="button subtle"
              type="button"
              disabled={action.pending || (!endpoint.enabled && !canEnable)}
              onClick={() => update({ enabled: !endpoint.enabled })}
            >
              {endpoint.enabled
                ? msg("Pause endpoint")
                : msg("Enable endpoint")}
            </button>
            <button
              className="button subtle"
              type="button"
              disabled={action.pending}
              onClick={() => {
                if (
                  !window.confirm(
                    msg(
                      "Replace the signing secret? This pauses delivery and invalidates the previous secret.",
                    ),
                  )
                )
                  return;
                void action.run(async (view) => {
                  const result = await view.wait(
                    authorityAware(
                      api<SecretResult>(
                        `/customer-webhooks/${endpoint.id}/rotate-secret`,
                        {
                          method: "POST",
                          body: {
                            revision: endpoint.revision,
                            revealSigningSecret: true,
                          },
                        },
                      ),
                      view,
                      onRefusal,
                    ),
                    (receipt) => ({
                      kind: "updated",
                      resourceId: receipt.endpoint.id,
                      route: "/app/administration/webhooks",
                    }),
                  );
                  onSecret(result);
                  onSaved();
                });
              }}
            >
              {msg("Replace and show signing secret")}
            </button>
            <button
              className="button danger"
              type="button"
              disabled={action.pending}
              onClick={() => {
                if (
                  !window.confirm(
                    msg("Revoke this endpoint and destroy its signing secret?"),
                  )
                )
                  return;
                void action.run(async (view) => {
                  await view.wait(
                    authorityAware(
                      api<CustomerWebhookEndpoint>(
                        `/customer-webhooks/${endpoint.id}/revoke`,
                        {
                          method: "POST",
                          body: { revision: endpoint.revision },
                        },
                      ),
                      view,
                      onRefusal,
                    ),
                    (receipt) => ({
                      kind: "updated",
                      resourceId: receipt.id,
                      route: "/app/administration/webhooks",
                    }),
                  );
                  onSecret(null);
                  onSaved();
                });
              }}
            >
              {msg("Revoke endpoint")}
            </button>
          </div>
        </>
      )}
      <button type="button" className="button subtle" onClick={onDeliveries}>
        {msg("Webhook deliveries")}
      </button>
      <ErrorNotice error={action.error} retry={onSaved} />
    </section>
  );
}

function deliveryLabel(status: CustomerWebhookDeliveryStatus) {
  return {
    pending: msg("Waiting for notification"),
    sending: msg("Notification in progress"),
    sent: msg("Notification acknowledged"),
    failed: msg("Notification failed"),
    unknown: msg("Unknown outcome, review required"),
    superseded: msg("Notification superseded"),
  }[status];
}

function DeliveryHistory({ id, onRefusal }: { id: string; onRefusal: Refuse }) {
  const path = `/customer-webhooks/${id}/deliveries`;
  const deliveries = useResource<Page<CustomerWebhookDelivery>>(path);
  useRefreshOnFocus(deliveries.refresh);
  const denied = authorityRefused(deliveries.error);
  useEffect(() => {
    if (denied && deliveries.error) onRefusal(deliveries.error);
  }, [denied, deliveries.error, onRefusal]);
  if (denied) return <ErrorNotice error={deliveries.error} />;
  return (
    <section className="form-panel panel">
      <div className="lifecycle-section-heading">
        <h2>{msg("Webhook deliveries")}</h2>
        <button
          className="button subtle"
          onClick={deliveries.refresh}
          disabled={deliveries.loading}
        >
          {msg("Refresh")}
        </button>
      </div>
      <p>
        {msg(
          "Unknown webhook outcomes are not retried automatically. Acknowledgement confirms receipt by the endpoint, not delivery of the original dispatch.",
        )}
      </p>
      <ErrorNotice error={deliveries.error} retry={deliveries.refresh} />
      {deliveries.loading && !deliveries.data && <Loading />}
      {deliveries.data && (
        <DataTable
          viewId="webhook-deliveries"
          items={deliveries.data.items}
          label={msg("Webhook deliveries")}
          getRowKey={(item) => item.id}
          empty={<EmptyState title={msg("No webhook deliveries.")} />}
          columns={[
            {
              id: "time",
              label: msg("Date"),
              value: (item) => tableTimestamp(item.occurredAt),
              render: (item) => date(item.occurredAt),
            },
            {
              id: "dispatch",
              label: msg("Dispatch"),
              value: (item) => item.dispatchId,
              render: (item) => (
                <a href={`#/app/dispatch/${item.dispatchId}`}>
                  {item.dispatchId}
                </a>
              ),
            },
            {
              id: "state",
              label: msg("Dispatch status"),
              value: (item) =>
                t.statuses[item.dispatchStatus] ?? item.dispatchStatus,
            },
            {
              id: "status",
              label: msg("Notification status"),
              value: (item) => deliveryLabel(item.status),
            },
          ]}
        />
      )}
      <LoadMore
        path={path}
        data={deliveries.data}
        onLoaded={deliveries.setData}
      />
    </section>
  );
}
