import { canonicalJson, DomainError, sha256, type Dispatch } from "./index";

export const NANO_EUR_PER_CENT = 10_000_000;
export type LiveDeliveryIdentity = {
  accountId: string;
  routeId: string;
  provider?: "ses" | "resend" | "pingen";
};
export type LiveDeliveryIdentities = Partial<
  Record<"email" | "postal", LiveDeliveryIdentity>
>;
export type EmailRateEvidence = {
  usdMicrosPerMessage: number;
  eurPerUsdNumerator: number;
  eurPerUsdDenominator: number;
} & (
  | { attachmentBasis: "no_attachments" | "included_pdf" }
  | {
      attachmentBasis: "raw_pdf_bytes";
      usdMicrosPerGb: number;
      bytesPerGb: number;
    }
);
export type PublicEmailRateEvidence = EmailRateEvidence & {
  attachmentBasis: "no_attachments" | "included_pdf";
  pricingBasis: "public_list_price_ex_tax";
  plan: "Essentials" | "Pro";
  tier: "0-10000000" | "additional_emails";
  unit: "recipient";
  currency: "USD";
  tariffSource:
    "https://aws.amazon.com/ses/pricing/" | "https://resend.com/pricing";
  tariffDate: string;
  fxBasis: "commercial_fixed_reference";
  fxSource: "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
  fxDate: string;
};
export type PublicPostalRateEvidence = {
  pricingBasis: "public_list_price_ex_tax";
  method: "pingen_price_calculator";
  currency: "EUR";
  unit: "letter";
  tariffSource: "https://api.pingen.com/documentation/swagger-docs";
  tariffDate: string;
  taxBasis: "shipping_price_excluding_vat";
  taxSource: "https://help.pingen.com/en/credits-and-billing/introduction-balance-and-credits";
};
/** A dated method qualification, never a fixed price or a supplier invoice. */
export function postalRateEvidence(
  tariffDate = "2026-09-20",
): PublicPostalRateEvidence {
  if (!validDate(tariffDate)) throw unqualified();
  return {
    pricingBasis: "public_list_price_ex_tax",
    method: "pingen_price_calculator",
    currency: "EUR",
    unit: "letter",
    tariffSource: "https://api.pingen.com/documentation/swagger-docs",
    tariffDate,
    taxBasis: "shipping_price_excluding_vat",
    taxSource:
      "https://help.pingen.com/en/credits-and-billing/introduction-balance-and-credits",
  };
}
export function postalPolicyOptions(addressPosition: "left" | "right") {
  if (!["left", "right"].includes(addressPosition)) throw unqualified();
  return (["cheap", "fast"] as const).flatMap((deliveryProduct) =>
    (["simplex", "duplex"] as const).flatMap((printMode) =>
      (["grayscale", "color"] as const).map((printSpectrum) => ({
        addressPosition,
        deliveryProduct,
        printMode,
        printSpectrum,
      })),
    ),
  );
}
export type PricingBasis =
  "qualified_final_variable_cost" | "public_list_price_ex_tax";
