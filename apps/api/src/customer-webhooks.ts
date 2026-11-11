import { z } from "zod";
import {
  DomainError,
  type ActorContext,
  type Mode,
} from "../../../packages/domain/src/index";
import { browserAdministratorFence } from "./browser-administrator";

/*
 * Customer webhooks: a workspace administrator registers HTTPS endpoints that
 * receive a signed notice each time one of the workspace's dispatches changes
 * status. A database trigger queues the notice in the same transaction as the
 * status change (migration 0080); the scheduled handler delivers due notices.
 *
 * - Off by default: a workspace has no endpoint until an administrator adds one,
 *   and nothing is delivered while WEBHOOK_SIGNING_KEY is missing.
 * - No secret is stored: each endpoint's signing secret is derived from the
 *   server key, the endpoint id and its rotation counter, and shown once.
 * - A notice carries the dispatch id, channel, status and time only: never a
 *   recipient, content, document, amount or provider reference.
 * - Delivery is at least once, bounded per tick, with six attempts over about
 *   a day; URLs and response bodies are never logged.
 */

export const MAX_WEBHOOK_ENDPOINTS = 5;
const DELIVERIES_PER_TICK = 20;
const DELIVERY_TIMEOUT_MS = 5_000;
/** Minutes after each failed attempt; the last failure abandons the notice. */
const RETRY_AFTER_MINUTES = [1, 5, 30, 120, 360] as const;
const MAX_ATTEMPTS = RETRY_AFTER_MINUTES.length + 1;

export type WebhookEnv = { DB: D1Database; WEBHOOK_SIGNING_KEY?: string };

export const webhookEndpointInput = z
  .object({ url: z.string().min(12).max(500) })
  .strict();

const PRIVATE_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".intranet",
  ".lan",
  ".home",
  ".corp",
  ".home.arpa",
  ".test",
  ".invalid",
  ".example",
];

/**
 * The only accepted destination: HTTPS on the default port to a public DNS
 * name, without credentials. IP literals and private names are refused so a
 * workspace cannot point Guteneo at an internal service.
 */
export function normalizeWebhookUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw invalidUrl();
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.port !== "" ||
    url.username ||
    url.password ||
    url.hash ||
    !host.includes(".") ||
    host.startsWith("[") ||
    /^[\d.]+$/.test(host) ||
    /^[0-9a-f:]+$/.test(host) ||
    host === "localhost" ||
    PRIVATE_SUFFIXES.some((suffix) => host.endsWith(suffix)) ||
    url.href.length > 500
  )
    throw invalidUrl();
  return url.href;
}

function invalidUrl() {
  return new DomainError(
    "WEBHOOK_URL_INVALID",
    "Use an HTTPS address on a public domain name, without a port or credentials.",
  );
}

export function webhooksAvailable(env: WebhookEnv) {
  return (env.WEBHOOK_SIGNING_KEY ?? "").length >= 32;
}

