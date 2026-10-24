import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  boundedResponseJson,
  PublicationFailure,
  productionMonitorFailure,
  publicationResponseCode,
  publicObservationTransport,
} from "../../scripts/production-e2e-runtime";

const encoder = new TextEncoder();
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const streamed = (chunks: Uint8Array[], headers: HeadersInit = {}) =>
  new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  }), { headers });
const fetcherReturning = (response: Response) => vi.fn<typeof fetch>(async () => response);

afterEach(() => { vi.useRealTimers(); });

describe("public observation transport", () => {
  it("preserves streamed bytes and request controls while recording only fixed metadata", async () => {
    const body = encoder.encode("<html lang=\"fr\">Épreuve €</html>");
    const upstream = streamed([body.slice(0, 19), body.slice(19, 28), body.slice(28)], {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Encoding": "GZip",
    });
    const fetcher = fetcherReturning(upstream);
    const transport = publicObservationTransport(fetcher);
    const controller = new AbortController();
    const response = await transport.fetch("https://guteneo.com/", {
      method: "GET", redirect: "manual", cache: "no-store", credentials: "omit",
      signal: controller.signal,
      headers: { Accept: "text/html, text/plain", "Accept-Encoding": "gzip", "X-Private": "never-in-diagnostics" },
    });
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(body);
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://guteneo.com/");
    expect(init).toMatchObject({ method: "GET", redirect: "manual", cache: "no-store", credentials: "omit" });
    expect(init?.signal).toBe(controller.signal);
    const headers = new Headers(init?.headers);
    expect(headers.get("Accept")).toBe("text/html, text/plain");
    expect(headers.get("Accept-Encoding")).toBe("identity");
    expect(headers.get("Cache-Control")).toBe("no-transform");
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(transport.pages.get("/")).toEqual({
      path: "/", observedDecodedBytes: body.byteLength, observedSha256: digest(body), responseContentEncoding: "gzip",
    });
    expect(JSON.stringify([...transport.pages])).not.toContain("Épreuve");
    expect(JSON.stringify([...transport.pages])).not.toContain("never-in-diagnostics");
  });

  it.each(["https://example.com/", "https://guteneo.com.example.com/", "http://guteneo.com/"])(
    "rejects a request outside the fixed public origin: %s", async (url) => {
      const fetcher = fetcherReturning(new Response("unused"));
      await expect(publicObservationTransport(fetcher).fetch(url)).rejects.toThrow("PUBLIC_ORIGIN_REQUIRED");
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it.each(["identity", "gzip", "br", "deflate", "zstd"])("allows only the fixed encoding label %s", async (encoding) => {
    const transport = publicObservationTransport(fetcherReturning(streamed([encoder.encode("public")], { "Content-Encoding": encoding })));
    await (await transport.fetch("https://guteneo.com/?lang=en")).arrayBuffer();
    expect(transport.pages.get("/?lang=en")?.responseContentEncoding).toBe(encoding);
  });

  it("replaces unrecognized encoding text and ignores unlisted paths", async () => {
    const secret = "unexpected-provider-value-Bearer-private";
    const transport = publicObservationTransport(fetcherReturning(streamed([encoder.encode("public")], { "Content-Encoding": secret })));
    await (await transport.fetch("https://guteneo.com/")).arrayBuffer();
    expect(transport.pages.get("/")?.responseContentEncoding).toBe("other");
    expect(JSON.stringify([...transport.pages])).not.toContain(secret);

    const ignored = publicObservationTransport(fetcherReturning(new Response("not a monitored page")));
    await (await ignored.fetch("https://guteneo.com/api/health")).arrayBuffer();
    expect(ignored.pages.size).toBe(0);
  });

  it("extracts bounded manifest expectations for fixed pages without changing its bytes", async () => {
    const sha = "a".repeat(64);
    const body = encoder.encode(JSON.stringify({ assets: [
      { path: "/index.html", bytes: 123, sha256: sha },
      { path: "/__public-locales/en/index.html", bytes: 234, sha256: sha },
      { path: "/__public-locales/de/index.html", bytes: 524289, sha256: sha },
      { path: "/__public-locales/lb/index.html", bytes: 20, sha256: "untrusted-text" },
      { path: "/unmonitored/index.html", bytes: 345, sha256: sha },
    ] }));
    const transport = publicObservationTransport(fetcherReturning(streamed([body.slice(0, 31), body.slice(31)])));
    const response = await transport.fetch("https://guteneo.com/release.json");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(body);
    expect([...transport.expectedPages]).toEqual([
      ["/", { expectedBytes: 123, expectedSha256: sha }],
      ["/?lang=en", { expectedBytes: 234, expectedSha256: sha }],
    ]);
    expect(transport.pages.size).toBe(0);
  });

  it("propagates consumer cancellation and does not publish a partial body hash", async () => {
    let completeCancellation!: (reason: unknown) => void;
    const cancelled = new Promise<unknown>((resolve) => { completeCancellation = resolve; });
    const upstream = new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(encoder.encode("partial")); },
      cancel(reason) { completeCancellation(reason); },
    }));
    const transport = publicObservationTransport(fetcherReturning(upstream));
    const response = await transport.fetch("https://guteneo.com/");
    const reader = response.body!.getReader();
    expect((await reader.read()).value).toEqual(encoder.encode("partial"));
    await reader.cancel("collector-body-limit");
    await expect(cancelled).resolves.toBe("collector-body-limit");
    expect(transport.pages.size).toBe(0);
  });
});

