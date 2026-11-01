import { readFileSync, readdirSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import {
  createFaxUsageFixture,
  insertRecord,
} from "../helpers/fax-usage-fixture";
const {
  prepareRegistrationPlan,
  applyRegistrationPlan,
  registrationPlanDigest,
  validateRegistrationConfig,
} = await import(
  new URL(
    "../../scripts/register-verified-fax-reference-refresh.mjs",
    import.meta.url,
  ).href
);
const NOW = "2026-11-01T10:00:00.000Z",
  OLD = "2026-10-20T10:00:00.000Z";
const prefixes = [
  "+331",
  "+332",
  "+333",
  "+334",
  "+335",
  "+339",
  "+492",
  "+493",
  "+494",
  "+495",
  "+496",
  "+497",
  "+498",
  "+499",
];
const excludedPrefixes = ["+33182883934", "+4932", "+49700", "+49800"];
const deckUrl =
  "https://portal.telnyx.com/downloads/global_conversational/synthetic.csv";
type Inspection = {
  provider: string;
  mode: string;
  status: string;
  errors: { stage: string; code: string; invalidFields?: string[] }[];
  accountReference: unknown;
  application: {
    id: unknown;
    active: boolean;
    outboundVoiceProfileId: unknown;
  };
  outboundProfile: {
    id: unknown;
    enabled: boolean;
    whitelistedDestinations: string[];
    dailySpendLimitEnabled: boolean | null;
    dailySpendLimitUsd: null;
  };
  numberPagination: { complete: boolean };
  numbers: {
    phoneNumber: string;
    country: string;
    status: string;
    features: { t38FaxGatewayEnabled: boolean };
  }[];
};
type Catalog = {
  provider: string;
  mode: string;
  catalog: string;
  status: string;
  rateDeckUrl: string;
  sha256: string;
  observedAt: string;
};
const makeProviders = () => ({
  inspectTelnyx: vi.fn(async () => structuredClone(inspection)),
  inspectTelnyxFaxTariffCatalog: vi.fn(async () => structuredClone(catalog)),
});
let mf: Miniflare,
  db: D1Database,
  config: Record<string, unknown>,
  inspection: Inspection,
  catalog: Catalog,
  providers: ReturnType<typeof makeProviders>,
  fetcher: typeof fetch;
let tariff: Record<string, unknown>;
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("fixture")}}',
      compatibilityDate: "2026-09-16",
      d1Databases: ["DB"],
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  const directory = new URL("../../migrations/", import.meta.url);
  for (const name of readdirSync(directory)
    .filter((n) => n.endsWith(".sql") && Number(n.slice(0, 4)) <= 71)
    .sort())
    await db.batch(
      unstable_splitSqlQuery(
        readFileSync(new URL(name, directory), "utf8"),
      ).map((sql) => db.prepare(sql)),
    );
});
afterAll(async () => mf?.dispose());
beforeEach(async () => {
  const fixture = await createFaxUsageFixture(db, () => Date.parse(OLD), {
    destination_prefix: "+331",
    max_pages: 10,
    quote_ttl_seconds: 900,
  });
  tariff = (await db
    .prepare(
      "SELECT * FROM trusted_fax_usage_tariffs WHERE organization_id=? AND id=?",
    )
    .bind(fixture.ctx.organizationId, fixture.tariff.id)
    .first())!;
  const initialTariffIds = [tariff.id],
    exclusionTariffIds = [];
  for (const prefix of prefixes.slice(1)) {
    const row = {
      ...tariff,
      id: crypto.randomUUID(),
      destination_prefix: prefix,
      destination_country_code: prefix.startsWith("+33") ? "FR" : "DE",
    };
    await insertRecord(db, "trusted_fax_usage_tariffs", row);
    initialTariffIds.push(row.id);
  }
  for (const prefix of excludedPrefixes) {
    const row = {
      ...tariff,
      id: crypto.randomUUID(),
      destination_prefix: prefix,
      destination_country_code: prefix.startsWith("+33") ? "FR" : "DE",
      destination_category: "special",
      route_allowed: 0,
    };
    await insertRecord(db, "trusted_fax_usage_tariffs", row);
    exclusionTariffIds.push(row.id);
  }
  config = {
    version: 1,
    sourceId: crypto.randomUUID(),
    organizationId: fixture.ctx.organizationId,
    initialTariffIds,
    exclusionTariffIds,
    commercialBasis: "public_reference_not_negotiated",
  };
  inspection = {
    provider: "telnyx",
    mode: "read_only",
    status: "ok",
    errors: [],
    accountReference: tariff.account_id,
    application: {
      id: tariff.connection_id,
      active: true,
      outboundVoiceProfileId: tariff.outbound_profile_id,
    },
    outboundProfile: {
      id: tariff.outbound_profile_id,
      enabled: true,
      whitelistedDestinations: ["LU", "FR", "DE"],
      dailySpendLimitEnabled: false,
      dailySpendLimitUsd: null,
    },
    numberPagination: { complete: true },
    numbers: [
      {
        phoneNumber: "+35220000000",
        country: "LU",
        status: "active",
        features: { t38FaxGatewayEnabled: true },
      },
    ],
  };
  catalog = {
    provider: "telnyx",
    mode: "read_only",
    catalog: "global_conversational",
    status: "ok",
    rateDeckUrl: deckUrl,
    sha256: "c".repeat(64),
    observedAt: NOW,
  };
  providers = makeProviders();
  const row = (prefix: string) =>
    `${prefix.startsWith("33") ? "FR,France" : "DE,Germany"},"30, 352, 49",${prefix},Trunking Outbound Minute - ${prefix.startsWith("33") ? "France" : "Germany"} - From EEA,60,60,0.0056,,`;
  const deck = [
    "ISO,Country,Origination Prefixes,Destination Prefixes,Description,Interval 1,Interval N,Rate,Price Per Call,Exact Match",
    row("33"),
    row("49"),
    ...excludedPrefixes.map((prefix) => row(prefix.slice(1))),
  ].join("\n");
  fetcher = vi.fn(async (input, init) => {
    expect(init?.method).toBe("GET");
    const text =
      String(input) === deckUrl
        ? deck
        : String(input) === "https://telnyx.com/pricing/fax"
          ? "Send a fax via API $0.007 per page + SIP Trunking usage for transmission"
          : String(input) ===
              "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml"
            ? '<Cube time="2026-10-30"><Cube currency="USD" rate="1.1537"/></Cube>'
            : undefined;
    if (text === undefined) throw new Error("Unexpected fixture source");
    return new Response(text, {
      headers: { "last-modified": "Tue, 13 Oct 2026 00:00:00 GMT" },
    });
  }) as typeof fetch;
});
const prepare = () =>
  prepareRegistrationPlan(db, providers, config, { now: () => NOW, fetcher });
