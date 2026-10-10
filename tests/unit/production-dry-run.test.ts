import { describe, expect, it, vi } from "vitest";
import { inspectProductionDispatches } from "../../scripts/production-dry-run";

const now = Date.parse("2026-10-10T00:00:00.000Z");
const evidence = () => ({
  schema: 1,
  execution: "validation_only",
  dispatchId: "dsp_fixture",
  fingerprint: "a".repeat(64),
  dispatchMode: "production",
  checkedAt: new Date(now).toISOString(),
  status: "partial",
  checks: [
    { id: "prepared_state", status: "passed" },
    { id: "submission_not_started", status: "passed" },
    { id: "quote", status: "passed" },
    { id: "protected_document", status: "not_checked", code: "NOT_APPLICABLE" },
    {
      id: "recipient_suppression",
      status: "not_checked",
      code: "NOT_APPLICABLE",
    },
    { id: "acceptance", status: "not_checked", code: "NOT_EXECUTED" },
    { id: "provider_delivery", status: "not_checked", code: "NOT_EXECUTED" },
  ],
});
function inspect(fetchImpl: typeof fetch, dispatchIds = ["dsp_fixture"]) {
  return inspectProductionDispatches({
    dispatchIds,
    token: "synthetic-token-only",
    fetchImpl,
    now: () => now,
  });
}
describe("production dry-run runner", () => {
  it("only makes authenticated canonical GETs and redacts identifiers from partial evidence", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(evidence()));
    const result = await inspect(fetcher);
    expect(result).toMatchObject({
      status: "validation_passed",
      qualification: "partial",
      execution: "validation_only",
      scenarios: [{ scenario: 1, status: "validation_passed" }],
    });
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://guteneo.com/api/dispatches/dsp_fixture/dry-run");
    expect(options).toMatchObject({
      method: "GET",
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
      headers: { Authorization: "Bearer synthetic-token-only" },
    });
    expect(options?.body).toBeUndefined();
    expect(JSON.stringify(result)).not.toMatch(
      /dsp_fixture|aaaaaaaa|synthetic-token/,
    );
    expect(result.scenarios[0]).toMatchObject({
      checks: expect.arrayContaining([
        {
          id: "provider_delivery",
          status: "not_checked",
          code: "NOT_EXECUTED",
        },
      ]),
    });
  });
  it("preserves a blocked quote without preparing or retrying it", async () => {
    const data = evidence();
    data.status = "blocked";
    data.checks[2] = {
      id: "quote",
      status: "blocked",
      code: "LIVE_QUOTE_INVALID",
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(data));
    expect(await inspect(fetcher)).toMatchObject({
      status: "attention",
      scenarios: [{ status: "blocked" }],
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it.each([
    (d: ReturnType<typeof evidence>) => ({ ...d, dispatchMode: "simulation" }),
    (d: ReturnType<typeof evidence>) => ({ ...d, dispatchId: "dsp_other" }),
    (d: ReturnType<typeof evidence>) => ({
      ...d,
      checkedAt: new Date(now - 120001).toISOString(),
    }),
    (d: ReturnType<typeof evidence>) => ({
      ...d,
      checkedAt: new Date(now + 30001).toISOString(),
    }),
    (d: ReturnType<typeof evidence>) => ({ ...d, checks: [] }),
    (d: ReturnType<typeof evidence>) => ({
      ...d,
      checks: [...d.checks.slice(1), d.checks[1]],
    }),
    (d: ReturnType<typeof evidence>) => ({
      ...d,
      checks: d.checks.map((c) =>
        c.id === "provider_delivery" ? { ...c, status: "passed" } : c,
      ),
    }),
    (d: ReturnType<typeof evidence>) => ({ ...d, status: "blocked" }),
    (d: ReturnType<typeof evidence>) => ({
      ...d,
      recipient: "must-not-be-accepted@example.invalid",
    }),
  ])(
    "rejects stale, simulated, incomplete or overclaimed evidence",
    async (change) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json(change(evidence())));
      expect(await inspect(fetcher)).toMatchObject({
        status: "attention",
        scenarios: [{ status: "unavailable", code: "NO_VALID_EVIDENCE" }],
      });
    },
  );
  it("never emits server errors, oversized bodies or network details", async () => {
    for (const response of [
      new Response("secret recipient token", { status: 401 }),
      new Response("x".repeat(65537), {
        headers: { "content-type": "application/json" },
      }),
      new Response("secret", { headers: { "content-type": "text/html" } }),
    ]) {
      const result = await inspect(
        vi.fn<typeof fetch>().mockResolvedValue(response),
      );
      expect(result.status).toBe("attention");
      expect(JSON.stringify(result)).not.toMatch(/secret|recipient|token/);
    }
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("redirect with secret"));
    const result = await inspect(fetcher);
    expect(result.status).toBe("attention");
    expect(JSON.stringify(result)).not.toMatch(/secret/);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("rejects invalid or excessive targets before touching the network", async () => {
    const fetcher = vi.fn<typeof fetch>();
    for (const ids of [
      [],
      ["../confirm"],
      ["dsp_fixture", "dsp_fixture"],
      Array.from({ length: 11 }, (_, i) => `dsp_${i}`),
    ])
      await expect(inspect(fetcher, ids)).rejects.toThrow();
    await expect(
      inspectProductionDispatches({
        dispatchIds: ["dsp_fixture"],
        token: "",
        fetchImpl: fetcher,
      }),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
