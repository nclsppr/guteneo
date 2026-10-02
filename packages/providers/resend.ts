import type { EmailSubmission } from "./ses";
import {
  asObject,
  bytesBase64,
  headerSafe,
  ProviderError,
  textField,
  type CancelResult,
  type Fetcher,
  type ProviderCapabilities,
  type ProviderEstimate,
  type ProviderEvent,
  type ProviderResult,
  type ProviderStatus,
} from "./types";
import { boundedText, request, requireOk } from "./transport";

const encoder = new TextEncoder();
const domainPattern =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const emailPattern = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@([^@]+)$/;
const dispatchPattern = /^[a-zA-Z0-9_-]{1,200}$/;
const providerIdPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function mailboxDomain(value: string): string | null {
  if (!headerSafe(value) || value.length > 254) return null;
  const match = emailPattern.exec(value);
  if (!match || !domainPattern.test(match[1].toLowerCase())) return null;
  const local = value.slice(0, value.lastIndexOf("@"));
  if (
    local.length > 64 ||
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..")
  )
    return null;
  return match[1].toLowerCase();
}

function senderDomain(value: string): string | null {
  if (!headerSafe(value)) return null;
  const named = /^[^<>\r\n\0]{1,100} <([^<>]+)>$/.exec(value);
  return mailboxDomain(named ? named[1] : value);
}

function unknown(): ProviderResult {
  return {
    status: "submission_unknown",
    errorCode: "RESEND_RESPONSE_UNKNOWN",
    retryable: false,
  };
}

/** Project fixed codes only: provider messages can contain addresses or content. */
async function rejected(response: Response): Promise<ProviderResult> {
  if (
    response.status < 400 ||
    response.status >= 500 ||
    [408, 409].includes(response.status)
  )
    return unknown();
  let name = "";
  try {
    const data = asObject(JSON.parse(await boundedText(response, 16_384)));
    if (typeof data.name === "string") name = data.name;
  } catch {
    // The HTTP rejection is definitive even when the optional body is malformed.
  }
  const known: Record<string, string> = {
    validation_error: "RESEND_REQUEST_REJECTED",
    missing_required_field: "RESEND_REQUEST_REJECTED",
    invalid_access: "RESEND_AUTHORIZATION_FAILED",
    restricted_api_key: "RESEND_AUTHORIZATION_FAILED",
    invalid_api_key: "RESEND_AUTHORIZATION_FAILED",
    daily_quota_exceeded: "RESEND_DAILY_QUOTA_EXCEEDED",
    monthly_quota_exceeded: "RESEND_MONTHLY_QUOTA_EXCEEDED",
    rate_limit_exceeded: "RESEND_RATE_EXCEEDED",
  };
  const errorCode = [401, 403].includes(response.status)
    ? "RESEND_AUTHORIZATION_FAILED"
    : Object.hasOwn(known, name)
      ? known[name]
      : response.status === 429
        ? "RESEND_RATE_EXCEEDED"
        : "RESEND_REQUEST_REJECTED";
  return { status: "rejected", errorCode, retryable: false };
}

export type ResendConfig = {
  apiKey: string;
  /** Optional separately authorized read credential. Sending-only keys cannot
   * retrieve emails; never promote their privilege to enable reconciliation. */
  readApiKey?: string;
  verifiedDomain: string;
  authorizedSenders: string[];
  /** Uses Resend's test recipients; never a separate provider environment. */
  sandbox: boolean;
};

/** The caller owns immutable approval, quotas and attempt persistence. No retries,
 * including after the provider's documented 24-hour idempotency window expires. */
export class ResendEmailProvider {
  readonly capabilities: ProviderCapabilities;
  constructor(
    private readonly config: ResendConfig,
    private readonly fetcher: Fetcher = fetch,
  ) {
    if (!/^re_[a-zA-Z0-9_-]{1,500}$/.test(config.apiKey))
      throw new ProviderError("configuration_resend_api_key");
    if (
      config.readApiKey !== undefined &&
      !/^re_[a-zA-Z0-9_-]{1,500}$/.test(config.readApiKey)
    )
      throw new ProviderError("configuration_resend_read_api_key");
    if (
      !domainPattern.test(config.verifiedDomain) ||
      !config.authorizedSenders.length ||
      config.authorizedSenders.some(
        (sender) => senderDomain(sender) !== config.verifiedDomain,
      )
    )
      throw new ProviderError("configuration_resend_sender");
    this.capabilities = {
      provider: "resend",
      channel: "email",
      mode: config.sandbox ? "sandbox" : "live",
      canReadStatus: Boolean(config.readApiKey),
      canRequestCancellation: false,
      submissionIdempotency: "24_hours",
    };
  }

