import { readFile, readdir } from "node:fs/promises";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import {
  BillingService,
  billingConfigured,
  handleBillingRoute,
  handleStripeWebhook,
  STRIPE_API_VERSION,
  type BillingEnv,
} from "../../apps/api/src/billing";
import { handleAuthRoute, type AuthContext } from "../../apps/api/src/auth";
import worker from "../../apps/api/src/index";
import type { Env } from "../../apps/api/src/env";

let mf: Miniflare;
let env: BillingEnv;
const origin = "http://localhost:8787";
const actor: AuthContext = {
  organizationId: "org_atelier",
  userId: "user_atelier",
  role: "admin",
  actor: "browser",
};
const other: AuthContext = {
  organizationId: "org_studio",
  userId: "user_studio",
  role: "admin",
  actor: "browser",
};
const service = () => new BillingService(env);
const request = (
  path: string,
  method = "GET",
  headers: HeadersInit = {},
  body?: string,
) =>
  new Request(`${origin}${path}`, {
    method,
    headers: { Origin: origin, ...headers },
    body,
  });
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "billing-tests",
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      compatibilityDate: "2026-09-16",
      d1Databases: ["DB"],
    }),
  );
  const DB = (await mf.getD1Database("DB")) as unknown as D1Database;
  env = {
    DB,
    ENVIRONMENT: "local",
    MODE: "simulation",
    APP_ORIGIN: origin,
    STRIPE_MODE: "test",
    STRIPE_API_KEY: "rk_test_fixture",
    STRIPE_WEBHOOK_SECRET: "whsec_billing_fixture",
  };
  const files = (await readdir(new URL("../../migrations/", import.meta.url)))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const name of [
    ...files.map((file) => `migrations/${file}`),
    "scripts/seed.sql",
  ]) {
    const sql = await readFile(
      new URL(`../../${name}`, import.meta.url),
      "utf8",
    );
    let statement = "";
    let trigger = false;
    for (const raw of sql.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("--")) continue;
      if (line.startsWith("CREATE TRIGGER") && !line.endsWith("END;"))
        trigger = true;
      statement += `${line}\n`;
      if ((trigger && line === "END;") || (!trigger && line.endsWith(";"))) {
        await DB.prepare(statement).run();
        statement = "";
        trigger = false;
      }
    }
  }
  // Resolve membership IDs from the canonical fixture, not assumptions about seeds.
  for (const context of [actor, other]) {
    const row = await DB.prepare(
      "SELECT user_id FROM memberships WHERE organization_id=? AND role='admin'",
    )
      .bind(context.organizationId)
      .first<{ user_id: string }>();
    context.userId = row!.user_id;
  }
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await mf?.dispose();
});

