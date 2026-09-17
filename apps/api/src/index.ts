import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import {
  DomainService,
  DomainError,
  type ActorContext,
  type ProviderHook,
  type PrepareInput,
  type Channel,
} from "../../../packages/domain/src/index";
import {
  ContentError,
  LIMITS,
  validateCsv,
} from "../../../packages/contracts/src/content";
import { assertBaseConfiguration, assertConfiguration, type Env } from "./env";
import { DocumentService } from "./documents";
import { maintainDocuments } from "./maintenance";
import { handleWebhook, reconcileWebhookReceipts } from "./webhooks";
import {
  authenticateBrowser,
  authenticateMcp,
  requireScope,
  handleAuthRoute,
  AuthError,
} from "./auth";
import { handleMcp } from "./mcp";
import {
  createLiveDeliveryQuoteConfig,
  createLiveProviderHook,
  liveSendingEnabled,
  serveProviderMedia,
} from "./live-providers";
import {
  billingConfigured,
  handleBillingRoute,
  handleStripeWebhook,
} from "./billing";
import { handleAccountRoute } from "./account";
import { PostalService, cleanupPostalEvidence } from "./postal";
import { postalBrowserAuthority, postalMcpAuthority } from "./postal-authority";
import { postalReviewInputSchema } from "../../../packages/contracts/src/postal-review";

import {
  startObservation,
  routeCode,
  queueCode,
  type Observation,
  type Stage,
  type Metrics,
} from "../../../packages/observability/src/index";

