import { afterEach, describe, expect, it, vi } from "vitest";
import {
  downloadExport,
  presetPeriod,
  readPeriod,
} from "../../apps/web/src/administration-data";
import {
  canonicalApplicationRoute,
  navigationEntryFor,
  spaceOf,
} from "../../apps/web/src/app-routes";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("administration periods and navigation", () => {
  it("falls back from malformed, reversed or unbounded URL dates without throwing", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-03T16:20:00Z"));
    for (const query of [
      "from=2026-99-99&to=2026-11-03",
      "from=2026-11-01&to=2026-99-99",
      "from=2026-02-30&to=2026-03-01",
      "from=not-a-date&to=2026-11-03",
      "from=2026-11-04&to=2026-11-03",
      "from=2025-01-01&to=2026-11-03",
      "from=2026-11-01",
    ])
      expect(readPeriod(`/app/administration?${query}`)).toEqual(
        presetPeriod(30),
      );
    expect(
      readPeriod("/app/administration?from=2024-02-29&to=2024-03-01"),
    ).toEqual({ from: "2024-02-29", to: "2024-03-01" });
    expect(
      readPeriod("/app/administration?from=2026-11-03&to=2026-11-03"),
    ).toEqual({ from: "2026-11-03", to: "2026-11-03" });
  });
  it("retains queries in former management addresses and identifies their application", () => {
    for (const [old, next, entry] of [
      ["admin", "members", "administrationMembers"],
      ["usage", "consumption", "administrationConsumption"],
      ["billing", "billing", "administrationBilling"],
    ]) {
      const route = canonicalApplicationRoute(
        `/app/${old}?return=portal&from=2026-10-01`,
      );
      expect(route).toBe(
        `/app/administration/${next}?return=portal&from=2026-10-01`,
      );
      expect(spaceOf(route)).toBe("administration");
      expect(navigationEntryFor(route)).toBe(entry);
      expect(canonicalApplicationRoute(`/app/${old}-archive`)).toBe(
        `/app/${old}-archive`,
      );
    }
  });
  it("suppresses a late export after its view aborts, even if the transport ignores cancellation", async () => {
    let resolve!: (response: Response) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    const url = vi.spyOn(URL, "createObjectURL");
    const controller = new AbortController();
    const result = downloadExport(
      "activity",
      "csv",
      { from: "2026-10-01", to: "2026-10-31" },
      controller.signal,
    );
    const rejected = expect(result).rejects.toMatchObject({
      name: "AbortError",
    });
    controller.abort();
    resolve(
      new Response("synthetic", { headers: { "Content-Type": "text/csv" } }),
    );
    await rejected;
    expect(url).not.toHaveBeenCalled();
    expect(fetcher.mock.calls[0]).toHaveLength(2);
  });
});
