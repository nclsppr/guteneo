import { describe, expect, it } from "vitest";
import type {
  BelvedereConnections,
  BelvedereFinance,
  BelvedereJob,
  BelvedereMember,
  BelvedereOverview,
  BelvederePage,
  BelvedereWorkshop,
  BelvedereWorkshopDetail,
} from "../../packages/contracts/src/belvedere";
import { fixtureBase, fixtureResponse } from "../fixtures/belvedere";
import {
  LocalBelvedereScenarioError,
  localBelvedereLanguage,
  localBelvedereResponse,
  localBelvedereScenario,
  type LocalBelvedereScenario,
} from "../fixtures/local-belvedere";

const scenario = localBelvedereScenario(
  new URLSearchParams({
    seed: "repeatable-fiction",
    documents: "2001",
    dispatches: "721",
    members: "37",
    connections: "1000",
  }),
);
function read<T>(
  path: string,
  extra: Record<string, string> = {},
  profile = scenario,
): T {
  const url = new URL(`http://127.0.0.1:8794${fixtureBase}/api${path}`);
  url.search = new URLSearchParams({
    from: "2026-08-01",
    to: "2026-10-30",
    mode: "simulation",
    ...extra,
  }).toString();
  return localBelvedereResponse(url, profile) as T;
}
function all<T>(
  path: string,
  extra: Record<string, string> = {},
  profile = scenario,
): T[] {
  const first = read<BelvederePage<T>>(
    path,
    { ...extra, pageSize: "50" },
    profile,
  );
  const items = [...first.items];
  for (let page = 2; page <= Math.ceil(first.total / first.pageSize); page++)
    items.push(
      ...read<BelvederePage<T>>(
        path,
        { ...extra, pageSize: "50", page: String(page) },
        profile,
      ).items,
    );
  return items;
}

