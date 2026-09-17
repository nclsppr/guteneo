import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  discoverTests,
  requireJobs,
  requireTestResults,
} from "../../scripts/ci/verify-results.mjs";

const jobs = () =>
  Object.fromEntries(
    ["scanner", "checks", "vitest", "security", "build", "browser"].map(
      (name) => [name, { result: "success" }],
    ),
  );
const report = (names) => ({
  success: true,
  numFailedTests: 0,
  numPendingTests: 0,
  numTodoTests: 0,
  numPassedTests: names.length,
  numTotalTests: names.length,
  testResults: names.map((name) => ({
    name: `/fixture/${name}`,
    status: "passed",
    assertionResults: [{ status: "passed" }],
  })),
});

test("the required gate refuses missing, failed, cancelled and skipped dependencies", () => {
  requireJobs(jobs());
  for (const name of Object.keys(jobs())) {
    for (const result of ["failure", "cancelled", "skipped", undefined]) {
      const altered = jobs();
      altered[name].result = result;
      assert.throws(() => requireJobs(altered));
    }
    const missing = jobs();
    delete missing[name];
    assert.throws(() => requireJobs(missing));
  }
  assert.throws(() => requireJobs(null));
});

test("inventory automatically includes new nested tests without a fixed test count", async () => {
  const root = await mkdtemp(join(tmpdir(), "guteneo-ci-inventory-"));
  try {
    await mkdir(join(root, "tests/unit/new"), { recursive: true });
    await mkdir(join(root, "tests/integration"), { recursive: true });
    for (const path of [
      "tests/unit/old.test.ts",
      "tests/unit/new/added.test.ts",
      "tests/unit/helper.ts",
      "tests/integration/new.test.ts",
    ]) {
      await writeFile(join(root, path), "");
    }
    const files = await discoverTests(root);
    assert.deepEqual(files, [
      "tests/integration/new.test.ts",
      "tests/unit/new/added.test.ts",
      "tests/unit/old.test.ts",
    ]);
    assert.deepEqual(requireTestResults(report(files), files, "/fixture"), {
      files: 3,
      passed: 3,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a green partial/duplicate shard report cannot satisfy the complete gate", () => {
  const files = ["tests/unit/one.test.ts", "tests/integration/two.test.ts"];
  for (const actual of [
    files.slice(0, 1),
    [...files, files[0]],
    [files[0], "tests/unit/other.test.ts"],
  ]) {
    assert.throws(() => requireTestResults(report(actual), files, "/fixture"));
  }
  for (const state of ["failed", "pending", "todo", "skipped"]) {
    const altered = report(files);
    altered.testResults[0].assertionResults[0].status = state;
    assert.throws(() => requireTestResults(altered, files, "/fixture"));
  }
  const empty = report(files);
  empty.testResults[0].assertionResults = [];
  assert.throws(() => requireTestResults(empty, files, "/fixture"));
  const totals = report(files);
  totals.numTotalTests++;
  totals.numPassedTests++;
  assert.throws(() => requireTestResults(totals, files, "/fixture"));
});
