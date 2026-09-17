/** Operational metadata only. Never pass a request, exception, body, URL or business ID here. */
export interface ObservationEnv {
  WRANGLER_VERSION_METADATA?: { id: string };
}
export type Component = "app" | "documents" | "scanner";
export type Event =
  "http" | "queue" | "cron" | "outbox_deferred" | "mcp_tool_error";
const routes = [
  "health",
  "capabilities",
  "auth_login",
  "auth_signup",
  "auth_callback",
  "auth_other",
  "mcp",
  "oauth_metadata",
  "session",
  "documents",
  "dispatches",
  "campaigns",
  "recipients",
  "senders",
  "usage",
  "account",
  "billing",
  "admin",
  "postal",
  "webhook_ses",
  "webhook_telnyx",
  "webhook_pingen",
  "webhook_stripe",
  "webhook_other",
  "provider_media",
  "public_asset",
  "unknown",
  "render",
  "validate",
  "pingen_preflight",
  "scan",
  "scanner_health",
  "interactive",
  "bulk",
  "dead_letter",
  "maintenance",
] as const;
export type RouteCode = (typeof routes)[number];
const codes = [
  "OK",
  "HTTP_CLIENT_ERROR",
  "HTTP_SERVER_ERROR",
  "CONFIGURATION_INVALID",
  "AUTH_REJECTED",
  "DOMAIN_REJECTED",
  "CONTENT_REJECTED",
  "VALIDATION_ERROR",
  "INTERNAL_ERROR",
  "QUEUE_FAILED",
  "QUEUE_RETRY",
  "QUEUE_DEAD_LETTER",
  "SUBMISSION_UNKNOWN",
  "DISPATCH_FAILED",
  "CRON_FAILED",
  "IDENTITY_NOT_CONFIGURED",
  "OUTBOX_DEFERRED",
  "CALLBACK_PENDING",
] as const;
export type LogCode = (typeof codes)[number];
// These are closed labels, never a URL, request field or exception message.
export const importFailureReasons = [
  "missing_configuration",
  "untrusted_host",
  "invalid_scheme",
  "credentials",
  "port",
  "fragment",
  "private_host",
  "invalid_url",
  "download_timeout",
  "redirect_rejected",
  "source_expired",
  "download_failed",
] as const;
export type ImportFailureReason = (typeof importFailureReasons)[number];
const importSourceCategories = [
  "known_provider",
  "configured_host",
  "unknown_host",
  "invalid_source",
] as const;
export type ImportSourceCategory = (typeof importSourceCategories)[number];
export const knownImportHosts = ["files.oaiusercontent.com"] as const;
export interface ImportFailureObservation {
  reason: ImportFailureReason;
  sourceCategory: ImportSourceCategory;
  knownHost?: (typeof knownImportHosts)[number];
}
const stages = [
  "configuration",
  "callbacks",
  "identity",
  "outbox",
  "leases",
  "documents",
  "postal",
  "http_limits",
  "complete",
] as const;
export type Stage = (typeof stages)[number];
const metrics = [
  "messages",
  "acked",
  "retried",
  "deadLetters",
  "unknown",
  "failed",
  "published",
  "projected",
  "pending",
  "uncertain",
  "purged",
  "orphans",
] as const;
export type Metrics = Partial<Record<(typeof metrics)[number], number>>;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Match fixed route families; arbitrary path segments and query strings never reach logs. */
export function routeCode(
  request: Request,
  component: Component = "app",
): RouteCode {
  const path = new URL(request.url).pathname;
  if (component === "documents")
    return path === "/render"
      ? "render"
      : path === "/validate"
        ? "validate"
        : path === "/preflight/pingen"
          ? "pingen_preflight"
          : "unknown";
  if (component === "scanner")
    return path === "/scan"
      ? "scan"
      : path === "/health"
        ? "scanner_health"
        : "unknown";
  const exact: Record<string, RouteCode> = {
    "/api/health": "health",
    "/api/capabilities": "capabilities",
    "/api/session": "session",
    "/auth/login": "auth_login",
    "/auth/signup": "auth_signup",
    "/auth/callback": "auth_callback",
    "/mcp": "mcp",
    "/webhooks/ses": "webhook_ses",
    "/webhooks/telnyx": "webhook_telnyx",
    "/webhooks/pingen": "webhook_pingen",
    "/webhooks/stripe": "webhook_stripe",
  };
  if (Object.hasOwn(exact, path)) return exact[path];
  if (path.startsWith("/media/")) return "provider_media";
  if (
    [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/mcp",
    ].includes(path)
  )
    return "oauth_metadata";
  if (
    [
      "/api/logout",
      "/api/connections",
      "/api/dev/login",
      "/api/dev/mcp-token",
    ].includes(path)
  )
    return "account";
  if (
    /^\/api\/(documents|dispatches|campaigns|senders|usage|account|billing|admin)$/.test(
      path,
    )
  )
    return path.split("/")[2] as RouteCode;
  if (/^\/api\/documents\/render$/.test(path)) return "documents";
  if (path === "/api/recipients/validate") return "recipients";
  if (/^\/api\/postal\/(requirements|preflights)$/.test(path)) return "postal";
  if (
    path === "/api/account/sessions" ||
    path === "/api/account/expert-approval" ||
    /^\/api\/account\/sessions\/session_[a-f0-9]{32}$/.test(path)
  )
    return "account";
  if (/^\/api\/billing\/(customer|invoices|payments|portal)$/.test(path))
    return "billing";
  if (
    /^\/api\/admin\/(members|scanner\/warm|channels\/(fax|email|postal))$/.test(
      path,
    )
  )
    return "admin";
  // Only generated opaque IDs are eligible. Unknown or attacker-chosen path text is not logged,
  // even if a hosting platform decorates console records with request metadata.
  const id =
    "[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}";
  for (const [pattern, code] of [
    [`^/api/documents/doc_${id}/(content|rescan)$`, "documents"],
    [`^/api/dispatches/dsp_${id}(/(approve|confirm|cancel))?$`, "dispatches"],
    [`^/api/campaigns/cmp_${id}$`, "campaigns"],
    [
      `^/api/postal/preflights/pp_${id}(/(address\\.png|transfer|quote))?$`,
      "postal",
    ],
    [`^/api/admin/members/usr_${id}(/revoke-access)?$`, "admin"],
    [`^/api/connections/${id}$`, "account"],
    [`^/api/account/expert-approval/${id}$`, "account"],
  ] as const)
    if (new RegExp(pattern).test(path)) return code;
  return "unknown";
}

