import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import {
  savedRecipientInput,
  savedRecipientMutation,
  savedRecipientDelete,
} from "../packages/contracts/src/saved-recipients";
import {
  dispatchScheduleInput,
  dispatchScheduleApproval,
  dispatchScheduleCancel,
} from "../packages/contracts/src/dispatch-schedules";
import {
  customerWebhookCreate,
  customerWebhookUpdate,
  customerWebhookRevision,
  customerWebhookRotation,
} from "../packages/contracts/src/customer-webhooks";

const path = new URL("../apps/web/public/openapi.json", import.meta.url);
const spec = JSON.parse(await readFile(path, "utf8"));
type Schema = Record<string, unknown>;
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const object = (properties: Schema, required = Object.keys(properties)) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const str = { type: "string" },
  nullable = { type: "string", nullable: true },
  int = { type: "integer", minimum: 1 };
for (const [name, value] of Object.entries({
  SavedRecipientInput: savedRecipientInput,
  SavedRecipientMutation: savedRecipientMutation,
  SavedRecipientDelete: savedRecipientDelete,
  DispatchScheduleInput: dispatchScheduleInput,
  DispatchScheduleApproval: dispatchScheduleApproval,
  DispatchScheduleCancel: dispatchScheduleCancel,
  CustomerWebhookCreate: customerWebhookCreate,
  CustomerWebhookUpdate: customerWebhookUpdate,
  CustomerWebhookRevision: customerWebhookRevision,
  CustomerWebhookRotation: customerWebhookRotation,
}))
  spec.components.schemas[name] = z.toJSONSchema(value, {
    target: "openapi-3.0",
  });
spec.components.schemas.SavedRecipient = object({
  id: str,
  label: str,
  channel: { type: "string", enum: ["fax", "email", "postal"] },
  recipient: {
    type: "object",
    additionalProperties: { oneOf: [str, { type: "array", items: str }] },
  },
  revision: int,
  createdAt: str,
  updatedAt: str,
});
spec.components.schemas.SavedRecipientPage = object({
  items: { type: "array", items: ref("SavedRecipient"), maxItems: 100 },
  nextCursor: nullable,
});
spec.components.schemas.DispatchSchedule = object({
  id: str,
  dispatchId: str,
  releaseDispatchId: nullable,
  channel: { type: "string", enum: ["fax", "email"] },
  status: {
    type: "string",
    enum: [
      "draft",
      "approved",
      "releasing",
      "released",
      "blocked",
      "cancelled",
      "unknown",
    ],
  },
  revision: int,
  snapshotHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
  executeAt: { type: "string", format: "date-time" },
  releaseUntil: { type: "string", format: "date-time" },
  maxTotalMinor: { type: "integer", minimum: 1, maximum: 1000000 },
  currency: { type: "string", enum: ["EUR"] },
  approvalKind: {
    type: "string",
    enum: ["future_browser", null],
    nullable: true,
  },
  approvedAt: nullable,
  approvedBy: nullable,
  errorCode: nullable,
  releaseEnabled: { type: "boolean" },
  canReschedule: { type: "boolean" },
  createdAt: str,
});
spec.components.schemas.DispatchSchedulePage = object({
  items: { type: "array", items: ref("DispatchSchedule"), maxItems: 100 },
  nextCursor: nullable,
});
spec.components.schemas.DispatchDetail.properties.activeSchedule = object({
  id: str,
  status: {
    type: "string",
    enum: ["draft", "approved", "releasing", "unknown"],
  },
  executeAt: { type: "string", format: "date-time" },
  maxTotalMinor: { type: "integer", minimum: 1, maximum: 1000000 },
});
spec.components.schemas.Dispatch.properties.activeSchedule =
  spec.components.schemas.DispatchDetail.properties.activeSchedule;
