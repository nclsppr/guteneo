// Public production evidence only: fixed destinations, GET, no credentials or redirects.
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { productionStatus } from "./production-status.mjs";

const origins = ["https://guteneo.com"];
// The owner retired this hostname on 9 October 2026. Reopening it is a regression.
const retiredOrigin = "https://guteneo-app.nclsppr.workers.dev";
const retiredPaths = ["/", "/api/health", "/release.json"];
const channels = ["fax", "email", "postal"];
const publicPaths = [
  "/",
  "/?lang=en",
  "/?lang=de",
  "/?lang=lb",
  "/roles/",
  "/developpeurs/",
  "/assistants/chatgpt/",
];
const privatePaths = [
  "/api/documents",
  "/api/dispatches",
  "/api/overview",
  "/mcp",
];
const digest = (body) => createHash("sha256").update(body).digest("hex");
const bool = (value) => (typeof value === "boolean" ? value : null);

async function probe(fetcher, origin, path) {
  const started = performance.now();
  let httpStatus = null;
  try {
    const response = await fetcher(`${origin}${path}`, {
      method: "GET",
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
      headers: {
        Accept:
          path.includes("api/") || path === "/release.json"
            ? "application/json"
            : "text/html, text/plain",
      },
      signal: AbortSignal.timeout(10000),
    });
    httpStatus = response.status;
    const reader = response.body?.getReader();
    if (!reader) throw new Error("EMPTY_BODY");
    const chunks = [];
    let bytes = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 524288) throw new Error("BODY_LIMIT");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const body = Buffer.concat(chunks);
    const text = body.toString("utf8");
    let data = null;
    if (path.startsWith("/api/") || path === "/release.json") {
      try {
        data = JSON.parse(text);
      } catch {
        /* Invalid JSON is a failed check. */
      }
    }
    return {
      origin,
      path,
      httpStatus,
      durationMs: Math.round(performance.now() - started),
      body,
      text,
      data,
      headers: response.headers,
    };
  } catch {
    // Never include upstream response bodies, URLs, errors or stacks in evidence.
    return {
      origin,
      path,
      httpStatus,
      durationMs: Math.round(performance.now() - started),
      unavailable: true,
    };
  }
}

function validManifest(value) {
  return (
    value?.mode === "production" &&
    value.publicPreview === false &&
    value.sourceDirty === false &&
    typeof value.sourceCommit === "string" &&
    typeof value.sourceSnapshotSha256 === "string" &&
    typeof value.assetsSha256 === "string" &&
    /^[a-f0-9]{40}$/.test(value.sourceCommit ?? "") &&
    /^[a-f0-9]{64}$/.test(value.sourceSnapshotSha256 ?? "") &&
    /^[a-f0-9]{64}$/.test(value.assetsSha256 ?? "") &&
    Array.isArray(value.assets)
  );
}

function manifestPath(path) {
  const url = new URL(path, origins[0]);
  const locale = url.searchParams.get("lang");
  return `${locale ? `/__public-locales/${locale}` : ""}${url.pathname}index.html`;
}

