import { z } from "zod";
import { DomainError } from "../../../packages/domain/src/index";
import {
  authenticateBrowser,
  type AuthContext,
  type AuthEnv,
  type AuthenticatedSession,
} from "./auth";

export interface HorizonEnv extends AuthEnv {
  HORIZON_ENABLED?: string;
  PDF_VALIDATOR?: Fetcher;
}
export const HORIZON_TERMS_VERSION = "horizon-2026-10-02-v1";
export const HORIZON_PLAN = {
  id: "horizon",
  name: "guteneo Horizon",
  priceMinor: 3000,
  currency: "EUR",
  interval: "month",
} as const;
type Subscription = {
  organization_id: string;
  evidence: "simulation" | "production";
  status: "active" | "past_due" | "cancelled";
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: number;
  anchor_day: number;
};
export type HorizonStatus = {
  plan: typeof HORIZON_PLAN;
  termsVersion: typeof HORIZON_TERMS_VERSION;
  enabled: boolean;
  status: "inactive" | Subscription["status"];
  entitled: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  billingManagementAllowed: boolean;
  paymentSource: "account_credits";
  evidence: "simulation" | "production";
  creditAvailableMinor: number | null;
};
function fail(code: string, message: string, status = 400): never {
  throw new DomainError(code, message, status);
}
function enabled(env: HorizonEnv): boolean {
  return (
    env.HORIZON_ENABLED === "true" &&
    Boolean(env.PDF_VALIDATOR) &&
    (env.ENVIRONMENT !== "production" || env.MODE === "production")
  );
}
function requireEnabled(env: HorizonEnv): void {
  if (!enabled(env))
    fail(
      "HORIZON_UNAVAILABLE",
      "Le forfait Horizon n’est pas encore disponible pour cet espace.",
      503,
    );
}
async function membership(env: HorizonEnv, actor: AuthContext) {
  const current = await env.DB.prepare(
    "SELECT m.role,o.mode FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.organization_id=? AND m.user_id=?",
  )
    .bind(actor.organizationId, actor.userId)
    .first<{ role: string; mode: "simulation" | "production" }>();
  if (!current)
    fail("MEMBERSHIP_REQUIRED", "Cet espace n’est pas accessible.", 403);
  if (current.mode !== env.MODE)
    fail(
      "HORIZON_MODE_MISMATCH",
      "Le mode de cet espace est incompatible.",
      403,
    );
  return current;
}
export async function getHorizonStatus(
  env: HorizonEnv,
  actor: AuthContext,
): Promise<HorizonStatus> {
  const current = await membership(env, actor);
  const admin = actor.actor === "browser" && current.role === "admin";
  const row = await env.DB.prepare(
    "SELECT organization_id,evidence,status,current_period_start,current_period_end,cancel_at_period_end,anchor_day FROM horizon_subscriptions WHERE organization_id=? AND evidence=?",
  )
    .bind(actor.organizationId, current.mode)
    .first<Subscription>();
  const now = new Date().toISOString();
  const available = admin
    ? await env.DB.prepare(
        "SELECT available_minor FROM horizon_available_credits WHERE organization_id=? AND evidence=?",
      )
        .bind(actor.organizationId, current.mode)
        .first<{ available_minor: number }>()
    : null;
  return {
    plan: HORIZON_PLAN,
    termsVersion: HORIZON_TERMS_VERSION,
    enabled: enabled(env),
    status:
      row?.status === "active" && row.current_period_end <= now
        ? "past_due"
        : (row?.status ?? "inactive"),
    entitled:
      enabled(env) &&
      Boolean(
        row &&
        ["active", "cancelled"].includes(row.status) &&
        row.current_period_start <= now &&
        row.current_period_end > now,
      ),
    currentPeriodStart: row?.current_period_start ?? null,
    currentPeriodEnd: row?.current_period_end ?? null,
    cancelAtPeriodEnd: row?.cancel_at_period_end === 1,
    billingManagementAllowed: admin,
    paymentSource: "account_credits",
    evidence: current.mode,
    creditAvailableMinor: admin ? (available?.available_minor ?? 0) : null,
  };
}
export async function requireHorizonPlan(
  env: HorizonEnv,
  actor: AuthContext,
): Promise<HorizonStatus> {
  const status = await getHorizonStatus(env, actor);
  if (!status.entitled)
    fail(
      "HORIZON_PLAN_REQUIRED",
      "Un forfait guteneo Horizon actif est nécessaire. L’administrateur peut le gérer dans Guteneo.",
      402,
    );
  return status;
}

