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
import {
  CustomerWebhookService,
  customerWebhookCapabilities,
  customerWebhookDestination,
  processCustomerWebhooks,
} from "../../apps/api/src/customer-webhooks";
import {
  DomainService,
  type ActorContext,
} from "../../packages/domain/src/index";
import type { Env } from "../../apps/api/src/env";
import { migratedD1 } from "../helpers/migrated-d1";

let fixture: Awaited<ReturnType<typeof migratedD1>>,
  domain: DomainService,
  service: CustomerWebhookService;
const time = () => new Date().toISOString();
const ctx: ActorContext = {
  organizationId: "webhooks-org",
  userId: "webhooks-admin",
  role: "admin",
  actor: "browser",
  documentSessionHash: "a".repeat(64),
};
const other: ActorContext = {
  organizationId: "webhooks-other",
  userId: "webhooks-other-admin",
  role: "admin",
  actor: "browser",
  documentSessionHash: "b".repeat(64),
};
const env = (overrides: Record<string, unknown> = {}) =>
  ({
    DB: fixture.db,
    ENVIRONMENT: "production",
    MODE: "production",
    CUSTOMER_WEBHOOKS_ENABLED: "true",
    GLOBAL_FETCH_STRICTLY_PUBLIC: "true",
    CUSTOMER_WEBHOOK_ENCRYPTION_KEY: "12".repeat(32),
    ...overrides,
  }) as unknown as Env;
const input = {
  name: "Synthetic metadata callback",
  url: "https://callback.synthetic-customer.org/events",
  revealSigningSecret: true,
};
const fetcher = () =>
  vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
const records = async () =>
  (
    await fixture.db
      .prepare(
        "SELECT * FROM customer_webhook_deliveries ORDER BY occurred_at,id",
      )
      .all<Record<string, unknown>>()
  ).results;
