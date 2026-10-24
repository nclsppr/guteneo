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
      authentication: z.enum([
        "account_and_fresh_strong_authentication",
        "verified_account_and_fresh_authentication",
      ]),
    })
    .strict(),
);
const success = (name: string) => ({
  description:
    "Success; recorded state, distinct from a delivered notification or proven reading.",
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
  tags: ["Secure distribution"],
  summary,
  description,
  security: [{ GuteneoOAuth: [scope] }],
  parameters,
  responses: { "200": success(name), ...errors },
});
const id = { $ref: "#/components/parameters/Id" };
const key = { $ref: "#/components/parameters/IdempotencyKey" };
spec.tags = spec.tags.filter(
  (tag: { name: string }) => tag.name !== "Secure distribution",
);
spec.tags.push({
  name: "Secure distribution",
  description:
    "Account-based sharing, a funded term, immutable policy and browser approval under the active document authentication policy. No personal vault access through OAuth.",
});
spec.paths["/api/secure-distributions"] = {
  get: operation(
    "listSecureDistributions",
    "List workspace distributions",
    "Metadata and audit for the authorized workspace only. Bounded pagination; no personal document, claim or identity association is exposed.",
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
      "Prepare a secure distribution",
      "Prepares an immutable PDF for one recipient and term. Asynchronous rendering may return preparing: query the same identifier without recreating the command. No sending or approval. The quote separates sharing, any authorized personal copy and notification. Term activation is non-refundable, including if the document is revoked. Read /api/capabilities and the current catalog; scan, service, notification and account gates remain mandatory.",
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
    "Read service terms and prices",
    "Current catalog in EUR cents excluding tax, per PDF and recipient. Notification fees are added in the exact quote. Non-refundable after activation, including after revocation. Reading the catalog does not prove service activation.",
    "dispatches:read",
    "SecureDistributionCatalog",
  ),
};
spec.paths["/api/secure-distributions/{id}"] = {
  get: operation(
    "getSecureDistribution",
    "Track a workspace distribution",
    "Returns policy, quote, status and events with provenance. Browser display does not mean complete reading; a started download does not mean saving to disk. No reliable screenshot detection or personal-copy tracking. Never recreate a distribution automatically after an uncertain outcome.",
    "dispatches:read",
    "SecureDistribution",
    [id],
  ),
};
spec.paths["/api/secure-distributions/{id}/confirm"] = {
  post: operation(
    "confirmSecureDistribution",
    "Activate after authenticated browser approval",
    "No body. Recorded browser approval under the active document authentication policy binds PDF, recipient, policy, term and cost. Neither an expert mandate nor a yes in chat replaces this evidence. Acceptance, non-refundable funding and the durable notification command are atomic. A scope does not replace current role authority. After a lost or uncertain outcome, query the same identifier and retain the logical key; no automatic new dispatch.",
    "dispatches:send",
    "SecureDistribution",
    [id, key],
  ),
};
spec.paths["/api/secure-distributions/{id}/revoke"] = {
  post: operation(
    "revokeSecureDistribution",
    "Revoke sharing without a refund",
    "No body. Current workspace permission is required. Blocks future share access, without refunding funded retention, deleting personal copies already delivered or recovering exported copies. Evidence and the source PDF remain subject to their own retention rules.",
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
