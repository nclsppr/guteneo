import { handleEmailRecipientFeedback } from "./email-recipient-feedback";
import {
  emailContentCapabilities,
  emailPreparationDescriptions,
} from "./email-preparation-contract";
import { handleBelvedereRoute } from "./belvedere";
import { handleBelvedereHost } from "./belvedere-host";
import { GUTENEO_VERSION } from "../../../packages/contracts/src/release";
import { cleanupBelvedereTelemetry } from "./belvedere-telemetry";
import { handleInvitationRoute } from "./invitations";
import {
  handlePdfValidationPricingRoute,
  pdfValidationAvailable,
  expirePdfValidations,
} from "./pdf-validation-pricing";
import { PdfValidationService } from "./pdf-validation";
import {
  pdfValidationProfiles,
  PDF_VALIDATION_PRICE_MINOR,
  PDF_VALIDATION_TERMS_VERSION,
} from "../../../packages/contracts/src/pdf-validation";
import { ensureEmailSender } from "./email-setup";
import {
  prepareProtectedDocument,
  handleProtectedDocumentRoute,
  cleanupProtectedDocuments,
} from "./protected-documents";
import { emailProvider, resendConfigured } from "./resend-environment";
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
import {
  McpAppDocumentUploadService,
  cleanupMcpAppDocumentUploads,
} from "./mcp-app-upload";
import {
  assertMcpDocumentUploadEnabled,
  mcpDocumentUploadEnabled,
} from "./mcp-document-upload";
import { MCP_APP_UPLOAD_MAX_BYTES } from "../../../packages/contracts/src/mcp-app-upload-limits";

import {
  PrivateDocumentUploadService,
  privateUploadPath,
} from "./document-upload";
import {
  TemplateWorkflowService,
  type WorkflowActor,
} from "./template-workflow";
import {
  createTemplateWorkflowRoutes,
  templateWorkflowScope,
} from "./template-workflow-routes";
import { WORKFLOW_LIMITS } from "../../../packages/contracts/src/template-workflow";
import { TemplateError } from "../../../packages/contracts/src/templates";
import { DatasetError } from "../../../packages/data/index";
import { maintainDocuments } from "./maintenance";
import { handleWebhook, reconcileWebhookReceipts } from "./webhooks";
import {
  authenticateBrowser,
  authenticateMcp,
  requireScope,
  handleAuthRoute,
  AuthError,
  authFailureRedirect,
  hashSecret,
  type McpIdentity,
} from "./auth";
import { handleMcp, secureDistributionSummary } from "./mcp";
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
import { handlePersonalAccountRoute } from "./personal-auth";
import { authenticatePersonalBrowser } from "./personal-auth";
import {
  SecureDistributionService,
  secureDistributionAvailable,
} from "./secure-distributions";
import { documentAccessMode } from "../../../packages/contracts/src/document-authentication";
import {
  handlePersonalDocumentRoute,
  secureWorkshopPreview,
  secureJson,
} from "./secure-distribution-routes";
import { PersonalDocumentsService } from "./personal-documents";
import {
  secureDistributionCatalog,
  secureDistributionInputSchema,
  secureBindingSchema,
} from "../../../packages/contracts/src/secure-distribution";
import { handleMobileRoute } from "./mobile";
import {
  configurePostalSenderForMcp,
  getPostalSetupForMcp,
  handlePostalSetupRoute,
} from "./postal-setup";
import { PostalService, cleanupPostalEvidence } from "./postal";
import { PostalAddressPageService } from "./postal-address-page";
import { postalAddressPageInputSchema } from "../../../packages/contracts/src/postal-address-page";
import { postalBrowserAuthority, postalMcpAuthority } from "./postal-authority";
import { expertPostalAuthority } from "./expert-approval";
import { getExpertStatus } from "./expert-status";
import { postalReviewInputSchema } from "../../../packages/contracts/src/postal-review";

import {
  startObservation,
  routeCode,
  queueCode,
  type Observation,
  type Stage,
  type Metrics,
} from "../../../packages/observability/src/index";

