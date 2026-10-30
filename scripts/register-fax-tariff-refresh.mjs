// One-time operator registration of the Global Conversational public catalogue.
// The CSV URL is an initial reviewed anchor, never a fallback for failed discovery.
// Registration neither refreshes a tariff nor qualifies negotiated supplier rates.
import { createHash } from "node:crypto";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { z } from "zod";
import {
  privateOperatorPath,
  readPrivateOperatorJson,
} from "./private-operator-files.mjs";

const id = z.string().regex(/^[a-zA-Z0-9_.:-]{1,200}$/),
  stamp = z.iso.datetime({ precision: 3 });
const configSchema = z
  .object({
    version: z.literal(1),
    sourceId: id,
    organizationId: id,
    initialTariffId: id,
    tariffCatalog: z.literal("global_conversational"),
    rateDeckUrl: z
      .string()
      .regex(
        /^https:\/\/portal\.telnyx\.com\/downloads\/global_conversational\/[A-Za-z0-9_-]+\.csv$/,
      ),
    authorizationExpiresAt: stamp,
    authorizationReference: z
      .string()
      .min(1)
      .max(500)
      .regex(/^[^\r\n\0]+$/),
    commercialBasis: z.literal("public_reference_not_negotiated"),
  })
  .strict();
const fail = (code) => {
  throw new Error(code);
};
const canonical = (value) =>
  Array.isArray(value)
    ? `[${value.map(canonical).join(",")}]`
    : value && typeof value === "object"
      ? `{${Object.keys(value)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
          .join(",")}}`
      : JSON.stringify(value);
export const faxTariffRegistrationDigest = (value) =>
  createHash("sha256").update(canonical(value)).digest("hex");
export function validateFaxTariffRegistration(input, now) {
  const parsed = configSchema.safeParse(input);
  if (
    !parsed.success ||
    !stamp.safeParse(now).success ||
    parsed.data.authorizationExpiresAt <= now ||
    parsed.data.authorizationExpiresAt > "2026-11-03T23:59:59.999Z"
  )
    fail("FAX_REFRESH_CONFIG_INVALID");
  return parsed.data;
}
const first = (db, sql, values) =>
  db
    .prepare(sql)
    .bind(...values)
    .first();
