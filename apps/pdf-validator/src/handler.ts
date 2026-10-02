export interface PdfValidatorEnv {
  PDF_VALIDATOR_CONTAINER: DurableObjectNamespace;
}

const VERSION = "1.30.2";
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_CHUNKS = 4096;
const DEADLINE_MS = 45_000;
const TOTAL_RULES: Record<string, number> = {
  ua1: 106,
  ua2: 1727,
  "1b": 129,
  "2b": 144,
  "3b": 146,
  "4": 109,
};
const SPECIFICATIONS: Record<string, ReadonlySet<string>> = {
  ua1: new Set(["ISO 14289-1:2014"]),
  ua2: new Set(["ISO 14289-2:2024", "ISO 32005:2023"]),
  "1b": new Set(["ISO 19005-1:2005"]),
  "2b": new Set(["ISO 19005-2:2011"]),
  "3b": new Set(["ISO 19005-3:2012"]),
  "4": new Set(["ISO 19005-4:2020"]),
};
const CLAUSE =
  /^(?:[0-9]{1,3}(?:\.[0-9]{1,3})*|Table [0-9]+\. [A-Za-z][A-Za-z0-9-]{0,60})$/;
const ERRORS = new Set([
  "VALIDATOR_UNAVAILABLE",
  "VALIDATOR_BUSY",
  "VALIDATION_TIMEOUT",
  "VALIDATION_INCOMPLETE",
  "INVALID_PDF",
]);

function fail(code: string, status = 503): Response {
  return Response.json(
    { code },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

async function readBounded(
  request: Pick<Request, "body">,
  signal: AbortSignal,
  maximum: number,
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
      // Also bound framing objects and Promise.race reactions: tiny/empty chunks
      // can otherwise amplify a small byte stream into unbounded memory use.
      if (value.byteLength === 0 || chunks.length >= MAX_CHUNKS)
        throw new Error("INVALID_STREAM");
      size += value.byteLength;
      if (size > maximum) throw new Error("BODY_TOO_LARGE");
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
    offset += chunk.byteLength;
  }
  return bytes;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("INVALID_RESPONSE");
  return value as Record<string, unknown>;
}

function count(value: unknown, minimum = 0): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > 1_000_000
  )
    throw new Error("INVALID_RESPONSE");
  return value;
}

function engine(value: unknown) {
  const result = object(value);
  if (result.name !== "veraPDF" || result.version !== VERSION)
    throw new Error("INVALID_RESPONSE");
  return { name: "veraPDF", version: VERSION };
}

export function sanitizeResult(
  value: unknown,
  sha256: string,
  profile: string,
) {
  const result = object(value);
  if (
    !Object.hasOwn(TOTAL_RULES, profile) ||
    result.sha256 !== sha256 ||
    result.profile !== profile ||
    typeof result.compliant !== "boolean"
  )
    throw new Error("INVALID_RESPONSE");
  const passedRules = count(result.passedRules);
  const failedRules = count(result.failedRules);
  const failedChecks = count(result.failedChecks);
  if (
    passedRules + failedRules !== TOTAL_RULES[profile] ||
    failedChecks < failedRules ||
    result.compliant !== (failedRules === 0 && failedChecks === 0) ||
    !Array.isArray(result.findings) ||
    result.findings.length !== Math.min(failedRules, 100) ||
    result.truncated !== failedRules > 100
  )
    throw new Error("INVALID_RESPONSE");
  const seen = new Set<string>();
  const findings = result.findings.map((value) => {
    const finding = object(value);
    if (
      typeof finding.specification !== "string" ||
      !SPECIFICATIONS[profile].has(finding.specification) ||
      typeof finding.clause !== "string" ||
      !CLAUSE.test(finding.clause) ||
      finding.clause.length > 100 ||
      (finding.clause.startsWith("Table ") &&
        finding.specification !== "ISO 32005:2023")
    )
      throw new Error("INVALID_RESPONSE");
    const testNumber = count(finding.testNumber, 1);
    const key = `${finding.specification}|${finding.clause}|${testNumber}`;
    if (seen.has(key)) throw new Error("INVALID_RESPONSE");
    seen.add(key);
    return {
      specification: finding.specification,
      clause: finding.clause,
      testNumber,
      failedChecks: count(finding.failedChecks, 1),
    };
  });
  const checks = findings.reduce(
    (total, finding) => total + finding.failedChecks,
    0,
  );
  if (checks > failedChecks || (failedRules <= 100 && checks !== failedChecks))
    throw new Error("INVALID_RESPONSE");
  return {
    sha256,
    profile,
    engine: engine(result.engine),
    compliant: result.compliant,
    passedRules,
    failedRules,
    failedChecks,
    truncated: failedRules > 100,
    findings,
  };
}

