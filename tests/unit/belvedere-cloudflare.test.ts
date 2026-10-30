import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getBelvedereCloudflareMetrics,
  type BelvedereCloudflareWindow,
} from "../../apps/api/src/belvedere-cloudflare";
import type { Fetcher } from "../../packages/providers/types";

// Fictional provider data using the documented Cloudflare GraphQL structure.
// This is contract evidence, not live Cloudflare account qualification.
const env = {
  BELVEDERE_CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
  BELVEDERE_CLOUDFLARE_API_TOKEN: "fictional-analytics-token-never-real",
  BELVEDERE_CLOUDFLARE_SCRIPT_NAME: "guteneo-fixture",
};
const now = new Date("2026-10-02T12:30:00.000Z");
const sums = { requests: 120, errors: 3, subrequests: 48 };
function fixture() {
  return {
    data: {
      viewer: {
        accounts: [
          {
            aggregate: [
              {
                sum: { ...sums },
                quantiles: { wallTimeP50: 27.5, wallTimeP99: 249.125 },
              },
            ],
            hourly: [
              {
                dimensions: { datetimeHour: "2026-10-02T12:00:00Z" },
                sum: { requests: 20, errors: 0, subrequests: 8 },
              },
              {
                dimensions: { datetimeHour: "2026-10-02T11:00:00Z" },
                sum: { requests: 100, errors: 3, subrequests: 40 },
              },
            ],
          },
        ],
      },
    },
    errors: null,
  };
}
function network(payload: unknown = fixture()) {
  return vi.fn<Fetcher>(async () =>
    payload instanceof Response
      ? payload
      : new Response(JSON.stringify(payload)),
  );
}

afterEach(() => vi.useRealTimers());

