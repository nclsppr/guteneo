// Private operator utility. It has no communication or human-approval operation.
import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  writeFile,
  mkdtemp,
  rm,
} from "node:fs/promises";
import { dirname, resolve, relative, join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import Papa from "papaparse";
import { z } from "zod";

const HOUR = 3_600_000;
const HASH = /^[a-f0-9]{64}$/;
const PHONE = /^\+352\d{4,12}$/;
export const SOURCES = Object.freeze({
  page: "https://telnyx.com/pricing/fax",
  fx: "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",
});
export const COMMERCIAL_BASIS = "reference_estimate_excluding_conditional_fees";
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
    organizationId: id,
    senderId: id,
    reviewerUserId: id,
    reviewerEmail: z.email().max(254),
    recipientPhone: z.string().regex(PHONE),
    accountId: z.string().regex(/^telnyx-key-sha256:[a-f0-9]{64}$/),
    connectionId: z.string().regex(/^\d{1,30}$/),
    outboundProfileId: z.string().regex(/^\d{1,30}$/),
    transitionFromLive: z
      .object({ id, rowSha256: z.string().regex(HASH) })
      .strict()
      .optional(),
    authority: z
      .object({
        id,
        validFrom: stamp,
        expiresAt: stamp,
        reference,
        sourceSha256: z.string().regex(HASH),
      })
      .strict(),
    rateDeckAssociation: z
      .object({
        url: z
          .string()
          .regex(
            /^https:\/\/portal\.telnyx\.com\/downloads\/global_conversational\/[a-zA-Z0-9_-]+\.csv$/,
          ),
        observedAt: stamp,
        profileId: z.string().regex(/^\d{1,30}$/),
        reference,
        sourceSha256: z.string().regex(HASH),
      })
      .strict(),
    commercialBasis: z.literal(COMMERCIAL_BASIS),
    callFeeBasis: z.literal(
      "no_additional_reference_component_blank_is_not_zero_supplier_cost",
    ),
  })
  .strict();

const fail = (code) => {
  throw new Error(code);
};
export const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export const planDigest = (plan) => sha256(canonical(plan));

export function validateConfig(input, now) {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success || !stamp.safeParse(now).success)
    fail("REVIEW_CONFIG_INVALID");
  const c = parsed.data;
  const start = Date.parse(c.authority.validFrom),
    end = Date.parse(c.authority.expiresAt);
  const association = Date.parse(c.rateDeckAssociation.observedAt),
    time = Date.parse(now);
  if (
    start > time ||
    end <= time ||
    end <= start ||
    end - start > 30 * 24 * HOUR ||
    association > time ||
    time - association >= 168 * HOUR ||
    c.rateDeckAssociation.profileId !== c.outboundProfileId
  )
    fail("REVIEW_AUTHORITY_INVALID");
  return c;
}

/** Fixed public hosts; no credentials, redirects, alternate destinations or unbounded bodies. */
export async function fetchEvidence(url, maximumBytes, fetcher = fetch) {
  if (
    ![SOURCES.page, SOURCES.fx].includes(url) &&
    !configSchema.shape.rateDeckAssociation.shape.url.safeParse(url).success
  )
    fail("REVIEW_SOURCE_FORBIDDEN");
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("REVIEW_SOURCE_TIMEOUT"));
    }, 30_000);
  });
  try {
    return await Promise.race([
      deadline,
      (async () => {
        const response = await fetcher(url, {
          method: "GET",
          redirect: "error",
          credentials: "omit",
          cache: "no-store",
          signal: controller.signal,
        });
        if (
          response.status !== 200 ||
          !response.body ||
          (response.url && response.url !== url)
        )
          fail("REVIEW_SOURCE_HTTP");
        const length = response.headers.get("content-length");
        if (
          length &&
          (!/^\d+$/.test(length) || Number(length) > maximumBytes)
        ) {
          await response.body.cancel();
          fail("REVIEW_SOURCE_TOO_LARGE");
        }
        const reader = response.body.getReader(),
          chunks = [];
        let size = 0;
        const cancel = () => {
          void reader.cancel().catch(() => {});
        };
        controller.signal.addEventListener("abort", cancel, { once: true });
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (controller.signal.aborted) fail("REVIEW_SOURCE_TIMEOUT");
            if (done) break;
            size += value.byteLength;
            if (size > maximumBytes) fail("REVIEW_SOURCE_TOO_LARGE");
            chunks.push(value);
          }
        } finally {
          controller.signal.removeEventListener("abort", cancel);
          await reader.cancel().catch(() => {});
        }
        const bytes = Buffer.concat(chunks);
        if (!bytes.length) fail("REVIEW_SOURCE_EMPTY");
        return {
          bytes,
          evidence: {
            url,
            bytes: bytes.length,
            sha256: sha256(bytes),
            contentType: response.headers.get("content-type"),
            lastModified: response.headers.get("last-modified"),
          },
        };
      })(),
    ]);
  } catch (error) {
    if (/^REVIEW_[A-Z_]+$/.test(error.message)) throw error;
    fail("REVIEW_SOURCE_UNAVAILABLE");
  } finally {
    clearTimeout(timer);
  }
}