export async function productionMonitor(
  fetcher = fetch,
  expectedCommit = null,
) {
  if (expectedCommit !== null && !/^[a-f0-9]{40}$/.test(expectedCommit))
    throw new Error("Expected commit must be a full lowercase SHA.");
  const summary = await productionStatus(fetcher);
  const jobs = origins.flatMap((origin) =>
    [
      "/release.json",
      "/api/health",
      "/api/capabilities",
      ...publicPaths,
      ...privatePaths,
    ].map((path) => ({ origin, path })),
  );
  jobs.push(...retiredPaths.map((path) => ({ origin: retiredOrigin, path })));
  const results = [];
  // Bounded load; samples never submit a document, provider draft, approval or send.
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (;;) {
        const job = jobs.shift();
        if (!job) return;
        results.push(await probe(fetcher, job.origin, job.path));
      }
    }),
  );
  const get = (origin, path) =>
    results.find((r) => r.origin === origin && r.path === path);
  const primary = get(origins[0], "/release.json")?.data;
  const checks = [];
  for (const origin of origins) {
    const release = get(origin, "/release.json")?.data;
    const capabilities = get(origin, "/api/capabilities")?.data;
    const manifestValid = validManifest(release);
    for (const r of results.filter((r) => r.origin === origin)) {
      let passed = false;
      let kind;
      if (r.path === "/release.json") {
        kind = "release";
        passed =
          r.httpStatus === 200 &&
          manifestValid &&
          validManifest(primary) &&
          release.sourceCommit === primary.sourceCommit &&
          release.sourceCommit === summary.sourceCommit &&
          (!expectedCommit || release.sourceCommit === expectedCommit) &&
          release.sourceSnapshotSha256 === primary.sourceSnapshotSha256 &&
          release.assetsSha256 === primary.assetsSha256 &&
          JSON.stringify(release.liveSendChannels) ===
            JSON.stringify(primary.liveSendChannels) &&
          release.liveSendsEnabled === capabilities?.liveSending;
      } else if (r.path === "/api/health") {
        kind = "liveness";
        passed =
          r.httpStatus === 200 &&
          r.data?.status === "ok" &&
          r.data?.mode === "production" &&
          bool(r.data?.liveSending) !== null &&
          r.data?.liveSending === capabilities?.liveSending;
      } else if (r.path === "/api/capabilities") {
        kind = "configuration";
        passed =
          r.httpStatus === 200 &&
          r.data?.mode === "production" &&
          r.data?.simulation === false &&
          r.data?.registration?.enabled === true &&
          r.data?.scanner === "connected" &&
          bool(r.data?.liveSending) !== null &&
          manifestValid &&
          Array.isArray(release.liveSendChannels) &&
          (release.liveSendsEnabled === false ||
            release.liveSendChannels.length > 0) &&
          release.liveSendChannels.every((id) => channels.includes(id)) &&
          Array.isArray(r.data?.channels) &&
          channels.every((id) => {
            const channel = r.data.channels.find((c) => c?.id === id);
            return (
              typeof channel?.liveSending === "boolean" &&
              channel.liveSending ===
                (release.liveSendsEnabled &&
                  release.liveSendChannels.includes(id))
            );
          });
      } else if (privatePaths.includes(r.path)) {
        kind = "access_control";
        passed =
          r.httpStatus === 401 &&
          r.headers?.get("cache-control")?.includes("no-store");
      } else {
        kind = "public_page";
        const entry = manifestValid
          ? release.assets.find((a) => a?.path === manifestPath(r.path))
          : null;
        const locale = new URL(r.path, origin).searchParams.get("lang") ?? "fr";
        const robots = r.headers?.get("x-robots-tag") ?? "";
        passed =
          r.httpStatus === 200 &&
          entry &&
          Buffer.isBuffer(r.body) &&
          Number.isSafeInteger(entry.bytes) &&
          typeof entry.sha256 === "string" &&
          r.body?.length === entry.bytes &&
          digest(r.body) === entry.sha256 &&
          r.text?.includes(`<html lang="${locale}">`) &&
          r.headers?.get("content-type")?.includes("text/html") &&
          r.headers?.get("x-content-type-options") === "nosniff" &&
          r.headers
            ?.get("content-security-policy")
            ?.includes("frame-ancestors 'none'") &&
          (origin === origins[0]
            ? !/noindex|none/i.test(robots)
            : /noindex/i.test(robots));
      }
      checks.push({
        origin,
        path: r.path,
        kind,
        status: !r.unavailable && passed ? "pass" : "fail",
        httpStatus: r.httpStatus,
        durationMs: r.durationMs,
      });
    }
  }
  for (const path of retiredPaths) {
    const r = get(retiredOrigin, path);
    checks.push({
      origin: retiredOrigin,
      path,
      kind: "retired_origin",
      status: !r?.unavailable && r?.httpStatus === 404 ? "pass" : "fail",
      httpStatus: r?.httpStatus ?? null,
      durationMs: r?.durationMs ?? 0,
    });
  }
  const caps = get(origins[0], "/api/capabilities")?.data;
  const coverage = [
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
        "Binding annoncé ; fraîcheur des signatures, analyse et rendu non testés.",
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
        "Refus anonyme vérifié ; parcours OAuth et outils en client réel non testés.",
    },
    ...channels.map((id) => {
      const enabled = Array.isArray(caps?.channels)
        ? caps.channels.find((c) => c?.id === id)?.liveSending
        : null;
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
    ...[
      ["Horizon / validation PDF", caps?.horizon?.available],
      ["Paiements Stripe", caps?.billing?.chargingEnabled],
      ["Propositions IA", caps?.studio?.ai?.configured],
    ].map(([feature, enabled]) => ({
      feature,
      state: enabled === false ? "disabled" : "not_checked",
      evidence:
        enabled === false
          ? "Fonction désactivée dans la configuration publique."
          : "Parcours authentifié non testé.",
    })),
  ];
  return {
    schema: 1,
    checkedAt: new Date().toISOString(),
    staleAfterSeconds: 120,
    sampleIntervalSeconds: 60,
    status:
      summary.status === "ok" && checks.every((c) => c.status === "pass")
        ? "public_checks_passed"
        : "attention",
    qualification: "partial",
    sourceCommit: summary.sourceCommit,
    expectedCommit,
    scope:
      "Lectures publiques réelles ; aucun envoi. Les temps sont des échantillons locaux, pas un SLO.",
    checks: checks.sort((a, b) =>
      `${a.origin}${a.path}`.localeCompare(`${b.origin}${b.path}`),
    ),
    coverage,
    dashboards: summary.dashboards,
  };
}

