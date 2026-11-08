import { z } from "zod";
import { canonicalJson, sha256 } from "../../../packages/domain/src/index";
import type { Env } from "./env";
import {
  accountDeletionProcessors,
  DeletionProcessorError,
  type DeletionIdentity,
} from "./account-deletion-auth0";

export type AccountDeletionEnv = Env & {
  ACCOUNT_DELETION_ENABLED?: string;
  ACCOUNT_DELETION_OPERATOR_SECRET?: string;
  AUTH0_DELETION_MANAGEMENT_TOKEN?: string;
};
const stamp = () => new Date().toISOString();
const reference = z.string().regex(/^[A-Za-z0-9_.:-]{1,160}$/);
const requestSchema = z.object({ requestId: reference }).strict();
const retention = z
  .object({
    resourceRef: z.string().regex(/^[a-f0-9]{64}$/),
    basis: reference,
    evidenceReference: reference,
    reviewCriterion: reference,
  })
  .strict();
const planSchema = requestSchema.extend({
  retentions: z.array(retention).max(300).default([]),
});
const capabilitySchema = z
  .object({
    expiresAt: z.number().int().positive(),
    signature: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const commandSchema = requestSchema.extend({
  planHash: z.string().regex(/^[a-f0-9]{64}$/),
  capability: capabilitySchema,
});
export type DeletionRetention = z.infer<typeof retention>;
type RequestRow = {
  id: string;
  user_id: string;
  organization_id: string;
  status: "requested" | "processing" | "completed";
};
type Resource = {
  table: string;
  keys: Record<string, unknown>;
  fingerprint: string;
  resourceRef: string;
  action: "delete" | "purge" | "retain" | "blocked";
};
type RawResource = Resource & {
  row: Record<string, unknown>;
  columns: string[];
};
type Manifest = {
  requestId: string;
  userId: string;
  resources: Resource[];
  identities: DeletionIdentity[];
  objectKeys: string[];
  retentions: DeletionRetention[];
  blockers: string[];
};
type StoredPlan = {
  request_id: string;
  plan_hash: string;
  manifest_json: string;
  sealed_recipient: string;
  data_verified_at: string | null;
};
type ResourceScope = {
  table: string;
  condition: string;
  values: string[];
  count: number;
};

const temporary = new Set([
  "auth_identities",
  "browser_sessions",
  "personal_sessions",
  "native_sessions",
  "native_authorization_codes",
  "development_mcp_tokens",
  "authorized_connections",
  "connection_tool_observations",
  "connection_events",
  "platform_access_audit",
  "personal_http_limits",
  "template_permissions",
  "expert_document_review_progress",
  "expert_dispatch_reviews",
  "expert_approval_policies",
  "document_analysis",
  "private_document_uploads",
  "mcp_app_document_uploads",
  "secure_deposit_operations",
  "secure_personal_pages",
  "secure_personal_documents",
]);
const unsupportedOwners = new Set([
  "document_templates",
  "workflow_datasets",
  "workflow_template_sources",
  "workflow_mappings",
  "generation_jobs",
  "distribution_plans",
]);
const retainedTables = new Set([
  "audit_log",
  "approvals",
  "postal_preflights",
  "postal_transfer_consents",
  "postal_sender_declarations",
  "workspace_invitations",
  "workspace_invitation_acceptances",
  "template_versions",
  "pdf_validations",
  "pdf_validation_purchases",
  "secure_document_events",
  "secure_distributions",
  "secure_approval_evidence",
  "fax_review_preparation_authorities",
  "fax_review_preparation_access",
  "prepare_only_users",
  "restricted_delivery_identities",
  "personal_workspace_creations",
  "workflow_ai_policy",
  "fax_usage_settlements",
]);
const actorColumns = new Set([
  "user_id",
  "owner_id",
  "request_user_id",
  "created_by",
  "published_by",
  "approved_by",
  "accepted_by",
  "invited_by",
  "recipient_user_id",
  "binding_by",
  "access_owner_id",
  "reviewer_user_id",
  "reviewer_id",
  "updated_by",
]);
const sqlName = (value: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(value))
    throw new DeletionProcessorError("DELETION_SCHEMA_UNSUPPORTED");
  return `"${value}"`;
};
const whereKeys = (resource: Resource) =>
  Object.keys(resource.keys)
    .map((key) => `${sqlName(key)} IS ?`)
    .join(" AND ");

async function signingKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
export async function signDeletionCommand(
  secret: string,
  requestId: string,
  planHash: string,
  expiresAt: number,
) {
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      await signingKey(secret),
      new TextEncoder().encode(
        canonicalJson({
          action: "account_deletion",
          requestId,
          planHash,
          expiresAt,
        }),
      ),
    ),
  );
  return {
    expiresAt,
    signature: Array.from(signature, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join(""),
  };
}
async function secretKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`account-deletion-notice:${secret}`),
    ),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
