// Local plan only. This is not a Cloudflare API client and has no apply command.
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import nativeAlertSignals from "../packages/observability/native-alert-signals.json" with { type: "json" };
import {
  privateOperatorPath,
  readPrivateOperatorJson,
} from "./private-operator-files.mjs";

const account = "39ac9fada6cba44d9ecf09d467609e69";
const failureMonitor = "3ca61e73d0764c24888b6a7cf64e6787";
const baselineCodes = nativeAlertSignals.codes;
const baselineCounters = nativeAlertSignals.counters;
export const nativeFailureMonitorQuery = `SELECT COUNT(*) AS value
FROM logs.workersLogs
WHERE accountTag = '${account}'
  AND scriptName = 'guteneo-app'
  AND (
${[
  ...baselineCodes.map((code) => `attributes['code'] = '${code}'`),
  ...baselineCounters.map((counter) => `attributes['${counter}'] > 0`),
]
  .map((condition, index) => `    ${index ? "OR " : ""}${condition}`)
  .join("\n")}
  )`;
const addition = ["FRESHNESS_AT_RISK", "FRESHNESS_CHECK_FAILED"]
  .map((code) => `    OR attributes['code'] = '${code}'`)
  .join("\n");
export const legacyNativeFreshnessMonitorQuery =
  nativeFailureMonitorQuery.replace(/\n  \)$/, `\n${addition}\n  )`);
// Exact, historically reread native-editor forms. Their implicit account scope
// is accepted only with the explicit authenticated-route evidence below. Do not
// normalize arbitrary quoted SQL or infer scope from a missing account filter.
const nativeUiPredicates = [
  ...baselineCodes.map((code) => `("attributes"['code'] = '${code}')`),
  ...baselineCounters.map((counter) => `("attributes"['${counter}'] > 0)`),
];
export const nativeUiFailureMonitorQuery = `SELECT COUNT(*) AS "value"
FROM "logs"."workersLogs"
WHERE (("scriptName" = 'guteneo-app') AND (${nativeUiPredicates.join(" OR ")}))`;
export const nativeUiLegacyFreshnessMonitorQuery =
  `${nativeUiFailureMonitorQuery.slice(0, -2)} OR ` +
  ["FRESHNESS_AT_RISK", "FRESHNESS_CHECK_FAILED"]
    .map((code) => `("attributes"['code'] = '${code}')`)
    .join(" OR ") +
  "))";
// Native Logs SQL permits JSON only as direct comparisons or aggregate inputs.
// The application derives the paired class/failure markers after projection.
// Class 1 preserves original failures; classes 2/3 cover healthy/failed freshness.
// Legacy logs have neither marker and cannot establish healthy coverage.
// Workers Logs numeric JSON aggregates return Float64; the empty branch must
// use the same native type or validation rejects the conditional expression.
export const nativeFreshnessMonitorQuery = `SELECT if(COUNT(*) = 0, 1.0,
  SUM(attributes['alertFailure'])) AS value
FROM logs.workersLogs
WHERE accountTag = '${account}'
  AND scriptName = 'guteneo-app'
  AND attributes['alertClass'] >= 1`;
const canonical = (value) =>
  value === null || typeof value !== "object"
    ? JSON.stringify(value)
    : Array.isArray(value)
      ? `[${value.map(canonical).join(",")}]`
      : `{${Object.keys(value)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
          .join(",")}}`;
const sha = (value) =>
  createHash("sha256").update(canonical(value)).digest("hex");
const demand = (condition, code) => {
  if (!condition) throw new Error(code);
};
const validStamp = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
/** Ignore formatting only outside SQL string literals, never change a value. */
const compactSql = (query) => {
  let quoted = false;
  let result = "";
  for (const character of query) {
    if (character === "'") quoted = !quoted;
    if (quoted || !/\s/.test(character)) result += character;
  }
  return result;
};
export const nativeAlertingPlanDigest = (plan) => sha(plan);

/** Input is an operator-normalized, freshly reread existing monitor snapshot,
 * not an invented native API representation. Retain its complete normalized
 * configuration, including extra properties, so the plan binds all settings.
 * Neither its destinations nor their values enter the result or stdout. */
