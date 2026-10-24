import { readFileSync } from "node:fs";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  E2E_CHECK_IDS, E2E_ISSUER, E2E_REPOSITORY, E2E_REPOSITORY_ID, E2E_OWNER_ID,
  E2E_WORKFLOW, E2E_STALE_MS, ingestProductionReport, productionReportAudience,
  productionReportDigest, readProductionE2EStatus, type ProductionE2EReport,
} from "../../apps/status/production-e2e";
import { handleStatusRequest } from "../../apps/status/worker";
import { sanitizedBrowserChecks, publishProductionReport } from "../../scripts/production-e2e";

const NOW = Date.parse("2026-10-24T16:00:00.000Z"), commit = "a".repeat(40);
let mf: Miniflare, db: D1Database;
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let keySet: ReturnType<typeof createLocalJWKSet>;
let counter = 1;
const fixture = (): ProductionE2EReport => ({
  schema: 1, environment: "production", scope: "anonymous_public_browser", origin: "https://guteneo.com",
  startedAt: new Date(NOW - 60000).toISOString(), completedAt: new Date(NOW - 1000).toISOString(),
  runnerCommit: commit, releaseBefore: commit, releaseAfter: commit,
  run: { id: String(counter++), attempt: 1, event: "schedule" },
  nonce: counter.toString(16).padStart(64, "0"),
  checks: E2E_CHECK_IDS.map((id) => ({ id, status: "pass", code: "OK", durationMs: 100,
    httpStatus: id.startsWith("browser:") ? null : ["http:/api/documents", "http:/api/dispatches", "http:/api/overview", "http:/mcp"].includes(id) ? 401 : 200 })),
});
async function token(body: string, claims: Record<string, unknown> = {}, audience?: string | string[], tokenId = crypto.randomUUID()) {
  const report = JSON.parse(body) as ProductionE2EReport;
  return new SignJWT({
    repository: E2E_REPOSITORY, repository_id: E2E_REPOSITORY_ID,
    repository_owner: "nclsppr", repository_owner_id: E2E_OWNER_ID,
    ref: "refs/heads/main", ref_type: "branch", workflow_ref: E2E_WORKFLOW,
    workflow_sha: report.runnerCommit, sha: report.runnerCommit,
    run_id: report.run.id, run_attempt: String(report.run.attempt), event_name: report.run.event,
    runner_environment: "github-hosted", ...claims,
  }).setProtectedHeader({ alg: "RS256", kid: "fixture" })
    .setIssuer(E2E_ISSUER).setSubject(`repo:${E2E_REPOSITORY}:ref:refs/heads/main`)
    .setAudience(audience ?? productionReportAudience(await productionReportDigest(body)))
    .setIssuedAt(NOW / 1000).setNotBefore(NOW / 1000 - 1).setExpirationTime(NOW / 1000 + 300)
    .setJti(tokenId).sign(keys.privateKey);
}
function request(body: string, bearer: string) {
  return new Request("https://status.guteneo.com/api/e2e-reports", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` }, body,
  });
}
async function accept(report = fixture()) {
  const body = JSON.stringify(report);
  return ingestProductionReport(request(body, await token(body)), db, NOW, keySet);
}
async function latest(time = NOW) { return (await readProductionE2EStatus(db, time)).json() as Promise<Record<string, unknown>>; }
async function release(time = NOW, sourceCommit = commit) {
  await db.prepare("INSERT INTO status_samples(bucket,checked_at,sample_json) VALUES(?,?,?)")
    .bind(time, new Date(time).toISOString(), JSON.stringify({ sourceCommit })).run();
}
beforeAll(async () => {
  keys = await generateKeyPair("RS256");
  keySet = createLocalJWKSet({ keys: [{ ...await exportJWK(keys.publicKey), kid: "fixture", alg: "RS256" }] });
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true,
    script: 'export default {fetch(){return new Response("ok")}}', d1Databases: ["STATUS_DB"], compatibilityDate: "2026-09-16" }));
  db = await mf.getD1Database("STATUS_DB") as unknown as D1Database;
  for (const migration of ["0001_status.sql", "0002_production_e2e.sql"]) {
    let statement = "", trigger = false;
    for (const raw of readFileSync(new URL(`../../apps/status/migrations/${migration}`, import.meta.url), "utf8").split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("--")) continue;
      if (!statement) trigger = line.startsWith("CREATE TRIGGER");
      statement += `${line}\n`;
      if ((trigger && line === "END;") || (!trigger && line.endsWith(";"))) {
        await db.prepare(statement).run(); statement = ""; trigger = false;
      }
    }
  }
});
beforeEach(async () => { await db.batch([db.prepare("DELETE FROM production_e2e_reports"), db.prepare("DELETE FROM status_samples")]); });
afterAll(async () => { await mf.dispose(); });

describe("sanitized production browser evidence", () => {
  it("accepts only signed fixed-workflow evidence and exposes its bounded public projection", async () => {
    await release();
    const report = fixture(), response = await accept(report);
    expect(response.status).toBe(201);
    const result = await latest();
    expect(result).toMatchObject({ status: "passed", freshness: "fresh", releaseState: "current",
      currentReleaseCommit: commit, authenticated: { status: "blocked" }, latest: { runId: report.run.id,
        runUrl: `https://github.com/nclsppr/guteneo/actions/runs/${report.run.id}/attempts/1`, testedReleaseCommit: commit } });
    expect(JSON.stringify(result)).not.toMatch(/nonce|token_id|report_sha256|Authorization|Bearer|recipient|screenshot|email/i);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it.each([
    ["repository", "attacker/guteneo"], ["repository_id", "999"],
    ["repository_owner_id", "999"], ["ref", "refs/pull/2/merge"],
    ["workflow_ref", "nclsppr/guteneo/.github/workflows/other.yml@refs/heads/main"],
    ["event_name", "pull_request"], ["head_ref", "fork"], ["sha", "b".repeat(40)],
    ["run_id", "99999"], ["run_attempt", "2"], ["runner_environment", "self-hosted"],
    ["job_workflow_ref", "attacker/tool/.github/workflows/run.yml@refs/heads/main"],
  ])("rejects changed OIDC authority %s", async (claim, value) => {
    const body = JSON.stringify(fixture());
    const response = await ingestProductionReport(request(body, await token(body, { [claim]: value })), db, NOW, keySet);
    expect(response.status).toBe(401);
    expect(await db.prepare("SELECT count(*) n FROM production_e2e_reports").first()).toEqual({ n: 0 });
  });

  it("rejects a different audience, unsigned or tampered JWT and post-signature body changes", async () => {
    const report = fixture(), body = JSON.stringify(report), signed = await token(body);
    const wrongAudience = await token(body, {}, "https://elsewhere.example");
    const ambiguousAudience = await token(body, {}, [productionReportAudience(await productionReportDigest(body)), "https://elsewhere.example"]);
    report.checks[0] = { ...report.checks[0], status: "fail", code: "BROWSER_ASSERTION_FAILED" };
    const tamperedBody = JSON.stringify(report);
    for (const [payload, bearer] of [[body, wrongAudience], [body, ambiguousAudience], [tamperedBody, signed], [body, `${signed.slice(0, -10)}AAAAAAAAAA`], [body, "invalid"]]) {
      expect((await ingestProductionReport(request(payload, bearer), db, NOW, keySet)).status).toBe(401);
    }
  });

  it("rejects extra fields, incomplete scope, mismatched codes, and arbitrary recipient text", async () => {
    for (const mutate of [
      (report: Record<string, unknown>) => { report.logs = "secret"; },
      (report: Record<string, unknown>) => { report.origin = "https://attacker.example"; },
      (report: Record<string, unknown>) => { report.checks = []; },
      (report: Record<string, unknown>) => { const checks = report.checks as ProductionE2EReport["checks"]; checks[0].id = "a recipient address"; },
      (report: Record<string, unknown>) => { const checks = report.checks as ProductionE2EReport["checks"]; checks[0].status = "fail"; },
    ]) {
      const report = fixture() as unknown as Record<string, unknown>; mutate(report);
      const body = JSON.stringify(report);
      expect((await ingestProductionReport(request(body, await token(body)), db, NOW, keySet)).status).toBe(401);
    }
  });

  it("rejects expired tokens and obsolete observation time", async () => {
    const report = fixture(), body = JSON.stringify(report), signed = await token(body);
    expect((await ingestProductionReport(request(body, signed), db, NOW + 360000, keySet)).status).toBe(401);
    report.startedAt = new Date(NOW - 3600000).toISOString(); report.completedAt = new Date(NOW - 3500000).toISOString();
    const old = JSON.stringify(report);
    expect((await ingestProductionReport(request(old, await token(old)), db, NOW, keySet)).status).toBe(401);
  });

  it("rejects a stalled body within five seconds even when its source also stalls cancellation", async () => {
    const body = JSON.stringify(fixture()), signed = await token(body);
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull: () => new Promise<void>(() => {}),
      cancel() { cancelled = true; return new Promise<void>(() => {}); },
    });
    const stalled = new Request("https://status.guteneo.com/api/e2e-reports", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${signed}` },
      body: stream, ...({ duplex: "half" } as object),
    });
    vi.useFakeTimers();
    try {
      const pending = ingestProductionReport(stalled, db, NOW, keySet);
      await vi.advanceTimersByTimeAsync(5001);
      const response = await pending;
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "REPORT_REJECTED" });
      expect(cancelled).toBe(true);
    } finally { vi.useRealTimers(); }
  });

  it("never replaces a run attempt, even with another valid JWT; accepts a distinct retry attempt", async () => {
    const report = fixture(), body = JSON.stringify(report), signed = await token(body);
    expect((await ingestProductionReport(request(body, signed), db, NOW, keySet)).status).toBe(201);
    expect((await ingestProductionReport(request(body, signed), db, NOW, keySet)).status).toBe(409);
    report.checks[0] = { ...report.checks[0], status: "fail", code: "BROWSER_ASSERTION_FAILED" };
    expect((await accept(report)).status).toBe(409);
    report.run.attempt = 2; report.nonce = "f".repeat(64);
    expect((await accept(report)).status).toBe(201);
    await expect(db.prepare("UPDATE production_e2e_reports SET status='passed'").run()).rejects.toThrow(/IMMUTABLE/);
    expect((await db.prepare("SELECT count(*) n FROM production_e2e_reports").first())?.n).toBe(2);
  });

  it("also rejects a reused nonce or JWT identity across different run IDs", async () => {
    const report = fixture(), firstBody = JSON.stringify(report), tokenId = crypto.randomUUID();
    expect((await ingestProductionReport(request(firstBody, await token(firstBody, {}, undefined, tokenId)), db, NOW, keySet)).status).toBe(201);
    report.run.id = String(counter++);
    expect((await accept(report)).status).toBe(409);
    report.nonce = "d".repeat(64);
    const reusedIdentity = JSON.stringify(report);
    expect((await ingestProductionReport(request(reusedIdentity, await token(reusedIdentity, {}, undefined, tokenId)), db, NOW, keySet)).status).toBe(409);
  });

  it("persists a failure and its history when the next complete run passes", async () => {
    await release();
    const failed = fixture(); failed.checks[0] = { ...failed.checks[0], status: "fail", code: "BROWSER_ASSERTION_FAILED" };
    await accept(failed); expect((await latest()).status).toBe("attention");
    const passed = fixture(); passed.completedAt = new Date(NOW).toISOString();
    await accept(passed);
    const result = await latest(); expect(result.status).toBe("passed");
    expect(result.history).toEqual(expect.arrayContaining([expect.objectContaining({ runId: failed.run.id, status: "attention" })]));
  });

  it("keeps absent, stale, unversioned, release-changed and incomplete execution unknown", async () => {
    expect(await latest()).toMatchObject({ status: "unknown", freshness: "missing", latest: null });
    const report = fixture(); await accept(report);
    expect(await latest()).toMatchObject({ status: "unknown", releaseState: "unverified" });
    await release(NOW, "b".repeat(40));
    expect(await latest()).toMatchObject({ status: "unknown", releaseState: "changed" });
    await release(NOW + E2E_STALE_MS, commit);
    expect(await latest(NOW + E2E_STALE_MS)).toMatchObject({ status: "unknown", freshness: "stale" });
    report.run.id = String(counter++); report.nonce = "e".repeat(64);
    report.checks[0] = { ...report.checks[0], status: "blocked", code: "EXECUTION_UNAVAILABLE" };
    await accept(report); expect((await latest()).authenticated).toMatchObject({ status: "blocked" });
  });

  it("has no unsigned write path and keeps public unknown distinct from an outage", async () => {
    const env = { STATUS_DB: db, ASSETS: { fetch: async () => new Response("asset") } as unknown as Fetcher };
    expect((await handleStatusRequest(new Request("https://status.guteneo.com/api/e2e-reports", { method: "POST", body: "{}" }), env, NOW)).status).toBe(415);
    const read = await handleStatusRequest(new Request("https://status.guteneo.com/api/e2e-status"), env, NOW);
    expect(read.status).toBe(200); expect(await read.json()).toMatchObject({ status: "unknown" });
    const foreign = await handleStatusRequest(new Request("https://status.guteneo.com/api/e2e-reports", { method: "POST", headers: { Origin: "https://attacker.example" }, body: "{}" }), env, NOW);
    expect(foreign.status).toBe(403);
  });

  it("treats missing/agent-assisted framework evidence as blocked, never as passed", () => {
    expect(sanitizedBrowserChecks(null).every((check) => check.status === "blocked")).toBe(true);
    expect(sanitizedBrowserChecks({ run: { usage: { modelTokens: 1, maxModelCallsInStep: 1 } } })
      .every((check) => check.status === "blocked")).toBe(true);
  });

  it("turns an unavailable status store into neutral unknown without exposing its error", async () => {
    const broken = { prepare() { throw new Error("private-database-detail"); } } as unknown as D1Database;
    const response = await readProductionE2EStatus(broken, NOW);
    expect(response.status).toBe(200);
    const value = await response.text();
    expect(JSON.parse(value)).toMatchObject({ status: "unknown", freshness: "missing", authenticated: { status: "blocked" } });
    expect(value).not.toContain("private-database-detail");
  });

  it("binds the upload to the exact report digest, never writes a JWT to its report", async () => {
    const body = JSON.stringify(fixture()), requests: { url: string; method: string; body?: string }[] = [];
    await publishProductionReport(body, async (input, init) => {
      const url = String(input); requests.push({ url, method: init?.method ?? "GET", body: init?.body as string | undefined });
      if (url.startsWith("https://fixture.actions.githubusercontent.com/")) {
        expect(new URL(url).searchParams.get("audience")).toBe(productionReportAudience(await productionReportDigest(body)));
        return Response.json({ value: "eyJfixture.eyJfixture.signature" });
      }
      expect(url).toBe("https://status.guteneo.com/api/e2e-reports");
      expect(init?.body).toBe(body); return Response.json({ accepted: true }, { status: 201 });
    }, { GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: E2E_REPOSITORY, GITHUB_REF: "refs/heads/main", GITHUB_EVENT_NAME: "schedule",
      ACTIONS_ID_TOKEN_REQUEST_URL: "https://fixture.actions.githubusercontent.com/oidc?api-version=1", ACTIONS_ID_TOKEN_REQUEST_TOKEN: "fixture-only" });
    expect(requests).toHaveLength(2);
    expect(requests[1].body).not.toMatch(/Bearer|signature|fixture-only/);
  });
});
