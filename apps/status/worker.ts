/** Public, anonymous observations only. No business bindings or write routes. */
export interface StatusEnv {
  STATUS_DB: D1Database;
  ASSETS: Fetcher;
}

export const INTERVAL_MS = 15 * 60 * 1000;
export const STALE_MS = 30 * 60 * 1000;
const DAY_MS = 86400000;
const ORIGIN = "https://guteneo.com";
const BODY_LIMIT = 524288;
const CATEGORIES = ["pages", "api", "access"] as const;
type Category = (typeof CATEGORIES)[number];
type JsonObject = Record<string, unknown>;
type ProbeKind =
  "public_page" | "release" | "liveness" | "configuration" | "access_control";
export const PUBLIC_PATHS = [
  "/",
  "/?lang=en",
  "/?lang=de",
  "/?lang=lb",
  "/roles/",
  "/developpeurs/",
  "/assistants/chatgpt/",
] as const;
const PRIVATE_PATHS = [
  "/api/documents",
  "/api/dispatches",
  "/api/overview",
  "/mcp",
] as const;
export const PROBE_PATHS = [
  ...PUBLIC_PATHS,
  "/release.json",
  "/api/health",
  "/api/capabilities",
  ...PRIVATE_PATHS,
];
const CHANNELS = ["fax", "email", "postal"];

export interface PublicCheck {
  origin: string;
  path: string;
  kind: ProbeKind;
  status: "pass" | "fail";
  httpStatus: number | null;
  durationMs: number;
  code?: string;
}
interface Coverage {
  feature: string;
  state: "not_checked" | "disabled";
  evidence: string;
}
export interface Snapshot {
  schema: 1;
  checkedAt: string;
  status: "public_checks_passed" | "attention";
  qualification: "partial";
  sourceCommit: string | null;
  checks: PublicCheck[];
  coverage: Coverage[];
  categories: {
    id: Category;
    status: "pass" | "fail";
    passed: number;
    total: number;
    latencyMs: number;
  }[];
}
type FetcherFunction = (input: string, init: RequestInit) => Promise<Response>;
interface Probe {
  path: string;
  httpStatus: number | null;
  durationMs: number;
  body: Uint8Array;
  text: string;
  data: JsonObject | null;
  headers: Headers;
  error?: string;
}
const object = (value: unknown): JsonObject | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
const nested = (value: unknown, key: string) => object(value)?.[key];
const iso = (time: number) => new Date(time).toISOString();
const day = (time: number) => iso(time).slice(0, 10);
const bucketOf = (time: number) => Math.floor(time / INTERVAL_MS) * INTERVAL_MS;
const categoryOf = (check: PublicCheck): Category =>
  check.kind === "public_page"
    ? "pages"
    : check.kind === "access_control"
      ? "access"
      : "api";
const kindOf = (path: string): ProbeKind =>
  path === "/release.json"
    ? "release"
    : path === "/api/health"
      ? "liveness"
      : path === "/api/capabilities"
        ? "configuration"
        : PRIVATE_PATHS.some((candidate) => candidate === path)
          ? "access_control"
          : "public_page";

