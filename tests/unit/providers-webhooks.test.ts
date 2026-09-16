import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import {
  handleWebhook,
  reconcileWebhookReceipts,
} from "../../apps/api/src/webhooks";
import type { Env } from "../../apps/api/src/env";
import worker from "../../apps/api/src/index";
import { DomainService } from "../../packages/domain/src/index";
import { canonicalSnsMessage } from "../../packages/providers";

let mf: Miniflare;
let db: D1Database;
const configured = (database = db) =>
  ({
    DB: database,
    PINGEN_WEBHOOK_SECRET: "test-only-key",
    PINGEN_ORGANIZATION_ID: "provider-organisation",
  }) as Env;
const sink = (
  ingestEvent = vi
    .fn<DomainService["ingestEvent"]>()
    .mockResolvedValue({ applied: true, duplicate: false }),
) => ({ ingestEvent });
async function callback(
  type = "webhook_sent",
  id = "provider-event-1",
): Promise<Request> {
  const body = JSON.stringify({
    data: {
      type,
      attributes: { created_at: "2026-09-16T12:00:00Z" },
      relationships: {
        organisation: { data: { id: "provider-organisation" } },
        event: { data: { id } },
        deliverable: { data: { id: "provider-letter-1", type: "letters" } },
      },
    },
  });
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("test-only-key"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = Array.from(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  return new Request("https://guteneo.example/webhooks/pingen", {
    method: "POST",
    headers: { Signature: signature },
    body,
  });
}
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      d1Databases: ["DB"],
      compatibilityDate: "2026-09-16",
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  await db
    .prepare(
      "CREATE TABLE provider_receipts(provider TEXT NOT NULL,event_id TEXT NOT NULL,payload_json TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','projected','unrecognized')),received_at TEXT NOT NULL,PRIMARY KEY(provider,event_id))",
    )
    .run();
});
afterAll(async () => {
  await mf?.dispose();
});
afterEach(() => vi.restoreAllMocks());
beforeEach(async () => {
  await db.prepare("DELETE FROM provider_receipts").run();
});

const sesTopic = "arn:aws:sns:eu-west-1:123456789012:guteneo-test";
const sesCertificateUrl =
  "https://sns.eu-west-1.amazonaws.com/SimpleNotificationService-test.pem";
const sesEnvironment = () =>
  ({
    DB: db,
    ENVIRONMENT: "production",
    MODE: "production",
    APP_ORIGIN: "https://guteneo.example",
    SES_SNS_TOPIC_ARN: sesTopic,
  }) as Env;
function signedSns(
  type: "Notification" | "SubscriptionConfirmation",
  message: string,
) {
  const envelope = {
    Type: type,
    MessageId: "sns-signed-fixture-1",
    TopicArn: sesTopic,
    Timestamp: "2026-09-16T12:00:00Z",
    SignatureVersion: "2",
    SigningCertURL: sesCertificateUrl,
    Message: message,
    ...(type === "SubscriptionConfirmation"
      ? {
          Token: "public-test-confirmation-token",
          SubscribeURL:
            "https://sns.eu-west-1.amazonaws.com/?Action=ConfirmSubscription&Token=public-test-confirmation-token",
        }
      : {}),
  };
  const signer = createSign("RSA-SHA256");
  signer.update(canonicalSnsMessage(envelope));
  return {
    ...envelope,
    Signature: signer.sign(
      readFileSync(
        new URL(
          "../../packages/providers/fixtures/sns-test-key.pem",
          import.meta.url,
        ),
        "utf8",
      ),
      "base64",
    ),
  };
}
function snsCertificates() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    expect(String(url)).toBe(sesCertificateUrl);
    return new Response(
      readFileSync(
        new URL(
          "../../packages/providers/fixtures/sns-test-cert.pem",
          import.meta.url,
        ),
        "utf8",
      ),
    );
  });
}
const sesRequest = (body: unknown) =>
  new Request("https://guteneo.example/webhooks/ses", {
    method: "POST",
    headers: { "Content-Type": "text/plain; charset=UTF-8" },
    body: JSON.stringify(body),
  });