type Variables = { actor: WorkflowActor; observation: Observation };
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
    version: GUTENEO_VERSION,
    mode: env.MODE,
    simulation: env.MODE === "simulation",
    secureDistribution: {
      ...secureDistributionCatalog(
        documentAccessMode(env.SENSITIVE_DOCUMENT_AUTHENTICATION),
      ),
      available: secureDistributionAvailable(env),
      accountRequired: true,
      originalDownload: "explicit_policy",
      revokeRefunds: false,
    },
    humanApproval: "authenticated_browser",
    approval: {
      default: "authenticated_browser",
      expert: {
        available: true,
        requiresAccountOptIn: true,
        accountUrl: `${env.APP_ORIGIN}/#/app/account`,
        reviewTool: "review_dispatch",
        acceptanceTool: "approve_and_send_dispatch",
        postalTransferTool: "transfer_postal_draft",
      },
    },
    registration: {
      enabled: identityConfigured(env),
      verification: env.AUTH0_AUTH_POLICY ?? "verified_email_and_mfa",
    },
    billing: {
      configured: billingConfigured(env),
      mode: env.STRIPE_MODE ?? "unconfigured",
      chargingEnabled: false,
      requiresMonthlyPlan: false,
      management: "administrator_browser_only",
    },
    pdfValidation: {
      priceMinor: PDF_VALIDATION_PRICE_MINOR,
      currency: "EUR",
      taxBasis: "excluding_tax",
      termsVersion: PDF_VALIDATION_TERMS_VERSION,
      unit: "completed_check",
      paymentSource: "account_credits",
      available: pdfValidationAvailable(env),
      purchase: "administrator_browser_only",
      accountUrl: `${env.APP_ORIGIN}/#/app/pdf-checks`,
    },
    channels: [
      {
        id: "fax",
        liveSending: liveSendingEnabled(env, "fax"),
        name: "Fax",
        provider: "Telnyx",
        status: env.TELNYX_API_KEY
          ? "configured_not_live_validated"
          : "not_configured",
      },
      {
        id: "email",
        liveSending: liveSendingEnabled(env, "email"),
        name: "Email",
        deliveryModes: ["none", "attachment", "protected_link"],
        content: emailContentCapabilities,
        maxAttachmentBytes: 10_000_000,
        protectedDocument: {
          available:
            env.MODE === "production" &&
            emailProvider(env) === "resend" &&
            resendConfigured(env) &&
            Boolean(env.PROTECTED_DOCUMENTS_KEY),
          priceMinor: 100,
          currency: "EUR",
          priceUnit: "document_hosting_term",
          durationDays: [1, 7, 30],
          defaultDurationDays: 7,
          passwordDelivery: "sender_browser_only",
          recipientAccountRequired: false,
          endToEndEncrypted: false,
        },
        provider: emailProvider(env) === "resend" ? "Resend" : "Amazon SES",
        status: (
          emailProvider(env) === "resend"
            ? resendConfigured(env)
            : env.AWS_ACCESS_KEY_ID
        )
          ? "configured_not_live_validated"
          : "not_configured",
      },
      {
        id: "postal",
        liveSending: liveSendingEnabled(env, "postal"),
        name: "Postal letter",
        provider: "Guteneo postal service",
        status: env.PINGEN_CLIENT_ID
          ? "configured_not_live_validated"
          : "not_configured",
      },
    ],
    roadmap: {
      recipientListAnyFormat: { available: false, status: "coming_soon" },
      distributionOfOtherFileTypes: {
        available: false,
        examples: ["PDF", "Excel", "other_files"],
        status: "coming_soon",
      },
      recipientAccounts: { available: false, status: "planned_later" },
    },
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
      ...(!env.TELNYX_FROM ? ["verified_fax_sender"] : []),
    ],
    // These are checked against the actual account, document and destination;
    // a public configuration read cannot report them as failed prerequisites.
    checksAtPreparation: [
      "verified_sender",
      "verified_document",
      "qualified_destination_and_tariff",
      "available_account_credit",
      "human_approval_or_existing_delegation",
    ],
    documents: {
      import: true,
      render: Boolean(env.DOCUMENT_RENDERER || env.DOCUMENT_RENDERER_URL),
      exactBytes: true,
      urlImport: ["production", "staging"].includes(env.ENVIRONMENT),
      validation: {
        available: pdfValidationAvailable(env),
        profiles: pdfValidationProfiles,
        requiresMonthlyPlan: false,
        paidPerCheck: true,
        priceMinor: PDF_VALIDATION_PRICE_MINOR,
        automatedOnly: true,
        certification: false,
        engine: "veraPDF",
      },
    },
    studio: {
      templates: {
        engine: "pdfme",
        engineVersion: "6.1.13",
        versioned: true,
        immutablePublishedVersions: true,
        visualEditor: true,
        ownerDeletionRetainsHistory: true,
        deletionTool: "delete_template",
        authoringGuide: "/api/templates/authoring-guide",
        examples: "/api/templates/examples",
        authoringTools: [
          "get_template_authoring_guide",
          "list_template_examples",
          "get_template_example",
          "create_template",
          "preview_template",
        ],
      },
      datasets: {
        formats: ["csv", "xlsx", "json", "xml"],
        privateOriginals: true,
        deterministicMappings: true,
      },
      generation: {
        mode: "generate_only",
        asynchronous: true,
        reservesSendingCredit: false,
        rendererConfigured: Boolean(
          env.DOCUMENT_RENDERER || env.DOCUMENT_RENDERER_URL,
        ),
      },
      distribution: {
        immutableManifest: true,
        createsApproval: false,
        sends: false,
        postalPreflightRequired: true,
      },
      ai: {
        configured: Boolean(
          env.DATASET_OPENAI_API_KEY && env.DATASET_OPENAI_MODEL,
        ),
        organizationOptInRequired: true,
        realProviderQualified: false,
      },
      limits: WORKFLOW_LIMITS,
      qualification:
        "local_candidate_hosted_runtime_and_assistant_clients_not_qualified",
    },
  };
}
app.use("*", async (c, next) => {
  const response = await handleBelvedereHost(c.req.raw, c.env);
  if (response) return response;
  return next();
});
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
    !new URL(c.req.url).searchParams
      .get("returnTo")
      ?.startsWith("/belvedere/") &&
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
        authFailureRedirect(c.req.raw, c.env, "IDENTITY_NOT_CONFIGURED"),
        302,
      );
    }
    observation.finish(503);
    return c.json(
      {
        error: {
          code: "CONFIGURATION_INVALID",
          message: "Invalid service configuration.",
        },
      },
      503,
    );
  }
  await next();
  observation.finish(c.res.status);
});
const ordinaryBodyLimit = bodyLimit({
  maxSize: LIMITS.pdfBytes + 262144,
  onError: (c) =>
    c.json(
      {
        error: {
          code: "REQUEST_TOO_LARGE",
          message: "Request too large.",
        },
      },
      413,
    ),
});
// MCP authenticates and applies its smaller byte bound before buffering.
app.use("*", (c, next) =>
  c.req.path === "/mcp" || privateUploadPath(c.req.path)
    ? next()
    : ordinaryBodyLimit(c, next),
);
// Authenticate the narrow upload capability before reading any original bytes.
// This route never accepts ambient browser cookies or an OAuth token.
app.all("/api/document-uploads/:id/content", (c) =>
  new PrivateDocumentUploadService(c.env, domain(c.env)).receive(c.req.raw),
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
    appAssets: c.env.ASSETS,
    domain: domain(c.env),
    documents: new DocumentService(c.env, domain(c.env)),
    documentUploads: new PrivateDocumentUploadService(c.env, domain(c.env)),
    appDocumentUploads: c.env.MCP_DOCUMENT_UPLOAD_APP
      ? new McpAppDocumentUploadService(
          c.env,
          domain(c.env),
          async (identity) => assertMcpDocumentUploadEnabled(c.env, identity),
        )
      : undefined,

    workflow: new TemplateWorkflowService(c.env, domain(c.env)),
    secureDistribution: {
      prepare: async (identity, input, key) =>
        (await secureMcpService(c.env, identity, "dispatches:prepare")).prepare(
          identity.context,
          input,
          key,
        ),
      list: async (identity, query) =>
        (await secureMcpService(c.env, identity, "dispatches:read")).list(
          identity.context,
          query,
        ),
      get: async (identity, id) =>
        (await secureMcpService(c.env, identity, "dispatches:read")).get(
          identity.context,
          id,
        ),
      confirm: async (identity, id, key) => {
        const result = await (
          await secureMcpService(c.env, identity, "dispatches:send")
        ).confirm(identity.context, id, key);
        await publishOutbox(c.env, domain(c.env));
        return result;
      },
      revoke: async (identity, id) =>
        (await secureMcpService(c.env, identity, "dispatches:send")).revoke(
          identity.context,
          id,
        ),
    },
    afterGeneration: () =>
      c.executionCtx.waitUntil(
        new TemplateWorkflowService(c.env, domain(c.env))
          .processPending()
          .then(() => undefined),
      ),
    pdfValidation: {
      validate: async (identity, documentId, input, key) =>
        new PdfValidationService(c.env, domain(c.env)).validate(
          await postalMcpAuthority(identity, c.env, "documents:write"),
          documentId,
          input,
          key,
        ),
      list: (identity, documentId) =>
        new PdfValidationService(c.env, domain(c.env)).list(
          identity.context,
          documentId,
        ),
    },
    capabilities: async (identity) => {
      const capabilities = getCapabilities(c.env);
      const canReadPostalSetup = identity.scopes.includes("documents:read");
      const [connection, postalSetup] = await Promise.all([
        getExpertStatus(identity, c.env),
        canReadPostalSetup ? getPostalSetupForMcp(identity, c.env) : null,
      ]);
      return {
        ...capabilities,
        documents: {
          ...capabilities.documents,
          originalFilePicker: {
            available: mcpDocumentUploadEnabled(c.env, identity),
            tool: mcpDocumentUploadEnabled(c.env, identity)
              ? "open_mcp_document_upload"
              : null,
            requiredScope: "documents:write",
            requiresMcpApps: true,
            selection: "explicit_local_original",
            conversationAttachmentAccess: false,
            maxBytes: MCP_APP_UPLOAD_MAX_BYTES,
          },
        },
        postal: {
          channel: "postal",
          setup: postalSetup,
          setupAccess: {
            available: canReadPostalSetup,
            requiredScope: "documents:read",
          },
          importTool: "import_document",
          setupTool: "get_postal_setup",
          configureSenderTool: "configure_postal_sender",
          preparationTool: "preflight_postal_pdf",
          senderCollection: "conversation",
          expertRequiredForPreparation: false,
          standardReview: "use_preflight_reviewUrl",
        },
        approval: {
          ...capabilities.approval,
          expert: {
            ...capabilities.approval.expert,
            connection,
          },
        },
      };
    },
    onToolFailure: (code, importFailure) => {
      const observation = startObservation(
        c.env,
        "app",
        "mcp_tool_error",
        "mcp",
      );
      observation.setCode(code);
      if (importFailure) observation.setImportFailure(importFailure);
      observation.finish();
      return observation.correlationId;
    },
    postal: {
      getSetup: (identity) => getPostalSetupForMcp(identity, c.env),
      configureSender: (identity, input) =>
        configurePostalSenderForMcp(identity, c.env, input),
      generateAddressPage: async (identity, input, key) =>
        new PostalAddressPageService(c.env, domain(c.env)).generate(
          await postalMcpAuthority(identity, c.env, "documents:write"),
          input,
          key,
        ),
      transferExpert: async (identity, id, fingerprint) =>
        new PostalService(c.env, domain(c.env)).transfer(
          await expertPostalAuthority(identity, c.env, id, fingerprint),
          id,
          { reviewed: true, consentToTransfer: true },
        ),
      requirements: async (identity, country, addressPosition) =>
        new PostalService(c.env, domain(c.env)).requirements(
          await postalMcpAuthority(identity, c.env, "documents:read"),
          country,
          addressPosition,
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
  const feedback = await handleEmailRecipientFeedback(c.req.raw, c.env);
  if (feedback) return feedback;
  const protectedDocument = await handleProtectedDocumentRoute(
    c.req.raw,
    c.env,
  );
  if (protectedDocument) return protectedDocument;
  const stripe = await handleStripeWebhook(c.req.raw, c.env);
  if (stripe) return stripe;
  const webhook = await handleWebhook(c.req.raw, c.env, domain(c.env));
  if (webhook) return webhook;
  await next();
});
app.use("*", async (c, next) => {
  const belvedere = await handleBelvedereRoute(c.req.raw, c.env);
  if (belvedere) return belvedere;
  const personalAccount = await handlePersonalAccountRoute(c.req.raw, c.env);
  if (personalAccount) return personalAccount;
  const personalDocument = await handlePersonalDocumentRoute(c.req.raw, c.env);
  if (personalDocument) return personalDocument;
  const mobile = await handleMobileRoute(
    c.req.raw,
    c.env,
    domain(c.env),
    getCapabilities(c.env),
    () => publishOutbox(c.env, domain(c.env)),
  );
  if (mobile) return mobile;
  const invitation = await handleInvitationRoute(c.req.raw, c.env);
  if (invitation) return invitation;
  const auth = await handleAuthRoute(c.req.raw, c.env);
  if (auth) return auth;
  return next();
});
app.use("/api/billing/*", async (c, next) => {
  const billing = await handleBillingRoute(c.req.raw, c.env);
  if (billing) return billing;
  return next();
});
app.get(
  "/api/pdf-validation/pricing",
  async (c) =>
    (await handlePdfValidationPricingRoute(c.req.raw, c.env)) ?? c.notFound(),
);
app.all(
  "/api/pdf-validation/pricing",
  async (c) =>
    (await handlePdfValidationPricingRoute(c.req.raw, c.env)) ?? c.notFound(),
);
app.use("/api/*", async (c, next) => {
  const plan = await handlePdfValidationPricingRoute(c.req.raw, c.env);
  if (plan) return plan;
  const postalSetup = await handlePostalSetupRoute(c.req.raw, c.env);
  if (postalSetup) return postalSetup;
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
      templateWorkflowScope(path, c.req.method) ??
      (path.startsWith("/api/documents") ||
      (path.startsWith("/api/postal/") && !path.endsWith("/quote"))
        ? c.req.method === "GET"
          ? "documents:read"
          : "documents:write"
        : path.endsWith("/confirm") ||
            path.endsWith("/cancel") ||
            path.endsWith("/revoke")
          ? "dispatches:send"
          : c.req.method === "GET"
            ? "dispatches:read"
            : "dispatches:prepare");
    requireScope(identity, scope);
    if (path.startsWith("/api/documents/") && c.req.query("dispatchId"))
      requireScope(identity, "dispatches:read");
    c.set("actor", {
      ...identity.context,
      ...(identity.connectionObservation
        ? { authority: identity.connectionObservation }
        : {}),
    });
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
          message: "Too many requests. Try again in a minute.",
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
    appOrigin: env.APP_ORIGIN,
    sensitiveDocumentAuthentication: env.SENSITIVE_DOCUMENT_AUTHENTICATION,
    ...createLiveDeliveryQuoteConfig(env),
    ensureEmailSender: (ctx) => ensureEmailSender(env, ctx),
    prepareProtectedDocument: (ctx, input, now) =>
      prepareProtectedDocument(env, ctx, input, now),
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
      "Idempotency-Key header required.",
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
app.route("/", createTemplateWorkflowRoutes(domain, postalAuthority));
const secureService = (env: Env) =>
  new SecureDistributionService(env, domain(env));
async function secureMcpService(
  env: Env,
  identity: McpIdentity,
  scope: string,
) {
  const authority = await postalMcpAuthority(identity, env, scope);
  const snapshot = identity.connectionObservation
    ? {
        kind: "oauth" as const,
        ...identity.connectionObservation,
        expiresAt: identity.expiresAt,
      }
    : identity.token.startsWith("gtn_dev_") &&
        env.ENVIRONMENT === "local" &&
        env.MODE === "simulation"
      ? {
          kind: "development" as const,
          tokenHash: await hashSecret(identity.token),
          expiresAt: identity.expiresAt,
        }
      : undefined;
  if (!snapshot)
    throw new DomainError(
      "FORBIDDEN",
      "A current OAuth connection is required.",
      403,
    );
  return new SecureDistributionService(env, domain(env), authority, snapshot);
}
async function secureRequestService(request: Request, env: Env, scope: string) {
  return request.headers.has("Authorization")
    ? secureMcpService(env, await authenticateMcp(request, env), scope)
    : secureService(env);
}
const secureResult = (
  actor: ActorContext,
  value: Awaited<ReturnType<SecureDistributionService["get"]>>,
) => (actor.actor === "mcp" ? secureDistributionSummary(value) : value);
app.get("/api/secure-distributions/catalog", (c) =>
  c.json({
    ...secureDistributionCatalog(
      documentAccessMode(c.env.SENSITIVE_DOCUMENT_AUTHENTICATION),
    ),
    available: secureDistributionAvailable(c.env),
  }),
);
app.get("/api/secure-distributions", async (c) => {
  const [cursor, limit] = page(c.req.url),
    actor = c.get("actor"),
    result = await (
      await secureRequestService(c.req.raw, c.env, "dispatches:read")
    ).list(actor, { cursor, limit });
  return c.json({
    ...result,
    items: result.items.map((item) => secureResult(actor, item)),
  });
});
app.post("/api/secure-distributions", async (c) => {
  const actor = c.get("actor"),
    input = await secureJson(
      c.req.raw,
      secureDistributionInputSchema,
      200 * 1024,
    );
  return c.json(
    secureResult(
      actor,
      await (
        await secureRequestService(c.req.raw, c.env, "dispatches:prepare")
      ).prepare(actor, input, idempotency(c.req.header("Idempotency-Key"))),
    ),
    201,
  );
});
app.get("/api/secure-distributions/:id", async (c) =>
  c.json(
    secureResult(
      c.get("actor"),
      await (
        await secureRequestService(c.req.raw, c.env, "dispatches:read")
      ).get(c.get("actor"), c.req.param("id")),
    ),
  ),
);
app.post("/api/secure-distributions/:id/approve", async (c) => {
  const input = await secureJson(
    c.req.raw,
    z
      .object({
        reviewed: z.literal(true),
        recipientRequested: z.boolean().default(false),
      })
      .strict(),
  );
  const principal = await authenticatePersonalBrowser(c.req.raw, c.env, true);
  return c.json(
    await secureService(c.env).approve(
      c.get("actor"),
      c.req.param("id"),
      principal,
      input.reviewed,
      input.recipientRequested,
    ),
  );
});
app.post("/api/secure-distributions/:id/activate", async (c) => {
  if (c.get("actor").actor !== "browser")
    throw new DomainError(
      "BROWSER_REQUIRED",
      "Use confirm for API confirmation after browser approval.",
      403,
    );
  const result = await secureService(c.env).confirm(
    c.get("actor"),
    c.req.param("id"),
    idempotency(c.req.header("Idempotency-Key")),
  );
  await publishOutbox(c.env, domain(c.env));
  return c.json(result);
});
app.post("/api/secure-distributions/:id/confirm", async (c) => {
  const actor = c.get("actor"),
    result = await (
      await secureRequestService(c.req.raw, c.env, "dispatches:send")
    ).confirm(
      actor,
      c.req.param("id"),
      idempotency(c.req.header("Idempotency-Key")),
    );
  await publishOutbox(c.env, domain(c.env));
  return c.json(secureResult(actor, result));
});
app.post("/api/secure-distributions/:id/revoke", async (c) =>
  c.json(
    secureResult(
      c.get("actor"),
      await (
        await secureRequestService(c.req.raw, c.env, "dispatches:send")
      ).revoke(c.get("actor"), c.req.param("id")),
    ),
  ),
);
app.post("/api/secure-distributions/:id/bind", async (c) => {
  const principal = await authenticatePersonalBrowser(c.req.raw, c.env, true),
    input = await secureJson(c.req.raw, secureBindingSchema);
  return c.json(
    await secureService(c.env).bind(
      c.get("actor"),
      c.req.param("id"),
      principal,
      input,
    ),
  );
});
app.get("/api/secure-distributions/:id/preview/:page", async (c) =>
  secureWorkshopPreview(
    c.req.raw,
    c.env,
    secureService(c.env),
    c.get("actor"),
    c.req.param("id"),
    z.coerce.number().int().min(1).max(100).parse(c.req.param("page")),
  ),
);
app.get("/api/secure-distributions/:id/preview/:page/text", async (c) =>
  secureWorkshopPreview(
    c.req.raw,
    c.env,
    secureService(c.env),
    c.get("actor"),
    c.req.param("id"),
    z.coerce.number().int().min(1).max(100).parse(c.req.param("page")),
    true,
  ),
);
app.get("/api/secure-distributions/:id/events", async (c) => {
  const [cursor, limit] = page(c.req.url);
  return c.json(
    await (
      await secureRequestService(c.req.raw, c.env, "dispatches:read")
    ).events(c.get("actor"), c.req.param("id"), { cursor, limit }),
  );
});
app.get("/api/postal/requirements", async (c) =>
  c.json(
    await new PostalService(c.env, domain(c.env)).requirements(
      await postalAuthority(c.req.raw, c.env, "documents:read"),
      z.enum(["FR", "LU", "DE"]).parse(c.req.query("country")),
      z
        .enum(["left", "right"])
        .optional()
        .parse(c.req.query("addressPosition")),
    ),
  ),
);
app.post("/api/postal/address-pages", async (c) =>
  c.json(
    await new PostalAddressPageService(c.env, domain(c.env)).generate(
      await postalAuthority(c.req.raw, c.env, "documents:write"),
      postalAddressPageInputSchema.parse(await c.req.json()),
      idempotency(c.req.header("Idempotency-Key")),
    ),
    201,
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
      "The quote uses the document and recipient already verified.",
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
  c.json(
    await new DocumentService(c.env, domain(c.env)).list(
      c.get("actor"),
      ...page(c.req.url),
    ),
  ),
);
app.get("/api/documents/:id", async (c) => {
  const dispatchId = c.req.query("dispatchId");
  const authority = dispatchId
    ? await postalAuthority(c.req.raw, c.env, "documents:read")
    : undefined;
  const document = await new DocumentService(c.env, domain(c.env)).get(
    c.get("actor"),
    c.req.param("id"),
    dispatchId,
  );
  await authority?.assertCurrent();
  return c.json(document);
});
app.post("/api/documents", async (c) => {
  const data = await c.req.raw.formData();
  const file = data.get("file");
  if (!file || typeof file === "string")
    throw new ContentError("FILE_REQUIRED", "Choose a PDF.");
  if (file.size > LIMITS.pdfBytes)
    throw new ContentError("FILE_TOO_LARGE", "PDF is too large.", 413);
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
app.get("/api/documents/:id/content", async (c) => {
  const dispatchId = c.req.query("dispatchId");
  const authority = dispatchId
    ? await postalAuthority(c.req.raw, c.env, "documents:read")
    : undefined;
  const response = await new DocumentService(c.env, domain(c.env)).getContent(
    c.get("actor"),
    c.req.param("id"),
    dispatchId,
  );
  await authority?.assertCurrent();
  return response;
});
app.post("/api/documents/:id/rescan", async (c) =>
  c.json(
    await new DocumentService(c.env, domain(c.env)).rescan(
      c.get("actor"),
      c.req.param("id"),
    ),
  ),
);
app.get("/api/documents/:id/validation", async (c) =>
  c.json(
    await new PdfValidationService(c.env, domain(c.env)).list(
      c.get("actor"),
      c.req.param("id"),
    ),
  ),
);
app.post("/api/documents/:id/validation", async (c) =>
  c.json(
    await new PdfValidationService(c.env, domain(c.env)).validate(
      await postalBrowserAuthority(c.req.raw, c.env, true),
      c.req.param("id"),
      await c.req.json(),
      idempotency(c.req.header("Idempotency-Key")),
    ),
    201,
  ),
);
app.post("/api/admin/scanner/warm", async (c) =>
  c.json(
    await new DocumentService(c.env, domain(c.env)).warmScanner(c.get("actor")),
  ),
);
app.get("/api/dispatches", async (c) =>
  c.json(
    await domain(c.env).listDispatches(
      c.get("actor"),
      ...page(c.req.url),
      new URL(c.req.url).searchParams.get("group") ?? undefined,
    ),
  ),
);
app.get("/api/dispatches/:id", async (c) =>
  c.json(await domain(c.env).getDispatch(c.get("actor"), c.req.param("id"))),
);
app.get("/api/dispatches/:id/dry-run", async (c) =>
  c.json(
    await domain(c.env).validateDispatch(c.get("actor"), c.req.param("id")),
  ),
);
const prepareSchema = z
  .object({
    channel: z.enum(["fax", "email", "postal"]),
    recipient: z.record(z.string(), z.unknown()),
    documentId: z.string().optional(),
    subject: z
      .string()
      .optional()
      .describe(emailPreparationDescriptions.subject),
    html: z.string().optional().describe(emailPreparationDescriptions.html),
    text: z.string().optional().describe(emailPreparationDescriptions.text),
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
app.post("/api/dispatches/:id/renew-quote", async (c) => {
  z.object({})
    .strict()
    .parse(await c.req.json());
  return c.json(
    await domain(c.env).renewFaxQuote(c.get("actor"), c.req.param("id")),
    201,
  );
});
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
  const acceptanceAuthority =
    c.get("actor").actor === "mcp"
      ? (await postalAuthority(c.req.raw, c.env, "dispatches:send")).sql()
      : undefined;
  const result = await service.confirmDispatch(
    c.get("actor"),
    c.req.param("id"),
    idempotency(c.req.header("Idempotency-Key")),
    undefined,
    acceptanceAuthority,
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
  c.json(await domain(c.env).usage(c.get("actor"), c.req.query("period"))),
);
app.get("/api/usage/activity", async (c) =>
  c.json(
    await domain(c.env).usageActivity(c.get("actor"), c.req.query("year")),
  ),
);
app.get("/api/overview", async (c) => {
  // Workspace summary only: its document count is not a dispatches:read fact.
  if (c.get("actor").actor !== "browser")
    throw new ContentError(
      "BROWSER_REQUIRED",
      "Open Guteneo in your browser to view this summary.",
      403,
    );
  return c.json(await domain(c.env).dispatchOverview(c.get("actor")));
});
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
      "Authenticated administrator required.",
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
  c.json({ error: { code: "NOT_FOUND", message: "Route not found." } }, 404),
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
  if (
    c.req.method === "GET" &&
    c.req.path.startsWith("/auth/") &&
    (error instanceof AuthError ||
      (error instanceof DomainError && c.req.path === "/auth/callback"))
  ) {
    return c.redirect(
      authFailureRedirect(c.req.raw, c.env, error.code, error),
      302,
    );
  }
  if (
    error instanceof DomainError ||
    error instanceof ContentError ||
    error instanceof AuthError ||
    error instanceof DatasetError ||
    error instanceof TemplateError
  )
    return c.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error instanceof TemplateError ? { details: error.details } : {}),
        },
      },
      (error instanceof TemplateError ? 422 : error.status) as 400,
    );
  if (error instanceof z.ZodError)
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid data.",
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
        message: "The operation failed. Keep the correlation identifier.",
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
                ? "Simulated postal handover; no letter was sent."
                : "Deterministic simulation result; no real communication.",
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
            if (
              parsed.success &&
              parsed.data.dispatchId.startsWith("secure_deposit:")
            ) {
              await env.DB.prepare(
                "UPDATE secure_deposit_operations SET auth_session_hash=NULL,lease_expires_at=? WHERE id=? AND status='preparing'",
              )
                .bind(
                  new Date().toISOString(),
                  parsed.data.dispatchId.slice("secure_deposit:".length),
                )
                .run();
              message.ack();
              counts.acked++;
              counts.deadLetters++;
              continue;
            }
            if (
              parsed.success &&
              parsed.data.dispatchId.startsWith("secure_render:")
            ) {
              await secureService(env).failRender(
                parsed.data.dispatchId.slice("secure_render:".length),
              );
              message.ack();
              counts.acked++;
              counts.deadLetters++;
              continue;
            }
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
          if (parsed.data.dispatchId.startsWith("secure_render:")) {
            await secureService(env).processRender(
              parsed.data.dispatchId.slice("secure_render:".length),
            );
            message.ack();
            counts.acked++;
            continue;
          }
          if (parsed.data.dispatchId.startsWith("secure_deposit:")) {
            await new PersonalDocumentsService(env).processDeposit(
              parsed.data.dispatchId.slice("secure_deposit:".length),
            );
            message.ack();
            counts.acked++;
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
          if (
            env.MODE !== "simulation" &&
            !liveSendingEnabled(env, row.channel)
          ) {
            message.retry({ delaySeconds: 300 });
            counts.retried++;
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
      // Technical check expiry releases only its own approved credit hold.
      // Identity/provider downtime must not keep a failed check reserved.
      stage = "documents";
      await expirePdfValidations(env);
      await cleanupMcpAppDocumentUploads(env);
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
      await new DocumentService(env, service).processPendingScans();
      await cleanupProtectedDocuments(env.DB);
      await new TemplateWorkflowService(env, service).processPending();
      await cleanupBelvedereTelemetry(env.DB);
      await secureService(env).recoverPending();
      await new PersonalDocumentsService(env).recoverPending();
      Object.assign(counts, await maintainDocuments(env));
      stage = "postal";
      await cleanupPostalEvidence(env.DB);
      await env.DB.prepare(
        "DELETE FROM expert_document_review_progress WHERE rowid IN (SELECT rowid FROM expert_document_review_progress WHERE expires_at<? LIMIT 100)",
      )
        .bind(new Date().toISOString())
        .run();
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
