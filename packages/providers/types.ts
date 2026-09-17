/** Provider clients never authorize a send. The caller must persist approval,
 * reservation and attempt state before calling submit. No client retries. */
export type ProviderName = "telnyx" | "ses" | "pingen";
export type ProviderMode = "live" | "sandbox";
export type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
export type Money = { currency: string; minor: number };
export type ProviderEstimate = {
  amount: Money | null;
  reason?: string;
  verifiedAt: string;
};
export type ProviderResult = {
  status: "accepted" | "submission_unknown" | "rejected";
  providerId?: string;
  providerStatus?: string;
  errorCode?: string;
  retryable?: boolean;
  requestId?: string;
};
export type CancelResult = {
  status: "requested" | "confirmed" | "too_late" | "unknown" | "unsupported";
};
export type ProviderStatus = {
  providerId: string;
  providerStatus: string;
  observedAt: string;
  cost: Money | null;
};
export type ProviderEvent = {
  provider: ProviderName;
  eventId: string;
  providerId: string;
  dispatchId?: string;
  kind:
    | "accepted"
    | "delivered"
    | "failed"
    | "bounced"
    | "complained"
    | "printed"
    | "handed_to_post";
  occurredAt: string;
  payload?: Record<string, unknown>;
};
export type ProviderCapabilities = {
  provider: ProviderName;
  channel: "fax" | "email" | "postal";
  mode: ProviderMode;
  canReadStatus: boolean;
  canRequestCancellation: boolean;
  submissionIdempotency: "not_verified" | "24_hours";
};
export class ProviderError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable = false,
  ) {
    super(code);
  }
}
export function requireValue(value: string, name: string): void {
  if (!value || /[\r\n]/.test(value))
    throw new ProviderError(`configuration_${name}`);
}
export function headerSafe(value: string): boolean {
  return value.length > 0 && !/[\r\n\0]/.test(value);
}
export function safeId(id: string): string {
  if (!/^[a-zA-Z0-9_.:-]{1,200}$/.test(id))
    throw new ProviderError("invalid_provider_id");
  return encodeURIComponent(id);
}
export function exactMinor(value: string | number, currency: string): Money {
  // Prices are parsed as decimal digits; never multiplied in binary floating point.
  if (!/^(EUR|USD|CHF|GBP)$/.test(currency))
    throw new ProviderError("unsupported_currency");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) throw new ProviderError("invalid_decimal_amount");
  const minor =
    BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  if (minor > BigInt(Number.MAX_SAFE_INTEGER))
    throw new ProviderError("amount_overflow");
  return { currency, minor: Number(minor) };
}
export function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ProviderError("invalid_provider_response");
  return value as Record<string, unknown>;
}
export function textField(
  object: Record<string, unknown>,
  key: string,
): string {
  if (typeof object[key] !== "string" || !object[key])
    throw new ProviderError("invalid_provider_response");
  return object[key];
}
export function bytesBase64(value: Uint8Array): string {
  let result = "";
  for (let i = 0; i < value.length; i += 8192)
    result += String.fromCharCode(...value.subarray(i, i + 8192));
  return btoa(result);
}
