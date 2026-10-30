// Operator-only opt-in. No Auth0, tariff refresh, communication or approval action.
import { createHash } from "node:crypto";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import {
  privateOperatorPath,
  readPrivateOperatorJson,
} from "./private-operator-files.mjs";
import { z } from "zod";

const id = z.string().regex(/^[a-zA-Z0-9_.:-]{1,200}$/);
const stamp = z.iso.datetime({ precision: 3 });
const reference = z
  .string()
  .min(1)
  .max(500)
  .regex(/^[^\r\n\0]+$/);
const configSchema = z
  .object({
    version: z.literal(1),
    accessId: id,
    organizationId: id,
    reviewerUserId: id,
    tariffId: id,
    authorityId: id,
    reviewerIdentity: z
      .object({
        issuer: z.url().max(500),
        subject: z
          .string()
          .min(1)
          .max(500)
          .regex(/^[^\r\n\0]+$/),
      })
      .strict(),
    authorizationReference: reference,
  })
  .strict();
const fail = (code) => {
  throw new Error(code);
};
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
};
export const continuousReviewDigest = (value) =>
  createHash("sha256").update(canonical(value)).digest("hex");
export function validateContinuousReviewConfig(value) {
  const parsed = configSchema.safeParse(value);
  if (!parsed.success) fail("CONTINUOUS_REVIEW_CONFIG_INVALID");
  const issuer = new URL(parsed.data.reviewerIdentity.issuer);
  if (
    issuer.protocol !== "https:" ||
    issuer.username ||
    issuer.password ||
    issuer.search ||
    issuer.hash
  )
    fail("CONTINUOUS_REVIEW_CONFIG_INVALID");
  return parsed.data;
}
const countSql = (table) =>
  `(SELECT COUNT(*) FROM ${table} WHERE organization_id=?)`;
const executionTables = [
  "attempts",
  "approvals",
  "outbox",
  "reservations",
  "welcome_credit_reservations",
];
const first = (db, sql, values) =>
  db
    .prepare(sql)
    .bind(...values)
    .first();