describe("loopback Belvedere virtual scenarios", () => {
  it.each(["fr", "en", "de", "lb"])(
    "preserves supported %s entry language separately from the fixture identity",
    (lang) => {
      const query = new URLSearchParams({ seed: "repeatable-fiction", lang });
      expect(localBelvedereLanguage(query)).toBe(lang);
      expect(localBelvedereScenario(query)).toEqual(
        localBelvedereScenario(
          new URLSearchParams({ seed: "repeatable-fiction" }),
        ),
      );
    },
  );
  it("ignores absent, unsupported or duplicate entry language parameters", () => {
    expect(localBelvedereLanguage(new URLSearchParams())).toBeNull();
    expect(
      localBelvedereLanguage(new URLSearchParams({ lang: "unsupported" })),
    ).toBeNull();
    expect(
      localBelvedereLanguage(new URLSearchParams("lang=fr&lang=de")),
    ).toBeNull();
  });
  it("preserves the original dedicated preview defaults", () => {
    const url = new URL(
      `http://127.0.0.1:8794${fixtureBase}/api/workshops?from=2026-10-01&to=2026-10-30`,
    );
    const data = fixtureResponse(url) as BelvederePage<BelvedereWorkshop>;
    expect(data.items).toHaveLength(6);
    expect(data.items[0].name).toBe("Atelier des Rives");
    expect(data.items[0].id).toBe("fixture-workshop-1");
  });

  it("accepts the local control's counts JSON without expanding records", () => {
    const counts = {
      documents: 1_000_000_000,
      dispatches: 500_000,
      templates: 10,
      datasets: 20,
      generations: 30,
    };
    expect(
      localBelvedereScenario(
        new URLSearchParams({
          seed: "UTF-8 · Lëtzebuerg 🐦",
          counts: JSON.stringify(counts),
        }),
      ).counts,
    ).toEqual(counts);
    expect(() =>
      localBelvedereScenario(new URLSearchParams({ counts: "null" })),
    ).toThrow(LocalBelvedereScenarioError);
    expect(() =>
      localBelvedereScenario(
        new URLSearchParams({ counts: '{"dispatches":"100"}' }),
      ),
    ).toThrow(LocalBelvedereScenarioError);
    expect(() =>
      localBelvedereScenario(
        new URLSearchParams({ counts: '{"unexpected":100}' }),
      ),
    ).toThrow(LocalBelvedereScenarioError);
  });

  it("returns reproducible metadata and distinct seeded identities", () => {
    expect(read("/jobs")).toEqual(read("/jobs"));
    const other = { ...scenario, seed: "another-fiction" };
    expect(read<BelvederePage<BelvedereJob>>("/jobs").items[0].id).not.toBe(
      read<BelvederePage<BelvedereJob>>("/jobs", {}, other).items[0].id,
    );
  });

  it("computes aggregate totals from the same logical rows as paged views", () => {
    const jobs = all<BelvedereJob>("/jobs");
    const overview = read<BelvedereOverview>("/overview");
    const finance = read<BelvedereFinance>("/finance");
    expect(jobs).toHaveLength(721);
    expect(new Set(jobs.map((item) => item.id)).size).toBe(721);
    expect(overview.totals.dispatches).toBe(jobs.length);
    expect(overview.totals.pages).toBe(
      jobs.reduce((sum, item) => sum + (item.pages ?? 0), 0),
    );
    expect(overview.totals.customerConsumptionMinor).toBe(
      jobs.reduce((sum, item) => sum + (item.customerActualMinor ?? 0), 0),
    );
    expect(overview.totals.reservedMinor).toBe(
      jobs.reduce((sum, item) => sum + item.reservedMinor, 0),
    );
    expect(overview.totals.delivered).toBe(
      jobs.filter((item) => item.status === "delivered").length,
    );
    expect(
      overview.channels.reduce((sum, item) => sum + item.dispatches, 0),
    ).toBe(jobs.length);
    expect(
      overview.statuses.reduce((sum, item) => sum + item.dispatches, 0),
    ).toBe(jobs.length);
    expect(
      overview.distributionCountries.reduce(
        (sum, item) => sum + item.dispatches,
        0,
      ),
    ).toBe(jobs.length);
    expect(overview.trend.reduce((sum, item) => sum + item.dispatches, 0)).toBe(
      jobs.length,
    );
    expect(finance.customerConsumptionMinor).toBe(
      overview.totals.customerConsumptionMinor,
    );
    expect(
      finance.monthly.reduce((sum, item) => sum + item.consumptionMinor, 0),
    ).toBe(finance.customerConsumptionMinor);
    expect(finance.netResultMinor).toBeNull();
    expect(finance.cashReceived).toEqual([]);
  });

  it("keeps server filters and selected dates consistent with complete results", () => {
    const allJobs = all<BelvedereJob>("/jobs");
    const cases: Record<string, string>[] = [
      { channel: "postal" },
      { status: "failed" },
      { country: "unknown" },
      { statusGroup: "attention" },
      { channel: "fax", country: "LU" },
    ];
    for (const filters of cases) {
      const expected = allJobs.filter(
        (job) =>
          (!filters.channel || job.channel === filters.channel) &&
          (!filters.status || job.status === filters.status) &&
          (!filters.country ||
            (filters.country === "unknown"
              ? job.destinationCountry === null
              : job.destinationCountry === filters.country)) &&
          (!filters.statusGroup ||
            ["failed", "submission_unknown"].includes(job.status)),
      );
      expect(
        all<BelvedereJob>("/jobs", filters).map((item) => item.id),
      ).toEqual(expected.map((item) => item.id));
    }
    const recent = allJobs.filter(
      (job) => job.createdAt.slice(0, 10) >= "2026-10-24",
    );
    expect(
      read<BelvedereOverview>("/overview", { from: "2026-10-24" }).totals
        .dispatches,
    ).toBe(recent.length);
  });

  it("preserves workshop associations and paginates members independently", () => {
    const workshops =
      read<BelvederePage<BelvedereWorkshop>>("/workshops").items;
    expect(workshops.reduce((sum, item) => sum + item.documents, 0)).toBe(
      scenario.counts.documents,
    );
    expect(workshops.reduce((sum, item) => sum + item.dispatches, 0)).toBe(
      scenario.counts.dispatches,
    );
    expect(workshops.reduce((sum, item) => sum + item.members, 0)).toBe(
      scenario.members,
    );
    for (const workshop of workshops) {
      const detail = read<BelvedereWorkshopDetail>(`/workshops/${workshop.id}`);
      expect(detail.workshop).toEqual(workshop);
      expect(detail.dispatches.total).toBe(workshop.dispatches);
      expect(detail.membersTotal).toBe(workshop.members);
      expect(
        detail.members.every(
          (member) => member.workshops[0].id === workshop.id,
        ),
      ).toBe(true);
    }
  });

  it("keeps connection identities and active member totals consistent", () => {
    const members = all<BelvedereMember>("/members");
    const data = read<BelvedereConnections>("/connections", { pageSize: "50" });
    const overview = read<BelvedereOverview>("/overview");
    expect(
      members.reduce((sum, member) => sum + member.activeConnections, 0),
    ).toBe(data.current.total);
    expect(overview.totals.activeConnections).toBe(data.current.total);
    const byId = new Map(members.map((member) => [member.id, member]));
    for (const connection of data.current.items) {
      expect(connection.userName).toBe(byId.get(connection.userId)?.name);
      expect(connection.workshopId).toBe(
        byId.get(connection.userId)?.workshops[0].id,
      );
    }
    expect(new Set(members.map((member) => member.workshops[0].role))).toEqual(
      new Set(["admin", "supervisor", "member", "viewer"]),
    );
  });

  it("indexes a billion logical records without materializing the collection", () => {
    const huge: LocalBelvedereScenario = {
      seed: "billion-scale",
      counts: {
        documents: 1_000_000_000,
        dispatches: 1_000_000_000,
        templates: 1_000_000_000,
        datasets: 1_000_000_000,
        generations: 1_000_000_000,
      },
      members: 1_000_000_000,
      connections: 1_000_000_000,
    };
    const first = read<BelvederePage<BelvedereJob>>(
      "/jobs",
      { pageSize: "999999999" },
      huge,
    );
    const last = read<BelvederePage<BelvedereMember>>(
      "/members",
      { pageSize: "50", page: "999999999" },
      huge,
    );
    expect(first.total).toBe(1_000_000_000);
    expect(first.items).toHaveLength(50);
    expect(last.total).toBe(1_000_000_000);
    expect(last.page).toBe(20_000_000);
    expect(last.items).toHaveLength(50);
    expect(last.items.at(-1)?.id).toMatch(/_1000000000$/);
    expect(
      read<BelvedereOverview>("/overview", {}, huge).totals.dispatches,
    ).toBe(1_000_000_000);
    expect(JSON.stringify(first).length).toBeLessThan(100_000);
  });

  it("finds exact high-index seeded IDs and leaves unmatched searches empty", () => {
    const job = read<BelvederePage<BelvedereJob>>("/jobs", {
      page: "999999999",
    }).items.at(-1)!;
    const found = read<BelvederePage<BelvedereJob>>("/jobs", { q: job.id });
    expect(found.total).toBe(1);
    expect(found.items).toEqual([job]);
    expect(
      read<BelvederePage<BelvedereJob>>("/jobs", { q: "absent workshop" })
        .total,
    ).toBe(0);
    expect(
      read<BelvederePage<BelvedereMember>>("/members", {
        q: "CAMILLE",
      }).items.every((member) => member.name === "Camille Martin"),
    ).toBe(true);
  });

  it("indexes exact fictional email searches across a billion members", () => {
    const huge = { ...scenario, members: 1_000_000_000 };
    const found = read<BelvederePage<BelvedereMember>>(
      "/members",
      {
        q: "FICTIONAL-1000000000@EXAMPLE.INVALID",
      },
      huge,
    );
    expect(found.total).toBe(1);
    expect(found.items).toHaveLength(1);
    expect(found.items[0].email).toBe("fictional-1000000000@example.invalid");
    expect(found.items[0].id).toMatch(/_1000000000$/);
    expect(
      read<BelvederePage<BelvedereMember>>(
        "/members",
        {
          q: "fictional-1000000001@example.invalid",
        },
        huge,
      ).total,
    ).toBe(0);
  });

  it("handles empty virtual collections without invented financial or active data", () => {
    const empty = localBelvedereScenario(
      new URLSearchParams({
        documents: "0",
        dispatches: "0",
        members: "0",
        connections: "0",
      }),
    );
    expect(read<BelvederePage<BelvedereJob>>("/jobs", {}, empty).items).toEqual(
      [],
    );
    const overview = read<BelvedereOverview>("/overview", {}, empty);
    expect(overview.totals.dispatches).toBe(0);
    expect(overview.totals.activeConnections).toBe(0);
    expect(overview.totals.customerConsumptionMinor).toBe(0);
    expect(read<BelvedereFinance>("/finance", {}, empty).monthly).toEqual([]);
  });

  it.each(["-1", "1000000001", "1.5", "Infinity", "NaN", "1e9"])(
    "rejects invalid count %s",
    (dispatches) => {
      expect(() =>
        localBelvedereScenario(new URLSearchParams({ dispatches })),
      ).toThrow(LocalBelvedereScenarioError);
    },
  );
  it("rejects invalid seeds and date ranges", () => {
    expect(() =>
      localBelvedereScenario(new URLSearchParams({ seed: " " })),
    ).toThrow(LocalBelvedereScenarioError);
    expect(() =>
      localBelvedereScenario(new URLSearchParams({ seed: "x".repeat(129) })),
    ).toThrow(LocalBelvedereScenarioError);
    expect(() => read("/overview", { from: "2026-02-30" })).toThrow(
      LocalBelvedereScenarioError,
    );
    expect(() => read("/overview", { from: "2026-10-31" })).toThrow(
      LocalBelvedereScenarioError,
    );
  });
});