describe("Belvedere read-only Cloudflare analytics", () => {
  it.each([
    ["24h", "2026-10-01T12:30:00.000Z"],
    ["7d", "2026-09-25T12:30:00.000Z"],
  ] as const)(
    "reads only the configured Worker for %s",
    async (window, start) => {
      const fetcher = network();
      const result = await getBelvedereCloudflareMetrics(env, window, {
        now,
        fetcher,
      });
      expect(result.status).toBe("ok");
      expect(result.metrics).toEqual({
        ...sums,
        errorRate: 0.025,
        wallTimeP50Milliseconds: 27.5,
        wallTimeP99Milliseconds: 249.125,
      });
      expect(result.sampled).toBe(true);
      expect(result.billing).toEqual({
        status: "unavailable",
        amountMinor: null,
        currency: null,
      });
      expect(result.startAt).toBe(start);
      expect(result.endAt).toBe(now.toISOString());
      expect(result.series.map((row) => row.hour)).toEqual([
        "2026-10-02T11:00:00.000Z",
        "2026-10-02T12:00:00.000Z",
      ]);
      expect(fetcher).toHaveBeenCalledTimes(1);
      const [url, request] = fetcher.mock.calls[0]!;
      expect(url).toBe("https://api.cloudflare.com/client/v4/graphql");
      expect(request).toMatchObject({
        method: "POST",
        redirect: "manual",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${env.BELVEDERE_CLOUDFLARE_API_TOKEN}`,
        },
      });
      const body = JSON.parse(request!.body as string);
      expect(body.variables).toEqual({
        accountTag: env.BELVEDERE_CLOUDFLARE_ACCOUNT_ID,
        scriptName: env.BELVEDERE_CLOUDFLARE_SCRIPT_NAME,
        start,
        end: now.toISOString(),
      });
      expect(body.query).toContain("aggregate: workersInvocationsAdaptive");
      expect(body.query).toContain("quantiles { wallTimeP50 wallTimeP99 }");
      expect(body.query).toContain("datetime_lt: $end");
      expect(body.query).not.toContain("mutation");
      expect(JSON.stringify(result)).not.toContain(
        env.BELVEDERE_CLOUDFLARE_API_TOKEN,
      );
      expect(JSON.stringify(result)).not.toContain(
        env.BELVEDERE_CLOUDFLARE_ACCOUNT_ID,
      );
    },
  );

  it.each([
    {},
    { ...env, BELVEDERE_CLOUDFLARE_ACCOUNT_ID: "other-account" },
    { ...env, BELVEDERE_CLOUDFLARE_API_TOKEN: "secret\r\ninjected" },
    { ...env, BELVEDERE_CLOUDFLARE_SCRIPT_NAME: "../../other-worker" },
    { ...env, BELVEDERE_CLOUDFLARE_SCRIPT_NAME: "" },
  ])(
    "makes no request with absent or invalid configuration",
    async (config) => {
      const fetcher = network();
      const result = await getBelvedereCloudflareMetrics(config, "24h", {
        now,
        fetcher,
      });
      expect(result.status).toBe("not_configured");
      expect(result.metrics).toBeNull();
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("cannot expand the time window through an unchecked caller", async () => {
    const fetcher = network();
    const result = await getBelvedereCloudflareMetrics(
      env,
      "365d" as BelvedereCloudflareWindow,
      { now, fetcher },
    );
    expect(result.status).toBe("unavailable");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([401, 403, 429, 500, 302])(
    "handles HTTP %s without retrying, following redirects or returning provider text",
    async (status) => {
      const fetcher = network(
        new Response("private provider error with token", { status }),
      );
      const result = await getBelvedereCloudflareMetrics(env, "24h", {
        now,
        fetcher,
      });
      expect(result.status).toBe(
        status === 401 || status === 403 ? "forbidden" : "unavailable",
      );
      expect(result.metrics).toBeNull();
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(result)).not.toContain("private provider");
    },
  );

  it.each([
    [
      { message: "not authorized for that account: secret-account" },
      "forbidden",
    ],
    [{ extensions: { code: "FORBIDDEN" } }, "forbidden"],
    [{ message: "query budget exceeded: private-details" }, "unavailable"],
  ])(
    "rejects GraphQL errors even with HTTP 200 and partial data",
    async (error, status) => {
      const result = await getBelvedereCloudflareMetrics(env, "24h", {
        now,
        fetcher: network({ ...fixture(), errors: [error] }),
      });
      expect(result.status).toBe(status);
      expect(result.metrics).toBeNull();
      expect(JSON.stringify(result)).not.toContain("secret-account");
      expect(JSON.stringify(result)).not.toContain("private-details");
    },
  );

  it("separates an empty dataset from failure and from real zero-cost evidence", async () => {
    const payload = fixture();
    payload.data.viewer.accounts[0]!.aggregate = [];
    payload.data.viewer.accounts[0]!.hourly = [];
    const result = await getBelvedereCloudflareMetrics(env, "24h", {
      now,
      fetcher: network(payload),
    });
    expect(result.status).toBe("no_data");
    expect(result.metrics).toBeNull();
    expect(result.billing.amountMinor).toBeNull();
  });

  it("does not turn an inaccessible account into an empty dataset", async () => {
    const result = await getBelvedereCloudflareMetrics(env, "24h", {
      now,
      fetcher: network({ data: { viewer: { accounts: [] } }, errors: null }),
    });
    expect(result.status).toBe("unavailable");
  });

  it.each([
    "2026-09-30T12:00:00Z",
    "2026-10-02T13:00:00Z",
    "2026-10-02T11:30:00Z",
    "private-invalid-timestamp",
  ])("rejects unexpected hourly data %s", async (hour) => {
    const payload = fixture();
    payload.data.viewer.accounts[0]!.hourly[0]!.dimensions.datetimeHour = hour;
    const result = await getBelvedereCloudflareMetrics(env, "24h", {
      now,
      fetcher: network(payload),
    });
    expect(result.status).toBe("unavailable");
    expect(result.series).toEqual([]);
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "120", null])(
    "rejects invalid request count %s instead of coercing it",
    async (requests) => {
      const payload = fixture();
      Object.assign(payload.data.viewer.accounts[0]!.aggregate[0]!.sum, {
        requests,
      });
      const result = await getBelvedereCloudflareMetrics(env, "24h", {
        now,
        fetcher: network(payload),
      });
      expect(result.status).toBe("unavailable");
    },
  );

  it("rejects duplicate buckets rather than double-counting", async () => {
    const payload = fixture();
    payload.data.viewer.accounts[0]!.hourly.push(
      payload.data.viewer.accounts[0]!.hourly[0]!,
    );
    const result = await getBelvedereCloudflareMetrics(env, "24h", {
      now,
      fetcher: network(payload),
    });
    expect(result.status).toBe("unavailable");
  });

  it("bounds both body size and processing without echoing invalid responses", async () => {
    const result = await getBelvedereCloudflareMetrics(env, "24h", {
      now,
      fetcher: network(new Response("private".repeat(30_000))),
    });
    expect(result.status).toBe("unavailable");
    expect(JSON.stringify(result)).not.toContain("private");
  });

  it("stops after eight seconds even when a transport ignores AbortSignal", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<Fetcher>(() => new Promise(() => undefined));
    const pending = getBelvedereCloudflareMetrics(env, "24h", { now, fetcher });
    await vi.advanceTimersByTimeAsync(8_000);
    const result = await pending;
    expect(result.status).toBe("unavailable");
    expect(fetcher.mock.calls[0]![1]!.signal!.aborted).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("also bounds a response body that never finishes", async () => {
    vi.useFakeTimers();
    const response = new Response(new ReadableStream());
    const pending = getBelvedereCloudflareMetrics(env, "24h", {
      now,
      fetcher: network(response),
    });
    await vi.advanceTimersByTimeAsync(8_000);
    expect((await pending).status).toBe("unavailable");
  });
});