type Variables = { actor: ActorContext; observation: Observation };
const app = new Hono<{ Bindings: Env; Variables: Variables }>();
function identityConfigured(env: Env) {
  return Boolean(
    env.AUTH0_DOMAIN &&
    env.AUTH0_CLIENT_ID &&
    env.AUTH0_AUDIENCE &&
    env.AUTH0_CLIENT_SECRET,
  );
}
export function getCapabilities(env: Env) {
  return {
    name: "Guteneo",
    version: "0.2.0",
    mode: env.MODE,
    simulation: env.MODE === "simulation",
    humanApproval: "authenticated_browser",
    registration: {
      enabled: identityConfigured(env),
      verification: env.AUTH0_AUTH_POLICY ?? "verified_email_and_mfa",
    },
    billing: {
      configured: billingConfigured(env),
      mode: env.STRIPE_MODE ?? "unconfigured",
      chargingEnabled: false,
    },
    channels: [
      {
        id: "fax",
        name: "Fax",
        provider: "Telnyx",
        status: env.TELNYX_API_KEY
          ? "configured_not_live_validated"
          : "not_configured",
      },
      {
        id: "email",
        name: "E-mail",
        provider: "Amazon SES",
        status: env.AWS_ACCESS_KEY_ID
          ? "configured_not_live_validated"
          : "not_configured",
      },
      {
        id: "postal",
        name: "Courrier postal",
        provider: "Pingen",
        status: env.PINGEN_CLIENT_ID
          ? "configured_not_live_validated"
          : "not_configured",
      },
    ],
    limits: LIMITS,
    liveSending: liveSendingEnabled(env),
    scanner: env.SCANNER
      ? "connected"
      : env.ENVIRONMENT === "local"
        ? "disabled_in_local_simulation"
        : "missing_quarantine",
    assistants: ["ChatGPT", "Claude", "Cursor"].map((name) => ({
      name,
      status: "not_tested_in_real_client",
      transport: "Streamable HTTP",
    })),
    mcpUrl: `${env.APP_ORIGIN}/mcp`,
    identity: identityConfigured(env)
      ? "Auth0 configured, real login unverified"
      : "Auth0 not configured",
    productionBlockers: [
      ...(!identityConfigured(env) ? ["identity_configuration"] : []),
      ...(!env.SCANNER ? ["malware_scanner_configuration"] : []),
      "verified_tariffs",
      "provider_live_tests",
      ...(!env.TELNYX_FROM ? ["verified_fax_sender"] : []),
      "funded_sending_budget",
    ],
    documents: {
      import: true,
      render: Boolean(env.DOCUMENT_RENDERER || env.DOCUMENT_RENDERER_URL),
      exactBytes: true,
      urlImport: !!env.IMPORT_ALLOWED_HOSTS,
    },
  };
}
app.use("*", async (c, next) => {
  const route = routeCode(c.req.raw);
  // Media capability tokens are path segments. Avoid emitting a log in this invocation
  // because platform-added request metadata is outside the structured logger's control.
  const observation = startObservation(
    c.env,
    "app",
    "http",
    route,
    c.req.method,
    ![
      "provider_media",
      "unknown",
      "public_asset",
      "auth_other",
      "webhook_other",
    ].includes(route),
  );
  c.set("observation", observation);
  c.header("X-Correlation-ID", observation.correlationId);
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Robots-Tag", "noindex, nofollow");
  c.header("Referrer-Policy", "no-referrer");
  c.header("Cache-Control", "no-store");
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  );
  try {
    assertConfiguration(c.env, c.req.raw);
  } catch {
    observation.setCode("CONFIGURATION_INVALID");
    if (
      c.req.method === "GET" &&
      ["/auth/login", "/auth/signup"].includes(c.req.path)
    ) {
      observation.finish(302);
      return c.redirect(
        `${c.env.APP_ORIGIN}/?auth=IDENTITY_NOT_CONFIGURED#/app`,
        302,
      );
    }
    observation.finish(503);
    return c.json(
      {
        error: {
          code: "CONFIGURATION_INVALID",
          message: "Configuration du service invalide.",
        },
      },
      503,
    );
  }
  await next();
  observation.finish(c.res.status);
});
app.use(
  "*",
  bodyLimit({
    maxSize: LIMITS.pdfBytes + 262144,
    onError: (c) =>
      c.json(
        {
          error: {
            code: "REQUEST_TOO_LARGE",
            message: "Requête trop volumineuse.",
          },
        },
        413,
      ),
  }),
);
app.get("/api/health", (c) =>
  c.json({
    status:
      c.env.ENVIRONMENT === "local" || identityConfigured(c.env)
        ? "ok"
        : "configuration_required",
    mode: c.env.MODE,
    liveSending: liveSendingEnabled(c.env),
  }),
);
app.get("/api/capabilities", (c) => c.json(getCapabilities(c.env)));
app.get("/media/:token", (c) =>
  serveProviderMedia(c.env, c.req.raw, c.req.param("token")),
);
app.all("/mcp", (c) =>
  handleMcp(c.req.raw, c.env, {
    domain: domain(c.env),
    documents: new DocumentService(c.env, domain(c.env)),
    capabilities: () => getCapabilities(c.env),
    postal: {
      requirements: async (identity, country) =>
        new PostalService(c.env, domain(c.env)).requirements(
          await postalMcpAuthority(identity, c.env, "documents:read"),
          country,
        ),
      create: async (identity, input, key) =>
        new PostalService(c.env, domain(c.env)).create(
          await postalMcpAuthority(identity, c.env, "documents:write"),
          input,
          key,
        ),
      get: async (identity, id) =>
        new PostalService(c.env, domain(c.env)).get(
          await postalMcpAuthority(identity, c.env, "documents:read"),
          id,
        ),
      quote: async (identity, id, key) =>
        new PostalService(c.env, domain(c.env)).quote(
          await postalMcpAuthority(identity, c.env, "dispatches:prepare"),
          id,
          key,
        ),
    },
    afterConfirmation: () =>
      publishOutbox(c.env, domain(c.env)).then(() => undefined),
  }),
);
app.use("*", async (c, next) => {
  const stripe = await handleStripeWebhook(c.req.raw, c.env);
  if (stripe) return stripe;
  const webhook = await handleWebhook(c.req.raw, c.env, domain(c.env));
  if (webhook) return webhook;
  await next();
});
app.use("*", async (c, next) => {
  const auth = await handleAuthRoute(c.req.raw, c.env);
  if (auth) return auth;
  return next();
});
app.use("/api/billing/*", async (c, next) => {
  const billing = await handleBillingRoute(c.req.raw, c.env);
  if (billing) return billing;
  return next();
});
app.use("/api/*", async (c, next) => {
  const account = await handleAccountRoute(c.req.raw, c.env);
  if (account) return account;
  return next();
});
app.all(
  "/api/billing",
  async (c) => (await handleBillingRoute(c.req.raw, c.env)) ?? c.notFound(),
);
app.use("/api/*", async (c, next) => {
  if (c.req.header("Authorization")) {
    const identity = await authenticateMcp(c.req.raw, c.env);
    const path = c.req.path;
    const scope =
      path.startsWith("/api/documents") ||
      (path.startsWith("/api/postal/") && !path.endsWith("/quote"))
        ? c.req.method === "GET"
          ? "documents:read"
          : "documents:write"
        : path.endsWith("/confirm") || path.endsWith("/cancel")
          ? "dispatches:send"
          : c.req.method === "GET"
            ? "dispatches:read"
            : "dispatches:prepare";
    requireScope(identity, scope);
    c.set("actor", identity.context as ActorContext);
  } else {
    const session = await authenticateBrowser(
      c.req.raw,
      c.env,
      !["GET", "HEAD", "OPTIONS"].includes(c.req.method),
    );
    c.set("actor", session.context as ActorContext);
  }
  const actor = c.get("actor");
  const window = Math.floor(Date.now() / 60000);
  const row = await c.env.DB.prepare(
    "INSERT INTO http_limits(organization_id,window_start,count) VALUES(?,?,1) ON CONFLICT(organization_id,window_start) DO UPDATE SET count=count+1 RETURNING count",
  )
    .bind(actor.organizationId, window)
    .first<{ count: number }>();
  if ((row?.count ?? 0) > 180) {
    c.header("Retry-After", "60");
    return c.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: "Trop de requêtes. Réessayez dans une minute.",
        },
      },
      429,
    );
  }
  await next();
});
const domain = (env: Env) =>
  new DomainService(env.DB, {
    mode: env.MODE,
    ...createLiveDeliveryQuoteConfig(env),
    liveFaxIdentity:
      env.TELNYX_ACCOUNT_ID && env.TELNYX_CONNECTION_ID
        ? {
            accountId: env.TELNYX_ACCOUNT_ID,
            connectionId: env.TELNYX_CONNECTION_ID,
            outboundProfileId: env.TELNYX_OUTBOUND_VOICE_PROFILE_ID,
          }
        : undefined,
  });