async function snapshot(db, c) {
  const [organization, tariff] = await Promise.all([
    first(db, "SELECT * FROM organizations WHERE id=?", [c.organizationId]),
    first(
      db,
      "SELECT * FROM trusted_fax_usage_tariffs WHERE organization_id=? AND id=?",
      [c.organizationId, c.initialTariffId],
    ),
  ]);
  const sender = tariff
    ? await first(
        db,
        "SELECT * FROM senders WHERE organization_id=? AND id=?",
        [c.organizationId, tariff.sender_id],
      )
    : null;
  const source = tariff
    ? await first(
        db,
        "SELECT * FROM fax_tariff_refresh_sources WHERE organization_id=? AND sender_id=? AND account_id=? AND connection_id=? AND outbound_profile_id=? AND destination_prefix=? AND options_json=?",
        [
          c.organizationId,
          tariff.sender_id,
          tariff.account_id,
          tariff.connection_id,
          tariff.outbound_profile_id,
          tariff.destination_prefix,
          tariff.options_json,
        ],
      )
    : null;
  return { organization, tariff, sender, source };
}
function validateSnapshot(s, c, now) {
  const t = s.tariff,
    sender = s.sender;
  if (
    s.organization?.mode !== "production" ||
    !t ||
    !sender ||
    (!s.source && t.status !== "qualified") ||
    t.valid_from > now ||
    t.execution_scope !== "live" ||
    t.provider !== "telnyx" ||
    t.route_qualification !== "operator_test" ||
    t.origin_class !== "local" ||
    t.sender_country_code !== "LU" ||
    t.destination_country_code !== "LU" ||
    t.destination_category !== "fixed" ||
    t.destination_prefix !== "+3524" ||
    t.options_json !== "{}" ||
    t.route_allowed !== 1 ||
    t.local_calling_verified !== 0 ||
    t.max_pages > 10 ||
    t.operator_test_ceiling_minor > 200 ||
    t.quote_ttl_seconds > 900 ||
    t.initial_seconds !== 60 ||
    t.increment_seconds !== 60 ||
    t.call_nano_usd !== 0 ||
    sender.channel !== "fax" ||
    sender.status !== "verified" ||
    sender.mode !== "production" ||
    !sender.address.startsWith(t.sender_prefix)
  )
    fail("FAX_REFRESH_TARGET_INVALID");
  if (
    s.source &&
    (s.source.id !== c.sourceId ||
      s.source.status !== "active" ||
      s.source.initial_tariff_id !== c.initialTariffId ||
      s.source.tariff_catalog !== c.tariffCatalog ||
      s.source.rate_deck_url !== c.rateDeckUrl ||
      s.source.authorization_expires_at !== c.authorizationExpiresAt ||
      s.source.authorization_reference !== c.authorizationReference ||
      s.source.commercial_basis !== c.commercialBasis)
  )
    fail("FAX_REFRESH_SOURCE_CONFLICT");
}
function makeSource(c, s, now) {
  return {
    id: c.sourceId,
    organization_id: c.organizationId,
    sender_id: s.tariff.sender_id,
    initial_tariff_id: c.initialTariffId,
    account_id: s.tariff.account_id,
    connection_id: s.tariff.connection_id,
    outbound_profile_id: s.tariff.outbound_profile_id,
    destination_prefix: s.tariff.destination_prefix,
    options_json: s.tariff.options_json,
    tariff_catalog: c.tariffCatalog,
    rate_deck_url: c.rateDeckUrl,
    authorization_expires_at: c.authorizationExpiresAt,
    authorization_reference: c.authorizationReference,
    commercial_basis: c.commercialBasis,
    status: "active",
    created_at: s.source?.created_at ?? now,
  };
}
const qualification =
  "registration_only_first_refresh_requires_current_catalog_source_and_provider_reads";