describe("signed SNS callbacks during identity setup", () => {
  it("stores signed confirmation once without exposing or following its URL", async () => {
    const network = snsCertificates();
    const message = signedSns("SubscriptionConfirmation", "Public fixture");
    for (let index = 0; index < 2; index++) {
      const response = await worker.fetch(
        sesRequest(message),
        sesEnvironment(),
        {} as ExecutionContext,
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ received: true });
    }
    const rows = await db
      .prepare("SELECT payload_json,status FROM provider_receipts")
      .all<{ payload_json: string; status: string }>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0].status).toBe("unrecognized");
    expect(JSON.parse(rows.results[0].payload_json)).toEqual({
      metadata: {
        type: "SubscriptionConfirmation",
        topicArn: sesTopic,
        occurredAt: "2026-09-16T12:00:00.000Z",
        confirmationToken: "public-test-confirmation-token",
      },
    });
    expect(rows.results[0].payload_json).not.toContain("SubscribeURL");
    expect(network).toHaveBeenCalledTimes(2);
    expect(
      network.mock.calls.every((call) => call[1]?.redirect === "manual"),
    ).toBe(true);
  });

  it("rejects unsigned, wrong-topic, version-one and oversized callbacks before storage", async () => {
    const diagnostics = vi.spyOn(console, "warn").mockImplementation(() => {});
    const network = snsCertificates();
    const message = signedSns("SubscriptionConfirmation", "Public fixture");
    for (const patch of [
      { TopicArn: "arn:aws:sns:eu-west-1:999999999999:guteneo-test" },
      { SignatureVersion: "1" },
      { SigningCertURL: "https://evil.example/certificate.pem" },
    ]) {
      const response = await worker.fetch(
        sesRequest({ ...message, ...patch }),
        sesEnvironment(),
        {} as ExecutionContext,
      );
      expect(response.status).toBe(401);
    }
    expect(network).not.toHaveBeenCalled();
    const forged = await worker.fetch(
      sesRequest({ ...message, Message: "Tampered after signing" }),
      sesEnvironment(),
      {} as ExecutionContext,
    );
    expect(forged.status).toBe(401);
    expect(network).toHaveBeenCalledTimes(1);
    const oversized = await worker.fetch(
      sesRequest({ padding: "x".repeat(1_000_001) }),
      sesEnvironment(),
      {} as ExecutionContext,
    );
    expect(oversized.status).toBe(413);
    expect(network).toHaveBeenCalledTimes(1);
    expect(
      (await db.prepare("SELECT count(*) n FROM provider_receipts").first())?.n,
    ).toBe(0);
    expect(diagnostics.mock.calls).toEqual(
      [
        "unexpected_sns_topic",
        "sns_signature_v2_required",
        "sns_certificate_url_not_allowed",
        "invalid_signature",
        "provider_response_too_large",
      ].map((code) => [
        JSON.stringify({ event: "sns_webhook_verification_failed", code }),
      ]),
    );
  });

  it("logs only fixed diagnostics for malformed private input and certificates", async () => {
    const diagnostics = vi.spyOn(console, "warn").mockImplementation(() => {});
    const message = signedSns(
      "SubscriptionConfirmation",
      "Private fixture recipient@example.test\nNever log this message",
    );
    const network = snsCertificates();
    network.mockResolvedValueOnce(new Response("Unusable certificate fixture"));
    const badCertificate = await worker.fetch(
      sesRequest(message),
      sesEnvironment(),
      {} as ExecutionContext,
    );
    expect(badCertificate.status).toBe(401);
    const invalidJson = await worker.fetch(
      new Request("https://guteneo.example/webhooks/ses", {
        method: "POST",
        body: JSON.stringify(message).slice(0, -1),
      }),
      sesEnvironment(),
      {} as ExecutionContext,
    );
    expect(invalidJson.status).toBe(401);
    expect(diagnostics.mock.calls).toEqual(
      ["sns_certificate_invalid", "invalid_webhook"].map((code) => [
        JSON.stringify({ event: "sns_webhook_verification_failed", code }),
      ]),
    );
    expect(
      (await db.prepare("SELECT count(*) n FROM provider_receipts").first())?.n,
    ).toBe(0);
  });

  it("reports a signed callback storage failure without logging private exception details", async () => {
    const diagnostics = vi.spyOn(console, "warn").mockImplementation(() => {});
    const network = snsCertificates();
    const prepare = vi.fn(() => {
      throw new Error("Private fixture recipient@example.test and token");
    });
    const domain = sink();
    const response = await handleWebhook(
      sesRequest(signedSns("SubscriptionConfirmation", "Public fixture")),
      {
        ...sesEnvironment(),
        DB: { prepare } as unknown as D1Database,
      },
      domain,
    );
    expect(response?.status).toBe(503);
    expect(await response?.json()).toEqual({
      error: { code: "WEBHOOK_STORAGE_UNAVAILABLE" },
    });
    expect(network).toHaveBeenCalledTimes(1);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(domain.ingestEvent).not.toHaveBeenCalled();
    expect(diagnostics.mock.calls).toEqual([
      [
        JSON.stringify({
          event: "sns_webhook_storage_failed",
          code: "webhook_storage_unavailable",
        }),
      ],
    ]);
  });

  it("recovers a verified rendering failure by cron without identity or outbox publication", async () => {
    snsCertificates();
    const ingest = vi
      .spyOn(DomainService.prototype, "ingestEvent")
      .mockRejectedValueOnce(new Error("Temporary projection outage"))
      .mockResolvedValue({ applied: true, duplicate: false });
    const publish = vi.spyOn(DomainService.prototype, "publishOutbox");
    const leases = vi.spyOn(DomainService.prototype, "reconcileExpiredLeases");
    const response = await worker.fetch(
      sesRequest(
        signedSns(
          "Notification",
          JSON.stringify({
            eventType: "Rendering Failure",
            mail: {
              messageId: "ses-message-fixture",
              tags: { "guteneo-dispatch": ["dispatch-fixture"] },
            },
            failure: { templateName: "fixture", errorMessage: "fixture" },
          }),
        ),
      ),
      sesEnvironment(),
      {} as ExecutionContext,
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      received: true,
      projection: "pending",
    });
    expect(ingest).toHaveBeenLastCalledWith(
      expect.objectContaining({
        provider: "ses",
        kind: "failed",
        providerId: "ses-message-fixture",
        dispatchId: "dispatch-fixture",
      }),
    );
    expect(
      (await db.prepare("SELECT status FROM provider_receipts").first())
        ?.status,
    ).toBe("pending");
    await worker.scheduled({} as ScheduledController, sesEnvironment());
    expect(
      (await db.prepare("SELECT status FROM provider_receipts").first())
        ?.status,
    ).toBe("projected");
    expect(ingest).toHaveBeenCalledTimes(2);
    expect(publish).not.toHaveBeenCalled();
    expect(leases).not.toHaveBeenCalled();
  });
});

