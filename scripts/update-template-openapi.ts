import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import {
  TemplateEnvelopeSchema,
  TemplatePatchSchema,
} from "../packages/contracts/src/templates";
import { MappingPlanSchema } from "../packages/contracts/src/datasets";
import {
  generationInputSchema,
  distributionInputSchema,
} from "../packages/contracts/src/template-workflow";
import { datasetAnalyzeSchema } from "../apps/api/src/template-workflow";
import { templateWorkflowScope } from "../apps/api/src/template-workflow-routes";

type Schema = Record<string, unknown>;
const path = new URL("../apps/web/public/openapi.json", import.meta.url);
const spec = JSON.parse(await readFile(path, "utf8"));
const schemas = spec.components.schemas as Record<string, Schema>;
function jsonSchema(name: string, value: z.ZodType) {
  const schema = z.toJSONSchema(value, { target: "openapi-3.0" }) as Schema;
  const definitions = (schema.definitions ?? {}) as Record<string, Schema>;
  delete schema.definitions;
  function rewrite(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(rewrite);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [
          key,
          key === "$ref" && typeof child === "string"
            ? child.replace(
                "#/definitions/",
                "#/components/schemas/" + name + "_",
              )
            : rewrite(child),
        ]),
      );
    return value;
  }
  schemas[name] = rewrite(schema) as Schema;
  for (const [id, definition] of Object.entries(definitions))
    schemas[name + "_" + id] = rewrite(definition) as Schema;
}
const ref = (name: string) => ({ $ref: "#/components/schemas/" + name });
const object = (
  properties: Schema,
  required = Object.keys(properties),
): Schema => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});
const str = { type: "string" },
  integer = { type: "integer", minimum: 0 },
  boolean = { type: "boolean" };
const nullable = (schema: Schema) => ({ ...schema, nullable: true });
const bag = { type: "object", additionalProperties: {} };
const strings = { type: "array", items: str, maxItems: 500 };
jsonSchema("TemplateEnvelope", TemplateEnvelopeSchema);
jsonSchema("TemplatePatch", TemplatePatchSchema);
jsonSchema("MappingPlan", MappingPlanSchema);
jsonSchema("DatasetAnalyze", datasetAnalyzeSchema);
jsonSchema("GenerationInput", generationInputSchema);
jsonSchema("DistributionInput", distributionInputSchema);
schemas.GenerationInput.description =
  "Supply records OR datasetId + mappingId + mappingVersion exclusively. The template version freezes on launch; generate_only sends nothing. Idempotency key is organization scoped.";
schemas.DistributionInput.description =
  "Every entry selects recipient, recipientFields OR recipientFieldsByChannel exclusively. Channel is explicit OR resolved through channelField in frozen data (fax/email/postal only). recipientFields paths resolve against the record's frozen data. Multiple channels require explicitMultichannel:true; no implicit merge.";
