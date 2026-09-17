import { billingConfigured } from "./billing";

export interface Env {
  WRANGLER_VERSION_METADATA?: { id: string };
  DB: D1Database;
  DOCUMENTS: R2Bucket;
  DISPATCH_QUEUE: Queue<{ dispatchId: string }>;
  BULK_QUEUE: Queue<{ dispatchId: string }>;
  ASSETS: Fetcher;
  DOCUMENT_RENDERER?: Fetcher;
  ENVIRONMENT: "local" | "staging" | "production";
  MODE: "simulation" | "production";
  APP_ORIGIN: string;
  DOCUMENT_RENDERER_URL?: string;
  IMPORT_ALLOWED_HOSTS?: string;
  SCANNER?: Fetcher;
  AUTH0_DOMAIN?: string;
  AUTH0_CLIENT_ID?: string;
  AUTH0_CLIENT_SECRET?: string;
  AUTH0_AUDIENCE?: string;
  AUTH0_AUTH_POLICY?: "verified_email" | "verified_email_and_mfa";
  STRIPE_API_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_MODE?: "test" | "live";
  STRIPE_PORTAL_CONFIGURATION_ID?: string;
  LIVE_SENDS_ENABLED?: string;
  POSTAL_DRAFTS_ENABLED?: string;
  TELNYX_API_KEY?: string;
  TELNYX_PUBLIC_KEY?: string;
  TELNYX_CONNECTION_ID?: string;
  TELNYX_ACCOUNT_ID?: string;
  TELNYX_OUTBOUND_VOICE_PROFILE_ID?: string;
  TELNYX_FROM?: string;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_REGION?: string;
  SES_CONFIGURATION_SET?: string;
  SES_SNS_TOPIC_ARN?: string;
  SES_ACCOUNT_ID?: string;
  SES_VERIFIED_RECIPIENTS?: string;
  PINGEN_CLIENT_ID?: string;
  PINGEN_CLIENT_SECRET?: string;
  PINGEN_ORGANIZATION_ID?: string;
  PINGEN_DEFAULT_COUNTRY?: string;
  PINGEN_WEBHOOK_SECRET?: string;
  PROVIDER_URL_SIGNING_SECRET?: string;
  TELNYX_ALLOWED_PREFIXES?: string;
  AWS_SESSION_TOKEN?: string;
  SES_SANDBOX?: string;
  PINGEN_SANDBOX?: string;
  PINGEN_UPLOAD_ORIGINS?: string;
}
/** Runtime safety applies to callbacks and scheduled reconciliation too. */
export function assertBaseConfiguration(env: Env, request?: Request): void {
  if (!["local", "staging", "production"].includes(env.ENVIRONMENT))
    throw new Error("INVALID_ENVIRONMENT");
  if (!["simulation", "production"].includes(env.MODE))
    throw new Error("INVALID_MODE");
  if (env.ENVIRONMENT === "production" && env.MODE !== "production")
    throw new Error("PRODUCTION_SIMULATION_FORBIDDEN");
  if (
    env.ENVIRONMENT === "local" &&
    request &&
    !["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.url).hostname)
  )
    throw new Error("LOCAL_HOST_REQUIRED");
  if (
    env.ENVIRONMENT !== "local" &&
    new URL(env.APP_ORIGIN).protocol !== "https:"
  )
    throw new Error("HTTPS_REQUIRED");
}

export function assertConfiguration(env: Env, request?: Request): void {
  assertBaseConfiguration(env, request);
  const pathname = request ? new URL(request.url).pathname : undefined;
  const readiness =
    request &&
    ["GET", "HEAD"].includes(request.method) &&
    ["/api/health", "/api/capabilities"].includes(pathname!);
  // Providers authenticate their own callbacks. This only reaches the verifier;
  // it never authorizes a receipt, a browser session, or a send by itself.
  const configuredSesCallback =
    request?.method === "POST" &&
    pathname === "/webhooks/ses" &&
    Boolean(env.SES_SNS_TOPIC_ARN);
  const configuredTelnyxCallback =
    request?.method === "POST" &&
    pathname === "/webhooks/telnyx" &&
    Boolean(env.TELNYX_PUBLIC_KEY);
  const configuredPingenCallback =
    request?.method === "POST" &&
    pathname === "/webhooks/pingen" &&
    Boolean(env.PINGEN_WEBHOOK_SECRET && env.PINGEN_ORGANIZATION_ID);
  const configuredStripeCallback =
    request?.method === "POST" &&
    pathname === "/webhooks/stripe" &&
    billingConfigured(env);
  if (
    env.ENVIRONMENT !== "local" &&
    !readiness &&
    !configuredSesCallback &&
    !configuredTelnyxCallback &&
    !configuredPingenCallback &&
    !configuredStripeCallback &&
    (!env.AUTH0_DOMAIN ||
      !env.AUTH0_CLIENT_ID ||
      !env.AUTH0_CLIENT_SECRET ||
      !env.AUTH0_AUDIENCE)
  )
    throw new Error("IDENTITY_NOT_CONFIGURED");
}
