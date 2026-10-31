import { canonicalJson, sha256 } from "../../../packages/domain/src/index";
import {
  postalPolicyOptions,
  postalRateEvidence,
} from "../../../packages/domain/src/live-delivery-quotes";
import { postalAddressPositions } from "../../../packages/contracts/src/postal-requirements";
import {
  inspectPingenReadiness,
  type PingenReadiness,
} from "../../../packages/providers/pingen-readiness";
import type { Fetcher } from "../../../packages/providers";
import type { Env } from "./env";

const DAY = 86_400_000;
type Row = Record<string, string | number | null>;
type Profile = {
  accountId: string;
  billingCurrency: "EUR";
  defaultCountry: string;
  addressPosition: "left" | "right";
};
type Snapshot = {
  declaration: Row;
  sender: Row;
  generation: Row;
  policies: Row[];
  profile: Profile;
};
type ErrorCode =
  | "PROFILE_UNAVAILABLE"
  | "PROFILE_CHANGED"
  | "BINDING_CHANGED"
  | "QUOTE_ACTIVE"
  | "COMMIT_CHANGED"
  | "DATABASE_UNAVAILABLE";
export type PostalPolicyDeadline = {
  kind: "pingen_postal_policy";
  sourceId: string;
  organizationId: string;
  expiresAt: string;
  lastSuccessAt: string | null;
  lastErrorCode: string | null;
};
type Dependencies = {
  now?: () => number;
  fetcher?: Fetcher;
  inspect?: typeof inspectPingenReadiness;
};
const active = `SELECT g.organization_id FROM postal_setup_policy_generations g
 JOIN organizations o ON o.id=g.organization_id AND o.mode='production'
 JOIN postal_sender_declarations d ON d.organization_id=g.organization_id AND d.sender_id=g.sender_id AND d.profile_json=g.profile_json
 JOIN senders s ON s.organization_id=d.organization_id AND s.id=d.sender_id AND s.channel='postal' AND s.mode='production' AND s.status='verified' AND s.name=d.sender_name AND s.address=d.sender_address
 WHERE g.generation=(SELECT MAX(latest.generation) FROM postal_setup_policy_generations latest WHERE latest.organization_id=g.organization_id)
 AND (SELECT COUNT(*) FROM trusted_delivery_costs p WHERE p.organization_id=g.organization_id AND p.id IN (SELECT value FROM json_each(g.policy_ids_json)) AND p.status='qualified')=json_array_length(g.policy_ids_json)`;