schemas.TemplateView = object({
  id: str,
  name: str,
  ownerId: str,
  state: { type: "string", enum: ["draft", "published", "archived"] },
  visibility: { type: "string", enum: ["private", "organization", "selected"] },
  revision: integer,
  currentVersion: nullable(integer),
  permissions: object({
    use: boolean,
    edit: boolean,
    publish: boolean,
    share: boolean,
  }),
  canDelete: boolean,
  envelope: ref("TemplateEnvelope"),
  createdAt: str,
  updatedAt: str,
});
schemas.TemplateExampleMetadata = object({
  id: str,
  name: str,
  description: str,
  sampleDataSynthetic: { type: "boolean", enum: [true] },
});
schemas.TemplateAuthoringGuide = object({
  guideVersion: integer,
  engine: str,
  engineVersion: str,
  schemaVersion: integer,
  envelopeSchema: bag,
  bindingSchema: bag,
  patchSchema: bag,
  safeGraphicProperties: strings,
  limits: bag,
  semanticRules: { type: "array", items: object({ id: str, rule: str }) },
  workflow: {
    type: "array",
    items: object({ tool: str, scope: str, purpose: str }, ["tool", "purpose"]),
  },
  rest: object({
    guide: str,
    catalog: str,
    example: str,
    create: str,
    delete: str,
  }),
  minimalEnvelope: ref("TemplateEnvelope"),
  examples: { type: "array", items: ref("TemplateExampleMetadata") },
  qualification: str,
});
(schemas.Capabilities.properties as Schema).studio = object({
  templates: object({
    engine: str,
    engineVersion: str,
    versioned: boolean,
    immutablePublishedVersions: boolean,
    visualEditor: boolean,
    ownerDeletionRetainsHistory: boolean,
    deletionTool: str,
    authoringGuide: str,
    examples: str,
    authoringTools: strings,
  }),
  datasets: object({
    formats: strings,
    privateOriginals: boolean,
    deterministicMappings: boolean,
  }),
  generation: object({
    mode: str,
    asynchronous: boolean,
    reservesSendingCredit: boolean,
    rendererConfigured: boolean,
  }),
  distribution: object({
    immutableManifest: boolean,
    createsApproval: boolean,
    sends: boolean,
    postalPreflightRequired: boolean,
  }),
  ai: object({
    configured: boolean,
    organizationOptInRequired: boolean,
    realProviderQualified: boolean,
  }),
});
schemas.DatasetView = object({
  analysis: object({
    attempts: integer,
    maxAttempts: integer,
    running: boolean,
    canRetry: boolean,
    retryAfterSeconds: integer,
  }),
  id: str,
  name: str,
  format: { type: "string", enum: ["csv", "xlsx", "json", "xml"] },
  sha256: str,
  size: integer,
  status: {
    type: "string",
    enum: ["quarantined", "ready", "rejected", "purged"],
  },
  errorCode: nullable(str),
  structureHash: nullable(str),
  createdAt: str,
  expiresAt: str,
});
schemas.MappingView = object({
  id: str,
  version: integer,
  name: str,
  sourceDatasetId: str,
  structureHash: str,
  plan: ref("MappingPlan"),
  state: { type: "string", enum: ["draft", "validated"] },
  validation: { nullable: true },
  createdAt: str,
});
schemas.GenerationJob = object({
  id: str,
  templateId: str,
  templateVersion: integer,
  datasetId: nullable(str),
  mappingId: nullable(str),
  mappingVersion: nullable(integer),
  mode: { type: "string", enum: ["generate_only"] },
  state: {
    type: "string",
    enum: ["queued", "running", "completed", "partial", "failed", "cancelled"],
  },
  total: integer,
  generated: integer,
  failed: integer,
  pending: integer,
  cancelled: integer,
  createdAt: str,
  updatedAt: str,
});
schemas.GenerationResult = object({
  recordId: str,
  state: {
    type: "string",
    enum: ["queued", "running", "generated", "failed", "cancelled"],
  },
  attempts: integer,
  inputHash: str,
  documentId: nullable(str),
  documentHash: nullable(str),
  documentStatus: nullable(str),
  documentUrl: nullable(str),
  errorCode: nullable(str),
});
const grant = object({
  userId: str,
  use: boolean,
  edit: boolean,
  publish: boolean,
  share: boolean,
});
schemas.TemplateShare = object({
  expectedRevision: integer,
  visibility: { type: "string", enum: ["private", "organization", "selected"] },
  syntheticSamplesConfirmed: { type: "boolean", enum: [true] },
  grants: { type: "array", items: grant, maxItems: 100 },
});
schemas.TemplateUpdate = object(
  {
    expectedRevision: integer,
    envelope: ref("TemplateEnvelope"),
    patch: ref("TemplatePatch"),
  },
  ["expectedRevision"],
);
schemas.TemplateUpdate.description =
  "Supply envelope OR patch. expectedRevision protects concurrent changes. Every modification opens a draft without changing published versions.";
schemas.MappingCreate = object(
  {
    datasetId: str,
    plan: ref("MappingPlan"),
    mappingId: str,
    expectedVersion: integer,
  },
  ["datasetId", "plan"],
);
schemas.MappingCreate.description =
  "Without mappingId, creates a private mapping. With mappingId and expectedVersion, creates a new immutable version.";
