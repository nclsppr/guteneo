// Local plan only. This is not a Cloudflare API client and has no apply command.
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import nativeAlertSignals from "../packages/observability/native-alert-signals.json" with { type: "json" };
import nativeAlertNames from "../packages/observability/locales/native-alerts.fr.json" with { type: "json" };
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
// A persistent operator deadline must not hide a new collector/provider fault.
// These counters are already projected by the deployed maintenance observation.
const technicalMaintenanceFailureCounters = [
  "freshnessChecksFailed",
  "tariffRefreshFailed",
  "postalPolicyRefreshFailed",
  "resendPolicyRefreshFailed",
];
export const nativeSeparatedTechnicalMonitorQuery =
  nativeFailureMonitorQuery.replace(
    /\n  \)$/,
    `\n    OR attributes['code'] = 'FRESHNESS_CHECK_FAILED'\n${technicalMaintenanceFailureCounters
      .map((counter) => `    OR attributes['${counter}'] > 0`)
      .join("\n")}\n  )`,
  );
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
export const nativeUiCurrentFreshnessMonitorQuery =
  'SELECT if((COUNT(*) = 0), 1.0, SUM("attributes"[\'alertFailure\'])) AS "value" FROM "logs"."workersLogs" WHERE (("scriptName" = \'guteneo-app\') AND ("attributes"[\'alertClass\'] >= 1))';
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
// A separate monitor cannot use ordinary technical errors as freshness coverage.
export const nativeSeparatedFreshnessMonitorQuery =
  nativeFreshnessMonitorQuery.replace(
    "attributes['alertClass'] >= 1",
    "attributes['alertClass'] >= 2",
  );
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
    query === nativeUiLegacyFreshnessMonitorQuery ||
    query === nativeUiCurrentFreshnessMonitorQuery;
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
    compactSql(query) === compactSql(nativeFreshnessMonitorQuery) ||
    query === nativeUiCurrentFreshnessMonitorQuery;
  const knownAutomaticQuery =
    compactSql(query) === compactSql(nativeFailureMonitorQuery) ||
    compactSql(query) === compactSql(legacyNativeFreshnessMonitorQuery) ||
    query === nativeUiFailureMonitorQuery ||
    query === nativeUiLegacyFreshnessMonitorQuery;
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

/** Review-only separation of technical failures from operational deadlines.
 * The old planner and CLI remain compatible. No identifier is invented for a
 * second monitor, and this plan cannot authorize creation or patch application.
 * Native inventory, SQL validation and saved-state verification are mandatory
 * before removing freshness coverage from the existing aggregate monitor. */