export function planNativeFreshnessAlerting(
  snapshot,
  now = new Date().toISOString(),
) {
  demand(
    snapshot?.version === 1 &&
      snapshot.accountId === account &&
      snapshot.monitorId === failureMonitor &&
      validStamp(snapshot.observedAt) &&
      validStamp(now),
    "NATIVE_ALERT_SNAPSHOT_INVALID",
  );
  const age = Date.parse(now) - Date.parse(snapshot.observedAt);
  demand(age >= 0 && age <= 900_000, "NATIVE_ALERT_SNAPSHOT_STALE");
  const configuration = snapshot.configuration;
  demand(
    configuration &&
      configuration.enabled === true &&
      typeof configuration.query === "string" &&
      configuration.query.length <= 16_384,
    "NATIVE_ALERT_CONFIGURATION_UNEXPECTED",
  );
  const { evaluation, notifications } = configuration;
  demand(
    (evaluation?.intervalSeconds === 60 ||
      evaluation?.intervalSeconds === 300) &&
      evaluation.windowSeconds === 60 &&
      evaluation.aggregation === "average" &&
      evaluation.operator === ">=" &&
      evaluation.threshold === 1 &&
      notifications?.repeatSeconds === 3600 &&
      Array.isArray(notifications.destinations) &&
      notifications.destinations.length === 1 &&
      notifications.destinations[0]?.type === "email" &&
      Array.isArray(notifications.destinations[0]?.recipients) &&
      notifications.destinations[0].recipients.length === 1 &&
      typeof notifications.destinations[0].recipients[0] === "string" &&
      /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(
        notifications.destinations[0].recipients[0],
      ),
    "NATIVE_ALERT_CONFIGURATION_UNEXPECTED",
  );
  const query = configuration.query;
  const knownNativeUiQuery =
    query === nativeUiFailureMonitorQuery ||
    query === nativeUiLegacyFreshnessMonitorQuery;
  if (knownNativeUiQuery) {
    const scope = configuration.datasetScope;
    demand(
      scope &&
        Object.keys(scope).sort().join(",") === "accountId,dataset,evidence" &&
        scope.accountId === account &&
        scope.dataset === "logs.workersLogs" &&
        scope.evidence === "authenticated_monitor_edit_route",
      "NATIVE_ALERT_DATASET_SCOPE_UNVERIFIED",
    );
  }
  const alreadyStabilized =
    compactSql(query) === compactSql(nativeFreshnessMonitorQuery);
  const knownAutomaticQuery =
    compactSql(query) === compactSql(nativeFailureMonitorQuery) ||
    compactSql(query) === compactSql(legacyNativeFreshnessMonitorQuery) ||
    knownNativeUiQuery;
  demand(
    configuration.timeRangeMode === "automatic" &&
      ((alreadyStabilized && evaluation.intervalSeconds === 300) ||
        (knownAutomaticQuery && evaluation.intervalSeconds === 60)),
    "NATIVE_ALERT_QUERY_OR_TIME_RANGE_UNEXPECTED",
  );
  const proposedQuery = alreadyStabilized ? query : nativeFreshnessMonitorQuery;
  const unchanged = { ...configuration };
  delete unchanged.query;
  unchanged.evaluation = { ...evaluation };
  delete unchanged.evaluation.intervalSeconds;
  const proposedEvaluation = { ...evaluation, intervalSeconds: 300 };
  const plan = {
    version: 3,
    kind: "existing_native_monitor_freshness_stabilization",
    status: "plan_only",
    observedAt: snapshot.observedAt,
    preparedAt: now,
    target: { accountId: account, monitorId: failureMonitor },
    changed: !alreadyStabilized,
    snapshotSha256: sha(snapshot),
    previousQuerySha256: sha(query),
    previousQueryTextSha256: createHash("sha256").update(query).digest("hex"),
    unchangedConfigurationSha256: sha(unchanged),
    destinationSha256: sha(notifications.destinations),
    proposedConfigurationSha256: sha({
      ...configuration,
      query: proposedQuery,
      evaluation: proposedEvaluation,
      timeRangeMode: "automatic",
    }),
    patch: {
      query: proposedQuery,
      evaluation: proposedEvaluation,
      timeRangeMode: "automatic",
    },
    signal: {
      originalFailureLookbackSeconds: 300,
      freshnessLookbackSeconds: 300,
      evaluationIntervalSeconds: 300,
      timeRangeSource: "automatic_execution_interval",
      missingQualifiedFreshness: "alarm",
      recovery: "qualified_healthy_observation_and_no_recent_failure",
    },
    preserved: {
      enabled: true,
      evaluationWindowSeconds: 60,
      aggregation: "average",
      operator: ">=",
      threshold: 1,
      repeatSeconds: 3600,
      destinationsChanged: false,
      heartbeatMonitorChanged: false,
    },
    qualification:
      "local_plan_requires_native_sql_validation_current_readback_and_authorized_apply",
  };
  return plan;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const args = process.argv.slice(2);
    demand(args.length === 2, "NATIVE_ALERT_PLAN_USAGE");
    const snapshot = await readPrivateOperatorJson(
      args[0],
      "NATIVE_ALERT",
      131_072,
    );
    const plan = planNativeFreshnessAlerting(snapshot);
    const output = await privateOperatorPath(args[1], "NATIVE_ALERT");
    await writeFile(output, JSON.stringify(plan, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    console.log(
      JSON.stringify({
        status: "plan_only",
        changed: plan.changed,
        planSha256: nativeAlertingPlanDigest(plan),
      }),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        status: "failed",
        code: /^NATIVE_ALERT_[A-Z_]+$/.test(error.message)
          ? error.message
          : "NATIVE_ALERT_PLAN_UNAVAILABLE",
      }),
    );
    process.exitCode = 1;
  }
}
