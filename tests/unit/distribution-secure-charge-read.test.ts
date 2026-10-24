import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readSecureCharge } from "../distribution-e2e/secure-charge-read";

const state = ".wrangler/distribution-e2e-12345678-1234-1234-1234-123456789abc";
const distributionId = `sd_${"a".repeat(32)}`;
const rows = [{ amount_minor: 321, evidence: "simulation" }];
const success = { stdout: JSON.stringify([{ results: rows }]) };
function failure(
  stderr = "database is locked: SQLITE_BUSY (extended: SQLITE_BUSY_SNAPSHOT)",
  extra: Record<string, unknown> = {},
) {
  return Object.assign(new Error("Wrangler query failed"), {
    code: 1,
    killed: false,
    signal: null,
    stdout: "",
    stderr,
    ...extra,
  });
}

describe("isolated local secure-distribution billing read", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "performance"] });
    vi.stubEnv("GUTENEO_DISTRIBUTION_E2E_STATE", state);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("executes only the fixed tenant-filtered SELECT and preserves its result", async () => {
    const execute = vi.fn().mockResolvedValue(success);
    expect(await readSecureCharge(distributionId, execute)).toEqual(rows);
    expect(execute).toHaveBeenCalledTimes(1);
    const [args, options] = execute.mock.calls[0];
    expect(args.slice(1)).toEqual([
      "d1",
      "execute",
      "guteneo-local",
      "--local",
      "--persist-to",
      state,
      "--json",
      "--command",
      `SELECT amount_minor,evidence FROM secure_distribution_charges WHERE organization_id='org_atelier' AND distribution_id='${distributionId}'`,
    ]);
    expect(options.timeout).toBe(15_000);
  });

  it.each(["SQLITE_BUSY", "SQLITE_BUSY_SNAPSHOT"])(
    "retries a completed %s query once and returns the actual billing rows",
    async (code) => {
      const execute = vi
        .fn()
        .mockRejectedValueOnce(failure(`database is locked: ${code}`))
        .mockResolvedValue(success);
      const pending = readSecureCharge(distributionId, execute);
      await vi.advanceTimersByTimeAsync(249);
      expect(execute).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(await pending).toEqual(rows);
      expect(execute.mock.calls.map(([, options]) => options.timeout)).toEqual([
        15_000, 14_750,
      ]);
      expect(execute.mock.calls[1][0]).toEqual(execute.mock.calls[0][0]);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("recognizes the explicit lock diagnostic on stdout", async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(
        failure("", { stdout: "database is locked: SQLITE_BUSY_SNAPSHOT" }),
      )
      .mockResolvedValue(success);
    const pending = readSecureCharge(distributionId, execute);
    await vi.runAllTimersAsync();
    expect(await pending).toEqual(rows);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("surfaces persistent contention unchanged after at most three read attempts", async () => {
    const locked = failure();
    const execute = vi.fn().mockRejectedValue(locked);
    const assertion = expect(
      readSecureCharge(distributionId, execute),
    ).rejects.toBe(locked);
    await vi.runAllTimersAsync();
    await assertion;
    expect(execute.mock.calls.map(([, options]) => options.timeout)).toEqual([
      15_000, 14_750, 14_250,
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("charges query execution and retry delay to the same fifteen-second budget", async () => {
    const execute = vi
      .fn()
      .mockImplementationOnce(async () => {
        await new Promise((resolve) => setTimeout(resolve, 14_000));
        throw failure();
      })
      .mockResolvedValue(success);
    const pending = readSecureCharge(distributionId, execute);
    await vi.runAllTimersAsync();
    expect(await pending).toEqual(rows);
    expect(execute.mock.calls.map(([, options]) => options.timeout)).toEqual([
      15_000, 750,
    ]);
  });

  it("does not retry when the remaining budget cannot cover the next delay", async () => {
    const locked = failure();
    const execute = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 14_800));
      throw locked;
    });
    const assertion = expect(
      readSecureCharge(distributionId, execute),
    ).rejects.toBe(locked);
    await vi.runAllTimersAsync();
    await assertion;
    expect(execute).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not launch another command if the retry delay overruns the deadline", async () => {
    vi.spyOn(performance, "now")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValue(15_001);
    const locked = failure();
    const execute = vi.fn().mockRejectedValue(locked);
    const assertion = expect(
      readSecureCharge(distributionId, execute),
    ).rejects.toBe(locked);
    await vi.runAllTimersAsync();
    await assertion;
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("rejects an executor that completes after the total deadline", async () => {
    const execute = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 15_001));
      return success;
    });
    const assertion = expect(
      readSecureCharge(distributionId, execute),
    ).rejects.toThrow("deadline elapsed");
    await vi.runAllTimersAsync();
    await assertion;
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["schema failure", failure("no such table: secure_distribution_charges")],
    ["SQL error", failure("SQLITE_ERROR: syntax error")],
    ["absent lock code", failure("database is locked")],
    ["absent lock message", failure("SQLITE_BUSY: another failure")],
    ["other SQLite code", failure("database is locked: SQLITE_BUSY_RECOVERY")],
    ["killed process", failure(undefined, { killed: true })],
    ["signalled process", failure(undefined, { signal: "SIGTERM" })],
    ["timeout", failure(undefined, { code: "ETIMEDOUT" })],
    ["missing executable", failure(undefined, { code: "ENOENT" })],
    ["unstructured error", new Error("database is locked: SQLITE_BUSY")],
  ])("fails immediately on %s", async (_name, error) => {
    const execute = vi.fn().mockRejectedValue(error);
    await expect(readSecureCharge(distributionId, execute)).rejects.toBe(error);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not retry malformed successful output or incorrect billing values", async () => {
    const malformed = vi.fn().mockResolvedValue({ stdout: "not JSON" });
    await expect(readSecureCharge(distributionId, malformed)).rejects.toThrow(
      SyntaxError,
    );
    expect(malformed).toHaveBeenCalledTimes(1);
    const mismatch = vi.fn().mockResolvedValue(success);
    const actual = await readSecureCharge(distributionId, mismatch);
    expect(() =>
      expect(actual).toEqual([{ amount_minor: 100, evidence: "real" }]),
    ).toThrow();
    expect(mismatch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects injected SQL and non-isolated storage before running any command", async () => {
    const execute = vi.fn();
    await expect(
      readSecureCharge(
        `${distributionId}'; DELETE FROM secure_distribution_charges`,
        execute,
      ),
    ).rejects.toThrow("isolated fictional distribution");
    vi.stubEnv("GUTENEO_DISTRIBUTION_E2E_STATE", ".wrangler/state");
    await expect(readSecureCharge(distributionId, execute)).rejects.toThrow(
      "isolated fictional distribution",
    );
    expect(execute).not.toHaveBeenCalled();
  });
});
