import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { build } from "esbuild";
import worker, {
  collectPublicSnapshot,
  handleStatusRequest,
  persistSnapshot,
  PUBLIC_PATHS,
  PROBE_PATHS,
  STALE_MS,
  type Snapshot,
  type StatusEnv,
} from "../../apps/status/worker";

let mf: Miniflare, db: D1Database, env: StatusEnv;
const NOW = Date.parse("2026-10-10T12:31:00.000Z");
const fixtureCommit = "a".repeat(40);
const pages = new Map(
  PUBLIC_PATHS.map((path) => [
    path as string,
    `<html lang="${new URL(path, "https://guteneo.com").searchParams.get("lang") ?? "fr"}"><body>Fixture</body></html>`,
  ]),
);
const manifest = () => ({
  mode: "production",
  publicPreview: false,
  sourceDirty: false,
  sourceCommit: fixtureCommit,
  sourceSnapshotSha256: "b".repeat(64),
  assetsSha256: "c".repeat(64),
  liveSendsEnabled: true,
  liveSendChannels: ["fax", "email"],
  assets: [...pages].map(([path, html]) => {
    const url = new URL(path, "https://guteneo.com");
    return {
      path: `${url.searchParams.has("lang") ? `/__public-locales/${url.searchParams.get("lang")}` : ""}${url.pathname}index.html`,
      bytes: Buffer.byteLength(html),
      sha256: createHash("sha256").update(html).digest("hex"),
    };
  }),
});
const capabilities = () => ({
  mode: "production",
  simulation: false,
  registration: { enabled: true },
  scanner: "connected",
  liveSending: true,
  channels: [
    { id: "fax", liveSending: true },
    { id: "email", liveSending: true },
    { id: "postal", liveSending: false },
  ],
  horizon: { available: false },
  billing: { chargingEnabled: false },
  studio: { ai: { configured: false } },
});
function fixture(url: string): Response {
  const parsed = new URL(url),
    path = parsed.pathname + parsed.search;
  if (parsed.origin !== "https://guteneo.com")
    throw new Error("Unexpected destination");
  if (pages.has(path))
    return new Response(pages.get(path), {
      headers: {
        "Content-Type": "text/html",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "frame-ancestors 'none'",
      },
    });
  if (path === "/release.json") return Response.json(manifest());
  if (path === "/api/health")
    return Response.json({
      status: "ok",
      mode: "production",
      liveSending: true,
    });
  if (path === "/api/capabilities") return Response.json(capabilities());
  return Response.json(
    { error: "UNAUTHORIZED" },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}
const snapshot = (time = NOW) =>
  collectPublicSnapshot(
    async (url) => fixture(url),
    () => time,
  );
const get = (path: string, now = NOW, request?: Request) =>
  handleStatusRequest(
    request ?? new Request(`https://status.guteneo.com${path}`),
    env,
    now,
  );

beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      d1Databases: ["STATUS_DB"],
      compatibilityDate: "2026-09-16",
    }),
  );
  db = (await mf.getD1Database("STATUS_DB")) as unknown as D1Database;
  const sql = readFileSync(
    new URL("../../apps/status/migrations/0001_status.sql", import.meta.url),
    "utf8",
  );
  let statement = "",
    trigger = false;
  for (const raw of sql.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("--")) continue;
    if (!statement) trigger = line.startsWith("CREATE TRIGGER");
    statement += `${line}\n`;
    if ((trigger && line === "END;") || (!trigger && line.endsWith(";"))) {
      await db.prepare(statement).run();
      statement = "";
      trigger = false;
    }
  }
  env = {
    STATUS_DB: db,
    ASSETS: {
      fetch: vi.fn(async () => new Response("asset")),
    } as unknown as Fetcher,
  };
});
beforeEach(async () => {
  await db.batch(
    [
      "DELETE FROM status_metrics",
      "DELETE FROM status_samples",
      "DELETE FROM status_daily",
      "DELETE FROM status_metadata",
    ].map((sql) => db.prepare(sql)),
  );
});
afterAll(async () => {
  await mf.dispose();
});