async function snapshot(
  env: Env,
  organizationId: string,
): Promise<Snapshot | null> {
  const db = env.DB;
  const [declarations, senders, generations, policies, eligibility] =
    await db.batch([
      db
        .prepare(
          "SELECT * FROM postal_sender_declarations WHERE organization_id=?",
        )
        .bind(organizationId),
      db
        .prepare(
          "SELECT s.* FROM senders s JOIN postal_sender_declarations d ON d.organization_id=s.organization_id AND d.sender_id=s.id WHERE s.organization_id=?",
        )
        .bind(organizationId),
      db
        .prepare(
          "SELECT * FROM postal_setup_policy_generations WHERE organization_id=? ORDER BY generation DESC LIMIT 1",
        )
        .bind(organizationId),
      db
        .prepare(
          "SELECT * FROM trusted_delivery_costs WHERE organization_id=? AND id IN (SELECT value FROM json_each(COALESCE((SELECT policy_ids_json FROM postal_setup_policy_generations WHERE organization_id=? ORDER BY generation DESC LIMIT 1),'[]'))) ORDER BY id",
        )
        .bind(organizationId, organizationId),
      db
        .prepare(`SELECT 1 FROM (${active}) WHERE organization_id=?`)
        .bind(organizationId),
    ]);
  const declaration = declarations.results[0] as Row | undefined;
  const sender = senders.results[0] as Row | undefined;
  const generation = generations.results[0] as Row | undefined;
  const rows = policies.results as Row[];
  if (!eligibility.results.length || !declaration || !sender || !generation)
    return null;
  if (
    ![generation.created_at, generation.expires_at].every(
      (value) =>
        typeof value === "string" &&
        Number.isFinite(Date.parse(value)) &&
        new Date(value).toISOString() === value,
    )
  )
    return null;
  let profile: Profile, ids: string[];
  try {
    profile = JSON.parse(String(declaration.profile_json));
    ids = JSON.parse(String(generation.policy_ids_json));
  } catch {
    return null;
  }
  if (
    !profile ||
    profile.billingCurrency !== "EUR" ||
    profile.accountId !== env.PINGEN_ORGANIZATION_ID ||
    profile.defaultCountry !== env.PINGEN_DEFAULT_COUNTRY ||
    !["LU", "FR", "DE"].includes(profile.defaultCountry) ||
    !postalAddressPositions(profile.defaultCountry).includes(
      profile.addressPosition,
    ) ||
    !Array.isArray(ids) ||
    new Set(ids).size !== ids.length ||
    rows.length !== ids.length
  )
    return null;
  const options = postalAddressPositions(profile.defaultCountry)
    .flatMap(postalPolicyOptions)
    .map(canonicalJson);
  if (
    rows.length !== options.length ||
    !options.every((option) => rows.some((row) => row.options_json === option))
  )
    return null;
  for (const row of rows) {
    let evidence: ReturnType<typeof postalRateEvidence>;
    try {
      const existing = JSON.parse(String(row.rate_json));
      evidence = postalRateEvidence(existing.tariffDate);
      if (canonicalJson(existing) !== canonicalJson(evidence)) return null;
    } catch {
      return null;
    }
    if (
      row.source_sha256 !==
      (await sha256(canonicalJson({ rate: evidence, profile })))
    )
      return null;
    if (
      row.channel !== "postal" ||
      row.provider !== "pingen" ||
      row.sender_id !== sender.id ||
      row.account_id !== profile.accountId ||
      row.route_id !== profile.accountId ||
      row.status !== "qualified" ||
      row.pricing_basis !== "public_list_price_ex_tax" ||
      row.fiscal_basis !== "qualified_final_variable_cost" ||
      row.currency !== "EUR" ||
      row.source_reference !== evidence.tariffSource ||
      row.base_numerator !== 0 ||
      row.byte_numerator !== 0 ||
      row.rate_denominator !== 1 ||
      row.quote_ttl_seconds !== 300 ||
      row.expires_at !== generation.expires_at ||
      row.valid_from !== generation.created_at ||
      !/^[a-f0-9]{64}$/.test(String(row.source_sha256))
    )
      return null;
  }
  return { declaration, sender, generation, policies: rows, profile };
}

/** Match the preparation consumer, which is independent of final sending switches. */
function preparationSelection(env: Env): "active" | "inactive" | "unknown" {
  if (
    env.MODE === "simulation" ||
    env.ENVIRONMENT === "local" ||
    env.POSTAL_DRAFTS_ENABLED === "false"
  )
    return "inactive";
  if (
    env.MODE !== "production" ||
    env.ENVIRONMENT !== "production" ||
    env.POSTAL_DRAFTS_ENABLED !== "true" ||
    env.PINGEN_SANDBOX !== "false"
  )
    return "unknown";
  try {
    const origin = new URL(env.APP_ORIGIN);
    if (
      origin.protocol !== "https:" ||
      origin.username ||
      origin.password ||
      origin.search ||
      origin.hash ||
      origin.pathname !== "/"
    )
      return "unknown";
  } catch {
    return "unknown";
  }
  // LIVE_SENDS_ENABLED, LIVE_SEND_CHANNELS and channel_controls govern sending,
  // not postalPreparationGate or the exact-draft price calculator.
  return "active";
}
function transportConsumed(env: Env) {
  return preparationSelection(env) === "active";
}

export type PostalPolicyEvaluation =
  | (PostalPolicyDeadline & { status: "active"; revisionSha256: string })
  | {
      status: "inactive";
      organizationId: string;
      reason: "transport_disabled" | "sender_disabled" | "policies_revoked";
    }
  | {
      status: "unknown";
      organizationId: string;
      code: "BINDING_CHANGED" | "DATABASE_UNAVAILABLE";
    };
