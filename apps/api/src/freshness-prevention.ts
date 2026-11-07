import {
  freshnessFamilies,
  type FreshnessCandidate,
  type FreshnessEvaluation,
} from "./freshness-alerts";

export const preventionStages = [
  "operator_7d",
  "operator_3d",
  "operator_1d",
  "automatic_48h",
  "automatic_24h",
  "expired",
] as const;
export type PreventionStage = (typeof preventionStages)[number];
export const preventionNotificationStatuses = [
  "pending",
  "sending",
  "sent",
  "unknown",
  "failed",
  "superseded",
] as const;
export interface FreshnessPreventionCounts {
  preventionActive: number;
  preventionOpened: number;
  preventionResolved: number;
  preventionNotificationsQueued: number;
  preventionChecksFailed: number;
}
const DAY = 86_400_000;
const hash = /^[a-f0-9]{64}$/;
const tenant = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
type Row = Record<string, unknown>;
function fail(): never {
  throw new Error("FRESHNESS_PREVENTION_INPUT_INVALID");
}
function stamp(value: unknown): value is string {
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
function selectedStage(
  mode: "automatic" | "operator",
  deadline: string,
  now: string,
): { stage: PreventionStage; rank: number } | null {
  const remaining = Date.parse(deadline) - Date.parse(now);
  if (remaining <= 0) return { stage: "expired", rank: 4 };
  if (remaining <= DAY)
    return {
      stage: mode === "operator" ? "operator_1d" : "automatic_24h",
      rank: 3,
    };
  if (mode === "operator") {
    if (remaining <= 3 * DAY) return { stage: "operator_3d", rank: 2 };
    if (remaining <= 7 * DAY) return { stage: "operator_7d", rank: 1 };
  } else if (remaining <= 2 * DAY) return { stage: "automatic_48h", rank: 2 };
  return null;
}
function normalized(
  evaluations: readonly FreshnessEvaluation[],
  now: string,
): FreshnessEvaluation[] {
  if (!stamp(now) || !Array.isArray(evaluations) || evaluations.length > 50)
    fail();
  const seen = new Set<string>();
  let total = 0;
  return evaluations.map((evaluation) => {
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
      fail();
    const key = JSON.stringify([
      evaluation.organizationId,
      evaluation.family,
      evaluation.bindingSha256,
    ]);
    if (seen.has(key)) fail();
    seen.add(key);
    const revisions = new Set<string>();
    const candidates: FreshnessCandidate[] = evaluation.candidates
      .map((candidate: FreshnessCandidate) => {
        if (
          !candidate ||
          !hash.test(candidate.revisionSha256) ||
          !stamp(candidate.deadline) ||
          !["automatic", "operator"].includes(candidate.mode) ||
          (evaluation.family === "fax_authority" &&
            candidate.mode !== "operator")
        )
          fail();
        const value = {
          revisionSha256: candidate.revisionSha256,
          deadline: candidate.deadline,
          mode: candidate.mode,
        };
        const revision = JSON.stringify(value);
        if (revisions.has(revision)) fail();
        revisions.add(revision);
        if (++total > 100) fail();
        return value;
      })
      .sort((a: FreshnessCandidate, b: FreshnessCandidate) =>
        JSON.stringify(a) < JSON.stringify(b)
          ? -1
          : JSON.stringify(a) > JSON.stringify(b)
            ? 1
            : 0,
      );
    return { ...evaluation, candidates };
  });
}

/** Must follow reconcileFreshnessAlerts at this exact shared evaluation time.
 * Its existing binding fence proves current selection; absent pages, failures
 * and stale snapshots cannot close or reopen preventive work. This changes no
 * authority or business operation and attempts no notification provider call. */
export async function reconcileFreshnessPrevention(
  db: D1Database,
  evaluations: readonly FreshnessEvaluation[],
  now: string,
): Promise<FreshnessPreventionCounts> {
  const values = normalized(evaluations, now);
  const plans = await Promise.all(
    values.map(async (value) => ({
      value,
      evaluationHash: await digest({
        active: value.active,
        candidates: value.candidates,
      }),
      candidates: await Promise.all(
        value.candidates.map(async (candidate) => ({
          candidate,
          stage: selectedStage(candidate.mode, candidate.deadline, now),
          taskHash: await digest({
            version: 1,
            organizationId: value.organizationId,
            family: value.family,
            bindingSha256: value.bindingSha256,
            ...candidate,
          }),
        })),
      ),
    })),
  );
  const due = plans.flatMap((plan) =>
    plan.candidates
      .filter((candidate) => candidate.stage)
      .map((candidate) => ({ plan, ...candidate })),
  );
  try {
    // One bounded read batch determines generation keys. Every following write
    // is fenced again; concurrent re-enablement computes the same generation.
    const previous = due.length
      ? await db.batch<Row>(
          due.map(({ plan, taskHash }) =>
            db
              .prepare(
                "SELECT occurrence,state FROM provider_freshness_prevention_tasks WHERE organization_id=? AND task_sha256=?",
              )
              .bind(plan.value.organizationId, taskHash),
          ),
        )
      : [];
    const occurrences = previous.map((result) => {
      const row = result.results[0] as
        { occurrence: number; state: string } | undefined;
      if (
        row &&
        (!Number.isSafeInteger(row.occurrence) ||
          row.occurrence < 1 ||
          !["active", "resolved"].includes(row.state))
      )
        fail();
      return row ? row.occurrence + (row.state === "resolved" ? 1 : 0) : 1;
    });
    const notificationHashes = await Promise.all(
      due.map(({ plan, taskHash, stage }, index) =>
        digest({
          version: 1,
          organizationId: plan.value.organizationId,
          taskSha256: taskHash,
          occurrence: occurrences[index],
          stage: stage!.stage,
        }),
      ),
    );
    const statements: D1PreparedStatement[] = [];
    const checked: number[] = [],
      resolved: number[] = [],
      queued: number[] = [];
    let candidateIndex = 0;
    for (const plan of plans) {
      const { value, evaluationHash } = plan;
      const binding = [value.organizationId, value.family, value.bindingSha256];
      const fence =
        "EXISTS(SELECT 1 FROM provider_freshness_bindings WHERE organization_id=? AND family=? AND binding_sha256=? AND evaluated_at=? AND evaluation_sha256=?)";
      const fenceArgs = [...binding, now, evaluationHash];
      const matches =
        "EXISTS(SELECT 1 FROM json_each(?) c WHERE json_extract(c.value,'$.revisionSha256')=provider_freshness_prevention_tasks.revision_sha256 AND json_extract(c.value,'$.deadline')=provider_freshness_prevention_tasks.deadline_at AND json_extract(c.value,'$.mode')=provider_freshness_prevention_tasks.renewal_mode)";
      checked.push(statements.length);
      statements.push(
        db
          .prepare(`SELECT CASE WHEN ${fence} THEN 1 ELSE 0 END AS accepted`)
          .bind(...fenceArgs),
      );
      resolved.push(statements.length);
      statements.push(
        db
          .prepare(
            `UPDATE provider_freshness_prevention_tasks SET state='resolved',last_evaluated_at=?,resolved_at=?,resolution=? WHERE organization_id=? AND family=? AND binding_sha256=? AND state='active' AND ${fence} AND NOT ${matches}`,
          )
          .bind(
            now,
            now,
            value.active ? "replaced" : "disabled",
            ...binding,
            ...fenceArgs,
            JSON.stringify(value.candidates),
          ),
      );
      for (const candidatePlan of plan.candidates) {
        if (!candidatePlan.stage) continue;
        const { candidate, stage, taskHash } = candidatePlan;
        const occurrence = occurrences[candidateIndex];
        const notificationHash = notificationHashes[candidateIndex++];
        statements.push(
          db
            .prepare(
              `INSERT INTO provider_freshness_prevention_tasks(organization_id,task_sha256,family,binding_sha256,revision_sha256,deadline_at,renewal_mode,stage,stage_rank,state,occurrence,opened_at,last_evaluated_at) SELECT ?,?,?,?,?,?,?,?,?,'active',1,?,? WHERE ${fence} ON CONFLICT(organization_id,task_sha256) DO UPDATE SET stage=CASE WHEN state='resolved' OR excluded.stage_rank>stage_rank THEN excluded.stage ELSE stage END,stage_rank=CASE WHEN state='resolved' THEN excluded.stage_rank ELSE max(stage_rank,excluded.stage_rank) END,occurrence=CASE WHEN state='resolved' THEN occurrence+1 ELSE occurrence END,state='active',last_evaluated_at=excluded.last_evaluated_at,resolved_at=NULL,resolution=NULL WHERE last_evaluated_at<=excluded.last_evaluated_at`,
            )
            .bind(
              value.organizationId,
              taskHash,
              value.family,
              value.bindingSha256,
              candidate.revisionSha256,
              candidate.deadline,
              candidate.mode,
              stage.stage,
              stage.rank,
              now,
              now,
              ...fenceArgs,
            ),
        );
        queued.push(statements.length);
        statements.push(
          db
            .prepare(
              `INSERT INTO provider_freshness_prevention_notifications(organization_id,notification_sha256,task_sha256,occurrence,stage,status,created_at,updated_at) SELECT organization_id,?,task_sha256,occurrence,stage,'pending',?,? FROM provider_freshness_prevention_tasks WHERE organization_id=? AND task_sha256=? AND state='active' AND stage=? AND occurrence=? AND ${fence} ON CONFLICT(organization_id,notification_sha256) DO NOTHING`,
            )
            .bind(
              notificationHash,
              now,
              now,
              value.organizationId,
              taskHash,
              stage.stage,
              occurrence,
              ...fenceArgs,
            ),
        );
      }
      statements.push(
        db
          .prepare(
            `UPDATE provider_freshness_prevention_notifications SET status='superseded',updated_at=?,finished_at=? WHERE status='pending' AND organization_id=? AND ${fence} AND EXISTS(SELECT 1 FROM provider_freshness_prevention_tasks t WHERE t.organization_id=provider_freshness_prevention_notifications.organization_id AND t.task_sha256=provider_freshness_prevention_notifications.task_sha256 AND t.family=? AND t.binding_sha256=? AND (t.state='resolved' OR t.occurrence<>provider_freshness_prevention_notifications.occurrence OR t.stage<>provider_freshness_prevention_notifications.stage))`,
          )
          .bind(
            now,
            now,
            value.organizationId,
            ...fenceArgs,
            value.family,
            value.bindingSha256,
          ),
      );
    }
    statements.push(
      db.prepare(
        "SELECT COUNT(*) AS active FROM provider_freshness_prevention_tasks WHERE state='active'",
      ),
    );
    const results = await db.batch<Row>(statements);
    const active = results.at(-1)?.results[0]?.active;
    if (!Number.isSafeInteger(active) || Number(active) < 0)
      throw new Error("FRESHNESS_PREVENTION_RECONCILIATION_FAILED");
    const changes = (indexes: number[]) =>
      indexes.reduce(
        (sum, index) => sum + (results[index]?.meta.changes ?? 0),
        0,
      );
    const opened = changes(queued);
    return {
      preventionActive: Number(active),
      preventionOpened: opened,
      preventionResolved: changes(resolved),
      preventionNotificationsQueued: opened,
      preventionChecksFailed: checked.filter(
        (index) => results[index]?.results[0]?.accepted !== 1,
      ).length,
    };
  } catch {
    throw new Error("FRESHNESS_PREVENTION_RECONCILIATION_FAILED");
  }
}

/** Existing private operator authorization belongs to the caller. Return only
 * bounded closed operational metadata, never tenant/binding IDs or sources. */
export async function readPrivatePreventionReport(db: D1Database) {
  try {
    const [totals, groups, notifications] = await db.batch<Row>([
      db.prepare(
        "SELECT COUNT(*) AS active FROM provider_freshness_prevention_tasks WHERE state='active'",
      ),
      db.prepare(
        "SELECT family,renewal_mode AS mode,stage,deadline_at AS deadline,COUNT(*) AS count FROM provider_freshness_prevention_tasks WHERE state='active' GROUP BY family,renewal_mode,stage,deadline_at ORDER BY deadline_at,family,renewal_mode,stage LIMIT 26",
      ),
      db.prepare(
        "SELECT status,COUNT(*) AS count FROM provider_freshness_prevention_notifications GROUP BY status LIMIT 6",
      ),
    ]);
    const activeTasks = totals.results[0]?.active;
    if (!Number.isSafeInteger(activeTasks) || Number(activeTasks) < 0) fail();
    const actions = groups.results.slice(0, 25).map((row) => {
      if (
        !freshnessFamilies.includes(row.family as never) ||
        !["automatic", "operator"].includes(String(row.mode)) ||
        !preventionStages.includes(row.stage as never) ||
        !stamp(row.deadline) ||
        !Number.isSafeInteger(row.count) ||
        Number(row.count) < 1
      )
        fail();
      return {
        family: String(row.family),
        mode: String(row.mode),
        stage: String(row.stage),
        action:
          row.mode === "automatic"
            ? "repair_automatic_renewal"
            : row.family === "fax_authority"
              ? "renew_or_retire_authority"
              : "review_manual_policy",
        deadline: String(row.deadline),
        count: Number(row.count),
      };
    });
    const counts = new Map(
      notifications.results.map((row) => {
        if (
          !preventionNotificationStatuses.includes(row.status as never) ||
          !Number.isSafeInteger(row.count) ||
          Number(row.count) < 0
        )
          fail();
        return [String(row.status), Number(row.count)] as const;
      }),
    );
    return {
      version: 1 as const,
      qualification: "private_operational_prevention_only" as const,
      activeTasks: Number(activeTasks),
      notifications: preventionNotificationStatuses.map((status) => ({
        status,
        count: counts.get(status) ?? 0,
      })),
      actions,
      truncated: groups.results.length > 25,
    };
  } catch {
    throw new Error("FRESHNESS_PREVENTION_REPORT_FAILED");
  }
}
