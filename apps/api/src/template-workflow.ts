import { z } from "zod";
import {
  DomainService,
  DomainError,
  canonicalJson,
  sha256,
  type ActorContext,
  type PrepareInput,
} from "../../../packages/domain/src/index";
import { validateRecipient } from "../../../packages/contracts/src/content";
import {
  TemplateEnvelopeSchema,
  TemplatePatchSchema,
  applyTemplatePatch,
  prepareTemplateRender,
  validateTemplateEnvelope,
  getTemplateValue,
  type TemplateEnvelope,
} from "../../../packages/contracts/src/templates";
import {
  MappingPlanSchema,
  XmlRecordPathSchema,
  type DatasetProfile,
  type DatasetFormat,
  type MappingPlan,
} from "../../../packages/contracts/src/datasets";
import {
  profileDataset,
  validateMapping,
  datasetStructureSignature,
  suggestMappingWithOpenAI,
  suggestDatasetSchemaWithOpenAI,
  suggestTemplateWithOpenAI,
  DATASET_LIMITS,
} from "../../../packages/data/index";
import {
  WORKFLOW_LIMITS,
  generationInputSchema,
  distributionInputSchema,
  type TemplateView,
  type TemplatePermission,
  type DatasetView,
  type MappingView,
  type GenerationJobView,
  type GenerationResultView,
  type DistributionView,
  type DistributionEntryView,
  type Page,
} from "../../../packages/contracts/src/template-workflow";
import {
  DocumentService,
  readLimited,
  reserveContentBudget,
  permittedImportUrl,
} from "./documents";
import type { Env } from "./env";
import {
  postalReviewInputSchema,
  type PostalReviewInput,
  type PostalReview,
} from "../../../packages/contracts/src/postal-review";
import { importDocxTemplate } from "../../../packages/templates/docx";
import {
  templateAuthoringGuide,
  templateExampleCatalog,
  getTemplateExample,
} from "../../../packages/templates/authoring";

export type WorkflowActor = ActorContext & {
  authority?: { connectionId: string; authorizationRevision: number };
};
type TemplateRow = {
  id: string;
  organization_id: string;
  owner_id: string;
  name: string;
  state: TemplateView["state"];
  visibility: TemplateView["visibility"];
  revision: number;
  current_version: number | null;
  draft_json: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  can_use?: number;
  can_edit?: number;
  can_publish?: number;
  can_share?: number;
};
type DatasetRow = {
  id: string;
  organization_id: string;
  owner_id: string;
  name: string;
  format: DatasetFormat;
  sha256: string;
  size: number;
  storage_key: string;
  profile_key: string | null;
  structure_hash: string | null;
  status: DatasetView["status"];
  error_code: string | null;
  created_at: string;
  expires_at: string;
  parsing_options_json: string;
  analysis_attempts: number;
  analysis_lease_token: string | null;
  analysis_lease_until: string | null;
};
type MappingRow = {
  id: string;
  organization_id: string;
  owner_id: string;
  version: number;
  name: string;
  source_dataset_id: string;
  structure_hash: string;
  plan_json: string;
  validation_json: string | null;
  state: MappingView["state"];
  created_at: string;
};
type JobRow = {
  id: string;
  organization_id: string;
  owner_id: string;
  request_role: ActorContext["role"];
  request_actor: ActorContext["actor"];
  authority_json: string | null;
  template_id: string;
  template_version: number;
  dataset_id: string | null;
  mapping_id: string | null;
  mapping_version: number | null;
  state: GenerationJobView["state"];
  total: number;
  request_hash: string;
  created_at: string;
  updated_at: string;
};
type RecordRow = {
  organization_id: string;
  job_id: string;
  record_id: string;
  ordinal: number;
  input_json: string;
  input_hash: string;
  state: GenerationResultView["state"];
  attempts: number;
  lease_token: string | null;
  lease_until: string | null;
  artifact_key: string | null;
  artifact_hash: string | null;
  document_id: string | null;
  error_code: string | null;
  document_status?: string | null;
};
const now = () => new Date().toISOString();
const uid = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
function fail(code: string, message: string, status = 409): never {
  throw new DomainError(code, message, status);
}
const parseJson = <T>(value: string): T => JSON.parse(value) as T;
const boundedJson = (
  value: unknown,
  limit: number = WORKFLOW_LIMITS.payloadBytes,
) => {
  const text = canonicalJson(value);
  if (new TextEncoder().encode(text).length > limit)
    fail("WORKFLOW_INPUT_TOO_LARGE", "Données trop volumineuses.", 413);
  return text;
};
// Guard raw API values before recursive Zod/schema parsing or JSON serialization.
function assertBoundedTemplateRequest(input: unknown) {
  const pending: [unknown, number][] = [[input, 0]];
  let nodes = 0;
  while (pending.length) {
    const [value, depth] = pending.pop()!;
    if (++nodes > 50_000 || depth > 16)
      fail("TEMPLATE_COMPLEXITY", "Structure du modèle trop complexe.", 422);
    if (value && typeof value === "object") {
      for (const child of Object.values(value)) {
        if (pending.length + nodes >= 50_000)
          fail(
            "TEMPLATE_COMPLEXITY",
            "Structure du modèle trop complexe.",
            422,
          );
        pending.push([child, depth + 1]);
      }
    }
  }
}
const keySchema = z.string().min(1).max(200);
export const templateCreateSchema = z
  .object({ envelope: TemplateEnvelopeSchema })
  .strict();
export const templateUpdateSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    envelope: TemplateEnvelopeSchema.optional(),
    patch: TemplatePatchSchema.optional(),
  })
  .strict()
  .refine(
    (v) => Boolean(v.envelope) !== Boolean(v.patch),
    "Choisissez une définition ou une modification sémantique.",
  );
export const revisionSchema = z
  .object({ expectedRevision: z.number().int().positive() })
  .strict();