async function probe(path: string, fetcher: FetcherFunction): Promise<Probe> {
  const started = performance.now();
  const controller = new AbortController();
  const base = {
    path,
    httpStatus: null as number | null,
    body: new Uint8Array(),
    text: "",
    data: null as JsonObject | null,
    headers: new Headers(),
  };
  let timedOut = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      void reader?.cancel().catch(() => {});
      reject(new Error("TIMEOUT"));
    }, 10000);
  });
  try {
    const work = async () => {
      const response = await fetcher(`${ORIGIN}${path}`, {
        method: "GET",
        // workerd supports manual/follow; manual never follows a redirect.
        redirect: "manual",
        credentials: "omit",
        cache: "no-store",
        headers: {
          Accept:
            path.startsWith("/api/") || path === "/release.json"
              ? "application/json"
              : "text/html, text/plain",
        },
        signal: controller.signal,
      });
      base.httpStatus = response.status;
      base.headers = response.headers;
      if (response.status >= 300 && response.status < 400)
        throw new Error("REDIRECT_REJECTED");
      reader = response.body?.getReader();
      if (!reader) throw new Error("EMPTY_BODY");
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const result = await reader.read();
        if (result.done) break;
        size += result.value.byteLength;
        if (size > BODY_LIMIT) throw new Error("RESPONSE_TOO_LARGE");
        chunks.push(result.value);
      }
      const body = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const text = new TextDecoder().decode(body);
      let data: JsonObject | null = null;
      try {
        data = object(JSON.parse(text));
      } catch {
        /* JSON checks below fail closed. */
      }
      return { ...base, body, text, data };
    };
    return {
      ...(await Promise.race([work(), timeout])),
      durationMs: Math.max(0, Math.round(performance.now() - started)),
    };
  } catch (error) {
    const code = timedOut
      ? "TIMEOUT"
      : error instanceof Error &&
          ["EMPTY_BODY", "RESPONSE_TOO_LARGE", "REDIRECT_REJECTED"].includes(
            error.message,
          )
        ? error.message
        : "FETCH_FAILED";
    return {
      ...base,
      error: code,
      durationMs: Math.max(0, Math.round(performance.now() - started)),
    };
  } finally {
    clearTimeout(timer!);
    void reader?.cancel().catch(() => {});
  }
}

function manifestValid(value: JsonObject | null): value is JsonObject {
  return (
    !!value &&
    value.mode === "production" &&
    value.publicPreview === false &&
    value.sourceDirty === false &&
    typeof value.sourceCommit === "string" &&
    /^[a-f0-9]{40}$/.test(value.sourceCommit) &&
    typeof value.sourceSnapshotSha256 === "string" &&
    /^[a-f0-9]{64}$/.test(value.sourceSnapshotSha256) &&
    typeof value.assetsSha256 === "string" &&
    /^[a-f0-9]{64}$/.test(value.assetsSha256) &&
    typeof value.liveSendsEnabled === "boolean" &&
    Array.isArray(value.liveSendChannels) &&
    value.liveSendChannels.every(
      (id) => typeof id === "string" && CHANNELS.includes(id),
    ) &&
    (!value.liveSendsEnabled || value.liveSendChannels.length > 0) &&
    Array.isArray(value.assets)
  );
}

function coverageFor(caps: JsonObject | null): Coverage[] {
  const channels = Array.isArray(caps?.channels)
    ? caps.channels.map(object)
    : [];
  return [
    {
      feature: "Connexion Auth0",
      state: "not_checked",
      evidence:
        "Configuration et refus anonyme seulement ; connexion et renouvellement à qualifier.",
    },
    {
      feature: "PDF : import, antivirus, rendu",
      state: "not_checked",
      evidence:
        "Configuration publique seulement ; fraîcheur des signatures, analyse et rendu non testés.",
    },
    {
      feature: "Studio : modèles, données, génération",
      state: "not_checked",
      evidence: "Aucune génération authentifiée exécutée par ce contrôle.",
    },
    {
      feature: "Cron, files, callbacks, sauvegardes",
      state: "not_checked",
      evidence:
        "Nécessite des métriques privées et une preuve de restauration récente.",
    },
    {
      feature: "Assistants MCP",
      state: "not_checked",
      evidence:
        "Contrôle limité au refus anonyme ; parcours OAuth et outils en client réel non testés.",
    },
    ...CHANNELS.map((id): Coverage => {
      const enabled = channels.find(
        (channel) => channel?.id === id,
      )?.liveSending;
      return {
        feature:
          id === "fax" ? "Fax" : id === "postal" ? "Courrier postal" : "E-mail",
        state: enabled === false ? "disabled" : "not_checked",
        evidence:
          enabled === true
            ? "Envoi autorisé par configuration ; devis, remise fournisseur et livraison non testés."
            : enabled === false
              ? "Canal fermé par configuration."
              : "Configuration indisponible.",
      };
    }),
    ...(
      [
        ["Horizon / validation PDF", nested(caps?.horizon, "available")],
        ["Paiements Stripe", nested(caps?.billing, "chargingEnabled")],
        ["Propositions IA", nested(nested(caps?.studio, "ai"), "configured")],
      ] as const
    ).map(([feature, enabled]): Coverage => ({
      feature,
      state: enabled === false ? "disabled" : "not_checked",
      evidence:
        enabled === false
          ? "Fonction désactivée dans la configuration publique."
          : "Parcours authentifié non testé.",
    })),
  ];
}