/** Calendar anniversary, clamped to the month while preserving the original day. */
export function horizonPeriodEnd(
  start: Date,
  anchorDay = start.getUTCDate(),
): string {
  const end = new Date(start);
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const last = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0),
  );
  end.setUTCDate(Math.min(anchorDay, last.getUTCDate()));
  return end.toISOString();
}
function key(request: Request): string {
  const value = request.headers.get("Idempotency-Key") ?? "";
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(value))
    fail("IDEMPOTENCY_KEY_REQUIRED", "Une clé de souscription est nécessaire.");
  return value;
}
async function body(request: Request, subscribing: boolean): Promise<void> {
  const raw = await request.text();
  if (raw.length > 512) fail("VALIDATION_ERROR", "Données invalides.");
  try {
    const schema = subscribing
      ? z
          .object({
            consent: z.literal(true),
            termsVersion: z.literal(HORIZON_TERMS_VERSION),
          })
          .strict()
      : z.object({}).strict();
    schema.parse(raw ? JSON.parse(raw) : {});
  } catch {
    fail(
      subscribing ? "HORIZON_CONSENT_REQUIRED" : "VALIDATION_ERROR",
      subscribing
        ? "Confirmez le prix de 30 € par mois, le débit des crédits et le renouvellement mensuel."
        : "Données invalides.",
    );
  }
}
async function browserAction(
  env: HorizonEnv,
  session: AuthenticatedSession,
  action: "subscribe" | "cancel",
  requestKey: string,
): Promise<void> {
  const current = await membership(env, session.context);
  if (session.context.actor !== "browser" || current.role !== "admin")
    fail(
      "BILLING_ADMIN_REQUIRED",
      "Seul l’administrateur gère le forfait.",
      403,
    );
  const existing = await env.DB.prepare(
    "SELECT action FROM horizon_plan_actions WHERE organization_id=? AND request_key=?",
  )
    .bind(session.context.organizationId, requestKey)
    .first<{ action: string }>();
  if (existing) {
    if (existing.action !== action)
      fail("IDEMPOTENCY_CONFLICT", "Cette clé a déjà été utilisée.", 409);
    return;
  }
  const now = new Date();
  const timestamp = now.toISOString();
  const subscribe = action === "subscribe";
  // The INSERT SELECT fences current session, CSRF, policy and administrator
  // rights at the actual write. Its triggers debit and install access atomically.
  try {
    const result = await env.DB.prepare(
      `INSERT INTO horizon_plan_actions(id,organization_id,request_key,action,source,evidence,user_id,session_hash,terms_version,amount_minor,currency,payment_source,interval,auto_renew,current_period_start,current_period_end,anchor_day,created_at)
SELECT ?,?,?,?,?,?,?,?,?,3000,'EUR','account_credits','month',?,?,?,?,?
FROM browser_sessions s JOIN memberships m ON m.organization_id=s.organization_id AND m.user_id=s.user_id JOIN organizations o ON o.id=m.organization_id
WHERE s.token_hash=? AND s.organization_id=? AND s.user_id=? AND s.csrf_token=? AND s.expires_at>? AND m.role='admin' AND o.mode=? AND s.mfa=? AND s.verified_account=? AND (s.is_development=0 OR ?='simulation')
ON CONFLICT(organization_id,request_key) DO NOTHING`,
    )
      .bind(
        crypto.randomUUID(),
        session.context.organizationId,
        requestKey,
        action,
        "browser",
        current.mode,
        session.context.userId,
        session.tokenHash,
        HORIZON_TERMS_VERSION,
        Number(subscribe),
        subscribe ? timestamp : null,
        subscribe ? horizonPeriodEnd(now) : null,
        subscribe ? now.getUTCDate() : null,
        timestamp,
        session.tokenHash,
        session.context.organizationId,
        session.context.userId,
        session.csrfToken,
        timestamp,
        current.mode,
        Number(session.mfa),
        Number(session.verifiedAccount),
        env.MODE,
      )
      .run();
    if (!result.meta.changes) {
      const replay = await env.DB.prepare(
        "SELECT action FROM horizon_plan_actions WHERE organization_id=? AND request_key=?",
      )
        .bind(session.context.organizationId, requestKey)
        .first<{ action: string }>();
      if (replay?.action === action) return;
      if (replay)
        fail("IDEMPOTENCY_CONFLICT", "Cette clé a déjà été utilisée.", 409);
      fail(
        "BILLING_ADMIN_REQUIRED",
        "Vos droits ou votre session ont changé.",
        403,
      );
    }
  } catch (error) {
    if (error instanceof DomainError) throw error;
    const message = error instanceof Error ? error.message : "";
    if (message.includes("horizon_credit_exhausted"))
      fail(
        "HORIZON_CREDIT_INSUFFICIENT",
        "Le forfait nécessite 30 € de crédits disponibles, hors réservations.",
        409,
      );
    if (message.includes("horizon_admin_required"))
      fail(
        "BILLING_ADMIN_REQUIRED",
        "Vos droits ou votre session ont changé.",
        403,
      );
    throw error;
  }
}
export async function handleMonthlyPlanRoute(
  request: Request,
  env: HorizonEnv,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path !== "/api/plan" && !path.startsWith("/api/plan/")) return null;
  if (request.headers.has("Authorization"))
    fail(
      "BILLING_BROWSER_REQUIRED",
      "Gérez le forfait dans votre navigateur.",
      403,
    );
  const mutating = request.method !== "GET";
  const session = await authenticateBrowser(request, env, mutating);
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
  if (request.method === "GET" && path === "/api/plan")
    return Response.json(await getHorizonStatus(env, session.context), {
      headers: { "Cache-Control": "no-store" },
    });
  if (
    request.method === "POST" &&
    ["/api/plan/subscribe", "/api/plan/cancel"].includes(path)
  ) {
    const subscribe = path.endsWith("subscribe");
    if (subscribe) requireEnabled(env);
    await body(request, subscribe);
    await browserAction(
      env,
      session,
      subscribe ? "subscribe" : "cancel",
      key(request),
    );
    const current = await authenticateBrowser(request, env, true);
    if (
      current.context.organizationId !== session.context.organizationId ||
      current.context.userId !== session.context.userId
    )
      fail("BILLING_ADMIN_REQUIRED", "Votre session a changé.", 403);
    const status = await getHorizonStatus(env, current.context);
    if (!status.billingManagementAllowed)
      fail("BILLING_ADMIN_REQUIRED", "Vos droits ont changé.", 403);
    return Response.json(status, { headers: { "Cache-Control": "no-store" } });
  }
  return Response.json(
    { error: { code: "NOT_FOUND", message: "Route du forfait introuvable." } },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

/** Bounded renewal of explicit standing consent; never bills missing past months. */
export async function renewHorizonPlans(
  env: HorizonEnv,
  now = new Date(),
): Promise<void> {
  if (!enabled(env)) return;
  const timestamp = now.toISOString();
  const rows = await env.DB.prepare(
    "SELECT s.organization_id,s.evidence,s.status,s.current_period_start,s.current_period_end,s.cancel_at_period_end,s.anchor_day FROM horizon_subscriptions s LEFT JOIN horizon_available_credits b ON b.organization_id=s.organization_id AND b.evidence=s.evidence WHERE s.evidence=? AND (s.status='active' OR (s.status='past_due' AND b.available_minor>=3000)) AND s.cancel_at_period_end=0 AND s.current_period_end<=? ORDER BY s.current_period_end,s.organization_id LIMIT 100",
  )
    .bind(env.MODE, timestamp)
    .all<Subscription>();
  for (const row of rows.results) {
    const available = await env.DB.prepare(
      "SELECT available_minor FROM horizon_available_credits WHERE organization_id=? AND evidence=?",
    )
      .bind(row.organization_id, row.evidence)
      .first<{ available_minor: number }>();
    const sufficient = (available?.available_minor ?? 0) >= 3000;
    const successorEnd = horizonPeriodEnd(
      new Date(row.current_period_end),
      row.anchor_day,
    );
    const restart = timestamp >= successorEnd;
    const periodStart = restart ? timestamp : row.current_period_end;
    const anchorDay = restart ? now.getUTCDate() : row.anchor_day;
    const periodEnd = restart ? horizonPeriodEnd(now) : successorEnd;
    // One renewal/past-due result per previous paid period. A funded recovery
    // may use a new renewal key, while daily past-due scans create no new debt.
    const action = sufficient ? "renew" : "past_due";
    try {
      await env.DB.prepare(
        `INSERT INTO horizon_plan_actions(id,organization_id,request_key,action,source,evidence,terms_version,amount_minor,currency,payment_source,interval,auto_renew,current_period_start,current_period_end,anchor_day,expected_period_end,created_at)
SELECT ?,?,?,?,'system',?,'horizon-2026-10-02-v1',3000,'EUR','account_credits','month',?,?,?,?,?,?
FROM horizon_subscriptions s WHERE s.organization_id=? AND s.evidence=? AND s.status IN ('active','past_due') AND s.cancel_at_period_end=0 AND s.current_period_end=? AND s.current_period_end<=?
ON CONFLICT(organization_id,request_key) DO NOTHING`,
      )
        .bind(
          crypto.randomUUID(),
          row.organization_id,
          `${action}_${row.current_period_end.replace(/[^0-9]/g, "")}`,
          action,
          row.evidence,
          Number(sufficient),
          sufficient ? periodStart : null,
          sufficient ? periodEnd : null,
          sufficient ? anchorDay : null,
          row.current_period_end,
          timestamp,
          row.organization_id,
          row.evidence,
          row.current_period_end,
          timestamp,
        )
        .run();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      // Another transaction may reserve credit, cancel or renew after the read.
      // SQL refuses its stale command; a later scheduled run reads fresh state.
      if (
        ![
          "horizon_renewal_stale",
          "horizon_credit_exhausted",
          "horizon_credit_available",
        ].some((code) => message.includes(code))
      )
        throw error;
    }
  }
}