async function json(
  response: Response,
  signal: AbortSignal,
  maximum: number,
): Promise<unknown> {
  if (
    response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    throw new Error("INVALID_RESPONSE");
  return JSON.parse(
    new TextDecoder().decode(await readBounded(response, signal, maximum)),
  );
}

export async function handleRequest(
  request: Request,
  env: PdfValidatorEnv,
): Promise<Response> {
  const url = new URL(request.url);
  const health =
    request.method === "GET" && url.pathname === "/health" && !url.search;
  if (!health && (request.method !== "POST" || url.pathname !== "/validate"))
    return fail("NOT_FOUND", 404);
  const profile = url.searchParams.get("profile") ?? "";
  if (
    !health &&
    (Array.from(url.searchParams.keys()).some((key) => key !== "profile") ||
      url.searchParams.getAll("profile").length !== 1 ||
      !Object.hasOwn(TOTAL_RULES, profile))
  )
    return fail("INVALID_PROFILE", 400);
  if (
    !health &&
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
      "application/pdf"
  )
    return fail("PDF_CONTENT_TYPE_REQUIRED", 415);
  const declared = request.headers.get("content-length");
  if (
    !health &&
    declared !== null &&
    (!/^[0-9]+$/.test(declared) ||
      Number(declared) <= 0 ||
      Number(declared) > MAX_BYTES)
  )
    return fail("BODY_TOO_LARGE", 413);
  const signal = AbortSignal.any([
    request.signal,
    AbortSignal.timeout(DEADLINE_MS),
  ]);
  try {
    let bytes: Uint8Array<ArrayBuffer> | undefined;
    let sha256 = "";
    if (!health) {
      bytes = await readBounded(request, signal, MAX_BYTES);
      sha256 = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      )
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    }
    const response = await env.PDF_VALIDATOR_CONTAINER.getByName(
      "pdf-validator-v1",
    ).fetch(
      new Request(
        health
          ? "http://validator.internal/health"
          : `http://validator.internal/validate?profile=${profile}`,
        {
          method: health ? "GET" : "POST",
          signal,
          ...(bytes
            ? {
                body: bytes,
                headers: {
                  "Content-Type": "application/pdf",
                  "Content-Length": String(bytes.byteLength),
                },
              }
            : {}),
        },
      ),
    );
    if (!response.ok) {
      try {
        const result = object(await json(response, signal, 4096));
        if (typeof result.code === "string" && ERRORS.has(result.code))
          return fail(result.code, result.code === "INVALID_PDF" ? 400 : 503);
      } catch {
        /* Provider exception details never cross the boundary. */
      }
      return fail("VALIDATOR_UNAVAILABLE");
    }
    const result = await json(response, signal, health ? 4096 : 32 * 1024);
    if (health) {
      const data = object(result);
      if (data.status !== "ready") throw new Error("INVALID_RESPONSE");
      return Response.json(
        { status: "ready", engine: engine(data.engine) },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json(sanitizeResult(result, sha256, profile), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "BODY_TOO_LARGE")
      return fail("BODY_TOO_LARGE", 413);
    if (error instanceof Error && error.message === "EMPTY_BODY")
      return fail("EMPTY_BODY", 400);
    return fail(
      signal.aborted ? "VALIDATION_TIMEOUT" : "VALIDATION_INCOMPLETE",
    );
  }
}
