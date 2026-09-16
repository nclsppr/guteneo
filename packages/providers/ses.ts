import { AwsClient } from "aws4fetch";
import {
  bytesBase64,
  headerSafe,
  ProviderError,
  requireValue,
  textField,
  type CancelResult,
  type Fetcher,
  type ProviderCapabilities,
  type ProviderEstimate,
  type ProviderResult,
} from "./types";
import { jsonResponse, rejection, unknownResult } from "./transport";

export type SesConfig = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
  configurationSet: string;
  authorizedSenders: string[];
  sandbox: boolean;
};
export type EmailSubmission = {
  dispatchId: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  purpose: "transactional" | "marketing";
  unsubscribeUrl?: string;
  attachments?: {
    filename: string;
    contentType: "application/pdf" | "image/png" | "image/jpeg";
    bytes: Uint8Array;
  }[];
};
export class SesEmailProvider {
  readonly capabilities: ProviderCapabilities;
  private readonly signer: AwsClient;
  constructor(
    private readonly config: SesConfig,
    private readonly fetcher: Fetcher = fetch,
  ) {
    for (const [name, value] of Object.entries({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      configurationSet: config.configurationSet,
    }))
      requireValue(value, `ses_${name}`);
    if (
      !/^eu-(west|central|north|south)-\d$/.test(config.region) ||
      !config.authorizedSenders.length
    )
      throw new ProviderError("configuration_ses");
    this.signer = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      sessionToken: config.sessionToken,
      region: config.region,
      service: "ses",
      retries: 0,
    });
    this.capabilities = {
      provider: "ses",
      channel: "email",
      mode: config.sandbox ? "sandbox" : "live",
      canReadStatus: false,
      canRequestCancellation: false,
      submissionIdempotency: "not_verified",
    };
  }
  validate(input: EmailSubmission): string[] {
    const errors: string[] = [];
    const email =
      /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!headerSafe(input.to) || !email.test(input.to))
      errors.push("invalid_email_recipient");
    if (
      !headerSafe(input.from) ||
      !this.config.authorizedSenders.includes(input.from)
    )
      errors.push("sender_not_authorized");
    if (!headerSafe(input.subject) || input.subject.length > 998)
      errors.push("invalid_email_subject");
    if (
      !input.html ||
      !input.text ||
      new TextEncoder().encode(input.html + input.text).length > 1_000_000
    )
      errors.push("invalid_email_content");
    if (!/^[a-zA-Z0-9_.:-]{1,200}$/.test(input.dispatchId))
      errors.push("invalid_dispatch_id");
    // Content and unsubscribe link are final before approval; never append hidden changes here.
    if (input.purpose === "marketing") {
      try {
        const url = new URL(input.unsubscribeUrl ?? "");
        if (
          url.protocol !== "https:" ||
          url.username ||
          url.password ||
          !input.html.includes(url.href) ||
          !input.text.includes(url.href)
        )
          errors.push("marketing_unsubscribe_missing_from_approved_content");
      } catch {
        errors.push("marketing_unsubscribe_missing_from_approved_content");
      }
    }
    const attachments = input.attachments ?? [];
    if (
      attachments.length > 5 ||
      attachments.reduce((n, a) => n + a.bytes.byteLength, 0) > 20_000_000
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
    }
    return errors;
  }
  estimate(): ProviderEstimate {
    return {
      amount: null,
      reason:
        "Account pricing plan, attachment volume and event costs must be configured; no arbitrary cent rounding.",
      verifiedAt: "2026-09-16",
    };
  }
  async submit(input: EmailSubmission): Promise<ProviderResult> {
    const errors = this.validate(input);
    if (errors.length)
      return { status: "rejected", errorCode: errors[0], retryable: false };
    const headers =
      input.purpose === "marketing"
        ? [
            { Name: "List-Unsubscribe", Value: `<${input.unsubscribeUrl}>` },
            {
              Name: "List-Unsubscribe-Post",
              Value: "List-Unsubscribe=One-Click",
            },
          ]
        : [];
    const body = JSON.stringify({
      FromEmailAddress: input.from,
      Destination: { ToAddresses: [input.to] },
      ConfigurationSetName: this.config.configurationSet,
      EmailTags: [
        { Name: "guteneo-dispatch", Value: input.dispatchId },
        { Name: "guteneo-purpose", Value: input.purpose },
      ],
      Content: {
        Simple: {
          Subject: { Charset: "UTF-8", Data: input.subject },
          Body: {
            Html: { Charset: "UTF-8", Data: input.html },
            Text: { Charset: "UTF-8", Data: input.text },
          },
          ...(headers.length ? { Headers: headers } : {}),
          ...(input.attachments?.length
            ? {
                Attachments: input.attachments.map((a) => ({
                  FileName: a.filename,
                  ContentType: a.contentType,
                  RawContent: bytesBase64(a.bytes),
                  ContentDisposition: "ATTACHMENT",
                  ContentTransferEncoding: "BASE64",
                })),
              }
            : {}),
        },
      },
    });
    try {
      const signed = await this.signer.sign(
        `https://email.${this.config.region}.amazonaws.com/v2/email/outbound-emails`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        },
      );
      const response = await this.fetcher(signed, {
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) return rejection(response);
      return {
        status: "accepted",
        providerId: textField(await jsonResponse(response), "MessageId"),
        providerStatus: "accepted_by_ses",
      };
    } catch {
      return unknownResult();
    }
  }
  async readStatus(): Promise<never> {
    throw new ProviderError("ses_requires_event_reconciliation");
  }
  async cancel(): Promise<CancelResult> {
    return { status: "unsupported" };
  }
}
