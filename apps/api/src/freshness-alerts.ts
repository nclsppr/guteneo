/** Private operational metadata. The collector, not an arbitrary caller, proves
 * which exact bindings are selected by current production gates. No source,
 * pricing, authority, dispatch, quota or notification is changed here. */
export const freshnessFamilies = [
  "fax_tariff",
  "delivery_policy",
  "fax_authority",
  "resend_tariff",
  "resend_send_limits",
] as const;
export type FreshnessFamily = (typeof freshnessFamilies)[number];
export interface FreshnessCandidate {
  revisionSha256: string;
  deadline: string;
  mode: "automatic" | "operator";
}
export interface FreshnessEvaluation {
  organizationId: string;
  family: FreshnessFamily;
  bindingSha256: string;
  /** false requires a proved deselection, suspension or revocation. An omitted
   * page, failed read or unexplained lost guard is never such proof. */
  active: boolean;
  candidates: FreshnessCandidate[];
}
export interface FreshnessAlertCounts {
  freshnessAtRisk: number;
  freshnessExpired: number;
  freshnessOpened: number;
  freshnessResolved: number;
  freshnessChecksFailed: number;
}
const hash = /^[a-f0-9]{64}$/;
const tenant = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const warningMilliseconds = 86_400_000;
function invalid(): never {
  throw new Error("FRESHNESS_INPUT_INVALID");
}
function timestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}
async function digest(value: unknown) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(value)),
    ),
  );
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
function validate(evaluations: readonly FreshnessEvaluation[], now: string) {
  if (!timestamp(now) || !Array.isArray(evaluations) || evaluations.length > 50)
    invalid();
  const seen = new Set<string>();
  let candidates = 0;
  for (const evaluation of evaluations) {
    if (
      !evaluation ||
      typeof evaluation.organizationId !== "string" ||
      !tenant.test(evaluation.organizationId) ||
      !freshnessFamilies.includes(evaluation.family) ||
      !hash.test(evaluation.bindingSha256) ||
      typeof evaluation.active !== "boolean" ||
      !Array.isArray(evaluation.candidates) ||
      evaluation.candidates.length > 16 ||
      (evaluation.active
        ? evaluation.candidates.length === 0
        : evaluation.candidates.length !== 0)
    )
      invalid();
    const key = JSON.stringify([
      evaluation.organizationId,
      evaluation.family,
      evaluation.bindingSha256,
    ]);
    if (seen.has(key)) invalid();
    seen.add(key);
    const revisions = new Set<string>();
    for (const candidate of evaluation.candidates) {
      if (
        !candidate ||
        !hash.test(candidate.revisionSha256) ||
        !timestamp(candidate.deadline) ||
        !["automatic", "operator"].includes(candidate.mode) ||
        (evaluation.family === "fax_authority" && candidate.mode !== "operator")
      )
        invalid();
      const revision = JSON.stringify([
        candidate.revisionSha256,
        candidate.deadline,
        candidate.mode,
      ]);
      if (revisions.has(revision)) invalid();
      revisions.add(revision);
      candidates++;
    }
  }
  if (candidates > 100) invalid();
}

/** One transaction fences stale/overlapping evaluations and their resolutions.
 * Empty input still returns every unresolved incident, including other pages.
 * Repeated evidence is idempotent; a genuinely re-enabled binding may reopen its
 * same incident rather than invent another deadline or duplicate record. */
