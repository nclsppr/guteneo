const resetBudgetMs = 30_000;
const retryDelaysMs = [250, 500];

function isLocalDatabaseLocked(error: unknown) {
  if (!(error instanceof Error)) return false;
  const failure = error as Error & {
    code?: string | number;
    killed?: boolean;
    signal?: string | null;
    stdout?: string;
    stderr?: string;
  };
  // A timed-out/killed command, missing executable or unrelated D1 error must
  // fail immediately. Only Wrangler's explicit local SQLite lock is transient.
  if (
    typeof failure.code !== "number" ||
    failure.code === 0 ||
    failure.killed ||
    failure.signal
  )
    return false;
  const output = `${failure.stdout ?? ""}\n${failure.stderr ?? ""}`;
  return (
    /\bSQLITE_BUSY\b/u.test(output) && output.includes("database is locked")
  );
}

/** Retry only the idempotent local fixture reset, never a browser scenario. */
export async function resetLocalFixtures(
  runReset: (timeoutMs: number) => Promise<unknown>,
) {
  const deadline = performance.now() + resetBudgetMs;
  let lastError: unknown = new Error("Local fixture reset deadline elapsed.");
  for (let attempt = 0; ; attempt++) {
    const remainingMs = Math.ceil(deadline - performance.now());
    if (remainingMs <= 0) throw lastError;
    try {
      await runReset(remainingMs);
      return;
    } catch (error) {
      lastError = error;
      const delayMs = retryDelaysMs[attempt];
      if (
        !isLocalDatabaseLocked(error) ||
        delayMs === undefined ||
        deadline - performance.now() <= delayMs
      )
        throw error;
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