spec.components.schemas.DispatchScheduleCapabilities = object({
  enabled: { type: "boolean" },
  supported: {
    type: "array",
    items: { type: "string", enum: ["fax", "message_only_email"] },
  },
  unsupported: { type: "array", items: str },
  approvalKind: { type: "string", enum: ["future_browser"] },
  approvalSurface: { type: "string", enum: ["browser_only"] },
  horizonDays: { type: "integer", enum: [30] },
  releaseWindowMinutes: { type: "integer", enum: [15] },
});
spec.components.schemas.AttentionItem = object(
  {
    id: str,
    kind: {
      type: "string",
      enum: [
        "approval",
        "quote_expiring",
        "submission_unknown",
        "protected_expiring",
        "schedule_blocked",
      ],
    },
    resourceId: str,
    route: str,
    expiresAt: str,
    channel: { type: "string", enum: ["fax", "email", "postal"] },
  },
  ["id", "kind", "resourceId", "route"],
);
spec.components.schemas.AttentionQueue = object({
  items: { type: "array", items: ref("AttentionItem"), maxItems: 100 },
  nextCursor: nullable,
  observedAt: str,
});
const errors = Object.fromEntries(
  [400, 401, 403, 404, 409, 413, 429, 500, 503].map((code) => [
    code,
    { $ref: `#/components/responses/Error${code}` },
  ]),
) as Schema;
function operation(
  path: string,
  method: string,
  id: string,
  summary: string,
  description: string,
  response: Schema,
  input?: string,
  browser = false,
  key = false,
) {
  const parameters: Schema[] = [];
  if (path.includes("{id}"))
    parameters.push({ $ref: "#/components/parameters/Id" });
  if (
    method === "get" &&
    !path.includes("{id}") &&
    !path.endsWith("capabilities")
  )
    parameters.push(
      { $ref: "#/components/parameters/Cursor" },
      { $ref: "#/components/parameters/Limit" },
    );
  if (key) parameters.push({ $ref: "#/components/parameters/IdempotencyKey" });
  if (browser && method !== "get")
    parameters.push({
      in: "header",
      name: "X-CSRF-Token",
      required: true,
      schema: str,
    });
  const scope =
    method === "get"
      ? "dispatches:read"
      : path.endsWith("/cancel")
        ? "dispatches:send"
        : "dispatches:prepare";
  const item = {
    operationId: id,
    tags: ["Dispatches"],
    summary,
    description,
    security: browser ? [{ BrowserSession: [] }] : [{ GuteneoOAuth: [scope] }],
    parameters,
    ...(input
      ? {
          requestBody: {
            required: true,
            content: { "application/json": { schema: ref(input) } },
          },
        }
      : {}),
    responses: {
      [method === "post" && key ? "201" : "200"]: {
        description: "Success",
        content: { "application/json": { schema: response } },
      },
      ...errors,
    },
  };
  spec.paths[path] ??= {};
  spec.paths[path][method] = item;
}
const privacy =
  "Current tenant and preparation rights are required, including for reads; observers cannot export saved destinations. Contact edits never alter immutable dispatch snapshots. No recipient consent, spending approval or send is granted.";
operation(
  "/api/recipients",
  "get",
  "listSavedRecipients",
  "List saved recipients",
  privacy,
  ref("SavedRecipientPage"),
);
operation(
  "/api/recipients",
  "post",
  "saveRecipient",
  "Save a recipient",
  privacy +
    " Replay the same stable key after uncertainty; deleting the contact never permits the old create key to resurrect it.",
  ref("SavedRecipient"),
  "SavedRecipientInput",
  false,
  true,
);
operation(
  "/api/recipients/{id}",
  "get",
  "getSavedRecipient",
  "Read a saved recipient",
  privacy,
  ref("SavedRecipient"),
);
operation(
  "/api/recipients/{id}",
  "patch",
  "updateSavedRecipient",
  "Update a saved recipient",
  privacy + " Exact current revision is mandatory.",
  ref("SavedRecipient"),
  "SavedRecipientMutation",
);
operation(
  "/api/recipients/{id}",
  "delete",
  "deleteSavedRecipient",
  "Delete a saved recipient",
  privacy +
    " Removes contact data under the exact current revision; retained operational evidence is unchanged.",
  object({ id: str, deleted: { type: "boolean", enum: [true] } }),
  "SavedRecipientDelete",
);
const scheduling =
  "Fax and message-only email only. The immutable schedule binds exact source content, recipient, sender, options, UTC instant, fifteen-minute release window and integer EUR-cent total cap. Maximum horizon is thirty days. Preparation grants no future spending authority. Secure, protected, PDF-email and postal workflows require their existing contemporaneous review/consent gates. Default-off release requires fresh quote within cap, current source/actors/provider/funds and atomic quota/outbox acceptance. Unknown provider outcomes never authorize retry.";