export async function collectPublicSnapshot(
  fetcher: FetcherFunction = fetch,
  now = () => Date.now(),
): Promise<Snapshot> {
  const paths = [...PROBE_PATHS];
  const probes: Probe[] = [];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (;;) {
        const path = paths.shift();
        if (!path) return;
        probes.push(await probe(path, fetcher));
      }
    }),
  );
  const release = probes.find((p) => p.path === "/release.json")?.data ?? null;
  const caps = probes.find((p) => p.path === "/api/capabilities")?.data ?? null;
  const valid = manifestValid(release);
  const checks = await Promise.all(
    probes.map(async (p): Promise<PublicCheck> => {
      const kind = kindOf(p.path);
      let code = p.error;
      if (!code && p.httpStatus !== (kind === "access_control" ? 401 : 200))
        code = "HTTP_UNEXPECTED";
      if (
        !code &&
        kind === "release" &&
        (!valid || release.liveSendsEnabled !== caps?.liveSending)
      )
        code = "MANIFEST_INVALID";
      if (
        !code &&
        kind === "liveness" &&
        !(
          p.data?.status === "ok" &&
          p.data.mode === "production" &&
          typeof p.data.liveSending === "boolean" &&
          p.data.liveSending === caps?.liveSending
        )
      )
        code = "HEALTH_INVALID";
      if (!code && kind === "configuration") {
        const channels = Array.isArray(caps?.channels)
          ? caps.channels.map(object)
          : [];
        if (!(
          caps?.mode === "production" &&
          caps.simulation === false &&
          nested(caps.registration, "enabled") === true &&
          caps.scanner === "connected" &&
          typeof caps.liveSending === "boolean" &&
          valid &&
          caps.liveSending === release.liveSendsEnabled &&
          CHANNELS.every((id) => {
            const channel = channels.find((item) => item?.id === id);
            return (
              typeof channel?.liveSending === "boolean" &&
              channel.liveSending ===
                (release.liveSendsEnabled &&
                  (release.liveSendChannels as string[]).includes(id))
            );
          })
        ))
          code = "CONFIGURATION_INVALID";
      }
      if (
        !code &&
        kind === "access_control" &&
        !p.headers.get("cache-control")?.includes("no-store")
      )
        code = "CACHE_POLICY_INVALID";
      if (!code && kind === "public_page") {
        const url = new URL(p.path, ORIGIN);
        const locale = url.searchParams.get("lang") ?? "fr";
        const assetPath = `${url.searchParams.has("lang") ? `/__public-locales/${locale}` : ""}${url.pathname}index.html`;
        const asset = valid
          ? (release.assets as unknown[])
              .map(object)
              .find((entry) => entry?.path === assetPath)
          : null;
        if (
          !asset ||
          !Number.isSafeInteger(asset.bytes) ||
          typeof asset.sha256 !== "string" ||
          !/^[a-f0-9]{64}$/.test(asset.sha256)
        )
          code = "ASSET_MANIFEST_INVALID";
        else if (p.body.byteLength !== asset.bytes)
          code = "CONTENT_LENGTH_MISMATCH";
        else {
          const digest = [
            ...new Uint8Array(
              await crypto.subtle.digest(
                "SHA-256",
                p.body as Uint8Array<ArrayBuffer>,
              ),
            ),
          ]
            .map((n) => n.toString(16).padStart(2, "0"))
            .join("");
          if (digest !== asset.sha256) code = "CONTENT_HASH_MISMATCH";
          else if (!p.text.includes(`<html lang="${locale}">`))
            code = "LANGUAGE_MISMATCH";
          else if (
            !p.headers.get("content-type")?.includes("text/html") ||
            p.headers.get("x-content-type-options") !== "nosniff" ||
            !p.headers
              .get("content-security-policy")
              ?.includes("frame-ancestors 'none'") ||
            /noindex|none/i.test(p.headers.get("x-robots-tag") ?? "")
          )
            code = "HEADERS_INVALID";
        }
      }
      return {
        origin: ORIGIN,
        path: p.path,
        kind,
        status: code ? "fail" : "pass",
        httpStatus: p.httpStatus,
        durationMs: p.durationMs,
        ...(code ? { code } : {}),
      };
    }),
  );
  checks.sort((a, b) => a.path.localeCompare(b.path));
  return {
    schema: 1,
    checkedAt: iso(now()),
    status: checks.every((c) => c.status === "pass")
      ? "public_checks_passed"
      : "attention",
    qualification: "partial",
    sourceCommit: valid ? (release.sourceCommit as string) : null,
    checks,
    coverage: coverageFor(caps),
    categories: CATEGORIES.map((id) => {
      const subset = checks.filter((c) => categoryOf(c) === id);
      return {
        id,
        status: subset.every((c) => c.status === "pass") ? "pass" : "fail",
        passed: subset.filter((c) => c.status === "pass").length,
        total: subset.length,
        latencyMs: Math.round(
          subset.reduce((sum, c) => sum + c.durationMs, 0) / subset.length,
        ),
      };
    }),
  };
}

