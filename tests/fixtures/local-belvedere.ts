/** Loopback-only virtual metadata. No credentials, database, documents or provider calls. */
import type {
  BelvedereConnection,
  BelvedereDispatch,
  BelvedereFilters,
  BelvedereFinance,
  BelvedereJob,
  BelvedereMember,
  BelvedereOverview,
  BelvedereWorkshop,
  BelvedereWorkshopDetail,
} from "../../packages/contracts/src/belvedere";

const MAX_RECORDS = 1_000_000_000;
const PERIOD = 360;
const REFERENCE_TIME = Date.parse("2026-10-30T12:00:00.000Z");
const DAY = 86_400_000;
const collections = [
  "documents",
  "dispatches",
  "templates",
  "datasets",
  "generations",
] as const;
const workshopNames = [
  "Atelier des Rives",
  "Maison Papier",
  "Studio Minuit",
  "Les Éditions du Parc",
  "Bureau des Correspondances",
  "Imprimerie du Passage",
];
const memberNames = [
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
const countries = ["FR", "LU", "BE", "DE", "US", "JP", "CA", null];
const channels = ["postal", "email", "fax"];
const statuses = [
  "prepared",
  "queued",
  "processing",
  "delivered",
  "failed",
  "submission_unknown",
  "cancelled",
  "delivered",
];

export type LocalBelvedereScenario = {
  seed: string;
  counts: Record<(typeof collections)[number], number>;
  members: number;
  connections: number;
};
export class LocalBelvedereScenarioError extends Error {
  constructor() {
    super("Invalid local fictional scenario.");
  }
}

export function localBelvedereLanguage(params: URLSearchParams): string | null {
  const value = params.get("lang");
  return params.getAll("lang").length === 1 &&
    value !== null &&
    ["fr", "en", "de", "lb"].includes(value)
    ? value
    : null;
}

export function localBelvedereScenario(
  params: URLSearchParams,
): LocalBelvedereScenario {
  const seed = params.get("localSeed") ?? params.get("seed") ?? "guteneo-local";
  if (!seed.trim() || seed.length > 128)
    throw new LocalBelvedereScenarioError();
  let encodedCounts: Record<string, unknown> = {};
  if (params.has("counts")) {
    try {
      const parsed: unknown = JSON.parse(params.get("counts")!);
      if (
        !parsed ||
        typeof parsed !== "object" ||
        Array.isArray(parsed) ||
        Object.keys(parsed).some(
          (key) => !(collections as readonly string[]).includes(key),
        )
      )
        throw new LocalBelvedereScenarioError();
      encodedCounts = parsed as Record<string, unknown>;
      if (
        Object.values(encodedCounts).some(
          (value) => !Number.isSafeInteger(value),
        )
      )
        throw new LocalBelvedereScenarioError();
    } catch {
      throw new LocalBelvedereScenarioError();
    }
  }
  const count = (key: string, fallback: number) => {
    const raw =
      params.get(key) ??
      (key in encodedCounts ? String(encodedCounts[key]) : null);
    if (raw === null) return fallback;
    if (!/^\d{1,10}$/.test(raw)) throw new LocalBelvedereScenarioError();
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value > MAX_RECORDS)
      throw new LocalBelvedereScenarioError();
    return value;
  };
  return {
    seed,
    counts: Object.fromEntries(
      collections.map((key) => [
        key,
        count(key, key === "dispatches" ? 126 : 100),
      ]),
    ) as LocalBelvedereScenario["counts"],
    members: count("members", 12),
    connections: count("connections", 120),
  };
}

function seedHash(seed: string) {
  let value = 0x811c9dc5;
  for (let index = 0; index < seed.length; index++)
    value = Math.imul(value ^ seed.charCodeAt(index), 0x01000193);
  return value >>> 0;
}
const normalized = (value: string) =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();
function boundedPage(
  raw: string | null,
  fallback: number,
  maximum = MAX_RECORDS,
) {
  return raw && /^\d{1,10}$/.test(raw)
    ? Math.min(maximum, Math.max(1, Number(raw)))
    : fallback;
}

/** A periodic selector indexes its complete logical collection without scanning it. */
function selection(total: number, matches: (index: number) => boolean) {
  const residues = Array.from({ length: PERIOD }, (_, index) => index).filter(
    matches,
  );
  const cycles = Math.floor(total / PERIOD);
  const tail = residues.filter((index) => index < total % PERIOD);
  const count = cycles * residues.length + tail.length;
  return {
    count,
    index(ordinal: number) {
      return ordinal < cycles * residues.length
        ? Math.floor(ordinal / residues.length) * PERIOD +
            residues[ordinal % residues.length]
        : cycles * PERIOD + tail[ordinal - cycles * residues.length];
    },
  };
}

