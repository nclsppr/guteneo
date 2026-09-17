import { readFileSync } from "node:fs";
import { createSign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  canonicalSnsMessage,
  exactMinor,
  normalizeSesEvent,
  PingenPostalProvider,
  SesEmailProvider,
  TelnyxFaxProvider,
  verifyPingenWebhook,
  verifySnsWebhook,
  verifyTelnyxWebhook,
  type EmailSubmission,
  type FaxSubmission,
  type Fetcher,
  type PostalSubmission,
} from "../../packages/providers";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const faxConfig = {
  apiKey: "test-not-a-secret",
  connectionId: "test-connection",
  from: "+33100000000",
  webhookUrl: "https://guteneo.example/webhooks/telnyx",
  mediaOrigins: ["https://files.guteneo.example"],
  allowedDestinationPrefixes: ["+33", "+352", "+49"],
};
const fax: FaxSubmission = {
  dispatchId: "dispatch-1",
  to: "+33100000001",
  mediaUrl: "https://files.guteneo.example/token",
  mediaExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  pages: 1,
  sizeBytes: 1024,
};
const email: EmailSubmission = {
  dispatchId: "dispatch-email-1",
  from: "sender@example.invalid",
  to: "recipient@example.invalid",
  subject: "Objet",
  html: "<p>Bonjour</p>",
  text: "Bonjour",
  purpose: "transactional",
};
const sesConfig = {
  accessKeyId: "TESTACCESSKEY",
  secretAccessKey: "test-secret-not-a-credential",
  region: "eu-west-1",
  configurationSet: "guteneo-test",
  authorizedSenders: ["sender@example.invalid"],
  sandbox: true,
};
const pingenConfig = {
  clientId: "test-client",
  clientSecret: "test-secret",
  organisationId: "test-organisation",
  sandbox: true,
  uploadOrigins: ["https://objects.cloudscale.ch"],
};
const postal: PostalSubmission = {
  preparedLetterId: "letter-1",
  expectedAddress: "Example Test\n1 Test Street\n00000 Fiction",
  country: "FR",
  deliveryProduct: "cheap",
  printMode: "duplex",
  printSpectrum: "grayscale",
  maxCost: { currency: "EUR", minor: 200 },
  idempotencyKey: "send-test-1",
};
const letter = {
  data: {
    id: "letter-1",
    type: "letters",
    attributes: {
      status: "valid",
      address: postal.expectedAddress,
      country: "FR",
      paper_types: ["normal"],
      price_currency: "EUR",
      price_value: 1.23,
    },
    meta: { abilities: { self: { submit: "ok", cancel: "ok" } } },
  },
};

