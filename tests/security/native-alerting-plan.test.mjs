import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, chmod, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  nativeFailureMonitorQuery,
  nativeFreshnessMonitorQuery,
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
test("extends only the existing monitor query and preserves every original predicate", () => {
  const original = snapshot();
  const before = structuredClone(original);
  const plan = planNativeFreshnessAlerting(original, at);
  assert.equal(plan.changed, true);
  assert.deepEqual(original, before);
  assert.deepEqual(Object.keys(plan.patch), ["query"]);
  for (const line of nativeFailureMonitorQuery
    .split("\n")
    .filter((value) => value.includes("attributes[")))
    assert.ok(plan.patch.query.includes(line));
  assert.ok(
    plan.patch.query.includes("attributes['code'] = 'FRESHNESS_AT_RISK'"),
  );
  assert.ok(
    plan.patch.query.includes("attributes['code'] = 'FRESHNESS_CHECK_FAILED'"),
  );
  assert.equal(plan.patch.query.match(/accountTag/g)?.length, 1);
  assert.equal(plan.patch.query.match(/scriptName/g)?.length, 1);
  assert.equal(plan.patch.query.includes("timestamp"), false);
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
test("is idempotent when the two closed codes already exist", () => {
  const input = snapshot();
  input.configuration.query = nativeFreshnessMonitorQuery;
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
    /NATIVE_ALERT_QUERY_UNEXPECTED/,
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
    (input) => {
      input.configuration.evaluation.threshold = 2;
    },
    (input) => {
      input.configuration.enabled = false;
    },
    (input) => {
      input.configuration.notifications.repeatSeconds = 60;
    },
    (input) => {
      input.monitorId = "other-monitor";
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
      "local_plan_requires_current_native_readback_and_authorized_apply",
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