/** Called only by scheduled(). One atomic batch; duplicate cron slots are ignored. */
export async function persistSnapshot(
  db: D1Database,
  snapshot: Snapshot,
  scheduledTime: number,
  now = Date.now(),
): Promise<void> {
  if (!completeSnapshot(snapshot)) throw new Error("INCOMPLETE_SNAPSHOT");
  const bucket = bucketOf(scheduledTime);
  const cutoff = now - 366 * DAY_MS;
  const statements = [
    db
      .prepare(
        "INSERT OR IGNORE INTO status_samples (bucket, checked_at, sample_json) VALUES (?, ?, ?)",
      )
      .bind(bucket, snapshot.checkedAt, JSON.stringify(snapshot)),
    db
      .prepare(
        "INSERT INTO status_metadata (key, value) VALUES ('collection_started_at', ?), ('collection_started_slot', ?) ON CONFLICT(key) DO UPDATE SET value = MIN(value, excluded.value)",
      )
      .bind(snapshot.checkedAt, iso(bucket)),
    ...(["overall", ...CATEGORIES] as const).map((category) => {
      const checks =
        category === "overall"
          ? snapshot.checks
          : snapshot.checks.filter((c) => categoryOf(c) === category);
      return db
        .prepare(
          "INSERT OR IGNORE INTO status_metrics (bucket, day, category, passed, latency_sum_ms, latency_count) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(
          bucket,
          day(bucket),
          category,
          Number(checks.every((c) => c.status === "pass")),
          checks.reduce((sum, c) => sum + c.durationMs, 0),
          checks.length,
        );
    }),
    db.prepare("DELETE FROM status_samples WHERE bucket < ?").bind(cutoff),
    db.prepare("DELETE FROM status_daily WHERE day < ?").bind(day(cutoff)),
  ];
  await db.batch(statements);
}

const securityHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'",
};
function completeSnapshot(sample: Snapshot): boolean {
  return (
    sample?.schema === 1 &&
    sample.qualification === "partial" &&
    Number.isFinite(Date.parse(sample.checkedAt)) &&
    ["public_checks_passed", "attention"].includes(sample.status) &&
    Array.isArray(sample.checks) &&
    sample.checks.length === PROBE_PATHS.length &&
    new Set(sample.checks.map((c) => c?.path)).size === PROBE_PATHS.length &&
    sample.checks.every(
      (c) =>
        c &&
        c.origin === ORIGIN &&
        PROBE_PATHS.includes(c.path) &&
        c.kind === kindOf(c.path) &&
        ["pass", "fail"].includes(c.status) &&
        Number.isSafeInteger(c.durationMs) &&
        c.durationMs >= 0,
    ) &&
    (sample.status === "public_checks_passed") ===
      sample.checks.every((c) => c.status === "pass") &&
    Array.isArray(sample.coverage) &&
    sample.coverage.length === 11 &&
    sample.coverage.every(
      (c) =>
        c &&
        typeof c.feature === "string" &&
        typeof c.evidence === "string" &&
        ["disabled", "not_checked"].includes(c.state),
    ) &&
    Array.isArray(sample.categories) &&
    sample.categories.length === 3 &&
    CATEGORIES.every((id, index) => {
      const category = sample.categories[index];
      const checks = sample.checks.filter((check) => categoryOf(check) === id);
      const passed = checks.filter((check) => check.status === "pass").length;
      return (
        category?.id === id &&
        category.total === checks.length &&
        category.passed === passed &&
        category.status === (passed === checks.length ? "pass" : "fail") &&
        category.latencyMs ===
          Math.round(
            checks.reduce((sum, check) => sum + check.durationMs, 0) /
              checks.length,
          )
      );
    })
  );
}
function json(data: unknown, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...securityHeaders,
      "Cache-Control": maxAge
        ? `public, max-age=${maxAge}, must-revalidate`
        : "no-store",
    },
  });
}

