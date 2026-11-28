import { expect, it, vi } from "vitest";
const { parseArguments, runCatalogOperator } = await import(
  new URL("../../scripts/worldwide-fax-catalog-operator.mjs", import.meta.url)
    .href
);

it("defaults to read-only inspection and requires an explicit version-bound production action", async () => {
  const workerVersionId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const operator = {
    status: vi.fn(async () => ({ workerVersionId })),
    initialize: vi.fn(async () => ({ catalog: { workerVersionId } })),
  };
  expect(parseArguments([])).toEqual({ initialize: false });
  expect(() => parseArguments(["--initialize-production"])).toThrow("USAGE");
  expect(() =>
    parseArguments(["--initialize-production", workerVersionId, "extra"]),
  ).toThrow("USAGE");
  const verify = vi.fn();
  await runCatalogOperator(operator, parseArguments(["--status"]), verify);
  expect(verify).not.toHaveBeenCalled();
  const options = parseArguments(["--initialize-production", workerVersionId]);
  await expect(
    runCatalogOperator(
      operator,
      { ...options, expectedVersion: "stale" },
      verify,
    ),
  ).rejects.toThrow("WORKER_VERSION_CHANGED");
  await expect(
    runCatalogOperator(operator, options, () => {
      throw new Error("STALE_RELEASE");
    }),
  ).rejects.toThrow("STALE_RELEASE");
  expect(operator.initialize).not.toHaveBeenCalled();
  await runCatalogOperator(operator, options, verify);
  expect(operator.initialize).toHaveBeenCalledExactlyOnceWith();
  operator.initialize.mockResolvedValueOnce({
    catalog: { workerVersionId: "changed" },
  });
  await expect(runCatalogOperator(operator, options, verify)).rejects.toThrow(
    "WORKER_VERSION_CHANGED_VERIFY_STATUS",
  );
});
