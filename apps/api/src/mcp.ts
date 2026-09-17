import { createMcpHandler } from "agents/mcp/server";
import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import { LIMITS } from "../../../packages/contracts/src/content";
import {
  postalReviewInputSchema,
  type PostalReviewInput,
  type PostalReview,
} from "../../../packages/contracts/src/postal-review";
import type {
  DomainService,
  Dispatch,
  DocumentRecord,
} from "../../../packages/domain/src/index";
import {
  AuthError,
  authenticateMcp,
  requireScope,
  type AuthContext,
  type AuthEnv,
  type McpIdentity,
} from "./auth";

export interface McpDocuments {
  rescan?(ctx: AuthContext, documentId: string): Promise<DocumentRecord>;
  importFile(
    ctx: AuthContext,
    file: {
      download_url: string;
      file_id: string;
      mime_type?: string;
      file_name?: string;
    },
  ): Promise<DocumentRecord>;
  render(
    ctx: AuthContext,
    input: { name: string; html: string },
  ): Promise<DocumentRecord>;
}
export interface McpServices {
  domain: DomainService;
  documents: McpDocuments;
  capabilities: () => unknown;
  afterConfirmation?: () => Promise<void>;
  postal?: {
    requirements(
      identity: McpIdentity,
      country: "FR" | "LU" | "DE",
    ): Promise<unknown>;
    create(
      identity: McpIdentity,
      input: PostalReviewInput,
      key: string,
    ): Promise<PostalReview>;
    get(identity: McpIdentity, id: string): Promise<PostalReview>;
    quote(identity: McpIdentity, id: string, key: string): Promise<Dispatch>;
  };
}
const errorSchema = z
  .object({ code: z.string(), message: z.string() })
  .strict();
const documentSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    sha256: z.string(),
    size: z.number().int(),
    pages: z.number().int(),
    status: z.string(),
    source: z.string(),
    createdAt: z.string(),
    previewUrl: z.string(),
    simulation: z.boolean(),
  })
  .strict();
const dispatchSchema = z
  .object({
    id: z.string(),
    channel: z.enum(["fax", "email", "postal"]),
    status: z.string(),
    mode: z.enum(["simulation", "production"]),
    recipient: z.record(z.string(), z.unknown()),
    documentId: z.string().nullable(),
    campaignId: z.string().nullable(),
    fingerprint: z.string(),
    estimatedMinor: z.number().int(),
    ceilingMinor: z.number().int(),
    knownMinor: z.number().int().nullable(),
    currency: z.literal("EUR"),
    updatedAt: z.string(),
    approvalUrl: z.string(),
    nextActions: z.array(z.string()),
  })
  .strict();
function output<T extends z.ZodType>(data: T) {
  return z
    .object({
      ok: z.boolean(),
      data: data.optional(),
      error: errorSchema.optional(),
    })
    .strict();
}
const id = z.string().min(1).max(200);
const key = z.string().min(1).max(200);
const readonlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
const writeAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
const oauthMetadata = (scope?: string | string[]) => ({
  // The installed MCP v2 SDK preserves extension metadata, not arbitrary top-level fields.
  securitySchemes: [
    {
      type: "oauth2",
      scopes: scope ? (Array.isArray(scope) ? scope : [scope]) : [],
    },
  ],
});

export const FAX_WORKFLOW = [
  "1. Appeler get_capabilities et annoncer explicitement simulation ou production ainsi que les blocages.",
  "2. Réutiliser un document Guteneo avec get_document/list_documents, importer le PDF exact avec import_document si l’hôte fournit un fichier autorisé, ou upload_local_pdf si un adaptateur local est installé. Sinon ouvrir le dépôt authentifié Guteneo. Ne jamais reconstruire un original à partir de son texte, inventer une URL ou transmettre un chemin local au serveur distant.",
  "3. Attendre le statut ready du document. Confirmer avec l’utilisateur le numéro international E.164 et le plafond en centimes EUR ; ne pas inventer de destinataire, de tarif ou de crédit.",
  "4. Appeler prepare_fax avec documentId, phone, ceilingMinor et une clé d’idempotence stable pour cette préparation. Présenter l’aperçu, le destinataire, le coût et approvalUrl.",
  "5. L’utilisateur doit ouvrir approvalUrl, vérifier le PDF et approuver dans Guteneo. Un oui dans la conversation ou l’autorisation d’un outil ne remplace pas cette approbation. Le modèle ne doit jamais appeler l’API navigateur d’approbation.",
  "6. Après cette approbation, appeler confirm_dispatch avec dispatchId et une clé d’idempotence stable. Un refus APPROVAL_REQUIRED impose de revenir à l’approbation humaine ; ne pas changer de clé pour contourner un refus.",
  "7. Consulter get_dispatch_status. Distinguer queued, accepted, delivered et failed. submission_unknown exige un rapprochement opérateur ; ne jamais relancer automatiquement un fax incertain.",
].join("\n");