function decimalInteger(value, places) {
  if (
    typeof value !== "string" ||
    !new RegExp(`^\\d{1,8}(?:\\.\\d{1,${places}})?$`).test(value)
  )
    fail("REVIEW_RATE_INVALID");
  const [whole, fraction = ""] = value.split(".");
  const result =
    BigInt(whole) * 10n ** BigInt(places) +
    BigInt(fraction.padEnd(places, "0"));
  if (result > 1_000_000_000n) fail("REVIEW_RATE_INVALID");
  return Number(result);
}

export function parseRateDeck(bytes, phone) {
  if (!PHONE.test(phone)) fail("REVIEW_RECIPIENT_INVALID");
  const columns = [
    "ISO",
    "Country",
    "Origination Prefixes",
    "Destination Prefixes",
    "Description",
    "Interval 1",
    "Interval N",
    "Rate",
    "Price Per Call",
    "Exact Match",
  ];
  let fields,
    matched = [];
  Papa.parse(bytes.toString("utf8"), {
    header: true,
    skipEmptyLines: true,
    step(result) {
      fields ??= result.meta.fields;
      if (
        result.errors.length ||
        JSON.stringify(fields) !== JSON.stringify(columns)
      )
        fail("REVIEW_DECK_INVALID");
      const row = result.data;
      if (
        row.ISO !== "LU" ||
        row["Origination Prefixes"].trim().toLowerCase() !== "local"
      )
        return;
      const prefix = row["Destination Prefixes"].trim();
      if (!/^352\d*$/.test(prefix)) fail("REVIEW_DECK_INVALID");
      if (phone.slice(1).startsWith(prefix)) matched.push(row);
    },
  });
  if (JSON.stringify(fields) !== JSON.stringify(columns) || !matched.length)
    fail("REVIEW_DECK_INVALID");
  const longest = Math.max(
    ...matched.map((row) => row["Destination Prefixes"].trim().length),
  );
  matched = matched.filter(
    (row) => row["Destination Prefixes"].trim().length === longest,
  );
  if (matched.length !== 1) fail("REVIEW_DECK_AMBIGUOUS");
  const row = matched[0];
  if (
    row["Interval 1"].trim() !== "60" ||
    row["Interval N"].trim() !== "60" ||
    row["Exact Match"].trim() !== "" ||
    row["Price Per Call"].trim() !== ""
  )
    fail("REVIEW_BILLING_BASIS_CHANGED");
  const descriptions = {
    Fixed: "fixed",
    "NGN Service 1": "ngn",
    "NGN Service 2": "ngn",
    Mobile: "mobile",
    Freephone: "freephone",
  };
  const description = row.Description.match(
    /^Trunking Outbound Minute - Luxembourg - (.+) - Local$/,
  )?.[1];
  const category = descriptions[description];
  if (!category) fail("REVIEW_ROUTE_UNSUPPORTED");
  return {
    prefix: `+${row["Destination Prefixes"].trim()}`,
    category,
    minuteNanoUsd: decimalInteger(row.Rate.trim(), 9),
    initialSeconds: 60,
    incrementSeconds: 60,
    callNanoUsd: 0,
    callFeeBasis:
      "No additional reference component; blank CSV is not proof of zero supplier fees.",
  };
}

