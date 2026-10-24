import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { collectPublicSnapshot, type Snapshot } from "../apps/status/worker";
import {
  E2E_AUDIENCE, E2E_CHECK_IDS, E2E_HTTP_PATHS, E2E_PAGES,
  productionE2EReportSchema, productionReportAudience, productionReportDigest,
  productionReportStatus, type ProductionE2ECheck,
} from "../apps/status/production-e2e";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = new URL("../test-results/production-e2e/sanitized-report.json", import.meta.url);
const rawOutput = new URL("../test-results/production-e2e-private/", import.meta.url);
type RawResult = { targetId?: unknown; titlePath?: unknown; status?: unknown; attempts?: { durationMs?: unknown }[] };
type RawRun = { errors?: unknown[]; results?: RawResult[]; usage?: { modelTokens?: number; maxModelCallsInStep?: number }; summary?: { discovered?: number; selected?: number; executed?: number } };

export function sanitizedBrowserChecks(raw: unknown): ProductionE2ECheck[] {
  const run = (raw as { run?: RawRun } | null)?.run;
  const expected = ["desktop", "phone"].flatMap((target) => E2E_PAGES.map((page) => ({ target, id: page.id })));
  const structurallyValid = !!run && Array.isArray(run.results) && run.results.length === expected.length &&
    run.summary?.discovered === expected.length && run.summary.selected === expected.length &&
    run.summary.executed === expected.length && run.usage?.modelTokens === 0 &&
    run.usage.maxModelCallsInStep === 0 && Array.isArray(run.errors) && run.errors.length === 0;
  return expected.map(({ target, id }) => {
    const matches = structurallyValid ? run.results!.filter((result) =>
      result.targetId === target && Array.isArray(result.titlePath) && result.titlePath.length === 1 && result.titlePath[0] === id) : [];
    const result = matches.length === 1 ? matches[0] : null;
    const duration = result?.attempts?.reduce((sum, attempt) =>
      sum + (typeof attempt.durationMs === "number" ? attempt.durationMs : 0), 0) ?? 0;
    const status = result?.status === "passed" ? "pass" : result?.status === "failed" ? "fail" : "blocked";
    return { id: `browser:${target}:${id}`, status,
      code: status === "pass" ? "OK" : status === "fail" ? "BROWSER_ASSERTION_FAILED" : "EXECUTION_UNAVAILABLE",
      durationMs: Math.min(600000, Math.max(0, Math.round(duration))), httpStatus: null };
  });
}

export function sanitizedHttpChecks(snapshot: Snapshot): ProductionE2ECheck[] {
  return E2E_HTTP_PATHS.map((path) => {
    const check = snapshot.checks.find((item) => item.path === path);
    return { id: `http:${path}`, status: check?.status ?? "blocked",
      code: check ? check.status === "pass" ? "OK" : check.code as ProductionE2ECheck["code"] : "EXECUTION_UNAVAILABLE",
      durationMs: check?.durationMs ?? 0, httpStatus: check?.httpStatus ?? null };
  });
}

function runBrowser(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL("../node_modules/e2e/dist/cli/bin.js", import.meta.url)),
      "run", "--config", "e2e.production.config.ts"], {
      cwd: root, stdio: "ignore", env: { ...process.env, E2E_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1" },
    });
    const timer = setTimeout(() => { child.kill("SIGTERM"); }, 420000);
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    // A failed assertion is still an observation to publish, never a missing run.
    child.on("exit", () => { clearTimeout(timer); resolve(); });
  });
}

