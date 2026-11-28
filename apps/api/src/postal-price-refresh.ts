import { postalCountrySchema } from "../../../packages/contracts/src/postal-destinations";
import { postalReviewInputSchema } from "../../../packages/contracts/src/postal-review";
import type { Fetcher } from "../../../packages/providers";
import type { Env } from "./env";
import { pingen } from "./live-providers";

const HOUR = 3_600_000;
const WEEK = 7 * 24 * HOUR;
type Reference = {
  rowid: number;
  organization_id: string;
  sender_id: string;
  country: string;
  paper_count: number;
  options_json: string;
  observed_at: string | null;
};

// Run only for a selected production account and a currently verified sender.
// The calculator needs country, paper and print options. It never receives a
// customer address, PDF, draft identifier or authorization to send a letter.
export async function refreshPostalPrice(
  env: Env,
  {
    fetcher = fetch,
    now = Date.now,
  }: { fetcher?: Fetcher; now?: () => number } = {},
) {
  const counts = { postalPricesRefreshed: 0, postalPriceRefreshFailed: 0 };
  if (
    env.ENVIRONMENT !== "production" ||
    env.MODE !== "production" ||
    env.POSTAL_DRAFTS_ENABLED !== "true" ||
    !env.PINGEN_ORGANIZATION_ID ||
    env.PINGEN_SANDBOX !== "false"
  )
    return counts;

  const started = now();
  const stamp = new Date(started).toISOString();
  const token = crypto.randomUUID();
  const activeSender = `EXISTS (SELECT 1 FROM senders s JOIN organizations o ON o.id=s.organization_id
    WHERE s.id=r.sender_id AND s.organization_id=r.organization_id AND s.status='verified'
    AND s.channel='postal' AND s.mode='production' AND o.mode='production')`;
  const account = env.PINGEN_ORGANIZATION_ID;
  const row = await env.DB.prepare(
    `UPDATE postal_price_references SET lease_token=?,lease_until=?
    WHERE rowid=(SELECT r.rowid FROM postal_price_references r
      WHERE r.next_due_at<=? AND (r.lease_until IS NULL OR r.lease_until<=?)
      AND r.account_id=? AND r.environment='production' AND ${activeSender}
      ORDER BY r.next_due_at,r.rowid LIMIT 1)
    RETURNING rowid,organization_id,sender_id,country,paper_count,options_json,observed_at`,
  )
    .bind(
      token,
      new Date(started + 120_000).toISOString(),
      stamp,
      stamp,
      account,
    )
    .first<Reference>();
  if (!row) return counts;
  const owned =
    "rowid=? AND organization_id=? AND sender_id=? AND account_id=? AND lease_token=? AND lease_until>? AND observed_at IS ?";
  const owner = () => [
    row.rowid,
    row.organization_id,
    row.sender_id,
    account,
    token,
    new Date(now()).toISOString(),
    row.observed_at,
  ];
  try {
    const options = postalReviewInputSchema.shape.options
      .required()
      .parse(JSON.parse(row.options_json));
    const result = await pingen(env, fetcher, now).estimate({
      ...options,
      country: postalCountrySchema.parse(row.country),
      paperTypes: Array<string>(row.paper_count).fill("normal"),
    });
    if (
      !result.amount ||
      result.amount.currency !== "EUR" ||
      !Number.isSafeInteger(result.amount.minor) ||
      result.amount.minor < 1 ||
      result.amount.minor > 500_000
    )
      throw new Error("POSTAL_PRICE_UNAVAILABLE");
    const finished = now();
    const updated = await env.DB.prepare(
      `UPDATE postal_price_references AS r SET supplier_minor=?,observed_at=?,next_due_at=?,lease_token=NULL,lease_until=NULL WHERE ${owned} AND ${activeSender}`,
    )
      .bind(
        result.amount.minor,
        new Date(finished).toISOString(),
        new Date(finished + WEEK).toISOString(),
        ...owner(),
      )
      .run();
    counts.postalPricesRefreshed = updated.meta.changes;
  } catch {
    counts.postalPriceRefreshFailed = 1;
    await env.DB.prepare(
      `UPDATE postal_price_references SET next_due_at=?,lease_token=NULL,lease_until=NULL WHERE ${owned}`,
    )
      .bind(new Date(now() + HOUR).toISOString(), ...owner())
      .run();
  }
  return counts;
}
