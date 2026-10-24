import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import {
  secureDistributionInputSchema,
  securePolicySchema,
} from "../packages/contracts/src/secure-distribution";
import { secureDistributionSchema } from "../apps/api/src/mcp";

const path = new URL("../apps/web/public/openapi.json", import.meta.url);
const spec = JSON.parse(await readFile(path, "utf8"));
type Schema = Record<string, unknown>;
function schema(
  name: string,
  value: z.ZodType,
  io: "input" | "output" = "output",
) {
  const generated = z.toJSONSchema(value, {
    target: "openapi-3.0",
    io,
  }) as Schema;
  const definitions = (generated.definitions ?? {}) as Record<string, Schema>;
  delete generated.definitions;
  const rewrite = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(rewrite)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value).map(([key, child]) => [
              key,
              key === "$ref" && typeof child === "string"
                ? child.replace(
                    "#/definitions/",
                    `#/components/schemas/${name}_`,
                  )
                : rewrite(child),
            ]),
          )
        : value;
  spec.components.schemas[name] = rewrite(generated);
  for (const [key, value] of Object.entries(definitions))
    spec.components.schemas[`${name}_${key}`] = rewrite(value);
}
schema("SecureDistributionInput", secureDistributionInputSchema, "input");
schema("SecureDistributionPolicy", securePolicySchema);
schema("SecureDistribution", secureDistributionSchema);
schema(
  "SecureDistributionPage",
  z
    .object({
      items: z.array(secureDistributionSchema),
      nextCursor: z.string().nullable(),
    })
    .strict(),
);
schema(
  "SecureDistributionCatalog",
  z
    .object({
      retention: z.array(
        z
          .object({
            days: z.number().int().positive(),
            priceMinor: z.number().int().nonnegative(),
          })
          .strict(),
      ),
      personalRetention: z.array(
        z
          .object({
            days: z.number().int().positive(),
            priceMinor: z.number().int().nonnegative(),
          })
          .strict(),
      ),
      currency: z.literal("EUR"),
      priceVersion: z.string(),
      nonRefundable: z.literal(true),
      taxBasis: z.literal("excluding_tax"),
      unit: z.literal("pdf_per_recipient"),
      limits: z
        .object({
          pdfBytes: z.number().int().positive(),
          pages: z.number().int().positive(),
          eventsPerMinute: z.number().int().positive(),
          listLimit: z.number().int().positive(),
          draftHours: z.number().int().positive(),
        })
        .strict(),
      authentication: z.literal("account_and_fresh_strong_authentication"),
    })
    .strict(),
);
const success = (name: string) => ({
  description:
    "Succès ; état enregistré, distinct d’une notification remise ou d’une lecture prouvée.",
  content: {
    "application/json": { schema: { $ref: `#/components/schemas/${name}` } },
  },
});
const errors = Object.fromEntries(
  [400, 401, 403, 404, 409, 413, 429, 500, 503].map((status) => [
    status,
    { $ref: `#/components/responses/Error${status}` },
  ]),
);
const operation = (
  operationId: string,
  summary: string,
  description: string,
  scope: string,
  name: string,
  parameters: unknown[] = [],
) => ({
  operationId,
  tags: ["Distribution sécurisée"],
  summary,
  description,
  security: [{ GuteneoOAuth: [scope] }],
  parameters,
  responses: { "200": success(name), ...errors },
});
const id = { $ref: "#/components/parameters/Id" };
const key = { $ref: "#/components/parameters/IdempotencyKey" };
spec.tags = spec.tags.filter(
  (tag: { name: string }) => tag.name !== "Distribution sécurisée",
);
spec.tags.push({
  name: "Distribution sécurisée",
  description:
    "Partage par compte, durée financée, politique immuable et approbation navigateur forte. Aucun accès au coffre personnel par OAuth.",
});
spec.paths["/api/secure-distributions"] = {
  get: operation(
    "listSecureDistributions",
    "Lister les distributions de l’atelier",
    "Métadonnées et audit de l’atelier autorisé uniquement. Pagination bornée ; aucun document personnel, claim ou association d’identité n’est exposé.",
    "dispatches:read",
    "SecureDistributionPage",
    [
      { $ref: "#/components/parameters/Cursor" },
      { $ref: "#/components/parameters/Limit" },
    ],
  ),
  post: {
    ...operation(
      "prepareSecureDistribution",
      "Préparer une distribution sécurisée",
      "Prépare un PDF immuable pour un destinataire et une durée. Le rendu asynchrone peut retourner preparing : consulter le même identifiant sans recréer la commande. Aucun envoi ni approbation. Le devis distingue partage, copie personnelle éventuellement autorisée et notification. L’activation de la durée est non remboursable même si le document est révoqué. Lire /api/capabilities et le catalogue actuel ; les gates de scan, service, notification et compte restent obligatoires.",
      "dispatches:prepare",
      "SecureDistribution",
      [key],
    ),
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/SecureDistributionInput" },
        },
      },
    },
  },
};
spec.paths["/api/secure-distributions/catalog"] = {
  get: operation(
    "getSecureDistributionCatalog",
    "Lire les durées et tarifs du service",
    "Catalogue actuel en centimes EUR hors taxes, par PDF et destinataire. Les frais de notification sont ajoutés dans le devis exact. Non remboursable après activation, même en cas de révocation. La lecture du catalogue ne prouve pas l’activation du service.",
    "dispatches:read",
    "SecureDistributionCatalog",
  ),
};
spec.paths["/api/secure-distributions/{id}"] = {
  get: operation(
    "getSecureDistribution",
    "Suivre une distribution de l’atelier",
    "Retourne politique, devis, état et événements avec provenance. Affichage navigateur ne signifie pas lecture intégrale ; téléchargement lancé ne signifie pas enregistrement sur disque. Aucune détection fiable de capture d’écran ni suivi de copie personnelle. Ne jamais recréer automatiquement une distribution après résultat incertain.",
    "dispatches:read",
    "SecureDistribution",
    [id],
  ),
};
spec.paths["/api/secure-distributions/{id}/confirm"] = {
  post: operation(
    "confirmSecureDistribution",
    "Activer après approbation navigateur forte",
    "Sans corps. Une approbation forte enregistrée dans le navigateur lie PDF, destinataire, politique, durée et coût. Un mandat expert ni un oui dans le chat ne remplace cette preuve. L’acceptation, le financement non remboursable et la commande durable de notification sont atomiques. Le scope ne remplace pas le droit actuel de rôle. Après résultat perdu ou incertain, consulter le même identifiant et conserver la clé logique ; aucune nouvelle expédition automatique.",
    "dispatches:send",
    "SecureDistribution",
    [id, key],
  ),
};
spec.paths["/api/secure-distributions/{id}/revoke"] = {
  post: operation(
    "revokeSecureDistribution",
    "Révoquer le partage sans remboursement",
    "Sans corps. Permission actuelle de l’atelier requise. Bloque les prochains accès au partage, sans remboursement de la conservation financée, sans effacement des copies personnelles déjà remises ni récupération des copies exportées. Les preuves et le PDF source restent soumis à leur conservation propre.",
    "dispatches:send",
    "SecureDistribution",
    [id],
  ),
};
spec["x-secure-distribution"] = {
  sourceScope: "local_candidate",
  recipientAccess: "single_guteneo_account_and_fresh_qualified_authentication",
  browserOnly: [
    "recipient_claim",
    "recipient_binding",
    "approval",
    "personal_documents",
    "personal_copy_deposit",
  ],
  noPersonalOAuthAuthority: true,
  nonRefundableAfterActivation: true,
};
await writeFile(path, JSON.stringify(spec, null, 2) + "\n");