function discoveryPlan(c) {
  return {
    tariffCatalog: c.tariffCatalog,
    currentCatalogUrl: "https://api.telnyx.com/v2/tariffs",
    linkSelection: "data.global_conversational.tariff_link",
    initialRateDeckUrl: c.rateDeckUrl,
    fallbackToInitialRateDeck: false,
    standardApiKeyAccess: "unverified_by_registration",
  };
}
export async function planFaxTariffRefreshRegistration(
  db,
  input,
  now = new Date().toISOString(),
) {
  const config = validateFaxTariffRegistration(input, now),
    state = await snapshot(db, config);
  validateSnapshot(state, config, now);
  return {
    version: 1,
    kind: "fax_public_reference_refresh_registration",
    observedAt: now,
    config,
    snapshot: state,
    source: makeSource(config, state, now),
    discovery: discoveryPlan(config),
    qualification,
    applied: false,
  };
}
function conjunction(parts) {
  if (parts.length === 1) return parts[0];
  const mid = Math.floor(parts.length / 2);
  return `(${conjunction(parts.slice(0, mid))}) AND (${conjunction(parts.slice(mid))})`;
}
export async function applyFaxTariffRefreshRegistration(
  db,
  plan,
  digest,
  now = new Date().toISOString(),
) {
  if (
    !/^[a-f0-9]{64}$/.test(digest ?? "") ||
    faxTariffRegistrationDigest(plan) !== digest ||
    plan.version !== 1 ||
    plan.kind !== "fax_public_reference_refresh_registration" ||
    !stamp.safeParse(plan.observedAt).success ||
    plan.observedAt > now
  )
    fail("FAX_REFRESH_PLAN_INVALID");
  const c = validateFaxTariffRegistration(plan.config, now),
    current = await snapshot(db, c);
  if (
    canonical(plan.discovery) !== canonical(discoveryPlan(c)) ||
    plan.qualification !== qualification
  )
    fail("FAX_REFRESH_PLAN_INVALID");
  validateSnapshot(current, c, now);
  const expectedSource = makeSource(c, current, plan.observedAt);
  if (canonical(plan.source) !== canonical(expectedSource))
    fail("FAX_REFRESH_PLAN_INVALID");
  if (current.source) {
    if (canonical(current.source) !== canonical(plan.source))
      fail("FAX_REFRESH_SOURCE_CONFLICT");
    return { status: "already_applied", qualification: plan.qualification };
  }
  if (canonical(current) !== canonical(plan.snapshot))
    fail("FAX_REFRESH_STATE_CHANGED");
  const conditions = [],
    values = [];
  for (const [table, row] of [
    ["organizations", current.organization],
    ["trusted_fax_usage_tariffs", current.tariff],
    ["senders", current.sender],
  ]) {
    conditions.push(
      `EXISTS(SELECT 1 FROM ${table} WHERE ${conjunction(Object.keys(row).map((key) => `${key} IS ?`))})`,
    );
    values.push(...Object.values(row));
  }
  conditions.push(
    "NOT EXISTS(SELECT 1 FROM fax_tariff_refresh_sources WHERE organization_id=? AND sender_id=? AND account_id=? AND connection_id=? AND outbound_profile_id=? AND destination_prefix=? AND options_json=?)",
  );
  values.push(
    c.organizationId,
    current.tariff.sender_id,
    current.tariff.account_id,
    current.tariff.connection_id,
    current.tariff.outbound_profile_id,
    current.tariff.destination_prefix,
    current.tariff.options_json,
  );
  const columns = Object.keys(plan.source);
  await db
    .prepare(
      `INSERT INTO fax_tariff_refresh_sources(${columns.join(",")}) SELECT ${columns.map(() => "?").join(",")} WHERE ${conjunction(conditions)} ON CONFLICT DO NOTHING`,
    )
    .bind(...Object.values(plan.source), ...values)
    .run();
  const saved = await first(
    db,
    "SELECT * FROM valid_fax_tariff_refresh_sources WHERE organization_id=? AND id=?",
    [c.organizationId, c.sourceId],
  );
  if (!saved || canonical(saved) !== canonical(plan.source))
    fail("FAX_REFRESH_STATE_CHANGED");
  return { status: "applied", qualification: plan.qualification };
}
async function proxy() {
  const { getPlatformProxy } = await import("wrangler");
  const directory = await mkdtemp(
      join(tmpdir(), "guteneo-fax-refresh-operator-"),
    ),
    configPath = join(directory, "wrangler.json");
  await writeFile(
    configPath,
    JSON.stringify({
      name: "guteneo-fax-refresh-registration",
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
    fail("FAX_REFRESH_PRIVATE_BINDINGS_UNAVAILABLE");
  }
}
export async function main(args) {
  const applying = args[0] === "--apply";
  if (
    applying
      ? args.length !== 4 || args[2] !== "--reviewed-plan-sha256"
      : args.length !== 4 || args[0] !== "--config" || args[2] !== "--output"
  )
    fail("FAX_REFRESH_USAGE");
  let connection;
  try {
    const input = await readPrivateOperatorJson(args[1], "FAX_REFRESH");
    if (!applying) {
      const c = validateFaxTariffRegistration(input, new Date().toISOString()),
        output = await privateOperatorPath(args[3], "FAX_REFRESH");
      connection = await proxy();
      const plan = await planFaxTariffRefreshRegistration(connection.db, c);
      await writeFile(output, JSON.stringify(plan, null, 2) + "\n", {
        flag: "wx",
        mode: 0o600,
      });
      return {
        status: "plan_only",
        planSha256: faxTariffRegistrationDigest(plan),
        applied: false,
        qualification: plan.qualification,
      };
    }
    if (
      !/^[a-f0-9]{64}$/.test(args[3] ?? "") ||
      faxTariffRegistrationDigest(input) !== args[3]
    )
      fail("FAX_REFRESH_PLAN_INVALID");
    connection = await proxy();
    return await applyFaxTariffRefreshRegistration(
      connection.db,
      input,
      args[3],
    );
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
          code: "FAX_REFRESH_REGISTRATION_FAILED",
          detailsWithheld: true,
          blindRetryAllowed: false,
        }),
      );
      process.exitCode = 1;
    });