const count = (table: string) =>
  db
    .prepare(`SELECT COUNT(*) n FROM ${table} WHERE organization_id=?`)
    .bind(config.organizationId)
    .first<{ n: number }>();
const apply = (
  prepared: { plan: unknown; sources: unknown },
  database = db,
  now = NOW,
) =>
  applyRegistrationPlan(
    database,
    providers,
    prepared.plan,
    registrationPlanDigest(prepared.plan),
    { now: () => now, sources: prepared.sources },
  );
describe("bounded existing FR/DE reference registration", () => {
  it("prepares current evidence without changing historical tariffs or registering anything", async () => {
    const p = await prepare();
    expect(p.plan.source.bindings_json).toContain(String(tariff.expires_at));
    expect(p.plan.qualification).toMatchObject({
      registrationOnly: true,
      firstRefreshRequiresNewReads: true,
      relevantRows: 6,
    });
    expect(p.plan.qualification.routes).toHaveLength(14);
    expect(p.plan.qualification.sources.deck.lastModified).toContain(
      "13 Oct 2026",
    );
    expect(p.plan.observedAt).toBe(NOW);
    expect((await count("verified_fax_reference_sets"))!.n).toBe(0);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("atomically installs only the set, fourteen mappings and its due state, then returns idempotently", async () => {
    const p = await prepare();
    // Miniflare accepts statements that exceed production D1's parameter limit.
    let maximumBindings = 0;
    let maximumSqlBytes = 0;
    const bounded = {
      prepare(sql: string) {
        maximumSqlBytes = Math.max(
          maximumSqlBytes,
          new TextEncoder().encode(sql).byteLength,
        );
        expect(maximumSqlBytes).toBeLessThanOrEqual(100000);
        const prepared = db.prepare(sql);
        return new Proxy(prepared, {
          get(target, property) {
            if (property === "bind")
              return (...values: unknown[]) => {
                maximumBindings = Math.max(maximumBindings, values.length);
                expect(values.length).toBeLessThanOrEqual(100);
                return target.bind(...values);
              };
            const value = Reflect.get(target, property);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
      },
      batch: db.batch.bind(db),
    } as unknown as D1Database;
    const before = await db
      .prepare(
        "SELECT * FROM trusted_fax_usage_tariffs WHERE organization_id=? ORDER BY id",
      )
      .bind(config.organizationId)
      .all();
    expect(await apply(p, bounded)).toMatchObject({
      status: "applied",
      registrationOnly: true,
    });
    expect(await apply(p, bounded)).toMatchObject({
      status: "already_applied",
    });
    expect(maximumBindings).toBeGreaterThan(0);
    expect(maximumBindings).toBeLessThanOrEqual(100);
    expect(maximumSqlBytes).toBeLessThanOrEqual(100000);
    expect((await count("verified_fax_reference_tariffs"))!.n).toBe(14);
    expect((await count("verified_fax_reference_evidence"))!.n).toBe(0);
    expect(
      (
        await db
          .prepare(
            "SELECT * FROM trusted_fax_usage_tariffs WHERE organization_id=? ORDER BY id",
          )
          .bind(config.organizationId)
          .all()
      ).results,
    ).toEqual(before.results);
    const state = await db
      .prepare(
        "SELECT next_due_at,last_success_at FROM verified_fax_reference_state WHERE organization_id=?",
      )
      .bind(config.organizationId)
      .first();
    expect(state).toEqual({ next_due_at: NOW, last_success_at: null });
    for (const table of ["attempts", "approvals", "outbox", "reservations"])
      expect((await count(table))!.n).toBe(0);
  });
  it("refuses amended bytes, a stale plan, or a mismatched reviewed digest before registration", async () => {
    const p = await prepare();
    await expect(
      applyRegistrationPlan(db, providers, p.plan, "0".repeat(64), {
        now: () => NOW,
        sources: p.sources,
      }),
    ).rejects.toThrow(/PLAN_INVALID/);
    await expect(apply(p, db, "2026-11-01T10:15:00.000Z")).rejects.toThrow(
      /PLAN_INVALID/,
    );
    p.sources.deck.bytes[0] = 88;
    await expect(apply(p)).rejects.toThrow(/SOURCE_INVALID/);
    expect((await count("verified_fax_reference_sets"))!.n).toBe(0);
  });
  it("requires exact cardinality, tenant, commercial basis and disjoint original IDs", async () => {
    for (const altered of [
      { extra: true },
      { commercialBasis: "negotiated" },
      { initialTariffIds: (config.initialTariffIds as string[]).slice(1) },
      {
        exclusionTariffIds: Array(4).fill(
          (config.initialTariffIds as string[])[0],
        ),
      },
    ])
      expect(() =>
        validateRegistrationConfig({ ...config, ...altered }),
      ).toThrow(/CONFIG_INVALID/);
    await expect(
      prepareRegistrationPlan(
        db,
        providers,
        { ...config, organizationId: "other" },
        { now: () => NOW, fetcher },
      ),
    ).rejects.toThrow(/TARGET_INVALID/);
  });
  it("expires a plan while the final provider reads are in progress", async () => {
    const p = await prepare();
    let current = NOW;
    providers.inspectTelnyx.mockImplementationOnce(async () => {
      current = "2026-11-01T10:15:00.000Z";
      return structuredClone(inspection);
    });
    await expect(
      applyRegistrationPlan(
        db,
        providers,
        p.plan,
        registrationPlanDigest(p.plan),
        { now: () => current, sources: p.sources },
      ),
    ).rejects.toThrow(/PLAN_INVALID/);
    expect((await count("verified_fax_reference_sets"))!.n).toBe(0);
  });
  it("allows the known unknown inactive spend amount but refuses an active or unspecified malformed limit", async () => {
    inspection.status = "partial";
    inspection.errors = [
      {
        stage: "outbound_profile",
        code: "invalid_response",
        invalidFields: ["daily_spend_limit"],
      },
    ];
    expect((await prepare()).plan.qualification.registrationOnly).toBe(true);
    for (const flag of [true, null]) {
      inspection.outboundProfile.dailySpendLimitEnabled = flag;
      await expect(prepare()).rejects.toThrow(/PROVIDER_OWNERSHIP_INVALID/);
    }
  });
  it("rechecks exact sender ownership, destination permissions and catalogue before application", async () => {
    const p = await prepare();
    inspection.outboundProfile.whitelistedDestinations = ["LU", "FR"];
    await expect(apply(p)).rejects.toThrow(/PROVIDER_OWNERSHIP_INVALID/);
    inspection.outboundProfile.whitelistedDestinations.push("DE");
    catalog.rateDeckUrl = deckUrl.replace("synthetic", "changed");
    await expect(apply(p)).rejects.toThrow(/CATALOG_CHANGED/);
    expect((await count("verified_fax_reference_sets"))!.n).toBe(0);
  });
  it("refuses sender drift observed before the final batch", async () => {
    const p = await prepare();
    await db
      .prepare("UPDATE senders SET status='pending' WHERE organization_id=?")
      .bind(config.organizationId)
      .run();
    await expect(apply(p)).rejects.toThrow(/STATE_CHANGED/);
    expect((await count("verified_fax_reference_sets"))!.n).toBe(0);
  });
  it("fences an exact sender mutation after inspection but before INSERT", async () => {
    const p = await prepare();
    const racing = {
      prepare: db.prepare.bind(db),
      batch: async (statements: D1PreparedStatement[]) => {
        await db
          .prepare(
            "UPDATE senders SET address='+35220000001' WHERE organization_id=?",
          )
          .bind(config.organizationId)
          .run();
        return db.batch(statements);
      },
    } as unknown as D1Database;
    await expect(apply(p, racing)).rejects.toThrow(/STATE_CHANGED/);
    expect((await count("verified_fax_reference_sets"))!.n).toBe(0);
    expect((await count("verified_fax_reference_tariffs"))!.n).toBe(0);
  });
  it("rolls the whole registration back if a mapping INSERT fails", async () => {
    const p = await prepare();
    await db
      .prepare(
        "CREATE TRIGGER reject_fixture_mapping BEFORE INSERT ON verified_fax_reference_tariffs BEGIN SELECT RAISE(ABORT,'fixture_failure'); END",
      )
      .run();
    try {
      await expect(apply(p)).rejects.toThrow(/STATE_CHANGED/);
    } finally {
      await db.prepare("DROP TRIGGER reject_fixture_mapping").run();
    }
    expect((await count("verified_fax_reference_sets"))!.n).toBe(0);
    expect((await count("verified_fax_reference_state"))!.n).toBe(0);
  });
  it("fences revocation of an exclusion after the final read", async () => {
    const p = await prepare();
    const racing = {
      prepare: db.prepare.bind(db),
      batch: async (statements: D1PreparedStatement[]) => {
        await db
          .prepare(
            "UPDATE trusted_fax_usage_tariffs SET status='revoked' WHERE organization_id=? AND id=?",
          )
          .bind(
            config.organizationId,
            (config.exclusionTariffIds as string[])[0],
          )
          .run();
        return db.batch(statements);
      },
    } as unknown as D1Database;
    await expect(apply(p, racing)).rejects.toThrow(/STATE_CHANGED/);
    expect((await count("verified_fax_reference_sets"))!.n).toBe(0);
    expect((await count("verified_fax_reference_tariffs"))!.n).toBe(0);
  });
  it("reconciles a lost successful batch response by exact readback without another write", async () => {
    const p = await prepare(),
      batch = vi.fn(async (statements: D1PreparedStatement[]) => {
        await db.batch(statements);
        throw new Error("Lost fixture response");
      });
    expect(
      await apply(p, {
        prepare: db.prepare.bind(db),
        batch,
      } as unknown as D1Database),
    ).toMatchObject({ status: "applied" });
    expect(batch).toHaveBeenCalledTimes(1);
    expect((await count("verified_fax_reference_tariffs"))!.n).toBe(14);
  });
  it("never reactivates a revoked set", async () => {
    const p = await prepare();
    await apply(p);
    await db
      .prepare(
        "UPDATE verified_fax_reference_sets SET status='revoked' WHERE organization_id=?",
      )
      .bind(config.organizationId)
      .run();
    await expect(apply(p)).rejects.toThrow(/SOURCE_CONFLICT/);
  });
});