async function configured() {
  const created = await service.create(ctx, input, crypto.randomUUID());
  const active = await service.update(ctx, created.endpoint.id, {
    revision: created.endpoint.revision,
    enabled: true,
  });
  return { endpoint: active, secret: created.signingSecret! };
}
async function source(
  organizationId = ctx.organizationId,
  mode = "production",
) {
  const id = `dispatch_${crypto.randomUUID()}`,
    now = time();
  // Synthetic prepared metadata only: no approval, quota, outbox or provider invocation.
  await fixture.db
    .prepare(
      "INSERT INTO dispatches(id,organization_id,channel,recipient_json,sender_id,sender_address,subject,text,options_json,status,mode,estimated_minor,ceiling_minor,currency,fingerprint,prepare_key,request_hash,created_at,updated_at) VALUES(?,?,'email','{\"email\":\"private-recipient@example.invalid\"}',?,'private-sender@example.invalid','PRIVATE SUBJECT','PRIVATE BODY','{}','prepared',?,0,0,'EUR','synthetic',?,?,?,?)",
    )
    .bind(
      id,
      organizationId,
      `${organizationId}-${mode}-sender`,
      mode,
      id,
      id,
      now,
      now,
    )
    .run();
  return id;
}
beforeAll(async () => {
  fixture = await migratedD1("customer-webhooks");
  for (const actor of [ctx, other]) {
    await fixture.db
      .prepare(
        "INSERT INTO organizations(id,name,mode,created_at) VALUES(?,'Synthetic callbacks','production',?)",
      )
      .bind(actor.organizationId, time())
      .run();
    await fixture.db
      .prepare(
        "INSERT INTO users(id,name,email,created_at) VALUES(?,'Synthetic administrator',?,?)",
      )
      .bind(actor.userId, `${actor.userId}@example.invalid`, time())
      .run();
    await fixture.db
      .prepare(
        "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
      )
      .bind(actor.organizationId, actor.userId, time())
      .run();
    for (const mode of ["production", "simulation"])
      await fixture.db
        .prepare(
          "INSERT INTO senders(id,organization_id,channel,name,address,status,mode,created_at) VALUES(?,?,'email','Synthetic sender','private-sender@example.invalid','verified',?,?)",
        )
        .bind(
          `${actor.organizationId}-${mode}-sender`,
          actor.organizationId,
          mode,
          time(),
        )
        .run();
    await fixture.db
      .prepare(
        "INSERT INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at) VALUES(?,?,?,'synthetic',1,0,?,'2099-01-01T00:00:00.000Z')",
      )
      .bind(
        actor.documentSessionHash,
        actor.userId,
        actor.organizationId,
        time(),
      )
      .run();
  }
  domain = new DomainService(fixture.db, { mode: "production" });
});
beforeEach(async () => {
  await fixture.db.exec("DROP TRIGGER IF EXISTS webhook_revoke_after_claim");
  await fixture.db.exec("DROP TRIGGER IF EXISTS webhook_reject_ack");
  await fixture.db.batch([
    fixture.db.prepare("DELETE FROM customer_webhook_deliveries"),
    fixture.db.prepare("DELETE FROM customer_webhook_endpoints"),
    fixture.db.prepare("DELETE FROM account_deletion_requests"),
    fixture.db.prepare("DELETE FROM dispatches"),
    fixture.db.prepare("UPDATE memberships SET role='admin'"),
    fixture.db.prepare(
      "UPDATE browser_sessions SET expires_at='2099-01-01T00:00:00.000Z',is_development=0",
    ),
  ]);
  service = new CustomerWebhookService(env(), domain);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Real network is forbidden in synthetic webhook tests");
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
afterAll(async () => fixture?.mf.dispose());

describe("opt-in customer lifecycle callbacks", () => {
  it("creates paused with one explicit signing-secret reveal; idempotent recovery and reads never reveal it again", async () => {
    const key = crypto.randomUUID(),
      created = await service.create(ctx, input, key);
    expect(created.endpoint).toMatchObject({
      enabled: false,
      revision: 1,
      status: "active",
      overflowCount: 0,
    });
    expect(created.signingSecret).toMatch(/^cwhsec_[A-Za-z0-9_-]{43}$/);
    expect(await service.create(ctx, input, key)).toEqual({
      endpoint: created.endpoint,
    });
    expect(JSON.stringify(await service.list(ctx))).not.toContain(
      created.signingSecret,
    );
    const raw = await fixture.db
      .prepare(
        "SELECT secret_ciphertext FROM customer_webhook_endpoints WHERE id=?",
      )
      .bind(created.endpoint.id)
      .first<{ secret_ciphertext: string }>();
    expect(raw!.secret_ciphertext).not.toContain(created.signingSecret);
    await expect(
      service.create(ctx, { ...input, name: "Changed" }, key),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect((await service.list(ctx)).items).toHaveLength(1);
  });
  it.each([
    "http://callback.customer.org",
    "https://127.0.0.1/hook",
    "https://[::1]/hook",
    "https://2130706433/",
    "https://host.local/hook",
    "https://localhost/hook",
    "https://private.internal/hook",
    "https://customer.test/hook",
    "https://user:secret@customer.org/hook",
    "https://customer.org:8443/hook",
    "https://customer.org/hook?token=secret",
    "https://customer.org/hook?",
    "https://customer.org/hook#fragment",
  ])("refuses unsafe destination %s before any request", (url) => {
    expect(() => customerWebhookDestination(url)).toThrow();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it("requires current browser administrator, exact tenant and live session at configuration/read time", async () => {
    const created = await service.create(ctx, input, crypto.randomUUID());
    await expect(service.get(other, created.endpoint.id)).rejects.toMatchObject(
      { code: "NOT_FOUND" },
    );
    for (const actor of ["mcp", "native", "system"] as const)
      await expect(service.list({ ...ctx, actor })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    await expect(
      service.list({ ...ctx, role: "viewer" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await fixture.db
      .prepare(
        "UPDATE browser_sessions SET expires_at='2000-01-01T00:00:00.000Z' WHERE token_hash=?",
      )
      .bind(ctx.documentSessionHash)
      .run();
    await expect(
      service.update(ctx, created.endpoint.id, { revision: 1, enabled: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it.each([
    { CUSTOMER_WEBHOOKS_ENABLED: undefined },
    { GLOBAL_FETCH_STRICTLY_PUBLIC: undefined },
    { ENVIRONMENT: "local" },
    { MODE: "simulation" },
    { CUSTOMER_WEBHOOK_ENCRYPTION_KEY: undefined },
  ])("fails closed with missing runtime activation %j", async (overrides) => {
    const hook = await configured();
    await source();
    const outgoing = fetcher();
    expect(customerWebhookCapabilities(env(overrides)).enabled).toBe(false);
    await processCustomerWebhooks(env(overrides), domain, { fetch: outgoing });
    expect(outgoing).not.toHaveBeenCalled();
    expect((await records())[0].status).toBe("pending");
    await expect(
      new CustomerWebhookService(env(overrides), domain).update(
        ctx,
        hook.endpoint.id,
        { revision: 2, enabled: true },
      ),
    ).rejects.toMatchObject({ code: "WEBHOOKS_UNAVAILABLE" });
  });
  it("captures atomic production metadata and signs exact bytes without private content or recipients", async () => {
    const hook = await configured(),
      id = await source(),
      outgoing = fetcher();
    const original = (await records())[0];
    const result = await processCustomerWebhooks(env(), domain, {
      fetch: outgoing,
    });
    expect(result.customerWebhooksSent).toBe(1);
    expect(outgoing).toHaveBeenCalledTimes(1);
    const request = new Request(...outgoing.mock.calls[0]),
      body = await request.text(),
      payload = JSON.parse(body);
    expect(request.redirect).toBe("manual");
    expect(request.method).toBe("POST");
    expect(payload).toMatchObject({
      id: original.event_id,
      type: "dispatch.status_changed",
      organizationId: ctx.organizationId,
      data: {
        dispatchId: id,
        status: "prepared",
        mode: "production",
        channel: "email",
      },
    });
    expect(Object.keys(payload.data).sort()).toEqual([
      "channel",
      "dispatchId",
      "mode",
      "status",
    ]);
    for (const privateValue of [
      "private-recipient",
      "private-sender",
      "PRIVATE SUBJECT",
      "PRIVATE BODY",
      hook.secret,
    ])
      expect(body).not.toContain(privateValue);
    const timestamp = request.headers.get("Guteneo-Webhook-Timestamp"),
      eventId = request.headers.get("Guteneo-Webhook-Id");
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(hook.secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const signature = Uint8Array.from(
      request.headers.get("Guteneo-Webhook-Signature")!.slice(3).match(/../g)!,
      (value) => parseInt(value, 16),
    );
    expect(
      await crypto.subtle.verify(
        "HMAC",
        key,
        signature,
        new TextEncoder().encode(`${timestamp}.${eventId}.${body}`),
      ),
    ).toBe(true);
    await processCustomerWebhooks(env(), domain, { fetch: outgoing });
    expect(outgoing).toHaveBeenCalledTimes(1);
    expect((await records())[0]).toMatchObject({
      status: "sent",
      event_id: original.event_id,
      response_status: 204,
    });
  });
  it("never records simulation dispatches or another tenant without an enabled endpoint", async () => {
    await configured();
    await source(ctx.organizationId, "simulation");
    await source(other.organizationId);
    expect(await records()).toEqual([]);
  });
  it("claims one invocation across concurrent processors and refuses automatic retries after unknown outcome", async () => {
    await configured();
    await source();
    const outgoing = vi.fn<typeof fetch>(async () => {
      throw new Error("PRIVATE TRANSPORT DETAILS MUST NEVER PERSIST");
    });
    await Promise.all([
      processCustomerWebhooks(env(), domain, { fetch: outgoing }),
      processCustomerWebhooks(env(), domain, { fetch: outgoing }),
    ]);
    expect(outgoing).toHaveBeenCalledTimes(1);
    expect((await records())[0]).toMatchObject({
      status: "unknown",
      error_code: "transport_outcome_unknown",
    });
    await processCustomerWebhooks(env(), domain, { fetch: outgoing });
    expect(outgoing).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(await records())).not.toContain("PRIVATE TRANSPORT");
    await expect(
      fixture.db
        .prepare("UPDATE customer_webhook_deliveries SET status='pending'")
        .run(),
    ).rejects.toThrow(/customer_webhook_transition_invalid/);
  });
  it("rejects redirects and HTTP rejection without following or retrying them", async () => {
    await configured();
    await source();
    const outgoing = vi.fn<typeof fetch>(
      async () =>
        new Response(null, {
          status: 302,
          headers: { Location: "http://127.0.0.1/private" },
        }),
    );
    await processCustomerWebhooks(env(), domain, { fetch: outgoing });
    expect(outgoing).toHaveBeenCalledTimes(1);
    expect((await records())[0]).toMatchObject({
      status: "failed",
      error_code: "redirect_refused",
      response_status: 302,
    });
    await processCustomerWebhooks(env(), domain, { fetch: outgoing });
    expect(outgoing).toHaveBeenCalledTimes(1);
  });
  it("revision changes and secret rotation supersede pending events, pause changed destinations and reveal no previous secret", async () => {
    const hook = await configured();
    await source();
    const updated = await service.update(ctx, hook.endpoint.id, {
      revision: 2,
      url: "https://other.synthetic-customer.org/events",
    });
    expect(updated).toMatchObject({
      revision: 3,
      enabled: false,
      deliveryCounts: { superseded: 1 },
    });
    await expect(
      service.update(ctx, hook.endpoint.id, { revision: 2, enabled: true }),
    ).rejects.toMatchObject({ code: "WEBHOOK_CHANGED" });
    const rotated = await service.rotateSecret(ctx, hook.endpoint.id, {
      revision: 3,
      revealSigningSecret: true,
    });
    expect(rotated.signingSecret).not.toBe(hook.secret);
    expect(rotated.endpoint).toMatchObject({ revision: 4, enabled: false });
    const revoked = await service.revoke(ctx, hook.endpoint.id, {
      revision: 4,
    });
    expect(revoked).toMatchObject({
      status: "revoked",
      revision: 5,
      enabled: false,
    });
    const outgoing = fetcher();
    await processCustomerWebhooks(env(), domain, { fetch: outgoing });
    expect(outgoing).not.toHaveBeenCalled();
    expect(
      (await fixture.db
        .prepare(
          "SELECT secret_ciphertext FROM customer_webhook_endpoints WHERE id=?",
        )
        .bind(hook.endpoint.id)
        .first<{ secret_ciphertext: string | null }>())!.secret_ciphertext,
    ).toBeNull();
  });
  it("rechecks administrator authority between lease claim and irreversible invocation", async () => {
    await configured();
    await source();
    await fixture.db
      .prepare(
        "INSERT OR IGNORE INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
      )
      .bind(ctx.organizationId, other.userId, time())
      .run();
    await fixture.db.exec(
      "CREATE TRIGGER webhook_revoke_after_claim AFTER UPDATE OF status ON customer_webhook_deliveries WHEN NEW.status='sending' BEGIN UPDATE memberships SET role='viewer' WHERE organization_id=NEW.organization_id AND user_id='webhooks-admin'; END;",
    );
    const outgoing = fetcher();
    await processCustomerWebhooks(env(), domain, { fetch: outgoing });
    expect(outgoing).not.toHaveBeenCalled();
    expect((await records())[0]).toMatchObject({
      status: "failed",
      invoked_at: null,
      error_code: "preflight_refused",
    });
  });
  it("processing account deletion invalidates pending authority before invocation", async () => {
    await configured();
    await source();
    await fixture.db
      .prepare(
        "INSERT INTO account_deletion_requests(id,user_id,organization_id,status,created_at,updated_at) VALUES('webhook-deleting',?,?,'processing',?,?)",
      )
      .bind(ctx.userId, ctx.organizationId, time(), time())
      .run();
    const outgoing = fetcher();
    await processCustomerWebhooks(env(), domain, { fetch: outgoing });
    expect(outgoing).not.toHaveBeenCalled();
    expect((await records())[0].status).toBe("superseded");
  });
  it("an expired invoked lease becomes unknown; an uninvoked lease closes safely without replay", async () => {
    await configured();
    await source();
    await source();
    const rows = await records();
    await fixture.db
      .prepare(
        "UPDATE customer_webhook_deliveries SET status='sending',lease_token='interrupted',lease_until='2000-01-01T00:00:00.000Z',invoked_at=CASE WHEN id=? THEN '2000-01-01T00:00:00.000Z' ELSE NULL END",
      )
      .bind(rows[0].id)
      .run();
    const outgoing = fetcher(),
      counts = await processCustomerWebhooks(env(), domain, {
        fetch: outgoing,
      });
    expect(outgoing).not.toHaveBeenCalled();
    expect(counts).toMatchObject({
      customerWebhooksUnknown: 1,
      customerWebhooksFailed: 1,
    });
    expect((await records()).map((row) => row.status).sort()).toEqual([
      "failed",
      "unknown",
    ]);
  });
  it("caps pending callbacks without interrupting source dispatch creation and exposes queue gaps", async () => {
    const hook = await configured(),
      id = await source();
    const original = (await records())[0];
    const insert = fixture.db.prepare(
      "INSERT INTO customer_webhook_deliveries(id,organization_id,endpoint_id,endpoint_revision,event_id,dispatch_id,dispatch_status,channel,occurred_at) VALUES(?,?,?,?,?,?,'prepared','email',?)",
    );
    for (let offset = 1; offset < 500; offset += 50) {
      await fixture.db.batch(
        Array.from({ length: Math.min(50, 500 - offset) }, (_, index) =>
          insert.bind(
            `capacity_${offset + index}`,
            ctx.organizationId,
            hook.endpoint.id,
            2,
            `event_${offset + index}`,
            id,
            original.occurred_at,
          ),
        ),
      );
    }
    await source();
    expect(
      await fixture.db
        .prepare("SELECT count(*) AS n FROM dispatches")
        .first<{ n: number }>(),
    ).toEqual({ n: 2 });
    expect(await service.get(ctx, hook.endpoint.id)).toMatchObject({
      overflowCount: 1,
      deliveryCounts: { pending: 500 },
    });
    const page = await service.deliveries(ctx, hook.endpoint.id, undefined, 2);
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeTruthy();
    expect(
      (await service.deliveries(ctx, hook.endpoint.id, page.nextCursor!, 2))
        .items[0].id,
    ).not.toBe(page.items[0].id);
  });
  it("retains intermediate status transitions that occur before the callback processor runs", async () => {
    await configured();
    const id = await source();
    await fixture.db
      .prepare(
        "UPDATE dispatches SET status='cancelled',updated_at=? WHERE id=?",
      )
      .bind(time(), id)
      .run();
    expect((await records()).map((row) => row.dispatch_status).sort()).toEqual([
      "cancelled",
      "prepared",
    ]);
    const outgoing = fetcher();
    await processCustomerWebhooks(env(), domain, { fetch: outgoing });
    const events = await Promise.all(
      outgoing.mock.calls.map(
        async (call) =>
          (await new Request(...call).json()) as {
            id: string;
            data: { status: string };
          },
      ),
    );
    expect(events.map((event) => event.data.status).sort()).toEqual([
      "cancelled",
      "prepared",
    ]);
    expect(new Set(events.map((event) => event.id)).size).toBe(2);
  });
  it("history is chronological and rejects malformed cursor data", async () => {
    const hook = await configured();
    await source();
    await source();
    const page = await service.deliveries(ctx, hook.endpoint.id, undefined, 1);
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeTruthy();
    const next = await service.deliveries(
      ctx,
      hook.endpoint.id,
      page.nextCursor!,
      1,
    );
    expect(next.items[0].id).not.toBe(page.items[0].id);
    expect(page.items[0].occurredAt >= next.items[0].occurredAt).toBe(true);
    await expect(
      service.deliveries(ctx, hook.endpoint.id, "invalid-json"),
    ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
  });
  it("deadline bounds an uncooperative transport and leaves one unknown attempt without replay", async () => {
    await configured();
    await source();
    const outgoing = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}));
    const started = Date.now();
    await processCustomerWebhooks(env(), domain, { fetch: outgoing });
    expect(Date.now() - started).toBeLessThan(7000);
    expect((await records())[0]).toMatchObject({
      status: "unknown",
      error_code: "transport_outcome_unknown",
    });
    await processCustomerWebhooks(env(), domain, { fetch: outgoing });
    expect(outgoing).toHaveBeenCalledTimes(1);
  });
  it("retains uncertainty when persisting an acknowledged response fails and never invokes again", async () => {
    await configured();
    await source();
    await fixture.db.exec(
      "CREATE TRIGGER webhook_reject_ack BEFORE UPDATE OF status ON customer_webhook_deliveries WHEN NEW.status='sent' BEGIN SELECT RAISE(ABORT,'synthetic_receipt_write_failure'); END;",
    );
    const outgoing = fetcher();
    expect(
      (await processCustomerWebhooks(env(), domain, { fetch: outgoing }))
        .customerWebhooksUnknown,
    ).toBe(1);
    expect((await records())[0]).toMatchObject({
      status: "unknown",
      error_code: "transport_outcome_unknown",
    });
    await processCustomerWebhooks(env(), domain, { fetch: outgoing });
    expect(outgoing).toHaveBeenCalledTimes(1);
  });
  it("encrypted signing material is bound to its exact tenant endpoint and cannot be transplanted", async () => {
    const first = await configured();
    const second = await service.create(other, input, crypto.randomUUID());
    await service.update(other, second.endpoint.id, {
      revision: 1,
      enabled: true,
    });
    const ciphertext = await fixture.db
      .prepare(
        "SELECT secret_ciphertext FROM customer_webhook_endpoints WHERE id=?",
      )
      .bind(first.endpoint.id)
      .first<{ secret_ciphertext: string }>();
    await fixture.db
      .prepare(
        "UPDATE customer_webhook_endpoints SET secret_ciphertext=?,revision=revision+1 WHERE id=?",
      )
      .bind(ciphertext!.secret_ciphertext, second.endpoint.id)
      .run();
    await source(other.organizationId);
    const outgoing = fetcher();
    await processCustomerWebhooks(env(), domain, { fetch: outgoing });
    expect(outgoing).not.toHaveBeenCalled();
    expect((await records())[0]).toMatchObject({
      status: "failed",
      invoked_at: null,
      error_code: "preflight_refused",
    });
  });
  it("authority changes invalidate a paused endpoint's stale enable revision too", async () => {
    const created = await service.create(ctx, input, crypto.randomUUID());
    await fixture.db
      .prepare(
        "INSERT OR IGNORE INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
      )
      .bind(ctx.organizationId, other.userId, time())
      .run();
    await fixture.db
      .prepare(
        "UPDATE memberships SET role='viewer' WHERE organization_id=? AND user_id=?",
      )
      .bind(ctx.organizationId, ctx.userId)
      .run();
    await fixture.db
      .prepare(
        "UPDATE memberships SET role='admin' WHERE organization_id=? AND user_id=?",
      )
      .bind(ctx.organizationId, ctx.userId)
      .run();
    await expect(
      service.update(ctx, created.endpoint.id, { revision: 1, enabled: true }),
    ).rejects.toMatchObject({ code: "WEBHOOK_CHANGED" });
    expect(await service.get(ctx, created.endpoint.id)).toMatchObject({
      enabled: false,
      revision: 2,
    });
  });
  it.each(["downgrade", "removal", "workspace_mode"] as const)(
    "%s and restoration cannot revive an old outbound grant",
    async (change) => {
      const hook = await configured();
      await source();
      await fixture.db
        .prepare(
          "INSERT OR IGNORE INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
        )
        .bind(ctx.organizationId, other.userId, time())
        .run();
      if (change === "downgrade") {
        await fixture.db
          .prepare(
            "UPDATE memberships SET role='viewer' WHERE organization_id=? AND user_id=?",
          )
          .bind(ctx.organizationId, ctx.userId)
          .run();
        await fixture.db
          .prepare(
            "UPDATE memberships SET role='admin' WHERE organization_id=? AND user_id=?",
          )
          .bind(ctx.organizationId, ctx.userId)
          .run();
      } else if (change === "removal") {
        await fixture.db
          .prepare(
            "DELETE FROM browser_sessions WHERE user_id=? AND organization_id=?",
          )
          .bind(ctx.userId, ctx.organizationId)
          .run();
        await fixture.db
          .prepare(
            "DELETE FROM memberships WHERE user_id=? AND organization_id=?",
          )
          .bind(ctx.userId, ctx.organizationId)
          .run();
        await fixture.db
          .prepare(
            "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
          )
          .bind(ctx.organizationId, ctx.userId, time())
          .run();
        await fixture.db
          .prepare(
            "INSERT INTO browser_sessions(token_hash,user_id,organization_id,csrf_token,mfa,is_development,created_at,expires_at) VALUES(?,?,?,'synthetic',1,0,?,'2099-01-01T00:00:00.000Z')",
          )
          .bind(ctx.documentSessionHash, ctx.userId, ctx.organizationId, time())
          .run();
      } else {
        await fixture.db
          .prepare("UPDATE organizations SET mode='simulation' WHERE id=?")
          .bind(ctx.organizationId)
          .run();
        await fixture.db
          .prepare("UPDATE organizations SET mode='production' WHERE id=?")
          .bind(ctx.organizationId)
          .run();
      }
      const paused = await service.get(ctx, hook.endpoint.id);
      expect(paused).toMatchObject({
        enabled: false,
        revision: 3,
        deliveryCounts: { superseded: 1 },
      });
      const outgoing = fetcher();
      await processCustomerWebhooks(env(), domain, { fetch: outgoing });
      expect(outgoing).not.toHaveBeenCalled();
      await source();
      expect(
        (await records()).filter((row) => row.status === "pending"),
      ).toHaveLength(0);
      await expect(
        service.update(ctx, hook.endpoint.id, { revision: 2, enabled: true }),
      ).rejects.toMatchObject({ code: "WEBHOOK_CHANGED" });
      await service.update(ctx, hook.endpoint.id, {
        revision: paused.revision,
        enabled: true,
      });
      await source();
      await processCustomerWebhooks(env(), domain, { fetch: outgoing });
      expect(outgoing).toHaveBeenCalledTimes(1);
    },
  );
});
