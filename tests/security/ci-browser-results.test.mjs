import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  browserMatrix,
  browserShardCount,
  declaredBrowserSkips,
  reportEntries,
  requireBrowserResults,
  rowSuites,
  suitePlans,
} from "../../scripts/ci/browser-results.mjs";

const identity = { revision: "a".repeat(40), runId: "123", runAttempt: "1" };
const key = (plan) => `${plan.suite}/${plan.project}`;
function spec(id, project, file = "passing.spec.ts", title = id) {
  return {
    id,
    file,
    title,
    ok: true,
    tests: [
      {
        projectName: project,
        expectedStatus: "passed",
        annotations: [],
        results: [],
        status: "skipped",
      },
    ],
  };
}
function fixture() {
  const inventories = Object.fromEntries(
    suitePlans().map((plan) => {
      const specs = Array.from({ length: 3 }, (_, index) =>
        spec(`same-cross-suite-id-${index}`, plan.project),
      );
      for (const skip of declaredBrowserSkips.filter(
        (item) =>
          item.suite === plan.suite && item.projects.includes(plan.project),
      ))
        specs.push(
          spec(`skip-${specs.length}`, plan.project, skip.file, skip.title),
        );
      return [
        key(plan),
        { config: { shard: null }, errors: [], suites: [{ specs }] },
      ];
    }),
  );
  const rows = browserMatrix().include.map((row) => {
    const reports = {};
    for (const plan of rowSuites(row)) {
      const all = inventories[key(plan)].suites[0].specs;
      const specs = structuredClone(
        all.filter(
          (_, index) =>
            !plan.shard || index % browserShardCount === row.shardIndex - 1,
        ),
      );
      let skipped = 0;
      for (const item of specs) {
        const skip = declaredBrowserSkips.find(
          (entry) =>
            entry.suite === plan.suite &&
            entry.projects.includes(plan.project) &&
            entry.file === item.file &&
            entry.title === item.title,
        );
        item.tests[0] = {
          projectName: plan.project,
          expectedStatus: skip ? "skipped" : "passed",
          annotations: skip ? [{ type: "skip", description: skip.reason }] : [],
          results: [
            { status: skip ? "skipped" : "passed", errors: [], retry: 0 },
          ],
          status: skip ? "skipped" : "expected",
        };
        if (skip) skipped += 1;
      }
      reports[plan.suite] = {
        config: { shard: plan.shard },
        errors: [],
        suites: [{ specs }],
        stats: {
          expected: specs.length - skipped,
          skipped,
          unexpected: 0,
          flaky: 0,
        },
      };
    }
    return { schema: 1, ...row, ...identity, reports };
  });
  return { inventories, rows };
}

test("the matrix retains every project on three isolated shards and each small suite once", () => {
  const rows = browserMatrix().include;
  assert.equal(rows.length, 9);
  for (const project of ["chromium", "mobile-chromium", "iphone-webkit"])
    assert.deepEqual(
      rows
        .filter((row) => row.project === project)
        .map((row) => row.shardIndex),
      [1, 2, 3],
    );
  const plans = rows.flatMap(rowSuites);
  assert.equal(plans.filter((plan) => plan.suite === "application").length, 9);
  assert.equal(plans.filter((plan) => plan.suite === "preview").length, 6);
  assert.deepEqual(
    plans
      .filter((plan) => plan.suite === "belvedere")
      .map((plan) => plan.project)
      .sort(),
    ["desktop", "iphone"],
  );
  assert.equal(plans.filter((plan) => plan.suite === "status").length, 1);
  assert.equal(
    rows.find((row) => row.project === "iphone-webkit").browsers,
    "chromium webkit",
  );
});

test("complete browser evidence matches independently discovered IDs across configs and projects", () => {
  const { inventories, rows } = fixture();
  const result = requireBrowserResults(inventories, rows, identity);
  assert.equal(result.rows, 9);
  assert.equal(result.suites, 8);
  assert.equal(result.declaredSkipped, 20);
  assert.equal(result.discovered, result.passed + result.declaredSkipped);
});

test("a manual aggregate retry retains successful same-revision evidence and its attempt history", () => {
  const { inventories, rows } = fixture();
  const result = requireBrowserResults(inventories, rows, {
    ...identity,
    runAttempt: "2",
  });
  assert.deepEqual(result.evidenceAttempts, ["1"]);
});

test("a green aggregate cannot hide a missing, duplicate or foreign browser shard", () => {
  for (const mutate of [
    ({ rows }) => rows.pop(),
    ({ rows }) => (rows[1] = structuredClone(rows[0])),
    ({ rows }) => (rows[0].project = "unconfigured"),
    ({ rows }) => (rows[0].shardTotal += 1),
    ({ rows }) => (rows[0].revision = "b".repeat(40)),
    ({ rows }) => (rows[0].runId = "124"),
    ({ rows }) => (rows[0].runAttempt = "2"),
    ({ rows }) => delete rows[0].reports.preview,
    ({ rows }) => (rows[0].reports.unexpected = rows[0].reports.application),
    ({ rows }) => (rows[0].reports.application.config.shard.current = 2),
  ]) {
    const value = fixture();
    mutate(value);
    assert.throws(() =>
      requireBrowserResults(value.inventories, value.rows, identity),
    );
  }
});