export type CommercialFx = {
  numerator: number;
  denominator: number;
  date: string;
  source: string;
};
export type PostalQuoteRequest = {
  organizationId: string;
  senderId: string;
  documentId: string;
  documentSha256: string;
  recipient: Record<string, string>;
  options: Record<string, unknown>;
  identity: LiveDeliveryIdentity;
};
export type PostalSupplierQuote = {
  supplierMinor: number;
  currency: "EUR";
  providerDraftId: string;
  preparedLetterId: string;
  evidenceSha256: string;
};
export type PostalQuoteResolver = (
  request: PostalQuoteRequest,
) => Promise<PostalSupplierQuote>;
type Policy = {
  id: string;
  organization_id: string;
  sender_id: string;
  channel: "email" | "postal";
  provider: "ses" | "resend" | "pingen";
  account_id: string;
  route_id: string;
  options_json: string;
  rate_json: string;
  base_numerator: number;
  byte_numerator: number;
  rate_denominator: number;
  source_reference: string;
  source_sha256: string;
  fiscal_basis: string;
  // fiscal_basis is the legacy SQL compatibility column. This new immutable
  // authority is snapshotted into the quote's already-signed fiscal_basis field.
  pricing_basis?: PricingBasis;
  valid_from: string;
  expires_at: string;
  quote_ttl_seconds: number;
};
export type DeliveryPrice = {
  policy: Policy;
  supplierNanoEur: number;
  customerNanoEur: number;
  supplierNumerator: string;
  supplierDenominator: string;
  attachmentBytes: number;
  providerDraftId: string | null;
  preparedLetterId: string | null;
  evidenceSha256: string;
  amountMinor: number;
};
export type LiveDeliveryQuote = {
  dispatch_id: string;
  organization_id: string;
  policy_id: string;
  channel: "email" | "postal";
  provider: "ses" | "resend" | "pingen";
  account_id: string;
  route_id: string;
  fingerprint: string;
  dispatch_fingerprint: string;
  input_json: string;
  input_fingerprint: string;
  supplier_numerator: string;
  supplier_denominator: string;
  supplier_nanoeur: number;
  customer_nanoeur: number;
  amount_minor: number;
  ceiling_minor: number;
  currency: "EUR";
  price_rule: "supplier_nanoeur_x2_cumulative_cent";
  attachment_bytes: number;
  provider_draft_id: string | null;
  prepared_letter_id: string | null;
  evidence_sha256: string;
  source_reference: string;
  source_sha256: string;
  fiscal_basis: string;
  created_at: string;
  expires_at: string;
};
const invalid = () =>
  new DomainError(
    "LIVE_QUOTE_INVALID",
    "Le devis a expiré ou sa configuration a changé. Préparez un nouvel envoi.",
    409,
  );
const unqualified = () =>
  new DomainError(
    "LIVE_PRICING_REQUIRED",
    "Tarif, devise et compte qualifiés requis pour ce canal.",
    409,
  );
function identityValid(
  identity?: LiveDeliveryIdentity,
): identity is LiveDeliveryIdentity {
  return (
    !!identity &&
    [identity.accountId, identity.routeId].every((v) =>
      /^[a-zA-Z0-9_.:-]{1,200}$/.test(v),
    )
  );
}
function validDate(date: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date
  );
}
function gcd(a: bigint, b: bigint): bigint {
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}
/** Private operator helper. Converts a documented USD schedule and a frozen FX ratio
 * into one exact rational EUR rate; never accepts a client-supplied price. */
