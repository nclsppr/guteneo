import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));

/** Compares local synthetic secrets in memory; never prints their values. */
export async function assertNoInvitationSecrets(state, extraPaths = []) {
  if (!/^\.wrangler\/distribution-e2e-[a-f0-9-]{36}$/u.test(state))
    throw new Error("Secret checks require the isolated fictional database.");
  const result = await run(
    process.execPath,
    [
      fileURLToPath(
        new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
      ),
      "d1",
      "execute",
      "guteneo-local",
      "--local",
      "--persist-to",
      state,
      "--json",
      "--command",
      "SELECT text FROM dispatches WHERE organization_id='org_atelier' AND prepare_key LIKE 'secure_%'",
    ],
    {
      cwd: root,
      timeout: 15_000,
      env: {
        ...process.env,
        WRANGLER_SEND_METRICS: "false",
        WRANGLER_WRITE_LOGS: "false",
      },
    },
  );
  const tokens = JSON.parse(result.stdout)[0].results.flatMap((row) =>
    Array.from(
      row.text.matchAll(/[?&]invitation=([a-f0-9]{64})/gu),
      (match) => match[1],
    ),
  );
  let sessionSecrets = [];
  try {
    const ledger = await readFile(new URL(`${state}/normal-session-secrets.jsonl`, `file://${root}`), "utf8");
    sessionSecrets = ledger.trim().split("\n").flatMap((line) => JSON.parse(line));
  } catch (error) {
    if (error.code !== "ENOENT") throw new Error("The normal-session privacy ledger is unavailable.");
  }
  async function inspect(path) {
    const content = await readFile(path);
    if ([...tokens, ...sessionSecrets].some((token) => content.includes(token)))
      throw new Error("A fictional private credential appeared in local test artifacts.");
  }
  async function directory(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = new URL(entry.name, path);
      if (entry.isDirectory()) await directory(new URL(`${entry.name}/`, path));
      else await inspect(child);
    }
  }
  await directory(
    new URL("../test-results/distribution-e2e/", import.meta.url),
  );
  await inspect(
    new URL("../test-results/distribution-e2e-server.log", import.meta.url),
  );
  for (const path of extraPaths) await inspect(path);
  console.log(
    `Invitation secret check: ${tokens.length} fictional invitations; no secret in test artifacts.`,
  );
}