describe("signed Telnyx callbacks during identity setup", () => {
  let keys: CryptoKeyPair;
  let publicKey: string;
  const connectionId = "telnyx-application-fixture";
  const environment = () =>
    ({
      DB: db,
      ENVIRONMENT: "production",
      MODE: "production",
      APP_ORIGIN: "https://guteneo.example",
      TELNYX_PUBLIC_KEY: publicKey,
      TELNYX_CONNECTION_ID: connectionId,
      LIVE_SENDS_ENABLED: "false",
    }) as Env;
  beforeAll(async () => {
    keys = (await crypto.subtle.generateKey("Ed25519", true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    publicKey = Buffer.from(
      await crypto.subtle.exportKey("raw", keys.publicKey),
    ).toString("base64");
  });
  async function signedCallback(
    options: {
      connectionId?: string;
      time?: number;
    } = {},
  ) {
    const now = options.time ?? Date.now();
    const timestamp = String(Math.floor(now / 1000));
    const body = JSON.stringify({
      data: {
        id: "telnyx-event-fixture",
        event_type: "fax.delivered",
        occurred_at: new Date(now).toISOString(),
        payload: {
          connection_id: options.connectionId ?? connectionId,
          fax_id: "fax-fixture",
        },
      },
    });
    const signature = await crypto.subtle.sign(
      "Ed25519",
      keys.privateKey,
      new TextEncoder().encode(`${timestamp}|${body}`),
    );
    return new Request("https://guteneo.example/webhooks/telnyx", {
      method: "POST",
      body,
      headers: {
        "telnyx-timestamp": timestamp,
        "telnyx-signature-ed25519": Buffer.from(signature).toString("base64"),
      },
    });
  }
  const receive = (request: Request, env = environment()) =>
    worker.fetch(request, env, {} as ExecutionContext);

  it("durably accepts a signed callback without Auth0 and projects it once", async () => {
    const ingest = vi
      .spyOn(DomainService.prototype, "ingestEvent")
      .mockImplementation(async () => {
        expect(
          (await db.prepare("SELECT status FROM provider_receipts").first())
            ?.status,
        ).toBe("pending");
        return { applied: true, duplicate: false };
      });
    const publish = vi.spyOn(DomainService.prototype, "publishOutbox");
    for (let index = 0; index < 2; index++) {
      const response = await receive(await signedCallback());
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ received: true });
    }
    expect(ingest).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        provider: "telnyx",
        kind: "delivered",
        eventId: "telnyx-event-fixture",
        providerId: "fax-fixture",
      }),
    );
    expect(publish).not.toHaveBeenCalled();
    const rows = await db
      .prepare("SELECT provider,status FROM provider_receipts")
      .all();
    expect(rows.results).toEqual([{ provider: "telnyx", status: "projected" }]);
  });

  it("rejects unsigned, tampered, expired and foreign-application callbacks before storage", async () => {
    const ingest = vi.spyOn(DomainService.prototype, "ingestEvent");
    const unsigned = await signedCallback();
    unsigned.headers.delete("telnyx-signature-ed25519");
    const original = await signedCallback();
    const tampered = new Request(original.url, {
      method: "POST",
      headers: original.headers,
      body: `${await original.text()} `,
    });
    for (const request of [
      unsigned,
      tampered,
      await signedCallback({ time: Date.now() - 600_000 }),
      await signedCallback({ connectionId: "foreign-application" }),
    ]) {
      const response = await receive(request);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: { code: "WEBHOOK_REJECTED" },
      });
    }
    expect(ingest).not.toHaveBeenCalled();
    expect(
      (await db.prepare("SELECT count(*) n FROM provider_receipts").first())?.n,
    ).toBe(0);
  });

  it("keeps absent or invalid verification configuration closed", async () => {
    for (const patch of [
      { TELNYX_PUBLIC_KEY: undefined },
      { TELNYX_PUBLIC_KEY: "" },
    ]) {
      const response = await receive(await signedCallback(), {
        ...environment(),
        ...patch,
      });
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: {
          code: "CONFIGURATION_INVALID",
          message: "Configuration du service invalide.",
        },
      });
    }
    const missingApplication = await receive(await signedCallback(), {
      ...environment(),
      TELNYX_CONNECTION_ID: undefined,
    });
    expect(missingApplication.status).toBe(503);
    expect(await missingApplication.json()).toEqual({
      error: { code: "WEBHOOK_UNAVAILABLE" },
    });
    const invalidKey = await receive(await signedCallback(), {
      ...environment(),
      TELNYX_PUBLIC_KEY: "invalid-public-key",
    });
    expect(invalidKey.status).toBe(401);
    expect(await invalidKey.json()).toEqual({
      error: { code: "WEBHOOK_REJECTED" },
    });
    expect(
      (await db.prepare("SELECT count(*) n FROM provider_receipts").first())?.n,
    ).toBe(0);
  });
});