export function parsePagePrice(bytes) {
  // Read rendered text only; an obsolete embedded script or comment is not rate evidence.
  const text = bytes
    .toString("utf8")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ");
  const price = [
    ...text.matchAll(
      /Send a fax via API\s*\$([\d.]+)\s*per page\s*\+\s*SIP Trunking\s*usage for transmission/gi,
    ),
  ];
  if (price.length !== 1) fail("REVIEW_PAGE_PRICE_UNRECOGNIZED");
  const nano = decimalInteger(price[0][1], 9);
  if (nano <= 0) fail("REVIEW_RATE_INVALID");
  return nano;
}

export function parseFx(bytes, observedAt) {
  const xml = bytes.toString("utf8");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) fail("REVIEW_FX_INVALID");
  const dates = [
    ...xml.matchAll(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]\s*>/g),
  ];
  const usd = [
    ...xml.matchAll(
      /<Cube\s+currency=['"]USD['"]\s+rate=['"](\d+\.\d+)['"]\s*\/>/g,
    ),
  ];
  if (
    dates.length !== 1 ||
    usd.length !== 1 ||
    !z.iso.date().safeParse(dates[0][1]).success
  )
    fail("REVIEW_FX_INVALID");
  const date = dates[0][1],
    today = observedAt.slice(0, 10);
  if (date > today || Date.parse(today) - Date.parse(date) > 168 * HOUR)
    fail("REVIEW_FX_STALE");
  const [whole, fraction] = usd[0][1].split(".");
  if (fraction.length > 6) fail("REVIEW_FX_INVALID");
  let numerator = 10n ** BigInt(fraction.length),
    denominator = BigInt(whole + fraction);
  if (denominator <= 0n) fail("REVIEW_FX_INVALID");
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const common = gcd(numerator, denominator);
  numerator /= common;
  denominator /= common;
  if (numerator > 1_000_000n || denominator > 1_000_000n)
    fail("REVIEW_FX_INVALID");
  return {
    date,
    numerator: Number(numerator),
    denominator: Number(denominator),
    source: SOURCES.fx,
    basis: "commercial_fixed_reference",
  };
}

export function validateOwnership(c, inspection) {
  const knownPartial =
    inspection?.status === "partial" &&
    Array.isArray(inspection.errors) &&
    inspection.errors.length === 1 &&
    inspection.errors[0].stage === "outbound_profile" &&
    inspection.errors[0].code === "invalid_response" &&
    JSON.stringify(inspection.errors[0].invalidFields) ===
      '["daily_spend_limit"]';
  if (
    inspection?.provider !== "telnyx" ||
    inspection.mode !== "read_only" ||
    (!(
      inspection.status === "ok" &&
      Array.isArray(inspection.errors) &&
      inspection.errors.length === 0
    ) &&
      !knownPartial) ||
    inspection.accountReference !== c.accountId ||
    inspection.application?.id !== c.connectionId ||
    inspection.application.active !== true ||
    inspection.application.outboundVoiceProfileId !== c.outboundProfileId ||
    inspection.outboundProfile?.id !== c.outboundProfileId ||
    inspection.outboundProfile.enabled !== true ||
    !inspection.outboundProfile.whitelistedDestinations?.includes("LU") ||
    inspection.numberPagination?.complete !== true ||
    !inspection.numbers?.some(
      (n) =>
        n.phoneNumber === c.recipientPhone &&
        n.country === "LU" &&
        n.status === "active" &&
        n.features?.t38FaxGatewayEnabled === true,
    )
  )
    fail("REVIEW_PROVIDER_OWNERSHIP_INVALID");
}

