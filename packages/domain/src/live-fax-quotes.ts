import { canonicalJson, DomainError, sha256, type Dispatch } from "./index";

export type LiveFaxIdentity = { accountId: string; connectionId: string };
type Tariff = {
  id: string;
  account_id: string;
  connection_id: string;
  base_minor: number;
  per_page_minor: number;
  max_pages: number;
  quote_ttl_seconds: number;
  source_reference: string;
  source_sha256: string;
  expires_at: string;
};
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
  amount_minor: number;
  ceiling_minor: number;
  currency: string;
  source_reference: string;
  source_sha256: string;
  created_at: string;
  expires_at: string;
};
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
): Promise<Tariff> {
  if (!identityValid(identity))
    throw new DomainError(
      "LIVE_PRICING_REQUIRED",
      "Compte fournisseur et tarification fax qualifiée requis.",
      409,
    );
  const tariff = await db
    .prepare(
      "SELECT * FROM trusted_fax_tariffs WHERE organization_id=? AND sender_id=? AND provider='telnyx' AND account_id=? AND connection_id=? AND status='qualified' AND options_json=? AND substr(?,1,length(destination_prefix))=destination_prefix ORDER BY length(destination_prefix) DESC LIMIT 1",
    )
    .bind(
      organizationId,
      senderId,
      identity.accountId,
      identity.connectionId,
      options,
      number,
    )
    .first<Tariff & { valid_from: string }>();
  if (
    !tariff ||
    tariff.valid_from > now ||
    tariff.expires_at <= now ||
    pages > tariff.max_pages ||
    !/^[a-f0-9]{64}$/.test(tariff.source_sha256)
  )
    throw new DomainError(
      "LIVE_PRICING_REQUIRED",
      "Aucun tarif fax qualifié et actuel ne couvre cet envoi.",
      409,
    );
  return tariff;
}
function quoteMaterial(quote: LiveFaxQuote) {
  return {
    dispatchId: quote.dispatch_id,
    organizationId: quote.organization_id,
    tariffId: quote.tariff_id,
    provider: "telnyx",
    accountId: quote.account_id,
    connectionId: quote.connection_id,
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
  tariff: Tariff,
  now: string,
): Promise<LiveFaxQuote> {
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
export function insertFaxQuote(db: D1Database, quote: LiveFaxQuote) {
  const columns = Object.keys(quote) as (keyof LiveFaxQuote)[];
  return db
    .prepare(
      `INSERT INTO live_fax_quotes(${columns.join(",")}) SELECT ${columns.map(() => "?").join(",")} WHERE EXISTS(SELECT 1 FROM dispatches WHERE organization_id=? AND id=? AND quote_fingerprint=?)`,
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
): Promise<LiveFaxQuote> {
  if (!identityValid(identity)) throw invalid();
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
