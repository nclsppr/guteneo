// Private technical registration of existing references. No tariff or consent is created.
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { fetchEvidence, SOURCES } from "./qualify-review-fax.mjs";
import {
  privateOperatorPath,
  readPrivateOperatorJson,
} from "./private-operator-files.mjs";
import {
  parseEeaFaxRateDeck,
  parseReferencePagePrice,
  parseReferenceFx,
  validateEeaFaxReferenceScope,
} from "../packages/providers/fax-eea-reference.mjs";

const PREFIX = "VERIFIED_FAX_REGISTRATION";
const id = z.string().regex(/^[a-zA-Z0-9_.:-]{1,200}$/);
const configSchema = z
  .object({
    version: z.literal(1),
    sourceId: id,
    organizationId: id,
    initialTariffIds: z.array(id).length(14),
    exclusionTariffIds: z.array(id).length(4),
    commercialBasis: z.literal("public_reference_not_negotiated"),
  })
  .strict();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) =>
  Array.isArray(value)
    ? `[${value.map(canonical).join(",")}]`
    : value && typeof value === "object"
      ? `{${Object.keys(value)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
          .join(",")}}`
      : JSON.stringify(value);
const fail = (code) => {
  throw new Error(`${PREFIX}_${code}`);
};
const timestamp = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const deckUrl = (value) =>
  typeof value === "string" &&
  /^https:\/\/portal\.telnyx\.com\/downloads\/global_conversational\/[A-Za-z0-9_-]+\.csv$/.test(
    value,
  );
export const registrationPlanDigest = (plan) => sha256(canonical(plan));
export function validateRegistrationConfig(input) {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) fail("CONFIG_INVALID");
  const c = parsed.data;
  if (new Set([...c.initialTariffIds, ...c.exclusionTariffIds]).size !== 18)
    fail("CONFIG_INVALID");
  return {
    ...c,
    initialTariffIds: [...c.initialTariffIds].sort(),
    exclusionTariffIds: [...c.exclusionTariffIds].sort(),
  };
}
const first = (db, sql, values) =>
  db
    .prepare(sql)
    .bind(...values)
    .first();