export function currentSnapshot(snapshot, now = Date.now()) {
  if (!snapshot) return { status: "starting", freshness: "missing" };
  const age = now - Date.parse(snapshot.checkedAt);
  const fresh = Number.isFinite(age) && age >= 0 && age <= 120000;
  return {
    ...snapshot,
    freshness: fresh ? "fresh" : "stale",
    status: fresh ? snapshot.status : "stale",
  };
}

export async function serveProductionMonitor({
  port = 8796,
  sample = productionMonitor,
} = {}) {
  let snapshot = null;
  let refreshing = false;
  const refresh = async () => {
    if (refreshing) return;
    refreshing = true;
    try {
      snapshot = await sample();
    } catch {
      /* Last successful sample becomes stale, never green forever. */
    } finally {
      refreshing = false;
    }
  };
  const html = await readFile(
    new URL("./production-monitor.html", import.meta.url),
    "utf8",
  );
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? "";
  const scriptHash = createHash("sha256").update(script).digest("base64");
  const server = createServer((request, response) => {
    const expectedHost = `127.0.0.1:${server.address().port}`;
    if (
      request.headers.host !== expectedHost ||
      (request.headers.origin &&
        request.headers.origin !== `http://${expectedHost}`)
    ) {
      response.writeHead(403).end();
      return;
    }
    if (request.method !== "GET") {
      response.writeHead(405, { Allow: "GET" }).end();
      return;
    }
    const headers = {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": `default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
    };
    if (request.url === "/status") {
      const current = currentSnapshot(snapshot);
      response.writeHead(current.freshness === "fresh" ? 200 : 503, {
        ...headers,
        "Content-Type": "application/json",
      });
      response.end(JSON.stringify(current));
    } else if (request.url === "/") {
      response.writeHead(200, {
        ...headers,
        "Content-Type": "text/html; charset=utf-8",
      });
      response.end(html);
    } else {
      response.writeHead(404, headers).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const timer = setInterval(() => void refresh(), 60000);
  server.once("close", () => clearInterval(timer));
  void refresh();
  return server;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--serve") {
    await serveProductionMonitor();
    console.log(
      "Vue locale : http://127.0.0.1:8796 — lecture publique toutes les 60 s ; Ctrl+C pour arrêter.",
    );
  } else if (
    !args.length ||
    (args.length === 2 &&
      args[0] === "--expected-sha" &&
      /^[a-f0-9]{40}$/.test(args[1]))
  ) {
    const report = await productionMonitor(fetch, args[1] ?? null);
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== "public_checks_passed") process.exitCode = 1;
  } else {
    console.error(
      "Usage : node scripts/production-monitor.mjs [--serve | --expected-sha <40 hex>]",
    );
    process.exitCode = 1;
  }
}
