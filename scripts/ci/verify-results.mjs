import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

const requiredJobs = [
  "scanner",
  "checks",
  "vitest",
  "security",
  "build",
  "browser",
];
export function requireJobs(results) {
  if (
    !results ||
    typeof results !== "object" ||
    Object.keys(results).length !== requiredJobs.length ||
    requiredJobs.some((name) => results[name]?.result !== "success")
  ) {
    throw new Error(
      "Every required CI job must succeed, including all matrix entries.",
    );
  }
}
export async function discoverTests(root) {
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(resolve(root, directory), {
      withFileTypes: true,
    })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && entry.name.endsWith(".test.ts"))
        files.push(path);
    }
  }
  await visit("tests/unit");
  await visit("tests/integration");
  return files.sort();
}
export function requireTestResults(report, expected, root) {
  if (
    !report ||
    report.success !== true ||
    report.numFailedTests !== 0 ||
    report.numPendingTests !== 0 ||
    report.numTodoTests !== 0 ||
    report.numPassedTests < 1 ||
    report.numPassedTests !== report.numTotalTests ||
    !Array.isArray(report.testResults)
  ) {
    throw new Error(
      "Vitest must report a complete successful run without skipped tests.",
    );
  }
  const actual = report.testResults
    .map((suite) => {
      if (
        suite.status !== "passed" ||
        !suite.assertionResults.length ||
        suite.assertionResults.some((test) => test.status !== "passed")
      ) {
        throw new Error(
          "Every discovered test file must contain passing assertions.",
        );
      }
      return relative(root, suite.name).split(sep).join("/");
    })
    .sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) {
    throw new Error(
      "Vitest shard reports have missing, duplicated or unexpected test files.",
    );
  }
  const assertions = report.testResults.reduce(
    (count, suite) => count + suite.assertionResults.length,
    0,
  );
  if (assertions !== report.numTotalTests)
    throw new Error("Vitest assertion totals disagree.");
  return { files: actual.length, passed: assertions };
}
async function main() {
  requireJobs(JSON.parse(process.env.CI_JOB_RESULTS || "null"));
  const root = process.cwd();
  const expected = await discoverTests(root);
  const report = JSON.parse(await readFile("reports/vitest.json", "utf8"));
  const proof = requireTestResults(report, expected, root);
  await writeFile(
    "test-results/ci/verified.json",
    JSON.stringify(proof, null, 2) + "\n",
  );
  console.log(
    `All required jobs succeeded; ${proof.files} test files and ${proof.passed} assertions accounted for.`,
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