/** One tenant, tri-state: absence or an unreadable binding is never proof of recovery. */
export async function inspectPostalPolicyDeadline(
  env: Env,
  organizationId: string,
): Promise<PostalPolicyEvaluation> {
  const selected = preparationSelection(env);
  if (selected === "inactive")
    return { status: "inactive", organizationId, reason: "transport_disabled" };
  if (selected === "unknown")
    return { status: "unknown", organizationId, code: "BINDING_CHANGED" };
  try {
    const sender = await env.DB.prepare(
      "SELECT s.status FROM senders s JOIN postal_sender_declarations d ON d.organization_id=s.organization_id AND d.sender_id=s.id WHERE s.organization_id=?",
    )
      .bind(organizationId)
      .first<{ status: string }>();
    if (sender?.status === "disabled")
      return { status: "inactive", organizationId, reason: "sender_disabled" };
    const revoked = await env.DB.prepare(
      "SELECT COUNT(*) total,SUM(status='revoked') revoked,(SELECT json_array_length(policy_ids_json) FROM postal_setup_policy_generations WHERE organization_id=? ORDER BY generation DESC LIMIT 1) expected FROM trusted_delivery_costs WHERE organization_id=? AND id IN (SELECT value FROM json_each(COALESCE((SELECT policy_ids_json FROM postal_setup_policy_generations WHERE organization_id=? ORDER BY generation DESC LIMIT 1),'[]')))",
    )
      .bind(organizationId, organizationId, organizationId)
      .first<{ total: number; revoked: number; expected: number }>();
    if (
      revoked &&
      revoked.total > 0 &&
      revoked.total === revoked.expected &&
      revoked.total === revoked.revoked
    )
      return { status: "inactive", organizationId, reason: "policies_revoked" };
    const target = await snapshot(env, organizationId);
    if (!target)
      return { status: "unknown", organizationId, code: "BINDING_CHANGED" };
    const state = await env.DB.prepare(
      "SELECT last_success_at,last_error_code FROM postal_policy_refresh_state WHERE organization_id=?",
    )
      .bind(organizationId)
      .first<{
        last_success_at: string | null;
        last_error_code: string | null;
      }>();
    return {
      status: "active",
      kind: "pingen_postal_policy",
      sourceId: organizationId,
      organizationId,
      revisionSha256: await sha256(
        canonicalJson({
          generation: target.generation,
          profile: target.profile,
          policies: target.policies,
        }),
      ),
      expiresAt: String(target.generation.expires_at),
      lastSuccessAt: state?.last_success_at ?? null,
      lastErrorCode: state?.last_error_code ?? null,
    };
  } catch {
    return { status: "unknown", organizationId, code: "DATABASE_UNAVAILABLE" };
  }
}

function equality(alias: string, row: Row) {
  const entries = Object.entries(row);
  return {
    sql: entries.map(([key]) => `${alias}.${key} IS ?`).join(" AND "),
    args: entries.map(([, value]) => value),
  };
}
function snapshotFence(target: Snapshot) {
  const d = equality("d", target.declaration),
    s = equality("s", target.sender),
    g = equality("g", target.generation);
  // Bind the ordered snapshot once: sixteen policy rows exceed D1's bind limit
  // when every immutable field is passed as its own SQL parameter.
  const columns = Object.keys(target.policies[0]).sort();
  const object = columns.map((column) => `'${column}',p.${column}`).join(",");
  return {
    sql: `EXISTS(SELECT 1 FROM (${active}) a WHERE a.organization_id=?) AND EXISTS(SELECT 1 FROM postal_sender_declarations d WHERE ${d.sql}) AND EXISTS(SELECT 1 FROM senders s WHERE ${s.sql}) AND EXISTS(SELECT 1 FROM postal_setup_policy_generations g WHERE ${g.sql}) AND (SELECT json_group_array(json(snapshot)) FROM (SELECT json_object(${object}) snapshot FROM trusted_delivery_costs p WHERE p.organization_id=? AND p.id IN (SELECT value FROM json_each(?)) ORDER BY p.id))=?`,
    args: [
      target.generation.organization_id,
      ...d.args,
      ...s.args,
      ...g.args,
      target.generation.organization_id,
      target.generation.policy_ids_json,
      canonicalJson(target.policies),
    ],
  };
}
function activeQuoteSql() {
  return `NOT EXISTS(SELECT 1 FROM live_delivery_quotes q JOIN dispatches d ON d.organization_id=q.organization_id AND d.id=q.dispatch_id WHERE q.organization_id=? AND q.policy_id IN (SELECT value FROM json_each(?)) AND ((d.status='prepared' AND q.expires_at>?) OR d.status IN ('queued','submitting','submission_unknown')))`;
}
function exactProfile(readiness: PingenReadiness, target: Snapshot) {
  const actual = readiness.organisation;
  return (
    readiness.status === "ok" &&
    readiness.authenticated &&
    actual?.configuredIdMatches &&
    actual.billingCurrency === target.profile.billingCurrency &&
    actual.defaultCountry === target.profile.defaultCountry &&
    actual.defaultAddressPosition === target.profile.addressPosition
  );
}

