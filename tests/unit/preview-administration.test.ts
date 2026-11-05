import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPreviewApi,
  type PreviewAccount,
} from "../../apps/web/src/preview";
import type { Dispatch, Page } from "../../apps/web/src/api";
import { readPreviewAdministration } from "../../apps/web/src/preview-administration";
import type {
  AdministrationConnections,
  AdministrationConsumption,
  AdministrationDispatch,
  AdministrationOverview,
  AdministrationPage,
} from "../../packages/contracts/src/administration";

// The browser-only preview derives Administration from its own fictional
// workspace and must refuse what the server would refuse.
async function preview(account: PreviewAccount, counts = null) {
  const api = createPreviewApi({ advancedLocal: true });
  await api.configure({ account, seed: "administration-preview", counts });
  return api;
}

describe("preview Administration fixtures", () => {
  beforeEach(() =>
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("The preview cannot contact a backend.");
      }),
    ),
  );
  afterEach(() => {
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("summarizes the same fictional dispatches Correspondence lists", async () => {
    const api = await preview("admin");
    const dispatches = (await api.request("/dispatches")) as Page<{
      id: string;
      status: string;
    }>;
    const overview = (await api.request(
      "/administration/overview",
    )) as AdministrationOverview;
    expect(overview.totals.dispatches).toBe(dispatches.items.length);
    expect(overview.totals.attention).toBe(
      dispatches.items.filter((item) => item.status === "submission_unknown")
        .length,
    );
    expect(overview.trend).toHaveLength(30);
    expect(overview.workspace.mode).toBe("simulation");
    const activity = (await api.request(
      "/administration/activity?channel=fax&pageSize=10",
    )) as AdministrationPage<AdministrationDispatch>;
    expect(activity.items.every((item) => item.channel === "fax")).toBe(true);
    expect(JSON.stringify(activity)).not.toMatch(/\+331|example\.invalid/);
    const consumption = (await api.request(
      "/administration/consumption",
    )) as AdministrationConsumption;
    expect(consumption.totalMinor).toBe(
      consumption.services.reduce((sum, row) => sum + row.amountMinor, 0),
    );
  });

  it("selects consumption by confirmation date and groups each actual month", async () => {
    const api = await preview("admin");
    const dispatches = (await api.request("/dispatches")) as Page<Dispatch>;
    const sample = dispatches.items[0];
    const input = {
      now: "2026-12-05T12:00:00.000Z",
      workspace: { id: "preview_atelier", name: "Fictional workshop" },
      user: { name: "Fictional administrator" },
      dispatches: [
        {
          ...sample,
          status: "delivered",
          estimated_minor: 100,
          created_at: "2026-09-30T12:00:00.000Z",
          updated_at: "2026-10-31T23:59:59.999Z",
        },
        {
          ...sample,
          id: "preview_late_confirmation",
          status: "delivered",
          estimated_minor: 200,
          created_at: "2026-10-30T12:00:00.000Z",
          updated_at: "2026-11-01T00:00:00.000Z",
        },
        {
          ...sample,
          id: "preview_later_confirmation",
          status: "submitted",
          estimated_minor: 300,
          created_at: "2026-10-30T12:00:00.000Z",
          updated_at: "2026-12-01T00:00:00.000Z",
        },
      ],
      documents: [],
      members: [],
      credit: { grantedMinor: 1000, availableMinor: 400 },
      fail: (code: string): never => {
        throw new Error(code);
      },
    };
    const consumption = (from: string, to: string) =>
      readPreviewAdministration({
        ...input,
        path: `/administration/consumption?from=${from}&to=${to}`,
      }) as AdministrationConsumption;
    expect(consumption("2026-10-01", "2026-10-31")).toMatchObject({
      totalMinor: 100,
      daily: [{ date: "2026-10-31", amountMinor: 100, charges: 1 }],
      monthly: [{ month: "2026-10", amountMinor: 100, charges: 1 }],
    });
    expect(consumption("2026-11-01", "2026-11-30")).toMatchObject({
      totalMinor: 200,
      daily: [{ date: "2026-11-01", amountMinor: 200, charges: 1 }],
      monthly: [{ month: "2026-11", amountMinor: 200, charges: 1 }],
    });
    const combined = consumption("2026-10-01", "2026-11-30");
    expect(combined.totalMinor).toBe(300);
    expect(combined.monthly).toEqual([
      { month: "2026-10", amountMinor: 100, charges: 1 },
      { month: "2026-11", amountMinor: 200, charges: 1 },
    ]);
    expect(consumption("2026-09-01", "2026-09-30")).toMatchObject({
      totalMinor: 0,
      daily: [],
      monthly: [],
    });
  });

  it("filters sign-in history by period while retaining current connections", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-05T12:00:00.000Z"));
    const api = await preview("admin");
    const historical = (await api.request(
      "/administration/connections?from=2026-10-01&to=2026-10-31",
    )) as AdministrationConnections;
    expect(historical.current.total).toBe(1);
    expect(historical.events).toMatchObject({ total: 0, items: [] });
    const today = (await api.request(
      "/administration/connections?from=2026-11-05&to=2026-11-05",
    )) as AdministrationConnections;
    expect(today.events.total).toBe(1);
    expect(today.events.items[0].occurredAt).toBe("2026-11-05T12:00:00.000Z");
    const tomorrow = (await api.request(
      "/administration/connections?from=2026-11-06&to=2026-11-06",
    )) as AdministrationConnections;
    expect(tomorrow.current.total).toBe(1);
    expect(tomorrow.events).toMatchObject({ total: 0, items: [] });
  });

  it.each([
    "from=2026-13-01&to=2026-13-31",
    "from=2026-02-30&to=2026-03-04",
    "from=2026-02-29&to=2026-03-04",
    "from=2026-11-02&to=2026-11-01",
    "pageSize=foo",
    "pageSize=0",
    "pageSize=101",
    "pageSize=2.5",
    "page=foo",
    "page=0",
    "page=1001",
    "page=2.5",
  ])("refuses invalid date and pagination filters: %s", async (query) => {
    const api = await preview("admin");
    await expect(
      api.request(`/administration/activity?${query}`),
    ).rejects.toMatchObject({ code: "INVALID_FILTERS", status: 400 });
  });

  it("accepts inclusive leap-year periods and the server pagination bounds", async () => {
    const api = await preview("admin");
    await expect(
      api.request(
        "/administration/activity?from=2024-01-01&to=2024-12-31&page=1000&pageSize=100",
      ),
    ).resolves.toMatchObject({ items: [], page: 1000, pageSize: 100 });
    const first = (await api.request(
      "/administration/activity?page=1&pageSize=1",
    )) as AdministrationPage<AdministrationDispatch>;
    const second = (await api.request(
      "/administration/activity?page=2&pageSize=1",
    )) as AdministrationPage<AdministrationDispatch>;
    expect(first.items).toHaveLength(1);
    expect(second.items).toHaveLength(1);
    expect(second.items[0].id).not.toBe(first.items[0].id);
    expect(second.total).toBe(first.total);
  });

  it("applies the server's report and member-management permissions", async () => {
    const supervisor = await preview("supervisor");
    await expect(
      supervisor.request("/administration/overview"),
    ).resolves.toBeTruthy();
    for (const resource of ["members", "connections", "audit"])
      await expect(
        supervisor.request(`/administration/${resource}`),
      ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    const viewer = await preview("viewer");
    await expect(
      viewer.request("/administration/overview"),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("refuses periods the server refuses and volume scenarios it cannot sum", async () => {
    const api = await preview("admin");
    await expect(
      api.request("/administration/overview?from=2026-01-01&to=2027-06-01"),
    ).rejects.toMatchObject({ code: "INVALID_FILTERS", status: 400 });
    const volume = await preview("admin", {
      documents: 1000,
      dispatches: 1000,
      templates: 10,
      datasets: 10,
      generations: 10,
    } as never);
    await expect(
      volume.request("/administration/overview"),
    ).rejects.toMatchObject({
      code: "PREVIEW_ADMINISTRATION_DEFAULT_ONLY",
      status: 409,
    });
  });
});