async function readSnapshot(db, c) {
  const [organization, rows, source] = await Promise.all([
    first(db, "SELECT * FROM organizations WHERE id=?", [c.organizationId]),
    db
      .prepare(
        "SELECT * FROM trusted_fax_usage_tariffs WHERE organization_id=? AND id IN (SELECT value FROM json_each(?)) ORDER BY destination_prefix,id",
      )
      .bind(
        c.organizationId,
        JSON.stringify([...c.initialTariffIds, ...c.exclusionTariffIds]),
      )
      .all(),
    first(
      db,
      "SELECT * FROM verified_fax_reference_sets WHERE organization_id=? AND id=?",
      [c.organizationId, c.sourceId],
    ),
  ]);
  const bindings = rows.results.filter((row) =>
    c.initialTariffIds.includes(row.id),
  );
  const exclusions = rows.results.filter((row) =>
    c.exclusionTariffIds.includes(row.id),
  );
  const sender = bindings[0]
    ? await first(
        db,
        "SELECT * FROM senders WHERE organization_id=? AND id=?",
        [c.organizationId, bindings[0].sender_id],
      )
    : null;
  return { organization, sender, bindings, exclusions, source };
}
function validateSnapshot(s, c, now) {
  try {
    validateEeaFaxReferenceScope(s.bindings, s.exclusions);
  } catch {
    fail("TARGET_INVALID");
  }
  if (
    canonical(s.bindings.map((row) => row.id).sort()) !==
      canonical(c.initialTariffIds) ||
    canonical(s.exclusions.map((row) => row.id).sort()) !==
      canonical(c.exclusionTariffIds)
  )
    fail("TARGET_INVALID");
  if (
    s.organization?.id !== c.organizationId ||
    s.organization.mode !== "production" ||
    s.sender?.organization_id !== c.organizationId ||
    s.sender.id !== s.bindings[0].sender_id ||
    s.sender.channel !== "fax" ||
    s.sender.mode !== "production" ||
    s.sender.status !== "verified" ||
    !/^\+352\d{4,12}$/.test(s.sender.address ?? "")
  )
    fail("TARGET_INVALID");
  for (const t of [...s.bindings, ...s.exclusions]) {
    if (
      t.organization_id !== c.organizationId ||
      t.provider !== "telnyx" ||
      t.status !== "qualified" ||
      !timestamp(t.valid_from) ||
      t.valid_from > now ||
      !timestamp(t.expires_at) ||
      t.expires_at <= t.valid_from ||
      t.initial_seconds !== 60 ||
      t.increment_seconds !== 60 ||
      t.call_nano_usd !== 0 ||
      !Number.isInteger(t.max_pages) ||
      t.max_pages < 1 ||
      t.max_pages > 10 ||
      !Number.isInteger(t.quote_ttl_seconds) ||
      t.quote_ttl_seconds < 30 ||
      t.quote_ttl_seconds > 900 ||
      t.currency !== "USD" ||
      t.operator_authorization_reference !== null ||
      t.operator_test_ceiling_minor !== null ||
      t.review_authority_id !== null ||
      t.evidence_observed_at !== null ||
      !s.sender.address.startsWith(t.sender_prefix)
    )
      fail("TARGET_INVALID");
  }
}
function validateOwnership(inspection, s) {
  const t = s.bindings[0],
    profile = inspection?.outboundProfile;
  const partial =
    inspection?.status === "partial" &&
    canonical(inspection.errors) ===
      canonical([
        {
          stage: "outbound_profile",
          code: "invalid_response",
          invalidFields: ["daily_spend_limit"],
        },
      ]) &&
    profile?.dailySpendLimitEnabled === false;
  if (
    inspection?.provider !== "telnyx" ||
    inspection.mode !== "read_only" ||
    !(
      (inspection.status === "ok" &&
        Array.isArray(inspection.errors) &&
        inspection.errors.length === 0) ||
      partial
    ) ||
    inspection.accountReference !== t.account_id ||
    inspection.application?.id !== t.connection_id ||
    inspection.application.active !== true ||
    inspection.application.outboundVoiceProfileId !== t.outbound_profile_id ||
    profile?.id !== t.outbound_profile_id ||
    profile.enabled !== true ||
    !["FR", "DE"].every((country) =>
      profile.whitelistedDestinations?.includes(country),
    ) ||
    inspection.numberPagination?.complete !== true ||
    !inspection.numbers?.some(
      (number) =>
        number.phoneNumber === s.sender.address &&
        number.country === "LU" &&
        number.status === "active" &&
        number.features?.t38FaxGatewayEnabled === true,
    )
  )
    fail("PROVIDER_OWNERSHIP_INVALID");
}
function validateCatalog(catalog, now) {
  if (
    catalog?.provider !== "telnyx" ||
    catalog.mode !== "read_only" ||
    catalog.catalog !== "global_conversational" ||
    catalog.status !== "ok" ||
    !deckUrl(catalog.rateDeckUrl) ||
    !/^[a-f0-9]{64}$/.test(catalog.sha256 ?? "") ||
    !timestamp(catalog.observedAt) ||
    catalog.observedAt > now ||
    Date.parse(now) - Date.parse(catalog.observedAt) > 15 * 60_000
  )
    fail("CATALOG_INVALID");
}
const sourceFor = (c, s, at) => ({
  organization_id: c.organizationId,
  id: c.sourceId,
  sender_id: s.sender.id,
  sender_address_sha256: sha256(s.sender.address),
  account_id: s.bindings[0].account_id,
  connection_id: s.bindings[0].connection_id,
  outbound_profile_id: s.bindings[0].outbound_profile_id,
  options_json: "{}",
  bindings_json: canonical(s.bindings),
  exclusions_json: canonical(s.exclusions),
  commercial_basis: c.commercialBasis,
  status: "active",
  created_at: at,
});
async function qualification(sources, catalog, snapshot, observedAt) {
  const expected = {
    deck: catalog.rateDeckUrl,
    page: SOURCES.page,
    fx: SOURCES.fx,
  };
  for (const name of Object.keys(expected)) {
    const value = sources?.[name];
    if (
      !(value?.bytes instanceof Uint8Array) ||
      value.evidence?.url !== expected[name] ||
      value.evidence.bytes !== value.bytes.byteLength ||
      value.evidence.sha256 !== sha256(value.bytes)
    )
      fail("SOURCE_INVALID");
  }
  const parsed = await parseEeaFaxRateDeck(
    (async function* () {
      yield sources.deck.bytes;
    })(),
    snapshot.bindings,
    snapshot.exclusions,
  );
  return {
    catalog,
    observedAt,
    sources: Object.fromEntries(
      Object.keys(expected).map((name) => [name, sources[name].evidence]),
    ),
    routes: parsed.routes,
    relevantRows: parsed.relevantRows,
    pageNanoUsd: parseReferencePagePrice(sources.page.bytes),
    fx: parseReferenceFx(sources.fx.bytes, observedAt),
    commercialBasis: "public_reference_not_negotiated",
    callFeeBasis:
      "no_additional_reference_component_blank_is_not_zero_supplier_cost",
    registrationOnly: true,
    firstRefreshRequiresNewReads: true,
  };
}
export async function buildRegistrationPlan(
  input,
  snapshot,
  evidence,
  observedAt,
) {
  const config = validateRegistrationConfig(input);
  if (!timestamp(observedAt)) fail("PLAN_INVALID");
  validateSnapshot(snapshot, config, observedAt);
  if (snapshot.source) fail("SOURCE_CONFLICT");
  validateCatalog(evidence.catalog, observedAt);
  validateOwnership(evidence.inspection, snapshot);
  return {
    version: 1,
    kind: "verified_fax_reference_registration",
    config,
    observedAt,
    expiresAt: new Date(Date.parse(observedAt) + 15 * 60_000).toISOString(),
    snapshot,
    source: sourceFor(config, snapshot, observedAt),
    qualification: await qualification(
      evidence,
      evidence.catalog,
      snapshot,
      observedAt,
    ),
    applied: false,
  };
}
export async function prepareRegistrationPlan(
  db,
  providers,
  input,
  options = {},
) {
  const config = validateRegistrationConfig(input),
    now = options.now ?? (() => new Date().toISOString());
  const [snapshot, catalog, inspection] = await Promise.all([
    readSnapshot(db, config),
    providers.inspectTelnyxFaxTariffCatalog(),
    providers.inspectTelnyx(),
  ]);
  validateSnapshot(snapshot, config, now());
  validateCatalog(catalog, now());
  validateOwnership(inspection, snapshot);
  const [deck, page, fx] = await Promise.all([
    fetchEvidence(catalog.rateDeckUrl, 40 * 1024 * 1024, options.fetcher),
    fetchEvidence(SOURCES.page, 512 * 1024, options.fetcher),
    fetchEvidence(SOURCES.fx, 128 * 1024, options.fetcher),
  ]);
  const sources = { deck, page, fx };
  return {
    plan: await buildRegistrationPlan(
      config,
      snapshot,
      { ...sources, catalog, inspection },
      now(),
    ),
    sources,
  };
}
function conjunction(parts) {
  if (parts.length === 1) return parts[0];
  const middle = Math.floor(parts.length / 2);
  return `(${conjunction(parts.slice(0, middle))}) AND (${conjunction(parts.slice(middle))})`;
}
function rowGuard(table, row, jsonPath, alias) {
  const columns = Object.keys(row);
  if (!columns.length || columns.some((key) => !/^[a-z_][a-z0-9_]*$/.test(key)))
    fail("PLAN_INVALID");
  return `EXISTS(SELECT 1 FROM ${table} ${alias} WHERE ${conjunction(columns.map((key) => `${alias}.${key} IS json_extract(input.snapshot,'${jsonPath}.${key}')`))})`;
}
async function savedRegistration(db, c) {
  const [source, mappings] = await Promise.all([
    first(
      db,
      "SELECT * FROM verified_fax_reference_sets WHERE organization_id=? AND id=?",
      [c.organizationId, c.sourceId],
    ),
    db
      .prepare(
        "SELECT tariff_id,binding_sha256 FROM verified_fax_reference_tariffs WHERE organization_id=? AND set_id=? ORDER BY tariff_id",
      )
      .bind(c.organizationId, c.sourceId)
      .all(),
  ]);
  return { source, mappings: mappings.results };
}
const mappingsFor = (c) =>
  c.initialTariffIds.map((tariff_id) => ({
    tariff_id,
    binding_sha256: sha256(
      canonical({
        organizationId: c.organizationId,
        family: "fax_tariff",
        mechanism: "manual_fax:" + tariff_id,
      }),
    ),
  }));
