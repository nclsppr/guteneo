import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  startObservation,
  observePrivateFetch,
  routeCode,
} from "../../packages/observability/src/index";
import type { Env } from "../../apps/api/src/env";
import { DomainService } from "../../packages/domain/src/index";
vi.mock("../../apps/api/src/mcp", () => ({ handleMcp: vi.fn() }));
vi.mock("../../apps/api/src/maintenance", () => ({
  maintainDocuments: vi.fn(async () => ({ purged: 2, orphans: 1 })),
}));
vi.mock("../../apps/api/src/postal", () => ({
  PostalService: vi.fn(),
  cleanupPostalEvidence: vi.fn(async () => undefined),
}));
import worker from "../../apps/api/src/index";

const version = "fcd1cb36-c54b-427a-98b5-19f6f304728a";
const sentinel = "PRIVATE_EMAIL_TOKEN_CONTENT_signed_url";
let records: Record<string, unknown>[];
beforeEach(() => {
  records = [];
  for (const method of ["log", "warn", "error"] as const)
    vi.spyOn(console, method).mockImplementation((value) =>
      records.push(value),
    );
});
afterEach(() => vi.restoreAllMocks());
function environment(overrides: Partial<Env> = {}): Env {
  return {
    ENVIRONMENT: "production",
    MODE: "production",
    APP_ORIGIN: "https://guteneo.com",
    AUTH0_DOMAIN: "fixture.invalid",
    AUTH0_CLIENT_ID: "fixture",
    AUTH0_CLIENT_SECRET: "fixture",
    AUTH0_AUDIENCE: "https://guteneo.com/mcp",
    WRANGLER_VERSION_METADATA: { id: version },
    ...overrides,
  } as Env;
}
function batch() {
  const message = {
    id: sentinel,
    body: { dispatchId: sentinel, recipient: sentinel },
    ack: vi.fn(),
    retry: vi.fn(),
  };
  return {
    message,
    batch: {
      queue: "guteneo-production-interactive",
      messages: [message],
    } as unknown as MessageBatch<{ dispatchId: string }>,
  };
}

