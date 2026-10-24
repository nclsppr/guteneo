import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import * as z from "zod/mini";

// Fixed trust policy, verified against GitHub's repository API. Repository IDs
// prevent a transferred or recreated namespace from inheriting report authority.
export const E2E_REPOSITORY = "nclsppr/guteneo";
export const E2E_REPOSITORY_ID = "1373468624";
export const E2E_OWNER_ID = "9432084";
export const E2E_WORKFLOW = `${E2E_REPOSITORY}/.github/workflows/production-e2e.yml@refs/heads/main`;
export const E2E_ISSUER = "https://token.actions.githubusercontent.com";
export const E2E_AUDIENCE = "https://status.guteneo.com/api/e2e-reports";
export const E2E_STALE_MS = 8 * 60 * 60 * 1000;
export const E2E_ORIGIN = "https://guteneo.com";
export const E2E_PAGES = [
  { id: "home_fr", path: "/", locale: "fr" },
  { id: "home_en", path: "/?lang=en", locale: "en" },
  { id: "home_de", path: "/?lang=de", locale: "de" },
  { id: "home_lb", path: "/?lang=lb", locale: "lb" },
  { id: "roles", path: "/roles/", locale: "fr" },
  { id: "developers", path: "/developpeurs/", locale: "fr" },
  { id: "chatgpt", path: "/assistants/chatgpt/", locale: "fr" },
] as const;
export const E2E_HTTP_PATHS = [
  ...E2E_PAGES.map((page) => page.path),
  "/release.json", "/api/health", "/api/capabilities",
  "/api/documents", "/api/dispatches", "/api/overview", "/mcp",
] as const;
export const E2E_CHECK_IDS = [
  ...["desktop", "phone"].flatMap((target) =>
    E2E_PAGES.map((page) => `browser:${target}:${page.id}`)),
  ...E2E_HTTP_PATHS.map((path) => `http:${path}`),
];
const codes = [
  "OK", "BROWSER_ASSERTION_FAILED", "EXECUTION_UNAVAILABLE", "TIMEOUT",
  "EMPTY_BODY", "RESPONSE_TOO_LARGE", "REDIRECT_REJECTED", "FETCH_FAILED",
  "HTTP_UNEXPECTED", "MANIFEST_INVALID", "HEALTH_INVALID",
  "CONFIGURATION_INVALID", "CACHE_POLICY_INVALID", "ASSET_MANIFEST_INVALID",
  "CONTENT_LENGTH_MISMATCH", "CONTENT_HASH_MISMATCH", "LANGUAGE_MISMATCH",
  "HEADERS_INVALID",
] as const;
const sha = z.string().check(z.regex(/^[a-f0-9]{40}$/));
const identifier = z.string().check(z.regex(/^[1-9][0-9]{0,19}$/));
export const e2eCheckSchema = z.strictObject({
  id: z.string().check(z.maxLength(100)),
  status: z.enum(["pass", "fail", "blocked"]),
  code: z.enum(codes),
  durationMs: z.int().check(z.minimum(0), z.maximum(600000)),
  httpStatus: z.nullable(z.int().check(z.minimum(100), z.maximum(599))),
}).check(z.refine((check) =>
  check.status === "pass" ? check.code === "OK" :
    check.status === "blocked" ? check.code === "EXECUTION_UNAVAILABLE" :
      !["OK", "EXECUTION_UNAVAILABLE"].includes(check.code),
{ message: "Inconsistent result" }));
export const productionE2EReportSchema = z.strictObject({
  schema: z.literal(1),
  environment: z.literal("production"),
  scope: z.literal("anonymous_public_browser"),
  origin: z.literal(E2E_ORIGIN),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime(),
  runnerCommit: sha,
  releaseBefore: z.nullable(sha),
  releaseAfter: z.nullable(sha),
  run: z.strictObject({
    id: identifier,
    attempt: z.int().check(z.minimum(1), z.maximum(10000)),
    event: z.enum(["schedule", "workflow_dispatch"]),
  }),
  nonce: z.string().check(z.regex(/^[a-f0-9]{64}$/)),
  checks: z.array(e2eCheckSchema).check(z.length(E2E_CHECK_IDS.length)),
}).check(z.refine((report) =>
  report.checks.every((check, index) => {
    if (check.id !== E2E_CHECK_IDS[index]) return false;
    if (check.id.startsWith("browser:")) return check.httpStatus === null;
    const privatePath = ["/api/documents", "/api/dispatches", "/api/overview", "/mcp"]
      .includes(check.id.slice("http:".length));
    return check.status !== "pass" || check.httpStatus === (privatePath ? 401 : 200);
  }),
{ message: "Incomplete or unexpected checks" }));
export type ProductionE2EReport = z.infer<typeof productionE2EReportSchema>;
export type ProductionE2ECheck = z.infer<typeof e2eCheckSchema>;
type ResultStatus = "passed" | "attention" | "unknown";