async function mapping(context = actor, customer = "cus_atelier") {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO billing_accounts(organization_id,livemode,customer_id,provision_started_at,created_at,updated_at) VALUES(?,0,?,?,?,?) ON CONFLICT(organization_id,livemode) DO UPDATE SET customer_id=excluded.customer_id,sync_token=NULL,sync_until=NULL",
  )
    .bind(context.organizationId, customer, Date.now(), now, now)
    .run();
}
function invoice(id = "in_invoiceone", customer = "cus_atelier", fields = {}) {
  return {
    id,
    object: "invoice",
    customer,
    livemode: false,
    created: 1_800_000_000,
    number: "G-001",
    status: "paid",
    currency: "eur",
    total: 1200,
    amount_due: 1200,
    amount_paid: 1200,
    amount_remaining: 0,
    due_date: null,
    ...fields,
  };
}
function event(
  id: string,
  resource = "in_invoiceone",
  customer = "cus_atelier",
  type = "invoice.paid",
  extra = {},
) {
  return {
    id,
    type,
    livemode: false,
    data: { object: { id: resource, customer } },
    ...extra,
  };
}
async function signed(
  payload: unknown,
  seconds = Math.floor(Date.now() / 1000),
  secret = env.STRIPE_WEBHOOK_SECRET!,
) {
  const raw = JSON.stringify(payload);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${seconds}.${raw}`),
  );
  const digest = Array.from(new Uint8Array(signature), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
  return request(
    "/webhooks/stripe",
    "POST",
    { "Stripe-Signature": `t=${seconds},v1=${digest}` },
    raw,
  );
}
const webhook = async (payload: unknown) =>
  handleStripeWebhook(await signed(payload), env);

describe("organization billing without fabricated charges", () => {
  it("reaches Stripe signature and account validation without Auth0 during hosted recovery", async () => {
    const hosted = {
      ...env,
      ENVIRONMENT: "production",
      MODE: "production",
      APP_ORIGIN: "https://guteneo.example",
      STRIPE_MODE: "live",
      STRIPE_API_KEY: "rk_live_fixture",
    } as Env;
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("No provider call permitted"));
    const payload = event(
      "evt_recoveryfixture",
      "in_recoveryfixture",
      "cus_unmappedfixture",
      "invoice.paid",
      { livemode: true },
    );
    const hostedRequest = async (value: unknown, seconds?: number) => {
      const source = await signed(value, seconds);
      return new Request(`${hosted.APP_ORIGIN}/webhooks/stripe`, {
        method: "POST",
        headers: source.headers,
        body: await source.text(),
      });
    };
    const response = await worker.fetch(
      await hostedRequest(payload),
      hosted,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    // An unknown customer never creates account ownership, billing records or charges.
    expect(await response.json()).toEqual({ received: true, ignored: true });
    const unsigned = await hostedRequest(payload);
    unsigned.headers.delete("Stripe-Signature");
    const original = await hostedRequest(payload);
    const tampered = new Request(original.url, {
      method: "POST",
      headers: original.headers,
      body: (await original.text()).replace(
        "cus_unmappedfixture",
        "cus_otherfixture",
      ),
    });
    for (const request of [
      unsigned,
      tampered,
      await hostedRequest(payload, Math.floor(Date.now() / 1000) - 600),
    ]) {
      const rejected = await worker.fetch(
        request,
        hosted,
        {} as ExecutionContext,
      );
      expect(rejected.status).toBe(400);
      expect(await rejected.json()).toMatchObject({
        error: { code: "BILLING_SIGNATURE_INVALID" },
      });
    }
    for (const changes of [
      { livemode: false },
      { account: "acct_foreignfixture" },
    ]) {
      const rejected = await worker.fetch(
        await hostedRequest({ ...payload, ...changes }),
        hosted,
        {} as ExecutionContext,
      );
      expect(rejected.status).toBe(400);
      expect(await rejected.json()).toMatchObject({
        error: { code: "BILLING_MODE_MISMATCH" },
      });
    }
    expect(
      (
        await env.DB.prepare(
          "SELECT count(*) n FROM billing_accounts WHERE customer_id IN ('cus_unmappedfixture','cus_otherfixture')",
        ).first()
      )?.n,
    ).toBe(0);
    expect(
      (
        await env.DB.prepare(
          "SELECT count(*) n FROM billing_webhook_receipts WHERE event_id='evt_recoveryfixture'",
        ).first()
      )?.n,
    ).toBe(0);
    expect(network).not.toHaveBeenCalled();
  });
  it("shows missing configuration while keeping simulation reservations separate from invoices", async () => {
    expect(billingConfigured(env)).toBe(true);
    expect(billingConfigured({ ...env, ENVIRONMENT: "production" })).toBe(
      false,
    );
    expect(
      billingConfigured({
        ...env,
        ENVIRONMENT: "production",
        STRIPE_MODE: "live",
        STRIPE_API_KEY: "rk_live_fixture",
      }),
    ).toBe(true);
    expect(
      billingConfigured({ ...env, STRIPE_WEBHOOK_SECRET: undefined }),
    ).toBe(false);
    expect(
      billingConfigured({ ...env, STRIPE_API_KEY: "rk_live_fixture" }),
    ).toBe(false);
    const result = await new BillingService({
      ...env,
      STRIPE_API_KEY: undefined,
    }).overview(actor);
    expect(result.status).toBe("configuration_required");
    expect(result.portalAvailable).toBe(false);
    expect(result.chargingEnabled).toBe(false);
    expect(result.usageLedger).toMatchObject({
      kind: "simulation",
      amountsAre: "reservation_ceilings_not_invoices",
    });
    await expect(
      new BillingService({ ...env, STRIPE_API_KEY: undefined }).createCustomer(
        actor,
      ),
    ).rejects.toMatchObject({ code: "BILLING_CONFIGURATION_REQUIRED" });
    await expect(
      new BillingService({ ...env, ENVIRONMENT: "production" }).createCustomer(
        actor,
      ),
    ).rejects.toMatchObject({ code: "BILLING_CONFIGURATION_REQUIRED" });
  });
  it("requires current administrator membership and a browser actor, even with a forged role", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    for (const bad of [
      { ...actor, actor: "mcp" as const },
      { ...actor, organizationId: other.organizationId },
      { ...actor, userId: "missing" },
    ]) {
      await expect(service().overview(bad)).rejects.toMatchObject({
        code: "BILLING_ADMIN_REQUIRED",
      });
      await expect(
        service().portal(bad, "portal-test-key"),
      ).rejects.toMatchObject({ code: "BILLING_ADMIN_REQUIRED" });
    }
    await env.DB.prepare(
      "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
    )
      .bind(actor.organizationId, other.userId, new Date().toISOString())
      .run();
    await env.DB.prepare(
      "UPDATE memberships SET role='viewer' WHERE organization_id=? AND user_id=?",
    )
      .bind(actor.organizationId, actor.userId)
      .run();
    await expect(service().createCustomer(actor)).rejects.toMatchObject({
      code: "BILLING_ADMIN_REQUIRED",
    });
    await env.DB.prepare(
      "UPDATE memberships SET role='admin' WHERE organization_id=? AND user_id=?",
    )
      .bind(actor.organizationId, actor.userId)
      .run();
    await env.DB.prepare(
      "DELETE FROM memberships WHERE organization_id=? AND user_id=?",
    )
      .bind(actor.organizationId, other.userId)
      .run();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("requires session + CSRF and refuses client-supplied Stripe account fields", async () => {
    await expect(
      handleBillingRoute(request("/api/billing"), env),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
    await expect(
      handleBillingRoute(
        request("/api/billing", "GET", { Authorization: "Bearer irrelevant" }),
        env,
      ),
    ).rejects.toMatchObject({ code: "BILLING_BROWSER_REQUIRED" });
    const login = await handleAuthRoute(
      request(
        "/api/dev/login",
        "POST",
        { "Content-Type": "application/json" },
        JSON.stringify({ organization: "atelier" }),
      ),
      env,
    );
    const data = (await login!.json()) as { csrfToken: string };
    const cookie = login!.headers.get("Set-Cookie")!.split(";")[0];
    await expect(
      handleBillingRoute(
        request("/api/billing/customer", "POST", { Cookie: cookie }, "{}"),
        env,
      ),
    ).rejects.toMatchObject({ code: "CSRF_REJECTED" });
    await expect(
      handleBillingRoute(
        request(
          "/api/billing/customer",
          "POST",
          { Cookie: cookie, "X-CSRF-Token": data.csrfToken },
          JSON.stringify({ customer: "cus_studio" }),
        ),
        env,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const response = await handleBillingRoute(
      request("/api/billing", "GET", {
        Cookie: cookie,
        "X-Organization-Id": other.organizationId,
      }),
      env,
    );
    expect(response?.status).toBe(200);
    expect(response?.headers.get("Cache-Control")).toBe("no-store");
  });
  it("creates one mapped customer on concurrent requests using the same server-owned idempotency key", async () => {
    const keys: string[] = [];
    const calls = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        expect(String(input)).toBe("https://api.stripe.com/v1/customers");
        const headers = new Headers(init!.headers);
        expect(headers.get("Stripe-Version")).toBe(STRIPE_API_VERSION);
        keys.push(headers.get("Idempotency-Key")!);
        expect(
          new URLSearchParams(init!.body as string).get(
            "metadata[guteneo_organization_id]",
          ),
        ).toBe(actor.organizationId);
        return Response.json({
          id: "cus_atelier",
          object: "customer",
          livemode: false,
          metadata: { guteneo_organization_id: actor.organizationId },
        });
      });
    const results = await Promise.all([
      service().createCustomer(actor),
      service().createCustomer(actor),
    ]);
    expect(results.every((v) => v.customerLinked)).toBe(true);
    expect(new Set(keys).size).toBe(1);
    expect(calls).toHaveBeenCalled();
    calls.mockClear();
    await service().createCustomer(actor);
    expect(calls).not.toHaveBeenCalled();
    expect(await service().overview(actor)).toMatchObject({
      status: "connected",
      portalAvailable: true,
    });
    expect(await service().overview(other)).toMatchObject({
      status: "customer_required",
      portalAvailable: false,
    });
  });
  it("never recreates an ambiguous customer after Stripe’s idempotency retention window", async () => {
    await env.DB.prepare(
      "INSERT INTO billing_accounts(organization_id,livemode,provision_started_at,created_at,updated_at) VALUES(?,0,?,?,?)",
    )
      .bind(
        other.organizationId,
        Date.now() - 25 * 3_600_000,
        new Date().toISOString(),
        new Date().toISOString(),
      )
      .run();
    const calls = vi.spyOn(globalThis, "fetch");
    await expect(service().createCustomer(other)).rejects.toMatchObject({
      code: "BILLING_RECONCILIATION_REQUIRED",
    });
    expect(calls).not.toHaveBeenCalled();
  });
  it("opens only the current organization’s portal with a scoped stable idempotency key", async () => {
    await mapping(other, "cus_studio");
    const keys: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const form = new URLSearchParams(init!.body as string);
      const customer = form.get("customer");
      keys.push(new Headers(init!.headers).get("Idempotency-Key")!);
      expect(form.get("return_url")).toBe(`${origin}/#/app/billing`);
      return Response.json({
        object: "billing_portal.session",
        customer,
        livemode: false,
        url: "https://billing.stripe.com/p/session/fixture",
      });
    });
    await service().portal(actor, "portal-identifier");
    await service().portal(actor, "portal-identifier");
    await service().portal(other, "portal-identifier");
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
    await expect(service().portal(actor, null)).rejects.toMatchObject({
      code: "IDEMPOTENCY_REQUIRED",
    });
  });
  it.each(["unchanged", "session_revoked", "admin_demoted"] as const)(
    "rechecks browser and admin authority after Stripe responds: %s",
    async (change) => {
      await mapping();
      const login = await handleAuthRoute(
        request(
          "/api/dev/login",
          "POST",
          { "Content-Type": "application/json" },
          JSON.stringify({ organization: "atelier" }),
        ),
        env,
      );
      const { csrfToken } = (await login!.json()) as { csrfToken: string };
      const headers = {
        Cookie: login!.headers.get("Set-Cookie")!.split(";")[0],
        "X-CSRF-Token": csrfToken,
        "Idempotency-Key": `portal-race-${change}`,
      };
      let started!: () => void;
      let release!: (response: Response) => void;
      const stripeStarted = new Promise<void>((resolve) => {
        started = resolve;
      });
      const stripe = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation((input) => {
          expect(String(input)).toBe(
            "https://api.stripe.com/v1/billing_portal/sessions",
          );
          started();
          return new Promise<Response>((resolve) => {
            release = resolve;
          });
        });
      const pending = handleBillingRoute(
        request("/api/billing/portal", "POST", headers, "{}"),
        env,
      ).then(
        (response) => ({ response, error: null }),
        (error: unknown) => ({ response: null, error }),
      );
      await stripeStarted;
      const portalUrl = "https://billing.stripe.com/p/session/fixture-private";
      const finish = () =>
        release(
          Response.json({
            object: "billing_portal.session",
            customer: "cus_atelier",
            livemode: false,
            url: portalUrl,
          }),
        );
      try {
        if (change === "session_revoked") {
          const logout = await handleAuthRoute(
            request("/api/logout", "POST", headers, "{}"),
            env,
          );
          expect(logout?.status).toBe(200);
        } else if (change === "admin_demoted") {
          await env.DB.prepare(
            "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES(?,?,'admin',?)",
          )
            .bind(actor.organizationId, other.userId, new Date().toISOString())
            .run();
          await env.DB.prepare(
            "UPDATE memberships SET role='viewer' WHERE organization_id=? AND user_id=?",
          )
            .bind(actor.organizationId, actor.userId)
            .run();
        }
        finish();
        const outcome = await pending;
        expect(stripe).toHaveBeenCalledTimes(1);
        if (change === "unchanged") {
          expect(outcome.error).toBeNull();
          expect(outcome.response?.status).toBe(200);
          expect(outcome.response?.headers.get("Cache-Control")).toBe(
            "no-store",
          );
          expect(await outcome.response?.json()).toEqual({ url: portalUrl });
        } else {
          expect(outcome.response).toBeNull();
          expect(outcome.error).toMatchObject({
            code:
              change === "session_revoked"
                ? "SESSION_EXPIRED"
                : "BILLING_ADMIN_REQUIRED",
          });
          expect(JSON.stringify(outcome.error)).not.toContain(portalUrl);
        }
      } finally {
        finish();
        await pending;
        if (change === "admin_demoted") {
          await env.DB.prepare(
            "UPDATE memberships SET role='admin' WHERE organization_id=? AND user_id=?",
          )
            .bind(actor.organizationId, actor.userId)
            .run();
          await env.DB.prepare(
            "DELETE FROM memberships WHERE organization_id=? AND user_id=?",
          )
            .bind(actor.organizationId, other.userId)
            .run();
        }
      }
    },
  );
  it("rejects foreign customer responses, unsafe portal origins and live mode on a simulation organization", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        object: "billing_portal.session",
        customer: "cus_studio",
        livemode: false,
        url: "https://billing.stripe.com/p/session/fixture",
      }),
    );
    await expect(
      service().portal(actor, "portal-mismatch"),
    ).rejects.toMatchObject({ code: "BILLING_PROVIDER_INVALID" });
    spy.mockResolvedValue(
      Response.json({
        object: "billing_portal.session",
        customer: "cus_atelier",
        livemode: false,
        url: "https://attacker.invalid/session",
      }),
    );
    await expect(
      service().portal(actor, "portal-mismatch"),
    ).rejects.toMatchObject({ code: "BILLING_PROVIDER_INVALID" });
    spy.mockClear();
    await expect(
      new BillingService({
        ...env,
        STRIPE_MODE: "live",
        STRIPE_API_KEY: "rk_live_fixture",
      }).createCustomer(actor),
    ).rejects.toMatchObject({ code: "BILLING_MODE_MISMATCH" });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("signed canonical Stripe projections", () => {
  it("rejects forged, expired, future and wrong-mode webhooks before any provider request", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    await expect(
      handleStripeWebhook(
        await signed(event("evt_forged"), undefined, "wrong"),
        env,
      ),
    ).rejects.toMatchObject({ code: "BILLING_SIGNATURE_INVALID" });
    for (const offset of [-600, 600])
      await expect(
        handleStripeWebhook(
          await signed(
            event("evt_expired"),
            Math.floor(Date.now() / 1000) + offset,
          ),
          env,
        ),
      ).rejects.toMatchObject({ code: "BILLING_SIGNATURE_INVALID" });
    await expect(
      webhook(
        event("evt_mode", undefined, undefined, undefined, { livemode: true }),
      ),
    ).rejects.toMatchObject({ code: "BILLING_MODE_MISMATCH" });
    await expect(
      webhook(
        event("evt_connect", undefined, undefined, undefined, {
          account: "acct_other",
        }),
      ),
    ).rejects.toMatchObject({ code: "BILLING_MODE_MISMATCH" });
    expect(spy).not.toHaveBeenCalled();
  });
  it("acknowledges unknown customer events without creating an account from metadata", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const result = await webhook(
      event("evt_unknown", "in_foreign", "cus_unknown"),
    );
    expect(await result!.json()).toEqual({ received: true, ignored: true });
    expect(spy).not.toHaveBeenCalled();
    expect(
      await env.DB.prepare(
        "SELECT organization_id FROM billing_accounts WHERE customer_id='cus_unknown'",
      ).first(),
    ).toBeNull();
  });
  it("projects current provider truth, ignoring the stale webhook snapshot, and replays only once", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(invoice()));
    const payload = event(
      "evt_invoicepaid",
      undefined,
      undefined,
      "invoice.payment_failed",
    );
    expect((await webhook(payload))?.status).toBe(200);
    const first = await service().list(
      actor,
      "invoices",
      new URLSearchParams(),
    );
    expect(first.items).toMatchObject([
      {
        id: "in_invoiceone",
        status: "paid",
        amount_paid_minor: 1200,
        currency: "eur",
      },
    ]);
    const replay = await webhook(payload);
    expect(await replay!.json()).toEqual({ received: true, duplicate: true });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(
      await service().list(other, "invoices", new URLSearchParams()),
    ).toMatchObject({ items: [] });
    await expect(
      service().list(
        other,
        "invoices",
        new URLSearchParams({ cursor: "in_invoiceone" }),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("does not regress paid invoices when an earlier event arrives later", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(invoice()));
    await webhook(
      event("evt_invoiceold", undefined, undefined, "invoice.created"),
    );
    const list = await service().list(actor, "invoices", new URLSearchParams());
    expect(list.items).toMatchObject([{ status: "paid" }]);
  });
  it("does not mark failed retrievals as processed and retries safely", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("unavailable", { status: 503 }));
    const payload = event("evt_retry", "in_retry");
    await expect(webhook(payload)).rejects.toMatchObject({
      code: "BILLING_PROVIDER_UNAVAILABLE",
    });
    expect(
      await env.DB.prepare(
        "SELECT event_id FROM billing_webhook_receipts WHERE event_id='evt_retry'",
      ).first(),
    ).toBeNull();
    spy.mockResolvedValue(Response.json(invoice("in_retry")));
    expect((await webhook(payload))?.status).toBe(200);
  });
  it("refuses canonical responses for another customer and non-integer money", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(invoice("in_bad", "cus_studio")));
    await expect(
      webhook(event("evt_badcustomer", "in_bad")),
    ).rejects.toMatchObject({ code: "BILLING_PROVIDER_INVALID" });
    spy.mockResolvedValue(
      Response.json(invoice("in_bad", "cus_atelier", { total: 12.34 })),
    );
    await expect(webhook(event("evt_decimal", "in_bad"))).rejects.toMatchObject(
      { code: "BILLING_PROVIDER_INVALID" },
    );
  });
  it("serializes concurrent canonical reads and fences an expired worker from writing", async () => {
    let release!: (value: Response) => void;
    let requested!: () => void;
    const started = new Promise<void>((resolve) => {
      requested = resolve;
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      requested();
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    });
    const pending = webhook(event("evt_concurrent", "in_concurrent"));
    await started;
    await expect(
      webhook(event("evt_concurrentother", "in_concurrent")),
    ).rejects.toMatchObject({ code: "BILLING_SYNC_BUSY" });
    await env.DB.prepare(
      "UPDATE billing_accounts SET sync_token='new-owner',sync_until=? WHERE organization_id=? AND livemode=0",
    )
      .bind(Date.now() + 60_000, actor.organizationId)
      .run();
    release(Response.json(invoice("in_concurrent")));
    await expect(pending).rejects.toMatchObject({
      code: "BILLING_SYNC_EXPIRED",
    });
    expect(
      await env.DB.prepare(
        "SELECT id FROM billing_invoices WHERE id='in_concurrent'",
      ).first(),
    ).toBeNull();
    expect(
      await env.DB.prepare(
        "SELECT event_id FROM billing_webhook_receipts WHERE event_id='evt_concurrent'",
      ).first(),
    ).toBeNull();
    expect(
      await env.DB.prepare(
        "SELECT sync_token FROM billing_accounts WHERE organization_id=? AND livemode=0",
      )
        .bind(actor.organizationId)
        .first(),
    ).toMatchObject({ sync_token: "new-owner" });
    await mapping();
  });
  it("projects payments and subscriptions without generating usage credits or invoices", async () => {
    const before = await env.DB.prepare(
      "SELECT sum(limit_minor) n FROM usage WHERE organization_id=?",
    )
      .bind(actor.organizationId)
      .first();
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        id: "pi_payment",
        object: "payment_intent",
        customer: "cus_atelier",
        livemode: false,
        created: 1_800_000_000,
        status: "succeeded",
        currency: "eur",
        amount: 1200,
        amount_received: 1200,
      }),
    );
    await webhook(
      event(
        "evt_payment",
        "pi_payment",
        "cus_atelier",
        "payment_intent.succeeded",
      ),
    );
    expect(
      await service().list(actor, "payments", new URLSearchParams()),
    ).toMatchObject({
      items: [{ id: "pi_payment", amount_received_minor: 1200 }],
    });
    spy.mockResolvedValue(
      Response.json({
        id: "sub_subscription",
        object: "subscription",
        customer: "cus_atelier",
        livemode: false,
        created: 1_800_000_000,
        status: "canceled",
        cancel_at_period_end: false,
        canceled_at: 1_800_000_100,
      }),
    );
    await webhook(
      event(
        "evt_subscription",
        "sub_subscription",
        "cus_atelier",
        "customer.subscription.deleted",
      ),
    );
    expect(await service().overview(actor)).toMatchObject({
      subscriptions: [{ id: "sub_subscription", status: "canceled" }],
    });
    expect(
      await env.DB.prepare(
        "SELECT sum(limit_minor) n FROM usage WHERE organization_id=?",
      )
        .bind(actor.organizationId)
        .first(),
    ).toEqual(before);
  });
});