describe("real provider request contracts (no real calls)", () => {
  it("Telnyx sends a single request, preserves client correlation and only reports acceptance", async () => {
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValue(
        json({ data: { id: "fax-1", status: "queued" } }, 202),
      );
    const result = await new TelnyxFaxProvider(faxConfig, fetcher).submit(fax);
    expect(result).toEqual({
      status: "accepted",
      providerId: "fax-1",
      providerStatus: "queued",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.telnyx.com/v2/faxes");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      connection_id: "test-connection",
      from: faxConfig.from,
      to: fax.to,
      media_url: fax.mediaUrl,
      store_media: false,
    });
    expect(JSON.parse(atob(body.client_state))).toEqual({
      dispatchId: fax.dispatchId,
    });
    expect(new Headers(init?.headers).has("Idempotency-Key")).toBe(false);
  });
  it.each([
    new Error("connection lost"),
    new Response("uncertain", { status: 503 }),
    json({}, 202),
  ])("never retries ambiguous Telnyx submission", async (failure) => {
    const fetcher = vi.fn<Fetcher>();
    if (failure instanceof Error) fetcher.mockRejectedValue(failure);
    else fetcher.mockResolvedValue(failure);
    expect(
      await new TelnyxFaxProvider(faxConfig, fetcher).submit(fax),
    ).toMatchObject({ status: "submission_unknown", retryable: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("blocks unexpected signed media hosts and short expiry without network access", async () => {
    const fetcher = vi.fn<Fetcher>();
    const provider = new TelnyxFaxProvider(faxConfig, fetcher);
    expect(
      await provider.submit({
        ...fax,
        mediaUrl: "http://169.254.169.254/token",
      }),
    ).toMatchObject({ status: "rejected" });
    expect(
      await provider.submit({
        ...fax,
        mediaExpiresAt: new Date().toISOString(),
      }),
    ).toMatchObject({ status: "rejected" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("reports cancellation as requested after Telnyx 202, never confirmed", async () => {
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValue(json({ data: { result: "ok" } }, 202));
    expect(
      await new TelnyxFaxProvider(faxConfig, fetcher).cancel("fax-1"),
    ).toEqual({ status: "requested" });
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://api.telnyx.com/v2/faxes/fax-1/actions/cancel",
    );
  });
  it("SES signs real JSON wire content with SigV4 and isolates one recipient", async () => {
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValue(json({ MessageId: "ses-1" }));
    const pdf = new TextEncoder().encode("%PDF-1.7\nexact fixture bytes");
    const result = await new SesEmailProvider(sesConfig, fetcher).submit({
      ...email,
      attachments: [
        { filename: "letter.pdf", contentType: "application/pdf", bytes: pdf },
      ],
    });
    expect(result).toMatchObject({ status: "accepted", providerId: "ses-1" });
    const req = fetcher.mock.calls[0][0] as Request;
    expect(req.url).toBe(
      "https://email.eu-west-1.amazonaws.com/v2/email/outbound-emails",
    );
    expect(req.headers.get("Authorization")).toContain("AWS4-HMAC-SHA256");
    expect(req.headers.get("Authorization")).toContain(
      "/eu-west-1/ses/aws4_request",
    );
    const body = (await req.json()) as {
      Destination: { ToAddresses: string[] };
      Content: {
        Simple: {
          Body: { Text: { Data: string } };
          Attachments: Array<{ RawContent: string }>;
        };
      };
      ConfigurationSetName: string;
    };
    expect(body.Destination).toEqual({ ToAddresses: [email.to] });
    expect(body.Content.Simple.Body.Text.Data).toBe(email.text);
    expect(atob(body.Content.Simple.Attachments[0].RawContent)).toBe(
      new TextDecoder().decode(pdf),
    );
    expect(body.ConfigurationSetName).toBe("guteneo-test");
  });
  it("SES rejects header injection, unverified sender and marketing without approved unsubscribe", async () => {
    const fetcher = vi.fn<Fetcher>();
    const provider = new SesEmailProvider(sesConfig, fetcher);
    for (const input of [
      { ...email, subject: "hello\r\nBcc: victim@example.invalid" },
      { ...email, from: "attacker@example.invalid" },
      { ...email, purpose: "marketing" as const },
    ])
      expect(await provider.submit(input)).toMatchObject({
        status: "rejected",
      });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("SES holds an unknown outcome without SDK retry", async () => {
    const fetcher = vi
      .fn<Fetcher>()
      .mockRejectedValue(new Error("lost response"));
    expect(
      await new SesEmailProvider(sesConfig, fetcher).submit(email),
    ).toMatchObject({ status: "submission_unknown" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    [
      429,
      "TooManyRequestsException",
      "Daily message quota exceeded",
      "SES_DAILY_QUOTA_EXCEEDED",
    ],
    [
      429,
      "TooManyRequestsException",
      "Maximum sending rate exceeded",
      "SES_RATE_EXCEEDED",
    ],
    [429, "TooManyRequestsException", "Request throttled", "SES_THROTTLED"],
    [
      400,
      "MessageRejected",
      "Email address is not verified. The following identities failed: private@example.invalid",
      "SES_IDENTITY_NOT_VERIFIED",
    ],
    [
      400,
      "MessageRejected",
      "Invalid content with confidential details",
      "SES_MESSAGE_REJECTED",
    ],
    [
      400,
      "MailFromDomainNotVerifiedException",
      "private.invalid",
      "SES_SENDER_NOT_VERIFIED",
    ],
    [
      400,
      "AccountSuspendedException",
      "private-account",
      "SES_ACCOUNT_SUSPENDED",
    ],
    [400, "SendingPausedException", "private-account", "SES_SENDING_PAUSED"],
    [400, "LimitExceededException", "private-resource", "SES_RESOURCE_LIMIT"],
    [404, "NotFoundException", "private-config", "SES_CONFIGURATION_MISSING"],
    [403, "AccessDeniedException", "private-arn", "SES_AUTHORIZATION_FAILED"],
    [400, "__proto__", "private-value", "SES_REQUEST_REJECTED"],
  ])(
    "SES projects safe rejection codes for %s/%s without retry or raw response data",
    async (status, kind, message, code) => {
      const fetcher = vi
        .fn<Fetcher>()
        .mockResolvedValue(
          new Response(JSON.stringify({ message }), {
            status,
            headers: {
              "x-amzn-errortype": kind,
              "x-request-id": "private-request-reference",
            },
          }),
        );
      const result = await new SesEmailProvider(sesConfig, fetcher).submit(
        email,
      );
      expect(result).toEqual({
        status: "rejected",
        errorCode: code,
        retryable: false,
      });
      expect(JSON.stringify(result)).not.toContain("private");
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it("SES reads namespaced JSON errors but bounds malformed rejection bodies", async () => {
    const responses = [
      json(
        {
          __type: "com.amazonaws.ses#SendingPausedException",
          Message: "private",
        },
        400,
      ),
      new Response("private".repeat(5000), { status: 400 }),
      new Response("<error>private</error>", { status: 400 }),
    ];
    for (let i = 0; i < responses.length; i++) {
      const fetcher = vi.fn<Fetcher>().mockResolvedValue(responses[i]);
      expect(
        await new SesEmailProvider(sesConfig, fetcher).submit(email),
      ).toEqual({
        status: "rejected",
        errorCode: i === 0 ? "SES_SENDING_PAUSED" : "SES_REQUEST_REJECTED",
        retryable: false,
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it.each([302, 408, 409, 500, 503])(
    "SES treats %s as unknown even if its body claims a definitive rejection",
    async (status) => {
      const fetcher = vi
        .fn<Fetcher>()
        .mockResolvedValue(
          json(
            { __type: "MessageRejected", message: "private@example.invalid" },
            status,
          ),
        );
      expect(
        await new SesEmailProvider(sesConfig, fetcher).submit(email),
      ).toEqual({
        status: "submission_unknown",
        errorCode: "SES_RESPONSE_UNKNOWN",
        retryable: false,
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher.mock.calls[0][1]?.redirect).toBe("manual");
    },
  );
  it("SES does not accept a malformed acknowledgement reference", async () => {
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValue(json({ MessageId: "private@example.invalid" }));
    expect(
      await new SesEmailProvider(sesConfig, fetcher).submit(email),
    ).toMatchObject({ status: "submission_unknown" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("Pingen uploads untouched bytes without bearer leakage and creates an auto_send=false draft", async () => {
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce(
        json({ access_token: "test-token", expires_in: 43200 }),
      )
      .mockResolvedValueOnce(
        json({
          data: {
            attributes: {
              url: "https://objects.cloudscale.ch/test?signature=x",
              url_signature: "signature",
            },
          },
        }),
      )
      .mockResolvedValueOnce(new Response("", { status: 200 }))
      .mockResolvedValueOnce(
        json(
          { data: { id: "letter-1", attributes: { status: "processing" } } },
          201,
        ),
      );
    const bytes = new TextEncoder().encode("%PDF-1.7\nEXACT");
    expect(
      await new PingenPostalProvider(pingenConfig, fetcher).prepareDocument({
        bytes,
        filename: "letter.pdf",
        addressPosition: "left",
        idempotencyKey: "create-1",
      }),
    ).toEqual({ providerId: "letter-1", providerStatus: "processing" });
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://identity-staging.pingen.com/auth/access-tokens",
    );
    expect(
      new Uint8Array(fetcher.mock.calls[2][1]?.body as ArrayBuffer),
    ).toEqual(bytes);
    expect(
      new Headers(fetcher.mock.calls[2][1]?.headers).has("Authorization"),
    ).toBe(false);
    expect(fetcher.mock.calls[3][0]).toContain("/deliveries/letters");
    expect(
      JSON.parse(String(fetcher.mock.calls[3][1]?.body)).data.attributes
        .auto_send,
    ).toBe(false);
  });
  it("Pingen will not upload to arbitrary URLs returned in a malicious response", async () => {
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce(
        json({ access_token: "test-token", expires_in: 43200 }),
      )
      .mockResolvedValueOnce(
        json({
          data: {
            attributes: {
              url: "https://evil.example/file",
              url_signature: "x",
            },
          },
        }),
      );
    await expect(
      new PingenPostalProvider(pingenConfig, fetcher).prepareDocument({
        bytes: new TextEncoder().encode("%PDF-1.7"),
        filename: "x.pdf",
        addressPosition: "left",
        idempotencyKey: "test",
      }),
    ).rejects.toThrow("pingen_upload_origin_not_allowed");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("Pingen enforces reviewed address and cost before send", async () => {
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce(
        json({ access_token: "test-token", expires_in: 43200 }),
      )
      .mockResolvedValueOnce(json(letter))
      .mockResolvedValueOnce(
        json({ data: { attributes: { currency: "EUR", price: 2.01 } } }),
      );
    const provider = new PingenPostalProvider(pingenConfig, fetcher);
    expect(await provider.submit(postal)).toMatchObject({
      status: "rejected",
      errorCode: "postal_cost_requires_new_approval",
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    fetcher.mockResolvedValueOnce(json(letter));
    expect(
      await provider.submit({
        ...postal,
        expectedAddress: "Different recipient",
      }),
    ).toMatchObject({
      status: "rejected",
      errorCode: "postal_address_requires_new_approval",
    });
    expect(
      fetcher.mock.calls.some(([url]) => String(url).endsWith("/send")),
    ).toBe(false);
  });
  it("Pingen uses documented idempotency for send and retains provider ID on response loss", async () => {
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce(
        json({ access_token: "test-token", expires_in: 43200 }),
      )
      .mockResolvedValueOnce(json(letter))
      .mockResolvedValueOnce(
        json({ data: { attributes: { currency: "EUR", price: 1.23 } } }),
      )
      .mockRejectedValueOnce(new Error("response lost"));
    expect(
      await new PingenPostalProvider(pingenConfig, fetcher).submit(postal),
    ).toMatchObject({ status: "submission_unknown", providerId: "letter-1" });
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(
      new Headers(fetcher.mock.calls[3][1]?.headers).get("Idempotency-Key"),
    ).toBe("send-test-1");
    expect(fetcher.mock.calls[3][1]?.method).toBe("PATCH");
  });
  it("distinguishes a failed postal preflight from a potentially submitted letter", async () => {
    const fetcher = vi
      .fn<Fetcher>()
      .mockRejectedValueOnce(new Error("identity service unavailable"));
    expect(
      await new PingenPostalProvider(pingenConfig, fetcher).submit(postal),
    ).toEqual({
      status: "rejected",
      errorCode: "postal_preflight_unavailable",
      retryable: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).not.toContain("/send");
  });
  it("parses provider decimal money with exact digits and refuses unsupported precision", () => {
    expect(exactMinor("1.23", "EUR")).toEqual({ currency: "EUR", minor: 123 });
    expect(exactMinor("999999.99", "EUR").minor).toBe(99999999);
    expect(() => exactMinor("0.001", "EUR")).toThrow("invalid_decimal_amount");
  });
});

describe("cryptographically verified callbacks", () => {
  it("verifies Ed25519 over raw Telnyx bytes, refuses tamper/replay/account mismatch", async () => {
    const keys = (await crypto.subtle.generateKey("Ed25519", true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const rawKey = new Uint8Array(
      await crypto.subtle.exportKey("raw", keys.publicKey),
    );
    const keyBase64 = btoa(String.fromCharCode(...rawKey));
    const now = Date.now();
    const time = String(Math.floor(now / 1000));
    const body = JSON.stringify({
      data: {
        id: "evt-1",
        event_type: "fax.delivered",
        occurred_at: new Date(now).toISOString(),
        payload: { connection_id: "conn-1", fax_id: "fax-1" },
      },
    });
    const signature = new Uint8Array(
      await crypto.subtle.sign(
        "Ed25519",
        keys.privateKey,
        new TextEncoder().encode(`${time}|${body}`),
      ),
    );
    const headers = new Headers({
      "telnyx-timestamp": time,
      "telnyx-signature-ed25519": btoa(String.fromCharCode(...signature)),
    });
    expect(
      await verifyTelnyxWebhook(body, headers, keyBase64, "conn-1", now),
    ).toMatchObject({
      kind: "delivered",
      eventId: "evt-1",
      providerId: "fax-1",
    });
    await expect(
      verifyTelnyxWebhook(body + " ", headers, keyBase64, "conn-1", now),
    ).rejects.toThrow("invalid_signature");
    await expect(
      verifyTelnyxWebhook(body, headers, keyBase64, "conn-1", now + 600_000),
    ).rejects.toThrow("webhook_replay_window");
    await expect(
      verifyTelnyxWebhook(body, headers, keyBase64, "different", now),
    ).rejects.toThrow("unexpected_provider_account");
  });
  it("Pingen authenticates HMAC and distinguishes handover from delivery", async () => {
    const body = JSON.stringify({
      data: {
        id: "request-1",
        type: "webhook_sent",
        attributes: { created_at: "2026-09-16T12:00:00Z" },
        relationships: {
          organisation: { data: { id: "org-1" } },
          deliverable: { data: { id: "letter-1", type: "letters" } },
          event: { data: { id: "event-1" } },
        },
      },
    });
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode("test-secret"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = Array.from(
      new Uint8Array(
        await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
      ),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    expect(
      await verifyPingenWebhook(body, signature, "test-secret", "org-1"),
    ).toMatchObject({ kind: "handed_to_post", eventId: "event-1" });
    await expect(
      verifyPingenWebhook(
        body.replace("letter-1", "letter-2"),
        signature,
        "test-secret",
        "org-1",
      ),
    ).rejects.toThrow("invalid_signature");
    await expect(
      verifyPingenWebhook(body, signature, "test-secret", "org-2"),
    ).rejects.toThrow("unexpected_provider_account");
  });
  const topic = "arn:aws:sns:eu-west-1:123456789012:guteneo-test";
  const snsBase = {
    Type: "Notification",
    MessageId: "sns-event-1",
    TopicArn: topic,
    Timestamp: "2026-09-16T12:00:00Z",
    SignatureVersion: "2",
    SigningCertURL:
      "https://sns.eu-west-1.amazonaws.com/SimpleNotificationService-test.pem",
    Message: JSON.stringify({
      eventType: "Complaint",
      mail: {
        messageId: "ses-message-1",
        tags: { "guteneo-dispatch": ["dispatch-1"] },
      },
      complaint: { timestamp: "2026-09-16T12:00:00Z" },
    }),
  };
  it("verifies SNS RSA-SHA256 and late complaint facts with a local certificate fixture", async () => {
    const privateKey = readFileSync(
      new URL(
        "../../packages/providers/fixtures/sns-test-key.pem",
        import.meta.url,
      ),
      "utf8",
    );
    const cert = readFileSync(
      new URL(
        "../../packages/providers/fixtures/sns-test-cert.pem",
        import.meta.url,
      ),
      "utf8",
    );
    const signer = createSign("RSA-SHA256");
    signer.update(canonicalSnsMessage(snsBase));
    const body = JSON.stringify({
      ...snsBase,
      Signature: signer.sign(privateKey, "base64"),
    });
    const fetcher = vi
      .fn<Fetcher>()
      .mockImplementation(async () => new Response(cert));
    const message = await verifySnsWebhook(body, topic, fetcher);
    expect(normalizeSesEvent(message)).toMatchObject({
      provider: "ses",
      kind: "complained",
      dispatchId: "dispatch-1",
      providerId: "ses-message-1",
    });
    await expect(
      verifySnsWebhook(body.replace("Complaint", "Delivery"), topic, fetcher),
    ).rejects.toThrow("invalid_signature");
    expect(fetcher.mock.calls[0][1]?.redirect).toBe("manual");
  });
  it("rejects SNS certificate SSRF, wrong topic, old signature before any fetch", async () => {
    const fetcher = vi.fn<Fetcher>();
    for (const patch of [
      {
        SigningCertURL:
          "https://sns.eu-west-1.amazonaws.com.evil.example/SimpleNotificationService-test.pem",
      },
      {
        SigningCertURL:
          "https://sns.eu-west-1.amazonaws.com@evil.example/SimpleNotificationService-test.pem",
      },
      { TopicArn: "arn:aws:sns:eu-west-1:999999999999:guteneo-test" },
      { SignatureVersion: "1" },
    ])
      await expect(
        verifySnsWebhook(
          JSON.stringify({ ...snsBase, ...patch, Signature: "eA==" }),
          topic,
          fetcher,
        ),
      ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("canonicalizes SNS confirmation but never follows its SubscribeURL", () => {
    const confirmation = {
      ...snsBase,
      Type: "SubscriptionConfirmation",
      SubscribeURL:
        "https://sns.eu-west-1.amazonaws.com/?Action=ConfirmSubscription",
      Token: "fixture-token",
    };
    const canonical = canonicalSnsMessage(confirmation);
    expect(canonical.indexOf("SubscribeURL\n")).toBeLessThan(
      canonical.indexOf("Timestamp\n"),
    );
    expect(canonical.endsWith("Type\nSubscriptionConfirmation\n")).toBe(true);
  });
});