operation(
  "/api/dispatch-schedules/capabilities",
  "get",
  "getDispatchScheduleCapabilities",
  "Read schedule availability",
  scheduling,
  ref("DispatchScheduleCapabilities"),
);
operation(
  "/api/dispatch-schedules",
  "get",
  "listDispatchSchedules",
  "List dispatch schedules",
  scheduling,
  ref("DispatchSchedulePage"),
);
operation(
  "/api/dispatch-schedules",
  "post",
  "prepareDispatchSchedule",
  "Prepare a future dispatch",
  scheduling,
  ref("DispatchSchedule"),
  "DispatchScheduleInput",
  false,
  true,
);
operation(
  "/api/dispatch-schedules/{id}",
  "get",
  "getDispatchSchedule",
  "Read a dispatch schedule",
  scheduling +
    " Read this same schedule after uncertainty; never bypass blocked or unknown work with replacement keys.",
  ref("DispatchSchedule"),
);
operation(
  "/api/dispatch-schedules/{id}/approve",
  "post",
  "approveFutureDispatchSpending",
  "Approve bounded future spending",
  scheduling +
    " Browser human only with current approval permission, actual unexpired browser credential, same origin and X-CSRF-Token. Separate future_browser evidence grants only this immutable bounded release; OAuth, MCP and native callers cannot approve. Runtime activation is mandatory before granting; the original prepared command becomes un-sendable immediately after approval.",
  ref("DispatchSchedule"),
  "DispatchScheduleApproval",
  true,
);
operation(
  "/api/dispatch-schedules/{id}/cancel",
  "post",
  "cancelDispatchSchedule",
  "Cancel a future dispatch",
  scheduling +
    " Only its current preparer, approver or administrator may revoke before acceptance. An accepted release follows ordinary dispatch cancellation rules.",
  ref("DispatchSchedule"),
  "DispatchScheduleCancel",
);
operation(
  "/api/attention",
  "get",
  "getAttentionQueue",
  "Read prioritized attention metadata",
  "Browser only. Queries every currently authorized operational row with stable priority/cursor pagination, independently of a first dispatch page. Returns no message, recipient, title, password, credential or signed URL. Approval suggestions grant no consent and server guards still decide each action.",
  ref("AttentionQueue"),
  undefined,
  true,
);
spec.components.schemas.CustomerWebhookEndpoint = object({
  id: str,
  name: str,
  url: { type: "string", format: "uri" },
  enabled: { type: "boolean" },
  status: { type: "string", enum: ["active", "revoked"] },
  revision: int,
  createdAt: str,
  updatedAt: str,
  overflowCount: { type: "integer", minimum: 0 },
  deliveryCounts: {
    type: "object",
    additionalProperties: { type: "integer", minimum: 0 },
  },
});
spec.components.schemas.CustomerWebhookCapabilities = object({
  configured: { type: "boolean" },
  enabled: { type: "boolean" },
  reason: nullable,
  endpointLimit: { type: "integer", enum: [5] },
  pendingLimit: { type: "integer", enum: [500] },
});
spec.components.schemas.CustomerWebhookDelivery = object({
  id: str,
  eventId: str,
  endpointRevision: int,
  dispatchId: str,
  dispatchStatus: str,
  status: {
    type: "string",
    enum: ["pending", "sending", "sent", "failed", "unknown", "superseded"],
  },
  occurredAt: str,
  finishedAt: nullable,
  responseStatus: { type: "integer", nullable: true },
  errorCode: nullable,
});
const callback =
  "Browser administrator only, current actual browser credential and tenant membership. Mutations require same origin and X-CSRF-Token. OAuth, MCP and native callers cannot manage endpoints or read signing secrets. Direct public HTTPS only, no credentials/query/fragment/custom port or redirects. Signatures bind timestamp, event ID and exact metadata-only body. Explicit default-off activation, encrypted-secret configuration and hosted strictly-public egress are independent gates. Unknown outcomes never auto-retry; pending overflow and bounded history remain visible.";
operation(
  "/api/customer-webhooks",
  "get",
  "listCustomerWebhooks",
  "List customer lifecycle callbacks",
  callback,
  object({
    items: {
      type: "array",
      items: ref("CustomerWebhookEndpoint"),
      maxItems: 100,
    },
    capabilities: ref("CustomerWebhookCapabilities"),
  }),
  undefined,
  true,
);
operation(
  "/api/customer-webhooks",
  "post",
  "createCustomerWebhook",
  "Create a paused lifecycle callback",
  callback +
    " Creation returns the signing secret once; uncertain replay returns its existing endpoint without revealing a new secret. No callback is sent by configuration.",
  object({ endpoint: ref("CustomerWebhookEndpoint"), signingSecret: str }, [
    "endpoint",
  ]),
  "CustomerWebhookCreate",
  true,
  true,
);
operation(
  "/api/customer-webhooks/{id}",
  "patch",
  "updateCustomerWebhook",
  "Update lifecycle callback settings",
  callback +
    " Requires exact revision; updating the destination supersedes pending old-revision deliveries.",
  ref("CustomerWebhookEndpoint"),
  "CustomerWebhookUpdate",
  true,
);
operation(
  "/api/customer-webhooks/{id}/revoke",
  "post",
  "revokeCustomerWebhook",
  "Revoke a lifecycle callback",
  callback +
    " Revocation removes the encrypted signing secret and supersedes uninvoked work.",
  ref("CustomerWebhookEndpoint"),
  "CustomerWebhookRevision",
  true,
);
operation(
  "/api/customer-webhooks/{id}/rotate-secret",
  "post",
  "rotateCustomerWebhookSecret",
  "Rotate a lifecycle signing secret",
  callback +
    " Rotation pauses the endpoint and returns its new signing secret once; explicit re-enablement is required.",
  object({ endpoint: ref("CustomerWebhookEndpoint"), signingSecret: str }),
  "CustomerWebhookRotation",
  true,
);
operation(
  "/api/customer-webhooks/{id}/deliveries",
  "get",
  "listCustomerWebhookDeliveries",
  "Read callback delivery metadata",
  callback,
  object({
    items: {
      type: "array",
      items: ref("CustomerWebhookDelivery"),
      maxItems: 50,
    },
    nextCursor: nullable,
  }),
  undefined,
  true,
);
await writeFile(path, JSON.stringify(spec, null, 2) + "\n");