export const openAIFileSchema = z
  .object({
    download_url: z.string().url().max(8192),
    file_id: z.string().min(1).max(512),
    mime_type: z.string().max(200).optional(),
    file_name: z.string().max(250).optional(),
  })
  .strict();

export function dispatchSummary(dispatch: Dispatch, origin: string) {
  return {
    id: dispatch.id,
    channel: dispatch.channel,
    status: dispatch.status,
    mode: dispatch.mode,
    recipient: JSON.parse(dispatch.recipient_json) as Record<string, unknown>,
    documentId: dispatch.document_id,
    campaignId: dispatch.campaign_id,
    fingerprint: dispatch.fingerprint,
    estimatedMinor: dispatch.estimated_minor,
    ceilingMinor: dispatch.ceiling_minor,
    knownMinor: dispatch.known_minor,
    currency: dispatch.currency,
    updatedAt: dispatch.updated_at,
    approvalUrl: `${origin}/#/app/dispatch/${encodeURIComponent(dispatch.id)}`,
    nextActions:
      dispatch.status === "prepared"
        ? [
            "Ouvrir l’aperçu authentifié et approuver humainement, puis appeler confirm_dispatch.",
          ]
        : dispatch.status === "submission_unknown"
          ? [
              "Attendre le rapprochement opérateur. Ne pas réexpédier cette commande.",
            ]
          : dispatch.status === "accepted"
            ? ["Accepté par le prestataire ; consulter le prochain résultat."]
            : [],
  };
}
function documentSummary(document: DocumentRecord, env: AuthEnv) {
  return {
    id: document.id,
    name: document.name,
    sha256: document.sha256,
    size: document.size,
    pages: document.pages,
    status: document.status,
    source: document.source,
    createdAt: document.created_at,
    previewUrl: `${env.APP_ORIGIN}/api/documents/${encodeURIComponent(document.id)}/content`,
    simulation: env.MODE === "simulation",
  };
}
function success(data: unknown): CallToolResult {
  const structuredContent = { ok: true, data };
  return {
    structuredContent,
    content: [{ type: "text", text: JSON.stringify(structuredContent) }],
  };
}
function failure(error: unknown): CallToolResult {
  const safe =
    error instanceof Error && "code" in error && typeof error.code === "string"
      ? { code: error.code, message: error.message }
      : {
          code: "INTERNAL_ERROR",
          message:
            "L’opération n’a pas abouti. Consultez le tableau de bord avant toute nouvelle tentative.",
        };
  return {
    isError: true,
    structuredContent: { ok: false, error: safe },
    content: [
      { type: "text", text: JSON.stringify({ ok: false, error: safe }) },
    ],
  };
}

