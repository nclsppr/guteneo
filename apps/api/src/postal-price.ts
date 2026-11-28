import { canonicalJson } from "../../../packages/domain/src/index";
import {
  pingenDraftPriceEvidence,
  type PostalOptions,
  type PostalPriceSelection,
  type PostalReferencePrice,
} from "../../../packages/providers";
import type { PostalCountry } from "../../../packages/contracts/src/postal-destinations";

// A fixed customer tariff for a letter without a comparable supplier observation.
// Legacy quote arithmetic represents the commercial reference as half the charge.
export const POSTAL_CONTINUITY_CUSTOMER_MINOR = 250;
const WEEK = 7 * 86_400_000;
const scope =
  "organization_id=? AND sender_id=? AND account_id=? AND environment=? AND country=? AND paper_count=? AND options_json=?";
type Input = {
  organizationId: string;
  senderId: string;
  accountId: string;
  environment: "production" | "sandbox";
  country: PostalCountry;
  options: PostalOptions & { addressPosition: "left" | "right" };
};
type Observation = { supplier_minor: number; observed_at: string };
function historicalPrice(row: Observation): PostalReferencePrice {
  return {
    amount: { currency: "EUR", minor: row.supplier_minor },
    reference: { source: "last_known_pingen", observedAt: row.observed_at },
  };
}
// Historical quotes predate the commercial cache. Match their evidence digest
// against this exact paper composition, avoiding assumptions about duplex sheets.
async function historicalQuote(
  db: D1Database,
  input: Input,
  paperCount: number,
) {
  const candidates = await db
    .prepare(
      `
    SELECT q.supplier_nanoeur/10000000 supplier_minor, q.created_at observed_at,
           q.evidence_sha256, pd.provider_id, pd.expected_address
    FROM live_delivery_quotes q
    JOIN provider_drafts pd ON pd.organization_id=q.organization_id AND pd.id=q.provider_draft_id
    JOIN postal_preflights p ON p.organization_id=pd.organization_id AND p.provider_draft_id=pd.id
    WHERE q.organization_id=? AND pd.sender_id=? AND q.account_id=? AND q.route_id=q.account_id
      AND q.channel='postal' AND q.provider='pingen' AND q.currency='EUR'
      AND json_extract(p.profile_json,'$.environment')=?
      AND json_extract(pd.recipient_json,'$.country')=? AND pd.options_json=?
      AND q.supplier_nanoeur>0 AND json_type(q.input_json,'$.postalPriceReference') IS NULL
    ORDER BY q.created_at DESC,q.dispatch_id LIMIT 8`,
    )
    .bind(
      input.organizationId,
      input.senderId,
      input.accountId,
      input.environment,
      input.country,
      canonicalJson(input.options),
    )
    .all<
      Observation & {
        evidence_sha256: string;
        provider_id: string;
        expected_address: string;
      }
    >();
  for (const row of candidates.results) {
    const hash = await pingenDraftPriceEvidence(
      {
        ...input.options,
        country: input.country,
        preparedLetterId: row.provider_id,
        expectedAddress: row.expected_address,
      },
      Array<string>(paperCount).fill("normal"),
      { currency: "EUR", minor: row.supplier_minor },
    );
    if (hash === row.evidence_sha256) return row;
  }
  return null;
}

export function selectPostalPrice(
  db: D1Database,
  input: Input,
  now: () => number,
): PostalPriceSelection {
  return async (paperCount, calculate) => {
    const key = [
      input.organizationId,
      input.senderId,
      input.accountId,
      input.environment,
      input.country,
      paperCount,
      canonicalJson(input.options),
    ];
    const lookup = () =>
      db
        .prepare(
          `SELECT supplier_minor,observed_at FROM postal_price_references WHERE ${scope}`,
        )
        .bind(...key)
        .first<{
          supplier_minor: number | null;
          observed_at: string | null;
        }>();
    const cached = await lookup();
    if (cached?.supplier_minor && cached.observed_at)
      return historicalPrice({
        supplier_minor: cached.supplier_minor,
        observed_at: cached.observed_at,
      });

    let observed: Observation | null = null;
    let source: "last_known_pingen" | "pingen_calculator" = "pingen_calculator";
    if (!cached) {
      try {
        const startedAt = new Date(now()).toISOString();
        const amount = await calculate();
        observed = { supplier_minor: amount.minor, observed_at: startedAt };
      } catch {
        // Only the price request is inside this boundary. Draft, paper,
        // exact options and current route eligibility have separate checks.
        observed = await historicalQuote(db, input, paperCount);
        source = "last_known_pingen";
      }
      const due = new Date(
        now() + (observed && source === "pingen_calculator" ? WEEK : 60_000),
      ).toISOString();
      // Competing customer/cron observations may finish in either order. A
      // failure never clears a good price and an old reply never replaces a newer one.
      await db
        .prepare(
          `INSERT INTO postal_price_references
        (organization_id,sender_id,account_id,environment,country,paper_count,options_json,supplier_minor,observed_at,next_due_at)
        VALUES(?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT DO UPDATE SET supplier_minor=excluded.supplier_minor,observed_at=excluded.observed_at,next_due_at=excluded.next_due_at
        WHERE excluded.observed_at IS NOT NULL AND (postal_price_references.observed_at IS NULL OR excluded.observed_at>postal_price_references.observed_at)`,
        )
        .bind(
          ...key,
          observed?.supplier_minor ?? null,
          observed?.observed_at ?? null,
          due,
        )
        .run();
      const selected = await lookup();
      if (selected?.supplier_minor && selected.observed_at)
        return {
          amount: { currency: "EUR", minor: selected.supplier_minor },
          reference: {
            source:
              selected.observed_at === observed?.observed_at
                ? source
                : "last_known_pingen",
            observedAt: selected.observed_at,
          },
        };
    }
    return {
      amount: { currency: "EUR", minor: POSTAL_CONTINUITY_CUSTOMER_MINOR / 2 },
      reference: { source: "guteneo_continuity_v1" },
    };
  };
}
