/** Fictional, deterministic UI evidence. Never imported by the application. */
import type {
  BelvedereFilters,
  BelvedereWorkshop,
  BelvedereMember,
  BelvedereDispatch,
  BelvedereJob,
  BelvedereOverview,
  BelvedereFinance,
  BelvedereConnection,
  BelvedereWorkshopDetail,
} from "../../packages/contracts/src/belvedere";

export const fixtureBase = "/belvedere/fictional-local-preview";
const names = [
  "Atelier des Rives",
  "Maison Papier",
  "Studio Minuit",
  "Les Éditions du Parc",
  "Bureau des Correspondances",
  "Imprimerie du Passage",
];
const people = [
  "Camille Martin",
  "Alex Bernard",
  "Louise Weber",
  "Sacha Muller",
  "Léa Fontaine",
  "Noah Petit",
  "Emma Simon",
  "Jules Laurent",
  "Alice Robert",
  "Gabriel Thomas",
  "Mila Moreau",
  "Louis Dubois",
];
const countries = ["FR", "LU", "BE", "DE", null, "CH"];
export function fixtureResponse(url: URL): unknown {
  const toValue = url.searchParams.get("to") || new Date().toISOString();
  const to = toValue.length === 10 ? toValue + "T23:59:59.999Z" : toValue;
  const from =
    url.searchParams.get("from") ||
    new Date(new Date(to).getTime() - 30 * 86400000).toISOString();
  const filters: BelvedereFilters = {
    from,
    to,
    mode: (url.searchParams.get("mode") ||
      "production") as BelvedereFilters["mode"],
  };
  const generatedAt = new Date(to).toISOString();
  const at = (days: number) =>
    new Date(new Date(to).getTime() - days * 86400000).toISOString();
  const mode = filters.mode === "simulation" ? "simulation" : "production";
  const dispatches: BelvedereDispatch[] = Array.from(
    { length: 126 },
    (_, i) => ({
      id: `fixture-dispatch-${String(i + 1).padStart(3, "0")}`,
      channel: ["postal", "email", "fax"][i % 3],
      mode,
      status:
        i < 2
          ? "submission_unknown"
          : i < 5
            ? "failed"
            : i < 12
              ? "queued"
              : "delivered",
      createdAt: at(((i * i + 3 * i + 5) % 29) + 0.15),
      pages: i % 3 === 1 ? null : (i % 6) + 1,
      customerActualMinor: i < 12 ? null : [185, 100, 27][i % 3],
      transportActualMinor: i < 12 ? null : [185, 100, 27][i % 3],
      hostingFeeMinor: 0,
      deliveryMode: i % 3 === 1 ? ("none" as const) : null,
      reservedMinor: i >= 5 && i < 12 ? 220 : 0,
      supplierVerifiedMinor: i > 11 && i % 3 === 2 ? 12 : null,
      supplierCurrency: i > 11 && i % 3 === 2 ? "USD" : null,
      estimatedMinor: [185, 100, 27][i % 3],
      ceilingMinor: 220,
    }),
  ).filter((d) => d.createdAt >= from && d.createdAt <= to);
  const workshops: BelvedereWorkshop[] = names.map((name, i) => {
    const entries = dispatches.filter((_, j) => j % 6 === i);
    return {
      id: `fixture-workshop-${i + 1}`,
      name,
      mode,
      createdAt: at(100 + i),
      members: 2,
      dispatches: entries.length,
      documents: 11 + i,
      pages: entries.reduce((a, d) => a + (d.pages || 0), 0),
      consumptionMinor: entries.reduce(
        (a, d) => a + (d.customerActualMinor || 0),
        0,
      ),
      reservedMinor: entries.reduce((a, d) => a + d.reservedMinor, 0),
      availableCreditMinor:
        5000 -
        entries.reduce(
          (a, d) => a + (d.customerActualMinor || 0) + d.reservedMinor,
          0,
        ),
      attention: entries.filter((d) =>
        ["submission_unknown", "failed"].includes(d.status),
      ).length,
      lastActivityAt: entries[0]?.createdAt || null,
    };
  });
  const members: BelvedereMember[] = people.map((name, i) => ({
    id: `fixture-member-${i + 1}`,
    name,
    email: `membre${i + 1}@example.invalid`,
    createdAt: at(100),
    workshops: [
      {
        id: workshops[i % 6].id,
        name: workshops[i % 6].name,
        role: i < 6 ? "admin" : "member",
        canApprove: i < 6,
        canReport: i < 6,
      },
    ],
    workshopsTotal: 1,
    activeConnections: i % 3,
    lastSeenAt: at(i / 20),
  }));
  const connections: BelvedereConnection[] = members.map((member, i) => ({
    id: `fixture-connection-${i}`,
    kind: (["browser", "mcp", "native"] as const)[i % 3],
    userId: member.id,
    userName: member.name,
    workshopId: member.workshops[0].id,
    workshopName: member.workshops[0].name,
    status: i < 9 ? "active" : "expired",
    country: countries[i % 6],
    createdAt: at(2 + i / 20),
    lastSeenAt: at(i / 20),
    expiresAt: at(i < 9 ? -1 : 1),
  }));
  const events = Array.from({ length: 120 }, (_, i) => {
    const c = connections[i % connections.length];
    return {
      id: `fixture-event-${i}`,
      kind: c.kind,
      userName: c.userName,
      workshopName: c.workshopName,
      country: countries[i % countries.length],
      occurredAt: at(((i * 7) % 30) + 0.08),
    };
  }).filter((e) => e.occurredAt >= from && e.occurredAt <= to);
  const countryRows = countries.map((country) => ({
    country,
    connections: events.filter((e) => e.country === country).length,
  }));
  const destinationFor = (d: BelvedereDispatch): string | null =>
    d.channel === "email"
      ? null
      : ["FR", "LU", "BE", "DE", "US", "JP", "CA"][
          Math.floor(Number(d.id.slice(-3)) / 3) % 7
        ];
  const channels = ["postal", "email", "fax"].map((channel) => {
    const rows = dispatches.filter((d) => d.channel === channel);
    return {
      channel,
      dispatches: rows.length,
      consumptionMinor: rows.reduce(
        (a, d) => a + (d.customerActualMinor || 0),
        0,
      ),
      reservedMinor: rows.reduce((a, d) => a + d.reservedMinor, 0),
    };
  });
  const consumption = dispatches.reduce(
    (a, d) => a + (d.customerActualMinor || 0),
    0,
  );
  const reserved = dispatches.reduce((a, d) => a + d.reservedMinor, 0);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = 20;
  const search = (url.searchParams.get("q") || "").toLocaleLowerCase();
  const paginate = <T>(items: T[]) => ({
    items: items.slice((page - 1) * pageSize, page * pageSize),
    total: items.length,
    page,
    pageSize,
  });
  const path = url.pathname.slice(fixtureBase.length + 4);
  if (path === "/overview") {
    const dayCount = Math.min(
      90,
      Math.max(
        1,
        Math.ceil(
          (new Date(to).getTime() - new Date(from).getTime()) / 86400000,
        ),
      ),
    );
    const trend = Array.from({ length: dayCount }, (_, i) => {
      const date = at(dayCount - i - 1).slice(0, 10);
      const rows = dispatches.filter((d) => d.createdAt.startsWith(date));
      return {
        date,
        dispatches: rows.length,
        delivered: rows.filter((d) => d.status === "delivered").length,
        connections: events.filter((e) => e.occurredAt.startsWith(date)).length,
        consumptionMinor: rows.reduce(
          (a, d) => a + (d.customerActualMinor || 0),
          0,
        ),
      };
    });
    return {
      generatedAt,
      filters,
      totals: {
        workshops: workshops.length,
        members: members.length,
        activeConnections: 9,
        dispatches: dispatches.length,
        delivered: dispatches.filter((d) => d.status === "delivered").length,
        attention: 5,
        pages: workshops.reduce((a, w) => a + w.pages, 0),
        documents: workshops.reduce((a, w) => a + w.documents, 0),
        customerConsumptionMinor: consumption,
        reservedMinor: reserved,
      },
      trend,
      countries: countryRows,
      distributionCountries: [
        "FR",
        "LU",
        "BE",
        "DE",
        "US",
        "JP",
        "CA",
        null,
      ].map((country) => {
        const matching = dispatches.filter(
          (d) => destinationFor(d) === country,
        );
        return {
          country,
          dispatches: matching.length,
          delivered: matching.filter((d) => d.status === "delivered").length,
          channels: ["fax", "postal", "email"].map((channel) => ({
            channel,
            dispatches: matching.filter((d) => d.channel === channel).length,
          })),
        };
      }),
      statuses: [...new Set(dispatches.map((d) => d.status))].map((status) => ({
        status,
        dispatches: dispatches.filter((d) => d.status === status).length,
      })),
      channels,
      incidents: [
        { kind: "dispatch_attention", count: 2, severity: "critical" },
        { kind: "outbox_delayed", count: 3, severity: "warning" },
      ],
      telemetry: {
        since: at(30),
        retentionDays: 90,
        countrySource: "cloudflare_request_cf",
        historicalCountryAvailable: false,
      },
    } satisfies BelvedereOverview;
  }
  if (path === "/jobs") {
    const jobs: BelvedereJob[] = dispatches.map((dispatch, i) => ({
      ...dispatch,
      workshopId: workshops[i % 6].id,
      workshopName: workshops[i % 6].name,
      destinationCountry: destinationFor(dispatch),
    }));
    return paginate(
      jobs.filter((job) => {
        const channel = url.searchParams.get("channel"),
          status = url.searchParams.get("status"),
          country = url.searchParams.get("country"),
          group = url.searchParams.get("statusGroup");
        return (
          (!channel || job.channel === channel) &&
          (!status || job.status === status) &&
          (!country ||
            (country === "unknown"
              ? job.destinationCountry === null
              : job.destinationCountry === country)) &&
          (!group ||
            (group === "attention"
              ? ["submission_unknown", "failed"].includes(job.status)
              : job.status === "queued")) &&
          (job.id + " " + job.workshopName).toLocaleLowerCase().includes(search)
        );
      }),
    );
  }
  if (path === "/workshops")
    return paginate(
      workshops.filter((w) => w.name.toLocaleLowerCase().includes(search)),
    );
  if (path.startsWith("/workshops/")) {
    const index = workshops.findIndex(
      (w) => w.id === decodeURIComponent(path.split("/")[2]),
    );
    if (index < 0) return null;
    return {
      workshop: workshops[index],
      dispatches: paginate(dispatches.filter((_, i) => i % 6 === index)),
      members: members.filter((m) => m.workshops[0].id === workshops[index].id),
      membersTotal: 2,
      membersPage: 1,
      membersPageSize: 100,
      channels: channels.filter(
        (c) => c.channel === dispatches[index]?.channel,
      ),
    } satisfies BelvedereWorkshopDetail;
  }
  if (path === "/members")
    return paginate(
      members.filter((m) =>
        (m.name + " " + m.email).toLocaleLowerCase().includes(search),
      ),
    );
  if (path === "/connections")
    return {
      current: paginate(
        connections
          .filter((c) => c.status === "active")
          .filter((c) =>
            (c.userName + " " + c.workshopName)
              .toLocaleLowerCase()
              .includes(search),
          ),
      ),
      events: paginate(
        events.filter((e) =>
          (e.userName + " " + e.workshopName)
            .toLocaleLowerCase()
            .includes(search),
        ),
      ),
      countries: countryRows,
      retentionDays: 90,
      since: at(30),
    };
  if (path === "/finance")
    return {
      generatedAt,
      filters,
      periodBasis:
        mode === "production" ? "posted_ledger" : "simulation_confirmation",
      dispatchCountBasis: "created_dispatch_cohort",
      reservedBasis: "current_dispatch_cohort",
      customerConsumptionMinor: consumption,
      reservedMinor: reserved,
      promotionalGrantedMinor: 30000,
      promotionalRemainingMinor: 30000 - consumption - reserved,
      cashReceived: [],
      cashSource: "stripe_verified_payments",
      cashStatus: "unconfigured",
      supplierVerified: [
        {
          currency: "USD",
          amountMinor: dispatches.reduce(
            (a, d) => a + (d.supplierVerifiedMinor || 0),
            0,
          ),
        },
      ],
      supplierUnverifiedDispatches: dispatches.filter(
        (d) => d.supplierVerifiedMinor === null && d.status === "delivered",
      ).length,
      netResultMinor: null,
      netResultUnavailableReason:
        "Les coûts fournisseurs, les factures Cloudflare et les encaissements complets ne sont pas disponibles.",
      channels,
      monthly: [
        {
          month: to.slice(0, 7),
          consumptionMinor: consumption,
          dispatches: dispatches.filter((d) => d.customerActualMinor !== null)
            .length,
        },
      ],
    } satisfies BelvedereFinance;
  if (path === "/infrastructure/billing")
    return {
      status: "not_configured",
      source: "cloudflare_billable_usage_v1",
      period: "current_billing_cycle",
      observedAt: generatedAt,
      firstChargeAt: null,
      lastChargeAt: null,
      coverage: "metered_usage_only",
      rounding: "nearest_minor_half_up",
      lineCount: 0,
      totals: [],
      services: [],
    };
  if (path === "/infrastructure")
    return {
      status: "not_configured",
      source: "cloudflare_graphql",
      window: "24h",
      startAt: at(1),
      endAt: to,
      observedAt: generatedAt,
      sampled: true,
      metrics: null,
      series: [],
      billing: { status: "unavailable", amountMinor: null, currency: null },
    };
  return null;
}
