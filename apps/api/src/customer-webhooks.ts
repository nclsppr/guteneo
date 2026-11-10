import {
  CUSTOMER_WEBHOOK_LIMITS,
  customerWebhookCreate,
  customerWebhookUpdate,
  customerWebhookRevision,
  customerWebhookRotation,
  type CustomerWebhookCapabilities,
  type CustomerWebhookEndpoint,
  type CustomerWebhookDelivery,
  type CustomerWebhookDeliveryStatus,
  type CustomerWebhookEvent,
} from "../../../packages/contracts/src/customer-webhooks";
import {
  canonicalJson,
  DomainError,
  sha256,
  type DomainService,
} from "../../../packages/domain/src/index";
import type { Env } from "./env";
import { lifecycleAuthority, type LifecycleActor } from "./lifecycle-authority";
import { permittedImportUrl } from "./documents";

type WebhookEnv = Env & {
  CUSTOMER_WEBHOOKS_ENABLED?: string;
  CUSTOMER_WEBHOOK_ENCRYPTION_KEY?: string;
  GLOBAL_FETCH_STRICTLY_PUBLIC?: string;
};
type Dependencies = { fetch?: typeof fetch; now?: () => Date };
type EndpointRow = {
  id: string;
  organization_id: string;
  name: string;
  url: string;
  enabled: number;
  status: "active" | "revoked";
  revision: number;
  secret_ciphertext: string | null;
  request_hash: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  overflow_count: number;
  counts_json?: string;
};
type DeliveryRow = {
  id: string;
  organization_id: string;
  endpoint_id: string;
  endpoint_revision: number;
  event_id: string;
  dispatch_id: string;
  dispatch_status: string;
  channel: "fax" | "email" | "postal";
  occurred_at: string;
  status: CustomerWebhookDeliveryStatus;
  finished_at: string | null;
  response_status: number | null;
  error_code: string | null;
};
const statuses: CustomerWebhookDeliveryStatus[] = [
  "pending",
  "sending",
  "sent",
  "failed",
  "unknown",
  "superseded",
];
const validKey = (env: WebhookEnv) =>
  /^[a-f0-9]{64}$/i.test(env.CUSTOMER_WEBHOOK_ENCRYPTION_KEY ?? "");
export function customerWebhookCapabilities(
  env: WebhookEnv,
): CustomerWebhookCapabilities {
  const publicNetwork =
    ["production", "staging"].includes(env.ENVIRONMENT) &&
    env.MODE === "production" &&
    env.GLOBAL_FETCH_STRICTLY_PUBLIC === "true";
  const configured = validKey(env) && publicNetwork;
  return {
    configured,
    enabled: configured && env.CUSTOMER_WEBHOOKS_ENABLED === "true",
    reason: !publicNetwork
      ? "public_network_required"
      : !validKey(env)
        ? "missing_key"
        : env.CUSTOMER_WEBHOOKS_ENABLED !== "true"
          ? "disabled"
          : null,
    endpointLimit: CUSTOMER_WEBHOOK_LIMITS.endpoints,
    pendingLimit: CUSTOMER_WEBHOOK_LIMITS.pendingPerEndpoint,
  };
}
export function customerWebhookDestination(raw: string): URL {
  try {
    const url = permittedImportUrl(raw);
    if (url.href.includes("?")) throw new Error("query");
    return url;
  } catch {
    throw new DomainError(
      "WEBHOOK_DESTINATION_INVALID",
      "Choose a direct public HTTPS address without credentials, a query, a fragment or a custom port.",
    );
  }
}
function reference(value: string) {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(value))
    throw new DomainError("INVALID_INPUT", "Invalid webhook reference.");
  return value;
}
function endpointView(row: EndpointRow): CustomerWebhookEndpoint {
  const recorded = JSON.parse(row.counts_json ?? "{}") as Record<
    string,
    number
  >;
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    enabled: row.enabled === 1,
    status: row.status,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    overflowCount: row.overflow_count,
    deliveryCounts: Object.fromEntries(
      statuses.map((status) => [status, recorded[status] ?? 0]),
    ) as CustomerWebhookEndpoint["deliveryCounts"],
  };
}
const endpointSelect = `SELECT e.*,(SELECT json_group_object(status,n) FROM (SELECT status,count(*) AS n FROM customer_webhook_deliveries d WHERE d.organization_id=e.organization_id AND d.endpoint_id=e.id GROUP BY status)) AS counts_json FROM customer_webhook_endpoints e`;
const liveAuthority = `EXISTS(SELECT 1 FROM organizations o WHERE o.id=e.organization_id AND o.mode='production') AND EXISTS(SELECT 1 FROM memberships m WHERE m.organization_id=e.organization_id AND m.user_id=e.updated_by AND m.role='admin') AND NOT EXISTS(SELECT 1 FROM account_deletion_requests x WHERE x.user_id=e.updated_by AND x.status IN('processing','completed'))`;
const encoder = new TextEncoder();
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unbase64 = (value: string) =>
  Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
