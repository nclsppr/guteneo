import { copyFile, readFile } from "node:fs/promises";
const report = JSON.parse(await readFile(process.argv[2], "utf8"));
// Other shards still have a historical tracked report: never upload that as
// this run's restoration evidence. Only the shard that exercised it may copy it.
if (
  report.testResults.some(
    (result) =>
      result.name.endsWith("/tests/integration/restore.test.ts") &&
      result.status === "passed",
  )
) {
  await copyFile(
    "reports/restore-proof.json",
    "test-results/ci/restore-proof.json",
  );
}