const idempotency = (value: string | undefined) => {
  if (!value)
    throw new ContentError(
      "IDEMPOTENCY_REQUIRED",
      "En-tête Idempotency-Key requis.",
    );
  return value;
};
const page = (url: string) => {
  const p = new URL(url).searchParams;
  return [p.get("cursor") ?? undefined, Number(p.get("limit") ?? 30)] as const;
};
const postalAuthority = async (request: Request, env: Env, scope: string) => {
  if (request.headers.has("Authorization")) {
    const identity = await authenticateMcp(request, env);
    requireScope(identity, scope);
    return postalMcpAuthority(identity, env, scope);
  }
  return postalBrowserAuthority(request, env, request.method !== "GET");
};
app.get("/api/postal/requirements", async (c) =>
  c.json(
    await new PostalService(c.env, domain(c.env)).requirements(
      await postalAuthority(c.req.raw, c.env, "documents:read"),
      z.enum(["FR", "LU", "DE"]).parse(c.req.query("country")),
    ),
  ),
);
app.post("/api/postal/preflights", async (c) => {
  if (c.req.header("Authorization"))
    requireScope(await authenticateMcp(c.req.raw, c.env), "dispatches:prepare");
  return c.json(
    await new PostalService(c.env, domain(c.env)).create(
      await postalAuthority(c.req.raw, c.env, "documents:write"),
      postalReviewInputSchema.parse(await c.req.json()),
      idempotency(c.req.header("Idempotency-Key")),
    ),
    201,
  );
});
app.get("/api/postal/preflights/:id", async (c) =>
  c.json(
    await new PostalService(c.env, domain(c.env)).get(
      await postalAuthority(c.req.raw, c.env, "documents:read"),
      c.req.param("id"),
    ),
  ),
);
app.get("/api/postal/preflights/:id/address.png", async (c) =>
  new PostalService(c.env, domain(c.env)).crop(
    await postalBrowserAuthority(c.req.raw, c.env, false),
    c.req.param("id"),
  ),
);
app.post("/api/postal/preflights/:id/transfer", async (c) =>
  c.json(
    await new PostalService(c.env, domain(c.env)).transfer(
      await postalBrowserAuthority(c.req.raw, c.env, true),
      c.req.param("id"),
      z
        .object({
          reviewed: z.literal(true),
          consentToTransfer: z.literal(true),
        })
        .strict()
        .parse(await c.req.json()),
    ),
  ),
);
app.post("/api/postal/preflights/:id/quote", async (c) => {
  const body = await c.req.text();
  if (body && body !== "{}")
    throw new ContentError(
      "POSTAL_QUOTE_INPUT_INVALID",
      "Le devis reprend le document et le destinataire déjà vérifiés.",
    );
  return c.json(
    await new PostalService(c.env, domain(c.env)).quote(
      await postalAuthority(c.req.raw, c.env, "dispatches:prepare"),
      c.req.param("id"),
      idempotency(c.req.header("Idempotency-Key")),
    ),
    201,
  );
});
app.get("/api/documents", async (c) =>
  c.json(await domain(c.env).listDocuments(c.get("actor"), ...page(c.req.url))),
);
app.post("/api/documents", async (c) => {
  const data = await c.req.raw.formData();
  const file = data.get("file");
  if (!file || typeof file === "string")
    throw new ContentError("FILE_REQUIRED", "Choisissez un PDF.");
  if (file.size > LIMITS.pdfBytes)
    throw new ContentError("FILE_TOO_LARGE", "PDF trop volumineux.", 413);
  return c.json(
    await new DocumentService(c.env, domain(c.env)).upload(c.get("actor"), {
      name: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    }),
    201,
  );
});
app.post("/api/documents/render", async (c) => {
  const input = z
    .object({
      name: z.string().min(1).max(180),
      html: z.string().max(LIMITS.htmlBytes),
    })
    .strict()
    .parse(await c.req.json());
  return c.json(
    await new DocumentService(c.env, domain(c.env)).render(
      c.get("actor"),
      input,
    ),
    201,
  );
});
app.get("/api/documents/:id/content", async (c) =>
  new DocumentService(c.env, domain(c.env)).getContent(
    c.get("actor"),
    c.req.param("id"),
  ),
);
app.post("/api/documents/:id/rescan", async (c) =>
  c.json(
    await new DocumentService(c.env, domain(c.env)).rescan(
      c.get("actor"),
      c.req.param("id"),
    ),
  ),
);
app.post("/api/admin/scanner/warm", async (c) =>
  c.json(
    await new DocumentService(c.env, domain(c.env)).warmScanner(c.get("actor")),
  ),
);
app.get("/api/dispatches", async (c) =>
  c.json(
    await domain(c.env).listDispatches(c.get("actor"), ...page(c.req.url)),
  ),
);
app.get("/api/dispatches/:id", async (c) =>
  c.json(await domain(c.env).getDispatch(c.get("actor"), c.req.param("id"))),
);
const prepareSchema = z
  .object({
    channel: z.enum(["fax", "email", "postal"]),
    recipient: z.record(z.string(), z.unknown()),
    documentId: z.string().optional(),
    subject: z.string().optional(),
    html: z.string().optional(),
    text: z.string().optional(),
    senderId: z.string().optional(),
    options: z.record(z.string(), z.unknown()).optional(),
    campaignId: z.string().optional(),
    ceilingMinor: z.number().int().nonnegative().optional(),
  })
  .strict();
