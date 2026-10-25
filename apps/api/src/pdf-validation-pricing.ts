import {
  DomainError,
  type ActorContext,
} from "../../../packages/domain/src/index";
import {
  PDF_VALIDATION_PRICE_MINOR,
  PDF_VALIDATION_TERMS_VERSION,
  type PdfValidationPricing,
} from "../../../packages/contracts/src/pdf-validation";
import { authenticateBrowser, type AuthEnv } from "./auth";

export interface PdfValidationPricingEnv extends AuthEnv {
  MODE: "production" | "simulation";
  PDF_VALIDATION_ENABLED?: string;
  PDF_VALIDATOR?: Fetcher;
  SCANNER?: Fetcher;
}

export function pdfValidationAvailable(env: PdfValidationPricingEnv): boolean {
  return (
    env.PDF_VALIDATION_ENABLED === "true" &&
    Boolean(env.PDF_VALIDATOR) &&
    (env.MODE !== "production" || Boolean(env.SCANNER)) &&
    (env.ENVIRONMENT !== "production" || env.MODE === "production")
  );
}

export async function getPdfValidationPricing(
  env: PdfValidationPricingEnv,
  actor: ActorContext,
): Promise<PdfValidationPricing> {
  const current = await env.DB.prepare(
    "SELECT m.role,o.mode FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.organization_id=? AND m.user_id=?",
  )
    .bind(actor.organizationId, actor.userId)
    .first<{ role: string; mode: string }>();
  if (!current || current.mode !== env.MODE)
    throw new DomainError("FORBIDDEN", "This workspace is inaccessible.", 403);
  const admin = actor.actor === "browser" && current.role === "admin";
  const enabled = pdfValidationAvailable(env);
  const balance = admin
    ? await env.DB.prepare(
        "SELECT available_minor FROM pdf_validation_available_credits WHERE organization_id=? AND evidence=?",
      )
        .bind(actor.organizationId, env.MODE)
        .first<{ available_minor: number }>()
    : null;
  return {
    enabled,
    priceMinor: PDF_VALIDATION_PRICE_MINOR,
    currency: "EUR",
    taxBasis: "excluding_tax",
    termsVersion: PDF_VALIDATION_TERMS_VERSION,
    paymentSource: "account_credits",
    purchaseAllowed: enabled && admin,
    creditAvailableMinor: admin
      ? Math.max(0, balance?.available_minor ?? 0)
      : null,
    evidence: env.MODE,
  };
}

export async function handlePdfValidationPricingRoute(
  request: Request,
  env: PdfValidationPricingEnv,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const retired = path === "/api/plan" || path.startsWith("/api/plan/");
  if (!retired && path !== "/api/pdf-validation/pricing") return null;
  if (request.headers.has("Authorization"))
    throw new DomainError(
      "BILLING_BROWSER_REQUIRED",
      "Open Guteneo in your browser to review PDF check prices.",
      403,
    );
  const session = await authenticateBrowser(
    request,
    env,
    request.method !== "GET",
  );
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
          message: "Too many requests. Try again in a minute.",
        },
      },
      {
        status: 429,
        headers: { "Retry-After": "60", "Cache-Control": "no-store" },
      },
    );
  if (retired)
    return Response.json(
      {
        error: {
          code: "MONTHLY_PLAN_RETIRED",
          message:
            "Monthly subscriptions are discontinued. Review the price of one PDF check in Guteneo.",
        },
      },
      { status: 410, headers: { "Cache-Control": "no-store" } },
    );
  if (request.method !== "GET")
    return Response.json(
      {
        error: {
          code: "METHOD_NOT_ALLOWED",
          message: "Read the current PDF check price.",
        },
      },
      { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" } },
    );
  return Response.json(await getPdfValidationPricing(env, session.context), {
    headers: { "Cache-Control": "no-store" },
  });
}

/** Expired attempts release their derived credit hold without a debit. */
export async function expirePdfValidations(
  env: Pick<PdfValidationPricingEnv, "DB">,
  now = new Date().toISOString(),
): Promise<void> {
  await env.DB.prepare(
    "UPDATE pdf_validations SET status='error' WHERE rowid IN (SELECT rowid FROM pdf_validations WHERE status='processing' AND deadline_at<=? ORDER BY deadline_at LIMIT 100)",
  )
    .bind(now)
    .run();
}
