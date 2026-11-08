export const POSTAL_QUOTE_MAX_ATTEMPTS = 20;
export type PostalQuoteState =
  | { phase: "idle" }
  | { phase: "pending"; attempts: number }
  | { phase: "paused" }
  | { phase: "failed"; error: Error };

/** A known still-analysing response is the sole automatic retry edge. */
export function postalQuoteOutcome(
  attempts: number,
  outcome: "not_ready" | Error,
): PostalQuoteState {
  if (outcome instanceof Error) return { phase: "failed", error: outcome };
  return attempts < POSTAL_QUOTE_MAX_ATTEMPTS
    ? { phase: "pending", attempts }
    : { phase: "paused" };
}
