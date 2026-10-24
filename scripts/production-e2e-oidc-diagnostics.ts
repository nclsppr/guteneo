import { decodeJwt, decodeProtectedHeader, errors, type JWTVerifyGetKey } from "jose";
import {
  E2E_ISSUER, E2E_OWNER_ID, E2E_REPOSITORY, E2E_REPOSITORY_ID, E2E_WORKFLOW,
  productionDirectWorkflowClaimsMatch, productionE2EReportSchema, productionReportAudience, productionReportDigest, verifyProductionReport,
} from "../apps/status/production-e2e";

const joseCodes = ["ERR_JWT_EXPIRED", "ERR_JWT_CLAIM_VALIDATION_FAILED", "ERR_JWS_SIGNATURE_VERIFICATION_FAILED",
  "ERR_JWKS_TIMEOUT", "ERR_JWKS_NO_MATCHING_KEY", "ERR_JWKS_MULTIPLE_MATCHING_KEYS", "ERR_JOSE_ALG_NOT_ALLOWED",
  "ERR_JWS_INVALID", "ERR_JWT_INVALID", "ERR_JWK_INVALID", "ERR_JWKS_INVALID"] as const;
type VerificationCode = typeof joseCodes[number] | "ACCEPTED" | "REPORT_TIME_INVALID" | "REPORT_AUTHORITY_INVALID" |
  "REPORT_INVALID" | "TOKEN_INVALID" | "DIAGNOSTIC_TIMEOUT" | "VERIFICATION_UNAVAILABLE";
const claimNames = ["iss", "aud", "exp", "iat", "nbf", "jti", "sub"] as const;
type ClaimName = typeof claimNames[number];

/** This projection is diagnostic only. Decoded comparisons are explicitly
 * unverified; only the unchanged server verifier checks the signature. No
 * claim values, JWT, JWK, endpoint, exception text or report bytes can escape.
 */
export type ProductionOidcDiagnostic = {
  code: "REPORT_REJECTION_DIAGNOSTIC";
  comparisonsVerified: false;
  comparisons: Record<string, boolean> | null;
  verification: VerificationCode;
  verificationClaim: ClaimName | null;
};

function verificationFailure(error: unknown): Pick<ProductionOidcDiagnostic, "verification" | "verificationClaim"> {
  if (error instanceof errors.JOSEError && joseCodes.includes(error.code as typeof joseCodes[number])) return {
    verification: error.code as typeof joseCodes[number],
    verificationClaim: error instanceof errors.JWTClaimValidationFailed && claimNames.includes(error.claim as ClaimName)
      ? error.claim as ClaimName : null,
  };
  if (error instanceof Error && ["REPORT_TIME_INVALID", "REPORT_AUTHORITY_INVALID"].includes(error.message))
    return { verification: error.message as "REPORT_TIME_INVALID" | "REPORT_AUTHORITY_INVALID", verificationClaim: null };
  return { verification: "VERIFICATION_UNAVAILABLE", verificationClaim: null };
}

/** Runs only after the real endpoint rejected this exact token/body. At most
 * one verification uses the existing fixed GitHub JWKS (five-second timeout),
 * with an absolute six-second diagnostic deadline. This never retries POST,
 * requests another token, changes authority or turns rejection into success.
 * A local key resolver is injectable solely for offline signed-fixture tests.
 */
export async function diagnoseProductionReportRejection(
  token: string, body: string, now = Date.now(), keySet?: JWTVerifyGetKey,
): Promise<ProductionOidcDiagnostic> {
  const base: ProductionOidcDiagnostic = { code: "REPORT_REJECTION_DIAGNOSTIC", comparisonsVerified: false,
    comparisons: null, verification: "VERIFICATION_UNAVAILABLE", verificationClaim: null };
  if (body.length > 16384) return { ...base, verification: "REPORT_INVALID" };
  let report;
  try { report = productionE2EReportSchema.parse(JSON.parse(body)); }
  catch { return { ...base, verification: "REPORT_INVALID" }; }
  if (token.length > 16384) return { ...base, verification: "TOKEN_INVALID" };
  let payload, header;
  try { payload = decodeJwt(token); header = decodeProtectedHeader(token); }
  catch { return { ...base, verification: "TOKEN_INVALID" }; }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      new Promise<ProductionOidcDiagnostic>((resolve) => {
        timer = setTimeout(() => resolve({ ...base, verification: "DIAGNOSTIC_TIMEOUT" }), 6000);
      }),
      (async () => {
        const started = Date.parse(report.startedAt), completed = Date.parse(report.completedAt);
        const audience = productionReportAudience(await productionReportDigest(body));
        base.comparisons = {
          reportTimeValid: started <= completed && completed - started <= 600000 && started >= now - 1800000 && completed <= now + 30000,
          algorithmAllowed: header.alg === "RS256",
          requiredClaimsPresent: ["exp", "iat", "nbf", "jti", "sub"].every((claim) => payload[claim] !== undefined),
          issuerMatches: payload.iss === E2E_ISSUER,
          audienceMatches: payload.aud === audience,
          repositoryMatches: payload.repository === E2E_REPOSITORY,
          repositoryIdMatches: payload.repository_id === E2E_REPOSITORY_ID,
          ownerMatches: payload.repository_owner === "nclsppr",
          ownerIdMatches: payload.repository_owner_id === E2E_OWNER_ID,
          refMatches: payload.ref === "refs/heads/main",
          refTypeMatches: payload.ref_type === "branch",
          workflowMatches: payload.workflow_ref === E2E_WORKFLOW,
          workflowShaMatches: payload.workflow_sha === report.runnerCommit,
          commitMatches: payload.sha === report.runnerCommit,
          runIdMatches: payload.run_id === report.run.id,
          runAttemptMatches: payload.run_attempt === String(report.run.attempt),
          eventMatches: payload.event_name === report.run.event,
          eventAllowed: ["schedule", "workflow_dispatch"].includes(String(payload.event_name)),
          runnerAllowed: payload.runner_environment === "github-hosted",
          subjectAllowed: [`repo:${E2E_REPOSITORY}:ref:refs/heads/main`,
            `repo:nclsppr@${E2E_OWNER_ID}/guteneo@${E2E_REPOSITORY_ID}:ref:refs/heads/main`].includes(payload.sub!),
          headRefAbsent: !payload.head_ref,
          baseRefAbsent: !payload.base_ref,
          directWorkflowClaimsMatch: productionDirectWorkflowClaimsMatch(payload, report.runnerCommit),
          tokenIdAllowed: /^[A-Za-z0-9_-]{16,200}$/.test(String(payload.jti ?? "")),
          issuedAfterReport: typeof payload.iat === "number" && payload.iat >= completed / 1000 - 30,
          issuedBeforeNow: typeof payload.iat === "number" && payload.iat <= now / 1000 + 5,
          tokenFresh: typeof payload.iat === "number" && payload.iat >= now / 1000 - 305,
          tokenNotExpired: typeof payload.exp === "number" && payload.exp > now / 1000 - 5,
          tokenActive: typeof payload.nbf === "number" && payload.nbf <= now / 1000 + 5,
        };
        try {
          await verifyProductionReport(token, body, now, keySet);
          return { ...base, verification: "ACCEPTED" as const };
        } catch (error) { return { ...base, ...verificationFailure(error) }; }
      })(),
    ]);
  } finally { clearTimeout(timer); }
}