test("the independent inventory catches missing, duplicate and unexpected executed test IDs", () => {
  for (const mutate of [
    ({ inventories }) => delete inventories["preview/iphone"],
    ({ inventories }) =>
      (inventories["application/chromium"].config.shard = {
        current: 1,
        total: 3,
      }),
    ({ inventories }) =>
      inventories["application/chromium"].suites[0].specs.pop(),
    ({ rows }) =>
      (rows[0].reports.application.suites[0].specs[0].id = "not-discovered"),
    ({ rows }) =>
      (rows[1].reports.application.suites[0].specs[0].id =
        rows[0].reports.application.suites[0].specs[0].id),
    ({ rows }) => (rows[0].reports.application.suites[0].specs = []),
  ]) {
    const value = fixture();
    mutate(value);
    assert.throws(() =>
      requireBrowserResults(value.inventories, value.rows, identity),
    );
  }
});

test("a new runtime skip with an annotation is still refused", () => {
  const value = fixture();
  const report = value.rows[0].reports.application;
  const entry = report.suites[0].specs[0].tests[0];
  entry.status = "skipped";
  entry.expectedStatus = "skipped";
  entry.results[0].status = "skipped";
  entry.annotations = [{ type: "skip", description: "A blanket waiver" }];
  report.stats.expected -= 1;
  report.stats.skipped += 1;
  assert.throws(() =>
    requireBrowserResults(value.inventories, value.rows, identity),
  );
});

test("planned skips require their exact existing reason and executed reports cannot be lists or retries", () => {
  for (const mutate of [
    (entry) => (entry.test.annotations = []),
    (entry) =>
      (entry.test.annotations[0].description = "Different justification"),
    (entry) => (entry.test.annotations[0].type = "fixme"),
    (entry) => (entry.test.results = []),
    (entry) => (entry.test.results[0].retry = 1),
    (entry) => entry.test.results.push(structuredClone(entry.test.results[0])),
  ]) {
    const value = fixture();
    const entry = value.rows
      .flatMap((row) => Object.values(row.reports).flatMap(reportEntries))
      .find((entry) => entry.test.expectedStatus === "skipped");
    mutate(entry);
    assert.throws(() =>
      requireBrowserResults(value.inventories, value.rows, identity),
    );
  }
  for (const mutate of [
    (report) => report.errors.push({ message: "Runner failed" }),
    (report) => (report.stats.flaky = 1),
    (report) => (report.stats.unexpected = 1),
    (report) => (report.stats.expected += 1),
    (report) =>
      (report.suites[0].specs[0].tests[0].results[0].status = "interrupted"),
  ]) {
    const value = fixture();
    mutate(value.rows[0].reports.application);
    assert.throws(() =>
      requireBrowserResults(value.inventories, value.rows, identity),
    );
  }
});

test("workflow uses the same generated matrix, unique evidence and independent discovery checkout", async () => {
  const source = await readFile(
    new URL("../../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /matrix: \$\{\{ fromJSON\(needs\.build\.outputs\.browser-matrix\) \}\}/,
  );
  assert.match(source, /node scripts\/ci\/browser-results\.mjs matrix/);
  assert.equal(
    (
      source.match(
        /--shard=\$\{\{ matrix\.shardIndex \}\}\/\$\{\{ matrix\.shardTotal \}\}/g,
      ) ?? []
    ).length,
    2,
  );
  assert.match(
    source,
    /name: ci-evidence-browser-\$\{\{ matrix\.project \}\}-\$\{\{ matrix\.shardIndex \}\}/,
  );
  assert.match(source, /matrix\.preview != '' && matrix\.shardIndex == 1/);
  assert.match(
    source,
    /matrix\.project == 'chromium' && matrix\.shardIndex == 1/,
  );
  assert.match(source, /WEBKIT_GST_USE_PLAYBIN3: "1"/);
  const sdkStep = source.match(
    /- name: Verify the four-language MCP Apps SDK fixtures\n\s+if: ([^\n]+)\n\s+run: ([^\n]+)/,
  );
  assert.ok(sdkStep);
  assert.match(
    sdkStep[1],
    /matrix\.project == 'chromium' && matrix\.shardIndex == 3/,
  );
  assert.equal(
    (sdkStep[2].match(/tests\/browser\/mcp-ui-probe\.test\.mjs/g) ?? []).length,
    1,
  );
  assert.equal(
    (sdkStep[2].match(/tests\/browser\/mcp-document-upload\.test\.mjs/g) ?? [])
      .length,
    1,
  );
  assert.match(source, /reports\/mcp-ui-probe\//);
  assert.match(source, /reports\/mcp-document-upload\//);
  for (const path of [
    "tests/e2e",
    "tests/preview-e2e",
    "tests/belvedere-e2e",
    "tests/status-e2e",
    "tests/fixtures",
    "apps/web/src",
    "apps/api/src",
    "apps/web/public/openapi.json",
    "packages",
  ])
    assert.ok(source.slice(source.indexOf("  verify:")).includes(path));
});