/** All business operations are the same service calls as REST; this layer only validates the protocol boundary. */
export function createGuteneoMcpServer(
  identity: McpIdentity,
  env: AuthEnv,
  services: McpServices,
): McpServer {
  const server = new McpServer({ name: "guteneo", version: "0.2.0" });
  const run = async (
    scope: string | string[] | null,
    operation: () => Promise<unknown> | unknown,
  ): Promise<CallToolResult> => {
    try {
      if (scope)
        for (const required of Array.isArray(scope) ? scope : [scope])
          requireScope(identity, required);
      return success(await operation());
    } catch (error) {
      const result = failure(error);
      if (error instanceof AuthError && error.code === "INSUFFICIENT_SCOPE") {
        result._meta = {
          "mcp/www_authenticate": [
            `Bearer resource_metadata="${env.APP_ORIGIN}/.well-known/oauth-protected-resource/mcp", error="insufficient_scope", error_description="Additional Guteneo permission required", scope="${Array.isArray(scope) ? scope.join(" ") : scope}"`,
          ],
        };
      }
      return result;
    }
  };
  if (services.postal) {
    const postal = services.postal;
    server.registerTool(
      "get_postal_requirements",
      {
        description:
          "Lire avant de créer une lettre : profil Pingen qualifié, position de fenêtre, rectangles réservés en mm et contraintes exactes du pays. Lecture seule du compte fournisseur, sans PDF ni dépôt ; ne pas inventer un gabarit si le profil n’est pas disponible.",
        inputSchema: z.object({ country: z.enum(["FR", "LU", "DE"]) }).strict(),
        outputSchema: output(z.unknown()),
        annotations: { ...readonlyAnnotations, openWorldHint: true },
        _meta: oauthMetadata("documents:read"),
      },
      ({ country }) =>
        run("documents:read", () => postal.requirements(identity, country)),
    );
    server.registerTool(
      "preflight_postal_pdf",
      {
        description:
          "Vérifie toutes les pages du PDF original pour le courrier, son adresse et le profil Pingen qualifié. Consomme une analyse du quota PDF existant. Retourne reviewUrl pour la revue humaine. N’envoie rien et ne dépose aucun fichier chez Pingen. Le modèle ne peut pas donner le consentement de transfert : l’utilisateur doit ouvrir Guteneo et le confirmer séparément.",
        inputSchema: postalReviewInputSchema
          .extend({ idempotencyKey: key })
          .strict(),
        outputSchema: output(z.unknown()),
        annotations: writeAnnotations,
        _meta: oauthMetadata(["documents:write", "dispatches:prepare"]),
      },
      ({ idempotencyKey, ...input }) =>
        run(["documents:write", "dispatches:prepare"], async () => {
          return postal.create(identity, input, idempotencyKey);
        }),
    );
    server.registerTool(
      "get_postal_preflight",
      {
        description:
          "Consulte le contrôle postal et son lien de revue humaine. prepared désigne uniquement un brouillon fournisseur ; aucun courrier n’a été envoyé. Ne jamais inventer une preuve ou relancer un transfert unknown.",
        inputSchema: z.object({ preflightId: id }).strict(),
        outputSchema: output(z.unknown()),
        annotations: readonlyAnnotations,
        _meta: oauthMetadata("documents:read"),
      },
      ({ preflightId }) =>
        run("documents:read", () => postal.get(identity, preflightId)),
    );
    server.registerTool(
      "quote_postal_draft",
      {
        description:
          "Demande le devis exact d’un brouillon Pingen déjà déposé avec consentement dans Guteneo. Attend la fin de l’analyse fournisseur ; retourne ensuite le lien d’approbation distinct de l’envoi. Aucun envoi implicite.",
        inputSchema: z
          .object({ preflightId: id, idempotencyKey: key })
          .strict(),
        outputSchema: output(dispatchSchema),
        annotations: writeAnnotations,
        _meta: oauthMetadata("dispatches:prepare"),
      },
      ({ preflightId, idempotencyKey }) =>
        run("dispatches:prepare", async () =>
          dispatchSummary(
            await postal.quote(identity, preflightId, idempotencyKey),
            env.APP_ORIGIN,
          ),
        ),
    );
  }
  server.registerTool(
    "get_capabilities",
    {
      description:
        "Décrit les canaux, limites, connexions et blocages réels. Simulation est toujours explicite.",
      inputSchema: z.object({}).strict(),
      outputSchema: output(z.unknown()),
      annotations: readonlyAnnotations,
      _meta: oauthMetadata(),
    },
    () => run(null, services.capabilities),
  );
  server.registerTool(
    "import_document",
    {
      description:
        "Importe les octets exacts d’un fichier PDF depuis une URL temporaire autorisée. Retourne un identifiant durable ; ne reconstruit jamais son texte. Les sources non autorisées sont refusées.",
      inputSchema: z.object({ file: openAIFileSchema }).strict(),
      outputSchema: output(documentSchema),
      annotations: { ...writeAnnotations, openWorldHint: true },
      _meta: {
        ...oauthMetadata("documents:write"),
        "openai/fileParams": ["file"],
      },
    },
    ({ file }) =>
      run("documents:write", async () =>
        documentSummary(
          await services.documents.importFile(identity.context, file),
          env,
        ),
      ),
  );
  server.registerTool(
    "render_pdf",
    {
      description:
        "Génère explicitement un nouveau PDF depuis du HTML autonome contrôlé. Ce parcours ne remplace pas l’import d’un original existant.",
      inputSchema: z
        .object({
          name: z.string().min(1).max(200),
          html: z.string().min(1).max(LIMITS.htmlBytes),
        })
        .strict(),
      outputSchema: output(documentSchema),
      annotations: { ...writeAnnotations, idempotentHint: false },
      _meta: oauthMetadata("documents:write"),
    },
    (input) =>
      run("documents:write", async () =>
        documentSummary(
          await services.documents.render(identity.context, input),
          env,
        ),
      ),
  );
  server.registerTool(
    "get_document",
    {
      title: "Vérifier un PDF Guteneo",
      description:
        "Vérifie l’identifiant, l’empreinte SHA-256, les pages et le statut d’un PDF de l’organisation connectée. Un document quarantined ne peut pas être faxé. L’aperçu nécessite une session navigateur Guteneo.",
      inputSchema: z.object({ documentId: id }).strict(),
      outputSchema: output(documentSchema),
      annotations: readonlyAnnotations,
      _meta: oauthMetadata("documents:read"),
    },
    ({ documentId }) =>
      run("documents:read", async () =>
        documentSummary(
          await services.domain.getDocument(identity.context, documentId),
          env,
        ),
      ),
  );
  if (services.documents.rescan)
    server.registerTool(
      "rescan_document",
      {
        title: "Relancer la vérification d’un PDF",
        description:
          "Relance une analyse du PDF original en quarantaine, sans modifier ses octets ni l’envoyer. Utile après le démarrage de l’antivirus. Maximum dix nouvelles tentatives par organisation et par jour ; ne pas appeler en boucle. Seul le statut ready permet de préparer un fax.",
        inputSchema: z.object({ documentId: id }).strict(),
        outputSchema: output(documentSchema),
        annotations: { ...writeAnnotations, idempotentHint: false },
        _meta: oauthMetadata("documents:write"),
      },
      ({ documentId }) =>
        run("documents:write", async () =>
          documentSummary(
            await services.documents.rescan!(identity.context, documentId),
            env,
          ),
        ),
    );
  server.registerTool(
    "list_documents",
    {
      title: "Retrouver un PDF déposé",
      description:
        "Retrouve les PDF déjà déposés dans Guteneo, notamment après un dépôt navigateur depuis Claude ou Cursor. Retourne uniquement les métadonnées de l’organisation connectée, jamais les octets ni une URL publique.",
      inputSchema: z
        .object({
          cursor: z.string().max(2048).optional(),
          limit: z.number().int().min(1).max(50).default(20),
        })
        .strict(),
      outputSchema: output(
        z
          .object({
            items: z.array(documentSchema),
            nextCursor: z.string().nullable(),
          })
          .strict(),
      ),
      annotations: readonlyAnnotations,
      _meta: oauthMetadata("documents:read"),
    },
    ({ cursor, limit }) =>
      run("documents:read", async () => {
        const result = await services.domain.listDocuments(
          identity.context,
          cursor,
          limit,
        );
        return {
          ...result,
          items: result.items.map((document) => documentSummary(document, env)),
        };
      }),
  );
  server.registerTool(
    "prepare_fax",
    {
      title: "Préparer un fax PDF",
      description:
        "Prépare le fax d’un PDF Guteneo prêt, à un numéro international E.164, avec un plafond explicite en centimes EUR. Retourne le prix et le lien d’approbation humaine. Ne facture et n’envoie rien ; nécessite ensuite une approbation dans Guteneo puis confirm_dispatch.",
      inputSchema: z
        .object({
          documentId: id,
          phone: z
            .string()
            .regex(/^\+[1-9]\d{7,14}$/)
            .describe(
              "Numéro du destinataire en format international E.164, fourni par l’utilisateur.",
            ),
          ceilingMinor: z
            .number()
            .int()
            .nonnegative()
            .safe()
            .describe(
              "Plafond accepté en centimes EUR ; 100 = 1 EUR. Le devis réel provient du serveur.",
            ),
          senderId: id.optional(),
          idempotencyKey: key,
        })
        .strict(),
      outputSchema: output(dispatchSchema),
      annotations: writeAnnotations,
      _meta: oauthMetadata("dispatches:prepare"),
    },
    ({ idempotencyKey, phone, ...input }) =>
      run("dispatches:prepare", async () =>
        dispatchSummary(
          await services.domain.prepareDispatch(
            identity.context,
            { ...input, channel: "fax", recipient: { phone } },
            idempotencyKey,
          ),
          env.APP_ORIGIN,
        ),
      ),
  );
  server.registerTool(
    "prepare_dispatch",
    {
      description:
        "Prépare un envoi à un destinataire et un canal, avec contenu final, coût plafonné et lien d’approbation humaine. Réutilise documentId ; ne soumet rien au prestataire.",
      inputSchema: z
        .object({
          idempotencyKey: key,
          channel: z.enum(["fax", "email", "postal"]),
          recipient: z.union([
            z.object({ email: z.string().max(320) }).strict(),
            z.object({ phone: z.string().max(30) }).strict(),
            z
              .object({
                name: z.string().max(200),
                line1: z.string().max(200),
                postalCode: z.string().max(30),
                city: z.string().max(200),
                country: z.enum(["FR", "LU", "DE"]),
              })
              .strict(),
          ]),
          documentId: id.optional(),
          senderId: id.optional(),
          campaignId: id.optional(),
          subject: z.string().max(250).optional(),
          html: z.string().max(250_000).optional(),
          text: z.string().max(250_000).optional(),
          ceilingMinor: z.number().int().nonnegative().safe().optional(),
          options: z
            .object({
              kind: z.enum(["transactional", "marketing"]).optional(),
              color: z.boolean().optional(),
              duplex: z.boolean().optional(),
            })
            .strict()
            .optional(),
        })
        .strict(),
      outputSchema: output(dispatchSchema),
      annotations: writeAnnotations,
      _meta: oauthMetadata("dispatches:prepare"),
    },
    ({ idempotencyKey, ...input }) =>
      run("dispatches:prepare", async () =>
        dispatchSummary(
          await services.domain.prepareDispatch(
            identity.context,
            input,
            idempotencyKey,
          ),
          env.APP_ORIGIN,
        ),
      ),
  );
  server.registerTool(
    "confirm_dispatch",
    {
      description:
        "Accepte durablement un envoi après une approbation humaine déjà enregistrée dans Guteneo. Le modèle ne peut pas donner cette approbation. Une même clé ne crée pas de deuxième envoi.",
      inputSchema: z.object({ dispatchId: id, idempotencyKey: key }).strict(),
      outputSchema: output(dispatchSchema),
      annotations: { ...writeAnnotations, openWorldHint: true },
      _meta: oauthMetadata("dispatches:send"),
    },
    ({ dispatchId, idempotencyKey }) =>
      run("dispatches:send", async () => {
        const dispatch = await services.domain.confirmDispatch(
          identity.context,
          dispatchId,
          idempotencyKey,
        );
        // Persisted outbox owns recovery. A publication failure does not make an accepted command disappear.
        try {
          await services.afterConfirmation?.();
        } catch {
          /* cron republishes the durable outbox */
        }
        return dispatchSummary(dispatch, env.APP_ORIGIN);
      }),
  );
  server.registerTool(
    "get_dispatch_status",
    {
      description:
        "Retourne le résultat connu, le coût et les prochaines actions d’un envoi. Accepté ne signifie pas livré ; un résultat incertain ne doit pas être réessayé aveuglément.",
      inputSchema: z.object({ dispatchId: id }).strict(),
      outputSchema: output(dispatchSchema),
      annotations: readonlyAnnotations,
      _meta: oauthMetadata("dispatches:read"),
    },
    ({ dispatchId }) =>
      run("dispatches:read", async () =>
        dispatchSummary(
          (await services.domain.getDispatch(identity.context, dispatchId))
            .dispatch,
          env.APP_ORIGIN,
        ),
      ),
  );
  server.registerTool(
    "list_dispatches",
    {
      description:
        "Liste les envois de l’organisation autorisée, avec pagination bornée. Retourne des métadonnées sans PDF ni contenu HTML.",
      inputSchema: z
        .object({
          cursor: z.string().max(2048).optional(),
          limit: z.number().int().min(1).max(50).default(20),
        })
        .strict(),
      outputSchema: output(
        z
          .object({
            items: z.array(dispatchSchema),
            nextCursor: z.string().nullable(),
          })
          .strict(),
      ),
      annotations: readonlyAnnotations,
      _meta: oauthMetadata("dispatches:read"),
    },
    ({ cursor, limit }) =>
      run("dispatches:read", async () => {
        const result = await services.domain.listDispatches(
          identity.context,
          cursor,
          limit,
        );
        return {
          ...result,
          items: result.items.map((item) =>
            dispatchSummary(item, env.APP_ORIGIN),
          ),
        };
      }),
  );
  server.registerTool(
    "cancel_dispatch",
    {
      description:
        "Annule uniquement si l’état et le canal le permettent. Une soumission incertaine ou déjà transmise est refusée ; aucune promesse de récupération physique.",
      inputSchema: z.object({ dispatchId: id }).strict(),
      outputSchema: output(dispatchSchema),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: oauthMetadata("dispatches:send"),
    },
    ({ dispatchId }) =>
      run("dispatches:send", async () =>
        dispatchSummary(
          await services.domain.cancelDispatch(identity.context, dispatchId),
          env.APP_ORIGIN,
        ),
      ),
  );
  server.registerPrompt(
    "fax_pdf",
    {
      title: "Faxer un PDF avec contrôle humain",
      description:
        "Parcours complet : PDF exact, devis, approbation dans Guteneo, envoi et suivi.",
    },
    () => ({
      description:
        "Préparer puis suivre un fax sans substituer le document ni l’approbation humaine.",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `${FAX_WORKFLOW}\nDépôt et revue authentifiés : ${env.APP_ORIGIN}/#/app/documents`,
          },
        },
      ],
    }),
  );
  return server;
}

