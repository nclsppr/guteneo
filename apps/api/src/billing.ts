import { z } from "zod";
import { DomainError } from "../../../packages/domain/src/index";
import { readWelcomeCredit } from "../../../packages/domain/src/welcome-credit";
import {
  authenticateBrowser,
  hashSecret,
  type AuthEnv,
  type AuthContext,
} from "./auth";

export interface BillingEnv extends AuthEnv {
  STRIPE_API_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_MODE?: "test" | "live";
  STRIPE_PORTAL_CONFIGURATION_ID?: string;
}
export const STRIPE_API_VERSION = "2026-08-26.dahlia";
const encoder = new TextEncoder();
const minor = z.number().int().safe();
const stripeId = z
  .string()
  .regex(/^[a-z]+_[A-Za-z0-9]+$/)
  .max(255);
const objectBase = z.object({
  id: stripeId,
  customer: stripeId,
  livemode: z.boolean(),
  created: minor.nonnegative(),
  status: z.string().min(1).max(80),
});
const invoiceSchema = objectBase.extend({
  object: z.literal("invoice"),
  number: z.string().max(255).nullable(),
  status: z.enum(["draft", "open", "paid", "uncollectible", "void"]).nullable(),
  currency: z.string().regex(/^[a-z]{3}$/),
  total: minor,
  amount_due: minor.nonnegative(),
  amount_paid: minor.nonnegative(),
  amount_remaining: minor.nonnegative(),
  due_date: minor.nonnegative().nullable(),
});
const paymentSchema = objectBase.extend({
  object: z.literal("payment_intent"),
  currency: z.string().regex(/^[a-z]{3}$/),
  amount: minor.nonnegative(),
  amount_received: minor.nonnegative(),
});
const subscriptionSchema = objectBase.extend({
  object: z.literal("subscription"),
  cancel_at_period_end: z.boolean(),
  canceled_at: minor.nonnegative().nullable(),
});
const eventSchema = z.object({
  id: stripeId,
  type: z.string().max(100),
  livemode: z.boolean(),
  account: z.string().optional(),
  data: z.object({
    object: z.object({
      id: stripeId,
      customer: stripeId.nullable().optional(),
    }),
  }),
});
type Account = {
  organization_id: string;
  livemode: number;
  customer_id: string | null;
  provision_started_at: number;
};
type ResourceKind = "invoices" | "payment_intents" | "subscriptions";
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
function fail(code: string, message: string, status = 400): never {
  throw new DomainError(code, message, status);
}
export function billingConfigured(env: BillingEnv): boolean {
  return Boolean(
    env.STRIPE_API_KEY &&
    env.STRIPE_WEBHOOK_SECRET &&
    ["test", "live"].includes(env.STRIPE_MODE ?? "") &&
    (env.ENVIRONMENT !== "production" || env.STRIPE_MODE === "live") &&
    new RegExp(`^(rk|sk)_${env.STRIPE_MODE}_`).test(env.STRIPE_API_KEY),
  );
}
function requireConfiguration(env: BillingEnv): number {
  if (!billingConfigured(env))
    fail(
      "BILLING_CONFIGURATION_REQUIRED",
      "La facturation Stripe doit être raccordée avant cette opération.",
      503,
    );
  return env.STRIPE_MODE === "live" ? 1 : 0;
}
async function stripeRequest(
  env: BillingEnv,
  path: string,
  fields?: URLSearchParams,
  idempotencyKey?: string,
): Promise<unknown> {
  requireConfiguration(env);
  let response: Response;
  try {
    response = await fetch(`https://api.stripe.com/v1/${path}`, {
      method: fields ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${env.STRIPE_API_KEY}`,
        "Stripe-Version": STRIPE_API_VERSION,
        ...(fields
          ? { "Content-Type": "application/x-www-form-urlencoded" }
          : {}),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      ...(fields ? { body: fields.toString() } : {}),
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    fail(
      "BILLING_PROVIDER_UNAVAILABLE",
      "Stripe est temporairement indisponible.",
      503,
    );
  }
  if (!response.ok)
    fail(
      "BILLING_PROVIDER_UNAVAILABLE",
      "Stripe n’a pas confirmé cette opération.",
      503,
    );
  try {
    return await response.json();
  } catch {
    fail("BILLING_PROVIDER_INVALID", "La réponse de Stripe est invalide.", 502);
  }
}
async function account(env: BillingEnv, organizationId: string, live: number) {
  return env.DB.prepare(
    "SELECT organization_id,livemode,customer_id,provision_started_at FROM billing_accounts WHERE organization_id=? AND livemode=?",
  )
    .bind(organizationId, live)
    .first<Account>();
}
async function requireAdmin(env: BillingEnv, actor: AuthContext) {
  const membership = await env.DB.prepare(
    "SELECT role FROM memberships WHERE organization_id=? AND user_id=?",
  )
    .bind(actor.organizationId, actor.userId)
    .first<{ role: string }>();
  if (actor.actor !== "browser" || membership?.role !== "admin")
    fail(
      "BILLING_ADMIN_REQUIRED",
      "La facturation est réservée aux administrateurs de l’espace.",
      403,
    );
}

export class BillingService {
  constructor(private readonly env: BillingEnv) {}

  async overview(actor: AuthContext) {
    await requireAdmin(this.env, actor);
    const organization = await this.env.DB.prepare(
      "SELECT mode FROM organizations WHERE id=?",
    )
      .bind(actor.organizationId)
      .first<{ mode: string }>();
    const live = this.env.STRIPE_MODE === "live" ? 1 : 0;
    const customer = await account(this.env, actor.organizationId, live);
    const period = new Date().toISOString().slice(0, 7);
    const [subscriptions, usage] = await Promise.all([
      this.env.DB.prepare(
        "SELECT id,status,cancel_at_period_end,canceled_at,created,synced_at FROM billing_subscriptions WHERE organization_id=? AND livemode=? ORDER BY created DESC,id DESC LIMIT 50",
      )
        .bind(actor.organizationId, live)
        .all(),
      this.env.DB.prepare(
        "SELECT channel,period,limit_count,reserved_count,confirmed_count,limit_minor,reserved_minor,confirmed_minor,currency FROM usage WHERE organization_id=? AND period=? ORDER BY channel",
      )
        .bind(actor.organizationId, period)
        .all(),
    ]);
    return {
      welcomeCredit: await readWelcomeCredit(this.env.DB, actor.organizationId),
      topUpAvailable: false,
      provider: "stripe",
      status: billingConfigured(this.env)
        ? customer?.customer_id
          ? "connected"
          : "customer_required"
        : "configuration_required",
      mode: this.env.STRIPE_MODE ?? "unconfigured",
      customerLinked: Boolean(customer?.customer_id),
      portalAvailable:
        billingConfigured(this.env) && Boolean(customer?.customer_id),
      subscriptions: subscriptions.results,
      usageLedger: {
        kind:
          organization?.mode === "simulation"
            ? "simulation"
            : "production_reservations",
        period,
        amountsAre: "reservation_ceilings_not_invoices",
        channels: usage.results,
      },
      chargingEnabled: false,
    };
  }

  async list(
    actor: AuthContext,
    kind: "invoices" | "payments",
    params: URLSearchParams,
  ) {
    await requireAdmin(this.env, actor);
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(50)
      .parse(params.get("limit") ?? 25);
    // An opaque object ID acts as a cursor only if owned by this exact tenant and mode.
    const after = params.get("cursor");
    const live = this.env.STRIPE_MODE === "live" ? 1 : 0;
    const table = kind === "invoices" ? "billing_invoices" : "billing_payments";
    const cursor = after
      ? await this.env.DB.prepare(
          `SELECT created,id FROM ${table} WHERE organization_id=? AND livemode=? AND id=?`,
        )
          .bind(actor.organizationId, live, stripeId.parse(after))
          .first<{ created: number; id: string }>()
      : null;
    if (after && !cursor)
      fail("NOT_FOUND", "Page de facturation introuvable.", 404);
    const columns =
      kind === "invoices"
        ? "id,number,status,currency,total_minor,amount_due_minor,amount_paid_minor,amount_remaining_minor,created,due_date,synced_at"
        : "id,status,currency,amount_minor,amount_received_minor,created,synced_at";
    const result = await this.env.DB.prepare(
      `SELECT ${columns} FROM ${table} WHERE organization_id=? AND livemode=? ${cursor ? "AND (created<? OR (created=? AND id<?))" : ""} ORDER BY created DESC,id DESC LIMIT ?`,
    )
      .bind(
        actor.organizationId,
        live,
        ...(cursor ? [cursor.created, cursor.created, cursor.id] : []),
        limit + 1,
      )
      .all<{ id: string }>();
    const items = result.results.slice(0, limit);
    return {
      items,
      nextCursor: result.results.length > limit ? items.at(-1)!.id : null,
      mode: this.env.STRIPE_MODE ?? "unconfigured",
    };
  }

  async createCustomer(actor: AuthContext) {
    await requireAdmin(this.env, actor);
    const live = requireConfiguration(this.env);
    const org = await this.env.DB.prepare(
      "SELECT mode FROM organizations WHERE id=?",
    )
      .bind(actor.organizationId)
      .first<{ mode: string }>();
    if (live && org?.mode !== "production")
      fail(
        "BILLING_MODE_MISMATCH",
        "Un espace de simulation ne peut pas utiliser la facturation réelle.",
        409,
      );
    const now = Date.now();
    await this.env.DB.prepare(
      "INSERT INTO billing_accounts(organization_id,livemode,provision_started_at,created_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(organization_id,livemode) DO NOTHING",
    )
      .bind(
        actor.organizationId,
        live,
        now,
        new Date(now).toISOString(),
        new Date(now).toISOString(),
      )
      .run();
    const mapping = (await account(this.env, actor.organizationId, live))!;
    if (mapping.customer_id)
      return { customerLinked: true, mode: this.env.STRIPE_MODE };
    // Stripe retains idempotency results for at least 24h. Beyond the window an
    // ambiguous creation needs manual reconciliation, never a new customer.
    if (now - mapping.provision_started_at > 23 * 3_600_000)
      fail(
        "BILLING_RECONCILIATION_REQUIRED",
        "Le rattachement Stripe doit être vérifié par un opérateur.",
        409,
      );
    const result = z
      .object({
        id: stripeId,
        object: z.literal("customer"),
        livemode: z.boolean(),
        metadata: z.object({ guteneo_organization_id: z.string() }),
      })
      .safeParse(
        await stripeRequest(
          this.env,
          "customers",
          new URLSearchParams({
            "metadata[guteneo_organization_id]": actor.organizationId,
          }),
          `guteneo-customer-${await hashSecret(`${actor.organizationId}:${live}`)}`,
        ),
      );
    if (
      !result.success ||
      result.data.livemode !== Boolean(live) ||
      result.data.metadata.guteneo_organization_id !== actor.organizationId
    )
      fail(
        "BILLING_PROVIDER_INVALID",
        "Le compte Stripe reçu ne correspond pas à cet espace.",
        502,
      );
    await this.env.DB.prepare(
      "UPDATE billing_accounts SET customer_id=?,updated_at=? WHERE organization_id=? AND livemode=? AND customer_id IS NULL",
    )
      .bind(
        result.data.id,
        new Date().toISOString(),
        actor.organizationId,
        live,
      )
      .run();
    const final = await account(this.env, actor.organizationId, live);
    if (final?.customer_id !== result.data.id)
      fail(
        "BILLING_RECONCILIATION_REQUIRED",
        "Le rattachement Stripe doit être vérifié par un opérateur.",
        409,
      );
    return { customerLinked: true, mode: this.env.STRIPE_MODE };
  }

  async portal(actor: AuthContext, idempotencyKey: string | null) {
    await requireAdmin(this.env, actor);
    const live = requireConfiguration(this.env);
    if (!idempotencyKey || !/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey))
      fail(
        "IDEMPOTENCY_REQUIRED",
        "Une clé Idempotency-Key de 8 à 128 caractères est requise.",
      );
    const mapping = await account(this.env, actor.organizationId, live);
    if (!mapping?.customer_id)
      fail(
        "BILLING_CUSTOMER_REQUIRED",
        "Rattachez d’abord cet espace à Stripe.",
        409,
      );
    const fields = new URLSearchParams({
      customer: mapping.customer_id,
      return_url: `${this.env.APP_ORIGIN}/#/app/billing`,
      locale: "fr",
    });
    if (this.env.STRIPE_PORTAL_CONFIGURATION_ID)
      fields.set("configuration", this.env.STRIPE_PORTAL_CONFIGURATION_ID);
    const result = z
      .object({
        object: z.literal("billing_portal.session"),
        customer: stripeId,
        livemode: z.boolean(),
        url: z.string().url(),
      })
      .safeParse(
        await stripeRequest(
          this.env,
          "billing_portal/sessions",
          fields,
          `guteneo-portal-${await hashSecret(`${actor.organizationId}:${actor.userId}:${live}:${idempotencyKey}`)}`,
        ),
      );
    if (
      !result.success ||
      result.data.customer !== mapping.customer_id ||
      result.data.livemode !== Boolean(live)
    )
      fail(
        "BILLING_PROVIDER_INVALID",
        "Le portail Stripe reçu est invalide.",
        502,
      );
    const url = new URL(result.data.url);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "billing.stripe.com" ||
      url.username ||
      url.password ||
      url.port
    )
      fail(
        "BILLING_PROVIDER_INVALID",
        "Le portail Stripe reçu est invalide.",
        502,
      );
    return { url: result.data.url };
  }
}