async function snapshot(db, c) {
  const [
    organization,
    members,
    identity,
    tariff,
    authority,
    control,
    experts,
    execution,
    access,
  ] = await Promise.all([
    first(db, "SELECT * FROM organizations WHERE id=?", [c.organizationId]),
    db
      .prepare(
        "SELECT * FROM memberships WHERE organization_id=? ORDER BY user_id",
      )
      .bind(c.organizationId)
      .all(),
    first(
      db,
      "SELECT a.issuer,a.subject,a.user_id,r.policy FROM auth_identities a JOIN restricted_delivery_identities r ON r.issuer=a.issuer AND r.subject=a.subject WHERE a.issuer=? AND a.subject=? AND a.user_id=?",
      [c.reviewerIdentity.issuer, c.reviewerIdentity.subject, c.reviewerUserId],
    ),
    first(
      db,
      "SELECT * FROM trusted_fax_usage_tariffs WHERE organization_id=? AND id=?",
      [c.organizationId, c.tariffId],
    ),
    first(
      db,
      "SELECT * FROM fax_review_preparation_authorities WHERE organization_id=? AND id=?",
      [c.organizationId, c.authorityId],
    ),
    first(
      db,
      "SELECT * FROM channel_controls WHERE organization_id=? AND channel='fax'",
      [c.organizationId],
    ),
    first(
      db,
      "SELECT COUNT(*) AS count FROM expert_approval_policies WHERE organization_id=? AND enabled=1",
      [c.organizationId],
    ),
    first(
      db,
      `SELECT ${executionTables.map((table) => `${countSql(table)} AS ${table}`).join(",")},(SELECT COUNT(*) FROM trusted_fax_usage_tariffs WHERE organization_id=? AND execution_scope='live' AND status='qualified') AS live_tariffs,(SELECT COUNT(*) FROM trusted_fax_usage_tariffs WHERE organization_id=? AND execution_scope='review_prepare_only' AND status='qualified') AS review_tariffs`,
      [
        ...executionTables.map(() => c.organizationId),
        c.organizationId,
        c.organizationId,
      ],
    ),
    first(
      db,
      "SELECT * FROM fax_review_preparation_access WHERE organization_id=? AND tariff_id=?",
      [c.organizationId, c.tariffId],
    ),
  ]);
  const sender = tariff
    ? await first(
        db,
        "SELECT * FROM senders WHERE organization_id=? AND id=?",
        [c.organizationId, tariff.sender_id],
      )
    : null;
  return {
    organization,
    members: members.results,
    identity,
    tariff,
    authority,
    sender,
    control,
    experts: experts?.count,
    execution,
    access,
  };
}
function validSnapshot(s, c, now) {
  const t = s.tariff,
    a = s.authority,
    m = s.members[0],
    sender = s.sender;
  if (
    !stamp.safeParse(now).success ||
    s.organization?.mode !== "production" ||
    s.members.length !== 1 ||
    m?.user_id !== c.reviewerUserId ||
    m.role !== "admin" ||
    s.identity?.policy !== "prepare_only" ||
    s.identity.user_id !== c.reviewerUserId ||
    s.identity.issuer !== c.reviewerIdentity.issuer ||
    s.identity.subject !== c.reviewerIdentity.subject ||
    s.control?.enabled !== 0 ||
    s.experts !== 0 ||
    !s.execution ||
    Object.entries(s.execution).some(
      ([key, value]) => value !== (key === "review_tariffs" ? 1 : 0),
    ) ||
    !t ||
    !a ||
    !sender ||
    t.status !== "qualified" ||
    t.execution_scope !== "review_prepare_only" ||
    t.review_authority_id !== a.id ||
    a.status !== "active" ||
    t.valid_from > now ||
    a.valid_from > now ||
    t.valid_from < a.valid_from ||
    t.expires_at > a.expires_at ||
    t.route_qualification !== "operator_test" ||
    t.provider !== "telnyx" ||
    t.max_pages > 7 ||
    t.quote_ttl_seconds > 900 ||
    t.operator_test_ceiling_minor > 200 ||
    sender.channel !== "fax" ||
    sender.mode !== "production" ||
    sender.status !== "verified" ||
    sender.address !== a.recipient_phone ||
    !a.recipient_phone.startsWith(t.destination_prefix) ||
    !sender.address.startsWith(t.sender_prefix) ||
    ["sender_id", "account_id", "connection_id", "outbound_profile_id"].some(
      (key) => t[key] !== a[key],
    )
  )
    fail("CONTINUOUS_REVIEW_TARGET_INVALID");
  if (
    s.access &&
    (s.access.id !== c.accessId ||
      s.access.reviewer_user_id !== c.reviewerUserId ||
      s.access.tariff_id !== c.tariffId ||
      s.access.authority_id !== c.authorityId ||
      s.access.authorization_reference !== c.authorizationReference ||
      s.access.status !== "active")
  )
    fail("CONTINUOUS_REVIEW_ACCESS_CONFLICT");
}
export async function planContinuousReview(
  db,
  input,
  now = new Date().toISOString(),
) {
  const config = validateContinuousReviewConfig(input),
    state = await snapshot(db, config);
  validSnapshot(state, config, now);
  const access = state.access ?? {
    id: config.accessId,
    organization_id: config.organizationId,
    reviewer_user_id: config.reviewerUserId,
    tariff_id: config.tariffId,
    authority_id: config.authorityId,
    status: "active",
    created_at: now,
    authorization_reference: config.authorizationReference,
  };
  return {
    version: 1,
    kind: "continuous_review_preparation_opt_in",
    observedAt: now,
    config,
    snapshot: state,
    access,
    effect:
      "enable_revocable_archived_reference_for_exact_prepare_only_reviewer_without_changing_source_rows",
    deliveryPolicy: "prepare_only_unchanged",
    applied: false,
  };
}
function conjunction(conditions) {
  if (conditions.length === 1) return conditions[0];
  const middle = Math.floor(conditions.length / 2);
  return `(${conjunction(conditions.slice(0, middle))}) AND (${conjunction(conditions.slice(middle))})`;
}
function equality(table, row, conditions, values) {
  conditions.push(
    `EXISTS(SELECT 1 FROM ${table} WHERE ${conjunction(Object.keys(row).map((key) => `${key} IS ?`))})`,
  );
  values.push(...Object.values(row));
}
export async function applyContinuousReview(
  db,
  plan,
  reviewedDigest,
  now = new Date().toISOString(),
) {
  if (
    !/^[a-f0-9]{64}$/.test(reviewedDigest ?? "") ||
    continuousReviewDigest(plan) !== reviewedDigest ||
    plan.version !== 1 ||
    plan.kind !== "continuous_review_preparation_opt_in" ||
    !stamp.safeParse(plan.observedAt).success ||
    plan.observedAt > now
  )
    fail("CONTINUOUS_REVIEW_PLAN_INVALID");
  const c = validateContinuousReviewConfig(plan.config),
    current = await snapshot(db, c);
  validSnapshot(current, c, now);
  const expectedAccess = {
    id: c.accessId,
    organization_id: c.organizationId,
    reviewer_user_id: c.reviewerUserId,
    tariff_id: c.tariffId,
    authority_id: c.authorityId,
    status: "active",
    created_at: plan.access?.created_at,
    authorization_reference: c.authorizationReference,
  };
  if (
    !stamp.safeParse(expectedAccess.created_at).success ||
    expectedAccess.created_at > now ||
    canonical(plan.access) !== canonical(expectedAccess) ||
    canonical({ ...current, access: null }) !==
      canonical({ ...plan.snapshot, access: null })
  )
    fail("CONTINUOUS_REVIEW_STATE_CHANGED");
  if (current.access) {
    if (canonical(current.access) !== canonical(plan.access))
      fail("CONTINUOUS_REVIEW_ACCESS_CONFLICT");
    return {
      status: "already_applied",
      deliveryPolicy: "prepare_only_unchanged",
    };
  }
  const conditions = [],
    values = [];
  for (const [table, row] of [
    ["organizations", current.organization],
    ["memberships", current.members[0]],
    ["trusted_fax_usage_tariffs", current.tariff],
    ["fax_review_preparation_authorities", current.authority],
    ["senders", current.sender],
    ["channel_controls", current.control],
  ])
    equality(table, row, conditions, values);
  conditions.push(
    "EXISTS(SELECT 1 FROM auth_identities a JOIN restricted_delivery_identities r ON r.issuer=a.issuer AND r.subject=a.subject WHERE a.issuer=? AND a.subject=? AND a.user_id=? AND r.policy='prepare_only')",
    "(SELECT COUNT(*) FROM memberships WHERE organization_id=?)=1",
    "NOT EXISTS(SELECT 1 FROM expert_approval_policies WHERE organization_id=? AND enabled=1)",
    "NOT EXISTS(SELECT 1 FROM fax_review_preparation_access WHERE organization_id=? AND tariff_id=?)",
    "NOT EXISTS(SELECT 1 FROM trusted_fax_usage_tariffs WHERE organization_id=? AND execution_scope='live' AND status='qualified')",
    "(SELECT COUNT(*) FROM trusted_fax_usage_tariffs WHERE organization_id=? AND execution_scope='review_prepare_only' AND status='qualified')=1",
  );
  values.push(
    c.reviewerIdentity.issuer,
    c.reviewerIdentity.subject,
    c.reviewerUserId,
    c.organizationId,
    c.organizationId,
    c.organizationId,
    c.tariffId,
    c.organizationId,
    c.organizationId,
  );
  for (const table of executionTables) {
    conditions.push(`${countSql(table)}=0`);
    values.push(c.organizationId);
  }
  const columns = Object.keys(plan.access);
  await db
    .prepare(
      `INSERT INTO fax_review_preparation_access(${columns.join(",")}) SELECT ${columns.map(() => "?").join(",")} WHERE ${conjunction(conditions)} ON CONFLICT DO NOTHING`,
    )
    .bind(...Object.values(plan.access), ...values)
    .run();
  const saved = await first(
    db,
    "SELECT * FROM valid_continuous_review_fax_access WHERE organization_id=? AND id=?",
    [c.organizationId, c.accessId],
  );
  if (!saved || canonical(saved) !== canonical(plan.access))
    fail("CONTINUOUS_REVIEW_STATE_CHANGED");
  return { status: "applied", deliveryPolicy: "prepare_only_unchanged" };
}
const privateFile = (path) =>
  readPrivateOperatorJson(path, "CONTINUOUS_REVIEW");
