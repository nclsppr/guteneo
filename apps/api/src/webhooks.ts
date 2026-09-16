import type { DomainService } from "../../../packages/domain/src/index";
import {
  asObject,
  normalizeSesEvent,
  ProviderError,
  textField,
  verifyPingenWebhook,
  verifySnsWebhook,
  verifyTelnyxWebhook,
  type ProviderEvent,
  type ProviderName,
} from "../../../packages/providers";
import { boundedText } from "../../../packages/providers/transport";
import type { Env } from "./env";

type ReceiptPayload = {
  event?: ProviderEvent;
  metadata?: Record<string, string>;
};
type Receipt = {
  provider: ProviderName;
  event_id: string;
  payload_json: string;
  status: "pending" | "projected" | "unrecognized";
};
type EventSink = Pick<DomainService, "ingestEvent">;
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
function configured(value: string | undefined): string {
  if (!value) throw new ProviderError("webhook_not_configured");
  return value;
}

async function projectReceipt(
  db: D1Database,
  domain: EventSink,
  receipt: Receipt,
): Promise<void> {
  const payload = JSON.parse(receipt.payload_json) as ReceiptPayload;
  if (!payload.event) throw new ProviderError("receipt_without_event");
  // Ingestion is idempotent and persists orphan events. If the process stops between
  // these writes, replaying this receipt cannot duplicate the business fact.
  await domain.ingestEvent(payload.event);
  await db
    .prepare(
      "UPDATE provider_receipts SET status='projected' WHERE provider=? AND event_id=? AND status='pending'",
    )
    .bind(receipt.provider, receipt.event_id)
    .run();
}

/** Signature verification happens before any write; a durable receipt precedes every 2xx. */
export async function handleWebhook(
  request: Request,
  env: Env,
  domain: EventSink,
): Promise<Response | null> {
  const match = /^\/webhooks\/(telnyx|ses|pingen)$/.exec(
    new URL(request.url).pathname,
  );
  if (!match) return null;
  if (request.method !== "POST")
    return json({ error: { code: "METHOD_NOT_ALLOWED" } }, 405);
  const provider = match[1] as ProviderName;
  let event: ProviderEvent | null = null;
  let eventId: string;
  let metadata: Record<string, string> = {};
  try {
    if (Number(request.headers.get("Content-Length") ?? "0") > 1_000_000)
      return json({ error: { code: "WEBHOOK_TOO_LARGE" } }, 413);
    const body = await boundedText(new Response(request.body), 1_000_000);
    if (provider === "telnyx") {
      event = await verifyTelnyxWebhook(
        body,
        request.headers,
        configured(env.TELNYX_PUBLIC_KEY),
        configured(env.TELNYX_CONNECTION_ID),
      );
      const data = asObject(asObject(JSON.parse(body)).data);
      eventId = textField(data, "id");
      metadata = { type: textField(data, "event_type") };
    } else if (provider === "pingen") {
      event = await verifyPingenWebhook(
        body,
        request.headers.get("Signature") ?? "",
        configured(env.PINGEN_WEBHOOK_SECRET),
        configured(env.PINGEN_ORGANIZATION_ID),
      );
      const data = asObject(asObject(JSON.parse(body)).data);
      const relationships = asObject(data.relationships);
      eventId = textField(asObject(asObject(relationships.event).data), "id");
      metadata = {
        type: textField(data, "type"),
        providerId: textField(
          asObject(asObject(relationships.deliverable).data),
          "id",
        ),
      };
    } else {
      const message = await verifySnsWebhook(
        body,
        configured(env.SES_SNS_TOPIC_ARN),
      );
      eventId = message.messageId;
      metadata = {
        type: message.type,
        topicArn: message.topicArn,
        occurredAt: message.occurredAt,
      };
      // Retain only the token needed for an operator to confirm the configured SNS
      // topic via AWS CLI. Never store/fetch SubscribeURL or log this token.
      if (message.confirmationToken)
        metadata.confirmationToken = message.confirmationToken;
      try {
        event = normalizeSesEvent(message);
      } catch {
        metadata.reason = "unrecognized_ses_payload";
      }
    }
    if (!eventId || eventId.length > 250)
      throw new ProviderError("invalid_event_id");
  } catch (error) {
    const code =
      error instanceof ProviderError ? error.code : "invalid_webhook";
    const unavailable =
      code === "webhook_not_configured" ||
      code === "sns_certificate_unavailable";
    return json(
      {
        error: {
          code: unavailable ? "WEBHOOK_UNAVAILABLE" : "WEBHOOK_REJECTED",
        },
      },
      unavailable ? 503 : code === "provider_response_too_large" ? 413 : 401,
    );
  }
  let receipt: Receipt;
  try {
    const payload: ReceiptPayload = event ? { event } : { metadata };
    await env.DB.prepare(
      "INSERT INTO provider_receipts(provider,event_id,payload_json,status,received_at) VALUES(?,?,?,?,?) ON CONFLICT(provider,event_id) DO NOTHING",
    )
      .bind(
        provider,
        eventId,
        JSON.stringify(payload),
        event ? "pending" : "unrecognized",
        new Date().toISOString(),
      )
      .run();
    receipt = (await env.DB.prepare(
      "SELECT provider,event_id,payload_json,status FROM provider_receipts WHERE provider=? AND event_id=?",
    )
      .bind(provider, eventId)
      .first<Receipt>())!;
    if (!receipt) throw new ProviderError("receipt_not_persisted");
  } catch {
    return json({ error: { code: "WEBHOOK_STORAGE_UNAVAILABLE" } }, 503);
  }
  if (receipt.status === "pending") {
    try {
      await projectReceipt(env.DB, domain, receipt);
    } catch {
      return json({ received: true, projection: "pending" }, 202);
    }
  }
  return json({ received: true });
}

/** Cron recovery, bounded by the pending index. Does not resubmit any physical send. */
export async function reconcileWebhookReceipts(
  db: D1Database,
  domain: EventSink,
  limit = 100,
): Promise<{ projected: number; pending: number }> {
  const rows = await db
    .prepare(
      "SELECT provider,event_id,payload_json,status FROM provider_receipts WHERE status='pending' ORDER BY received_at,provider,event_id LIMIT ?",
    )
    .bind(Math.min(100, Math.max(1, Math.trunc(limit) || 100)))
    .all<Receipt>();
  let projected = 0;
  let pending = 0;
  for (const row of rows.results) {
    try {
      await projectReceipt(db, domain, row);
      projected++;
    } catch {
      pending++;
    }
  }
  return { projected, pending };
}
