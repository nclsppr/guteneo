import { canonicalJson, DomainError, sha256, type Dispatch } from "./index";
import {
  resolveFaxUsageTariff,
  makeFaxUsageQuote,
  insertFaxUsageQuote,
  validateFaxUsageQuote,
  assertFaxDispatchSendable,
  type ResolvedFaxUsageTariff,
  type FaxUsageQuote,
} from "./live-fax-usage";

export type LiveFaxIdentity = {
  accountId: string;
  connectionId: string;
  outboundProfileId?: string;
};
type SupplierCost = {
  id: string;
  account_id: string;
  connection_id: string;
  supplier_base_numerator: number;
  supplier_per_page_numerator: number;
  supplier_denominator: number;
  currency: "EUR";
  cost_basis: "guaranteed_final_supplier_total";
  fiscal_basis: "tax_inclusive_totals";
  currency_basis: "same_currency_no_fx";
  max_pages: number;
  quote_ttl_seconds: number;
  source_reference: string;
  source_sha256: string;
  expires_at: string;
};
type Tariff = SupplierCost & { supplier_minor: number; customer_minor: number };
export type LiveFaxQuote = {
  dispatch_id: string;
  organization_id: string;
  tariff_id: string;
  fingerprint: string;
  dispatch_fingerprint: string;
  input_json: string;
  input_fingerprint: string;
  account_id: string;
  connection_id: string;
  pricing_version: 2;
  price_rule: "supplier_total_x2";
  supplier_amount_minor: number;
  supplier_currency: "EUR";
  cost_basis: "guaranteed_final_supplier_total";
  fiscal_basis: "tax_inclusive_totals";
  currency_basis: "same_currency_no_fx";
  amount_minor: number;
  ceiling_minor: number;
  currency: string;
  source_reference: string;
  source_sha256: string;
  created_at: string;
  expires_at: string;
};
/** Rational supplier rates are never rounded to manufacture a customer price. */
export function exactFaxPrice(
  cost: Pick<
    SupplierCost,
    | "supplier_base_numerator"
    | "supplier_per_page_numerator"
    | "supplier_denominator"
  >,
  pages: number,
): { supplier_minor: number; customer_minor: number } {
  if (
    !Number.isSafeInteger(pages) ||
    pages < 1 ||
    pages > 350 ||
    !Number.isSafeInteger(cost.supplier_denominator) ||
    cost.supplier_denominator < 1 ||
    cost.supplier_denominator > 1_000_000 ||
    [cost.supplier_base_numerator, cost.supplier_per_page_numerator].some(
      (value) =>
        !Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000,
    )
  )
    throw new DomainError(
      "LIVE_PRICING_REQUIRED",
      "Coût fournisseur exact non qualifié.",
      409,
    );
  const numerator =
    BigInt(cost.supplier_base_numerator) +
    BigInt(cost.supplier_per_page_numerator) * BigInt(pages);
  const denominator = BigInt(cost.supplier_denominator);
  if (numerator % denominator !== 0n)
    throw new DomainError(
      "FRACTIONAL_PRICING_UNSUPPORTED",
      "Le coût fournisseur comporte une fraction de centime. Son agrégation avant facturation doit être raccordée ; aucun arrondi par envoi n’est appliqué.",
      409,
    );
  const supplier = numerator / denominator;
  const customer = supplier * 2n;
  if (customer > 1_000_000n)
    throw new DomainError(
      "LIVE_PRICING_REQUIRED",
      "Le coût qualifié dépasse la limite de cet envoi.",
      409,
    );
  return { supplier_minor: Number(supplier), customer_minor: Number(customer) };
}
const invalid = () =>
  new DomainError(
    "LIVE_QUOTE_INVALID",
    "Le devis fax a expiré ou sa configuration a changé. Préparez un nouvel envoi.",
    409,
  );