export async function publishProductionReport(body: string, fetcher = fetch, env = process.env) {
  if (env.GITHUB_ACTIONS !== "true" || env.GITHUB_REPOSITORY !== "nclsppr/guteneo" ||
    env.GITHUB_REF !== "refs/heads/main" || !["schedule", "workflow_dispatch"].includes(env.GITHUB_EVENT_NAME ?? ""))
    throw new Error("PUBLICATION_AUTHORITY_REQUIRED");
  const endpoint = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL ?? "");
  if (endpoint.protocol !== "https:" || !endpoint.hostname.endsWith(".actions.githubusercontent.com") ||
    endpoint.username || endpoint.password || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN)
    throw new Error("OIDC_ENDPOINT_INVALID");
  endpoint.searchParams.set("audience", productionReportAudience(await productionReportDigest(body)));
  const tokenResponse = await fetcher(endpoint, { method: "GET", redirect: "error", cache: "no-store",
    signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` } });
  if (!tokenResponse.ok) throw new Error("OIDC_UNAVAILABLE");
  const value: unknown = await tokenResponse.json();
  const token = (value as { value?: unknown } | null)?.value;
  if (typeof token !== "string" || token.length > 16384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))
    throw new Error("OIDC_RESPONSE_INVALID");
  const response = await fetcher(E2E_AUDIENCE, { method: "POST", redirect: "error", cache: "no-store",
    signal: AbortSignal.timeout(10000), headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body });
  if (response.status !== 201) throw new Error("PUBLICATION_REJECTED");
  // Neither the token, its endpoint, upstream body nor response details are logged.
}

export async function productionBrowserMonitor(publish = false) {
  const startedAt = new Date().toISOString();
  await rm(rawOutput, { recursive: true, force: true });
  const before = await collectPublicSnapshot();
  await runBrowser().catch(() => {});
  let raw: unknown = null;
  try { raw = JSON.parse(await readFile(new URL("report.json", rawOutput), "utf8")); } catch { /* Missing execution is unknown. */ }
  const after = await collectPublicSnapshot();
  const report = productionE2EReportSchema.parse({
    schema: 1, environment: "production", scope: "anonymous_public_browser", origin: "https://guteneo.com",
    startedAt, completedAt: new Date().toISOString(),
    runnerCommit: process.env.GITHUB_SHA ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    releaseBefore: before.sourceCommit, releaseAfter: after.sourceCommit,
    run: { id: process.env.GITHUB_RUN_ID ?? "1", attempt: Number(process.env.GITHUB_RUN_ATTEMPT ?? "1"),
      event: process.env.GITHUB_EVENT_NAME ?? "workflow_dispatch" },
    nonce: randomBytes(32).toString("hex"),
    checks: [...sanitizedBrowserChecks(raw), ...sanitizedHttpChecks(after)],
  });
  if (report.checks.length !== E2E_CHECK_IDS.length) throw new Error("INCOMPLETE_PUBLIC_REPORT");
  const body = JSON.stringify(report);
  await mkdir(new URL("../test-results/production-e2e/", import.meta.url), { recursive: true });
  // A locally launched observation has no GitHub run identity. Its saved proof
  // is explicitly different and cannot satisfy the signed ingestion schema.
  const githubRun = process.env.GITHUB_ACTIONS === "true";
  await writeFile(output, githubRun ? body : JSON.stringify({ ...report,
    execution: "local_read_only_observation", run: null, nonce: null }));
  // Raw framework evidence is ephemeral and never part of the public artifact.
  await rm(rawOutput, { recursive: true, force: true });
  if (publish) await publishProductionReport(body);
  return { status: productionReportStatus(report), checks: report.checks.length,
    passed: report.checks.filter((check) => check.status === "pass").length,
    testedReleaseCommit: report.releaseBefore === report.releaseAfter ? report.releaseAfter : null };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    if (process.argv.slice(2).some((arg) => arg !== "--publish")) throw new Error("UNSUPPORTED_ARGUMENT");
    const summary = await productionBrowserMonitor(process.argv.includes("--publish"));
    console.log(JSON.stringify(summary));
    if (summary.status !== "passed") process.exitCode = 1;
  } catch {
    console.error("PRODUCTION_BROWSER_MONITOR_FAILED"); process.exitCode = 1;
  }
}
