import { canonicalJson, sha256 } from "../../../packages/domain/src/index";
import { telnyxAccountReference } from "../../../packages/providers/telnyx-readiness";
import { PingenPostalProvider } from "../../../packages/providers";
import type { Env } from "./env";
import type { FreshnessEvaluation, FreshnessFamily } from "./freshness-alerts";
import {
  createLiveDeliveryQuoteConfig,
  liveSendingEnabled,
} from "./live-providers";
import { inspectPostalPolicyDeadline } from "./postal-policy-refresh";
import { readResendPolicyFreshness } from "./resend-policy-refresh";
import { resendConfigured, resendIdentity } from "./resend-environment";

const PAGE_SIZE = 6;
type Mechanism =
  "fax" | "fax_manual" | "fax_legacy" | "postal" | "resend" | "delivery_manual";
type Selection = "active" | "inactive" | "unknown";
type Target = { organization_id: string; target_id: string };
type Cursor = { after_organization_id: string; after_target_id: string };
type Row = Record<string, string | number | null>;
type Dependencies = {
  now?: () => number;
  inspectPostal?: typeof inspectPostalPolicyDeadline;
  readResend?: typeof readResendPolicyFreshness;
};
export interface ProviderFreshnessResult {
  evaluations: FreshnessEvaluation[];
  freshnessChecksFailed: number;
}
const stamp = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const hash = /^[a-f0-9]{64}$/;
const sourceQueries: Record<Mechanism, string> = {
  fax: "SELECT organization_id,id AS target_id FROM fax_tariff_refresh_sources",
  fax_manual:
    "SELECT organization_id,id AS target_id FROM trusted_fax_usage_tariffs WHERE execution_scope='live' AND route_qualification='provider_verified'",
  fax_legacy:
    "SELECT organization_id,id AS target_id FROM trusted_fax_supplier_costs",
  postal:
    "SELECT organization_id,'' AS target_id FROM postal_sender_declarations UNION SELECT organization_id,'' AS target_id FROM postal_setup_policy_generations UNION SELECT organization_id,'' AS target_id FROM provider_freshness_bindings WHERE family='delivery_policy'",
  resend:
    "SELECT o.id AS organization_id,'' AS target_id FROM organizations o JOIN channel_controls c ON c.organization_id=o.id AND c.channel='email' WHERE o.mode='production' UNION SELECT organization_id,'' AS target_id FROM trusted_delivery_costs WHERE channel='email' AND provider='resend' UNION SELECT organization_id,'' AS target_id FROM provider_freshness_bindings WHERE family IN ('resend_tariff','resend_send_limits')",
  delivery_manual:
    "SELECT organization_id,id AS target_id FROM trusted_delivery_costs WHERE NOT EXISTS(SELECT 1 FROM postal_setup_policy_generations g,json_each(g.policy_ids_json) p WHERE g.organization_id=trusted_delivery_costs.organization_id AND p.value=trusted_delivery_costs.id)",
};

