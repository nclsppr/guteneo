import { createHash } from "node:crypto";

export type WorldwideFaxReference = {
  senderCountry: string;
  observedAt: string;
  lastKnown: boolean;
  destinationPrefix: string;
  destinationCountry: string;
  minuteNanoUsd: number;
  callNanoUsd: number;
  initialSeconds: number;
  incrementSeconds: number;
  pageNanoUsd: number;
  fxNumerator: number;
  fxDenominator: number;
  fxDate: string;
  fxSource: string;
  sourceReference: string;
  sourceSha256: string;
};
export type WorldwideFaxBinding = {
  accountId: string;
  connectionId: string;
  outboundProfileId: string;
  senderNumber: string;
};
export function worldwideFaxScope(binding: WorldwideFaxBinding) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        "telnyx:global_conversational",
        binding.accountId,
        binding.connectionId,
        binding.outboundProfileId,
        binding.senderNumber,
      ]),
    )
    .digest("hex");
}
export function faxCatalogBucket(prefix: string) {
  return prefix.length < 4 || prefix.includes("X") ? "*" : prefix.slice(0, 4);
}
export type CatalogEvidence = Pick<
  WorldwideFaxReference,
  | "senderCountry"
  | "pageNanoUsd"
  | "fxNumerator"
  | "fxDenominator"
  | "fxDate"
  | "fxSource"
  | "sourceReference"
  | "sourceSha256"
> & {
  bytes: number;
  rows: number;
  countries: string[];
  discoverySha256: string;
  deckSha256: string;
  pageSha256: string;
  fxSha256: string;
};
type Selection = {
  score: number;
  route: Pick<
    WorldwideFaxReference,
    | "destinationPrefix"
    | "destinationCountry"
    | "minuteNanoUsd"
    | "callNanoUsd"
    | "initialSeconds"
    | "incrementSeconds"
  >;
  ambiguous: boolean;
};

/** One indexed snapshot read, with no provider or customer data in the catalogue. */
export async function resolveWorldwideFaxReference(
  db: D1Database,
  input: WorldwideFaxBinding & { destinationNumber: string },
): Promise<WorldwideFaxReference | null> {
  if (!/^\+[1-9]\d{6,14}$/.test(input.destinationNumber)) return null;
  const digits = input.destinationNumber.slice(1);
  const rows = await db
    .prepare(
      `SELECT r.evidence_json,r.created_at,s.last_failure_at,b.routes FROM worldwide_fax_catalog_state s
    JOIN worldwide_fax_catalog_revisions r ON r.scope=s.scope AND r.id=s.revision
    JOIN worldwide_fax_catalog_buckets b ON b.deck_id=r.deck_id AND b.bucket IN ('*',?)
    WHERE s.scope=?`,
    )
    .bind(faxCatalogBucket(digits), worldwideFaxScope(input))
    .all<{
      evidence_json: string;
      created_at: string;
      last_failure_at: string | null;
      routes: string;
    }>();
  let best: Selection | undefined;
  for (const block of rows.results) {
    for (const line of block.routes.split("\n")) {
      if (!line) continue;
      const [pattern, iso, origin, exact, minute, call, initial, increment] =
        line.split("|");
      if (exact === "1" && digits.length !== pattern.length) continue;
      if (
        pattern.includes("X")
          ? !new RegExp("^" + pattern.replaceAll("X", "[0-9]")).test(digits)
          : !digits.startsWith(pattern)
      )
        continue;
      // Prefer the most specific destination, then literal over wildcard,
      // exact over prefix, and finally the most specific matching origin.
      const score =
        pattern.length * 10_000 +
        pattern.replaceAll("X", "").length * 100 +
        Number(exact) * 20 +
        Number(origin);
      const route = {
        destinationPrefix: "+" + digits.slice(0, pattern.length),
        destinationCountry: iso.includes("/") ? "ZZ" : iso,
        minuteNanoUsd: Number(minute),
        callNanoUsd: Number(call),
        initialSeconds: Number(initial),
        incrementSeconds: Number(increment),
      };
      if (!best || score > best.score)
        best = { score, route, ambiguous: false };
      else if (score === best.score) {
        // Countries can share numbering space and an identical published rate.
        // Keep the price while avoiding an invented country for this recipient.
        if (
          route.minuteNanoUsd !== best.route.minuteNanoUsd ||
          route.callNanoUsd !== best.route.callNanoUsd ||
          route.initialSeconds !== best.route.initialSeconds ||
          route.incrementSeconds !== best.route.incrementSeconds
        )
          best.ambiguous = true;
        if (route.destinationCountry !== best.route.destinationCountry)
          best.route.destinationCountry = "ZZ";
      }
    }
  }
  if (
    !best ||
    best.ambiguous ||
    best.route.initialSeconds > 600 ||
    best.route.incrementSeconds > 600 ||
    best.route.callNanoUsd > 100_000_000_000 ||
    best.route.minuteNanoUsd > 100_000_000_000 ||
    !/^[A-Z]{2}$/.test(best.route.destinationCountry)
  )
    return null;
  const evidence = JSON.parse(rows.results[0].evidence_json) as CatalogEvidence;
  const {
    pageNanoUsd,
    fxNumerator,
    fxDenominator,
    fxDate,
    fxSource,
    sourceReference,
    sourceSha256,
  } = evidence;
  return {
    senderCountry: evidence.senderCountry,
    ...best.route,
    observedAt: rows.results[0].created_at,
    lastKnown:
      Boolean(rows.results[0].last_failure_at) ||
      Date.now() - Date.parse(rows.results[0].created_at) > 86_400_000,
    pageNanoUsd,
    fxNumerator,
    fxDenominator,
    fxDate,
    fxSource,
    sourceReference,
    sourceSha256,
  };
}