async function latest(db: D1Database, now: number) {
  const row = await db
    .prepare(
      "SELECT sample_json, (SELECT value FROM status_metadata WHERE key = 'collection_started_at') AS started FROM status_samples ORDER BY bucket DESC LIMIT 1",
    )
    .first<{ sample_json: string; started: string | null }>();
  const base = {
    schema: 1,
    generatedAt: iso(now),
    collectionStartedAt: row?.started ?? null,
    sampleIntervalSeconds: INTERVAL_MS / 1000,
    staleAfterSeconds: STALE_MS / 1000,
    qualification: "partial",
  };
  if (!row)
    return json(
      {
        ...base,
        checkedAt: null,
        freshness: "missing",
        status: "unknown",
        sourceCommit: null,
        checks: [],
        categories: [],
        coverage: coverageFor(null),
      },
      503,
    );
  const sample = JSON.parse(row.sample_json) as Snapshot;
  if (!completeSnapshot(sample)) throw new Error("INCOMPLETE_SNAPSHOT");
  const age = now - Date.parse(sample.checkedAt);
  const fresh = Number.isFinite(age) && age >= 0 && age < STALE_MS;
  return json(
    {
      ...sample,
      ...base,
      freshness: fresh ? "fresh" : "stale",
      status: fresh ? sample.status : "unknown",
    },
    fresh ? 200 : 503,
    fresh ? Math.min(60, Math.floor((STALE_MS - age) / 1000)) : 0,
  );
}

interface DailyRow {
  day: string;
  category: string;
  observed_samples: number;
  passed_samples: number;
  latency_sum_ms: number;
  latency_count: number;
}
async function history(db: D1Database, days: number, now: number) {
  const today = Math.floor(now / DAY_MS) * DAY_MS;
  const from = today - (days - 1) * DAY_MS;
  const [rows, metadata] = await Promise.all([
    db
      .prepare(
        "SELECT day, category, observed_samples, passed_samples, latency_sum_ms, latency_count FROM status_daily WHERE day >= ? AND day <= ? ORDER BY day, category LIMIT ?",
      )
      .bind(day(from), day(now), days * 4)
      .all<DailyRow>(),
    db
      .prepare(
        "SELECT value, (SELECT value FROM status_metadata WHERE key = 'collection_started_slot') AS slot FROM status_metadata WHERE key = 'collection_started_at'",
      )
      .first<{ value: string; slot: string }>(),
  ]);
  const start = metadata ? Date.parse(metadata.slot) : null;
  const index = new Map(
    rows.results.map((row) => [`${row.day}:${row.category}`, row]),
  );
  const metrics = (row: DailyRow | undefined) => ({
    observedSamples: row?.observed_samples ?? 0,
    passedSamples: row?.passed_samples ?? 0,
    availabilityPercent: row?.observed_samples
      ? Math.round((10000 * row.passed_samples) / row.observed_samples) / 100
      : null,
    latencyMs: row?.latency_count
      ? Math.round(row.latency_sum_ms / row.latency_count)
      : null,
  });
  const buckets = Array.from({ length: days }, (_, offset) => {
    const time = from + offset * DAY_MS;
    const first = start === null ? Infinity : Math.max(time, bucketOf(start));
    const last = Math.min(time + DAY_MS - INTERVAL_MS, bucketOf(now));
    const expectedSamples = Math.max(
      0,
      Math.floor((last - first) / INTERVAL_MS) + 1,
    );
    const observed = metrics(index.get(`${day(time)}:overall`));
    return {
      date: day(time),
      expectedSamples,
      ...observed,
      unknownSamples: Math.max(0, expectedSamples - observed.observedSamples),
      categories: CATEGORIES.map((id) => ({
        id,
        ...metrics(index.get(`${day(time)}:${id}`)),
      })),
    };
  });
  return json(
    {
      schema: 1,
      days,
      generatedAt: iso(now),
      collectionStartedAt: metadata?.value ?? null,
      intervalSeconds: INTERVAL_MS / 1000,
      buckets,
    },
    200,
    300,
  );
}

