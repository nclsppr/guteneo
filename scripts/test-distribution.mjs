import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { assertNoInvitationSecrets } from "./test-distribution-secrets.mjs";
import { forwardPrivateTestOutput } from "./distribution-e2e-output.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const cli = fileURLToPath(
  new URL("../node_modules/e2e/dist/cli/bin.js", import.meta.url),
);
const state = `.wrangler/distribution-e2e-${crypto.randomUUID()}`;
const startedAt = new Date().toISOString();
const output = new URL("../test-results/distribution-e2e/", import.meta.url);
const marker = new URL("../test-results/distribution-e2e-sanitized.json", import.meta.url);
await rm(output, { recursive: true, force: true });
await rm(marker, { force: true });
await mkdir(new URL("../test-results/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../test-results/distribution-e2e-state.json", import.meta.url),
  JSON.stringify({ state, startedAt }, null, 2),
);
await writeFile(
  new URL("../test-results/distribution-e2e-server.log", import.meta.url),
  "",
);
const child = spawn(process.execPath, [cli, "run", ...process.argv.slice(2)], {
  cwd: root,
  stdio: ["inherit", "pipe", "pipe"],
  env: {
    ...process.env,
    E2E_TELEMETRY_DISABLED: "1",
    DO_NOT_TRACK: "1",
    WRANGLER_SEND_METRICS: "false",
    WRANGLER_WRITE_LOGS: "false",
    GUTENEO_DISTRIBUTION_E2E_STATE: state,
  },
});
forwardPrivateTestOutput(child.stdout, process.stdout);
forwardPrivateTestOutput(child.stderr, process.stderr);
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", async (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
  try {
    const { run } = JSON.parse(await readFile(new URL("report.json", output), "utf8"));
    if (!run.id || Date.parse(run.startedAt) < Date.parse(startedAt))
      throw new Error("No current framework report.");
    // A failed test can still produce useful evidence. Publication is permitted
    // only after this independent check succeeds, regardless of the test result.
    await assertNoInvitationSecrets(state);
    await writeFile(marker, JSON.stringify({ schema: 1, runId: run.id,
      checkedAt: new Date().toISOString(), reportStatus: run.status }));
  } catch {
    console.error("The local invitation secret check failed; artifacts are not cleared for upload.");
    process.exitCode = 1;
  }
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