export async function handleBillingRoute(
  request: Request,
  env: BillingEnv,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/billing")) return null;
  if (request.headers.has("Authorization"))
    fail(
      "BILLING_BROWSER_REQUIRED",
      "Ouvrez la facturation dans votre navigateur.",
      403,
    );
  const mutation = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  const session = await authenticateBrowser(request, env, mutation);
  const rate = await env.DB.prepare(
    "INSERT INTO http_limits(organization_id,window_start,count) VALUES(?,?,1) ON CONFLICT(organization_id,window_start) DO UPDATE SET count=count+1 RETURNING count",
  )
    .bind(session.context.organizationId, Math.floor(Date.now() / 60_000))
    .first<{ count: number }>();
  if ((rate?.count ?? 0) > 180)
    return Response.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: "Trop de requêtes. Réessayez dans une minute.",
        },
      },
      {
        status: 429,
        headers: { "Retry-After": "60", "Cache-Control": "no-store" },
      },
    );
  const service = new BillingService(env);
  if (request.method === "GET" && url.pathname === "/api/billing")
    return json(await service.overview(session.context));
  if (
    request.method === "GET" &&
    ["/api/billing/invoices", "/api/billing/payments"].includes(url.pathname)
  )
    return json(
      await service.list(
        session.context,
        url.pathname.endsWith("invoices") ? "invoices" : "payments",
        url.searchParams,
      ),
    );
  if (
    request.method === "POST" &&
    ["/api/billing/customer", "/api/billing/portal"].includes(url.pathname)
  ) {
    // Never accept a client customer, tenant, return URL, plan or monetary amount.
    const raw = await request.text();
    if (raw.length > 128) fail("VALIDATION_ERROR", "Données invalides.");
    try {
      z.object({})
        .strict()
        .parse(raw ? JSON.parse(raw) : {});
    } catch {
      fail("VALIDATION_ERROR", "Données invalides.");
    }
    if (url.pathname.endsWith("customer"))
      return json(await service.createCustomer(session.context));
    const portal = await service.portal(
      session.context,
      request.headers.get("Idempotency-Key"),
    );
    // A portal URL grants billing access. Revocation while Stripe responds
    // must take effect before that bearer capability leaves this server.
    const current = await authenticateBrowser(request, env, true);
    await requireAdmin(env, current.context);
    if (
      current.context.organizationId !== session.context.organizationId ||
      current.context.userId !== session.context.userId
    )
      fail(
        "BILLING_ADMIN_REQUIRED",
        "La session de facturation a changé. Réessayez depuis votre espace.",
        403,
      );
    return json(portal);
  }
  return json(
    {
      error: {
        code: "NOT_FOUND",
        message: "Route de facturation introuvable.",
      },
    },
    404,
  );
}

