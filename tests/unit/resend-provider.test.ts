import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  ResendEmailProvider,
  verifyResendWebhook,
  type EmailSubmission,
  type Fetcher,
} from "../../packages/providers";

const providerId = "56761188-7520-42d8-8898-ff6fc54ce618";
const config = {
  apiKey: "re_synthetic_test_credential",
  verifiedDomain: "example.invalid",
  authorizedSenders: ["Guteneo <sender@example.invalid>"],
  sandbox: false,
};
const input: EmailSubmission = {
  dispatchId: "dsp_52e9f3f0-0f55-473d-b3e9-a563ba2cf4ba",
  from: config.authorizedSenders[0],
  to: "recipient@example.invalid",
  subject: "Objet approuvé",
  html: "<p>Contenu exact approuvé.</p>",
  text: "Contenu exact approuvé.",
  purpose: "transactional",
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });

describe("Resend provider contract with synthetic fetch only", () => {
  it("sends one exact approved message with a stable idempotency key and inline attachment bytes", async () => {
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValue(json({ id: providerId }));
    const provider = new ResendEmailProvider(config, fetcher);
    const attachments: EmailSubmission["attachments"] = [
      {
        filename: "original.pdf",
        contentType: "application/pdf",
        bytes: new TextEncoder().encode("immutable-pdf-fixture"),
      },
    ];
    expect(await provider.submit({ ...input, attachments })).toEqual({
      status: "accepted",
      providerId,
      providerStatus: "accepted_by_resend",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(options).toMatchObject({ method: "POST", redirect: "manual" });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    const headers = new Headers(options?.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${config.apiKey}`);
    expect(headers.get("idempotency-key")).toBe(`guteneo/${input.dispatchId}`);
    expect(JSON.parse(String(options?.body))).toEqual({
      from: input.from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      tags: [
        { name: "guteneo-dispatch", value: input.dispatchId },
        { name: "guteneo-purpose", value: "transactional" },
      ],
      attachments: [
        {
          filename: "original.pdf",
          content_type: "application/pdf",
          content: btoa("immutable-pdf-fixture"),
        },
      ],
    });
    expect(provider.capabilities).toMatchObject({
      provider: "resend",
      mode: "live",
      submissionIdempotency: "24_hours",
      canReadStatus: false,
      canRequestCancellation: false,
    });
    expect(provider.estimate().amount).toBeNull();
    expect(await provider.cancel()).toEqual({ status: "unsupported" });
  });

  it.each([
    [
      new Error("private recipient and connection details"),
      "connection failure",
    ],
    [json({}, 200), "missing provider id"],
    [
      json({ id: "recipient@example.invalid" }),
      "private or malformed provider id",
    ],
    [
      new Response("<html>private</html>", { status: 200 }),
      "malformed response",
    ],
    [new Response("x".repeat(16_385)), "oversized response"],
    [json({ message: "private recipient" }, 302), "redirect"],
    [json({ message: "private recipient" }, 408), "timeout"],
    [json({ message: "private recipient" }, 409), "idempotency conflict"],
    [json({ message: "private recipient" }, 500), "server error"],
    [json({ message: "private recipient" }, 503), "unavailable"],
  ])(
    "preserves uncertain acceptance and never retries: %s %s",
    async (response, _scenario) => {
      const fetcher = vi.fn<Fetcher>();
      if (response instanceof Error) fetcher.mockRejectedValue(response);
      else fetcher.mockResolvedValue(response);
      expect(
        await new ResendEmailProvider(config, fetcher).submit(input),
      ).toEqual({
        status: "submission_unknown",
        errorCode: "RESEND_RESPONSE_UNKNOWN",
        retryable: false,
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    [400, "validation_error", "RESEND_REQUEST_REJECTED"],
    [401, "invalid_api_key", "RESEND_AUTHORIZATION_FAILED"],
    [403, "restricted_api_key", "RESEND_AUTHORIZATION_FAILED"],
    [422, "some_private_provider_error", "RESEND_REQUEST_REJECTED"],
    [429, "daily_quota_exceeded", "RESEND_DAILY_QUOTA_EXCEEDED"],
    [429, "monthly_quota_exceeded", "RESEND_MONTHLY_QUOTA_EXCEEDED"],
    [429, "rate_limit_exceeded", "RESEND_RATE_EXCEEDED"],
    [429, "toString", "RESEND_RATE_EXCEEDED"],
  ])(
    "projects only fixed error codes for HTTP %s / %s",
    async (status, name, errorCode) => {
      const fetcher = vi
        .fn<Fetcher>()
        .mockResolvedValue(
          json(
            { name, message: "recipient@example.invalid private-content" },
            status,
          ),
        );
      expect(
        await new ResendEmailProvider(config, fetcher).submit(input),
      ).toEqual({ status: "rejected", errorCode, retryable: false });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    { apiKey: "re_secret\nInjected" },
    { verifiedDomain: "https://example.invalid" },
    { authorizedSenders: [] },
    { authorizedSenders: ["sender@other.invalid"] },
    { authorizedSenders: ["sender@example.invalid\nBcc: other@other.invalid"] },
  ])("rejects invalid sender or credential configuration", (patch) => {
    expect(() => new ResendEmailProvider({ ...config, ...patch })).toThrow(
      /configuration_resend/,
    );
  });

  it.each([
    [
      { to: "recipient@example.invalid,other@example.invalid" },
      "invalid_email_recipient",
    ],
    [{ to: ".invalid@example.invalid" }, "invalid_email_recipient"],
    [{ to: "recipient@-invalid.example" }, "invalid_email_recipient"],
    [{ from: "sender@other.invalid" }, "sender_not_authorized"],
    [
      { from: "Different name <sender@example.invalid>" },
      "sender_not_authorized",
    ],
    [
      { subject: "Hello\r\nBcc: private@example.invalid" },
      "invalid_email_subject",
    ],
    [{ html: "" }, "invalid_email_content"],
    [{ dispatchId: "invalid:resend.tag" }, "invalid_dispatch_id"],
  ] as const)(
    "rejects unsafe messages before any request",
    async (patch, code) => {
      const fetcher = vi.fn<Fetcher>();
      expect(
        await new ResendEmailProvider(config, fetcher).submit({
          ...input,
          ...patch,
        }),
      ).toEqual({ status: "rejected", errorCode: code, retryable: false });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("rejects empty, oversized and unsafe attachments before submission", async () => {
    const fetcher = vi.fn<Fetcher>();
    const provider = new ResendEmailProvider(config, fetcher);
    for (const attachment of [
      {
        filename: "file.pdf",
        contentType: "application/pdf",
        bytes: new Uint8Array(),
      },
      {
        filename: "file.pdf",
        contentType: "application/pdf",
        bytes: new Uint8Array(20_000_001),
      },
      {
        filename: "../file.pdf",
        contentType: "application/pdf",
        bytes: new Uint8Array([1]),
      },
    ] as const) {
      expect(
        (await provider.submit({ ...input, attachments: [attachment] })).status,
      ).toBe("rejected");
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps marketing unsubscribe in the approved bodies and adds the one-click headers", async () => {
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValue(json({ id: providerId }));
    const provider = new ResendEmailProvider(config, fetcher);
    const unsubscribeUrl = "https://guteneo.example/unsubscribe/approved-token";
    const marketing: EmailSubmission = {
      ...input,
      purpose: "marketing",
      unsubscribeUrl,
      html: `<a href="${unsubscribeUrl}">Se désinscrire</a>`,
      text: `Se désinscrire : ${unsubscribeUrl}`,
    };
    expect(provider.validate({ ...marketing, text: "Absent" })).toContain(
      "marketing_unsubscribe_missing_from_approved_content",
    );
    expect(
      provider.validate({
        ...marketing,
        unsubscribeUrl: `${unsubscribeUrl}\r\nInjected`,
      }),
    ).toContain("marketing_unsubscribe_missing_from_approved_content");
    expect((await provider.submit(marketing)).status).toBe("accepted");
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body.headers).toEqual({
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    expect(body.html).toBe(marketing.html);
    expect(body.text).toBe(marketing.text);
  });

  it("restricts the test mode to documented Resend test recipients", async () => {
    const fetcher = vi.fn<Fetcher>();
    const provider = new ResendEmailProvider(
      { ...config, sandbox: true },
      fetcher,
    );
    expect((await provider.submit(input)).errorCode).toBe(
      "resend_test_recipient_required",
    );
    expect(fetcher).not.toHaveBeenCalled();
    for (const to of [
      "delivered@resend.dev",
      "bounced+test@resend.dev",
      "complained@resend.dev",
      "suppressed@resend.dev",
    ]) {
      expect(provider.validate({ ...input, to })).toEqual([]);
    }
    expect(
      provider.validate({ ...input, to: "suppressed+test@resend.dev" }),
    ).toContain("resend_test_recipient_required");
    expect(provider.capabilities.mode).toBe("sandbox");
  });

  it("retrieves status without exposing the response's private body and recipients", async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(
      json({
        id: providerId,
        last_event: "delivered",
        from: input.from,
        to: [input.to],
        html: input.html,
      }),
    );
    const provider = new ResendEmailProvider(
      { ...config, readApiKey: "re_explicit_read_credential" },
      fetcher,
    );
    const result = await provider.readStatus(providerId);
    expect(provider.capabilities.canReadStatus).toBe(true);
    expect(
      new Headers(fetcher.mock.calls[0][1]?.headers).get("authorization"),
    ).toBe("Bearer re_explicit_read_credential");
    expect(result).toEqual({
      providerId,
      providerStatus: "delivered",
      observedAt: expect.any(String),
      cost: null,
    });
    expect(fetcher.mock.calls[0][0]).toBe(
      `https://api.resend.com/emails/${providerId}`,
    );
    expect(fetcher.mock.calls[0][1]?.redirect).toBe("manual");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects mismatched reconciliation ids and unknown status text", async () => {
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce(json({ id: "other", last_event: "delivered" }))
      .mockResolvedValueOnce(
        json({ id: providerId, last_event: "private recipient details" }),
      );
    const provider = new ResendEmailProvider(
      { ...config, readApiKey: "re_explicit_read_credential" },
      fetcher,
    );
    await expect(provider.readStatus("../emails")).rejects.toThrow(
      "invalid_provider_id",
    );
    expect(fetcher).not.toHaveBeenCalled();
    await expect(provider.readStatus(providerId)).rejects.toThrow(
      "invalid_provider_response",
    );
    await expect(provider.readStatus(providerId)).rejects.toThrow(
      "invalid_provider_response",
    );
  });

  it("does not claim or request read capability with a sending-only key", async () => {
    const fetcher = vi.fn<Fetcher>();
    const provider = new ResendEmailProvider(config, fetcher);
    expect(provider.capabilities.canReadStatus).toBe(false);
    await expect(provider.readStatus(providerId)).rejects.toThrow(
      "resend_status_read_not_configured",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not expose malformed private content through status parser errors", async () => {
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValue(new Response("PRIVATE-BODY invalid JSON"));
    const provider = new ResendEmailProvider(
      { ...config, readApiKey: "re_explicit_read_credential" },
      fetcher,
    );
    await expect(provider.readStatus(providerId)).rejects.toThrow(
      "invalid_provider_response",
    );
  });
});

const now = Date.parse("2026-09-17T12:00:00Z");
const timestamp = String(now / 1000);
const secret = `whsec_${Buffer.from("synthetic-webhook-signing-secret").toString("base64")}`;
function signed(
  body: string,
  time = timestamp,
  id = "msg_synthetic_1",
  signingSecret = secret,
): Headers {
  const signature = createHmac(
    "sha256",
    Buffer.from(signingSecret.slice(6), "base64"),
  )
    .update(`${id}.${time}.${body}`)
    .digest("base64");
  return new Headers({
    "svix-id": id,
    "svix-timestamp": time,
    "svix-signature": `v1,${signature}`,
  });
}
function event(
  type = "email.delivered",
  patch: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    type,
    created_at: "2026-09-17T11:59:00Z",
    data: {
      email_id: providerId,
      from: input.from,
      to: [input.to],
      subject: input.subject,
      tags: {
        "guteneo-dispatch": input.dispatchId,
        "private-other-tag": "secret",
      },
      ...patch,
    },
  });
}

describe("Resend Svix webhook verification and minimal projection", () => {
  it.each([
    ["email.sent", "accepted"],
    ["email.delivered", "delivered"],
    ["email.bounced", "bounced"],
    ["email.complained", "complained"],
    ["email.failed", "failed"],
    ["email.suppressed", "failed"],
  ])(
    "projects %s to %s without retaining addresses or body",
    async (type, kind) => {
      const body = event(type);
      expect(
        await verifyResendWebhook(body, signed(body), secret, now),
      ).toEqual({
        provider: "resend",
        eventId: "msg_synthetic_1",
        providerId,
        dispatchId: input.dispatchId,
        kind,
        occurredAt: "2026-09-17T11:59:00.000Z",
        ...(type === "email.bounced"
          ? { payload: { bounceType: "Permanent" } }
          : {}),
        ...(type === "email.suppressed"
          ? { payload: { suppressionReason: "provider_suppression" } }
          : {}),
      });
    },
  );

  it.each([
    "email.delivery_delayed",
    "email.opened",
    "email.clicked",
    "email.received",
    "contact.created",
    "toString",
  ])("ignores %s after signature verification", async (type) => {
    const body = event(type);
    expect(
      await verifyResendWebhook(body, signed(body), secret, now),
    ).toBeNull();
  });

  it("matches the independent official Svix signing vector before validating the Resend schema", async () => {
    const body = '{"event_type":"ping","data":{"success":true}}';
    const headers = new Headers({
      "svix-id": "msg_loFOjxBNrRLzqYUf",
      "svix-timestamp": "1731705121",
      "svix-signature": "v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=",
    });
    await expect(
      verifyResendWebhook(
        body,
        headers,
        "whsec_plJ3nmyCDGBKInavdOK15jsl",
        1_731_705_121_000,
      ),
    ).rejects.toThrow("invalid_provider_response");
    await expect(
      verifyResendWebhook(
        `${body} `,
        headers,
        "whsec_plJ3nmyCDGBKInavdOK15jsl",
        1_731_705_121_000,
      ),
    ).rejects.toThrow("invalid_signature");
  });

  it("accepts a valid v1 signature among multiple rotation/version candidates", async () => {
    const body = event();
    const headers = signed(body);
    headers.set(
      "svix-signature",
      `v2,unsupported v1,${Buffer.alloc(32).toString("base64")} ${headers.get("svix-signature")}`,
    );
    expect((await verifyResendWebhook(body, headers, secret, now))?.kind).toBe(
      "delivered",
    );
  });

  it("rejects missing, tampered and different-secret signatures", async () => {
    const body = event();
    await expect(
      verifyResendWebhook(body, new Headers(), secret, now),
    ).rejects.toThrow("invalid_signature");
    await expect(
      verifyResendWebhook(`${body} `, signed(body), secret, now),
    ).rejects.toThrow("invalid_signature");
    await expect(
      verifyResendWebhook(
        body,
        signed(body),
        `whsec_${Buffer.from("different-secret").toString("base64")}`,
        now,
      ),
    ).rejects.toThrow("invalid_signature");
    const headers = signed(body);
    headers.set("svix-id", "msg_replaced");
    await expect(
      verifyResendWebhook(body, headers, secret, now),
    ).rejects.toThrow("invalid_signature");
    await expect(
      verifyResendWebhook(body, signed(body), "missing-prefix", now),
    ).rejects.toThrow("configuration_resend_webhook_secret");
  });

  it.each([-301, 301])(
    "rejects signed timestamps outside the 5-minute window (%s seconds)",
    async (offset) => {
      const body = event();
      await expect(
        verifyResendWebhook(
          body,
          signed(body, String(now / 1000 + offset)),
          secret,
          now,
        ),
      ).rejects.toThrow("webhook_replay_window");
    },
  );

  it("does not infer a dispatch from malformed tags and validates event metadata", async () => {
    const body = event("email.bounced", {
      tags: { "guteneo-dispatch": "recipient@example.invalid" },
    });
    expect(
      await verifyResendWebhook(body, signed(body), secret, now),
    ).not.toHaveProperty("dispatchId");
    const badId = event("email.bounced", {
      email_id: "private@example.invalid",
    });
    await expect(
      verifyResendWebhook(badId, signed(badId), secret, now),
    ).rejects.toThrow("invalid_provider_id");
    const badDate = JSON.stringify({
      type: "email.delivered",
      created_at: "invalid",
      data: { email_id: providerId },
    });
    await expect(
      verifyResendWebhook(badDate, signed(badDate), secret, now),
    ).rejects.toThrow("invalid_event_timestamp");
  });

  it("rejects malformed signed JSON and oversized callbacks with fixed codes", async () => {
    const body = "{ private-invalid-json";
    await expect(
      verifyResendWebhook(body, signed(body), secret, now),
    ).rejects.toThrow("invalid_provider_response");
    await expect(
      verifyResendWebhook("x".repeat(1_000_001), new Headers(), secret, now),
    ).rejects.toThrow("webhook_too_large");
  });
});