/** Reinspect one existing profile; never transfer a document, enable a channel or renew consent. */
async function refreshPostalPoliciesInternal(
  env: Env,
  dependencies: Dependencies = {},
) {
  const counts = {
    postalPoliciesRefreshed: 0,
    postalPolicyRefreshFailed: 0,
    postalPolicyRefreshDeferred: 0,
  };
  if (
    env.MODE !== "production" ||
    env.ENVIRONMENT !== "production" ||
    !transportConsumed(env) ||
    !env.PINGEN_ORGANIZATION_ID
  )
    return counts;
  const now = dependencies.now ?? Date.now;
  const started = new Date(now()).toISOString();
  const window = new Date(now() + 7 * DAY).toISOString();
  const candidate = await env.DB.prepare(
    `SELECT a.organization_id FROM (${active}) a JOIN postal_setup_policy_generations g ON g.organization_id=a.organization_id AND g.generation=(SELECT MAX(latest.generation) FROM postal_setup_policy_generations latest WHERE latest.organization_id=a.organization_id) LEFT JOIN postal_policy_refresh_state state ON state.organization_id=a.organization_id WHERE g.expires_at<=? AND (state.next_due_at IS NULL OR state.next_due_at<=?) AND (state.lease_until IS NULL OR state.lease_until<=?) ORDER BY g.expires_at,a.organization_id LIMIT 1`,
  )
    .bind(window, started, started)
    .first<{ organization_id: string }>();
  if (!candidate) return counts;
  const org = candidate.organization_id;
  const token = crypto.randomUUID();
  const until = new Date(now() + 60_000).toISOString();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO postal_policy_refresh_state(organization_id,next_due_at) VALUES(?,?)",
  )
    .bind(org, started)
    .run();
  const claim = await env.DB.prepare(
    "UPDATE postal_policy_refresh_state SET lease_token=?,lease_until=?,last_attempt_at=? WHERE organization_id=? AND next_due_at<=? AND (lease_until IS NULL OR lease_until<=?)",
  )
    .bind(token, until, started, org, started, started)
    .run();
  if (!claim.meta.changes) return counts;
  const finish = async (code: ErrorCode, deferred = false) => {
    const row = await env.DB.prepare(
      "SELECT failure_count FROM postal_policy_refresh_state WHERE organization_id=? AND lease_token=?",
    )
      .bind(org, token)
      .first<{ failure_count: number }>();
    const failures = Math.min(
      16,
      (row?.failure_count ?? 0) + (deferred ? 0 : 1),
    );
    const delay = deferred
      ? 3_600_000
      : Math.min(24, 2 ** Math.min(failures - 1, 5)) * 3_600_000;
    await env.DB.prepare(
      "UPDATE postal_policy_refresh_state SET last_error_code=?,failure_count=?,next_due_at=?,lease_token=NULL,lease_until=NULL WHERE organization_id=? AND lease_token=?",
    )
      .bind(code, failures, new Date(now() + delay).toISOString(), org, token)
      .run();
    if (deferred) counts.postalPolicyRefreshDeferred++;
    else counts.postalPolicyRefreshFailed++;
  };
  try {
    const target = await snapshot(env, org);
    if (!target) {
      await finish("BINDING_CHANGED");
      return counts;
    }
    const noQuotes = activeQuoteSql();
    if (
      !(await env.DB.prepare(`SELECT 1 WHERE ${noQuotes}`)
        .bind(org, target.generation.policy_ids_json, started)
        .first())
    ) {
      await finish("QUOTE_ACTIVE", true);
      return counts;
    }
    const inspected = await (dependencies.inspect ?? inspectPingenReadiness)(
      {
        clientId: env.PINGEN_CLIENT_ID ?? "",
        clientSecret: env.PINGEN_CLIENT_SECRET ?? "",
        organisationId: env.PINGEN_ORGANIZATION_ID,
        sandbox: false,
      },
      dependencies.fetcher,
    );
    if (inspected.status !== "ok") {
      await finish("PROFILE_UNAVAILABLE");
      return counts;
    }
    if (!exactProfile(inspected, target)) {
      await finish("PROFILE_CHANGED");
      return counts;
    }
    if (
      !transportConsumed(env) ||
      target.profile.accountId !== env.PINGEN_ORGANIZATION_ID ||
      target.profile.defaultCountry !== env.PINGEN_DEFAULT_COUNTRY
    ) {
      await finish("COMMIT_CHANGED", true);
      return counts;
    }
    const timestamp = new Date(now()).toISOString(),
      expiry = new Date(now() + 90 * DAY).toISOString();
    const fence = snapshotFence(target),
      auditId = `audit_${crypto.randomUUID()}`;
    const marker =
      "EXISTS(SELECT 1 FROM audit_log WHERE organization_id=? AND id=?)";
    const statements = [
      env.DB.prepare(
        `INSERT INTO audit_log(id,organization_id,user_id,action,resource_id,details_json,created_at) SELECT ?,?,NULL,'postal.setup.profile_refreshed',?,?,? WHERE ${fence.sql} AND ${noQuotes} AND EXISTS(SELECT 1 FROM postal_policy_refresh_state WHERE organization_id=? AND lease_token=? AND lease_until>?)`,
      ).bind(
        auditId,
        org,
        target.sender.id,
        canonicalJson({
          method: "automatic_read_only_profile_reinspection",
          priorGeneration: target.generation.generation,
          humanConsentClaimed: false,
        }),
        timestamp,
        ...fence.args,
        org,
        target.generation.policy_ids_json,
        timestamp,
        org,
        token,
        timestamp,
      ),
      env.DB.prepare(
        `UPDATE trusted_delivery_costs SET status='revoked' WHERE organization_id=? AND id IN (SELECT value FROM json_each(?)) AND ${marker}`,
      ).bind(org, target.generation.policy_ids_json, org, auditId),
    ];
    const ids: string[] = [];
    for (const old of target.policies) {
      const row = {
        ...old,
        id: `cost_${crypto.randomUUID()}`,
        valid_from: timestamp,
        expires_at: expiry,
        created_at: timestamp,
      };
      ids.push(row.id);
      const keys = Object.keys(row);
      statements.push(
        env.DB.prepare(
          `INSERT INTO trusted_delivery_costs(${keys.join(",")}) SELECT ${keys.map(() => "?").join(",")} WHERE ${marker}`,
        ).bind(...Object.values(row), org, auditId),
      );
    }
    statements.push(
      env.DB.prepare(
        `INSERT INTO postal_setup_policy_generations(organization_id,generation,sender_id,policy_ids_json,profile_json,audit_id,created_at,expires_at) SELECT ?,?,?,?,?,?,?,? WHERE ${marker}`,
      ).bind(
        org,
        Number(target.generation.generation) + 1,
        target.sender.id,
        canonicalJson(ids),
        target.generation.profile_json,
        auditId,
        timestamp,
        expiry,
        org,
        auditId,
      ),
    );
    statements.push(
      env.DB.prepare(
        `UPDATE postal_policy_refresh_state SET last_success_at=?,last_error_code=NULL,failure_count=0,next_due_at=?,lease_token=NULL,lease_until=NULL WHERE organization_id=? AND lease_token=? AND ${marker}`,
      ).bind(
        timestamp,
        new Date(now() + DAY).toISOString(),
        org,
        token,
        org,
        auditId,
      ),
    );
    const result = await env.DB.batch(statements);
    if (!result[0].meta.changes) await finish("COMMIT_CHANGED", true);
    else counts.postalPoliciesRefreshed++;
  } catch {
    await finish("DATABASE_UNAVAILABLE");
  }
  return counts;
}

/** A rolling schema gap must not stop unrelated scheduled maintenance. */
export async function refreshPostalPolicies(
  env: Env,
  dependencies: Dependencies = {},
) {
  try {
    return await refreshPostalPoliciesInternal(env, dependencies);
  } catch {
    return {
      postalPoliciesRefreshed: 0,
      postalPolicyRefreshFailed: 1,
      postalPolicyRefreshDeferred: 0,
    };
  }
}