async function verifySignature(
  raw: string,
  header: string | null,
  secret: string,
) {
  const parts = (header ?? "").split(",").map((p) => p.trim().split("="));
  const timestamps = parts.filter(([key]) => key === "t");
  const timestamp = timestamps[0]?.[1] ?? "";
  if (
    timestamps.length !== 1 ||
    !/^\d{10}$/.test(timestamp) ||
    Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
  )
    fail("BILLING_SIGNATURE_INVALID", "Signature Stripe invalide.", 400);
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  for (const [version, digest] of parts) {
    if (version !== "v1" || !/^[a-f0-9]{64}$/.test(digest ?? "")) continue;
    const bytes = Uint8Array.from(digest.match(/../g)!, (v) => parseInt(v, 16));
    if (
      await crypto.subtle.verify(
        "HMAC",
        key,
        bytes,
        encoder.encode(`${timestamp}.${raw}`),
      )
    )
      return;
  }
  fail("BILLING_SIGNATURE_INVALID", "Signature Stripe invalide.", 400);
}

export async function handleStripeWebhook(
  request: Request,
  env: BillingEnv,
): Promise<Response | null> {
  if (new URL(request.url).pathname !== "/webhooks/stripe") return null;
  if (request.method !== "POST")
    return json({ error: { code: "METHOD_NOT_ALLOWED" } }, 405);
  const live = requireConfiguration(env);
  const raw = await request.text();
  if (encoder.encode(raw).length > 262_144)
    fail("REQUEST_TOO_LARGE", "Événement Stripe trop volumineux.", 413);
  await verifySignature(
    raw,
    request.headers.get("Stripe-Signature"),
    env.STRIPE_WEBHOOK_SECRET!,
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail("BILLING_EVENT_INVALID", "Événement Stripe invalide.");
  }
  const validation = eventSchema.safeParse(parsed);
  if (!validation.success)
    fail("BILLING_EVENT_INVALID", "Événement Stripe invalide.");
  const event = validation.data;
  if (event.account || Number(event.livemode) !== live)
    fail(
      "BILLING_MODE_MISMATCH",
      "Ce webhook Stripe ne correspond pas à ce service.",
    );
  const kind: ResourceKind | null = event.type.startsWith("invoice.")
    ? "invoices"
    : event.type.startsWith("payment_intent.")
      ? "payment_intents"
      : event.type.startsWith("customer.subscription.")
        ? "subscriptions"
        : null;
  if (!kind || !event.data.object.customer)
    return json({ received: true, ignored: true });
  const mapping = await env.DB.prepare(
    "SELECT organization_id,livemode,customer_id,provision_started_at FROM billing_accounts WHERE livemode=? AND customer_id=?",
  )
    .bind(live, event.data.object.customer)
    .first<Account>();
  // A verified Stripe metadata field never grants membership or binds an unknown customer.
  if (!mapping) return json({ received: true, ignored: true });
  const receipt = () =>
    env.DB.prepare(
      "SELECT event_id FROM billing_webhook_receipts WHERE organization_id=? AND livemode=? AND event_id=?",
    )
      .bind(mapping.organization_id, live, event.id)
      .first();
  if (await receipt()) return json({ received: true, duplicate: true });
  const token = crypto.randomUUID();
  const now = Date.now();
  const lock = await env.DB.prepare(
    "UPDATE billing_accounts SET sync_token=?,sync_until=? WHERE organization_id=? AND livemode=? AND (sync_token IS NULL OR sync_until<?) RETURNING organization_id",
  )
    .bind(token, now + 60_000, mapping.organization_id, live, now)
    .first();
  if (!lock)
    fail(
      "BILLING_SYNC_BUSY",
      "Synchronisation en cours. Réessayez cet événement.",
      503,
    );
  try {
    if (await receipt()) return json({ received: true, duplicate: true });
    // Stripe does not guarantee event order. Serialize canonical reads per account;
    // never project stale event snapshots. The lock token fences expired workers.
    const rawObject = await stripeRequest(
      env,
      `${kind}/${event.data.object.id}`,
    );
    const schema =
      kind === "invoices"
        ? invoiceSchema
        : kind === "payment_intents"
          ? paymentSchema
          : subscriptionSchema;
    const object = schema.safeParse(rawObject);
    if (
      !object.success ||
      object.data.id !== event.data.object.id ||
      object.data.customer !== mapping.customer_id ||
      Number(object.data.livemode) !== live
    )
      fail(
        "BILLING_PROVIDER_INVALID",
        "L’objet Stripe ne correspond pas au compte attendu.",
        502,
      );
    const synced = new Date().toISOString();
    let table: string;
    let columns: string[];
    let values: (string | number | null)[];
    if (kind === "invoices") {
      const v = invoiceSchema.parse(rawObject);
      table = "billing_invoices";
      columns = [
        "number",
        "status",
        "currency",
        "total_minor",
        "amount_due_minor",
        "amount_paid_minor",
        "amount_remaining_minor",
        "created",
        "due_date",
      ];
      values = [
        v.number,
        v.status ?? "draft",
        v.currency,
        v.total,
        v.amount_due,
        v.amount_paid,
        v.amount_remaining,
        v.created,
        v.due_date,
      ];
    } else if (kind === "payment_intents") {
      const v = paymentSchema.parse(rawObject);
      table = "billing_payments";
      columns = [
        "status",
        "currency",
        "amount_minor",
        "amount_received_minor",
        "created",
      ];
      values = [v.status, v.currency, v.amount, v.amount_received, v.created];
    } else {
      const v = subscriptionSchema.parse(rawObject);
      table = "billing_subscriptions";
      columns = ["status", "cancel_at_period_end", "canceled_at", "created"];
      values = [
        v.status,
        Number(v.cancel_at_period_end),
        v.canceled_at,
        v.created,
      ];
    }
    const guard =
      "EXISTS(SELECT 1 FROM billing_accounts WHERE organization_id=? AND livemode=? AND sync_token=? AND sync_until>?)";
    const guardArgs = [mapping.organization_id, live, token, Date.now()];
    const result = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO ${table}(organization_id,livemode,customer_id,id,${columns.join(",")},synced_at) SELECT ${Array(
          values.length + 5,
        )
          .fill("?")
          .join(
            ",",
          )} WHERE ${guard} ON CONFLICT(organization_id,livemode,id) DO UPDATE SET ${[...columns, "synced_at"].map((c) => `${c}=excluded.${c}`).join(",")}`,
      ).bind(
        mapping.organization_id,
        live,
        mapping.customer_id,
        object.data.id,
        ...values,
        synced,
        ...guardArgs,
      ),
      env.DB.prepare(
        `INSERT INTO billing_webhook_receipts(organization_id,livemode,event_id,event_type,resource_id,applied_at) SELECT ?,?,?,?,?,? WHERE ${guard}`,
      ).bind(
        mapping.organization_id,
        live,
        event.id,
        event.type,
        object.data.id,
        synced,
        ...guardArgs,
      ),
      env.DB.prepare(
        `UPDATE billing_accounts SET updated_at=? WHERE organization_id=? AND livemode=? AND sync_token=?`,
      ).bind(synced, mapping.organization_id, live, token),
    ]);
    if (result[0].meta.changes !== 1 || result[1].meta.changes !== 1)
      fail(
        "BILLING_SYNC_EXPIRED",
        "Synchronisation expirée. Réessayez cet événement.",
        503,
      );
    return json({ received: true });
  } finally {
    await env.DB.prepare(
      "UPDATE billing_accounts SET sync_token=NULL,sync_until=NULL WHERE organization_id=? AND livemode=? AND sync_token=?",
    )
      .bind(mapping.organization_id, live, token)
      .run();
  }
}
