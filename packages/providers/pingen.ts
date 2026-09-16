import {
  asObject,
  exactMinor,
  ProviderError,
  requireValue,
  safeId,
  textField,
  type CancelResult,
  type Fetcher,
  type Money,
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

export type PingenConfig = {
  clientId: string;
  clientSecret: string;
  organisationId: string;
  sandbox: boolean;
  uploadOrigins: string[];
};
export type PostalOptions = {
  deliveryProduct: "fast" | "cheap";
  printMode: "simplex" | "duplex";
  printSpectrum: "color" | "grayscale";
};
export type PostalSubmission = PostalOptions & {
  preparedLetterId: string;
  expectedAddress: string;
  country: "FR" | "LU" | "DE";
  maxCost: Money;
  idempotencyKey: string;
};
export type PreparedPostalDocument = {
  providerId: string;
  providerStatus: string;
};
export class PingenPostalProvider {
  readonly capabilities: ProviderCapabilities;
  private token?: { value: string; expires: number };
  private readonly api: string;
  constructor(
    private readonly config: PingenConfig,
    private readonly fetcher: Fetcher = fetch,
  ) {
    requireValue(config.clientId, "pingen_client_id");
    requireValue(config.clientSecret, "pingen_client_secret");
    safeId(config.organisationId);
    if (!config.uploadOrigins.length)
      throw new ProviderError("configuration_pingen_upload_origins");
    for (const origin of config.uploadOrigins) {
      const url = new URL(origin);
      if (
        url.origin !== origin ||
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.port ||
        /(^localhost$|\.internal$|\.local$|^[\d.]+$|:)/.test(url.hostname)
      )
        throw new ProviderError("configuration_pingen_upload_origins");
    }
    this.api = config.sandbox
      ? "https://api-staging.pingen.com"
      : "https://api.pingen.com";
    this.capabilities = {
      provider: "pingen",
      channel: "postal",
      mode: config.sandbox ? "sandbox" : "live",
      canReadStatus: true,
      canRequestCancellation: true,
      submissionIdempotency: "24_hours",
    };
  }
  validate(input: PostalSubmission): string[] {
    const errors: string[] = [];
    if (!["FR", "LU", "DE"].includes(input.country))
      errors.push("postal_country_not_supported");
    if (!input.expectedAddress.trim())
      errors.push("postal_approved_address_required");
    if (!/^[a-zA-Z0-9_.:-]{1,64}$/.test(input.idempotencyKey))
      errors.push("invalid_provider_idempotency_key");
    if (
      !Number.isSafeInteger(input.maxCost.minor) ||
      input.maxCost.minor < 0 ||
      input.maxCost.currency !== "EUR"
    )
      errors.push("invalid_postal_cost_ceiling");
    if (
      !["fast", "cheap"].includes(input.deliveryProduct) ||
      !["simplex", "duplex"].includes(input.printMode) ||
      !["color", "grayscale"].includes(input.printSpectrum)
    )
      errors.push("unsupported_postal_options");
    try {
      safeId(input.preparedLetterId);
    } catch {
      errors.push("invalid_provider_id");
    }
    return errors;
  }
  /** Upload exact bytes and create a non-sending draft. Persist returned ID before any send.
   * Pingen reads the address already printed on the PDF; this never rewrites an original. */
  async prepareDocument(input: {
    bytes: Uint8Array;
    filename: string;
    addressPosition: "left" | "right";
    idempotencyKey: string;
  }): Promise<PreparedPostalDocument> {
    if (
      input.bytes.byteLength < 5 ||
      input.bytes.byteLength > 20_000_000 ||
      new TextDecoder().decode(input.bytes.subarray(0, 5)) !== "%PDF-" ||
      !/^[^\r\n\0/\\]{1,180}\.pdf$/i.test(input.filename) ||
      !["left", "right"].includes(input.addressPosition) ||
      !/^[a-zA-Z0-9_.:-]{1,64}$/.test(input.idempotencyKey)
    )
      throw new ProviderError("invalid_postal_document");
    const upload = await this.get("/file-upload");
    const attributes = asObject(asObject(upload.data).attributes);
    const url = new URL(textField(attributes, "url"));
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      !this.config.uploadOrigins.includes(url.origin)
    )
      throw new ProviderError("pingen_upload_origin_not_allowed");
    const response = await request(this.fetcher, url.href, {
      method: "PUT",
      body: input.bytes.slice().buffer,
      headers: { "Content-Type": "application/pdf" },
    });
    await requireOk(response);
    const created = await request(this.fetcher, this.letters(), {
      method: "POST",
      headers: await this.headers(input.idempotencyKey),
      body: JSON.stringify({
        data: {
          type: "letters",
          attributes: {
            file_original_name: input.filename,
            file_url: url.href,
            file_url_signature: textField(attributes, "url_signature"),
            address_position: input.addressPosition,
            auto_send: false,
          },
        },
      }),
    });
    await requireOk(created);
    const data = asObject((await jsonResponse(created)).data);
    return {
      providerId: textField(data, "id"),
      providerStatus: textField(asObject(data.attributes), "status"),
    };
  }
  async estimate(
    input?: {
      country: "FR" | "LU" | "DE";
      paperTypes: string[];
    } & PostalOptions,
  ): Promise<ProviderEstimate> {
    if (!input)
      return {
        amount: null,
        reason:
          "Requires validated document paper types, country and approved print options.",
        verifiedAt: "2026-09-16",
      };
    if (
      !["FR", "LU", "DE"].includes(input.country) ||
      !input.paperTypes.length ||
      input.paperTypes.length > 320 ||
      input.paperTypes.some((p) => p !== "normal")
    )
      throw new ProviderError("unsupported_postal_paper");
    const response = await request(
      this.fetcher,
      `${this.letters()}/price-calculator`,
      {
        method: "POST",
        headers: await this.headers(),
        body: JSON.stringify({
          data: {
            type: "letter_price_calculator",
            attributes: {
              country: input.country,
              paper_types: input.paperTypes,
              ...this.options(input),
            },
          },
        }),
      },
    );
    await requireOk(response);
    if (response.status === 202)
      return {
        amount: null,
        reason: "Provider calculation pending; no send allowed yet.",
        verifiedAt: new Date().toISOString(),
      };
    const data = asObject(
      asObject((await jsonResponse(response)).data).attributes,
    );
    if (typeof data.price !== "number" && typeof data.price !== "string")
      throw new ProviderError("invalid_provider_price");
    return {
      amount: exactMinor(data.price, textField(data, "currency")),
      verifiedAt: new Date().toISOString(),
    };
  }
  async submit(input: PostalSubmission): Promise<ProviderResult> {
    const errors = this.validate(input);
    if (errors.length)
      return { status: "rejected", errorCode: errors[0], retryable: false };
    // All preparatory reads can fail without a physical send. The mutation alone is ambiguous.
    let headers: Record<string, string>;
    try {
      const data = asObject(
        (
          await this.get(
            `${this.lettersPath()}/${safeId(input.preparedLetterId)}`,
          )
        ).data,
      );
      const attributes = asObject(data.attributes);
      if (
        attributes.country !== input.country ||
        this.normalizeAddress(textField(attributes, "address")) !==
          this.normalizeAddress(input.expectedAddress)
      )
        return {
          status: "rejected",
          errorCode: "postal_address_requires_new_approval",
          retryable: false,
        };
      const abilities = asObject(asObject(asObject(data.meta).abilities).self);
      if (abilities.submit !== "ok")
        return {
          status: "rejected",
          errorCode: "postal_document_not_ready",
          retryable: false,
        };
      const paperTypes = attributes.paper_types;
      if (
        !Array.isArray(paperTypes) ||
        paperTypes.some((x) => typeof x !== "string")
      )
        return {
          status: "rejected",
          errorCode: "postal_paper_types_unknown",
          retryable: false,
        };
      const quote = await this.estimate({ ...input, paperTypes });
      if (
        !quote.amount ||
        quote.amount.currency !== input.maxCost.currency ||
        quote.amount.minor > input.maxCost.minor
      )
        return {
          status: "rejected",
          errorCode: "postal_cost_requires_new_approval",
          retryable: false,
        };
      headers = await this.headers(input.idempotencyKey);
    } catch (error) {
      // Token/read/quote operations cannot print a letter; preserve this distinction
      // from the physically meaningful PATCH below when reporting an outage.
      return {
        status: "rejected",
        errorCode:
          error instanceof ProviderError
            ? error.code
            : "postal_preflight_unavailable",
        retryable: error instanceof ProviderError ? error.retryable : true,
      };
    }
    try {
      const response = await request(
        this.fetcher,
        `${this.letters()}/${safeId(input.preparedLetterId)}/send`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            data: {
              id: input.preparedLetterId,
              type: "letters",
              attributes: this.options(input),
            },
          }),
        },
      );
      if (!response.ok)
        return { ...rejection(response), providerId: input.preparedLetterId };
      return {
        status: "accepted",
        providerId: input.preparedLetterId,
        providerStatus: "submitted_for_printing",
      };
    } catch {
      return unknownResult(input.preparedLetterId);
    }
  }
  async readStatus(providerId: string): Promise<ProviderStatus> {
    const data = asObject(
      (await this.get(`${this.lettersPath()}/${safeId(providerId)}`)).data,
    );
    const attributes = asObject(data.attributes);
    let cost: Money | null = null;
    if (
      (typeof attributes.price_value === "number" ||
        typeof attributes.price_value === "string") &&
      typeof attributes.price_currency === "string"
    )
      cost = exactMinor(attributes.price_value, attributes.price_currency);
    // Provider deliberately does not publish a complete status list; preserve the raw fact.
    return {
      providerId: textField(data, "id"),
      providerStatus: textField(attributes, "status"),
      observedAt: new Date().toISOString(),
      cost,
    };
  }
  async cancel(providerId: string): Promise<CancelResult> {
    const id = safeId(providerId);
    const data = asObject((await this.get(`${this.lettersPath()}/${id}`)).data);
    if (asObject(asObject(asObject(data.meta).abilities).self).cancel !== "ok")
      return { status: "too_late" };
    const headers = await this.headers();
    try {
      const response = await request(
        this.fetcher,
        `${this.letters()}/${id}/cancel`,
        { method: "PATCH", headers },
      );
      return { status: response.status === 202 ? "requested" : "unknown" };
    } catch {
      return { status: "unknown" };
    }
  }
  private options(input: PostalOptions) {
    return {
      delivery_product: input.deliveryProduct,
      print_mode: input.printMode,
      print_spectrum: input.printSpectrum,
    };
  }
  private normalizeAddress(address: string) {
    return address
      .normalize("NFC")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleUpperCase("fr-FR");
  }
  private lettersPath() {
    return `/organisations/${safeId(this.config.organisationId)}/deliveries/letters`;
  }
  private letters() {
    return this.api + this.lettersPath();
  }
  private async get(path: string) {
    const response = await request(this.fetcher, this.api + path, {
      headers: await this.headers(),
    });
    await requireOk(response);
    return jsonResponse(response);
  }
  private async headers(
    idempotencyKey?: string,
  ): Promise<Record<string, string>> {
    if (!this.token || this.token.expires <= Date.now() + 60_000) {
      const identity = this.config.sandbox
        ? "https://identity-staging.pingen.com"
        : "https://identity.pingen.com";
      const response = await request(
        this.fetcher,
        `${identity}/auth/access-tokens`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
            scope: "letter",
          }),
        },
      );
      await requireOk(response);
      const data = await jsonResponse(response);
      if (
        typeof data.expires_in !== "number" ||
        data.expires_in <= 0 ||
        data.expires_in > 86_400
      )
        throw new ProviderError("invalid_provider_token_expiry");
      this.token = {
        value: textField(data, "access_token"),
        expires: Date.now() + data.expires_in * 1000,
      };
    }
    return {
      Authorization: `Bearer ${this.token.value}`,
      "Content-Type": "application/vnd.api+json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    };
  }
}
