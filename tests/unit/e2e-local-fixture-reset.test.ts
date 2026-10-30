import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetLocalFixtures } from "../e2e/local-fixture-reset";

function failure(
  stderr = "✘ [ERROR] database is locked: SQLITE_BUSY",
  extra: Record<string, unknown> = {},
) {
  return Object.assign(new Error("Wrangler command failed"), {
    code: 1,
    killed: false,
    signal: null,
    stdout: "",
    stderr,
    ...extra,
  });
}

describe("local browser fixture reset", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "performance"] }));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("runs a successful reset once with the full bounded budget", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    await resetLocalFixtures(run);
    expect(run).toHaveBeenCalledExactlyOnceWith(30_000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retries only the reset after the explicit transient Wrangler lock", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(failure())
      .mockResolvedValue(undefined);
    const pending = resetLocalFixtures(run);
    await vi.advanceTimersByTimeAsync(249);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(run.mock.calls).toEqual([[30_000], [29_750]]);
  });

  it("accepts the same explicit lock diagnostic on stdout", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(
        failure("", {
          stdout: "database is locked: SQLITE_BUSY",
        }),
      )
      .mockResolvedValue(undefined);
    const pending = resetLocalFixtures(run);
    await vi.advanceTimersByTimeAsync(250);
    await pending;
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("surfaces the final lock unchanged after at most three attempts", async () => {
    const locked = failure();
    const run = vi.fn().mockRejectedValue(locked);
    const assertion = expect(resetLocalFixtures(run)).rejects.toBe(locked);
    await vi.runAllTimersAsync();
    await assertion;
    expect(run.mock.calls).toEqual([[30_000], [29_750], [29_250]]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not restart the budget after a slow failed attempt", async () => {
    const locked = failure();
    const run = vi.fn(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 29_800));
      throw locked;
    });
    const assertion = expect(resetLocalFixtures(run)).rejects.toBe(locked);
    await vi.runAllTimersAsync();
    await assertion;
    expect(run).toHaveBeenCalledExactlyOnceWith(30_000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("passes only the remaining budget to the next command", async () => {
    const run = vi
      .fn()
      .mockImplementationOnce(async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 28_000));
        throw failure();
      })
      .mockResolvedValue(undefined);
    const pending = resetLocalFixtures(run);
    await vi.runAllTimersAsync();
    await pending;
    expect(run.mock.calls).toEqual([[30_000], [1_750]]);
  });

  it("does not launch another command if the delay overruns the deadline", async () => {
    vi.spyOn(performance, "now")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValue(30_001);
    const locked = failure();
    const run = vi.fn().mockRejectedValue(locked);
    const assertion = expect(resetLocalFixtures(run)).rejects.toBe(locked);
    await vi.runAllTimersAsync();
    await assertion;
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("fails immediately if a retry reveals a permanent error", async () => {
    const invalidSchema = failure("no such table: users");
    const run = vi
      .fn()
      .mockRejectedValueOnce(failure())
      .mockRejectedValue(invalidSchema);
    const assertion = expect(resetLocalFixtures(run)).rejects.toBe(
      invalidSchema,
    );
    await vi.runAllTimersAsync();
    await assertion;
    expect(run).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    [
      "missing schema",
      failure("no such column: preferred_dashboard_appearance"),
    ],
    ["invalid SQL", failure("SQLITE_ERROR: syntax error")],
    ["missing lock code", failure("database is locked")],
    ["missing lock diagnostic", failure("SQLITE_BUSY: different failure")],
    [
      "different SQLite code",
      failure("database is locked: SQLITE_BUSY_RECOVERY"),
    ],
    ["killed process", failure(undefined, { killed: true })],
    ["signalled process", failure(undefined, { signal: "SIGTERM" })],
    ["missing executable", failure(undefined, { code: "ENOENT" })],
    ["timeout", failure(undefined, { code: "ETIMEDOUT" })],
    ["unstructured error", new Error("database is locked: SQLITE_BUSY")],
  ])("does not retry %s", async (_name, error) => {
    const run = vi.fn().mockRejectedValue(error);
    await expect(resetLocalFixtures(run)).rejects.toBe(error);
    expect(run).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
