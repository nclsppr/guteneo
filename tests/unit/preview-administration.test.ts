import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPreviewApi,
  type PreviewAccount,
} from "../../apps/web/src/preview";
import type { Page } from "../../apps/web/src/api";
import type {
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

  it("applies the server's report and member-management permissions", async () => {
    const supervisor = await preview("supervisor");
    await expect(
      supervisor.request("/administration/overview"),
    ).resolves.toBeTruthy();
    await expect(
      supervisor.request("/administration/members"),
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