schemas.DatasetIssue = object(
  {
    code: str,
    severity: { type: "string", enum: ["warning", "error"] },
    message: str,
    source: object({ sheet: str, row: integer, column: integer, address: str }),
    target: str,
  },
  ["code", "severity", "message"],
);
schemas.MappingValidation = object({
  mapping: ref("MappingView"),
  status: { type: "string", enum: ["ready", "needs_review"] },
  issues: { type: "array", items: ref("DatasetIssue") },
  documentCount: integer,
  examples: { type: "array", maxItems: 3, items: bag },
});
schemas.DatasetAnalysis = object(
  {
    provider: { type: "string", enum: ["openai"] },
    status: { type: "string", enum: ["needs_review"] },
    mapping: ref("MappingPlan"),
    ambiguities: strings,
    usage: object({
      inputTokens: integer,
      outputTokens: integer,
      calls: integer,
      latencyMs: integer,
    }),
    validation: object({
      status: { type: "string", enum: ["ready", "needs_review"] },
      issues: { type: "array", items: ref("DatasetIssue") },
      documentCount: integer,
      examples: { type: "array", maxItems: 3, items: bag },
    }),
    schemaSuggestion: object({
      inputSchema: (schemas.TemplateEnvelope.properties as Schema).inputSchema,
      envelope: ref("TemplateEnvelope"),
      fields: {
        type: "array",
        maxItems: 64,
        items: object({
          path: str,
          source: str,
          sheet: str,
          type: {
            type: "string",
            enum: ["text", "integer", "decimal", "minor", "date", "boolean"],
          },
          required: boolean,
          repeated: boolean,
        }),
      },
      warnings: strings,
    }),
  },
  ["provider", "status", "mapping", "ambiguities", "usage", "validation"],
);
schemas.DatasetAnalysis.description =
  "Private proposal requiring review. schemaSuggestion appears only with proposeSchema:true: business schema and pdfme envelope with synthetic examples, without implicit creation. Data validation retains at most three private examples. Uses one AI call and the existing budget.";
schemas.DistributionView = object({
  pendingCount: integer,
  errorCount: integer,
  id: str,
  jobId: str,
  manifestHash: str,
  createdAt: str,
  entries: {
    type: "array",
    maxItems: 500,
    items: object(
      {
        entryId: str,
        recordId: str,
        channel: { type: "string", enum: ["fax", "email", "postal"] },
        recipient: bag,
        documentId: str,
        documentHash: str,
        templateId: str,
        templateVersion: integer,
        dispatchId: nullable(str),
        errorCode: nullable(str),
        postalReviewId: nullable(str),
        postalReviewStatus: nullable(str),
        postalReviewUrl: nullable(str),
        postalDispatchId: nullable(str),
      },
      [
        "entryId",
        "recordId",
        "channel",
        "recipient",
        "documentId",
        "documentHash",
        "templateId",
        "templateVersion",
        "dispatchId",
        "errorCode",
      ],
    ),
  },
});
for (const name of [
  "TemplateView",
  "DatasetView",
  "MappingView",
  "GenerationJob",
  "GenerationResult",
])
  schemas[name + "Page"] = object({
    items: { type: "array", items: ref(name) },
    nextCursor: nullable(str),
  });
