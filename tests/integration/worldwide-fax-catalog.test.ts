import { readFileSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { afterAll, beforeAll, describe, it, expect, vi } from "vitest";
import { refreshWorldwideFaxCatalog } from "../../apps/api/src/worldwide-fax-catalog";
import { resolveWorldwideFaxReference } from "../../packages/domain/src/worldwide-fax-catalog";
import {
  telnyxAccountReference,
  type TelnyxReadiness,
} from "../../packages/providers/telnyx-readiness";
import type { Env } from "../../apps/api/src/env";

const senderNumber = "+35200000000",
  connectionId = "123",
  outboundProfileId = "234";
const timestamp = Date.parse("2026-11-27T12:00:00Z");
const url =
  "https://portal.telnyx.com/downloads/global_conversational/test_catalog.csv";
const page =
  "Send a fax via API $0.007 per page + SIP Trunking usage for transmission";
const fx = (at: number) =>
  `<Cube time='${new Date(at).toISOString().slice(0, 10)}'><Cube currency='USD' rate='1.25'/></Cube>`;
const readiness: TelnyxReadiness = {
  liveSendingVerified: false,
  provider: "telnyx",
  mode: "read_only",
  status: "ok",
  application: {
    id: connectionId,
    active: true,
    outboundChannelLimit: 1,
    webhooks: {
      primary: { status: "canonical", present: true, matchesCanonical: true },
      failover: { status: "absent", present: false, matchesCanonical: false },
    },
    outboundVoiceProfileId: outboundProfileId,
  },
  outboundProfile: {
    id: outboundProfileId,
    enabled: true,
    whitelistedDestinations: ["LU"],
    concurrentCallLimit: 1,
    maxDestinationRate: null,
    dailySpendLimitUsd: null,
    dailySpendLimitEnabled: false,
  },
  numbers: [
    {
      id: "345",
      phoneNumber: senderNumber,
      country: "LU",
      status: "active",
      features: { t38FaxGatewayEnabled: true, hdVoiceEnabled: null },
    },
  ],
  numberPagination: { complete: true, pagesRead: 1 },
  errors: [],
};
const header =
  "ISO,Country,Origination Prefixes,Destination Prefixes,Description,Interval 1,Interval N,Rate,Price Per Call,Exact Match";
const csv = [
  header,
  "US,United States,,1,Generic,60,60,0.1,,",
  "US,United States,,1212,Special,1,1,0.015,0.5,",
  'US,United States,"30,352",1212,From this group,1,1,0.012,0.5,',
  "US,United States,352,1212555,Exact,1,1,0.02,,YES",
  "US,United States,352,1XXX211,Public service,60,60,0.03,,YES",
  "LU,Luxembourg,local,352,Local,60,60,0.04,,",
  "LU,Luxembourg,,352,Default,60,60,0.09,,",
  "DE,Germany,,499,Conflict,60,60,0.1,,",
  "DE,Germany,,499,Conflict,60,60,0.2,,",
  ...Array.from({ length: 100_000 }, (_, i) => {
    const iso = String.fromCharCode(
      65 + Math.floor((i % 210) / 26),
      65 + (i % 26),
    );
    return `${iso},Fixture,,800${i.toString().padStart(5, "0")},Fixture,60,60,0.001,,`;
  }),
].join("\n");
let mf: Miniflare, db: D1Database, env: Env;
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      compatibilityDate: "2026-09-16",
      d1Databases: ["DB"],
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  const sql = readFileSync(
    new URL("../../migrations/0083_worldwide_fax_catalog.sql", import.meta.url),
    "utf8",
  );
  await db.batch(unstable_splitSqlQuery(sql).map((q) => db.prepare(q)));
  const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(3)));
  env = {
    DB: db,
    MODE: "production",
    ENVIRONMENT: "production",
    TELNYX_API_KEY: "fixture-read",
    TELNYX_PUBLIC_KEY: key,
    TELNYX_ACCOUNT_ID: (await telnyxAccountReference(key))!,
    TELNYX_CONNECTION_ID: connectionId,
    TELNYX_OUTBOUND_VOICE_PROFILE_ID: outboundProfileId,
    TELNYX_FROM: senderNumber,
  } as Env;
});
afterAll(async () => {
  await mf?.dispose();
});
describe("worldwide published fax tariff", () => {
  it("publishes a complete catalog, keeps an old quote source through failure, and fences simultaneous or partial refreshes", async () => {
    let omitCountry = false;
    let clock = timestamp,
      failure = false,
      truncated = false;
    const inspect = vi.fn(async () => readiness);
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const endpoint = String(input);
      expect(init?.method ?? "GET").toBe("GET");
      expect(new Headers(init?.headers).has("authorization")).toBe(
        endpoint === "https://api.telnyx.com/v2/tariffs",
      );
      if (endpoint.endsWith("/v2/tariffs"))
        return Response.json({
          data: { global_conversational: { tariff_link: url } },
        });
      if (endpoint.endsWith("/pricing/fax")) return new Response(page);
      if (endpoint.endsWith(".xml")) return new Response(fx(clock));
      if (endpoint !== url) throw new Error("Unexpected fixture URL");
      if (failure) return new Response("", { status: 503 });
      const supplied = omitCountry
        ? csv.replaceAll("\nLU,Luxembourg", "\nAD,Andorra")
        : csv;
      return new Response(truncated ? supplied.slice(0, -100) : supplied, {
        headers: { "content-length": String(supplied.length) },
      });
    });
    const run = () =>
      refreshWorldwideFaxCatalog(env, { fetcher, inspect, now: () => clock });
    const lookup = (destinationNumber: string, sender = senderNumber) =>
      resolveWorldwideFaxReference(db, {
        accountId: env.TELNYX_ACCOUNT_ID!,
        senderNumber: sender,
        connectionId,
        outboundProfileId,
        destinationNumber,
      });
    const pair = await Promise.all([run(), run()]);
    expect(pair.reduce((n, v) => n + v.worldwideFaxCatalogRefreshed, 0)).toBe(
      1,
    );
    expect(inspect).toHaveBeenCalledTimes(1);
    const ref = await lookup("+12127770000");
    expect(ref).toMatchObject({
      destinationPrefix: "+1212",
      minuteNanoUsd: 12_000_000,
      callNanoUsd: 500_000_000,
      initialSeconds: 1,
      incrementSeconds: 1,
      pageNanoUsd: 7_000_000,
      fxNumerator: 4,
      fxDenominator: 5,
      sourceReference: url,
    });
    expect(await lookup("+1212555")).toMatchObject({
      minuteNanoUsd: 20_000_000,
    });
    expect(await lookup("+12125550000")).toMatchObject({
      minuteNanoUsd: 12_000_000,
    });
    expect(await lookup("+1999211")).toMatchObject({
      minuteNanoUsd: 30_000_000,
    });
    expect(await lookup("+3525555555")).toMatchObject({
      minuteNanoUsd: 40_000_000,
    });
    expect(await lookup("+499888888")).toBeNull();
    expect(await lookup("+19999999999", "+4400000000")).toBeNull();
    const first = await db
      .prepare("SELECT revision FROM worldwide_fax_catalog_state")
      .first<string>("revision");
    clock += 86_400_000;
    truncated = true;
    expect(await run()).toMatchObject({ worldwideFaxCatalogFailed: 1 });
    expect(
      await db
        .prepare("SELECT revision FROM worldwide_fax_catalog_state")
        .first("revision"),
    ).toBe(first);
    expect(await lookup("+12127770000")).toMatchObject({
      sourceSha256: ref!.sourceSha256,
      lastKnown: true,
    });
    clock += 86_400_000;
    failure = true;
    expect(await run()).toMatchObject({ worldwideFaxCatalogFailed: 1 });
    expect(await lookup("+12127770000")).toMatchObject({
      sourceSha256: ref!.sourceSha256,
    });
    clock += 86_400_000;
    failure = truncated = false;
    omitCountry = true;
    expect(await run()).toMatchObject({ worldwideFaxCatalogFailed: 1 });
    expect(
      await db
        .prepare("SELECT revision FROM worldwide_fax_catalog_state")
        .first("revision"),
    ).toBe(first);
    clock += 86_400_000;
    omitCountry = false;
    expect(await run()).toMatchObject({ worldwideFaxCatalogRefreshed: 1 });
    expect(
      await db
        .prepare("SELECT COUNT(*) n FROM worldwide_fax_catalog_decks")
        .first("n"),
    ).toBe(1);
  }, 90_000);
});