app.post("/api/dispatches", async (c) =>
  c.json(
    await domain(c.env).prepareDispatch(
      c.get("actor"),
      prepareSchema.parse(await c.req.json()) as PrepareInput,
      idempotency(c.req.header("Idempotency-Key")),
    ),
    201,
  ),
);
app.post("/api/dispatches/:id/approve", async (c) => {
  const session = await authenticateBrowser(c.req.raw, c.env, true);
  const { fingerprint, recipientRequested } = z
    .object({
      fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
      recipientRequested: z.boolean().optional(),
    })
    .strict()
    .parse(await c.req.json());
  return c.json(
    await domain(c.env).approveDispatch(
      session.context as ActorContext,
      c.req.param("id"),
      fingerprint,
      { recipientRequested },
    ),
  );
});
app.post("/api/dispatches/:id/confirm", async (c) => {
  const service = domain(c.env);
  const result = await service.confirmDispatch(
    c.get("actor"),
    c.req.param("id"),
    idempotency(c.req.header("Idempotency-Key")),
  );
  // Queue publication is awaited for low latency, but the committed outbox is the durability guarantee.
  try {
    await publishOutbox(c.env, service);
  } catch {
    c.get("observation").setCode("OUTBOX_DEFERRED");
  }
  return c.json(result);
});
app.post("/api/dispatches/:id/cancel", async (c) =>
  c.json(await domain(c.env).cancelDispatch(c.get("actor"), c.req.param("id"))),
);
app.get("/api/campaigns", async (c) =>
  c.json(await domain(c.env).listCampaigns(c.get("actor"), ...page(c.req.url))),
);
app.post("/api/campaigns", async (c) =>
  c.json(
    await domain(c.env).createCampaign(
      c.get("actor"),
      z
        .object({ name: z.string().min(1).max(150) })
        .strict()
        .parse(await c.req.json()),
    ),
    201,
  ),
);
app.get("/api/campaigns/:id", async (c) =>
  c.json(await domain(c.env).getCampaign(c.get("actor"), c.req.param("id"))),
);
app.post("/api/recipients/validate", async (c) =>
  c.json(
    validateCsv(
      z
        .object({ csv: z.string().max(LIMITS.csvBytes) })
        .strict()
        .parse(await c.req.json()).csv,
    ),
  ),
);
app.get("/api/senders", async (c) =>
  c.json(await domain(c.env).listSenders(c.get("actor"))),
);
app.get("/api/usage", async (c) =>
  c.json(await domain(c.env).usage(c.get("actor"))),
);
app.get("/api/admin", async (c) =>
  c.json({
    ...(await domain(c.env).admin(c.get("actor"))),
    capabilities: getCapabilities(c.env),
  }),
);
app.post("/api/admin/channels/:channel", async (c) => {
  const actor = c.get("actor");
  if (actor.role !== "admin" || actor.actor !== "browser")
    throw new ContentError(
      "ADMIN_REQUIRED",
      "Administrateur authentifié requis.",
      403,
    );
  const channel = z
    .enum(["fax", "email", "postal"])
    .parse(c.req.param("channel"));
  const { enabled } = z
    .object({ enabled: z.boolean() })
    .strict()
    .parse(await c.req.json());
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE channel_controls SET enabled=? WHERE organization_id=? AND channel=?",
    ).bind(Number(enabled), actor.organizationId, channel),
    c.env.DB.prepare(
      "INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) VALUES(?,?,?,?,?,?,?)",
    ).bind(
      crypto.randomUUID(),
      actor.organizationId,
      actor.userId,
      "channel.control",
      channel,
      JSON.stringify({ enabled }),
      new Date().toISOString(),
    ),
  ]);
  return c.json({ channel, enabled });
});
app.all("/api/*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Route introuvable." } }, 404),
);
app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));
app.onError((error, c) => {
  c.get("observation")?.setCode(
    error instanceof AuthError
      ? "AUTH_REJECTED"
      : error instanceof DomainError
        ? "DOMAIN_REJECTED"
        : error instanceof ContentError
          ? "CONTENT_REJECTED"
          : error instanceof z.ZodError
            ? "VALIDATION_ERROR"
            : "INTERNAL_ERROR",
  );
  if (error instanceof AuthError && c.req.path.startsWith("/auth/")) {
    return c.redirect(
      `${c.env.APP_ORIGIN}/?auth=${encodeURIComponent(error.code)}#/app`,
      302,
    );
  }
  if (
    error instanceof DomainError ||
    error instanceof ContentError ||
    error instanceof AuthError
  )
    return c.json(
      { error: { code: error.code, message: error.message } },
      error.status as 400,
    );
  if (error instanceof z.ZodError)
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Données invalides.",
          fields: error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
      },
      400,
    );
  return c.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message:
          "L’opération a échoué. Conservez l’identifiant de corrélation.",
      },
    },
    500,
  );
});
async function publishOutbox(env: Env, service: DomainService) {
  return service.publishOutbox(async (message) => {
    const row = await env.DB.prepare(
      "SELECT campaign_id FROM dispatches WHERE id=?",
    )
      .bind(message.dispatchId)
      .first<{ campaign_id: string | null }>();
    await (row?.campaign_id ? env.BULK_QUEUE : env.DISPATCH_QUEUE).send(
      message,
    );
  });
}
const simulation: ProviderHook = {
  name: "simulation",
  async submit(dispatch) {
    const providerId = `sim_${dispatch.id}`;
    return {
      status: "accepted",
      providerId,
      events: [
        {
          provider: "simulation",
          eventId: `${providerId}_result`,
          providerId,
          dispatchId: dispatch.id,
          kind: dispatch.channel === "postal" ? "handed_to_post" : "delivered",
          occurredAt: new Date().toISOString(),
          payload: {
            simulation: true,
            description:
              dispatch.channel === "postal"
                ? "Remise à la poste simulée, aucune lettre expédiée."
                : "Résultat de simulation déterministe, aucun envoi réel.",
          },
        },
      ],
    };
  },
};
export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<{ dispatchId: string }>, env: Env) {
    const observation = startObservation(
      env,
      "app",
      "queue",
      queueCode(batch.queue),
    );
    const counts = {
      messages: batch.messages.length,
      acked: 0,
      retried: 0,
      deadLetters: 0,
      unknown: 0,
      failed: 0,
    };
    try {
      assertConfiguration(env);
      const service = domain(env);
      for (const message of batch.messages) {
        try {
          const parsed = z
            .object({ dispatchId: z.string().min(1).max(200) })
            .passthrough()
            .safeParse(message.body);
          if (batch.queue.endsWith("-dlq") || !parsed.success) {
            await env.DB.prepare(
              "INSERT OR IGNORE INTO dead_letters(id,dispatch_id,queue,received_at) VALUES(?,?,?,?)",
            )
              .bind(
                message.id,
                parsed.success ? parsed.data.dispatchId : null,
                batch.queue,
                new Date().toISOString(),
              )
              .run();
            message.ack();
            counts.acked++;
            counts.deadLetters++;
            continue;
          }
          if (env.MODE !== "simulation" && env.LIVE_SENDS_ENABLED !== "true") {
            message.retry({ delaySeconds: 300 });
            counts.retried++;
            continue;
          }
          const row = await env.DB.prepare(
            "SELECT channel FROM dispatches WHERE id=?",
          )
            .bind(parsed.data.dispatchId)
            .first<{ channel: Channel }>();
          if (!row) {
            message.ack();
            counts.acked++;
            continue;
          }
          const result = await service.processDispatch(
            parsed.data.dispatchId,
            env.MODE === "simulation"
              ? simulation
              : createLiveProviderHook(env, row.channel),
          );
          if (result.status === "submission_unknown") counts.unknown++;
          if (result.status === "failed") counts.failed++;
          message.ack();
          counts.acked++;
        } catch {
          message.retry({ delaySeconds: 30 });
          counts.retried++;
        }
      }
      if (counts.unknown) observation.setCode("SUBMISSION_UNKNOWN");
      else if (counts.deadLetters) observation.setCode("QUEUE_DEAD_LETTER");
      else if (counts.retried) observation.setCode("QUEUE_RETRY");
      else if (counts.failed) observation.setCode("DISPATCH_FAILED");
    } catch {
      observation.setCode("QUEUE_FAILED");
      // Preserve batch failure/retry semantics without exporting arbitrary exception text.
      throw new Error("QUEUE_FAILED");
    } finally {
      observation.finish(undefined, counts);
    }
  },
  async scheduled(_event: ScheduledController, env: Env) {
    const observation = startObservation(env, "app", "cron", "maintenance");
    let stage: Stage = "configuration";
    const counts: Metrics = {};
    try {
      assertBaseConfiguration(env);
      const service = domain(env);
      // Already verified receipts must recover even during identity-provider setup.
      // This bounded projection does not publish an outbox or submit communications.
      stage = "callbacks";
      Object.assign(counts, await reconcileWebhookReceipts(env.DB, service));
      stage = "identity";
      if (env.ENVIRONMENT !== "local" && !identityConfigured(env)) {
        observation.setCode("IDENTITY_NOT_CONFIGURED");
        return;
      }
      assertConfiguration(env);
      stage = "outbox";
      Object.assign(counts, await publishOutbox(env, service));
      stage = "leases";
      Object.assign(counts, await service.reconcileExpiredLeases());
      stage = "documents";
      Object.assign(counts, await maintainDocuments(env));
      stage = "postal";
      await cleanupPostalEvidence(env.DB);
      stage = "http_limits";
      await env.DB.prepare("DELETE FROM http_limits WHERE window_start<?")
        .bind(Math.floor(Date.now() / 60000) - 5)
        .run();
      stage = "complete";
      if (counts.uncertain) observation.setCode("SUBMISSION_UNKNOWN");
      else if (counts.pending) observation.setCode("CALLBACK_PENDING");
    } catch {
      observation.setCode("CRON_FAILED");
      // Keep the scheduled event failed so Cloudflare metrics still expose the failure.
      throw new Error("CRON_FAILED");
    } finally {
      observation.finish(undefined, counts, stage);
    }
  },
};