describe("bounded response JSON", () => {
  it("parses chunked UTF-8 exactly at the byte limit", async () => {
    const body = encoder.encode(JSON.stringify({ label: "€" }));
    const euro = body.indexOf(0xe2);
    const response = streamed([body.slice(0, euro + 1), body.slice(euro + 1)], { "Content-Length": "1" });
    await expect(boundedResponseJson(response, body.byteLength)).resolves.toEqual({ label: "€" });
  });

  it("rejects an oversized stream and cancels its source", async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(encoder.encode('{"tooLarge":true}')); },
      cancel,
    }), { headers: { "Content-Length": "1" } });
    await expect(boundedResponseJson(response, 4)).rejects.toThrow("RESPONSE_LIMIT");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("enforces its absolute deadline even if source cancellation never settles", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const response = new Response(new ReadableStream<Uint8Array>({ cancel }));
    const assertion = expect(boundedResponseJson(response, 1024)).rejects.toThrow("RESPONSE_TIMEOUT");
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects malformed UTF-8 and missing bodies", async () => {
    await expect(boundedResponseJson(streamed([new Uint8Array([0xff])]), 10)).rejects.toThrow();
    await expect(boundedResponseJson(new Response(null), 10)).rejects.toThrow("EMPTY_RESPONSE");
  });
});

describe("publication failure projection", () => {
  it("projects only the known code, stage, HTTP status and ingestion code", () => {
    const failure = new PublicationFailure("PUBLICATION_REJECTED", "ingestion", 401, "REPORT_REJECTED");
    failure.message = "Bearer private-token upstream body";
    expect(productionMonitorFailure(failure)).toEqual({
      code: "PUBLICATION_REJECTED", stage: "ingestion", httpStatus: 401, responseCode: "REPORT_REJECTED",
    });
  });

  it("does not expose arbitrary Error messages or lookalike objects", () => {
    const expected = { code: "PRODUCTION_BROWSER_MONITOR_FAILED", stage: "execution", httpStatus: null, responseCode: "UNKNOWN" };
    expect(productionMonitorFailure(new Error("Bearer private-token"))).toEqual(expected);
    expect(productionMonitorFailure({ code: "PUBLICATION_REJECTED", stage: "private-token", message: "secret" })).toEqual(expected);
    expect(productionMonitorFailure(null)).toEqual(expected);
  });

  it("discards invalid response metadata instead of echoing upstream text", () => {
    expect(productionMonitorFailure(new PublicationFailure("OIDC_UNAVAILABLE", "oidc", 999, "Bearer private-token"))).toEqual({
      code: "OIDC_UNAVAILABLE", stage: "oidc", httpStatus: null, responseCode: "UNKNOWN",
    });
    const failure = Object.assign(new PublicationFailure("PUBLICATION_REJECTED", "ingestion"), { code: "Bearer private-token" });
    expect(productionMonitorFailure(failure)).toEqual({
      code: "PRODUCTION_BROWSER_MONITOR_FAILED", stage: "execution", httpStatus: null, responseCode: "UNKNOWN",
    });
  });

  it("refuses a mutated stage that contains sensitive free text", () => {
    const failure = Object.assign(new PublicationFailure("PUBLICATION_REJECTED", "ingestion"), { stage: "Bearer private-token" });
    expect(productionMonitorFailure(failure)).toEqual({
      code: "PRODUCTION_BROWSER_MONITOR_FAILED", stage: "execution", httpStatus: null, responseCode: "UNKNOWN",
    });
  });
});

describe("ingestion response codes", () => {
  it.each(["JSON_REQUIRED", "UNAUTHORIZED", "REPORT_REJECTED", "REPORT_ALREADY_RECORDED", "REPORT_STORAGE_UNAVAILABLE"])(
    "retains only the known public ingestion code %s", async (error) => {
      await expect(publicationResponseCode(Response.json({ error, details: "Bearer private-token" }))).resolves.toBe(error);
    },
  );

  it.each([{ error: "Bearer private-token" }, { error: { secret: "private-token" } }, { message: "UNAUTHORIZED" }, null])(
    "returns UNKNOWN for arbitrary JSON without exposing it", async (body) => {
      await expect(publicationResponseCode(Response.json(body))).resolves.toBe("UNKNOWN");
    },
  );

  it("returns UNKNOWN for oversized or malformed response bodies", async () => {
    await expect(publicationResponseCode(Response.json({ error: "REPORT_REJECTED", padding: "x".repeat(1024) }))).resolves.toBe("UNKNOWN");
    await expect(publicationResponseCode(new Response("not-json private-token"))).resolves.toBe("UNKNOWN");
  });
});
