import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const queryBudgetMs = 15_000;
const retryDelaysMs = [250, 500];
type QueryExecutor = (
  args: string[],
  options: { timeout: number },
) => Promise<{ stdout: string }>;

const executeQuery: QueryExecutor = (args, options) =>
  run(process.execPath, args, {
    ...options,
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    env: {
      ...process.env,
      WRANGLER_SEND_METRICS: "false",
      WRANGLER_WRITE_LOGS: "false",
    },
  });

function isLocalReadBusy(error: unknown) {
  if (!(error instanceof Error)) return false;
  const failure = error as Error & {
    code?: string | number;
    killed?: boolean;
    signal?: string | null;
    stdout?: string;
    stderr?: string;
  };
  if (
    typeof failure.code !== "number" ||
    failure.code === 0 ||
    failure.killed ||
    failure.signal
  )
    return false;
  const output = `${failure.stdout ?? ""}\n${failure.stderr ?? ""}`;
  return (
    /\bSQLITE_BUSY(?:_SNAPSHOT)?\b/u.test(output) &&
    output.includes("database is locked")
  );
}

/** Retry only this fixed local billing SELECT, never writes or browser actions. */
export async function readSecureCharge(
  distributionId: string,
  execute: QueryExecutor = executeQuery,
) {
  const state = process.env.GUTENEO_DISTRIBUTION_E2E_STATE;
  if (
    !state ||
    !/^\.wrangler\/distribution-e2e-[a-f0-9-]{36}$/u.test(state) ||
    !/^sd_[a-f0-9]{32}$/u.test(distributionId)
  )
    throw new Error(
      "The billing assertion requires an isolated fictional distribution.",
    );
  const args = [
    fileURLToPath(
      new URL("../../node_modules/wrangler/bin/wrangler.js", import.meta.url),
    ),
    "d1",
    "execute",
    "guteneo-local",
    "--local",
    "--persist-to",
    state,
    "--json",
    "--command",
    `SELECT amount_minor,evidence FROM secure_distribution_charges WHERE organization_id='org_atelier' AND distribution_id='${distributionId}'`,
  ];
  const deadline = performance.now() + queryBudgetMs;
  let lastError: unknown = new Error("Local billing read deadline elapsed.");
  for (let attempt = 0; ; attempt++) {
    const remainingMs = Math.floor(deadline - performance.now());
    if (remainingMs <= 0) throw lastError;
    let result: { stdout: string };
    try {
      result = await execute(args, { timeout: remainingMs });
    } catch (error) {
      lastError = error;
      const delayMs = retryDelaysMs[attempt];
      if (
        !isLocalReadBusy(error) ||
        delayMs === undefined ||
        deadline - performance.now() <= delayMs
      )
        throw error;
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      continue;
    }
    if (performance.now() > deadline)
      throw new Error("Local billing read deadline elapsed.");
    // Parsing and billing assertions are outside the retry boundary.
    return (
      JSON.parse(result.stdout) as {
        results: { amount_minor: number; evidence: string }[];
      }[]
    )[0].results;
  }
}
