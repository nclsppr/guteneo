import {
  afterAll,
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
import type { DomainService } from "../../packages/domain/src/index";

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
beforeEach(async () => {
  await db.prepare("DELETE FROM provider_receipts").run();
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