  validate(input: EmailSubmission): string[] {
    const errors: string[] = [];
    if (input.replyTo !== undefined && !mailboxDomain(input.replyTo))
      errors.push("invalid_reply_to");
    if (!mailboxDomain(input.to)) errors.push("invalid_email_recipient");
    if (
      this.config.sandbox &&
      !/^(?:(?:delivered|bounced|complained)(?:\+[a-zA-Z0-9_-]+)?|suppressed)@resend\.dev$/.test(
        input.to,
      )
    )
      errors.push("resend_test_recipient_required");
    if (
      senderDomain(input.from) !== this.config.verifiedDomain ||
      !this.config.authorizedSenders.includes(input.from)
    )
      errors.push("sender_not_authorized");
    if (!headerSafe(input.subject) || input.subject.length > 998)
      errors.push("invalid_email_subject");
    if (
      !input.html ||
      !input.text ||
      encoder.encode(input.html + input.text).length > 1_000_000
    )
      errors.push("invalid_email_content");
    if (!dispatchPattern.test(input.dispatchId))
      errors.push("invalid_dispatch_id");
    if (!["transactional", "marketing"].includes(input.purpose))
      errors.push("invalid_email_purpose");
    if (input.purpose === "marketing") {
      try {
        const url = new URL(input.unsubscribeUrl ?? "");
        if (
          !headerSafe(input.unsubscribeUrl ?? "") ||
          url.protocol !== "https:" ||
          url.username ||
          url.password ||
          input.unsubscribeUrl !== url.href ||
          !input.html.includes(url.href) ||
          !input.text.includes(url.href)
        )
          errors.push("marketing_unsubscribe_missing_from_approved_content");
      } catch {
        errors.push("marketing_unsubscribe_missing_from_approved_content");
      }
    }
    const attachments = input.attachments ?? [];
    // Below Resend's 40MB encoded-message limit, including both bodies and JSON.
    if (
      attachments.length > 5 ||
      attachments.reduce(
        (total, attachment) => total + attachment.bytes.byteLength,
        0,
      ) > 20_000_000
    )
      errors.push("email_attachment_limits");
    for (const attachment of attachments) {
      if (
        !/^[^\r\n\0/\\]{1,180}\.(pdf|png|jpe?g)$/i.test(attachment.filename) ||
        !["application/pdf", "image/png", "image/jpeg"].includes(
          attachment.contentType,
        )
      )
        errors.push("email_attachment_type");
      if (!attachment.bytes.byteLength) errors.push("email_attachment_limits");
    }
    return errors;
  }

  estimate(): ProviderEstimate {
    return {
      amount: null,
      reason:
        "Resend account plan, quota and a provider-specific qualified price are required.",
      verifiedAt: "2026-09-17",
    };
  }

  async submit(input: EmailSubmission): Promise<ProviderResult> {
    const errors = this.validate(input);
    if (errors.length)
      return { status: "rejected", errorCode: errors[0], retryable: false };
    try {
      const response = await request(
        this.fetcher,
        "https://api.resend.com/emails",
        {
          method: "POST",
          headers: {
            ...this.headers(),
            "Idempotency-Key": `guteneo/${input.dispatchId}`,
          },
          body: JSON.stringify({
            from: input.from,
            to: [input.to],
            subject: input.subject,
            ...(input.replyTo ? { reply_to: input.replyTo } : {}),
            html: input.html,
            text: input.text,
            tags: [
              { name: "guteneo-dispatch", value: input.dispatchId },
              { name: "guteneo-purpose", value: input.purpose },
            ],
            ...(input.purpose === "marketing"
              ? {
                  headers: {
                    "List-Unsubscribe": `<${input.unsubscribeUrl}>`,
                    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
                  },
                }
              : {}),
            ...(input.attachments?.length
              ? {
                  attachments: input.attachments.map((attachment) => ({
                    filename: attachment.filename,
                    content_type: attachment.contentType,
                    content: bytesBase64(attachment.bytes),
                  })),
                }
              : {}),
          }),
        },
      );
      if (!response.ok) return rejected(response);
      const data = asObject(JSON.parse(await boundedText(response, 16_384)));
      const providerId = textField(data, "id");
      if (!providerIdPattern.test(providerId)) return unknown();
      return {
        status: "accepted",
        providerId,
        providerStatus: "accepted_by_resend",
      };
    } catch {
      return unknown();
    }
  }

