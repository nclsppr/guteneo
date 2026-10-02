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
  "Données records OU datasetId + mappingId + mappingVersion, exclusivement. Version du modèle figée au lancement, generate_only sans envoi. Clé d’idempotence liée à l’organisation.";
schemas.DistributionInput.description =
  "Chaque entrée choisit recipient, recipientFields OU recipientFieldsByChannel exclusivement. Le canal est explicite OU résolu par channelField dans les données figées (fax/email/postal uniquement). Les chemins recipientFields sont résolus dans les données figées du record. Multicanal uniquement avec explicitMultichannel:true ; aucune fusion implicite.";
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
  "Fournir envelope OU patch. expectedRevision protège contre les modifications concurrentes. Toute modification ouvre un brouillon sans modifier les versions publiées.";
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
  "Sans mappingId, crée une correspondance privée. Avec mappingId et expectedVersion, crée une nouvelle version immuable.";
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
  "Proposition privée à revoir. schemaSuggestion n’est présent que pour proposeSchema:true : schéma métier et enveloppe pdfme à exemples synthétiques, sans création implicite. La validation des données garde au plus trois exemples privés. Un appel IA et le budget existant sont utilisés.";
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
    summary: "Lire le schéma et les règles de création des modèles",
    output: ref("TemplateAuthoringGuide"),
    description:
      "Guide authentifié en lecture seule, dérivé des contrats actuels. Fournit règles sémantiques, enveloppe minimale et parcours de création sans appel IA ni génération.",
  },
  {
    method: "get",
    path: "/api/templates/examples",
    id: "listTemplateExamples",
    summary: "Lister les exemples synthétiques de modèles",
    output: { type: "array", items: ref("TemplateExampleMetadata") },
  },
  {
    method: "get",
    path: "/api/templates/examples/{exampleId}",
    id: "getTemplateExample",
    summary: "Lire une enveloppe synthétique complète à adapter",
    output: object({ id: str, envelope: ref("TemplateEnvelope") }),
  },
  {
    method: "get",
    path: "/api/templates",
    id: "listTemplates",
    summary: "Lister les modèles accessibles",
    output: ref("TemplateViewPage"),
    page: true,
  },
  {
    method: "post",
    path: "/api/templates",
    id: "createTemplate",
    summary: "Créer un modèle rééditable",
    description:
      "Consulter authoring-guide pour le schéma et les règles, ou examples pour adapter une enveloppe fictive. La création enregistre un brouillon privé, sans génération ni envoi implicite.",
    input: object({ envelope: ref("TemplateEnvelope") }),
    output: ref("TemplateView"),
    status: 201,
  },
  {
    method: "post",
    path: "/api/templates/import-docx",
    id: "importTemplateDocx",
    summary: "Importer Word en blocs rééditables",
    input: object({ file: { type: "string", format: "binary" } }),
    output: object({
      template: ref("TemplateView"),
      warnings: { type: "array", items: object({ code: str, message: str }) },
      provenance: bag,
    }),
    multipart: true,
    status: 201,
    description:
      "DOCX seulement, 5 Mio. Extraction éditable sans fidélité de mise en page Word ; consulter les avertissements. Original privé, conservé 30 jours.",
  },
  {
    method: "get",
    path: "/api/templates/{id}",
    id: "getTemplate",
    summary: "Lire un modèle et ses droits",
    output: ref("TemplateView"),
  },
  {
    method: "delete",
    path: "/api/templates/{id}",
    id: "deleteTemplate",
    summary: "Supprimer un modèle du studio en conservant son historique",
    input: revision,
    output: object({ id: str, deleted: { type: "boolean", enum: [true] } }),
    description:
      "Réservé au propriétaire non lecteur. expectedRevision protège contre les modifications concurrentes. Le modèle supprimé n’est plus accessible ni réutilisable ; les versions, lots et PDF historiques sont conservés.",
  },
  {
    method: "patch",
    path: "/api/templates/{id}",
    id: "updateTemplate",
    summary: "Modifier le brouillon ou appliquer un changement sémantique",
    input: ref("TemplateUpdate"),
    output: ref("TemplateView"),
  },
  {
    method: "post",
    path: "/api/templates/{id}/publish",
    id: "publishTemplate",
    summary: "Figer une version publiée",
    input: revision,
    output: ref("TemplateView"),
  },
  {
    method: "post",
    path: "/api/templates/{id}/duplicate",
    id: "duplicateTemplate",
    summary: "Dupliquer dans un modèle privé",
    output: ref("TemplateView"),
    status: 201,
  },
  {
    method: "post",
    path: "/api/templates/{id}/share",
    id: "shareTemplate",
    summary: "Configurer les droits du modèle",
    input: ref("TemplateShare"),
    output: ref("TemplateView"),
  },
  {
    method: "get",
    path: "/api/templates/{id}/sharing",
    id: "getTemplateSharing",
    summary: "Lire les droits et membres éligibles",
    output: object({
      members: { type: "array", items: object({ userId: str, name: str }) },
      grants: { type: "array", items: grant },
    }),
  },
  {
    method: "post",
    path: "/api/templates/{id}/archive",
    id: "archiveTemplate",
    summary: "Archiver sans détruire les versions historiques",
    input: revision,
    output: ref("TemplateView"),
  },
  {
    method: "post",
    path: "/api/templates/{id}/preview",
    id: "previewTemplate",
    summary: "Rendre un aperçu serveur sans envoi",
    input: object({ expectedRevision: integer, data: bag }),
    output: ref("Document"),
    status: 201,
  },
  {
    method: "post",
    path: "/api/templates/{id}/suggest",
    id: "suggestTemplate",
    summary: "Proposer des modifications sémantiques avec une IA configurée",
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
      "Appel externe explicite soumis au consentement de transfert administrateur, configuration et quota. Retourne une proposition sans enregistrer, publier, approuver ou envoyer. 503 si non configuré.",
  },
  {
    method: "get",
    path: "/api/templates/{id}/schema",
    id: "getTemplateSchema",
    summary: "Lire le schéma des données métier",
    output: bag,
  },
  {
    method: "get",
    path: "/api/datasets",
    id: "listDatasets",
    summary: "Lister les sources privées",
    output: ref("DatasetViewPage"),
    page: true,
  },
  {
    method: "post",
    path: "/api/datasets",
    id: "importDataset",
    summary: "Importer CSV, XLSX, XML ou JSON sans appel IA",
    input: object({
      name: str,
      format: { type: "string", enum: ["json"] },
      data: {},
    }),
    output: ref("DatasetView"),
    status: 201,
    description:
      "JSON : {name,format:'json',data}. Multipart : file binaire CSV/XLSX/XML/JSON, encoding facultatif utf-8 ou windows-1252, delimiter facultatif ; xmlRecordPath facultatif (chemin absolu littéral des enregistrements XML). 5 Mio, 12 feuilles, 5 000 lignes, 100 000 cellules ; archives décompressées bornées à 24 Mio.",
  },
  {
    method: "get",
    path: "/api/datasets/{id}",
    id: "getDataset",
    summary: "Lire l’état d’une source privée",
    output: ref("DatasetView"),
  },
  {
    method: "post",
    path: "/api/datasets/{id}/retry-analysis",
    id: "retryDatasetAnalysis",
    summary: "Réessayer l’analyse du même original privé",
    input: object({}, []),
    output: ref("DatasetView"),
    description:
      "Mutation bornée à trois tentatives au total. Même source, hash et options de parsing. La lecture ne relance rien ; résultat rejeté ou budget épuisé restent fermés.",
  },
  {
    method: "get",
    path: "/api/datasets/{id}/profile",
    id: "getDatasetProfile",
    summary: "Lire le profil technique sans appel IA",
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
    summary: "Demander explicitement une proposition IA",
    input: ref("DatasetAnalyze"),
    output: ref("DatasetAnalysis"),
    description:
      "Requiert fournisseur configuré, politique administrateur de transfert et budget. Envoie seulement un échantillon borné à OpenAI direct. proposeSchema:true ajoute un schéma métier et un modèle synthétique proposés à partir du mapping validé, avec un seul appel IA. Retour needs_review ; adoption par création explicite du modèle et mapping puis validation/publication séparées. 503 si indisponible, jamais de faux résultat.",
  },
  {
    method: "get",
    path: "/api/mappings",
    id: "listMappings",
    summary: "Lister les correspondances privées",
    output: ref("MappingViewPage"),
    page: true,
  },
  {
    method: "post",
    path: "/api/mappings",
    id: "createMapping",
    summary: "Créer ou versionner une correspondance",
    input: ref("MappingCreate"),
    output: ref("MappingView"),
    status: 201,
  },
  {
    method: "get",
    path: "/api/mappings/{id}",
    id: "getMapping",
    summary: "Lire une correspondance et sa version",
    output: ref("MappingView"),
  },
  {
    method: "post",
    path: "/api/mappings/{id}/validate",
    id: "validateMapping",
    summary: "Valider toutes les lignes et les jointures",
    input: object({ datasetId: str, version: integer }),
    output: ref("MappingValidation"),
  },
  {
    method: "get",
    path: "/api/generation-jobs",
    id: "listGenerationJobs",
    summary: "Lister les générations privées",
    output: ref("GenerationJobPage"),
    page: true,
  },
  {
    method: "post",
    path: "/api/generation-jobs",
    id: "createGeneration",
    summary: "Lancer une génération durable sans envoi",
    input: ref("GenerationInput"),
    output: ref("GenerationJob"),
    status: 202,
    key: true,
  },
  {
    method: "get",
    path: "/api/generation-jobs/{id}",
    id: "getGeneration",
    summary: "Lire la progression sans relancer le traitement",
    output: ref("GenerationJob"),
  },
  {
    method: "get",
    path: "/api/generation-jobs/{id}/results",
    id: "getGenerationResults",
    summary: "Lire les résultats par recordId",
    output: ref("GenerationResultPage"),
    page: true,
  },
  {
    method: "get",
    path: "/api/generation-jobs/{id}/provenance",
    id: "getGenerationProvenance",
    summary: "Relier un record aux cellules et versions ayant produit son PDF",
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
      "Privé au propriétaire du job. Coordonnées source par champ, hashes source et entrée, versions du mapping, modèle, moteur, adaptateur et police. Une génération directe a une provenance de cellule vide.",
  },
  {
    method: "post",
    path: "/api/generation-jobs/{id}/cancel",
    id: "cancelGeneration",
    summary: "Annuler les records non terminés",
    output: ref("GenerationJob"),
  },
  {
    method: "post",
    path: "/api/generation-jobs/{id}/retry",
    id: "retryGeneration",
    summary: "Reprendre les records en échec explicitement désignés",
    input: object({ recordIds: strings }),
    output: ref("GenerationJob"),
    status: 202,
  },
  {
    method: "post",
    path: "/api/distribution-plans",
    id: "prepareDistribution",
    summary: "Figer les associations et préparer les envois existants",
    input: ref("DistributionInput"),
    output: ref("DistributionView"),
    status: 201,
    key: true,
    description:
      "Aucune approbation, réservation ou tentative fournisseur. Les erreurs par entrée restent visibles. Chaque approbation ultérieure porte sur le devis et le PDF exacts ; un plan ne vaut pas consentement.",
  },
  {
    method: "post",
    path: "/api/distribution-plans/{id}/resume",
    id: "resumeDistribution",
    summary: "Poursuivre trois préparations au maximum",
    input: object({ retryFailed: boolean }, []),
    output: ref("DistributionView"),
    description:
      "Mutation explicite, limitée à trois entrées. Les lectures ne préparent rien. retryFailed:true autorise la reprise des erreurs de préparation ; les tentatives fournisseur ne sont jamais relancées par cette opération.",
  },
  {
    method: "post",
    path: "/api/distribution-plans/{id}/entries/{entryId}/postal-preflight",
    id: "createDistributionPostalPreflight",
    summary: "Ouvrir le contrôle postal du document et destinataire figés",
    input: object({}, []),
    output: ref("DistributionView"),
    key: true,
    description:
      "Crée l’analyse postale existante, sans transfert du document au fournisseur, devis, consentement ou envoi. Les lectures du profil fournisseur existantes peuvent être nécessaires. Le manifeste doit inclure expéditeur, plafond et options postales explicites ; sinon nouveau plan requis. Les consentements, dérivations, transferts et devis restent dans le parcours postal protégé.",
  },
  {
    method: "get",
    path: "/api/distribution-plans/{id}",
    id: "getDistribution",
    summary: "Lire le manifeste et ses préparations",
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
      "Résultat métier ; un succès HTTP ne vaut ni PDF prêt ni envoi.",
    content: { "application/json": { schema: operation.output ?? bag } },
  };
  const entry: Schema = {
    operationId: operation.id,
    tags: ["Studio documentaire"],
    summary: operation.summary,
    description:
      operation.description ??
      "Opération tenant-scopée. Le service recontrôle l’adhésion, les droits propres à la ressource et les limites.",
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
      "403": { description: "Droits ou scope insuffisants." },
      "404": {
        description: "Ressource introuvable, supprimée ou non accessible.",
      },
      "409": {
        description:
          "Révision, idempotence, structure, version ou état incompatible.",
      },
      "413": { description: "Limite de taille dépassée." },
      "429": { description: "Quota ou budget épuisé." },
      "503": { description: "Moteur, scanner ou IA indisponible." },
    },
  };
  // Existing document uses inline errors; retain a local reusable error if absent.
  spec.components.responses ??= {};
  spec.components.responses.BadRequest ??= {
    description: "Entrée invalide ; corriger les champs retournés.",
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
if (!spec.tags.some((t: { name: string }) => t.name === "Studio documentaire"))
  spec.tags.push({
    name: "Studio documentaire",
    description: "Modèles, données, génération et préparation séparées.",
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
    "Autorisation dédiée " + scope + " ; attribution OAuth explicite requise.";
await writeFile(path, JSON.stringify(spec, null, 2) + "\n");
console.log(
  "OpenAPI : " + operations.length + " opérations du studio synchronisées.",
);