async function encryptionKey(env: WebhookEnv) {
  if (!validKey(env))
    throw new DomainError(
      "WEBHOOK_KEY_UNAVAILABLE",
      "Secure webhook configuration is unavailable.",
      503,
    );
  const bytes = Uint8Array.from(
    env.CUSTOMER_WEBHOOK_ENCRYPTION_KEY!.match(/../g)!,
    (value) => parseInt(value, 16),
  );
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
async function seal(env: WebhookEnv, binding: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: encoder.encode(binding) },
      await encryptionKey(env),
      encoder.encode(secret),
    ),
  );
  return `v1.${base64(iv)}.${base64(ciphertext)}`;
}
async function open(env: WebhookEnv, row: EndpointRow) {
  try {
    const [version, nonce, body, extra] = row.secret_ciphertext!.split(".");
    if (version !== "v1" || extra || !nonce || !body)
      throw new Error("invalid");
    return new TextDecoder().decode(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: unbase64(nonce),
          additionalData: encoder.encode(`${row.organization_id}:${row.id}`),
        },
        await encryptionKey(env),
        unbase64(body),
      ),
    );
  } catch {
    throw new DomainError(
      "WEBHOOK_KEY_UNAVAILABLE",
      "Secure webhook configuration is unavailable.",
      503,
    );
  }
}
const signingSecret = () =>
  `cwhsec_${base64(crypto.getRandomValues(new Uint8Array(32)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "")}`;

