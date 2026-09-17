import { z } from "zod";
import { canonicalJson, DomainError, sha256, type Dispatch } from "./index";
import type { LiveFaxIdentity } from "./live-fax-quotes";
import {
  FAX_OPERATOR_TEST_NOTICE,
  customerFaxPricing,
  type FaxPricing,
} from "../../contracts/src/fax-pricing";

const NANO_PER_CENT = 10_000_000;
const countries: Record<string, string> = {
  AT: "+43",
  BE: "+32",
  BG: "+359",
  HR: "+385",
  CY: "+357",
  CZ: "+420",
  DK: "+45",
  EE: "+372",
  FI: "+358",
  FR: "+33",
  DE: "+49",
  GR: "+30",
  HU: "+36",
  IS: "+354",
  IE: "+353",
  IT: "+39",
  LV: "+371",
  LI: "+423",
  LT: "+370",
  LU: "+352",
  MT: "+356",
  NL: "+31",
  NO: "+47",
  PL: "+48",
  PT: "+351",
  RO: "+40",
  SK: "+421",
  SI: "+386",
  ES: "+34",
  SE: "+46",
};
const id = z.string().regex(/^[a-zA-Z0-9_.:-]{1,200}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const reference = z
  .string()
  .min(1)
  .max(500)
  .regex(/^[^\r\n\0]+$/);
const timestamp = z.iso.datetime({ precision: 3 });
const invalid = () =>
  new DomainError(
    "LIVE_QUOTE_INVALID",
    "Le devis fax a expiré ou sa configuration a changé.",
    409,
  );
const unavailable = () =>
  new DomainError(
    "LIVE_PRICING_REQUIRED",
    "Aucun tarif fax qualifié ne couvre cette destination et ces options.",
    409,
  );

export type FaxUsageTariff = {
  id: string;
  organization_id: string;
  sender_id: string;
  provider: "telnyx";
  account_id: string;
  connection_id: string;
  outbound_profile_id: string;
  sender_prefix: string;
  destination_prefix: string;
  sender_country_code: string;
  destination_country_code: string;
  origin_class: "local" | "eea";
  destination_category: "fixed" | "special" | "mobile" | "ngn" | "freephone";
  route_allowed: number;
  local_calling_verified: number;
  route_qualification?: "provider_verified" | "operator_test";
  operator_authorization_reference?: string | null;
  operator_test_ceiling_minor?: number | null;
  options_json: string;
  currency: "USD";
  page_nano_usd: number;
  minute_nano_usd: number;
  call_nano_usd: number;
  initial_seconds: number;
  increment_seconds: number;
  duration_base_seconds: number;
  duration_low_per_page_seconds: number;
  duration_high_per_page_seconds: number;
  fx_numerator: number;
  fx_denominator: number;
  fx_date: string;
  fx_source: string;
  max_pages: number;
  quote_ttl_seconds: number;
  source_reference: string;
  source_sha256: string;
  valid_from: string;
  expires_at: string;
  status: "qualified" | "revoked";
  created_at: string;
};
export type ResolvedFaxUsageTariff = FaxUsageTariff & {
  pricing_version: 3;
  estimated_low_nanoeur: number;
  estimated_high_nanoeur: number;
  customer_minor: number;
};
export type FaxUsageQuote = {
  dispatch_id: string;
  organization_id: string;
  tariff_id: string;
  fingerprint: string;
  dispatch_fingerprint: string;
  input_json: string;
  input_fingerprint: string;
  account_id: string;
  connection_id: string;
  outbound_profile_id: string;
  pricing_version: 3;
  price_rule: "usage_x2_customer_cap";
  fiscal_basis: "qualified_usage_ex_tax";
  estimated_low_nanoeur: number;
  estimated_high_nanoeur: number;
  amount_minor: number;
  ceiling_minor: number;
  currency: "EUR";
  fx_numerator: number;
  fx_denominator: number;
  fx_date: string;
  fx_source: string;
  source_reference: string;
  source_sha256: string;
  created_at: string;
  expires_at: string;
};

function integer(value: number, min: number, max: number) {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw unavailable();
  return BigInt(value);
}
const ceil = (value: bigint, denominator: bigint) =>
  (value + denominator - 1n) / denominator;

/** Exact integer inputs; only the final rational conversion rounds up to one nano-EUR. */
export function faxUsageEstimate(t: FaxUsageTariff, pages: number) {
  const p = integer(pages, 1, 10);
  const page = integer(t.page_nano_usd, 0, 1_000_000_000);
  const minute = integer(t.minute_nano_usd, 0, 1_000_000_000);
  const call = integer(t.call_nano_usd, 0, 1_000_000_000);
  const base = integer(t.duration_base_seconds, 0, 600);
  const low = integer(t.duration_low_per_page_seconds, 1, 600);
  const high = integer(t.duration_high_per_page_seconds, Number(low), 600);
  const numerator = integer(t.fx_numerator, 1, 1_000_000);
  const denominator = integer(t.fx_denominator, 1, 1_000_000);
  if (t.initial_seconds !== 60 || t.increment_seconds !== 60)
    throw unavailable();
  const amount = (seconds: bigint) =>
    2n *
    ceil(
      (page * p + minute * ceil(seconds, 60n) + call) * numerator,
      denominator,
    );
  const lower = amount(base + p * low),
    upper = amount(base + p * high);
  if (upper > 10_000_000_000_000n) throw unavailable();
  return {
    estimated_low_nanoeur: Number(lower),
    estimated_high_nanoeur: Number(upper),
    customer_minor: Number(ceil(upper, BigInt(NANO_PER_CENT))),
  };
}

/** Private operator policy; never inferred from an assistant's request or provider capability. */
function operatorRouteTest(t: FaxUsageTariff): boolean {
  return (
    t.route_qualification === "operator_test" &&
    t.origin_class === "local" &&
    t.sender_country_code === "LU" &&
    t.destination_country_code === "LU" &&
    /^\+352\d+$/.test(t.destination_prefix) &&
    ["fixed", "mobile", "ngn", "freephone"].includes(t.destination_category) &&
    t.route_allowed === 1 &&
    t.local_calling_verified === 0 &&
    reference.safeParse(t.operator_authorization_reference).success &&
    Number.isInteger(t.operator_test_ceiling_minor) &&
    t.operator_test_ceiling_minor! >= 1 &&
    t.operator_test_ceiling_minor! <= 200 &&
    t.expires_at <= "2026-09-24T09:00:01.620Z" &&
    Date.parse(t.expires_at) - Date.parse(t.valid_from) <= 7 * 86400_000
  );
}

/** undefined means no v3 policy has EVER owned this sender/account/application scope. */
export async function resolveFaxUsageTariff(
  db: D1Database,
  organizationId: string,
  senderId: string,
  number: string,
  options: string,
  pages: number,
  identity: LiveFaxIdentity,
  now: string,
): Promise<ResolvedFaxUsageTariff | undefined> {
  const owns = await db
    .prepare(
      "SELECT 1 FROM trusted_fax_usage_tariffs WHERE organization_id=? AND sender_id=? AND account_id=? AND connection_id=? LIMIT 1",
    )
    .bind(organizationId, senderId, identity.accountId, identity.connectionId)
    .first();
  if (!owns) return undefined;
  if (!id.safeParse(identity.outboundProfileId).success) throw unavailable();
  const t = await db
    .prepare(
      "SELECT * FROM trusted_fax_usage_tariffs WHERE organization_id=? AND sender_id=? AND account_id=? AND connection_id=? AND outbound_profile_id=? AND options_json=? AND substr(?,1,length(destination_prefix))=destination_prefix ORDER BY length(destination_prefix) DESC,(status='qualified') DESC,created_at DESC,id DESC LIMIT 1",
    )
    .bind(
      organizationId,
      senderId,
      identity.accountId,
      identity.connectionId,
      identity.outboundProfileId!,
      options,
      number,
    )
    .first<FaxUsageTariff>();
  const sender = await db
    .prepare(
      "SELECT address FROM senders WHERE organization_id=? AND id=? AND channel='fax' AND mode='production' AND status='verified'",
    )
    .bind(organizationId, senderId)
    .first<{ address: string }>();
  if (
    !t ||
    t.status !== "qualified" ||
    !sender ||
    t.valid_from > now ||
    t.expires_at <= now ||
    t.route_allowed !== 1 ||
    (t.destination_category !== "fixed" && !operatorRouteTest(t)) ||
    t.currency !== "USD" ||
    (t.route_qualification === "operator_test" && !operatorRouteTest(t)) ||
    pages > t.max_pages ||
    !hash.safeParse(t.source_sha256).success ||
    !reference.safeParse(t.source_reference).success ||
    !reference.safeParse(t.fx_source).success ||
    !z.iso.date().safeParse(t.fx_date).success ||
    t.fx_date > t.valid_from.slice(0, 10) ||
    ![t.valid_from, t.expires_at, t.created_at].every(
      (value) => timestamp.safeParse(value).success,
    ) ||
    !countries[t.sender_country_code] ||
    !countries[t.destination_country_code] ||
    !t.sender_prefix.startsWith(countries[t.sender_country_code]) ||
    !sender.address.startsWith(t.sender_prefix) ||
    !t.destination_prefix.startsWith(countries[t.destination_country_code]) ||
    (t.origin_class === "local"
      ? t.sender_country_code !== t.destination_country_code ||
        (t.local_calling_verified !== 1 && !operatorRouteTest(t))
      : t.origin_class !== "eea" ||
        t.sender_country_code === t.destination_country_code)
  )
    throw unavailable();
  return { ...t, pricing_version: 3, ...faxUsageEstimate(t, pages) };
}

function material(q: FaxUsageQuote) {
  // Enumerate every immutable quote field except its self hash and the dispatch hash.
  const {
    fingerprint: _fingerprint,
    dispatch_fingerprint: _dispatch,
    ...value
  } = q;
  void _fingerprint;
  void _dispatch;
  return value;
}
export async function makeFaxUsageQuote(
  dispatchId: string,
  organizationId: string,
  frozen: Record<string, unknown>,
  t: ResolvedFaxUsageTariff,
  now: string,
): Promise<FaxUsageQuote> {
  if (frozen.estimatedMinor !== t.customer_minor) throw invalid();
  if (
    t.route_qualification === "operator_test" &&
    (!operatorRouteTest(t) ||
      !Number.isSafeInteger(frozen.ceilingMinor) ||
      (frozen.ceilingMinor as number) > t.operator_test_ceiling_minor!)
  )
    throw new DomainError(
      "FAX_TEST_CEILING_EXCEEDED",
      "Le test fax Luxembourg est limité à un plafond de 2 € par envoi.",
      409,
    );
  const input = canonicalJson(frozen);
  const q: FaxUsageQuote = {
    dispatch_id: dispatchId,
    organization_id: organizationId,
    tariff_id: t.id,
    fingerprint: "",
    dispatch_fingerprint: "",
    input_json: input,
    input_fingerprint: await sha256(input),
    account_id: t.account_id,
    connection_id: t.connection_id,
    outbound_profile_id: t.outbound_profile_id,
    pricing_version: 3,
    price_rule: "usage_x2_customer_cap",
    fiscal_basis: "qualified_usage_ex_tax",
    estimated_low_nanoeur: t.estimated_low_nanoeur,
    estimated_high_nanoeur: t.estimated_high_nanoeur,
    amount_minor: t.customer_minor,
    ceiling_minor: frozen.ceilingMinor as number,
    currency: "EUR",
    fx_numerator: t.fx_numerator,
    fx_denominator: t.fx_denominator,
    fx_date: t.fx_date,
    fx_source: t.fx_source,
    source_reference: t.source_reference,
    source_sha256: t.source_sha256,
    created_at: now,
    expires_at: new Date(
      Math.min(
        Date.parse(t.expires_at),
        Date.parse(now) + t.quote_ttl_seconds * 1000,
      ),
    ).toISOString(),
  };
  q.fingerprint = await sha256(canonicalJson(material(q)));
  return q;
}
export function insertFaxUsageQuote(db: D1Database, quote: FaxUsageQuote) {
  const columns = Object.keys(quote) as (keyof FaxUsageQuote)[];
  return db
    .prepare(
      `INSERT INTO live_fax_quotes_v3(${columns.join(",")}) SELECT ${columns.map(() => "?").join(",")} WHERE EXISTS(SELECT 1 FROM dispatches WHERE organization_id=? AND id=? AND quote_fingerprint=?)`,
    )
    .bind(
      ...columns.map((column) => quote[column]),
      quote.organization_id,
      quote.dispatch_id,
      quote.fingerprint,
    );
}
async function assertIntegrity(q: FaxUsageQuote, row: Dispatch) {
  if (
    q.fingerprint !== row.quote_fingerprint ||
    q.dispatch_fingerprint !== row.fingerprint ||
    (await sha256(q.input_json)) !== q.input_fingerprint ||
    (await sha256(canonicalJson(material(q)))) !== q.fingerprint ||
    (await sha256(
      canonicalJson({
        ...JSON.parse(q.input_json),
        quoteFingerprint: q.fingerprint,
      }),
    )) !== row.fingerprint
  )
    throw invalid();
}
export async function validateFaxUsageQuote(
  db: D1Database,
  row: Dispatch,
  identity: LiveFaxIdentity,
  now: string,
): Promise<FaxUsageQuote | undefined> {
  const exists = await db
    .prepare(
      "SELECT 1 FROM live_fax_quotes_v3 WHERE organization_id=? AND dispatch_id=?",
    )
    .bind(row.organization_id, row.id)
    .first();
  if (!exists) return undefined;
  if (!id.safeParse(identity.outboundProfileId).success) throw invalid();
  // Select only q columns: view-only validity metadata is not part of the hash.
  const q = await db
    .prepare(
      "SELECT q.* FROM live_fax_quotes_v3 q JOIN valid_live_fax_quotes_v3 v ON v.organization_id=q.organization_id AND v.dispatch_id=q.dispatch_id WHERE q.organization_id=? AND q.dispatch_id=? AND q.account_id=? AND q.connection_id=? AND q.outbound_profile_id=? AND q.created_at<=? AND q.expires_at>? AND v.tariff_valid_from<=? AND v.tariff_expires_at>?",
    )
    .bind(
      row.organization_id,
      row.id,
      identity.accountId,
      identity.connectionId,
      identity.outboundProfileId!,
      now,
      now,
      now,
      now,
    )
    .first<FaxUsageQuote>();
  if (!q) throw invalid();
  await assertIntegrity(q, row);
  return q;
}

const proofSchema = z
  .object({
    source: z.literal("operator_reconciled_usage"),
    organizationId: id,
    dispatchId: id,
    attemptId: id,
    providerId: id,
    accountId: id,
    connectionId: id,
    quoteFingerprint: hash,
    supplierNanoUsd: z.number().int().min(0).max(1_000_000_000_000),
    reviewerId: id,
    evidenceReference: reference,
    evidenceSha256: hash,
    observedAt: timestamp,
  })
  .strict();
/** Private operator/service input. Never accept this schema from REST, MCP or a browser. */
export type OperatorFaxUsageProof = z.infer<typeof proofSchema>;
export type FaxUsageSettlement = {
  organization_id: string;
  dispatch_id: string;
  attempt_id: string;
  provider: "telnyx";
  provider_id: string;
  account_id: string;
  connection_id: string;
  quote_fingerprint: string;
  proof_source: "operator_reconciled_usage";
  reviewer_id: string;
  observed_at: string;
  evidence_reference: string;
  evidence_sha256: string;
  proof_fingerprint: string;
  supplier_nano_usd: number;
  supplier_nanoeur: number;
  customer_nanoeur: number;
  guteneo_absorbed_nanoeur: number;
  created_at: string;
};
/** One INSERT commits proof, cumulative charge and release of both holds in D1 triggers. */
export async function settleFaxUsage(
  db: D1Database,
  input: OperatorFaxUsageProof,
  now = new Date().toISOString(),
): Promise<FaxUsageSettlement> {
  const parsed = proofSchema.safeParse(input);
  if (!parsed.success || !timestamp.safeParse(now).success)
    throw new DomainError(
      "FAX_USAGE_PROOF_INVALID",
      "Preuve d’usage fax invalide.",
      409,
    );
  const p = parsed.data;
  if (p.observedAt > now)
    throw new DomainError(
      "FAX_USAGE_PROOF_INVALID",
      "Date de preuve future.",
      409,
    );
  const fingerprint = await sha256(canonicalJson(p));
  const prior = await db
    .prepare(
      "SELECT * FROM fax_usage_settlements WHERE organization_id=? AND dispatch_id=?",
    )
    .bind(p.organizationId, p.dispatchId)
    .first<FaxUsageSettlement>();
  if (prior) {
    if (prior.proof_fingerprint !== fingerprint)
      throw new DomainError(
        "FAX_USAGE_PROOF_CONFLICT",
        "Un autre règlement existe pour cet envoi.",
        409,
      );
    return prior;
  }
  const q = await db
    .prepare(
      "SELECT * FROM live_fax_quotes_v3 WHERE organization_id=? AND dispatch_id=?",
    )
    .bind(p.organizationId, p.dispatchId)
    .first<FaxUsageQuote>();
  const row = await db
    .prepare("SELECT * FROM dispatches WHERE organization_id=? AND id=?")
    .bind(p.organizationId, p.dispatchId)
    .first<Dispatch>();
  if (
    !q ||
    !row ||
    q.fingerprint !== p.quoteFingerprint ||
    q.account_id !== p.accountId ||
    q.connection_id !== p.connectionId ||
    p.observedAt < q.created_at
  )
    throw new DomainError(
      "FAX_USAGE_PROOF_INVALID",
      "La preuve ne correspond pas au devis.",
      409,
    );
  await assertIntegrity(q, row);
  const supplier = ceil(
    BigInt(p.supplierNanoUsd) * BigInt(q.fx_numerator),
    BigInt(q.fx_denominator),
  );
  if (supplier > 9_000_000_000_000_000n)
    throw new DomainError(
      "FAX_USAGE_PROOF_INVALID",
      "Montant de preuve hors limites.",
      409,
    );
  const cap = BigInt(q.ceiling_minor) * BigInt(NANO_PER_CENT);
  const customer = supplier * 2n < cap ? supplier * 2n : cap;
  const value: FaxUsageSettlement = {
    organization_id: p.organizationId,
    dispatch_id: p.dispatchId,
    attempt_id: p.attemptId,
    provider: "telnyx",
    provider_id: p.providerId,
    account_id: p.accountId,
    connection_id: p.connectionId,
    quote_fingerprint: p.quoteFingerprint,
    proof_source: p.source,
    reviewer_id: p.reviewerId,
    observed_at: p.observedAt,
    evidence_reference: p.evidenceReference,
    evidence_sha256: p.evidenceSha256,
    proof_fingerprint: fingerprint,
    supplier_nano_usd: p.supplierNanoUsd,
    supplier_nanoeur: Number(supplier),
    customer_nanoeur: Number(customer),
    guteneo_absorbed_nanoeur: Number(
      supplier > customer ? supplier - customer : 0n,
    ),
    created_at: now,
  };
  const columns = Object.keys(value) as (keyof FaxUsageSettlement)[];
  try {
    await db
      .prepare(
        `INSERT INTO fax_usage_settlements(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")}) ON CONFLICT(organization_id,dispatch_id) DO NOTHING`,
      )
      .bind(...columns.map((c) => value[c]))
      .run();
  } catch {
    // A concurrent equal settlement may have completed before the insertion guard ran.
    const concurrent = await db
      .prepare(
        "SELECT * FROM fax_usage_settlements WHERE organization_id=? AND dispatch_id=?",
      )
      .bind(p.organizationId, p.dispatchId)
      .first<FaxUsageSettlement>();
    if (concurrent?.proof_fingerprint === fingerprint) return concurrent;
    throw new DomainError(
      concurrent ? "FAX_USAGE_PROOF_CONFLICT" : "FAX_USAGE_PROOF_INVALID",
      "Le règlement fax ne peut pas être appliqué.",
      409,
    );
  }
  const saved = await db
    .prepare(
      "SELECT * FROM fax_usage_settlements WHERE organization_id=? AND dispatch_id=?",
    )
    .bind(p.organizationId, p.dispatchId)
    .first<FaxUsageSettlement>();
  if (!saved || saved.proof_fingerprint !== fingerprint)
    throw new DomainError(
      "FAX_USAGE_PROOF_CONFLICT",
      "Un autre règlement existe pour cet envoi.",
      409,
    );
  return saved;
}

/** Explicit public projection: never leak the supplier rate, multiplier or absorbed cost. */
export async function readFaxPricingBatch(
  db: D1Database,
  organizationId: string,
  dispatchIds: string[],
): Promise<Map<string, FaxPricing>> {
  const ids = [...new Set(dispatchIds)];
  if (!ids.length) return new Map();
  if (ids.length > 100)
    throw new DomainError("INVALID_LIMIT", "Au maximum 100 envois.");
  const rows = await db
    .prepare(
      "SELECT q.*,t.route_qualification,r.status AS reservation_status,s.customer_nanoeur,n.charged_minor,s.created_at AS settled_at FROM live_fax_quotes_v3 q JOIN trusted_fax_usage_tariffs t ON t.organization_id=q.organization_id AND t.id=q.tariff_id LEFT JOIN welcome_credit_reservations r ON r.organization_id=q.organization_id AND r.dispatch_id=q.dispatch_id LEFT JOIN fax_usage_settlements s ON s.organization_id=q.organization_id AND s.dispatch_id=q.dispatch_id LEFT JOIN delivery_charge_entries n ON n.organization_id=q.organization_id AND n.dispatch_id=q.dispatch_id WHERE q.organization_id=? AND q.dispatch_id IN (SELECT value FROM json_each(?))",
    )
    .bind(organizationId, JSON.stringify(ids))
    .all<
      FaxUsageQuote & {
        route_qualification: "provider_verified" | "operator_test";
        reservation_status: "reserved" | "settled" | "released" | null;
        customer_nanoeur: number | null;
        charged_minor: number | null;
        settled_at: string | null;
      }
    >();
  return new Map(
    rows.results.map((q) => [
      q.dispatch_id,
      customerFaxPricing({
        version: 3,
        currency: "EUR",
        basis: "qualified_usage_ex_tax",
        ...(q.route_qualification === "operator_test"
          ? {
              routeQualification: "operator_authorized_test" as const,
              routeNotice: FAX_OPERATOR_TEST_NOTICE,
            }
          : {}),
        estimatedLowNanoeur: q.estimated_low_nanoeur,
        estimatedHighNanoeur: q.estimated_high_nanoeur,
        ceilingMinor: q.ceiling_minor,
        fx: {
          numerator: q.fx_numerator,
          denominator: q.fx_denominator,
          date: q.fx_date,
          source: q.fx_source,
        },
        settlement: {
          status: q.reservation_status ?? "not_reserved",
          customerNanoeur: q.customer_nanoeur,
          chargedMinor: q.charged_minor,
          settledAt: q.settled_at,
        },
      }),
    ]),
  );
}
export async function readFaxPricing(
  db: D1Database,
  organizationId: string,
  dispatchId: string,
): Promise<FaxPricing | undefined> {
  return (await readFaxPricingBatch(db, organizationId, [dispatchId])).get(
    dispatchId,
  );
}