export async function handleStatusRequest(
  request: Request,
  env: StatusEnv,
  now = Date.now(),
): Promise<Response> {
  const url = new URL(request.url);
  const local =
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    !(url.protocol === "https:" && url.hostname === "status.guteneo.com") &&
    !local
  )
    return json({ error: "HOST_NOT_ALLOWED" }, 403);
  if (!["GET", "HEAD"].includes(request.method)) {
    const response = json({ error: "METHOD_NOT_ALLOWED" }, 405);
    response.headers.set("Allow", "GET, HEAD");
    return response;
  }
  if (
    request.headers.has("Origin") &&
    request.headers.get("Origin") !== url.origin
  )
    return json({ error: "ORIGIN_NOT_ALLOWED" }, 403);
  let response: Response;
  try {
    if (url.pathname === "/api/status" && !url.search)
      response = await latest(env.STATUS_DB, now);
    else if (url.pathname === "/api/history") {
      // Match the raw query exactly so alternate spellings cannot bypass cache.
      if (url.search && !/^\?days=(7|30|365)$/.test(url.search))
        response = json({ error: "INVALID_PERIOD" }, 400);
      else
        response = await history(
          env.STATUS_DB,
          Number(url.searchParams.get("days") ?? "7"),
          now,
        );
    } else if (url.pathname.startsWith("/api/"))
      response = json({ error: "NOT_FOUND" }, 404);
    else response = await env.ASSETS.fetch(request);
  } catch {
    response = json(
      {
        schema: 1,
        generatedAt: iso(now),
        status: "unknown",
        freshness: "missing",
        checkedAt: null,
        error: "STATUS_STORAGE_UNAVAILABLE",
      },
      503,
    );
  }
  return request.method === "HEAD" ? new Response(null, response) : response;
}

export default {
  async fetch(
    request: Request,
    env: StatusEnv,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    // Cache only anonymous, exact API reads. This saves D1 work, not Worker requests.
    const cacheable =
      request.method === "GET" &&
      url.origin === "https://status.guteneo.com" &&
      (!request.headers.has("Origin") ||
        request.headers.get("Origin") === url.origin) &&
      ((url.pathname === "/api/status" && !url.search) ||
        (url.pathname === "/api/history" &&
          (!url.search || /^\?days=(7|30|365)$/.test(url.search))));
    const cache =
      typeof caches !== "undefined"
        ? (caches as CacheStorage & { default?: Cache }).default
        : null;
    if (url.pathname === "/api/history" && !url.search) url.search = "?days=7";
    const key = new Request(url.toString(), { method: "GET" });
    if (cacheable && cache) {
      try {
        const hit = await cache.match(key);
        if (hit) return hit;
      } catch {
        /* Read through on cache failure. */
      }
    }
    const response = await handleStatusRequest(request, env);
    if (
      cacheable &&
      cache &&
      response.status === 200 &&
      response.headers.get("Cache-Control")?.startsWith("public,")
    ) {
      ctx.waitUntil(cache.put(key, response.clone()).catch(() => {}));
    }
    return response;
  },
  async scheduled(event: ScheduledController, env: StatusEnv): Promise<void> {
    const snapshot = await collectPublicSnapshot();
    await persistSnapshot(env.STATUS_DB, snapshot, event.scheduledTime);
  },
};