/** Browser administrators configure metadata callbacks; assistants acquire no write authority. */
export class CustomerWebhookService {
  constructor(
    private readonly env: WebhookEnv,
    private readonly domain: DomainService,
  ) {}
  private async administrator(ctx: LifecycleActor) {
    if (ctx.actor !== "browser" || ctx.role !== "admin")
      throw new DomainError(
        "FORBIDDEN",
        "A browser administrator is required.",
        403,
      );
    await this.domain.authorizeApproval(ctx);
    const fence = lifecycleAuthority(
      ctx,
      this.domain.config.mode,
      "approveDispatches",
    );
    if (
      !(await this.domain.db
        .prepare(`SELECT 1 WHERE ${fence.condition}`)
        .bind(...fence.values)
        .first())
    )
      throw new DomainError(
        "FORBIDDEN",
        "Current browser authority is required.",
        403,
      );
    return fence;
  }
  private assertActivation() {
    if (!customerWebhookCapabilities(this.env).enabled)
      throw new DomainError(
        "WEBHOOKS_UNAVAILABLE",
        "Metadata callbacks are not activated in this environment.",
        503,
      );
  }
  private audit(ctx: LifecycleActor, action: string, id: string, time: string) {
    return this.domain.db
      .prepare(
        "INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) SELECT ?,?,?,?,?,'{}',? WHERE changes()=1",
      )
      .bind(
        crypto.randomUUID(),
        ctx.organizationId,
        ctx.userId,
        action,
        id,
        time,
      );
  }
  async list(ctx: LifecycleActor) {
    const fence = await this.administrator(ctx);
    const rows = await this.domain.db
      .prepare(
        `${endpointSelect} WHERE e.organization_id=? AND ${fence.condition} ORDER BY e.created_at DESC,e.id LIMIT 100`,
      )
      .bind(ctx.organizationId, ...fence.values)
      .all<EndpointRow>();
    return {
      items: rows.results.map(endpointView),
      capabilities: customerWebhookCapabilities(this.env),
    };
  }
  async get(ctx: LifecycleActor, id: string) {
    const fence = await this.administrator(ctx);
    const row = await this.domain.db
      .prepare(
        `${endpointSelect} WHERE e.organization_id=? AND e.id=? AND ${fence.condition}`,
      )
      .bind(ctx.organizationId, reference(id), ...fence.values)
      .first<EndpointRow>();
    if (!row)
      throw new DomainError("NOT_FOUND", "Webhook endpoint not found.", 404);
    return endpointView(row);
  }
  async create(ctx: LifecycleActor, input: unknown, key: string) {
    const fence = await this.administrator(ctx),
      parsed = customerWebhookCreate.parse(input),
      url = customerWebhookDestination(parsed.url).href;
    if (!key || key.length > 200 || /[\r\n\0]/.test(key))
      throw new DomainError(
        "IDEMPOTENCY_REQUIRED",
        "A stable idempotency key is required.",
      );
    const hash = await sha256(canonicalJson({ name: parsed.name, url })),
      id = `cwh_${crypto.randomUUID()}`,
      secret = signingSecret(),
      now = new Date().toISOString();
    const ciphertext = await seal(
      this.env,
      `${ctx.organizationId}:${id}`,
      secret,
    );
    const result = await this.domain.db.batch([
      this.domain.db
        .prepare(
          `INSERT INTO customer_webhook_endpoints(id,organization_id,name,url,secret_ciphertext,request_key,request_hash,created_by,updated_by,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${fence.condition} AND (SELECT count(*) FROM customer_webhook_endpoints WHERE organization_id=? AND status='active')<5 AND (SELECT count(*) FROM customer_webhook_endpoints WHERE organization_id=?)<100 ON CONFLICT(organization_id,request_key) DO NOTHING RETURNING id`,
        )
        .bind(
          id,
          ctx.organizationId,
          parsed.name,
          url,
          ciphertext,
          key,
          hash,
          ctx.userId,
          ctx.userId,
          now,
          now,
          ...fence.values,
          ctx.organizationId,
          ctx.organizationId,
        ),
      this.audit(ctx, "customer_webhook.created", id, now),
    ]);
    const saved = await this.domain.db
      .prepare(
        "SELECT id,request_hash FROM customer_webhook_endpoints WHERE organization_id=? AND request_key=?",
      )
      .bind(ctx.organizationId, key)
      .first<Pick<EndpointRow, "id" | "request_hash">>();
    if (!saved) {
      await this.administrator(ctx);
      throw new DomainError(
        "WEBHOOK_LIMIT",
        "This workspace has reached its webhook endpoint limit.",
        429,
      );
    }
    if (saved.request_hash !== hash)
      throw new DomainError(
        "IDEMPOTENCY_CONFLICT",
        "This key belongs to another endpoint configuration.",
        409,
      );
    return {
      endpoint: await this.get(ctx, saved.id),
      ...(result[0].results.length ? { signingSecret: secret } : {}),
    };
  }
  async update(ctx: LifecycleActor, id: string, input: unknown) {
    const fence = await this.administrator(ctx),
      parsed = customerWebhookUpdate.parse(input),
      current = await this.get(ctx, id);
    const url =
      parsed.url === undefined
        ? current.url
        : customerWebhookDestination(parsed.url).href;
    const enabled =
      parsed.enabled ?? (url !== current.url ? false : current.enabled);
    if (enabled) this.assertActivation();
    const now = new Date().toISOString();
    const result = await this.domain.db.batch([
      this.domain.db
        .prepare(
          `UPDATE customer_webhook_endpoints SET name=?,url=?,enabled=?,revision=revision+1,updated_by=?,updated_at=? WHERE organization_id=? AND id=? AND revision=? AND status='active' AND ${fence.condition} RETURNING id`,
        )
        .bind(
          parsed.name ?? current.name,
          url,
          enabled ? 1 : 0,
          ctx.userId,
          now,
          ctx.organizationId,
          reference(id),
          parsed.revision,
          ...fence.values,
        ),
      this.audit(ctx, "customer_webhook.updated", id, now),
    ]);
    if (!result[0].results.length)
      throw new DomainError(
        "WEBHOOK_CHANGED",
        "This endpoint changed. Refresh before continuing.",
        409,
      );
    return this.get(ctx, id);
  }
  async revoke(ctx: LifecycleActor, id: string, input: unknown) {
    const fence = await this.administrator(ctx),
      parsed = customerWebhookRevision.parse(input),
      now = new Date().toISOString();
    const result = await this.domain.db.batch([
      this.domain.db
        .prepare(
          `UPDATE customer_webhook_endpoints SET status='revoked',enabled=0,secret_ciphertext=NULL,revision=revision+1,updated_by=?,updated_at=? WHERE organization_id=? AND id=? AND revision=? AND status='active' AND ${fence.condition} RETURNING id`,
        )
        .bind(
          ctx.userId,
          now,
          ctx.organizationId,
          reference(id),
          parsed.revision,
          ...fence.values,
        ),
      this.audit(ctx, "customer_webhook.revoked", id, now),
    ]);
    if (!result[0].results.length) {
      await this.get(ctx, id);
      throw new DomainError(
        "WEBHOOK_CHANGED",
        "This endpoint changed. Refresh before continuing.",
        409,
      );
    }
    return this.get(ctx, id);
  }
  async rotateSecret(ctx: LifecycleActor, id: string, input: unknown) {
    const fence = await this.administrator(ctx),
      parsed = customerWebhookRotation.parse(input),
      secret = signingSecret(),
      now = new Date().toISOString();
    const ciphertext = await seal(
      this.env,
      `${ctx.organizationId}:${reference(id)}`,
      secret,
    );
    const result = await this.domain.db.batch([
      this.domain.db
        .prepare(
          `UPDATE customer_webhook_endpoints SET secret_ciphertext=?,enabled=0,revision=revision+1,updated_by=?,updated_at=? WHERE organization_id=? AND id=? AND revision=? AND status='active' AND ${fence.condition} RETURNING id`,
        )
        .bind(
          ciphertext,
          ctx.userId,
          now,
          ctx.organizationId,
          id,
          parsed.revision,
          ...fence.values,
        ),
      this.audit(ctx, "customer_webhook.secret_rotated", id, now),
    ]);
    if (!result[0].results.length) {
      await this.get(ctx, id);
      throw new DomainError(
        "WEBHOOK_CHANGED",
        "This endpoint changed. Refresh before continuing.",
        409,
      );
    }
    return { endpoint: await this.get(ctx, id), signingSecret: secret };
  }
  async deliveries(
    ctx: LifecycleActor,
    id: string,
    cursor?: string,
    limit = 30,
  ) {
    const fence = await this.administrator(ctx);
    await this.get(ctx, id);
    let before: { at: string; id: string } | undefined;
    if (cursor) {
      try {
        if (cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(cursor))
          throw new Error("invalid");
        const parsed = JSON.parse(
          atob(cursor.replaceAll("-", "+").replaceAll("_", "/")),
        ) as Record<string, unknown>;
        if (
          Object.keys(parsed).length !== 2 ||
          typeof parsed.at !== "string" ||
          parsed.at.length > 40 ||
          !Number.isFinite(Date.parse(parsed.at)) ||
          typeof parsed.id !== "string"
        )
          throw new Error("invalid");
        before = { at: parsed.at, id: reference(parsed.id) };
      } catch {
        throw new DomainError(
          "INVALID_CURSOR",
          "Invalid callback history cursor.",
        );
      }
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      throw new DomainError(
        "INVALID_INPUT",
        "Choose a page size from 1 to 50.",
      );
    const rows = await this.domain.db
      .prepare(
        `SELECT * FROM customer_webhook_deliveries WHERE organization_id=? AND endpoint_id=? ${before ? "AND (occurred_at<? OR (occurred_at=? AND id<?))" : ""} AND ${fence.condition} ORDER BY occurred_at DESC,id DESC LIMIT ?`,
      )
      .bind(
        ctx.organizationId,
        id,
        ...(before ? [before.at, before.at, before.id] : []),
        ...fence.values,
        limit + 1,
      )
      .all<DeliveryRow>();
    const view = (row: DeliveryRow): CustomerWebhookDelivery => ({
      id: row.id,
      eventId: row.event_id,
      endpointRevision: row.endpoint_revision,
      dispatchId: row.dispatch_id,
      dispatchStatus: row.dispatch_status,
      status: row.status,
      occurredAt: row.occurred_at,
      finishedAt: row.finished_at,
      responseStatus: row.response_status,
      errorCode: row.error_code,
    });
    return {
      items: rows.results.slice(0, limit).map(view),
      nextCursor:
        rows.results.length > limit
          ? btoa(
              JSON.stringify({
                at: rows.results[limit - 1].occurred_at,
                id: rows.results[limit - 1].id,
              }),
            )
              .replaceAll("+", "-")
              .replaceAll("/", "_")
              .replaceAll("=", "")
          : null,
    };
  }
}

export async function processCustomerWebhooks(
  env: WebhookEnv,
  domain: DomainService,
  dependencies: Dependencies = {},
) {
  const counts = {
    customerWebhooksSent: 0,
    customerWebhooksFailed: 0,
    customerWebhooksUnknown: 0,
  };
  if (
    !customerWebhookCapabilities(env).enabled ||
    domain.config.mode !== "production"
  )
    return counts;
  const db = domain.db,
    clock = dependencies.now ?? (() => new Date()),
    stamp = () => clock().toISOString();
  const time = stamp();
  const maintained = await db.batch([
    db
      .prepare(
        "UPDATE customer_webhook_deliveries SET status=CASE WHEN invoked_at IS NULL THEN 'failed' ELSE 'unknown' END,finished_at=?,error_code=CASE WHEN invoked_at IS NULL THEN 'lease_expired_before_invocation' ELSE 'invocation_interrupted' END WHERE id IN(SELECT id FROM customer_webhook_deliveries WHERE status='sending' AND lease_until<=? LIMIT 100) RETURNING status",
      )
      .bind(time, time),
    db
      .prepare(
        `UPDATE customer_webhook_deliveries SET status='superseded',finished_at=?,error_code='endpoint_authority_changed' WHERE id IN(SELECT d.id FROM customer_webhook_deliveries d JOIN customer_webhook_endpoints e ON e.organization_id=d.organization_id AND e.id=d.endpoint_id WHERE d.status='pending' AND (e.status<>'active' OR e.enabled<>1 OR e.revision<>d.endpoint_revision OR NOT (${liveAuthority})) LIMIT 100)`,
      )
      .bind(time),
    db
      .prepare(
        "UPDATE customer_webhook_deliveries SET status='failed',finished_at=?,error_code='pending_expired_without_invocation' WHERE id IN(SELECT id FROM customer_webhook_deliveries WHERE status='pending' AND occurred_at<? LIMIT 100)",
      )
      .bind(time, new Date(clock().getTime() - 7 * 86_400_000).toISOString()),
    db
      .prepare(
        "DELETE FROM customer_webhook_deliveries WHERE id IN(SELECT id FROM customer_webhook_deliveries WHERE status IN('sent','failed','unknown','superseded') AND finished_at<? LIMIT 100)",
      )
      .bind(
        new Date(
          clock().getTime() - CUSTOMER_WEBHOOK_LIMITS.historyDays * 86_400_000,
        ).toISOString(),
      ),
  ]);
  for (const row of maintained[0].results as { status: string }[]) {
    if (row.status === "unknown") counts.customerWebhooksUnknown++;
    else counts.customerWebhooksFailed++;
  }
  const pending = await db
    .prepare(
      "SELECT * FROM (SELECT d.*,row_number() OVER(PARTITION BY organization_id ORDER BY occurred_at,id) AS organization_rank FROM customer_webhook_deliveries d WHERE status='pending') WHERE organization_rank<=2 ORDER BY organization_rank,occurred_at,id LIMIT ?",
    )
    .bind(CUSTOMER_WEBHOOK_LIMITS.batch)
    .all<DeliveryRow>();
  for (const delivery of pending.results) {
    const lease = crypto.randomUUID(),
      leaseUntil = new Date(
        clock().getTime() + CUSTOMER_WEBHOOK_LIMITS.leaseSeconds * 1000,
      ).toISOString();
    const eligible = `EXISTS(SELECT 1 FROM customer_webhook_endpoints e WHERE e.organization_id=customer_webhook_deliveries.organization_id AND e.id=customer_webhook_deliveries.endpoint_id AND e.revision=customer_webhook_deliveries.endpoint_revision AND e.enabled=1 AND e.status='active' AND ${liveAuthority}) AND EXISTS(SELECT 1 FROM dispatches source WHERE source.organization_id=customer_webhook_deliveries.organization_id AND source.id=customer_webhook_deliveries.dispatch_id AND source.mode='production' AND source.channel=customer_webhook_deliveries.channel)`;
    const claimed = await db
      .prepare(
        `UPDATE customer_webhook_deliveries SET status='sending',lease_token=?,lease_until=? WHERE organization_id=? AND id=? AND status='pending' AND ${eligible} RETURNING id`,
      )
      .bind(lease, leaseUntil, delivery.organization_id, delivery.id)
      .all();
    if (!claimed.results.length) continue;
    let invoked = false;
    try {
      const endpoint = await db
        .prepare(
          "SELECT * FROM customer_webhook_endpoints WHERE organization_id=? AND id=? AND revision=? AND enabled=1 AND status='active'",
        )
        .bind(
          delivery.organization_id,
          delivery.endpoint_id,
          delivery.endpoint_revision,
        )
        .first<EndpointRow>();
      if (!endpoint) throw new Error("endpoint_changed");
      if (!/^[A-Za-z0-9_.:-]{1,400}$/.test(delivery.event_id))
        throw new Error("event_invalid");
      const url = customerWebhookDestination(endpoint.url),
        secret = await open(env, endpoint);
      const event: CustomerWebhookEvent = {
        id: delivery.event_id,
        type: "dispatch.status_changed",
        occurredAt: delivery.occurred_at,
        organizationId: delivery.organization_id,
        data: {
          dispatchId: delivery.dispatch_id,
          channel: delivery.channel,
          status: delivery.dispatch_status,
          mode: "production",
        },
      };
      const body = canonicalJson(event),
        timestamp = String(Math.floor(clock().getTime() / 1000));
      const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const signature = Array.from(
        new Uint8Array(
          await crypto.subtle.sign(
            "HMAC",
            key,
            encoder.encode(`${timestamp}.${event.id}.${body}`),
          ),
        ),
        (byte) => byte.toString(16).padStart(2, "0"),
      ).join("");
      const marker = await db
        .prepare(
          `UPDATE customer_webhook_deliveries SET invoked_at=? WHERE organization_id=? AND id=? AND status='sending' AND lease_token=? AND invoked_at IS NULL AND lease_until>? AND ${eligible} RETURNING id`,
        )
        .bind(stamp(), delivery.organization_id, delivery.id, lease, stamp())
        .all();
      if (!marker.results.length) throw new Error("invocation_fence_refused");
      invoked = true;
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const fetcher = dependencies.fetch ?? globalThis.fetch;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("deadline"));
        }, CUSTOMER_WEBHOOK_LIMITS.timeoutMs);
      });
      let response: Response;
      try {
        response = await Promise.race([
          fetcher(url, {
            method: "POST",
            redirect: "manual",
            signal: controller.signal,
            headers: {
              "Content-Type": "application/json",
              "Guteneo-Webhook-Id": event.id,
              "Guteneo-Webhook-Timestamp": timestamp,
              "Guteneo-Webhook-Signature": `v1=${signature}`,
            },
            body,
          }),
          timeout,
        ]);
      } finally {
        clearTimeout(timer);
      }
      void response.body?.cancel().catch(() => {});
      const accepted = response.status >= 200 && response.status < 300;
      const recorded = await db
        .prepare(
          "UPDATE customer_webhook_deliveries SET status=?,finished_at=?,response_status=?,error_code=? WHERE organization_id=? AND id=? AND status='sending' AND lease_token=?",
        )
        .bind(
          accepted ? "sent" : "failed",
          stamp(),
          response.status,
          accepted
            ? null
            : response.status >= 300 && response.status < 400
              ? "redirect_refused"
              : "http_rejected",
          delivery.organization_id,
          delivery.id,
          lease,
        )
        .run();
      if (recorded.meta.changes !== 1) counts.customerWebhooksUnknown++;
      else if (accepted) counts.customerWebhooksSent++;
      else counts.customerWebhooksFailed++;
    } catch {
      await db
        .prepare(
          "UPDATE customer_webhook_deliveries SET status=?,finished_at=?,error_code=? WHERE organization_id=? AND id=? AND status='sending' AND lease_token=?",
        )
        .bind(
          invoked ? "unknown" : "failed",
          stamp(),
          invoked ? "transport_outcome_unknown" : "preflight_refused",
          delivery.organization_id,
          delivery.id,
          lease,
        )
        .run();
      if (invoked) counts.customerWebhooksUnknown++;
      else counts.customerWebhooksFailed++;
    }
  }
  return counts;
}