describe("webhook HTTP boundary with actual local D1", () => {
  it("persists a verified receipt before ingestion/ACK and deduplicates repeated callbacks", async () => {
    const domain = sink(
      vi
        .fn<DomainService["ingestEvent"]>()
        .mockImplementation(async (event) => {
          const receipt = await db
            .prepare(
              "SELECT payload_json,status FROM provider_receipts WHERE provider=? AND event_id=?",
            )
            .bind(event.provider, event.eventId)
            .first<{ payload_json: string; status: string }>();
          expect(receipt?.status).toBe("pending");
          expect(JSON.parse(receipt!.payload_json).event.kind).toBe(
            "handed_to_post",
          );
          return { applied: false, orphan: true, duplicate: false };
        }),
    );
    expect(
      (await handleWebhook(await callback(), configured(), domain))?.status,
    ).toBe(200);
    expect(
      (await handleWebhook(await callback(), configured(), domain))?.status,
    ).toBe(200);
    expect(domain.ingestEvent).toHaveBeenCalledTimes(1);
    expect(
      (await db.prepare("SELECT status FROM provider_receipts").first())
        ?.status,
    ).toBe("projected");
  });
  it("recovers projection failure from its durable receipt without another provider callback", async () => {
    const failing = sink(
      vi
        .fn<DomainService["ingestEvent"]>()
        .mockRejectedValue(new Error("projection outage")),
    );
    expect(
      (await handleWebhook(await callback(), configured(), failing))?.status,
    ).toBe(202);
    expect(
      (await db.prepare("SELECT status FROM provider_receipts").first())
        ?.status,
    ).toBe("pending");
    const recovered = sink();
    expect(await reconcileWebhookReceipts(db, recovered)).toEqual({
      projected: 1,
      pending: 0,
    });
    expect(recovered.ingestEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "provider-letter-1",
        eventId: "provider-event-1",
      }),
    );
  });
  it("refuses ACK when durable storage fails", async () => {
    const brokenDb = {
      prepare: () => {
        throw new Error("database unavailable");
      },
    } as unknown as D1Database;
    const domain = sink();
    expect(
      (await handleWebhook(await callback(), configured(brokenDb), domain))
        ?.status,
    ).toBe(503);
    expect(domain.ingestEvent).not.toHaveBeenCalled();
  });
  it("rejects signature tampering before any receipt and preserves unknown event metadata", async () => {
    const request = await callback();
    request.headers.set("Signature", "0".repeat(64));
    expect((await handleWebhook(request, configured(), sink()))?.status).toBe(
      401,
    );
    expect(
      (await db.prepare("SELECT count(*) AS n FROM provider_receipts").first())
        ?.n,
    ).toBe(0);
    expect(
      (
        await handleWebhook(
          await callback("webhook_issues"),
          configured(),
          sink(),
        )
      )?.status,
    ).toBe(200);
    const receipt = await db
      .prepare("SELECT status,payload_json FROM provider_receipts")
      .first<{ status: string; payload_json: string }>();
    expect(receipt?.status).toBe("unrecognized");
    expect(JSON.parse(receipt!.payload_json)).toEqual({
      metadata: { type: "webhook_issues", providerId: "provider-letter-1" },
    });
  });
});
