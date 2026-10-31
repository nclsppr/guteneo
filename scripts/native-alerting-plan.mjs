// Local plan only. This is not a Cloudflare API client and has no apply command.
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  privateOperatorPath,
  readPrivateOperatorJson,
} from "./private-operator-files.mjs";

const account = "39ac9fada6cba44d9ecf09d467609e69";
const failureMonitor = "3ca61e73d0764c24888b6a7cf64e6787";
const baselineCodes = [
  "HTTP_SERVER_ERROR",
  "CONFIGURATION_INVALID",
  "INTERNAL_ERROR",
  "QUEUE_FAILED",
  "QUEUE_DEAD_LETTER",
  "DISPATCH_FAILED",
  "SUBMISSION_UNKNOWN",
  "CRON_FAILED",
  "SECURE_PREPARATION_FAILED",
  "OUTBOX_DEFERRED",
];
const baselineCounters = ["failed", "unknown", "uncertain", "deadLetters"];
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
export const nativeFreshnessMonitorQuery = nativeFailureMonitorQuery.replace(
  /\n  \)$/,
  `\n${addition}\n  )`,
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
    evaluation?.intervalSeconds === 60 &&
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
  const alreadyExtended =
    compactSql(query) === compactSql(nativeFreshnessMonitorQuery);
  demand(
    alreadyExtended ||
      compactSql(query) === compactSql(nativeFailureMonitorQuery),
    "NATIVE_ALERT_QUERY_UNEXPECTED",
  );
  const finalParenthesis = query.lastIndexOf(")");
  const proposedQuery = alreadyExtended
    ? query
    : `${query.slice(0, finalParenthesis)}\n${addition}\n${query.slice(finalParenthesis)}`;
  const unchanged = { ...configuration };
  delete unchanged.query;
  const plan = {
    version: 1,
    kind: "existing_native_monitor_freshness_extension",
    status: "plan_only",
    observedAt: snapshot.observedAt,
    preparedAt: now,
    target: { accountId: account, monitorId: failureMonitor },
    changed: !alreadyExtended,
    snapshotSha256: sha(snapshot),
    previousQuerySha256: sha(query),
    unchangedConfigurationSha256: sha(unchanged),
    destinationSha256: sha(notifications.destinations),
    proposedConfigurationSha256: sha({
      ...configuration,
      query: proposedQuery,
    }),
    patch: { query: proposedQuery },
    preserved: {
      enabled: true,
      evaluationIntervalSeconds: 60,
      evaluationWindowSeconds: 60,
      aggregation: "average",
      operator: ">=",
      threshold: 1,
      repeatSeconds: 3600,
      destinationsChanged: false,
      heartbeatMonitorChanged: false,
    },
    qualification:
      "local_plan_requires_current_native_readback_and_authorized_apply",
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