export function queueCode(name: string): RouteCode {
  return name.endsWith("-dlq")
    ? "dead_letter"
    : name.endsWith("-bulk")
      ? "bulk"
      : name.endsWith("-interactive")
        ? "interactive"
        : "unknown";
}

export function startObservation(
  env: ObservationEnv,
  component: Component,
  event: Event,
  route: RouteCode,
  method?: string,
  enabled = true,
) {
  const started = Date.now();
  const correlationId = crypto.randomUUID();
  let code: LogCode | undefined;
  let importFailure: ImportFailureObservation | undefined;
  return {
    correlationId,
    setImportFailure(value: ImportFailureObservation) {
      importFailure = value;
    },
    setCode(value: LogCode) {
      code = codes.includes(value) ? value : "INTERNAL_ERROR";
    },
    finish(status?: number, counts: Metrics = {}, stage?: Stage) {
      if (!enabled) return;
      const validStatus =
        Number.isInteger(status) && status! >= 100 && status! <= 599
          ? status
          : undefined;
      const finalCode =
        code ??
        (validStatus && validStatus >= 500
          ? "HTTP_SERVER_ERROR"
          : validStatus && validStatus >= 400
            ? "HTTP_CLIENT_ERROR"
            : "OK");
      const record: Record<string, string | number> = {
        schema: 1,
        component: ["app", "documents", "scanner"].includes(component)
          ? component
          : "app",
        event: [
          "http",
          "queue",
          "cron",
          "outbox_deferred",
          "mcp_tool_error",
        ].includes(event)
          ? event
          : "http",
        correlationId,
        versionId: uuid.test(env.WRANGLER_VERSION_METADATA?.id ?? "")
          ? env.WRANGLER_VERSION_METADATA!.id
          : "unavailable",
        route: routes.includes(route) ? route : "unknown",
        code: finalCode,
        durationMs: Math.max(0, Date.now() - started),
      };
      if (importFailure) {
        if (importFailureReasons.includes(importFailure.reason))
          record.importReason = importFailure.reason;
        if (importSourceCategories.includes(importFailure.sourceCategory))
          record.importSource = importFailure.sourceCategory;
        if (
          importFailure.knownHost &&
          knownImportHosts.includes(importFailure.knownHost)
        )
          record.importKnownHost = importFailure.knownHost;
      }
      if (method)
        record.method = [
          "GET",
          "HEAD",
          "POST",
          "PUT",
          "PATCH",
          "DELETE",
          "OPTIONS",
        ].includes(method)
          ? method
          : "OTHER";
      if (validStatus) record.status = validStatus;
      if (stage && stages.includes(stage)) record.stage = stage;
      for (const key of metrics)
        if (Number.isSafeInteger(counts[key]) && counts[key]! >= 0)
          record[key] = counts[key]!;
      // JSON objects remain searchable in Workers Logs. No exception serialization or free text.
      if (
        finalCode === "INTERNAL_ERROR" ||
        finalCode === "QUEUE_FAILED" ||
        finalCode === "CRON_FAILED" ||
        (validStatus ?? 0) >= 500
      )
        console.error(record);
      else if (finalCode !== "OK") console.warn(record);
      else console.log(record);
    },
  };
}
export type Observation = ReturnType<typeof startObservation>;

/** Private workers have no public error handler; replace unexpected exception text before it escapes. */
export async function observePrivateFetch(
  request: Request,
  env: ObservationEnv,
  component: "documents" | "scanner",
  handler: () => Promise<Response>,
): Promise<Response> {
  const observation = startObservation(
    env,
    component,
    "http",
    routeCode(request, component),
    request.method,
    routeCode(request, component) !== "unknown",
  );
  let response: Response;
  try {
    response = await handler();
  } catch {
    observation.setCode("INTERNAL_ERROR");
    response = Response.json(
      { error: { code: "INTERNAL_ERROR" } },
      { status: 500 },
    );
  }
  observation.finish(response.status);
  const headers = new Headers(response.headers);
  headers.set("X-Correlation-ID", observation.correlationId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