const privateOutput = (path) => privateOperatorPath(path, "CONTINUOUS_REVIEW");
async function proxy() {
  const { getPlatformProxy } = await import("wrangler");
  const directory = await mkdtemp(join(tmpdir(), "guteneo-continuous-review-")),
    configPath = join(directory, "wrangler.json");
  await writeFile(
    configPath,
    JSON.stringify({
      name: "guteneo-continuous-review-operator",
      account_id: "39ac9fada6cba44d9ecf09d467609e69",
      compatibility_date: "2026-09-17",
      workers_dev: false,
      preview_urls: false,
      routes: [],
      d1_databases: [
        {
          binding: "DB",
          database_name: "guteneo-production",
          database_id: "f86235fa-58c1-404f-a9a6-e2d657315854",
          remote: true,
        },
      ],
      observability: { enabled: false },
    }),
    { mode: 0o600 },
  );
  try {
    const p = await getPlatformProxy({
      configPath,
      persist: false,
      envFiles: [],
    });
    return {
      db: p.env.DB,
      async dispose() {
        await p.dispose();
        await rm(directory, { recursive: true, force: true });
      },
    };
  } catch {
    await rm(directory, { recursive: true, force: true });
    fail("CONTINUOUS_REVIEW_PRIVATE_BINDINGS_UNAVAILABLE");
  }
}
export async function main(args) {
  const applying = args[0] === "--apply";
  if (
    applying
      ? args.length !== 4 || args[2] !== "--reviewed-plan-sha256"
      : args.length !== 4 || args[0] !== "--config" || args[2] !== "--output"
  )
    fail("CONTINUOUS_REVIEW_USAGE");
  let connection;
  try {
    const input = await privateFile(args[1]);
    if (!applying) {
      const c = validateContinuousReviewConfig(input),
        output = await privateOutput(args[3]);
      connection = await proxy();
      const plan = await planContinuousReview(connection.db, c);
      await writeFile(output, JSON.stringify(plan, null, 2) + "\n", {
        flag: "wx",
        mode: 0o600,
      });
      return {
        status: "plan_only",
        planSha256: continuousReviewDigest(plan),
        applied: false,
        deliveryPolicy: plan.deliveryPolicy,
      };
    }
    if (
      !/^[a-f0-9]{64}$/.test(args[3] ?? "") ||
      continuousReviewDigest(input) !== args[3]
    )
      fail("CONTINUOUS_REVIEW_PLAN_INVALID");
    connection = await proxy();
    return await applyContinuousReview(connection.db, input, args[3]);
  } finally {
    await connection?.dispose();
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main(process.argv.slice(2))
    .then((result) => console.log(JSON.stringify(result)))
    .catch(() => {
      console.error(
        JSON.stringify({
          code: "CONTINUOUS_REVIEW_FAILED",
          detailsWithheld: true,
          blindRetryAllowed: false,
        }),
      );
      process.exitCode = 1;
    });
