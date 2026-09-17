const MAX_BYTES = 10 * 1024 * 1024;
const DEADLINE_MS = 25_000;
const SCANNER_ERROR_CODES = new Set([
  "SCANNER_NOT_READY",
  "SCANNER_BUSY",
  "SIGNATURES_STALE",
  "SCAN_TIMEOUT",
  "SCAN_INCOMPLETE",
]);

function fail(code: string, status: number): Response {
  return Response.json(
    { verdict: "error", code },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

async function readBounded(
  request: Pick<Request, "body">,
  signal: AbortSignal,
  maxBytes = MAX_BYTES,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!request.body) throw new Error("EMPTY_BODY");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new Error("TIMEOUT"));
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    for (;;) {
      const { value, done } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("BODY_TOO_LARGE");
      chunks.push(value);
    }
  } finally {
    await Promise.race([reader.cancel().catch(() => {}), aborted]).catch(
      () => {},
    );
    signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
  if (size === 0) throw new Error("EMPTY_BODY");
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

async function scannerFailure(
  response: Response,
  signal: AbortSignal,
): Promise<Response> {
  try {
    if (
      response.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase() !== "application/json"
    )
      return fail("SCANNER_UNAVAILABLE", 503);
    const result: unknown = JSON.parse(
      new TextDecoder().decode(await readBounded(response, signal, 4096)),
    );
    if (
      result &&
      typeof result === "object" &&
      !Array.isArray(result) &&
      "code" in result &&
      typeof result.code === "string" &&
      SCANNER_ERROR_CODES.has(result.code)
    )
      return fail(result.code, 503);
  } catch {
    // Untrusted response fields and exception text never cross this boundary.
  }
  return fail(signal.aborted ? "SCAN_TIMEOUT" : "SCANNER_UNAVAILABLE", 503);
}

export async function handleRequest(
  request: Request,
  env: ScannerEnv,
): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (request.method === "GET" && pathname === "/health") {
    const signal = AbortSignal.timeout(DEADLINE_MS);
    try {
      const response = await env.SCANNER_CONTAINER.getByName(
        "scanner-v1",
      ).fetch(
        new Request("http://scanner.internal/health", {
          signal,
        }),
      );
      if (!response.ok) return scannerFailure(response, signal);
      return new Response(response.body, {
        status: response.status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    } catch {
      return fail(signal.aborted ? "SCAN_TIMEOUT" : "SCANNER_UNAVAILABLE", 503);
    }
  }
  if (request.method !== "POST" || pathname !== "/scan")
    return fail("NOT_FOUND", 404);
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/pdf"
  )
    return fail("PDF_CONTENT_TYPE_REQUIRED", 415);
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null &&
    (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_BYTES)
  )
    return fail("BODY_TOO_LARGE", 413);
  const signal = AbortSignal.any([
    request.signal,
    AbortSignal.timeout(DEADLINE_MS),
  ]);
  try {
    const bytes = await readBounded(request, signal);
    const sha256 = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    )
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const response = await env.SCANNER_CONTAINER.getByName("scanner-v1").fetch(
      new Request("http://scanner.internal/scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/pdf",
          "Content-Length": String(bytes.length),
        },
        body: bytes,
        signal,
      }),
    );
    if (!response.ok) return scannerFailure(response, signal);
    let raw: string;
    try {
      raw = new TextDecoder().decode(await readBounded(response, signal, 4096));
    } catch {
      return fail(
        signal.aborted ? "SCAN_TIMEOUT" : "INVALID_SCANNER_RESPONSE",
        503,
      );
    }
    const result = JSON.parse(raw) as {
      sha256?: string;
      verdict?: string;
      engine?: unknown;
    };
    if (
      result.sha256 !== sha256 ||
      !["clean", "infected"].includes(result.verdict ?? "")
    )
      return fail("INVALID_SCANNER_RESPONSE", 503);
    return Response.json(
      { sha256, verdict: result.verdict, engine: result.engine },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "BODY_TOO_LARGE")
      return fail("BODY_TOO_LARGE", 413);
    if (error instanceof Error && error.message === "EMPTY_BODY")
      return fail("EMPTY_BODY", 400);
    return fail(signal.aborted ? "SCAN_TIMEOUT" : "SCANNER_UNAVAILABLE", 503);
  }
}