export function emailRateComponents(rate: EmailRateEvidence) {
  if (!rate || typeof rate !== "object") throw unqualified();
  const values = [
    rate.usdMicrosPerMessage,
    rate.eurPerUsdNumerator,
    rate.eurPerUsdDenominator,
  ];
  if (
    values.some(
      (v, i) => !Number.isSafeInteger(v) || (i === 0 ? v < 0 : v <= 0),
    )
  )
    throw unqualified();
  let bytesPerGb = 1,
    usdMicrosPerGb = 0;
  if (rate.attachmentBasis === "raw_pdf_bytes") {
    if (
      !Number.isSafeInteger(rate.usdMicrosPerGb) ||
      rate.usdMicrosPerGb < 0 ||
      !Number.isSafeInteger(rate.bytesPerGb) ||
      rate.bytesPerGb <= 0
    )
      throw unqualified();
    bytesPerGb = rate.bytesPerGb;
    usdMicrosPerGb = rate.usdMicrosPerGb;
  } else if (
    (rate.attachmentBasis !== "no_attachments" &&
      rate.attachmentBasis !== "included_pdf") ||
    "usdMicrosPerGb" in rate ||
    "bytesPerGb" in rate
  )
    throw unqualified();
  const common = BigInt(bytesPerGb) * BigInt(rate.eurPerUsdDenominator);
  const base =
    BigInt(rate.usdMicrosPerMessage) *
    1000n *
    BigInt(bytesPerGb) *
    BigInt(rate.eurPerUsdNumerator);
  const bytes =
    BigInt(usdMicrosPerGb) * 1000n * BigInt(rate.eurPerUsdNumerator);
  const divisor = gcd(gcd(base, bytes), common);
  const result = {
    base_numerator: Number(base / divisor),
    byte_numerator: Number(bytes / divisor),
    rate_denominator: Number(common / divisor),
  };
  if (
    !Number.isSafeInteger(result.base_numerator) ||
    result.base_numerator > 1e15 ||
    result.byte_numerator > 1e9 ||
    result.rate_denominator > 1e9
  )
    throw unqualified();
  return result;
}
function qualifiedEmailRate(policy: Policy, documentPresent: boolean) {
  const rate = JSON.parse(policy.rate_json) as EmailRateEvidence &
    Partial<PublicEmailRateEvidence>;
  const components = emailRateComponents(rate);
  const basis = policy.pricing_basis ?? policy.fiscal_basis;
  if (basis === "public_list_price_ex_tax") {
    const dated = (date?: string) =>
      typeof date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      Number.isFinite(Date.parse(date)) &&
      new Date(date).toISOString().slice(0, 10) === date &&
      date <= policy.valid_from.slice(0, 10);
    if (
      policy.channel !== "email" ||
      !(
        (policy.provider === "ses" &&
          rate.attachmentBasis === "no_attachments" &&
          rate.plan === "Essentials" &&
          rate.tier === "0-10000000" &&
          rate.tariffSource === "https://aws.amazon.com/ses/pricing/") ||
        (policy.provider === "resend" &&
          rate.attachmentBasis === "included_pdf" &&
          rate.plan === "Pro" &&
          rate.tier === "additional_emails" &&
          rate.tariffSource === "https://resend.com/pricing" &&
          rate.usdMicrosPerMessage === 900)
      ) ||
      policy.options_json !== "{}" ||
      rate.usdMicrosPerMessage <= 0 ||
      rate.pricingBasis !== "public_list_price_ex_tax" ||
      rate.unit !== "recipient" ||
      rate.currency !== "USD" ||
      rate.fxBasis !== "commercial_fixed_reference" ||
      rate.fxSource !==
        "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml" ||
      !dated(rate.tariffDate) ||
      !dated(rate.fxDate)
    )
      throw unqualified();
  } else if (
    basis !== "qualified_final_variable_cost" ||
    rate.pricingBasis !== undefined
  ) {
    throw unqualified();
  }
  if (
    (rate.attachmentBasis === "no_attachments" && documentPresent) ||
    Object.entries(components).some(
      ([k, v]) => policy[k as keyof typeof components] !== v,
    )
  )
    throw unqualified();
  return components;
}
function publicPriceDisclosure(rate: PublicEmailRateEvidence) {
  return {
    pricingBasis: "public_list_price_ex_tax" as const,
    fx: {
      numerator: rate.eurPerUsdNumerator,
      denominator: rate.eurPerUsdDenominator,
      date: rate.fxDate,
      source: rate.fxSource,
    },
  };
}
function qualifiedPostalRate(policy: Policy) {
  const rate = JSON.parse(
    policy.rate_json,
  ) as Partial<PublicPostalRateEvidence>;
  const basis = policy.pricing_basis ?? policy.fiscal_basis;
  if (basis === "qualified_final_variable_cost") {
    if (rate.pricingBasis !== undefined) throw unqualified();
    return;
  }
  const options = JSON.parse(policy.options_json);
  if (
    basis !== "public_list_price_ex_tax" ||
    policy.channel !== "postal" ||
    policy.provider !== "pingen" ||
    policy.account_id !== policy.route_id ||
    typeof rate.tariffDate !== "string" ||
    !validDate(rate.tariffDate) ||
    rate.tariffDate > policy.valid_from.slice(0, 10) ||
    canonicalJson(rate) !==
      canonicalJson(postalRateEvidence(rate.tariffDate)) ||
    !postalPolicyOptions(options.addressPosition).some(
      (candidate) => canonicalJson(candidate) === policy.options_json,
    ) ||
    policy.base_numerator !== 0 ||
    policy.byte_numerator !== 0 ||
    policy.rate_denominator !== 1
  )
    throw unqualified();
}
/** Add public commercial terms to the signed input, without changing old inputs. */
export function deliveryPriceDisclosure(price?: DeliveryPrice) {
  return price?.policy.pricing_basis === "public_list_price_ex_tax"
    ? price.policy.channel === "postal"
      ? { pricingBasis: "public_list_price_ex_tax" as const }
      : publicPriceDisclosure(JSON.parse(price.policy.rate_json))
    : {};
}
export async function resolveDeliveryPrice(
  db: D1Database,
  request: {
    organizationId: string;
    senderId: string;
    channel: "email" | "postal";
    recipient: Record<string, string>;
    options: Record<string, unknown>;
    document?: { id: string; sha256: string; size: number };
    identity?: LiveDeliveryIdentity;
    postalQuote?: PostalQuoteResolver;
    now: string;
  },
): Promise<DeliveryPrice> {
  if (!identityValid(request.identity)) throw unqualified();
  const expectedProvider =
    request.identity.provider ??
    (request.channel === "email" ? "ses" : "pingen");
  const matchingOptions =
    request.channel === "postal"
      ? Object.fromEntries(
          [
            "addressPosition",
            "deliveryProduct",
            "printMode",
            "printSpectrum",
          ].map((k) => [k, request.options[k]]),
        )
      : expectedProvider === "resend"
        ? {}
        : request.options;
  const policy = await db
    .prepare(
      "SELECT * FROM trusted_delivery_costs WHERE organization_id=? AND sender_id=? AND channel=? AND provider=? AND account_id=? AND route_id=? AND status='qualified' AND options_json=?",
    )
    .bind(
      request.organizationId,
      request.senderId,
      request.channel,
      expectedProvider,
      request.identity.accountId,
      request.identity.routeId,
      canonicalJson(matchingOptions),
    )
    .first<Policy>();
  if (
    !policy ||
    policy.valid_from > request.now ||
    policy.expires_at <= request.now ||
    !/^[a-f0-9]{64}$/.test(policy.source_sha256)
  )
    throw unqualified();
  const protectedLink =
    request.channel === "email" &&
    request.options.emailDeliveryMode === "protected_link";
  const attachmentBytes = protectedLink ? 0 : (request.document?.size ?? 0);
  let numerator: bigint,
    denominator: bigint,
    providerDraftId: string | null = null,
    preparedLetterId: string | null = null,
    evidenceSha256 = policy.source_sha256;
  if (request.channel === "email") {
    if (canonicalJson(matchingOptions) !== policy.options_json)
      throw unqualified();
    const components = qualifiedEmailRate(
      policy,
      !protectedLink && request.document !== undefined,
    );
    if (!Number.isSafeInteger(attachmentBytes) || attachmentBytes < 0)
      throw unqualified();
    if (attachmentBytes > 10_000_000)
      throw new DomainError(
        "EMAIL_ATTACHMENT_TOO_LARGE",
        "La pièce jointe doit faire au maximum 10 Mo. Utilisez un lien protégé pour ce PDF.",
        413,
      );
    numerator =
      BigInt(components.base_numerator) +
      BigInt(components.byte_numerator) * BigInt(attachmentBytes);
    denominator = BigInt(components.rate_denominator);
  } else {
    qualifiedPostalRate(policy);
    if (!request.document || !request.postalQuote) throw unqualified();
    const printOptions = Object.fromEntries(
      ["addressPosition", "deliveryProduct", "printMode", "printSpectrum"].map(
        (k) => [k, request.options[k]],
      ),
    );
    if (canonicalJson(printOptions) !== policy.options_json)
      throw unqualified();
    const quote = await request.postalQuote({
      ...request,
      documentId: request.document.id,
      documentSha256: request.document.sha256,
      identity: request.identity,
    });
    if (
      quote.currency !== "EUR" ||
      !Number.isSafeInteger(quote.supplierMinor) ||
      quote.supplierMinor < 0 ||
      quote.supplierMinor > 500_000 ||
      quote.providerDraftId !== request.options.providerDraftId ||
      quote.preparedLetterId !== request.options.preparedLetterId ||
      !/^[a-f0-9]{64}$/.test(quote.evidenceSha256)
    )
      throw unqualified();
    numerator = BigInt(quote.supplierMinor) * BigInt(NANO_EUR_PER_CENT);
    denominator = 1n;
    providerDraftId = quote.providerDraftId;
    preparedLetterId = quote.preparedLetterId;
    evidenceSha256 = quote.evidenceSha256;
  }
  const supplierNanoEur = Number((numerator + denominator - 1n) / denominator);
  const customerNanoEur = supplierNanoEur * 2;
  if (!Number.isSafeInteger(customerNanoEur) || customerNanoEur > 1e13)
    throw unqualified();
  return {
    policy,
    supplierNanoEur,
    customerNanoEur,
    supplierNumerator: String(numerator),
    supplierDenominator: String(denominator),
    attachmentBytes,
    providerDraftId,
    preparedLetterId,
    evidenceSha256,
    amountMinor: Math.ceil(customerNanoEur / NANO_EUR_PER_CENT),
  };
}
function material(q: LiveDeliveryQuote) {
  const {
    fingerprint: _fingerprint,
    dispatch_fingerprint: _dispatch,
    input_json: _input,
    ...rest
  } = q;
  return rest;
}
export async function makeDeliveryQuote(
  dispatchId: string,
  organizationId: string,
  frozen: Record<string, unknown>,
  price: DeliveryPrice,
  now: string,
): Promise<LiveDeliveryQuote> {
  const protection = (
    frozen.options as { protectedDocument?: { hostingFeeMinor?: number } }
  ).protectedDocument;
  if (
    frozen.estimatedMinor !==
    price.amountMinor + (protection?.hostingFeeMinor ?? 0)
  )
    throw invalid();
  const input = canonicalJson(frozen),
    p = price.policy;
  const quote: LiveDeliveryQuote = {
    dispatch_id: dispatchId,
    organization_id: organizationId,
    policy_id: p.id,
    channel: p.channel,
    provider: p.provider,
    account_id: p.account_id,
    route_id: p.route_id,
    fingerprint: "",
    dispatch_fingerprint: "",
    input_json: input,
    input_fingerprint: await sha256(input),
    supplier_numerator: price.supplierNumerator,
    supplier_denominator: price.supplierDenominator,
    supplier_nanoeur: price.supplierNanoEur,
    customer_nanoeur: price.customerNanoEur,
    amount_minor: price.amountMinor,
    ceiling_minor: frozen.ceilingMinor as number,
    currency: "EUR",
    price_rule: "supplier_nanoeur_x2_cumulative_cent",
    attachment_bytes: price.attachmentBytes,
    provider_draft_id: price.providerDraftId,
    prepared_letter_id: price.preparedLetterId,
    evidence_sha256: price.evidenceSha256,
    source_reference: p.source_reference,
    source_sha256: p.source_sha256,
    fiscal_basis: p.pricing_basis ?? p.fiscal_basis,
    created_at: now,
    expires_at: new Date(
      Math.min(
        Date.parse(p.expires_at),
        Date.parse(now) + p.quote_ttl_seconds * 1000,
      ),
    ).toISOString(),
  };
  quote.fingerprint = await sha256(canonicalJson(material(quote)));
  return quote;
}
export function insertDeliveryQuote(db: D1Database, quote: LiveDeliveryQuote) {
  const columns = Object.keys(quote) as (keyof LiveDeliveryQuote)[];
  return db
    .prepare(
      `INSERT INTO live_delivery_quotes(${columns.join(",")}) SELECT ${columns.map(() => "?").join(",")} WHERE EXISTS(SELECT 1 FROM dispatches WHERE organization_id=? AND id=? AND quote_fingerprint=?)`,
    )
    .bind(
      ...columns.map((c) => quote[c]),
      quote.organization_id,
      quote.dispatch_id,
      quote.fingerprint,
    );
}
export async function validateLiveDeliveryQuote(
  db: D1Database,
  row: Dispatch,
  identity: LiveDeliveryIdentity | undefined,
  now: string,
): Promise<LiveDeliveryQuote> {
  if (!identityValid(identity)) throw invalid();
  const quote = await db
    .prepare(
      "SELECT * FROM valid_live_delivery_quotes WHERE organization_id=? AND dispatch_id=? AND account_id=? AND route_id=? AND created_at<=? AND expires_at>? AND policy_valid_from<=? AND policy_expires_at>?",
    )
    .bind(
      row.organization_id,
      row.id,
      identity.accountId,
      identity.routeId,
      now,
      now,
      now,
      now,
    )
    .first<LiveDeliveryQuote>();
  // SELECT explicitly strips view-only columns from the signed material.
  if (
    !quote ||
    quote.provider !==
      (identity.provider ?? (row.channel === "email" ? "ses" : "pingen")) ||
    (row.provider !== null && row.provider !== quote.provider)
  )
    throw invalid();
  if (quote.channel === "email" || quote.channel === "postal") {
    // Repeat the scope check for reads and immediately before supplier submission,
    // including during a rolling deployment with an older SQL view.
    const policy = await db
      .prepare(
        "SELECT * FROM trusted_delivery_costs WHERE organization_id=? AND id=? AND channel=? AND status='qualified'",
      )
      .bind(row.organization_id, quote.policy_id, quote.channel)
      .first<Policy>();
    try {
      if (!policy) throw invalid();
      if (quote.channel === "postal") qualifiedPostalRate(policy);
      else
        qualifiedEmailRate(
          policy,
          JSON.parse(row.options_json).emailDeliveryMode !== "protected_link" &&
            (row.document_id !== null ||
              JSON.parse(quote.input_json).documentId !== null ||
              quote.attachment_bytes !== 0),
        );
      if (policy.pricing_basis === "public_list_price_ex_tax") {
        const input = JSON.parse(quote.input_json);
        if (input.pricingBasis !== "public_list_price_ex_tax") throw invalid();
        if (quote.channel === "postal") {
          if ("fx" in input) throw invalid();
        } else {
          const disclosure = publicPriceDisclosure(
            JSON.parse(policy.rate_json),
          );
          if (canonicalJson(input.fx) !== canonicalJson(disclosure.fx))
            throw invalid();
        }
      }
    } catch {
      throw invalid();
    }
  }
  const {
    policy_valid_from: _from,
    policy_expires_at: _until,
    ...signed
  } = quote as LiveDeliveryQuote & {
    policy_valid_from: string;
    policy_expires_at: string;
  };
  if (
    quote.fingerprint !== row.quote_fingerprint ||
    quote.dispatch_fingerprint !== row.fingerprint ||
    (await sha256(quote.input_json)) !== quote.input_fingerprint ||
    (await sha256(canonicalJson(material(signed)))) !== quote.fingerprint ||
    (await sha256(
      canonicalJson({
        ...JSON.parse(quote.input_json),
        quoteFingerprint: quote.fingerprint,
      }),
    )) !== row.fingerprint
  )
    throw invalid();
  return signed;
}