function identityValid(
  identity?: LiveFaxIdentity,
): identity is LiveFaxIdentity {
  return (
    !!identity &&
    [identity.accountId, identity.connectionId].every(
      (value) =>
        typeof value === "string" && /^[a-zA-Z0-9_.:-]{1,200}$/.test(value),
    )
  );
}
export async function resolveFaxTariff(
  db: D1Database,
  organizationId: string,
  senderId: string,
  number: string,
  options: string,
  pages: number,
  identity: LiveFaxIdentity | undefined,
  now: string,
): Promise<Tariff | ResolvedFaxUsageTariff> {
  if (!identityValid(identity))
    throw new DomainError(
      "LIVE_PRICING_REQUIRED",
      "Compte fournisseur et tarification fax qualifiée requis.",
      409,
    );
  const usage = await resolveFaxUsageTariff(
    db,
    organizationId,
    senderId,
    number,
    options,
    pages,
    identity,
    now,
  );
  if (usage) return usage;
  const tariff = await db
    .prepare(
      "SELECT * FROM trusted_fax_supplier_costs WHERE organization_id=? AND sender_id=? AND provider='telnyx' AND account_id=? AND connection_id=? AND status='qualified' AND options_json=? AND substr(?,1,length(destination_prefix))=destination_prefix ORDER BY length(destination_prefix) DESC LIMIT 1",
    )
    .bind(
      organizationId,
      senderId,
      identity.accountId,
      identity.connectionId,
      options,
      number,
    )
    .first<SupplierCost & { valid_from: string }>();
  if (
    !tariff ||
    tariff.valid_from > now ||
    tariff.expires_at <= now ||
    pages > tariff.max_pages ||
    !/^[a-f0-9]{64}$/.test(tariff.source_sha256) ||
    tariff.currency !== "EUR" ||
    tariff.cost_basis !== "guaranteed_final_supplier_total" ||
    tariff.fiscal_basis !== "tax_inclusive_totals" ||
    tariff.currency_basis !== "same_currency_no_fx"
  )
    throw new DomainError(
      "LIVE_PRICING_REQUIRED",
      "Aucun tarif fax qualifié et actuel ne couvre cet envoi.",
      409,
    );
  return { ...tariff, ...exactFaxPrice(tariff, pages) };
}
function quoteMaterial(quote: LiveFaxQuote) {
  return {
    dispatchId: quote.dispatch_id,
    organizationId: quote.organization_id,
    tariffId: quote.tariff_id,
    provider: "telnyx",
    accountId: quote.account_id,
    connectionId: quote.connection_id,
    pricingVersion: quote.pricing_version,
    priceRule: quote.price_rule,
    supplierAmountMinor: quote.supplier_amount_minor,
    supplierCurrency: quote.supplier_currency,
    costBasis: quote.cost_basis,
    fiscalBasis: quote.fiscal_basis,
    currencyBasis: quote.currency_basis,
    inputFingerprint: quote.input_fingerprint,
    amountMinor: quote.amount_minor,
    ceilingMinor: quote.ceiling_minor,
    currency: quote.currency,
    sourceReference: quote.source_reference,
    sourceSha256: quote.source_sha256,
    createdAt: quote.created_at,
    expiresAt: quote.expires_at,
  };
}
export async function makeFaxQuote(
  dispatchId: string,
  organizationId: string,
  frozen: Record<string, unknown>,
  tariff: Tariff | ResolvedFaxUsageTariff,
  now: string,
): Promise<LiveFaxQuote | FaxUsageQuote> {
  if ("pricing_version" in tariff)
    return makeFaxUsageQuote(dispatchId, organizationId, frozen, tariff, now);
  if (frozen.estimatedMinor !== tariff.customer_minor) throw invalid();
  const input = canonicalJson(frozen);
  const quote: LiveFaxQuote = {
    dispatch_id: dispatchId,
    organization_id: organizationId,
    tariff_id: tariff.id,
    fingerprint: "",
    dispatch_fingerprint: "",
    input_json: input,
    input_fingerprint: await sha256(input),
    account_id: tariff.account_id,
    connection_id: tariff.connection_id,
    pricing_version: 2,
    price_rule: "supplier_total_x2",
    supplier_amount_minor: tariff.supplier_minor,
    supplier_currency: tariff.currency,
    cost_basis: tariff.cost_basis,
    fiscal_basis: tariff.fiscal_basis,
    currency_basis: tariff.currency_basis,
    amount_minor: frozen.estimatedMinor as number,
    ceiling_minor: frozen.ceilingMinor as number,
    currency: "EUR",
    source_reference: tariff.source_reference,
    source_sha256: tariff.source_sha256,
    created_at: now,
    expires_at: new Date(
      Math.min(
        Date.parse(now) + tariff.quote_ttl_seconds * 1000,
        Date.parse(tariff.expires_at),
      ),
    ).toISOString(),
  };
  quote.fingerprint = await sha256(canonicalJson(quoteMaterial(quote)));
  return quote;
}
export function insertFaxQuote(
  db: D1Database,
  quote: LiveFaxQuote | FaxUsageQuote,
) {
  if (quote.pricing_version === 3) return insertFaxUsageQuote(db, quote);
  const columns = Object.keys(quote) as (keyof LiveFaxQuote)[];
  return db
    .prepare(
      `INSERT INTO live_fax_quotes_v2(${columns.join(",")}) SELECT ${columns.map(() => "?").join(",")} WHERE EXISTS(SELECT 1 FROM dispatches WHERE organization_id=? AND id=? AND quote_fingerprint=?)`,
    )
    .bind(
      ...columns.map((column) => quote[column]),
      quote.organization_id,
      quote.dispatch_id,
      quote.fingerprint,
    );
}
/** Rechecks trusted policy, exact immutable input and the configured account before any provider call. */
export async function validateLiveFaxQuote(
  db: D1Database,
  row: Dispatch,
  identity: LiveFaxIdentity | undefined,
  now: string,
  purpose: "send" | "prepare" = "send",
): Promise<LiveFaxQuote | FaxUsageQuote> {
  if (purpose === "send") await assertFaxDispatchSendable(db, row);
  if (!identityValid(identity)) throw invalid();
  const usage = await validateFaxUsageQuote(db, row, identity, now);
  if (usage) return usage;
  const quote = await db
    .prepare(
      "SELECT * FROM valid_live_fax_quotes WHERE organization_id=? AND dispatch_id=? AND account_id=? AND connection_id=? AND created_at<=? AND expires_at>? AND tariff_valid_from<=? AND tariff_expires_at>?",
    )
    .bind(
      row.organization_id,
      row.id,
      identity.accountId,
      identity.connectionId,
      now,
      now,
      now,
      now,
    )
    .first<LiveFaxQuote>();
  if (
    !quote ||
    quote.fingerprint !== row.quote_fingerprint ||
    quote.dispatch_fingerprint !== row.fingerprint ||
    (await sha256(quote.input_json)) !== quote.input_fingerprint ||
    (await sha256(canonicalJson(quoteMaterial(quote)))) !== quote.fingerprint ||
    (await sha256(
      canonicalJson({
        ...JSON.parse(quote.input_json),
        quoteFingerprint: quote.fingerprint,
      }),
    )) !== row.fingerprint
  )
    throw invalid();
  return quote;
}
