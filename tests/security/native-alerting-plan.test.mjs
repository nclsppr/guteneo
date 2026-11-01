import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, chmod, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import nativeAlertSignals from "../../packages/observability/native-alert-signals.json" with { type: "json" };
import {
  nativeFailureMonitorQuery,
  nativeFreshnessMonitorQuery,
  legacyNativeFreshnessMonitorQuery,
  nativeUiFailureMonitorQuery,
  nativeUiLegacyFreshnessMonitorQuery,
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
test("uses the native automatic five-minute interval while preserving other controls", () => {
  const original = snapshot();
  const before = structuredClone(original);
  const plan = planNativeFreshnessAlerting(original, at);
  assert.equal(plan.changed, true);
  assert.deepEqual(original, before);
  assert.deepEqual(Object.keys(plan.patch), [
    "query",
    "evaluation",
    "timeRangeMode",
  ]);
  assert.equal(plan.version, 3);
  assert.equal(plan.patch.timeRangeMode, "automatic");
  assert.deepEqual(plan.patch.evaluation, {
    ...original.configuration.evaluation,
    intervalSeconds: 300,
  });
  assert.ok(plan.patch.query.includes("attributes['alertClass'] >= 1"));
  assert.ok(plan.patch.query.includes("SUM(attributes['alertFailure'])"));
  assert.match(plan.patch.query, /^SELECT if\(COUNT\(\*\) = 0, 1\.0,/);
  assert.equal(plan.patch.query.match(/accountTag/g)?.length, 1);
  assert.equal(plan.patch.query.match(/scriptName/g)?.length, 1);
  assert.doesNotMatch(plan.patch.query, /timestamp|INTERVAL/);
  assert.equal(plan.signal.originalFailureLookbackSeconds, 300);
  assert.equal(plan.signal.freshnessLookbackSeconds, 300);
  assert.equal(plan.preserved.evaluationIntervalSeconds, undefined);
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
test("migrates the deployed extension and is idempotent only at the reviewed automatic interval", () => {
  const legacy = snapshot();
  legacy.configuration.query = legacyNativeFreshnessMonitorQuery;
  assert.equal(planNativeFreshnessAlerting(legacy, at).changed, true);
  const input = snapshot();
  input.configuration.query = nativeFreshnessMonitorQuery;
  input.configuration.evaluation.intervalSeconds = 300;
  const plan = planNativeFreshnessAlerting(input, at);
  assert.equal(plan.changed, false);
  assert.equal(plan.patch.query, nativeFreshnessMonitorQuery);
});
const observedNativeForms = [
  [
    nativeUiFailureMonitorQuery,
    "b3bfdebf7321b69081f80736e2e5713d9379126706bed2abed794139b8ff810e",
  ],
  [
    nativeUiLegacyFreshnessMonitorQuery,
    "2f9825d925007ccc9c4d57a33c269a71f199ab602f9d975b04bd7c564e19deb1",
  ],
];
function nativeUiSnapshot(query) {
  const input = snapshot();
  input.configuration.query = query;
  input.configuration.datasetScope = {
    accountId: input.accountId,
    dataset: "logs.workersLogs",
    evidence: "authenticated_monitor_edit_route",
  };
  return input;
}
test("accepts exactly both observed UI queries only with current authenticated account/dataset evidence", () => {
  for (const [query, observedSha256] of observedNativeForms) {
    assert.equal(
      createHash("sha256").update(query).digest("hex"),
      observedSha256,
    );
    const input = nativeUiSnapshot(query);
    const before = structuredClone(input);
    const plan = planNativeFreshnessAlerting(input, at);
    assert.deepEqual(input, before);
    assert.equal(plan.previousQueryTextSha256, observedSha256);
    assert.equal(plan.patch.query, nativeFreshnessMonitorQuery);
    assert.equal(plan.patch.timeRangeMode, "automatic");
    assert.equal(plan.changed, true);
    assert.ok(plan.patch.query.includes(`accountTag = '${input.accountId}'`));
    const canonicalPlan = planNativeFreshnessAlerting(snapshot(), at);
    assert.notEqual(
      plan.previousQuerySha256,
      canonicalPlan.previousQuerySha256,
    );
    assert.notEqual(plan.snapshotSha256, canonicalPlan.snapshotSha256);
    assert.notEqual(
      plan.unchangedConfigurationSha256,
      canonicalPlan.unchangedConfigurationSha256,
    );
  }
});
test("refuses implicit native scope without exact fresh evidence, matching monitor and automatic mode", () => {
  for (const [query] of observedNativeForms) {
    for (const alter of [
      (input) => {
        delete input.configuration.datasetScope;
      },
      (input) => {
        input.configuration.datasetScope.accountId = "foreign";
      },
      (input) => {
        input.configuration.datasetScope.dataset = "events.httpRequests";
      },
      (input) => {
        input.configuration.datasetScope.evidence = "assumed_from_query";
      },
      (input) => {
        input.configuration.datasetScope.otherAccountId = "foreign";
      },
      (input) => {
        input.accountId = "foreign";
      },
      (input) => {
        input.monitorId = "foreign";
      },
      (input) => {
        input.configuration.timeRangeMode = "manual";
      },
      (input) => {
        input.observedAt = "2026-10-30T09:44:59.999Z";
      },
    ]) {
      const input = nativeUiSnapshot(query);
      alter(input);
      assert.throws(
        () => planNativeFreshnessAlerting(input, at),
        /NATIVE_ALERT_/,
      );
    }
  }
});
test("does not normalize unknown native UI SQL, whitespace, identifiers, predicates or manual readback", () => {
  for (const [query] of observedNativeForms) {
    for (const changed of [
      query + "\n",
      query.replace("\nFROM", " FROM"),
      query.replace('"attributes"', "attributes"),
      query.replace("guteneo-app", "another-worker"),
      query.replace("workersLogs", "otherLogs"),
      query + " OR 1 = 1",
      query.replace(`("attributes"['unknown'] > 0) OR `, ""),
      query.replace(
        `("attributes"['failed'] > 0)`,
        `("attributes"['failed'] > 1)`,
      ),
      query.replace(
        `("attributes"['failed'] > 0) OR ("attributes"['unknown'] > 0)`,
        `("attributes"['unknown'] > 0) OR ("attributes"['failed'] > 0)`,
      ),
    ]) {
      const input = nativeUiSnapshot(changed);
      assert.throws(
        () => planNativeFreshnessAlerting(input, at),
        /NATIVE_ALERT_QUERY_OR_TIME_RANGE_UNEXPECTED/,
      );
    }
  }
  const unknownManual = nativeUiSnapshot(
    nativeFreshnessMonitorQuery.replaceAll("attributes[", '"attributes"['),
  );
  unknownManual.configuration.timeRangeMode = "manual";
  assert.throws(
    () => planNativeFreshnessAlerting(unknownManual, at),
    /NATIVE_ALERT_QUERY_OR_TIME_RANGE_UNEXPECTED/,
  );
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
const freshnessRecord = (ageSeconds = 0, attributes = {}) => {
  const projected = {
    event: "freshness",
    route: "maintenance",
    stage: "freshness",
    code: "OK",
    freshnessAtRisk: 0,
    freshnessExpired: 0,
    freshnessChecksFailed: 0,
    ...attributes,
  };
  const originalFailure =
    nativeAlertSignals.codes.includes(projected.code) ||
    nativeAlertSignals.counters.some((key) => projected[key] > 0);
  const freshnessSignal =
    projected.event === "freshness" ||
    ["FRESHNESS_AT_RISK", "FRESHNESS_CHECK_FAILED"].includes(projected.code);
  const healthy =
    projected.event === "freshness" &&
    projected.route === "maintenance" &&
    projected.stage === "freshness" &&
    projected.code === "OK" &&
    projected.freshnessAtRisk === 0 &&
    projected.freshnessExpired === 0 &&
    projected.freshnessChecksFailed === 0 &&
    !originalFailure;
  if (!Object.hasOwn(attributes, "alertClass"))
    projected.alertClass = freshnessSignal
      ? healthy
        ? 2
        : 3
      : originalFailure
        ? 1
        : 0;
  if (!Object.hasOwn(attributes, "alertFailure"))
    projected.alertFailure =
      originalFailure || (freshnessSignal && !healthy) ? 1 : 0;
  return {
    timestamp: nowMs - ageSeconds * 1000,
    accountTag: snapshot().accountId,
    scriptName: "guteneo-app",
    attributes: projected,
  };
};
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
    // Automatic native execution supplies this inclusive range outside SQL.
    const rangedSql =
      sql === nativeFreshnessMonitorQuery
        ? `${sql}\n AND timestamp >= ${nowMs - 300_000} AND timestamp <= ${nowMs}`
        : sql;
    const executable = rangedSql
      .replace("FROM logs.workersLogs", "FROM worker_logs")
      .replace(
        /attributes\['([A-Za-z]+)'\]/g,
        (_, key) => `json_extract(attributes, '$.${key}')`,
      )
      .replace(/NOW\(\) - INTERVAL '([15])' MINUTE/g, (_, minutes) =>
        String(nowMs - Number(minutes) * 60_000),
      )
      .replaceAll("NOW()", String(nowMs));
    assert.equal(/NOW\(|INTERVAL|attributes\[/.test(executable), false);
    return db.prepare(executable).get().value;
  } finally {
    db.close();
  }
}

test("all historic codes and counters use the explicitly extended inclusive five-minute window", () => {
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
        `${nativeFailureMonitorQuery}\n  AND timestamp >= NOW() - INTERVAL '5' MINUTE`,
      );
      assert.equal(previous, age <= 300 ? 1 : 0);
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

test("the automatic request range excludes future failures and healthy coverage", () => {
  for (const attributes of [
    { event: "http", code: "HTTP_SERVER_ERROR" },
    { event: "http", failed: 1 },
    { code: "FRESHNESS_AT_RISK" },
    { code: "FRESHNESS_CHECK_FAILED" },
  ])
    for (const futureSeconds of [0.001, 60, 300])
      assert.equal(
        queryValue([
          freshnessRecord(),
          freshnessRecord(-futureSeconds, attributes),
        ]),
        0,
      );
  for (const futureSeconds of [0.001, 60, 300])
    assert.equal(
      queryValue([freshnessRecord(-futureSeconds)]),
      1,
      "future healthy data is not current coverage",
    );
  assert.equal(
    queryValue([freshnessRecord()]),
    0,
    "the exact evaluation timestamp is inclusive",
  );
});

test("uses direct JSON numeric aggregates and keeps legacy or absent classes alarming", () => {
  assert.doesNotMatch(nativeFreshnessMonitorQuery, /SUM\(if\(/);
  assert.match(
    nativeFreshnessMonitorQuery,
    /SUM\(attributes\['alertFailure'\]\)/,
  );
  for (const alertClass of [undefined, null, 0, -1]) {
    const legacy = freshnessRecord(0, { alertClass, alertFailure: undefined });
    assert.ok(queryValue([legacy]) >= 1);
    assert.equal(
      queryValue([
        { ...legacy, timestamp: nowMs - 300_001 },
        freshnessRecord(),
      ]),
      0,
    );
  }
});

test("contradictory freshness records with positive historic failure counters cannot claim healthy coverage", () => {
  for (const counter of nativeAlertSignals.counters)
    for (const age of [0, 60, 60.001, 300])
      assert.ok(
        queryValue([
          freshnessRecord(age, { [counter]: 1 }),
          freshnessRecord(),
        ]) >= 1,
      );
});

// Retain the exact rejected nested query as a semantic regression fixture.
const rejectedNestedFreshnessQuery =
  "SELECT if(COUNT(*) = 0, 1,\n  SUM(if(\n    (timestamp >= NOW() - INTERVAL '1' MINUTE\n      AND (attributes['code'] = 'HTTP_SERVER_ERROR'\n            OR attributes['code'] = 'CONFIGURATION_INVALID'\n            OR attributes['code'] = 'INTERNAL_ERROR'\n            OR attributes['code'] = 'QUEUE_FAILED'\n            OR attributes['code'] = 'QUEUE_DEAD_LETTER'\n            OR attributes['code'] = 'DISPATCH_FAILED'\n            OR attributes['code'] = 'SUBMISSION_UNKNOWN'\n            OR attributes['code'] = 'CRON_FAILED'\n            OR attributes['code'] = 'SECURE_PREPARATION_FAILED'\n            OR attributes['code'] = 'OUTBOX_DEFERRED'\n            OR attributes['failed'] > 0\n            OR attributes['unknown'] > 0\n            OR attributes['uncertain'] > 0\n            OR attributes['deadLetters'] > 0))\n    OR (attributes['code'] = 'FRESHNESS_AT_RISK'\n            OR attributes['code'] = 'FRESHNESS_CHECK_FAILED')\n    OR (attributes['event'] = 'freshness'\n      AND if((attributes['event'] = 'freshness'\n          AND attributes['route'] = 'maintenance'\n          AND attributes['stage'] = 'freshness'\n          AND ((attributes['code'] = 'FRESHNESS_AT_RISK'\n            OR attributes['code'] = 'FRESHNESS_CHECK_FAILED')\n            OR (attributes['code'] = 'OK'\n              AND attributes['freshnessAtRisk'] = 0\n              AND attributes['freshnessExpired'] = 0\n              AND attributes['freshnessChecksFailed'] = 0))), 0, 1) = 1),\n    1, 0))\n  + if(SUM(if((attributes['event'] = 'freshness'\n          AND attributes['route'] = 'maintenance'\n          AND attributes['stage'] = 'freshness'\n          AND ((attributes['code'] = 'FRESHNESS_AT_RISK'\n            OR attributes['code'] = 'FRESHNESS_CHECK_FAILED')\n            OR (attributes['code'] = 'OK'\n              AND attributes['freshnessAtRisk'] = 0\n              AND attributes['freshnessExpired'] = 0\n              AND attributes['freshnessChecksFailed'] = 0))), 1, 0)) = 0, 1, 0)\n) AS value\nFROM logs.workersLogs\nWHERE accountTag = '39ac9fada6cba44d9ecf09d467609e69'\n  AND scriptName = 'guteneo-app'\n  AND timestamp >= NOW() - INTERVAL '5' MINUTE\n  AND timestamp <= NOW()";

test("derived health aggregates retain every alarm decision across 117 deterministic and jittered records", () => {
  const signals = [
    {},
    { code: "FRESHNESS_AT_RISK", freshnessExpired: 14 },
    { code: "FRESHNESS_CHECK_FAILED", freshnessChecksFailed: 1 },
    { event: "http", code: "HTTP_SERVER_ERROR" },
    { event: "cron", code: "CRON_FAILED" },
    { event: "http", failed: 1 },
    { code: "UNKNOWN_FRESHNESS" },
    { freshnessExpired: null },
    { freshnessChecksFailed: undefined },
    { freshnessAtRisk: "0" },
    { route: "unknown" },
    { stage: undefined },
    { event: "cron", stage: "complete" },
  ];
  const ages = [-0.001, 0, 59.999, 60, 60.001, 299.999, 300, 300.001, 1200];
  let compared = 0;
  const equivalent = (rows) => {
    // The operational fallback deliberately extends historic failure retention
    // from one to five minutes; all other decisions retain the strict model.
    const before = queryValue(
      rows,
      rejectedNestedFreshnessQuery.replace(
        "INTERVAL '1' MINUTE",
        "INTERVAL '5' MINUTE",
      ),
    );
    const after = queryValue(rows);
    assert.equal(after >= 1, before >= 1, JSON.stringify(rows));
    assert.ok(Number.isFinite(after) && after >= 0);
  };
  equivalent([]);
  for (const attributes of signals)
    for (const age of ages) {
      const record = freshnessRecord(age, attributes);
      equivalent([record]);
      equivalent([freshnessRecord(), record]);
      equivalent([freshnessRecord(240), record]);
      compared++;
    }
  assert.equal(compared, 117);
  // Reproducible mixed ingestion times, absent fields and foreign data, without
  // depending on the machine clock or a provider's ingestion availability.
  let seed = 131;
  const random = () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  for (let fixture = 0; fixture < 200; fixture++) {
    const records = Array.from({ length: Math.floor(random() * 20) }, () => ({
      ...freshnessRecord(
        ages[Math.floor(random() * ages.length)] + (random() - 0.5) * 0.002,
        signals[Math.floor(random() * signals.length)],
      ),
      ...(random() < 0.1 ? { accountTag: "foreign" } : {}),
      ...(random() < 0.1 ? { scriptName: "foreign" } : {}),
    }));
    equivalent(records);
  }
});