export async function handleMcp(
  request: Request,
  env: AuthEnv,
  services: McpServices,
): Promise<Response> {
  let identity: McpIdentity;
  try {
    identity = await authenticateMcp(request, env);
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 401;
    return Response.json(
      {
        error: {
          code:
            error instanceof AuthError ? error.code : "AUTHENTICATION_REQUIRED",
          message:
            error instanceof AuthError
              ? error.message
              : "Authentification requise.",
        },
      },
      {
        status,
        headers: {
          "Cache-Control": "no-store",
          "WWW-Authenticate": `Bearer resource_metadata="${env.APP_ORIGIN}/.well-known/oauth-protected-resource/mcp"`,
        },
      },
    );
  }
  const window = Math.floor(Date.now() / 60_000);
  const budget = await env.DB.prepare(
    "INSERT INTO http_limits(organization_id,window_start,count) VALUES(?,?,1) ON CONFLICT(organization_id,window_start) DO UPDATE SET count=count+1 RETURNING count",
  )
    .bind(identity.context.organizationId, window)
    .first<{ count: number }>();
  if ((budget?.count ?? 0) > 180)
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
  const handler = createMcpHandler(
    () => createGuteneoMcpServer(identity, env, services),
    {
      route: "/mcp",
      allowedHostnames: [new URL(env.APP_ORIGIN).hostname],
      corsOptions: { origin: env.APP_ORIGIN },
    },
  );
  const response = await handler.fetch(request, {
    authInfo: {
      token: identity.token,
      clientId: identity.clientId,
      scopes: identity.scopes,
      expiresAt: identity.expiresAt,
      resource: new URL(`${env.APP_ORIGIN}/mcp`),
    },
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
