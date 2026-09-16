import { importX509 } from "jose";
import {
  asObject,
  ProviderError,
  textField,
  type Fetcher,
  type ProviderEvent,
} from "./types";
import { boundedText, request, requireOk } from "./transport";

const encoder = new TextEncoder();
function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[a-zA-Z0-9+/]+={0,2}$/.test(value))
    throw new ProviderError("invalid_signature");
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
function parseBody(body: string): Record<string, unknown> {
  if (encoder.encode(body).length > 1_000_000)
    throw new ProviderError("webhook_too_large");
  return asObject(JSON.parse(body));
}
function timestamp(value: string): string {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new ProviderError("invalid_event_timestamp");
  return new Date(ms).toISOString();
}

/** Must be called with untouched request.text(), before JSON normalization. */
export async function verifyTelnyxWebhook(
  body: string,
  headers: Headers,
  publicKeyBase64: string,
  expectedConnectionId: string,
  now = Date.now(),
): Promise<ProviderEvent | null> {
  const time = headers.get("telnyx-timestamp") ?? "";
  if (!/^\d{10}$/.test(time) || Math.abs(now / 1000 - Number(time)) > 300)
    throw new ProviderError("webhook_replay_window");
  const key = await crypto.subtle.importKey(
    "raw",
    decodeBase64(publicKeyBase64),
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  if (
    !(await crypto.subtle.verify(
      "Ed25519",
      key,
      decodeBase64(headers.get("telnyx-signature-ed25519") ?? ""),
      encoder.encode(`${time}|${body}`),
    ))
  )
    throw new ProviderError("invalid_signature");
  const data = asObject(parseBody(body).data);
  const payload = asObject(data.payload);
  if (payload.connection_id !== expectedConnectionId)
    throw new ProviderError("unexpected_provider_account");
  const kinds: Record<string, ProviderEvent["kind"]> = {
    "fax.queued": "accepted",
    "fax.delivered": "delivered",
    "fax.failed": "failed",
  };
  const kind = kinds[textField(data, "event_type")];
  if (!kind) return null;
  let dispatchId: string | undefined;
  if (
    typeof payload.client_state === "string" &&
    payload.client_state.length < 2048
  ) {
    try {
      const state = asObject(
        JSON.parse(
          new TextDecoder().decode(decodeBase64(payload.client_state)),
        ),
      );
      if (
        typeof state.dispatchId === "string" &&
        /^[a-zA-Z0-9_.:-]{1,200}$/.test(state.dispatchId)
      )
        dispatchId = state.dispatchId;
    } catch {
      /* No untrusted tenant inference; retain orphan by provider ID. */
    }
  }
  return {
    provider: "telnyx",
    eventId: textField(data, "id"),
    providerId: textField(payload, "fax_id"),
    ...(dispatchId ? { dispatchId } : {}),
    kind,
    occurredAt: timestamp(textField(data, "occurred_at")),
    payload:
      typeof payload.failure_reason === "string"
        ? { failureReason: payload.failure_reason }
        : {},
  };
}

export async function verifyPingenWebhook(
  body: string,
  signature: string,
  secret: string,
  expectedOrganisationId: string,
): Promise<ProviderEvent | null> {
  if (!secret || !/^[a-f0-9]{64}$/i.test(signature))
    throw new ProviderError("invalid_signature");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signatureBytes = Uint8Array.from(signature.match(/.{2}/g)!, (value) =>
    Number.parseInt(value, 16),
  );
  if (
    !(await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes,
      encoder.encode(body),
    ))
  )
    throw new ProviderError("invalid_signature");
  const data = asObject(parseBody(body).data);
  const relationships = asObject(data.relationships);
  if (
    asObject(asObject(relationships.organisation).data).id !==
    expectedOrganisationId
  )
    throw new ProviderError("unexpected_provider_account");
  const deliverable = asObject(asObject(relationships.deliverable).data);
  if (deliverable.type !== "letters")
    throw new ProviderError("unexpected_provider_channel");
  const kinds: Record<string, ProviderEvent["kind"]> = {
    webhook_sent: "handed_to_post",
    webhook_delivered: "delivered",
    webhook_undeliverable: "failed",
  };
  const kind = kinds[textField(data, "type")];
  // Issues can be reversible preflight errors; never turn them into definitive delivery failure.
  if (!kind) return null;
  const attributes = asObject(data.attributes);
  return {
    provider: "pingen",
    eventId: textField(asObject(asObject(relationships.event).data), "id"),
    providerId: textField(deliverable, "id"),
    kind,
    occurredAt: timestamp(textField(attributes, "created_at")),
  };
}