const targetSql =
  "EXISTS(SELECT 1 FROM organizations o JOIN memberships m ON m.organization_id=o.id JOIN users u ON u.id=m.user_id JOIN senders s ON s.organization_id=o.id WHERE o.id=? AND o.mode='production' AND m.user_id=? AND m.role='admin' AND u.email=? AND s.id=? AND s.channel='fax' AND s.mode='production' AND s.status='verified' AND s.address=?) AND (SELECT COUNT(*) FROM memberships WHERE organization_id=?)=1 AND EXISTS(SELECT 1 FROM channel_controls WHERE organization_id=? AND channel='fax' AND enabled=0) AND NOT EXISTS(SELECT 1 FROM expert_approval_policies WHERE organization_id=? AND enabled=1) AND NOT EXISTS(SELECT 1 FROM attempts WHERE organization_id=?) AND NOT EXISTS(SELECT 1 FROM approvals WHERE organization_id=?) AND NOT EXISTS(SELECT 1 FROM outbox WHERE organization_id=?) AND NOT EXISTS(SELECT 1 FROM reservations WHERE organization_id=?) AND NOT EXISTS(SELECT 1 FROM welcome_credit_reservations WHERE organization_id=?)";
const targetValues = (c) => [
  c.organizationId,
  c.reviewerUserId,
  c.reviewerEmail,
  c.senderId,
  c.recipientPhone,
  c.organizationId,
  c.organizationId,
  c.organizationId,
  c.organizationId,
  c.organizationId,
  c.organizationId,
  c.organizationId,
  c.organizationId,
];
const normalizedLegacy = (row) => ({
  ...row,
  execution_scope: row.execution_scope ?? "live",
  review_authority_id: row.review_authority_id ?? null,
  evidence_observed_at: row.evidence_observed_at ?? null,
});
// Status is the only field the transition may change; retain the original qualified representation.
export const legacyTariffDigest = (row) =>
  planDigest({ ...normalizedLegacy(row), status: "qualified" });
function validateLegacy(c, row) {
  if (
    row.organization_id !== c.organizationId ||
    row.sender_id !== c.senderId ||
    row.account_id !== c.accountId ||
    row.connection_id !== c.connectionId ||
    row.outbound_profile_id !== c.outboundProfileId ||
    row.provider !== "telnyx" ||
    row.execution_scope !== "live" ||
    row.route_qualification !== "operator_test" ||
    row.origin_class !== "local" ||
    row.sender_country_code !== "LU" ||
    row.destination_country_code !== "LU" ||
    row.options_json !== "{}" ||
    !c.recipientPhone.startsWith(row.sender_prefix) ||
    !c.recipientPhone.startsWith(row.destination_prefix) ||
    row.expires_at > "2026-09-24T09:00:01.620Z" ||
    !["qualified", "revoked"].includes(row.status)
  )
    fail("REVIEW_LEGACY_SCOPE_INVALID");
}
async function targetAndLegacy(db, c) {
  const valid = await db
    .prepare(`SELECT (${targetSql}) AS valid`)
    .bind(...targetValues(c))
    .first();
  if (valid?.valid !== 1) fail("REVIEW_TARGET_INVALID");
  const rows = await db
    .prepare("SELECT * FROM trusted_fax_usage_tariffs WHERE organization_id=?")
    .bind(c.organizationId)
    .all();
  const live = rows.results
    .map(normalizedLegacy)
    .filter((row) => row.execution_scope === "live");
  if (live.length > 1) fail("REVIEW_LEGACY_RECONCILIATION_REQUIRED");
  if (live[0]) validateLegacy(c, live[0]);
  return live[0] ?? null;
}
export async function inspectLegacy(db, c) {
  const row = await targetAndLegacy(db, c);
  if (!row || row.status !== "qualified") fail("REVIEW_LEGACY_NOT_FOUND");
  return {
    kind: "review_fax_legacy_reconciliation",
    observedAt: new Date().toISOString(),
    tariffId: row.id,
    rowSha256: legacyTariffDigest(row),
    row,
    proposedEffect:
      "revoke_only_this_exact_legacy_tariff_atomically_with_review_replacement",
    applied: false,
  };
}
export async function inspectTarget(db, c) {
  const legacyTariff = await targetAndLegacy(db, c);
  if (
    legacyTariff
      ? !c.transitionFromLive ||
        c.transitionFromLive.id !== legacyTariff.id ||
        c.transitionFromLive.rowSha256 !== legacyTariffDigest(legacyTariff)
      : !!c.transitionFromLive
  )
    fail("REVIEW_LEGACY_RECONCILIATION_REQUIRED");
  const authority = await db
    .prepare(
      "SELECT * FROM fax_review_preparation_authorities WHERE organization_id=? AND id=?",
    )
    .bind(c.organizationId, c.authority.id)
    .first();
  const current = await db
    .prepare(
      "SELECT id,review_authority_id FROM trusted_fax_usage_tariffs WHERE organization_id=? AND status='qualified' AND execution_scope='review_prepare_only'",
    )
    .bind(c.organizationId)
    .all();
  if (
    current.results.length > 1 ||
    current.results.some((t) => t.review_authority_id !== c.authority.id)
  )
    fail("REVIEW_EXISTING_POLICY_CONFLICT");
  return {
    authority,
    priorTariffId: current.results[0]?.id ?? null,
    legacyTariff,
  };
}