async function sealRecipient(
  secret: string,
  requestId: string,
  recipient: string,
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: new TextEncoder().encode(requestId),
      },
      await secretKey(secret),
      new TextEncoder().encode(recipient),
    ),
  );
  return `${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...bytes))}`;
}
async function openRecipient(secret: string, requestId: string, value: string) {
  const [iv, body] = value
    .split(".")
    .map((part) => Uint8Array.from(atob(part), (char) => char.charCodeAt(0)));
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: new TextEncoder().encode(requestId),
      },
      await secretKey(secret),
      body,
    ),
  );
}

/** Private operator workflow. Public request acceptance does not invoke erasure. */
export class AccountDeletionService {
  private readonly processors;
  constructor(
    private readonly env: AccountDeletionEnv,
    fetcher: typeof fetch = fetch,
  ) {
    this.processors = accountDeletionProcessors(env, fetcher);
  }
  private async request(id: string) {
    const row = await this.env.DB.prepare(
      "SELECT id,user_id,organization_id,status FROM account_deletion_requests WHERE id=?",
    )
      .bind(id)
      .first<RequestRow>();
    if (!row) throw new DeletionProcessorError("DELETION_REQUEST_NOT_FOUND");
    return row;
  }
  private async authorize(input: z.infer<typeof commandSchema>) {
    const secret = this.env.ACCOUNT_DELETION_OPERATOR_SECRET;
    if (
      this.env.ACCOUNT_DELETION_ENABLED !== "true" ||
      !secret ||
      secret.length < 32
    )
      throw new DeletionProcessorError("DELETION_DISABLED");
    const now = Date.now();
    if (
      input.capability.expiresAt <= now ||
      input.capability.expiresAt > now + 15 * 60000
    )
      throw new DeletionProcessorError("DELETION_CAPABILITY_INVALID");
    const expected = await signDeletionCommand(
      secret,
      input.requestId,
      input.planHash,
      input.capability.expiresAt,
    );
    const actual = Uint8Array.from(
      input.capability.signature.match(/../g)!,
      (pair) => Number.parseInt(pair, 16),
    );
    if (
      !(await crypto.subtle.verify(
        "HMAC",
        await signingKey(secret),
        actual,
        new TextEncoder().encode(
          canonicalJson({
            action: "account_deletion",
            requestId: input.requestId,
            planHash: input.planHash,
            expiresAt: expected.expiresAt,
          }),
        ),
      ))
    )
      throw new DeletionProcessorError("DELETION_CAPABILITY_INVALID");
  }
  private async resources(userId: string, email: string) {
    const tables = await this.env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' ORDER BY name",
    ).all<{ name: string }>();
    const result: RawResource[] = [],
      scopes: ResourceScope[] = [];
    let bytes = 0;
    for (const { name } of tables.results) {
      if (name.startsWith("account_deletion_") || name === "users") continue;
      const columns = await this.env.DB.prepare(
        `PRAGMA table_info(${sqlName(name)})`,
      ).all<{ name: string; pk: number }>();
      const foreignKeys = await this.env.DB.prepare(
        `PRAGMA foreign_key_list(${sqlName(name)})`,
      ).all<{ table: string; from: string }>();
      const userReferences = new Set(
        foreignKeys.results
          .filter((key) => key.table === "users")
          .map((key) => key.from),
      );
      const actors = columns.results
        .filter(
          (column) =>
            actorColumns.has(column.name) || userReferences.has(column.name),
        )
        .map((column) => column.name);
      const criteria = actors.map((column) => `${sqlName(column)}=?`),
        values = actors.map(() => userId);
      if (name === "workspace_invitations") {
        criteria.push("email=?");
        values.push(email);
      }
      if (!criteria.length) continue;
      const keys = columns.results
        .filter((column) => column.pk)
        .sort((a, b) => a.pk - b.pk)
        .map((column) => column.name);
      if (!keys.length)
        throw new DeletionProcessorError("DELETION_SCHEMA_UNSUPPORTED");
      const rows = await this.env.DB.prepare(
        `SELECT * FROM ${sqlName(name)} WHERE ${criteria.join(" OR ")} ORDER BY ${keys.map(sqlName).join(",")} LIMIT 301`,
      )
        .bind(...values)
        .all<Record<string, unknown>>();
      scopes.push({
        table: name,
        condition: criteria.join(" OR "),
        values,
        count: rows.results.length,
      });
      for (const row of rows.results) {
        const serialized = canonicalJson(row);
        bytes += new TextEncoder().encode(serialized).length;
        if (result.length >= 300 || bytes > 2097152)
          throw new DeletionProcessorError("DELETION_RESOURCE_LIMIT");
        const key = Object.fromEntries(
          keys.map((column) => [column, row[column]]),
        );
        const action =
          name === "memberships"
            ? "delete"
            : name === "documents"
              ? "purge"
              : temporary.has(name)
                ? "delete"
                : retainedTables.has(name)
                  ? "retain"
                  : "blocked";
        result.push({
          table: name,
          keys: key,
          row,
          columns: columns.results.map((column) => column.name).sort(),
          fingerprint: await sha256(serialized),
          resourceRef: await sha256(canonicalJson([name, key])),
          action,
        });
      }
    }
    return { raw: result, scopes };
  }
  private async build(input: z.infer<typeof planSchema>) {
    const request = await this.request(input.requestId);
    if (request.status !== "requested")
      throw new DeletionProcessorError("DELETION_ALREADY_PROCESSING");
    const user = await this.env.DB.prepare("SELECT * FROM users WHERE id=?")
      .bind(request.user_id)
      .first<{ email: string; [key: string]: unknown }>();
    if (!user || !z.email().safeParse(user.email).success)
      throw new DeletionProcessorError("DELETION_IDENTITY_INVALID");
    const { raw, scopes } = await this.resources(request.user_id, user.email),
      blockers: string[] = [];
    const identities: DeletionIdentity[] = [];
    const objectKeys = new Set<string>();
    for (const item of raw) {
      const row = item.row;
      if (
        item.action === "blocked" ||
        unsupportedOwners.has(item.table) ||
        (item.table === "secure_distributions" &&
          row.created_by === request.user_id) ||
        item.table === "personal_workspace_creations"
      ) {
        item.action = "blocked";
        blockers.push(`RESOURCE_OWNERSHIP_UNSUPPORTED:${item.resourceRef}`);
      }
      if (item.table === "memberships" && row.role === "admin") {
        const successor = await this.env.DB.prepare(
          "SELECT 1 FROM memberships successor WHERE organization_id=? AND user_id<>? AND role='admin' AND NOT EXISTS(SELECT 1 FROM account_deletion_requests closing WHERE closing.user_id=successor.user_id AND closing.status IN('processing','completed'))",
        )
          .bind(row.organization_id, request.user_id)
          .first();
        if (!successor) blockers.push(`SUCCESSOR_REQUIRED:${item.resourceRef}`);
      }
      if (item.table === "auth_identities")
        identities.push({
          issuer: String(row.issuer),
          subject: String(row.subject),
        });
      if (
        (item.table === "private_document_uploads" &&
          ["uploading", "unknown"].includes(String(row.state))) ||
        (item.table === "mcp_app_document_uploads" &&
          (row.writer_token ||
            ["finalizing", "unknown"].includes(String(row.state)))) ||
        (item.table === "secure_deposit_operations" &&
          row.status === "preparing") ||
        (item.table === "pdf_validations" && row.status === "processing") ||
        (item.table === "workspace_invitations" &&
          row.status === "pending" &&
          row.invited_by === request.user_id)
      )
        blockers.push(`WORK_UNRESOLVED:${item.resourceRef}`);
      if (item.table === "expert_approval_policies") {
        const retained = await this.env.DB.prepare(
          "SELECT 1 FROM expert_approval_acceptances WHERE connection_id=?",
        )
          .bind(row.connection_id)
          .first();
        if (retained)
          blockers.push(`DELEGATED_EVIDENCE_UNSUPPORTED:${item.resourceRef}`);
      }
      if (item.table === "private_document_uploads")
        objectKeys.add(
          `${row.organization_id}/documents/${row.expected_sha256}/${row.planned_document_id}.pdf`,
        );
      if (item.table === "documents") {
        objectKeys.add(String(row.storage_key));
        const shared = await this.env.DB.prepare(
          "SELECT 1 FROM secure_distributions WHERE organization_id=? AND source_id=? UNION ALL SELECT 1 FROM protected_document_hostings WHERE organization_id=? AND document_id=? AND status IN('draft','active') AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')",
        )
          .bind(row.organization_id, row.id, row.organization_id, row.id)
          .first();
        if (shared)
          blockers.push(`SHARED_CONTENT_UNSUPPORTED:${item.resourceRef}`);
        const liabilities = await this.env.DB.prepare(
          "SELECT 1 FROM dispatches WHERE organization_id=? AND document_id=? AND (provider_id IS NOT NULL OR status NOT IN('delivered','failed','cancelled','bounced','complained','handed_to_post'))",
        )
          .bind(row.organization_id, row.id)
          .first();
        if (liabilities)
          blockers.push(`DELIVERY_RETENTION_UNRESOLVED:${item.resourceRef}`);
      }
      if (item.table === "approvals") {
        const liability = await this.env.DB.prepare(
          "SELECT 1 FROM dispatches d LEFT JOIN reservations r ON r.organization_id=d.organization_id AND r.dispatch_id=d.id LEFT JOIN welcome_credit_reservations c ON c.organization_id=d.organization_id AND c.dispatch_id=d.id WHERE d.organization_id=? AND d.id=? AND (d.status IN('queued','submitting','submission_unknown','accepted','printed') OR r.status='reserved' OR c.status='reserved')",
        )
          .bind(row.organization_id, row.dispatch_id)
          .first();
        if (liability)
          blockers.push(`LIABILITY_UNRESOLVED:${item.resourceRef}`);
      }
      if (item.table === "secure_personal_documents") {
        objectKeys.add(String(row.original_key));
        const pages = await this.env.DB.prepare(
          "SELECT image_key,text_key FROM secure_personal_pages WHERE user_id=? AND personal_document_id=?",
        )
          .bind(request.user_id, row.id)
          .all<{ image_key: string; text_key: string }>();
        for (const page of pages.results) {
          objectKeys.add(page.image_key);
          objectKeys.add(page.text_key);
        }
      }
      if (item.table === "mcp_app_document_uploads") {
        const parts = await this.env.DB.prepare(
          "SELECT object_key,storage_settled FROM mcp_app_document_upload_parts WHERE organization_id=? AND upload_id=?",
        )
          .bind(row.organization_id, row.upload_id)
          .all<{ object_key: string; storage_settled: number }>();
        if (
          parts.results.some((part) => !part.storage_settled) ||
          (!row.cleaned_at && String(row.cleanup_not_before) > stamp())
        )
          blockers.push(`UPLOAD_STORAGE_DRAIN_UNRESOLVED:${item.resourceRef}`);
        for (const part of parts.results) objectKeys.add(part.object_key);
      }
    }
    // Include unlinked remnants only in the account-exclusive personal namespace.
    const personalObjects = await this.env.DOCUMENTS.list({
      prefix: `secure/personal/${request.user_id}/`,
      limit: 21,
    });
    if (personalObjects.truncated || personalObjects.objects.length > 20)
      blockers.push("DELETION_EXECUTION_LIMIT");
    for (const object of personalObjects.objects) objectKeys.add(object.key);
    if (!identities.length) blockers.push("AUTH0_IDENTITY_REQUIRED");
    if (identities.length > 2) blockers.push("AUTH0_IDENTITY_LIMIT");
    if (
      identities.some(
        (identity) => identity.issuer !== `https://${this.env.AUTH0_DOMAIN}/`,
      )
    )
      blockers.push("AUTH0_ISSUER_UNSUPPORTED");
    if (objectKeys.size > 20 || raw.length > 60)
      blockers.push("DELETION_EXECUTION_LIMIT");
    const retained = raw
      .filter((item) => item.action === "retain" || item.action === "purge")
      .map(({ resourceRef, table }) => ({ resourceRef, kind: table }));
    for (const kind of [
      "profile_evidence",
      "request_evidence",
      "identity_tombstones",
      "backup_retention",
      "completion_notice_processor",
    ])
      retained.push({
        resourceRef: await sha256(canonicalJson([input.requestId, kind])),
        kind,
      });
    const retentionRefs = new Set(
      input.retentions.map((item) => item.resourceRef),
    );
    if (retentionRefs.size !== input.retentions.length)
      blockers.push("RETENTION_DECISION_DUPLICATE");
    for (const item of retained)
      if (!retentionRefs.has(item.resourceRef))
        blockers.push(`RETENTION_REVIEW_REQUIRED:${item.resourceRef}`);
    for (const item of input.retentions)
      if (!retained.some((needed) => needed.resourceRef === item.resourceRef))
        blockers.push(`RETENTION_RESOURCE_CHANGED:${item.resourceRef}`);
    const manifest: Manifest = {
      requestId: input.requestId,
      userId: request.user_id,
      resources: raw.map(({ row: _row, columns: _columns, ...item }) => item),
      identities: identities.sort((a, b) =>
        canonicalJson(a).localeCompare(canonicalJson(b)),
      ),
      objectKeys: [...objectKeys].sort(),
      retentions: [...input.retentions].sort((a, b) =>
        a.resourceRef.localeCompare(b.resourceRef),
      ),
      blockers: [...new Set(blockers)].sort(),
    };
    const userHash = await sha256(canonicalJson(user)),
      planHash = await sha256(canonicalJson({ manifest, userHash }));
    return { request, user, raw, manifest, planHash, retained, scopes };
  }
  async plan(value: unknown) {
    const input = planSchema.parse(value),
      built = await this.build(input);
    return {
      requestId: input.requestId,
      planHash: built.planHash,
      blockers: built.manifest.blockers,
      retentionRequired: built.retained,
      resources: built.manifest.resources.map(
        ({ table, resourceRef, action }) => ({
          kind: table,
          resourceRef,
          action,
        }),
      ),
      objectCount: built.manifest.objectKeys.length,
      identityCount: built.manifest.identities.length,
    };
  }
  async begin(value: unknown) {
    const input = commandSchema
      .extend({ retentions: z.array(retention).max(300) })
      .strict()
      .parse(value);
    await this.authorize(input);
    const built = await this.build(input);
    if (built.planHash !== input.planHash)
      throw new DeletionProcessorError("DELETION_PLAN_CHANGED");
    if (built.manifest.blockers.length)
      throw new DeletionProcessorError("DELETION_BLOCKED");
    const time = stamp(),
      sealed = await sealRecipient(
        this.env.ACCOUNT_DELETION_OPERATOR_SECRET!,
        input.requestId,
        built.user.email,
      );
    // Compare the exact rows again in the status-changing transaction. A plan is
    // not authority to erase newly added or edited resources after review.
    const checks: { condition: string; values: unknown[] }[] = [];
    const userColumns = Object.keys(built.user).sort();
    checks.push({
      condition: `EXISTS(SELECT 1 FROM users WHERE id=? AND json_object(${userColumns.map((column) => `'${column}',${sqlName(column)}`).join(",")})=?)`,
      values: [built.request.user_id, canonicalJson(built.user)],
    });
    for (const item of built.raw) {
      const json = `json_object(${item.columns.map((column) => `'${column}',${sqlName(column)}`).join(",")})`;
      checks.push({
        condition: `EXISTS(SELECT 1 FROM ${sqlName(item.table)} WHERE ${whereKeys(item)} AND ${json}=?)`,
        values: [...Object.values(item.keys), canonicalJson(item.row)],
      });
    }
    for (const scope of built.scopes) {
      checks.push({
        condition: `(SELECT count(*) FROM ${sqlName(scope.table)} WHERE ${scope.condition})=?`,
        values: [...scope.values, scope.count],
      });
    }
    const writes = [
      this.env.DB.prepare(
        "INSERT INTO account_deletion_plans(request_id,plan_hash,manifest_json,retentions_json,sealed_recipient,created_at) VALUES(?,?,?,?,?,?)",
      ).bind(
        input.requestId,
        input.planHash,
        canonicalJson(built.manifest),
        canonicalJson(input.retentions),
        sealed,
        time,
      ),
    ];
    checks.forEach((check, index) =>
      writes.push(
        this.env.DB.prepare(
          `INSERT INTO account_deletion_plan_checks(request_id,check_id,matched) VALUES(?,?,(${check.condition}))`,
        ).bind(input.requestId, index, ...check.values),
      ),
    );
    const statusIndex = writes.length;
    writes.push(
      this.env.DB.prepare(
        "UPDATE account_deletion_requests SET status='processing',processing_reference=?,processing_at=?,updated_at=? WHERE id=? AND status='requested' AND EXISTS(SELECT 1 FROM users WHERE id=? AND email=?) RETURNING id",
      ).bind(
        input.planHash,
        time,
        time,
        input.requestId,
        built.request.user_id,
        built.user.email,
      ),
    );
    // The guard aborts the whole batch if any snapshot changed, including plan storage.
    writes.push(
      this.env.DB.prepare(
        "INSERT INTO account_deletion_steps(request_id,step,state,updated_at) SELECT ?,'objects','pending',? WHERE EXISTS(SELECT 1 FROM account_deletion_requests WHERE id=? AND status='processing' AND processing_reference=?)",
      ).bind(input.requestId, time, input.requestId, input.planHash),
    );
    for (const step of ["auth0", "local", "verification"])
      writes.push(
        this.env.DB.prepare(
          "INSERT INTO account_deletion_steps(request_id,step,state,updated_at) VALUES(?,?,'pending',?)",
        ).bind(input.requestId, step, time),
      );
    for (const identity of built.manifest.identities)
      writes.push(
        this.env.DB.prepare(
          "INSERT INTO account_deletion_identity_tombstones(issuer,subject,request_id,created_at) VALUES(?,?,?,?)",
        ).bind(identity.issuer, identity.subject, input.requestId, time),
      );
    writes.push(
      this.env.DB.prepare("DELETE FROM native_sessions WHERE user_id=?").bind(
        built.request.user_id,
      ),
      this.env.DB.prepare(
        "DELETE FROM native_authorization_codes WHERE user_id=?",
      ).bind(built.request.user_id),
      this.env.DB.prepare("DELETE FROM browser_sessions WHERE user_id=?").bind(
        built.request.user_id,
      ),
      this.env.DB.prepare("DELETE FROM personal_sessions WHERE user_id=?").bind(
        built.request.user_id,
      ),
      this.env.DB.prepare(
        "DELETE FROM development_mcp_tokens WHERE user_id=?",
      ).bind(built.request.user_id),
      this.env.DB.prepare(
        "UPDATE authorized_connections SET status='revoked',updated_at=?,not_before=? WHERE user_id=?",
      ).bind(time, Math.floor(Date.now() / 1000), built.request.user_id),
    );
    const result = await this.env.DB.batch(writes);
    if (!result[statusIndex].results.length)
      throw new DeletionProcessorError("DELETION_PLAN_CHANGED");
    return { requestId: input.requestId, status: "processing" };
  }
  private async stored(input: z.infer<typeof commandSchema>) {
    await this.authorize(input);
    const plan = await this.env.DB.prepare(
      "SELECT * FROM account_deletion_plans WHERE request_id=? AND plan_hash=?",
    )
      .bind(input.requestId, input.planHash)
      .first<StoredPlan>();
    if (!plan) throw new DeletionProcessorError("DELETION_PLAN_CHANGED");
    return {
      plan,
      manifest: JSON.parse(plan.manifest_json) as Manifest,
      request: await this.request(input.requestId),
    };
  }
  private async verified(requestId: string, step: string) {
    return !!(await this.env.DB.prepare(
      "SELECT 1 FROM account_deletion_steps WHERE request_id=? AND step=? AND state='verified'",
    )
      .bind(requestId, step)
      .first());
  }
  private async lease(requestId: string, token: string) {
    if (
      !(await this.env.DB.prepare(
        "SELECT 1 FROM account_deletion_plans p JOIN account_deletion_requests r ON r.id=p.request_id WHERE p.request_id=? AND p.lease_token=? AND p.lease_expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND r.status='processing'",
      )
        .bind(requestId, token)
        .first())
    )
      throw new DeletionProcessorError("DELETION_LEASE_EXPIRED");
  }
  private async checkpoint(
    requestId: string,
    step: string,
    state: "started" | "verified",
    evidence: unknown,
    token: string,
  ) {
    const result = await this.env.DB.prepare(
      "UPDATE account_deletion_steps SET state=?,evidence_sha256=?,updated_at=? WHERE request_id=? AND step=? AND EXISTS(SELECT 1 FROM account_deletion_plans p JOIN account_deletion_requests r ON r.id=p.request_id WHERE p.request_id=account_deletion_steps.request_id AND p.lease_token=? AND p.lease_expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND r.status='processing')",
    )
      .bind(
        state,
        state === "verified" ? await sha256(canonicalJson(evidence)) : null,
        stamp(),
        requestId,
        step,
        token,
      )
      .run();
    if (result.meta.changes !== 1)
      throw new DeletionProcessorError("DELETION_LEASE_EXPIRED");
  }
  private async verifyLocal(manifest: Manifest) {
    for (const table of [
      "memberships",
      "auth_identities",
      "browser_sessions",
      "personal_sessions",
      "native_sessions",
      "native_authorization_codes",
      "development_mcp_tokens",
      "authorized_connections",
    ])
      if (
        await this.env.DB.prepare(`SELECT 1 FROM ${table} WHERE user_id=?`)
          .bind(manifest.userId)
          .first()
      )
        throw new DeletionProcessorError("DELETION_LOCAL_UNVERIFIED");
    const user = await this.env.DB.prepare(
      "SELECT 1 FROM users WHERE id=? AND name='Deleted account' AND email='deleted@account.invalid' AND preferred_locale IS NULL AND preferred_dashboard_appearance='v2'",
    )
      .bind(manifest.userId)
      .first();
    if (!user) throw new DeletionProcessorError("DELETION_LOCAL_UNVERIFIED");
    const current = await this.resources(manifest.userId, "");
    for (const item of current.raw) {
      const reviewed = manifest.resources.find(
        (resource) => resource.resourceRef === item.resourceRef,
      );
      if (
        !reviewed ||
        reviewed.action === "delete" ||
        reviewed.action === "blocked" ||
        (reviewed.action === "retain" &&
          reviewed.fingerprint !== item.fingerprint) ||
        (reviewed.action === "purge" &&
          (item.row.status !== "purged" ||
            item.row.name !== "Deleted document"))
      )
        throw new DeletionProcessorError("DELETION_RESOURCE_UNVERIFIED");
    }
    if (
      (await this.env.DB.prepare("PRAGMA foreign_key_check").all()).results
        .length
    )
      throw new DeletionProcessorError("DELETION_INTEGRITY_FAILED");
    for (const table of ["users", "account_deletion_requests"])
      if (
        (
          await this.env.DB.prepare(`PRAGMA quick_check('${table}')`).all<{
            quick_check: string;
          }>()
        ).results.some((row) => row.quick_check !== "ok")
      )
        throw new DeletionProcessorError("DELETION_INTEGRITY_FAILED");
    return current;
  }
  private async verifyPersonalNamespace(manifest: Manifest) {
    if (
      (
        await this.env.DOCUMENTS.list({
          prefix: `secure/personal/${manifest.userId}/`,
          limit: 1,
        })
      ).objects.length
    )
      throw new DeletionProcessorError("DELETION_OBJECT_UNVERIFIED");
  }
  async advance(value: unknown) {
    const input = commandSchema.strict().parse(value),
      { plan, manifest, request } = await this.stored(input);
    if (request.status === "completed")
      return { requestId: input.requestId, status: "completed" };
    const lease = crypto.randomUUID(),
      time = stamp();
    const claimed = await this.env.DB.prepare(
      "UPDATE account_deletion_plans SET lease_token=?,lease_expires_at=? WHERE request_id=? AND (lease_token IS NULL OR lease_expires_at<=?) AND EXISTS(SELECT 1 FROM account_deletion_requests r WHERE r.id=account_deletion_plans.request_id AND r.status='processing') RETURNING request_id",
    )
      .bind(
        lease,
        new Date(Date.now() + 60000).toISOString(),
        input.requestId,
        time,
      )
      .first();
    if (!claimed) throw new DeletionProcessorError("DELETION_BUSY");
    const assertCurrent = async () => {
      await this.authorize(input);
      await this.lease(input.requestId, lease);
    };
    try {
      await assertCurrent();
      if (!(await this.verified(input.requestId, "objects"))) {
        await this.checkpoint(
          input.requestId,
          "objects",
          "started",
          null,
          lease,
        );
        for (const key of manifest.objectKeys) {
          await assertCurrent();
          await this.env.DOCUMENTS.delete(key);
          await assertCurrent();
          if (await this.env.DOCUMENTS.head(key))
            throw new DeletionProcessorError("DELETION_OBJECT_UNVERIFIED");
        }
        await assertCurrent();
        await this.checkpoint(
          input.requestId,
          "objects",
          "verified",
          manifest.objectKeys,
          lease,
        );
      }
      if (!(await this.verified(input.requestId, "auth0"))) {
        await this.checkpoint(input.requestId, "auth0", "started", null, lease);
        for (const identity of manifest.identities)
          await this.processors.eraseIdentity(identity, assertCurrent);
        await assertCurrent();
        await this.checkpoint(
          input.requestId,
          "auth0",
          "verified",
          manifest.identities,
          lease,
        );
      }
      if (!(await this.verified(input.requestId, "local"))) {
        const order = [
          "secure_personal_pages",
          "secure_personal_documents",
          "mcp_app_document_uploads",
          "private_document_uploads",
          "expert_document_review_progress",
          "expert_dispatch_reviews",
          "expert_approval_policies",
          "connection_tool_observations",
          "authorized_connections",
          "memberships",
        ];
        const resources = [...manifest.resources].sort(
          (a, b) =>
            (order.indexOf(a.table) < 0 ? -100 : order.indexOf(a.table)) -
            (order.indexOf(b.table) < 0 ? -100 : order.indexOf(b.table)),
        );
        // The first statement establishes the live lease at this atomic mutation
        // boundary. Paired writes use that authority instant, not later clocks.
        const writes: D1PreparedStatement[] = [
          this.env.DB.prepare(
            "INSERT INTO account_deletion_plan_checks(request_id,check_id,matched) VALUES(?,1000000,(SELECT count(*) FROM account_deletion_plans p JOIN account_deletion_requests r ON r.id=p.request_id WHERE p.request_id=? AND p.lease_token=? AND p.lease_expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND r.status='processing')) ON CONFLICT(request_id,check_id) DO UPDATE SET matched=excluded.matched",
          ).bind(input.requestId, input.requestId, lease),
        ];
        for (const item of manifest.resources.filter(
          (item) => item.table === "secure_personal_documents",
        ))
          writes.push(
            this.env.DB.prepare(
              "DELETE FROM secure_document_events WHERE personal_document_id=?",
            ).bind(item.keys.id),
          );
        for (const item of manifest.resources.filter(
          (item) => item.table === "mcp_app_document_uploads",
        ))
          writes.push(
            this.env.DB.prepare(
              "DELETE FROM mcp_app_document_upload_parts WHERE organization_id=? AND upload_id=?",
            ).bind(item.keys.organization_id, item.keys.upload_id),
          );
        for (const item of resources) {
          if (item.action === "delete")
            writes.push(
              this.env.DB.prepare(
                `DELETE FROM ${sqlName(item.table)} WHERE ${whereKeys(item)}`,
              ).bind(...Object.values(item.keys)),
            );
          if (item.action === "purge")
            writes.push(
              this.env.DB.prepare(
                `UPDATE documents SET status='purged',name='Deleted document' WHERE ${whereKeys(item)}`,
              ).bind(...Object.values(item.keys)),
            );
        }
        writes.push(
          this.env.DB.prepare(
            "UPDATE users SET name='Deleted account',email='deleted@account.invalid',preferred_locale=NULL,preferred_dashboard_appearance='v2' WHERE id=?",
          ).bind(manifest.userId),
        );
        await assertCurrent();
        await this.env.DB.batch(writes);
        await this.verifyLocal(manifest);
        await assertCurrent();
        await this.checkpoint(
          input.requestId,
          "local",
          "verified",
          { minimized: true },
          lease,
        );
      }
      await assertCurrent();
      await this.verifyLocal(manifest);
      for (const key of manifest.objectKeys) {
        await assertCurrent();
        if (await this.env.DOCUMENTS.head(key))
          throw new DeletionProcessorError("DELETION_OBJECT_UNVERIFIED");
      }
      await assertCurrent();
      await this.verifyPersonalNamespace(manifest);
      for (const identity of manifest.identities)
        await this.processors.verifyIdentityAbsent(identity, assertCurrent);
      await assertCurrent();
      await this.checkpoint(
        input.requestId,
        "verification",
        "verified",
        { verified: true },
        lease,
      );
      if (!plan.data_verified_at) {
        const verified = await this.env.DB.prepare(
          "UPDATE account_deletion_plans SET data_verified_at=? WHERE request_id=? AND data_verified_at IS NULL AND lease_token=? AND lease_expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')",
        )
          .bind(stamp(), input.requestId, lease)
          .run();
        if (verified.meta.changes !== 1)
          throw new DeletionProcessorError("DELETION_LEASE_EXPIRED");
      }
      return {
        requestId: input.requestId,
        status: "processing",
        nextAction: "verify_completion_notice",
      };
    } finally {
      await this.env.DB.prepare(
        "UPDATE account_deletion_plans SET lease_token=NULL,lease_expires_at=NULL WHERE request_id=? AND lease_token=?",
      )
        .bind(input.requestId, lease)
        .run();
    }
  }
  async notice(value: unknown) {
    const input = commandSchema.strict().parse(value),
      { plan, manifest } = await this.stored(input);
    if (
      !plan.data_verified_at ||
      !(await this.verified(input.requestId, "verification"))
    )
      throw new DeletionProcessorError("DELETION_DATA_UNVERIFIED");
    return {
      to: await openRecipient(
        this.env.ACCOUNT_DELETION_OPERATOR_SECRET!,
        input.requestId,
        plan.sealed_recipient,
      ),
      subject: `Account deletion completed: ${input.requestId}`,
      text: `Your active Guteneo account and eligible personal data have been erased. Reviewed records remain only under the recorded retention exceptions. Request: ${input.requestId}. Plan: ${input.planHash}. Retention review references: ${manifest.retentions
        .map((item) => item.evidenceReference)
        .sort()
        .join(", ")}.`,
    };
  }
  async complete(value: unknown) {
    const input = commandSchema
        .extend({ notificationReceiptId: reference })
        .strict()
        .parse(value),
      { plan, manifest, request } = await this.stored(input);
    if (request.status === "completed")
      return { requestId: input.requestId, status: "completed" };
    if (!plan.data_verified_at)
      throw new DeletionProcessorError("DELETION_DATA_UNVERIFIED");
    await this.verifyLocal(manifest);
    for (const key of manifest.objectKeys) {
      await this.authorize(input);
      if (await this.env.DOCUMENTS.head(key))
        throw new DeletionProcessorError("DELETION_OBJECT_UNVERIFIED");
    }
    await this.authorize(input);
    await this.verifyPersonalNamespace(manifest);
    for (const identity of manifest.identities)
      await this.processors.verifyIdentityAbsent(identity, () =>
        this.authorize(input),
      );
    const notice = await this.notice({
      requestId: input.requestId,
      planHash: input.planHash,
      capability: input.capability,
    });
    await this.processors.verifyNotification({
      id: input.notificationReceiptId,
      recipient: notice.to,
      subject: notice.subject,
      text: notice.text,
      earliest: plan.data_verified_at,
    });
    await this.authorize(input);
    // Fence the final reviewed resource snapshot in the same atomic completion
    // transaction, including empty user-reference scopes. Late retained writes
    // cannot bypass the review merely by arriving during processor inspection.
    const final = await this.verifyLocal(manifest);
    const finalChecks: D1PreparedStatement[] = [];
    let checkId = 2000000;
    for (const item of final.raw) {
      const json = `json_object(${item.columns.map((column) => `'${column}',${sqlName(column)}`).join(",")})`;
      finalChecks.push(
        this.env.DB.prepare(
          `INSERT INTO account_deletion_plan_checks(request_id,check_id,matched) VALUES(?,?,EXISTS(SELECT 1 FROM ${sqlName(item.table)} WHERE ${whereKeys(item)} AND ${json}=?)) ON CONFLICT(request_id,check_id) DO UPDATE SET matched=excluded.matched`,
        ).bind(
          input.requestId,
          checkId++,
          ...Object.values(item.keys),
          canonicalJson(item.row),
        ),
      );
    }
    for (const scope of final.scopes)
      finalChecks.push(
        this.env.DB.prepare(
          `INSERT INTO account_deletion_plan_checks(request_id,check_id,matched) VALUES(?,?,(SELECT count(*) FROM ${sqlName(scope.table)} WHERE ${scope.condition})=?) ON CONFLICT(request_id,check_id) DO UPDATE SET matched=excluded.matched`,
        ).bind(input.requestId, checkId++, ...scope.values, scope.count),
      );
    await this.authorize(input);
    const time = stamp();
    await this.env.DB.batch([
      ...finalChecks,
      this.env.DB.prepare(
        "INSERT INTO account_deletion_notification_receipts(request_id,provider,provider_id,evidence_sha256,verified_at) VALUES(?,'resend',?,?,?) ON CONFLICT(request_id) DO NOTHING",
      ).bind(
        input.requestId,
        input.notificationReceiptId,
        await sha256(
          canonicalJson({
            id: input.notificationReceiptId,
            planHash: input.planHash,
            notice,
          }),
        ),
        time,
      ),
      this.env.DB.prepare(
        "UPDATE account_deletion_requests SET status='completed',completed_at=?,updated_at=? WHERE id=? AND status='processing' AND processing_reference=?",
      ).bind(time, time, input.requestId, input.planHash),
      this.env.DB.prepare(
        "UPDATE account_deletion_plans SET sealed_recipient='' WHERE request_id=?",
      ).bind(input.requestId),
    ]);
    return { requestId: input.requestId, status: "completed" };
  }
}