export const templateShareSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    visibility: z.enum(["private", "organization", "selected"]),
    syntheticSamplesConfirmed: z.literal(true),
    grants: z
      .array(
        z
          .object({
            userId: z.string().min(1).max(200),
            use: z.boolean(),
            edit: z.boolean(),
            publish: z.boolean(),
            share: z.boolean(),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export const datasetAnalyzeSchema = z
  .object({
    instruction: z.string().max(2000).optional(),
    proposeSchema: z.boolean().optional(),
  })
  .strict();
export const mappingCreateSchema = z
  .object({
    datasetId: z.string().min(1).max(200),
    mappingId: z.string().min(1).max(200).optional(),
    expectedVersion: z.number().int().positive().optional(),
    plan: MappingPlanSchema,
  })
  .strict();
export const mappingValidateSchema = z
  .object({
    datasetId: z.string().min(1).max(200),
    version: z.number().int().positive(),
  })
  .strict();

/** The only business implementation used by REST, MCP and the web studio. */
export class TemplateWorkflowService {
  readonly documents: DocumentService;
  constructor(
    readonly env: Env,
    readonly domain: DomainService,
  ) {
    this.documents = new DocumentService(env, domain);
  }
  async importDocx(
    ctx: WorkflowActor,
    input: { name: string; bytes: Uint8Array },
  ) {
    await this.authorize(ctx, true);
    if (input.bytes.length > DATASET_LIMITS.sourceBytes)
      fail("DOCX_SIZE", "Fichier Word supérieur à 5 Mio.", 413);
    await this.scanSource(input.bytes, await sha256(input.bytes));
    const result = await importDocxTemplate(input.bytes, input.name);
    const template = await this.createTemplate(ctx, {
      envelope: result.envelope,
    });
    const id = uid("tplsrc"),
      key = `${ctx.organizationId}/workflow/template-sources/${id}.docx`,
      time = now();
    await this.env.DOCUMENTS.put(key, input.bytes, {
      onlyIf: { etagDoesNotMatch: "*" },
      customMetadata: { sha256: result.provenance.sourceSha256 },
    });
    await this.env.DB.prepare(
      "INSERT INTO workflow_template_sources(id,organization_id,owner_id,template_id,format,sha256,storage_key,created_at,expires_at) VALUES(?,?,?,?,'docx',?,?,?,?)",
    )
      .bind(
        id,
        ctx.organizationId,
        ctx.userId,
        template.id,
        result.provenance.sourceSha256,
        key,
        time,
        new Date(Date.now() + 30 * 86400000).toISOString(),
      )
      .run();
    return {
      template,
      warnings: result.warnings,
      provenance: result.provenance,
    };
  }
  async importDocxFile(
    ctx: WorkflowActor,
    file: {
      download_url: string;
      file_id: string;
      file_name?: string;
      mime_type?: string;
    },
  ) {
    await this.authorize(ctx, true);
    if (!["staging", "production"].includes(this.env.ENVIRONMENT))
      fail(
        "SOURCE_NOT_ALLOWED",
        "En local, utilisez le téléversement authentifié.",
        422,
      );
    const response = await fetch(permittedImportUrl(file.download_url), {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      fail(
        "SOURCE_DOWNLOAD_FAILED",
        "Joignez de nouveau le fichier Word avec un lien direct HTTPS.",
        422,
      );
    return this.importDocx(ctx, {
      name: file.file_name ?? "document.docx",
      bytes: await readLimited(response, DATASET_LIMITS.sourceBytes),
    });
  }
  private async authorize(ctx: WorkflowActor, write = false) {
    const row = await this.env.DB.prepare(
      "SELECT m.role,o.mode FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.organization_id=? AND m.user_id=?",
    )
      .bind(ctx.organizationId, ctx.userId)
      .first<{ role: string; mode: string }>();
    if (
      !row ||
      row.role !== ctx.role ||
      row.mode !== this.env.MODE ||
      (write && row.role === "viewer")
    )
      fail(
        "FORBIDDEN",
        "L’accès a été révoqué ou le rôle est insuffisant.",
        403,
      );
    if (ctx.actor === "mcp" && this.env.MODE === "production" && !ctx.authority)
      fail(
        "CONNECTION_REQUIRED",
        "Reconnectez cet assistant pour poursuivre.",
        403,
      );
    if (ctx.authority) {
      const active = await this.env.DB.prepare(
        "SELECT 1 FROM authorized_connections c JOIN connection_tool_observations o ON o.connection_id=c.id WHERE c.id=? AND c.organization_id=? AND c.user_id=? AND c.status='active' AND o.authorization_revision=?",
      )
        .bind(
          ctx.authority.connectionId,
          ctx.organizationId,
          ctx.userId,
          ctx.authority.authorizationRevision,
        )
        .first();
      if (!active)
        fail("CONNECTION_REVOKED", "Cette connexion a été révoquée.", 403);
    }
  }
  private authorizationFence(ctx: WorkflowActor) {
    const values: (string | number | null)[] = [
      ctx.organizationId,
      ctx.userId,
      ctx.role,
      this.env.MODE,
    ];
    let condition = `EXISTS(SELECT 1 FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.organization_id=? AND m.user_id=? AND m.role=? AND m.role<>'viewer' AND o.mode=?)`;
    if (ctx.authority) {
      condition +=
        " AND EXISTS(SELECT 1 FROM authorized_connections c JOIN connection_tool_observations o ON o.connection_id=c.id WHERE c.id=? AND c.organization_id=? AND c.user_id=? AND c.status='active' AND o.authorization_revision=?)";
      values.push(
        ctx.authority.connectionId,
        ctx.organizationId,
        ctx.userId,
        ctx.authority.authorizationRevision,
      );
    } else if (ctx.actor === "mcp" && this.env.MODE === "production") {
      condition += " AND 0=1";
    }
    return { condition, values };
  }
  private templateUseFence(ctx: WorkflowActor, templateId: string) {
    const authority = this.authorizationFence(ctx);
    return {
      condition: `${authority.condition} AND EXISTS(SELECT 1 FROM document_templates t LEFT JOIN template_permissions p ON p.organization_id=t.organization_id AND p.template_id=t.id AND p.user_id=? WHERE t.organization_id=? AND t.id=? AND t.deleted_at IS NULL AND t.state<>'archived' AND (t.owner_id=? OR t.visibility='organization' OR (t.visibility='selected' AND p.can_use=1)))`,
      values: [
        ...authority.values,
        ctx.userId,
        ctx.organizationId,
        templateId,
        ctx.userId,
      ],
    };
  }
  private permissions(
    ctx: WorkflowActor,
    row: TemplateRow,
  ): Record<TemplatePermission, boolean> {
    const owner = row.owner_id === ctx.userId;
    const shared = row.visibility !== "private";
    return {
      use:
        owner ||
        row.visibility === "organization" ||
        (shared && Boolean(row.can_use)),
      edit:
        ctx.role !== "viewer" && (owner || (shared && Boolean(row.can_edit))),
      publish:
        ctx.role !== "viewer" &&
        (owner || (shared && Boolean(row.can_publish))),
      share:
        ctx.role !== "viewer" && (owner || (shared && Boolean(row.can_share))),
    };
  }
  private async templateRow(
    ctx: WorkflowActor,
    id: string,
    permission: TemplatePermission | "read" = "use",
  ) {
    await this.authorize(ctx, permission !== "use" && permission !== "read");
    const row = await this.env.DB.prepare(
      "SELECT t.*,p.can_use,p.can_edit,p.can_publish,p.can_share FROM document_templates t LEFT JOIN template_permissions p ON p.organization_id=t.organization_id AND p.template_id=t.id AND p.user_id=? WHERE t.organization_id=? AND t.id=? AND t.deleted_at IS NULL",
    )
      .bind(ctx.userId, ctx.organizationId, id)
      .first<TemplateRow>();
    if (
      !row ||
      !(permission === "read"
        ? Object.values(this.permissions(ctx, row)).some(Boolean)
        : this.permissions(ctx, row)[permission])
    )
      fail(
        "TEMPLATE_NOT_FOUND",
        "Modèle introuvable ou permission insuffisante.",
        404,
      );
    return row!;
  }
  private templateView(ctx: WorkflowActor, row: TemplateRow): TemplateView {
    return {
      id: row.id,
      name: row.name,
      ownerId: row.owner_id,
      state: row.state,
      visibility: row.visibility,
      revision: row.revision,
      currentVersion: row.current_version,
      permissions: this.permissions(ctx, row),
      canDelete: row.owner_id === ctx.userId && ctx.role !== "viewer",
      envelope: parseJson(row.draft_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
  async listTemplates(
    ctx: WorkflowActor,
    cursor?: string,
    limit = 30,
  ): Promise<Page<TemplateView>> {
    await this.authorize(ctx);
    limit = Math.max(1, Math.min(50, limit || 30));
    const rows = await this.env.DB.prepare(
      "SELECT t.*,p.can_use,p.can_edit,p.can_publish,p.can_share FROM document_templates t LEFT JOIN template_permissions p ON p.organization_id=t.organization_id AND p.template_id=t.id AND p.user_id=? WHERE t.organization_id=? AND t.deleted_at IS NULL AND (t.owner_id=? OR t.visibility='organization' OR (t.visibility<>'private' AND (p.can_use=1 OR p.can_edit=1 OR p.can_publish=1 OR p.can_share=1))) AND t.id>? ORDER BY t.id LIMIT ?",
    )
      .bind(ctx.userId, ctx.organizationId, ctx.userId, cursor ?? "", limit + 1)
      .all<TemplateRow>();
    return {
      items: rows.results
        .slice(0, limit)
        .map((row) => this.templateView(ctx, row)),
      nextCursor:
        rows.results.length > limit ? rows.results[limit - 1].id : null,
    };
  }
  async getTemplate(ctx: WorkflowActor, id: string, version?: number) {
    const row = await this.templateRow(ctx, id, "read");
    const view = this.templateView(ctx, row);
    if (version) {
      const published = await this.version(ctx, id, version);
      view.envelope = published.envelope;
      view.currentVersion = version;
    }
    return view;
  }
  async getTemplateAuthoringGuide(ctx: WorkflowActor) {
    await this.authorize(ctx);
    return templateAuthoringGuide();
  }
  async listTemplateExamples(ctx: WorkflowActor) {
    await this.authorize(ctx);
    return templateExampleCatalog();
  }
  async getTemplateExample(ctx: WorkflowActor, exampleId: string) {
    await this.authorize(ctx);
    const example = getTemplateExample(exampleId);
    if (!example)
      fail("TEMPLATE_EXAMPLE_NOT_FOUND", "Exemple de modèle introuvable.", 404);
    return example!;
  }
  async getTemplateSharing(ctx: WorkflowActor, id: string) {
    await this.templateRow(ctx, id, "share");
    const [members, grants] = await Promise.all([
      this.env.DB.prepare(
        "SELECT u.id AS userId,u.name FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=? ORDER BY u.name LIMIT 100",
      )
        .bind(ctx.organizationId)
        .all<{ userId: string; name: string }>(),
      this.env.DB.prepare(
        "SELECT user_id,can_use,can_edit,can_publish,can_share FROM template_permissions WHERE organization_id=? AND template_id=?",
      )
        .bind(ctx.organizationId, id)
        .all<{
          user_id: string;
          can_use: number;
          can_edit: number;
          can_publish: number;
          can_share: number;
        }>(),
    ]);
    return {
      members: members.results,
      grants: grants.results.map((g) => ({
        userId: g.user_id,
        use: Boolean(g.can_use),
        edit: Boolean(g.can_edit),
        publish: Boolean(g.can_publish),
        share: Boolean(g.can_share),
      })),
    };
  }
  async previewTemplate(ctx: WorkflowActor, id: string, input: unknown) {
    await this.authorize(ctx, true);
    const value = z
      .object({
        expectedRevision: z.number().int().positive(),
        data: z.record(z.string(), z.unknown()),
      })
      .strict()
      .parse(input);
    const row = await this.templateRow(ctx, id);
    if (value.expectedRevision !== row.revision)
      fail("REVISION_CONFLICT", "Le modèle a changé.");
    const envelope = validateTemplateEnvelope(parseJson(row.draft_json));
    prepareTemplateRender(envelope, value.data);
    await reserveContentBudget(this.env.DB, ctx.organizationId, 0, true);
    const request = new Request("https://documents.internal/render/template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ envelope, data: value.data }),
      signal: AbortSignal.timeout(45000),
    });
    let response: Response;
    if (this.env.DOCUMENT_RENDERER)
      response = await this.env.DOCUMENT_RENDERER.fetch(request);
    else if (
      this.env.ENVIRONMENT === "local" &&
      this.env.MODE === "simulation" &&
      this.env.DOCUMENT_RENDERER_URL
    ) {
      const url = new URL(this.env.DOCUMENT_RENDERER_URL);
      if (!["localhost", "127.0.0.1"].includes(url.hostname))
        fail("INVALID_RENDERER", "Moteur local loopback requis.", 503);
      response = await fetch(
        new Request(new URL("/render/template", url), request),
      );
    } else
      fail(
        "RENDERER_NOT_CONFIGURED",
        "Le moteur pdfme n’est pas raccordé.",
        503,
      );
    if (!response!.ok)
      fail("TEMPLATE_RENDER_FAILED", "Le rendu du document a échoué.", 422);
    await this.templateRow(ctx, id);
    const document = await this.documents.upload(
      ctx,
      {
        name: `${envelope.name} — aperçu.pdf`,
        privateToCreator: true,
        bytes: await readLimited(response!),
      },
      "render",
      {
        documentId: uid("doc"),
        authority: {
          assertCurrent: async () => {
            await this.authorize(ctx, true);
            await this.templateRow(ctx, id);
          },
          sql: () => this.templateUseFence(ctx, id),
        },
      },
    );
    return {
      ...document,
      templateId: id,
      templateRevision: row.revision,
      templateHash: await sha256(row.draft_json),
      preview: true,
    };
  }
  async createTemplate(ctx: WorkflowActor, input: unknown) {
    await this.authorize(ctx, true);
    assertBoundedTemplateRequest(input);
    const envelope = validateTemplateEnvelope(
      z.object({ envelope: z.unknown() }).strict().parse(input).envelope,
    );
    const json = boundedJson(envelope, 512 * 1024);
    const id = uid("tpl"),
      time = now();
    const result = await this.env.DB.prepare(
      "INSERT INTO document_templates(id,organization_id,owner_id,name,state,draft_json,created_at,updated_at) SELECT ?,?,?,?,'draft',?,?,? WHERE (SELECT count(*) FROM document_templates WHERE organization_id=? AND deleted_at IS NULL)<?",
    )
      .bind(
        id,
        ctx.organizationId,
        ctx.userId,
        envelope.name,
        json,
        time,
        time,
        ctx.organizationId,
        WORKFLOW_LIMITS.templatesPerOrganization,
      )
      .run();
    if (!result.meta.changes)
      fail("TEMPLATE_QUOTA", "Limite de modèles atteinte.", 429);
    return this.getTemplate(ctx, id);
  }
  async updateTemplate(ctx: WorkflowActor, id: string, input: unknown) {
    assertBoundedTemplateRequest(input);
    const value = z
        .object({
          expectedRevision: z.number().int().positive(),
          envelope: z.unknown().optional(),
          patch: z.unknown().optional(),
        })
        .strict()
        .refine(
          (v) => Boolean(v.envelope) !== Boolean(v.patch),
          "Choisissez une définition ou une modification sémantique.",
        )
        .parse(input),
      row = await this.templateRow(ctx, id, "edit");
    if (row.revision !== value.expectedRevision)
      fail("REVISION_CONFLICT", "Le modèle a changé.");
    if (row.state === "archived")
      fail(
        "TEMPLATE_ARCHIVED",
        "Dupliquez ce modèle archivé pour le modifier.",
      );
    const envelope =
      value.envelope ??
      applyTemplatePatch(
        parseJson<TemplateEnvelope>(row.draft_json),
        value.patch!,
      );
    const parsed = validateTemplateEnvelope(envelope);
    const authority = this.authorizationFence(ctx);
    const result = await this.env.DB.prepare(
      `UPDATE document_templates SET draft_json=?,name=?,state='draft',revision=revision+1,updated_at=? WHERE organization_id=? AND id=? AND revision=? AND deleted_at IS NULL AND ${authority.condition}`,
    )
      .bind(
        boundedJson(parsed, 512 * 1024),
        parsed.name,
        now(),
        ctx.organizationId,
        id,
        value.expectedRevision,
        ...authority.values,
      )
      .run();
    if (!result.meta.changes)
      fail(
        "REVISION_CONFLICT",
        "Le modèle a changé. Rechargez avant d’enregistrer.",
      );
    return this.templateView(ctx, {
      ...row,
      draft_json: canonicalJson(parsed),
      name: parsed.name,
      state: "draft",
      revision: row.revision + 1,
      updated_at: now(),
    });
  }
  async publishTemplate(ctx: WorkflowActor, id: string, input: unknown) {
    const { expectedRevision } = revisionSchema.parse(input),
      row = await this.templateRow(ctx, id, "publish");
    if (row.state === "archived")
      fail("TEMPLATE_ARCHIVED", "Le modèle est archivé.");
    if (row.revision !== expectedRevision)
      fail("REVISION_CONFLICT", "Le modèle a changé.");
    const envelope = validateTemplateEnvelope(parseJson(row.draft_json));
    prepareTemplateRender(envelope, envelope.sampleData);
    const version = (row.current_version ?? 0) + 1,
      time = now(),
      hash = await sha256(row.draft_json);
    const authority = this.authorizationFence(ctx);
    const results = await this.env.DB.batch([
      this.env.DB.prepare(
        `INSERT INTO template_versions(organization_id,template_id,version,envelope_json,sha256,published_by,published_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM document_templates WHERE organization_id=? AND id=? AND revision=? AND deleted_at IS NULL) AND ${authority.condition}`,
      ).bind(
        ctx.organizationId,
        id,
        version,
        row.draft_json,
        hash,
        ctx.userId,
        time,
        ctx.organizationId,
        id,
        expectedRevision,
        ...authority.values,
      ),
      this.env.DB.prepare(
        `UPDATE document_templates SET state='published',current_version=?,revision=revision+1,updated_at=? WHERE organization_id=? AND id=? AND revision=? AND deleted_at IS NULL AND ${authority.condition}`,
      ).bind(
        version,
        time,
        ctx.organizationId,
        id,
        expectedRevision,
        ...authority.values,
      ),
    ]);
    if (!results[1].meta.changes)
      fail("REVISION_CONFLICT", "Le modèle a changé.");
    return this.templateView(ctx, {
      ...row,
      state: "published",
      current_version: version,
      revision: row.revision + 1,
      updated_at: time,
    });
  }
  async duplicateTemplate(ctx: WorkflowActor, id: string) {
    const row = await this.templateRow(ctx, id);
    const envelope = parseJson<TemplateEnvelope>(row.draft_json);
    return this.createTemplate(ctx, {
      envelope: { ...envelope, name: `${envelope.name} — copie`.slice(0, 120) },
    });
  }
  async archiveTemplate(ctx: WorkflowActor, id: string, input: unknown) {
    const { expectedRevision } = revisionSchema.parse(input);
    const row = await this.templateRow(ctx, id, "publish");
    const authority = this.authorizationFence(ctx);
    const result = await this.env.DB.prepare(
      `UPDATE document_templates SET state='archived',revision=revision+1,updated_at=? WHERE organization_id=? AND id=? AND revision=? AND deleted_at IS NULL AND ${authority.condition}`,
    )
      .bind(
        now(),
        ctx.organizationId,
        id,
        expectedRevision,
        ...authority.values,
      )
      .run();
    if (!result.meta.changes) fail("REVISION_CONFLICT", "Le modèle a changé.");
    return this.templateView(ctx, {
      ...row,
      state: "archived",
      revision: row.revision + 1,
      updated_at: now(),
    });
  }
  async deleteTemplate(ctx: WorkflowActor, id: string, input: unknown) {
    await this.authorize(ctx, true);
    const { expectedRevision } = revisionSchema.parse(input);
    const row = await this.templateRow(ctx, id, "read");
    if (row.owner_id !== ctx.userId)
      fail("FORBIDDEN", "Seul le propriétaire peut supprimer ce modèle.", 403);
    if (row.revision !== expectedRevision)
      fail("REVISION_CONFLICT", "Le modèle a changé.");
    const authority = this.authorizationFence(ctx);
    const time = now();
    const result = await this.env.DB.prepare(
      `UPDATE document_templates SET state='archived',deleted_at=?,revision=revision+1,updated_at=? WHERE organization_id=? AND id=? AND owner_id=? AND revision=? AND deleted_at IS NULL AND ${authority.condition}`,
    )
      .bind(
        time,
        time,
        ctx.organizationId,
        id,
        ctx.userId,
        expectedRevision,
        ...authority.values,
      )
      .run();
    if (!result.meta.changes) {
      await this.authorize(ctx, true);
      fail("REVISION_CONFLICT", "Le modèle a changé.");
    }
    return { id, deleted: true as const };
  }
  async shareTemplate(ctx: WorkflowActor, id: string, input: unknown) {
    const value = templateShareSchema.parse(input);
    const row = await this.templateRow(ctx, id, "share");
    if (row.revision !== value.expectedRevision)
      fail("REVISION_CONFLICT", "Le modèle a changé.");
    if (new Set(value.grants.map((g) => g.userId)).size !== value.grants.length)
      fail("DUPLICATE_PERMISSION", "Un membre apparaît plusieurs fois.");
    for (const grant of value.grants) {
      if (
        !(await this.env.DB.prepare(
          "SELECT 1 FROM memberships WHERE organization_id=? AND user_id=?",
        )
          .bind(ctx.organizationId, grant.userId)
          .first())
      )
        fail(
          "MEMBER_NOT_FOUND",
          "Un membre n’appartient pas à cette organisation.",
          404,
        );
    }
    // The revision fence is repeated on every statement; an old sharing request cannot erase fresh permissions.
    const authority = this.authorizationFence(ctx);
    const fence = `EXISTS(SELECT 1 FROM document_templates WHERE organization_id=? AND id=? AND revision=? AND deleted_at IS NULL) AND ${authority.condition}`;
    const values = [
      ctx.organizationId,
      id,
      value.expectedRevision,
      ...authority.values,
    ];
    const statements = [
      this.env.DB.prepare(
        `DELETE FROM template_permissions WHERE organization_id=? AND template_id=? AND ${fence}`,
      ).bind(ctx.organizationId, id, ...values),
      ...value.grants.map((g) =>
        this.env.DB.prepare(
          `INSERT INTO template_permissions(organization_id,template_id,user_id,can_use,can_edit,can_publish,can_share) SELECT ?,?,?,?,?,?,? WHERE ${fence}`,
        ).bind(
          ctx.organizationId,
          id,
          g.userId,
          Number(g.use),
          Number(g.edit),
          Number(g.publish),
          Number(g.share),
          ...values,
        ),
      ),
      this.env.DB.prepare(
        `UPDATE document_templates SET visibility=?,revision=revision+1,updated_at=? WHERE organization_id=? AND id=? AND revision=? AND deleted_at IS NULL AND ${authority.condition}`,
      ).bind(value.visibility, now(), ...values),
    ];
    const results = await this.env.DB.batch(statements);
    if (!results.at(-1)?.meta.changes)
      fail("REVISION_CONFLICT", "Le partage a changé.");
    return this.templateView(ctx, {
      ...row,
      visibility: value.visibility,
      revision: row.revision + 1,
      updated_at: now(),
    });
  }
  private async version(ctx: WorkflowActor, id: string, version: number) {
    const result = await this.env.DB.prepare(
      "SELECT envelope_json,sha256 FROM template_versions WHERE organization_id=? AND template_id=? AND version=?",
    )
      .bind(ctx.organizationId, id, version)
      .first<{ envelope_json: string; sha256: string }>();
    if (!result)
      fail("TEMPLATE_VERSION_NOT_FOUND", "Version publiée introuvable.", 404);
    return {
      envelope: parseJson<TemplateEnvelope>(result!.envelope_json),
      hash: result!.sha256,
    };
  }
  private datasetView(row: DatasetRow): DatasetView {
    return {
      id: row.id,
      name: row.name,
      format: row.format,
      sha256: row.sha256,
      size: row.size,
      status: row.status,
      errorCode: row.error_code,
      structureHash: row.structure_hash,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      analysis: {
        attempts: row.analysis_attempts,
        maxAttempts: 3,
        running: Boolean(
          row.analysis_lease_until && row.analysis_lease_until > now(),
        ),
        canRetry:
          row.status === "quarantined" &&
          row.expires_at > now() &&
          row.analysis_attempts < 3 &&
          (!row.analysis_lease_until || row.analysis_lease_until <= now()),
        retryAfterSeconds: row.analysis_lease_until
          ? Math.max(
              0,
              Math.ceil(
                (Date.parse(row.analysis_lease_until) - Date.now()) / 1000,
              ),
            )
          : 0,
      },
    };
  }
  private async datasetRow(ctx: WorkflowActor, id: string) {
    await this.authorize(ctx);
    const row = await this.env.DB.prepare(
      "SELECT * FROM workflow_datasets WHERE organization_id=? AND id=? AND owner_id=?",
    )
      .bind(ctx.organizationId, id, ctx.userId)
      .first<DatasetRow>();
    if (!row) fail("DATASET_NOT_FOUND", "Source privée introuvable.", 404);
    return row!;
  }
  async listDatasets(
    ctx: WorkflowActor,
    cursor?: string,
    limit = 30,
  ): Promise<Page<DatasetView>> {
    await this.authorize(ctx);
    limit = Math.max(1, Math.min(50, limit || 30));
    const rows = await this.env.DB.prepare(
      "SELECT * FROM workflow_datasets WHERE organization_id=? AND owner_id=? AND id>? ORDER BY id LIMIT ?",
    )
      .bind(ctx.organizationId, ctx.userId, cursor ?? "", limit + 1)
      .all<DatasetRow>();
    return {
      items: rows.results.slice(0, limit).map((r) => this.datasetView(r)),
      nextCursor:
        rows.results.length > limit ? rows.results[limit - 1].id : null,
    };
  }
  async getDataset(ctx: WorkflowActor, id: string) {
    return this.datasetView(await this.datasetRow(ctx, id));
  }
  async importDataset(
    ctx: WorkflowActor,
    input: {
      name: string;
      format: DatasetFormat;
      bytes: Uint8Array;
      encoding?: "utf-8" | "windows-1252";
      delimiter?: "," | ";" | "\t" | "|";
      xmlRecordPath?: string;
    },
  ) {
    await this.authorize(ctx, true);
    z.enum(["csv", "xlsx", "json", "xml"]).parse(input.format);
    XmlRecordPathSchema.optional().parse(input.xmlRecordPath);
    if (!input.bytes.length || input.bytes.length > DATASET_LIMITS.sourceBytes)
      fail("DATASET_SIZE", "Fichier vide ou supérieur à 5 Mio.", 413);
    const id = uid("data"),
      hash = await sha256(input.bytes),
      storageKey = `${ctx.organizationId}/workflow/datasets/${id}/source`,
      time = now();
    const count = await this.env.DB.prepare(
      "SELECT count(*) AS n FROM workflow_datasets WHERE organization_id=? AND status<>'purged'",
    )
      .bind(ctx.organizationId)
      .first<{ n: number }>();
    if ((count?.n ?? 0) >= WORKFLOW_LIMITS.datasetsPerOrganization)
      fail("DATASET_QUOTA", "Limite de sources conservées atteinte.", 429);
    await this.env.DOCUMENTS.put(storageKey, input.bytes, {
      onlyIf: { etagDoesNotMatch: "*" },
      customMetadata: { sha256: hash },
    });
    const inserted = await this.env.DB.prepare(
      "INSERT INTO workflow_datasets(id,organization_id,owner_id,name,format,sha256,size,storage_key,status,created_at,expires_at,parsing_options_json,analysis_attempts) SELECT ?,?,?,?,?,?,?,?,'quarantined',?,?,?,0 WHERE (SELECT count(*) FROM workflow_datasets WHERE organization_id=? AND status<>'purged')<?",
    )
      .bind(
        id,
        ctx.organizationId,
        ctx.userId,
        input.name.slice(0, 180),
        input.format,
        hash,
        input.bytes.length,
        storageKey,
        time,
        new Date(
          Date.now() + WORKFLOW_LIMITS.datasetRetentionDays * 86400000,
        ).toISOString(),
        canonicalJson({
          encoding: input.encoding,
          delimiter: input.delimiter,
          xmlRecordPath: input.xmlRecordPath,
        }),
        ctx.organizationId,
        WORKFLOW_LIMITS.datasetsPerOrganization,
      )
      .run();
    if (!inserted.meta.changes) {
      await this.env.DOCUMENTS.delete(storageKey);
      fail("DATASET_QUOTA", "Limite de sources conservées atteinte.", 429);
    }
    return this.retryDatasetAnalysis(ctx, id);
  }
  async retryDatasetAnalysis(ctx: WorkflowActor, id: string) {
    await this.authorize(ctx, true);
    const source = await this.datasetRow(ctx, id);
    if (source.status === "ready") return this.datasetView(source);
    if (source.status !== "quarantined" || source.expires_at <= now())
      fail(
        "DATASET_RETRY_UNAVAILABLE",
        "Cette source n’est plus disponible pour une analyse. Importez un fichier corrigé.",
        409,
      );
    if (source.analysis_lease_until && source.analysis_lease_until > now())
      return this.datasetView(source);
    if (source.analysis_attempts >= 3)
      fail(
        "DATASET_RETRY_EXHAUSTED",
        "Les trois tentatives ont échoué. Corrigez la cause puis importez à nouveau le fichier.",
        429,
      );
    const token = uid("analysis"),
      until = new Date(Date.now() + 90_000).toISOString();
    const claim = await this.env.DB.prepare(
      "UPDATE workflow_datasets SET analysis_attempts=analysis_attempts+1,analysis_lease_token=?,analysis_lease_until=? WHERE organization_id=? AND owner_id=? AND id=? AND status='quarantined' AND expires_at>? AND analysis_attempts<3 AND (analysis_lease_until IS NULL OR analysis_lease_until<=?)",
    )
      .bind(token, until, ctx.organizationId, ctx.userId, id, now(), now())
      .run();
    if (!claim.meta.changes) return this.getDataset(ctx, id);
    try {
      const original = await this.env.DOCUMENTS.get(source.storage_key);
      if (!original)
        fail("SOURCE_EXPIRED", "L’original conservé a expiré.", 410);
      const bytes = await readLimited(
        new Response(original.body),
        DATASET_LIMITS.sourceBytes,
      );
      if (
        bytes.length !== source.size ||
        (await sha256(bytes)) !== source.sha256
      )
        fail(
          "SOURCE_INTEGRITY_MISMATCH",
          "L’empreinte de l’original ne correspond plus.",
          422,
        );
      await this.scanSource(bytes, source.sha256);
      const options = z
        .object({
          encoding: z.enum(["utf-8", "windows-1252"]).optional(),
          delimiter: z.enum([",", ";", "\t", "|"]).optional(),
          xmlRecordPath: XmlRecordPathSchema.optional(),
        })
        .strict()
        .parse(parseJson(source.parsing_options_json));
      const profile = await profileDataset(bytes, source.format, options);
      const profileJson = canonicalJson(profile);
      const profileKey = `${ctx.organizationId}/workflow/datasets/${id}/profile-${await sha256(profileJson)}.json`;
      const structureHash = await this.structureHash(profile);
      await this.env.DOCUMENTS.put(profileKey, profileJson, {
        onlyIf: { etagDoesNotMatch: "*" },
        httpMetadata: { contentType: "application/json" },
      });
      await this.authorize(ctx, true);
      await this.env.DB.prepare(
        "UPDATE workflow_datasets SET profile_key=?,structure_hash=?,status='ready',error_code=NULL,analysis_lease_token=NULL,analysis_lease_until=NULL WHERE organization_id=? AND owner_id=? AND id=? AND status='quarantined' AND expires_at>? AND analysis_lease_token=? AND analysis_lease_until>?",
      )
        .bind(
          profileKey,
          structureHash,
          ctx.organizationId,
          ctx.userId,
          id,
          now(),
          token,
          now(),
        )
        .run();
    } catch (error) {
      const code =
        error instanceof Error && "code" in error
          ? String(error.code)
          : "DATASET_PARSE_FAILED";
      await this.env.DB.prepare(
        "UPDATE workflow_datasets SET status=?,error_code=?,analysis_lease_token=NULL,analysis_lease_until=NULL WHERE organization_id=? AND id=? AND status='quarantined' AND analysis_lease_token=?",
      )
        .bind(
          ["SOURCE_SCAN_REJECTED", "SOURCE_INTEGRITY_MISMATCH"].includes(code)
            ? "rejected"
            : "quarantined",
          code,
          ctx.organizationId,
          id,
          token,
        )
        .run();
    }
    return this.getDataset(ctx, id);
  }
  private async scanSource(bytes: Uint8Array, hash: string) {
    if (this.env.ENVIRONMENT === "local" && this.env.MODE === "simulation")
      return;
    if (!this.env.SCANNER)
      fail(
        "SOURCE_SCAN_REQUIRED",
        "La source reste en quarantaine : analyse antivirus indisponible.",
        503,
      );
    const response = await this.env.SCANNER!.fetch(
      new Request("https://scanner.internal/scan-source", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: bytes as Uint8Array<ArrayBuffer>,
        signal: AbortSignal.timeout(30000),
      }),
    );
    if (!response.ok)
      fail(
        "SOURCE_SCAN_UNAVAILABLE",
        "L’analyse de la source n’a pas abouti.",
        503,
      );
    const result = (await response.json()) as {
      sha256?: string;
      verdict?: string;
    };
    if (result.sha256 !== hash || result.verdict !== "clean")
      fail(
        "SOURCE_SCAN_REJECTED",
        "La source n’a pas passé les contrôles de sécurité.",
        422,
      );
  }
  private async structureHash(profile: DatasetProfile) {
    return sha256(datasetStructureSignature(profile));
  }
  async getDatasetProfile(ctx: WorkflowActor, id: string) {
    const row = await this.datasetRow(ctx, id);
    if (row.status !== "ready" || !row.profile_key)
      fail(
        "DATASET_NOT_READY",
        "La source doit être vérifiée et analysée.",
        423,
      );
    const object = await this.env.DOCUMENTS.get(row.profile_key!);
    if (!object) fail("SOURCE_EXPIRED", "La source a expiré.", 410);
    return {
      dataset: this.datasetView(row),
      profile: parseJson<DatasetProfile>(await object!.text()),
    };
  }
  async datasetProfilePage(
    ctx: WorkflowActor,
    id: string,
    sheetName?: string,
    cursor = 0,
    limit = 30,
  ) {
    const result = await this.getDatasetProfile(ctx, id);
    const selected = sheetName ?? result.profile.sheets[0]?.name;
    if (!result.profile.sheets.some((s) => s.name === selected))
      fail("SHEET_NOT_FOUND", "Feuille introuvable.", 404);
    cursor = z.number().int().min(0).max(5000).parse(cursor);
    limit = z.number().int().min(1).max(50).parse(limit);
    const sheet = result.profile.sheets.find((s) => s.name === selected)!;
    return {
      ...result,
      profile: {
        ...result.profile,
        sheets: result.profile.sheets.map((s) => ({
          ...s,
          rows: (s.name === selected
            ? s.rows.slice(cursor, cursor + limit)
            : s.rows
                .filter(
                  (r) =>
                    s.headerCandidates.includes(r.rowNumber) ||
                    r.rowNumber <= (s.headerCandidates[0] ?? 1) + 2,
                )
                .slice(0, 5)
          ).map((r) => ({
            ...r,
            cells: r.cells.map((cell) => ({
              ...cell,
              raw: cell.raw === null ? null : cell.raw.slice(0, 256),
            })),
          })),
        })),
      },
      pagination: {
        sheet: selected,
        cursor,
        limit,
        totalRows: sheet.rows.length,
        nextCursor: cursor + limit < sheet.rows.length ? cursor + limit : null,
        sampleValuesTruncatedAt: 256,
        otherSheetsAreHeaderSamples: true,
      },
    };
  }
  async importDatasetFile(
    ctx: WorkflowActor,
    input: {
      file: {
        download_url: string;
        file_id: string;
        file_name?: string;
        mime_type?: string;
      };
      format: DatasetFormat;
      xmlRecordPath?: string;
    },
  ) {
    await this.authorize(ctx, true);
    if (!["staging", "production"].includes(this.env.ENVIRONMENT))
      fail(
        "SOURCE_NOT_ALLOWED",
        "En local, utilisez le téléversement authentifié.",
        422,
      );
    const url = permittedImportUrl(input.file.download_url);
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok || response.redirected)
      fail(
        "SOURCE_DOWNLOAD_FAILED",
        "Joignez de nouveau le fichier avec un lien direct HTTPS.",
        422,
      );
    const bytes = await readLimited(response, DATASET_LIMITS.sourceBytes);
    return this.importDataset(ctx, {
      name: input.file.file_name ?? `source.${input.format}`,
      format: input.format,
      xmlRecordPath: input.xmlRecordPath,
      bytes,
    });
  }
  private mappingView(row: MappingRow): MappingView {
    return {
      id: row.id,
      version: row.version,
      name: row.name,
      sourceDatasetId: row.source_dataset_id,
      structureHash: row.structure_hash,
      plan: parseJson(row.plan_json),
      state: row.state,
      validation: row.validation_json ? parseJson(row.validation_json) : null,
      createdAt: row.created_at,
    };
  }
  private async mappingRow(ctx: WorkflowActor, id: string, version?: number) {
    await this.authorize(ctx);
    const row = await this.env.DB.prepare(
      `SELECT * FROM workflow_mappings WHERE organization_id=? AND owner_id=? AND id=? ${version ? "AND version=?" : ""} ORDER BY version DESC LIMIT 1`,
    )
      .bind(ctx.organizationId, ctx.userId, id, ...(version ? [version] : []))
      .first<MappingRow>();
    if (!row) fail("MAPPING_NOT_FOUND", "Mapping privé introuvable.", 404);
    return row!;
  }
  async getMapping(ctx: WorkflowActor, id: string, version?: number) {
    return this.mappingView(await this.mappingRow(ctx, id, version));
  }
  async listMappings(ctx: WorkflowActor, cursor?: string, limit = 30) {
    await this.authorize(ctx);
    limit = Math.max(1, Math.min(50, limit || 30));
    const rows = await this.env.DB.prepare(
      "SELECT m.* FROM workflow_mappings m WHERE m.organization_id=? AND m.owner_id=? AND m.id>? AND m.version=(SELECT max(v.version) FROM workflow_mappings v WHERE v.organization_id=m.organization_id AND v.id=m.id) ORDER BY m.id LIMIT ?",
    )
      .bind(ctx.organizationId, ctx.userId, cursor ?? "", limit + 1)
      .all<MappingRow>();
    return {
      items: rows.results.slice(0, limit).map((row) => this.mappingView(row)),
      nextCursor:
        rows.results.length > limit ? rows.results[limit - 1].id : null,
    };
  }
  async getAiPolicy(ctx: WorkflowActor) {
    await this.authorize(ctx);
    const row = await this.env.DB.prepare(
      "SELECT enabled,transfer_approved,daily_limit FROM workflow_ai_policy WHERE organization_id=?",
    )
      .bind(ctx.organizationId)
      .first<{
        enabled: number;
        transfer_approved: number;
        daily_limit: number;
      }>();
    const usage = await this.env.DB.prepare(
      "SELECT calls FROM workflow_ai_usage WHERE organization_id=? AND day=?",
    )
      .bind(ctx.organizationId, now().slice(0, 10))
      .first<{ calls: number }>();
    return {
      enabled: Boolean(row?.enabled),
      transferApproved: Boolean(row?.transfer_approved),
      dailyLimit: row?.daily_limit ?? 10,
      usedToday: usage?.calls ?? 0,
      configured: Boolean(
        this.env.DATASET_OPENAI_API_KEY && this.env.DATASET_OPENAI_MODEL,
      ),
      provider: "openai",
      model: this.env.DATASET_OPENAI_MODEL ?? null,
      retention: "OpenAI direct API, store:false; no AI Gateway configured",
      realProviderQualified: false,
    };
  }
  async setAiPolicy(ctx: WorkflowActor, input: unknown) {
    await this.authorize(ctx, true);
    if (ctx.actor !== "browser" || ctx.role !== "admin")
      fail(
        "HUMAN_ADMIN_REQUIRED",
        "Le transfert IA doit être configuré par un administrateur dans le navigateur.",
        403,
      );
    const value = z
      .object({
        enabled: z.boolean(),
        transferApproved: z.boolean(),
        dailyLimit: z.number().int().min(0).max(100),
      })
      .strict()
      .parse(input);
    await this.env.DB.prepare(
      "INSERT INTO workflow_ai_policy(organization_id,enabled,transfer_approved,daily_limit,updated_by,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(organization_id) DO UPDATE SET enabled=excluded.enabled,transfer_approved=excluded.transfer_approved,daily_limit=excluded.daily_limit,updated_by=excluded.updated_by,updated_at=excluded.updated_at",
    )
      .bind(
        ctx.organizationId,
        Number(value.enabled),
        Number(value.transferApproved),
        value.dailyLimit,
        ctx.userId,
        now(),
      )
      .run();
    return this.getAiPolicy(ctx);
  }
  async analyzeDataset(ctx: WorkflowActor, id: string, input: unknown) {
    await this.authorize(ctx, true);
    const value = datasetAnalyzeSchema.parse(input);
    const policy = await this.getAiPolicy(ctx);
    if (!policy.configured)
      fail(
        "AI_NOT_CONFIGURED",
        "L’analyse IA est indisponible ; le mapping manuel reste disponible.",
        503,
      );
    if (!policy.enabled || !policy.transferApproved)
      fail(
        "AI_TRANSFER_NOT_AUTHORIZED",
        "Un administrateur doit autoriser ce transfert dans les réglages.",
        403,
      );
    const { profile } = await this.getDatasetProfile(ctx, id);
    const day = now().slice(0, 10);
    const result = await this.env.DB.prepare(
      "INSERT INTO workflow_ai_usage(organization_id,day,calls) SELECT ?,?,1 WHERE EXISTS(SELECT 1 FROM workflow_ai_policy WHERE organization_id=? AND enabled=1 AND transfer_approved=1 AND daily_limit>0) ON CONFLICT(organization_id,day) DO UPDATE SET calls=calls+1 WHERE calls<(SELECT daily_limit FROM workflow_ai_policy WHERE organization_id=? AND enabled=1 AND transfer_approved=1)",
    )
      .bind(ctx.organizationId, day, ctx.organizationId, ctx.organizationId)
      .run();
    if (!result.meta.changes)
      fail(
        "AI_BUDGET_EXHAUSTED",
        "Le budget quotidien d’analyse IA est épuisé.",
        429,
      );
    await this.authorize(ctx, true);
    const suggest = value.proposeSchema
      ? suggestDatasetSchemaWithOpenAI
      : suggestMappingWithOpenAI;
    const suggestion = await suggest(
      profile,
      {
        apiKey: this.env.DATASET_OPENAI_API_KEY,
        model: this.env.DATASET_OPENAI_MODEL,
        organizationConsent: true,
        remainingCalls: 1,
      },
      value.instruction,
    );
    await this.authorize(ctx, true);
    // Consent may be revoked while inference is running. Never adopt anything implicitly.
    const currentPolicy = await this.getAiPolicy(ctx);
    if (!currentPolicy.enabled || !currentPolicy.transferApproved)
      fail(
        "AI_TRANSFER_NOT_AUTHORIZED",
        "Le transfert IA a été désactivé pendant l’analyse.",
        403,
      );
    return {
      ...suggestion,
      validation: {
        status: suggestion.validation.status,
        issues: suggestion.validation.issues,
        documentCount: suggestion.validation.documentCount,
        examples: suggestion.validation.records.slice(0, 3),
      },
    };
  }
  async suggestTemplate(ctx: WorkflowActor, id: string, input: unknown) {
    await this.authorize(ctx, true);
    const value = z
      .object({
        expectedRevision: z.number().int().positive(),
        instruction: z.string().min(1).max(2000),
      })
      .strict()
      .parse(input);
    const row = await this.templateRow(ctx, id, "edit");
    if (row.revision !== value.expectedRevision)
      fail("REVISION_CONFLICT", "Le modèle a changé.");
    const policy = await this.getAiPolicy(ctx);
    if (!policy.configured)
      fail(
        "AI_NOT_CONFIGURED",
        "L’aide IA est indisponible ; l’éditeur manuel reste disponible.",
        503,
      );
    if (!policy.enabled || !policy.transferApproved)
      fail(
        "AI_TRANSFER_NOT_AUTHORIZED",
        "Un administrateur doit autoriser ce transfert dans les réglages.",
        403,
      );
    const day = now().slice(0, 10);
    const reserved = await this.env.DB.prepare(
      "INSERT INTO workflow_ai_usage(organization_id,day,calls) SELECT ?,?,1 WHERE EXISTS(SELECT 1 FROM workflow_ai_policy WHERE organization_id=? AND enabled=1 AND transfer_approved=1 AND daily_limit>0) ON CONFLICT(organization_id,day) DO UPDATE SET calls=calls+1 WHERE calls<(SELECT daily_limit FROM workflow_ai_policy WHERE organization_id=? AND enabled=1 AND transfer_approved=1)",
    )
      .bind(ctx.organizationId, day, ctx.organizationId, ctx.organizationId)
      .run();
    if (!reserved.meta.changes)
      fail(
        "AI_BUDGET_EXHAUSTED",
        "Le budget quotidien d’aide IA est épuisé.",
        429,
      );
    await this.authorize(ctx, true);
    const suggestion = await suggestTemplateWithOpenAI(
      parseJson<TemplateEnvelope>(row.draft_json),
      {
        apiKey: this.env.DATASET_OPENAI_API_KEY,
        model: this.env.DATASET_OPENAI_MODEL,
        organizationConsent: true,
        remainingCalls: 1,
      },
      value.instruction,
    );
    return { ...suggestion, templateId: id, expectedRevision: row.revision };
  }
  async createMapping(ctx: WorkflowActor, input: unknown) {
    await this.authorize(ctx, true);
    const value = mappingCreateSchema.parse(input),
      dataset = await this.datasetRow(ctx, value.datasetId);
    if (dataset.status !== "ready")
      fail("DATASET_NOT_READY", "La source doit être prête.");
    let version = 1;
    if (value.mappingId) {
      const old = await this.mappingRow(ctx, value.mappingId);
      if (value.expectedVersion !== old.version)
        fail("REVISION_CONFLICT", "La version du mapping a changé.");
      version = old.version + 1;
    }
    const id = value.mappingId ?? uid("map"),
      time = now();
    const created = await this.env.DB.prepare(
      "INSERT INTO workflow_mappings(id,organization_id,owner_id,version,name,source_dataset_id,structure_hash,plan_json,state,created_at) VALUES(?,?,?,?,?,?,?,?,'draft',?) ON CONFLICT(organization_id,id,version) DO NOTHING",
    )
      .bind(
        id,
        ctx.organizationId,
        ctx.userId,
        version,
        value.plan.name,
        value.datasetId,
        dataset.structure_hash,
        boundedJson(value.plan),
        time,
      )
      .run();
    if (!created.meta.changes)
      fail("REVISION_CONFLICT", "La version du mapping a changé.");
    return this.getMapping(ctx, id, version);
  }
  async validateMapping(ctx: WorkflowActor, id: string, input: unknown) {
    await this.authorize(ctx, true);
    const value = mappingValidateSchema.parse(input),
      mapping = await this.mappingRow(ctx, id, value.version),
      { profile } = await this.getDatasetProfile(ctx, value.datasetId);
    const result = validateMapping(
      profile,
      parseJson<MappingPlan>(mapping.plan_json),
    );
    const summary = {
      status: result.status,
      issues: result.issues,
      documentCount: result.documentCount,
    };
    if (mapping.state === "draft" && result.status === "ready")
      await this.env.DB.prepare(
        "UPDATE workflow_mappings SET validation_json=?,state='validated' WHERE organization_id=? AND id=? AND version=? AND state='draft'",
      )
        .bind(boundedJson(summary), ctx.organizationId, id, value.version)
        .run();
    return {
      mapping: await this.getMapping(ctx, id, value.version),
      ...summary,
      examples: result.records.slice(0, 3),
    };
  }

  async createGeneration(ctx: WorkflowActor, input: unknown, key: string) {
    await this.authorize(ctx, true);
    keySchema.parse(key);
    const value = generationInputSchema.parse(input);
    const requestHash = await sha256(boundedJson(value));
    const existing = await this.env.DB.prepare(
      "SELECT * FROM generation_jobs WHERE organization_id=? AND idempotency_key=?",
    )
      .bind(ctx.organizationId, key)
      .first<JobRow>();
    if (existing) {
      if (
        existing.owner_id !== ctx.userId ||
        existing.request_hash !== requestHash
      )
        fail(
          "IDEMPOTENCY_CONFLICT",
          "Cette clé appartient à une autre demande.",
        );
      return this.getGeneration(ctx, existing.id);
    }
    const template = await this.templateRow(ctx, value.templateId);
    if (template.state === "archived")
      fail("TEMPLATE_ARCHIVED", "Ce modèle est archivé.");
    const version = value.templateVersion ?? template.current_version;
    if (!version)
      fail(
        "TEMPLATE_NOT_PUBLISHED",
        "Publiez une version avant la génération.",
      );
    const published = await this.version(ctx, value.templateId, version!);
    let records = value.records;
    let sourceHash: string | null = null;
    const sourceProvenance = new Map<string, unknown>();
    if (value.datasetId) {
      const mapping = await this.mappingRow(
        ctx,
        value.mappingId!,
        value.mappingVersion,
      );
      if (mapping.state !== "validated")
        fail("MAPPING_REVIEW_REQUIRED", "Validez le mapping avant génération.");
      const { profile } = await this.getDatasetProfile(ctx, value.datasetId);
      sourceHash = (await this.datasetRow(ctx, value.datasetId)).sha256;
      const normalized = validateMapping(
        profile,
        parseJson<MappingPlan>(mapping.plan_json),
      );
      if (normalized.status !== "ready")
        fail(
          "MAPPING_REVIEW_REQUIRED",
          "La structure ou les données nécessitent une nouvelle validation.",
        );
      records = normalized.records.map((r) => ({
        recordId: r.recordId,
        data: r.data,
      }));
      for (const record of normalized.records)
        sourceProvenance.set(record.recordId, record.provenance);
    }
    if (!records?.length || records.length > WORKFLOW_LIMITS.recordsPerJob)
      fail("GENERATION_VOLUME", "Un lot contient de 1 à 500 documents.", 413);
    if (new Set(records!.map((r) => r.recordId)).size !== records!.length)
      fail("DUPLICATE_RECORD", "Chaque recordId doit être unique.");
    const id = uid("gen"),
      time = now();
    const inputRows = await Promise.all(
      records!.map(async (record, ordinal) => {
        const json = boundedJson(
          record.data,
          WORKFLOW_LIMITS.inputBytesPerRecord,
        );
        const rendered = prepareTemplateRender(published.envelope, record.data);
        return {
          record,
          ordinal,
          json,
          hash: await sha256(json),
          provenance: sourceProvenance.get(record.recordId) ?? {},
          renderMetadata: {
            ...rendered.metadata,
            templateHash: published.hash,
          },
        };
      }),
    );
    const inserts = [
      this.env.DB.prepare(
        "INSERT INTO generation_jobs(id,organization_id,owner_id,request_role,request_actor,authority_json,template_id,template_version,dataset_id,mapping_id,mapping_version,state,total,idempotency_key,request_hash,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,'queued',?,?,?,?,? WHERE (SELECT count(*) FROM generation_jobs WHERE organization_id=? AND state IN ('queued','running'))<? ON CONFLICT(organization_id,idempotency_key) DO NOTHING",
      ).bind(
        id,
        ctx.organizationId,
        ctx.userId,
        ctx.role,
        ctx.actor,
        ctx.authority ? canonicalJson(ctx.authority) : null,
        value.templateId,
        version,
        value.datasetId ?? null,
        value.mappingId ?? null,
        value.mappingVersion ?? null,
        records!.length,
        key,
        requestHash,
        time,
        time,
        ctx.organizationId,
        WORKFLOW_LIMITS.activeJobsPerOrganization,
      ),
      this.env.DB.prepare(
        "INSERT INTO generation_records(organization_id,job_id,record_id,ordinal,input_json,input_hash,state,created_at,updated_at) SELECT ?,?,json_extract(value,'$.recordId'),json_extract(value,'$.ordinal'),json_extract(value,'$.json'),json_extract(value,'$.hash'),'queued',?,? FROM json_each(?) WHERE EXISTS(SELECT 1 FROM generation_jobs WHERE organization_id=? AND id=?)",
      ).bind(
        ctx.organizationId,
        id,
        time,
        time,
        boundedJson(
          inputRows.map((r) => ({
            recordId: r.record.recordId,
            ordinal: r.ordinal,
            json: r.json,
            hash: r.hash,
          })),
          WORKFLOW_LIMITS.payloadBytes,
        ),
        ctx.organizationId,
        id,
      ),
      this.env.DB.prepare(
        "INSERT INTO generation_record_provenance(organization_id,job_id,record_id,source_sha256,provenance_json,render_metadata_json) SELECT ?,?,json_extract(value,'$.recordId'),?,json_extract(value,'$.provenance'),json_extract(value,'$.renderMetadata') FROM json_each(?) WHERE EXISTS(SELECT 1 FROM generation_jobs WHERE organization_id=? AND id=?)",
      ).bind(
        ctx.organizationId,
        id,
        sourceHash,
        boundedJson(
          inputRows.map((r) => ({
            recordId: r.record.recordId,
            provenance: r.provenance,
            renderMetadata: r.renderMetadata,
          })),
        ),
        ctx.organizationId,
        id,
      ),
    ];
    await this.env.DB.batch(inserts);
    const created = await this.env.DB.prepare(
      "SELECT * FROM generation_jobs WHERE organization_id=? AND idempotency_key=?",
    )
      .bind(ctx.organizationId, key)
      .first<JobRow>();
    if (!created)
      fail(
        "GENERATION_QUOTA",
        "Trois lots simultanés maximum par organisation.",
        429,
      );
    if (
      created!.request_hash !== requestHash ||
      created!.owner_id !== ctx.userId
    )
      fail("IDEMPOTENCY_CONFLICT", "Cette clé appartient à une autre demande.");
    return this.getGeneration(ctx, created!.id);
  }
  private async jobRow(ctx: WorkflowActor, id: string) {
    await this.authorize(ctx);
    const row = await this.env.DB.prepare(
      "SELECT * FROM generation_jobs WHERE organization_id=? AND id=? AND owner_id=?",
    )
      .bind(ctx.organizationId, id, ctx.userId)
      .first<JobRow>();
    if (!row) fail("GENERATION_NOT_FOUND", "Lot privé introuvable.", 404);
    return row!;
  }
  async getGeneration(
    ctx: WorkflowActor,
    id: string,
  ): Promise<GenerationJobView> {
    const row = await this.jobRow(ctx, id);
    const counts = await this.env.DB.prepare(
      "SELECT state,count(*) AS n FROM generation_records WHERE organization_id=? AND job_id=? GROUP BY state",
    )
      .bind(ctx.organizationId, id)
      .all<{ state: string; n: number }>();
    const n = (state: string) =>
      counts.results.find((c) => c.state === state)?.n ?? 0;
    return {
      id: row.id,
      templateId: row.template_id,
      templateVersion: row.template_version,
      datasetId: row.dataset_id,
      mappingId: row.mapping_id,
      mappingVersion: row.mapping_version,
      mode: "generate_only",
      state: row.state,
      total: row.total,
      generated: n("generated"),
      failed: n("failed"),
      pending: n("queued") + n("running"),
      cancelled: n("cancelled"),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
  async listGenerations(ctx: WorkflowActor, cursor?: string, limit = 30) {
    await this.authorize(ctx);
    limit = Math.max(1, Math.min(50, limit || 30));
    const rows = await this.env.DB.prepare(
      "SELECT id FROM generation_jobs WHERE organization_id=? AND owner_id=? AND id>? ORDER BY id LIMIT ?",
    )
      .bind(ctx.organizationId, ctx.userId, cursor ?? "", limit + 1)
      .all<{ id: string }>();
    return {
      items: await Promise.all(
        rows.results.slice(0, limit).map((r) => this.getGeneration(ctx, r.id)),
      ),
      nextCursor:
        rows.results.length > limit ? rows.results[limit - 1].id : null,
    };
  }
  async generationResults(
    ctx: WorkflowActor,
    id: string,
    cursor?: string,
    limit = 50,
  ): Promise<Page<GenerationResultView>> {
    await this.jobRow(ctx, id);
    limit = Math.max(1, Math.min(50, limit || 50));
    const rows = await this.env.DB.prepare(
      "SELECT r.*,d.status AS document_status FROM generation_records r LEFT JOIN documents d ON d.organization_id=r.organization_id AND d.id=r.document_id WHERE r.organization_id=? AND r.job_id=? AND r.record_id>? ORDER BY r.record_id LIMIT ?",
    )
      .bind(ctx.organizationId, id, cursor ?? "", limit + 1)
      .all<RecordRow>();
    return {
      items: rows.results.slice(0, limit).map((r) => ({
        recordId: r.record_id,
        state: r.state,
        attempts: r.attempts,
        inputHash: r.input_hash,
        documentId: r.document_id,
        documentHash: r.artifact_hash,
        documentStatus: r.document_status ?? null,
        documentUrl: r.document_id
          ? `${this.env.APP_ORIGIN}/api/documents/${r.document_id}/content`
          : null,
        errorCode: r.error_code,
      })),
      nextCursor:
        rows.results.length > limit ? rows.results[limit - 1].record_id : null,
    };
  }
  async generationProvenance(ctx: WorkflowActor, id: string, recordId: string) {
    const job = await this.jobRow(ctx, id);
    keySchema.parse(recordId);
    const row = await this.env.DB.prepare(
      "SELECT p.*,r.input_hash FROM generation_record_provenance p JOIN generation_records r ON r.organization_id=p.organization_id AND r.job_id=p.job_id AND r.record_id=p.record_id WHERE p.organization_id=? AND p.job_id=? AND p.record_id=?",
    )
      .bind(ctx.organizationId, id, recordId)
      .first<{
        source_sha256: string | null;
        provenance_json: string;
        render_metadata_json: string;
        input_hash: string;
      }>();
    if (!row) fail("GENERATION_RECORD_NOT_FOUND", "Record introuvable.", 404);
    return {
      jobId: id,
      recordId,
      templateId: job.template_id,
      templateVersion: job.template_version,
      mappingId: job.mapping_id,
      mappingVersion: job.mapping_version,
      datasetId: job.dataset_id,
      sourceHash: row!.source_sha256,
      inputHash: row!.input_hash,
      provenance: parseJson(row!.provenance_json),
      renderMetadata: parseJson(row!.render_metadata_json),
    };
  }
  async cancelGeneration(ctx: WorkflowActor, id: string) {
    await this.authorize(ctx, true);
    await this.jobRow(ctx, id);
    const time = now();
    await this.env.DB.batch([
      this.env.DB.prepare(
        "UPDATE generation_jobs SET state='cancelled',updated_at=? WHERE organization_id=? AND id=? AND state IN ('queued','running','partial','failed')",
      ).bind(time, ctx.organizationId, id),
      this.env.DB.prepare(
        "UPDATE generation_records SET state='cancelled',lease_token=NULL,lease_until=NULL,updated_at=? WHERE organization_id=? AND job_id=? AND state IN ('queued','running')",
      ).bind(time, ctx.organizationId, id),
    ]);
    return this.getGeneration(ctx, id);
  }
  async retryGeneration(ctx: WorkflowActor, id: string, recordIds: string[]) {
    await this.authorize(ctx, true);
    const job = await this.jobRow(ctx, id);
    if (job.state === "cancelled")
      fail("GENERATION_CANCELLED", "Un lot annulé ne peut pas être repris.");
    if (
      await this.env.DB.prepare(
        "SELECT 1 FROM distribution_plans WHERE organization_id=? AND job_id=?",
      )
        .bind(ctx.organizationId, id)
        .first()
    )
      fail(
        "GENERATION_FROZEN",
        "Une distribution fige ce lot ; créez un nouveau lot pour les éléments exclus.",
      );
    z.array(keySchema).min(1).max(500).parse(recordIds);
    const time = now();
    // A cancellation committed after the read above must also fence each record write.
    await this.env.DB.batch(
      recordIds.map((recordId) =>
        this.env.DB.prepare(
          "UPDATE generation_records SET state='queued',error_code=NULL,updated_at=? WHERE organization_id=? AND job_id=? AND record_id=? AND state='failed' AND attempts<3 AND EXISTS(SELECT 1 FROM generation_jobs j WHERE j.organization_id=generation_records.organization_id AND j.id=generation_records.job_id AND j.state IN ('queued','running','partial','failed')) AND NOT EXISTS(SELECT 1 FROM distribution_plans WHERE organization_id=? AND job_id=?)",
        ).bind(time, ctx.organizationId, id, recordId, ctx.organizationId, id),
      ),
    );
    await this.env.DB.prepare(
      "UPDATE generation_jobs SET state='queued',updated_at=? WHERE organization_id=? AND id=? AND state IN ('partial','failed') AND EXISTS(SELECT 1 FROM generation_records WHERE organization_id=? AND job_id=? AND state='queued')",
    )
      .bind(time, ctx.organizationId, id, ctx.organizationId, id)
      .run();
    return this.getGeneration(ctx, id);
  }
  /** Cron and mutation-triggered execution; status methods never call this. */
  async processPending(limit = 3) {
    limit = Math.max(1, Math.min(10, limit));
    const exhausted = await this.env.DB.prepare(
      "UPDATE generation_records SET state='failed',error_code='GENERATION_RETRY_EXHAUSTED',lease_token=NULL,lease_until=NULL,updated_at=? WHERE rowid IN (SELECT r.rowid FROM generation_records r JOIN generation_jobs j ON j.organization_id=r.organization_id AND j.id=r.job_id WHERE j.state IN ('queued','running') AND r.state='running' AND r.attempts>=3 AND r.lease_until<? LIMIT 25) RETURNING organization_id,job_id",
    )
      .bind(now(), now())
      .all<{ organization_id: string; job_id: string }>();
    for (const row of exhausted.results)
      await this.settleJob(row.organization_id, row.job_id);
    const rows = await this.env.DB.prepare(
      "SELECT r.* FROM generation_records r JOIN generation_jobs j ON j.organization_id=r.organization_id AND j.id=r.job_id WHERE j.state IN ('queued','running') AND (r.state='queued' OR (r.state='running' AND r.lease_until<?)) AND r.attempts<3 ORDER BY j.created_at,r.ordinal LIMIT ?",
    )
      .bind(now(), limit)
      .all<RecordRow>();
    let processed = 0;
    for (const record of rows.results) {
      await this.processRecord(record);
      processed++;
    }
    return { processed };
  }
  private async processRecord(record: RecordRow) {
    const token = crypto.randomUUID(),
      time = now(),
      lease = new Date(Date.now() + 120000).toISOString();
    const claimed = await this.env.DB.prepare(
      "UPDATE generation_records SET state='running',attempts=attempts+1,lease_token=?,lease_until=?,updated_at=? WHERE organization_id=? AND job_id=? AND record_id=? AND (state='queued' OR (state='running' AND lease_until<?)) AND attempts<3 AND EXISTS(SELECT 1 FROM generation_jobs WHERE organization_id=? AND id=? AND state IN ('queued','running')) RETURNING *",
    )
      .bind(
        token,
        lease,
        time,
        record.organization_id,
        record.job_id,
        record.record_id,
        time,
        record.organization_id,
        record.job_id,
      )
      .first<RecordRow>();
    if (!claimed) return;
    const job = await this.env.DB.prepare(
      "SELECT * FROM generation_jobs WHERE organization_id=? AND id=?",
    )
      .bind(record.organization_id, record.job_id)
      .first<JobRow>();
    if (!job) return;
    const ctx: WorkflowActor = {
      organizationId: job.organization_id,
      userId: job.owner_id,
      role: job.request_role,
      actor: job.request_actor,
      ...(job.authority_json
        ? {
            authority: parseJson<NonNullable<WorkflowActor["authority"]>>(
              job.authority_json,
            ),
          }
        : {}),
    };
    try {
      await this.authorize(ctx, true);
      const template = await this.templateRow(ctx, job.template_id);
      if (template.state === "archived")
        fail("TEMPLATE_ARCHIVED", "Le modèle a été archivé.");
      if (job.dataset_id) await this.datasetRow(ctx, job.dataset_id);
      const { envelope } = await this.version(
        ctx,
        job.template_id,
        job.template_version,
      );
      await this.env.DB.prepare(
        "UPDATE generation_jobs SET state='running',updated_at=? WHERE organization_id=? AND id=? AND state='queued'",
      )
        .bind(now(), ctx.organizationId, job.id)
        .run();
      let artifactKey = claimed.artifact_key,
        artifactHash = claimed.artifact_hash,
        bytes: Uint8Array;
      if (artifactKey) {
        const stored = await this.env.DOCUMENTS.get(artifactKey);
        if (!stored)
          fail(
            "GENERATION_ARTIFACT_MISSING",
            "L’artefact conservé est indisponible.",
          );
        bytes = new Uint8Array(await stored!.arrayBuffer());
        if ((await sha256(bytes)) !== artifactHash)
          fail(
            "GENERATION_ARTIFACT_INTEGRITY",
            "L’intégrité du PDF conservé est invalide.",
          );
      } else {
        await reserveContentBudget(this.env.DB, ctx.organizationId, 0, true);
        const request = new Request(
          "https://documents.internal/render/template",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              envelope,
              data: parseJson(claimed.input_json),
            }),
            signal: AbortSignal.timeout(45000),
          },
        );
        let response: Response;
        if (this.env.DOCUMENT_RENDERER)
          response = await this.env.DOCUMENT_RENDERER.fetch(request);
        else if (
          this.env.ENVIRONMENT === "local" &&
          this.env.MODE === "simulation" &&
          this.env.DOCUMENT_RENDERER_URL
        ) {
          const url = new URL(this.env.DOCUMENT_RENDERER_URL);
          if (!["localhost", "127.0.0.1"].includes(url.hostname))
            fail("INVALID_RENDERER", "Moteur local loopback requis.", 503);
          response = await fetch(
            new Request(new URL("/render/template", url), request),
          );
        } else
          fail(
            "RENDERER_NOT_CONFIGURED",
            "Le moteur pdfme n’est pas raccordé.",
            503,
          );
        if (!response!.ok)
          fail("TEMPLATE_RENDER_FAILED", "Le rendu du document a échoué.", 422);
        bytes = await readLimited(response!);
        artifactHash = await sha256(bytes);
        artifactKey = `${ctx.organizationId}/workflow/generations/${job.id}/${encodeURIComponent(claimed.record_id)}/${artifactHash}.pdf`;
        await this.env.DOCUMENTS.put(artifactKey, bytes, {
          onlyIf: { etagDoesNotMatch: "*" },
          customMetadata: { sha256: artifactHash },
          httpMetadata: { contentType: "application/pdf" },
        });
        await this.assertClaim(ctx, job.id, claimed.record_id, token);
        const saved = await this.env.DB.prepare(
          "UPDATE generation_records SET artifact_key=?,artifact_hash=?,updated_at=? WHERE organization_id=? AND job_id=? AND record_id=? AND lease_token=? AND state='running'",
        )
          .bind(
            artifactKey,
            artifactHash,
            now(),
            ctx.organizationId,
            job.id,
            claimed.record_id,
            token,
          )
          .run();
        if (!saved.meta.changes)
          fail("GENERATION_CANCELLED", "Le traitement a été interrompu.");
      }
      await this.assertClaim(ctx, job.id, claimed.record_id, token);
      const document = await this.documents.upload(
        ctx,
        {
          name: `${envelope.name} — ${claimed.record_id}.pdf`.slice(0, 180),
          privateToCreator: true,
          bytes,
        },
        "render",
        {
          documentId: uid("doc"),
          authority: {
            assertCurrent: () =>
              this.assertClaim(ctx, job.id, claimed.record_id, token),
            sql: () => {
              const fence = this.templateUseFence(ctx, job.template_id);
              return {
                condition: `(${fence.condition}) AND EXISTS(SELECT 1 FROM generation_records r JOIN generation_jobs j ON j.organization_id=r.organization_id AND j.id=r.job_id WHERE r.organization_id=? AND r.job_id=? AND r.record_id=? AND r.lease_token=? AND r.lease_until>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND r.state='running' AND j.state IN ('queued','running'))`,
                values: [
                  ...fence.values,
                  ctx.organizationId,
                  job.id,
                  claimed.record_id,
                  token,
                ],
              };
            },
          },
        },
      );
      await this.assertClaim(ctx, job.id, claimed.record_id, token);
      await this.env.DB.prepare(
        "UPDATE generation_records SET state='generated',document_id=?,error_code=NULL,lease_token=NULL,lease_until=NULL,updated_at=? WHERE organization_id=? AND job_id=? AND record_id=? AND lease_token=? AND state='running'",
      )
        .bind(
          document.id,
          now(),
          ctx.organizationId,
          job.id,
          claimed.record_id,
          token,
        )
        .run();
    } catch (error) {
      const code =
        error instanceof Error && "code" in error
          ? String(error.code)
          : "GENERATION_FAILED";
      await this.env.DB.prepare(
        "UPDATE generation_records SET state='failed',error_code=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE organization_id=? AND job_id=? AND record_id=? AND lease_token=? AND state='running'",
      )
        .bind(
          code,
          now(),
          record.organization_id,
          record.job_id,
          record.record_id,
          token,
        )
        .run();
    }
    await this.settleJob(record.organization_id, record.job_id);
  }
  private async assertClaim(
    ctx: WorkflowActor,
    jobId: string,
    recordId: string,
    token: string,
  ) {
    await this.authorize(ctx, true);
    const row = await this.env.DB.prepare(
      "SELECT j.template_id FROM generation_records r JOIN generation_jobs j ON j.organization_id=r.organization_id AND j.id=r.job_id WHERE r.organization_id=? AND r.job_id=? AND r.record_id=? AND r.lease_token=? AND r.lease_until>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND r.state='running' AND j.state IN ('queued','running')",
    )
      .bind(ctx.organizationId, jobId, recordId, token)
      .first<{ template_id: string }>();
    if (!row) fail("GENERATION_CANCELLED", "Ce traitement a été annulé.");
    const template = await this.templateRow(ctx, row!.template_id);
    if (template.state === "archived")
      fail("TEMPLATE_ARCHIVED", "Le modèle a été archivé.");
  }
  private async settleJob(org: string, id: string) {
    await this.env.DB.prepare(
      "UPDATE generation_jobs SET state=CASE WHEN EXISTS(SELECT 1 FROM generation_records WHERE organization_id=? AND job_id=? AND state IN ('queued','running')) THEN 'running' WHEN NOT EXISTS(SELECT 1 FROM generation_records WHERE organization_id=? AND job_id=? AND state<>'generated') THEN 'completed' WHEN EXISTS(SELECT 1 FROM generation_records WHERE organization_id=? AND job_id=? AND state='generated') THEN 'partial' ELSE 'failed' END,updated_at=? WHERE organization_id=? AND id=? AND state IN ('queued','running')",
    )
      .bind(org, id, org, id, org, id, now(), org, id)
      .run();
  }
  async prepareDistribution(ctx: WorkflowActor, input: unknown, key: string) {
    await this.authorize(ctx, true);
    keySchema.parse(key);
    const value = distributionInputSchema.parse(input),
      requestHash = await sha256(boundedJson(value));
    const prior = await this.env.DB.prepare(
      "SELECT id,owner_id,request_hash FROM distribution_plans WHERE organization_id=? AND idempotency_key=?",
    )
      .bind(ctx.organizationId, key)
      .first<{ id: string; owner_id: string; request_hash: string }>();
    if (prior) {
      if (prior.owner_id !== ctx.userId || prior.request_hash !== requestHash)
        fail(
          "IDEMPOTENCY_CONFLICT",
          "Cette clé appartient à une autre distribution.",
        );
      return this.resumeDistribution(ctx, prior.id, true);
    }
    const job = await this.jobRow(ctx, value.jobId);
    if (!["completed", "partial", "cancelled"].includes(job.state))
      fail(
        "GENERATION_NOT_FINISHED",
        "Attendez la fin ou annulez le lot avant distribution.",
      );
    if (
      new Set(value.entries.map((e) => e.entryId)).size !== value.entries.length
    )
      fail("DUPLICATE_ENTRY", "Chaque entryId doit être unique.");
    const records = await this.env.DB.prepare(
      "SELECT r.*,d.sha256 AS exact_hash,d.status AS document_status FROM generation_records r JOIN documents d ON d.organization_id=r.organization_id AND d.id=r.document_id WHERE r.organization_id=? AND r.job_id=? AND r.state='generated' AND r.record_id IN (SELECT json_extract(value,'$.recordId') FROM json_each(?))",
    )
      .bind(
        ctx.organizationId,
        job.id,
        boundedJson(value.entries.map(({ recordId }) => ({ recordId }))),
      )
      .all<RecordRow & { exact_hash: string; document_status: string }>();
    const byRecord = new Map(
      records.results.map((record) => [record.record_id, record]),
    );
    const channels = new Map<string, Set<string>>();
    const entries: DistributionEntryView[] = [];
    for (const entry of value.entries) {
      const record = byRecord.get(entry.recordId);
      if (
        !record ||
        record.document_status !== "ready" ||
        record.artifact_hash !== record.exact_hash
      )
        fail(
          "DOCUMENT_NOT_READY",
          "Un résultat sélectionné doit encore être vérifié.",
          423,
        );
      const sourceData = parseJson<Record<string, unknown>>(record.input_json);
      const rawChannel = entry.channelField
        ? getTemplateValue(sourceData, entry.channelField)
        : entry.channel;
      if (rawChannel === undefined || rawChannel === null || rawChannel === "")
        fail(
          "CHANNEL_FIELD_MISSING",
          "Le canal de distribution manque dans les données figées.",
          422,
        );
      const parsedChannel = z
        .enum(["fax", "email", "postal"])
        .safeParse(rawChannel);
      if (!parsedChannel.success)
        fail(
          "CHANNEL_FIELD_INVALID",
          "Le canal doit être exactement fax, email ou postal.",
          422,
        );
      const channel = parsedChannel.data;
      const used = channels.get(record.document_id!) ?? new Set<string>();
      used.add(channel);
      channels.set(record.document_id!, used);
      if (used.size > 1 && !value.explicitMultichannel)
        fail(
          "MULTICHANNEL_CONSENT_REQUIRED",
          "Le multicanal doit être demandé explicitement.",
        );
      const recipientFields = entry.recipientFieldsByChannel
        ? entry.recipientFieldsByChannel[channel]
        : entry.recipientFields;
      if (entry.recipientFieldsByChannel && !recipientFields)
        fail(
          "RECIPIENT_CHANNEL_MAPPING_REQUIRED",
          "Définissez les champs destinataire du canal choisi dans les données.",
          422,
        );
      const mappedRecipient = recipientFields
        ? Object.fromEntries(
            Object.entries(recipientFields).map(([field, path]) => {
              const value = getTemplateValue(sourceData, path);
              if (value === undefined || value === null)
                fail(
                  "RECIPIENT_FIELD_MISSING",
                  `Le champ destinataire ${path} manque pour ${entry.recordId}.`,
                  422,
                );
              return [field, value];
            }),
          )
        : entry.recipient!;
      const recipient = validateRecipient(channel, mappedRecipient);
      const {
        channelField: _channelField,
        recipientFieldsByChannel: _recipientFieldsByChannel,
        senderIdsByChannel: _senderIdsByChannel,
        optionsByChannel: _optionsByChannel,
        ...fixedEntry
      } = entry;
      entries.push({
        ...fixedEntry,
        channel,
        recipient,
        senderId: entry.senderIdsByChannel
          ? entry.senderIdsByChannel[channel]
          : entry.senderId,
        options: entry.optionsByChannel
          ? entry.optionsByChannel[channel]
          : entry.options,
        documentId: record!.document_id!,
        documentHash: record!.artifact_hash!,
        templateId: job.template_id,
        templateVersion: job.template_version,
        dispatchId: null,
        errorCode: null,
      });
    }
    const id = uid("dist"),
      time = now(),
      manifest = entries.map(
        ({ dispatchId: _dispatch, errorCode: _error, ...entry }) => entry,
      );
    const manifestJson = boundedJson(manifest),
      manifestHash = await sha256(manifestJson);
    await this.env.DB.batch([
      this.env.DB.prepare(
        "INSERT INTO distribution_plans(id,organization_id,owner_id,job_id,idempotency_key,request_hash,manifest_hash,manifest_json,created_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(organization_id,idempotency_key) DO NOTHING",
      ).bind(
        id,
        ctx.organizationId,
        ctx.userId,
        job.id,
        key,
        requestHash,
        manifestHash,
        manifestJson,
        time,
      ),
      this.env.DB.prepare(
        "INSERT INTO distribution_entries(organization_id,plan_id,entry_id) SELECT ?,?,json_extract(value,'$.entryId') FROM json_each(?) WHERE EXISTS(SELECT 1 FROM distribution_plans WHERE organization_id=? AND id=?)",
      ).bind(
        ctx.organizationId,
        id,
        boundedJson(entries.map(({ entryId }) => ({ entryId }))),
        ctx.organizationId,
        id,
      ),
    ]);
    const stored = await this.env.DB.prepare(
      "SELECT id,request_hash FROM distribution_plans WHERE organization_id=? AND idempotency_key=?",
    )
      .bind(ctx.organizationId, key)
      .first<{ id: string; request_hash: string }>();
    if (stored!.request_hash !== requestHash)
      fail(
        "IDEMPOTENCY_CONFLICT",
        "Cette clé appartient à une autre distribution.",
      );
    return this.resumeDistribution(ctx, stored!.id);
  }
  /** Explicit mutation only. Stable per-entry keys recover interrupted preparation. */
  async resumeDistribution(
    ctx: WorkflowActor,
    id: string,
    retryFailed = false,
  ) {
    await this.authorize(ctx, true);
    const plan = await this.getDistribution(ctx, id);
    // Existing preparation alone: no approval, reservation, postal transfer, outbox or provider call.
    for (const entry of plan.entries
      .filter(
        (entry) =>
          !entry.dispatchId &&
          !entry.postalReviewId &&
          (!entry.errorCode || retryFailed),
      )
      .sort(
        (a, b) => Number(Boolean(a.errorCode)) - Number(Boolean(b.errorCode)),
      )
      .slice(0, WORKFLOW_LIMITS.distributionPreparationsPerRequest)) {
      try {
        await this.authorize(ctx, true);
        const dispatch = await this.domain.prepareDispatch(
          ctx,
          {
            channel: entry.channel,
            recipient: entry.recipient,
            documentId: entry.documentId,
            senderId: entry.senderId,
            subject: entry.subject,
            html: entry.html,
            text: entry.text,
            options: entry.options,
            ceilingMinor: entry.ceilingMinor,
          } as PrepareInput,
          `${id}:${entry.entryId}`,
        );
        await this.env.DB.prepare(
          "UPDATE distribution_entries SET dispatch_id=?,error_code=NULL WHERE organization_id=? AND plan_id=? AND entry_id=?",
        )
          .bind(dispatch.id, ctx.organizationId, id, entry.entryId)
          .run();
      } catch (error) {
        await this.env.DB.prepare(
          "UPDATE distribution_entries SET error_code=? WHERE organization_id=? AND plan_id=? AND entry_id=?",
        )
          .bind(
            error instanceof Error && "code" in error
              ? String(error.code)
              : "PREPARATION_FAILED",
            ctx.organizationId,
            id,
            entry.entryId,
          )
          .run();
      }
    }
    return this.getDistribution(ctx, id);
  }
  /** Creates only the existing private postal analysis; consent, transfer and quote remain separate. */
  async createDistributionPostalPreflight(
    ctx: WorkflowActor,
    id: string,
    entryId: string,
    key: string,
    create: (input: PostalReviewInput, key: string) => Promise<PostalReview>,
  ): Promise<DistributionView> {
    await this.authorize(ctx, true);
    keySchema.parse(key);
    const plan = await this.getDistribution(ctx, id);
    const entry = plan.entries.find((entry) => entry.entryId === entryId);
    if (!entry || entry.channel !== "postal")
      fail("POSTAL_ENTRY_NOT_FOUND", "Entrée postale introuvable.", 404);
    if (entry.postalReviewId) return plan;
    const parsed = postalReviewInputSchema.safeParse({
      documentId: entry.documentId,
      senderId: entry.senderId,
      recipient: entry.recipient,
      options: entry.options,
      ceilingMinor: entry.ceilingMinor,
    });
    if (!parsed.success)
      fail(
        "POSTAL_PLAN_OPTIONS_REQUIRED",
        "Créez un nouveau manifeste avec un expéditeur, un plafond et les trois options d’impression explicites.",
        422,
      );
    const document = await this.domain.getDocument(ctx, entry.documentId);
    if (document.sha256 !== entry.documentHash || document.status !== "ready")
      fail("DOCUMENT_NOT_READY", "Le PDF exact doit être vérifié.", 423);
    // This deterministic key also recovers a response lost between preflight creation and association.
    const review = await create(parsed.data, `distribution:${id}:${entryId}`);
    await this.authorize(ctx, true);
    if (
      review.document.id !== entry.documentId ||
      review.document.sha256 !== entry.documentHash
    )
      fail(
        "POSTAL_DOCUMENT_MISMATCH",
        "L’analyse postale ne correspond pas au PDF figé.",
        409,
      );
    await this.env.DB.prepare(
      "INSERT INTO distribution_postal_reviews(organization_id,plan_id,entry_id,preflight_id,created_at) VALUES(?,?,?,?,?) ON CONFLICT(organization_id,plan_id,entry_id) DO NOTHING",
    )
      .bind(ctx.organizationId, id, entryId, review.id, now())
      .run();
    return this.getDistribution(ctx, id);
  }
  async getDistribution(
    ctx: WorkflowActor,
    id: string,
  ): Promise<DistributionView> {
    await this.authorize(ctx);
    const plan = await this.env.DB.prepare(
      "SELECT * FROM distribution_plans WHERE organization_id=? AND id=? AND owner_id=?",
    )
      .bind(ctx.organizationId, id, ctx.userId)
      .first<{
        id: string;
        job_id: string;
        manifest_hash: string;
        manifest_json: string;
        created_at: string;
      }>();
    if (!plan)
      fail("DISTRIBUTION_NOT_FOUND", "Distribution privée introuvable.", 404);
    const rows = await this.env.DB.prepare(
      `SELECT e.entry_id,e.dispatch_id,e.error_code,p.id AS postal_review_id,p.status AS postal_review_status,
        (SELECT q.dispatch_id FROM live_delivery_quotes q JOIN dispatches d ON d.organization_id=q.organization_id AND d.id=q.dispatch_id
         WHERE q.organization_id=p.organization_id AND q.provider_draft_id=p.provider_draft_id AND d.document_id=p.document_id
         AND json_extract(q.input_json,'$.documentSha256')=p.document_sha256 AND d.recipient_json=p.recipient_json
         AND d.sender_id=p.sender_id AND d.ceiling_minor=p.ceiling_minor ORDER BY q.created_at DESC,q.dispatch_id DESC LIMIT 1) AS postal_dispatch_id
       FROM distribution_entries e LEFT JOIN distribution_postal_reviews link ON link.organization_id=e.organization_id AND link.plan_id=e.plan_id AND link.entry_id=e.entry_id
       LEFT JOIN postal_preflights p ON p.organization_id=link.organization_id AND p.id=link.preflight_id
       WHERE e.organization_id=? AND e.plan_id=?`,
    )
      .bind(ctx.organizationId, id)
      .all<{
        entry_id: string;
        dispatch_id: string | null;
        error_code: string | null;
        postal_review_id: string | null;
        postal_review_status: string | null;
        postal_dispatch_id: string | null;
      }>();
    return {
      id: plan!.id,
      jobId: plan!.job_id,
      manifestHash: plan!.manifest_hash,
      createdAt: plan!.created_at,
      pendingCount: rows.results.filter(
        (r) => !r.dispatch_id && !r.error_code && !r.postal_review_id,
      ).length,
      errorCount: rows.results.filter(
        (r) => r.error_code && !r.postal_review_id,
      ).length,
      entries: parseJson<DistributionEntryView[]>(plan!.manifest_json).map(
        (entry) => {
          const status = rows.results.find((r) => r.entry_id === entry.entryId);
          return {
            ...entry,
            dispatchId: status?.dispatch_id ?? null,
            errorCode: status?.postal_review_id
              ? null
              : (status?.error_code ?? null),
            postalReviewId: status?.postal_review_id ?? null,
            postalReviewStatus: status?.postal_review_status ?? null,
            postalReviewUrl: status?.postal_review_id
              ? `${this.env.APP_ORIGIN}/#/app/postal/${encodeURIComponent(status.postal_review_id)}`
              : null,
            postalDispatchId: status?.postal_dispatch_id ?? null,
          };
        },
      ),
    };
  }
}