export function buildPlan(input, evidence, target, observedAt) {
  const c = validateConfig(input, observedAt);
  const legacyTariff = target.legacyTariff ?? null;
  if (legacyTariff) validateLegacy(c, legacyTariff);
  if (
    legacyTariff
      ? !c.transitionFromLive ||
        c.transitionFromLive.id !== legacyTariff.id ||
        c.transitionFromLive.rowSha256 !== legacyTariffDigest(legacyTariff)
      : !!c.transitionFromLive
  )
    fail("REVIEW_LEGACY_RECONCILIATION_REQUIRED");
  validateOwnership(c, evidence.inspection);
  const route = parseRateDeck(evidence.deck.bytes, c.recipientPhone),
    pageNanoUsd = parsePagePrice(evidence.page.bytes),
    fx = parseFx(evidence.fx.bytes, observedAt);
  const authority = {
    id: c.authority.id,
    organization_id: c.organizationId,
    sender_id: c.senderId,
    account_id: c.accountId,
    connection_id: c.connectionId,
    outbound_profile_id: c.outboundProfileId,
    recipient_phone: c.recipientPhone,
    valid_from: c.authority.validFrom,
    expires_at: c.authority.expiresAt,
    status: "active",
    authorization_reference: c.authority.reference,
    source_sha256: c.authority.sourceSha256,
    created_at: target.authority?.created_at ?? observedAt,
  };
  if (target.authority && canonical(target.authority) !== canonical(authority))
    fail("REVIEW_AUTHORITY_CONFLICT");
  const sources = Object.fromEntries(
    ["page", "deck", "fx"].map((key) => {
      const source = evidence[key];
      if (
        source.evidence.sha256 !== sha256(source.bytes) ||
        source.evidence.bytes !== source.bytes.length ||
        source.evidence.url !==
          (key === "deck" ? c.rateDeckAssociation.url : SOURCES[key])
      )
        fail("REVIEW_EVIDENCE_MISMATCH");
      return [key, source.evidence];
    }),
  );
  const qualification = {
    version: 1,
    config: c,
    observedAt,
    sources,
    route,
    pageNanoUsd,
    fx,
    commercialBasis: COMMERCIAL_BASIS,
    duration: {
      baseSeconds: 30,
      lowSecondsPerPage: 30,
      highSecondsPerPage: 180,
      basis: "operator_planning_assumption_not_measured_or_guaranteed",
    },
    ownership: {
      inspectedAt: observedAt,
      accountReference: c.accountId,
      applicationId: c.connectionId,
      outboundProfileId: c.outboundProfileId,
      exactOwnedNumber: c.recipientPhone,
      localCallingVerified: false,
      sendingQualified: false,
      inspectionStatus: evidence.inspection.status,
      inspectionWarnings:
        evidence.inspection.status === "partial"
          ? ["outbound_profile.daily_spend_limit_unavailable"]
          : [],
      dailySpendLimitQualified: false,
    },
  };
  const digest = planDigest(qualification);
  const tariff = {
    id: `review-fax-${digest}`,
    organization_id: c.organizationId,
    sender_id: c.senderId,
    provider: "telnyx",
    account_id: c.accountId,
    connection_id: c.connectionId,
    outbound_profile_id: c.outboundProfileId,
    sender_prefix: c.recipientPhone,
    destination_prefix: route.prefix,
    sender_country_code: "LU",
    destination_country_code: "LU",
    origin_class: "local",
    destination_category: route.category,
    route_allowed: 1,
    route_qualification: "operator_test",
    operator_authorization_reference: c.authority.reference,
    operator_test_ceiling_minor: 200,
    local_calling_verified: 0,
    options_json: "{}",
    currency: "USD",
    page_nano_usd: pageNanoUsd,
    minute_nano_usd: route.minuteNanoUsd,
    call_nano_usd: 0,
    initial_seconds: 60,
    increment_seconds: 60,
    duration_base_seconds: 30,
    duration_low_per_page_seconds: 30,
    duration_high_per_page_seconds: 180,
    fx_numerator: fx.numerator,
    fx_denominator: fx.denominator,
    fx_date: fx.date,
    fx_source: fx.source,
    max_pages: 7,
    quote_ttl_seconds: 900,
    source_reference: `private-review-fax-qualification:sha256:${digest}`,
    source_sha256: digest,
    valid_from: observedAt,
    expires_at: new Date(
      Math.min(
        Date.parse(observedAt) + 168 * HOUR,
        Date.parse(c.rateDeckAssociation.observedAt) + 168 * HOUR,
        Date.parse(c.authority.expiresAt),
      ),
    ).toISOString(),
    status: "qualified",
    created_at: observedAt,
    execution_scope: "review_prepare_only",
    review_authority_id: authority.id,
    evidence_observed_at: observedAt,
  };
  const ceil = (n, d) => (n + d - 1n) / d;
  const upper =
    2n *
    ceil(
      (BigInt(pageNanoUsd) * 7n + BigInt(route.minuteNanoUsd) * 22n) *
        BigInt(fx.numerator),
      BigInt(fx.denominator),
    );
  if (ceil(upper, 10_000_000n) > 200n)
    fail("REVIEW_SEVEN_PAGE_CEILING_EXCEEDED");
  return {
    version: 1,
    qualification,
    authority,
    tariff,
    priorTariffId: target.priorTariffId,
    legacyTariff,
    estimatedSevenPageCeilingMinor: Number(ceil(upper, 10_000_000n)),
    effect: "install_preparation_only_no_send_no_approval_no_credit",
  };
}

