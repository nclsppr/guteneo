import {
  asObject,
  bytesBase64,
  ProviderError,
  requireValue,
  safeId,
  textField,
  type CancelResult,
  type Fetcher,
  type ProviderCapabilities,
  type ProviderEstimate,
  type ProviderResult,
  type ProviderStatus,
} from "./types";
import {
  jsonResponse,
  rejection,
  request,
  requireOk,
  unknownResult,
} from "./transport";

export type TelnyxConfig = {
  apiKey: string;
  connectionId: string;
  from: string;
  webhookUrl: string;
  mediaOrigins: string[];
  allowedDestinationPrefixes: string[];
};
export type FaxSubmission = {
  dispatchId: string;
  to: string;
  mediaUrl: string;
  mediaExpiresAt: string;
  pages: number;
  sizeBytes: number;
};
export class TelnyxFaxProvider {
  readonly capabilities: ProviderCapabilities = {
    provider: "telnyx",
    channel: "fax",
    mode: "live",
    canReadStatus: true,
    canRequestCancellation: true,
    submissionIdempotency: "not_verified",
  };
  constructor(
    private readonly config: TelnyxConfig,
    private readonly fetcher: Fetcher = fetch,
  ) {
    requireValue(config.apiKey, "telnyx_api_key");
    requireValue(config.connectionId, "telnyx_connection_id");
    if (
      !/^\+[1-9]\d{6,14}$/.test(config.from) ||
      new URL(config.webhookUrl).protocol !== "https:" ||
      !config.mediaOrigins.length ||
      !config.allowedDestinationPrefixes.length
    )
      throw new ProviderError("configuration_telnyx");
  }
  validate(input: FaxSubmission): string[] {
    const errors: string[] = [];
    if (
      !/^\+[1-9]\d{6,14}$/.test(input.to) ||
      !this.config.allowedDestinationPrefixes.some((p) =>
        input.to.startsWith(p),
      )
    )
      errors.push("fax_destination_not_allowed");
    if (
      !Number.isInteger(input.pages) ||
      input.pages < 1 ||
      input.pages > 350 ||
      input.sizeBytes < 1 ||
      input.sizeBytes > 50_000_000
    )
      errors.push("fax_document_limits");
    try {
      const url = new URL(input.mediaUrl);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.hash ||
        !this.config.mediaOrigins.includes(url.origin)
      )
        errors.push("fax_media_url_not_allowed");
    } catch {
      errors.push("fax_media_url_not_allowed");
    }
    if (
      !Number.isFinite(Date.parse(input.mediaExpiresAt)) ||
      Date.parse(input.mediaExpiresAt) < Date.now() + 20 * 60_000
    )
      errors.push("fax_media_expiry_too_short");
    if (!/^[a-zA-Z0-9_.:-]{1,200}$/.test(input.dispatchId))
      errors.push("invalid_dispatch_id");
    return errors;
  }
  estimate(): ProviderEstimate {
    return {
      amount: null,
      reason:
        "Fax page charge excludes destination-dependent SIP duration, number rental and tax.",
      verifiedAt: "2026-09-16",
    };
  }
  async submit(input: FaxSubmission): Promise<ProviderResult> {
    const errors = this.validate(input);
    if (errors.length)
      return { status: "rejected", errorCode: errors[0], retryable: false };
    try {
      const response = await request(
        this.fetcher,
        "https://api.telnyx.com/v2/faxes",
        {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({
            connection_id: this.config.connectionId,
            from: this.config.from,
            to: input.to,
            media_url: input.mediaUrl,
            webhook_url: this.config.webhookUrl,
            client_state: bytesBase64(
              new TextEncoder().encode(
                JSON.stringify({ dispatchId: input.dispatchId }),
              ),
            ),
            store_media: false,
            store_preview: false,
          }),
        },
      );
      if (response.status !== 202) return rejection(response);
      const data = asObject((await jsonResponse(response)).data);
      return {
        status: "accepted",
        providerId: textField(data, "id"),
        providerStatus: textField(data, "status"),
      };
    } catch {
      return unknownResult();
    }
  }
  async readStatus(providerId: string): Promise<ProviderStatus> {
    const response = await request(
      this.fetcher,
      `https://api.telnyx.com/v2/faxes/${safeId(providerId)}`,
      { headers: this.headers() },
    );
    await requireOk(response);
    const data = asObject((await jsonResponse(response)).data);
    return {
      providerId: textField(data, "id"),
      providerStatus: textField(data, "status"),
      observedAt: new Date().toISOString(),
      cost: null,
    };
  }
  async cancel(providerId: string): Promise<CancelResult> {
    const id = safeId(providerId);
    try {
      const response = await request(
        this.fetcher,
        `https://api.telnyx.com/v2/faxes/${id}/actions/cancel`,
        { method: "POST", headers: this.headers() },
      );
      if (response.status === 202) return { status: "requested" };
      if (response.status === 422) return { status: "too_late" };
      return { status: "unknown" };
    } catch {
      return { status: "unknown" };
    }
  }
  private headers() {
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json",
    };
  }
}
