import {
  asObject,
  ProviderError,
  type Fetcher,
  type ProviderResult,
} from "./types";

export async function boundedText(
  response: Response,
  limit = 1024 * 1024,
): Promise<string> {
  if (Number(response.headers.get("content-length") ?? 0) > limit)
    throw new ProviderError("provider_response_too_large");
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new ProviderError("provider_response_too_large");
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
export async function jsonResponse(
  response: Response,
): Promise<Record<string, unknown>> {
  return asObject(JSON.parse(await boundedText(response)));
}
/** One network request only, including mutation calls; redirects never receive secrets. */
export function request(
  fetcher: Fetcher,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetcher(url, {
    ...init,
    redirect: "error",
    signal: init.signal ?? AbortSignal.timeout(20_000),
  });
}
export function rejection(response: Response): ProviderResult {
  // A timeout/5xx/conflict may follow an already committed provider operation.
  const ambiguous =
    response.status < 400 ||
    response.status >= 500 ||
    response.status === 408 ||
    response.status === 409;
  return {
    status: ambiguous ? "submission_unknown" : "rejected",
    errorCode: `provider_http_${response.status}`,
    retryable: !ambiguous && response.status === 429,
    requestId: response.headers.get("x-request-id") ?? undefined,
  };
}
export function unknownResult(providerId?: string): ProviderResult {
  return {
    status: "submission_unknown",
    errorCode: "provider_response_unknown",
    retryable: false,
    ...(providerId ? { providerId } : {}),
  };
}
export async function requireOk(response: Response): Promise<void> {
  if (!response.ok)
    throw new ProviderError(
      `provider_http_${response.status}`,
      response.status === 429 || response.status >= 500,
    );
}