  async readStatus(providerId: string): Promise<ProviderStatus> {
    if (!this.config.readApiKey)
      throw new ProviderError("resend_status_read_not_configured");
    if (!providerIdPattern.test(providerId))
      throw new ProviderError("invalid_provider_id");
    const response = await request(
      this.fetcher,
      `https://api.resend.com/emails/${providerId}`,
      {
        headers: {
          ...this.headers(),
          Authorization: `Bearer ${this.config.readApiKey}`,
        },
      },
    );
    await requireOk(response);
    // This endpoint returns email bodies; project only fixed status metadata.
    let data: Record<string, unknown>;
    try {
      data = asObject(JSON.parse(await boundedText(response, 2_100_000)));
    } catch {
      // JSON parser diagnostics can quote private email content.
      throw new ProviderError("invalid_provider_response");
    }
    if (data.id !== providerId)
      throw new ProviderError("invalid_provider_response");
    const providerStatus = textField(data, "last_event");
    if (
      ![
        "sent",
        "delivered",
        "delivery_delayed",
        "bounced",
        "complained",
        "failed",
        "suppressed",
        "opened",
        "clicked",
        "queued",
        "scheduled",
        "canceled",
      ].includes(providerStatus)
    )
      throw new ProviderError("invalid_provider_response");
    return {
      providerId,
      providerStatus,
      observedAt: new Date().toISOString(),
      cost: null,
    };
  }

  async cancel(): Promise<CancelResult> {
    // Resend cancels scheduled sends only; this client never schedules a send.
    return { status: "unsupported" };
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json",
    };
  }
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[a-zA-Z0-9+/]+={0,2}$/.test(value))
    throw new ProviderError("invalid_signature");
  try {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  } catch {
    throw new ProviderError("invalid_signature");
  }
}

/** Verify raw bytes before parsing. The endpoint-specific secret identifies the
 * provider account; tenant and attempt correlation remain the caller's responsibility.
 * Svix signs `${id}.${timestamp}.${body}` using the decoded whsec_ HMAC key. */
export async function verifyResendWebhook(
  body: string,
  headers: Headers,
  secret: string,
  now = Date.now(),
): Promise<ProviderEvent | null> {
  if (encoder.encode(body).byteLength > 1_000_000)
    throw new ProviderError("webhook_too_large");
  const eventId = headers.get("svix-id") ?? "";
  const time = headers.get("svix-timestamp") ?? "";
  const signature = headers.get("svix-signature") ?? "";
  if (
    !/^[a-zA-Z0-9_-]{1,200}$/.test(eventId) ||
    !signature ||
    signature.length > 4096
  )
    throw new ProviderError("invalid_signature");
  if (
    !/^\d{10}$/.test(time) ||
    !Number.isFinite(now) ||
    Math.abs(now / 1000 - Number(time)) > 300
  )
    throw new ProviderError("webhook_replay_window");
  if (!/^whsec_[a-zA-Z0-9+/]+={0,2}$/.test(secret) || secret.length > 1024)
    throw new ProviderError("configuration_resend_webhook_secret");
  const key = await crypto.subtle.importKey(
    "raw",
    decodeBase64(secret.slice(6)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signed = encoder.encode(`${eventId}.${time}.${body}`);
  let valid = false;
  for (const candidate of signature.split(" ")) {
    const match = /^v1,([a-zA-Z0-9+/]+={0,2})$/.exec(candidate);
    if (!match) continue;
    const bytes = decodeBase64(match[1]);
    if (
      bytes.length === 32 &&
      (await crypto.subtle.verify("HMAC", key, bytes, signed))
    ) {
      valid = true;
      break;
    }
  }
  if (!valid) throw new ProviderError("invalid_signature");
  let event: Record<string, unknown>;
  try {
    event = asObject(JSON.parse(body));
  } catch {
    throw new ProviderError("invalid_provider_response");
  }
  const kinds: Record<string, ProviderEvent["kind"]> = {
    "email.sent": "accepted",
    "email.delivered": "delivered",
    "email.bounced": "bounced",
    "email.complained": "complained",
    "email.failed": "failed",
    "email.suppressed": "failed",
  };
  const type = textField(event, "type");
  // Delays/open/click/contact events do not prove a terminal delivery outcome.
  if (!Object.hasOwn(kinds, type)) return null;
  const data = asObject(event.data);
  const providerId = textField(data, "email_id");
  if (!providerIdPattern.test(providerId))
    throw new ProviderError("invalid_provider_id");
  const occurredAt = Date.parse(textField(event, "created_at"));
  if (!Number.isFinite(occurredAt))
    throw new ProviderError("invalid_event_timestamp");
  const tags =
    data.tags && typeof data.tags === "object" && !Array.isArray(data.tags)
      ? asObject(data.tags)
      : {};
  const dispatchId = tags["guteneo-dispatch"];
  return {
    provider: "resend",
    eventId,
    providerId,
    kind: kinds[type],
    occurredAt: new Date(occurredAt).toISOString(),
    // Resend defines email.bounced as permanent rejection. The shared domain
    // suppresses only explicitly classified hard bounces; retain no SMTP text.
    ...(type === "email.bounced"
      ? { payload: { bounceType: "Permanent" } }
      : {}),
    ...(type === "email.suppressed"
      ? { payload: { suppressionReason: "provider_suppression" } }
      : {}),
    ...(typeof dispatchId === "string" && dispatchPattern.test(dispatchId)
      ? { dispatchId }
      : {}),
  };
}