export type VerifiedSnsMessage = {
  type: "Notification" | "SubscriptionConfirmation" | "UnsubscribeConfirmation";
  messageId: string;
  topicArn: string;
  message: string;
  occurredAt: string;
  confirmationToken?: string;
};
/** AWS fixed canonical order, including the final newline, differs by message type. */
export function canonicalSnsMessage(message: Record<string, unknown>): string {
  const fields =
    message.Type === "Notification"
      ? [
          "Message",
          "MessageId",
          ...(message.Subject !== undefined ? ["Subject"] : []),
          "Timestamp",
          "TopicArn",
          "Type",
        ]
      : [
          "Message",
          "MessageId",
          "SubscribeURL",
          "Timestamp",
          "Token",
          "TopicArn",
          "Type",
        ];
  return fields
    .map((field) => `${field}\n${textField(message, field)}\n`)
    .join("");
}
export async function verifySnsWebhook(
  body: string,
  expectedTopicArn: string,
  fetcher: Fetcher = fetch,
): Promise<VerifiedSnsMessage> {
  const arn =
    /^arn:aws:sns:(eu-(?:west|central|north|south)-\d):(\d{12}):[a-zA-Z0-9_-]+$/.exec(
      expectedTopicArn,
    );
  if (!arn) throw new ProviderError("configuration_sns_topic");
  const data = parseBody(body);
  if (data.TopicArn !== expectedTopicArn)
    throw new ProviderError("unexpected_sns_topic");
  if (
    ![
      "Notification",
      "SubscriptionConfirmation",
      "UnsubscribeConfirmation",
    ].includes(String(data.Type))
  )
    throw new ProviderError("unsupported_sns_message");
  // SNS defaults to v1. Provision the topic with SignatureVersion=2 before connecting.
  if (data.SignatureVersion !== "2")
    throw new ProviderError("sns_signature_v2_required");
  const certUrl = new URL(textField(data, "SigningCertURL"));
  if (
    certUrl.protocol !== "https:" ||
    certUrl.hostname !== `sns.${arn[1]}.amazonaws.com` ||
    certUrl.port ||
    certUrl.username ||
    certUrl.password ||
    certUrl.search ||
    certUrl.hash ||
    !/^\/SimpleNotificationService-[a-zA-Z0-9]+\.pem$/.test(certUrl.pathname)
  )
    throw new ProviderError("sns_certificate_url_not_allowed");
  // Only the configured SNS HTTPS host is a certificate trust source. No redirects or
  // caller supplied keys. Fetch is bounded and relies on runtime TLS chain validation.
  let pem: string;
  try {
    const response = await request(fetcher, certUrl.href);
    await requireOk(response);
    pem = await boundedText(response, 16_384);
  } catch {
    throw new ProviderError("sns_certificate_unavailable", true);
  }
  let key: CryptoKey;
  try {
    key = await importX509(pem, "RS256");
  } catch {
    throw new ProviderError("sns_certificate_invalid");
  }
  if (
    !(await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      decodeBase64(textField(data, "Signature")),
      encoder.encode(canonicalSnsMessage(data)),
    ))
  )
    throw new ProviderError("invalid_signature");
  return {
    type: data.Type as VerifiedSnsMessage["type"],
    messageId: textField(data, "MessageId"),
    topicArn: expectedTopicArn,
    message: textField(data, "Message"),
    occurredAt: timestamp(textField(data, "Timestamp")),
    ...(data.Type !== "Notification"
      ? { confirmationToken: textField(data, "Token") }
      : {}),
  };
}

/** Call only after verifying the outer SNS signature/topic. Never follows SubscribeURL. */
export function normalizeSesEvent(
  message: VerifiedSnsMessage,
): ProviderEvent | null {
  if (message.type !== "Notification") return null;
  const data = parseBody(message.message);
  const mail = asObject(data.mail);
  const eventType =
    typeof data.eventType === "string"
      ? data.eventType
      : String(data.notificationType);
  const kinds: Record<string, ProviderEvent["kind"]> = {
    Send: "accepted",
    Delivery: "delivered",
    Bounce: "bounced",
    Complaint: "complained",
    Reject: "failed",
    "Rendering Failure": "failed",
    RenderingFailure: "failed",
  };
  const kind = kinds[eventType];
  if (!kind) return null;
  let dispatchId: string | undefined;
  if (mail.tags && typeof mail.tags === "object") {
    const value = asObject(mail.tags)["guteneo-dispatch"];
    if (
      Array.isArray(value) &&
      value.length === 1 &&
      typeof value[0] === "string" &&
      /^[a-zA-Z0-9_.:-]{1,200}$/.test(value[0])
    )
      dispatchId = value[0];
  }
  const event = data[eventType.toLowerCase()];
  const details = event && typeof event === "object" ? asObject(event) : {};
  const occurredAt =
    typeof details.timestamp === "string"
      ? timestamp(details.timestamp)
      : message.occurredAt;
  const payload: Record<string, unknown> = {};
  if (eventType === "Bounce" && typeof details.bounceType === "string")
    payload.bounceType = details.bounceType;
  return {
    provider: "ses",
    eventId: message.messageId,
    providerId: textField(mail, "messageId"),
    ...(dispatchId ? { dispatchId } : {}),
    kind,
    occurredAt,
    payload,
  };
}