const githubKeys = createRemoteJWKSet(
  new URL("https://token.actions.githubusercontent.com/.well-known/jwks"),
  { timeoutDuration: 5000, cooldownDuration: 30000, cacheMaxAge: 3600000 },
);
const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers });
const error = (code: string, status: number) => json({ error: code }, status);
export async function productionReportDigest(body: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)))]
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
export const productionReportAudience = (digest: string) => `${E2E_AUDIENCE}:sha256:${digest}`;
export function productionReportStatus(report: ProductionE2EReport): ResultStatus {
  if (!report.releaseBefore || report.releaseBefore !== report.releaseAfter ||
    report.checks.some((check) => check.status === "blocked")) return "unknown";
  return report.checks.some((check) => check.status === "fail") ? "attention" : "passed";
}

/** The JWT audience binds the exact body, including its nonce and run attempt.
 * Neither this endpoint nor any public route can initiate a production test. */
export async function verifyProductionReport(
  token: string, body: string, now = Date.now(), keySet: JWTVerifyGetKey = githubKeys,
) {
  const report = productionE2EReportSchema.parse(JSON.parse(body));
  const started = Date.parse(report.startedAt), completed = Date.parse(report.completedAt);
  if (started > completed || completed - started > 10 * 60 * 1000 ||
    started < now - 30 * 60 * 1000 || completed > now + 30000)
    throw new Error("REPORT_TIME_INVALID");
  const digest = await productionReportDigest(body);
  const { payload } = await jwtVerify(token, keySet, {
    issuer: E2E_ISSUER, audience: productionReportAudience(digest),
    algorithms: ["RS256"], requiredClaims: ["exp", "iat", "nbf", "jti", "sub"],
    currentDate: new Date(now), clockTolerance: 5, maxTokenAge: "5m",
  });
  const subjects = [
    `repo:${E2E_REPOSITORY}:ref:refs/heads/main`,
    `repo:nclsppr@${E2E_OWNER_ID}/guteneo@${E2E_REPOSITORY_ID}:ref:refs/heads/main`,
  ];
  if (payload.repository !== E2E_REPOSITORY || payload.repository_id !== E2E_REPOSITORY_ID ||
    payload.aud !== productionReportAudience(digest) ||
    payload.repository_owner_id !== E2E_OWNER_ID || payload.repository_owner !== "nclsppr" ||
    payload.ref !== "refs/heads/main" || payload.ref_type !== "branch" ||
    payload.workflow_ref !== E2E_WORKFLOW || payload.workflow_sha !== report.runnerCommit ||
    payload.sha !== report.runnerCommit || payload.run_id !== report.run.id ||
    payload.run_attempt !== String(report.run.attempt) || payload.event_name !== report.run.event ||
    !["schedule", "workflow_dispatch"].includes(String(payload.event_name)) ||
    payload.runner_environment !== "github-hosted" || !subjects.includes(payload.sub!) ||
    Boolean(payload.head_ref) || Boolean(payload.base_ref) || Boolean(payload.job_workflow_ref) ||
    !/^[A-Za-z0-9_-]{16,200}$/.test(payload.jti!) ||
    payload.iat! < completed / 1000 - 30 || payload.iat! > now / 1000 + 5)
    throw new Error("REPORT_AUTHORITY_INVALID");
  return { report, digest, jti: payload.jti! };
}