describe("private operational observations", () => {
  it("projects only fixed fields and safe numeric counters, including against excess runtime properties", () => {
    const observation = startObservation(
      { WRANGLER_VERSION_METADATA: { id: sentinel } },
      "app",
      "queue",
      sentinel as never,
      sentinel,
    );
    observation.setCode(sentinel as never);
    observation.finish(
      900,
      { acked: 2, retried: NaN, unknown: -1, body: sentinel } as never,
      sentinel as never,
    );
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      versionId: "unavailable",
      route: "unknown",
      code: "INTERNAL_ERROR",
      method: "OTHER",
      acked: 2,
    });
    expect(JSON.stringify(records)).not.toContain(sentinel);
    expect(records[0]).not.toHaveProperty("retried");
    expect(records[0]).not.toHaveProperty("unknown");
    expect(records[0]).not.toHaveProperty("status");
    expect(records[0]).not.toHaveProperty("stage");
  });

  it("records only closed import diagnostics and known provider hosts, never arbitrary domains", () => {
    const observation = startObservation(
      environment(),
      "app",
      "mcp_tool_error",
      "mcp",
    );
    observation.setCode("DOMAIN_REJECTED");
    observation.setImportFailure({
      reason: "download_failed",
      sourceCategory: "public_host",
      knownHost: sentinel,
      url: sentinel,
    } as never);
    observation.finish();
    expect(records[0]).toMatchObject({
      importReason: "download_failed",
      importSource: "public_host",
    });
    expect(records[0]).not.toHaveProperty("importKnownHost");
    expect(JSON.stringify(records)).not.toContain(sentinel);
    const known = startObservation(
      environment(),
      "app",
      "mcp_tool_error",
      "mcp",
    );
    known.setImportFailure({
      reason: "source_expired",
      sourceCategory: "known_provider",
      knownHost: "files.oaiusercontent.com",
    });
    known.finish();
    expect(records[1]).toMatchObject({
      importReason: "source_expired",
      importKnownHost: "files.oaiusercontent.com",
    });
  });

  it("records a fixed secure preparation failure without exporting error details", () => {
    const observation = startObservation(
      environment(),
      "app",
      "queue",
      "distribution",
    );
    observation.setCode("SECURE_PREPARATION_FAILED");
    observation.finish(undefined, { failed: 1, error: sentinel } as never);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      event: "queue",
      route: "distribution",
      code: "SECURE_PREPARATION_FAILED",
      failed: 1,
    });
    expect(JSON.stringify(records)).not.toContain(sentinel);
  });

  it("never includes the OAuth code, state, cookie, path identifier, request body or client correlation header", async () => {
    const response = await worker.fetch(
      new Request(
        `https://guteneo.com/auth/callback?code=${sentinel}&state=${sentinel}`,
        {
          headers: { Cookie: sentinel, "X-Correlation-ID": sentinel },
        },
      ),
      environment(),
      {} as ExecutionContext,
    );
    expect(response.status).toBe(302);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      event: "http",
      route: "auth_callback",
      code: "AUTH_REJECTED",
      versionId: version,
      status: 302,
    });
    expect(response.headers.get("X-Correlation-ID")).toBe(
      records[0].correlationId,
    );
    expect(JSON.stringify(records)).not.toContain(sentinel);
    expect(
      routeCode(
        new Request(`https://guteneo.com/api/documents/${sentinel}/content`),
      ),
    ).toBe("unknown");
    expect(
      routeCode(
        new Request(`https://guteneo.com/api/documents/doc_${version}/content`),
      ),
    ).toBe("documents");
    expect(
      routeCode(
        new Request(
          `https://guteneo.com/api/documents/doc_${version}/validation`,
        ),
      ),
    ).toBe("documents");
    expect(
      routeCode(
        new Request(
          `https://guteneo.com/api/plan/subscribe?private=${sentinel}`,
        ),
      ),
    ).toBe("billing");
  });

  it("records quote renewal failures without retaining dispatch IDs or query strings", async () => {
    const dispatchId = "dsp_00000000-0000-4000-8000-000000000001";
    const response = await worker.fetch(
      new Request(
        `https://guteneo.com/api/dispatches/${dispatchId}/renew-quote?private=${sentinel}`,
        { method: "POST", body: JSON.stringify({ private: sentinel }) },
      ),
      environment(),
      {} as ExecutionContext,
    );
    expect(response.status).toBe(401);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      route: "dispatches",
      method: "POST",
      status: 401,
      code: "AUTH_REJECTED",
    });
    expect(JSON.stringify(records)).not.toContain(dispatchId);
    expect(JSON.stringify(records)).not.toContain(sentinel);
    expect(
      routeCode(
        new Request(
          `https://guteneo.com/api/dispatches/${dispatchId}/renew-quote/extra`,
        ),
      ),
    ).toBe("unknown");
  });

  it("observes secure distribution routes while rejecting arbitrary identifiers and actions", async () => {
    const distributionId = `sd_${"a".repeat(32)}`;
    for (const path of [
      "/api/secure-distributions",
      "/api/secure-distributions/catalog",
      ...[
        "",
        "/renew",
        "/approve",
        "/activate",
        "/confirm",
        "/revoke",
        "/bind",
        "/events",
        "/preview/1",
        "/preview/100/text",
      ].map((suffix) => `/api/secure-distributions/${distributionId}${suffix}`),
    ])
      expect(routeCode(new Request(`https://guteneo.com${path}`))).toBe(
        "distribution",
      );
    for (const suffix of [
      "/confirm/extra",
      "/download",
      "/preview/0",
      "/preview/101",
      "/preview/1/text/extra",
      `/${sentinel}`,
    ])
      expect(
        routeCode(
          new Request(
            `https://guteneo.com/api/secure-distributions/${distributionId}${suffix}`,
          ),
        ),
      ).toBe("unknown");
    expect(
      routeCode(
        new Request(
          `https://guteneo.com/api/secure-distributions/${sentinel}/confirm`,
        ),
      ),
    ).toBe("unknown");
    const response = await worker.fetch(
      new Request(
        `https://guteneo.com/api/secure-distributions/${distributionId}/confirm?token=${sentinel}`,
        { method: "POST", body: sentinel },
      ),
      environment(),
      {} as ExecutionContext,
    );
    expect(response.status).toBe(401);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      route: "distribution",
      method: "POST",
      code: "AUTH_REJECTED",
      status: 401,
    });
    expect(JSON.stringify(records)).not.toContain(distributionId);
    expect(JSON.stringify(records)).not.toContain(sentinel);
  });

  it("captures configuration failures that used to return before the request logger", async () => {
    const response = await worker.fetch(
      new Request("https://guteneo.com/api/session"),
      environment({ AUTH0_CLIENT_SECRET: undefined }),
      {} as ExecutionContext,
    );
    expect(response.status).toBe(503);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      route: "session",
      code: "CONFIGURATION_INVALID",
      status: 503,
    });
  });

  it("captures an API exception without recording its attacker-controlled name or database details", async () => {
    const error = new Error(sentinel, { cause: sentinel });
    error.name = sentinel;
    const response = await worker.fetch(
      new Request("https://guteneo.com/api/session", {
        headers: { Cookie: `__Host-guteneo_session=${"x".repeat(43)}` },
      }),
      environment({
        DB: {
          prepare: () => {
            throw error;
          },
        } as unknown as D1Database,
      }),
      {} as ExecutionContext,
    );
    expect(response.status).toBe(500);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      route: "session",
      code: "INTERNAL_ERROR",
      status: 500,
    });
    expect(JSON.stringify(records)).not.toContain(sentinel);
    expect(await response.text()).not.toContain(sentinel);
  });

  it("avoids custom logs on media capability paths and unknown paths", async () => {
    for (const path of [`/media/${sentinel}`, `/api/${sentinel}`]) {
      const response = await worker.fetch(
        new Request(`https://guteneo.com${path}`),
        environment({ AUTH0_CLIENT_SECRET: undefined }),
        {} as ExecutionContext,
      );
      expect(response.status).toBe(503);
    }
    expect(records).toEqual([]);
  });

  it("replaces private worker exceptions without serializing their message, name, cause or stack", async () => {
    for (const component of ["documents", "scanner"] as const) {
      const error = new Error(sentinel, { cause: sentinel });
      error.name = sentinel;
      const response = await observePrivateFetch(
        new Request(
          `https://private.invalid/${component === "scanner" ? "scan" : "render"}?token=${sentinel}`,
          { method: "POST", body: sentinel },
        ),
        environment(),
        component,
        async () => {
          throw error;
        },
      );
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: { code: "INTERNAL_ERROR" },
      });
      expect(response.headers.get("X-Correlation-ID")).toBe(
        records.at(-1)?.correlationId,
      );
    }
    expect(records).toHaveLength(2);
    expect(JSON.stringify(records)).not.toContain(sentinel);
  });

  it("observes fixed private page-rendering paths without exposing source hashes or watermark values", async () => {
    for (const path of ["/review-pages", "/secure-pages"]) {
      const request = new Request(
        `https://private.invalid${path}?token=${sentinel}`,
        {
          method: "POST",
          headers: {
            "X-Guteneo-Source-Sha256": sentinel,
            "X-Guteneo-Watermark": sentinel,
          },
          body: sentinel,
        },
      );
      expect(routeCode(request, "documents")).toBe("render");
      const response = await observePrivateFetch(
        request,
        environment(),
        "documents",
        async () => {
          throw new Error(sentinel);
        },
      );
      expect(response.status).toBe(500);
      expect(records.at(-1)).toMatchObject({
        component: "documents",
        route: "render",
        code: "INTERNAL_ERROR",
      });
      expect(
        routeCode(
          new Request(`https://private.invalid${path}/${sentinel}`),
          "documents",
        ),
      ).toBe("unknown");
    }
    expect(records).toHaveLength(2);
    expect(JSON.stringify(records)).not.toContain(sentinel);
  });

  it.each(["submission_unknown", "failed", "bounced", "complained"] as const)(
    "acknowledges %s and observes its outcome without exporting message bodies or IDs",
    async (status) => {
      const { message, batch: input } = batch();
      const process = vi
        .spyOn(DomainService.prototype, "processDispatch")
        .mockResolvedValue({ processed: true, status });
      const db = {
        prepare: () => ({
          bind: () => ({ first: async () => ({ channel: "email" }) }),
        }),
      } as unknown as D1Database;
      await worker.queue(
        input,
        environment({ ENVIRONMENT: "local", MODE: "simulation", DB: db }),
      );
      expect(process).toHaveBeenCalledOnce();
      expect(message.ack).toHaveBeenCalledOnce();
      expect(message.retry).not.toHaveBeenCalled();
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        event: "queue",
        code:
          status === "submission_unknown"
            ? "SUBMISSION_UNKNOWN"
            : "DISPATCH_FAILED",
        unknown: Number(status === "submission_unknown"),
        failed: Number(status !== "submission_unknown"),
        acked: 1,
        retried: 0,
      });
      expect(JSON.stringify(records)).not.toContain(sentinel);
    },
  );

  it("retains delayed retries and emits a single batch summary on an unexpected database failure", async () => {
    const { message, batch: input } = batch();
    await worker.queue(
      input,
      environment({
        LIVE_SENDS_ENABLED: "true",
        DB: {
          prepare: () => {
            throw new Error(sentinel);
          },
        } as unknown as D1Database,
      }),
    );
    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 30 });
    expect(message.ack).not.toHaveBeenCalled();
    expect(records[0]).toMatchObject({
      code: "QUEUE_RETRY",
      retried: 1,
      acked: 0,
    });
    expect(JSON.stringify(records)).not.toContain(sentinel);
  });

  it("keeps queue bootstrap failures failed with a safe exception and no automatic acknowledgment", async () => {
    const { message, batch: input } = batch();
    await expect(
      worker.queue(input, environment({ AUTH0_CLIENT_SECRET: undefined })),
    ).rejects.toThrow(/^QUEUE_FAILED$/);
    expect(message.ack).not.toHaveBeenCalled();
    expect(records[0]).toMatchObject({ code: "QUEUE_FAILED", acked: 0 });
  });

  it("exposes the failing cron stage without replacing failure with a successful event", async () => {
    await expect(
      worker.scheduled(
        {} as ScheduledController,
        environment({
          DB: {
            prepare: () => {
              throw new Error(sentinel);
            },
          } as unknown as D1Database,
        }),
      ),
    ).rejects.toThrow(/^CRON_FAILED$/);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      event: "cron",
      code: "CRON_FAILED",
      stage: "callbacks",
    });
    expect(JSON.stringify(records)).not.toContain(sentinel);
  });

  it("keeps a failed freshness check separate from the completed cron heartbeat and outbox", async () => {
    const db = {
      batch: async () => [],
      prepare: () => ({
        bind() {
          return this;
        },
        all: async () => ({ results: [] }),
        first: async () => { throw new Error(sentinel); },
        run: async () => ({ success: true }),
      }),
    } as unknown as D1Database;
    vi.spyOn(DomainService.prototype, "publishOutbox").mockResolvedValue({
      published: 3,
    });
    vi.spyOn(
      DomainService.prototype,
      "reconcileExpiredLeases",
    ).mockResolvedValue({ uncertain: 1 });
    await worker.scheduled({} as ScheduledController, environment({ DB: db }));
    expect(records).toHaveLength(2);
    const freshness = records.find((record) => record.event === "freshness");
    expect(freshness).toMatchObject({
      stage: "freshness",
      route: "maintenance",
      code: "FRESHNESS_CHECK_FAILED",
    });
    expect(Number(freshness?.freshnessChecksFailed)).toBeGreaterThan(0);
    expect(records.find((record) => record.event === "cron")).toMatchObject({
      event: "cron",
      stage: "complete",
      code: "SUBMISSION_UNKNOWN",
      published: 3,
      projected: 0,
      pending: 0,
      uncertain: 1,
      purged: 2,
      orphans: 1,
    });
    expect(JSON.stringify(records)).not.toContain(sentinel);
  });
});
