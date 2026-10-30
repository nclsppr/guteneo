import { createHash } from "node:crypto";
import { E2E_HTTP_PATHS, E2E_PAGES } from "../apps/status/production-e2e";

const pagePaths = new Set<string>(E2E_PAGES.map((page) => page.path));
const publicPaths = new Set<string>(E2E_HTTP_PATHS);
const encodings = new Set(["identity", "gzip", "br", "deflate", "zstd"]);
type PageObservation = { path: string; observedDecodedBytes: number; observedSha256: string; responseContentEncoding: string };
type ExpectedPage = { expectedBytes: number; expectedSha256: string };

/** Node's automatic decompression must never change the manifest comparison.
 * Request the original representation and observe the same bounded stream the
 * collector checks. No clone, page contents, request headers or free text escape.
 */
export function publicObservationTransport(fetcher: typeof fetch = fetch) {
  const pages = new Map<string, PageObservation>();
  const expectedPages = new Map<string, ExpectedPage>();
  const observedFetch: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const path = url.pathname + url.search;
    if (url.origin !== "https://guteneo.com" || url.username || url.password || url.hash || !publicPaths.has(path))
      throw new Error("PUBLIC_ORIGIN_REQUIRED");
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set("Accept-Encoding", "identity");
    headers.set("Cache-Control", "no-transform");
    const response = await fetcher(input, { ...init, headers });
    if ((!pagePaths.has(path) && path !== "/release.json") || !response.body) return response;
    const encoding = response.headers.get("Content-Encoding")?.toLowerCase() ?? "identity";
    const hash = createHash("sha256");
    const releaseChunks: Uint8Array[] = [];
    let bytes = 0;
    const stream = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        bytes += chunk.byteLength; hash.update(chunk);
        if (path === "/release.json" && bytes <= 524288) releaseChunks.push(chunk);
        controller.enqueue(chunk);
      },
      flush() {
        const digest = hash.digest("hex");
        if (path !== "/release.json") {
          pages.set(path, { path, observedDecodedBytes: bytes, observedSha256: digest,
            responseContentEncoding: encodings.has(encoding) ? encoding : "other" });
          return;
        }
        if (bytes > 524288) return;
        try {
          const body = Buffer.concat(releaseChunks);
          const assets: unknown = (JSON.parse(body.toString("utf8")) as { assets?: unknown }).assets;
          if (!Array.isArray(assets)) return;
          for (const page of E2E_PAGES) {
            const url = new URL(page.path, "https://guteneo.com");
            const assetPath = `${url.searchParams.has("lang") ? `/__public-locales/${page.locale}` : ""}${url.pathname}index.html`;
            const asset = assets.find((value: { path?: unknown } | null) => value?.path === assetPath) as
              { bytes?: unknown; sha256?: unknown } | undefined;
            if (typeof asset?.bytes === "number" && Number.isSafeInteger(asset.bytes) && asset.bytes >= 0 && asset.bytes <= 524288 &&
              typeof asset.sha256 === "string" && /^[a-f0-9]{64}$/.test(asset.sha256))
              expectedPages.set(page.path, { expectedBytes: asset.bytes, expectedSha256: asset.sha256 });
          }
        } catch { /* The collector independently rejects an invalid manifest. */ }
      },
    }));
    return new Response(stream, { status: response.status, statusText: response.statusText, headers: response.headers });
  };
  return { fetch: observedFetch, pages, expectedPages };
}

const failureCodes = ["PUBLICATION_AUTHORITY_REQUIRED", "OIDC_ENDPOINT_INVALID", "OIDC_UNAVAILABLE",
  "OIDC_RESPONSE_INVALID", "PUBLICATION_REJECTED", "PUBLICATION_UNAVAILABLE"] as const;
type FailureCode = typeof failureCodes[number];
type Stage = "authority" | "oidc" | "ingestion";
const responseCodes = new Set(["JSON_REQUIRED", "UNAUTHORIZED", "REPORT_REJECTED", "REPORT_ALREADY_RECORDED", "REPORT_STORAGE_UNAVAILABLE"]);

export class PublicationFailure extends Error {
  constructor(readonly code: FailureCode, readonly stage: Stage, readonly httpStatus: number | null = null,
    readonly responseCode = "UNKNOWN") { super(code); }
}

export function productionMonitorFailure(error: unknown) {
  if (error instanceof PublicationFailure && failureCodes.includes(error.code) && ["authority", "oidc", "ingestion"].includes(error.stage)) return {
    code: error.code, stage: error.stage,
    httpStatus: Number.isInteger(error.httpStatus) && error.httpStatus! >= 100 && error.httpStatus! <= 599 ? error.httpStatus : null,
    responseCode: responseCodes.has(error.responseCode) ? error.responseCode : "UNKNOWN",
  };
  return { code: "PRODUCTION_BROWSER_MONITOR_FAILED", stage: "execution", httpStatus: null, responseCode: "UNKNOWN" };
}

/** Fixed byte/deadline limits apply even when the peer streams forever. */
export async function boundedResponseJson(response: Response, limit: number): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("EMPTY_RESPONSE");
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([new Promise<never>((_, reject) => {
      timer = setTimeout(() => { void reader.cancel().catch(() => {}); reject(new Error("RESPONSE_TIMEOUT")); }, 5000);
    }), (async () => {
      const chunks: Uint8Array[] = []; let bytes = 0;
      for (;;) {
        const result = await reader.read(); if (result.done) break;
        bytes += result.value.byteLength;
        if (bytes > limit) throw new Error("RESPONSE_LIMIT");
        chunks.push(result.value);
      }
      const body = new Uint8Array(bytes); let offset = 0;
      for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)) as unknown;
    })()]);
  } finally { clearTimeout(timer!); void reader.cancel().catch(() => {}); }
}

export async function publicationResponseCode(response: Response): Promise<string> {
  try {
    const value = await boundedResponseJson(response, 1024);
    const code = (value as { error?: unknown } | null)?.error;
    return typeof code === "string" && responseCodes.has(code) ? code : "UNKNOWN";
  } catch { return "UNKNOWN"; }
}
