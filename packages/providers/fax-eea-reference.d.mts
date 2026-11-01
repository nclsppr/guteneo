export type FaxReferenceSourceCode =
  "SOURCE_INVALID" | "SOURCE_TOO_LARGE" | "SOURCE_TIMEOUT" | "SOURCE_HTTP";
export class FaxReferenceSourceError extends Error {
  readonly code: FaxReferenceSourceCode;
  constructor(code: FaxReferenceSourceCode);
}
export interface EeaFaxReferenceRoute {
  destinationPrefix: string;
  matchedPrefix: string;
  minuteNanoUsd: number;
  initialSeconds: 60;
  incrementSeconds: 60;
  callNanoUsd: 0;
}
export function validateEeaFaxReferenceScope(
  bindings: readonly Record<string, unknown>[],
  exclusions: readonly Record<string, unknown>[],
): Record<string, unknown>[];
export function parseEeaFaxRateDeck(
  chunks: AsyncIterable<Uint8Array>,
  bindings: readonly Record<string, unknown>[],
  exclusions: readonly Record<string, unknown>[],
): Promise<{
  routes: EeaFaxReferenceRoute[];
  sha256: string;
  bytes: number;
  relevantRows: number;
}>;
export function parseReferencePagePrice(bytes: Uint8Array): number;
export function parseReferenceFx(
  bytes: Uint8Array,
  observedAt: string,
): {
  date: string;
  numerator: number;
  denominator: number;
  source: "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
};