const revision = object({ expectedRevision: { type: "integer", minimum: 1 } });
type Operation = {
  method: string;
  path: string;
  id: string;
  summary: string;
  input?: Schema;
  output?: Schema;
  status?: number;
  key?: boolean;
  multipart?: boolean;
  description?: string;
  page?: boolean;
};
const operations: Operation[] = [
  {
    method: "get",
    path: "/api/templates/authoring-guide",
    id: "getTemplateAuthoringGuide",
    summary: "Read the template schema and authoring rules",
    output: ref("TemplateAuthoringGuide"),
    description:
      "Authenticated read-only guide derived from current contracts. Provides semantic rules, a minimal envelope and the authoring journey without AI calls or generation.",
  },
  {
    method: "get",
    path: "/api/templates/examples",
    id: "listTemplateExamples",
    summary: "List synthetic template examples",
    output: { type: "array", items: ref("TemplateExampleMetadata") },
  },
  {
    method: "get",
    path: "/api/templates/examples/{exampleId}",
    id: "getTemplateExample",
    summary: "Read a complete synthetic envelope to adapt",
    output: object({ id: str, envelope: ref("TemplateEnvelope") }),
  },
  {
    method: "get",
    path: "/api/templates",
    id: "listTemplates",
    summary: "List accessible templates",
    output: ref("TemplateViewPage"),
    page: true,
  },
  {
    method: "post",
    path: "/api/templates",
    id: "createTemplate",
    summary: "Create an editable template",
    description:
      "Read authoring-guide for the schema and rules, or examples to adapt a fictional envelope. Creation saves a private draft without implicit generation or sending.",
    input: object({ envelope: ref("TemplateEnvelope") }),
    output: ref("TemplateView"),
    status: 201,
  },
  {
    method: "post",
    path: "/api/templates/import-docx",
    id: "importTemplateDocx",
    summary: "Import Word into editable blocks",
    input: object({ file: { type: "string", format: "binary" } }),
    output: object({
      template: ref("TemplateView"),
      warnings: { type: "array", items: object({ code: str, message: str }) },
      provenance: bag,
    }),
    multipart: true,
    status: 201,
    description:
      "DOCX only, 5 MiB. Editable extraction without Word layout fidelity; read the warnings. The private original is retained for 30 days.",
  },
  {
    method: "get",
    path: "/api/templates/{id}",
    id: "getTemplate",
    summary: "Read a template and its permissions",
    output: ref("TemplateView"),
  },
  {
    method: "delete",
    path: "/api/templates/{id}",
    id: "deleteTemplate",
    summary: "Delete a studio template while retaining its history",
    input: revision,
    output: object({ id: str, deleted: { type: "boolean", enum: [true] } }),
    description:
      "Restricted to the owner with a role other than viewer. expectedRevision protects concurrent changes. A deleted template is inaccessible and cannot be reused; historical versions, batches and PDFs are retained.",
  },
  {
    method: "patch",
    path: "/api/templates/{id}",
    id: "updateTemplate",
    summary: "Edit the draft or apply a semantic change",
    input: ref("TemplateUpdate"),
    output: ref("TemplateView"),
  },
  {
    method: "post",
    path: "/api/templates/{id}/publish",
    id: "publishTemplate",
    summary: "Freeze a published version",
    input: revision,
    output: ref("TemplateView"),
  },
  {
    method: "post",
    path: "/api/templates/{id}/duplicate",
    id: "duplicateTemplate",
    summary: "Duplicate into a private template",
    output: ref("TemplateView"),
    status: 201,
  },
  {
    method: "post",
    path: "/api/templates/{id}/share",
    id: "shareTemplate",
    summary: "Configure template permissions",
    input: ref("TemplateShare"),
    output: ref("TemplateView"),
  },
  {
    method: "get",
    path: "/api/templates/{id}/sharing",
    id: "getTemplateSharing",
    summary: "Read permissions and eligible members",
    output: object({
      members: { type: "array", items: object({ userId: str, name: str }) },
      grants: { type: "array", items: grant },
    }),
  },
  {
    method: "post",
    path: "/api/templates/{id}/archive",
    id: "archiveTemplate",
    summary: "Archive without destroying historical versions",
    input: revision,
    output: ref("TemplateView"),
  },
  {
    method: "post",
    path: "/api/templates/{id}/preview",
    id: "previewTemplate",
    summary: "Render a server preview without sending",
    input: object({ expectedRevision: integer, data: bag }),
    output: ref("Document"),
    status: 201,
  },
  {
    method: "post",
    path: "/api/templates/{id}/suggest",
    id: "suggestTemplate",
    summary: "Suggest semantic changes using configured AI",
    input: object({
      expectedRevision: integer,
      instruction: { type: "string", minLength: 1, maxLength: 2000 },
    }),
    output: object({
      provider: { type: "string", enum: ["openai"] },
      status: { type: "string", enum: ["needs_review"] },
      envelope: ref("TemplateEnvelope"),
      patches: { type: "array", items: ref("TemplatePatch") },
      galleryId: nullable(str),
      warnings: strings,
      usage: bag,
      templateId: str,
      expectedRevision: integer,
    }),
    description:
      "Explicit external call requires administrator transfer consent, configuration and quota. Returns a proposal without saving, publishing, approving or sending. Returns 503 when unconfigured.",
  },
  {
    method: "get",
    path: "/api/templates/{id}/schema",
    id: "getTemplateSchema",
    summary: "Read the business-data schema",
    output: bag,
  },
  {
    method: "get",
    path: "/api/datasets",
    id: "listDatasets",
    summary: "List private sources",
    output: ref("DatasetViewPage"),
    page: true,
  },
  {
    method: "post",
    path: "/api/datasets",
    id: "importDataset",
    summary: "Import CSV, XLSX, XML or JSON without an AI call",
    input: object({
      name: str,
      format: { type: "string", enum: ["json"] },
      data: {},
    }),
    output: ref("DatasetView"),
    status: 201,
    description:
      "JSON: {name,format:'json',data}. Multipart: binary CSV/XLSX/XML/JSON file, optional utf-8 or windows-1252 encoding and delimiter; optional xmlRecordPath (literal absolute XML record path). Limits: 5 MiB, 12 sheets, 5 000 rows, 100 000 cells; decompressed archives are bounded to 24 MiB.",
  },
  {
    method: "get",
    path: "/api/datasets/{id}",
    id: "getDataset",
    summary: "Read a private source's status",
    output: ref("DatasetView"),
  },
  {
    method: "post",
    path: "/api/datasets/{id}/retry-analysis",
    id: "retryDatasetAnalysis",
    summary: "Retry analysis of the same private original",
    input: object({}, []),
    output: ref("DatasetView"),
    description:
      "Mutation bounded to three total attempts. Same source, hash and parsing options. Reading triggers no retry; rejected results and exhausted budgets remain closed.",
  },
  {
    method: "get",
    path: "/api/datasets/{id}/profile",
    id: "getDatasetProfile",
    summary: "Read the technical profile without an AI call",
    output: object({
      dataset: ref("DatasetView"),
      profile: bag,
      pagination: object({
        sheet: str,
        cursor: integer,
        limit: integer,
        totalRows: integer,
        nextCursor: nullable(integer),
        sampleValuesTruncatedAt: integer,
        otherSheetsAreHeaderSamples: boolean,
      }),
    }),
  },
  {
    method: "post",
    path: "/api/datasets/{id}/analyze",
    id: "analyzeDataset",
    summary: "Explicitly request an AI proposal",
    input: ref("DatasetAnalyze"),
    output: ref("DatasetAnalysis"),
    description:
      "Requires a configured provider, administrator transfer policy and budget. Sends only a bounded sample directly to OpenAI. proposeSchema:true also suggests a business schema and synthetic template from the validated mapping using one AI call. Returns needs_review; adoption requires explicit template/mapping creation and separate validation/publication. Returns 503 when unavailable; never fabricates a result.",
  },
  {
    method: "get",
    path: "/api/mappings",
    id: "listMappings",
    summary: "List private mappings",
    output: ref("MappingViewPage"),
    page: true,
  },
  {
    method: "post",
    path: "/api/mappings",
    id: "createMapping",
    summary: "Create or version a mapping",
    input: ref("MappingCreate"),
    output: ref("MappingView"),
    status: 201,
  },
  {
    method: "get",
    path: "/api/mappings/{id}",
    id: "getMapping",
    summary: "Read a mapping and its version",
    output: ref("MappingView"),
  },
  {
    method: "post",
    path: "/api/mappings/{id}/validate",
    id: "validateMapping",
    summary: "Validate every row and join",
    input: object({ datasetId: str, version: integer }),
    output: ref("MappingValidation"),
  },
  {
    method: "get",
    path: "/api/generation-jobs",
    id: "listGenerationJobs",
    summary: "List private generations",
    output: ref("GenerationJobPage"),
    page: true,
  },
  {
    method: "post",
    path: "/api/generation-jobs",
    id: "createGeneration",
    summary: "Start durable generation without sending",
    input: ref("GenerationInput"),
    output: ref("GenerationJob"),
    status: 202,
    key: true,
  },
  {
    method: "get",
    path: "/api/generation-jobs/{id}",
    id: "getGeneration",
    summary: "Read progress without restarting processing",
    output: ref("GenerationJob"),
  },
  {
    method: "get",
    path: "/api/generation-jobs/{id}/results",
    id: "getGenerationResults",
    summary: "Read results by recordId",
    output: ref("GenerationResultPage"),
    page: true,
  },
  {
    method: "get",
    path: "/api/generation-jobs/{id}/provenance",
    id: "getGenerationProvenance",
    summary: "Link a record to the cells and versions that produced its PDF",
    output: object({
      jobId: str,
      recordId: str,
      templateId: str,
      templateVersion: integer,
      mappingId: nullable(str),
      mappingVersion: nullable(integer),
      datasetId: nullable(str),
      sourceHash: nullable(str),
      inputHash: str,
      provenance: bag,
      renderMetadata: bag,
    }),
    description:
      "Private to the job owner. Per-field source coordinates, source/input hashes, mapping/template/engine/adapter/font versions. Direct generation has empty cell provenance.",
  },
  {
    method: "post",
    path: "/api/generation-jobs/{id}/cancel",
    id: "cancelGeneration",
    summary: "Cancel unfinished records",
    output: ref("GenerationJob"),
  },
  {
    method: "post",
    path: "/api/generation-jobs/{id}/retry",
    id: "retryGeneration",
    summary: "Resume explicitly selected failed records",
    input: object({ recordIds: strings }),
    output: ref("GenerationJob"),
    status: 202,
  },
  {
    method: "post",
    path: "/api/distribution-plans",
    id: "prepareDistribution",
    summary: "Freeze associations and prepare existing dispatches",
    input: ref("DistributionInput"),
    output: ref("DistributionView"),
    status: 201,
    key: true,
    description:
      "No approval, reservation or provider attempt. Per-entry errors remain visible. Every later approval binds the exact quote and PDF; a plan is not consent.",
  },
  {
    method: "post",
    path: "/api/distribution-plans/{id}/resume",
    id: "resumeDistribution",
    summary: "Continue at most three preparations",
    input: object({ retryFailed: boolean }, []),
    output: ref("DistributionView"),
    description:
      "Explicit mutation bounded to three entries. Reads prepare nothing. retryFailed:true authorizes retrying preparation errors; this operation never retries provider attempts.",
  },
  {
    method: "post",
    path: "/api/distribution-plans/{id}/entries/{entryId}/postal-preflight",
    id: "createDistributionPostalPreflight",
    summary: "Open postal preflight for the frozen document and recipient",
    input: object({}, []),
    output: ref("DistributionView"),
    key: true,
    description:
      "Creates the existing postal analysis without provider document transfer, quote, consent or sending. Existing provider-profile reads may be necessary. The manifest must include an explicit sender, ceiling and postal options; otherwise create a new plan. Consent, derivation, transfers and quotes remain in the protected postal journey.",
  },
  {
    method: "get",
    path: "/api/distribution-plans/{id}",
    id: "getDistribution",
    summary: "Read the manifest and its preparations",
    output: ref("DistributionView"),
  },
];
for (const operation of operations) {
  const parameters: Schema[] = [];
  if (operation.path.includes("{exampleId}"))
    parameters.push({
      name: "exampleId",
      in: "path",
      required: true,
      schema: { type: "string", minLength: 1, maxLength: 100 },
    });
  if (operation.path.includes("{entryId}"))
    parameters.push({
      name: "entryId",
      in: "path",
      required: true,
      schema: str,
    });
  if (operation.path.includes("{id}"))
    parameters.push({ name: "id", in: "path", required: true, schema: str });
  if (operation.page)
    parameters.push(
      { name: "cursor", in: "query", schema: str },
      {
        name: "limit",
        in: "query",
        schema: { type: "integer", minimum: 1, maximum: 100, default: 30 },
      },
    );
  if (["getTemplate", "getTemplateSchema", "getMapping"].includes(operation.id))
    parameters.push({
      name: "version",
      in: "query",
      schema: { type: "integer", minimum: 1 },
    });
  if (operation.id === "getGenerationProvenance")
    parameters.push({
      name: "recordId",
      in: "query",
      required: true,
      schema: { type: "string", minLength: 1, maxLength: 200 },
    });
  if (operation.id === "getDatasetProfile")
    parameters.push(
      { name: "sheet", in: "query", schema: str },
      {
        name: "cursor",
        in: "query",
        schema: { type: "integer", minimum: 0, maximum: 5000, default: 0 },
      },
      {
        name: "limit",
        in: "query",
        schema: { type: "integer", minimum: 1, maximum: 50, default: 30 },
      },
    );
  if (operation.key)
    parameters.push({ $ref: "#/components/parameters/IdempotencyKey" });
  const response = {
    description:
      "Business result; HTTP success means neither a ready PDF nor sending.",
    content: { "application/json": { schema: operation.output ?? bag } },
  };
  const entry: Schema = {
    operationId: operation.id,
    tags: ["Document studio"],
    summary: operation.summary,
    description:
      operation.description ??
      "Tenant-scoped operation. The service rechecks membership, resource permissions and limits.",
    security: [
      {
        GuteneoOAuth:
          operation.id === "createDistributionPostalPreflight"
            ? ["documents:write", "dispatches:prepare"]
            : [
                templateWorkflowScope(
                  operation.path,
                  operation.method.toUpperCase(),
                ),
              ],
      },
    ],
    parameters,
    responses: {
      [operation.status ?? 200]: response,
      "400": { $ref: "#/components/responses/BadRequest" },
      "403": { description: "Insufficient permissions or scope." },
      "404": {
        description: "Resource not found, deleted or inaccessible.",
      },
      "409": {
        description:
          "Incompatible revision, idempotency, structure, version or state.",
      },
      "413": { description: "Size limit exceeded." },
      "429": { description: "Quota or budget exhausted." },
      "503": { description: "Engine, scanner or AI unavailable." },
    },
  };
  // Existing document uses inline errors; retain a local reusable error if absent.
  spec.components.responses ??= {};
  spec.components.responses.BadRequest ??= {
    description: "Invalid input; correct the returned fields.",
    content: { "application/json": { schema: ref("Error") } },
  };
  if (!schemas.Error)
    schemas.Error = object({ error: object({ code: str, message: str }) });
  if (operation.input)
    entry.requestBody = {
      required: true,
      content: {
        [operation.multipart ? "multipart/form-data" : "application/json"]: {
          schema: operation.input,
        },
      },
    };
  spec.paths[operation.path] ??= {};
  spec.paths[operation.path][operation.method] = entry;
}
spec.paths["/api/datasets"].post.requestBody.content["multipart/form-data"] = {
  schema: object(
    {
      file: { type: "string", format: "binary" },
      format: { type: "string", enum: ["csv", "xlsx", "json", "xml"] },
      xmlRecordPath: { type: "string", maxLength: 256 },
      encoding: { type: "string", enum: ["utf-8", "windows-1252"] },
      delimiter: { type: "string", enum: [",", ";", "\t", "|"] },
    },
    ["file"],
  ),
};
spec.tags ??= [];
if (!spec.tags.some((t: { name: string }) => t.name === "Document studio"))
  spec.tags.push({
    name: "Document studio",
    description: "Templates, data, generation and preparation remain separate.",
  });
const oauth =
  spec.components.securitySchemes.GuteneoOAuth.flows.authorizationCode.scopes;
for (const scope of [
  "templates:read",
  "templates:write",
  "templates:publish",
  "templates:share",
  "datasets:read",
  "datasets:write",
  "generations:read",
  "generations:write",
])
  oauth[scope] =
    "Dedicated " + scope + " authority; explicit OAuth grant required.";
for (const documentPath of [
  "/api/documents/{id}",
  "/api/documents/{id}/content",
]) {
  const operation = spec.paths[documentPath].get;
  operation.parameters = (operation.parameters ?? []).filter(
    (parameter: { name: string; in: string }) =>
      parameter.name !== "dispatchId" || parameter.in !== "query",
  );
  operation.parameters.push({
    name: "dispatchId",
    in: "query",
    required: false,
    schema: { type: "string", minLength: 1 },
    description:
      "Optional review context: a same-workspace request bound to this exact PDF. A different member's private PDF requires current approval permission and, for OAuth, documents:read and dispatches:read. Grants no general library access; authority is rechecked on every read.",
  });
}
await writeFile(path, JSON.stringify(spec, null, 2) + "\n");
console.log(
  "OpenAPI: " + operations.length + " studio operations synchronized.",
);