/** A lost credential or malformed configuration is not a proven deselection. */
function selection(env: Env, channel: "fax" | "email" | "postal"): Selection {
  if (
    env.LIVE_SENDS_ENABLED === undefined ||
    env.LIVE_SENDS_ENABLED === "false"
  )
    return "inactive";
  if (env.LIVE_SENDS_ENABLED !== "true") return "unknown";
  if (env.LIVE_SEND_CHANNELS !== undefined) {
    const channels = env.LIVE_SEND_CHANNELS.split(",").map((value) =>
      value.trim(),
    );
    if (
      !channels.length ||
      channels.some((value) => !["fax", "email", "postal"].includes(value))
    )
      return "unknown";
    if (!channels.includes(channel)) return "inactive";
  }
  if (channel === "email" && env.EMAIL_PROVIDER === "resend") {
    if (
      env.RESEND_SENDS_ENABLED === undefined ||
      env.RESEND_SENDS_ENABLED === "false"
    )
      return "inactive";
    if (env.RESEND_SENDS_ENABLED !== "true") return "unknown";
  }
  if (channel === "postal") {
    if (
      env.POSTAL_DRAFTS_ENABLED === undefined ||
      env.POSTAL_DRAFTS_ENABLED === "false"
    )
      return "inactive";
    if (env.POSTAL_DRAFTS_ENABLED !== "true") return "unknown";
  }
  return liveSendingEnabled(env, channel) ? "active" : "unknown";
}
/** Price preparation does not consume the final-send switch or allowlist. */
function preparationSelection(
  env: Env,
  channel: "email" | "postal",
): Selection {
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
  if (channel === "postal") {
    if (
      env.POSTAL_DRAFTS_ENABLED === undefined ||
      env.POSTAL_DRAFTS_ENABLED === "false" ||
      env.PINGEN_SANDBOX === "true"
    )
      return "inactive";
    if (env.POSTAL_DRAFTS_ENABLED !== "true" || env.PINGEN_SANDBOX !== "false")
      return "unknown";
  }
  return "active";
}
async function blank(
  org: string,
  family: FreshnessFamily,
  mechanism: string,
): Promise<FreshnessEvaluation> {
  return {
    organizationId: org,
    family,
    bindingSha256: await sha256(
      canonicalJson({ organizationId: org, family, mechanism }),
    ),
    active: false,
    candidates: [],
  };
}
async function setCandidate(
  value: FreshnessEvaluation,
  revision: unknown,
  deadline: unknown,
  mode: "automatic" | "operator",
) {
  if (!stamp(deadline)) return false;
  value.active = true;
  value.candidates = [
    { revisionSha256: await sha256(canonicalJson(revision)), deadline, mode },
  ];
  return true;
}
async function page(db: D1Database, mechanism: Mechanism) {
  const previous = await db
    .prepare(
      "SELECT after_organization_id,after_target_id FROM provider_freshness_cursors WHERE mechanism=?",
    )
    .bind(mechanism)
    .first<Cursor>();
  const cursor = previous ?? { after_organization_id: "", after_target_id: "" };
  if (
    !Object.values(cursor).every(
      (value) => typeof value === "string" && value.length <= 200,
    )
  )
    throw new Error("FRESHNESS_CURSOR_INVALID");
  const query =
    "SELECT organization_id,target_id FROM (" +
    sourceQueries[mechanism] +
    ") WHERE organization_id>? OR (organization_id=? AND target_id>?) ORDER BY organization_id,target_id LIMIT " +
    (PAGE_SIZE + 1);
  let rows = await db
    .prepare(query)
    .bind(
      cursor.after_organization_id,
      cursor.after_organization_id,
      cursor.after_target_id,
    )
    .all<Target>();
  if (
    !rows.results.length &&
    (cursor.after_organization_id || cursor.after_target_id)
  )
    rows = await db.prepare(query).bind("", "", "").all<Target>();
  const targets = rows.results.slice(0, PAGE_SIZE),
    last = targets.at(-1);
  const next =
    rows.results.length > PAGE_SIZE && last
      ? {
          after_organization_id: last.organization_id,
          after_target_id: last.target_id,
        }
      : { after_organization_id: "", after_target_id: "" };
  return { targets, cursor, next };
}
async function advance(
  db: D1Database,
  mechanism: Mechanism,
  cursor: Cursor,
  next: Cursor,
  now: string,
) {
  const saved = await db
    .prepare(
      "INSERT INTO provider_freshness_cursors(mechanism,after_organization_id,after_target_id,updated_at) VALUES(?,?,?,?) ON CONFLICT(mechanism) DO UPDATE SET after_organization_id=excluded.after_organization_id,after_target_id=excluded.after_target_id,updated_at=excluded.updated_at WHERE provider_freshness_cursors.after_organization_id=? AND provider_freshness_cursors.after_target_id=? AND provider_freshness_cursors.updated_at<=excluded.updated_at",
    )
    .bind(
      mechanism,
      next.after_organization_id,
      next.after_target_id,
      now,
      cursor.after_organization_id,
      cursor.after_target_id,
    )
    .run();
  if (saved.meta.changes !== 1) throw new Error("FRESHNESS_CURSOR_CHANGED");
}
const routeKeys = [
  "organization_id",
  "sender_id",
  "account_id",
  "connection_id",
  "outbound_profile_id",
  "destination_prefix",
  "options_json",
] as const;
const anchorKeys = [
  "provider",
  "sender_prefix",
  "sender_country_code",
  "destination_country_code",
  "origin_class",
  "destination_category",
  "route_allowed",
  "local_calling_verified",
  "route_qualification",
  "operator_authorization_reference",
  "operator_test_ceiling_minor",
  "initial_seconds",
  "increment_seconds",
  "duration_base_seconds",
  "duration_low_per_page_seconds",
  "duration_high_per_page_seconds",
  "max_pages",
  "quote_ttl_seconds",
] as const;
async function faxRuntime(
  env: Env,
  row: Row,
  usesProfile = true,
): Promise<Selection> {
  const state = selection(env, "fax");
  if (state !== "active") return state;
  if (
    !env.TELNYX_API_KEY ||
    !env.TELNYX_PUBLIC_KEY ||
    !env.TELNYX_ACCOUNT_ID ||
    !env.TELNYX_CONNECTION_ID ||
    (usesProfile && !env.TELNYX_OUTBOUND_VOICE_PROFILE_ID) ||
    !/^\+[1-9]\d{7,14}$/.test(env.TELNYX_FROM ?? "")
  )
    return "unknown";
  const account = await telnyxAccountReference(env.TELNYX_PUBLIC_KEY);
  if (!account || account !== env.TELNYX_ACCOUNT_ID) return "unknown";
  const prefixes = env.TELNYX_ALLOWED_PREFIXES?.split(",").map((value) =>
    value.trim(),
  );
  if (
    !prefixes?.length ||
    prefixes.some((value) => !["+33", "+352", "+49"].includes(value))
  )
    return "unknown";
  return row.account_id === account &&
    row.connection_id === env.TELNYX_CONNECTION_ID &&
    (!usesProfile ||
      row.outbound_profile_id === env.TELNYX_OUTBOUND_VOICE_PROFILE_ID) &&
    row.sender_address === env.TELNYX_FROM &&
    prefixes.some((prefix) => String(row.destination_prefix).startsWith(prefix))
    ? "active"
    : "inactive";
}
function tenantState(row: Row, finalSending = true): Selection {
  if (
    row.organization_mode === "simulation" ||
    (finalSending && row.channel_enabled === 0) ||
    row.sender_status === "disabled" ||
    row.sender_mode === "simulation"
  )
    return "inactive";
  return row.organization_mode === "production" &&
    (!finalSending || row.channel_enabled === 1) &&
    row.sender_status === "verified" &&
    row.sender_mode === "production"
    ? "active"
    : "unknown";
}
async function faxRegistered(
  env: Env,
  target: Target,
  now: string,
): Promise<FreshnessEvaluation[] | null> {
  const tariff = await blank(
    target.organization_id,
    "fax_tariff",
    "registered_fax:" + target.target_id,
  );
  const authority = await blank(
    target.organization_id,
    "fax_authority",
    "registered_fax:" + target.target_id,
  );
  const source = await env.DB.prepare(
    "SELECT source.*,o.mode AS organization_mode,s.address AS sender_address,s.status AS sender_status,s.mode AS sender_mode,c.enabled AS channel_enabled,EXISTS(SELECT 1 FROM valid_fax_tariff_refresh_sources valid WHERE valid.organization_id=source.organization_id AND valid.id=source.id) AS valid_source FROM fax_tariff_refresh_sources source JOIN organizations o ON o.id=source.organization_id LEFT JOIN senders s ON s.organization_id=source.organization_id AND s.id=source.sender_id AND s.channel='fax' LEFT JOIN channel_controls c ON c.organization_id=source.organization_id AND c.channel='fax' WHERE source.organization_id=? AND source.id=?",
  )
    .bind(target.organization_id, target.target_id)
    .first<Row>();
  if (!source) return null;
  const local = tenantState(source),
    runtime = await faxRuntime(env, source);
  if (local === "inactive" || runtime === "inactive")
    return [tariff, authority];
  if (
    !["active", "revoked"].includes(String(source.status)) ||
    local !== "active" ||
    runtime !== "active" ||
    (source.status === "active" && source.valid_source !== 1)
  )
    return null;
  const where = routeKeys.map((key) => key + "=?").join(" AND ");
  const [rows, anchors] = await env.DB.batch([
    env.DB.prepare(
      "SELECT * FROM trusted_fax_usage_tariffs WHERE " +
        where +
        " ORDER BY (status='qualified') DESC,created_at DESC,id DESC LIMIT 1",
    ).bind(...routeKeys.map((key) => source[key])),
    env.DB.prepare(
      "SELECT * FROM trusted_fax_usage_tariffs WHERE organization_id=? AND id=?",
    ).bind(target.organization_id, source.initial_tariff_id),
  ]);
  const current = rows.results[0] as Row | undefined,
    anchor = anchors.results[0] as Row | undefined;
  if (current?.status === "revoked") return [tariff, authority];
  if (
    !current ||
    !anchor ||
    current.status !== "qualified" ||
    current.execution_scope !== "live" ||
    current.provider !== "telnyx" ||
    current.route_allowed !== 1 ||
    String(current.valid_from) > now ||
    anchorKeys.some((key) => current[key] !== anchor[key]) ||
    !stamp(current.expires_at) ||
    !stamp(source.authorization_expires_at) ||
    !hash.test(String(current.source_sha256))
  )
    return null;
  if (source.status === "revoked")
    return (await setCandidate(tariff, current, current.expires_at, "operator"))
      ? [tariff, authority]
      : null;
  if (current.expires_at > source.authorization_expires_at) return null;
  if (
    !(await setCandidate(
      authority,
      {
        registration: source.id,
        authorization: source.authorization_reference,
        deadline: source.authorization_expires_at,
        route: routeKeys.map((key) => source[key]),
      },
      source.authorization_expires_at,
      "operator",
    ))
  )
    return null;
  if (
    current.expires_at < source.authorization_expires_at &&
    !(await setCandidate(tariff, current, current.expires_at, "automatic"))
  )
    return null;
  return [tariff, authority];
}
async function faxManual(
  env: Env,
  target: Target,
  now: string,
): Promise<FreshnessEvaluation[] | null> {
  const value = await blank(
    target.organization_id,
    "fax_tariff",
    "manual_fax:" + target.target_id,
  );
  const row = await env.DB.prepare(
    "SELECT t.*,o.mode AS organization_mode,s.address AS sender_address,s.status AS sender_status,s.mode AS sender_mode,c.enabled AS channel_enabled FROM trusted_fax_usage_tariffs t JOIN organizations o ON o.id=t.organization_id LEFT JOIN senders s ON s.organization_id=t.organization_id AND s.id=t.sender_id AND s.channel='fax' LEFT JOIN channel_controls c ON c.organization_id=t.organization_id AND c.channel='fax' WHERE t.organization_id=? AND t.id=?",
  )
    .bind(target.organization_id, target.target_id)
    .first<Row>();
  if (!row) return null;
  const local = tenantState(row),
    runtime = await faxRuntime(env, row);
  if (
    row.status === "revoked" ||
    local === "inactive" ||
    runtime === "inactive"
  )
    return [value];
  if (
    local !== "active" ||
    runtime !== "active" ||
    row.status !== "qualified" ||
    row.execution_scope !== "live" ||
    row.route_qualification !== "provider_verified" ||
    String(row.valid_from) > now ||
    !hash.test(String(row.source_sha256))
  )
    return null;
  // This immutable explicit prohibition rejects preparation before price expiry.
  if (row.route_allowed === 0) return [value];
  if (row.route_allowed !== 1) return null;
  return (await setCandidate(value, row, row.expires_at, "operator"))
    ? [value]
    : null;
}
async function faxLegacy(
  env: Env,
  target: Target,
  now: string,
): Promise<FreshnessEvaluation[] | null> {
  const value = await blank(
    target.organization_id,
    "fax_tariff",
    "manual_legacy_fax:" + target.target_id,
  );
  const row = await env.DB.prepare(
    "SELECT t.*,o.mode AS organization_mode,s.address AS sender_address,s.status AS sender_status,s.mode AS sender_mode,c.enabled AS channel_enabled,EXISTS(SELECT 1 FROM trusted_fax_usage_tariffs v WHERE v.organization_id=t.organization_id AND v.sender_id=t.sender_id AND v.account_id=t.account_id AND v.connection_id=t.connection_id) AS v3_owned FROM trusted_fax_supplier_costs t JOIN organizations o ON o.id=t.organization_id LEFT JOIN senders s ON s.organization_id=t.organization_id AND s.id=t.sender_id AND s.channel='fax' LEFT JOIN channel_controls c ON c.organization_id=t.organization_id AND c.channel='fax' WHERE t.organization_id=? AND t.id=?",
  )
    .bind(target.organization_id, target.target_id)
    .first<Row>();
  if (!row) return null;
  const local = tenantState(row),
    runtime = await faxRuntime(env, row, false);
  if (
    row.status === "revoked" ||
    row.v3_owned === 1 ||
    local === "inactive" ||
    runtime === "inactive"
  )
    return [value];
  if (
    local !== "active" ||
    runtime !== "active" ||
    row.status !== "qualified" ||
    row.provider !== "telnyx" ||
    row.cost_basis !== "guaranteed_final_supplier_total" ||
    row.fiscal_basis !== "tax_inclusive_totals" ||
    row.currency_basis !== "same_currency_no_fx" ||
    row.currency !== "EUR" ||
    String(row.valid_from) > now ||
    !hash.test(String(row.source_sha256))
  )
    return null;
  return (await setCandidate(value, row, row.expires_at, "operator"))
    ? [value]
    : null;
}
async function isAutomaticResend(row: Row) {
  if (row.provider !== "resend") return false;
  const identity = {
    provider: "resend",
    accountId: row.account_id,
    routeId: row.route_id,
  };
  return (
    row.id ===
    "resend_" +
      (
        await sha256(
          canonicalJson({
            organizationId: row.organization_id,
            identity,
            sourceHash: row.source_sha256,
            until: row.expires_at,
          }),
        )
      ).slice(0, 32)
  );
}
async function manualDelivery(
  env: Env,
  target: Target,
  now: string,
): Promise<FreshnessEvaluation[] | null> {
  const value = await blank(
    target.organization_id,
    "delivery_policy",
    "manual_delivery:" + target.target_id,
  );
  const row = await env.DB.prepare(
    "SELECT p.*,o.mode AS organization_mode,s.address AS sender_address,s.status AS sender_status,s.mode AS sender_mode,c.enabled AS channel_enabled FROM trusted_delivery_costs p JOIN organizations o ON o.id=p.organization_id LEFT JOIN senders s ON s.organization_id=p.organization_id AND s.id=p.sender_id AND s.channel=p.channel LEFT JOIN channel_controls c ON c.organization_id=p.organization_id AND c.channel=p.channel WHERE p.organization_id=? AND p.id=?",
  )
    .bind(target.organization_id, target.target_id)
    .first<Row>();
  if (!row) return null;
  if (
    (await isAutomaticResend(row)) &&
    env.RESEND_SENDS_ENABLED === "true" &&
    resendConfigured(env)
  ) {
    const producer = await env.DB.prepare(
      "SELECT 1 WHERE EXISTS(SELECT 1 FROM memberships WHERE organization_id=? AND role IN ('admin','supervisor','member')) AND NOT EXISTS(SELECT 1 FROM audit_log WHERE organization_id=? AND action='channel.control' AND resource_id='email' AND json_extract(details_json,'$.enabled')=0)",
    )
      .bind(target.organization_id, target.organization_id)
      .first();
    if (producer) return [value];
  }
  if (!["email", "postal"].includes(String(row.channel))) return null;
  const channel = row.channel as "email" | "postal",
    local = tenantState(row, false),
    runtime = preparationSelection(env, channel);
  if (
    row.status === "revoked" ||
    local === "inactive" ||
    runtime === "inactive"
  )
    return [value];
  if (
    local !== "active" ||
    runtime !== "active" ||
    row.status !== "qualified" ||
    String(row.valid_from) > now
  )
    return null;
  const selectedProvider =
    channel === "postal" ? "pingen" : (env.EMAIL_PROVIDER ?? "ses");
  if (!["ses", "resend", "pingen"].includes(selectedProvider)) return null;
  if (row.provider !== selectedProvider) return [value];
  const identity =
    createLiveDeliveryQuoteConfig(env).liveDeliveryIdentity[channel];
  if (!identity) return null;
  if (
    row.account_id !== identity.accountId ||
    row.route_id !== identity.routeId
  )
    return [value];
  if (
    selectedProvider === "pingen" &&
    (!env.PINGEN_CLIENT_ID ||
      !env.PINGEN_CLIENT_SECRET ||
      env.PINGEN_SANDBOX !== "false")
  )
    return null;
  if (selectedProvider === "pingen")
    new PingenPostalProvider({
      clientId: env.PINGEN_CLIENT_ID!,
      clientSecret: env.PINGEN_CLIENT_SECRET!,
      organisationId: env.PINGEN_ORGANIZATION_ID!,
      sandbox: false,
      uploadOrigins: (env.PINGEN_UPLOAD_ORIGINS ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    });
  if (!hash.test(String(row.source_sha256))) return null;
  return (await setCandidate(value, row, row.expires_at, "operator"))
    ? [value]
    : null;
}
type ResendEvidence = {
  status?: Selection;
  tariffStatus?: Selection;
  limitsStatus?: Selection;
  blocked?: boolean;
  universalBlocked?: boolean;
  tariffBlocked?: boolean;
  limitsBlocked?: boolean;
  applicable: boolean;
  tariffExpiresAt: string | null;
  limitsExpiresAt: string | null;
  tariffRevisionSha256?: string | null;
  limitsRevisionSha256?: string | null;
};
async function resendForTenant(
  env: Env,
  target: Target,
  evidence: ResendEvidence,
): Promise<{
  evaluations: FreshnessEvaluation[];
  freshnessChecksFailed: number;
} | null> {
  const tariff = await blank(
    target.organization_id,
    "resend_tariff",
    "resend_automatic_email",
  );
  const limits = await blank(
    target.organization_id,
    "resend_send_limits",
    "resend_account_limits",
  );
  if (env.EMAIL_PROVIDER === undefined || env.EMAIL_PROVIDER === "ses")
    return { evaluations: [tariff, limits], freshnessChecksFailed: 0 };
  if (
    env.EMAIL_PROVIDER !== "resend" ||
    preparationSelection(env, "email") !== "active" ||
    evidence.universalBlocked ||
    (evidence.blocked &&
      evidence.universalBlocked === undefined &&
      evidence.tariffBlocked === undefined &&
      evidence.limitsBlocked === undefined)
  )
    return null;
  const row = await env.DB.prepare(
    "SELECT o.mode,c.enabled,EXISTS(SELECT 1 FROM senders s WHERE s.organization_id=o.id AND s.channel='email' AND s.mode='production' AND s.status='verified' AND lower(s.address) LIKE '%@guteneo.com') AS verified_sender,EXISTS(SELECT 1 FROM memberships m WHERE m.organization_id=o.id AND m.role IN ('admin','supervisor','member')) AS eligible_member,EXISTS(SELECT 1 FROM memberships m WHERE m.organization_id=o.id AND m.role IN ('admin','supervisor','member') AND NOT EXISTS(SELECT 1 FROM prepare_only_users p WHERE p.user_id=m.user_id)) AS eligible_acceptor,EXISTS(SELECT 1 FROM audit_log a WHERE a.organization_id=o.id AND a.action='channel.control' AND a.resource_id='email' AND json_extract(a.details_json,'$.enabled')=0) AS automatic_stopped FROM organizations o LEFT JOIN channel_controls c ON c.organization_id=o.id AND c.channel='email' WHERE o.id=?",
  )
    .bind(target.organization_id)
    .first<Row>();
  if (!row) return null;
  if (row.mode === "simulation")
    return { evaluations: [tariff, limits], freshnessChecksFailed: 0 };
  if (
    row.mode !== "production" ||
    (!row.verified_sender && !row.eligible_member)
  )
    return null;
  const result = {
    evaluations: [] as FreshnessEvaluation[],
    freshnessChecksFailed: 0,
  };
  const acceptance = selection(env, "email");
  if (
    row.enabled === 0 ||
    row.eligible_acceptor === 0 ||
    acceptance === "inactive" ||
    evidence.limitsStatus === "inactive"
  )
    result.evaluations.push(limits);
  else if (
    row.enabled === 1 &&
    acceptance === "active" &&
    !evidence.limitsBlocked &&
    evidence.limitsStatus === "active" &&
    stamp(evidence.limitsExpiresAt) &&
    hash.test(evidence.limitsRevisionSha256 ?? "")
  ) {
    limits.active = true;
    limits.candidates = [
      {
        revisionSha256: evidence.limitsRevisionSha256!,
        deadline: evidence.limitsExpiresAt,
        mode: "automatic",
      },
    ];
    result.evaluations.push(limits);
  } else result.freshnessChecksFailed++;
  if (row.automatic_stopped === 1) {
    result.evaluations.push(tariff);
    return result;
  }
  const identity = resendIdentity(env);
  if (!identity) return null;
  const sender =
    "snd_email_" + (await sha256(target.organization_id)).slice(0, 24);
  const automaticSender = await env.DB.prepare(
    "SELECT status FROM senders WHERE organization_id=? AND id=? AND channel='email' AND mode='production'",
  )
    .bind(target.organization_id, sender)
    .first<{ status: string }>();
  if (automaticSender?.status === "disabled") {
    result.evaluations.push(tariff);
    return result;
  }
  const existing = await env.DB.prepare(
    "SELECT * FROM trusted_delivery_costs WHERE organization_id=? AND sender_id=? AND channel='email' AND provider='resend' AND account_id=? AND route_id=? AND options_json='{}' AND status='qualified'",
  )
    .bind(target.organization_id, sender, identity.accountId, identity.routeId)
    .first<Row>();
  if (existing && !(await isAutomaticResend(existing))) {
    result.evaluations.push(tariff);
    return result;
  }
  if (evidence.tariffStatus === "inactive") {
    result.evaluations.push(tariff);
    return result;
  }
  if (
    evidence.tariffBlocked ||
    evidence.tariffStatus !== "active" ||
    !stamp(evidence.tariffExpiresAt) ||
    !hash.test(evidence.tariffRevisionSha256 ?? "")
  ) {
    result.freshnessChecksFailed++;
    return result;
  }
  tariff.active = true;
  tariff.candidates = [
    {
      revisionSha256: evidence.tariffRevisionSha256!,
      deadline: evidence.tariffExpiresAt,
      mode: "automatic",
    },
  ];
  result.evaluations.push(tariff);
  return result;
}

/** Local reads and six progress cursors only: no network, send or permission.
 * Each inventory advances fairly; skipped/unknown targets never resolve an
 * incident, and a failed pass stays observable independently of its cursor. */
export async function collectProviderFreshness(
  env: Env,
  dependencies: Dependencies = {},
): Promise<ProviderFreshnessResult> {
  const result: ProviderFreshnessResult = {
    evaluations: [],
    freshnessChecksFailed: 0,
  };
  if (env.ENVIRONMENT !== "production" || env.MODE !== "production")
    return result;
  const clock = (dependencies.now ?? Date.now)();
  if (!Number.isFinite(clock) || Math.abs(clock) > 8.64e15)
    return { ...result, freshnessChecksFailed: 1 };
  const now = new Date(clock).toISOString();
  for (const mechanism of [
    "fax",
    "fax_manual",
    "fax_legacy",
    "postal",
    "resend",
    "delivery_manual",
  ] as const) {
    try {
      const batch = await page(env.DB, mechanism);
      let resend: ResendEvidence | null = null;
      if (mechanism === "resend" && batch.targets.length) {
        try {
          resend = (await (
            dependencies.readResend ?? readResendPolicyFreshness
          )(env, clock)) as ResendEvidence;
        } catch {
          result.freshnessChecksFailed++;
        }
      }
      for (const target of batch.targets) {
        try {
          let values: FreshnessEvaluation[] | null = null;
          if (mechanism === "fax")
            values = await faxRegistered(env, target, now);
          else if (mechanism === "fax_manual")
            values = await faxManual(env, target, now);
          else if (mechanism === "fax_legacy")
            values = await faxLegacy(env, target, now);
          else if (mechanism === "delivery_manual")
            values = await manualDelivery(env, target, now);
          else if (mechanism === "postal") {
            const value = await blank(
              target.organization_id,
              "delivery_policy",
              "pingen_current_setup",
            );
            const relevant = await env.DB.prepare(
              "SELECT 1 WHERE EXISTS(SELECT 1 FROM postal_sender_declarations WHERE organization_id=?) OR EXISTS(SELECT 1 FROM postal_setup_policy_generations WHERE organization_id=?) OR EXISTS(SELECT 1 FROM provider_freshness_bindings WHERE organization_id=? AND family='delivery_policy' AND binding_sha256=?)",
            )
              .bind(
                target.organization_id,
                target.organization_id,
                target.organization_id,
                value.bindingSha256,
              )
              .first();
            if (!relevant) {
              values = [];
            } else {
              const inspected = await (
                dependencies.inspectPostal ?? inspectPostalPolicyDeadline
              )(env, target.organization_id);
              if (inspected.status === "inactive") values = [value];
              else if (
                inspected.status === "active" &&
                stamp(inspected.expiresAt) &&
                hash.test(inspected.revisionSha256)
              ) {
                value.active = true;
                value.candidates = [
                  {
                    revisionSha256: inspected.revisionSha256,
                    deadline: inspected.expiresAt,
                    mode: "automatic",
                  },
                ];
                values = [value];
              }
            }
          } else if (resend) {
            const inspected = await resendForTenant(env, target, resend);
            values = inspected?.evaluations ?? null;
            result.freshnessChecksFailed +=
              inspected?.freshnessChecksFailed ?? 0;
          }
          if (values) result.evaluations.push(...values);
          else result.freshnessChecksFailed++;
        } catch {
          result.freshnessChecksFailed++;
        }
      }
      await advance(env.DB, mechanism, batch.cursor, batch.next, now);
    } catch {
      result.freshnessChecksFailed++;
    }
  }
  return result;
}