export function planNativeAlertSeparation(
  snapshot,
  now = new Date().toISOString(),
) {
  const validated = planNativeFreshnessAlerting(snapshot, now);
  const configuration = snapshot.configuration;
  const evaluation = { ...configuration.evaluation, intervalSeconds: 300 };
  const destinationSha256 = validated.destinationSha256;
  const freshnessRepeatSeconds = 168 * 60 * 60;
  const technicalPatch = {
    query: nativeSeparatedTechnicalMonitorQuery,
    evaluation,
    timeRangeMode: "automatic",
  };
  const freshnessPatch = {
    query: nativeSeparatedFreshnessMonitorQuery,
    evaluation,
    timeRangeMode: "automatic",
    notifications: { repeatSeconds: freshnessRepeatSeconds },
  };
  return {
    version: 1,
    kind: "native_monitor_technical_freshness_separation",
    status: "plan_only",
    observedAt: snapshot.observedAt,
    preparedAt: now,
    snapshotSha256: validated.snapshotSha256,
    originalConfigurationSha256: sha(configuration),
    destinationSha256,
    target: validated.target,
    technicalMonitor: {
      target: validated.target,
      patch: technicalPatch,
      expectedConfigurationSha256: sha({
        ...configuration,
        ...technicalPatch,
      }),
      destinationSha256,
      repeatSeconds: configuration.notifications.repeatSeconds,
    },
    freshnessMonitor: {
      target: { accountId: account, monitorId: null },
      binding: "unbound_requires_current_native_inventory_and_readback",
      proposedName: nativeAlertNames.deadline,
      patch: freshnessPatch,
      expectedConfigurationSha256: sha({
        ...configuration,
        ...freshnessPatch,
        notifications: {
          ...configuration.notifications,
          repeatSeconds: freshnessRepeatSeconds,
        },
      }),
      destinationSha256,
      copyUnchangedConfigurationFrom: {
        snapshotSha256: validated.snapshotSha256,
        accountId: account,
        monitorId: failureMonitor,
      },
      reminder: {
        repeatSeconds: freshnessRepeatSeconds,
        mode: "maximum_documented_interval",
        disabled: false,
      },
    },
    steps: [
      {
        id: "inspect_native_inventory",
        requires: [],
        action: "reread_complete_account_monitor_inventory",
        maximumReadbackAgeSeconds: 900,
        reuse: "exactly_one_matching_freshness_monitor_only",
        create: "only_after_verified_zero_matching_monitors",
        refuse:
          "incomplete_inventory_multiple_matches_or_unknown_configuration",
      },
      {
        id: "verify_separate_freshness_monitor",
        requires: ["inspect_native_inventory"],
        action:
          "validate_sql_then_save_or_reuse_and_reread_exact_configuration",
        requireEnabled: true,
        destinationSha256,
        requireCompleteEvaluationLookbackSeconds: 300,
        requireExpectedAlarmAndHealthyCoverageSemantics: true,
        recordActualMonitorIdFromNativeReadback: true,
        existingAggregateMonitorChanged: false,
      },
      {
        id: "restore_technical_monitor",
        requires: ["verify_separate_freshness_monitor"],
        action:
          "reread_unchanged_original_configuration_then_validate_and_apply_technical_patch",
        maximumReadbackAgeSeconds: 900,
        requireConfigurationSha256: sha(configuration),
        refuseIfSeparateFreshnessMonitorUnverified: true,
      },
      {
        id: "verify_both_monitors",
        requires: ["restore_technical_monitor"],
        action: "reread_both_saved_configurations_and_evaluations",
        destinationSha256,
        requireIndependentTechnicalFailureSignal: true,
      },
    ],
    signal: {
      technicalFailureLookbackSeconds: 300,
      freshnessLookbackSeconds: 300,
      evaluationIntervalSeconds: 300,
      timeRangeSource: "automatic_execution_interval",
      missingQualifiedFreshness: "alarm",
      freshnessRecovery:
        "qualified_healthy_observation_and_no_recent_freshness_failure",
      technicalRecovery: "no_recent_original_or_maintenance_failure",
      technicalMaintenanceFailureCodes: ["FRESHNESS_CHECK_FAILED"],
      technicalMaintenanceFailureCounters,
    },
    preserved: {
      enabled: true,
      evaluationWindowSeconds: configuration.evaluation.windowSeconds,
      aggregation: configuration.evaluation.aggregation,
      operator: configuration.evaluation.operator,
      threshold: configuration.evaluation.threshold,
      technicalRepeatSeconds: configuration.notifications.repeatSeconds,
      destinationsChanged: false,
      heartbeatMonitorChanged: false,
      runtimeChanged: false,
      providerAuthorityChanged: false,
    },
    qualification:
      "plan_only_requires_current_inventory_native_validation_sequential_verification_and_authorized_apply",
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const args = process.argv.slice(2);
    const separate = args[0] === "--separate";
    demand(
      separate ? args.length === 3 : args.length === 2,
      "NATIVE_ALERT_PLAN_USAGE",
    );
    const [inputPath, outputPath] = separate ? args.slice(1) : args;
    const snapshot = await readPrivateOperatorJson(
      inputPath,
      "NATIVE_ALERT",
      131_072,
    );
    // Two arguments retain the historical stabilization planner. New separation
    // plans are explicit, so existing maintenance cannot silently change scope.
    const plan = separate
      ? planNativeAlertSeparation(snapshot)
      : planNativeFreshnessAlerting(snapshot);
    const output = await privateOperatorPath(outputPath, "NATIVE_ALERT");
    await writeFile(output, JSON.stringify(plan, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    console.log(
      JSON.stringify({
        status: "plan_only",
        kind: plan.kind,
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