async function hmac(key: string | ArrayBuffer, message: string) {
  const material =
    typeof key === "string" ? new TextEncoder().encode(key) : key;
  const imported = await crypto.subtle.importKey(
    "raw",
    material,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign(
    "HMAC",
    imported,
    new TextEncoder().encode(message),
  );
}

const hex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

/** The endpoint's signing secret; never stored, shown once to the administrator. */
export async function endpointSecret(
  signingKey: string,
  endpointId: string,
  version: number,
) {
  return `whsec_${hex(await hmac(signingKey, `webhook:${endpointId}:${version}`))}`;
}

/** `t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body" with the endpoint secret>`. */
export async function signWebhook(secret: string, body: string, at: number) {
  return `t=${at},v1=${hex(await hmac(secret, `${at}.${body}`))}`;
}

type EndpointRow = {
  id: string;
  url: string;
  enabled: number;
  secret_version: number;
  created_at: string;
};

export type WebhookEndpointView = {
  id: string;
  url: string;
  enabled: boolean;
  created_at: string;
  recent: {
    id: string;
    status: string;
    state: "pending" | "delivered" | "abandoned";
    attempts: number;
    last_response: number | null;
    occurred_at: string;
  }[];
};

function requireAdministrator(ctx: ActorContext) {
  if (ctx.actor !== "browser" || ctx.role !== "admin")
    throw new DomainError(
      "ADMIN_REQUIRED",
      "A current browser administrator session is required.",
      403,
    );
}

export class CustomerWebhookService {
  constructor(
    private readonly env: WebhookEnv,
    private readonly mode: Mode,
  ) {}

  async list(ctx: ActorContext) {
    requireAdministrator(ctx);
    const fence = browserAdministratorFence(ctx, this.mode);
    const endpoints = await this.env.DB.prepare(
      `SELECT id,url,enabled,secret_version,created_at FROM webhook_endpoints WHERE organization_id=? AND ${fence.condition} ORDER BY created_at`,
    )
      .bind(ctx.organizationId, ...fence.values)
      .all<EndpointRow>();
    const recent = await this.env.DB.prepare(
      `SELECT id,endpoint_id,status,state,attempts,last_response,occurred_at FROM (SELECT d.*,row_number() OVER (PARTITION BY d.endpoint_id ORDER BY d.occurred_at DESC,d.id) n FROM webhook_deliveries d WHERE d.organization_id=?) WHERE n<=5`,
    )
      .bind(ctx.organizationId)
      .all<WebhookEndpointView["recent"][number] & { endpoint_id: string }>();
    return {
      available: webhooksAvailable(this.env),
      endpoints: endpoints.results.map((row): WebhookEndpointView => ({
        id: row.id,
        url: row.url,
        enabled: row.enabled === 1,
        created_at: row.created_at,
        recent: recent.results
          .filter((item) => item.endpoint_id === row.id)
          .map(({ endpoint_id: _endpoint, ...item }) => item),
      })),
    };
  }

  private assertAvailable() {
    if (!webhooksAvailable(this.env))
      throw new DomainError(
        "WEBHOOKS_UNAVAILABLE",
        "Webhooks are not configured on this server.",
        503,
      );
  }

  async create(ctx: ActorContext, input: z.infer<typeof webhookEndpointInput>) {
    requireAdministrator(ctx);
    this.assertAvailable();
    const url = normalizeWebhookUrl(input.url);
    const fence = browserAdministratorFence(ctx, this.mode);
    const id = `whe_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const [inserted] = await this.env.DB.batch([
      this.env.DB.prepare(
        `INSERT INTO webhook_endpoints(id,organization_id,url,secret_version,enabled,created_at,updated_at) SELECT ?,?,?,1,1,?,? WHERE ${fence.condition} AND (SELECT count(*) FROM webhook_endpoints WHERE organization_id=?)<${MAX_WEBHOOK_ENDPOINTS} AND NOT EXISTS(SELECT 1 FROM webhook_endpoints WHERE organization_id=? AND url=?)`,
      ).bind(
        id,
        ctx.organizationId,
        url,
        now,
        now,
        ...fence.values,
        ctx.organizationId,
        ctx.organizationId,
        url,
      ),
      this.env.DB.prepare(
        "INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) SELECT ?,?,?,'webhook.created',?,'{}',? WHERE changes()=1",
      ).bind(crypto.randomUUID(), ctx.organizationId, ctx.userId, id, now),
    ]);
    if (!inserted?.meta.changes) {
      const duplicate = await this.env.DB.prepare(
        "SELECT 1 FROM webhook_endpoints WHERE organization_id=? AND url=?",
      )
        .bind(ctx.organizationId, url)
        .first();
      if (duplicate)
        throw new DomainError(
          "WEBHOOK_EXISTS",
          "This address is already registered.",
          409,
        );
      const allowed = await this.env.DB.prepare(
        `SELECT 1 WHERE ${fence.condition}`,
      )
        .bind(...fence.values)
        .first();
      if (!allowed)
        throw new DomainError(
          "ADMIN_REQUIRED",
          "A current browser administrator session is required.",
          403,
        );
      throw new DomainError(
        "WEBHOOKS_FULL",
        "This workspace already has the maximum number of webhook addresses.",
        409,
      );
    }
    return {
      endpoint: { id, url, enabled: true, created_at: now, recent: [] },
      secret: await endpointSecret(this.env.WEBHOOK_SIGNING_KEY!, id, 1),
    };
  }

  /** A new secret invalidates the previous one immediately. */
  async rotate(ctx: ActorContext, id: string) {
    requireAdministrator(ctx);
    this.assertAvailable();
    const row = await this.update(
      ctx,
      id,
      "secret_version=secret_version+1",
      [],
      "webhook.secret_rotated",
    );
    return {
      secret: await endpointSecret(
        this.env.WEBHOOK_SIGNING_KEY!,
        id,
        row.secret_version,
      ),
    };
  }

  async setEnabled(ctx: ActorContext, id: string, enabled: boolean) {
    requireAdministrator(ctx);
    await this.update(
      ctx,
      id,
      "enabled=?",
      [enabled ? 1 : 0],
      enabled ? "webhook.enabled" : "webhook.disabled",
    );
    return { enabled };
  }

  async remove(ctx: ActorContext, id: string) {
    requireAdministrator(ctx);
    const fence = browserAdministratorFence(ctx, this.mode);
    const now = new Date().toISOString();
    const [, removed] = await this.env.DB.batch([
      this.env.DB.prepare(
        `DELETE FROM webhook_deliveries WHERE organization_id=? AND endpoint_id=? AND ${fence.condition}`,
      ).bind(ctx.organizationId, id, ...fence.values),
      this.env.DB.prepare(
        `DELETE FROM webhook_endpoints WHERE organization_id=? AND id=? AND ${fence.condition}`,
      ).bind(ctx.organizationId, id, ...fence.values),
      this.env.DB.prepare(
        "INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) SELECT ?,?,?,'webhook.deleted',?,'{}',? WHERE changes()=1",
      ).bind(crypto.randomUUID(), ctx.organizationId, ctx.userId, id, now),
    ]);
    if (!removed?.meta.changes)
      throw new DomainError("NOT_FOUND", "Webhook not found.", 404);
    return { deleted: true };
  }

  private async update(
    ctx: ActorContext,
    id: string,
    assignment: string,
    values: unknown[],
    action: string,
  ) {
    const fence = browserAdministratorFence(ctx, this.mode);
    const now = new Date().toISOString();
    const [updated] = await this.env.DB.batch([
      this.env.DB.prepare(
        `UPDATE webhook_endpoints SET ${assignment},updated_at=? WHERE organization_id=? AND id=? AND ${fence.condition} RETURNING secret_version`,
      ).bind(...values, now, ctx.organizationId, id, ...fence.values),
      this.env.DB.prepare(
        "INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) SELECT ?,?,?,?,?,'{}',? WHERE changes()=1",
      ).bind(
        crypto.randomUUID(),
        ctx.organizationId,
        ctx.userId,
        action,
        id,
        now,
      ),
    ]);
    const row = (
      updated?.results as { secret_version: number }[] | undefined
    )?.[0];
    if (!row) throw new DomainError("NOT_FOUND", "Webhook not found.", 404);
    return row;
  }
}

type DueDelivery = {
  id: string;
  endpoint_id: string;
  dispatch_id: string;
  status: string;
  channel: string;
  occurred_at: string;
  attempts: number;
  next_attempt_at: string;
  url: string;
  enabled: number;
  secret_version: number;
};

/**
 * Delivers due notices. Each one is claimed by moving its next attempt a
 * minute ahead, so overlapping ticks do not send it twice in the same minute;
 * receivers still deduplicate by the Guteneo-Delivery id.
 */
export async function deliverCustomerWebhooks(
  env: WebhookEnv,
  fetcher: typeof fetch = fetch,
  now = () => Date.now(),
) {
  const counts = {
    webhooksDelivered: 0,
    webhooksFailed: 0,
    webhooksAbandoned: 0,
  };
  if (!webhooksAvailable(env)) return counts;
  const at = new Date(now()).toISOString();
  const due = await env.DB.prepare(
    `SELECT d.id,d.endpoint_id,d.dispatch_id,d.status,d.channel,d.occurred_at,d.attempts,d.next_attempt_at,e.url,e.enabled,e.secret_version
     FROM webhook_deliveries d JOIN webhook_endpoints e ON e.id=d.endpoint_id AND e.organization_id=d.organization_id
     WHERE d.state='pending' AND d.next_attempt_at<=? ORDER BY d.next_attempt_at LIMIT ${DELIVERIES_PER_TICK}`,
  )
    .bind(at)
    .all<DueDelivery>();
  for (const item of due.results) {
    if (item.enabled !== 1) {
      await env.DB.prepare(
        "UPDATE webhook_deliveries SET state='abandoned' WHERE id=? AND state='pending'",
      )
        .bind(item.id)
        .run();
      counts.webhooksAbandoned += 1;
      continue;
    }
    const claim = await env.DB.prepare(
      "UPDATE webhook_deliveries SET next_attempt_at=? WHERE id=? AND state='pending' AND next_attempt_at=?",
    )
      .bind(
        new Date(now() + 60_000).toISOString(),
        item.id,
        item.next_attempt_at,
      )
      .run();
    if (!claim.meta.changes) continue;
    const body = JSON.stringify({
      id: item.id,
      type: "dispatch.status_changed",
      created_at: item.occurred_at,
      data: {
        dispatch_id: item.dispatch_id,
        channel: item.channel,
        status: item.status,
      },
    });
    const secret = await endpointSecret(
      env.WEBHOOK_SIGNING_KEY!,
      item.endpoint_id,
      item.secret_version,
    );
    let response = 0;
    try {
      const result = await fetcher(item.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "Guteneo-Webhooks/1",
          "guteneo-delivery": item.id,
          "guteneo-signature": await signWebhook(
            secret,
            body,
            Math.floor(now() / 1000),
          ),
        },
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      });
      response = result.status;
      // The body is never read: it may echo anything the receiver chose.
      await result.body?.cancel();
    } catch {
      response = 0;
    }
    const attempts = item.attempts + 1;
    if (response >= 200 && response < 300) {
      await env.DB.prepare(
        "UPDATE webhook_deliveries SET state='delivered',attempts=?,last_response=?,delivered_at=? WHERE id=?",
      )
        .bind(attempts, response, new Date(now()).toISOString(), item.id)
        .run();
      counts.webhooksDelivered += 1;
    } else if (attempts >= MAX_ATTEMPTS) {
      await env.DB.prepare(
        "UPDATE webhook_deliveries SET state='abandoned',attempts=?,last_response=? WHERE id=?",
      )
        .bind(attempts, response, item.id)
        .run();
      counts.webhooksAbandoned += 1;
    } else {
      await env.DB.prepare(
        "UPDATE webhook_deliveries SET attempts=?,last_response=?,next_attempt_at=? WHERE id=?",
      )
        .bind(
          attempts,
          response,
          new Date(
            now() + RETRY_AFTER_MINUTES[attempts - 1]! * 60_000,
          ).toISOString(),
          item.id,
        )
        .run();
      counts.webhooksFailed += 1;
    }
  }
  return counts;
}