function statement(db, table, row, suffix = "") {
  const columns = Object.keys(row);
  return db
    .prepare(
      `INSERT INTO ${table}(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")}) ${suffix}`,
    )
    .bind(...columns.map((c) => row[c]));
}
function equality(row) {
  return Object.keys(row)
    .map((key) => `${key} IS ?`)
    .join(" AND ");
}
export async function applyPlan(
  db,
  plan,
  reviewedDigest,
  evidence,
  inspection,
  now,
) {
  if (!HASH.test(reviewedDigest) || planDigest(plan) !== reviewedDigest)
    fail("REVIEW_PLAN_NOT_REVIEWED");
  if (!stamp.safeParse(now).success) fail("REVIEW_CONFIG_INVALID");
  if (plan.tariff.expires_at <= now) fail("REVIEW_PLAN_EXPIRED");
  const c = validateConfig(plan.qualification.config, now);
  if (
    plan.qualification.observedAt > now ||
    plan.tariff.expires_at <= now ||
    Date.parse(now) - Date.parse(plan.qualification.observedAt) > 168 * HOUR
  )
    fail("REVIEW_PLAN_EXPIRED");
  validateOwnership(c, inspection);
  const rebuilt = buildPlan(
    c,
    { ...evidence, inspection },
    {
      authority: plan.authority,
      priorTariffId: plan.priorTariffId,
      legacyTariff: plan.legacyTariff,
    },
    plan.qualification.observedAt,
  );
  if (canonical(rebuilt) !== canonical(plan)) fail("REVIEW_PLAN_CHANGED");
  const target = await inspectTarget(db, c);
  if (
    target.authority &&
    canonical(target.authority) !== canonical(plan.authority)
  )
    fail("REVIEW_AUTHORITY_CONFLICT");
  const existing = await db
    .prepare(
      `SELECT 1 FROM trusted_fax_usage_tariffs WHERE ${equality(plan.tariff)}`,
    )
    .bind(...Object.values(plan.tariff))
    .first();
  if (existing) return { status: "already_applied", tariffId: plan.tariff.id };
  const prior = plan.priorTariffId;
  const legacy = plan.legacyTariff;
  const legacyGuard = legacy
    ? `(SELECT COUNT(*) FROM trusted_fax_usage_tariffs WHERE organization_id=? AND execution_scope='live')=1 AND EXISTS(SELECT 1 FROM trusted_fax_usage_tariffs WHERE ${equality(legacy)})`
    : "NOT EXISTS(SELECT 1 FROM trusted_fax_usage_tariffs WHERE organization_id=? AND execution_scope='live')";
  const guard = `${targetSql} AND ${legacyGuard} AND ${prior === null ? "NOT EXISTS(SELECT 1 FROM trusted_fax_usage_tariffs WHERE organization_id=? AND status='qualified' AND execution_scope='review_prepare_only')" : "(SELECT COUNT(*) FROM trusted_fax_usage_tariffs WHERE organization_id=? AND status='qualified' AND execution_scope='review_prepare_only')=1 AND EXISTS(SELECT 1 FROM trusted_fax_usage_tariffs WHERE organization_id=? AND id=? AND review_authority_id=? AND execution_scope='review_prepare_only' AND status='qualified')"}`;
  const values = [
    ...targetValues(c),
    c.organizationId,
    ...(legacy ? Object.values(legacy) : []),
    c.organizationId,
    ...(prior === null ? [] : [c.organizationId, prior, c.authority.id]),
  ];
  // D1 batch is atomic: a failed SELECT guard rolls back authority/revocation/insertion together.
  const batch = [
    db
      .prepare(
        `SELECT CASE WHEN (${guard}) THEN 1 ELSE json('review_target_changed') END AS valid`,
      )
      .bind(...values),
    statement(
      db,
      "fax_review_preparation_authorities",
      plan.authority,
      "ON CONFLICT(id) DO NOTHING",
    ),
    db
      .prepare(
        `SELECT CASE WHEN EXISTS(SELECT 1 FROM fax_review_preparation_authorities WHERE ${equality(plan.authority)}) THEN 1 ELSE json('review_authority_changed') END AS valid`,
      )
      .bind(...Object.values(plan.authority)),
  ];
  if (legacy?.status === "qualified")
    batch.push(
      db
        .prepare(
          `UPDATE trusted_fax_usage_tariffs SET status='revoked' WHERE ${equality(legacy)} AND execution_scope='live'`,
        )
        .bind(...Object.values(legacy)),
    );
  if (prior !== null)
    batch.push(
      db
        .prepare(
          "UPDATE trusted_fax_usage_tariffs SET status='revoked' WHERE organization_id=? AND id=? AND review_authority_id=? AND execution_scope='review_prepare_only' AND status='qualified'",
        )
        .bind(c.organizationId, prior, c.authority.id),
    );
  batch.push(statement(db, "trusted_fax_usage_tariffs", plan.tariff));
  await db.batch(batch);
  return { status: "applied", tariffId: plan.tariff.id };
}