export function localBelvedereResponse(
  url: URL,
  scenario: LocalBelvedereScenario,
): unknown {
  // Validate callers that provide configuration directly rather than through URL parsing.
  localBelvedereScenario(
    new URLSearchParams({
      seed: scenario.seed,
      ...Object.fromEntries(
        collections.map((key) => [key, String(scenario.counts[key])]),
      ),
      members: String(scenario.members),
      connections: String(scenario.connections),
    }),
  );
  const hash = seedHash(scenario.seed);
  const identity = hash.toString(16).padStart(8, "0");
  const phase = hash % PERIOD;
  const at = (index: number) =>
    new Date(
      REFERENCE_TIME - (index % 90) * DAY - (index % 24) * 60_000,
    ).toISOString();
  const id = (kind: string, index: number) =>
    `local_${identity}_${kind}_${String(index + 1).padStart(10, "0")}`;
  const ordinal = (value: string, kind: string, total: number) => {
    const match = new RegExp(`^local_${identity}_${kind}_(\\d{10})$`).exec(
      value,
    );
    if (!match) return null;
    const index = Number(match[1]) - 1;
    return index >= 0 && index < total ? index : null;
  };
  const end = url.searchParams.get("to") ?? "2026-10-30";
  const start = url.searchParams.get("from") ?? "2026-10-01";
  for (const value of [start, end]) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value + "T00:00:00Z")) ||
      new Date(value + "T00:00:00Z").toISOString().slice(0, 10) !== value
    )
      throw new LocalBelvedereScenarioError();
  }
  if (start > end) throw new LocalBelvedereScenarioError();
  const filters: BelvedereFilters = {
    from: start,
    to: end,
    mode:
      url.searchParams.get("mode") === "simulation"
        ? "simulation"
        : "production",
  };
  const withinPeriod = (index: number) => {
    const date = at(index).slice(0, 10);
    return date >= start.slice(0, 10) && date <= end.slice(0, 10);
  };
  const generatedAt = new Date(REFERENCE_TIME).toISOString();
  const query = normalized(url.searchParams.get("q") ?? "").trim();
  const pageSize = boundedPage(url.searchParams.get("pageSize"), 20, 50);
  const page = boundedPage(url.searchParams.get("page"), 1);
  function paged<T>(
    total: number,
    matches: (index: number) => boolean,
    item: (index: number) => T,
    requestedPage = page,
    direct: number | null = null,
  ) {
    const selected =
      direct === null
        ? selection(total, matches)
        : { count: matches(direct) ? 1 : 0, index: () => direct };
    const current = Math.min(
      requestedPage,
      Math.max(1, Math.ceil(selected.count / pageSize)),
    );
    const offset = (current - 1) * pageSize;
    return {
      items: Array.from(
        { length: Math.min(pageSize, Math.max(0, selected.count - offset)) },
        (_, index) => item(selected.index(offset + index)),
      ),
      total: selected.count,
      page: current,
      pageSize,
    };
  }
  function textMatches(index: number, kind: string, text: string) {
    if (!query) return true;
    if (query === id(kind, index)) return true;
    if (kind === "member" && query === `fictional-${index + 1}@example.invalid`)
      return true;
    // Human labels are periodic; an exact seeded record id takes the direct index path.
    return !/\d/.test(query) && normalized(text).includes(query);
  }
  const workshopName = (index: number) =>
    workshopNames[(index + phase) % workshopNames.length];
  const memberName = (index: number) =>
    memberNames[(index + phase) % memberNames.length];
  const channel = (index: number) =>
    channels[(index + phase) % channels.length];
  const status = (index: number) => statuses[(index + phase) % statuses.length];
  const country = (index: number) =>
    channel(index) === "email"
      ? null
      : countries[(index + phase) % countries.length];
  const dispatch = (index: number): BelvedereDispatch => {
    const cost =
      channel(index) === "postal" ? 185 : channel(index) === "email" ? 1 : 27;
    const final = status(index) === "delivered";
    return {
      id: id("dispatch", index),
      channel: channel(index),
      mode: filters.mode,
      status: status(index),
      createdAt: at(index),
      pages: channel(index) === "email" ? null : 1 + ((index + phase) % 6),
      customerActualMinor: final ? cost : null,
      transportActualMinor: final ? cost : null,
      hostingFeeMinor: 0,
      deliveryMode: channel(index) === "email" ? "attachment" : null,
      reservedMinor: ["queued", "processing"].includes(status(index)) ? 220 : 0,
      supplierVerifiedMinor: final && (index + phase) % 5 === 0 ? 12 : null,
      supplierCurrency: final && (index + phase) % 5 === 0 ? "USD" : null,
      estimatedMinor: cost,
      ceilingMinor: 220,
    };
  };
  const job = (index: number): BelvedereJob => ({
    ...dispatch(index),
    workshopId: id("workshop", index % 6),
    workshopName: workshopName(index % 6),
    destinationCountry: country(index),
  });
  function aggregate(matches: (index: number) => boolean) {
    let count = 0,
      pages = 0,
      consumed = 0,
      reserved = 0,
      delivered = 0,
      attention = 0,
      supplier = 0,
      unverified = 0;
    for (let index = 0; index < PERIOD; index++) {
      if (!matches(index)) continue;
      const copies =
        index < scenario.counts.dispatches
          ? Math.floor((scenario.counts.dispatches - 1 - index) / PERIOD) + 1
          : 0;
      const item = dispatch(index);
      count += copies;
      pages += copies * (item.pages ?? 0);
      consumed += copies * (item.customerActualMinor ?? 0);
      reserved += copies * item.reservedMinor;
      if (item.status === "delivered") delivered += copies;
      if (["failed", "submission_unknown"].includes(item.status))
        attention += copies;
      supplier += copies * (item.supplierVerifiedMinor ?? 0);
      if (item.status === "delivered" && item.supplierVerifiedMinor === null)
        unverified += copies;
    }
    return {
      count,
      pages,
      consumed,
      reserved,
      delivered,
      attention,
      supplier,
      unverified,
    };
  }
  const total = aggregate(withinPeriod);
  const channelTotals = (matches = withinPeriod) =>
    channels.map((value) => {
      const sums = aggregate(
        (index) => matches(index) && channel(index) === value,
      );
      return {
        channel: value,
        dispatches: sums.count,
        consumptionMinor: sums.consumed,
        reservedMinor: sums.reserved,
      };
    });
  const workshop = (index: number): BelvedereWorkshop => {
    const sums = aggregate((row) => withinPeriod(row) && row % 6 === index);
    const members =
      Math.floor(scenario.members / 6) + (index < scenario.members % 6 ? 1 : 0);
    return {
      id: id("workshop", index),
      name: workshopName(index),
      mode: filters.mode,
      createdAt: at(89),
      members,
      dispatches: sums.count,
      documents:
        Math.floor(scenario.counts.documents / 6) +
        (index < scenario.counts.documents % 6 ? 1 : 0),
      pages: sums.pages,
      consumptionMinor: sums.consumed,
      reservedMinor: sums.reserved,
      availableCreditMinor: null,
      attention: sums.attention,
      lastActivityAt: sums.count ? generatedAt : null,
    };
  };
  const member = (index: number): BelvedereMember => ({
    id: id("member", index),
    name: memberName(index),
    email: `fictional-${index + 1}@example.invalid`,
    createdAt: at(89),
    workshops: [
      {
        id: id("workshop", index % 6),
        name: workshopName(index % 6),
        role: (["admin", "supervisor", "member", "viewer"] as const)[
          (index + phase) % 4
        ],
        canApprove: (index + phase) % 4 === 1,
        canReport: (index + phase) % 4 === 1,
      },
    ],
    workshopsTotal: 1,
    activeConnections: selection(
      scenario.connections,
      (row) =>
        scenario.members > 0 &&
        (row % 12) % scenario.members === index &&
        (row + phase) % 4 !== 3,
    ).count,
    lastSeenAt: at(index),
  });
  const connectionMember = (index: number) =>
    scenario.members ? (index % 12) % scenario.members : null;
  const connectionMemberName = (index: number) => {
    const memberIndex = connectionMember(index);
    return memberIndex === null
      ? "Fictional deleted member"
      : memberName(memberIndex);
  };
  const connection = (index: number): BelvedereConnection => ({
    id: id("connection", index),
    kind: (["browser", "mcp", "native"] as const)[(index + phase) % 3],
    userId:
      connectionMember(index) === null
        ? ""
        : id("member", connectionMember(index)!),
    userName: connectionMemberName(index),
    workshopId: id("workshop", (connectionMember(index) ?? index) % 6),
    workshopName: workshopName((connectionMember(index) ?? index) % 6),
    status: !scenario.members
      ? "revoked"
      : (index + phase) % 4 === 3
        ? "expired"
        : "active",
    country: countries[(index + phase) % countries.length],
    createdAt: at(1),
    lastSeenAt: at(index % 3),
    expiresAt: new Date(
      REFERENCE_TIME + ((index + phase) % 4 === 3 ? -1 : 1) * DAY,
    ).toISOString(),
  });
  const event = (index: number) => ({
    id: id("event", index),
    kind: connection(index).kind,
    userName: connectionMemberName(index),
    workshopName: workshopName((connectionMember(index) ?? index) % 6),
    country: countries[(index + phase) % countries.length],
    occurredAt: at(index),
  });
  const countryRows = countries.map((value) => ({
    country: value,
    connections: selection(
      scenario.connections,
      (index) =>
        withinPeriod(index) &&
        countries[(index + phase) % countries.length] === value,
    ).count,
  }));
  const path = url.pathname.slice(url.pathname.indexOf("/api/") + 4);
  if (path === "/overview") {
    const dayCount = Math.min(
      90,
      Math.max(
        1,
        Math.floor(
          (Date.parse(end.slice(0, 10)) - Date.parse(start.slice(0, 10))) / DAY,
        ) + 1 || 1,
      ),
    );
    return {
      generatedAt,
      filters,
      totals: {
        workshops: 6,
        members: scenario.members,
        activeConnections: selection(
          scenario.connections,
          (index) => connection(index).status === "active",
        ).count,
        dispatches: total.count,
        delivered: total.delivered,
        attention: total.attention,
        pages: total.pages,
        documents: scenario.counts.documents,
        customerConsumptionMinor: total.consumed,
        reservedMinor: total.reserved,
      },
      trend: Array.from({ length: dayCount }, (_, index) => {
        const date = new Date(
          Date.parse(end.slice(0, 10)) - (dayCount - index - 1) * DAY,
        )
          .toISOString()
          .slice(0, 10);
        const sums = aggregate((row) => at(row).startsWith(date));
        return {
          date,
          dispatches: sums.count,
          delivered: sums.delivered,
          connections: selection(scenario.connections, (row) =>
            at(row).startsWith(date),
          ).count,
          consumptionMinor: sums.consumed,
        };
      }),
      countries: countryRows,
      distributionCountries: countries.map((value) => {
        const sums = aggregate(
          (index) => withinPeriod(index) && country(index) === value,
        );
        return {
          country: value,
          dispatches: sums.count,
          delivered: sums.delivered,
          channels: channelTotals(
            (index) => withinPeriod(index) && country(index) === value,
          ).map(({ channel, dispatches }) => ({ channel, dispatches })),
        };
      }),
      statuses: [...new Set(statuses)].map((value) => ({
        status: value,
        dispatches: aggregate(
          (index) => withinPeriod(index) && status(index) === value,
        ).count,
      })),
      channels: channelTotals(),
      incidents: total.attention
        ? [
            {
              kind: "dispatch_attention",
              count: total.attention,
              severity: "warning",
            },
          ]
        : [],
      telemetry: {
        since: at(89),
        retentionDays: 90,
        countrySource: "cloudflare_request_cf",
        historicalCountryAvailable: false,
      },
    } satisfies BelvedereOverview;
  }
  if (path === "/jobs") {
    const direct = ordinal(query, "dispatch", scenario.counts.dispatches);
    return paged(
      scenario.counts.dispatches,
      (index) => {
        const item = job(index),
          requestedCountry = url.searchParams.get("country"),
          group = url.searchParams.get("statusGroup");
        return (
          withinPeriod(index) &&
          (!url.searchParams.get("channel") ||
            item.channel === url.searchParams.get("channel")) &&
          (!url.searchParams.get("status") ||
            item.status === url.searchParams.get("status")) &&
          (!requestedCountry ||
            (requestedCountry === "unknown"
              ? item.destinationCountry === null
              : item.destinationCountry === requestedCountry)) &&
          (!group ||
            (group === "attention"
              ? ["failed", "submission_unknown"].includes(item.status)
              : ["queued", "processing"].includes(item.status))) &&
          (direct !== null || textMatches(index, "dispatch", item.workshopName))
        );
      },
      job,
      page,
      direct,
    );
  }
  if (path === "/workshops")
    return {
      items: Array.from({ length: 6 }, (_, index) => workshop(index)).filter(
        (item) =>
          !query || normalized(item.name).includes(query) || item.id === query,
      ),
      total: Array.from({ length: 6 }, (_, index) => workshop(index)).filter(
        (item) =>
          !query || normalized(item.name).includes(query) || item.id === query,
      ).length,
      page: 1,
      pageSize,
    };
  if (path.startsWith("/workshops/")) {
    const index = ordinal(
      decodeURIComponent(path.split("/")[2]),
      "workshop",
      6,
    );
    if (index === null) return null;
    const memberPage = paged(
      scenario.members,
      (row) => row % 6 === index,
      member,
      boundedPage(url.searchParams.get("membersPage"), 1),
    );
    return {
      workshop: workshop(index),
      dispatches: paged(
        scenario.counts.dispatches,
        (row) => withinPeriod(row) && row % 6 === index,
        dispatch,
      ),
      members: memberPage.items,
      membersTotal: memberPage.total,
      membersPage: memberPage.page,
      membersPageSize: memberPage.pageSize,
      channels: channelTotals((row) => withinPeriod(row) && row % 6 === index),
    } satisfies BelvedereWorkshopDetail;
  }
  if (path === "/members") {
    const email = /^fictional-([1-9]\d{0,9})@example\.invalid$/.exec(query);
    const emailIndex = email ? Number(email[1]) - 1 : -1;
    const direct =
      ordinal(query, "member", scenario.members) ??
      (emailIndex >= 0 && emailIndex < scenario.members ? emailIndex : null);
    return paged(
      scenario.members,
      (index) =>
        textMatches(index, "member", memberName(index) + " example.invalid"),
      member,
      page,
      direct,
    );
  }
  if (path === "/connections")
    return {
      current: paged(
        scenario.connections,
        (index) =>
          connection(index).status === "active" &&
          textMatches(
            index,
            "connection",
            connectionMemberName(index) +
              " " +
              workshopName((connectionMember(index) ?? index) % 6),
          ),
        connection,
        page,
        ordinal(query, "connection", scenario.connections),
      ),
      events: paged(
        scenario.connections,
        (index) =>
          withinPeriod(index) &&
          textMatches(
            index,
            "event",
            connectionMemberName(index) +
              " " +
              workshopName((connectionMember(index) ?? index) % 6),
          ),
        event,
        page,
        ordinal(query, "event", scenario.connections),
      ),
      countries: countryRows,
      retentionDays: 90,
      since: at(89),
    };
  if (path === "/finance") {
    const months = [
      ...new Set(
        Array.from({ length: PERIOD }, (_, index) => at(index).slice(0, 7)),
      ),
    ].sort();
    return {
      generatedAt,
      filters,
      periodBasis:
        filters.mode === "production"
          ? "posted_ledger"
          : "simulation_confirmation",
      dispatchCountBasis: "created_dispatch_cohort",
      reservedBasis: "current_dispatch_cohort",
      customerConsumptionMinor: total.consumed,
      legacyPlanConsumptionMinor: 0,
      legacyPlanCharges: 0,
      reservedMinor: total.reserved,
      promotionalGrantedMinor: 0,
      promotionalRemainingMinor: 0,
      cashReceived: [],
      cashSource: "stripe_verified_payments",
      cashStatus: "unconfigured",
      supplierVerified: total.supplier
        ? [{ currency: "USD", amountMinor: total.supplier }]
        : [],
      supplierUnverifiedDispatches: total.unverified,
      netResultMinor: null,
      netResultUnavailableReason:
        "Supplier costs, Cloudflare invoices and complete receipts are unavailable.",
      channels: channelTotals(),
      monthly: months
        .map((month) => {
          const sums = aggregate(
            (row) => withinPeriod(row) && at(row).startsWith(month),
          );
          return {
            month,
            consumptionMinor: sums.consumed,
            legacyPlanConsumptionMinor: 0,
            dispatches: sums.delivered,
          };
        })
        .filter((month) => month.dispatches > 0),
    } satisfies BelvedereFinance;
  }
  if (path === "/infrastructure")
    return {
      status: "not_configured",
      source: "cloudflare_graphql",
      window: url.searchParams.get("window") === "7d" ? "7d" : "24h",
      startAt: at(7),
      endAt: generatedAt,
      observedAt: generatedAt,
      sampled: true,
      metrics: null,
      series: [],
      billing: { status: "unavailable", amountMinor: null, currency: null },
    };
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
  return null;
}