export async function applyRegistrationPlan(
  db,
  providers,
  plan,
  digest,
  options = {},
) {
  const clock = options.now ?? (() => new Date().toISOString());
  const now = clock();
  if (
    !/^[a-f0-9]{64}$/.test(digest ?? "") ||
    registrationPlanDigest(plan) !== digest ||
    plan?.version !== 1 ||
    plan.kind !== "verified_fax_reference_registration" ||
    plan.applied !== false ||
    !timestamp(now) ||
    !timestamp(plan.observedAt) ||
    !timestamp(plan.expiresAt) ||
    plan.observedAt > now ||
    plan.expiresAt <= now ||
    Date.parse(plan.expiresAt) - Date.parse(plan.observedAt) !== 15 * 60_000
  )
    fail("PLAN_INVALID");
  const c = validateRegistrationConfig(plan.config);
  validateSnapshot(plan.snapshot, c, plan.observedAt);
  if (
    plan.snapshot.source !== null ||
    canonical(plan.source) !==
      canonical(sourceFor(c, plan.snapshot, plan.observedAt))
  )
    fail("PLAN_INVALID");
  validateCatalog(plan.qualification?.catalog, now);
  if (
    canonical(
      await qualification(
        options.sources,
        plan.qualification.catalog,
        plan.snapshot,
        plan.observedAt,
      ),
    ) !== canonical(plan.qualification)
  )
    fail("PLAN_INVALID");
  const [inspection, catalog, current, saved] = await Promise.all([
    providers.inspectTelnyx(),
    providers.inspectTelnyxFaxTariffCatalog(),
    readSnapshot(db, c),
    savedRegistration(db, c),
  ]);
  const commitAt = clock();
  if (
    !timestamp(commitAt) ||
    commitAt < plan.observedAt ||
    commitAt >= plan.expiresAt
  )
    fail("PLAN_INVALID");
  validateOwnership(inspection, plan.snapshot);
  validateCatalog(catalog, commitAt);
  // The hash records the whole multi-catalog response, whose bytes can vary
  // while the consumed selection is unchanged. Reviewed archive digests stay
  // bound above; registration installs no price and renewal requires new reads.
  if (catalog.rateDeckUrl !== plan.qualification.catalog.rateDeckUrl)
    fail("CATALOG_CHANGED");
  const mappings = mappingsFor(c);
  if (saved.source) {
    if (
      canonical(saved.source) !== canonical(plan.source) ||
      canonical(saved.mappings) !== canonical(mappings)
    )
      fail("SOURCE_CONFLICT");
    return { status: "already_applied", registrationOnly: true };
  }
  if (canonical(current) !== canonical(plan.snapshot)) fail("STATE_CHANGED");
  validateSnapshot(current, c, commitAt);
  const guards = [
    rowGuard("organizations", current.organization, "$.organization", "o"),
    rowGuard("senders", current.sender, "$.sender", "s"),
  ];
  for (const kind of ["bindings", "exclusions"])
    for (const [index, row] of current[kind].entries())
      guards.push(
        rowGuard(
          "trusted_fax_usage_tariffs",
          row,
          `$.${kind}[${index}]`,
          `t${kind[0]}${index}`,
        ),
      );
  guards.push(
    "NOT EXISTS(SELECT 1 FROM verified_fax_reference_sets v WHERE v.organization_id=json_extract(input.source,'$.organization_id') AND (v.id=json_extract(input.source,'$.id') OR (v.sender_id=json_extract(input.source,'$.sender_id') AND v.account_id=json_extract(input.source,'$.account_id') AND v.connection_id=json_extract(input.source,'$.connection_id') AND v.outbound_profile_id=json_extract(input.source,'$.outbound_profile_id') AND v.options_json='{}')))",
  );
  if (!options.now)
    guards.push("strftime('%Y-%m-%dT%H:%M:%fZ','now') < input.expires");
  const columns = Object.keys(plan.source),
    payload = JSON.stringify({ snapshot: current, source: plan.source });
  const insert = db
    .prepare(
      `WITH input AS (SELECT json_extract(?,'$.snapshot') snapshot,json_extract(?,'$.source') source,? expires) INSERT INTO verified_fax_reference_sets(${columns.join(",")}) SELECT ${columns.map((key) => `json_extract(input.source,'$.${key}')`).join(",")} FROM input WHERE ${conjunction(guards)}`,
    )
    .bind(payload, payload, plan.expiresAt);
  // The second statement must fail, rather than install an incomplete group,
  // if the first INSERT lost its final guard. A NULL set_id violates NOT NULL.
  const mapping = db
    .prepare(
      "INSERT INTO verified_fax_reference_tariffs(organization_id,set_id,tariff_id,binding_sha256) SELECT ?, (SELECT id FROM verified_fax_reference_sets WHERE organization_id=? AND id=?),json_extract(value,'$.tariff_id'),json_extract(value,'$.binding_sha256') FROM json_each(?)",
    )
    .bind(
      c.organizationId,
      c.organizationId,
      c.sourceId,
      JSON.stringify(mappings),
    );
  try {
    await db.batch([insert, mapping]);
  } catch {
    const after = await savedRegistration(db, c);
    if (
      canonical(after.source) !== canonical(plan.source) ||
      canonical(after.mappings) !== canonical(mappings)
    )
      fail("STATE_CHANGED");
  }
  const after = await savedRegistration(db, c);
  if (
    canonical(after.source) !== canonical(plan.source) ||
    canonical(after.mappings) !== canonical(mappings)
  )
    fail("COMMIT_UNCONFIRMED");
  return { status: "applied", registrationOnly: true };
}
async function proxy() {
  const { getPlatformProxy } = await import("wrangler");
  const directory = await mkdtemp(
      join(tmpdir(), "guteneo-verified-fax-registration-"),
    ),
    configPath = join(directory, "wrangler.json");
  await writeFile(
    configPath,
    JSON.stringify({
      name: "guteneo-verified-fax-registration",
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
      services: [
        {
          binding: "PROVIDERS",
          service: "guteneo-app",
          entrypoint: "ProviderInspection",
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
      env: p.env,
      async dispose() {
        await p.dispose();
        await rm(directory, { recursive: true, force: true });
      },
    };
  } catch {
    await rm(directory, { recursive: true, force: true });
    fail("PRIVATE_BINDINGS_UNAVAILABLE");
  }
}
async function readSource(path, maximum) {
  const resolved = await privateOperatorPath(path, PREFIX);
  let file;
  try {
    file = await open(resolved, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await file.stat();
    if (!stat.isFile() || stat.mode & 0o077 || stat.size > maximum)
      fail("PRIVATE_FILE_REQUIRED");
    return await file.readFile();
  } catch {
    fail("PRIVATE_FILE_REQUIRED");
  } finally {
    await file?.close();
  }
}
export async function main(args) {
  const applying = args[0] === "--apply";
  if (
    applying
      ? args.length !== 4 || args[2] !== "--reviewed-plan-sha256"
      : args.length !== 4 || args[0] !== "--config" || args[2] !== "--output"
  )
    fail("USAGE");
  let connection;
  try {
    if (!applying) {
      const config = validateRegistrationConfig(
        await readPrivateOperatorJson(args[1], PREFIX),
      );
      const output = await privateOperatorPath(args[3], PREFIX);
      connection = await proxy();
      const { plan, sources } = await prepareRegistrationPlan(
        connection.env.DB,
        connection.env.PROVIDERS,
        config,
      );
      const directory = `${output}.sources`;
      await mkdir(directory, { mode: 0o700 });
      for (const [name, value] of Object.entries(sources))
        await writeFile(join(directory, name), value.bytes, {
          flag: "wx",
          mode: 0o600,
        });
      await writeFile(output, JSON.stringify(plan, null, 2) + "\n", {
        flag: "wx",
        mode: 0o600,
      });
      console.log(
        JSON.stringify({
          status: "plan_only",
          planSha256: registrationPlanDigest(plan),
          expiresAt: plan.expiresAt,
          bindings: 14,
          exclusions: 4,
          registrationOnly: true,
        }),
      );
    } else {
      const plan = await readPrivateOperatorJson(args[1], PREFIX);
      if (registrationPlanDigest(plan) !== args[3]) fail("PLAN_INVALID");
      const sources = {};
      for (const name of ["deck", "page", "fx"])
        sources[name] = {
          bytes: await readSource(
            join(`${args[1]}.sources`, name),
            name === "deck"
              ? 40 * 1024 * 1024
              : name === "page"
                ? 512 * 1024
                : 128 * 1024,
          ),
          evidence: plan.qualification.sources[name],
        };
      connection = await proxy();
      console.log(
        JSON.stringify(
          await applyRegistrationPlan(
            connection.env.DB,
            connection.env.PROVIDERS,
            plan,
            args[3],
            { sources },
          ),
        ),
      );
    }
  } finally {
    await connection?.dispose();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main(process.argv.slice(2)).catch((error) => {
    console.error(
      new RegExp(`^${PREFIX}_[A-Z_]+$`).test(error?.message ?? "")
        ? error.message
        : `${PREFIX}_UNAVAILABLE`,
    );
    process.exitCode = 1;
  });