async function privateFile(path, maximum = 2_000_000) {
  const info = await lstat(path);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    (info.mode & 0o077) !== 0 ||
    info.size > maximum
  )
    fail("REVIEW_PRIVATE_FILE_REQUIRED");
  return readFile(path);
}
async function privateOutput(path) {
  const root = await realpath(fileURLToPath(new URL("..", import.meta.url))),
    parent = await realpath(dirname(resolve(path)));
  const rel = relative(root, parent);
  if (!rel.startsWith("..") || (await lstat(parent)).mode & 0o077)
    fail("REVIEW_PRIVATE_DIRECTORY_REQUIRED");
  let git = false;
  try {
    git =
      execFileSync(
        "git",
        ["-C", parent, "rev-parse", "--is-inside-work-tree"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      ).trim() === "true";
  } catch {
    /* A private directory is intentionally outside Git. */
  }
  if (git) fail("REVIEW_PRIVATE_DIRECTORY_REQUIRED");
  return resolve(path);
}
async function proxy() {
  const { getPlatformProxy } = await import("wrangler");
  const directory = await mkdtemp(join(tmpdir(), "guteneo-review-fax-"));
  const configPath = join(directory, "wrangler.json");
  await writeFile(
    configPath,
    JSON.stringify({
      name: "guteneo-local-review-fax-operator",
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
    const value = await getPlatformProxy({
      configPath,
      persist: false,
      envFiles: [],
    });
    return {
      env: value.env,
      async dispose() {
        await value.dispose();
        await rm(directory, { recursive: true, force: true });
      },
    };
  } catch {
    await rm(directory, { recursive: true, force: true });
    fail("REVIEW_PRIVATE_BINDINGS_UNAVAILABLE");
  }
}

async function main(args) {
  const applying = args[0] === "--apply";
  const inspecting = args[0] === "--inspect-legacy";
  if (
    inspecting
      ? args.length !== 5 || args[1] !== "--config" || args[3] !== "--output"
      : applying
        ? args.length !== 4 || args[2] !== "--reviewed-plan-sha256"
        : args.length !== 4 || args[0] !== "--config" || args[2] !== "--output"
  )
    fail("REVIEW_USAGE");
  let connection;
  try {
    if (inspecting) {
      const c = validateConfig(
        JSON.parse((await privateFile(args[2])).toString("utf8")),
        new Date().toISOString(),
      );
      const output = await privateOutput(args[4]);
      connection = await proxy();
      validateOwnership(c, await connection.env.PROVIDERS.inspectTelnyx());
      const report = await inspectLegacy(connection.env.DB, c);
      await writeFile(output, JSON.stringify(report, null, 2) + "\n", {
        flag: "wx",
        mode: 0o600,
      });
      console.log(
        JSON.stringify({
          status: "reconciliation_only",
          rowSha256: report.rowSha256,
          applied: false,
        }),
      );
      return;
    }
    if (!applying) {
      const c = validateConfig(
        JSON.parse((await privateFile(args[1])).toString("utf8")),
        new Date().toISOString(),
      );
      const output = await privateOutput(args[3]);
      connection = await proxy();
      const [page, deck, fx, inspection, target] = await Promise.all([
        fetchEvidence(SOURCES.page, 2_000_000),
        fetchEvidence(c.rateDeckAssociation.url, 40 * 1024 * 1024),
        fetchEvidence(SOURCES.fx, 128_000),
        connection.env.PROVIDERS.inspectTelnyx(),
        inspectTarget(connection.env.DB, c),
      ]);
      const plan = buildPlan(
        c,
        { page, deck, fx, inspection },
        target,
        new Date().toISOString(),
      );
      const directory = `${output}.sources`;
      await mkdir(directory, { mode: 0o700 });
      for (const [name, source] of Object.entries({ page, deck, fx }))
        await writeFile(join(directory, name), source.bytes, {
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
          planSha256: planDigest(plan),
          expiresAt: plan.tariff.expires_at,
          authorityExpiresAt: plan.authority.expires_at,
          maxPages: 7,
          ceilingMinor: 200,
          sendingAllowed: false,
        }),
      );
    } else {
      const path = await privateOutput(args[1]);
      const plan = JSON.parse((await privateFile(path)).toString("utf8"));
      if (planDigest(plan) !== args[3]) fail("REVIEW_PLAN_NOT_REVIEWED");
      const evidence = {};
      for (const name of ["page", "deck", "fx"])
        evidence[name] = {
          bytes: await privateFile(
            join(`${path}.sources`, name),
            name === "deck" ? 40 * 1024 * 1024 : 2_000_000,
          ),
          evidence: plan.qualification.sources[name],
        };
      connection = await proxy();
      const inspection = await connection.env.PROVIDERS.inspectTelnyx();
      const result = await applyPlan(
        connection.env.DB,
        plan,
        args[3],
        evidence,
        inspection,
        new Date().toISOString(),
      );
      console.log(
        JSON.stringify({
          status: result.status,
          sendingAllowed: false,
          expertEnabled: false,
        }),
      );
    }
  } finally {
    await connection?.dispose();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main(process.argv.slice(2)).catch((error) => {
    // Never print input, provider payloads, phone numbers, SQL bind values or raw errors.
    console.error(
      /^REVIEW_[A-Z_]+$/.test(error.message)
        ? error.message
        : "REVIEW_OPERATION_FAILED",
    );
    process.exitCode = 1;
  });
}
