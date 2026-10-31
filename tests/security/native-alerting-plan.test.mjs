import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, chmod, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  nativeFailureMonitorQuery,
  nativeFreshnessMonitorQuery,
  legacyNativeFreshnessMonitorQuery,
  nativeAlertingPlanDigest,
  planNativeFreshnessAlerting,
} from "../../scripts/native-alerting-plan.mjs";

const at = "2026-10-30T10:00:00.000Z";
const snapshot = () => ({
  version: 1,
  observedAt: at,
  accountId: "39ac9fada6cba44d9ecf09d467609e69",
  monitorId: "3ca61e73d0764c24888b6a7cf64e6787",
  configuration: {
    enabled: true,
    query: nativeFailureMonitorQuery,
    timeRangeMode: "automatic",
    evaluation: {
      intervalSeconds: 60,
      windowSeconds: 60,
      aggregation: "average",
      operator: ">=",
      threshold: 1,
    },
    notifications: {
      repeatSeconds: 3600,
      destinations: [
        { type: "email", recipients: ["synthetic@example.invalid"] },
      ],
    },
    unchangedNativeSetting: { nested: "retained synthetic setting" },
  },
});
test("stabilizes only the query and its explicit time-range mode, preserving original controls", () => {
  const original = snapshot();
  const before = structuredClone(original);
  const plan = planNativeFreshnessAlerting(original, at);
  assert.equal(plan.changed, true);
  assert.deepEqual(original, before);
  assert.deepEqual(Object.keys(plan.patch), ["query", "timeRangeMode"]);
  assert.equal(plan.patch.timeRangeMode, "manual");
  for (const line of nativeFailureMonitorQuery
    .split("\n")
    .filter((value) => value.includes("attributes[")))
    assert.ok(plan.patch.query.includes(line.trim().replace(/^OR /, "")));
  assert.ok(
    plan.patch.query.includes("attributes['code'] = 'FRESHNESS_AT_RISK'"),
  );
  assert.ok(
    plan.patch.query.includes("attributes['code'] = 'FRESHNESS_CHECK_FAILED'"),
  );
  assert.equal(plan.patch.query.match(/accountTag/g)?.length, 1);
  assert.equal(plan.patch.query.match(/scriptName/g)?.length, 1);
  assert.ok(
    plan.patch.query.includes("timestamp >= NOW() - INTERVAL '1' MINUTE"),
  );
  assert.ok(
    plan.patch.query.includes("timestamp >= NOW() - INTERVAL '5' MINUTE"),
  );
  assert.equal(plan.signal.missingQualifiedFreshness, "alarm");
  assert.equal(plan.preserved.repeatSeconds, 3600);
  assert.equal(plan.preserved.destinationsChanged, false);
  assert.equal(plan.preserved.heartbeatMonitorChanged, false);
  assert.equal(
    JSON.stringify(plan).includes("synthetic@example.invalid"),
    false,
  );
  assert.equal(
    JSON.stringify(plan).includes("retained synthetic setting"),
    false,
  );
});
test("migrates the actually deployed automatic extension and is idempotent only in manual mode", () => {
  const legacy = snapshot();
  legacy.configuration.query = legacyNativeFreshnessMonitorQuery;
  assert.equal(planNativeFreshnessAlerting(legacy, at).changed, true);
  const input = snapshot();
  input.configuration.query = nativeFreshnessMonitorQuery;
  input.configuration.timeRangeMode = "manual";
  const plan = planNativeFreshnessAlerting(input, at);
  assert.equal(plan.changed, false);
  assert.equal(plan.patch.query, nativeFreshnessMonitorQuery);
});
test("allows query formatting without changing values inside quoted literals", () => {
  const input = snapshot();
  input.configuration.query = input.configuration.query.replace(/\n/g, " \t ");
  assert.equal(planNativeFreshnessAlerting(input, at).changed, true);
  input.configuration.query = nativeFailureMonitorQuery.replace(
    "HTTP_SERVER_ERROR",
    "HTTP_ SERVER_ERROR",
  );
  assert.throws(
    () => planNativeFreshnessAlerting(input, at),
    /NATIVE_ALERT_QUERY_OR_TIME_RANGE_UNEXPECTED/,
  );
});
test("refuses unexpected filters, missing old conditions or an altered threshold", () => {
  for (const alter of [
    (input) => {
      input.configuration.query = nativeFailureMonitorQuery.replace(
        "scriptName = 'guteneo-app'",
        "scriptName = 'another-worker'",
      );
    },
    (input) => {
      input.configuration.query = nativeFailureMonitorQuery.replace(
        "OR attributes['unknown'] > 0",
        "",
      );
    },
    ...[
      ["intervalSeconds", 300],
      ["windowSeconds", 300],
      ["aggregation", "sum"],
      ["operator", ">"],
      ["threshold", 2],
    ].map(([field, value]) => (input) => {
      input.configuration.evaluation[field] = value;
    }),
    (input) => {
      input.configuration.enabled = false;
    },
    (input) => {
      input.configuration.notifications.repeatSeconds = 60;
    },
    (input) => {
      input.monitorId = "other-monitor";
    },
    (input) => {
      delete input.configuration.timeRangeMode;
    },
    (input) => {
      input.configuration.timeRangeMode = "manual";
    },
    (input) => {
      input.configuration.query = nativeFreshnessMonitorQuery;
    },
    (input) => {
      input.configuration.query = nativeFreshnessMonitorQuery.replace(
        "INTERVAL '1' MINUTE",
        "INTERVAL '5' MINUTE",
      );
      input.configuration.timeRangeMode = "manual";
    },
  ]) {
    const input = snapshot();
    alter(input);
    assert.throws(
      () => planNativeFreshnessAlerting(input, at),
      /NATIVE_ALERT_/,
    );
  }
});
test("binds all preserved native settings and destinations into the reviewed digest", () => {
  const original = snapshot();
  const first = planNativeFreshnessAlerting(original, at);
  original.configuration.unchangedNativeSetting.nested = "changed";
  const second = planNativeFreshnessAlerting(original, at);
  assert.notEqual(first.snapshotSha256, second.snapshotSha256);
  assert.notEqual(
    first.unchangedConfigurationSha256,
    second.unchangedConfigurationSha256,
  );
  assert.notEqual(
    nativeAlertingPlanDigest(first),
    nativeAlertingPlanDigest(second),
  );
  original.configuration.notifications.destinations[0].recipients = [
    "another@example.invalid",
  ];
  assert.notEqual(
    second.destinationSha256,
    planNativeFreshnessAlerting(original, at).destinationSha256,
  );
});
test("requires a freshly reread snapshot, never treats old source documentation as live state", () => {
  assert.throws(
    () => planNativeFreshnessAlerting(snapshot(), "2026-10-30T10:15:00.001Z"),
    /NATIVE_ALERT_SNAPSHOT_STALE/,
  );
  assert.throws(
    () => planNativeFreshnessAlerting(snapshot(), "2026-10-30T09:59:59.999Z"),
    /NATIVE_ALERT_SNAPSHOT_STALE/,
  );
  assert.doesNotThrow(() =>
    planNativeFreshnessAlerting(snapshot(), "2026-10-30T10:15:00.000Z"),
  );
});
test("CLI keeps material outside Git, refuses apply and never prints recipients", async () => {
  const directory = await mkdtemp(join(tmpdir(), "guteneo-native-alert-plan-"));
  await chmod(directory, 0o700);
  try {
    const input = snapshot();
    input.observedAt = new Date().toISOString();
    const path = join(directory, "snapshot.json"),
      output = join(directory, "plan.json");
    await writeFile(path, JSON.stringify(input), { mode: 0o600 });
    const cli = new URL(
      "../../scripts/native-alerting-plan.mjs",
      import.meta.url,
    );
    const result = spawnSync(process.execPath, [cli.pathname, path, output], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, "plan_only");
    assert.equal(result.stdout.includes("synthetic@example.invalid"), false);
    assert.equal(result.stderr.includes("synthetic@example.invalid"), false);
    const plan = JSON.parse(await readFile(output, "utf8"));
    assert.equal(
      plan.qualification,
      "local_plan_requires_native_sql_validation_current_readback_and_authorized_apply",
    );
    const denied = spawnSync(
      process.execPath,
      [cli.pathname, "apply", path, output],
      { encoding: "utf8" },
    );
    assert.notEqual(denied.status, 0);
    assert.equal(JSON.parse(denied.stderr).code, "NATIVE_ALERT_PLAN_USAGE");
    const repeat = spawnSync(process.execPath, [cli.pathname, path, output], {
      encoding: "utf8",
    });
    assert.notEqual(repeat.status, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

// Execute the exact planned expression against SQLite fixtures, translating only
// the dataset, JSON accessor and relative-time syntax. This is semantic evidence,
// not qualification of Cloudflare's SQL validator, ingestion or notifications.
const nowMs = Date.parse(at);
const freshnessRecord = (ageSeconds = 0, attributes = {}) => ({
  timestamp: nowMs - ageSeconds * 1000,
  accountTag: snapshot().accountId,
  scriptName: "guteneo-app",
  attributes: {
    event: "freshness",
    route: "maintenance",
    stage: "freshness",
    code: "OK",
    freshnessAtRisk: 0,
    freshnessExpired: 0,
    freshnessChecksFailed: 0,
    ...attributes,
  },
});
function queryValue(rows, sql = nativeFreshnessMonitorQuery) {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      "CREATE TABLE worker_logs(timestamp INTEGER, accountTag TEXT, scriptName TEXT, attributes TEXT)",
    );
    const insert = db.prepare("INSERT INTO worker_logs VALUES (?,?,?,?)");
    for (const row of rows)
      insert.run(
        row.timestamp,
        row.accountTag,
        row.scriptName,
        JSON.stringify(row.attributes),
      );
    const executable = sql
      .replace("FROM logs.workersLogs", "FROM worker_logs")
      .replace(
        /attributes\['([A-Za-z]+)'\]/g,
        (_, key) => `json_extract(attributes, '$.${key}')`,
      )
      .replace(/NOW\(\) - INTERVAL '([15])' MINUTE/g, (_, minutes) =>
        String(nowMs - Number(minutes) * 60_000),
      );
    assert.equal(/NOW\(|INTERVAL|attributes\[/.test(executable), false);
    return db.prepare(executable).get().value;
  } finally {
    db.close();
  }
}

test("all historic codes and counters retain their exact inclusive one-minute event window", () => {
  const codes = [
    ...nativeFailureMonitorQuery.matchAll(/attributes\['code'\] = '([^']+)'/g),
  ].map((match) => match[1]);
  const counters = [
    ...nativeFailureMonitorQuery.matchAll(/attributes\['([^']+)'\] > 0/g),
  ].map((match) => match[1]);
  assert.equal(codes.length, 10);
  assert.equal(counters.length, 4);
  for (const attributes of [
    ...codes.map((code) => ({ code })),
    ...counters.map((counter) => ({ [counter]: 1 })),
  ]) {
    for (const age of [59.999, 60, 60.001, 90, 300, 300.001]) {
      const record = freshnessRecord(age, {
        event: "http",
        route: "dispatch",
        stage: undefined,
        code: "OK",
        ...attributes,
      });
      const rows = [freshnessRecord(), record];
      const previous = queryValue(
        rows,
        `${nativeFailureMonitorQuery}\n  AND timestamp >= NOW() - INTERVAL '1' MINUTE`,
      );
      assert.equal(previous, age <= 60 ? 1 : 0);
      assert.equal(
        queryValue(rows),
        previous,
        JSON.stringify({ attributes, age }),
      );
    }
  }
});

test("persistent freshness risk survives missing log windows without false recovery", () => {
  for (const minutes of [1, 2, 3, 4, 5, 6, 20]) {
    const staleWarning = freshnessRecord(minutes * 60, {
      code: "FRESHNESS_CHECK_FAILED",
      freshnessExpired: 14,
      freshnessChecksFailed: 1,
    });
    const cron = freshnessRecord(0, {
      event: "cron",
      stage: "complete",
      code: "OK",
    });
    assert.ok(queryValue([staleWarning, cron]) >= 1, `gap ${minutes} min`);
  }
});

test("explicit healthy coverage permits recovery only after freshness failures age out", () => {
  for (const code of ["FRESHNESS_AT_RISK", "FRESHNESS_CHECK_FAILED"]) {
    for (const age of [60, 240, 300])
      assert.ok(
        queryValue([freshnessRecord(age, { code }), freshnessRecord()]) >= 1,
      );
    assert.equal(
      queryValue([freshnessRecord(300.001, { code }), freshnessRecord()]),
      0,
    );
  }
  assert.equal(queryValue([freshnessRecord(300)]), 0);
  assert.equal(queryValue([freshnessRecord(300.001)]), 1);
  assert.equal(queryValue([]), 1);
});

test("successful ordinary logs and incomplete or unknown freshness data never establish healthy coverage", () => {
  const invalid = [
    { event: "http", stage: undefined },
    { event: "cron", stage: "complete" },
    { code: "UNKNOWN_FRESHNESS" },
    { stage: undefined },
    { route: undefined },
    { freshnessExpired: undefined },
    { freshnessChecksFailed: undefined },
    { freshnessAtRisk: undefined },
    { freshnessExpired: "0" },
    { freshnessExpired: -1 },
    { freshnessExpired: 1 },
  ];
  for (const attributes of invalid) {
    const record = freshnessRecord(0, attributes);
    assert.ok(queryValue([record]) >= 1, JSON.stringify(attributes));
    if (record.attributes.event === "freshness")
      assert.ok(
        queryValue([freshnessRecord(240), record]) >= 1,
        `old OK must not mask invalid ${JSON.stringify(attributes)}`,
      );
  }
});

test("global account and worker filters enclose every failure and coverage branch", () => {
  for (const attributes of [
    { code: "FRESHNESS_AT_RISK" },
    { code: "CRON_FAILED" },
    { event: "freshness", code: "UNKNOWN" },
  ])
    for (const scope of [{ accountTag: "foreign" }, { scriptName: "foreign" }])
      assert.equal(
        queryValue([
          freshnessRecord(),
          { ...freshnessRecord(0, attributes), ...scope },
        ]),
        0,
      );
  for (const scope of [{ accountTag: "foreign" }, { scriptName: "foreign" }])
    assert.equal(
      queryValue([{ ...freshnessRecord(), ...scope }]),
      1,
      "foreign healthy data cannot clear missing local coverage",
    );
});