export async function reconcileFreshnessAlerts(
  db: D1Database,
  evaluations: readonly FreshnessEvaluation[],
  now = new Date().toISOString(),
): Promise<FreshnessAlertCounts> {
  validate(evaluations, now);
  const statements: D1PreparedStatement[] = [];
  const evaluationIndexes: number[] = [];
  const openedIndexes: number[] = [];
  const resolvedIndexes: number[] = [];
  for (const evaluation of evaluations) {
    const { organizationId, family, bindingSha256, active } = evaluation;
    const candidates = evaluation.candidates
      .map(({ revisionSha256, deadline, mode }) => ({
        revisionSha256,
        deadline,
        mode,
      }))
      .sort((a, b) => {
        const first = JSON.stringify(a),
          second = JSON.stringify(b);
        return first < second ? -1 : first > second ? 1 : 0;
      });
    const candidateJson = JSON.stringify(candidates);
    const evaluationHash = await digest({ active, candidates });
    const binding = [organizationId, family, bindingSha256];
    const fence =
      "EXISTS(SELECT 1 FROM provider_freshness_bindings b WHERE b.organization_id=? AND b.family=? AND b.binding_sha256=? AND b.evaluated_at=? AND b.evaluation_sha256=?)";
    const fenceArgs = [...binding, now, evaluationHash];
    const matches =
      "EXISTS(SELECT 1 FROM json_each(?) c WHERE json_extract(c.value,'$.revisionSha256')=provider_freshness_incidents.revision_sha256 AND json_extract(c.value,'$.deadline')=provider_freshness_incidents.deadline_at AND json_extract(c.value,'$.mode')=provider_freshness_incidents.renewal_mode)";
    evaluationIndexes.push(statements.length);
    statements.push(
      db
        .prepare(
          "INSERT INTO provider_freshness_bindings(organization_id,family,binding_sha256,active,evaluated_at,evaluation_sha256) VALUES(?,?,?,?,?,?) ON CONFLICT(organization_id,family,binding_sha256) DO UPDATE SET active=excluded.active,evaluated_at=excluded.evaluated_at,evaluation_sha256=excluded.evaluation_sha256 WHERE excluded.evaluated_at>provider_freshness_bindings.evaluated_at OR (excluded.evaluated_at=provider_freshness_bindings.evaluated_at AND excluded.evaluation_sha256=provider_freshness_bindings.evaluation_sha256)",
        )
        .bind(...binding, active ? 1 : 0, now, evaluationHash),
    );
    resolvedIndexes.push(statements.length);
    statements.push(
      db
        .prepare(
          `UPDATE provider_freshness_incidents SET state='resolved',last_evaluated_at=?,resolved_at=?,resolution=? WHERE organization_id=? AND family=? AND binding_sha256=? AND state<>'resolved' AND ${fence} AND NOT ${matches}`,
        )
        .bind(
          now,
          now,
          active ? "replaced" : "disabled",
          ...binding,
          ...fenceArgs,
          candidateJson,
        ),
    );
    for (const candidate of candidates) {
      if (
        Date.parse(candidate.deadline) - Date.parse(now) >
        warningMilliseconds
      )
        continue;
      const incident = await digest({
        organizationId,
        family,
        bindingSha256,
        ...candidate,
        warningSeconds: 86_400,
      });
      const state = candidate.deadline <= now ? "expired" : "at_risk";
      openedIndexes.push(statements.length);
      statements.push(
        db
          .prepare(
            `UPDATE provider_freshness_incidents SET state=?,last_evaluated_at=?,resolved_at=NULL,resolution=NULL,reopened_count=reopened_count+1 WHERE organization_id=? AND incident_sha256=? AND state='resolved' AND ${fence}`,
          )
          .bind(state, now, organizationId, incident, ...fenceArgs),
      );
      openedIndexes.push(statements.length);
      statements.push(
        db
          .prepare(
            `INSERT INTO provider_freshness_incidents(organization_id,incident_sha256,family,binding_sha256,revision_sha256,deadline_at,renewal_mode,state,opened_at,last_evaluated_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${fence} ON CONFLICT(organization_id,incident_sha256) DO NOTHING`,
          )
          .bind(
            organizationId,
            incident,
            family,
            bindingSha256,
            candidate.revisionSha256,
            candidate.deadline,
            candidate.mode,
            state,
            now,
            now,
            ...fenceArgs,
          ),
      );
    }
    statements.push(
      db
        .prepare(
          `UPDATE provider_freshness_incidents SET state=CASE WHEN deadline_at<=? THEN 'expired' ELSE state END,last_evaluated_at=? WHERE organization_id=? AND family=? AND binding_sha256=? AND state<>'resolved' AND ${fence} AND ${matches}`,
        )
        .bind(now, now, ...binding, ...fenceArgs, candidateJson),
    );
  }
  statements.push(
    db
      .prepare(
        "SELECT COALESCE(SUM(deadline_at>?),0) AS at_risk,COALESCE(SUM(deadline_at<=?),0) AS expired FROM provider_freshness_incidents WHERE state IN ('at_risk','expired')",
      )
      .bind(now, now),
  );
  try {
    const results = await db.batch(statements);
    const aggregate = results.at(-1)?.results[0] as
      { at_risk: number; expired: number } | undefined;
    if (
      !aggregate ||
      !Number.isSafeInteger(aggregate.at_risk) ||
      !Number.isSafeInteger(aggregate.expired)
    )
      throw new Error("FRESHNESS_RECONCILIATION_FAILED");
    const changes = (indexes: number[]) =>
      indexes.reduce(
        (sum, index) => sum + (results[index]?.meta.changes ?? 0),
        0,
      );
    return {
      freshnessAtRisk: aggregate.at_risk,
      freshnessExpired: aggregate.expired,
      freshnessOpened: changes(openedIndexes),
      freshnessResolved: changes(resolvedIndexes),
      freshnessChecksFailed: evaluationIndexes.filter(
        (index) => !results[index]?.meta.changes,
      ).length,
    };
  } catch {
    throw new Error("FRESHNESS_RECONCILIATION_FAILED");
  }
}
