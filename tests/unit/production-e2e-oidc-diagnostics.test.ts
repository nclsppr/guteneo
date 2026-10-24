import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from "jose";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  E2E_CHECK_IDS, E2E_ISSUER, E2E_OWNER_ID, E2E_REPOSITORY, E2E_REPOSITORY_ID, E2E_WORKFLOW,
  productionReportAudience, productionReportDigest, type ProductionE2EReport,
} from "../../apps/status/production-e2e";
import { diagnoseProductionReportRejection } from "../../scripts/production-e2e-oidc-diagnostics";

const NOW = Date.parse("2026-10-24T20:00:00Z");
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let keySet: ReturnType<typeof createLocalJWKSet>;
const fixture = (): ProductionE2EReport => ({
  schema: 1, environment: "production", scope: "anonymous_public_browser", origin: "https://guteneo.com",
  startedAt: new Date(NOW - 60000).toISOString(), completedAt: new Date(NOW - 1000).toISOString(),
  runnerCommit: "a".repeat(40), releaseBefore: "b".repeat(40), releaseAfter: "b".repeat(40),
  run: { id: "123456", attempt: 1, event: "workflow_dispatch" }, nonce: "c".repeat(64),
  checks: E2E_CHECK_IDS.map((id) => ({ id, status: "pass", code: "OK", durationMs: 1,
    httpStatus: id.startsWith("browser:") ? null : ["http:/api/documents", "http:/api/dispatches", "http:/api/overview", "http:/mcp"].includes(id) ? 401 : 200 })),
});
async function signed(body: string, overrides: Record<string, unknown> = {}, privateKey = keys.privateKey) {
  const report = JSON.parse(body) as ProductionE2EReport;
  return new SignJWT({
    repository: E2E_REPOSITORY, repository_id: E2E_REPOSITORY_ID,
    repository_owner: "nclsppr", repository_owner_id: E2E_OWNER_ID,
    ref: "refs/heads/main", ref_type: "branch", workflow_ref: E2E_WORKFLOW,
    workflow_sha: report.runnerCommit, sha: report.runnerCommit,
    run_id: report.run.id, run_attempt: String(report.run.attempt), event_name: report.run.event,
    runner_environment: "github-hosted", iss: E2E_ISSUER,
    sub: `repo:nclsppr@${E2E_OWNER_ID}/guteneo@${E2E_REPOSITORY_ID}:ref:refs/heads/main`,
    aud: productionReportAudience(await productionReportDigest(body)),
    iat: NOW / 1000, nbf: NOW / 1000 - 1, exp: NOW / 1000 + 300,
    jti: "synthetic-token-id-123456", ...overrides,
  }).setProtectedHeader({ alg: "RS256", kid: "fixture" }).sign(privateKey);
}
beforeAll(async () => {
  keys = await generateKeyPair("RS256");
  keySet = createLocalJWKSet({ keys: [{ ...await exportJWK(keys.publicKey), kid: "fixture", alg: "RS256" }] });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("closed production OIDC rejection diagnostics", () => {
  it("uses the unchanged signature verifier offline and emits no claim values", async () => {
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("NETWORK_FORBIDDEN"));
    const body = JSON.stringify(fixture()), token = await signed(body, { extra_private_claim: "private@example.invalid" });
    const diagnostic = await diagnoseProductionReportRejection(token, body, NOW, keySet);
    expect(diagnostic.verification).toBe("ACCEPTED");
    expect(diagnostic.comparisonsVerified).toBe(false);
    expect(Object.values(diagnostic.comparisons!)).not.toContain(false);
    expect(JSON.stringify(diagnostic)).not.toMatch(/https:|nclsppr|123456|example|eyJ|private/);
    expect(network).not.toHaveBeenCalled();
  });

  it.each([
    ["repository", "private/repo", "repositoryMatches"], ["repository_id", "999", "repositoryIdMatches"],
    ["repository_owner", "private", "ownerMatches"], ["repository_owner_id", "999", "ownerIdMatches"],
    ["ref", "private-ref", "refMatches"], ["ref_type", "tag", "refTypeMatches"],
    ["workflow_ref", "private-workflow", "workflowMatches"], ["workflow_sha", "d".repeat(40), "workflowShaMatches"],
    ["sha", "d".repeat(40), "commitMatches"], ["run_id", "999", "runIdMatches"],
    ["run_attempt", "2", "runAttemptMatches"], ["event_name", "pull_request", "eventAllowed"],
    ["runner_environment", "self-hosted", "runnerAllowed"], ["sub", "private-subject", "subjectAllowed"],
    ["head_ref", "private-head", "headRefAbsent"], ["base_ref", "private-base", "baseRefAbsent"],
    ["job_workflow_ref", "private-reusable", "directWorkflowClaimsMatch"], ["jti", "short", "tokenIdAllowed"],
    ["iat", NOW / 1000 - 60, "issuedAfterReport"],
  ])("identifies failed %s comparison without weakening verification", async (claim, value, comparison) => {
    const body = JSON.stringify(fixture()), token = await signed(body, { [claim]: value });
    const diagnostic = await diagnoseProductionReportRejection(token, body, NOW, keySet);
    expect(diagnostic.comparisons?.[comparison]).toBe(false);
    expect(diagnostic.verification).toBe("REPORT_AUTHORITY_INVALID");
    expect(JSON.stringify(diagnostic)).not.toContain(String(value));
  });

  it("recognizes current signed direct-job claims, without treating their presence as a reusable job", async () => {
    const body = JSON.stringify(fixture());
    const diagnostic = await diagnoseProductionReportRejection(await signed(body, {
      job_workflow_ref: E2E_WORKFLOW, job_workflow_sha: fixture().runnerCommit,
    }), body, NOW, keySet);
    expect(diagnostic.verification).toBe("ACCEPTED");
    expect(diagnostic.comparisons?.directWorkflowClaimsMatch).toBe(true);
    expect(Object.values(diagnostic.comparisons!)).not.toContain(false);
  });

  it.each([
    ["iss", "private-issuer", "issuerMatches", "ERR_JWT_CLAIM_VALIDATION_FAILED"],
    ["aud", "private-audience", "audienceMatches", "ERR_JWT_CLAIM_VALIDATION_FAILED"],
    ["exp", NOW / 1000 - 10, "tokenNotExpired", "ERR_JWT_EXPIRED"],
    ["nbf", NOW / 1000 + 10, "tokenActive", "ERR_JWT_CLAIM_VALIDATION_FAILED"],
    ["iat", NOW / 1000 - 306, "tokenFresh", "ERR_JWT_EXPIRED"],
    ["iat", NOW / 1000 + 6, "issuedBeforeNow", "ERR_JWT_CLAIM_VALIDATION_FAILED"],
    ["sub", undefined, "requiredClaimsPresent", "ERR_JWT_CLAIM_VALIDATION_FAILED"],
  ])("distinguishes JOSE validation of %s from authority predicates", async (claim, value, comparison, code) => {
    const body = JSON.stringify(fixture()), token = await signed(body, { [claim]: value });
    const diagnostic = await diagnoseProductionReportRejection(token, body, NOW, keySet);
    expect(diagnostic.comparisons?.[comparison]).toBe(false);
    expect(diagnostic.verification).toBe(code);
  });

  it("reports signature failure even when every decoded comparison matches", async () => {
    const other = await generateKeyPair("RS256"), body = JSON.stringify(fixture());
    const diagnostic = await diagnoseProductionReportRejection(await signed(body, {}, other.privateKey), body, NOW, keySet);
    expect(diagnostic.verification).toBe("ERR_JWS_SIGNATURE_VERIFICATION_FAILED");
    expect(Object.values(diagnostic.comparisons!)).not.toContain(false);
    expect(diagnostic.comparisonsVerified).toBe(false);
  });

  it("bounds malformed tokens/reports before consulting a key resolver", async () => {
    const resolver = vi.fn<JWTVerifyGetKey>();
    for (const [token, body, code] of [["private.jwt.signature", JSON.stringify(fixture()), "TOKEN_INVALID"],
      ["x".repeat(16385), JSON.stringify(fixture()), "TOKEN_INVALID"], ["private-token", "{}", "REPORT_INVALID"],
      ["private-token", "x".repeat(16385), "REPORT_INVALID"]]) {
      const diagnostic = await diagnoseProductionReportRejection(token, body, NOW, resolver);
      expect(diagnostic).toMatchObject({ comparisons: null, verification: code });
      expect(JSON.stringify(diagnostic)).not.toContain("private");
    }
    expect(resolver).not.toHaveBeenCalled();
  });

  it("redacts resolver exceptions and cannot mistake a lookalike error for a JOSE failure", async () => {
    const body = JSON.stringify(fixture()), token = await signed(body);
    const resolver: JWTVerifyGetKey = async () => {
      throw Object.assign(new Error("Bearer secret https://private.invalid"), { code: "ERR_JWT_EXPIRED", claim: "private-value" });
    };
    expect(await diagnoseProductionReportRejection(token, body, NOW, resolver)).toMatchObject({
      verification: "VERIFICATION_UNAVAILABLE", verificationClaim: null,
    });
  });

  it("returns within six seconds even when a resolver never settles", async () => {
    const body = JSON.stringify(fixture()), token = await signed(body);
    vi.useFakeTimers();
    const pending = diagnoseProductionReportRejection(token, body, NOW, async () => new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(6000);
    expect(await pending).toMatchObject({ verification: "DIAGNOSTIC_TIMEOUT" });
    expect(vi.getTimerCount()).toBe(0);
  });
});