describe("public collector with no business transport", () => {
  it.each([false, true])(
    "runs default fetch in workerd without following redirects (redirect=%s)",
    async (redirect) => {
      const bundled = await build({
        stdin: {
          contents: `import {collectPublicSnapshot} from ${JSON.stringify(new URL("../../apps/status/worker.ts", import.meta.url).pathname)}; export default { async fetch() { return Response.json(await collectPublicSnapshot()); } };`,
          resolveDir: process.cwd(),
        },
        bundle: true,
        write: false,
        format: "esm",
        target: "es2022",
        platform: "browser",
      });
      const calls: string[] = [];
      const runtime = new Miniflare(
        convertV4MiniflareOptions({
          modules: true,
          script: bundled.outputFiles[0].text,
          compatibilityDate: "2026-09-16",
          outboundService: async (request) => {
            calls.push(request.url);
            expect(request.headers.get("Authorization")).toBeNull();
            expect(request.headers.get("Cookie")).toBeNull();
            return redirect && request.url === "https://guteneo.com/"
              ? new Response(null, {
                  status: 307,
                  headers: { Location: "https://untrusted.invalid/private" },
                })
              : fixture(request.url);
          },
        }),
      );
      try {
        const result = (await (
          await runtime.dispatchFetch(
            "https://status.guteneo.com/test-only-collector",
          )
        ).json()) as Snapshot;
        expect(result.status).toBe(
          redirect ? "attention" : "public_checks_passed",
        );
        expect(
          result.checks.filter((check) => check.status === "pass"),
        ).toHaveLength(redirect ? 13 : 14);
        if (redirect)
          expect(
            result.checks.find((check) => check.path === "/"),
          ).toMatchObject({
            httpStatus: 307,
            code: "REDIRECT_REJECTED",
            status: "fail",
          });
        expect(calls).toHaveLength(14);
        expect(
          calls.every((url) => new URL(url).origin === "https://guteneo.com"),
        ).toBe(true);
      } finally {
        await runtime.dispose();
      }
    },
  );

  it("makes exactly 14 bounded canonical anonymous GETs and preserves partial qualification", async () => {
    let active = 0,
      max = 0;
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      expect(init).toMatchObject({
        method: "GET",
        credentials: "omit",
        redirect: "manual",
        cache: "no-store",
      });
      expect(Object.keys(init.headers as object)).toEqual(["Accept"]);
      max = Math.max(max, ++active);
      await Promise.resolve();
      active--;
      return fixture(url);
    });
    const result = await collectPublicSnapshot(fetcher, () => NOW);
    expect(fetcher).toHaveBeenCalledTimes(14);
    expect(
      new Set(fetcher.mock.calls.map(([url]) => new URL(url).origin)),
    ).toEqual(new Set(["https://guteneo.com"]));
    expect(
      fetcher.mock.calls
        .map(([url]) => new URL(url).pathname + new URL(url).search)
        .sort(),
    ).toEqual([...PROBE_PATHS].sort());
    expect(max).toBeLessThanOrEqual(4);
    expect(result).toMatchObject({
      status: "public_checks_passed",
      qualification: "partial",
      sourceCommit: fixtureCommit,
    });
    expect(result.checks).toHaveLength(14);
    expect(result.coverage).toHaveLength(11);
    expect(
      result.coverage.filter((c) => c.state === "not_checked"),
    ).toHaveLength(7);
    expect(result.categories.map((c) => c.total)).toEqual([7, 3, 4]);
  });

  it.each([
    null,
    [],
    {},
    { ...capabilities(), liveSending: "true" },
    { ...capabilities(), channels: [null] },
  ])("fails closed on malformed capabilities %j", async (value) => {
    const result = await collectPublicSnapshot(
      async (url) =>
        url.endsWith("/api/capabilities") ? Response.json(value) : fixture(url),
      () => NOW,
    );
    expect(result.status).toBe("attention");
    expect(
      result.checks.find((c) => c.path === "/api/capabilities"),
    ).toMatchObject({ status: "fail", code: "CONFIGURATION_INVALID" });
  });

  it.each([
    null,
    [],
    {},
    { ...manifest(), assets: [null] },
    { ...manifest(), liveSendsEnabled: "true" },
  ])("rejects malformed manifests or entries %j", async (value) => {
    const result = await collectPublicSnapshot(
      async (url) =>
        url.endsWith("/release.json") ? Response.json(value) : fixture(url),
      () => NOW,
    );
    expect(result.status).toBe("attention");
    expect(
      result.checks
        .filter((c) => c.kind === "public_page")
        .every((c) => c.status === "fail"),
    ).toBe(true);
  });

  it("detects equal-size content drift and missing anti-cache access policy", async () => {
    const result = await collectPublicSnapshot(
      async (url) =>
        url === "https://guteneo.com/"
          ? new Response(pages.get("/")!.replace("Fixture", "Changed"))
          : url.endsWith("/mcp")
            ? new Response("Unauthorized", { status: 401 })
            : fixture(url),
      () => NOW,
    );
    expect(result.checks.find((c) => c.path === "/")).toMatchObject({
      status: "fail",
      code: "CONTENT_HASH_MISMATCH",
    });
    expect(result.checks.find((c) => c.path === "/mcp")).toMatchObject({
      status: "fail",
      code: "CACHE_POLICY_INVALID",
    });
  });

  it("rejects oversized or failed upstream bodies without revealing their content", async () => {
    const result = await collectPublicSnapshot(
      async (url) => {
        if (url.endsWith("/api/health"))
          return new Response("private=never-expose".repeat(30000));
        if (url.endsWith("/api/documents"))
          throw new Error("private-token signed-url recipient");
        return fixture(url);
      },
      () => NOW,
    );
    expect(result.checks.find((c) => c.path === "/api/health")?.code).toBe(
      "RESPONSE_TOO_LARGE",
    );
    expect(result.checks.find((c) => c.path === "/api/documents")?.code).toBe(
      "FETCH_FAILED",
    );
    expect(JSON.stringify(result)).not.toMatch(
      /private=|private-token|signed-url|recipient/,
    );
  });

  it("bounds a transport that never responds and records a fixed timeout", async () => {
    vi.useFakeTimers();
    try {
      const run = collectPublicSnapshot(
        async (url) =>
          url.endsWith("/api/health")
            ? new Promise<Response>(() => {})
            : fixture(url),
        () => NOW,
      );
      await vi.advanceTimersByTimeAsync(10001);
      const result = await run;
      expect(result.checks.find((c) => c.path === "/api/health")?.code).toBe(
        "TIMEOUT",
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("isolated D1 history and read-only public API", () => {
  it("starts the actual bundled workerd entrypoint and serves unknown before first collection", async () => {
    const bundled = await build({
      entryPoints: [
        new URL("../../apps/status/entry.ts", import.meta.url).pathname,
      ],
      bundle: true,
      write: false,
      format: "esm",
      target: "es2022",
      platform: "browser",
    });
    const runtime = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        script: bundled.outputFiles[0].text,
        d1Databases: ["STATUS_DB"],
        compatibilityDate: "2026-09-16",
      }),
    );
    try {
      const runtimeDb = await runtime.getD1Database("STATUS_DB");
      await runtimeDb
        .prepare(
          "CREATE TABLE status_samples (bucket INTEGER PRIMARY KEY, checked_at TEXT NOT NULL, sample_json TEXT NOT NULL)",
        )
        .run();
      await runtimeDb
        .prepare(
          "CREATE TABLE status_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
        )
        .run();
      const response = await runtime.dispatchFetch(
        "https://status.guteneo.com/api/status",
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        status: "unknown",
        freshness: "missing",
        checkedAt: null,
        checks: [],
      });
      expect(
        (
          await runtime.dispatchFetch(
            "https://status.guteneo.com/api/collect",
            { method: "POST" },
          )
        ).status,
      ).toBe(405);
    } finally {
      await runtime.dispose();
    }
  });

  it("returns missing unknown, no invented history, and no outbound fetch for public reads", async () => {
    const outbound = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("No network allowed"));
    try {
      const response = await get("/api/status");
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        status: "unknown",
        freshness: "missing",
        checkedAt: null,
        collectionStartedAt: null,
        checks: [],
      });
      const history = (await (await get("/api/history?days=365")).json()) as {
        buckets: object[];
      };
      expect(history.buckets).toHaveLength(365);
      expect(
        history.buckets.every(
          (b) => (b as { expectedSamples: number }).expectedSamples === 0,
        ),
      ).toBe(true);
      expect(outbound).not.toHaveBeenCalled();
    } finally {
      outbound.mockRestore();
    }
  });

  it("persists an atomic sample, ignores concurrent duplicate slots, and uses observed availability", async () => {
    const good = await snapshot();
    const failed = await collectPublicSnapshot(
      async (url) =>
        url === "https://guteneo.com/"
          ? new Response("unavailable", { status: 503 })
          : fixture(url),
      () => NOW,
    );
    await Promise.all([
      persistSnapshot(db, good, NOW, NOW),
      persistSnapshot(db, failed, NOW, NOW),
    ]);
    const samples = await db
      .prepare("SELECT COUNT(*) n FROM status_samples")
      .first<{ n: number }>();
    const metrics = await db
      .prepare("SELECT COUNT(*) n FROM status_metrics")
      .first<{ n: number }>();
    expect(samples?.n).toBe(1);
    expect(metrics?.n).toBe(4);
    const raw = await db
      .prepare("SELECT sample_json FROM status_samples")
      .first<{ sample_json: string }>();
    const persisted = JSON.parse(raw!.sample_json) as Snapshot;
    const history = (await (await get("/api/history?days=7")).json()) as {
      buckets: {
        observedSamples: number;
        passedSamples: number;
        availabilityPercent: number;
      }[];
    };
    const today = history.buckets.at(-1)!;
    expect(today.observedSamples).toBe(1);
    expect(today.passedSamples).toBe(
      persisted.status === "public_checks_passed" ? 1 : 0,
    );
    expect(today.availabilityPercent).toBe(
      persisted.status === "public_checks_passed" ? 100 : 0,
    );
  });

  it.each([STALE_MS, STALE_MS + 1, -1])(
    "never presents an expired or future sample as current (%dms)",
    async (age) => {
      await persistSnapshot(db, await snapshot(NOW - age), NOW, NOW);
      const response = await get("/api/status");
      expect(response.status).toBe(503);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.json()).toMatchObject({
        status: "unknown",
        freshness: "stale",
        checkedAt: new Date(NOW - age).toISOString(),
        checks: expect.any(Array),
      });
    },
  );

  it("limits fresh cache life to the remaining freshness window", async () => {
    await persistSnapshot(db, await snapshot(NOW - STALE_MS + 5000), NOW, NOW);
    const response = await get("/api/status");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=5, must-revalidate",
    );
  });

  it.each([7, 30, 365])(
    "returns exactly %d UTC days, null gaps, and no future expected slots",
    async (days) => {
      const first = Date.parse("2026-10-08T23:46:00Z");
      await persistSnapshot(db, await snapshot(first), first, NOW);
      await persistSnapshot(db, await snapshot(), NOW, NOW);
      const data = (await (await get(`/api/history?days=${days}`)).json()) as {
        collectionStartedAt: string;
        buckets: Record<string, unknown>[];
      };
      expect(data.collectionStartedAt).toBe(new Date(first).toISOString());
      expect(data.buckets).toHaveLength(days);
      expect(data.buckets.at(-3)).toMatchObject({
        date: "2026-10-08",
        expectedSamples: 1,
        observedSamples: 1,
        unknownSamples: 0,
        availabilityPercent: 100,
      });
      expect(data.buckets.at(-2)).toMatchObject({
        date: "2026-10-09",
        expectedSamples: 96,
        observedSamples: 0,
        unknownSamples: 96,
        availabilityPercent: null,
        latencyMs: null,
      });
      expect(data.buckets.at(-1)).toMatchObject({
        date: "2026-10-10",
        expectedSamples: 51,
        observedSamples: 1,
        unknownSamples: 50,
        availabilityPercent: 100,
      });
      expect(data.buckets.at(-4)).toMatchObject({
        expectedSamples: 0,
        observedSamples: 0,
        availabilityPercent: null,
      });
    },
  );

  it("removes samples older than 366 days but preserves the original collection start", async () => {
    const old = NOW - 367 * 86400000;
    await persistSnapshot(db, await snapshot(old), old, old);
    await persistSnapshot(db, await snapshot(), NOW, NOW);
    expect(
      await db.prepare("SELECT COUNT(*) n FROM status_samples").first(),
    ).toEqual({ n: 1 });
    expect(
      await db.prepare("SELECT COUNT(*) n FROM status_metrics").first(),
    ).toEqual({ n: 4 });
    expect(
      await db.prepare("SELECT COUNT(*) n FROM status_daily").first(),
    ).toEqual({ n: 4 });
    expect(
      await db
        .prepare(
          "SELECT value FROM status_metadata WHERE key = 'collection_started_at'",
        )
        .first(),
    ).toEqual({ value: new Date(old).toISOString() });
  });

  it.each([
    "/api/history?days=0",
    "/api/history?days=366",
    "/api/history?days=7&days=30",
    "/api/history?days=7&url=https://other.invalid",
    "/api/history?days=07",
    "/api/history?days=0007",
    "/api/history?days=7.0",
    "/api/history?days=7e0",
    "/api/history?days=0x7",
    "/api/history?days=+7",
    "/api/history?days=%207",
    "/api/history?days=%37",
    "/api/history?%64ays=7",
  ])("bounds history request %s", async (path) => {
    const prepare = vi.fn(() => {
      throw new Error("Invalid periods must not query D1");
    });
    const response = await handleStatusRequest(
      new Request(`https://status.guteneo.com${path}`),
      { ...env, STATUS_DB: { prepare } as unknown as D1Database },
      NOW,
    );
    expect(response.status).toBe(400);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("restricts methods, hosts, origins and has no mutation/trigger route", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"])
      expect(
        (
          await get(
            "/api/status",
            NOW,
            new Request("https://status.guteneo.com/api/status", { method }),
          )
        ).status,
      ).toBe(405);
    expect((await get("/api/collect")).status).toBe(404);
    expect((await get("/api/status?url=https://other.invalid")).status).toBe(
      404,
    );
    expect(
      (await get("", NOW, new Request("https://evil.invalid/api/status")))
        .status,
    ).toBe(403);
    expect(
      (
        await get(
          "",
          NOW,
          new Request("https://status.guteneo.com/api/status", {
            headers: { Origin: "https://evil.invalid" },
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      await db.prepare("SELECT COUNT(*) n FROM status_samples").first(),
    ).toEqual({ n: 0 });
    const head = await get(
      "",
      NOW,
      new Request("https://status.guteneo.com/api/status", { method: "HEAD" }),
    );
    expect(await head.text()).toBe("");
    expect(head.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("sanitizes storage failure and only scheduled invocation can collect", async () => {
    const broken = {
      ...env,
      STATUS_DB: {
        prepare() {
          throw new Error("private binding token");
        },
      } as unknown as D1Database,
    };
    const response = await handleStatusRequest(
      new Request("https://status.guteneo.com/api/status"),
      broken,
      NOW,
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private binding token");
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url) => fixture(String(url)));
    try {
      await worker.scheduled(
        { scheduledTime: NOW } as ScheduledController,
        env,
      );
      expect(fetcher).toHaveBeenCalledTimes(14);
    } finally {
      fetcher.mockRestore();
    }
    expect(
      await db.prepare("SELECT COUNT(*) n FROM status_samples").first(),
    ).toEqual({ n: 1 });
  });

  it("rejects empty snapshots before writes and corrupted stored evidence on reads", async () => {
    const incomplete = { ...(await snapshot()), checks: [] };
    await expect(persistSnapshot(db, incomplete, NOW, NOW)).rejects.toThrow(
      "INCOMPLETE_SNAPSHOT",
    );
    expect(
      await db.prepare("SELECT COUNT(*) n FROM status_samples").first(),
    ).toEqual({ n: 0 });
    await db
      .prepare("INSERT INTO status_samples VALUES (?, ?, ?)")
      .bind(NOW, new Date(NOW).toISOString(), JSON.stringify(incomplete))
      .run();
    const response = await get("/api/status");
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      status: "unknown",
      error: "STATUS_STORAGE_UNAVAILABLE",
    });
  });

  it("counts the first scheduled slot even when its result arrives after UTC midnight", async () => {
    const scheduled = Date.parse("2026-10-09T23:45:00Z");
    const completed = Date.parse("2026-10-10T00:00:01Z");
    await persistSnapshot(db, await snapshot(completed), scheduled, completed);
    const data = (await (
      await get("/api/history?days=7", completed)
    ).json()) as {
      collectionStartedAt: string;
      buckets: Record<string, unknown>[];
    };
    expect(data.collectionStartedAt).toBe(new Date(completed).toISOString());
    expect(data.buckets.at(-2)).toMatchObject({
      date: "2026-10-09",
      expectedSamples: 1,
      observedSamples: 1,
      unknownSamples: 0,
    });
    expect(data.buckets.at(-1)).toMatchObject({
      date: "2026-10-10",
      expectedSamples: 1,
      observedSamples: 0,
      unknownSamples: 1,
    });
  });

  it("rejects a corrupted kind or a category inconsistent with its checks", async () => {
    const good = await snapshot();
    for (const invalid of [
      {
        ...good,
        checks: good.checks.map((c, i) =>
          i === 0 ? { ...c, kind: "configuration" as const } : c,
        ),
      },
      {
        ...good,
        categories: good.categories.map((c, i) =>
          i === 0 ? { ...c, passed: 0 } : c,
        ),
      },
    ]) {
      await expect(persistSnapshot(db, invalid, NOW, NOW)).rejects.toThrow(
        "INCOMPLETE_SNAPSHOT",
      );
      await db
        .prepare("INSERT OR REPLACE INTO status_samples VALUES (?, ?, ?)")
        .bind(NOW, good.checkedAt, JSON.stringify(invalid))
        .run();
      expect((await get("/api/status")).status).toBe(503);
    }
  });

  it("reuses only safe public API cache keys and never caches unknown evidence", async () => {
    const cache = {
      match: vi.fn(async () => undefined as Response | undefined),
      put: vi.fn(async () => {}),
    };
    vi.stubGlobal("caches", { default: cache });
    const pending: Promise<unknown>[] = [];
    const ctx = {
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    } as unknown as ExecutionContext;
    try {
      const request = new Request("https://status.guteneo.com/api/status");
      expect((await worker.fetch(request, env, ctx)).status).toBe(503);
      expect(cache.put).not.toHaveBeenCalled();
      const now = Date.now();
      await persistSnapshot(db, await snapshot(now), now, now);
      const fresh = await worker.fetch(request, env, ctx);
      expect(fresh.status).toBe(200);
      await Promise.all(pending);
      expect(cache.put).toHaveBeenCalledTimes(1);
      cache.match.mockResolvedValue(fresh.clone());
      const broken = {
        ...env,
        STATUS_DB: {
          prepare() {
            throw new Error("D1 should not be queried on hit");
          },
        } as unknown as D1Database,
      };
      expect((await worker.fetch(request, broken, ctx)).status).toBe(200);
      const hits = cache.match.mock.calls.length;
      expect(
        (
          await worker.fetch(
            new Request(request, {
              headers: { Origin: "https://evil.invalid" },
            }),
            broken,
            ctx,
          )
        ).status,
      ).toBe(403);
      expect(cache.match.mock.calls).toHaveLength(hits);
      expect(
        (
          await worker.fetch(
            new Request(
              "https://status.guteneo.com/api/history?days=365&url=https://other.invalid",
            ),
            env,
            ctx,
          )
        ).status,
      ).toBe(400);
      expect(cache.match.mock.calls).toHaveLength(hits);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("maps the default history period to the canonical seven-day cache key", async () => {
    const cache = {
      match: vi.fn(async (_key: Request) => Response.json({ cached: true })),
    };
    const prepare = vi.fn(() => {
      throw new Error("Cached requests must not query D1");
    });
    vi.stubGlobal("caches", { default: cache });
    try {
      for (const suffix of ["", "?days=7"]) {
        const response = await worker.fetch(
          new Request(`https://status.guteneo.com/api/history${suffix}`),
          { ...env, STATUS_DB: { prepare } as unknown as D1Database },
          {} as ExecutionContext,
        );
        expect(await response.json()).toEqual({ cached: true });
      }
      expect(cache.match.mock.calls.map(([key]) => key.url)).toEqual([
        "https://status.guteneo.com/api/history?days=7",
        "https://status.guteneo.com/api/history?days=7",
      ]);
      expect(prepare).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("bounds a full year to daily aggregates and measures local D1 work", async () => {
    let written = 0;
    const measured = {
      prepare: db.prepare.bind(db),
      async batch(statements: D1PreparedStatement[]) {
        const results = await db.batch(statements);
        written += results.reduce(
          (sum, result) => sum + result.meta.rows_written,
          0,
        );
        return results;
      },
    } as unknown as D1Database;
    await persistSnapshot(measured, await snapshot(), NOW, NOW);
    expect(written).toBeGreaterThan(0);
    await db.prepare("DELETE FROM status_daily").run();
    const today = Math.floor(NOW / 86400000) * 86400000;
    await db.batch(
      Array.from({ length: 365 }, (_, i) =>
        db
          .prepare(
            "INSERT INTO status_daily VALUES (?, 'overall', 96, 96, 134400, 1344), (?, 'pages', 96, 96, 67200, 672), (?, 'api', 96, 96, 28800, 288), (?, 'access', 96, 96, 38400, 384)",
          )
          .bind(
            ...Array(4).fill(
              new Date(today - i * 86400000).toISOString().slice(0, 10),
            ),
          ),
      ),
    );
    let read = 0;
    const readonly = {
      prepare(query: string) {
        expect(query.startsWith("SELECT ")).toBe(true);
        let stmt = db.prepare(query);
        const wrapped = {
          bind(...values: unknown[]) {
            stmt = stmt.bind(...values);
            return wrapped;
          },
          async all() {
            const result = await stmt.all();
            read += result.meta.rows_read;
            return result;
          },
          async first() {
            const result = await wrapped.all();
            return result.results[0] ?? null;
          },
        };
        return wrapped;
      },
    } as unknown as D1Database;
    const response = await handleStatusRequest(
      new Request("https://status.guteneo.com/api/history?days=365"),
      { ...env, STATUS_DB: readonly },
      NOW,
    );
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      buckets: { observedSamples: number }[];
    };
    expect(data.buckets).toHaveLength(365);
    expect(data.buckets.every((b) => b.observedSamples === 96)).toBe(true);
    expect(read).toBeLessThanOrEqual(1462);
    console.info(
      JSON.stringify({
        evidence: "local-miniflare-d1",
        firstSampleRowsWritten: written,
        annualHistoryRowsRead: read,
      }),
    );
  });
});