async function boundedBody(request: Request): Promise<string> {
  if (Number(request.headers.get("Content-Length") ?? 0) > 16384) throw new Error("BODY_LIMIT");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("BODY_REQUIRED");
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // A malicious underlying source can also stall cancel(). Never await it
      // on the response path; the absolute deadline still rejects this request.
      void reader.cancel().catch(() => {});
      reject(new Error("BODY_READ_TIMEOUT"));
    }, 5000);
  });
  try {
    await Promise.race([deadline, (async () => {
      for (;;) {
        const result = await reader.read();
        if (result.done) break;
        size += result.value.byteLength;
        if (size > 16384) throw new Error("BODY_LIMIT");
        chunks.push(result.value);
      }
    })()]);
  } finally {
    clearTimeout(timer!);
    void reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export async function ingestProductionReport(
  request: Request, db: D1Database, now = Date.now(), keySet: JWTVerifyGetKey = githubKeys,
) {
  if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get("Content-Type") ?? ""))
    return error("JSON_REQUIRED", 415);
  const authorization = request.headers.get("Authorization");
  if (!authorization || authorization.length > 16384 ||
    !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization))
    return error("UNAUTHORIZED", 401);
  let verified: Awaited<ReturnType<typeof verifyProductionReport>>;
  try { verified = await verifyProductionReport(authorization.slice(7), await boundedBody(request), now, keySet); }
  catch { return error("REPORT_REJECTED", 401); }
  const { report, digest, jti } = verified;
  try {
    const inserted = await db.prepare(`INSERT OR IGNORE INTO production_e2e_reports
      (run_id,run_attempt,nonce,token_id,report_sha256,completed_at,received_at,status,report_json)
      VALUES(?,?,?,?,?,?,?,?,?) RETURNING run_id`)
      .bind(report.run.id, report.run.attempt, report.nonce, jti, digest,
        report.completedAt, new Date(now).toISOString(), productionReportStatus(report), JSON.stringify(report)).first();
    if (!inserted) return error("REPORT_ALREADY_RECORDED", 409);
    // A bounded retention sweep cannot modify an accepted run or erase a fresh failure.
    await db.prepare("DELETE FROM production_e2e_reports WHERE rowid IN (SELECT rowid FROM production_e2e_reports WHERE completed_at<? LIMIT 50)")
      .bind(new Date(now - 366 * 86400000).toISOString()).run();
    return json({ accepted: true, runId: report.run.id, attempt: report.run.attempt }, 201);
  } catch { return error("REPORT_STORAGE_UNAVAILABLE", 503); }
}

function publicRun(report: ProductionE2EReport) {
  return {
    runId: report.run.id, attempt: report.run.attempt,
    runUrl: `https://github.com/${E2E_REPOSITORY}/actions/runs/${report.run.id}/attempts/${report.run.attempt}`,
    completedAt: report.completedAt, runnerCommit: report.runnerCommit,
    testedReleaseCommit: report.releaseBefore === report.releaseAfter ? report.releaseAfter : null,
    status: productionReportStatus(report), checks: report.checks,
  };
}
export async function readProductionE2EStatus(db: D1Database, now = Date.now()) {
  const base = {
    schema: 1, generatedAt: new Date(now).toISOString(), staleAfterSeconds: E2E_STALE_MS / 1000,
    authenticated: { status: "blocked", code: "DEDICATED_STRONG_AUTH_FIXTURES_NOT_CONFIGURED" },
  };
  try {
    const [rows, releaseRow] = await Promise.all([
      db.prepare("SELECT report_json FROM production_e2e_reports ORDER BY completed_at DESC,run_id DESC,run_attempt DESC LIMIT 20").all<{ report_json: string }>(),
      db.prepare("SELECT checked_at,sample_json FROM status_samples ORDER BY bucket DESC LIMIT 1").first<{ checked_at: string; sample_json: string }>(),
    ]);
    let currentReleaseCommit: string | null = null;
    if (releaseRow) {
      const age = now - Date.parse(releaseRow.checked_at);
      const release = JSON.parse(releaseRow.sample_json) as { sourceCommit?: unknown };
      if (age >= 0 && age < 30 * 60000 && sha.safeParse(release.sourceCommit).success)
        currentReleaseCommit = release.sourceCommit as string;
    }
    const reports = rows.results.map((row) => productionE2EReportSchema.parse(JSON.parse(row.report_json)));
    const latest = reports[0] ? publicRun(reports[0]) : null;
    const age = latest ? now - Date.parse(latest.completedAt) : Infinity;
    const freshness = !latest ? "missing" : age >= 0 && age < E2E_STALE_MS ? "fresh" : "stale";
    const releaseState = !currentReleaseCommit || !latest?.testedReleaseCommit ? "unverified" :
      currentReleaseCommit === latest.testedReleaseCommit ? "current" : "changed";
    return json({ ...base, status: freshness === "fresh" && releaseState === "current" ? latest!.status : "unknown",
      freshness, releaseState, currentReleaseCommit, latest,
      history: reports.map((report) => { const run = publicRun(report);
        return { runId: run.runId, attempt: run.attempt, completedAt: run.completedAt, status: run.status, testedReleaseCommit: run.testedReleaseCommit }; }),
    });
  } catch {
    return json({ ...base, status: "unknown", freshness: "missing", releaseState: "unverified",
      currentReleaseCommit: null, latest: null, history: [], error: "E2E_STATUS_UNAVAILABLE" });
  }
}
